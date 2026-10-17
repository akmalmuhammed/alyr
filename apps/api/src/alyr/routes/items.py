"""The workspace's view of the Catalog: items, their switches, stock and counts.

Owners and admins edit everything. Anyone on the team may flip a switch, record stock and
count the shelf, since that is what the counter does all day (D-039).
"""

from datetime import date, time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import AwareDatetime, BaseModel, Field

from alyr import catalog
from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import clock, stock
from alyr.modules.items import service as items
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/items", tags=["items"])

Rule = Literal["always", "switch", "count", "daily_limit"]
Unit = Literal["piece", "kg", "box", "pack", "portion", "hour"]
Status = Literal["draft", "live", "hidden", "archived"]
Weekday = Annotated[int, Field(ge=0, le=6)]
Money = Annotated[int, Field(ge=0, le=100_000_000, description="In dirhams: 100 is QAR 1")]
# Fields that may be sent as null to clear them; every other field is left alone if null.
NULLABLE = {"sale_price", "sale_starts_at", "sale_ends_at", "pack_size", "daily_limit"}


class VariantIn(BaseModel):
    id: UUID | None = Field(default=None, description="Leave out to add a new one")
    name: str = Field(default="", max_length=80)
    name_ar: str = Field(default="", max_length=80)
    price_delta: int = Field(default=0, ge=-10_000_000, le=10_000_000)
    daily_limit: int | None = Field(default=None, ge=0, le=1_000_000)
    active: bool = True
    opening_stock: int | None = Field(default=None, ge=0, le=1_000_000)


class OptionIn(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=80)
    name_ar: str = Field(default="", max_length=80)
    price_delta: Money = 0
    active: bool = True


class GroupIn(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=80)
    name_ar: str = Field(default="", max_length=80)
    required: bool = False
    max_choices: int = Field(default=1, ge=1, le=50)
    options: list[OptionIn] = Field(default_factory=list, max_length=50)


class WindowIn(BaseModel):
    weekdays: list[Weekday] = Field(default_factory=lambda: list(range(7)), min_length=1)
    opens: time | None = None
    closes: time | None = None
    lead_days: int = Field(default=0, ge=0, le=60)
    cutoff: time | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    closed: bool = False


class ItemChanges(BaseModel):
    """Every field optional: only what is sent is changed. A list (`variants`,
    `option_groups`, `schedule`) replaces the whole set."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    name_ar: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    description_ar: str | None = Field(default=None, max_length=1000)
    category: str | None = Field(default=None, max_length=60)
    price: int | None = Field(default=None, gt=0, le=100_000_000, description="In dirhams")
    sale_price: int | None = Field(default=None, gt=0, le=100_000_000)
    sale_starts_at: AwareDatetime | None = None
    sale_ends_at: AwareDatetime | None = None
    unit: Unit | None = None
    pack_size: int | None = Field(default=None, gt=0, le=100_000)
    min_order: int | None = Field(default=None, ge=1, le=999)
    tags: list[Annotated[str, Field(max_length=30)]] | None = Field(default=None, max_length=20)
    stock_rule: Rule | None = None
    available: bool | None = None
    status: Status | None = None
    sort: int | None = Field(default=None, ge=0, le=100_000)
    daily_limit: int | None = Field(default=None, ge=0, le=1_000_000)
    variants: list[VariantIn] | None = Field(default=None, max_length=100)
    option_groups: list[GroupIn] | None = Field(default=None, max_length=20)
    schedule: list[WindowIn] | None = Field(default=None, max_length=30)
    reason: str = Field(default="", max_length=200, description="Why the price changed")


class NewItem(ItemChanges):
    name: str = Field(min_length=1, max_length=120)
    price: int = Field(gt=0, le=100_000_000, description="In dirhams")
    opening_stock: int | None = Field(
        default=None, ge=0, le=1_000_000,
        description="For an item without variants counted in stock",
    )


class StatusChange(BaseModel):
    status: Status


class Switch(BaseModel):
    available: bool


class StockChange(BaseModel):
    kind: Literal["opening", "received", "wasted", "counted", "adjusted"]
    quantity: int = Field(
        ge=-1_000_000, le=1_000_000,
        description="A number above zero; for adjusted, plus or minus; for counted, the count",
    )
    reason: str = Field(default="", max_length=200)
    variant_id: UUID | None = None
    day: date | None = Field(default=None, description="For a daily-limit item; default today")


class Count(BaseModel):
    counted: int = Field(ge=0, le=1_000_000)
    reason: str = Field(default="", max_length=200)
    variant_id: UUID | None = None
    day: date | None = None


class StockSettings(BaseModel):
    hold_minutes: int | None = Field(default=None, ge=5, le=1440)
    day_starts: time | None = Field(default=None, description="When the shop's day begins")


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    name_ar: str = Field(default="", max_length=60)


def _manager(staff: Staff) -> None:
    if staff.role not in catalog.MANAGERS:
        raise HTTPException(status_code=403, detail="Only the owner or an admin can change this.")


def _fail(error: Exception) -> HTTPException:
    if isinstance(error, LookupError):
        return HTTPException(status_code=404, detail="item not found")
    code = getattr(error, "code", "bad_request")
    return HTTPException(status_code=422, detail={"code": code, "message": str(error)})


def _changes(body: ItemChanges) -> dict:
    sent = body.model_dump(exclude_unset=True)
    sent.pop("reason", None)
    for key, value in list(sent.items()):
        if value is None and key not in NULLABLE and key not in ("variants", "option_groups",
                                                                  "schedule"):
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
    return sent


@router.get("")
async def list_items(
    request: Request, status: Status | None = None, q: str = "", category: str | None = None,
    archived: bool = False, staff: Staff = Depends(current_staff),
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        shop_clock = await clock.load(conn)
        return {
            "items": await items.list_items(conn, shop_clock, status, q, category, archived),
            "categories": await items.categories(conn),
        }


@router.post("")
async def add_item(
    body: NewItem, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            # A shop at its item limit is told so plainly and loses nothing (ALY-103).
            await request.app.state.media.assert_can_add_item(conn)
            result = await items.create_item(
                conn, _changes(body), team.actor_of(staff), await clock.load(conn)
            )
    except (items.ItemError, stock.StockError) as error:
        raise _fail(error) from error
    return {"id": result["item"]["id"], **result}


@router.get("/settings")
async def get_settings(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await items.settings(conn)


@router.put("/settings")
async def put_settings(
    body: StockSettings, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """How long an unpaid pay-link order holds its stock, and when the shop's day begins."""
    _manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await items.save_settings(conn, body.hold_minutes, body.day_starts)
    except items.ItemError as error:
        raise _fail(error) from error


