"""Chairs and people with their own hours, the day from the screen, deposits, and the review
request (ALY-27, D-072, spec 033).

Through the real routes, the engine and PostgreSQL. The concurrency tests prove the two
requests met in the database (tests/concurrency.py): one with the shop's lock in place, and
one with it removed, to show the database alone refuses a double booking."""

import asyncio
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from alyr.core.auth import Staff
from alyr.db import Database
from alyr.modules.agent import facts, insights
from alyr.modules.bookings import deposits, service
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID
from alyr.seed_bookings import SALON, ensure_sample_tenant, reset_sample
from concurrency import LockWatch, hold_open
from conftest import APP_DSN, OWNER_DSN
from documents_sales_support import customer as sales_customer
from documents_sales_support import documents, sales_shop
from order_links import booking_token
from test_booking_resources import customers, listed
from test_bookings import PAGE, a_working_day, service_id
from test_consent import ahmed, conversation, owner_sql, say
from test_orders import customer as order_customer
from test_orders import place, product
from test_sign_in import other_shop_with_owner, sign_in

QATAR = ZoneInfo("Asia/Qatar")
DAY = a_working_day()
DOW = (DAY.weekday() + 1) % 7  # PostgreSQL's numbering: 0 is Sunday


# ----------------------------------------------------------------------------- helpers

def person(client, name, name_ar="", kind="person"):
    made = client.post("/api/resources", json={"name": name, "name_ar": name_ar, "kind": kind})
    assert made.status_code == 200, made.text
    return made.json()["id"]


def week(client, resource_id, periods):
    done = client.put(f"/api/resources/{resource_id}/hours", json={"periods": periods})
    assert done.status_code == 200, done.text


def free(client, sid, resource_id=None, day=DAY):
    params = {"service_id": sid, "day": day.isoformat()}
    if resource_id:
        params["resource_id"] = resource_id
    found = client.get(f"{PAGE}/times", params=params)
    assert found.status_code == 200, found.text
    return found.json()["times"]


def book_as(client, contact_id, sid, start, resource_id=None):
    body = {"token": booking_token(contact_id), "service_id": sid, "starts_at": start}
    if resource_id:
        body["resource_id"] = resource_id
    return client.post(PAGE, json=body)


def local_hour(moment: str) -> float:
    at = datetime.fromisoformat(moment).astimezone(QATAR)
    return at.hour + at.minute / 60


def booking_row(booking_id):
    return owner_sql(
        "select status, deposit, deposit_state, hold_until, resource_id, walk_in, deposit_terms "
        "from bookings where id = $1", UUID(booking_id),
    )[0]


def actions(booking_id, action=None):
    rows = owner_sql(
        "select action, detail, actor_name from activity where subject = 'booking' "
        "and subject_id = $1 order by created_at, id", UUID(booking_id),
    )
    out = [{"action": r["action"], "detail": json.loads(r["detail"]),
            "actor": r["actor_name"]} for r in rows]
    return [r for r in out if action is None or r["action"] == action]


def sent_to(contact_id):
    return [dict(r) for r in owner_sql(
        "select body, kind, status, error, payload from messages where contact_id = $1 "
        "and direction = 'out' order by created_at, id", UUID(contact_id),
    )]


def deposit_on(client, sid, kind="fixed", value=5_000):
    done = client.patch(f"/api/services/{sid}",
                        json={"deposit_kind": kind, "deposit_value": value})
    assert done.status_code == 200, done.text


def pay(client, path):
    return client.post(f"/api{path}/complete")


PHONES = iter(range(55660100, 55669999))


def staff_walk_in(client, sid, starts, resource_id=None, name="Maha K.", walk_in=True):
    """A customer standing at the counter, typed in by name and phone (Qatar's eight digits)."""
    body = {"service_id": sid, "starts_at": starts, "walk_in": walk_in,
            "customer": {"name": name, "phone": str(next(PHONES))}}
    if resource_id:
        body["resource_id"] = resource_id
    return client.post("/api/bookings", json=body)


def soon(minutes=7) -> str:
    """A time a few minutes from now, on no particular step: a walk-in."""
    return (datetime.now(UTC) + timedelta(minutes=minutes)).replace(second=0, microsecond=0) \
        .isoformat()


def release(client) -> int:
    return client.portal.call(
        deposits.release_shop, client.app.state.db, client.app.state.outbound, DEMO_TENANT_ID
    )


def deposit_booking(client, contact=None, value=5_000):
    """A booking of the visit service with a fixed deposit, not paid yet."""
    sid = service_id(client)
    deposit_on(client, sid, "fixed", value)
    start = free(client, sid)[0]
    made = book_as(client, contact or ahmed(client)["id"], sid, start)
    assert made.status_code == 200, made.text
    return sid, start, made.json()


def paid_booking(client, contact=None):
    sid, start, made = deposit_booking(client, contact)
    assert pay(client, made["deposit"]["pay_path"]).status_code == 200
    return sid, start, made


