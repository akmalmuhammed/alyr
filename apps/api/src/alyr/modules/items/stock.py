"""The stock log and the one step that changes a number.

Stock is a log, not a number somebody edits. Every change is a row in `stock_movements`
with who, when and why, and the number shown is their total. A change is made in one SQL
statement that moves the number only if it stays at zero or above and writes the log row
in the same breath, so two customers cannot buy the last item, and two staff changing the
same item at once both count: each statement adds to whatever the number is by then.

Two kinds of number:

* **count** variants have a running stock, `item_variants.on_hand`.
* **daily-limit** variants have an allowance per shop day. The day's allowance is the
  variant's `daily_limit` plus the total of that day's movements (`variant_day_stock`);
  a new day starts again from the limit without anything having to run.

Every function takes a tenant-scoped connection.
"""

from dataclasses import dataclass
from datetime import date
from uuid import UUID

import asyncpg

from alyr.core.team import Actor
from alyr.modules.items import events

KINDS = ("opening", "received", "sold", "cancelled_restocked", "wasted", "counted", "adjusted")
# What staff may record by hand. Sales and restocks come from orders.
BY_HAND = ("opening", "received", "wasted", "counted", "adjusted")

_COUNT_STEP = """
with moved as (
    update item_variants set on_hand = on_hand + $2::int
    where id = $1 and on_hand + $2::int >= 0
    returning id, on_hand
)
insert into stock_movements
    (variant_id, kind, delta, balance_after, reason, order_id, actor_id, actor_name, via)
select id, $3, $2::int, on_hand, $4, $5::uuid, $6::uuid, $7, $8 from moved
returning balance_after
"""

# A day's allowance has a row from its first use. Two statements, not one upsert, because
# whether a take fits depends on what the day already holds (a top-up, an earlier sale).
_DAY_ROW = """
insert into variant_day_stock (variant_id, day) values ($1, $2) on conflict do nothing
"""

# Only a take can overdraw the day; putting units back always fits, even if the limit was
# lowered below what the day has already sold.
_DAILY_STEP = """
with moved as (
    update variant_day_stock set delta = delta + $3::int
    where variant_id = $1 and day = $2::date
      and ($3::int >= 0 or $4::int + delta + $3::int >= 0)
    returning delta
)
insert into stock_movements
    (variant_id, kind, delta, balance_after, day, reason, order_id, actor_id, actor_name, via)
select $1::uuid, $5, $3::int, $4::int + moved.delta, $2::date, $6, $7::uuid, $8::uuid, $9, $10
from moved
returning balance_after
"""


class _Short(Exception):
    """Raised inside the savepoint of `reserve` to put a partly taken order back."""


class StockError(Exception):
    """A stock change that cannot be made. `code` is stable; the message is safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Take:
    """Units of one variant an order line needs. `day` and `limit` are set for a
    daily-limit variant: the shop day the units are counted against, and its limit."""

    variant_id: UUID
    quantity: int
    day: date | None = None
    limit: int | None = None


async def move(
    conn: asyncpg.Connection, variant_id: UUID, kind: str, delta: int, actor: Actor,
    reason: str = "", day: date | None = None, order_id: UUID | None = None,
    limit: int | None = None,
) -> int | None:
    """Change one variant's stock by `delta` and write the log row, in one statement.
    Returns the number after, or None when a take would overdraw it (nothing is written).
    Give `day` for a daily-limit variant, and its `limit` if you have it."""
    if kind not in KINDS:
        raise ValueError(f"unknown stock movement {kind!r}")
    if day is None:
        balance = await conn.fetchval(
            _COUNT_STEP, variant_id, delta, kind, reason, order_id, actor.id, actor.name,
            actor.via,
        )
    else:
        if limit is None:
            limit = await conn.fetchval(
                "select daily_limit from item_variants where id = $1", variant_id
            )
        await conn.execute(_DAY_ROW, variant_id, day)
        balance = await conn.fetchval(
            _DAILY_STEP, variant_id, day, delta, limit or 0, kind, reason, order_id, actor.id,
            actor.name, actor.via,
        )
    if balance is not None and delta:
        # Tell the parts of the Catalog that react to stock (back-in-stock requests, owner
        # alerts). They only queue a job; nothing is sent from here.
        await events.stock_changed(conn, variant_id, delta, balance)
    return balance


async def reserve(
    conn: asyncpg.Connection, takes: list[Take], order_id: UUID, actor: Actor
) -> list[dict]:
    """Take stock for an order's lines, all or nothing. Returns the lines that came up
    short as `{"variant_id", "wanted", "left"}` (and takes nothing at all), or an empty
    list when every line was taken. Lines are taken in a fixed order so two orders
    that want the same variants cannot wait on each other."""
    short: list[dict] = []
    try:
        async with conn.transaction():  # a savepoint: a shortfall puts everything back
            for take in sorted(takes, key=lambda t: (str(t.variant_id), t.day or date.min)):
                balance = await move(
                    conn, take.variant_id, "sold", -take.quantity, actor, "Order placed",
                    take.day, order_id, take.limit,
                )
                if balance is None:
                    short.append({"variant_id": take.variant_id, "wanted": take.quantity})
            if short:
                raise _Short
    except _Short:
        for line in short:
            line["left"] = await left(conn, line["variant_id"], _day_of(takes, line["variant_id"]))
        return short
    return []


def _day_of(takes: list[Take], variant_id: UUID) -> date | None:
    return next((t.day for t in takes if t.variant_id == variant_id), None)


async def left(conn: asyncpg.Connection, variant_id: UUID, day: date | None = None) -> int:
    """What can still be sold of a variant: the running stock, or the day's allowance."""
    if day is None:
        return await conn.fetchval("select on_hand from item_variants where id = $1", variant_id)
    return await conn.fetchval(
        "select greatest(coalesce(v.daily_limit, 0) + coalesce(d.delta, 0), 0) "
        "from item_variants v left join variant_day_stock d on d.variant_id = v.id and d.day = $2 "
        "where v.id = $1",
        variant_id, day,
    )


