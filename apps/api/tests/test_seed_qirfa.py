"""The sample bakery for screenshots (ALY-99): it can be made again and again, it has the
activity the ALYR Agent dashboard needs, and nothing in it can reach a phone."""

import asyncio
import re
from datetime import UTC, datetime

from alyr.core import links
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


def test_a_cancelled_account_order_has_its_sale_and_its_reversal(monkeypatch):
    monkeypatch.setattr("alyr.seed_qirfa.CANCEL_ACCOUNT_EVERY", 19)
    # ALY-110: the sample bakery cancels credit orders the way `cancel_order` does, so the
    # customer does not seem to owe what was cancelled.
    make_bakery()
    cancelled = owner_sql(
        "select o.id, o.total from orders o where o.tenant_id = $1 and o.status = 'cancelled' "
        "and o.payment = 'on_account'",
        QIRFA_TENANT_ID,
    )
    assert len(cancelled) >= 2, "the sample should hold cancelled credit orders"
    for o in cancelled:
        kinds = {
            r["kind"]: r["amount"]
            for r in owner_sql(
                "select kind, amount from ledger_entries where tenant_id = $1 and order_id = $2",
                QIRFA_TENANT_ID, o["id"],
            )
        }
        assert kinds == {"sale": o["total"], "reversal": o["total"]}
    # Nobody owes for an order that was cancelled: no sale without a reversal.
    assert one(
        "select count(*) as n from ledger_entries s join orders o on o.id = s.order_id "
        "where s.tenant_id = $1 and s.kind = 'sale' and o.status = 'cancelled' and not exists "
        "(select 1 from ledger_entries r where r.order_id = s.order_id and r.kind = 'reversal')"
    )["n"] == 0


def test_the_demo_reset_repairs_a_sale_cancelled_before_the_fix_and_only_once(monkeypatch):
    monkeypatch.setattr("alyr.seed_qirfa.CANCEL_ACCOUNT_EVERY", 19)
    from alyr.seed_catalog_demos import repair_cancelled_account_orders

    make_bakery()
    owner_sql(
        "delete from ledger_entries where tenant_id = $1 and kind = 'reversal' "
        "and order_id in (select id from orders where tenant_id = $1 and status = 'cancelled' "
        "and payment = 'on_account' limit 2) returning id",
        QIRFA_TENANT_ID,
    )
    stale = one(
        "select count(*) as n from orders o where o.tenant_id = $1 and o.status = 'cancelled' "
        "and o.payment = 'on_account' and not exists (select 1 from ledger_entries r "
        "where r.order_id = o.id and r.kind = 'reversal')"
    )["n"]
    assert stale == 2

    async def repair() -> int:
        db = Database(OWNER_DSN)
        await db.connect()
        try:
            return await repair_cancelled_account_orders(db, tenant_ids=(QIRFA_TENANT_ID,))
        finally:
            await db.close()

    assert asyncio.run(repair()) == 2
    assert asyncio.run(repair()) == 0

def test_the_links_in_the_sample_chats_are_signed_never_a_bare_contact_id():
    """ALY-133: the order and booking links the bakery's customers were sent carry a token made
    for that page, as the chat's own links do."""
    make_bakery()
    rows = owner_sql(
        "select body from messages where tenant_id = $1 "
        "and (body like '%/b/%' or body like '%/s/%')",
        QIRFA_TENANT_ID,
    )
    booking = [r["body"] for r in rows if "/b/" in r["body"]]
    ordering = [r["body"] for r in rows if "/s/" in r["body"]]
    assert len(booking) > 10 and len(ordering) > 10
    for bodies, purpose in ((booking, links.BOOKING), (ordering, links.ORDER)):
        for body in bodies:
            assert "?c=" not in body and "?t=" in body
            token = re.search(r"\?t=(\S+)", body).group(1)
            assert links.read(token, QIRFA_TENANT_ID, purpose=purpose).contact_id
