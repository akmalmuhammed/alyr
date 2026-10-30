"""PDFs and report cards are drawn in a process of their own (ALY-276 PERF-8): drawing is
plain CPU work, and in the API's own process it held up every request while it drew."""

import asyncio
import os
import signal

from alyr.core import drawing
from alyr.modules.documents.render import render
from alyr.modules.documents.render.sample import sample_doc


def test_a_receipt_is_drawn_in_another_process_and_comes_back_whole():
    async def go():
        where = await drawing.run(os.getpid)
        pdf = await drawing.run(render, sample_doc("receipt", ("ar", "en"), "a4", number="RC-7"))
        return where, pdf

    where, pdf = asyncio.run(go())
    assert where != os.getpid()
    assert pdf.startswith(b"%PDF-")
    # The same document drawn here gives the same bytes: nothing is lost on the way.
    assert pdf == render(sample_doc("receipt", ("ar", "en"), "a4", number="RC-7"))


def test_a_drawing_process_that_dies_is_replaced():
    async def go():
        first = await drawing.run(os.getpid)
        os.kill(first, signal.SIGKILL)
        second = await drawing.run(os.getpid)
        return first, second

    first, second = asyncio.run(go())
    assert second not in (first, os.getpid())
