"""How the team is doing, and how the shop's replies are signed (D-028).

Adding and removing people lives with sign-in, in `routes/auth.py`.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from alyr.core import team
from alyr.core.auth import Staff
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/team", tags=["team"])


class Settings(BaseModel):
    sign_replies: bool


@router.get("/performance")
async def performance(
    request: Request, days: int = Query(1), staff: Staff = Depends(current_staff)
) -> dict:
    """Owners and admins see everyone; an agent sees their own numbers."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await team.performance(conn, staff, days)
    except team.TeamError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/settings")
async def settings(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"sign_replies": await team.sign_replies(conn)}


@router.put("/settings")
async def change_settings(
    body: Settings, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    if staff.role == "agent":
        raise HTTPException(status_code=403, detail="only an owner or admin can change this")
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await team.set_sign_replies(conn, body.sign_replies)
    return {"sign_replies": body.sign_replies}
