"""ALYR's back office: create a shop and its owner, see every shop, and work through
the setup steps shops have asked us to do. Also the price list, each client's quote,
and the switches for which businesses may sign up on their own (D-032).

Only ALYR's own staff (the `platform_admins` list) may call these, signed in within the
last 12 hours. They work across shops through a few database functions that refuse to
run unless this module has declared, inside the same transaction, that it checked the
caller. Every change is written to the audit log in the same transaction (D-033).
"""

import re
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from alyr import catalog, presets
from alyr.config import get_settings
from alyr.core import (
    access,
    auth,
    backoffice,
    card_billing,
    pricing,
    readiness,
    sales_link,
    subscription,
    terms,
    welcome,
    whatsapp_attach,
    whatsapp_setup,
)
from alyr.core.auth import Staff
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import template, template_change
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/admin", tags=["back office"])

_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")


class NewBusiness(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_ar: str = Field(default="", max_length=120)
    slug: str = Field(min_length=2, max_length=40)
    owner_email: str = Field(min_length=3, max_length=200)
    owner_name: str = Field(min_length=1, max_length=120)
    products: list[str] = Field(default_factory=list, max_length=10)
    # Add the business to an existing client; empty makes a new client for it.
    client_id: UUID | None = None
    # A template (ALYR's own type, or one made in the back office) for the business: its type,
    # features, wording, layout, starter categories and fields (ALY-148). Empty is the plain one.
    template: str = Field(default="", max_length=40)


class ItemChange(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_ar: str = Field(default="", max_length=120)
    kind: Literal["monthly", "one_time"]
    price: int = Field(ge=0, le=100_000_000, description="In dirhams: 100 is QAR 1")
    applies: str = Field(max_length=60)
    active: bool = True
    sort: int = Field(default=0, ge=0, le=10_000)
    # In US cents, for a card payment through Paddle (D-074); null: the riyal price at the
    # peg. Left out: unchanged.
    price_usd: int | None = Field(default=None, ge=0, le=10_000_000)


class TermsVersion(BaseModel):
    kind: Literal["agreement", "privacy"]
    version: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=160)
    title_ar: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=300)
    url_ar: str = Field(min_length=1, max_length=300)
    changes: str = Field(default="", max_length=400)
    changes_ar: str = Field(default="", max_length=400)


class TypeChange(BaseModel):
    availability: Literal["self_serve", "with_alyr", "hidden"]
    price_mode: Literal["automatic", "prepared"]


class Promise(BaseModel):
    en: str = Field(default="", max_length=400)
    ar: str = Field(default="", max_length=400)


