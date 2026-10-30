"""The worker runs several jobs at once, and a customer's jobs one after another
(go-live checklist item 34, ALY-276 PERF-4 and PERF-11).

Real PostgreSQL and the real runner: jobs of a kind made for the test are queued in the demo
shop, the runner claims and runs them, and the handler writes down when each started and
ended. Sends to Meta go through one HTTP client (a recording transport stands in for Meta).
"""

import asyncio
import time
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.channels import meta
from alyr.channels.base import Address, OutboundMessage
from alyr.core import jobs
from alyr.seed import DEMO_TENANT_ID
from test_consent import owner_sql

KIND = "test.lane"


@pytest.fixture
def runner(client_factory, monkeypatch):
    """The app's own runner, with jobs left for the test to drain."""
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    monkeypatch.setenv("ALYR_JOBS_CONCURRENCY", "3")
    client = client_factory()
    log: list[tuple[str, str, float]] = []

    client.app.state.jobs.register(KIND, log_and_wait(log, client))
    yield client, log
    owner_sql("delete from jobs where kind = $1", KIND)


def log_and_wait(log: list, client=None):
    """A handler that writes down when it started and ended, and takes 100 ms."""
    async def handler(tenant_id: UUID, payload: dict) -> None:
        log.append((payload["name"], "start", time.monotonic()))
        await asyncio.sleep(0.1)
        if payload.get("stop"):
            client.app.state.jobs.stop()
        log.append((payload["name"], "end", time.monotonic()))

    return handler


def queue(client, jobs_to_add: list[dict]) -> list[UUID]:
    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return [await jobs.enqueue(conn, KIND, payload) for payload in jobs_to_add]

    return client.portal.call(go)


def drain(client) -> int:
    return client.portal.call(client.app.state.jobs.drain)


def most_at_once(log) -> int:
    running, most = 0, 0
    for _, what, _ in sorted(log, key=lambda e: (e[2], e[1] == "start")):
        running += 1 if what == "start" else -1
        most = max(most, running)
    return most


def test_different_customers_jobs_run_side_by_side_and_one_customers_in_order(runner):
    client, log = runner
    ahmed, mariam = str(uuid4()), str(uuid4())
    queue(client, [
        {"name": "ahmed-1", "contact_id": ahmed},
        {"name": "mariam-1", "contact_id": mariam},
        {"name": "ahmed-2", "contact_id": ahmed},
        {"name": "received-from-mariam", "from_number": "97455512345"},
        {"name": "ahmed-3", "contact_id": ahmed},
        {"name": "report"},
        {"name": "stock-alert"},
    ])
    assert drain(client) >= 7
    took = max(t for _, _, t in log) - min(t for _, _, t in log)

    # Never more at once than the setting allows, but more than one.
    assert 2 <= most_at_once(log) <= 3
    # Seven jobs of 100 ms one after another take 700 ms; Ahmed's three alone take 300.
    assert took < 0.6
    # Ahmed's three ran one after another, in the order they were queued.
    ahmed_events = [(name, what) for name, what, _ in log if name.startswith("ahmed")]
    assert ahmed_events == [
        ("ahmed-1", "start"), ("ahmed-1", "end"), ("ahmed-2", "start"), ("ahmed-2", "end"),
        ("ahmed-3", "start"), ("ahmed-3", "end"),
    ]
    done = owner_sql("select count(*) as n from jobs where kind = $1 and status = 'done'", KIND)
    assert done[0]["n"] == 7


def test_a_send_is_in_its_customers_lane():
    record = {"id": uuid4(), "tenant_id": DEMO_TENANT_ID}
    contact = str(uuid4())
    assert jobs.lane(record | {"payload": {"message_id": "m1", "contact_id": contact}}) == (
        jobs.lane(record | {"payload": {"message_id": "m2", "contact_id": contact}}))
    assert jobs.lane(record | {"payload": {"from_user_id": "QA.1", "from_number": "974"}}) == (
        f"{DEMO_TENANT_ID}:QA.1")
    # A job about no one in particular is in a lane of its own.
    assert jobs.lane(record | {"payload": {"week_start": "2026-10-25"}}) == str(record["id"])


