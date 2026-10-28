"""The workspace's Discounts: coupon codes and automatic discounts (ALY-150,
`specs/014-pricing-pack/spec.md`).

Owners and admins only, for reading too: the list holds how much money the shop has given away.
Every route answers `422 feature_off` while "Discounts and coupon codes" is switched off for the
shop, so nothing can be made, changed or read while it is off (the rules already made are kept
and do nothing).
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, discounts, features
from alyr.routes.deps import current_staff, require_any_module

router = APIRouter(
    prefix="/api/discounts", tags=["discounts"],
    dependencies=[Depends(require_any_module("orders", "catalog"))],
)


class RuleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str = Field(description="`coupon` (a code the customer types) or `auto`")
    code: str = Field(
        default="", max_length=40, description="For a coupon: 3 to 24 letters or numbers"
    )
    name: str = Field(default="", max_length=60)
    name_ar: str = Field(default="", max_length=60)
    value_type: str = Field(description="`percent`, `amount` or `free_units`")
    percent: Decimal | None = Field(default=None, max_digits=6, decimal_places=3)
    amount: int | None = Field(default=None, description="Dirhams: 100 is QAR 1")
    buy_qty: int | None = None
    get_qty: int | None = None
    scope: str = Field(default="order", description="`order` or `selected`")
    item_ids: list[UUID] = Field(default_factory=list, max_length=200)
    categories: list[str] = Field(default_factory=list, max_length=50)
    min_order: int = Field(
        default=0, ge=0, description="Dirhams, judged on the goods before the discount"
    )
    usage_limit: int | None = Field(default=None, description="Total uses; empty for no limit")
    per_customer_limit: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    stackable: bool = False
    group_id: UUID | None = None

    def data(self) -> dict:
        return self.model_dump()


def _fail(error: discounts.DiscountError | features.FeatureError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": error.code, "message": str(error), "message_ar": error.message_ar},
    )


async def _open(request: Request, staff: Staff):
    """The shop's connection, for a manager, with the feature checked."""
    access.require_manager(staff)
    return request.app.state.db.tenant(staff.tenant_id)


@router.get("")
async def list_rules(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Every rule with its state, how often it was used and what it has given away."""
    scope = await _open(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, "discounts")
            return await discounts.list_rules(conn, datetime.now(UTC))
    except features.FeatureError as error:
        raise _fail(error) from error


@router.post("")
async def add_rule(body: RuleIn, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    scope = await _open(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, "discounts")
            return {"rule": await discounts.save_rule(
                conn, team.actor_of(staff), body.data(), datetime.now(UTC)
            )}
    except (discounts.DiscountError, features.FeatureError) as error:
        raise _fail(error) from error


@router.put("/{rule_id}")
async def change_rule(
    rule_id: UUID, body: RuleIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    scope = await _open(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, "discounts")
            return {"rule": await discounts.save_rule(
                conn, team.actor_of(staff), body.data(), datetime.now(UTC), rule_id
            )}
    except (discounts.DiscountError, features.FeatureError) as error:
        raise _fail(error) from error


@router.post("/{rule_id}/{action}")
async def change_state(
    rule_id: UUID, action: str, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """`pause`, `resume` or `end`. Ending is for good; a copy starts a new one."""
    scope = await _open(request, staff)
    try:
        async with scope as conn:
            await features.require(conn, "discounts")
            rule = await discounts.set_status(
                conn, team.actor_of(staff), rule_id, action, datetime.now(UTC)
            )
    except (discounts.DiscountError, features.FeatureError) as error:
        raise _fail(error) from error
    if rule is None:
        raise HTTPException(status_code=404, detail="discount not found")
    return {"rule": rule}
