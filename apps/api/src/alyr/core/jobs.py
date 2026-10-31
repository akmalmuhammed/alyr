"""Job queue in PostgreSQL (decision D-010).

Anything that can fail or must happen later is a job: sending a message, handling an
inbound webhook, a scheduled reminder. A job is inserted in the same transaction as the
data it belongs to. A runner claims due jobs, runs them, and retries failures with a
growing delay until `max_attempts`, after which the job is parked as failed where a
person can see it.

Delivery is at least once. If the process dies after a channel accepted a message but
before we recorded that, the job is retried and the message can go out twice. Meta gives
us no way to make a send idempotent, so that small window is accepted.

A runner works on several jobs at once (`concurrency`), because a send mostly waits for
Meta. The jobs about one customer still run one after another, in the order they were
queued, so a customer's messages arrive in the order they were written (ALY-276).

Customers come first. A kind registered as `background` (a weekly report, a photo for the
store, an event for a shop's other system) is claimed only after every customer's job that
is due, and a batch holds no more of them than half the runner's places (`background_places`).
So the shops' weekly reports, all due at nine on Sunday, never stand in front of a customer's
message, and a message that arrives while a batch of reports runs finds free places instead of
waiting for it to finish (D-132: the Sunday run of 31 Oct 2026 made replies take 3.8 s at the
95th percentile with five reports at a time, against 1.4 s without them). A background job that
has waited `BACKGROUND_WAITS_AT_MOST` takes its turn like any other.
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
# How often a runner looks for jobs left running by a process that died. Once a minute, not
# on every claim: a job counts as stuck only after five, and the look was most of the
# database's time in a burst of messages (ALY-275).
RECLAIM_EVERY_SECONDS = 60
BATCH = 20
# A background job waits behind customers' jobs for this long at most, then queues like any
# other: a steady stream of messages can delay a weekly report, never stop it.
BACKGROUND_WAITS_AT_MOST = 900
# The shop in scope, said in a query on `jobs`. The table's row-level policy also lets the
# worker see every shop, and that "or" keeps PostgreSQL from using an index on tenant_id on
# its own: a query that names the shop as well uses `jobs_waiting` (ALY-275).
THIS_SHOP = "tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid"
# The retry delay doubles on each failure but never passes this, so a job that is allowed
# many attempts (a photo waiting for the object store, ALY-103) keeps trying about hourly.
MAX_BACKOFF_SECONDS = 3600


async def enqueue(
    conn: asyncpg.Connection, kind: str, payload: dict, run_at: datetime | None = None,
    max_attempts: int | None = None,
) -> UUID:
    """Add a job for the current tenant. `conn` must be tenant-scoped, so the job commits
    or rolls back with everything else in the transaction. `max_attempts` overrides the
    table's default of 6 for work that should keep trying for hours."""
    # The clock, not the transaction's start: two jobs queued in one transaction (two
    # messages to one customer) are claimed, and so sent, in the order they were queued.
    return await conn.fetchval(
        "insert into jobs (kind, payload, run_at, max_attempts) "
        "values ($1, $2, coalesce($3, clock_timestamp()), coalesce($4, 6)) returning id",
        kind, payload, run_at, max_attempts,
    )


# The rows to claim are picked in a CTE that PostgreSQL must run once (`materialized`). Written as
# `update ... where id in (select ... for update skip locked limit N)`, the planner may run that
# subquery again for each row it meets and update more than N rows; after a test run it did, and
# the batch of "at most two weekly reports" became every report that was due (D-132).
_CLAIM = (
    "with picked as materialized ("
    "  select id from jobs where status = 'queued' and run_at <= now() and {which} "
    "  order by run_at for update skip locked limit $1) "
    "update jobs set status = 'running', locked_at = now(), attempts = attempts + 1 "
    "from picked where jobs.id = picked.id "
    "returning jobs.id, jobs.tenant_id, jobs.kind, jobs.payload, jobs.attempts, "
    "jobs.max_attempts, jobs.run_at"
)


def lane(job: asyncpg.Record) -> str:
    """Jobs in one lane run one after another. A job about a customer (a message to send
    names the contact, a message received names the sender) shares its lane with that
    customer's other jobs in the business; any other job has a lane of its own."""
    payload = job["payload"] if isinstance(job["payload"], dict) else {}
    who = payload.get("contact_id") or payload.get("from_user_id") or payload.get("from_number")
    return f"{job['tenant_id']}:{who}" if who else str(job["id"])


