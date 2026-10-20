"""Customers who asked for something that was sold out (D-039, ALY-109, spec 007).

When a customer tries to order an item that cannot be ordered because it ran out or was
switched off, the shop has lost a sale it could have made, and the weekly report says how
many customers it happened to (`items/report.py`). This module is the record behind that
line: one row in `sold_out_asks` for each customer, item and day, however often they tried.

It records, and never decides. A cart check or an order refused for a sold-out line writes a
row (`from_checked`, `from_lines`), and so does the chat when it shows a customer an item that
is sold out (`record`). It runs only for a shop whose `catalog` module is on, writes nothing
for anyone who is not a customer (staff trying the order page are not demand), and a failure
here must never change what the customer is told: the callers that cannot afford one catch it.

Every function takes a tenant-scoped connection.
"""

import logging
from collections.abc import Iterable
from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.db import Database
from alyr.modules.items import clock as shop_clock

log = logging.getLogger("alyr.catalog.demand")

VIA = ("order_page", "whatsapp")


async def catalog_on(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval(
        "select true from tenant_modules where module_key = 'catalog' and enabled"
    ))


async def record(
    conn: asyncpg.Connection, contact_id: UUID, item_ids: Iterable[UUID], via: str,
    now: datetime | None = None,
) -> int:
    """Note that this customer asked for these items today and could not have them. Items
    that are not on sale (drafts, hidden, archived) and contacts that are not customers are
    left out; a customer who has already asked for an item today is not counted twice.
    Returns how many rows were added."""
    if via not in VIA:
        raise ValueError(f"unknown way of asking {via!r}")
    wanted = list(dict.fromkeys(item_ids))
    if not wanted or not await catalog_on(conn):
        return 0
    clock = await shop_clock.load(conn, now)
    added = await conn.fetch(
        "insert into sold_out_asks (contact_id, item_id, day, via, created_at) "
        "select c.id, i.id, $3, $4, $5 from contacts c, items i "
        "where c.id = $1 and c.role = 'customer' and i.id = any($2) and i.status = 'live' "
        "on conflict do nothing returning item_id",
        contact_id, wanted, clock.today, via, clock.now,
    )
    return len(added)


def from_checked(checked) -> list[UUID]:
    """The items a checked cart (`cart.check`) could not give: a line refused because the
    item or the size is sold out, or because its switch is off. A line refused for any other
    reason (a price that moved, a missing choice, a schedule) is not a sold-out ask."""
    return [
        c.line.item_id for c in checked
        if not c.ok and c.entry is not None and _sold_out(c.code, c.entry.item["status"])
    ]


def from_lines(lines: list[dict] | None) -> list[UUID]:
    """The same, from the answer a refused order carries (`OrderError.lines`): the ids and
    codes of each line. A line for an item that is not on sale is dropped by `record`."""
    return [
        UUID(line["item_id"]) for line in lines or []
        if not line.get("ok", True) and _sold_out(line.get("code", ""), "live")
    ]


def _sold_out(code: str, status: str) -> bool:
    # `unavailable` is both a hidden item and one switched off; only the second is a sold-out
    # item, and only a live item can have its switch off.
    return code == "sold_out" or (code == "unavailable" and status == "live")


async def note_refusal(
    db: Database, tenant_id: UUID, contact_id: UUID, lines: list[dict] | None
) -> None:
    """A refused order is rolled back, and so would be a row written in its transaction. Write
    the asks in a transaction of their own, after the refusal. Best effort: whatever goes wrong
    here is logged and never reaches the customer, who is told why the order was refused."""
    wanted = from_lines(lines)
    if not wanted:
        return
    try:
        async with db.tenant(tenant_id) as conn:
            await record(conn, contact_id, wanted, "order_page")
    except Exception:  # noqa: BLE001 - a lost note must not change the answer
        log.warning("could not note a sold-out ask", exc_info=True)
