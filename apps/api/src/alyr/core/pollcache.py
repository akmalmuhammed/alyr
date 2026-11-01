"""A few seconds' memory for what the workspace asks for again and again (D-131).

Every open tab asks for its screen every five seconds, and a shop's tabs ask for the same
thing. Without this each ask was its own run of the same queries: the load test of 31 Oct 2026
found 250 open tabs (five in each of 50 shops) enough to keep a 0.5-CPU database at its limit
with no customer doing anything. With it, tabs that ask for the same thing within
`poll_cache_seconds` share one run, and tabs that ask at the same moment wait for the one
already running (single flight) instead of starting another.

What is kept is exactly what a route returned, for one shop and one question; never a key
without the shop. A change made through this process throws away that shop's answers at once
(`invalidate`, called after every write a signed-in person makes), so the person who pressed a
button sees the result on their next look. A change made elsewhere (a customer's message, the
worker, another API instance) shows up within the time to live, which is shorter than a tab's
own five seconds. `ALYR_POLL_CACHE_SECONDS=0` switches it off.
"""

import asyncio
import json
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response

from alyr.modules.items.qty import plain

# The most answers kept at once. One is a few KB to a few hundred KB; the oldest go first.
MAX_ENTRIES = 2000


def write_json(data: dict) -> bytes:
    """What `JSONResponse(jsonable_encoder(plain(data)))` writes, in a quarter of the time: the
    standard encoder with FastAPI's own for anything it does not know (a UUID, a date, a
    Decimal, a model). Writing out 600 orders took 39 ms by the first way and 10 ms by this one,
    on every refresh that was not answered from memory. A dict with keys that are not text takes
    the first way."""
    data = plain(data)
    try:
        return json.dumps(
            data, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":"),
            default=jsonable_encoder,
        ).encode("utf-8")
    except TypeError:
        return JSONResponse(content=jsonable_encoder(data)).body


class PollCache:
    def __init__(self, seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.seconds = seconds
        self._clock = clock
        # (shop, how many times its answers were thrown away, the question) -> (dies at, future)
        self._entries: OrderedDict[tuple, tuple[float, asyncio.Future]] = OrderedDict()
        self._epoch: dict[UUID, int] = {}
        self.hits = 0
        self.misses = 0

    def invalidate(self, tenant_id: UUID) -> None:
        """Throw away this shop's answers: what a person just changed must show at once."""
        self._epoch[tenant_id] = self._epoch.get(tenant_id, 0) + 1

    async def get[T](
        self, tenant_id: UUID, question: tuple, compute: Callable[[], Awaitable[T]],
        seconds: float | None = None,
    ) -> T:
        """The answer to `question` for this shop: the one kept, or the one being worked out,
        or `compute()`. `question` names everything the answer depends on besides the shop
        (the route, its arguments, the person's role or ID when the answer differs by it)."""
        # A route may ask for a different time (a dashboard keeps its answer longer), but never to
        # keep one where the memory is switched off.
        life = 0.0 if self.seconds <= 0 else (self.seconds if seconds is None else seconds)
        if life <= 0:
            return await compute()
        key = (tenant_id, self._epoch.get(tenant_id, 0), question)
        now = self._clock()
        found = self._entries.get(key)
        if found is not None and found[0] > now:
            self._entries.move_to_end(key)
            try:
                value = await asyncio.shield(found[1])
                self.hits += 1
                return value
            except asyncio.CancelledError:
                task = asyncio.current_task()
                if task is not None and task.cancelling():
                    raise  # it is this request that was cancelled
                # The request that was working it out was cancelled (its caller went away):
                # work it out here.
        self.misses += 1
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._entries[key] = (now + life, future)
        self._entries.move_to_end(key)
        while len(self._entries) > MAX_ENTRIES:
            self._entries.popitem(last=False)
        try:
            value = await compute()
        except asyncio.CancelledError:
            if self._entries.get(key, (0, None))[1] is future:
                del self._entries[key]
            future.cancel()
            raise
        except BaseException as error:
            # A refusal or a failure is not kept: the next ask tries again. Those already
            # waiting on it get the same answer.
            if self._entries.get(key, (0, None))[1] is future:
                del self._entries[key]
            future.set_exception(error)
            future.exception()  # read here, so nobody waiting is not an "unretrieved" warning
            raise
        future.set_result(value)
        return value

    async def get_json(
        self, tenant_id: UUID, question: tuple, compute: Callable[[], Awaitable[dict]],
        seconds: float | None = None,
    ) -> Response:
        """Like `get`, for a route that answers JSON: what is kept is the answer already written
        out, so a tab that gets a kept answer costs no encoding. Writing out a list of 600 orders
        took more of the API's one CPU than reading it from the database did."""

        async def written() -> bytes:
            return write_json(await compute())

        body = await self.get(tenant_id, question, written, seconds)
        return Response(content=body, media_type="application/json")
