"""Drawing in a process of its own (ALY-276 PERF-8).

A document's PDF and the weekly report card are plain CPU work. Drawn in the event loop, or
in a thread (which holds the interpreter's lock while it draws), they held up everything else
the process was doing: a webhook from Meta, a customer's order page, a message on its way.
Here they are drawn by one process beside the API or the worker, started the first time
something is drawn. Measured on one CPU, 24 receipts drawn four at a time: the event loop's
delay was 65 ms at the 95th percentile with threads, 1 ms with this process, in the same
total time.

One process, because each instance has one CPU (`infra/gcp/setup.sh`); a second would only
share it. What is sent to the process goes by pickle: a plain module function and plain data.
"""

import asyncio
import multiprocessing
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool

PROCESSES = 1

_pool: ProcessPoolExecutor | None = None


def _executor() -> ProcessPoolExecutor:
    global _pool
    if _pool is None:
        # "spawn": a fresh interpreter, never a copy of this one's open connections and loop.
        _pool = ProcessPoolExecutor(PROCESSES, mp_context=multiprocessing.get_context("spawn"))
    return _pool


async def run[T](fn: Callable[..., T], *args: object) -> T:
    """`fn(*args)` in the drawing process."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(_executor(), fn, *args)
    except BrokenProcessPool:
        # The drawing process died (killed, or out of memory): start another, try once more.
        shutdown()
        return await loop.run_in_executor(_executor(), fn, *args)


def shutdown() -> None:
    """Stop the drawing process. It also stops on its own when this process exits."""
    global _pool
    if _pool is not None:
        _pool.shutdown(wait=False, cancel_futures=True)
        _pool = None