class ClientChange(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    contact_name: str = Field(default="", max_length=120)
    contact_email: str = Field(default="", max_length=200)
    contact_phone: str = Field(default="", max_length=40)
    note: str = Field(default="", max_length=2000)
    price_mode: Literal["automatic", "prepared"] | None = None


class NewQuote(BaseModel):
    start_from: Literal["price_list", "copy"] = "price_list"


class QuoteLine(BaseModel):
    business_id: UUID | None = None
    item_key: str | None = Field(default=None, max_length=40)
    name: str = Field(min_length=1, max_length=160)
    name_ar: str = Field(default="", max_length=160)
    kind: Literal["monthly", "one_time"]
    quantity: int = Field(default=1, ge=1, le=1000)
    unit_price: int = Field(ge=-100_000_000, le=100_000_000)


class QuoteChange(BaseModel):
    period_months: Literal[1, 3, 6, 12] = 1
    discount_pct: int = Field(default=0, ge=0, le=100)
    show_promise: bool = True
    note: str = Field(default="", max_length=2000)
    lines: list[QuoteLine] = Field(max_length=200)


class MoveBusiness(BaseModel):
    client_id: UUID


class SwitchModule(BaseModel):
    enabled: bool


# The modules the back office switches for one business. The Catalog is on for every business
# (ALY-113) and this is how one business has it turned off, or back on; the other modules are
# a business's products and are switched in its own workspace. Documents (ALY-138) is off for
# every business and has no screen yet: this is how ALYR switches it on for one business to
# try it, until the workspace screens (package 3) make it part of a product.
SWITCHABLE_MODULES = ("catalog", "documents")


class Snooze(BaseModel):
    key: str = Field(min_length=3, max_length=120)
    days: int = Field(default=1, ge=1, le=30)


class StepChange(BaseModel):
    owner: Literal["client", "alyr"] | None = None
    # What is holding the step up, in ALYR's words; empty clears it.
    blocker: str | None = Field(default=None, max_length=500)
    choice: str | None = Field(default=None, max_length=40)


class Payment(BaseModel):
    # In dirhams (100 is QAR 1), what the bank statement or link shows.
    amount: int = Field(gt=0, le=100_000_000)
    method: Literal["bank_transfer", "cash", "cheque", "link"]
    reference: str = Field(default="", max_length=120)
    received_on: date
    note: str = Field(default="", max_length=500)


class CardBillingChange(BaseModel):
    # Null: the platform's setting (ALYR_CARD_BILLING). "off": this client pays by transfer.
    card_billing: Literal["off", "paddle"] | None


class Cancellation(BaseModel):
    # How the client asked: "email from the owner, 29 Oct", "call with Fatima".
    note: str = Field(min_length=1, max_length=500)


class OpenWithout(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class WhatsappChange(BaseModel):
    # What ALYR fills in for the client (assisted onboarding)...
    phone: str | None = Field(default=None, max_length=30)
    display_name: str | None = Field(default=None, max_length=80)
    ready: list[str] | None = Field(default=None, max_length=10)
    # ...and where ALYR is with the connection; a failure says why, for the owner to read.
    state: Literal["", "connecting", "failed"] | None = None
    note: str = Field(default="", max_length=500)


class AttachNumber(BaseModel):
    number_id: str = Field(max_length=30)
    waba_id: str = Field(default="", max_length=30)


class NewStaff(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    name: str = Field(default="", max_length=120)


async def platform_admin(request: Request, staff: Staff = Depends(current_staff)) -> Staff:
    """The caller must be signed in as ALYR staff. On a local machine with the open demo
    on, the unsigned demo user counts as ALYR staff so the back office can be tried."""
    settings = get_settings()
    if staff.user_id is None:
        if settings.env == "local" and settings.demo_open:
            return staff
        raise HTTPException(status_code=401, detail="sign-in required")
    async with request.app.state.db.unscoped() as conn:
        allowed = await conn.fetchval(
            "select true from platform_admins where email = $1", staff.email.lower()
        )
    if not allowed:
        raise HTTPException(status_code=403, detail="ALYR staff only")
    # The back office sees every client, so its sign-in is short-lived.
    started = await auth.session_started(
        request.app.state.db, request.cookies.get(auth.COOKIE, "")
    )
    if started is None or started < _hours_ago(backoffice.STAFF_SESSION_HOURS):
        raise HTTPException(
            status_code=401,
            detail="sign in again: back-office sign-ins last "
            f"{backoffice.STAFF_SESSION_HOURS} hours",
        )
    return staff


def _hours_ago(hours: int) -> datetime:
    return datetime.now(UTC) - timedelta(hours=hours)


async def _admin_call(request: Request, sql: str, *args, fetch: str = "fetch"):
    async with _back_office(request) as conn:
        return await getattr(conn, fetch)(sql, *args)


@asynccontextmanager
async def _back_office(request: Request):
    """A connection, in one transaction, on which the API declares the caller is ALYR
    staff. Row-level security and the back-office functions check that declaration."""
    async with request.app.state.db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        yield conn


def _by(staff: Staff) -> str:
    return staff.name or staff.email or "ALYR"


@router.get("/businesses")
async def businesses(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    rows = await _admin_call(request, "select * from admin_businesses()")
    return {
        "businesses": [
            {
                **dict(r),
                "id": str(r["id"]),
                "created_at": r["created_at"].isoformat(),
                "products": catalog.products_for(set(r["modules"])),
            }
            for r in rows
        ]
    }


@router.post("/businesses")
async def create_business(
    body: NewBusiness, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    slug = body.slug.strip().lower()
    if not _SLUG.match(slug):
        raise HTTPException(status_code=422, detail="the short name may use a-z, 0-9 and dashes")
    email = body.owner_email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="give the owner's email")
    modules: list[str] = []
    for key in body.products:
        product = catalog.PRODUCT_BY_KEY.get(key)
        if product is not None and product.status == "included":
            continue  # every business has it already
        if product is None or product.status != "available":
            raise HTTPException(status_code=422, detail=f"{key} cannot be switched on")
        modules += [m for m in product.modules if m not in modules]
    target = None
    if body.template:
        async with _back_office(request) as conn:
            target = await template_change.find(conn, body.template, usable=True)
        if target is None:
            raise HTTPException(status_code=404, detail="no such template")
    if get_settings().catalog_for_new_shops and "catalog" not in modules:
        # Every business has the Catalog, as the shops made by onboarding do (ALY-113). It has
        # no type of its own here, so it gets the plain Catalog; the back office can switch it
        # off for this business afterwards.
        modules.append("catalog")
    try:
        async with _back_office(request) as conn:
            tenant_id = await conn.fetchval(
                "select admin_create_business($1, $2, $3, $4, $5, $6, $7)",
                body.name.strip(), body.name_ar.strip(), slug, email,
                body.owner_name.strip(), modules, body.client_id,
            )
            client_id = await conn.fetchval(
                "select client_id from tenants where id = $1", tenant_id
            )
            await backoffice.audit(
                conn, staff, "business.created", "business", tenant_id,
                client_id=client_id, business_id=tenant_id,
                detail={"name": body.name.strip(), "slug": slug, "owner": email,
                        "modules": modules},
            )
    except asyncpg.UniqueViolationError as error:
        raise HTTPException(status_code=409, detail="that short name is taken") from error
    except asyncpg.ForeignKeyViolationError as error:
        raise HTTPException(status_code=404, detail="no such client") from error
    if target is not None and "catalog" in modules:
        # Its type first (an owner cannot change it), then what the template brings. No samples:
        # a business made here has its own items.
        async with _back_office(request) as conn:
            await conn.fetchval(
                "select admin_set_business_type($1, $2)", tenant_id,
                template_change.business_type_of(target),
            )
            await backoffice.audit(
                conn, staff, "business.template", "business", tenant_id, business_id=tenant_id,
                detail={"to": target.key, "created": True},
            )
        async with request.app.state.db.tenant(tenant_id) as conn:
            await template.apply(
                conn, target, await shop_clock.load(conn), samples_too=False, by=_by(staff)
            )
    # The owner learns the workspace exists and how to sign in to it (specs/037).
    async with request.app.state.db.tenant(tenant_id) as conn:
        owner = await conn.fetchval(
            "select user_id from memberships where role = 'owner' order by created_at limit 1"
        )
        await welcome.queue(conn, welcome.INVITE, owner)
    return {"id": str(tenant_id), "slug": slug, "modules": modules,
            "template": target.key if target else None}


@router.get("/setup-requests")
async def setup_requests(
    request: Request,
    status: str = Query("open", pattern="^(open|done|all)$"),
    _: Staff = Depends(platform_admin),
) -> dict:
    rows = await _admin_call(request, "select * from admin_setup_requests($1)", status)
    return {
        "requests": [
            {
                **dict(r),
                "id": str(r["id"]),
                "tenant_id": str(r["tenant_id"]),
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ]
    }


@router.post("/setup-requests/{request_id}/done")
async def resolve(
    request_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    async with _back_office(request) as conn:
        if not await conn.fetchval("select admin_resolve_setup_request($1)", request_id):
            raise HTTPException(status_code=404, detail="no open request with that id")
        await backoffice.audit(conn, staff, "request.done", "request", request_id)
    return {"status": "done"}


@router.post("/businesses/{business_id}/client")
async def move_business(
    business_id: UUID, body: MoveBusiness, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Put a business under another client, for an owner who signed up twice."""
    async with _back_office(request) as conn:
        before = await conn.fetchval("select client_id from tenants where id = $1", business_id)
        if not await conn.fetchval(
            "select admin_set_business_client($1, $2)", business_id, body.client_id
        ):
            raise HTTPException(status_code=404, detail="no such business or client")
        await backoffice.audit(
            conn, staff, "business.moved", "business", business_id,
            client_id=body.client_id, business_id=business_id,
            detail={"from_client": str(before) if before else None},
        )
    return {"moved": True}


@router.post("/businesses/{business_id}/modules/{module}")
async def switch_module(
    business_id: UUID, module: str, body: SwitchModule, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Switch the Catalog (or Documents) on or off for one business. Nothing is deleted: its
    items, photos and stock (or its documents, which cannot be deleted at all) stay, and the
    screens and pages come back when it is switched on again."""
    if module not in SWITCHABLE_MODULES:
        raise HTTPException(status_code=404, detail=f"{module} cannot be switched here")
    async with _back_office(request) as conn:
        if not await conn.fetchval(
            "select admin_set_module($1, $2, $3)", business_id, module, body.enabled
        ):
            raise HTTPException(status_code=404, detail="no such business")
        await backoffice.audit(
            conn, staff, "module.on" if body.enabled else "module.off", "business",
            business_id, business_id=business_id, detail={"module": module},
        )
    return {"module": module, "enabled": body.enabled}


# ── pricing and onboarding switches (D-032) ───────────────


@router.get("/pricing")
async def price_list(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    async with _back_office(request) as conn:
        settings = await pricing.type_settings(conn)
        return {
            "items": await pricing.items(conn),
            "types": [
                {"key": p.key, "name": p.name.en, "name_ar": p.name.ar, "icon": p.icon,
                 **settings[p.key]}
                for p in presets.PRESETS
            ],
            "promise": await pricing.promise(conn),
            "products": [
                {"key": p.key, "name": p.name.en, "status": p.status} for p in catalog.PRODUCTS
            ],
            "modules": [{"key": m.key, "name": m.name.en} for m in catalog.MODULES],
        }


@router.put("/pricing/items/{key}")
async def save_item(
    key: str, body: ItemChange, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            before = await conn.fetchrow(
                "select price, price_usd, active from price_items where key = $1", key
            )
            saved = await pricing.save_item(
                conn, key, body.name, body.name_ar, body.kind, body.price, body.applies,
                body.active, body.sort, _by(staff), price_usd=body.price_usd,
                set_usd="price_usd" in body.model_fields_set,
            )
            await backoffice.audit(
                conn, staff, "price_item.saved", "price_item", key,
                detail={"before": dict(before) if before else None,
                        "after": {"price": body.price, "price_usd": saved["price_usd"],
                                  "active": body.active,
                                  "applies": body.applies, "kind": body.kind}},
            )
            return saved
    except pricing.PricingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/pricing/types/{key}")
async def save_type(
    key: str, body: TypeChange, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            before = (await pricing.type_settings(conn)).get(key)
            await pricing.save_type(conn, key, body.availability, body.price_mode, _by(staff))
            await backoffice.audit(
                conn, staff, "business_type.saved", "business_type", key,
                detail={"before": before, "after": body.model_dump()},
            )
            return (await pricing.type_settings(conn))[key]
    except pricing.PricingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/pricing/promise")
async def save_promise(
    body: Promise, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    async with _back_office(request) as conn:
        before = await pricing.promise(conn)
        await pricing.save_promise(conn, body.en, body.ar, _by(staff))
        await backoffice.audit(
            conn, staff, "promise.saved", "setting", "promise",
            detail={"before": before, "after": body.model_dump()},
        )
        return await pricing.promise(conn)


@router.get("/clients")
async def clients(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    async with _back_office(request) as conn:
        return {"clients": await pricing.clients(conn)}


@router.get("/clients/{client_id}")
async def client(client_id: UUID, request: Request, _: Staff = Depends(platform_admin)) -> dict:
    try:
        async with _back_office(request) as conn:
            return await pricing.client(conn, client_id) | {
                "access": await _access(conn, client_id)
            }
    except pricing.PricingError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.patch("/clients/{client_id}")
async def change_client(
    client_id: UUID, body: ClientChange, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    try:
        async with _back_office(request) as conn:
            await backoffice.audit(
                conn, staff, "client.saved", "client", client_id, client_id=client_id,
                detail=body.model_dump(),
            )
            before = await conn.fetchval(
                "select contact_email from clients where id = $1", client_id
            )
            await pricing.save_client(
                conn, client_id, body.name, body.contact_name, body.contact_email,
                body.contact_phone, body.note, body.price_mode,
            )
            if body.contact_email.strip().lower() != (before or "").strip().lower():
                # A sales link was made for the old address (ALY-216).
                await sales_link.email_changed(conn, staff, client_id)
            return await pricing.client(conn, client_id)
    except pricing.PricingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/clients/{client_id}/quotes")
async def new_quote(
    client_id: UUID, body: NewQuote, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            quote_id = await pricing.new_quote(conn, client_id, body.start_from, _by(staff))
            await backoffice.audit(
                conn, staff, "quote.created", "quote", quote_id, client_id=client_id,
                detail={"start_from": body.start_from},
            )
            return await pricing.client(conn, client_id)
    except pricing.PricingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


async def _client_of(conn: asyncpg.Connection, quote_id: UUID) -> UUID:
    client_id = await conn.fetchval("select client_id from quotes where id = $1", quote_id)
    if client_id is None:
        raise HTTPException(status_code=404, detail="no such quote")
    return client_id


@router.put("/quotes/{quote_id}")
async def save_quote(
    quote_id: UUID, body: QuoteChange, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Change a draft or published quote. A published one changes on the owner's screen
    as soon as this is saved."""
    try:
        async with _back_office(request) as conn:
            client_id = await _client_of(conn, quote_id)
            await pricing.save_quote(
                conn, quote_id, body.period_months, body.discount_pct, body.show_promise,
                body.note, [line.model_dump() for line in body.lines], _by(staff),
            )
            lines = [line.model_dump(mode="json") for line in body.lines]
            await backoffice.audit(
                conn, staff, "quote.saved", "quote", quote_id, client_id=client_id,
                detail={"period_months": body.period_months, "discount_pct": body.discount_pct,
                        "totals": pricing.totals(lines, body.period_months, body.discount_pct),
                        "lines": lines},
            )
            return await pricing.client(conn, client_id)
    except pricing.PricingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/quotes/{quote_id}/{action}")
async def quote_action(
    quote_id: UUID, action: Literal["publish", "unpublish", "withdraw"], request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    try:
        async with _back_office(request) as conn:
            client_id = await _client_of(conn, quote_id)
            await pricing.set_quote_status(conn, quote_id, action, _by(staff))
            await backoffice.audit(
                conn, staff, f"quote.{action}", "quote", quote_id, client_id=client_id
            )
            return await pricing.client(conn, client_id)
    except pricing.PricingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


# ── today, staff and the audit log (D-033) ────────────────


@router.get("/today")
async def today(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    async with _back_office(request) as conn:
        return await backoffice.today(conn)


@router.post("/today/snooze")
async def snooze(body: Snooze, request: Request, staff: Staff = Depends(platform_admin)) -> dict:
    try:
        async with _back_office(request) as conn:
            until = await backoffice.snooze(conn, body.key, body.days, staff.email)
            await backoffice.audit(
                conn, staff, "today.snoozed", "today_item", body.key, detail={"days": body.days}
            )
    except backoffice.BackOfficeError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"until": until.isoformat()}


@router.post("/today/unsnooze")
async def unsnooze(body: Snooze, request: Request, staff: Staff = Depends(platform_admin)) -> dict:
    async with _back_office(request) as conn:
        await backoffice.unsnooze(conn, body.key)
        await backoffice.audit(conn, staff, "today.unsnoozed", "today_item", body.key)
    return {"ok": True}


@router.get("/staff")
async def staff_list(request: Request, me: Staff = Depends(platform_admin)) -> dict:
    async with _back_office(request) as conn:
        return {"staff": await backoffice.staff_list(conn), "me": me.email}


@router.post("/staff")
async def add_staff(
    body: NewStaff, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            await backoffice.add_staff(conn, body.email, body.name, _by(staff))
            await backoffice.audit(
                conn, staff, "staff.added", "staff", body.email.strip().lower(),
                detail={"name": body.name},
            )
            return {"staff": await backoffice.staff_list(conn)}
    except backoffice.BackOfficeError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/staff/{email}")
async def remove_staff(
    email: str, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    if email.strip().lower() == (staff.email or "").lower():
        raise HTTPException(status_code=422, detail="you cannot remove yourself")
    try:
        async with _back_office(request) as conn:
            if not await backoffice.remove_staff(conn, email):
                raise HTTPException(status_code=404, detail="not on the staff list")
            await backoffice.audit(conn, staff, "staff.removed", "staff", email.strip().lower())
            return {"staff": await backoffice.staff_list(conn)}
    except backoffice.BackOfficeError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/audit")
async def audit_log(
    request: Request, client_id: UUID | None = None,
    limit: int = Query(200, ge=1, le=1000), _: Staff = Depends(platform_admin),
) -> dict:
    async with _back_office(request) as conn:
        return {"entries": await backoffice.audit_log(conn, client_id, limit)}


# ── onboarding board and readiness (ALY-165, D-049) ──────


@asynccontextmanager
async def _in_business(request: Request, business_id: UUID):
    """The back-office connection, also scoped to one business: the business's own rows
    and the audit log are written in the same transaction, so they stand or fall together."""
    async with _back_office(request) as conn:
        if not await conn.fetchval("select true from tenants where id = $1", business_id):
            raise HTTPException(status_code=404, detail="no such business")
        await conn.execute("select set_config('app.tenant_id', $1, true)", str(business_id))
        yield conn


@router.get("/onboarding")
async def onboarding_board(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    """Every business by stage, as the readiness check last saw it: what is left, what
    ALYR owes, what is blocked, and who has not moved in two days."""
    now = datetime.now(UTC)
    rows = await _admin_call(request, "select * from admin_onboarding()")
    board = [readiness.board_row(r, now) for r in rows]
    counts = {stage: 0 for stage in ("setting_up", "ready", "live")}
    for b in board:
        counts[b["stage"]] += 1
    return {"businesses": board, "counts": counts}


@router.get("/onboarding/funnel")
async def onboarding_funnel(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    """Where businesses stop on the way to live, how long each step takes, and how many needed
    ALYR's hand (ALY-169). Read from the record the onboarding engine keeps."""
    return {
        **readiness.funnel(await _admin_call(
            request, "select admin_onboarding_funnel()", fetch="fetchval")),
        # How many reminders to finish setting up went, and how many owners came back (ALY-171).
        "reminders": await _admin_call(request, "select admin_resume_stats()", fetch="fetchval"),
    }


@router.get("/terms")
async def terms_versions(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    """Every version of the customer agreement and the privacy notice ALYR has published."""
    async with _back_office(request) as conn:
        return {"versions": await terms.versions(conn)}


@router.post("/terms")
async def publish_terms(
    body: TermsVersion, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Publish a version. It becomes the current one of its kind, and every owner is asked to
    accept it once. It can never be changed: a correction is a new version."""
    try:
        async with _back_office(request) as conn:
            published = await terms.publish(conn, by=_by(staff), **body.model_dump())
            await backoffice.audit(
                conn, staff, "terms.published", "terms_version", published["id"],
                detail={"kind": body.kind, "version": body.version},
            )
            return published
    except terms.TermsError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/businesses/{business_id}/terms")
async def business_terms(
    business_id: UUID, request: Request, _: Staff = Depends(platform_admin)
) -> dict:
    """What one business has accepted, who and when, and what it has not accepted yet."""
    async with _in_business(request, business_id) as conn:
        return {**await terms.state(conn), "accepted": await terms.history(conn)}


@router.get("/businesses/{business_id}/readiness")
async def business_readiness(
    business_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Check one business now, as its owner would see it."""
    async with _in_business(request, business_id) as conn:
        return await readiness.run(conn, _by(staff), by_alyr=True)


@router.patch("/businesses/{business_id}/steps/{key}")
async def change_step(
    business_id: UUID, key: str, body: StepChange, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Take a step on for the client (assisted onboarding), hand it back, or write what is
    holding it up. The client sees the owner and the blocker on their own go-live list."""
    try:
        async with _in_business(request, business_id) as conn:
            changed = {}
            if body.owner is not None and await readiness.set_owner(
                conn, key, body.owner, _by(staff), True
            ):
                changed["owner"] = body.owner
            if body.blocker is not None and await readiness.set_blocker(
                conn, key, body.blocker, _by(staff)
            ):
                changed["blocker"] = body.blocker.strip()
            if body.choice is not None and await readiness.set_choice(
                conn, key, body.choice, _by(staff), True
            ):
                changed["choice"] = body.choice
            if changed:
                await backoffice.audit(
                    conn, staff, "onboarding.step", "business", business_id,
                    business_id=business_id, detail={"step": key, **changed},
                )
            return await readiness.run(conn, _by(staff), by_alyr=True)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except readiness.ReadinessError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.patch("/businesses/{business_id}/whatsapp")
async def change_whatsapp(
    business_id: UUID, body: WhatsappChange, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Fill in a business's WhatsApp setup for them, or say where ALYR is with connecting
    it (ALY-217). The owner sees the state, and a failure's reason, on their go-live list."""
    try:
        async with _in_business(request, business_id) as conn:
            # The audit names what was filled in, and keeps ALYR's state and note.
            detail: dict = {}
            if (body.phone, body.display_name, body.ready) != (None, None, None):
                given = await whatsapp_setup.prepare(
                    conn, _by(staff), True, phone=body.phone, display_name=body.display_name,
                    ready=body.ready,
                )
                detail |= {key: True for key in given}
            if body.state is not None and await whatsapp_setup.set_state(
                conn, body.state, body.note, _by(staff)
            ):
                detail |= {"state": body.state, "note": body.note.strip()}
            if detail:
                await backoffice.audit(
                    conn, staff, "onboarding.whatsapp", "business", business_id,
                    business_id=business_id, detail=detail,
                )
            return await readiness.run(conn, _by(staff), by_alyr=True)
    except whatsapp_setup.SetupError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/businesses/{business_id}/whatsapp/number")
async def attach_number(
    business_id: UUID, body: AttachNumber, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Attach the business's Meta number (ALY-166) once Meta shows it connected. Messages to
    it reach the business from then on, and the go-live check sees WhatsApp as done."""
    try:
        async with _in_business(request, business_id) as conn:
            attached = await whatsapp_attach.attach(
                conn, request.app.state.outbound.channels["meta"], business_id,
                body.number_id, body.waba_id, _by(staff),
            )
            await backoffice.audit(
                conn, staff, "whatsapp.attached", "business", business_id,
                business_id=business_id, detail=attached,
            )
            return await readiness.run(conn, _by(staff), by_alyr=True)
    except whatsapp_attach.AttachError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/businesses/{business_id}/whatsapp/number")
async def detach_number(
    business_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Take the business's Meta number off (a wrong number, or a move). The test line stays."""
    async with _in_business(request, business_id) as conn:
        removed = await whatsapp_attach.detach(conn, business_id)
        if removed is None:
            raise HTTPException(status_code=404, detail="this business has no WhatsApp number")
        await backoffice.audit(
            conn, staff, "whatsapp.detached", "business", business_id,
            business_id=business_id, detail={"number_id": removed},
        )
        return await readiness.run(conn, _by(staff), by_alyr=True)


# ── what a client pays ALYR (ALY-212, D-051; payment at go-live: ALY-242, D-053) ──


@router.post("/clients/{client_id}/payments")
async def record_payment(
    client_id: UUID, body: Payment, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Record a payment the client made to ALYR. Once what is due is covered, the client can
    go live."""
    try:
        async with _back_office(request) as conn:
            covered = await access.record(
                conn, client_id, amount=body.amount, method=body.method,
                reference=body.reference, received_on=body.received_on, note=body.note,
                by=_by(staff),
            )
            # A payment can end a pause at once (ALY-218).
            await subscription.refresh(conn, client_id)
            await backoffice.audit(
                conn, staff, "client.payment", "client", client_id, client_id=client_id,
                detail={"amount": body.amount, "method": body.method,
                        "received_on": body.received_on.isoformat(), "covered": covered},
            )
            return await _access(conn, client_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except access.AccessError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/clients/{client_id}/card-billing")
async def change_card_billing(
    client_id: UUID, body: CardBillingChange, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Offer this client a card payment, or not (ALY-180, D-074). A card provider can only be
    offered once it is set up for the whole platform; this never starts or stops a payment
    already made."""
    async with _back_office(request) as conn:
        before = await conn.fetchrow(
            "select card_billing from clients where id = $1 for update", client_id
        )
        if before is None:
            raise HTTPException(status_code=404, detail="no such client")
        if before["card_billing"] != body.card_billing:
            await conn.execute(
                "update clients set card_billing = $2 where id = $1", client_id, body.card_billing
            )
            await backoffice.audit(
                conn, staff, "client.card_billing", "client", client_id, client_id=client_id,
                detail={"from": before["card_billing"], "to": body.card_billing},
            )
        return await _access(conn, client_id)


async def _access(conn, client_id: UUID) -> dict:
    """What the client owes and paid, their latest card checkout, and where their plan
    stands (ALY-218)."""
    now = await subscription.current(conn, client_id)
    note = await conn.fetchrow(
        "select cancel_note, cancel_requested_at, sending_paused_at from clients where id = $1",
        client_id,
    )
    return await access.summary(conn, client_id) | {
        "checkout": await card_billing.latest(conn, client_id),
        "subscription": subscription.view(now) | {
            "cancel_note": note["cancel_note"] if note else "",
            "paused_since": note["sending_paused_at"].isoformat()
            if note and note["sending_paused_at"] else None,
        },
    }


@router.post("/clients/{client_id}/cancel")
async def cancel_client(
    client_id: UUID, body: Cancellation, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """The client asked to cancel. It takes effect in seven days (D-034): from that day ALYR
    sends nothing more for its businesses and its card subscription is cancelled. Nothing is
    deleted and the workspace stays open (D-033)."""
    try:
        async with _back_office(request) as conn:
            day = await subscription.cancel(conn, client_id, body.note)
            await backoffice.audit(
                conn, staff, "client.cancel", "client", client_id, client_id=client_id,
                detail={"cancels_on": day.isoformat(), "note": body.note.strip()},
            )
            return await _access(conn, client_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except subscription.CancelError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/clients/{client_id}/cancel")
async def undo_cancel(
    client_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """The client stays after all."""
    try:
        async with _back_office(request) as conn:
            if await subscription.undo_cancel(conn, client_id):
                await backoffice.audit(
                    conn, staff, "client.cancel_undone", "client", client_id,
                    client_id=client_id,
                )
            return await _access(conn, client_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/clients/{client_id}/waive")
async def waive_payment(
    client_id: UUID, body: OpenWithout, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Waive a client's payment (a pilot, a demo), saying why."""
    try:
        async with _back_office(request) as conn:
            if await access.waive(conn, client_id, body.reason):
                await subscription.refresh(conn, client_id)
                await backoffice.audit(
                    conn, staff, "client.payment_waived", "client", client_id, client_id=client_id,
                    detail={"reason": body.reason.strip()},
                )
            return await _access(conn, client_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except access.AccessError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
