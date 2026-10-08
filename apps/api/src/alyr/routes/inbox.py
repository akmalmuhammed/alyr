"""The workspace's shared inbox."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from alyr.core.auth import Staff
from alyr.modules.inbox import service
from alyr.routes.deps import current_staff, current_tenant

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

class Reply(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class StatusChange(BaseModel):
    status: str


class AssistantChange(BaseModel):
    paused: bool


def _found(ok: bool) -> None:
    if not ok:
        raise HTTPException(status_code=404, detail="conversation not found")


@router.get("/conversations")
async def conversations(
    request: Request,
    status: str = Query("open", pattern="^(open|closed|all)$"),
    tenant_id: UUID = Depends(current_tenant),
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        rows = await service.conversations(conn, status)
    return {"conversations": rows, "unread": sum(1 for r in rows if r["unread"])}


@router.get("/conversations/{contact_id}")
async def thread(
    contact_id: UUID, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        found = await service.thread(conn, contact_id)
    if found is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    return found


@router.post("/conversations/{contact_id}/read")
async def read(
    contact_id: UUID, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        _found(await service.mark_read(conn, contact_id))
    return {"unread": 0}


@router.post("/conversations/{contact_id}/reply")
async def reply(
    contact_id: UUID, body: Reply, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    """`blocked` in the answer is why the reply was not sent, or null if it was."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await service.reply(
                conn, request.app.state.outbound, contact_id, body.text, staff.name
            )
    except service.InboxError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail="conversation not found") from error


@router.post("/conversations/{contact_id}/status")
async def change_status(
    contact_id: UUID, body: StatusChange, request: Request,
    tenant_id: UUID = Depends(current_tenant),
) -> dict:
    try:
        async with request.app.state.db.tenant(tenant_id) as conn:
            _found(await service.set_status(conn, contact_id, body.status))
    except service.InboxError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"status": body.status}


@router.post("/conversations/{contact_id}/assistant")
async def change_assistant(
    contact_id: UUID, body: AssistantChange, request: Request,
    tenant_id: UUID = Depends(current_tenant),
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        _found(await service.set_assistant(conn, contact_id, body.paused))
    return {"paused": body.paused}
