"""The read-only actions: what an owner can ask about the shop (D-065, phase 1).

Each returns plain data, so the workspace and the chat cannot disagree. Nothing here
changes anything. An agent sees no money (D-035): the amounts are left out of what they
are given, not hidden afterwards, so no door can leak them.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core.actions import ALL_ROLES, MONEY_ROLES, ActionError, Caller, module_on, register
from alyr.modules.ledger import service as ledger_service

_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"
OPEN_ORDERS = ("new", "confirmed", "ready")
LATE = ("d61_90", "d90_plus")
LIST_LIMIT = 8
OWED_TOP = 5
# What a caller that asks for more (the connector's apps) may be given in one answer.
MAX_LIST = 25
MAX_DAYS = 14


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


def _date(text) -> date:
    try:
        return date.fromisoformat(str(text))
    except ValueError:
        raise ActionError("A date is written like 2026-11-09 (year, month, day).") from None


async def _day_of(conn: asyncpg.Connection, when: str, on=None):
    """The start and end of the shop's `today`, `yesterday` or a given `date`, by the same day
    rule as `_day` (a shop's day may start before midnight's end)."""
    start, end, zone = await _day(conn)
    if when == "yesterday":
        return start - timedelta(days=1), start, zone
    if when == "date":
        if on is None:
            raise ActionError("Give the date as well, like 2026-11-09.")
        day = _date(on)
        starts = await conn.fetchval("select day_starts from shop_settings") or time(0)
        first = datetime.combine(day, starts, tzinfo=zone)
        return first, first + timedelta(days=1), zone
    return start, end, zone


def _limit(args: dict, default: int = LIST_LIMIT) -> int:
    asked = args.get("limit")
    if asked is None:
        return default
    try:
        return max(1, min(int(asked), MAX_LIST))
    except (TypeError, ValueError):
        return default


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
            "select b.starts_at, b.service_name, c.name, c.phone from bookings b "
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
                "phone": following["phone"],
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


async def _lines(conn: asyncpg.Connection, order_ids: list) -> dict:
    """What each order holds, as short lines: "2 x Pancake"."""
    lines: dict = {}
    for r in await conn.fetch(
        "select order_id, name, quantity from order_items where order_id = any($1) "
        "order by created_at, id", order_ids,
    ):
        lines.setdefault(r["order_id"], []).append(f"{r['quantity']} x {r['name']}")
    return lines


@register("orders", ALL_ROLES, module="orders")
async def orders(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Orders still to be handled, newest first. The owner's test order (D-064) is never
    one of them, as it is in no report.

    `when` asks for another view: `today`, `yesterday` or `date` (with `date`), every order of
    that day with its count and (for those who may see money) its value, a cancelled order
    counted on its own and never in the value, as the dashboard counts them. `limit` shows
    fewer or more rows (the chat shows 8; no answer holds more than 25)."""
    when = args.get("when") or "open"
    limit = _limit(args)
    zone = (await _day(conn))[2]
    if when == "open":
        rows = await conn.fetch(
            "select o.id, o.number, o.status, o.payment, o.total, o.created_at, c.name, c.phone "
            "from orders o join contacts c on c.id = o.contact_id "
            "where not o.is_test and o.status = any($1) order by o.created_at desc limit $2",
            list(OPEN_ORDERS), limit,
        )
        open_total = await conn.fetchval(
            "select count(*) from orders where not is_test and status = any($1)",
            list(OPEN_ORDERS),
        )
        summary = {"open": open_total, "more": max(0, open_total - len(rows))}
    elif when in ("today", "yesterday", "date"):
        start, end, _ = await _day_of(conn, when, args.get("date"))
        rows = await conn.fetch(
            "select o.id, o.number, o.status, o.payment, o.total, o.created_at, c.name, c.phone "
            "from orders o join contacts c on c.id = o.contact_id "
            "where not o.is_test and o.created_at >= $1 and o.created_at < $2 "
            "order by o.created_at desc limit $3",
            start, end, limit,
        )
        day = await conn.fetchrow(
            "select count(*) filter (where status <> 'cancelled') as count, "
            "coalesce(sum(total) filter (where status <> 'cancelled'), 0)::bigint as value, "
            "count(*) filter (where status = 'cancelled') as cancelled "
            "from orders where not is_test and created_at >= $1 and created_at < $2",
            start, end,
        )
        summary = {
            "date": start.date().isoformat(), "count": day["count"],
            "value": day["value"] if caller.sees_money else None,
            "cancelled": day["cancelled"],
            "more": max(0, day["count"] + day["cancelled"] - len(rows)),
        }
    else:
        raise ActionError("Choose open, today, yesterday or a date.")
    lines = await _lines(conn, [r["id"] for r in rows])
    return summary | {
        "items": [
            {
                "number": r["number"],
                "customer": r["name"],
                "phone": r["phone"],
                "status": r["status"],
                "payment": r["payment"],
                "total": r["total"] if caller.sees_money else None,
                "placed_at": r["created_at"].astimezone(zone).isoformat(timespec="minutes"),
                "lines": lines.get(r["id"], []),
            }
            for r in rows
        ],
    }


@register("bookings", ALL_ROLES, module="bookings")
async def bookings(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Today's bookings in time order. `date` asks for another day and `days` for that many days
    from it (at most 14), each booking with its day and time in the shop's own zone."""
    start, end, zone = await _day(conn)
    days = 1
    if args.get("date"):
        start, _, zone = await _day_of(conn, "date", args["date"])
    if args.get("days") is not None:
        try:
            days = max(1, min(int(args["days"]), MAX_DAYS))
        except (TypeError, ValueError):
            raise ActionError("days is a number from 1 to 14.") from None
    end = start + timedelta(days=days)
    rows = await conn.fetch(
        "select b.number, b.starts_at, b.service_name, b.status, c.name, c.phone "
        "from bookings b join contacts c on c.id = b.contact_id "
        "where b.starts_at >= $1 and b.starts_at < $2 "
        "and b.status in ('booked', 'completed', 'no_show') order by b.starts_at",
        start, end,
    )
    shown = LIST_LIMIT * 2 if days == 1 else MAX_LIST * 2
    return {
        "date": start.date().isoformat(),
        "to": (end - timedelta(days=1)).date().isoformat(),
        "items": [
            {
                "number": r["number"],
                "date": r["starts_at"].astimezone(zone).date().isoformat(),
                "time": _clock(r["starts_at"], zone),
                "service": r["service_name"],
                "customer": r["name"],
                "phone": r["phone"],
                "status": r["status"],
            }
            for r in rows[:shown]
        ],
        "more": max(0, len(rows) - shown),
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
            {"name": c["name"], "phone": c["phone"], "balance": c["balance"],
             "late": c["id"] in late_ids}
            for c in owing[:OWED_TOP]
        ],
    }
