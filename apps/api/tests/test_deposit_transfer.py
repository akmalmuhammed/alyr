"""Staff write down a deposit the customer paid the shop by bank transfer (D-191, spec 043).

ALYR moves no money (hard rule 3): this is the shop's record that it received one. The booking's
deposit becomes paid, so it counts against what is left to pay, the shop's rule for a no-show or
a late cancel applies to it, a deposit receipt is made where Documents is on, and the customer
is told when ALYR may message them. Through the real routes and PostgreSQL."""

from uuid import UUID

import asyncpg
import pytest

from alyr.seed import AGENT_EMAIL
from documents_sales_support import customer as sales_customer
from documents_sales_support import documents, sales_shop
from pay_links import pay as pay_by_link
from test_booking_resources import listed
from test_bookings import service_id
from test_bookings_chairs_deposits import (
    DAY,
    actions,
    booking_row,
    conversation,
    deposit_booking,
    free,
    owner_sql,
    release,
    sent_to,
    soon,
    staff_walk_in,
)
from test_consent import ahmed
from test_sign_in import other_shop_with_owner, sign_in

# The demo shop's "Electrician site visit" is QAR 150.
PRICE = 15_000


def receive(client, booking_id, amount=3_000, reference="", **more):
    return client.post(f"/api/bookings/{booking_id}/deposit-received",
                       json={"amount": amount, "reference": reference, **more})


def desk_booking(client, sid=None, start=None):
    """A booking written down by staff for a customer who has written in, no deposit asked."""
    sid = sid or service_id(client)
    made = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": start or free(client, sid)[0],
        "contact_id": ahmed(client)["id"]})
    assert made.status_code == 200, made.text
    return made.json()


def test_a_deposit_by_transfer_counts_against_the_bill_and_the_customer_is_told(client):
    made = desk_booking(client)
    done = receive(client, made["id"], 3_000, "QNB ref 55821")
    assert done.status_code == 200, done.text
    body = done.json()
    assert (body["deposit_state"], body["amount"], body["amount_text"]) == ("paid", 3_000, "QAR 30")
    assert body["told"]["sent"] is True

    row = booking_row(made["id"])
    assert (row["deposit"], row["deposit_state"], row["hold_until"]) == (3_000, "paid", None)
    kept = owner_sql("select deposit_method, deposit_reference, deposit_received_at "
                     "from bookings where id = $1", UUID(made["id"]))[0]
    assert kept["deposit_method"] == "transfer" and kept["deposit_reference"] == "QNB ref 55821"
    assert kept["deposit_received_at"] is not None

    day = listed(client)[made["id"]]
    assert (day["deposit_state"], day["paid"], day["left_to_pay"]) == ("paid", 3_000, PRICE - 3_000)
    entry = actions(made["id"], "deposit_paid")
    assert len(entry) == 1 and entry[0]["detail"]["amount"] == "QAR 30"
    assert entry[0]["detail"]["method"] == "bank_transfer"
    assert "QNB" not in str(entry[0]["detail"])  # the reference is the shop's, not the feed's
    assert "We received the deposit of QAR 30" in conversation(client)[-1]["body"]


def test_a_deposit_is_written_down_once(client):
    made = desk_booking(client)
    assert receive(client, made["id"]).status_code == 200
    again = receive(client, made["id"])
    assert again.status_code == 409 and again.json()["detail"]["code"] == "deposit_recorded"
    assert booking_row(made["id"])["deposit"] == 3_000


def test_what_cannot_be_written_down_is_refused_and_nothing_changes(client):
    made = desk_booking(client)
    for amount, code in ((PRICE + 100, "bad_deposit"),):
        refused = receive(client, made["id"], amount)
        assert refused.status_code == 422 and refused.json()["detail"]["code"] == code
    assert receive(client, made["id"], 0).status_code == 422  # the form checks first
    assert receive(client, made["id"], 3_000, "x" * 81).status_code == 422
    assert booking_row(made["id"])["deposit_state"] == "none"

    unknown = receive(client, "00000000-0000-4000-8000-000000000000")
    assert unknown.status_code == 404 and unknown.json()["detail"]["code"] == "unknown_booking"

    cancelled = desk_booking(client, start=free(client, service_id(client))[3])
    client.post(f"/api/bookings/{cancelled['id']}/cancel")
    closed = receive(client, cancelled["id"])
    assert closed.status_code == 409 and closed.json()["detail"]["code"] == "deposit_closed"


