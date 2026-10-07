"""Where a person can see work that failed for good, and send it round again."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from alyr.core import jobs
from alyr.routes.deps import current_tenant

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/failed")
async def failed(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"jobs": await jobs.failed_jobs(conn)}


@router.post("/{job_id}/retry")
async def retry(job_id: UUID, request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        if not await jobs.retry(conn, job_id):
            raise HTTPException(status_code=404, detail="no failed job with that id")
    return {"status": "queued"}
