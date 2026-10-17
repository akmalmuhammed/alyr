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

from alyr.main import create_app
from alyr.modules import report

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


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    app = create_app()
    await app.state.db.connect()
    scheduler = asyncio.create_task(keep_reports_scheduled(app.state.db))
    try:
        await app.state.jobs.run_forever(heartbeat=heartbeat(app.state.db))
    finally:
        scheduler.cancel()
        await app.state.db.close()


if __name__ == "__main__":
    asyncio.run(main())