class JobRunner:
    def __init__(
        self, db: Database, backoff_seconds: float = 5.0, concurrency: int = 1
    ) -> None:
        self._db = db
        self._backoff = backoff_seconds
        self._concurrency = max(1, concurrency)
        self._stopping = False
        self._handlers: dict[str, Handler] = {}
        self._on_dead: dict[str, Handler] = {}
        self._background: set[str] = set()
        self._draining = False
        self._again = False
        self._reclaimed_at = float("-inf")

    @property
    def background_places(self) -> int:
        """How many background jobs a batch holds: half the places, and at least one."""
        return max(1, self._concurrency // 2)

    def register(
        self, kind: str, handler: Handler, on_dead: Handler | None = None, *,
        background: bool = False,
    ) -> None:
        """`handler` does the work. `on_dead` runs once when the job has failed for good.
        A `background` kind is work no customer is waiting for: it runs after theirs."""
        self._handlers[kind] = handler
        if on_dead:
            self._on_dead[kind] = on_dead
        if background:
            self._background.add(kind)

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
            while not self._stopping:
                self._again = False
                batch = await self._claim()
                done += await self._run_batch(batch)
                if not batch and not self._again:
                    return done
            return done
        finally:
            self._draining = False

    def stop(self) -> None:
        """Finish the jobs already started and claim no more. The worker calls this when
        the platform asks it to shut down (SIGTERM on a deploy): the jobs it had claimed
        but not started go back in the queue at once, instead of waiting five minutes to
        count as abandoned (ALY-276)."""
        self._stopping = True

    async def _run_batch(self, batch: list[asyncpg.Record]) -> int:
        """Run a claimed batch: up to `concurrency` jobs at a time, each lane's jobs one after
        another in the order they were claimed. Answers how many ran."""
        lanes: dict[str, list[asyncpg.Record]] = {}
        for job in sorted(batch, key=lambda j: j["run_at"]):
            lanes.setdefault(lane(job), []).append(job)
        gate = asyncio.Semaphore(self._concurrency)
        ran = 0

        async def run_lane(queue: list[asyncpg.Record]) -> None:
            nonlocal ran
            for n, job in enumerate(queue):
                if self._stopping:
                    await self._release(queue[n:])
                    return
                async with gate:
                    await self._run(job)
                ran += 1

        # Every lane finishes before the next claim, even when one fails, so no job of this
        # batch is still running while the next is claimed.
        outcomes = await asyncio.gather(
            *(run_lane(queue) for queue in lanes.values()), return_exceptions=True
        )
        for outcome in outcomes:
            if isinstance(outcome, BaseException):
                raise outcome
        return ran

    async def _release(self, batch: list[asyncpg.Record]) -> None:
        """Put claimed jobs that never started back in the queue, their attempt not spent."""
        async with self._db.unscoped() as conn, conn.transaction():
            await conn.execute("select set_config('app.worker', 'on', true)")
            await conn.execute(
                "update jobs set status = 'queued', locked_at = null, attempts = attempts - 1 "
                "where id = any($1::uuid[]) and status = 'running'",
                [job["id"] for job in batch],
            )

    async def run_forever(
        self,
        idle_seconds: float = 1.0,
        heartbeat: Callable[[], Awaitable[None]] | None = None,
        heartbeat_seconds: float = 30.0,
    ) -> None:
        """The worker process's loop. `heartbeat` is called from inside the loop at most
        every `heartbeat_seconds`, so it stops being called if the loop itself stops."""
        last_beat = 0.0
        while not self._stopping:
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
            if time.monotonic() - self._reclaimed_at >= RECLAIM_EVERY_SECONDS:
                self._reclaimed_at = time.monotonic()
                await conn.execute(
                    "update jobs set status = 'queued', locked_at = null "
                    "where status = 'running' and locked_at < now() - make_interval(secs => $1)",
                    STUCK_AFTER_SECONDS,
                )
            background = sorted(self._background)
            # Customers' jobs first, with any background job that has waited long enough.
            claimed = await conn.fetch(
                _CLAIM.format(which="(kind <> all($2::text[]) "
                                    "or run_at < now() - make_interval(secs => $3))"),
                BATCH, background, BACKGROUND_WAITS_AT_MOST,
            )
            room = min(BATCH - len(claimed), self.background_places)
            if room > 0 and background:
                claimed += await conn.fetch(
                    _CLAIM.format(which="kind = any($2::text[])"), room, background
                )
            return claimed

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
        delay = min(self._backoff * (2 ** (job["attempts"] - 1)), MAX_BACKOFF_SECONDS)
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
        f"where {THIS_SHOP} and status = 'failed' order by finished_at desc limit 100"
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
