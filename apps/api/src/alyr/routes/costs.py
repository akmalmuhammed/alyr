"""Cost price and margin: owners and admins only (ALY-150 part 3, `specs/014-pricing-pack/spec.md`).

An agent gets 403 from every route here, whether or not the feature is on, and nothing else in
the API carries a cost or a margin (they live in tables of their own, `modules/items/costs.py`).
While "Cost price and margin" is switched off for the shop each route answers `422 feature_off`.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, clock, costs, features
from alyr.routes.deps import current_staff, require_any_module

router = APIRouter(
    prefix="/api", tags=["cost and margin"],
    dependencies=[Depends(require_any_module("orders", "catalog"))],
)
FEATURE = "cost_margin"


class CostIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cost: int | None = Field(
        default=None, ge=0, le=costs.MAX_COST,
        description="What one unit costs you, in dirhams (100 is QAR 1). Null takes it away",
    )
    variants: dict[str, int | None] = Field(
        default_factory=dict, description="A size's own cost by its ID; null takes it away"
    )
    reason: str = Field(default="", max_length=200)


def _fail(error: costs.CostError | features.FeatureError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": error.code, "message": str(error), "message_ar": error.message_ar},
    )


async def _manager(request: Request, staff: Staff):
    """A connection for an owner or admin, with the feature checked."""
    access.require_manager(staff)
    return request.app.state.db.tenant(staff.tenant_id)


@router.get("/items/margins")
async def item_margins(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The margin each item with a cost leaves at today's price, by item ID (the list's column)."""
    scope = await _manager(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, FEATURE)
            return {"margins": await costs.margins(conn, await clock.load(conn))}
    except features.FeatureError as error:
        raise _fail(error) from error


@router.get("/items/valuation")
async def stock_valuation(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """What the counted stock cost: stock on hand x cost, one number for the Stock tab."""
    scope = await _manager(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, FEATURE)
            return await costs.valuation(conn)
    except features.FeatureError as error:
        raise _fail(error) from error


@router.get("/items/{item_id}/cost")
async def get_cost(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    scope = await _manager(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, FEATURE)
            found = await costs.view(conn, await clock.load(conn), item_id)
    except features.FeatureError as error:
        raise _fail(error) from error
    if found is None:
        raise HTTPException(status_code=404, detail="item not found")
    return found


@router.put("/items/{item_id}/cost")
async def put_cost(
    item_id: UUID, body: CostIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Set what an item (and any size) costs. Answers with the cost, the margin and a list of
    `warnings` where the price is under the cost (saving is never blocked)."""
    scope = await _manager(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, FEATURE)
            sent = body.model_fields_set
            done = await costs.save(
                conn, team.actor_of(staff), item_id,
                body.cost if "cost" in sent else costs.UNSET, body.variants, body.reason,
            )
            if not done:
                raise HTTPException(status_code=404, detail="item not found")
            shop_clock = await clock.load(conn)
            shown = await costs.view(conn, shop_clock, item_id)
            return {**shown, "warnings": await costs.warnings(conn, shop_clock, item_id)}
    except (costs.CostError, features.FeatureError) as error:
        raise _fail(error) from error


@router.get("/orders/margins")
async def order_margins(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The estimated gross margin of each order that has a cost kept, by order ID."""
    scope = await _manager(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, FEATURE)
            return {"margins": await costs.order_margins(conn)}
    except features.FeatureError as error:
        raise _fail(error) from error
