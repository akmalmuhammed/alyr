"""The sample bakery for screenshots (ALY-99): it can be made again and again, it has the
activity the ALYR Agent dashboard needs, and nothing in it can reach a phone."""

import asyncio
from datetime import UTC, datetime

from alyr.db import Database
from alyr.seed_qirfa import ACCOUNTS, PEOPLE, QIRFA_TENANT_ID, ensure_qirfa_tenant, reset_qirfa
from conftest import APP_DSN, OWNER_DSN
from test_consent import owner_sql

NOW = datetime(2026, 10, 15, 9, 30, tzinfo=UTC)


def make_bakery() -> tuple[dict, dict]:
    async def go():
        await ensure_qirfa_tenant(OWNER_DSN)
        db = Database(APP_DSN)
        await db.connect()
        try:
            first = await reset_qirfa(db, now=NOW, web_url="http://web.test")
            again = await reset_qirfa(db, now=NOW, web_url="http://web.test")
        finally:
            await db.close()
        return first, again

    return asyncio.run(go())


def one(sql: str):
    return owner_sql(sql, QIRFA_TENANT_ID)[0]


def test_the_sample_bakery_is_the_same_every_time_and_has_eight_weeks_of_activity():
    first, again = make_bakery()
    assert first == again
    assert first["customers"] == len(PEOPLE) + len(ACCOUNTS)
    assert first["orders"] > 300 and first["bookings"] > 40

    weeks = owner_sql(
        "select date_trunc('week', created_at) as week, count(*) as n from orders "
        "where tenant_id = $1 and status <> 'cancelled' group by 1 order by 1",
        QIRFA_TENANT_ID,
    )
    assert len(weeks) >= 8
    # Busier at the end than at the start.
    assert weeks[-2]["n"] > weeks[1]["n"]
    # Order numbers rise with time.
    assert one(
        "select count(*) as n from orders o where tenant_id = $1 and exists (select 1 from "
        "orders p where p.tenant_id = o.tenant_id and p.number < o.number "
        "and p.created_at > o.created_at)"
    )["n"] == 0

    visits = {
        r["status"]: r["n"]
        for r in owner_sql(
            "select status, count(*) as n from bookings where tenant_id = $1 group by 1",
            QIRFA_TENANT_ID,
        )
    }
    assert visits["no_show"] > 0 and visits["completed"] > visits["no_show"]
    assert visits["booked"] > 0  # some still to come

    # Regulars who have gone quiet: four or more orders, none in the last three weeks.
    quiet = one(
        "select count(*) as n from (select contact_id from orders where tenant_id = $1 "
        "group by 1 having count(*) >= 4 and max(created_at) < now() - interval '21 days') q"
    )
    assert quiet["n"] >= 3
    # Balances of different ages, a promise to pay, staff replies with response times.
    assert one(
        "select count(distinct contact_id) as n from ledger_entries where tenant_id = $1"
    )["n"] == len(ACCOUNTS)
    assert one(
        "select count(*) as n from ledger_accounts where tenant_id = $1 "
        "and promised_until is not null"
    )["n"] == 1
    assert one(
        "select count(*) as n from messages where tenant_id = $1 and sent_by_user is not null"
    )["n"] > 100
    team = owner_sql(
        "select m.role from memberships m where m.tenant_id = $1 order by m.role",
        QIRFA_TENANT_ID,
    )
    assert [r["role"] for r in team] == ["admin", "agent", "owner"]


def test_nothing_in_the_sample_bakery_can_reach_a_phone():
    make_bakery()
    channels = owner_sql(
        "select channel from channel_numbers where tenant_id = $1", QIRFA_TENANT_ID
    )
    assert [r["channel"] for r in channels] == ["simulator"]
    assert one("select count(*) as n from jobs where tenant_id = $1")["n"] == 0
    emails = owner_sql(
        "select u.email from memberships m join users u on u.id = m.user_id "
        "where m.tenant_id = $1",
        QIRFA_TENANT_ID,
    )
    assert all(r["email"].endswith(".example") for r in emails)


def test_the_sample_names_are_invented():
    # A first name and an initial, or a made-up company: never a family name.
    for name, _ in PEOPLE:
        first, initial = name.split(" ")
        assert len(initial) == 2 and initial.endswith("."), name
    assert not any(name.startswith("Al ") or "Al-" in name for name, *_ in ACCOUNTS)