# --------------------------------------------- 1. people with their own hours, and a choice

def test_a_person_with_her_own_hours_is_offered_only_then(client):
    sid = service_id(client)
    reem, huda = person(client, "Reem", "ريم"), person(client, "Huda", "هدى")
    week(client, reem, [{"weekday": DOW, "opens": "10:00", "closes": "12:00"}])

    hers = free(client, sid, reem)
    assert hers and all(10 <= local_hour(t) <= 11 for t in hers)  # a one-hour visit
    anyone = free(client, sid)
    assert set(free(client, sid, huda)) <= set(anyone) and set(hers) <= set(anyone)
    # Huda works another day only: this day is her day off.
    week(client, huda, [{"weekday": (DOW + 1) % 7, "opens": "09:00", "closes": "17:00"}])
    assert free(client, sid, huda) == []
    assert free(client, sid) == hers
    # An empty week gives her the shop's hours back.
    week(client, huda, [])
    assert len(free(client, sid, huda)) > len(hers)


def test_the_customer_chooses_a_person_or_anyone(client):
    sid = service_id(client)
    reem, huda = person(client, "Reem", "ريم"), person(client, "Huda", "هدى")
    a, b, c = customers(client, 3)
    start = free(client, sid)[0]
    assert start in free(client, sid, reem) and start in free(client, sid, huda)

    chose = book_as(client, a, sid, start, huda)
    assert chose.status_code == 200 and chose.json()["resource"] == "Huda"
    assert start in free(client, sid, reem) and start not in free(client, sid, huda)
    anyone = book_as(client, b, sid, start)
    assert anyone.json()["resource"] == "Reem"
    refused = book_as(client, c, sid, start)
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "not_free"
    assert listed(client)[chose.json()["id"]]["resource"]["name"] == "Huda"


def test_a_person_cannot_be_booked_outside_her_hours(client):
    sid = service_id(client)
    reem = person(client, "Reem")
    person(client, "Huda")
    week(client, reem, [{"weekday": DOW, "opens": "10:00", "closes": "12:00"}])
    late = next(t for t in free(client, sid) if local_hour(t) >= 14)
    refused = book_as(client, customers(client, 1)[0], sid, late, reem)
    assert refused.status_code == 409


def test_the_page_shows_names_and_the_deposit_rule_but_never_hours(client):
    sid = service_id(client)
    reem = person(client, "Reem", "ريم")
    week(client, reem, [{"weekday": DOW, "opens": "10:00", "closes": "12:00"}])
    deposit_on(client, sid, "percent", 20)
    page = client.get(PAGE, headers={"x-order-link": booking_token(ahmed(client)["id"])}).json()
    assert page["resources"] == [
        {"id": reem, "name": "Reem", "name_ar": "ريم", "kind": "person", "services": []}
    ]
    visit = next(s for s in page["services"] if s["id"] == sid)
    assert (visit["deposit_kind"], visit["deposit"], visit["deposit_text"]) == (
        "percent", 3_000, "QAR 30")
    assert page["deposit_terms"] == {
        "no_show": "keep", "late_cancel": "keep", "cancel_hours": 24, "hold_minutes": 30}
    assert page["payments_live"] is False


# ------------------------------------------------------------- 2. the day from the screen

def test_staff_add_a_walk_in_at_any_minute_and_nothing_is_sent(client):
    sid = service_id(client)
    reem = person(client, "Reem")
    made = staff_walk_in(client, sid, soon(7), reem)
    assert made.status_code == 200, made.text
    assert made.json()["walk_in"] is True and made.json()["resource"] == "Reem"
    row = booking_row(made.json()["id"])
    assert row["walk_in"] and row["deposit_state"] == "none"
    contact = owner_sql("select contact_id from bookings where id = $1",
                        UUID(made.json()["id"]))[0]["contact_id"]
    assert sent_to(str(contact)) == []  # she is standing at the counter
    booked = actions(made.json()["id"], "booked")[0]["detail"]
    assert booked["by_staff"] and booked["walk_in"] and booked["resource"] == "Reem"
    # It is on the day view, in Reem's column.
    today = datetime.fromisoformat(made.json()["starts_at"]).astimezone(QATAR).date()
    day = client.get("/api/bookings/day", params={"day": today.isoformat()}).json()
    assert [r["name"] for r in day["resources"]] == ["Reem"]
    assert any(b["id"] == made.json()["id"] and b["walk_in"] for b in day["bookings"])


def test_a_walk_in_never_takes_a_chair_that_is_taken(client):
    sid = service_id(client)
    reem, huda = person(client, "Reem"), person(client, "Huda")
    at = soon(11)
    assert staff_walk_in(client, sid, at, reem).status_code == 200
    taken = staff_walk_in(client, sid, at, reem, name="Lina S.")
    assert taken.status_code == 409 and taken.json()["detail"]["code"] == "not_free"
    assert staff_walk_in(client, sid, at, huda, name="Lina S.").json()["resource"] == "Huda"
    assert staff_walk_in(client, sid, at, name="Dana R.").status_code == 409  # anyone: none left


