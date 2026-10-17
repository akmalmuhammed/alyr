"""Health checks the host and the uptime monitor rely on (ALY-63)."""

import asyncio
from urllib.parse import urlparse

import asyncpg

from alyr.migrate import migrate
from alyr.worker import heartbeat
from conftest import APP_DSN, OWNER_DSN

BACKUP_DSN = APP_DSN.replace("alyr_app:alyr_app_local", "alyr_backup_test:backup_test_pw")


def owner_sql(sql, *args):
    async def go():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetch(sql, *args)
        finally:
            await conn.close()

    return asyncio.run(go())


def test_liveness_and_readiness(client):
    assert client.get("/health").json()["status"] == "ok"
    ready = client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok", "database": "ok"}


def test_worker_health_is_green_when_jobs_run_inside_the_api(client):
    answer = client.get("/health/worker")
    assert answer.status_code == 200
    assert answer.json()["mode"] == "inline"


def test_worker_health_follows_the_heartbeat(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    owner_sql("delete from worker_heartbeats")

    silent = client.get("/health/worker")
    assert silent.status_code == 503
    assert silent.json()["reason"] == "no worker has checked in"

    client.portal.call(heartbeat(client.app.state.db))
    alive = client.get("/health/worker")
    assert alive.status_code == 200
    assert alive.json()["seconds_since_last_check_in"] <= 2

    owner_sql("update worker_heartbeats set beat_at = now() - interval '10 minutes'")
    stale = client.get("/health/worker")
    assert stale.status_code == 503
    assert stale.json()["seconds_since_last_check_in"] >= 590


def test_the_job_loop_beats_while_it_runs(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    beats = []

    async def beat():
        beats.append(1)
        if len(beats) == 3:
            raise asyncio.CancelledError

    async def run():
        try:
            await client.app.state.jobs.run_forever(
                idle_seconds=0.01, heartbeat=beat, heartbeat_seconds=0
            )
        except asyncio.CancelledError:
            pass

    client.portal.call(run)
    assert len(beats) == 3


def test_the_backup_role_reads_past_row_level_security_and_cannot_write(client):
    asyncio.run(migrate(OWNER_DSN, APP_DSN, BACKUP_DSN))
    role = owner_sql(
        "select rolbypassrls, rolsuper from pg_roles where rolname = 'alyr_backup_test'"
    )[0]
    assert (role["rolbypassrls"], role["rolsuper"]) == (True, False)

    async def as_backup():
        conn = await asyncpg.connect(BACKUP_DSN)
        try:
            # No tenant is set, yet every shop's contacts are visible: what a dump needs.
            seen = await conn.fetchval("select count(*) from contacts")
            try:
                await conn.execute("delete from contacts")
            except asyncpg.InsufficientPrivilegeError:
                return seen, "refused"
            return seen, "allowed"
        finally:
            await conn.close()

    seen, write = asyncio.run(as_backup())
    assert seen > 0
    assert write == "refused"


def test_two_migrations_at_once_take_turns():
    async def both():
        return await asyncio.gather(
            migrate(OWNER_DSN, APP_DSN), migrate(OWNER_DSN, APP_DSN)
        )

    assert asyncio.run(both()) == [[], []]


def test_the_application_role_still_cannot_bypass_row_level_security():
    role = urlparse(APP_DSN).username
    row = owner_sql("select rolbypassrls from pg_roles where rolname = $1", role)[0]
    assert row["rolbypassrls"] is False
