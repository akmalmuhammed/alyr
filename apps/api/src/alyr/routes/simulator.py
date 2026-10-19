from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from alyr.channels.base import InboundMessage
from alyr.channels.simulator import SIMULATOR_NUMBER_ID
from alyr.config import get_settings
from alyr.modules.ledger import service
from alyr.seed import (
    DEMO_TENANT_ID,
    OWNER_PHONE,
    STAFF_PHONE,
    ensure_demo_tenant,
    reset_demo_data,
)

router = APIRouter(prefix="/sim", tags=["simulator"])


class SimulatedMessage(BaseModel):
    """A phone sending a WhatsApp message. Give a number, a user ID, or both, as Meta does.
    A customer who uses a WhatsApp username arrives with a user ID and no number."""

    from_number: str = ""
    from_user_id: str = ""
    username: str = ""
    text: str = ""
    reply_id: str = ""
    # The address of the shop whose test line this phone writes to (`al-noor`, a demo shop's
    # slug, a shop made in onboarding). Empty: the original Al Noor demo shop.
    shop: str = ""


async def _line(request: Request, shop: str) -> tuple[UUID, str]:
    """The shop a simulated phone writes to and the test line it uses. Every shop has a private
    simulator line (`channel_numbers`, channel `simulator`); nothing sent to it leaves this
    machine. 404 for an address with no such line."""
    if not shop or shop == "al-noor":
        return DEMO_TENANT_ID, SIMULATOR_NUMBER_ID
    async with request.app.state.db.unscoped() as conn:
        row = await conn.fetchrow(
            "select t.id, c.number_id from tenants t join channel_numbers c on c.tenant_id = t.id "
            "where t.slug = $1 and c.channel = 'simulator' order by c.number_id limit 1", shop,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="no test line for that shop")
    return row["id"], row["number_id"]


def _is_user_id(key: str) -> bool:
    # Meta's user IDs look like "QA.1234…": a country code, a dot, then the ID.
    return "." in key


async def _conversation(request: Request, key: str, shop: str = "") -> dict:
    """`key` is a phone number or a WhatsApp user ID."""
    column = "wa_user_id" if _is_user_id(key) else "phone"
    tenant_id, _ = await _line(request, shop)
    async with request.app.state.db.tenant(tenant_id) as conn:
        rows = await conn.fetch(
            "select m.direction, m.kind, m.body, m.payload, m.status, m.error, m.created_at "
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
    _, number_id = await _line(request, body.shop)
    await request.app.state.inbound.accept(
        InboundMessage(
            channel="simulator",
            message_id=f"sim-{uuid4()}",
            to_number_id=number_id,
            kind="interactive" if body.reply_id else "text",
            from_number=body.from_number,
            from_user_id=body.from_user_id,
            username=body.username,
            text=body.text,
            reply_id=body.reply_id,
        )
    )
    return await _conversation(request, body.from_user_id or body.from_number, body.shop)


@router.post("/photos")
async def send_photo(
    request: Request, from_number: str = "", from_user_id: str = "", caption: str = "",
    shop: str = "",
) -> dict:
    """Act as a phone sending a photo with a caption: the request body is the picture.
    The simulator keeps the file and the inbound message carries its ID, which the channel
    hands back when the Catalog asks to download it, as Meta's Media API would."""
    if not (from_number or from_user_id):
        raise HTTPException(status_code=422, detail="give from_number or from_user_id")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=422, detail="send the picture as the request body")
    _, number_id = await _line(request, shop)
    media_id = f"sim-in-{uuid4()}"
    content_type = request.headers.get("content-type", "image/jpeg")
    request.app.state.outbound.channels["simulator"].keep(media_id, data, content_type)
    await request.app.state.inbound.accept(
        InboundMessage(
            channel="simulator",
            message_id=f"sim-{uuid4()}",
            to_number_id=number_id,
            kind="image",
            from_number=from_number,
            from_user_id=from_user_id,
            text=caption,
            media_id=media_id,
            mime_type=content_type,
        )
    )
    return await _conversation(request, from_user_id or from_number, shop)


@router.get("/conversations/{key}")
async def conversation(key: str, request: Request, shop: str = "") -> dict:
    return await _conversation(request, key, shop)


@router.get("/personas")
async def personas(request: Request, shop: str = "") -> dict:
    """Who the chat simulator can pretend to be. For another shop (`?shop=<address>`), its own
    registered staff and its customers."""
    tenant_id, _ = await _line(request, shop)
    async with request.app.state.db.tenant(tenant_id) as conn:
        customers = (await service.summary(conn))["customers"]
        staff = await conn.fetch(
            "select name, phone, catalog_manager from contacts where role = 'staff' "
            "order by catalog_manager, name"
        ) if tenant_id != DEMO_TENANT_ID else []
    if staff:
        counter = next((r for r in staff if not r["catalog_manager"]), staff[0])
        owner = next((r for r in reversed(staff) if r["catalog_manager"]), staff[-1])
        who = {
            "staff": {"name": counter["name"], "phone": counter["phone"], "user_id": None},
            "owner": {"name": owner["name"], "phone": owner["phone"], "user_id": None},
        }
    else:
        who = {
            "staff": {"name": "Yusuf (counter)", "phone": STAFF_PHONE, "user_id": None},
            "owner": {"name": "Fatima (owner)", "phone": OWNER_PHONE, "user_id": None},
        }
    return {
        **who,
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
