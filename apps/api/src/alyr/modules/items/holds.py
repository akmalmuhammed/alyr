"""Stock taken for an order, from the moment it is placed until it is paid for, handed over
or given back.

A line that needs counted stock (the "count" and "daily_limit" rules) gets one hold when
its order is placed. A pay-link order is **held**: unpaid after the shop's hold time (30
minutes unless it changes), the order is cancelled and the stock returns (that is
`modules/orders/holds.py`, which owns orders). An order paid by link, or put on a credit
account, is **committed**. A cancelled order that had not been made returns its stock;
this module does the returning, the order says when.

Every function takes a tenant-scoped connection.
"""

from datetime import date, datetime
from uuid import UUID

import asyncpg

from alyr.core.team import Actor
from alyr.modules.items import stock


async def create(
    conn: asyncpg.Connection, order_id: UUID, order_item_id: UUID, variant_id: UUID,
    quantity: int, day: date | None, expires_at: datetime | None,
) -> None:
    """Record stock taken for one order line. With an `expires_at` it is held until then."""
    await conn.execute(
        "insert into stock_holds (order_id, order_item_id, variant_id, quantity, day, status, "
        "expires_at) values ($1, $2, $3, $4, $5, $6, $7)",
        order_id, order_item_id, variant_id, quantity, day,
        "held" if expires_at else "committed", expires_at,
    )


async def commit(conn: asyncpg.Connection, order_id: UUID) -> int:
    """The order was paid: its held stock is sold. Returns how many holds changed."""
    updated = await conn.execute(
        "update stock_holds set status = 'committed', expires_at = null "
        "where order_id = $1 and status = 'held'",
        order_id,
    )
    return int(updated.split()[-1])


async def release(conn: asyncpg.Connection, order_id: UUID, actor: Actor, reason: str) -> int:
    """Give an order's stock back, once. A hold already released is left alone, so a
    second call (a retried job, two people cancelling at once) returns nothing twice.
    Returns how many units went back."""
    holds = await conn.fetch(
        "update stock_holds set status = 'released', released_at = now(), released_reason = $2 "
        "where order_id = $1 and status in ('held', 'committed') "
        "returning variant_id, quantity, day",
        order_id, reason,
    )
    for hold in holds:
        await stock.move(
            conn, hold["variant_id"], "cancelled_restocked", hold["quantity"], actor, reason,
            hold["day"], order_id,
        )
    return sum(hold["quantity"] for hold in holds)


async def expiring(conn: asyncpg.Connection, order_id: UUID) -> datetime | None:
    """When an unpaid order's hold runs out, or None if nothing is held for it."""
    return await conn.fetchval(
        "select min(expires_at) from stock_holds where order_id = $1 and status = 'held'",
        order_id,
    )
