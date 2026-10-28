"""The owner's own fields (D-039 "As built (feature engine)", ALY-148,
`specs/012-feature-engine/spec.md`): define a field on items or on their sizes, change it,
archive it. Everyone on the team may read the definitions (the item form needs them); owners and
admins write them, since a field decides what customers see. Every change is on the activity
record. A new field needs the "Your own fields" feature; one that exists can always be changed
or archived.
"""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, features, fields
from alyr.modules.items.service import BilingualError
from alyr.routes.deps import current_staff, require_any_module

router = APIRouter(
    prefix="/api/custom-fields", tags=["custom fields"],
    dependencies=[Depends(require_any_module("orders", "catalog"))],
)

Kind = Literal["text", "number", "choice", "yes_no", "date"]
Applies = Literal["item", "variant"]


class ChoiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str | None = Field(default=None, max_length=30)
    label: str = Field(default="", max_length=fields.MAX_LABEL)
    label_ar: str = Field(default="", max_length=fields.MAX_LABEL)
    active: bool = True


class NewField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(default="", max_length=fields.MAX_LABEL)
    label_ar: str = Field(default="", max_length=fields.MAX_LABEL)
    kind: Kind = "text"
    applies_to: Applies = "item"
    choices: list[ChoiceIn] = Field(default_factory=list, max_length=fields.MAX_CHOICES)
    unit: str = Field(default="", max_length=12)
    shown_to_customers: bool = False
    searchable: bool = False
    required: bool = False


class FieldChanges(BaseModel):
    """Only what is sent changes. The key, the kind and where it applies never do."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, max_length=fields.MAX_LABEL)
    label_ar: str | None = Field(default=None, max_length=fields.MAX_LABEL)
    choices: list[ChoiceIn] | None = Field(default=None, max_length=fields.MAX_CHOICES)
    unit: str | None = Field(default=None, max_length=12)
    shown_to_customers: bool | None = None
    searchable: bool | None = None
    required: bool | None = None
    sort: int | None = Field(default=None, ge=0, le=1000)


def _fail(error: BilingualError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": error.code, "message": str(error), "message_ar": error.message_ar},
    )


async def _view(conn) -> dict[str, Any]:
    listed = await fields.rows(conn)
    used = await fields.usage(conn)
    return {
        "fields": [{**f, "used_by": used.get(f["key"], 0)} for f in listed],
        "active": sum(1 for f in listed if not f["archived"]),
        "limits": {"fields": fields.MAX_FIELDS, "choices": fields.MAX_CHOICES},
    }


@router.get("")
async def list_fields(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {**await _view(conn), "can_manage": access.is_manager(staff)}


@router.post("")
async def add_field(
    body: NewField, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await features.require(conn, "custom_fields")
            made = await fields.create(
                conn, team.actor_of(staff),
                {**body.model_dump(), "choices": [c.model_dump() for c in body.choices]},
            )
            return {"field": made, **await _view(conn)}
    except BilingualError as error:
        raise _fail(error) from error


@router.put("/{field_id}")
async def change_field(
    field_id: UUID, body: FieldChanges, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    sent = body.model_dump(exclude_unset=True)
    if "choices" in sent and body.choices is not None:
        sent["choices"] = [c.model_dump() for c in body.choices]
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            changed = await fields.update(conn, team.actor_of(staff), field_id, sent)
            if changed is None:
                raise HTTPException(status_code=404, detail="field not found")
            return {"field": changed, **await _view(conn)}
    except BilingualError as error:
        raise _fail(error) from error


@router.post("/{field_id}/archive")
async def archive_field(
    field_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Archive a field. Its values stay on the items; the screens stop showing it."""
    access.require_manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        changed = await fields.archive(conn, team.actor_of(staff), field_id)
        if changed is None:
            raise HTTPException(status_code=404, detail="field not found")
        return {"field": changed, **await _view(conn)}


@router.post("/{field_id}/restore")
async def restore_field(
    field_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await features.require(conn, "custom_fields")
            changed = await fields.archive(conn, team.actor_of(staff), field_id, restore=True)
            if changed is None:
                raise HTTPException(status_code=404, detail="field not found")
            return {"field": changed, **await _view(conn)}
    except BilingualError as error:
        raise _fail(error) from error
