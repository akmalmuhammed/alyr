from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response

from alyr.config import get_settings
from alyr.core.normalise import fmt_qar, shown_name
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
            "select p.amount, p.status, p.provider, c.name as customer, "
            "c.lang, t.name as shop, "
            "t.name_ar as shop_ar, t.slug, "
            "o.number as order_number, p.order_id, p.booking_id, p.account_id, p.checkout_url, "
            "p.gateway_status, a.status as account_status "
            "from payment_requests p join contacts c on c.id = p.contact_id "
            "join tenants t on t.id = p.tenant_id left join orders o on o.id = p.order_id "
            "left join payment_accounts a on a.id = p.account_id "
            "where p.id = $1",
            payment_id,
        )
        # A booking's deposit (D-084): which visit, and the shop's rule the customer agreed to,
        # shown again before paying. No other booking, no phone number.
        booking = await conn.fetchrow(
            "select b.number, b.service_name, s.name_ar as service_name_ar, b.deposit_terms, "
            "r.name as resource, r.name_ar as resource_ar, r.kind as resource_kind, "
            "to_char(b.starts_at at time zone t.timezone, 'FMDy FMDD Mon, FMHH12:MI AM') "
            "  as when_text, "
            "to_char(b.starts_at at time zone t.timezone, 'DD/MM HH24:MI') as when_text_ar "
            "from bookings b join tenants t on t.id = b.tenant_id "
            "left join services s on s.id = b.service_id "
            "left join booking_resources r on r.id = b.resource_id where b.id = $1",
            row["booking_id"],
        ) if row is not None and row["booking_id"] else None
    if row is None:
        raise HTTPException(status_code=404, detail="payment not found")
    found = {k: v for k, v in dict(row).items() if k != "booking_id"}
    account_id = found.pop("account_id")
    gateway_status = found.pop("gateway_status")
    account_status = found.pop("account_status")
    # On the shop's own payment account (ALY-17): the Pay button goes to the provider's page.
    # Until the job has made it the page waits; a link it can no longer be paid by says so.
    stuck = gateway_status in ("no_account", "checkout_failed") or (
        account_id is not None and account_status == "disconnected"
    )
    return {
        **found, "customer": shown_name(row["customer"]).split(" ")[0],
        "amount_text": fmt_qar(row["amount"]),
        "order_id": str(row["order_id"]) if row["order_id"] else None,
        "booking": dict(booking) if booking else None,
        "stand_in": account_id is None,
        "preparing": account_id is not None and not row["checkout_url"] and not stuck,
        "unavailable": row["status"] == "pending" and stuck,
    }


@router.post("/{tenant_id}/{payment_id}/complete")
async def complete(tenant_id: UUID, payment_id: UUID, request: Request) -> dict:
    """Stand-in for a gateway's "payment succeeded" callback. A real gateway (ALY-17)
    calls a signed webhook instead; this route does not exist in production."""
    # Allowed only where we say so explicitly, never by default (ALY-114).
    if get_settings().env != "local":
        raise HTTPException(status_code=404)
    async with request.app.state.db.tenant(tenant_id) as conn:
        # Only the stand-in: a payment on a provider is paid at the provider (ALY-17).
        if await conn.fetchval(
            "select account_id is not null from payment_requests where id = $1", payment_id
        ):
            raise HTTPException(status_code=409, detail={"code": "provider"})
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
