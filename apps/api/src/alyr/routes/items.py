"""The workspace's view of the Catalog: items, their photos, switches, stock and counts,
bulk actions with an undo, and photo-first drafts (D-039, ALY-102 and ALY-104).

Owners and admins edit everything. Anyone on the team may flip a switch, record stock and
count the shelf, since that is what the counter does all day. An agent may edit items and
photos too when the owner has allowed it in the shop's settings (`modules/items/access.py`).
"""

from datetime import date, time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from alyr.config import get_settings as app_settings
from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import (
    access,
    bulk,
    changes,
    clock,
    drafts,
    groups,
    listing,
    photos,
    samples,
    stock,
    template,
)
from alyr.modules.items import service as items
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/items", tags=["items"])

Rule = Literal["always", "switch", "count", "daily_limit"]
Unit = Literal["piece", "kg", "box", "pack", "portion", "hour"]
Status = Literal["draft", "live", "hidden", "archived"]
Filter = Literal["draft", "sold_out", "low_stock", "stocked", "archived", "sample"]
Weekday = Annotated[int, Field(ge=0, le=6)]
Money = Annotated[int, Field(ge=0, le=100_000_000, description="In dirhams: 100 is QAR 1")]
# Fields that may be sent as null to clear them; every other field is left alone if null.
NULLABLE = {
    "sale_price", "sale_starts_at", "sale_ends_at", "pack_size", "daily_limit", "sku",
    "low_stock_at",
}


class GroupPriceIn(BaseModel):
    group_id: UUID
    variant_id: UUID | None = Field(
        default=None, description="A size or colour of the item; leave out for the item's own"
    )
    price: int | None = Field(
        default=None, gt=0, le=100_000_000,
        description="What the group pays, in dirhams; null puts the group back on the "
                    "normal price",
    )


class GroupPrices(BaseModel):
    prices: list[GroupPriceIn] = Field(min_length=1, max_length=400)
    reason: str = Field(default="", max_length=200)


class VariantIn(BaseModel):
    id: UUID | None = Field(default=None, description="Leave out to add a new one")
    name: str = Field(default="", max_length=80)
    name_ar: str = Field(default="", max_length=80)
    sku: str | None = Field(
        default=None, max_length=40,
        description="This size's code; unique in the shop. Leave out to keep it, send "
                    "an empty one to clear it",
    )
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
    sku: str | None = Field(
        default=None, max_length=40,
        description="The item's code (SKU). Unique in the shop across items and their "
                    "sizes; empty or null for none",
    )
    group_prices: list[GroupPriceIn] | None = Field(
        default=None, max_length=400,
        description="Prices for customer price groups, saved with the item; "
                    "the rows listed are set, the others are left alone",
    )
    description: str | None = Field(default=None, max_length=1000)
    description_ar: str | None = Field(default=None, max_length=1000)
    category: str | None = Field(default=None, max_length=60)
    price: int | None = Field(
        default=None, ge=0, le=100_000_000,
        description="In dirhams. Zero is only for a draft; an item for sale needs a price",
    )
    sale_price: int | None = Field(default=None, gt=0, le=100_000_000)
    sale_starts_at: AwareDatetime | None = None
    sale_ends_at: AwareDatetime | None = None
    unit: Unit | None = None
    pack_size: int | None = Field(default=None, gt=0, le=100_000)
    min_order: int | None = Field(default=None, ge=1, le=999)
    low_stock_at: int | None = Field(
        default=None, ge=0, le=100_000,
        description="This item's own low-stock number; null uses the shop's",
    )
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
    price: int = Field(ge=0, le=100_000_000, description="In dirhams; zero only for a draft")
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
    agents_edit_items: bool | None = Field(
        default=None, description="Agents may add and edit items and photos"
    )
    low_stock_at: int | None = Field(
        default=None, ge=0, le=100_000, description="Counted stock at or below this is low"
    )
    wholesale_layout: bool | None = Field(
        default=None, description="Every customer gets the compact wholesale table"
    )
    whatsapp_number: str | None = Field(
        default=None, max_length=40,
        description="The number customers message to start an order; empty clears it",
    )


class AlertsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    low_stock: bool | None = None
    sold_out: bool | None = None


class SetupChange(BaseModel):
    """What a type of business started the shop with, which the owner may change. Only what
    is sent is changed."""

    sold_out: Literal["grey", "hide"] | None = Field(
        default=None, description="How a sold-out item looks on the order page"
    )
    new_item_rule: Rule | None = Field(
        default=None, description="How a new item runs out until its form says otherwise"
    )
    alerts: AlertsIn | None = Field(default=None, description="Which alerts are on")


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    name_ar: str = Field(default="", max_length=60)


class PhotoIn(BaseModel):
    asset_id: UUID
    variant_id: UUID | None = Field(
        default=None, description="Put the photo on this size or colour instead of the item"
    )


class PhotoOrder(BaseModel):
    order: list[UUID] = Field(max_length=8, description="Every photo the item has, first is cover")


class DraftsIn(BaseModel):
    photo_ids: list[UUID] = Field(min_length=1, max_length=drafts.MAX_PER_REQUEST)


class BulkIn(BaseModel):
    action: Literal["sold_out", "back", "price_percent", "move_category", "archive"]
    item_ids: list[UUID] = Field(min_length=1, max_length=bulk.MAX_ITEMS)
    percent: int | None = Field(default=None, description="For price_percent: 10 or -5")
    category: str | None = Field(default=None, description="For move_category; empty for none")

    @property
    def params(self) -> dict:
        if self.action == "price_percent":
            return {"percent": self.percent}
        if self.action == "move_category":
            return {"category": self.category}
        return {}


class BulkApply(BulkIn):
    preview: str = Field(min_length=1, max_length=64, description="The preview's hash")


def _media(request: Request):
    return request.app.state.media


def _fail(error: Exception) -> HTTPException:
    if isinstance(error, LookupError):
        return HTTPException(status_code=404, detail="item not found")
    code = getattr(error, "code", "bad_request")
    return HTTPException(status_code=422, detail={"code": code, "message": str(error)})


def _category_names(rows: list[dict]) -> list[dict]:
    """The shop's categories as the activity record keeps them: names and order."""
    return [{"name": r["name"], "name_ar": r["name_ar"]} for r in rows]


def _bulk_fail(error: bulk.BulkError) -> HTTPException:
    return HTTPException(
        status_code=error.status,
        detail={"code": error.code, "message": error.en, "message_ar": error.ar},
    )


def _changes(body: ItemChanges) -> dict:
    sent = body.model_dump(exclude_unset=True)
    sent.pop("reason", None)
    for key, value in list(sent.items()):
        if value is None and key not in NULLABLE and key not in (
            "variants", "option_groups", "schedule", "group_prices"
        ):
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
    return sent


# ── the list, settings and shop-wide reads (before the routes that take an item's ID) ──


