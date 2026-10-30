"""The background worker: runs queued jobs for every tenant.

Run with: uv run python -m alyr.worker

In local development the API also runs jobs itself after each request
(`ALYR_JOBS_INLINE=true`, the default), so this process is only needed when that is
switched off, as it should be in production.
"""

import asyncio
import logging
import os
import signal
import socket

from alyr.config import get_settings
from alyr.core import alerts, erase, resume, subscription
from alyr.core.links import check_secret as check_link_secret
from alyr.core.retention import purge as purge_old_copies
from alyr.core.storage import check_store
from alyr.main import close_channels, create_app
from alyr.modules import report
from alyr.modules.bookings import deposits as booking_deposits
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
            # Bookings whose deposit was not paid in time (D-084), the same way.
            released = await booking_deposits.sweep_all(db, outbound)
            if released:
                log.info("released %s bookings whose deposit was not paid", released)
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
    """Where each client's plan stands (ALY-218, D-082): pause or resume what ALYR sends for
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


async def keep_old_copies_purged(db) -> None:
    """Delete the working copies past their time: finished jobs, whose payloads repeat the
    customer's messages, and the IDs of messages already handled (ALY-119, D-075). Once a
    day; the first pass when the worker starts."""
    while True:
        try:
            gone = await purge_old_copies(db)
            if any(gone.values()):
                log.info("purged %s old jobs and %s handled message IDs",
                         gone["jobs"], gone["seen"])
        except Exception:  # never let the purge stop the worker
            log.exception("could not purge the old working copies")
        await asyncio.sleep(86400)


async def keep_erased_files_removed(db, store) -> None:
    """Empty the photo store of the businesses the erasure job deleted (spec 042, D-116). The job
    runs as the database owner and holds no store keys; it leaves one row per business in
    `erasure_files`, and this removes everything under that business's prefix. Every hour; it
    finishes a business only when a listing of its prefix comes back empty."""
    while True:
        try:
            gone = await erase.remove_files(db, store)
            if gone["objects"] or gone["errors"]:
                log.info("removed %s photo files of %s erased businesses (%s could not be)",
                         gone["objects"], gone["businesses"], gone["errors"])
        except Exception:  # never let the clean-up stop the worker
            log.exception("could not remove the photo files of erased businesses")
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
    # A deploy or a scale-down sends SIGTERM and allows a few seconds: finish the jobs already
    # started, put the rest of the batch back in the queue, and stop (ALY-276).
    loop = asyncio.get_running_loop()
    for stop_signal in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(stop_signal, app.state.jobs.stop)
    scheduler = asyncio.create_task(keep_reports_scheduled(app.state.db))
    sweeper = asyncio.create_task(keep_holds_swept(app.state.db, app.state.outbound))
    meters = asyncio.create_task(keep_meters_fresh(app.state.media))
    watching = asyncio.create_task(alerts.keep_watching(app.state.db))
    reminders = asyncio.create_task(keep_owners_reminded(app.state.db))
    billing = asyncio.create_task(keep_billing_checked(app.state.db))
    purger = asyncio.create_task(keep_old_copies_purged(app.state.db))
    erased = asyncio.create_task(keep_erased_files_removed(app.state.db, app.state.media.store))
    try:
        await app.state.jobs.run_forever(heartbeat=heartbeat(app.state.db))
        log.info("stopped: the jobs that had started finished, the rest went back in the queue")
    finally:
        scheduler.cancel()
        sweeper.cancel()
        meters.cancel()
        watching.cancel()
        reminders.cancel()
        billing.cancel()
        purger.cancel()
        erased.cancel()
        await app.state.db.close()
        await close_channels(app)


if __name__ == "__main__":
    asyncio.run(main())
