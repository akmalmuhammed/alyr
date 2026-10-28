"""Two records for one customer become one without losing anything that matters (ALY-115).

The audit found that the merge deleted the duplicate and let its consent records go with it,
so a customer's STOP could be lost and the shop could message someone who had asked it to
stop. It also failed outright when the duplicate had a booking. These go through the real
path: the simulator, real PostgreSQL, the shop's own roles."""

import json
from datetime import UTC, datetime
from uuid import UUID

from alyr.core import identity
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
from test_bookings import book
from test_consent import ahmed, owner_sql, say

NEW_ID = "QA.77777777777777777777"


def say_as_user(client, user_id, text="", reply_id=""):
    response = client.post(
        "/sim/messages", json={"from_user_id": user_id, "text": text, "reply_id": reply_id}
    )
    assert response.status_code == 200
    return response.json()["messages"]


def meet(client, user_id=NEW_ID):
    """The message that carries both identifiers: the user-ID record and the phone record
    are seen to be one person, and are merged."""
    response = client.post(
        "/sim/messages",
        json={"from_number": AHMED_PHONE, "from_user_id": user_id, "text": "balance"},
    )
    assert response.status_code == 200


def ahmed_id(client) -> UUID:
    return UUID(ahmed(client)["id"])


def row(sql, *args):
    return owner_sql(sql, *args)[0]


def consent_state(contact_id, column="consent_service"):
    return row(f"select {column} as s from contacts where id = $1", contact_id)["s"]


def consent_history(contact_id):
    return [
        (r["purpose"], r["status"], r["source"])
        for r in owner_sql(
            "select purpose, status, source from consents where contact_id = $1 "
            "order by created_at, id", contact_id,
        )
    ]


def duplicate(client, user_id=NEW_ID):
    """A second record for Ahmed: he wrote once with only a user ID."""
    say_as_user(client, user_id, "hello")
    return row("select id from contacts where wa_user_id = $1", user_id)["id"]


def reminders_sent(client, contact_id, since):
    """Reminders that actually went out to this customer after `since`."""
    client.post("/api/ledger/reminders", json={"min_days": 0})
    return row(
        "select count(*) as n from messages where contact_id = $1 and direction = 'out' "
        "and created_at > $2 and status not in ('blocked', 'failed')",
        contact_id, since,
    )["n"]


# ------------------------------------------------------------------ consent is never lost

def test_a_stop_on_the_duplicate_survives_the_merge(client):
    dup = duplicate(client)
    say_as_user(client, NEW_ID, "STOP")
    assert consent_state(dup) == "revoked"

    meet(client)
    survivor = ahmed_id(client)
    assert consent_state(survivor) == "revoked"
    # The record of it is there too, with its own source, not only the state.
    assert ("service", "revoked", "customer_message") in consent_history(survivor)
    assert row("select count(*) as n from contacts where id = $1", dup)["n"] == 0
    # And the shop really cannot message him.
    assert reminders_sent(client, survivor, datetime.now(UTC)) == 0


def test_a_stop_on_the_phone_record_survives_too(client):
    say(client, AHMED_PHONE, "STOP")
    survivor = ahmed_id(client)
    assert consent_state(survivor) == "revoked"
    duplicate(client)
    meet(client)
    assert consent_state(survivor) == "revoked"
    assert ("service", "revoked", "customer_message") in consent_history(survivor)


def test_a_customer_who_never_stopped_is_still_reminded_after_a_merge(client):
    """The control: the merge itself does not silence anyone."""
    say(client, AHMED_PHONE, "hello")
    survivor = ahmed_id(client)
    duplicate(client)
    meet(client)
    assert consent_state(survivor) == "granted"
    assert reminders_sent(client, survivor, datetime.now(UTC)) == 1


def test_a_grant_on_either_record_is_not_lost(client):
    survivor = ahmed_id(client)
    owner_sql("update contacts set consent_service = 'unknown' where id = $1", survivor)
    dup = duplicate(client)
    assert consent_state(dup) == "granted"
    meet(client)
    assert consent_state(survivor) == "granted"


def test_a_withdrawal_is_written_as_a_visible_record_so_the_history_ends_where_the_state_is(
    client,
):
    survivor = ahmed_id(client)
    say(client, AHMED_PHONE, "hello")
    dup = duplicate(client)
    say_as_user(client, NEW_ID, "STOP")
    assert consent_state(survivor) == "granted"
    meet(client)
    history = consent_history(survivor)
    assert ("service", "revoked", "merge") in history
    assert consent_state(survivor) == "revoked"
    assert dup != survivor


# ---------------------------------------------------------------- nothing else is lost

def test_a_merge_works_when_the_duplicate_has_a_booking(client):
    """This used to fail with a foreign-key error and the customer's message was lost."""
    dup = duplicate(client)
    made = book(client, contact_id=str(dup))
    assert made.status_code == 200, made.text
    survivor = ahmed_id(client)

    meet(client)
    assert row(
        "select count(*) as n from bookings where contact_id = $1", survivor
    )["n"] == 1


