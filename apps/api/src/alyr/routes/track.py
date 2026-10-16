"""The customer's tracking page for one order. No sign-in: the customer arrives by the
link in their chat, which carries the shop's ID and the order's unguessable ID."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from alyr.core.workspace import module_enabled
from alyr.modules.orders import service

router = APIRouter(prefix="/api/track", tags=["order tracking"])


@router.get("/{tenant_id}/{order_id}")
async def track(tenant_id: UUID, order_id: UUID, request: Request) -> dict:
    db = request.app.state.db
    async with db.unscoped() as conn:
        shop = await conn.fetchrow(
            "select name, name_ar, slug from tenants where id = $1", tenant_id
        )
    if shop is None or not await module_enabled(db, tenant_id, "orders"):
        raise HTTPException(status_code=404, detail="order not found")
    async with db.tenant(tenant_id) as conn:
        order = await service.tracking(conn, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    return {"shop": dict(shop), "order": order}
