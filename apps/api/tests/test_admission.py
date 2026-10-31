"""Only so many at once, and the rest told to come back (D-132, core/admission.py)."""

import asyncio

import httpx
import pytest

from alyr.core.admission import BUSY, Admission, ShedWhenBusy
from alyr.db import PoolBusy


def test_two_draw_at_once_six_wait_and_the_rest_are_refused_in_a_moment():
    async def go():
        gate = Admission(running=2, waiting=3)
        release = asyncio.Event()
        order: list[str] = []

        async def draw(name: str):
            async with gate.slot():
                order.append(name)
                await release.wait()

        tasks = [asyncio.create_task(draw(f"r{n}")) for n in range(5)]
        await asyncio.sleep(0.05)
        assert gate.running == 2 and gate.waiting == 3
        with pytest.raises(PoolBusy):
            async with gate.slot():
                pass
        assert gate.refused == 1
        release.set()
        await asyncio.gather(*tasks)
        assert order == ["r0", "r1", "r2", "r3", "r4"]  # in the order they asked
        assert gate.running == 0 and gate.waiting == 0
        async with gate.slot():  # and it works again
            pass

    asyncio.run(go())


def test_a_place_is_given_back_when_the_work_fails():
    async def go():
        gate = Admission(running=1, waiting=0)
        with pytest.raises(RuntimeError):
            async with gate.slot():
                raise RuntimeError("could not draw")
        async with gate.slot():
            pass

    asyncio.run(go())


def test_a_waiter_that_goes_away_does_not_keep_a_place():
    async def go():
        gate = Admission(running=1, waiting=2)
        hold = asyncio.Event()

        async def holder():
            async with gate.slot():
                await hold.wait()

        first = asyncio.create_task(holder())
        await asyncio.sleep(0.01)
        waiter = asyncio.create_task(holder())
        await asyncio.sleep(0.01)
        assert gate.waiting == 1
        waiter.cancel()
        await asyncio.sleep(0.01)
        assert gate.waiting == 0
        hold.set()
        await first
        async with gate.slot():
            pass

    asyncio.run(go())


def slow_app(hold: asyncio.Event):
    async def app(scope, receive, send):
        if scope["type"] != "http":
            return
        if scope["path"] != "/health":
            await hold.wait()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})
    return app


def test_requests_over_the_limit_are_answered_503_with_retry_after_at_once():
    async def go():
        hold = asyncio.Event()
        shed = ShedWhenBusy(slow_app(hold), limit=3)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=shed),
                                     base_url="http://x") as http:
            inside = [asyncio.create_task(http.get("/api/a")) for _ in range(3)]
            await asyncio.sleep(0.05)
            refused = await asyncio.wait_for(http.get("/api/a"), timeout=1)
            assert refused.status_code == 503 and refused.headers["retry-after"] == "1"
            assert refused.json() == BUSY
            # Health checks and Meta's webhooks are never turned away.
            assert (await http.get("/health")).status_code == 200
            hook = asyncio.create_task(http.post("/webhooks/whatsapp"))
            await asyncio.sleep(0.05)
            assert not hook.done()  # it is let in (and waits like the rest), not refused
            hold.set()
            assert [r.status_code for r in await asyncio.gather(*inside, hook)] == [200] * 4
            assert (await http.get("/api/a")).status_code == 200  # room again
        assert shed.refused == 1 and shed.in_progress == 0

    asyncio.run(go())


def test_a_limit_of_zero_means_no_limit():
    async def go():
        hold = asyncio.Event()
        hold.set()
        shed = ShedWhenBusy(slow_app(hold), limit=0)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=shed),
                                     base_url="http://x") as http:
            answers = await asyncio.gather(*(http.get("/api/a") for _ in range(20)))
        assert {a.status_code for a in answers} == {200}

    asyncio.run(go())


def test_the_busy_words_are_in_both_languages_and_promise_nothing():
    assert BUSY["detail"] and BUSY["message_ar"]
    for word in ("soon", "قريباً"):
        assert word not in BUSY["detail"] + BUSY["message_ar"]


def test_a_document_route_answers_busy_when_the_gate_turns_it_away(client_factory, monkeypatch):
    from alyr.core import admission
    from documents_support import configured_shop, draft_body

    shop = configured_shop(client_factory, monkeypatch)
    drafted = shop.owner.post("/api/documents", json=draft_body())
    assert drafted.status_code == 201
    doc_id = drafted.json()["document"]["id"]
    # The draw is turned away by the gate: the shop is told to try again, nothing is issued.
    from contextlib import asynccontextmanager

    from alyr.db import PoolBusy

    @asynccontextmanager
    async def full():
        raise PoolBusy(0.0, 6)
        yield

    monkeypatch.setattr(admission.renders, "slot", full)
    key = {"Idempotency-Key": "k" * 12}
    answer = shop.owner.post(f"/api/documents/{doc_id}/issue", headers=key)
    assert answer.status_code == 503 and answer.headers["retry-after"] == "2"
    assert answer.json()["code"] == "busy"
    # A place comes free and the same request goes through: the number was not spent.
    monkeypatch.setattr(admission, "renders", admission.Admission(running=2, waiting=2))
    again = shop.owner.post(f"/api/documents/{doc_id}/issue", headers=key)
    assert again.status_code == 200, again.text
