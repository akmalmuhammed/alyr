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

An order paid in the meantime is not touched: its hold becomes a sale.
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


async def expire_due(conn: asyncpg.Connection, outbound: Outbound) -> list[UUID]:
    """Cancel every order in this shop whose hold has run out unpaid, and give its stock
    back. Safe to run any number of times, and from several workers at once. Returns the
    orders it cancelled."""
    orders = [
        r["order_id"] for r in await conn.fetch(
            "select distinct order_id from stock_holds "
            "where status = 'held' and expires_at <= now()"
        )
    ]
    cancelled = []
    minutes = await clock.hold_minutes(conn)
    for order_id in orders:
        # Claim the unpaid payment link first. If there is none, the order was paid (or
        # cancelled) a moment ago, and what it holds is a sale, not a hold.
        claimed = await conn.fetchval(
            "update payment_requests set status = 'expired' "
            "where order_id = $1 and status = 'pending' returning id",
            order_id,
        )
        if claimed is None:
            await stock_holds.commit(conn, order_id)
            continue
        result = await service.cancel_order(
            conn, order_id, outbound, team.ASSISTANT, restock=True,
            reason="Not paid in time", held_minutes=minutes,
        )
        if result and not result["already"]:
            cancelled.append(order_id)
    return cancelled


class HoldExpiry:
    """Job handler for `stock_hold_expiry`."""

    def __init__(self, db: Database, outbound: Outbound) -> None:
        self._db = db
        self._outbound = outbound

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        async with self._db.tenant(tenant_id) as conn:
            await expire_due(conn, self._outbound)


async def sweep_all(db: Database, outbound: Outbound) -> int:
    """Look at every shop for holds that have run out. The worker calls this when it
    starts and every few minutes, so a lost job or a long outage never leaves stock held.
    Returns how many orders it cancelled."""
    async with db.unscoped() as conn:
        shops = [r["id"] for r in await conn.fetch("select id from tenants")]
    total = 0
    for tenant_id in shops:
        async with db.tenant(tenant_id) as conn:
            due = await conn.fetchval(
                "select exists (select 1 from stock_holds "
                "where status = 'held' and expires_at <= now())"
            )
            if due:
                total += len(await expire_due(conn, outbound))
    return total
