from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from alyr.channels.base import InboundMessage
from alyr.channels.simulator import SIMULATOR_NUMBER_ID
from alyr.config import get_settings
from alyr.modules.ledger import service
from alyr.seed import DEMO_TENANT_ID, STAFF_PHONE, ensure_demo_tenant, reset_demo_data

router = APIRouter(prefix="/sim", tags=["simulator"])


class SimulatedMessage(BaseModel):
    """A phone sending a WhatsApp message. Give a number, a user ID, or both, as Meta does.
    A customer who uses a WhatsApp username arrives with a user ID and no number."""

    from_number: str = ""
    from_user_id: str = ""
    username: str = ""
    text: str = ""
    reply_id: str = ""


def _is_user_id(key: str) -> bool:
    # Meta's user IDs look like "QA.1234…": a country code, a dot, then the ID.
    return "." in key


async def _conversation(request: Request, key: str) -> dict:
    """`key` is a phone number or a WhatsApp user ID."""
    column = "wa_user_id" if _is_user_id(key) else "phone"
    async with request.app.state.db.tenant(DEMO_TENANT_ID) as conn:
        rows = await conn.fetch(
            "select m.direction, m.kind, m.body, m.payload, m.created_at "
            f"from messages m join contacts c on c.id = m.contact_id where c.{column} = $1 "
            "order by m.created_at",
            key,
        )
    return {
        "messages": [
            {**dict(r), "created_at": r["created_at"].isoformat()} for r in rows
        ]
    }


@router.post("/messages")
async def send(body: SimulatedMessage, request: Request) -> dict:
    """Act as a phone sending a WhatsApp message; returns the conversation so far."""
    if not (body.from_number or body.from_user_id):
        raise HTTPException(status_code=422, detail="give from_number or from_user_id")
    await request.app.state.inbound.handle(
        InboundMessage(
            channel="simulator",
            message_id=f"sim-{uuid4()}",
            to_number_id=SIMULATOR_NUMBER_ID,
            kind="interactive" if body.reply_id else "text",
            from_number=body.from_number,
            from_user_id=body.from_user_id,
            username=body.username,
            text=body.text,
            reply_id=body.reply_id,
        )
    )
    return await _conversation(request, body.from_user_id or body.from_number)


@router.get("/conversations/{key}")
async def conversation(key: str, request: Request) -> dict:
    return await _conversation(request, key)


@router.get("/personas")
async def personas(request: Request) -> dict:
    """Who the chat simulator can pretend to be."""
    async with request.app.state.db.tenant(DEMO_TENANT_ID) as conn:
        customers = (await service.summary(conn))["customers"]
    return {
        "staff": {"name": "Yusuf (counter)", "phone": STAFF_PHONE, "user_id": None},
        "customers": [
            {
                "name": c["name"], "phone": c["phone"], "user_id": c["user_id"],
                "username": c["username"], "balance_text": c["balance_text"],
            }
            for c in sorted(customers, key=lambda c: c["name"])
        ],
    }


@router.post("/reset")
async def reset(request: Request) -> dict:
    """Put the demo shop back to its starting state."""
    settings = get_settings()
    await ensure_demo_tenant(
        settings.migration_url, settings.meta_phone_number_id, settings.meta_waba_id
    )
    await reset_demo_data(request.app.state.db)
    return {"status": "reset"}
