"""The few seconds' memory behind the workspace's polling (D-131, core/pollcache.py).

The rules are exact: an answer is shared only inside one shop and for one question; a failure
is not kept; a person's own change is never hidden from them; and one slow run is shared by
everyone who asks while it works, not run again for each.
"""

import asyncio
from uuid import uuid4

import pytest

from alyr.core.pollcache import PollCache
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
from test_consent import ahmed, owner_sql, say
from test_sign_in import sign_in


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def counted():
    calls = {"n": 0}

    async def compute():
        calls["n"] += 1
        return {"run": calls["n"]}

    return calls, compute


def test_an_answer_is_shared_until_it_runs_out():
    async def go():
        clock = Clock()
        cache = PollCache(3.0, clock)
        tenant = uuid4()
        calls, compute = counted()
        first = await cache.get(tenant, ("list",), compute)
        clock.now += 2.9
        assert await cache.get(tenant, ("list",), compute) == first
        assert calls["n"] == 1
        clock.now += 0.2
        assert (await cache.get(tenant, ("list",), compute))["run"] == 2

    asyncio.run(go())


def test_two_shops_never_share_an_answer():
    async def go():
        cache = PollCache(3.0, Clock())
        a, b = uuid4(), uuid4()

        async def for_a():
            return "a's orders"

        async def for_b():
            return "b's orders"

        assert await cache.get(a, ("orders",), for_a) == "a's orders"
        assert await cache.get(b, ("orders",), for_b) == "b's orders"
        assert await cache.get(a, ("orders",), for_b) == "a's orders"

    asyncio.run(go())


def test_different_questions_do_not_share_an_answer():
    async def go():
        cache = PollCache(3.0, Clock())
        tenant = uuid4()
        calls, compute = counted()
        await cache.get(tenant, ("agent", "en", "owner"), compute)
        await cache.get(tenant, ("agent", "ar", "owner"), compute)
        await cache.get(tenant, ("agent", "en", "agent"), compute)
        assert calls["n"] == 3

    asyncio.run(go())


def test_a_change_made_here_throws_the_shops_answers_away():
    async def go():
        cache = PollCache(3.0, Clock())
        tenant, other = uuid4(), uuid4()
        calls, compute = counted()
        await cache.get(tenant, ("list",), compute)
        await cache.get(other, ("list",), compute)
        cache.invalidate(tenant)
        assert (await cache.get(tenant, ("list",), compute))["run"] == 3
        assert (await cache.get(other, ("list",), compute))["run"] == 2  # not touched

    asyncio.run(go())


def test_tabs_that_ask_at_the_same_moment_wait_for_one_run():
    async def go():
        cache = PollCache(3.0, Clock())
        tenant = uuid4()
        started = {"n": 0}
        release = asyncio.Event()

        async def slow():
            started["n"] += 1
            await release.wait()
            return "done"

        askers = [asyncio.create_task(cache.get(tenant, ("list",), slow)) for _ in range(10)]
        await asyncio.sleep(0.01)
        release.set()
        assert await asyncio.gather(*askers) == ["done"] * 10
        assert started["n"] == 1

    asyncio.run(go())


def test_a_failure_is_not_kept_and_reaches_everyone_waiting():
    async def go():
        cache = PollCache(3.0, Clock())
        tenant = uuid4()
        release = asyncio.Event()

        async def fails():
            await release.wait()
            raise RuntimeError("database away")

        waiting = [asyncio.create_task(cache.get(tenant, ("list",), fails)) for _ in range(3)]
        await asyncio.sleep(0.01)
        release.set()
        results = await asyncio.gather(*waiting, return_exceptions=True)
        assert all(isinstance(r, RuntimeError) for r in results)
        calls, compute = counted()
        assert (await cache.get(tenant, ("list",), compute))["run"] == 1  # asked again, works

    asyncio.run(go())


def test_when_the_asker_that_was_working_goes_away_the_next_one_does_the_work():
    async def go():
        cache = PollCache(3.0, Clock())
        tenant = uuid4()
        gate = asyncio.Event()

        async def never():
            await gate.wait()

        first = asyncio.create_task(cache.get(tenant, ("list",), never))
        await asyncio.sleep(0.01)
        second = asyncio.create_task(cache.get(tenant, ("list",), counted()[1]))
        await asyncio.sleep(0.01)
        first.cancel()
        assert (await second) == {"run": 1}

    asyncio.run(go())


