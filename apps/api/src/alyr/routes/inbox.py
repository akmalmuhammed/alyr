"""The workspace's shared inbox."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from alyr.core import forget
from alyr.core.auth import Staff
from alyr.core.team import actor_of
from alyr.modules.inbox import listing, service
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
    chip: str | None = Query(None),
    q: str | None = Query(None),
    limit: int | None = Query(None, ge=1, le=300),
    offset: int = Query(0, ge=0),
    counts: bool = Query(False),
    staff: Staff = Depends(current_staff),
) -> dict:
    async def compute() -> dict:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if not q and not chip and not counts and limit is None and offset == 0:
                return await service.listing(conn, status, assigned, staff.user_id)

            eff_limit = limit if limit is not None else 50
            items, total = await listing.list_conversations_filtered(
                conn,
                status=status,
                assigned=assigned,
                chip=chip,
                q=q,
                me=staff.user_id,
                limit=eff_limit,
                offset=offset,
            )
            c = await listing.get_inbox_counts(conn, staff.user_id)
            return {
                "conversations": items,
                "total": total,
                "unread": c.get("unread", 0),
                "counts": c,
            }

    # Tabs that look at the same list within a moment share one run (core/pollcache.py).
    # What depends on who is asking (the "mine" chip and count, assigned to me) is kept per person.
    mine = staff.user_id if (assigned == "me" or chip == "mine" or counts) else None
    cache_key = ("inbox", status, assigned, chip, q, limit, offset, counts, mine)
    return await request.app.state.poll.get_json(staff.tenant_id, cache_key, compute)


@router.get("/customer/{contact_id}")
async def customer_context(
    contact_id: UUID,
    request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        ctx = await listing.get_customer_context(conn, contact_id, staff.role)
    if ctx is None:
        raise HTTPException(status_code=404, detail="customer not found")
    return ctx


@router.get("/conversations/{contact_id}")
async def thread(
    contact_id: UUID, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async def compute() -> dict:
        async with request.app.state.db.tenant(tenant_id) as conn:
            found = await service.thread(conn, contact_id)
        if found is None:  # a refusal is not kept (core/pollcache.py)
            raise HTTPException(status_code=404, detail="conversation not found")
        return found

    return await request.app.state.poll.get_json(tenant_id, ("thread", contact_id), compute)


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


@router.get("/conversations/{contact_id}/forget", dependencies=[Depends(require_manager)])
async def forget_preview(
    contact_id: UUID, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    """What forgetting this customer would delete and keep (specs/038)."""
    async with request.app.state.db.tenant(tenant_id) as conn:
        found = await forget.preview(conn, contact_id)
    if found is None:
        raise HTTPException(status_code=404, detail="customer not found")
    return found


@router.get("/conversations/{contact_id}/export", dependencies=[Depends(require_manager)])
async def export_customer(
    contact_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> JSONResponse:
    """A copy of everything the business holds about this customer, as a file to check and
    send them (specs/038). Put on the customer's record with who downloaded it."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        copy = await forget.export(conn, contact_id, actor_of(staff))
    if copy is None:
        raise HTTPException(status_code=404, detail="customer not found")
    day = copy["made_at"][:10]
    return JSONResponse(copy, headers={
        "Content-Disposition": f'attachment; filename="customer-data-{day}.json"',
        "Cache-Control": "no-store",
    })


@router.post("/conversations/{contact_id}/forget", dependencies=[Depends(require_manager)])
async def forget_customer(
    contact_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Forget a customer who asked to be deleted: owners and admins, never undone."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            done = await forget.forget(conn, contact_id, actor_of(staff))
    except LookupError as error:
        raise HTTPException(status_code=404, detail="customer not found") from error
    except forget.Refused as error:
        raise HTTPException(status_code=409, detail={"reason": error.why}) from error
    return {"forgotten": True, **done}


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
