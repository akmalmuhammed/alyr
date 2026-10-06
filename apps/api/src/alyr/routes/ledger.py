from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core.normalise import fmt_qar
from alyr.modules.ledger import service
from alyr.routes.deps import current_tenant

router = APIRouter(prefix="/api/ledger", tags=["ledger"])


class ReminderRun(BaseModel):
    min_days: int = Field(default=30, ge=0)


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
    body: ReminderRun, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        sent = await service.send_reminders(
            conn, tenant_id, request.app.state.outbound,
            get_settings().public_web_url, body.min_days,
        )
    return {"sent": sent}
