"""The public order page's API. No sign-in: a customer arrives by a link.

The tenant comes from the shop's slug in the address, so every query is still scoped.

Two kinds of link open the page:

* **Public** (an item's, a category's, a QR code on a counter or a table): `/s/<slug>`
  with `?item=`, `?cat=` or `?table=`. Anyone can open it. It shows the normal prices, never
  a customer's, and it cannot place an order; a customer who wants to order is sent to the
  shop's WhatsApp to get a link of their own.
* **One customer's**: `?t=<token>` (`core/links.py`). The token is signed over the shop and
  the customer, so it cannot be edited or used at another shop. It shows that customer's
  own prices (their price group) and lets them order, on their account too if they have one.
  A bare contact ID in the address or in a request grants nothing.
"""

from datetime import date
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import links
from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.core.workspace import module_enabled
from alyr.modules.items import demand, template, text
from alyr.modules.items.cart import CartLine
from alyr.modules.items.service import MAX_QUANTITY
from alyr.modules.orders import page, service
from alyr.routes import customer_link

router = APIRouter(prefix="/api/store", tags=["order page"])

# Refusals that mean "the shop changed since you looked" (the cart is still yours, with
# new details), as opposed to a request that was wrong.
_CHANGED = (
    "over_limit", "sold_out", "not_enough", "price_changed", "not_now", "closed",
    "after_cutoff", "not_that_day", "past", "cart_changed", "nothing_available",
    "too_many_holds",
)
_STATUS_FOR = {
    "unknown_customer": 404, "no_account": 403, "no_previous_order": 404,
    "bad_link": 403, "expired_link": 403,
    **dict.fromkeys(_CHANGED, 409),
}
TOKEN = Field(
    min_length=20, max_length=200,
    description="The customer's own link token (`?t=` in their order link)",
)


class Line(BaseModel):
    product_id: UUID
    quantity: int = Field(ge=1, le=MAX_QUANTITY)
    variant_id: UUID | None = Field(default=None, description="The size or colour chosen")
    option_ids: list[UUID] = Field(default_factory=list, max_length=20)
    expected_price: int | None = Field(
        default=None, ge=0,
        description="The price of one that the customer was shown, in dirhams. If it is "
                    "no longer the price, the order is refused and the new price shown",
    )

    def cart_line(self) -> CartLine:
        return CartLine(
            self.product_id, self.quantity, self.variant_id, tuple(self.option_ids),
            self.expected_price,
        )


class NewOrder(BaseModel):
    token: str = TOKEN
    items: list[Line] = Field(min_length=1, max_length=100)
    payment: str = Field(pattern="^(link|account)$")
    for_date: date | None = Field(
        default=None, description="The day wanted, for items made to order"
    )
    table: str | None = Field(
        default=None, max_length=40,
        description="The table this order is for, from the link on its QR code",
    )


class CartCheck(BaseModel):
    items: list[Line] = Field(min_length=1, max_length=100)
    for_date: date | None = None
    token: str | None = Field(
        default=None, max_length=200,
        description="The customer's link token. Their price group decides the prices; "
                    "without one the default group's (the normal prices) apply",
    )


class Repeat(BaseModel):
    token: str = TOKEN
    payment: str = Field(pattern="^(link|account)$")


# The page sends the customer's token in the header `X-Order-Link`, not in the address, so
# the API's own request log never holds one (`?t=` is still read, for a tool or a test).


class Live(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=200)
    token: str | None = Field(default=None, max_length=200)


async def _shop(request: Request, slug: str):
    async with request.app.state.db.unscoped() as conn:
        shop = await conn.fetchrow(
            "select id, name, name_ar, slug, timezone from tenants where slug = $1", slug
        )
    if shop is None:
        raise HTTPException(status_code=404, detail="shop not found")
    return shop


def _refused(error: service.OrderError) -> HTTPException:
    detail = {"code": error.code, "message": str(error), "message_ar": error.message_ar}
    if error.lines is not None:
        detail["lines"] = error.lines
    return HTTPException(status_code=_STATUS_FOR.get(error.code, 422), detail=detail)


async def _identify(conn, link: links.Link | None) -> dict | None:
    """The customer behind a valid link, as the page greets them. None for a link whose
    customer is gone (a contact deleted after the link was sent)."""
    if link is None:
        return None
    row = await conn.fetchrow(
        "select id, name, lang, credit_limit from contacts where id = $1 and role = 'customer'",
        link.contact_id,
    )
    if row is None:
        return None
    return {
        "name": row["name"], "first_name": row["name"].split(" ")[0], "lang": row["lang"],
        "can_use_account": bool(row["credit_limit"] and row["credit_limit"] > 0),
        "has_last_order": bool(await conn.fetchval(
            "select true from orders where contact_id = $1 and status <> 'cancelled' limit 1",
            row["id"],
        )),
    }


