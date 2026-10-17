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
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from alyr import catalog, presets
from alyr.config import get_settings
from alyr.core import auth, backoffice, pricing
from alyr.core.auth import Staff
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


class ItemChange(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_ar: str = Field(default="", max_length=120)
    kind: Literal["monthly", "one_time"]
    price: int = Field(ge=0, le=100_000_000, description="In dirhams: 100 is QAR 1")
    applies: str = Field(max_length=60)
    active: bool = True
    sort: int = Field(default=0, ge=0, le=10_000)


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


class Snooze(BaseModel):
    key: str = Field(min_length=3, max_length=120)
    days: int = Field(default=1, ge=1, le=30)


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
        if product is None or product.status != "available":
            raise HTTPException(status_code=422, detail=f"{key} cannot be switched on")
        modules += [m for m in product.modules if m not in modules]
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
    return {"id": str(tenant_id), "slug": slug, "modules": modules}


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
            "products": [{"key": p.key, "name": p.name.en} for p in catalog.PRODUCTS],
            "modules": [{"key": m.key, "name": m.name.en} for m in catalog.MODULES],
        }


@router.put("/pricing/items/{key}")
async def save_item(
    key: str, body: ItemChange, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            before = await conn.fetchrow(
                "select price, active from price_items where key = $1", key
            )
            saved = await pricing.save_item(
                conn, key, body.name, body.name_ar, body.kind, body.price, body.applies,
                body.active, body.sort, _by(staff),
            )
            await backoffice.audit(
                conn, staff, "price_item.saved", "price_item", key,
                detail={"before": dict(before) if before else None,
                        "after": {"price": body.price, "active": body.active,
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
            return await pricing.client(conn, client_id)
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
            await pricing.save_client(
                conn, client_id, body.name, body.contact_name, body.contact_email,
                body.contact_phone, body.note, body.price_mode,
            )
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
