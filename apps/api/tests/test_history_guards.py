"""The visits import never contacts anyone (D-197, spec 070): the hard guards, each with a test.

A line in a customer file is not a person who agreed to be messaged. So nothing is queued by the
import, a past row is never left "booked", and no outbound path can reach a client the import made
until that person writes to the shop themselves.
"""

import asyncio

import pytest

from alyr.channels.base import OutboundMessage
from alyr.core.actions import Caller
from alyr.core.outbound import Outbound
from alyr.modules import reviews
from alyr.modules.bookings import service as bookings
from alyr.modules.owner import reads
from history_support import (
    NOTHING_SENT,
    count,
    do_import,
    make_business,
    run_in,
    snapshot,
    sql,
)


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def shop(office):
    """A business with Bookings, reminders and review requests all switched on: the case where
    something could go wrong."""
    tenant = make_business(office, ["bookings"])
    sql("update tenants set booking_reminders = true where id = $1", tenant)
    sql("insert into shop_settings (tenant_id, review_requests, review_link) "
        "values ($1, true, 'https://g.page/r/invented-salon') "
        "on conflict (tenant_id) do update set review_requests = true, "
        "review_link = 'https://g.page/r/invented-salon'", tenant)
    return tenant


def an_imported_client(tenant):
    return sql("select id from contacts where tenant_id = $1 and history_import_id is not null "
               "order by created_at limit 1", tenant)[0]["id"]


# ── the import itself sends and queues nothing ───────────────────────────────────────────


def test_an_import_queues_no_message_reminder_review_consent_job_or_event(office, shop):
    before = snapshot(shop)
    jobs_before = sql("select kind, count(*) as n from jobs where tenant_id = $1 group by 1", shop)
    done = do_import(office, shop)
    assert done["counts"]["visits_made"] > 100
    assert snapshot(shop) == before, {
        t: (before[t], count(t, shop)) for t in NOTHING_SENT if before[t] != count(t, shop)}
    assert sql("select kind, count(*) as n from jobs where tenant_id = $1 group by 1",
               shop) == jobs_before
    # No client the import made has been asked, has agreed, or has ever written.
    people = sql("select consent_service, consent_marketing, consent_back_in_stock, "
                 "last_inbound_at, last_message_at, email from contacts where tenant_id = $1 "
                 "and history_import_id is not null", shop)
    assert people and all(
        p["consent_service"] == p["consent_marketing"] == p["consent_back_in_stock"] == "unknown"
        and p["last_inbound_at"] is None and p["last_message_at"] is None and p["email"] is None
        for p in people)
    # The only thing written on the activity record is the import's own: a cancellation the file
    # says the time of, by "Import", through ALYR itself.
    assert {(r["action"], r["actor_name"], r["channel"]) for r in sql(
        "select action, actor_name, channel from activity where tenant_id = $1", shop)} <= {
        ("cancelled", "Import", "system")}


def test_no_past_visit_is_left_booked_and_nothing_is_to_come(office, shop):
    do_import(office, shop)
    assert count("bookings", shop, "history_import_id is not null and status = 'booked'") == 0
    assert count("bookings", shop, "status = 'booked'") == 0
    # So none can be "not marked yet", none is reminded, none holds a time.
    assert count("bookings", shop, "(reminded_at is not null or hold_until is not null "
                                   "or deposit_state <> 'none')") == 0

    who = an_imported_client(shop)

    async def what(conn):
        return await bookings.next_booking(conn, who)

    assert run_in(shop, what) is None


# ── no outbound path reaches an imported client ──────────────────────────────────────────

KINDS = {
    "typed reply": OutboundMessage(to=None, body="Hello", typed=True),
    "automatic text": OutboundMessage(to=None, body="Hello"),
    "service template": OutboundMessage(
        to=None, kind="template", body="Reminder", template_name="booking_reminder",
        template_category="utility", template_params=("101", "Salon", "tomorrow")),
    "marketing template": OutboundMessage(
        to=None, kind="template", body="Offer", template_name="offer",
        template_category="marketing", template_params=("10%",)),
    "document": OutboundMessage(
        to=None, kind="document", body="Receipt", document=b"%PDF-1.4 invented",
        filename="receipt.pdf"),
}


def send(tenant, contact, message, outbound=None):
    outbound = outbound or Outbound({}, None)

    async def go(conn):
        sent = await outbound.send(conn, OutboundMessage(**{**message.__dict__, "to": contact}))
        row = await conn.fetchrow("select status, error from messages where id = $1",
                                  sent.message_id)
        queued = await conn.fetchval(
            "select count(*) from jobs where kind = 'send_message' and payload->>'message_id' = $1",
            str(sent.message_id))
        return sent.blocked, row["status"], queued

    return run_in(tenant, go)


@pytest.mark.parametrize("kind", list(KINDS))
def test_the_outbound_layer_refuses_a_client_the_import_made_whatever_the_consent(
        office, shop, kind):
    do_import(office, shop)
    who = an_imported_client(shop)
    # Even if something wrote consent on the contact, and even with the window "open" on paper.
    sql("update contacts set consent_service = 'granted', consent_marketing = 'granted', "
        "consent_back_in_stock = 'granted' where id = $1", who)
    blocked, status, queued = send(shop, who, KINDS[kind])
    assert blocked == "imported_history" and status == "blocked" and queued == 0


