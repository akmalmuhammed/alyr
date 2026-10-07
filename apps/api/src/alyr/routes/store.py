"""The public order page's API. No sign-in: the customer arrives by a link from the chat.

The tenant comes from the shop's slug in the address, so every query is still scoped.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.modules.orders import service

router = APIRouter(prefix="/api/store", tags=["order page"])

_STATUS_FOR = {
    "unknown_customer": 404, "no_account": 403, "over_limit": 409,
}


class Line(BaseModel):
    product_id: UUID
    quantity: int = Field(ge=1, le=service.MAX_QUANTITY)


class NewOrder(BaseModel):
    contact_id: UUID
    items: list[Line] = Field(min_length=1, max_length=100)
    payment: str = Field(pattern="^(link|account)$")


async def _shop(request: Request, slug: str):
    async with request.app.state.db.unscoped() as conn:
        shop = await conn.fetchrow(
            "select id, name, name_ar from tenants where slug = $1", slug
        )
    if shop is None:
        raise HTTPException(status_code=404, detail="shop not found")
    return shop


@router.get("/{slug}")
async def storefront(slug: str, request: Request, c: UUID | None = None) -> dict:
    shop = await _shop(request, slug)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        products = await service.list_products(conn, only_available=True)
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
        "products": products,
        "customer": customer,
    }


@router.post("/{slug}/orders")
async def place_order(slug: str, body: NewOrder, request: Request) -> dict:
    shop = await _shop(request, slug)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            return await service.create_order(
                conn, shop["id"], body.contact_id,
                [(line.product_id, line.quantity) for line in body.items],
                body.payment, get_settings().public_web_url, request.app.state.outbound,
            )
    except service.OrderError as error:
        raise HTTPException(
            status_code=_STATUS_FOR.get(error.code, 422),
            detail={"code": error.code, "message": str(error)},
        ) from error
