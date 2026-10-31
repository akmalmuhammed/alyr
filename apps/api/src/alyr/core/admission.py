"""Let only so many through at once, and refuse the rest in a moment (D-132).

Drawing a receipt takes about 0.15 s of a CPU and a database connection held for the whole of
it (the number is taken in the same transaction). Ten receipts asked for at once held every
connection of the process for seconds, and every other request waited behind them: the load
test of 31 Oct 2026 measured a page that normally answers in 20 ms taking 7 s while a shop issued
8 receipts a second. A route that draws asks here first, before it opens a transaction:
at most `running` draw at once, up to `waiting` more wait their turn with no connection held,
and a request that would make the queue longer is answered 503 with Retry-After at once.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from alyr.db import PoolBusy

# What a caller is told when it is turned away (the API's 503 handler says the same).
BUSY = {
    "detail": "ALYR is busy for a moment. Try again in a few seconds.",
    "message_ar": "ALYR مشغول للحظات. حاول مرة أخرى بعد ثوانٍ.",
    "code": "busy",
}
BODY = json.dumps(BUSY, ensure_ascii=False).encode()


class Admission:
    def __init__(self, running: int, waiting: int) -> None:
        self._running_limit = running
        self._waiting_limit = waiting
        self._loop: asyncio.AbstractEventLoop | None = None
        self._gate = asyncio.Semaphore(running)
        self.waiting = 0
        self.refused = 0

    @property
    def running(self) -> int:
        return self._running_limit - self._gate._value  # noqa: SLF001 - the semaphore's count

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        """Hold a place while the body runs. Raises `PoolBusy` when the queue is already full."""
        loop = asyncio.get_running_loop()
        if loop is not self._loop:  # one event loop in production; a test starts several
            self._loop, self._gate, self.waiting = loop, asyncio.Semaphore(self._running_limit), 0
        if self._gate.locked() and self.waiting >= self._waiting_limit:
            self.refused += 1
            raise PoolBusy(0.0, self.waiting)
        self.waiting += 1
        try:
            await self._gate.acquire()
        finally:
            self.waiting -= 1
        try:
            yield
        finally:
            self._gate.release()


# Receipts, invoices, credit notes and their pictures. Two at once leaves the process's other
# connections to everything else; six waiting is about a second of work at 150 ms each.
renders = Admission(running=2, waiting=6)


class ShedWhenBusy:
    """Answer 503 with Retry-After at once when this process already has `limit` requests in
    progress. Past that point more requests only make every one of them slower; the caller
    is better told to come back in a second than left to wait the half minute after which it
    gives up (the load test's spike took 60 s to clear). Health checks and Meta's webhooks are
    never refused: the first is how the platform decides to send traffic here, and the second
    only queues a job."""

    def __init__(self, app, limit: int) -> None:
        self.app, self.limit = app, limit
        self.in_progress = 0
        self.refused = 0

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "")
        if (scope["type"] != "http" or self.limit <= 0 or path.startswith("/health")
                or path.startswith("/webhooks/")):
            await self.app(scope, receive, send)
            return
        if self.in_progress >= self.limit:
            self.refused += 1
            body = BODY
            await send({"type": "http.response.start", "status": 503, "headers": [
                (b"content-type", b"application/json"), (b"retry-after", b"1"),
                (b"content-length", str(len(body)).encode()),
            ]})
            await send({"type": "http.response.body", "body": body})
            return
        self.in_progress += 1
        try:
            await self.app(scope, receive, send)
        finally:
            self.in_progress -= 1