def test_a_booking_that_waits_for_a_link_takes_the_transfer_instead(client):
    sid, start, made = deposit_booking(client)
    path = made["deposit"]["pay_path"]
    assert booking_row(made["id"])["deposit_state"] == "due"
    assert owner_sql("select count(*) as n from jobs where kind = 'booking_reminder' "
                     "and payload->>'booking_id' = $1", made["id"])[0]["n"] == 0

    done = receive(client, made["id"], 5_000, "Transfer 1")
    assert done.status_code == 200, done.text
    row = booking_row(made["id"])
    assert (row["deposit_state"], row["hold_until"]) == ("paid", None)
    # The link can no longer be paid (it would take the money twice), and the hold cannot
    # release a booking that is paid for.
    late = pay_by_link(client, path)
    assert late.status_code == 409 and late.json()["detail"]["code"] == "expired"
    # The database itself refuses a hold on a booking that is paid for.
    with pytest.raises(asyncpg.CheckViolationError):
        owner_sql("update bookings set hold_until = now() - interval '1 minute' where id = $1",
                  UUID(made["id"]))
    assert release(client) == 0
    assert booking_row(made["id"])["status"] == "booked"
    # Confirmed now, so the reminder is queued.
    assert owner_sql("select count(*) as n from jobs where kind = 'booking_reminder' "
                     "and payload->>'booking_id' = $1", made["id"])[0]["n"] == 1
    assert listed(client)[made["id"]]["paid"] == 5_000


def test_the_shops_rule_applies_to_a_deposit_by_transfer(client):
    # Cancelled in good time: it is refunded from the shop's own account.
    early = desk_booking(client)
    receive(client, early["id"])
    done = client.post(f"/api/bookings/{early['id']}/cancel").json()
    assert done["deposit_state"] == "refund_due"
    assert "The shop will refund your deposit of QAR 30" in conversation(client)[-1]["body"]
    assert client.post(f"/api/bookings/{early['id']}/deposit-refunded").status_code == 200
    assert booking_row(early["id"])["deposit_state"] == "refunded"

    # A no-show keeps it, by the rule the booking took when the deposit was written down.
    later = desk_booking(client, start=free(client, service_id(client))[2])
    receive(client, later["id"])
    assert owner_sql("select deposit_terms from bookings where id = $1", UUID(later["id"]))[0][
        "deposit_terms"] != "{}"
    client.post(f"/api/bookings/{later['id']}/outcome", json={"status": "no_show"})
    assert booking_row(later["id"])["deposit_state"] == "kept"


def test_a_customer_who_came_pays_what_is_left(client):
    made = desk_booking(client)
    receive(client, made["id"], 4_000)
    client.post(f"/api/bookings/{made['id']}/outcome", json={"status": "completed"})
    row = listed(client)[made["id"]]
    assert (row["deposit_state"], row["paid"], row["left_to_pay"]) == ("paid", 4_000, 11_000)


def test_a_customer_who_has_not_agreed_to_messages_is_not_told_and_staff_are_told_so(client):
    sid = service_id(client)
    made = staff_walk_in(client, sid, soon(31), name="Maha K.", walk_in=False).json()
    done = receive(client, made["id"]).json()
    assert done["told"]["sent"] is False and done["told"]["reason"] == "no_consent"
    assert done["told"]["phone"]  # so staff can tell her themselves
    assert booking_row(made["id"])["deposit_state"] == "paid"


def test_a_walk_in_is_not_messaged(client):
    sid = service_id(client)
    made = staff_walk_in(client, sid, soon(37)).json()
    done = receive(client, made["id"]).json()
    assert done["told"] is None
    contact = owner_sql("select contact_id from bookings where id = $1",
                        UUID(made["id"]))[0]["contact_id"]
    assert sent_to(str(contact)) == []


