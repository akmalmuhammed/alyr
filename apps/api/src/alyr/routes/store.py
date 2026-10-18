"""The public order page's API. No sign-in: the customer arrives by a link from the chat.

The tenant comes from the shop's slug in the address, so every query is still scoped.
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.modules.items import demand
from alyr.modules.items.cart import CartLine
from alyr.modules.items.service import MAX_QUANTITY
from alyr.modules.orders import service

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
    **dict.fromkeys(_CHANGED, 409),
}


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
    contact_id: UUID
    items: list[Line] = Field(min_length=1, max_length=100)
    payment: str = Field(pattern="^(link|account)$")
    for_date: date | None = Field(
        default=None, description="The day wanted, for items made to order"
    )


class CartCheck(BaseModel):
    items: list[Line] = Field(min_length=1, max_length=100)
    for_date: date | None = None
    contact_id: UUID | None = Field(
        default=None,
        description="The customer. Their price group decides the prices; without one the "
                    "default group's (the normal prices) apply",
    )


class Repeat(BaseModel):
    contact_id: UUID
    payment: str = Field(pattern="^(link|account)$")


async def _shop(request: Request, slug: str):
    async with request.app.state.db.unscoped() as conn:
        shop = await conn.fetchrow(
            "select id, name, name_ar from tenants where slug = $1", slug
        )
    if shop is None:
        raise HTTPException(status_code=404, detail="shop not found")
    return shop


def _refused(error: service.OrderError) -> HTTPException:
    detail = {"code": error.code, "message": str(error), "message_ar": error.message_ar}
    if error.lines is not None:
        detail["lines"] = error.lines
    return HTTPException(status_code=_STATUS_FOR.get(error.code, 422), detail=detail)


@router.get("/{slug}")
async def storefront(slug: str, request: Request, c: UUID | None = None) -> dict:
    shop = await _shop(request, slug)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        # The customer's own prices when the link says who is looking (their price group).
        page = await service.storefront(conn, c)
        customer = None
        if c is not None:
            row = await conn.fetchrow("select name from contacts where id = $1", c)
            if row is not None:
                customer = {
                    "name": row["name"],
                    "can_use_account": await service.can_use_account(conn, c),
                }
    return {
        "shop": {"name": shop["name"], "name_ar": shop["name_ar"]},
        **page,
        "customer": customer,
    }


@router.post("/{slug}/cart/check")
async def check_cart(slug: str, body: CartCheck, request: Request) -> dict:
    """Is each line of this cart still good: for sale, in stock, at the price shown? Asked
    before payment. Changes nothing."""
    shop = await _shop(request, slug)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        return await service.check_cart(
            conn, [line.cart_line() for line in body.items], body.for_date,
            contact_id=body.contact_id,
        )


@router.post("/{slug}/orders")
async def place_order(slug: str, body: NewOrder, request: Request) -> dict:
    shop = await _shop(request, slug)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            return await service.create_order(
                conn, shop["id"], body.contact_id, [line.cart_line() for line in body.items],
                body.payment, get_settings().public_web_url, request.app.state.outbound,
                body.for_date,
            )
    except service.OrderError as error:
        await demand.note_refusal(request.app.state.db, shop["id"], body.contact_id, error.lines)
        raise _refused(error) from error


@router.post("/{slug}/orders/repeat")
async def repeat_order(slug: str, body: Repeat, request: Request) -> dict:
    """"Same as last time": order again what the customer's last order held. What can no
    longer be ordered is left out and named in the answer."""
    shop = await _shop(request, slug)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            return await service.repeat_last_order(
                conn, shop["id"], body.contact_id, body.payment, get_settings().public_web_url,
                request.app.state.outbound,
            )
    except service.OrderError as error:
        await demand.note_refusal(request.app.state.db, shop["id"], body.contact_id, error.lines)
        raise _refused(error) from error
