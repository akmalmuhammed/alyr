"""The hourly sweep of Discovery (spec 066, D-166): one loop in the worker, for each shop that has
`discovery` on, each shop in its own tenant transaction, as background work (customers' jobs first,
D-078).

It expires proposals past their 14 days, puts approved proposals that were never started or were
lost back on the queue, starts a scheduled check-up when the shop switched that on and one is due,
and asks the people who should be asked. It does nothing for a shop with the module off. It sends
nothing itself: asking is `asks.send_due`, handed in by the worker (`send_asks`), which goes through
the outbound layer.
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, time, timedelta
from uuid import UUID

import asyncpg

from alyr.core.actions import module_on
from alyr.db import Database
from alyr.modules.discovery import KEY, apply, engine, proposals
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.items import clock as shop_clock

log = logging.getLogger("alyr.discovery")

SendAsks = Callable[[asyncpg.Connection, datetime], Awaitable[int]]
# A scheduled check-up starts at the first sweep after this time on the shop's clock.
SCHEDULED_AFTER = time(6, 0)
SCHEDULE_EVERY = timedelta(days=7)


async def schedule_if_due(conn: asyncpg.Connection, now: datetime) -> bool:
    """Start a check-up (trigger `schedule`) when the shop switched the weekly one on, a
    connection is on, none is queued or running, and the last finished one is over a week old. Off
    by default. It uses `engine.start_run`, so it is one at a time and inside the same budgets."""
    if not await conn.fetchval("select weekly_run from discovery_settings"):
        return False
    local = (await shop_clock.load(conn, now)).local
    if local.time() < SCHEDULED_AFTER:
        return False
    last = await conn.fetchval("select max(finished_at) from discovery_runs where status = 'done'")
    if last is not None and now - last <= SCHEDULE_EVERY:
        return False
    try:
        _, made = await engine.start_run(conn, None, "schedule")
    except DiscoveryError:
        return False  # no connection, or no places: nothing to run
    return made


async def sweep_shop(
    db: Database, tenant_id: UUID, send_asks: SendAsks | None = None, now: datetime | None = None
) -> dict:
    now = now or datetime.now(UTC)
    done = {"expired": 0, "requeued": 0, "scheduled": False, "asked": 0}
    async with db.tenant(tenant_id) as conn:
        if not await module_on(conn, KEY):
            return done
        done["expired"] = await proposals.expire_due(conn, now)
        done["requeued"] = await apply.requeue_lost(conn, now)
        done["scheduled"] = await schedule_if_due(conn, now)
    if send_asks is not None:
        # In a transaction of its own: a failure in asking never undoes the housekeeping above.
        async with db.tenant(tenant_id) as conn:
            done["asked"] = await send_asks(conn, now)
    return done


async def sweep_all(
    db: Database, send_asks: SendAsks | None = None, now: datetime | None = None
) -> dict:
    """Every shop with Discovery on, one transaction each; one failing never stops the others."""
    async with db.unscoped() as conn:
        shops = [r["id"] for r in await conn.fetch("select id from tenants")]
    total = {"expired": 0, "requeued": 0, "scheduled": 0, "asked": 0}
    for tenant_id in shops:
        try:
            result = await sweep_shop(db, tenant_id, send_asks, now)
        except Exception:  # noqa: BLE001 - one shop must not stop the sweep of the others
            log.exception("could not sweep Discovery for shop %s", tenant_id)
            continue
        for key in total:
            total[key] += int(result[key])
    return total


def after_run(db: Database, send_asks: SendAsks):
    """What runs once a check-up has finished: ask whoever should be asked about what it made."""

    async def run(tenant_id: UUID) -> None:
        async with db.tenant(tenant_id) as conn:
            await send_asks(conn, datetime.now(UTC))

    return run