def test_only_an_owner_or_an_admin_writes_one_down(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    made = desk_booking(owner)
    assert agent.post(f"/api/bookings/{made['id']}/deposit-received",
                      json={"amount": 3_000}).status_code == 403
    assert booking_row(made["id"])["deposit_state"] == "none"
    assert receive(owner, made["id"]).status_code == 200


def test_another_shop_cannot_write_a_deposit_on_this_shops_booking(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, stranger = client_factory(), client_factory()
    other = other_shop_with_owner()
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", other)
    sign_in(owner)
    sign_in(stranger, "omar@other.example")
    made = desk_booking(owner)
    assert receive(stranger, made["id"]).status_code == 404
    assert booking_row(made["id"])["deposit_state"] == "none"


def test_the_database_will_not_hold_a_transfer_with_no_deposit(client):
    made = desk_booking(client)
    with pytest.raises(asyncpg.CheckViolationError):
        owner_sql("update bookings set deposit_method = 'transfer' where id = $1",
                  UUID(made["id"]))


def test_the_deposit_receipt_counts_it_and_the_rest_of_the_bill_follows(
    client_factory, monkeypatch,
):
    """Where Documents is on: a deposit receipt for what was received, then the rest paid at the
    counter is what is left after it, and the final receipt is for the whole price."""
    shop = sales_shop(client_factory, monkeypatch)
    owner = shop.owner
    sid = owner.post("/api/services", json={
        "name": "Hair colour", "name_ar": "صبغة شعر", "duration_minutes": 90,
        "price": 35_000}).json()["id"]
    owner.put("/api/hours", json={"periods": [
        {"weekday": d, "opens": "09:00", "closes": "21:00"} for d in range(7)]})
    who = sales_customer(shop)
    start = owner.get(f"/api/book/{shop.slug}/times",
                      params={"service_id": sid, "day": DAY.isoformat()}).json()["times"][0]
    # A booking taken by phone for a customer who wrote in: the customer's own link books only
    # a service with no deposit here, so staff write the visit down.
    made = owner.post("/api/bookings", json={
        "service_id": sid, "starts_at": start, "contact_id": who.id})
    assert made.status_code == 200, made.text

    done = receive(owner, made.json()["id"], 5_000, "Transfer 9")
    assert done.status_code == 200, done.text
    [receipt] = documents(shop, kind="deposit_receipt")
    assert (receipt["source"], receipt["source_ref"], receipt["paid_minor"],
            receipt["total_minor"]) == ("booking", made.json()["id"], 5_000, 35_000)

    rest = owner.post(
        "/api/documents/payments", headers={"Idempotency-Key": "rest-of-the-transfer-bill"},
        json={"subject": "booking", "id": made.json()["id"], "method": "cash"})
    assert rest.status_code == 201, rest.text
    assert rest.json()["payment"]["amount_minor"] == 30_000  # what is left after the deposit
    [final] = documents(shop, kind="receipt")
    assert (final["paid_minor"], final["total_minor"]) == (35_000, 35_000)
    owner_sql("delete from jobs where tenant_id = $1 and status = 'queued'", shop.tenant_id)


def test_with_documents_off_the_deposit_is_still_written_down(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, documents=False)
    owner = shop.owner
    sid = owner.post("/api/services", json={
        "name": "Hair colour", "name_ar": "صبغة شعر", "duration_minutes": 90,
        "price": 35_000}).json()["id"]
    owner.put("/api/hours", json={"periods": [
        {"weekday": d, "opens": "09:00", "closes": "21:00"} for d in range(7)]})
    who = sales_customer(shop)
    start = owner.get(f"/api/book/{shop.slug}/times",
                      params={"service_id": sid, "day": DAY.isoformat()}).json()["times"][0]
    made = owner.post("/api/bookings", json={
        "service_id": sid, "starts_at": start, "contact_id": who.id})
    assert receive(owner, made.json()["id"], 5_000).status_code == 200
    assert documents(shop) == []
    owner_sql("delete from jobs where tenant_id = $1 and status = 'queued'", shop.tenant_id)