@router.get("/categories")
async def get_categories(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"categories": await items.categories(conn)}


@router.put("/categories")
async def put_categories(
    body: list[CategoryIn], request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Set the order of the shop's categories (the order of the list) and their Arabic names."""
    _manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            rows = await items.save_categories(conn, [c.model_dump() for c in body])
    except items.ItemError as error:
        raise _fail(error) from error
    return {"categories": rows}


@router.get("/{item_id}")
async def get_item(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        shop_clock = await clock.load(conn)
        entry = await items.get(conn, shop_clock, item_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="item not found")
        return items.view(entry, shop_clock)


@router.put("/{item_id}")
async def save_item(
    item_id: UUID, body: ItemChanges, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            result = await items.update_item(
                conn, item_id, _changes(body), team.actor_of(staff), await clock.load(conn),
                reason=body.reason,
            )
    except (items.ItemError, stock.StockError) as error:
        raise _fail(error) from error
    if result is None:
        raise HTTPException(status_code=404, detail="item not found")
    return result


@router.delete("/{item_id}")
async def delete_item(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Delete an item nobody has ordered; archive one they have, so order history is kept."""
    _manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        result = await items.remove(conn, item_id, team.actor_of(staff))
    if result is None:
        raise HTTPException(status_code=404, detail="item not found")
    return {"result": result}


@router.post("/{item_id}/status")
async def change_status(
    item_id: UUID, body: StatusChange, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            result = await items.update_item(
                conn, item_id, {"status": body.status}, team.actor_of(staff),
                await clock.load(conn),
            )
    except items.ItemError as error:
        raise _fail(error) from error
    if result is None:
        raise HTTPException(status_code=404, detail="item not found")
    return {"status": body.status}


@router.post("/{item_id}/switch")
async def flip_switch(
    item_id: UUID, body: Switch, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Sold out, or back: the switch a counter flips all day."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await items.set_available(conn, item_id, body.available, team.actor_of(staff))
    except items.ItemError as error:
        raise _fail(error) from error
    if found is None:
        raise HTTPException(status_code=404, detail="item not found")
    return {"available": body.available}


@router.get("/{item_id}/price-history")
async def price_history(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await conn.fetchval("select true from items where id = $1", item_id):
            raise HTTPException(status_code=404, detail="item not found")
        return {"history": await items.price_history(conn, item_id)}


@router.post("/{item_id}/stock")
async def change_stock(
    item_id: UUID, body: StockChange, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Record stock received, waste, a correction or an opening count. Every change is a row
    in the stock log with who made it and why."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await items.record_stock(
                conn, await clock.load(conn), item_id, body.kind, body.quantity, body.reason,
                team.actor_of(staff), body.variant_id, body.day,
            )
    except (items.ItemError, LookupError) as error:
        raise _fail(error) from error


@router.post("/{item_id}/count")
async def count_stock(
    item_id: UUID, body: Count, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The shelf was counted. The difference from the system is recorded, with the reason."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await items.record_stock(
                conn, await clock.load(conn), item_id, "counted", body.counted, body.reason,
                team.actor_of(staff), body.variant_id, body.day,
            )
    except (items.ItemError, LookupError) as error:
        raise _fail(error) from error


@router.get("/{item_id}/stock-log")
async def stock_log(
    item_id: UUID, request: Request, variant_id: UUID | None = None, limit: int = 100,
    staff: Staff = Depends(current_staff),
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await conn.fetchval("select true from items where id = $1", item_id):
            raise HTTPException(status_code=404, detail="item not found")
        return {"log": await stock.log(conn, item_id, variant_id, max(1, min(limit, 500)))}
