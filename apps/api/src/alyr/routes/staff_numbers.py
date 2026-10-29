"""The shop's staff numbers in the workspace: who may change the Catalog by WhatsApp.

Owners and admins register a number (a name, a phone number, a language, and whether it
is a manager who gets the stock and refund alerts), change it, or take it off. A number
that is not on this list is answered like any customer (`modules/items/staff.py`).
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, changes, staff
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/staff-numbers", tags=["staff numbers"])


class NewNumber(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=1, max_length=30, description="International form")
    lang: Literal["en", "ar"] = "en"
    manager: bool = False
    # Told on WhatsApp about every new order (D-079).
    order_alerts: bool = False


class NumberChanges(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    lang: Literal["en", "ar"] | None = None
    manager: bool | None = None
    order_alerts: bool | None = None


def _fail(error: staff.StaffError) -> HTTPException:
    return HTTPException(
        status_code=422, detail={"code": error.code, "message": str(error)}
    )


@router.get("")
async def numbers(request: Request, member: Staff = Depends(current_staff)) -> dict:
    access.require_manager(member)
    async with request.app.state.db.tenant(member.tenant_id) as conn:
        return {"numbers": await staff.listing(conn)}


@router.post("")
async def register(
    body: NewNumber, request: Request, member: Staff = Depends(current_staff)
) -> dict:
    """Register a number as staff. A number the shop knows as a customer becomes staff."""
    access.require_manager(member)
    try:
        async with request.app.state.db.tenant(member.tenant_id) as conn:
            before = await staff.find(conn, body.phone)
            person = await staff.register(
                conn, body.name, body.phone, body.lang, body.manager, body.order_alerts
            )
            await changes.staff_changed(
                conn, team.actor_of(member), "staff_added" if before is None else "staff_changed",
                person, before,
            )
            return person
    except staff.StaffError as error:
        raise _fail(error) from error


@router.put("/{contact_id}")
async def change(
    contact_id: UUID, body: NumberChanges, request: Request,
    member: Staff = Depends(current_staff),
) -> dict:
    access.require_manager(member)
    try:
        async with request.app.state.db.tenant(member.tenant_id) as conn:
            before = await staff.get(conn, contact_id)
            found = await staff.update(
                conn, contact_id, body.name, body.lang, body.manager, body.order_alerts
            )
            if found is not None and before is not None:
                await changes.staff_changed(
                    conn, team.actor_of(member), "staff_changed", found, before
                )
    except staff.StaffError as error:
        raise _fail(error) from error
    if found is None:
        raise HTTPException(status_code=404, detail="staff number not found")
    return found


@router.delete("/{contact_id}")
async def remove(
    contact_id: UUID, request: Request, member: Staff = Depends(current_staff)
) -> dict:
    """Take a number off the list. It is an ordinary customer from then on."""
    access.require_manager(member)
    async with request.app.state.db.tenant(member.tenant_id) as conn:
        before = await staff.get(conn, contact_id)
        if not await staff.remove(conn, contact_id):
            raise HTTPException(status_code=404, detail="staff number not found")
        if before is not None:
            await changes.staff_changed(conn, team.actor_of(member), "staff_removed", before)
    return {"removed": True}
