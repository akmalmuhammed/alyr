from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import consent, team
from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar
from alyr.modules.ledger import service
from alyr.routes.deps import current_staff, current_tenant

router = APIRouter(prefix="/api/ledger", tags=["ledger"])


class ReminderRun(BaseModel):
    min_days: int = Field(default=30, ge=0)


class Assignment(BaseModel):
    user_id: UUID | None = Field(description="A team member, or null for nobody")


@router.get("/summary")
async def summary(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
        return {"shop": dict(shop), **await service.summary(conn)}


@router.get("/customers/{contact_id}/entries")
async def entries(
    contact_id: UUID, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        contact = await conn.fetchrow(
            "select name, phone from contacts where id = $1", contact_id
        )
        if contact is None:
            raise HTTPException(status_code=404, detail="customer not found")
        rows = await service.recent_entries(conn, contact_id)
        return {
            "customer": dict(contact),
            "consent": await consent.history(conn, contact_id),
            "entries": [
                {
                    "kind": r["kind"], "amount": r["amount"],
                    "amount_text": fmt_qar(r["amount"]), "note": r["note"],
                    "created_by": r["created_by"], "created_at": r["created_at"].isoformat(),
                }
                for r in rows
            ],
        }


@router.post("/reminders")
async def reminders(
    body: ReminderRun, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await service.send_reminders(
            conn, staff.tenant_id, request.app.state.outbound,
            get_settings().public_web_url, body.min_days, team.actor_of(staff),
        )


@router.post("/customers/{contact_id}/assign")
async def assign(
    contact_id: UUID, body: Assignment, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Who follows up this customer's account."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await team.assign(
                conn, "account", contact_id, body.user_id, team.actor_of(staff)
            )
    except team.TeamError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if not found:
        raise HTTPException(status_code=404, detail="customer not found")
    return {"assigned_to": str(body.user_id) if body.user_id else None}
