"""How long each item was sold out in a stretch of time (D-039, ALY-109, spec 007).

The weekly report says which items sold out and for how long. Nothing records "sold out"
as an event, because an item sells out in three different ways and one of them (a new day
for a daily limit) happens with no event at all. So this module works the answer out from
the two logs that are never edited, as the stock log and the activity record stood:

* **switched off.** The activity record has a `switched_off` and a `switched_on` row for every
  flip of an item's switch. The state at the start of the stretch is the opposite of the first
  flip in it, or the item's switch now when there was none.
* **counted stock** (rule `count`). Each stock movement carries the number left after it
  (`balance_after`). The number at the start is what is on hand now less every movement since.
  The item is out when every size that can be sold has none.
* **a daily limit** (rule `daily_limit`). Each movement of a day carries what is left of the
  day's allowance. A shop day starts with every size at its limit and the item is out from the
  movement that leaves no size anything until the day ends, or until a later movement puts
  some back.

An item is sold out while it is switched off *or* out of stock, as the Catalog list counts it
(`listing.is_sold_out`). Only items on sale now are considered, only the time since they went
live counts (a draft with no stock is not "sold out"), and a total under an hour is left out:
it is a count being corrected, not a sell-out the owner should hear about.

Every function takes a tenant-scoped connection.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.modules.items.clock import ShopClock

MIN_MINUTES = 60


@dataclass(frozen=True)
class Spell:
    """One item's time sold out in the stretch: the total, and whether it still is."""

    item_id: UUID
    name: str
    name_ar: str
    minutes: int
    still: bool


def day_of(clock: ShopClock, moment: datetime) -> date:
    """The shop day a moment belongs to: the calendar day, moved back until the shop's day
    begins (at 4 am, 2 am on Tuesday still belongs to Monday)."""
    started = timedelta(hours=clock.day_starts.hour, minutes=clock.day_starts.minute)
    return (moment.astimezone(clock.tz) - started).date()


def day_start(clock: ShopClock, day: date) -> datetime:
    return datetime.combine(day, clock.day_starts, clock.tz)


async def sold_out(
    conn: asyncpg.Connection, clock: ShopClock, start: datetime, end: datetime
) -> list[Spell]:
    """The items on sale now that were sold out for an hour or more between `start` and `end`
    (or now, if `end` has not come), the longest first. `clock.now` is the shop's now."""
    until = min(end, clock.now)
    if until <= start:
        return []
    first_day = day_of(clock, start)
    last_day = day_of(clock, until - timedelta(microseconds=1))
    base = day_start(clock, first_day)  # where every timeline starts; never after `start`

    items = await conn.fetch(
        "select id, name, name_ar, stock_rule, available, created_at from items "
        "where status = 'live' and stock_rule <> 'always' and created_at < $1",
        until,
    )
    if not items:
        return []
    ids = [r["id"] for r in items]
    variants: dict[UUID, list[asyncpg.Record]] = {}
    for v in await conn.fetch(
        "select id, item_id, on_hand, daily_limit from item_variants "
        "where item_id = any($1) and active",
        ids,
    ):
        variants.setdefault(v["item_id"], []).append(v)
    flips: dict[UUID, list[asyncpg.Record]] = {}
    for f in await conn.fetch(
        "select subject_id, action, created_at from activity "
        "where subject = 'item' and subject_id = any($1) "
        "and action in ('switched_on', 'switched_off') and created_at >= $2 "
        "order by created_at, id",
        ids, base,
    ):
        flips.setdefault(f["subject_id"], []).append(f)
    went_live = {
        r["subject_id"]: r["at"]
        for r in await conn.fetch(
            "select subject_id, max(created_at) as at from activity "
            "where subject = 'item' and subject_id = any($1) and action = 'updated' "
            "and detail->>'to' = 'live' and created_at >= $2 and created_at < $3 group by 1",
            ids, start, until,
        )
    }
    counted: dict[UUID, list[asyncpg.Record]] = {}
    daily: dict[UUID, list[asyncpg.Record]] = {}
    for m in await conn.fetch(
        "select v.item_id, m.variant_id, m.delta, m.balance_after, m.day, m.created_at "
        "from stock_movements m join item_variants v on v.id = m.variant_id "
        "where v.item_id = any($1) and v.active and "
        "((m.day is null and m.created_at >= $2) or (m.day >= $3 and m.day <= $4)) "
        "order by m.created_at, m.id",
        ids, base, first_day, last_day,
    ):
        (counted if m["day"] is None else daily).setdefault(m["item_id"], []).append(m)

    found = []
    for item in items:
        mine = variants.get(item["id"], [])
        live_from = max(start, item["created_at"], went_live.get(item["id"], start))
        # Each timeline is a list of (moment, value): the item is off, or has none left.
        off_now, points = not item["available"], []
        flipped = flips.get(item["id"], [])
        if flipped:
            off_now = flipped[0]["action"] == "switched_on"  # it was off until that flip
        points += [(f["created_at"], "off", f["action"] == "switched_off")
                   for f in flipped if f["created_at"] < until]
        empty_now = False
        if item["stock_rule"] == "count":
            moves = counted.get(item["id"], [])
            left = {v["id"]: v["on_hand"] - sum(m["delta"] for m in moves
                                                if m["variant_id"] == v["id"]) for v in mine}
            empty_now = sum(left.values()) == 0
            for m in moves:
                if m["created_at"] >= until:
                    continue
                left[m["variant_id"]] = m["balance_after"]
                points.append((m["created_at"], "empty", sum(left.values()) == 0))
        elif item["stock_rule"] == "daily_limit":
            points += _daily_points(clock, mine, daily.get(item["id"], []), first_day, last_day,
                                    until)
        minutes, still = _sweep(base, until, live_from, off_now, empty_now, points)
        if minutes >= MIN_MINUTES:
            found.append(Spell(item["id"], item["name"], item["name_ar"], minutes, still))
    return sorted(found, key=lambda s: (-s.minutes, s.name))


def _daily_points(clock, mine, moves, first_day: date, last_day: date, until: datetime) -> list:
    """For a daily-limit item: at the start of each shop day every size is at its limit, and
    each movement leaves what the day has left of it."""
    points = []
    limits = {v["id"]: v["daily_limit"] or 0 for v in mine}
    for n in range((last_day - first_day).days + 1):
        day = first_day + timedelta(days=n)
        left = dict(limits)
        points.append((day_start(clock, day), "empty", sum(left.values()) == 0))
        for m in moves:
            if m["day"] != day or m["created_at"] >= until:
                continue
            left[m["variant_id"]] = max(m["balance_after"], 0)
            points.append((m["created_at"], "empty", sum(left.values()) == 0))
    return points


def _sweep(base, until, live_from, off, empty, points) -> tuple[int, bool]:
    """Add up the time inside [live_from, until) that the item was off or empty."""
    total = timedelta()
    cursor = base
    for moment, kind, value in sorted(points, key=lambda p: p[0]):
        moment = min(moment, until)
        if off or empty:
            total += max(min(moment, until) - max(cursor, live_from), timedelta())
        cursor = max(cursor, moment)
        if kind == "off":
            off = value
        else:
            empty = value
    if off or empty:
        total += max(until - max(cursor, live_from), timedelta())
    return round(total.total_seconds() / 60), bool(off or empty)
