"""Owner actions from the workspace (ALY-130, decision D-040).

The same actions the owner's WhatsApp commands run, so the two doors cannot disagree, and
the link between a person and their WhatsApp number.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from alyr.core import actions, staff_link
from alyr.core.auth import Staff
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/owner", tags=["owner"])

ASKS = ("today", "orders", "bookings", "owed")


class Preference(BaseModel):
    preference: str


def _need_account(staff: Staff):
    """The open local demo has no person behind it, so it has no number to link."""
    if staff.user_id is None:
        raise HTTPException(status_code=409, detail="sign in with your own account first")
    return staff.user_id


@router.get("/ask/{name}")
async def ask(
    name: str, request: Request, lang: str = Query("en"), staff: Staff = Depends(current_staff)
) -> dict:
    """Run one of the read-only actions as the signed-in person: the same answer the
    same person gets on WhatsApp, as data."""
    if name not in ASKS:
        raise HTTPException(status_code=404, detail="there is no such question")
    caller = actions.Caller(staff.user_id, staff.name, staff.role, "portal")
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await actions.run(conn, caller, name, lang=lang)
    except actions.NotAllowed as error:
        raise HTTPException(status_code=403, detail="your role cannot ask this") from error
    except actions.NotSwitchedOn as error:
        raise HTTPException(status_code=403, detail=f"{error} is not switched on") from error


@router.get("/whatsapp")
async def whatsapp(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Whether the signed-in person has a WhatsApp number linked, and where they prefer
    to work."""
    user_id = _need_account(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await staff_link.status(conn, user_id)


@router.post("/whatsapp-link")
async def whatsapp_link(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """A one-time code. Sent from the phone as `LINK <code>` to the shop's WhatsApp
    number, it links that phone to this person. It lasts ten minutes."""
    user_id = _need_account(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        code, expires_at = await staff_link.issue(conn, user_id)
    return {
        "code": code,
        "message": f"LINK {code}",
        "expires_at": expires_at.isoformat(),
        "expires_in": int(staff_link.LIFETIME.total_seconds()),
    }


@router.delete("/whatsapp")
async def unlink(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    user_id = _need_account(staff)
    caller = actions.Caller(staff.user_id, staff.name, staff.role, "portal")
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        done = await staff_link.unlink(conn, caller.actor, user_id)
        return {"unlinked": done, **await staff_link.status(conn, user_id)}


@router.put("/channel")
async def channel(
    body: Preference, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    user_id = _need_account(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await staff_link.set_preference(conn, user_id, body.preference)
            return await staff_link.status(conn, user_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
