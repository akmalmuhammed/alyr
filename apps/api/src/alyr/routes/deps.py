from uuid import UUID

from fastapi import Depends, HTTPException, Request

from alyr import catalog
from alyr.config import get_settings
from alyr.core import auth
from alyr.core.auth import Staff
from alyr.seed import DEMO_TENANT_ID

DEMO_STAFF = Staff(None, "Workspace", "", "owner", DEMO_TENANT_ID)


async def current_staff(request: Request) -> Staff:
    """Who is making this workspace request.

    A valid session cookie decides it. Without one, a local machine with the open demo
    switched on acts as the demo shop's owner; anywhere else the request is refused.
    """
    token = request.cookies.get(auth.COOKIE)
    if token:
        staff = await auth.resolve(request.app.state.db, token)
        if staff is not None:
            return staff
    settings = get_settings()
    if settings.env == "local" and settings.demo_open:
        return DEMO_STAFF
    raise HTTPException(status_code=401, detail="sign-in required")


async def require_manager(staff: Staff = Depends(current_staff)) -> None:
    """Owners and admins only: prices, services, opening hours, bulk reminders, saved replies
    and failed-job retries do not belong to the agent role (ALY-117). Used as a route
    dependency, `dependencies=[Depends(require_manager)]`."""
    if staff.role not in catalog.MANAGERS:
        raise HTTPException(status_code=403, detail="Only the owner or an admin can change this.")


async def current_tenant(staff: Staff = Depends(current_staff)) -> UUID:
    """The tenant every query in this request is scoped to. It comes from the session,
    never from anything the browser sends."""
    return staff.tenant_id


async def _paid(request: Request, staff: Staff) -> None:
    """Products open once the client has paid (ALY-212, D-051): until then every product's
    screens and API answer 402, and the owner is sent to pay."""
    from alyr.core import access

    if not await access.open_for(request.app.state.db, staff.tenant_id):
        raise HTTPException(
            status_code=402, detail="your workspace opens once ALYR has your payment"
        )


def require_module(module: str):
    """A dependency for workspace routes that belong to one module: refuse when the
    signed-in person's shop has not switched that module on, or has not paid yet."""

    async def check(request: Request, staff: Staff = Depends(current_staff)) -> None:
        from alyr.core.workspace import module_enabled

        await _paid(request, staff)
        if not await module_enabled(request.app.state.db, staff.tenant_id, module):
            raise HTTPException(
                status_code=403, detail=f"{module} is not switched on for this shop"
            )

    return check


def require_any_module(*modules: str):
    """Like `require_module`, for routes two modules share: refuse only when the shop has
    switched on none of them (the Catalog's API serves the orders module and its own)."""

    async def check(request: Request, staff: Staff = Depends(current_staff)) -> None:
        from alyr.core.workspace import module_enabled

        await _paid(request, staff)
        for module in modules:
            if await module_enabled(request.app.state.db, staff.tenant_id, module):
                return
        raise HTTPException(
            status_code=403, detail=f"{' or '.join(modules)} is not switched on for this shop"
        )

    return check


def require_module_for_slug(module: str):
    """The same check for the public customer pages, where the shop comes from the
    address. An unknown shop is left to the route, which answers 404."""

    async def check(request: Request, slug: str) -> None:
        from alyr.core.workspace import module_enabled

        async with request.app.state.db.unscoped() as conn:
            tenant_id = await conn.fetchval("select id from tenants where slug = $1", slug)
        if tenant_id is not None and not await module_enabled(
            request.app.state.db, tenant_id, module
        ):
            raise HTTPException(status_code=404, detail="this page is not available")

    return check
