"""The workspace's customer price groups (wholesale): the groups a shop prices by, and which
group each customer is in (D-039, ALY-127; `specs/003-price-groups-and-sku/spec.md`).

Everyone on the team may read the groups. Owners and admins create, rename and remove them
and put a customer in one: a group decides what a customer is charged, so it is the owner's
call, like a price.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, groups
from alyr.modules.items.service import ItemError
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/price-groups", tags=["price groups"])


class GroupIn(BaseModel):
    name: str = Field(default="", max_length=60)
    name_ar: str = Field(default="", max_length=60)


class CustomerGroup(BaseModel):
    group_id: UUID | None = Field(
        description="The group, or null to put the customer in the default group"
    )


def _fail(error: ItemError) -> HTTPException:
    return HTTPException(
        status_code=422, detail={"code": error.code, "message": str(error)}
    )


@router.get("")
async def list_groups(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The shop's groups, the default first, each with the number of customers in it."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"groups": await groups.list_groups(conn), "can_manage": access.is_manager(staff)}


@router.post("")
async def add_group(
    body: GroupIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return {"group": await groups.create_group(conn, body.name, body.name_ar)}
    except ItemError as error:
        raise _fail(error) from error


# Before the routes that take a group's ID, so "customers" is not read as one.
@router.put("/customers/{contact_id}")
async def set_customer_group(
    contact_id: UUID, body: CustomerGroup, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    """Put a customer in a price group. From the next page they open, cart check and order
    they pay that group's prices; orders already placed keep what they were charged."""
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            group = await groups.set_customer_group(
                conn, contact_id, body.group_id, team.actor_of(staff)
            )
    except ItemError as error:
        raise _fail(error) from error
    if group is None:
        raise HTTPException(status_code=404, detail="customer not found")
    return {"group": group}


@router.put("/{group_id}")
async def rename_group(
    group_id: UUID, body: GroupIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            group = await groups.rename_group(conn, group_id, body.name, body.name_ar)
    except ItemError as error:
        raise _fail(error) from error
    if group is None:
        raise HTTPException(status_code=404, detail="group not found")
    return {"group": group}


@router.delete("/{group_id}")
async def remove_group(
    group_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Take a group away. Its customers go back to the default group; its prices and their
    history are kept. The default group cannot be removed."""
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            result = await groups.archive_group(conn, group_id, team.actor_of(staff))
    except ItemError as error:
        raise _fail(error) from error
    if result is None:
        raise HTTPException(status_code=404, detail="group not found")
    return result
