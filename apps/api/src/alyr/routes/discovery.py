"""Discovery in the workspace (spec 065, D-160): a thin layer over `modules/discovery/actions.py`.

Every route answers only for a shop that has switched `discovery` on: otherwise 404 `module_off`
(the spec's choice; the other modules' `require_module` answers 403). Who may do what is the
action's: the owner and admins do everything, staff read and start a check-up. Words come in the
reader's language through `?lang=en|ar` (default: the business's own). Errors are
`{detail, code, message_ar, ...}` like Documents'.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from alyr.core import actions
from alyr.core.auth import Staff
from alyr.modules.discovery import KEY
from alyr.modules.discovery.errors import DiscoveryError
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/discovery", tags=["discovery"])
Lang = Query(None, pattern="^(en|ar)$")


async def module_on(request: Request, staff: Staff = Depends(current_staff)) -> None:
    modules = await request.app.state.shops.modules_of(request.app.state.db, staff.tenant_id)
    if KEY not in modules:
        raise DiscoveryError("module_off", 404)


async def refused(request: Request, error: DiscoveryError) -> JSONResponse:
    """How every refusal reaches a client: the words in English, a `code` to act on, the same
    words in Arabic, and whatever says more (`retry_after`, `limit`)."""
    headers = (
        {"Retry-After": str(error.extra["retry_after"])} if "retry_after" in error.extra else {}
    )
    return JSONResponse(
        status_code=error.status,
        content={"detail": error.en, "code": error.code, "message_ar": error.ar, **error.extra},
        headers=headers,
    )


async def _act(request: Request, staff: Staff, key: str, **args):
    caller = actions.Caller(staff.user_id, staff.name, staff.role, "portal")
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        try:
            return await actions.run(conn, caller, key, **args)
        except actions.NotAllowed as error:
            raise DiscoveryError("forbidden", 403) from error
        except actions.NotSwitchedOn as error:
            raise DiscoveryError("module_off", 404) from error


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StatusIn(Strict):
    status: str = Field(max_length=20)


class LocationIn(Strict):
    id: UUID | None = None
    name: str = Field(default="", max_length=160)
    name_ar: str = Field(default="", max_length=160)
    area: str = Field(default="", max_length=120)
    place_ref: str | None = Field(default=None, max_length=200)
    website_url: str | None = Field(default=None, max_length=300)
    whatsapp_e164: str | None = Field(default=None, max_length=20)
    is_primary: bool = False
    # What the list answered; accepted back and ignored (the order of the list is the position).
    position: int | None = None


class LocationsIn(Strict):
    items: list[LocationIn]


class ConnectionIn(Strict):
    kind: str = Field(max_length=20)
    on: bool


@router.get("/overview")
async def overview(
    request: Request, lang: str | None = Lang, staff: Staff = Depends(current_staff)
):
    return await _act(request, staff, "discovery.overview", lang=lang)


@router.get("/findings")
async def findings(
    request: Request,
    status: str | None = Query(None, max_length=20),
    location_id: UUID | None = None,
    lang: str | None = Lang,
    staff: Staff = Depends(current_staff),
):
    return await _act(
        request, staff, "discovery.findings", status=status, location_id=location_id, lang=lang
    )


@router.get("/findings/{finding_id}")
async def finding(
    finding_id: UUID,
    request: Request,
    lang: str | None = Lang,
    staff: Staff = Depends(current_staff),
):
    return await _act(request, staff, "discovery.finding", id=finding_id, lang=lang)


@router.post("/findings/{finding_id}/status")
async def set_finding_status(
    finding_id: UUID,
    body: StatusIn,
    request: Request,
    lang: str | None = Lang,
    staff: Staff = Depends(current_staff),
):
    return await _act(
        request, staff, "discovery.set_finding_status", id=finding_id, status=body.status, lang=lang
    )


@router.get("/reviews")
async def reviews(
    request: Request,
    location_id: UUID | None = None,
    replied: bool | None = None,
    max_rating: int | None = Query(None, ge=1, le=5),
    lang: str | None = Lang,
    staff: Staff = Depends(current_staff),
):
    return await _act(
        request,
        staff,
        "discovery.reviews",
        location_id=location_id,
        replied=replied,
        max_rating=max_rating,
        lang=lang,
    )


@router.get("/reports/{month}")
async def report(
    month: str, request: Request, lang: str | None = Lang, staff: Staff = Depends(current_staff)
):
    return await _act(request, staff, "discovery.report", month=month, lang=lang)


@router.post("/runs", status_code=202)
async def start_run(
    request: Request, lang: str | None = Lang, staff: Staff = Depends(current_staff)
):
    return await _act(request, staff, "discovery.start_run", lang=lang)


# `latest` before `{run_id}`, or "latest" would be taken for an ID. With no run yet it answers
# `null`.
@router.get("/runs/latest")
async def latest_run(
    request: Request, lang: str | None = Lang, staff: Staff = Depends(current_staff)
):
    return await _act(request, staff, "discovery.latest_run", lang=lang)


@router.get("/runs/{run_id}")
async def run(
    run_id: UUID, request: Request, lang: str | None = Lang, staff: Staff = Depends(current_staff)
):
    return await _act(request, staff, "discovery.run", id=run_id, lang=lang)


@router.get("/locations")
async def locations(request: Request, staff: Staff = Depends(current_staff)):
    return await _act(request, staff, "discovery.locations")


@router.put("/locations")
async def edit_locations(
    body: LocationsIn, request: Request, staff: Staff = Depends(current_staff)
):
    return await _act(
        request, staff, "discovery.edit_locations", items=[item.model_dump() for item in body.items]
    )


@router.get("/connection")
async def connection(request: Request, staff: Staff = Depends(current_staff)):
    return await _act(request, staff, "discovery.connection")


@router.put("/connection")
async def set_connection(
    body: ConnectionIn, request: Request, staff: Staff = Depends(current_staff)
):
    return await _act(request, staff, "discovery.set_connection", kind=body.kind, on=body.on)
