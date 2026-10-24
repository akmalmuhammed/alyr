"""Monitoring (ALY-121, spec 022): the three health answers and the alert rules."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import httpx
import pytest

from alyr.config import get_settings
from alyr.core import alerts, health
from alyr.core.outbound import SEND
from alyr.db import Database
from conftest import APP_DSN, OWNER_DSN
from test_whatsapp_webhook import meta_payload, signed_post


def owner(sql, *args):
    """Run one statement as the database owner, which sees every row."""

    async def go():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetch(sql, *args)
        finally:
            await conn.close()

    return asyncio.run(go())


def with_db(fn):
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            return await fn(db)
        finally:
            await db.close()

    return asyncio.run(go())


@pytest.fixture(autouse=True)
def clean():
    """Each test starts with an empty queue and no heartbeat or alert history."""
    owner("delete from jobs")
    owner("delete from heartbeats")
    owner("delete from alert_state")
    yield
    owner("delete from jobs")


def tenant_id():
    existing = owner("select id from tenants limit 1")
    if existing:
        return existing[0]["id"]
    tid = uuid4()
    owner("insert into tenants (id, name) values ($1, 'Monitoring shop')", tid)
    return tid


def add_jobs(kind, status, count, *, minutes_ago=0, finished_minutes_ago=1):
    tid = tenant_id()
    for _ in range(count):
        owner(
            "insert into jobs (tenant_id, kind, status, run_at, finished_at) "
            "values ($1, $2, $3, now() - make_interval(mins => $4), "
            "case when $3 in ('done', 'failed') then now() - make_interval(mins => $5) end)",
            tid, kind, status, minutes_ago, finished_minutes_ago,
        )


# ── the three answers ────────────────────────────────────


def test_health_is_alive_without_a_database(client):
    assert client.get("/health").json()["status"] == "ok"


def test_ready_when_the_database_answers_and_nothing_waits(client):
    answer = client.get("/health/ready")
    assert answer.status_code == 200
    body = answer.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok" and body["migrations"] == "ok"
    assert body["queue"]["oldest_due_seconds"] == 0


def test_not_ready_when_a_due_job_has_waited_too_long(client):
    add_jobs(SEND, "queued", 1, minutes_ago=10)
    answer = client.get("/health/ready")
    assert answer.status_code == 503
    assert answer.json()["queue"]["late"] is True
    assert answer.json()["queue"]["oldest_due_seconds"] >= 600


def test_a_job_that_is_not_due_yet_is_not_late(client):
    add_jobs(SEND, "queued", 1, minutes_ago=-30)
    assert client.get("/health/ready").status_code == 200


def test_not_ready_when_a_migration_is_missing(client):
    owner("delete from schema_migrations where name = '0049_monitoring.sql'")
    try:
        answer = client.get("/health/ready")
        assert answer.status_code == 503
        assert "not applied" in answer.json()["migrations"]
    finally:
        owner("insert into schema_migrations (name) values ('0049_monitoring.sql')")


def test_the_answer_holds_no_customer_text(client):
    add_jobs(SEND, "failed", 2)
    text = client.get("/health/ready").text
    assert "97455" not in text and "payload" not in text


def test_worker_answer_follows_its_heartbeat(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    # Never started.
    assert client.get("/health/worker").status_code == 503
    with_db(lambda db: health.beat(db, health.WORKER))
    assert client.get("/health/worker").json()["worker"] == "ok"
    owner("update heartbeats set beat_at = now() - interval '5 minutes' where name = 'worker'")
    answer = client.get("/health/worker")
    assert answer.status_code == 503 and answer.json()["worker"] == "silent"


def test_with_jobs_inline_there_is_no_runner_to_watch(client):
    assert client.get("/health/worker").json() == {"status": "ok", "worker": "inline"}


def test_a_webhook_records_that_meta_reached_us(client):
    assert signed_post(client, meta_payload(message_id="wamid.monitor")).status_code == 200
    seen = client.get("/health/ready").json()["last_webhook_seconds_ago"]
    assert seen is not None and seen < 5


def test_a_busy_webhook_does_not_write_on_every_call(client):
    with_db(lambda db: health.beat(db, health.WEBHOOK))
    first = owner("select beat_at from heartbeats where name = 'webhook'")[0]["beat_at"]
    with_db(lambda db: health.beat(db, health.WEBHOOK, at_most_every=30))
    assert owner("select beat_at from heartbeats where name = 'webhook'")[0]["beat_at"] == first


# ── the alert rules ──────────────────────────────────────


@pytest.fixture
def pushes(monkeypatch):
    """Capture what would be sent to the phone."""
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append((request.headers["title"], request.content.decode(), request.url.path))
        return httpx.Response(200)

    monkeypatch.setenv("ALYR_ALERT_NTFY_TOPIC", "secrettopic")
    get_settings.cache_clear()
    monkeypatch.setattr(alerts, "transport", httpx.MockTransport(handler))
    yield sent
    get_settings.cache_clear()


def run_rules(now=None):
    async def go(db):
        results = await alerts.evaluate(db, now)
        return results, await alerts.apply(db, results, now)

    return with_db(go)


def test_a_late_queue_alerts_once_then_reminds_then_clears(pushes):
    add_jobs(SEND, "queued", 1, minutes_ago=10)
    now = datetime.now(UTC)
    results, sent = run_rules(now)
    assert results["queue_late"] is not None and sent == ["queue_late"]
    assert pushes[0][0] == "Messages are waiting"
    assert pushes[0][2] == "/secrettopic"

    # A minute later it is the same problem: no second message.
    assert run_rules(now + timedelta(minutes=1))[1] == []
    assert len(pushes) == 1
    # Two hours on, a reminder that says how long.
    assert run_rules(now + timedelta(hours=2, minutes=1))[1] == ["queue_late"]
    assert pushes[-1][0].startswith("Still:") and "121 minutes" in pushes[-1][1]

    # The queue empties: one message says it cleared, then silence.
    owner("delete from jobs")
    assert run_rules(now + timedelta(hours=2, minutes=2))[1] == ["queue_late"]
    assert pushes[-1][0].startswith("Cleared")
    assert run_rules(now + timedelta(hours=2, minutes=3))[1] == []


def test_sends_failing_needs_enough_sends_and_a_real_share(pushes):
    add_jobs(SEND, "done", 14)
    add_jobs(SEND, "failed", 1)
    # 15 tried: too few to judge.
    assert run_rules()[0]["sends_failing"] is None
    add_jobs(SEND, "done", 5)
    add_jobs(SEND, "failed", 4)
    results, _ = run_rules()
    assert results["sends_failing"] is not None
    assert "5 of 24" in results["sends_failing"].detail
    assert pushes[-1][0] == "WhatsApp sends are failing"


def test_a_parked_job_is_a_quiet_alert(pushes):
    add_jobs("reminder", "failed", 2)
    results, _ = run_rules()
    assert results["job_parked"].urgent is False
    assert pushes[-1][0] == "A job gave up"
    # Older than the window: not reported.
    owner("update jobs set finished_at = now() - interval '2 hours'")
    assert run_rules()[0]["job_parked"] is None


def make_meta(number_id):
    owner("update channel_numbers set channel = 'meta' where number_id = $1", number_id)


def test_a_quiet_webhook_alerts_only_with_a_real_number_in_opening_hours(pushes):
    midday = datetime(2026, 10, 25, 9, 0, tzinfo=UTC)  # noon in Doha
    night = datetime(2026, 10, 25, 22, 0, tzinfo=UTC)  # 01:00 in Doha
    # The suite's own shop has a Meta number; set it aside to test "no real number yet".
    kept = owner("select number_id, tenant_id, channel from channel_numbers where channel = 'meta'")
    owner("update channel_numbers set channel = 'simulator' where channel = 'meta'")
    try:
        assert run_rules(midday)[0]["webhook_quiet"] is None
        make_meta(kept[0]["number_id"])
        assert run_rules(night)[0]["webhook_quiet"] is None
        assert run_rules(midday)[0]["webhook_quiet"] is not None
    finally:
        owner("update channel_numbers set channel = 'simulator' where channel = 'meta'")
        for row in kept:
            make_meta(row["number_id"])


def test_an_alert_never_carries_customer_data(pushes):
    tid = tenant_id()
    owner(
        "insert into jobs (tenant_id, kind, status, run_at, payload) "
        "values ($1, $2, 'queued', now() - interval '20 minutes', "
        "'{\"phone\": \"97455512345\", \"body\": \"my secret order\"}')",
        tid, SEND,
    )
    run_rules()
    assert pushes
    for _, body, _ in pushes:
        assert "97455512345" not in body and "secret order" not in body


def test_an_alert_that_cannot_be_delivered_does_not_stop_the_watch(monkeypatch):
    def refuse(request):
        return httpx.Response(500)

    monkeypatch.setenv("ALYR_ALERT_NTFY_TOPIC", "secrettopic")
    get_settings.cache_clear()
    monkeypatch.setattr(alerts, "transport", httpx.MockTransport(refuse))
    add_jobs(SEND, "queued", 1, minutes_ago=10)
    assert run_rules()[1] == ["queue_late"]
    get_settings.cache_clear()


def test_the_runner_writes_its_heartbeat_as_it_starts():
    async def go(db):
        task = asyncio.create_task(health.keep_beating(db))
        await asyncio.sleep(0.5)
        task.cancel()
        return await health.heartbeat_age(db, health.WORKER)

    age = with_db(go)
    assert age is not None and age < 5
