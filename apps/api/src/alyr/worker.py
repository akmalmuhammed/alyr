"""The background worker: runs queued jobs for every tenant.

Run with: uv run python -m alyr.worker

In local development the API also runs jobs itself after each request
(`ALYR_JOBS_INLINE=true`, the default), so this process is only needed when that is
switched off, as it should be in production.
"""

import asyncio
import logging

from alyr.main import create_app
from alyr.modules import report

log = logging.getLogger("alyr.worker")


async def keep_reports_scheduled(db) -> None:
    """Every shop always has its next weekly report queued, new shops included."""
    while True:
        try:
            await report.ensure_scheduled(db)
        except Exception:  # never let scheduling stop the worker
            log.exception("could not schedule weekly reports")
        await asyncio.sleep(3600)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    app = create_app()
    await app.state.db.connect()
    scheduler = asyncio.create_task(keep_reports_scheduled(app.state.db))
    try:
        await app.state.jobs.run_forever()
    finally:
        scheduler.cancel()
        await app.state.db.close()


if __name__ == "__main__":
    asyncio.run(main())
