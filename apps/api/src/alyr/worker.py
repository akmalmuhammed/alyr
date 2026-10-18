"""The background worker: runs queued jobs for every tenant.

Run with: uv run python -m alyr.worker

In local development the API also runs jobs itself after each request
(`ALYR_JOBS_INLINE=true`, the default), so this process is only needed when that is
switched off, as it should be in production.
"""

import asyncio
import logging

from alyr.config import get_settings
from alyr.core.links import check_secret as check_link_secret
from alyr.main import create_app
from alyr.modules import report
from alyr.modules.orders import holds as order_holds

log = logging.getLogger("alyr.worker")


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
    await app.state.db.connect()
    scheduler = asyncio.create_task(keep_reports_scheduled(app.state.db))
    sweeper = asyncio.create_task(keep_holds_swept(app.state.db, app.state.outbound))
    meters = asyncio.create_task(keep_meters_fresh(app.state.media))
    try:
        await app.state.jobs.run_forever()
    finally:
        scheduler.cancel()
        sweeper.cancel()
        meters.cancel()
        await app.state.db.close()


if __name__ == "__main__":
    asyncio.run(main())
