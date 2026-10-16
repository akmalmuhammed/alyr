"""ALYR's back office: create a shop and its owner, see every shop, and work through
the setup steps shops have asked us to do.

Only ALYR's own staff (the `platform_admins` list) may call these. They work across
shops through a few database functions that refuse to run unless this module has
declared, inside the same transaction, that it checked the caller.
"""

import re
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from alyr import catalog
from alyr.config import get_settings
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
    return staff


async def _admin_call(request: Request, sql: str, *args, fetch: str = "fetch"):
    async with request.app.state.db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        return await getattr(conn, fetch)(sql, *args)


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
    body: NewBusiness, request: Request, _: Staff = Depends(platform_admin)
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
        tenant_id = await _admin_call(
            request,
            "select admin_create_business($1, $2, $3, $4, $5, $6)",
            body.name.strip(),
            body.name_ar.strip(),
            slug,
            email,
            body.owner_name.strip(),
            modules,
            fetch="fetchval",
        )
    except asyncpg.UniqueViolationError as error:
        raise HTTPException(status_code=409, detail="that short name is taken") from error
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
async def resolve(request_id: UUID, request: Request, _: Staff = Depends(platform_admin)) -> dict:
    done = await _admin_call(
        request, "select admin_resolve_setup_request($1)", request_id, fetch="fetchval"
    )
    if not done:
        raise HTTPException(status_code=404, detail="no open request with that id")
    return {"status": "done"}