async def count(
    conn: asyncpg.Connection, variant_id: UUID, counted: int, actor: Actor, reason: str,
    day: date | None = None,
) -> dict:
    """The shelf was counted. The log gets the difference between what the system said
    and what was counted, with the reason, and the number becomes what was counted. A count
    that agrees with the system is recorded too, so the log shows when it was last checked."""
    if counted < 0:
        raise StockError("bad_quantity", "A count cannot be below zero.")
    locked = await conn.fetchrow(
        "select id, daily_limit from item_variants where id = $1 for no key update", variant_id
    )
    if locked is None:
        raise StockError("unknown_variant", "We could not find that item.")
    before = await left(conn, variant_id, day)
    difference = counted - before
    if difference and not reason.strip():
        raise StockError("reason_needed", "Say why the count differs from the system.")
    await move(
        conn, variant_id, "counted", difference, actor,
        reason.strip() or "Counted, no difference", day, limit=locked["daily_limit"],
    )
    return {"before": before, "counted": counted, "difference": difference}


async def total(conn: asyncpg.Connection, variant_id: UUID) -> int:
    """The running stock as the log adds it up."""
    return await conn.fetchval(
        "select coalesce(sum(delta), 0)::int from stock_movements "
        "where variant_id = $1 and day is null",
        variant_id,
    )


async def mismatches(conn: asyncpg.Connection) -> list[dict]:
    """Variants whose stored number differs from their log: should always be empty."""
    rows = await conn.fetch(
        "select v.id, v.on_hand, coalesce(m.total, 0)::int as logged from item_variants v "
        "left join (select variant_id, sum(delta) as total from stock_movements "
        "           where day is null group by variant_id) m on m.variant_id = v.id "
        "where v.on_hand <> coalesce(m.total, 0)"
    )
    days = await conn.fetch(
        "select d.variant_id as id, d.day, d.delta, coalesce(m.total, 0)::int as logged "
        "from variant_day_stock d "
        "left join (select variant_id, day, sum(delta) as total from stock_movements "
        "           where day is not null group by variant_id, day) m "
        "  on m.variant_id = d.variant_id and m.day = d.day "
        "where d.delta <> coalesce(m.total, 0)"
    )
    return [dict(r) for r in rows] + [dict(r) for r in days]


_LOG_COLUMNS = (
    "m.id, m.variant_id, v.name as variant, v.name_ar as variant_ar, v.item_id, "
    "i.name as item, i.name_ar as item_ar, m.kind, m.delta, m.balance_after, m.day, m.reason, "
    "m.order_id, o.number as order_number, m.actor_id, m.actor_name, m.via, m.created_at"
)
_LOG_FROM = (
    "from stock_movements m join item_variants v on v.id = m.variant_id "
    "join items i on i.id = v.item_id left join orders o on o.id = m.order_id "
)


def _shown(r: asyncpg.Record) -> dict:
    return {
        "id": str(r["id"]), "item_id": str(r["item_id"]), "item": r["item"],
        "item_ar": r["item_ar"], "variant_id": str(r["variant_id"]), "variant": r["variant"],
        "variant_ar": r["variant_ar"], "kind": r["kind"], "delta": r["delta"],
        "balance_after": r["balance_after"],
        "day": r["day"].isoformat() if r["day"] else None, "reason": r["reason"],
        "order_id": str(r["order_id"]) if r["order_id"] else None,
        "order_number": r["order_number"],
        "actor": {"id": str(r["actor_id"]) if r["actor_id"] else None, "name": r["actor_name"]},
        "via": r["via"],
        "created_at": r["created_at"].isoformat(),
    }


async def log(
    conn: asyncpg.Connection, item_id: UUID, variant_id: UUID | None = None, limit: int = 100
) -> list[dict]:
    """The log for one item, newest first."""
    rows = await conn.fetch(
        f"select {_LOG_COLUMNS} {_LOG_FROM}"
        "where v.item_id = $1 and ($2::uuid is null or m.variant_id = $2) "
        "order by m.created_at desc, m.id limit $3",
        item_id, variant_id, limit,
    )
    return [_shown(r) for r in rows]


async def recent(conn: asyncpg.Connection, limit: int = 100) -> list[dict]:
    """The latest movements across every item, newest first: the Stock tab's log."""
    rows = await conn.fetch(
        f"select {_LOG_COLUMNS} {_LOG_FROM}order by m.created_at desc, m.id limit $1", limit
    )
    return [_shown(r) for r in rows]
