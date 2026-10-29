"""The read-only actions: what an owner can ask about the shop (D-065, phase 1).

Each returns plain data, so the workspace and the chat cannot disagree. Nothing here
changes anything. An agent sees no money (D-035): the amounts are left out of what they
are given, not hidden afterwards, so no door can leak them.
"""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core.actions import ALL_ROLES, MONEY_ROLES, Caller, module_on, register
from alyr.modules.ledger import service as ledger_service

_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"
OPEN_ORDERS = ("new", "confirmed", "ready")
LATE = ("d61_90", "d90_plus")
LIST_LIMIT = 8
OWED_TOP = 5


async def _day(conn: asyncpg.Connection, now: datetime | None = None):
    """The shop's current day: when it began, when it ends, and its time zone. A bakery's
    day may start at 4 in the morning (`shop_settings.day_starts`), so at 2 am it is still
    yesterday."""
    tz = await conn.fetchval(f"select timezone from tenants where id = {_TENANT}")
    zone = ZoneInfo(tz or "Asia/Qatar")
    local = (now or datetime.now(UTC)).astimezone(zone)
    starts = await conn.fetchval("select day_starts from shop_settings") or time(0)
    start = datetime.combine(local.date(), starts, tzinfo=zone)
    if local < start:
        start -= timedelta(days=1)
    return start, start + timedelta(days=1), zone


def _clock(moment: datetime, zone: ZoneInfo) -> str:
    return moment.astimezone(zone).strftime("%H:%M")


@register("today", ALL_ROLES)
async def today(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """How the day is going: one small section for each module the shop has switched on."""
    start, end, zone = await _day(conn)
    sections: dict[str, dict] = {}

    if await module_on(conn, "orders"):
        made = await conn.fetchrow(
            "select count(*) filter (where status <> 'cancelled') as count, "
            "coalesce(sum(total) filter (where status <> 'cancelled'), 0)::bigint as value "
            "from orders where not is_test and created_at >= $1 and created_at < $2",
            start, end,
        )
        open_now = await conn.fetchrow(
            "select count(*) filter (where status in ('new', 'confirmed')) as waiting, "
            "count(*) filter (where status = 'ready') as ready from orders where not is_test"
        )
        sections["orders"] = {
            "count": made["count"],
            "value": made["value"] if caller.sees_money else None,
            "waiting": open_now["waiting"],
            "ready": open_now["ready"],
        }

    if await module_on(conn, "bookings"):
        counts = await conn.fetchrow(
            "select count(*) filter (where status in ('booked', 'completed')) as count, "
            "count(*) filter (where status = 'booked' and starts_at >= now()) as ahead, "
            "count(*) filter (where status = 'no_show') as no_shows "
            "from bookings where starts_at >= $1 and starts_at < $2",
            start, end,
        )
        following = await conn.fetchrow(
            "select b.starts_at, b.service_name, c.name from bookings b "
            "join contacts c on c.id = b.contact_id "
            "where b.status = 'booked' and b.starts_at >= now() and b.starts_at < $1 "
            "order by b.starts_at limit 1",
            end,
        )
        sections["bookings"] = {
            "count": counts["count"],
            "ahead": counts["ahead"],
            "no_shows": counts["no_shows"],
            "next": {
                "time": _clock(following["starts_at"], zone),
                "service": following["service_name"],
                "customer": following["name"],
            } if following else None,
        }

    if caller.sees_money and await module_on(conn, "ledger"):
        sections["ledger"] = {
            "collected": await conn.fetchval(
                "select coalesce(sum(amount), 0)::bigint from ledger_entries "
                "where kind = 'payment' and created_at >= $1 and created_at < $2",
                start, end,
            )
        }

    if await module_on(conn, "inbox"):
        sections["inbox"] = {
            "wrote": await conn.fetchval(
                "select count(distinct m.contact_id) from messages m "
                "join contacts c on c.id = m.contact_id "
                "where c.role = 'customer' and m.direction = 'in' "
                "and m.created_at >= $1 and m.created_at < $2",
                start, end,
            )
        }
    return {"date": start.date().isoformat(), "sections": sections}


@register("orders", ALL_ROLES, module="orders")
async def orders(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Orders still to be handled, newest first. The owner's test order (D-064) is never
    one of them, as it is in no report."""
    rows = await conn.fetch(
        "select o.number, o.status, o.payment, o.total, o.created_at, c.name "
        "from orders o join contacts c on c.id = o.contact_id "
        "where not o.is_test and o.status = any($1) order by o.created_at desc limit $2",
        list(OPEN_ORDERS), LIST_LIMIT,
    )
    open_total = await conn.fetchval(
        "select count(*) from orders where not is_test and status = any($1)", list(OPEN_ORDERS)
    )
    return {
        "open": open_total,
        "more": max(0, open_total - len(rows)),
        "items": [
            {
                "number": r["number"],
                "customer": r["name"],
                "status": r["status"],
                "payment": r["payment"],
                "total": r["total"] if caller.sees_money else None,
                "placed_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
    }


@register("bookings", ALL_ROLES, module="bookings")
async def bookings(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Today's bookings in time order."""
    start, end, zone = await _day(conn)
    rows = await conn.fetch(
        "select b.number, b.starts_at, b.service_name, b.status, c.name "
        "from bookings b join contacts c on c.id = b.contact_id "
        "where b.starts_at >= $1 and b.starts_at < $2 "
        "and b.status in ('booked', 'completed', 'no_show') order by b.starts_at",
        start, end,
    )
    return {
        "date": start.date().isoformat(),
        "items": [
            {
                "number": r["number"],
                "time": _clock(r["starts_at"], zone),
                "service": r["service_name"],
                "customer": r["name"],
                "status": r["status"],
            }
            for r in rows[:LIST_LIMIT * 2]
        ],
        "more": max(0, len(rows) - LIST_LIMIT * 2),
    }


@register("owed", MONEY_ROLES, module="ledger")
async def owed(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Who owes the shop, and how much of it is late. Owners and admins only."""
    summary = await ledger_service.summary(conn)
    owing = sorted(
        (c for c in summary["customers"] if c["balance"] > 0), key=lambda c: -c["balance"]
    )
    late = [c for c in owing if any(c["buckets"][b] for b in LATE)]
    late_ids = {c["id"] for c in late}
    return {
        "total": sum(c["balance"] for c in owing),
        "customers": len(owing),
        "late_total": sum(c["buckets"][b] for c in late for b in LATE),
        "late_customers": len(late),
        "top": [
            {"name": c["name"], "balance": c["balance"], "late": c["id"] in late_ids}
            for c in owing[:OWED_TOP]
        ],
    }