@router.get("/{slug}")
async def storefront(
    slug: str, request: Request, response: Response,
    t: str | None = Query(default=None, max_length=200),
    x_order_link: str | None = Header(default=None, max_length=200),
    q: str = Query(default="", max_length=80),
    category: str | None = Query(default=None, max_length=80),
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int | None = Query(default=None, ge=1, le=page.MAX_PAGE),
    table: str = Query(default="", max_length=40),
) -> dict:
    """The order page: the shop, its choices for the page, its categories, the customer (if
    the link is theirs) and one page of items. With no `limit`, every item."""
    customer_link.keep_private(response)
    shop = await _shop(request, slug)
    link, state = customer_link.state(x_order_link or t, shop["id"], links.ORDER)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        customer = await _identify(conn, link)
        if link is not None and customer is None:
            state = "invalid"
        contact_id = link.contact_id if customer is not None and link is not None else None
        data = await page.page(
            conn, request.app.state.media, contact_id, q=q, category=category,
            offset=offset, limit=limit,
        )
        # What the shop's type says about its page (the section's name, the layout, how a
        # sold-out item looks); null for a shop without the Catalog (ALY-107).
        hints = await template.public(conn) if await template.enabled(conn) else None
    catalog_on = await module_enabled(request.app.state.db, shop["id"], "catalog")
    items = data["items"]
    return {
        "shop": {
            "name": shop["name"], "name_ar": shop["name_ar"], "slug": shop["slug"],
            "timezone": shop["timezone"], "catalog": catalog_on,
            "whatsapp": data["settings"]["whatsapp_number"],
        },
        **data,
        "products": [i for i in items if i["orderable"]],
        "unavailable": [i for i in items if not i["orderable"]],
        "catalog": hints,
        "customer": customer,
        "link": customer_link.view(state, links.ORDER),
        # The label on a table's QR code. A person typed it into a link, so it is only a
        # label for staff; the one inside a signed link was signed.
        "table": links.clean_table(link.table if link is not None and link.table else table),
    }


@router.get("/{slug}/items/{item_id}")
async def one_item(
    slug: str, item_id: UUID, request: Request, response: Response,
    t: str | None = Query(default=None, max_length=200),
    x_order_link: str | None = Header(default=None, max_length=200),
) -> dict:
    """One item with every photo, for its sheet."""
    customer_link.keep_private(response)
    shop = await _shop(request, slug)
    link, _ = customer_link.state(x_order_link or t, shop["id"], links.ORDER)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        customer = await _identify(conn, link)
        row = await page.one(
            conn, request.app.state.media, item_id, link.contact_id if customer else None
        )
    if row is None:
        raise HTTPException(status_code=404, detail="item not found")
    return {"item": row}


@router.post("/{slug}/live")
async def live(slug: str, body: Live, request: Request) -> dict:
    """What changed on the items a customer is looking at: asked every 20 to 30 seconds
    while the page is open and in front. Small on purpose."""
    shop = await _shop(request, slug)
    link, _ = customer_link.state(body.token, shop["id"], links.ORDER)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        customer = await _identify(conn, link)
        return await page.live(conn, body.ids, link.contact_id if customer else None)


@router.get("/{slug}/share")
async def share(
    slug: str, request: Request, item: UUID | None = None,
    category: str | None = Query(default=None, max_length=80),
) -> dict:
    """What a link's preview shows when it is pasted into WhatsApp or Instagram: a title, a
    description, the price and the photo, for an item, a category or the whole shop. Public:
    always the normal prices, and the same for everyone."""
    shop = await _shop(request, slug)
    base = get_settings().public_web_url.rstrip("/")
    async with request.app.state.db.tenant(shop["id"]) as conn:
        found = await page.one(conn, request.app.state.media, item) if item else None
        listing = None
        if found is None:
            listing = await page.page(
                conn, request.app.state.media, None, category=category, limit=12
            )
    return _preview(shop, base, found, listing, category)


def _absolute(base: str, url: str) -> str:
    """A photo's address as a crawler needs it: the photo store's own when that is public
    (R2), else this site's (local development)."""
    return url if url.startswith(("http://", "https://")) else f"{base}{url}"


