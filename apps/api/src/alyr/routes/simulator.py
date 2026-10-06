from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel

from alyr.channels.base import InboundMessage
from alyr.channels.simulator import SIMULATOR_NUMBER_ID
from alyr.config import get_settings
from alyr.modules.ledger import service
from alyr.seed import DEMO_TENANT_ID, STAFF_PHONE, ensure_demo_tenant, reset_demo_data

router = APIRouter(prefix="/sim", tags=["simulator"])


class SimulatedMessage(BaseModel):
    from_number: str
    text: str = ""
    reply_id: str = ""


async def _conversation(request: Request, number: str) -> dict:
    async with request.app.state.db.tenant(DEMO_TENANT_ID) as conn:
        rows = await conn.fetch(
            "select direction, kind, body, payload, created_at from messages "
            "where phone = $1 order by created_at",
            number,
        )
    return {
        "messages": [
            {**dict(r), "created_at": r["created_at"].isoformat()} for r in rows
        ]
    }


@router.post("/messages")
async def send(body: SimulatedMessage, request: Request) -> dict:
    """Act as a phone sending a WhatsApp message; returns the conversation so far."""
    await request.app.state.inbound.handle(
        InboundMessage(
            channel="simulator",
            message_id=f"sim-{uuid4()}",
            to_number_id=SIMULATOR_NUMBER_ID,
            from_number=body.from_number,
            kind="interactive" if body.reply_id else "text",
            text=body.text,
            reply_id=body.reply_id,
        )
    )
    return await _conversation(request, body.from_number)


@router.get("/conversations/{number}")
async def conversation(number: str, request: Request) -> dict:
    return await _conversation(request, number)


@router.get("/personas")
async def personas(request: Request) -> dict:
    """Who the chat simulator can pretend to be."""
    async with request.app.state.db.tenant(DEMO_TENANT_ID) as conn:
        customers = (await service.summary(conn))["customers"]
    return {
        "staff": {"name": "Yusuf (counter)", "phone": STAFF_PHONE},
        "customers": [
            {"name": c["name"], "phone": c["phone"], "balance_text": c["balance_text"]}
            for c in sorted(customers, key=lambda c: c["phone"])
        ],
    }


@router.post("/reset")
async def reset(request: Request) -> dict:
    """Put the demo shop back to its starting state."""
    settings = get_settings()
    await ensure_demo_tenant(settings.migration_url, settings.meta_phone_number_id)
    await reset_demo_data(request.app.state.db)
    return {"status": "reset"}
