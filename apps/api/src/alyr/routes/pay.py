"""The customer's pay page for one payment request. No sign-in: the customer arrives by the link in
their chat.

`/pay/<shop>?t=<token>` on the web app, these routes behind it (SEC-8's second part, D-080). The
token is made for this page only (`core/links.py`, purpose `pay`): it names one payment request at
one shop, is signed over both, and runs out after `ALYR_LINK_DAYS`. The page sends it in the header
`X-Order-Link`, as the order, booking, document and tracking pages do, so no log of ours holds it;
`?t=` is read for a tool or a test. The payment's ID alone opens nothing: until D-080's second part
the page opened by the shop's ID and the payment's ID in the address, for good.

* A good link says the amount, the shop, the order number and the payer's first name, and nothing
  else: no contact ID, no phone number, no balance, no other payment. A payment for an order also
  carries a fresh signed link to that order's tracking page.
* A link that has expired, was edited, belongs to another shop, or was made for another page (an
  order, booking or tracking link) gives the shop's name and words that say what to do, in both
  languages. Nothing in it names a payment.
* Nothing is cached for anyone else and nothing is indexed. The route that marks a payment paid
  exists only on a developer machine.
"""

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response

from alyr.config import get_settings
from alyr.core import links
from alyr.core.normalise import fmt_qar, shown_name
from alyr.modules.ledger import service
from alyr.routes import customer_link

router = APIRouter(prefix="/api/pay", tags=["payments"])

NOINDEX = "noindex, nofollow"


async def _shop(request: Request, slug: str):
    async with request.app.state.db.unscoped() as conn:
        shop = await conn.fetchrow("select id, name, name_ar from tenants where slug = $1", slug)
    if shop is None:
        raise HTTPException(status_code=404, detail="payment not found")
    return shop


@router.get("/{slug}")
async def details(
    slug: str, request: Request, response: Response,
    t: str | None = Query(default=None, max_length=300),
    x_order_link: str | None = Header(default=None, max_length=300),
) -> dict:
    """The payment, if the link is good. `link` says whether it was good, expired or not valid,
    with the words for it in both languages."""
    customer_link.keep_private(response)
    response.headers["X-Robots-Tag"] = NOINDEX
    shop = await _shop(request, slug)
    link, state = customer_link.state(x_order_link or t, shop["id"], links.PAY)
    row = None
    if link is not None:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            row = await conn.fetchrow(
                "select p.amount, p.status, p.provider, c.name as customer, "
                "c.lang, t.name as shop, "
                "t.name_ar as shop_ar, t.slug, "
                "o.number as order_number, p.order_id, p.account_id, p.checkout_url, "
                "p.gateway_status, a.status as account_status "
                "from payment_requests p join contacts c on c.id = p.contact_id "
                "join tenants t on t.id = p.tenant_id left join orders o on o.id = p.order_id "
                "left join payment_accounts a on a.id = p.account_id "
                "where p.id = $1",
                link.subject_id,
            )
        if row is None:
            state = "invalid"  # a link whose payment is not there
    if row is None:
        return {
            "shop": shop["name"], "shop_ar": shop["name_ar"], "slug": slug,
            "link": customer_link.view(state, links.PAY),
        }
    found = dict(row)
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
        # The order's own tracking page, by a fresh signed link (D-080), as a path on this site.
        "track_path": links.track_url("", slug, shop["id"], row["order_id"])
        if row["order_id"] else None,
        "stand_in": account_id is None,
        "preparing": account_id is not None and not row["checkout_url"] and not stuck,
        "unavailable": row["status"] == "pending" and stuck,
        "link": customer_link.view(state, links.PAY),
    }


@router.post("/{slug}/complete")
async def complete(
    slug: str, request: Request,
    t: str | None = Query(default=None, max_length=300),
    x_order_link: str | None = Header(default=None, max_length=300),
) -> dict:
    """Stand-in for a gateway's "payment succeeded" callback. A real gateway (ALY-17)
    calls a signed webhook instead; this route does not exist in production."""
    # Allowed only where we say so explicitly, never by default (ALY-114).
    if get_settings().env != "local":
        raise HTTPException(status_code=404)
    shop = await _shop(request, slug)
    link = customer_link.require(x_order_link or t, shop["id"], links.PAY, required=True)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        # Only the stand-in: a payment on a provider is paid at the provider (ALY-17).
        if await conn.fetchval(
            "select account_id is not null from payment_requests where id = $1", link.subject_id
        ):
            raise HTTPException(status_code=409, detail={"code": "provider"})
        status = await service.complete_payment(
            conn, link.subject_id, request.app.state.outbound
        )
    if status == "not_found":
        raise HTTPException(status_code=404, detail="payment not found")
    if status == "expired":
        # The order's hold ran out or it was cancelled, so its stock may be gone.
        raise HTTPException(
            status_code=409,
            detail={"code": "expired", "message": "This payment link has expired."},
        )
    return {"status": status}
