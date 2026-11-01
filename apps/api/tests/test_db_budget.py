"""The database connection budget and what happens when it runs out (D-132, ALY-266 PERF-9/10).

Cloud SQL's smallest paid tier allows 50 connections; a rollout puts the old and the new revision
side by side. So a process holds few, a request that cannot get one is answered 503 with
Retry-After in seconds rather than hanging until its caller gives up, a statement that runs too
long is stopped by PostgreSQL, and a download cannot take every connection the screens need.
"""

import asyncio
import time

import asyncpg
import pytest

from alyr.config import get_settings
from alyr.core import export
from alyr.db import Database, PoolBusy
from conftest import APP_DSN
from test_sign_in import sign_in


def run(coro):
    return asyncio.run(coro)


def small(**options) -> Database:
    db = Database(APP_DSN)
    db.configure(**{"pool_max": 2, **options})
    return db


def test_the_default_budget_is_small_enough_for_a_rollout():
    s = get_settings()
    # Six API instances and two workers at once, with room for the migration job and a person.
    assert 6 * s.db_pool_max + 2 * s.db_pool_max_worker <= 44
    assert s.db_acquire_timeout_seconds <= 5
    assert s.db_statement_timeout_ms > 0 and s.db_statement_timeout_ms_worker > 0


def test_a_request_that_cannot_get_a_connection_gives_up_quickly():
    async def go():
        db = small(acquire_timeout=0.2)
        await db.connect()
        try:
            async with db.unscoped(), db.unscoped():  # both connections taken
                started = time.monotonic()
                with pytest.raises(PoolBusy):
                    async with db.unscoped():
                        pass
                assert time.monotonic() - started < 1.0
            async with db.unscoped() as conn:  # and the pool is whole again afterwards
                assert await conn.fetchval("select 1") == 1
            assert db.refused == 1
        finally:
            await db.close()

    run(go())


def test_a_queue_that_is_already_long_is_refused_at_once():
    async def go():
        db = small(acquire_timeout=5.0, max_waiting=1)
        await db.connect()
        try:
            async with db.unscoped(), db.unscoped():
                waiter = asyncio.create_task(_use(db))  # takes the one place in the queue
                await asyncio.sleep(0.1)
                started = time.monotonic()
                with pytest.raises(PoolBusy):
                    await _use(db)  # the queue is full: no waiting at all
                assert time.monotonic() - started < 0.2
                waiter.cancel()
        finally:
            await db.close()

    async def _use(db):
        async with db.unscoped():
            pass

    run(go())


def test_postgres_stops_a_statement_that_runs_too_long():
    async def go():
        db = small(statement_timeout_ms=200)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                assert await conn.fetchval("show statement_timeout") == "200ms"
                with pytest.raises(asyncpg.exceptions.QueryCanceledError):
                    await conn.fetchval("select pg_sleep(2)")
            async with db.unscoped() as conn:  # the connection is still good
                assert await conn.fetchval("select 1") == 1
        finally:
            await db.close()

    run(go())


def test_a_transaction_left_open_is_ended():
    async def go():
        db = small(idle_in_transaction_ms=200)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                with pytest.raises((asyncpg.exceptions.IdleInTransactionSessionTimeoutError,
                                    asyncpg.exceptions.ConnectionDoesNotExistError,
                                    asyncpg.exceptions.InterfaceError)):
                    async with conn.transaction():
                        await conn.fetchval("select 1")
                        await asyncio.sleep(0.6)
                        await conn.fetchval("select 1")
        finally:
            await db.close()

    run(go())


def test_unconfigured_it_behaves_as_before():
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                assert await conn.fetchval("show statement_timeout") == "0"
            assert db.pool.get_max_size() == 10
        finally:
            await db.close()

    run(go())


def test_the_api_answers_503_with_retry_after_when_the_pool_is_exhausted(client, monkeypatch):
    sign_in(client)

    async def never(self):
        raise PoolBusy(3.0, 5)

    monkeypatch.setattr(Database, "_acquire", never)
    answer = client.get("/api/inbox/conversations")
    assert answer.status_code == 503
    assert answer.headers["retry-after"] == "2"
    body = answer.json()
    assert body["code"] == "busy" and body["message_ar"] and body["detail"]


def test_the_api_answers_503_when_a_statement_is_stopped(client, monkeypatch):
    sign_in(client)

    async def too_slow(self, *args, **kwargs):
        raise asyncpg.exceptions.QueryCanceledError("canceling statement due to statement timeout")

    monkeypatch.setattr(asyncpg.Connection, "fetch", too_slow)
    answer = client.get("/api/inbox/conversations")
    assert answer.status_code == 503 and answer.headers["retry-after"] == "2"


def test_downloads_take_at_most_a_few_connections_and_give_them_back():
    taken = [export.take_slot() for _ in range(export.DOWNLOADS_AT_ONCE)]
    try:
        assert all(taken)
        assert export.take_slot() is None
        taken[0].release()
        taken[0].release()  # giving back twice gives back once
        again = export.take_slot()
        assert again is not None
        assert export.take_slot() is None
        again.release()
    finally:
        for slot in taken:
            slot.release()
    last = export.take_slot()
    assert last is not None
    last.release()


def test_a_download_when_all_places_are_taken_is_answered_busy(client):
    sign_in(client)
    slots = [export.take_slot() for _ in range(export.DOWNLOADS_AT_ONCE)]
    try:
        answer = client.get("/api/account/export")
        assert answer.status_code == 503 and answer.headers["retry-after"] == "2"
    finally:
        for slot in slots:
            slot.release()
    assert client.get("/api/account/export").status_code == 200


def test_a_patient_request_joins_a_full_queue_and_waits_longer():
    from alyr.db import patient

    async def go():
        db = small(acquire_timeout=0.4, max_waiting=1)
        await db.connect()
        try:
            async def ordinary():
                async with db.unscoped():
                    pass

            async def webhook():
                patient.set(True)
                async with db.unscoped() as conn:
                    return await conn.fetchval("select 1")

            async with db.unscoped(), db.unscoped():
                first = asyncio.create_task(ordinary())  # takes the queue's one place
                await asyncio.sleep(0.05)
                with pytest.raises(PoolBusy):  # the queue is full: turned away at once
                    await ordinary()
                waiter = asyncio.create_task(webhook())  # joins it all the same
                await asyncio.sleep(0.7)  # the first gave up (0.4 s); this one waits 1.2 s
                with pytest.raises(PoolBusy):
                    await first
                assert not waiter.done()
            assert await asyncio.wait_for(waiter, 2) == 1  # a place came free: it got it
        finally:
            await db.close()

    run(go())


def test_meta_s_webhook_is_patient_and_an_ordinary_request_is_not(client):
    from alyr.db import patient
    from test_whatsapp_webhook import meta_payload, signed_post

    seen: list[bool] = []
    original = Database._acquire

    async def spy(self):
        seen.append(patient.get())
        return await original(self)

    Database._acquire = spy
    try:
        assert signed_post(client, meta_payload("wamid.patient")).status_code == 200
        during_webhook = list(seen)
        seen.clear()
        assert client.get("/api/inbox/conversations").status_code == 200
    finally:
        Database._acquire = original
    assert during_webhook and all(during_webhook)
    assert seen and not any(seen)
