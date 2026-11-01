"""The workspace's view of orders and products.

`/api/products` is the first, simple way to list and add what a shop sells. The Catalog's
own API is `/api/items` (routes/items.py); these routes now run on the same items.
"""

from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.catalog import MANAGERS
from alyr.config import get_settings
from alyr.core import team
from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar
from alyr.modules.documents import payments as manual_payments
from alyr.modules.documents import refs as doc_refs
from alyr.modules.items import access, clock
from alyr.modules.items import service as items
from alyr.modules.orders import pay_ways, service
from alyr.routes.deps import current_staff, current_tenant

router = APIRouter(prefix="/api", tags=["orders"])


class StatusChange(BaseModel):
    status: str
    restock: bool | None = Field(
        default=None,
        description="For cancelled: put the stock back (default: yes if the order was not "
                    "made yet)",
    )


class MarkPaid(BaseModel):
    method: Literal["cash", "bank_transfer", "cheque", "card_terminal"]
    reference: str = Field(default="", max_length=80, description="A transfer or cheque number")


class PayWays(BaseModel):
    online: bool | None = Field(default=None, description="Offer a payment link")
    ways: list[str] | None = Field(
        default=None, max_length=3,
        description="cash, bank_transfer, card_terminal: what the shop takes on collection",
    )


class Assignment(BaseModel):
    user_id: UUID | None = Field(description="A team member, or null for nobody")


class NewProduct(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_ar: str = Field(default="", max_length=120)
    category: str = Field(default="", max_length=60)
    price: int = Field(gt=0, description="In dirhams: 100 is QAR 1")


class Availability(BaseModel):
    available: bool


@router.get("/orders")
async def orders(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async def compute() -> dict:
        async with request.app.state.db.tenant(tenant_id) as conn:
            slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
            rows = await service.list_orders(conn)
            # A shop with Documents on sees a pointer to the receipt or invoice an order made.
            # A shop without it is answered exactly as before (no `document` key at all).
            made = await doc_refs.by_source(conn, "order", [o["id"] for o in rows])
            for order in rows:
                if order["id"] in made:
                    order["document"] = made[order["id"]]
            return {"slug": slug, "orders": rows}

    return await request.app.state.poll.get_json(tenant_id, ("orders",), compute)


@router.post("/orders/{order_id}/status")
async def change_status(
    order_id: UUID, body: StatusChange, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    """Move an order along. Cancelling puts the stock back if the order was not made yet,
    and says when a refund is due (the shop refunds from its own payment account)."""
    outbound = request.app.state.outbound
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if body.status == "cancelled":
                result = await service.cancel_order(
                    conn, order_id, outbound, team.actor_of(staff), body.restock,
                    "Cancelled by staff",
                )
                found = result is not None
            else:
                result = None
                found = await service.set_status(
                    conn, order_id, body.status, outbound, team.actor_of(staff),
                    get_settings().public_web_url,
                )
    except service.OrderError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if not found:
        raise HTTPException(status_code=404, detail="order not found")
    if result is None:
        return {"status": body.status}
    answer = {
        "status": body.status, "stock_returned": result["stock_returned"],
        "refund_due": result["refund_due"], "refund_text": result.get("refund_text"),
    }
    if result.get("credit_reversed"):
        # The order was on the customer's credit account; its sale is off the ledger again.
        answer["credit_reversed_text"] = result["credit_reversed_text"]
    return answer


@router.post("/orders/{order_id}/paid")
async def mark_paid(
    order_id: UUID, body: MarkPaid, request: Request, staff: Staff = Depends(current_staff),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """The customer paid the shop in cash, by transfer, by cheque or on the card machine
    (ALY-170). The order becomes paid, its stock is sold, and it is on the activity record.
    A shop with Documents on also gets the receipt. Owners and admins; an agent only where
    the shop allows it. ALYR never touches the money (hard rule 3)."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        done = await manual_payments.record(
            conn, staff, subject="order", subject_id=order_id, amount_minor=None,
            method=body.method, reference=body.reference,
            key=idempotency_key or f"order-paid-{uuid4()}",
        )
    return {"payment": done["payment"], "replayed": done["replayed"],
            "receipt": done["document"]}


@router.get("/orders-payment-ways")
async def get_pay_ways(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {**await pay_ways.get(conn), "online_possible": await pay_ways.online_possible(conn)}


@router.put("/orders-payment-ways")
async def put_pay_ways(
    body: PayWays, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """How customers pay: a payment link, or cash, transfer or card machine on collection."""
    if staff.role not in MANAGERS:
        raise HTTPException(status_code=403, detail="only owners and admins change this")
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            saved = await pay_ways.save(conn, body.online, body.ways)
            return {**saved, "online_possible": await pay_ways.online_possible(conn)}
    except pay_ways.PayWaysError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/orders/{order_id}/assign")
async def assign(
    order_id: UUID, body: Assignment, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await team.assign(conn, "order", order_id, body.user_id, team.actor_of(staff))
    except team.TeamError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if not found:
        raise HTTPException(status_code=404, detail="order not found")
    return {"assigned_to": str(body.user_id) if body.user_id else None}


@router.get("/products")
async def products(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"products": await service.list_products(conn)}


@router.post("/products")
async def add_product(
    body: NewProduct, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The first way to add an item: live at once, on the switch rule. An Arabic name is
    not asked for here; `/api/items` asks for it before an item goes live."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            # Adding an item sets a price: the same rule as the Catalog's (ALY-117).
            await access.require_edit(conn, staff)
            await request.app.state.media.assert_can_add_item(conn)
            result = await items.create_item(
                conn,
                {"name": body.name, "name_ar": body.name_ar, "category": body.category,
                 "price": body.price, "status": "live"},
                team.actor_of(staff), await clock.load(conn), require_arabic=False,
            )
    except items.ItemError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"id": result["item"]["id"], "price_text": fmt_qar(body.price)}


@router.post("/products/{product_id}/availability")
async def set_availability(
    product_id: UUID, body: Availability, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await items.set_available(
                conn, product_id, body.available, team.actor_of(staff)
            )
    except items.ItemError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if found is None:
        raise HTTPException(status_code=404, detail="product not found")
    return {"available": body.available}
