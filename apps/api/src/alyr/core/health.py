"""Is ALYR working right now? (ALY-121, spec 022)

Three questions, each with its own address so a checker can tell them apart:

- `/health`        is the process alive. No database. It is what keeps the container awake.
- `/health/ready`  can it serve: the database answers, every migration is applied, and the
                   oldest job that is due has not waited too long.
- `/health/worker` is the job runner alive: it writes a heartbeat every 30 seconds.

Answers hold counts and ages, never a name, a number or a message, so they are safe to show
to anyone who asks.
"""

import asyncio
import logging
from datetime import datetime

from alyr.db import Database
from alyr.migrate import MIGRATIONS

log = logging.getLogger("alyr.health")

BEAT_EVERY_SECONDS = 30
# A runner that has not checked in for this long is down or hung.
WORKER_SILENT_AFTER_SECONDS = 120
# A due job that has waited longer than this means messages are late.
QUEUE_LATE_AFTER_SECONDS = 300
DB_TIMEOUT_SECONDS = 5

WORKER = "worker"
WEBHOOK = "webhook"


async def beat(db: Database, name: str, *, at_most_every: int = 0) -> None:
    """Record that `name` is alive now. With `at_most_every`, a row that is fresher than that
    many seconds is left alone, so a busy webhook does not write on every call."""
    async with db.unscoped() as conn:
        await conn.execute(
            "insert into heartbeats (name) values ($1) "
            "on conflict (name) do update set beat_at = now() "
            "where heartbeats.beat_at < now() - make_interval(secs => $2)",
            name, float(at_most_every),
        )


async def keep_beating(db: Database, name: str = WORKER) -> None:
    """The runner's heartbeat. It lives in its own task, so a job that hangs does not stop it
    (the stuck-job sweep and the queue-age check catch that instead)."""
    async with db.unscoped() as conn:
        # A fresh start: both columns say when this run began.
        await conn.execute(
            "insert into heartbeats (name, started_at) values ($1, now()) "
            "on conflict (name) do update set beat_at = now(), started_at = now()",
            name,
        )
    while True:
        await asyncio.sleep(BEAT_EVERY_SECONDS)
        try:
            await beat(db, name)
        except Exception:  # never let the heartbeat stop the runner
            log.exception("could not write the heartbeat")


async def heartbeat_age(db: Database, name: str) -> float | None:
    """Seconds since `name` last checked in, or None if it never has."""
    async with db.unscoped() as conn:
        return await conn.fetchval(
            "select extract(epoch from now() - beat_at)::float8 from heartbeats where name = $1",
            name,
        )


async def queue_numbers(db: Database) -> dict:
    """How long the oldest due job has waited, and how many jobs gave up or are waiting."""
    async with db.unscoped() as conn, conn.transaction():
        # The runner's own setting lets this one query see every shop's jobs; it reads counts only.
        await conn.execute("select set_config('app.worker', 'on', true)")
        row = await conn.fetchrow(
            "select "
            " coalesce(extract(epoch from now() - (min(run_at) filter "
            "   (where status = 'queued' and run_at <= now()))), 0)::float8 as oldest_due, "
            " count(*) filter (where status = 'queued') as queued, "
            " count(*) filter (where status = 'failed' "
            "   and finished_at > now() - interval '24 hours') as parked_24h "
            "from jobs where status in ('queued', 'failed')"
        )
    return {
        "oldest_due_seconds": round(row["oldest_due"]),
        "queued": row["queued"],
        "parked_24h": row["parked_24h"],
    }


async def migrations_current(db: Database) -> tuple[bool, int]:
    """Whether every migration on disk has been applied, and how many are missing."""
    async with db.unscoped() as conn:
        done = {r["name"] for r in await conn.fetch("select name from schema_migrations")}
    missing = [p.name for p in MIGRATIONS.glob("*.sql") if p.name not in done]
    return not missing, len(missing)


async def readiness(db: Database) -> tuple[bool, dict]:
    """The answer for `/health/ready`: (ready, details). Each check runs on its own, so one
    that breaks is named and the others still report."""
    checks: dict = {}

    async def run(name: str, check) -> bool:
        try:
            async with asyncio.timeout(DB_TIMEOUT_SECONDS):
                checks[name] = await check()
            return True
        except Exception as error:  # noqa: BLE001 - any failure means "not ready"
            log.warning("readiness check %s failed: %s", name, type(error).__name__)
            checks[name] = f"failed ({type(error).__name__})"
            return False

    async def database():
        async with db.unscoped() as conn:
            await conn.fetchval("select 1")
        return "ok"

    async def migrations():
        current, missing = await migrations_current(db)
        return "ok" if current else f"{missing} not applied"

    ready = await run("database", database)
    if ready:
        ready = await run("migrations", migrations) and checks["migrations"] == "ok"
        queue_ok = await run("queue", lambda: queue_numbers(db))
        ready = ready and queue_ok
        if queue_ok and checks["queue"]["oldest_due_seconds"] > QUEUE_LATE_AFTER_SECONDS:
            checks["queue"]["late"] = True
            ready = False
        await run("last_webhook_seconds_ago", lambda: heartbeat_age(db, WEBHOOK))
    return ready, checks


async def worker_status(db: Database, *, inline: bool) -> tuple[bool, dict]:
    """The answer for `/health/worker`. When jobs run inside the API (a developer's machine)
    there is no separate runner to watch."""
    if inline:
        return True, {"worker": "inline"}
    try:
        age = await heartbeat_age(db, WORKER)
    except Exception as error:  # noqa: BLE001
        return False, {"worker": f"unknown ({type(error).__name__})"}
    if age is None:
        return False, {"worker": "never started"}
    alive = age <= WORKER_SILENT_AFTER_SECONDS
    return alive, {"worker": "ok" if alive else "silent", "seconds_since_beat": round(age)}


def doha_hour(now: datetime) -> int:
    from zoneinfo import ZoneInfo

    return now.astimezone(ZoneInfo("Asia/Qatar")).hour