@router.get("")
async def list_items(
    request: Request, status: Status | None = None, q: str = "", category: str | None = None,
    archived: bool = False, only: Annotated[Filter | None, Query(alias="filter")] = None,
    limit: Annotated[int | None, Query(ge=1, le=500)] = None,
    offset: Annotated[int, Query(ge=0)] = 0, staff: Staff = Depends(current_staff),
) -> dict:
    """Items for the list: search (Arabic spellings are folded), a filter (`draft`,
    `sold_out`, `low_stock`, `stocked`, `archived`), a category, and a page at a time. The
    answer carries the counts for the filter chips and what the signed-in person may do."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        found = await listing.page(
            conn, await clock.load(conn), status=status, q=q, category=category, only=only,
            include_archived=archived, limit=limit, offset=offset,
        )
        await photos.add_to_views(conn, _media(request), found["items"])
        return {
            **found,
            "categories": await items.categories(conn),
            "access": await access.view(conn, staff),
        }


@router.post("")
async def add_item(
    body: NewItem, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            # A shop at its item limit is told so plainly and loses nothing (ALY-103).
            await _media(request).assert_can_add_item(conn)
            result = await items.create_item(
                conn, _changes(body), team.actor_of(staff), await clock.load(conn)
            )
            await photos.add_to_views(conn, _media(request), [result["item"]])
    except (items.ItemError, stock.StockError) as error:
        raise _fail(error) from error
    return {"id": result["item"]["id"], **result}


@router.post("/drafts")
async def make_drafts(
    body: DraftsIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Photo-first adding: one draft item for each photo already uploaded to the shop's
    library, with the photo as its cover. Photos already on an item are skipped, so
    sending the request again makes no second draft."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await access.require_edit(conn, staff)
        return await drafts.create(
            conn, _media(request), body.photo_ids, team.actor_of(staff), await clock.load(conn)
        )


@router.get("/settings")
async def get_settings(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await items.settings(conn)


@router.get("/share")
async def share_base(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Where the shop's public order page is, for the Share action and the QR codes: the
    page's address built from the configured public web address, the shop's names, and the
    WhatsApp number a customer who opens a public link is sent to. Nothing here is about a
    customer: a public link never carries one (core/links.py)."""
    async with request.app.state.db.unscoped() as conn:
        shop = await conn.fetchrow(
            "select name, name_ar, slug from tenants where id = $1", staff.tenant_id
        )
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        settings = await items.settings(conn)
    base = app_settings().public_web_url.rstrip("/")
    return {
        "url": f"{base}/s/{shop['slug']}" if shop and shop["slug"] else "",
        "name": shop["name"] if shop else "", "name_ar": shop["name_ar"] if shop else "",
        "whatsapp": settings["whatsapp_number"],
    }


@router.put("/settings")
async def put_settings(
    body: StockSettings, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """How long an unpaid pay-link order holds its stock, when the shop's day begins,
    whether agents may edit items, and the low-stock number."""
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            before = await items.settings(conn)
            after = await items.save_settings(
                conn, body.hold_minutes, body.day_starts, body.agents_edit_items,
                body.low_stock_at, body.wholesale_layout, body.whatsapp_number,
            )
            fields = {k: after[k] for k in changes.SETTING_FIELDS}
            await changes.settings_changed(
                conn, team.actor_of(staff), {k: before[k] for k in fields}, fields
            )
            return after
    except items.ItemError as error:
        raise _fail(error) from error


@router.get("/settings/activity")
async def settings_activity(
    request: Request, limit: int = Query(default=50, ge=1, le=200),
    staff: Staff = Depends(current_staff),
) -> dict:
    """Who changed the Catalog's settings, staff numbers and price groups, and what they
    changed: the record nobody can edit. Owners and admins only."""
    access.require_manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"activity": await changes.listing(conn, limit)}


@router.get("/setup")
async def get_setup(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The shop's Catalog wording and layout (what the section is called, how the order page
    is laid out) and what its type of business started it with. `specs/008-catalog-business-types`
    lists every field."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await template.hints(conn)


