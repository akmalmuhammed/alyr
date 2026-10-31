"""Test only: make a simulated send take as long as a send to Meta does.

The simulator channel records a message and returns at once, which hides the one thing that
limits how fast the worker can answer customers: each send waits for Meta (about 300 ms from
Doha, to be measured live). The stack puts this folder on PYTHONPATH for the worker only, so
Python imports this file at start-up and wraps the simulator's `send` with a sleep of
LT_SIM_SEND_MS milliseconds. Nothing in the product's code changes, and nothing here is
shipped in the image.
"""

import asyncio
import os

_MS = float(os.environ.get("LT_SIM_SEND_MS", "0") or 0)

if _MS > 0:
    from alyr.channels.simulator import SimulatorChannel

    _send = SimulatorChannel.send

    async def _slow_send(self, from_number_id, message, address):
        await asyncio.sleep(_MS / 1000)
        return await _send(self, from_number_id, message, address)

    SimulatorChannel.send = _slow_send