def test_stopping_finishes_what_started_and_puts_the_rest_back(runner):
    """What the worker does on SIGTERM: before, the claimed jobs stayed 'running' until they
    counted as abandoned, five minutes later."""
    client, log = runner
    ahmed = str(uuid4())
    first, second, third = queue(client, [
        {"name": "ahmed-1", "contact_id": ahmed, "stop": True},
        {"name": "ahmed-2", "contact_id": ahmed},
        {"name": "ahmed-3", "contact_id": ahmed},
    ])
    drain(client)
    rows = {r["id"]: (r["status"], r["attempts"]) for r in owner_sql(
        "select id, status, attempts from jobs where id = any($1::uuid[])",
        [first, second, third])}
    assert rows == {first: ("done", 1), second: ("queued", 0), third: ("queued", 0)}
    assert [name for name, what, _ in log if what == "start"] == ["ahmed-1"]


def test_the_meta_channel_keeps_one_connection_for_every_send():
    seen = []

    def meta_answers(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.extensions["timeout"]["read"]))
        return httpx.Response(200, json={"messages": [{"id": f"wamid.{len(seen)}"}]})

    channel = meta.MetaChannel("TOKEN", "v21.0", transport=httpx.MockTransport(meta_answers))
    message = OutboundMessage(to=UUID(int=1), kind="text", body="Your order is ready")

    async def two_sends():
        first = await channel.send("100200", message, Address(phone="97455500001"))
        client = channel._http()
        second = await channel.send("100200", message, Address(phone="97455500001"))
        same = channel._http() is client
        await channel.close()
        return first, second, same

    first, second, same = asyncio.run(two_sends())
    assert (first, second, same) == ("wamid.1", "wamid.2", True)
    # A send still gives up after ten seconds.
    assert seen == [("/v21.0/100200/messages", 10), ("/v21.0/100200/messages", 10)]


# ------------------------------------------------------------------ customers first (PERF-5)

def test_customers_jobs_are_claimed_before_background_ones(runner):
    """Nine on Sunday: every shop's weekly report is due, and a customer writes. Before, the
    customer waited behind every report (ALY-276 PERF-5, p95 166 s at 300 shops)."""
    client, log = runner
    client.app.state.jobs.register("test.report", log_and_wait(log), background=True)
    an_hour_ago = datetime.now(UTC) - timedelta(hours=1)
    reports = [str(uuid4()) for _ in range(8)]

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            for name in reports:
                await jobs.enqueue(conn, "test.report", {"name": f"report-{name}"},
                                   datetime.now(UTC) - timedelta(minutes=1))
            await jobs.enqueue(conn, KIND, {"name": "customer", "contact_id": str(uuid4())})
            # A report that has waited past the limit takes its turn like any other job.
            await jobs.enqueue(conn, "test.report", {"name": "report-late"}, an_hour_ago)

    client.portal.call(go)
    claimed = client.portal.call(client.app.state.jobs._claim)
    # Back in the queue, as if never claimed (another test's job too, if one was due).
    owner_sql("update jobs set status = 'queued', locked_at = null, attempts = attempts - 1 "
              "where id = any($1::uuid[])", [job["id"] for job in claimed])
    names = [job["payload"].get("name") for job in claimed
             if job["kind"] in (KIND, "test.report")]
    on_time = [n for n in names if n.startswith("report-") and n != "report-late"]
    # The customer's job and the late report come first, ahead of reports queued earlier
    # than the customer's; then no more reports than the runner runs at once (3).
    assert set(names[:2]) == {"customer", "report-late"}
    assert 1 <= len(on_time) <= 3
    assert drain(client) >= 10
    assert len([n for n, what, _ in log if what == "end"]) == 10
    owner_sql("delete from jobs where kind = 'test.report'")