def test_a_walk_in_on_a_shop_without_chairs_is_one_at_a_time(client):
    sid = service_id(client)
    at = soon(13)
    assert staff_walk_in(client, sid, at).status_code == 200
    assert staff_walk_in(client, sid, at, name="Lina S.").status_code == 409


def test_a_booking_by_phone_is_confirmed_and_says_who_it_is_with(client):
    sid = service_id(client)
    reem = person(client, "Reem")
    me = ahmed(client)
    made = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": free(client, sid)[0], "resource_id": reem,
        "contact_id": me["id"]})
    assert made.status_code == 200, made.text
    assert "with Reem" in conversation(client)[-1]["body"]
    assert owner_sql("select count(*) as n from jobs where kind = 'booking_reminder' "
                     "and payload->>'booking_id' = $1", made.json()["id"])[0]["n"] == 1


def test_staff_need_a_customer_with_a_phone(client):
    sid = service_id(client)
    refused = client.post("/api/bookings", json={"service_id": sid, "starts_at": soon()})
    assert refused.status_code == 422
    no_phone = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": soon(), "customer": {"name": "Maha K."}})
    assert no_phone.status_code == 422 and no_phone.json()["detail"]["code"] == "bad_phone"
    # A number the shop has already is that customer, not a second record.
    me = ahmed(client)
    again = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": soon(41), "walk_in": True,
        "customer": {"name": "Someone else", "phone": AHMED_PHONE}})
    assert again.status_code == 200
    assert owner_sql("select contact_id from bookings where id = $1",
                     UUID(again.json()["id"]))[0]["contact_id"] == UUID(me["id"])


def test_staff_move_a_booking_to_another_person_and_the_customer_is_told(client):
    sid = service_id(client)
    person(client, "Reem")
    huda = person(client, "Huda")
    me = ahmed(client)
    start = free(client, sid)[0]
    made = book_as(client, me["id"], sid, start).json()
    assert made["resource"] == "Reem"

    moved = client.post(f"/api/bookings/{made['id']}/move",
                        json={"starts_at": start, "resource_id": huda})
    assert moved.status_code == 200 and moved.json()["resource"] == "Huda"
    entry = actions(made["id"], "moved")[0]["detail"]
    assert (entry["resource"], entry["from_resource"]) == ("Huda", "Reem")
    assert "with Huda" in conversation(client)[-1]["body"]

    # Huda is taken at the next hour: a move there is refused and the booking stays put.
    later = free(client, sid, huda)[1]
    book_as(client, customers(client, 2)[1], sid, later, huda)
    refused = client.post(f"/api/bookings/{made['id']}/move",
                          json={"starts_at": later, "resource_id": huda})
    assert refused.status_code == 409
    row = listed(client)[made["id"]]
    assert datetime.fromisoformat(row["starts_at"]) == datetime.fromisoformat(start)
    assert row["resource"]["name"] == "Huda" and row["status"] == "booked"


def test_staff_may_move_a_booking_off_the_half_hour_step(client):
    sid = service_id(client)
    made = book_as(client, ahmed(client)["id"], sid, free(client, sid)[0]).json()
    odd = (datetime.fromisoformat(made["starts_at"]) + timedelta(minutes=10)).isoformat()
    assert client.post(f"/api/bookings/{made['id']}/move",
                       json={"starts_at": odd}).status_code == 200


def test_the_reminder_and_my_booking_name_who_it_is_with(client):
    sid = service_id(client)
    person(client, "Reem", "ريم")
    assert book_as(client, ahmed(client)["id"], sid, free(client, sid)[0]).status_code == 200
    owner_sql("update jobs set run_at = now() where kind = 'booking_reminder'")
    client.get("/api/services")  # the in-process job runner works after a request
    assert re.search(r"Reminder: booking \d+ at .*with Reem", conversation(client)[-1]["body"])
    answer = say(client, AHMED_PHONE, "my booking")
    assert any("with Reem" in m["body"] for m in answer)


def test_a_place_is_named_without_with(client):
    sid = service_id(client)
    person(client, "Bay 2", "المكان 2", kind="place")
    book_as(client, ahmed(client)["id"], sid, free(client, sid)[0])
    body = conversation(client)[-1]["body"]
    assert ", Bay 2" in body and "with Bay 2" not in body


# ----------------------------------------------------------------------------- 3. deposits

def test_a_service_deposit_is_checked(client):
    sid = service_id(client)
    for kind, value in (("percent", 0), ("percent", 101), ("fixed", 50), ("fixed", 20_000)):
        refused = client.patch(f"/api/services/{sid}",
                               json={"deposit_kind": kind, "deposit_value": value})
        assert refused.status_code == 422, (kind, value)
    deposit_on(client, sid, "none", 0)


