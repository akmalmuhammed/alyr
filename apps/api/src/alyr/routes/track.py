"""The customer's tracking page for one order. No sign-in: the customer arrives by the link in
their chat.

`/t/<shop>?t=<token>` on the web app, this route behind it (SEC-8, D-080). The token is made for
this page only (`core/links.py`, purpose `track`): it names one order at one shop, is signed over
both, and runs out after `ALYR_LINK_DAYS`; every message about the order carries a fresh one. The
page sends it in the header `X-Order-Link`, as the order, booking and document pages do, so no
log of ours holds it; `?t=` is read for a tool or a test. The order's ID alone opens nothing: it
is seen in other places (the workspace, a shop's own system by webhook), and until SEC-8 it
opened this page for good.

* A good link shows what was bought, where the order has got to, the first name of the staff
  member looking after it and the table. It does not say the customer's name, phone number or
  contact ID, and it shows nothing of any other order.
* A link that has expired, was edited, belongs to another shop, or was made for another page
  (an order link, a booking link) shows a calm page that says to open the newest link in the
  chat or ask the shop for one. Nothing in it names an order.
* Nothing is cached for anyone else and nothing is indexed.
"""

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response

from alyr.core import links
from alyr.core.workspace import module_enabled
from alyr.modules.orders import service
from alyr.routes import customer_link

router = APIRouter(prefix="/api/track", tags=["order tracking"])

NOINDEX = "noindex, nofollow"


@router.get("/{slug}")
async def track(
    slug: str, request: Request, response: Response,
    t: str | None = Query(default=None, max_length=300),
    x_order_link: str | None = Header(default=None, max_length=300),
) -> dict:
    """The shop and, if the link is good, the order. `link` says whether it was good, expired
    or not valid, with the words for it in both languages."""
    customer_link.keep_private(response)
    response.headers["X-Robots-Tag"] = NOINDEX
    db = request.app.state.db
    async with db.unscoped() as conn:
        shop = await conn.fetchrow("select id, name, name_ar from tenants where slug = $1", slug)
    if shop is None or not await module_enabled(db, shop["id"], "orders"):
        raise HTTPException(status_code=404, detail="order not found")
    link, state = customer_link.state(x_order_link or t, shop["id"], links.TRACK)
    order = None
    if link is not None:
        async with db.tenant(shop["id"]) as conn:
            order = await service.tracking(conn, link.subject_id)
        if order is None:
            state = "invalid"  # a link whose order is gone
    return {
        "shop": {"name": shop["name"], "name_ar": shop["name_ar"]},
        "order": order,
        # The pay page still opens by the shop's ID and the payment's (SEC-8's second part
        # signs it, after the payment adapters, ALY-17).
        "pay_path": f"/pay/{shop['id']}/{order['payment_id']}"
        if order and order["payment_id"] else None,
        "link": customer_link.view(state, links.TRACK),
    }
