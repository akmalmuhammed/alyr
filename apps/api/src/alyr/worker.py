"""The background worker: runs queued jobs for every tenant.

Run with: uv run python -m alyr.worker

In local development the API also runs jobs itself after each request
(`ALYR_JOBS_INLINE=true`, the default), so this process is only needed when that is
switched off, as it should be in production.
"""

import asyncio
import logging

from alyr.main import create_app


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    app = create_app()
    await app.state.db.connect()
    try:
        await app.state.jobs.run_forever()
    finally:
        await app.state.db.close()


if __name__ == "__main__":
    asyncio.run(main())