def test_it_holds_a_bounded_number_of_answers():
    async def go():
        cache = PollCache(60.0, Clock())
        tenant = uuid4()
        calls, compute = counted()
        for n in range(2500):
            await cache.get(tenant, ("q", n), compute)
        assert len(cache._entries) <= 2000

    asyncio.run(go())


def test_zero_seconds_means_off():
    async def go():
        cache = PollCache(0, Clock())
        calls, compute = counted()
        await cache.get(uuid4(), ("x",), compute)
        await cache.get(uuid4(), ("x",), compute)
        assert calls["n"] == 2

    asyncio.run(go())


# ------------------------------------------------------------------ through the real routes

@pytest.fixture
def kept(client):
    """The app with the memory switched on, as in production."""
    client.app.state.poll.seconds = 60.0
    return client


def test_the_inbox_list_is_shared_but_a_change_made_through_the_api_shows_at_once(kept):
    say(kept, AHMED_PHONE, "hello")
    contact_id = ahmed(kept)["id"]
    first = kept.get("/api/inbox/conversations").json()
    assert len(first["conversations"]) == 1
    # Someone else's change (the worker, a customer): the shop's tabs see it when the answer
    # runs out, not before.
    owner_sql("update contacts set name = 'Changed elsewhere' where id = $1::uuid", contact_id)
    assert kept.get("/api/inbox/conversations").json() == first
    # Their own change shows at once.
    assert kept.post(f"/api/inbox/conversations/{contact_id}/status",
                     json={"status": "closed"}).status_code == 200
    assert kept.get("/api/inbox/conversations").json()["conversations"] == []


def test_a_refusal_is_not_remembered(kept):
    missing = uuid4()
    assert kept.get(f"/api/inbox/conversations/{missing}").status_code == 404
    say(kept, AHMED_PHONE, "hello")
    assert kept.get(f"/api/inbox/conversations/{ahmed(kept)['id']}").status_code == 200


def test_the_memory_is_off_on_a_developer_machine_unless_asked_for(client):
    assert client.app.state.poll.seconds == 0


def test_a_shops_answer_is_kept_under_the_shops_id_only():
    cache = PollCache(60.0, Clock())

    async def go():
        async def mine():
            return "mine"

        await cache.get(DEMO_TENANT_ID, ("inbox", "open", "any", None), mine)
        assert all(key[0] == DEMO_TENANT_ID for key in cache._entries)

    asyncio.run(go())


# ------------------------------------------------------------- who is signed in, which modules

def test_a_session_is_remembered_but_only_when_it_was_found():
    from alyr.core.shopcache import SessionCache

    async def go():
        clock = Clock()
        cache = SessionCache(3.0, clock)
        lookups = {"n": 0}
        from alyr.core import auth

        original = auth.resolve

        async def fake(db, token):
            lookups["n"] += 1
            return None if token == "wrong" else auth.Staff(None, "A", "a@x", "owner", uuid4())

        auth.resolve = fake
        try:
            await cache.resolve(None, "good")
            await cache.resolve(None, "good")
            assert lookups["n"] == 1
            await cache.resolve(None, "wrong")
            await cache.resolve(None, "wrong")
            assert lookups["n"] == 3  # not kept: a made-up cookie fills nothing
            clock.now += 3.1
            await cache.resolve(None, "good")
            assert lookups["n"] == 4
            cache.forget("good")
            await cache.resolve(None, "good")
            assert lookups["n"] == 5  # signing out here ends it here at once
        finally:
            auth.resolve = original

    asyncio.run(go())


