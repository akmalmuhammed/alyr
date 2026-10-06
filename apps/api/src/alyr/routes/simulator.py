from dataclasses import asdict
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel

from alyr.channels.base import InboundMessage
from alyr.channels.simulator import SIMULATOR_NUMBER_ID

router = APIRouter(prefix="/sim", tags=["simulator"])


class SimulatedMessage(BaseModel):
    from_number: str
    text: str = ""
    reply_id: str = ""


@router.post("/messages")
async def send(body: SimulatedMessage, request: Request) -> dict:
    """Act as a customer sending a message; returns everything sent to them so far."""
    channel = request.app.state.simulator_channel
    message = InboundMessage(
        channel="simulator",
        message_id=f"sim-{uuid4()}",
        to_number_id=SIMULATOR_NUMBER_ID,
        from_number=body.from_number,
        kind="interactive" if body.reply_id else "text",
        text=body.text,
        reply_id=body.reply_id,
    )
    await request.app.state.inbound.handle(message, channel)
    return {"messages": [asdict(m) for m in channel.sent_to(body.from_number)]}


@router.get("/conversations/{number}")
async def conversation(number: str, request: Request) -> dict:
    channel = request.app.state.simulator_channel
    return {"messages": [asdict(m) for m in channel.sent_to(number)]}
