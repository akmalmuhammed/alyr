"""The workspace's view of orders and products."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar
from alyr.modules.orders import service
from alyr.routes.deps import current_staff, current_tenant

router = APIRouter(prefix="/api", tags=["orders"])


class StatusChange(BaseModel):
    status: str


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
    async with request.app.state.db.tenant(tenant_id) as conn:
        slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
        return {"slug": slug, "orders": await service.list_orders(conn)}


@router.post("/orders/{order_id}/status")
async def change_status(
    order_id: UUID, body: StatusChange, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await service.set_status(
                conn, order_id, body.status, request.app.state.outbound, team.actor_of(staff)
            )
    except service.OrderError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if not found:
        raise HTTPException(status_code=404, detail="order not found")
    return {"status": body.status}


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
    body: NewProduct, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        product_id = await conn.fetchval(
            "insert into products (name, name_ar, category, price) values ($1, $2, $3, $4) "
            "returning id",
            body.name, body.name_ar, body.category, body.price,
        )
    return {"id": str(product_id), "price_text": fmt_qar(body.price)}


@router.post("/products/{product_id}/availability")
async def set_availability(
    product_id: UUID, body: Availability, request: Request,
    tenant_id: UUID = Depends(current_tenant),
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        updated = await conn.execute(
            "update products set available = $2 where id = $1", product_id, body.available
        )
    if updated != "UPDATE 1":
        raise HTTPException(status_code=404, detail="product not found")
    return {"available": body.available}