def _both_prices(item: dict) -> tuple[str, str]:
    low, high = item["price_min"], item["price_max"]
    if high is None:
        return fmt_qar(low), fmt_qar_ar(low)
    # A range writes both ends, never "from".
    return f"{fmt_qar(low)} - {fmt_qar(high).removeprefix('QAR ')}", (
        f"{fmt_qar_ar(low).removesuffix(' ر.ق')} - {fmt_qar_ar(high)}"
    )


def _preview(
    shop, base: str, item: dict | None, listing: dict | None, category: str | None
) -> dict:
    name = shop["name"] or shop["name_ar"]
    url = f"{base}/s/{shop['slug']}"
    if item is not None:
        en, ar = _both_prices(item)
        title_name = item["name"] or item["name_ar"]
        lead = text.say("sold_out", "en", {"name": title_name}) + " " if item["sold_out"] else ""
        describe = " ".join((item["description"] or item["description_ar"]).split())[:140]
        parts = [p for p in (
            lead.strip(), f"{item['name_ar']} · {ar}" if item["name_ar"] else ar, describe, name
        ) if p]
        photo = item["photos"][0] if item.get("photos") else None
        return {
            "kind": "item", "title": f"{title_name} · {en}",
            "description": " — ".join(parts), "url": f"{url}?item={item['id']}",
            "image": _image(base, photo), "price": en, "price_ar": ar, "site": name,
            "price_amount": f"{item['price_min'] / 100:.2f}",
        }
    rows = (listing or {"items": []})["items"]
    covers = next((r["cover"] for r in rows if r["cover"]["state"] == "ready"), None)
    if category is not None and rows:
        names = ", ".join((r["name"] or r["name_ar"]) for r in rows[:4])
        return {
            "kind": "category", "title": f"{category} · {name}",
            "description": f"{names}.", "url": f"{url}?cat={quote(category, safe='')}",
            "image": _image(base, covers), "price": "", "price_ar": "", "site": name,
        }
    names_ar = shop["name_ar"] or name
    return {
        "kind": "shop", "title": name,
        "description": f"Order from {name}. — اطلب من {names_ar}.",
        "url": url, "image": _image(base, covers), "price": "", "price_ar": "", "site": name,
    }


def _image(base: str, photo: dict | None) -> dict | None:
    """The preview image: the 800 px size, with an address a crawler can fetch."""
    if not photo or photo.get("state") != "ready" or not photo.get("medium"):
        return None
    # A photo is never enlarged, so its 800 px file is 800 on the long side, or the
    # original when that is smaller.
    width, height = photo["w"] or 800, photo["h"] or 800
    scale = min(1.0, 800 / max(width, height))
    return {
        "url": _absolute(base, photo["medium"]),
        "width": round(width * scale), "height": round(height * scale),
    }


@router.post("/{slug}/cart/check")
async def check_cart(slug: str, body: CartCheck, request: Request) -> dict:
    """Is each line of this cart still good: for sale, in stock, at the price shown? Asked
    before payment. Changes nothing."""
    shop = await _shop(request, slug)
    link = customer_link.require(body.token, shop["id"], links.ORDER, required=False)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        customer = await _identify(conn, link)
        return await service.check_cart(
            conn, [line.cart_line() for line in body.items], body.for_date,
            contact_id=link.contact_id if customer else None,
        )


@router.post("/{slug}/orders")
async def place_order(slug: str, body: NewOrder, request: Request) -> dict:
    shop = await _shop(request, slug)
    link = customer_link.require(body.token, shop["id"], links.ORDER, required=True)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            return await service.create_order(
                conn, shop["id"], link.contact_id, [line.cart_line() for line in body.items],
                body.payment, get_settings().public_web_url, request.app.state.outbound,
                body.for_date, table=links.clean_table(link.table or body.table),
            )
    except service.OrderError as error:
        await demand.note_refusal(request.app.state.db, shop["id"], link.contact_id, error.lines)
        raise _refused(error) from error


@router.post("/{slug}/orders/repeat")
async def repeat_order(slug: str, body: Repeat, request: Request) -> dict:
    """"Same as last time": order again what the customer's last order held. What can no
    longer be ordered is left out and named in the answer."""
    shop = await _shop(request, slug)
    link = customer_link.require(body.token, shop["id"], links.ORDER, required=True)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            return await service.repeat_last_order(
                conn, shop["id"], link.contact_id, body.payment, get_settings().public_web_url,
                request.app.state.outbound,
            )
    except service.OrderError as error:
        await demand.note_refusal(request.app.state.db, shop["id"], link.contact_id, error.lines)
        raise _refused(error) from error
