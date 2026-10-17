"""Photos in the back office (D-039, ALY-103): every business's usage against the free
tier, and taking a photo down under the listing policy.

Only ALYR staff, through the same checks as the rest of the back office (`routes/admin.py`).
A removal and its audit record are written in one transaction. The photo's files leave
the store through the queue, so a store that is down delays the deletion but cannot lose it.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import backoffice
from alyr.core.auth import Staff
from alyr.core.media import parse_photo_ref
from alyr.routes.admin import _back_office, platform_admin

router = APIRouter(prefix="/api/admin/media", tags=["back office"])


class Removal(BaseModel):
    # The photo's web address, or the stored name inside it.
    ref: str = Field(min_length=10, max_length=600)
    reason: str = Field(min_length=3, max_length=500)


@router.get("/usage")
async def usage(
    request: Request,
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    _: Staff = Depends(platform_admin),
) -> dict:
    """Photos, gigabytes, uploads and active items per business for a month (default: this
    one), and `alert`: how close all shops together are to R2's free 10 GB."""
    async with _back_office(request) as conn:
        chosen = (
            date(int(month[:4]), int(month[5:]), 1)
            if month
            else await conn.fetchval(
                "select date_trunc('month', now() at time zone 'Asia/Qatar')::date"
            )
        )
        return await request.app.state.media.admin_usage(conn, chosen)


@router.post("/remove")
async def remove(
    body: Removal, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Take a reported photo down. It disappears from every item at once, its files are
    deleted from the store, and the shop cannot upload the same file again."""
    found = parse_photo_ref(body.ref)
    if found is None:
        raise HTTPException(
            status_code=422, detail="that is not the web address of a photo stored by ALYR"
        )
    tenant_id, digest = found
    reason = body.reason.strip()
    async with _back_office(request) as conn:
        row = await conn.fetchrow(
            "select * from admin_media_remove($1, $2, $3, $4)",
            tenant_id, digest, reason, staff.name or staff.email or "ALYR",
        )
        if row is None:
            raise HTTPException(status_code=404, detail="there is no live photo with that address")
        await backoffice.audit(
            conn, staff, "photo.removed", "photo", row["asset_id"], client_id=row["client_id"],
            business_id=tenant_id,
            detail={"reason": reason, "sha256": digest, "bytes": row["bytes"],
                    "business": row["business"]},
        )
    if get_settings().jobs_inline:
        await request.app.state.jobs.drain()
    return {"removed": True, "business": row["business"]}
