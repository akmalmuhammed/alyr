"""Job queue and outbox (D-010): nothing is lost when a channel fails or a process dies."""

import asyncio
from uuid import uuid4

import asyncpg
import pytest

from alyr.db import Database
from alyr.seed import AHMED_PHONE
from conftest import APP_DSN, NUMBER_ID, OWNER_DSN
from test_whatsapp_webhook import meta_payload, signed_post


class FlakyChannel:
    """Fails the first `failures` sends, then works. Counts every attempt."""

    name = "meta"

    def __init__(self, failures=0):
        self.failures = failures
        self.attempts = 0
        self.sent = []

    async def send(self, from_number_id, message, address):
        self.attempts += 1
        if self.attempts <= self.failures:
            raise ConnectionError("channel is down")
        self.sent.append(message)
        return f"wamid.out.{len(self.sent)}"


@pytest.fixture
def fast_retries(monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")


def use(client, channel):
    client.app.state.outbound.channels["meta"] = channel
    return channel


def drain(client):
    client.portal.call(client.app.state.jobs.drain)


def meta_conversation(client):
    return client.get("/sim/conversations/97455500001").json()["messages"]


def test_a_failing_channel_is_retried_until_it_works(client_factory, fast_retries):
    client = client_factory()
    channel = use(client, FlakyChannel(failures=2))
    assert signed_post(client, meta_payload(message_id="wamid.retry")).status_code == 200
    assert channel.attempts == 3
    assert len(channel.sent) == 1
    reply = [m for m in meta_conversation(client) if m["direction"] == "out"][-1]
    assert reply["status"] == "sent"
    assert client.get("/api/jobs/failed").json()["jobs"] == []


def test_a_channel_that_never_works_parks_the_job_and_marks_the_message(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel(failures=99))
    signed_post(client, meta_payload(message_id="wamid.dead"))
    assert channel.attempts == 6
    reply = [m for m in meta_conversation(client) if m["direction"] == "out"][-1]
    assert reply["status"] == "failed"

    parked = client.get("/api/jobs/failed").json()["jobs"]
    assert len(parked) == 1
    assert parked[0]["kind"] == "send_message"
    assert "ConnectionError" in parked[0]["last_error"]

    # The channel comes back; a person sends the job round again.
    channel.failures = 0
    assert client.post(f"/api/jobs/{parked[0]['id']}/retry").status_code == 200
    assert client.get("/api/jobs/failed").json()["jobs"] == []


def test_webhook_only_queues_and_a_later_worker_does_the_work(client_factory, monkeypatch):
    """What happens if the API dies right after answering Meta: the work is still there."""
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    channel = use(client, FlakyChannel())
    assert signed_post(client, meta_payload(message_id="wamid.later")).status_code == 200
    assert channel.attempts == 0
    assert meta_conversation(client) == []

    drain(client)
    assert len(channel.sent) == 1
    assert [m["direction"] for m in meta_conversation(client)] == ["in", "out"]

    drain(client)
    assert len(channel.sent) == 1


def test_a_job_abandoned_by_a_dead_process_is_picked_up_again(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    channel = use(client, FlakyChannel())
    signed_post(client, meta_payload(message_id="wamid.stuck"))

    async def abandon():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            await conn.execute(
                "update jobs set status = 'running', locked_at = now() - interval '10 minutes'"
            )
        finally:
            await conn.close()

    asyncio.run(abandon())
    drain(client)
    assert len(channel.sent) == 1


def test_delivery_reports_move_a_message_forward_only(client):
    channel = use(client, FlakyChannel())
    signed_post(client, meta_payload(message_id="wamid.report"))

    def report(status):
        payload = {"entry": [{"changes": [{"value": {
            "metadata": {"phone_number_id": NUMBER_ID},
            "statuses": [{"id": "wamid.out.1", "status": status,
                          "errors": [{"title": "blocked"}] if status == "failed" else None}],
        }}]}]}
        assert signed_post(client, payload).status_code == 200
        return [m for m in meta_conversation(client) if m["direction"] == "out"][-1]["status"]

    assert len(channel.sent) == 1
    assert report("read") == "read"
    assert report("delivered") == "read"
    assert report("failed") == "failed"


def test_one_tenant_cannot_see_anothers_jobs():
    async def scenario():
        owner = await asyncpg.connect(OWNER_DSN)
        a, b = uuid4(), uuid4()
        try:
            for tenant_id, name in ((a, "Jobs A"), (b, "Jobs B")):
                await owner.execute(
                    "insert into tenants (id, name) values ($1, $2)", tenant_id, name
                )
        finally:
            await owner.close()
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(a) as conn:
                await conn.execute("insert into jobs (kind) values ('test_only')")
            async with db.tenant(b) as conn:
                seen_by_b = await conn.fetchval(
                    "select count(*) from jobs where kind = 'test_only'"
                )
            async with db.unscoped() as conn:
                seen_unscoped = await conn.fetchval("select count(*) from jobs")
            async with db.tenant(a) as conn:
                await conn.execute("delete from jobs where kind = 'test_only'")
            return seen_by_b, seen_unscoped
        finally:
            await db.close()

    assert asyncio.run(scenario()) == (0, 0)


def test_everything_still_works_through_the_queue_on_the_simulator(client):
    response = client.post(
        "/sim/messages", json={"from_number": AHMED_PHONE, "text": "balance"}
    )
    messages = response.json()["messages"]
    assert [m["status"] for m in messages] == ["received", "sent"]
