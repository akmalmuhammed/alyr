"""Proof that a concurrency test really was concurrent (ALY-110).

A test that starts two threads and checks that one of two buyers won does not show that the
two requests ever met at the thing being protected: the first may have finished before the
second began, or something else may have put them in a queue first (found in this package:
two first orders of a new shop queued behind each other creating the shop's default price
group, so the stock row was never contended and the test would have passed with no
protection on the stock at all). Three things in this module make the meeting certain, and
observable from outside the code under test:

* `warm` makes the shop's first-use rows exist, so nothing but the thing under test queues.
* `hold_open` makes a step of the code under test take a little while *inside its
  transaction*, so that whoever arrives meanwhile has to arrive while the first still holds
  its row.
* `LockWatch` watches the database from another connection, every few milliseconds, for a
  session waiting on another one (`pg_blocking_pids`) while it runs a statement that names a
  given table. That is the one thing two requests that merely took turns can never show.
  A test asserts `watch.blocked >= 1`.
"""

import asyncio
import threading

import asyncpg

from conftest import OWNER_DSN

BLOCKED = (
    "select count(*) as n, coalesce(min(left(w.query, 90)), '') as sample "
    "from pg_stat_activity w where w.datname = current_database() "
    "and w.pid <> pg_backend_pid() and cardinality(pg_blocking_pids(w.pid)) > 0 "
    "and w.query ilike '%' || $1 || '%'"
)


def warm(client) -> None:
    """Make what a shop makes the first time it is used, so two first requests are not
    queued behind each other for it: the default price group."""
    assert client.get("/api/price-groups").status_code == 200


class LockWatch:
    """While it is open, looks every 5 ms for a database session that is waiting for another
    one while running a statement that names `table`. `blocked` is the most that were
    waiting at once, `looks` how often it looked, and `sample` the start of a waiting
    statement (to say what waited)."""

    def __init__(self, table: str) -> None:
        self.table = table
        self.blocked = 0
        self.looks = 0
        self.sample = ""
        self._stop = threading.Event()
        self._ready = threading.Event()
        self._thread = threading.Thread(target=lambda: asyncio.run(self._watch()), daemon=True)

    async def _watch(self) -> None:
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            self._ready.set()
            while not self._stop.is_set():
                row = await conn.fetchrow(BLOCKED, self.table)
                self.looks += 1
                if row["n"] > self.blocked:
                    self.blocked, self.sample = row["n"], row["sample"]
                await asyncio.sleep(0.005)
        finally:
            await conn.close()

    def __enter__(self) -> "LockWatch":
        self._thread.start()
        assert self._ready.wait(10), "the watcher could not connect"
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        self._thread.join(10)

    def __str__(self) -> str:
        return (f"{self.blocked} waiting on {self.table} at most, in {self.looks} looks "
                f"({self.sample})")


def hold_open(monkeypatch, owner, name: str, seconds: float = 0.35) -> threading.Event:
    """Make `owner.name` (an async function) take `seconds` longer *after* it has done its
    work, still inside the caller's transaction. Whatever it changed stays locked meanwhile,
    so a second request that wants the same row must wait for it. The returned event is set
    when the first call has done its work and started to wait: a test that wants the other
    side to come second waits for it instead of guessing a delay."""
    real = getattr(owner, name)
    entered = threading.Event()

    async def slower(*args, **kwargs):
        result = await real(*args, **kwargs)
        entered.set()
        await asyncio.sleep(seconds)
        return result

    monkeypatch.setattr(owner, name, slower)
    return entered
