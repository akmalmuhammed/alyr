"""What can be bought now, at what price, and how many are left.

Plain functions over rows already read from the database, so every rule can be tried with
a clock held still. An item is for sale when it is live, its switch is on (for every rule
but "always"), its schedule allows an order now, and there is stock left.
"""

from dataclasses import dataclass, replace
from datetime import date, datetime

from alyr.modules.items import schedule
from alyr.modules.items.clock import ShopClock

RULES = ("always", "switch", "count", "daily_limit")
STOCKED = ("count", "daily_limit")


@dataclass(frozen=True)
class State:
    """Whether an item can be ordered. `reason` is empty when it can; otherwise `hidden`
    (not live), `off` (switched off), `sold_out`, or the schedule's own reason:
    `not_now`, `closed`, `after_cutoff`, `not_that_day`, `past`. `left` is None when
    nothing limits the number."""

    orderable: bool
    reason: str = ""
    left: int | None = None
    day: date | None = None
    next_at: datetime | None = None
    next_date: date | None = None
    for_date: date | None = None
    dated: bool = False


def sale_active(item, now: datetime) -> bool:
    if item["sale_price"] is None:
        return False
    starts, ends = item["sale_starts_at"], item["sale_ends_at"]
    return (starts is None or now >= starts) and (ends is None or now < ends)


def item_price(item, now: datetime) -> int:
    """What the item costs now: its sale price while a sale is on."""
    return item["sale_price"] if sale_active(item, now) else item["price"]


def variant_price(item, variant, now: datetime) -> int:
    return item_price(item, now) + variant["price_delta"]


def variant_left(item, variant, deltas: dict, day: date) -> int | None:
    """How many of one variant can still be sold; None when the rule does not count."""
    rule = item["stock_rule"]
    if rule == "count":
        return variant["on_hand"]
    if rule == "daily_limit":
        return max((variant["daily_limit"] or 0) + deltas.get((variant["id"], day), 0), 0)
    return None


def windows_of(rows) -> list[schedule.Window]:
    return [
        schedule.Window(
            frozenset(r["weekdays"]), r["opens"], r["closes"], r["lead_days"], r["cutoff"],
            r["valid_from"], r["valid_to"], r["closed"],
        )
        for r in rows
    ]


def first_day_with_room(
    windows: list[schedule.Window], clock: ShopClock, start: date, room
) -> date | None:
    """Starting at `start`, the first date an order can be for on which `room(day)` is true
    (a made-to-order item with a daily limit, whose first day may be taken)."""
    day: date | None = start
    for _ in range(schedule.LOOK_AHEAD_DAYS):
        if day is None or room(day):
            return day
        day = schedule.next_date(windows, clock.local, day)
    return None


def evaluate(
    item, variants, windows: list[schedule.Window], deltas: dict, clock: ShopClock,
    for_date: date | None = None,
) -> State:
    """Can this item be ordered now? For an item ordered for a date, `for_date` is the day
    the customer chose (leave it out to look at the earliest)."""
    if item["status"] != "live":
        return State(False, "hidden")
    rule = item["stock_rule"]
    if rule != "always" and not item["available"]:
        return State(False, "off")
    verdict = schedule.evaluate(windows, clock.local, for_date)
    if verdict.dated and verdict.ok and for_date is None and rule == "daily_limit":
        # No day was chosen: offer the first day that still has some left, not just the
        # first day the schedule allows.
        def room(day: date) -> bool:
            return any(
                variant_left(item, v, deltas, day) for v in variants if v["active"]
            )

        found = first_day_with_room(windows, clock, verdict.for_date, room)
        if found is not None:
            verdict = replace(verdict, for_date=found, next_date=found)
    # A made-to-order item is limited per day it is made for; the rest per shop day.
    day = (verdict.for_date or verdict.next_date or clock.shop_day) if verdict.dated else (
        clock.shop_day
    )
    left = None
    if rule in STOCKED:
        lefts = [variant_left(item, v, deltas, day) for v in variants if v["active"]]
        left = sum(n for n in lefts if n is not None)
    details = {
        "left": left, "day": day, "next_at": verdict.next_at, "next_date": verdict.next_date,
        "for_date": verdict.for_date, "dated": verdict.dated,
    }
    if not verdict.ok:
        return State(False, verdict.code, **details)
    if left == 0:
        return State(False, "sold_out", **details)
    return State(True, **details)
