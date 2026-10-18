"""What happens after stock or an item's switch changes: the Catalog's two reactions.

* Stock came back (a delivery, a cancelled order, a switch turned on): if a customer asked
  to be told, a job sends them the one message (`watches.py`).
* Stock went down to the low-stock number or to nothing: a job tells the owner, once a day
  (`alerts.py`).

This module only decides whether a job is worth queueing and queues it, inside the
transaction that changed the stock, so the job exists if and only if the change does. It
reads and writes nothing else and imports nothing from the Catalog, so the stock log can
call it without a cycle.

Every function takes a tenant-scoped connection.
"""

from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.core import jobs

BACK_IN_STOCK = "catalog.back_in_stock"
STOCK_ALERT = "catalog.stock_alert"
PHOTO_DRAFT = "catalog.photo_draft"

DEFAULT_LOW_STOCK = 5
_COUNTED = ("count", "daily_limit")


async def queue(
    conn: asyncpg.Connection, kind: str, item_id: UUID, run_at: datetime | None = None
) -> None:
    """Queue one job for the item, unless one is already waiting: the job looks at the
    item as it is when it runs, so a second would find nothing new. `run_at` holds the job
    back (an alert that must wait for the morning)."""
    waiting = await conn.fetchval(
        "select true from jobs where kind = $1 and status = 'queued' "
        "and payload->>'item_id' = $2 limit 1",
        kind, str(item_id),
    )
    if not waiting:
        await jobs.enqueue(conn, kind, {"item_id": str(item_id)}, run_at)


async def _someone_waits(conn: asyncpg.Connection, item_id: UUID) -> bool:
    return bool(await conn.fetchval(
        "select true from stock_watches where item_id = $1 and status = 'waiting' limit 1",
        item_id,
    ))


async def item_changed(conn: asyncpg.Connection, item_id: UUID) -> None:
    """An item was edited or its switch flipped: it may be on sale again."""
    if await _someone_waits(conn, item_id):
        await queue(conn, BACK_IN_STOCK, item_id)


async def stock_changed(
    conn: asyncpg.Connection, variant_id: UUID, delta: int, balance: int
) -> None:
    """One variant's stock moved by `delta` and is now `balance` (the running stock, or
    what is left of the day's allowance)."""
    row = await conn.fetchrow(
        "select i.id, i.stock_rule, i.status, i.low_stock_at, "
        "       (select low_stock_at from shop_settings) as shop_low "
        "from item_variants v join items i on i.id = v.item_id where v.id = $1",
        variant_id,
    )
    if row is None:
        return
    if delta > 0:
        if await _someone_waits(conn, row["id"]):
            await queue(conn, BACK_IN_STOCK, row["id"])
        return
    if row["stock_rule"] not in _COUNTED or row["status"] != "live":
        return
    own, shop = row["low_stock_at"], row["shop_low"]
    threshold = own if own is not None else (DEFAULT_LOW_STOCK if shop is None else shop)
    if balance <= threshold:
        await queue(conn, STOCK_ALERT, row["id"])
