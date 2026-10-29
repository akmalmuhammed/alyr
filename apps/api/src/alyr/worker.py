"""The background worker: runs queued jobs for every tenant.

Run with: uv run python -m alyr.worker

In local development the API also runs jobs itself after each request
(`ALYR_JOBS_INLINE=true`, the default), so this process is only needed when that is
switched off, as it should be in production.
"""

import asyncio
import logging
import os
import socket

from alyr.config import get_settings
from alyr.core import resume, subscription
from alyr.core.links import check_secret as check_link_secret
from alyr.core.storage import check_store
from alyr.main import create_app
from alyr.modules import report
from alyr.modules.orders import holds as order_holds

log = logging.getLogger("alyr.worker")

# One name per process, stable across its life: the host (a container's name in the
# cloud) and the process ID.
WORKER_NAME = f"{socket.gethostname()}:{os.getpid()}"


def heartbeat(db):
    """Record that this worker is alive. Called from inside the job loop, so a loop
    that hangs stops beating even if the process is still running."""

    async def beat() -> None:
        async with db.unscoped() as conn:
            await conn.execute(
                "insert into worker_heartbeats (worker, started_at, beat_at) "
                "values ($1, now(), now()) "
                "on conflict (worker) do update set beat_at = now()",
                WORKER_NAME,
            )
            # Workers replaced by a deploy or a restart leave rows behind; keep a day.
            await conn.execute(
                "delete from worker_heartbeats where beat_at < now() - interval '1 day'"
            )

    return beat


async def keep_reports_scheduled(db) -> None:
    """Every shop always has its next weekly report queued, new shops included."""
    while True:
        try:
            await report.ensure_scheduled(db)
        except Exception:  # never let scheduling stop the worker
            log.exception("could not schedule weekly reports")
        await asyncio.sleep(3600)


async def keep_holds_swept(db, outbound) -> None:
    """Give back the stock of orders nobody paid for. The first pass runs the moment the
    worker starts, so whatever ran out while it was off is caught up at once; after that
    every few minutes. Each such order also has its own job, so this only matters when a
    job was lost."""
    while True:
        try:
            cancelled = await order_holds.sweep_all(db, outbound)
            if cancelled:
                log.info("released the holds of %s unpaid orders", cancelled)
        except Exception:  # never let a sweep stop the worker
            log.exception("could not sweep expired holds")
        await asyncio.sleep(300)


async def keep_owners_reminded(db) -> None:
    """Email the owners who stopped partway through setting up, once their time has come
    (ALY-171). Every hour; the database says who is due, and a reminder is recorded before it
    is sent, so a restart or a second worker cannot send one twice."""
    while True:
        try:
            sent = await resume.send_due(db)
            if sent:
                log.info("emailed %s owners to finish setting up", sent)
        except Exception:  # never let a reminder stop the worker
            log.exception("could not send the setup reminders")
        await asyncio.sleep(3600)


async def keep_billing_checked(db) -> None:
    """Where each client's plan stands (ALY-218, D-080): pause or resume what ALYR sends for
    an overdue client, cancel at Paddle a plan whose cancellation took effect, and email the
    owners what is due. Every hour; each email is recorded before it is sent."""
    while True:
        try:
            sent = await subscription.sweep(db)
            if sent:
                log.info("emailed %s clients about their plan", sent)
        except Exception:  # never let billing stop the worker
            log.exception("could not check the clients' plans")
        await asyncio.sleep(3600)


async def keep_meters_fresh(media) -> None:
    """Every shop has this month's photo and item meters, even in a month it uploaded
    nothing (ALY-103)."""
    while True:
        try:
            await media.refresh_all()
        except Exception:  # never let the meters stop the worker
            log.exception("could not refresh the photo meters")
        await asyncio.sleep(3600)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    # The worker answers customers too ("order" in the chat makes a signed link), so it
    # refuses to start without the link secret just as the API does (ALY-112).
    check_link_secret(get_settings())
    app = create_app()
    # The worker imports photos from spreadsheets, so the same rule as the API (ALY-63).
    check_store(get_settings(), app.state.media.store)
    await app.state.db.connect()
    scheduler = asyncio.create_task(keep_reports_scheduled(app.state.db))
    sweeper = asyncio.create_task(keep_holds_swept(app.state.db, app.state.outbound))
    meters = asyncio.create_task(keep_meters_fresh(app.state.media))
    reminders = asyncio.create_task(keep_owners_reminded(app.state.db))
    billing = asyncio.create_task(keep_billing_checked(app.state.db))
    try:
        await app.state.jobs.run_forever(heartbeat=heartbeat(app.state.db))
    finally:
        scheduler.cancel()
        sweeper.cancel()
        meters.cancel()
        reminders.cancel()
        billing.cancel()
        await app.state.db.close()


if __name__ == "__main__":
    asyncio.run(main())