def test_notes_activity_orders_and_the_chasing_record_follow_the_customer(client):
    survivor = ahmed_id(client)
    dup = duplicate(client)
    owner_sql(
        "insert into inbox_notes (tenant_id, contact_id, body, author_name) "
        "values ($1, $2, 'prefers mornings', 'Fatima')", DEMO_TENANT_ID, dup,
    )
    owner_sql(
        "insert into ledger_accounts (tenant_id, contact_id, promised_until, reminder_count) "
        "values ($1, $2, '2099-01-01', 2) "
        "on conflict (contact_id) do update set promised_until = '2099-01-01', "
        "reminder_count = 2", DEMO_TENANT_ID, dup,
    )
    owner_sql(
        "insert into ledger_accounts (tenant_id, contact_id, reminder_count) values ($1, $2, 1) "
        "on conflict (contact_id) do update set reminder_count = 1",
        DEMO_TENANT_ID, survivor,
    )
    owner_sql(
        "insert into activity (tenant_id, subject, subject_id, contact_id, action, actor_name) "
        "values ($1, 'conversation', $2, $2, 'closed', 'Fatima')", DEMO_TENANT_ID, dup,
    )

    meet(client)

    assert row("select body from inbox_notes where contact_id = $1", survivor)["body"] == (
        "prefers mornings"
    )
    # Both chasing records became one: the later promise, the reminders added up.
    account = row("select * from ledger_accounts where contact_id = $1", survivor)
    assert str(account["promised_until"]) == "2099-01-01" and account["reminder_count"] == 3
    assert row("select count(*) as n from ledger_accounts where contact_id = $1", dup)["n"] == 0
    # An entry about the conversation names the surviving contact, not the deleted one.
    entry = row(
        "select contact_id, subject_id from activity where action = 'closed' "
        "and actor_name = 'Fatima' and subject_id = $1", survivor,
    )
    assert entry["contact_id"] == survivor
    assert row("select count(*) as n from activity where subject_id = $1", dup)["n"] == 0


def test_waiting_lists_and_sold_out_asks_are_not_doubled(client):
    survivor = ahmed_id(client)
    dup = duplicate(client)
    item = row("select id from items where tenant_id = $1 limit 1", DEMO_TENANT_ID)["id"]
    for who in (survivor, dup):
        owner_sql(
            "insert into stock_watches (tenant_id, contact_id, item_id) values ($1, $2, $3)",
            DEMO_TENANT_ID, who, item,
        )
        owner_sql(
            "insert into sold_out_asks (tenant_id, contact_id, item_id, day, via) "
            "values ($1, $2, $3, '2026-10-01', 'whatsapp')", DEMO_TENANT_ID, who, item,
        )
    owner_sql(
        "insert into sold_out_asks (tenant_id, contact_id, item_id, day, via) "
        "values ($1, $2, $3, '2026-10-02', 'whatsapp')", DEMO_TENANT_ID, dup, item,
    )

    meet(client)

    watches = owner_sql(
        "select status from stock_watches where contact_id = $1 order by status", survivor
    )
    # He waits for the item once; the second watch is closed, not deleted.
    assert [w["status"] for w in watches] == ["cancelled", "waiting"]
    days = owner_sql(
        "select day::text as d from sold_out_asks where contact_id = $1 order by day", survivor
    )
    assert [d["d"] for d in days] == ["2026-10-01", "2026-10-02"]


def test_the_merge_leaves_a_trail_the_owner_can_read_and_a_redirect_for_locked_records(client):
    survivor = ahmed_id(client)
    dup = duplicate(client)
    meet(client)
    trail = row("select * from contact_merges where dropped_contact_id = $1", dup)
    assert trail["kept_contact_id"] == survivor
    moved = json.loads(trail["moved"])
    assert moved["messages"] >= 1
    # Counts only: no names, numbers or message text.
    assert all(isinstance(v, int) for v in moved.values())
    entry = row(
        "select actor_name from activity where action = 'contacts_merged' and contact_id = $1",
        survivor,
    )
    assert entry["actor_name"] == "Assistant"


def test_a_second_merge_carries_the_first_ones_trail_with_it(client):
    survivor = ahmed_id(client)
    first = duplicate(client)
    meet(client)
    second = duplicate(client, "QA.88888888888888888888")
    meet(client, "QA.88888888888888888888")
    kept = {
        r["dropped_contact_id"]: r["kept_contact_id"]
        for r in owner_sql("select * from contact_merges where kept_contact_id = $1", survivor)
    }
    assert kept == {first: survivor, second: survivor}


def test_a_merge_that_has_already_happened_is_not_done_twice(client):
    """Two messages from one person can start the same merge at once; the second finds the
    duplicate gone and leaves things as they are."""
    survivor = ahmed_id(client)
    dup = duplicate(client)
    stale_keep = {"id": survivor}
    stale_drop = {"id": dup}
    meet(client)
    before = row("select count(*) as n from contact_merges")["n"]

    async def again():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return await identity._merge(conn, stale_keep, stale_drop, NEW_ID)

    result = client.portal.call(again)
    assert result["id"] == survivor
    assert row("select count(*) as n from contact_merges")["n"] == before


# ------------------------------------------------------- a new table cannot be forgotten

def test_every_table_that_points_at_a_contact_has_been_decided():
    """Read from the database itself, so a new table (a new foreign key to `contacts`, or a new
    `contact_id` column with none) fails here until `core/identity.py` says what a merge does
    with it. This is the guard that would have caught ALY-115."""
    with_key = {
        r["t"] for r in owner_sql(
            "select cl.relname as t from pg_constraint c "
            "join pg_class cl on cl.oid = c.conrelid "
            "where c.contype = 'f' and c.confrelid = 'contacts'::regclass"
        )
    }
    assert with_key <= identity.HANDLED, (
        f"a merge does not know what to do with {sorted(with_key - identity.HANDLED)}: "
        "add each to MOVE, MOVE_ONE_PER or SPECIAL in core/identity.py"
    )

    plain = {
        r["t"] for r in owner_sql(
            "select table_name as t from information_schema.columns "
            "where table_schema = 'public' and column_name = 'contact_id'"
        )
    } - with_key
    assert plain == set(identity.FROZEN), (
        f"tables that keep a contact_id with no foreign key: {sorted(plain)}; "
        f"core/identity.py lists {sorted(identity.FROZEN)}. A locked record must be listed in "
        "FROZEN; anything else needs a foreign key or a place in the merge"
    )
