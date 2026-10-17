"""Job queue in PostgreSQL (decision D-010).

Anything that can fail or must happen later is a job: sending a message, handling an
inbound webhook, a scheduled reminder. A job is inserted in the same transaction as the
data it belongs to. A runner claims due jobs, runs them, and retries failures with a
growing delay until `max_attempts`, after which the job is parked as failed where a
person can see it.

Delivery is at least once. If the process dies after a channel accepted a message but
before we recorded that, the job is retried and the message can go out twice. Meta gives
us no way to make a send idempotent, so that small window is accepted.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.db import Database

log = logging.getLogger("alyr.jobs")

Handler = Callable[[UUID, dict], Awaitable[None]]

STUCK_AFTER_SECONDS = 300
BATCH = 20


async def enqueue(
    conn: asyncpg.Connection, kind: str, payload: dict, run_at: datetime | None = None
) -> UUID:
    """Add a job for the current tenant. `conn` must be tenant-scoped, so the job commits
    or rolls back with everything else in the transaction."""
    return await conn.fetchval(
        "insert into jobs (kind, payload, run_at) values ($1, $2, coalesce($3, now())) "
        "returning id",
        kind, payload, run_at,
    )


class JobRunner:
    def __init__(self, db: Database, backoff_seconds: float = 5.0) -> None:
        self._db = db
        self._backoff = backoff_seconds
        self._handlers: dict[str, Handler] = {}
        self._on_dead: dict[str, Handler] = {}
        self._draining = False
        self._again = False

    def register(self, kind: str, handler: Handler, on_dead: Handler | None = None) -> None:
        """`handler` does the work. `on_dead` runs once when the job has failed for good."""
        self._handlers[kind] = handler
        if on_dead:
            self._on_dead[kind] = on_dead

    async def drain(self) -> int:
        """Run every job that is due, including jobs those jobs create. Safe to call
        from anywhere, any number of times: if a drain is already running, this asks
        it to look again and returns."""
        if self._draining:
            self._again = True
            return 0
        self._draining = True
        done = 0
        try:
            while True:
                self._again = False
                batch = await self._claim()
                for job in batch:
                    await self._run(job)
                done += len(batch)
                if not batch and not self._again:
                    return done
        finally:
            self._draining = False

    async def run_forever(
        self,
        idle_seconds: float = 1.0,
        heartbeat: Callable[[], Awaitable[None]] | None = None,
        heartbeat_seconds: float = 30.0,
    ) -> None:
        """The worker process's loop. `heartbeat` is called from inside the loop at most
        every `heartbeat_seconds`, so it stops being called if the loop itself stops."""
        last_beat = 0.0
        while True:
            try:
                now = time.monotonic()
                if heartbeat is not None and now - last_beat >= heartbeat_seconds:
                    await heartbeat()
                    last_beat = now
                if not await self.drain():
                    await asyncio.sleep(idle_seconds)
            except Exception:  # noqa: BLE001 - the worker must outlive any one failure
                log.exception("worker loop error")
                await asyncio.sleep(idle_seconds)

    async def _claim(self) -> list[asyncpg.Record]:
        async with self._db.unscoped() as conn, conn.transaction():
            await conn.execute("select set_config('app.worker', 'on', true)")
            # A job left running by a process that died goes back in the queue.
            await conn.execute(
                "update jobs set status = 'queued', locked_at = null "
                "where status = 'running' and locked_at < now() - make_interval(secs => $1)",
                STUCK_AFTER_SECONDS,
            )
            return await conn.fetch(
                "update jobs set status = 'running', locked_at = now(), attempts = attempts + 1 "
                "where id in (select id from jobs where status = 'queued' and run_at <= now() "
                "             order by run_at for update skip locked limit $1) "
                "returning id, tenant_id, kind, payload, attempts, max_attempts",
                BATCH,
            )

    async def _run(self, job: asyncpg.Record) -> None:
        handler = self._handlers.get(job["kind"])
        try:
            if handler is None:
                raise LookupError(f"no handler for job kind {job['kind']!r}")
            await handler(job["tenant_id"], job["payload"])
        except Exception as error:  # noqa: BLE001 - any failure means retry or park
            await self._failed(job, error)
            return
        async with self._db.tenant(job["tenant_id"]) as conn:
            await conn.execute(
                "update jobs set status = 'done', finished_at = now(), last_error = null "
                "where id = $1",
                job["id"],
            )

    async def _failed(self, job: asyncpg.Record, error: Exception) -> None:
        final = job["attempts"] >= job["max_attempts"]
        # Error text only. Payloads can hold customer data and are not logged.
        reason = f"{type(error).__name__}: {error}"[:500]
        log.warning("job %s (%s) attempt %s failed: %s", job["id"], job["kind"],
                    job["attempts"], type(error).__name__)
        delay = self._backoff * (2 ** (job["attempts"] - 1))
        async with self._db.tenant(job["tenant_id"]) as conn:
            await conn.execute(
                "update jobs set status = $2, last_error = $3, locked_at = null, "
                "run_at = now() + make_interval(secs => $4), "
                "finished_at = case when $2 = 'failed' then now() end where id = $1",
                job["id"], "failed" if final else "queued", reason, delay,
            )
        if final and job["kind"] in self._on_dead:
            await self._on_dead[job["kind"]](job["tenant_id"], job["payload"])


async def failed_jobs(conn: asyncpg.Connection) -> list[dict]:
    """The current tenant's parked jobs, newest first."""
    rows = await conn.fetch(
        "select id, kind, attempts, last_error, created_at, finished_at from jobs "
        "where status = 'failed' order by finished_at desc limit 100"
    )
    return [
        {**dict(r), "id": str(r["id"]), "created_at": r["created_at"].isoformat(),
         "finished_at": r["finished_at"].isoformat() if r["finished_at"] else None}
        for r in rows
    ]


async def retry(conn: asyncpg.Connection, job_id: UUID) -> bool:
    """Put a parked job back in the queue with a fresh set of attempts."""
    updated = await conn.execute(
        "update jobs set status = 'queued', attempts = 0, run_at = now(), finished_at = null "
        "where id = $1 and status = 'failed'",
        job_id,
    )
    return updated == "UPDATE 1"
