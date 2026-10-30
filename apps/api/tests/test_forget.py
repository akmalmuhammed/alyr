"""Forgetting a customer who asked to be deleted (go-live checklist item 19, ALY-119, specs/038).
Real PostgreSQL, the simulator, HTTP in and out."""

import json
import random

from alyr.core import forget
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from documents_support import configured_shop, issued, make_draft
from test_consent import owner_sql, say
from test_sign_in import sign_in

INBOX = "/api/inbox/conversations"


def a_customer(client) -> tuple[str, str]:
    """A new customer of the demo shop who has written in. Answers their record and number."""
    phone = f"974555{random.randint(10000, 99999)}"
    say(client, phone, "Hello, I am Mariam. Do you deliver to Al Waab?")
    contact = owner_sql(
        "select id from contacts where tenant_id = $1 and phone = $2", DEMO_TENANT_ID, phone
    )[0]["id"]
    return str(contact), phone


def an_order(contact, status="done", number=None):
    return owner_sql(
        "insert into orders (tenant_id, contact_id, number, status, total, delivery_address, "
        "delivery_note) values ($1, $2, $3, $4, 4500, 'Al Waab, villa 12', 'Call Mariam') "
        "returning id",
        DEMO_TENANT_ID, contact, number or random.randint(100_000, 900_000), status,
    )[0]["id"]


def a_booking(contact, days_ahead, status="booked"):
    service = owner_sql(
        "select id, name from services where tenant_id = $1 limit 1", DEMO_TENANT_ID
    )[0]
    return owner_sql(
        "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
        "starts_at, ends_at, status, note) values ($1, $2, $3, $4, $5, "
        "now() + make_interval(days => $6), now() + make_interval(days => $6, hours => 1), "
        "$7, 'Prefers Mariam''s usual chair') returning id",
        DEMO_TENANT_ID, random.randint(100_000, 900_000), contact, service["id"],
        service["name"], days_ahead, status,
    )[0]["id"]


def one(sql, *args):
    return owner_sql(sql, *args)[0]


def test_every_table_that_points_at_a_customer_has_been_decided():
    """A new table that holds a customer cannot be added without saying what forgetting does."""
    pointing = {
        r["t"] for r in owner_sql(
            "select conrelid::regclass::text as t from pg_constraint "
            "where contype = 'f' and confrelid = 'contacts'::regclass"
        )
    }
    assert pointing <= set(forget.TABLES), sorted(pointing - set(forget.TABLES))


