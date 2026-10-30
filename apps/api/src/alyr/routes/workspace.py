"""The workspace shell: navigation, products, setup checklist and the home dashboard."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.core import workspace
from alyr.core.auth import Staff
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


class Ask(BaseModel):
    product: str = Field(min_length=1, max_length=40)
    step: str = Field(default="", max_length=40)
    note: str = Field(default="", max_length=500)


class Enable(BaseModel):
    # The monthly amount the owner was shown and confirmed, in dirhams (ALY-274, CJ-15).
    confirm_monthly: int | None = Field(default=None, ge=0)


def _refuse(error: Exception) -> HTTPException:
    if isinstance(error, PermissionError):
        return HTTPException(status_code=403, detail=str(error))
    if isinstance(error, LookupError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, workspace.PriceNotConfirmed):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


@router.get("")
async def shell(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        # Whether the products are open yet (ALY-212): the workspace shows a locked page
        # with what to pay until they are.
        return await workspace.state(conn, staff)


@router.get("/home")
async def home(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"cards": await workspace.home(conn, staff)}


@router.post("/products/{key}/enable")
async def enable(
    key: str, request: Request, body: Enable | None = None, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return {"enabled": await workspace.enable_product(
                conn, staff, key, body.confirm_monthly if body else None)}
    except (workspace.WorkspaceError, PermissionError, LookupError) as error:
        raise _refuse(error) from error


@router.post("/products/{key}/disable")
async def disable(key: str, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return {"disabled": await workspace.disable_product(conn, staff, key)}
    except (workspace.WorkspaceError, PermissionError, LookupError) as error:
        raise _refuse(error) from error


@router.get("/setup-requests")
async def setup_requests(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"requests": await workspace.requests(conn)}


@router.post("/setup-requests")
async def ask_alyr(body: Ask, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return {"id": await workspace.ask_alyr(conn, staff, body.product, body.step, body.note)}
    except LookupError as error:
        raise _refuse(error) from error
