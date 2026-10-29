"""Where a person can see work that failed for good, and send it round again: parked jobs,
and the messages that did not reach a customer (specs/036)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from alyr.core import jobs, not_sent
from alyr.core.auth import Staff
from alyr.core.outbound import SEND
from alyr.core.team import actor_of
from alyr.routes.deps import current_staff, current_tenant, require_manager

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
messages = APIRouter(prefix="/api/messages", tags=["jobs"])


@router.get("/failed")
async def failed(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"jobs": await jobs.failed_jobs(conn)}


@router.post("/{job_id}/retry", dependencies=[Depends(require_manager)])
async def retry(
    job_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        message_id = await conn.fetchval(
            "select (payload->>'message_id')::uuid from jobs "
            "where id = $1 and status = 'failed' and kind = $2",
            job_id, SEND,
        )
        if message_id is not None:
            # A message goes through the same checks as on the "Not sent" screen, so a
            # customer who said stop since is not sent it.
            await _send_again(conn, message_id, staff)
        elif not await jobs.retry(conn, job_id):
            raise HTTPException(status_code=404, detail="no failed job with that id")
    return {"status": "queued"}


@messages.get("/not-sent")
async def not_sent_list(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"days": not_sent.DAYS, "messages": await not_sent.listing(conn)}


@messages.post("/{message_id}/retry")
async def not_sent_retry(
    message_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await _send_again(conn, message_id, staff)
    return {"status": "queued"}


async def _send_again(conn, message_id: UUID, staff: Staff) -> None:
    try:
        await not_sent.retry(conn, message_id, actor_of(staff))
    except LookupError:
        raise HTTPException(
            status_code=404, detail="no message that did not reach its customer"
        ) from None
    except not_sent.NotSendable as refused:
        # 409 with the reason: the screen says why in the shop's language.
        raise HTTPException(status_code=409, detail={"reason": refused.why}) from None
