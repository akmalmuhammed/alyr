"""The owner's Features screen: what the Catalog does for this shop, and the switches for it
(D-039 "As built (feature engine)", ALY-148; `specs/011-feature-engine/spec.md`).

Everyone on the team may read the features (the screens need them to draw the item form and the
list). Owners and admins switch them: a feature decides what customers see and what staff can
set up, so it is the owner's call, like a price. Every change is on the shop's activity record
with who made it.

The registry's extension points (features not built yet) are in no answer here.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, features
from alyr.routes.deps import current_staff, require_any_module

router = APIRouter(
    prefix="/api/features", tags=["features"],
    dependencies=[Depends(require_any_module("orders", "catalog"))],
)


class FeatureChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool | None = Field(default=None, description="Switch the feature on or off")
    config: dict[str, Any] | None = Field(
        default=None, description="A value beside the switch, such as {\"mode\": \"hide\"}"
    )


def _fail(error: features.FeatureError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": error.code, "message": str(error), "message_ar": error.message_ar},
    )


@router.get("")
async def get_features(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Every feature in groups, with where it acts, what turning it on does, how many items
    use it and who last set it; and the features every shop has."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {**await features.view(conn), "can_manage": access.is_manager(staff)}


@router.put("/{key}")
async def put_feature(
    key: str, body: FeatureChange, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Switch a feature on or off, or change its value. Switching one on switches on what it
    needs; switching one off switches off what needs it. `changed` lists all of it."""
    access.require_manager(staff)
    if body.enabled is None and body.config is None:
        raise HTTPException(status_code=422, detail="say what to change")
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            changed = await features.set_feature(
                conn, team.actor_of(staff), key, enabled=body.enabled, config=body.config
            )
            return {
                "changed": changed, **await features.view(conn),
                "can_manage": access.is_manager(staff),
            }
    except features.FeatureError as error:
        raise _fail(error) from error