def test_a_deposit_holds_the_time_until_it_is_paid_then_the_visit_is_confirmed(client):
    sid, start, made = deposit_booking(client)
    deposit = made["deposit"]
    assert (deposit["amount"], deposit["amount_text"]) == (5_000, "QAR 50")
    assert deposit["pay_path"].startswith(f"/pay/{DEMO_TENANT_ID}/")
    row = booking_row(made["id"])
    assert (row["deposit"], row["deposit_state"]) == (5_000, "due") and row["hold_until"]
    assert start not in free(client, sid)  # the time is held for her
    asked = conversation(client)[-1]["body"]
    assert "QAR 50" in asked and deposit["pay_path"] in asked
    # Not confirmed yet: no reminder, and the release is queued for the end of the hold.
    assert owner_sql("select count(*) as n from jobs where kind = 'booking_reminder'")[0]["n"] == 0
    assert owner_sql("select count(*) as n from jobs where kind = 'booking_deposit_expiry' "
                     "and run_at = $1", row["hold_until"])[0]["n"] == 1

    # The pay page knows the visit and the rule the customer agreed to.
    path = deposit["pay_path"]
    page = client.get(f"/api{path}").json()
    assert page["booking"]["number"] == made["number"]
    assert page["booking"]["deposit_terms"]["cancel_hours"] == 24
    assert page["booking"]["resource"] is None  # the demo shop has no chairs here
    assert pay(client, path).status_code == 200

    after = listed(client)[made["id"]]
    assert (after["deposit_state"], after["paid"], after["left_to_pay"]) == ("paid", 5_000, 10_000)
    assert actions(made["id"], "deposit_paid")[0]["detail"]["amount"] == "QAR 50"
    assert "We received the deposit of QAR 50" in conversation(client)[-1]["body"]
    assert owner_sql("select count(*) as n from jobs where kind = 'booking_reminder' "
                     "and payload->>'booking_id' = $1", made["id"])[0]["n"] == 1
    assert pay(client, path).json()["status"] == "paid"  # a second report changes nothing


def test_a_percentage_deposit_is_a_share_of_the_price(client):
    sid = service_id(client)
    deposit_on(client, sid, "percent", 25)
    made = book_as(client, ahmed(client)["id"], sid, free(client, sid)[0]).json()
    assert made["deposit"]["amount"] == 3_750


def test_a_deposit_link_is_not_an_account_payment(client):
    before = client.get("/api/ledger/summary").json()
    paid_booking(client)
    after = client.get("/api/ledger/summary").json()
    assert (after["collected_by_link"], after["payments_by_link"]) == (
        before["collected_by_link"], before["payments_by_link"])


def test_an_unpaid_deposit_gives_the_time_back_after_the_hold(client):
    sid, start, made = deposit_booking(client)
    assert release(client) == 0  # the hold has not run out
    owner_sql("update bookings set hold_until = now() - interval '1 minute' where id = $1",
              UUID(made["id"]))
    assert release(client) == 1
    row = booking_row(made["id"])
    assert (row["status"], row["deposit_state"], row["hold_until"]) == (
        "cancelled", "expired", None)
    assert start in free(client, sid)
    assert "was released because the deposit was not paid" in conversation(client)[-1]["body"]
    assert actions(made["id"], "released")[0]["detail"]["reason"] == "deposit_not_paid"
    late = pay(client, made["deposit"]["pay_path"])
    assert late.status_code == 409 and late.json()["detail"]["code"] == "expired"
    assert client.get(f"/api{made['deposit']['pay_path']}").json()["status"] == "expired"
    assert release(client) == 0  # once


def test_a_payment_and_the_release_meet_and_the_payment_wins(client, monkeypatch):
    """The customer pays in the last second of the hold while the release runs: the payment
    holds the pay link, the release waits for it, finds it paid, and does nothing."""
    _, _, made = deposit_booking(client)
    owner_sql("update bookings set hold_until = now() - interval '1 second' where id = $1",
              UUID(made["id"]))
    entered = hold_open(monkeypatch, deposits, "paid", 0.5)
    with LockWatch("payment_requests") as watch, ThreadPoolExecutor(2) as pool:
        paying = pool.submit(pay, client, made["deposit"]["pay_path"])
        assert entered.wait(10)
        released = pool.submit(release, client)
        results = (paying.result(), released.result())
    assert watch.blocked >= 1, f"the two never met in the database: {watch}"
    assert results[0].status_code == 200 and results[1] == 0
    assert booking_row(made["id"])["deposit_state"] == "paid"


