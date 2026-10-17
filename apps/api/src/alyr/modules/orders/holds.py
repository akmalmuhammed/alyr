"""Giving back the stock of orders nobody paid for.

A pay-link order that takes counted stock holds it for the shop's hold time (30 minutes
unless the shop changes it). When the time runs out the order is cancelled, its stock goes
back on the shelf and the customer is told. Three things make sure it happens even if the
worker was off for hours:

* every such order queues a job for the moment its hold ends; a worker that was down
  finds it already due when it starts, and the job queue runs everything that is due;
* the job does not just release its own order: it releases every hold in the shop that has
  run out, so one job that runs late catches the others up;
* the worker also sweeps every shop when it starts and every few minutes after, which
  covers a job that was lost.

An order paid in the meantime is not touched: its hold becomes a sale. So is an order
staff have taken on (confirmed, ready or done) without waiting for the link to be paid,
for instance because the customer paid at the counter. Each order is released in its own
transaction, so one that fails does not hold up the rest.
"""

import logging
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.items import clock
from alyr.modules.items import holds as stock_holds
from alyr.modules.orders import service

log = logging.getLogger("alyr.orders")


async def due_orders(conn: asyncpg.Connection) -> list[UUID]:
    """The orders in this shop whose hold has run out and is still unresolved."""
    rows = await conn.fetch(
        "select distinct order_id from stock_holds "
        "where status = 'held' and expires_at <= now() order by order_id"
    )
    return [r["order_id"] for r in rows]


async def expire_order(
    conn: asyncpg.Connection, outbound: Outbound, order_id: UUID, minutes: int
) -> bool:
    """Resolve one order whose hold ran out. Returns True if it was cancelled.

    Only a new order whose payment link is still unpaid is cancelled. The link is claimed
    first, in the order a payment arriving takes its locks, so the two cannot wait on each
    other. If there is nothing to claim, the order was paid, cancelled, or taken on by
    staff a moment ago, and what it holds is a sale, not a hold."""
    claimed = await conn.fetchval(
        "update payment_requests p set status = 'expired' from orders o "
        "where p.order_id = $1 and p.status = 'pending' and o.id = p.order_id "
        "and o.status = 'new' returning p.id",
        order_id,
    )
    if claimed is None:
        await stock_holds.commit(conn, order_id)
        return False
    result = await service.cancel_order(
        conn, order_id, outbound, team.ASSISTANT, restock=True,
        reason="Not paid in time", held_minutes=minutes,
    )
    return bool(result and not result["already"])


async def expire_shop(db: Database, outbound: Outbound, tenant_id: UUID) -> int:
    """Release every hold in one shop that has run out. Safe to run any number of times,
    and from several workers at once. Returns how many orders it cancelled."""
    async with db.tenant(tenant_id) as conn:
        orders = await due_orders(conn)
        minutes = await clock.hold_minutes(conn)
    cancelled = 0
    for order_id in orders:
        try:
            async with db.tenant(tenant_id) as conn:
                cancelled += await expire_order(conn, outbound, order_id, minutes)
        except Exception:  # noqa: BLE001 - the next order, and the next sweep, still go on
            log.exception("could not release the hold of order %s", order_id)
    return cancelled


class HoldExpiry:
    """Job handler for `stock_hold_expiry`."""

    def __init__(self, db: Database, outbound: Outbound) -> None:
        self._db = db
        self._outbound = outbound

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        await expire_shop(self._db, self._outbound, tenant_id)


async def sweep_all(db: Database, outbound: Outbound) -> int:
    """Look at every shop for holds that have run out. The worker calls this when it
    starts and every few minutes, so a lost job or a long outage never leaves stock held.
    Returns how many orders it cancelled."""
    async with db.unscoped() as conn:
        shops = [r["id"] for r in await conn.fetch("select id from tenants")]
    total = 0
    for tenant_id in shops:
        try:
            total += await expire_shop(db, outbound, tenant_id)
        except Exception:  # noqa: BLE001 - one shop must not stop the sweep of the others
            log.exception("could not sweep the holds of shop %s", tenant_id)
    return total
