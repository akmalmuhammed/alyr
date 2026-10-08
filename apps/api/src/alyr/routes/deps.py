from uuid import UUID

from fastapi import Depends, HTTPException, Request

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


async def current_tenant(staff: Staff = Depends(current_staff)) -> UUID:
    """The tenant every query in this request is scoped to. It comes from the session,
    never from anything the browser sends."""
    return staff.tenant_id