def test_signing_out_through_the_api_ends_the_session_at_once(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    client.app.state.sessions.seconds = 60.0
    sign_in(client)
    assert client.get("/api/inbox/conversations").status_code == 200
    assert client.get("/api/inbox/conversations").status_code == 200  # from memory
    client.post("/api/auth/logout")
    assert client.get("/api/inbox/conversations").status_code == 401


def test_a_shop_found_by_its_address_is_remembered_with_its_modules(client):
    from alyr.core.shopcache import ShopCache

    cache = ShopCache(60.0, Clock())
    db = client.app.state.db

    def find(slug):
        async def go():
            return await cache.find(db, slug)
        return client.portal.call(go)

    shop, modules = find("al-noor")
    assert shop is not None and "orders" in modules
    owner_sql("update tenant_modules set enabled = false where tenant_id = $1 "
              "and module_key = 'orders'", DEMO_TENANT_ID)
    try:
        assert "orders" in find("al-noor")[1]  # still the remembered answer
        cache.forget_tenant(DEMO_TENANT_ID)
        assert "orders" not in find("al-noor")[1]
    finally:
        owner_sql("update tenant_modules set enabled = true where tenant_id = $1 "
                  "and module_key = 'orders'", DEMO_TENANT_ID)
    assert find("no-such-shop") == (None, frozenset())


def test_a_signed_in_persons_own_change_shows_at_once_but_anothers_shop_is_untouched(
    client_factory, monkeypatch,
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    client.app.state.poll.seconds = 60.0
    sign_in(client)
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    first = client.get("/api/inbox/conversations").json()
    assert len(first["conversations"]) == 1
    owner_sql("update contacts set name = 'Changed elsewhere' where id = $1::uuid", contact_id)
    assert client.get("/api/inbox/conversations").json() == first  # kept, from outside
    assert client.post(f"/api/inbox/conversations/{contact_id}/status",
                       json={"status": "closed"}).status_code == 200
    assert client.get("/api/inbox/conversations").json()["conversations"] == []  # their own: now


def test_the_json_kept_is_byte_for_byte_what_the_framework_would_have_written():
    from datetime import UTC, date, datetime
    from decimal import Decimal
    from enum import Enum

    from fastapi.encoders import jsonable_encoder
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel

    from alyr.core.pollcache import write_json
    from alyr.modules.items.qty import plain

    class Colour(Enum):
        RED = "red"

    class Row(BaseModel):
        name: str
        at: datetime

    sample = {
        "id": uuid4(), "when": datetime(2026, 10, 31, 9, 30, tzinfo=UTC), "day": date(2026, 11, 1),
        "qty": Decimal("2.5"), "whole": Decimal("3"), "name": "كعكة التمر · Date cake",
        "nothing": None, "yes": True, "list": [1, 2.5, "x", {"deep": uuid4()}],
        "enum": Colour.RED, "model": Row(name="a", at=datetime(2026, 1, 1, tzinfo=UTC)),
        "tuple": (1, 2), "set": {1},
    }
    expected = JSONResponse(content=jsonable_encoder(plain(sample))).body
    assert write_json(sample) == expected
    # Keys that are not text take the framework's way and still come out the same.
    keyed = {"by": {uuid4(): 1}}
    assert write_json(keyed) == JSONResponse(content=jsonable_encoder(plain(keyed))).body


def test_a_route_cannot_ask_for_a_time_where_the_memory_is_off():
    async def go():
        cache = PollCache(0, Clock())
        calls, compute = counted()
        await cache.get(uuid4(), ("agent",), compute, seconds=15.0)
        await cache.get(uuid4(), ("agent",), compute, seconds=15.0)
        assert calls["n"] == 2
        tenant = uuid4()
        on = PollCache(3.0, Clock())
        calls, compute = counted()
        await on.get(tenant, ("agent",), compute, seconds=15.0)
        on._clock.now += 10
        await on.get(tenant, ("agent",), compute, seconds=15.0)
        assert calls["n"] == 1  # a longer time than the default, where the memory is on

    asyncio.run(go())


def test_the_customers_order_page_is_never_kept_by_a_shared_cache_even_when_answered_from_memory(
    client,
):
    client.app.state.poll.seconds = 60.0
    for _ in range(2):  # the second answer comes from memory
        answer = client.get("/api/store/al-noor?limit=5")
        assert answer.status_code == 200
        assert answer.headers["cache-control"] == "private, no-store"
        assert answer.headers["vary"] == "X-Order-Link"
