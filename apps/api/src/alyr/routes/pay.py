from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response

from alyr.config import get_settings
from alyr.core.normalise import fmt_qar
from alyr.modules.ledger import service
from alyr.routes import customer_link

router = APIRouter(prefix="/api/pay", tags=["payments"])

# The link carries the tenant id because the customer opening it is not signed in,
# and without a tenant Row-Level Security returns nothing.
#
# Who may open it (ALY-133): whoever holds the link, and that is the whole of it. The payment's
# ID is a random version-4 UUID (122 bits from the database's secure source,
# `gen_random_uuid()`), not derived from the customer's ID or from anything else, and it opens
# exactly one payment. The page says the amount, the shop, the order number and the payer's
# first name, and nothing else: no contact ID, no phone number, no balance, no other payment. A
# customer's contact ID, or their order or booking link, opens nothing here. The route that
# marks a payment paid exists only on a developer machine.


@router.get("/{tenant_id}/{payment_id}")
async def details(
    tenant_id: UUID, payment_id: UUID, request: Request, response: Response
) -> dict:
    # It names the payer: no shared cache keeps it for someone else.
    customer_link.keep_private(response, by_link=False)
    async with request.app.state.db.tenant(tenant_id) as conn:
        row = await conn.fetchrow(
            "select p.amount, p.status, p.provider, split_part(c.name, ' ', 1) as customer, "
            "c.lang, t.name as shop, "
            "t.name_ar as shop_ar, t.slug, "
            "o.number as order_number, p.order_id, d.number as document_number, "
            "d.kind as document_kind "
            "from payment_requests p join contacts c on c.id = p.contact_id "
            "join tenants t on t.id = p.tenant_id left join orders o on o.id = p.order_id "
            "left join documents d on d.id = p.document_id "
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
