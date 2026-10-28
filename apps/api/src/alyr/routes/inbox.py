"""The workspace's shared inbox."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from alyr.core.auth import Staff
from alyr.core.team import actor_of
from alyr.modules.inbox import service
from alyr.routes.deps import current_staff, current_tenant, require_manager

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

class Reply(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class StatusChange(BaseModel):
    status: str
    outcome: str | None = Field(default=None, description="sold, booked, answered or lost")
    reason: str | None = Field(default=None, description="Why a lost customer was lost")


class AssistantChange(BaseModel):
    paused: bool


class Assignment(BaseModel):
    user_id: UUID | None = Field(description="A team member, or null for nobody")


class Note(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class SavedReply(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    body: str = Field(min_length=1, max_length=4000)


def _found(ok: bool) -> None:
    if not ok:
        raise HTTPException(status_code=404, detail="conversation not found")


@router.get("/conversations")
async def conversations(
    request: Request,
    status: str = Query("open", pattern="^(open|closed|all)$"),
    assigned: str = Query("any", pattern="^(any|me|none)$"),
    staff: Staff = Depends(current_staff),
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        rows = await service.conversations(conn, status, assigned, staff.user_id)
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
                conn, request.app.state.outbound, contact_id, body.text, staff.name,
                staff.user_id,
            )
    except service.InboxError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail="conversation not found") from error


@router.post("/conversations/{contact_id}/status")
async def change_status(
    contact_id: UUID, body: StatusChange, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            _found(await service.set_status(
                conn, contact_id, body.status, actor_of(staff), body.outcome, body.reason
            ))
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


@router.post("/conversations/{contact_id}/assign")
async def assign(
    contact_id: UUID, body: Assignment, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            _found(await service.assign(conn, contact_id, body.user_id, actor_of(staff)))
    except service.InboxError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"assigned_to": str(body.user_id) if body.user_id else None}


@router.post("/conversations/{contact_id}/notes")
async def add_note(
    contact_id: UUID, body: Note, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            note_id = await service.add_note(
                conn, contact_id, body.text, staff.user_id, staff.name
            )
    except service.InboxError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail="conversation not found") from error
    return {"id": note_id}


@router.get("/saved-replies")
async def saved_replies(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"replies": await service.saved_replies(conn)}


@router.post("/saved-replies")
async def save_reply(
    body: SavedReply, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    try:
        async with request.app.state.db.tenant(tenant_id) as conn:
            return {"id": await service.save_reply(conn, body.title, body.body)}
    except service.InboxError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/saved-replies/{reply_id}", dependencies=[Depends(require_manager)])
async def delete_saved_reply(
    reply_id: UUID, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        if not await service.delete_saved_reply(conn, reply_id):
            raise HTTPException(status_code=404, detail="saved reply not found")
    return {"deleted": True}
