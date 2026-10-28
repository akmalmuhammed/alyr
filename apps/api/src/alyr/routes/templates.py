"""An owner changes their shop's type (D-039 "As built (feature engine)", ALY-148,
`specs/012-feature-engine/spec.md`): see the template the shop uses, look at what another would
add, and add it. It is additive and it is previewed: nothing is switched off or removed, what the
owner set themselves stays as they set it, and nothing they made is changed
(`modules/items/template_change.py`). Owners and admins only; each change is on the activity
record.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.items import access, features, template_change
from alyr.modules.items.service import BilingualError
from alyr.routes.deps import current_staff, require_any_module

router = APIRouter(
    prefix="/api/templates", tags=["templates"],
    dependencies=[Depends(require_any_module("orders", "catalog"))],
)


def _row(t) -> dict:
    return {"key": t.key, "name": t.name.en, "name_ar": t.name.ar, "builtin": t.builtin,
            "note": t.note.en, "note_ar": t.note.ar}


def _fail(error: BilingualError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": error.code, "message": str(error), "message_ar": error.message_ar},
    )


async def _target(conn, key: str):
    """A template the owner may switch to: one of the offered choices."""
    for found in await template_change.choices(conn, everything=False):
        if found.key == key:
            return found
    raise HTTPException(status_code=404, detail="no such template")


@router.get("")
async def current(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The template this shop uses and the ones it may switch to."""
    access.require_manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        feats = await features.load(conn)
        return {
            "current": _row(feats.template),
            "choices": [_row(t) for t in await template_change.choices(conn, everything=False)],
        }


@router.get("/preview")
async def preview(
    request: Request, to: str = Query(max_length=40), staff: Staff = Depends(current_staff)
) -> dict:
    """What switching to `to` would add. Writes nothing."""
    access.require_manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await template_change.plan(conn, await _target(conn, to))


@router.post("/apply")
async def apply(
    request: Request, body: Annotated[dict[str, Any], Body()], staff: Staff = Depends(current_staff)
) -> dict:
    """Switch to the template, doing exactly what the preview said (`preview` is its hash)."""
    access.require_manager(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            target = await _target(conn, str(body.get("to", "")))
            return await template_change.apply(
                conn, team.actor_of(staff), target, str(body.get("preview", ""))
            )
    except BilingualError as error:
        raise _fail(error) from error