def test_forgetting_deletes_who_they_are_and_what_they_said_and_keeps_the_sales(client):
    contact, phone = a_customer(client)
    assert client.post(f"{INBOX}/{contact}/notes", json={"text": "Lives in Al Waab, villa 12"}
                       ).status_code == 200
    say(client, phone, "STOP")  # a consent record
    order = an_order(contact)
    booking = a_booking(contact, days_ahead=-3, status="completed")
    owner_sql("insert into ledger_entries (tenant_id, contact_id, kind, amount, note) "
              "values ($1, $2, 'sale', 12000, 'Cable, 20 m')", DEMO_TENANT_ID, contact)
    owner_sql("insert into jobs (tenant_id, kind, payload, status) values "
              "($1, 'inbound', $2, 'done')", DEMO_TENANT_ID,
              json.dumps({"from_number": phone, "text": "Hello, I am Mariam"}))

    preview = client.get(f"{INBOX}/{contact}/forget")
    assert preview.status_code == 200, preview.text
    seen = preview.json()
    assert (seen["orders"], seen["open_orders"], seen["upcoming"], seen["owes"]) == (1, 0, 0, 12000)
    assert seen["messages"] >= 2 and seen["notes"] == 1

    done = client.post(f"{INBOX}/{contact}/forget")
    assert done.status_code == 200, done.text
    assert done.json()["forgotten"] is True and done.json()["notes"] == 1

    person = one("select * from contacts where id = $1", contact)
    assert person["name"] == "Forgotten customer · عميل محذوف"
    assert person["forgotten_at"] is not None
    assert (person["phone"], person["wa_user_id"], person["username"], person["email"]) == (
        None, None, None, None
    )
    assert person["consent_service"] == "revoked" and person["last_inbound_at"] is None
    for table in ("messages", "inbox_notes", "consents"):
        assert one(f"select count(*) as n from {table} where contact_id = $1", contact)["n"] == 0
    assert one("select count(*) as n from jobs where tenant_id = $1 and payload::text like $2",
               DEMO_TENANT_ID, f"%{phone}%")["n"] == 0
    # The sales records stay, with nothing on them that names the person.
    kept = one("select total, delivery_address, delivery_note from orders where id = $1", order)
    assert (kept["total"], kept["delivery_address"], kept["delivery_note"]) == (4500, "", "")
    assert one("select note from bookings where id = $1", booking)["note"] == ""
    assert one("select count(*) as n from ledger_entries where contact_id = $1", contact)["n"] == 1
    # Who did it is on the activity record.
    did = one("select action, detail from activity where contact_id = $1 "
              "and action = 'customer_forgotten'", contact)
    assert json.loads(did["detail"])["notes"] == 1
    # Not twice, and not listed as a conversation.
    assert client.post(f"{INBOX}/{contact}/forget").status_code == 404
    rows = client.get(f"{INBOX}?status=all").json()["conversations"]
    assert contact not in {r["id"] for r in rows}
    # Its conversation is gone: it cannot be opened, written to or noted on again.
    assert client.get(f"{INBOX}/{contact}").status_code == 404
    assert client.post(f"{INBOX}/{contact}/notes", json={"text": "Lives in Al Waab"}
                       ).status_code == 404
    assert client.post(f"{INBOX}/{contact}/reply", json={"text": "Hello"}).status_code == 404


def test_if_they_write_again_they_start_as_a_new_customer(client):
    contact, phone = a_customer(client)
    assert client.post(f"{INBOX}/{contact}/forget").status_code == 200
    say(client, phone, "Hi again")
    again = one("select id, name from contacts where tenant_id = $1 and phone = $2",
                DEMO_TENANT_ID, phone)
    assert str(again["id"]) != contact
    assert one("select count(*) as n from messages where contact_id = $1", contact)["n"] == 0


def test_an_open_order_or_a_booking_still_to_come_must_be_finished_first(client):
    contact, _ = a_customer(client)
    order = an_order(contact, status="confirmed")
    assert client.get(f"{INBOX}/{contact}/forget").json()["open_orders"] == 1
    assert client.post(f"{INBOX}/{contact}/forget").json() == {"detail": {"reason": "open_work"}}
    owner_sql("update orders set status = 'done' where id = $1", order)
    a_booking(contact, days_ahead=2)
    refused = client.post(f"{INBOX}/{contact}/forget")
    assert refused.status_code == 409
    assert one("select phone from contacts where id = $1", contact)["phone"] is not None


def test_an_issued_receipt_is_kept_as_it_is_and_a_draft_goes(client_factory, monkeypatch):
    """The law requires the business to keep what it issued: a receipt is never changed, and
    the message that carried it stays as the record of its delivery, emptied."""
    shop = configured_shop(client_factory, monkeypatch)
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'inbox')",
              shop.tenant_id)
    contact = owner_sql(
        "insert into contacts (tenant_id, phone, name) values ($1, $2, 'Fatima Al-Kuwari') "
        "returning id", shop.tenant_id, f"974555{random.randint(10000, 99999)}",
    )[0]["id"]
    receipt = issued(shop.owner, contact_id=str(contact))
    draft = make_draft(shop.owner, contact_id=str(contact))
    carried = owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status) values "
        "($1, $2, 'out', 'document', 'Your receipt from Qirfa Bakery', 'sent') returning id",
        shop.tenant_id, contact,
    )[0]["id"]
    owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status) values "
        "($1, $2, 'in', 'text', 'Thank you, Fatima here', 'received')", shop.tenant_id, contact,
    )
    owner_sql(
        "insert into document_deliveries (tenant_id, document_id, channel, trigger, contact_id, "
        "recipient, language, status, message_id) values "
        "($1, $2, 'whatsapp', 'staff', $3, '+974 5555 0199', 'en', 'sent', $4)",
        shop.tenant_id, receipt["id"], contact, carried,
    )
    before = one("select * from documents where id = $1", receipt["id"])

    assert shop.owner.get(f"{INBOX}/{contact}/forget").json()["documents"] == 1
    assert shop.owner.post(f"{INBOX}/{contact}/forget").status_code == 200
    left = owner_sql("select id, body, payload from messages where contact_id = $1", contact)
    assert [(m["id"], m["body"], json.loads(m["payload"])) for m in left] == [(carried, "", {})]
    assert dict(one("select * from documents where id = $1", receipt["id"])) == dict(before)
    assert owner_sql("select id from documents where id = $1", draft["id"]) == []


