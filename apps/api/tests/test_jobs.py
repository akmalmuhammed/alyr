"""Job queue and outbox (D-010): nothing is lost when a channel fails or a process dies."""

import asyncio
from uuid import uuid4

import asyncpg
import pytest

from alyr.core import jobs
from alyr.db import Database
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
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


def test_a_runner_looks_for_abandoned_jobs_once_a_minute_not_on_every_claim(
    client_factory, monkeypatch
):
    """Looking on every claim was most of the database's time in a burst of messages
    (ALY-275). A job counts as abandoned only after five minutes, so a minute more is nothing."""
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    channel = use(client, FlakyChannel())
    drain(client)  # the minute's look happens here, and finds nothing of ours
    signed_post(client, meta_payload(message_id="wamid.abandoned-later"))

    async def abandon():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            await conn.execute(
                "update jobs set status = 'running', locked_at = now() - interval '10 minutes' "
                "where status = 'queued' and payload::text like '%wamid.abandoned-later%'"
            )
        finally:
            await conn.close()

    asyncio.run(abandon())
    drain(client)
    assert channel.sent == []  # looked less than a minute ago
    client.app.state.jobs._reclaimed_at -= jobs.RECLAIM_EVERY_SECONDS
    drain(client)
    assert len(channel.sent) == 1


def test_a_job_can_ask_for_more_attempts_and_its_retry_delay_stops_growing(
    client_factory, monkeypatch
):
    """Work that may wait hours for an outside service (a photo waiting for the store,
    ALY-103) asks for many attempts, and no single wait passes an hour."""
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "5")
    client = client_factory()

    async def never(tenant_id, payload):
        raise ConnectionError("still down")

    client.app.state.jobs.register("test.cap", never)

    async def queue():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            plain = await jobs.enqueue(conn, "test.cap", {})
            patient = await jobs.enqueue(conn, "test.cap", {}, max_attempts=48)
            return plain, patient

    plain, patient = client.portal.call(queue)

    async def attempts():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return [r["max_attempts"] for r in await conn.fetch(
                "select max_attempts from jobs where id = any($1) order by max_attempts",
                [plain, patient])]
        finally:
            await conn.close()

    assert asyncio.run(attempts()) == [6, 48]

    async def late():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            # On its 20th try, 5 * 2**19 seconds would be a month without the cap.
            await conn.execute(
                "update jobs set attempts = 19, run_at = now(), status = 'queued' where id = $1",
                patient,
            )
            await conn.execute("update jobs set status = 'failed' where id = $1", plain)
            return None
        finally:
            await conn.close()

    asyncio.run(late())
    drain(client)

    async def wait():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            seconds = await conn.fetchval(
                "select extract(epoch from run_at - now()) from jobs where id = $1", patient
            )
            await conn.execute("delete from jobs where kind = 'test.cap'")
            return seconds
        finally:
            await conn.close()

    assert 3500 < asyncio.run(wait()) <= 3600


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
