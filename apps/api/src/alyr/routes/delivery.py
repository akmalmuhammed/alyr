"""The workspace's Delivery and pickup settings (ALY-150 part 2, `specs/014-pricing-pack/spec.md`).

Everyone on the team may read them (staff see where the shop delivers and for how much);
owners and admins change them. Every route answers `422 feature_off` while "Delivery and
pickup" is switched off for the shop. The zones already made are kept and do nothing then.
"""

from datetime import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, delivery, features
from alyr.routes.deps import current_staff, require_any_module

router = APIRouter(
    prefix="/api/delivery", tags=["delivery"],
    dependencies=[Depends(require_any_module("orders", "catalog"))],
)
FEATURE = "delivery_fees"


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pickup: bool | None = None
    delivery: bool | None = None
    flat_fee: int | None = Field(default=None, ge=0, description="Dirhams; null for none")
    flat_free_over: int | None = Field(default=None, ge=1)
    flat_min_order: int | None = Field(default=None, ge=0)

    def data(self) -> dict:
        return self.model_dump(exclude_unset=True)


class ZoneIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="", max_length=60)
    name_ar: str = Field(default="", max_length=60)
    fee: int = Field(ge=0, description="Dirhams: 100 is QAR 1")
    free_over: int | None = Field(default=None, ge=1)
    min_order: int = Field(default=0, ge=0)
    cutoff: time | None = Field(default=None, description="HH:MM on the shop's clock")
    days: list[int] = Field(default_factory=list, max_length=7)


def _fail(error: delivery.DeliveryError | features.FeatureError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": error.code, "message": str(error), "message_ar": error.message_ar},
    )


@router.get("")
async def get_settings(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await features.require(conn, FEATURE)
            return {**await delivery.view(conn), "can_manage": access.is_manager(staff)}
    except features.FeatureError as error:
        raise _fail(error) from error


@router.put("")
async def put_settings(
    body: SettingsIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await features.require(conn, FEATURE)
            return {**await delivery.save_settings(conn, team.actor_of(staff), body.data()),
                    "can_manage": True}
    except (delivery.DeliveryError, features.FeatureError) as error:
        raise _fail(error) from error


@router.post("/zones")
async def add_zone(body: ZoneIn, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await features.require(conn, FEATURE)
            return {"zone": await delivery.save_zone(conn, team.actor_of(staff), body.model_dump())}
    except (delivery.DeliveryError, features.FeatureError) as error:
        raise _fail(error) from error


@router.put("/zones/{zone_id}")
async def change_zone(
    zone_id: UUID, body: ZoneIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await features.require(conn, FEATURE)
            return {"zone": await delivery.save_zone(
                conn, team.actor_of(staff), body.model_dump(), zone_id
            )}
    except (delivery.DeliveryError, features.FeatureError) as error:
        raise _fail(error) from error


@router.post("/zones/{zone_id}/{action}")
async def archive_zone(
    zone_id: UUID, action: str, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """`archive` takes a zone away (its orders keep its name); `restore` brings it back."""
    access.require_manager(staff)
    if action not in ("archive", "restore"):
        raise HTTPException(status_code=422, detail="choose archive or restore")
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await features.require(conn, FEATURE)
            zone = await delivery.archive_zone(
                conn, team.actor_of(staff), zone_id, restore=action == "restore"
            )
    except (delivery.DeliveryError, features.FeatureError) as error:
        raise _fail(error) from error
    if zone is None:
        raise HTTPException(status_code=404, detail="zone not found")
    return {"zone": zone}