def test_a_delivering_job_for_an_imported_client_sends_nothing(office, shop):
    do_import(office, shop)
    who = an_imported_client(shop)
    message_id = sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status) "
        "values ($1, $2, 'out', 'text', 'x', 'queued') returning id", shop, who)[0]["id"]

    async def go():
        # No channel is configured: if it tried to send, it would fail on the missing number.
        from alyr.db import Database
        from conftest import APP_DSN

        db = Database(APP_DSN)
        await db.connect()
        try:
            await Outbound({}, db).deliver(shop, {"message_id": str(message_id)})
        finally:
            await db.close()

    asyncio.run(go())
    row = sql("select status, error from messages where id = $1", message_id)[0]
    assert (row["status"], row["error"]) == ("blocked", "imported_history")


def test_once_the_person_writes_to_the_shop_they_are_an_ordinary_customer(office, shop):
    do_import(office, shop)
    who = an_imported_client(shop)
    sql("update contacts set last_inbound_at = now(), consent_service = 'granted' "
        "where id = $1", who)
    blocked, status, queued = send(shop, who, KINDS["typed reply"])
    assert blocked is None and status == "queued" and queued == 1


def test_no_review_request_is_ever_asked_of_an_imported_client(office, shop):
    do_import(office, shop)
    who = an_imported_client(shop)
    visit = sql("select id from bookings where contact_id = $1 and status = 'completed' limit 1",
                who)[0]["id"]

    async def ask(conn):
        return await reviews.after_visit(conn, Outbound({}, None), "booking", visit, who)

    assert run_in(shop, ask) is None
    assert count("review_requests", shop) == 0 and count("messages", shop) == 0
    # The control: the same shop does ask a native customer who has agreed and written first.
    native = sql("insert into contacts (tenant_id, phone, name, consent_service, last_inbound_at) "
                 "values ($1, '97455500999', 'Native', 'granted', now()) returning id",
                 shop)[0]["id"]
    service = sql("insert into services (tenant_id, name, duration_minutes, price) "
                  "values ($1, 'Haircut', 60, 12000) returning id", shop)[0]["id"]
    own = sql("insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
              "starts_at, ends_at, status) values ($1, 99001, $2, $3, 'Haircut', "
              "now() - interval '3 hours', now() - interval '2 hours', 'completed') returning id",
              shop, native, service)[0]["id"]

    async def ask_native(conn):
        return await reviews.after_visit(conn, Outbound({}, None), "booking", own, native)

    assert run_in(shop, ask_native) == "sent"
    assert count("review_requests", shop) == 1


def test_the_reminder_job_finds_nothing_to_remind_in_an_imported_visit(office, shop):
    do_import(office, shop)
    visit = sql("select id, starts_at from bookings where tenant_id = $1 "
                "and history_import_id is not null limit 1", shop)[0]
    from alyr.db import Database
    from conftest import APP_DSN

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            await bookings.Reminders(db, Outbound({}, db)).send(shop, {
                "booking_id": str(visit["id"]), "starts_at": visit["starts_at"].isoformat()})
        finally:
            await db.close()

    asyncio.run(go())
    assert count("messages", shop) == 0
    assert sql("select reminded_at from bookings where id = $1", visit["id"])[0][
        "reminded_at"] is None


def test_the_stylists_of_a_history_are_not_lanes_to_book(office, shop):
    """A shop with no people of its own still has one lane after an import names stylists."""
    do_import(office, shop)
    assert count("booking_resources", shop, "history_import_id is not null") >= 3

    async def lanes(conn):
        return (await bookings.has_resources(conn),
                await bookings.list_resources(conn, only_active=True))

    has, active = run_in(shop, lanes)
    assert has is False and active == []
    # The moment the shop adds a person of its own, it has lanes, as before.
    sql("insert into booking_resources (tenant_id, name) values ($1, 'Own stylist')", shop)
    assert run_in(shop, lanes)[0] is True


def test_an_imported_client_is_not_in_the_inbox_and_the_owners_apps_read_them_without_a_phone(
        office, shop):
    do_import(office, shop)
    assert count("contacts", shop, "history_import_id is not null and last_message_at is not null"
                 ) == 0
    caller = Caller(None, "Noor", "owner", "mcp")

    async def what(conn):
        return await reads.insights(conn, caller, {"lang": "en"})

    assert isinstance(run_in(shop, what), dict)


def test_a_forgotten_client_loses_the_key_an_import_matched_them_by(office, shop):
    do_import(office, shop, options={"keep_personal": True})
    who = an_imported_client(shop)
    assert sql("select history_key, phone from contacts where id = $1", who)[0]["phone"]
    async def forget(conn):
        from alyr.core import forget as forgetting
        from alyr.core.team import Actor

        return await forgetting.forget(conn, who, Actor(None, "Noor"))

    run_in(shop, forget)
    row = sql("select history_key, phone, name, forgotten_at from contacts where id = $1", who)[0]
    assert row["history_key"] is None and row["phone"] is None and row["forgotten_at"]
    # Their visits stay as sales records, with no name; the visit's own row key is a keyed hash.
    assert count("bookings", shop, f"contact_id = '{who}'") > 0
