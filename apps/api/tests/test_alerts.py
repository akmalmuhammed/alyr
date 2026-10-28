"""Alert rules (ALY-121, spec 022, D-062): one message per problem, counts only."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import httpx
import pytest

from alyr.config import get_settings
from alyr.core import alerts
from alyr.core.inbound import INBOUND
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
    """Each test starts with an empty queue and no alert history."""
    owner("delete from jobs")
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


# 01:00 in Doha: outside opening hours, so the quiet-webhook rule stays out of tests of the others.
NIGHT = datetime(2026, 10, 25, 22, 0, tzinfo=UTC)
MIDDAY = datetime(2026, 10, 25, 9, 0, tzinfo=UTC)  # noon in Doha


def run_rules(now=NIGHT):
    async def go(db):
        results = await alerts.evaluate(db, now)
        return results, await alerts.apply(db, results, now)

    return with_db(go)


def test_a_late_queue_alerts_once_then_reminds_then_clears(pushes):
    add_jobs(SEND, "queued", 1, minutes_ago=10)
    now = NIGHT
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


def add_inbound(tid, *, minutes_ago):
    owner(
        "insert into jobs (tenant_id, kind, status, created_at, finished_at) "
        "values ($1, $2, 'done', now() - make_interval(mins => $3), now())",
        tid, INBOUND, minutes_ago,
    )


def make_meta(number_id):
    owner("update channel_numbers set channel = 'meta' where number_id = $1", number_id)


def test_a_quiet_webhook_alerts_only_with_a_real_number_in_opening_hours(client, pushes):
    midday, night = MIDDAY, NIGHT
    # The suite's own shop has a Meta number; set it aside to test "no real number yet".
    kept = owner("select number_id, tenant_id, channel from channel_numbers where channel = 'meta'")
    owner("update channel_numbers set channel = 'simulator' where channel = 'meta'")
    try:
        assert run_rules(midday)[0]["webhook_quiet"] is None
        make_meta(kept[0]["number_id"])
        assert run_rules(night)[0]["webhook_quiet"] is None
        assert run_rules(midday)[0]["webhook_quiet"] is not None
        # A customer's message queued 20 minutes ago is still quiet; one a minute ago is not.
        add_inbound(kept[0]["tenant_id"], minutes_ago=20)
        assert run_rules(midday)[0]["webhook_quiet"] is not None
        add_inbound(kept[0]["tenant_id"], minutes_ago=1)
        assert run_rules(midday)[0]["webhook_quiet"] is None
    finally:
        owner("update channel_numbers set channel = 'simulator' where channel = 'meta'")
        for row in kept:
            make_meta(row["number_id"])


def test_a_message_through_the_webhook_counts_as_meta_reaching_us(client, pushes):
    assert owner("select 1 from channel_numbers where channel = 'meta'"), "the suite's Meta number"
    midday = MIDDAY
    assert run_rules(midday)[0]["webhook_quiet"] is not None
    assert signed_post(client, meta_payload(message_id="wamid.alerts")).status_code == 200
    assert run_rules(midday)[0]["webhook_quiet"] is None


def test_messages_on_a_simulator_number_do_not_count(client, pushes):
    kept = owner("select number_id from channel_numbers where channel = 'meta'")
    other = uuid4()
    owner("insert into tenants (id, name) values ($1, 'Simulator shop')", other)
    owner(
        "insert into channel_numbers (number_id, tenant_id, channel) values ($1, $2, 'simulator')",
        f"sim-{other}", other,
    )
    try:
        add_inbound(other, minutes_ago=1)
        assert kept and run_rules(MIDDAY)[0]["webhook_quiet"] is not None
    finally:
        owner("delete from jobs where tenant_id = $1", other)
        owner("delete from channel_numbers where tenant_id = $1", other)
        owner("delete from tenants where id = $1", other)


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