def test_the_release_and_a_payment_meet_and_the_release_wins(client, monkeypatch):
    """The release claims the link first: the payment waits, finds it expired, and is told."""
    _, _, made = deposit_booking(client)
    owner_sql("update bookings set hold_until = now() - interval '1 second' where id = $1",
              UUID(made["id"]))
    entered = hold_open(monkeypatch, deposits, "shop_terms", 0.5)  # read after the claim
    with LockWatch("payment_requests") as watch, ThreadPoolExecutor(2) as pool:
        released = pool.submit(release, client)
        assert entered.wait(10)
        paying = pool.submit(pay, client, made["deposit"]["pay_path"])
        results = (released.result(), paying.result())
    assert watch.blocked >= 1, f"the two never met in the database: {watch}"
    assert results[0] == 1 and results[1].status_code == 409
    assert booking_row(made["id"])["deposit_state"] == "expired"


def test_cancelling_in_good_time_refunds_a_paid_deposit_and_late_keeps_it(client):
    _, _, early = paid_booking(client)
    done = client.post(f"/api/bookings/{early['id']}/cancel")
    assert done.json() == {"status": "cancelled", "deposit_state": "refund_due"}
    assert "The shop will refund your deposit of QAR 50" in conversation(client)[-1]["body"]

    _, _, late = paid_booking(client)
    owner_sql("update bookings set deposit_terms = jsonb_set(deposit_terms, '{cancel_hours}', "
              "'168') where id = $1", UUID(late["id"]))
    assert client.post(f"/api/bookings/{late['id']}/cancel").json()["deposit_state"] == "kept"
    assert "keeps the deposit of QAR 50" in conversation(client)[-1]["body"]
    assert actions(late["id"], "cancelled")[0]["detail"]["deposit"] == "kept"

    # Staff can refund it anyway (the shop cancelled, the stylist is ill).
    _, _, theirs = paid_booking(client)
    owner_sql("update bookings set deposit_terms = jsonb_set(deposit_terms, '{cancel_hours}', "
              "'168') where id = $1", UUID(theirs["id"]))
    assert client.post(f"/api/bookings/{theirs['id']}/cancel",
                       json={"refund": True}).json()["deposit_state"] == "refund_due"

    # The shop pays it back from its own account and says so; once.
    assert client.post(f"/api/bookings/{early['id']}/deposit-refunded").status_code == 200
    assert booking_row(early["id"])["deposit_state"] == "refunded"
    assert client.post(f"/api/bookings/{early['id']}/deposit-refunded").status_code == 404
    assert actions(early["id"], "deposit_refunded")


def test_cancelling_before_paying_ends_the_link(client):
    _, _, made = deposit_booking(client)
    assert client.post(f"/api/bookings/{made['id']}/cancel").json()["deposit_state"] == "expired"
    assert pay(client, made["deposit"]["pay_path"]).status_code == 409


def test_a_no_show_keeps_the_deposit_by_the_rule_the_booking_was_made_under(client):
    _, _, kept = paid_booking(client)
    # The shop changes its rule afterwards; the booking keeps the one the customer was shown.
    assert client.put("/api/bookings/settings", json={"deposit_no_show": "refund"}).status_code \
        == 200
    client.post(f"/api/bookings/{kept['id']}/outcome", json={"status": "no_show"})
    assert booking_row(kept["id"])["deposit_state"] == "kept"

    _, _, refunded = paid_booking(client, customers(client, 2)[1])
    client.post(f"/api/bookings/{refunded['id']}/outcome", json={"status": "no_show"})
    assert booking_row(refunded["id"])["deposit_state"] == "refund_due"


def test_a_customer_who_came_keeps_the_deposit_against_the_bill(client):
    _, _, made = paid_booking(client)
    client.post(f"/api/bookings/{made['id']}/outcome", json={"status": "completed"})
    row = listed(client)[made["id"]]
    assert (row["deposit_state"], row["left_to_pay"]) == ("paid", 10_000)


def test_the_customer_cancelling_in_the_chat_is_told_about_the_deposit(client):
    _, _, made = paid_booking(client)
    answer = say(client, AHMED_PHONE, reply_id=f"booking_cancel:{made['id']}")
    told = answer[-1]["body"]
    assert "Your booking has been cancelled. The shop will refund your deposit" in told


