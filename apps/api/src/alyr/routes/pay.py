from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from alyr.config import get_settings
from alyr.core.normalise import fmt_qar
from alyr.modules.ledger import service

router = APIRouter(prefix="/api/pay", tags=["payments"])

# The link carries the tenant id because the customer opening it is not signed in,
# and without a tenant Row-Level Security returns nothing.


@router.get("/{tenant_id}/{payment_id}")
async def details(tenant_id: UUID, payment_id: UUID, request: Request) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        row = await conn.fetchrow(
            "select p.amount, p.status, p.provider, c.name as customer, c.lang, t.name as shop, "
            "t.name_ar as shop_ar, t.slug, "
            "o.number as order_number, p.order_id "
            "from payment_requests p join contacts c on c.id = p.contact_id "
            "join tenants t on t.id = p.tenant_id left join orders o on o.id = p.order_id "
            "where p.id = $1",
            payment_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="payment not found")
    return {
        **dict(row), "amount_text": fmt_qar(row["amount"]),
        "order_id": str(row["order_id"]) if row["order_id"] else None,
    }


@router.post("/{tenant_id}/{payment_id}/complete")
async def complete(tenant_id: UUID, payment_id: UUID, request: Request) -> dict:
    """Stand-in for a gateway's "payment succeeded" callback. A real gateway (ALY-17)
    calls a signed webhook instead; this route does not exist in production."""
    # Allowed only where we say so explicitly, never by default (ALY-114).
    if get_settings().env != "local":
        raise HTTPException(status_code=404)
    async with request.app.state.db.tenant(tenant_id) as conn:
        status = await service.complete_payment(conn, payment_id, request.app.state.outbound)
    if status == "not_found":
        raise HTTPException(status_code=404, detail="payment not found")
    if status == "expired":
        # The order's hold ran out or it was cancelled, so its stock may be gone.
        raise HTTPException(
            status_code=409,
            detail={"code": "expired", "message": "This payment link has expired."},
        )
    return {"status": status}
