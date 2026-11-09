"""The workspace's side of the connector (spec 067): the API under the screen ALY-292 will draw.

For an owner or an admin signed in to the workspace (a cookie session, never a connector token): see
whether the connector is on and which apps are connected, opt in, pause and resume (the kill
switch), end one permission or all of them, and read what the apps did from the activity record.
Nothing here is reachable with a connector token, and the connector's own paths are not reachable
with a session.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from alyr.config import get_settings
from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.mcp import oauth, scopes, shop
from alyr.routes.deps import current_staff, require_manager
from alyr.routes.mcp import switched_on

router = APIRouter(
    prefix="/api/mcp", dependencies=[Depends(switched_on), Depends(require_manager)], tags=["mcp"]
)


class OptIn(BaseModel):
    # The owner's confirmation that what ALYR sends to their app leaves ALYR (D-170).
    understood: bool


def _actor(staff: Staff) -> team.Actor:
    return team.Actor(staff.user_id, staff.name)


def _refuse(error: shop.ShopError) -> HTTPException:
    return HTTPException(status_code=error.status, detail={"code": error.code,
                                                          "message": str(error)})


@router.get("")
async def overview(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    settings = get_settings()
    async with request.app.state.db.tenant(staff.tenant_id, readonly=True) as conn:
        state = await shop.current(conn)
        connected = await oauth.grants(conn)
        writes, sends = await shop.caps(conn, settings)
    return {
        "settings": state,
        "grants": connected,
        "caps": {"changes_per_day": writes, "sends_per_day": sends},
        "address": oauth.resource(settings),
        "scopes": list(scopes.ALL),
    }


@router.post("/opt-in")
async def opt_in(body: OptIn, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    if not body.understood:
        raise HTTPException(status_code=422, detail={"code": "must_confirm", "message":
                            "confirm that you understand where the information goes"})
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await shop.opt_in(conn, staff.role, _actor(staff), "portal")
            return await shop.current(conn)
    except shop.ShopError as error:
        raise _refuse(error) from error


@router.post("/switch-off")
async def switch_off(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await shop.switch_off(conn, staff.role, _actor(staff), "portal")
            return await shop.current(conn)
    except shop.ShopError as error:
        raise _refuse(error) from error


@router.post("/pause")
async def pause(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await shop.pause(conn, staff.role, _actor(staff), "portal")
            return await shop.current(conn)
    except shop.ShopError as error:
        raise _refuse(error) from error


@router.post("/resume")
async def resume(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await shop.resume(conn, staff.role, _actor(staff), "portal")
            return await shop.current(conn)
    except shop.ShopError as error:
        raise _refuse(error) from error


@router.delete("/grants/{grant_id}")
async def end_one(grant_id: UUID, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            done = await oauth.revoke_grant(conn, staff.role, _actor(staff), grant_id)
    except shop.ShopError as error:
        raise _refuse(error) from error
    if not done:
        raise HTTPException(status_code=404, detail="no such live connection")
    return {"ended": 1}


@router.post("/grants/revoke-all")
async def end_all(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return {"ended": await oauth.revoke_all(conn, staff.role, _actor(staff))}
    except shop.ShopError as error:
        raise _refuse(error) from error


@router.get("/activity")
async def activity(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """What the connected apps did: the activity record, channel `mcp`, newest first."""
    async with request.app.state.db.tenant(staff.tenant_id, readonly=True) as conn:
        return {"calls": await oauth.calls(conn)}