@router.put("/setup")
async def put_setup(
    body: SetupChange, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The owner changes what the type started them with: sold-out items greyed or left
    out, how a new item runs out, which alerts are on."""
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            before = changes.flat_setup(await template.hints(conn))
            after = await template.save(
                conn, sold_out=body.sold_out, new_item_rule=body.new_item_rule,
                alerts=body.alerts.model_dump(exclude_none=True) if body.alerts else None,
            )
            await changes.settings_changed(
                conn, team.actor_of(staff), before, changes.flat_setup(after)
            )
            return after
    except items.ItemError as error:
        raise _fail(error) from error


@router.post("/samples/remove")
async def remove_samples(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Remove every sample item in one step. Items the owner has made their own are kept."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await access.require_edit(conn, staff)
        return {"removed": await samples.remove_all(conn, team.actor_of(staff))}


@router.get("/categories")
async def get_categories(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"categories": await items.categories(conn)}


@router.put("/categories")
async def put_categories(
    body: list[CategoryIn], request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Set the order of the shop's categories (the order of the list) and their Arabic names."""
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            before = await items.categories(conn)
            rows = await items.save_categories(conn, [c.model_dump() for c in body])
            await changes.settings_changed(
                conn, team.actor_of(staff), {"categories": _category_names(before)},
                {"categories": _category_names(rows)},
            )
    except items.ItemError as error:
        raise _fail(error) from error
    return {"categories": rows}


@router.get("/stock-log")
async def shop_stock_log(
    request: Request, limit: int = Query(default=50, ge=1, le=500),
    staff: Staff = Depends(current_staff),
) -> dict:
    """The latest stock movements across every item, newest first."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"log": await stock.recent(conn, limit)}


# ── bulk actions: preview, apply, one undo ──


@router.post("/bulk/preview")
async def bulk_preview(
    body: BulkIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """What the action would do to these items, and which it cannot touch. Writes nothing.
    The `hash` goes back with the apply, so only what was seen is applied."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if body.action not in bulk.AVAILABILITY:
                await access.require_edit(conn, staff)
            work = await bulk.plan(
                conn, await clock.load(conn), body.action, body.item_ids, body.params
            )
    except bulk.BulkError as error:
        raise _bulk_fail(error) from error
    return work.view()


@router.post("/bulk/apply")
async def bulk_apply(
    body: BulkApply, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if body.action not in bulk.AVAILABILITY:
                await access.require_edit(conn, staff)
            return await bulk.apply(
                conn, await clock.load(conn), team.actor_of(staff), body.action,
                body.item_ids, body.params, body.preview,
            )
    except bulk.BulkError as error:
        raise _bulk_fail(error) from error


@router.get("/bulk/last")
async def bulk_last(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The newest bulk action, if it can still be undone."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"last": await bulk.last(conn)}


@router.post("/bulk/undo")
async def bulk_undo(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Undo the newest bulk action, once. Items edited since are left as they are."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            allowed = bulk.ACTIONS if await access.can_edit(conn, staff) else bulk.AVAILABILITY
            return await bulk.undo(conn, await clock.load(conn), team.actor_of(staff), allowed)
    except bulk.BulkError as error:
        raise _bulk_fail(error) from error


# ── one item ──


@router.get("/{item_id}")
async def get_item(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        shop_clock = await clock.load(conn)
        entry = await items.get(conn, shop_clock, item_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="item not found")
        shown = items.view(entry, shop_clock)
        await photos.add_to_views(conn, _media(request), [shown])
        return shown


@router.put("/{item_id}")
async def save_item(
    item_id: UUID, body: ItemChanges, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            # The owner saving a sample makes it theirs (`samples.py`).
            result = await items.update_item(
                conn, item_id, _changes(body), team.actor_of(staff), await clock.load(conn),
                reason=body.reason, adopt=True,
            )
            if result is not None:
                await photos.add_to_views(conn, _media(request), [result["item"]])
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
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await access.require_edit(conn, staff)
        result = await items.remove(conn, item_id, team.actor_of(staff))
    if result is None:
        raise HTTPException(status_code=404, detail="item not found")
    return {"result": result}


@router.post("/{item_id}/adopt")
async def adopt_sample(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Take a sample as your own without changing it: it stops being a sample and stays a
    draft."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await access.require_edit(conn, staff)
        shop_clock = await clock.load(conn)
        await items.adopt_sample(conn, item_id, team.actor_of(staff))
        entry = await items.get(conn, shop_clock, item_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="item not found")
        shown = items.view(entry, shop_clock)
        await photos.add_to_views(conn, _media(request), [shown])
        return shown


@router.post("/{item_id}/status")
async def change_status(
    item_id: UUID, body: StatusChange, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
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


@router.get("/{item_id}/group-prices")
async def get_group_prices(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """What each customer price group pays for this item (and for its sizes and colours)
    instead of the normal price. A group that is not listed pays the normal price."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await conn.fetchval("select true from items where id = $1", item_id):
            raise HTTPException(status_code=404, detail="item not found")
        return {"prices": await groups.prices_of(conn, item_id)}


@router.put("/{item_id}/group-prices")
async def put_group_prices(
    item_id: UUID, body: GroupPrices, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Set, change or remove group prices (a price of null removes it). The rows listed are
    set; the others are left alone. Every change is added to the group price history."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            await items.refuse_sample(conn, item_id)
            prices = await groups.save_prices(
                conn, item_id, [p.model_dump() for p in body.prices], team.actor_of(staff),
                body.reason,
            )
    except (items.ItemError, LookupError) as error:
        raise _fail(error) from error
    return {"prices": prices}


@router.get("/{item_id}/group-price-history")
async def group_price_history(
    item_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await conn.fetchval("select true from items where id = $1", item_id):
            raise HTTPException(status_code=404, detail="item not found")
        return {"history": await groups.price_history(conn, item_id)}


@router.get("/{item_id}/activity")
async def item_activity(
    item_id: UUID, request: Request, limit: int = Query(default=50, ge=1, le=200),
    staff: Staff = Depends(current_staff),
) -> dict:
    """What was done to the item and by whom: the record nobody can edit."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await conn.fetchval("select true from items where id = $1", item_id):
            raise HTTPException(status_code=404, detail="item not found")
        rows = await conn.fetch(
            "select id, action, detail, actor_id, actor_name, created_at from activity "
            "where subject = 'item' and subject_id = $1 order by created_at desc, id limit $2",
            item_id, limit,
        )
    return {
        "activity": [
            {"id": str(r["id"]), "action": r["action"], "detail": r["detail"],
             "actor": {"id": str(r["actor_id"]) if r["actor_id"] else None,
                       "name": r["actor_name"]},
             "at": r["created_at"].isoformat()}
            for r in rows
        ]
    }


@router.get("/{item_id}/photos")
async def item_photos(
    item_id: UUID, request: Request, variant_id: UUID | None = None,
    staff: Staff = Depends(current_staff),
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            shown = await photos.listed(conn, _media(request), item_id, variant_id)
    except LookupError as error:
        raise _fail(error) from error
    return {"photos": shown, "cover": photos.cover_of(shown)}


@router.post("/{item_id}/photos")
async def add_photo(
    item_id: UUID, body: PhotoIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Put a photo from the shop's library on the item (last in its order; the first is the
    cover), or on one of its sizes or colours. An item has up to eight. The owner putting
    their own photo on a sample makes it theirs."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            await items.adopt_sample(conn, item_id, team.actor_of(staff))
            shown = await photos.attach(
                conn, _media(request), item_id, body.asset_id, team.actor_of(staff),
                body.variant_id,
            )
    except LookupError as error:
        raise _fail(error) from error
    return {"photos": shown, "cover": photos.cover_of(shown)}


@router.put("/{item_id}/photos")
async def order_photos(
    item_id: UUID, body: PhotoOrder, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Set the order of the item's photos. The list must name every photo it has."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            shown = await photos.reorder(
                conn, _media(request), item_id, body.order, team.actor_of(staff)
            )
    except LookupError as error:
        raise _fail(error) from error
    return {"photos": shown, "cover": photos.cover_of(shown)}


@router.post("/{item_id}/photos/{asset_id}/cover")
async def make_cover(
    item_id: UUID, asset_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            shown = await photos.make_cover(
                conn, _media(request), item_id, asset_id, team.actor_of(staff)
            )
    except LookupError as error:
        raise _fail(error) from error
    return {"photos": shown, "cover": photos.cover_of(shown)}


@router.delete("/{item_id}/photos/{asset_id}")
async def remove_photo(
    item_id: UUID, asset_id: UUID, request: Request, variant_id: UUID | None = None,
    staff: Staff = Depends(current_staff),
) -> dict:
    """Take a photo off the item. It stays in the shop's library."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            shown = await photos.detach(
                conn, _media(request), item_id, asset_id, team.actor_of(staff), variant_id
            )
    except LookupError as error:
        raise _fail(error) from error
    return {"photos": shown, "cover": photos.cover_of(shown)}


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
