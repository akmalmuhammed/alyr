"""The weekly result report in the workspace: read it, choose who receives it, and send
it now (decision D-030). Owners and admins only: it is about the shop's money."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from alyr.core.auth import Staff
from alyr.modules import report
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/reports", tags=["reports"])


class Settings(BaseModel):
    enabled: bool | None = None
    recipients: list[UUID] | None = None


def _manager(staff: Staff) -> None:
    if staff.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=403, detail="Only the owner or an admin can see the report."
        )


@router.get("/weekly")
async def weekly(
    request: Request,
    weeks_ago: int = Query(default=1, ge=0, le=12),
    staff: Staff = Depends(current_staff),
) -> dict:
    _manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await report.preview(conn, weeks_ago)


@router.post("/weekly/send")
async def send_now(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Send last week's report to the chosen numbers now, outside the Sunday schedule.
    It does not count as the Sunday report: that one still goes out."""
    _manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        built = await report.build(conn, await report.last_week(conn))
        if not built["sections"]:
            raise HTTPException(status_code=422, detail="No products are switched on yet.")
        sent = await report.deliver(conn, request.app.state.outbound, built)
    return {"sent": sent}


@router.get("/settings")
async def get_settings(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await report.settings(conn)


@router.put("/settings")
async def put_settings(
    body: Settings, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        try:
            return await report.update_settings(conn, body.enabled, body.recipients)
        except LookupError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