def test_the_business_can_give_them_a_copy_of_what_it_holds(client):
    """The right to see one's data: the owner downloads it to check and send, and who did it
    is on the customer's record."""
    contact, phone = a_customer(client)
    assert client.post(f"{INBOX}/{contact}/notes", json={"text": "Prefers delivery after 5"}
                       ).status_code == 200
    order = an_order(contact)
    owner_sql("insert into order_items (tenant_id, order_id, name, price, quantity) "
              "values ($1, $2, 'Cable, 20 m', 2250, 20)", DEMO_TENANT_ID, order)
    owner_sql("insert into ledger_entries (tenant_id, contact_id, kind, amount, note) "
              "values ($1, $2, 'sale', 12000, 'Cable, 20 m')", DEMO_TENANT_ID, contact)

    got = client.get(f"{INBOX}/{contact}/export")
    assert got.status_code == 200, got.text
    assert got.headers["content-disposition"].startswith('attachment; filename="customer-data-')
    copy = got.json()
    assert copy["customer"]["phone"] == phone and copy["business"]
    assert copy["messages"][0]["body"].startswith("Hello, I am Mariam")
    assert [n["body"] for n in copy["notes"]] == ["Prefers delivery after 5"]
    (sold,) = copy["orders"]
    assert (sold["total"], sold["delivery_address"]) == (4500, "Al Waab, villa 12")
    assert sold["items"] == [{"name": "Cable, 20 m", "variant_name": "", "quantity": "20",
                              "price": 2250, "discount": 0}]
    assert [e["amount"] for e in copy["credit_account"]] == [12000]
    assert one("select actor_name from activity where contact_id = $1 "
               "and action = 'data_exported'", contact)["actor_name"]
    # Once forgotten there is nothing left to give.
    assert client.post(f"{INBOX}/{contact}/forget").status_code == 200
    assert client.get(f"{INBOX}/{contact}/export").status_code == 404


def test_only_an_owner_or_admin_can_and_only_in_their_own_shop(client_factory):
    owner = client_factory()
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    contact, _ = a_customer(owner)
    assert agent.get(f"{INBOX}/{contact}/forget").status_code == 403
    assert agent.post(f"{INBOX}/{contact}/forget").status_code == 403
    assert agent.get(f"{INBOX}/{contact}/export").status_code == 403
    # A customer of another business is not found from this one.
    other = owner_sql("insert into tenants (name) values ('Other shop') returning id")[0]["id"]
    stranger = owner_sql(
        "insert into contacts (tenant_id, phone, name) values ($1, '97455599999', 'Stranger') "
        "returning id", other,
    )[0]["id"]
    assert owner.get(f"{INBOX}/{stranger}/forget").status_code == 404
    assert owner.post(f"{INBOX}/{stranger}/forget").status_code == 404
    assert owner.get(f"{INBOX}/{stranger}/export").status_code == 404
    assert one("select phone from contacts where id = $1", stranger)["phone"] == "97455599999"
    assert one("select forgotten_at from contacts where id = $1", contact)["forgotten_at"] is None