def test_a_paid_deposit_makes_a_deposit_receipt_and_counts_against_the_bill(
    client_factory, monkeypatch,
):
    shop = sales_shop(client_factory, monkeypatch)
    owner = shop.owner
    made = owner.post("/api/services", json={
        "name": "Hair colour", "name_ar": "صبغة شعر", "duration_minutes": 90, "price": 35_000})
    sid = made.json()["id"]
    assert owner.patch(f"/api/services/{sid}",
                       json={"deposit_kind": "fixed", "deposit_value": 5_000}).status_code == 200
    owner.put("/api/hours", json={"periods": [
        {"weekday": d, "opens": "09:00", "closes": "21:00"} for d in range(7)]})
    who = sales_customer(shop)
    start = owner.get(f"/api/book/{shop.slug}/times",
                      params={"service_id": sid, "day": DAY.isoformat()}).json()["times"][0]
    booked = owner.post(f"/api/book/{shop.slug}", json={
        "token": booking_token(who.id, shop.tenant_id), "service_id": sid, "starts_at": start})
    assert booked.status_code == 200, booked.text
    path = booked.json()["deposit"]["pay_path"]
    assert owner.post(f"/api{path}/complete").status_code == 200

    [receipt] = documents(shop, kind="deposit_receipt")
    assert (receipt["source"], receipt["source_ref"], receipt["paid_minor"],
            receipt["total_minor"]) == ("booking", booked.json()["id"], 5_000, 35_000)
    # The rest is paid at the counter: it is what is left after the deposit.
    rest = owner.post(
        "/api/documents/payments", headers={"Idempotency-Key": "rest-of-the-bill"},
        json={"subject": "booking", "id": booked.json()["id"], "method": "cash"})
    assert rest.status_code == 201, rest.text
    assert rest.json()["payment"]["amount_minor"] == 30_000
    [final] = documents(shop, kind="receipt")
    assert (final["paid_minor"], final["total_minor"]) == (35_000, 35_000)


# ----------------------------------------------------- the database, with and without the lock

def test_two_walk_ins_for_one_chair_at_once_meet_at_the_shops_lock(client, monkeypatch):
    sid = service_id(client)
    reem = person(client, "Reem")
    at = soon(17)
    hold_open(monkeypatch, service, "_place", 0.4)  # the first keeps the shop's lock a while
    start = threading.Barrier(2)

    def walk_in(name):
        start.wait()
        return staff_walk_in(client, sid, at, reem, name=name)

    with LockWatch("pg_advisory_xact_lock") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(walk_in, ("Maha K.", "Lina S.")))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert watch.blocked >= 1, f"the two requests never met in the database: {watch}"
    assert owner_sql("select count(*) as n from bookings where resource_id = $1 "
                     "and status = 'booked'", UUID(reem))[0]["n"] == 1


def test_two_transactions_writing_one_chair_at_once_the_database_refuses_the_second(client):
    """No shop lock, no check in the code: two transactions of the app's own role write a
    booking for one chair at the same time. The second waits on the first's row in the
    database's guard, and when the first commits it is refused."""
    sid = service_id(client)
    reem = person(client, "Reem")
    contact = UUID(ahmed(client)["id"])
    starts = datetime.now(UTC) + timedelta(days=3)
    write = (
        "insert into bookings (number, contact_id, service_id, service_name, starts_at, "
        "ends_at, resource_id) values ($1, $2, $3, 'x', $4, $5, $6)"
    )
    first_wrote = asyncio.Event()

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async def first():
                async with db.tenant(DEMO_TENANT_ID) as conn:
                    await conn.execute(write, 9101, contact, UUID(sid), starts,
                                       starts + timedelta(hours=1), UUID(reem))
                    first_wrote.set()
                    await asyncio.sleep(0.6)  # still open: its row is not committed yet
                return "ok"

            async def second():
                await first_wrote.wait()
                try:
                    async with db.tenant(DEMO_TENANT_ID) as conn:
                        await conn.execute(write, 9102, contact, UUID(sid),
                                           starts + timedelta(minutes=30),
                                           starts + timedelta(minutes=90), UUID(reem))
                except Exception as error:  # noqa: BLE001 - the refusal is what is tested
                    return type(error).__name__
                return "ok"

            return await asyncio.gather(first(), second())
        finally:
            await db.close()

    with LockWatch("insert into bookings") as watch:
        results = asyncio.run(go())
    assert results == ["ok", "ExclusionViolationError"]
    assert watch.blocked >= 1, f"the two writes never met in the database: {watch}"


def test_customers_racing_for_one_persons_last_time_get_it_once(client, monkeypatch):
    sid = service_id(client)
    reem = person(client, "Reem")
    week(client, reem, [{"weekday": DOW, "opens": "10:00", "closes": "11:00"}])
    [only] = free(client, sid, reem)
    a, b = customers(client, 2)
    hold_open(monkeypatch, service, "_place", 0.4)
    start = threading.Barrier(2)

    def take(contact):
        start.wait()
        return book_as(client, contact, sid, only, reem)

    with LockWatch("pg_advisory_xact_lock") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(take, (a, b)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert watch.blocked >= 1, f"the two requests never met in the database: {watch}"


# ----------------------------------------------------------- who may do what, and whose

def test_an_agent_runs_the_day_but_not_the_rules(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    sid = service_id(owner)
    reem = person(owner, "Reem")
    made = staff_walk_in(agent, sid, soon(23), reem)
    assert made.status_code == 200
    assert agent.post(f"/api/bookings/{made.json()['id']}/move",
                      json={"starts_at": soon(83)}).status_code == 200
    assert agent.get("/api/bookings/day").status_code == 200
    assert agent.put(f"/api/resources/{reem}/hours", json={"periods": []}).status_code == 403
    assert agent.put("/api/bookings/settings", json={"review_requests": False}).status_code == 403
    assert agent.patch(f"/api/services/{sid}", json={"deposit_kind": "none"}).status_code == 403
    assert agent.post(f"/api/bookings/{made.json()['id']}/deposit-refunded").status_code == 403


def test_another_shop_cannot_touch_this_shops_people_or_bookings(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, stranger = client_factory(), client_factory()
    other = other_shop_with_owner()
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", other)
    sign_in(owner)
    sign_in(stranger, "omar@other.example")
    sid = service_id(owner)
    reem = person(owner, "Reem")
    made = staff_walk_in(owner, sid, soon(29), reem).json()

    assert stranger.put(f"/api/resources/{reem}/hours", json={"periods": []}).status_code == 404
    assert stranger.post(f"/api/bookings/{made['id']}/move",
                         json={"starts_at": soon(90)}).status_code == 404
    assert stranger.post(f"/api/bookings/{made['id']}/cancel").status_code == 404
    assert stranger.get("/api/bookings/day").json()["bookings"] == []
    assert listed(owner)[made["id"]]["status"] == "booked"


# ------------------------------------------------------------------- 5. the review request

REVIEW = "https://g.page/r/al-noor-example/review"


def review_on(client, link=REVIEW):
    done = client.put("/api/bookings/settings",
                      json={"review_requests": True, "review_link": link})
    assert done.status_code == 200, done.text
    return done.json()


def came(client, contact_id):
    sid = service_id(client)
    made = book_as(client, contact_id, sid, free(client, sid)[0]).json()
    client.post(f"/api/bookings/{made['id']}/outcome", json={"status": "completed"})
    return made


def reviews_of(contact_id):
    return owner_sql("select subject, blocked from review_requests where contact_id = $1 "
                     "order by sent_at", UUID(contact_id))


def test_the_review_request_is_off_until_the_owner_turns_it_on(client):
    me = ahmed(client)
    assert client.get("/api/bookings/settings").json()["review"] == {"on": False, "link": ""}
    came(client, me["id"])
    assert reviews_of(me["id"]) == []
    assert not any(REVIEW in m["body"] for m in conversation(client))


def test_the_review_link_is_checked(client):
    refused = client.put("/api/bookings/settings", json={"review_requests": True})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "link_needed"
    bad = client.put("/api/bookings/settings",
                     json={"review_requests": True, "review_link": "http://g.page/x"})
    assert bad.status_code == 422
    assert review_on(client)["review"] == {"on": True, "link": REVIEW}


def test_everyone_who_came_gets_one_request_with_the_link_and_no_more_for_30_days(client):
    """No gating: no "were you happy?" first. The same words and the link, to every customer."""
    review_on(client)
    me = ahmed(client)
    made = came(client, me["id"])
    asked = conversation(client)[-1]
    assert asked["body"].startswith("Thank you for your visit on ")
    assert REVIEW in asked["body"] and "reply to this message" in asked["body"]
    assert [r["subject"] for r in reviews_of(me["id"])] == ["booking"]
    assert actions(made["id"], "review_requested")
    for word in ("happy", "satisf", "how was", "rate us"):
        assert word not in asked["body"].lower()

    came(client, me["id"])  # a second visit the same month
    assert len(reviews_of(me["id"])) == 1
    owner_sql("update review_requests set sent_at = now() - interval '31 days' "
              "where contact_id = $1", UUID(me["id"]))
    came(client, me["id"])
    assert len(reviews_of(me["id"])) == 2


def test_a_no_show_is_not_asked(client):
    review_on(client)
    me = ahmed(client)
    sid = service_id(client)
    made = book_as(client, me["id"], sid, free(client, sid)[0]).json()
    client.post(f"/api/bookings/{made['id']}/outcome", json={"status": "no_show"})
    assert reviews_of(me["id"]) == []


def test_an_order_collected_or_delivered_is_asked_too(client):
    review_on(client)
    me = order_customer(client)
    order = place(client, me["id"], [(product(client, "Switch"), 1)], "link").json()
    for status in ("confirmed", "ready", "done"):
        client.post(f"/api/orders/{order['order_id']}/status", json={"status": status})
    last = conversation(client)[-1]["body"]
    assert last.startswith(f"Thank you for order {order['number']}") and REVIEW in last
    assert [r["subject"] for r in reviews_of(me["id"])] == ["order"]


def test_a_customer_who_said_stop_is_not_messaged(client):
    review_on(client)
    me = ahmed(client)
    owner_sql("update contacts set consent_service = 'revoked' where id = $1", UUID(me["id"]))
    came(client, me["id"])
    assert [r["blocked"] for r in reviews_of(me["id"])] == ["opted_out"]
    assert not any(REVIEW in m["body"] and m["status"] != "blocked"
                   for m in sent_to(me["id"]))


def test_review_requests_are_counted_in_the_agent(client):
    review_on(client)
    came(client, ahmed(client)["id"])
    home = client.get("/api/agent", params={"lang": "en"}).json()
    rows = {r["key"]: r for r in home["done"]["rows"]}
    assert rows["review_requests"]["value"] == "1"
    assert rows["review_requests"]["label"] == "review request"


# ------------------------------------------------------------------------- 6. the seed

NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)


def live_salon():
    async def go():
        await ensure_sample_tenant(OWNER_DSN, SALON, NOW, 56)
        db = Database(APP_DSN)
        await db.connect()
        try:
            first = await reset_sample(db, SALON, NOW, 56, web_url="http://web.test", live=True)
            again = await reset_sample(db, SALON, NOW, 56, web_url="http://web.test", live=True)
            async with db.tenant(SALON.tenant_id) as conn:
                owner = await conn.fetchrow(
                    "select u.id, u.name from memberships m join users u on u.id = m.user_id "
                    "where m.role = 'owner'")
                staff = Staff(owner["id"], owner["name"], "", "owner", SALON.tenant_id)
                f = await facts.gather(conn, staff, NOW)
            return first, again, f
        finally:
            await db.close()

    first, again, f = asyncio.run(go())
    return first, again, f


def test_the_live_salon_has_three_stylists_side_by_side_and_deposits():
    first, again, f = live_salon()
    assert first == again
    tid = SALON.tenant_id
    assert [r["name"] for r in owner_sql(
        "select name from booking_resources where tenant_id = $1 order by sort", tid)] == [
        "Reem", "Huda", "Noor"]
    # Each has a day off: six working days of her own.
    assert {r["n"] for r in owner_sql(
        "select count(distinct weekday) as n from resource_hours where tenant_id = $1 "
        "group by resource_id", tid)} == {6}
    assert {(r["name"], r["deposit_kind"], r["deposit_value"]) for r in owner_sql(
        "select name, deposit_kind, deposit_value from services where tenant_id = $1 "
        "and deposit_kind <> 'none'", tid)} == {
        ("Hair colour", "fixed", 5_000), ("Hair treatment", "percent", 25)}
    # Two or three customers at the same time, on different stylists.
    together = owner_sql(
        "select count(*) as n from bookings a join bookings b on a.tenant_id = b.tenant_id "
        "and a.id < b.id and a.status = 'booked' and b.status = 'booked' "
        "and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at) "
        "where a.tenant_id = $1", tid)[0]["n"]
    assert together >= 3
    states = {r["deposit_state"]: r["n"] for r in owner_sql(
        "select deposit_state, count(*) as n from bookings where tenant_id = $1 group by 1", tid)}
    assert states.get("paid", 0) >= 2 and states.get("due") == 1
    assert owner_sql("select count(*) as n from jobs where tenant_id = $1", tid)[0]["n"] == 0
    assert "documents" in {r["module_key"] for r in owner_sql(
        "select module_key from tenant_modules where tenant_id = $1", tid)}
    # Every booking still to come has its stylist, and the Agent says who.
    assert owner_sql("select count(*) as n from bookings where tenant_id = $1 "
                     "and status = 'booked' and resource_id is null", tid)[0]["n"] == 0
    # The two who missed twice are booked again: the Agent says with whom.
    finding = insights._find_repeat_no_show(f)
    assert finding and all(row.detail["with"]["name"] in ("Reem", "Huda", "Noor")
                           for row in finding.rows)
    _, detail = insights._say_repeat_no_show(finding, f, "en")
    words = "".join(p for p in detail if isinstance(p, str))
    assert " with " in words
    assert {"b": finding.rows[0].detail["with"]["name"]} in detail
    _, detail_ar = insights._say_repeat_no_show(finding, f, "ar")
    assert " مع " in "".join(p for p in detail_ar if isinstance(p, str))


def test_the_live_salon_can_be_reset_after_a_rehearsal_paid_a_deposit(client):
    """A deposit paid while rehearsing the demo issues a receipt, which can never be deleted.
    The next reset still works, and the receipt is still there."""
    live_salon()
    tid = SALON.tenant_id
    [waiting] = owner_sql("select id from payment_requests where tenant_id = $1 "
                          "and status = 'pending' and booking_id is not null", tid)
    assert client.post(f"/api/pay/{tid}/{waiting['id']}/complete").status_code == 200
    receipts = owner_sql("select id from documents where tenant_id = $1 "
                         "and kind = 'deposit_receipt' and status = 'issued'", tid)
    assert len(receipts) == 1
    first, again, _ = live_salon()
    assert first == again
    assert owner_sql("select count(*) as n from documents where tenant_id = $1 "
                     "and kind = 'deposit_receipt'", tid)[0]["n"] == 1
