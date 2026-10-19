"""Templates in the back office (D-039 "As built (feature engine)", ALY-148,
`specs/012-feature-engine/spec.md`): how ALYR serves a new kind of client without a release.

Quick start for the founder: **start from the closest template, switch features, save.**
`GET /api/admin/templates` lists ALYR's own templates (the types it ships; read only, duplicate
one to change it) and the ones made here, with the registry of features the editor needs.
`POST` makes a template, `PUT` changes it, `archive` and `restore` stop and start offering it.
A template is then picked for a business when it is created (`POST /api/admin/businesses` with
`template`) or later (`POST /api/admin/businesses/{id}/template`, with a preview that says
exactly what it will add; it never removes anything). Every change is on the audit record that
nobody can edit.
"""

from typing import Annotated, Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request

from alyr import capabilities, presets, shop_templates
from alyr.core import backoffice, team
from alyr.core.auth import Staff
from alyr.modules.items import features, fields, template, template_change, templates
from alyr.modules.items.service import UNITS, BilingualError
from alyr.presets_catalog import RULES, STYLES
from alyr.routes.admin import _back_office, _by, platform_admin

router = APIRouter(prefix="/api/admin", tags=["back office"])


def _fail(error: BilingualError) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": error.code, "message": str(error), "message_ar": error.message_ar},
    )


def registry() -> dict:
    """What the template editor needs to draw its switches: every feature a template can hold,
    in groups, with its default, what it needs, and the choices it has."""
    groups = []
    for group in capabilities.GROUPS:
        rows = [
            {"key": c.key, "name": c.name.en, "name_ar": c.name.ar, "hint": c.hint.en,
             "hint_ar": c.hint.ar, "default": True if c.always_on else c.default,
             "depends_on": list(c.depends_on), "kind": "choice" if c.always_on else "switch",
             "config": dict(c.config), "choices": {k: list(v) for k, v in c.choices.items()}}
            for c in capabilities.SHOWN if c.group == group.key
        ]
        if rows:
            groups.append({"key": group.key, "name": group.name.en, "name_ar": group.name.ar,
                           "features": rows})
    return {
        "groups": groups,
        "rules": [{"key": r, "feature": capabilities.RULE_FEATURE.get(r, "")} for r in RULES],
        "styles": list(STYLES), "units": list(UNITS), "focus": list(templates.FOCUS_PARTS),
        "field_kinds": list(fields.KINDS), "field_places": list(fields.APPLIES),
        "limits": {"categories": templates.MAX_CATEGORIES, "fields": fields.MAX_FIELDS},
    }


def types() -> list[dict]:
    return [{"key": p.key, "name": p.name.en, "name_ar": p.name.ar} for p in presets.PRESETS]


@router.get("/templates")
async def list_templates(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    async with _back_office(request) as conn:
        made = await templates.listing(conn)
    return {
        "builtin": templates.builtin_views(), "made": made, "registry": registry(),
        "types": types(),
        "quick_start": {
            "en": "New kind of client? Start from the closest template, switch features, save.",
            "ar": "نوع جديد من العملاء؟ ابدأ من أقرب نموذج، شغّل الميزات وأوقفها، ثم احفظ.",
        },
    }


@router.post("/templates")
async def make_template(
    request: Request, body: Annotated[dict[str, Any], Body()], staff: Staff = Depends(platform_admin)
) -> dict:
    """Make a template. Send the whole of it; `from_key` fills in what is not sent from an
    existing template (a built-in or one made here), which is how a copy is made."""
    try:
        async with _back_office(request) as conn:
            data = dict(body)
            source = data.pop("from_key", None)
            if source:
                base = shop_templates.BUILTIN.get(source) or await templates.get(conn, source)
                if base is None:
                    raise HTTPException(status_code=404, detail="no such template to copy")
                data = {**templates.view(base), "key": "", "offered": False, **data}
            made = await templates.create(conn, _by(staff), data)
            await backoffice.audit(
                conn, staff, "template.created", "template", made["key"],
                detail={"name": made["name"], "copied_from": source or None,
                        "features_on": sorted(k for k, v in made["features"].items()
                                              if v["enabled"])},
            )
    except BilingualError as error:
        raise _fail(error) from error
    return {"template": made}


@router.get("/templates/{key}")
async def one_template(key: str, request: Request, _: Staff = Depends(platform_admin)) -> dict:
    async with _back_office(request) as conn:
        found = shop_templates.BUILTIN.get(key) or await templates.get(conn, key)
    if found is None:
        raise HTTPException(status_code=404, detail="no such template")
    return {"template": templates.view(found)}


@router.put("/templates/{key}")
async def change_template(
    key: str, request: Request, body: Annotated[dict[str, Any], Body()],
    staff: Staff = Depends(platform_admin),
) -> dict:
    try:
        async with _back_office(request) as conn:
            before = await templates.get(conn, key)
            made = await templates.update(conn, _by(staff), key, dict(body))
            if made is None:
                raise HTTPException(status_code=404, detail="no such template")
            was = templates.view(before) if before else {}
            await backoffice.audit(
                conn, staff, "template.saved", "template", key,
                detail={"name": made["name"], "changed": sorted(
                    k for k in made if made[k] != was.get(k) and k not in ("shops",))},
            )
    except BilingualError as error:
        raise _fail(error) from error
    return {"template": made}


@router.post("/templates/{key}/archive")
async def archive_template(
    key: str, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    return await _archive(key, request, staff, restore=False)


@router.post("/templates/{key}/restore")
async def restore_template(
    key: str, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    return await _archive(key, request, staff, restore=True)


async def _archive(key: str, request: Request, staff: Staff, restore: bool) -> dict:
    try:
        async with _back_office(request) as conn:
            if key in shop_templates.BUILTIN:
                raise HTTPException(status_code=422, detail={
                    "code": "builtin", "message": "ALYR's own templates cannot be archived.",
                    "message_ar": "نماذج ALYR نفسها لا تُؤرشف."})
            made = await templates.archive(conn, _by(staff), key, restore)
            if made is None:
                raise HTTPException(status_code=404, detail="no such template")
            await backoffice.audit(
                conn, staff, "template.restored" if restore else "template.archived",
                "template", key, detail={"name": made["name"]},
            )
    except BilingualError as error:
        raise _fail(error) from error
    return {"template": made}


# ── a business and its template ───────────────────────────────────────────────────────


async def _target(conn: asyncpg.Connection, key: str):
    found = await template_change.find(conn, key, usable=True)
    if found is None:
        raise HTTPException(status_code=404, detail="no such template")
    return found


business_type_of = template_change.business_type_of


@router.get("/businesses/{business_id}/template")
async def business_template(
    business_id: UUID, request: Request, _: Staff = Depends(platform_admin)
) -> dict:
    """The template a business uses, and every template it may be moved to."""
    async with _back_office(request) as conn:
        everything = await template_change.choices(conn, everything=True)
        made = {t.key for t in await templates.every(conn)}
    async with request.app.state.db.tenant(business_id) as conn:
        feats = await features.load(conn)
        kind = await template.business_type(conn)
    return {
        "current": {"key": feats.template.key, "name": feats.template.name.en,
                    "name_ar": feats.template.name.ar, "builtin": feats.template.builtin},
        "business_type": kind,
        "choices": [
            {"key": t.key, "name": t.name.en, "name_ar": t.name.ar, "builtin": t.key not in made,
             "note": t.note.en, "note_ar": t.note.ar, "type": business_type_of(t)}
            for t in everything
        ],
    }


@router.get("/businesses/{business_id}/template/preview")
async def business_template_preview(
    business_id: UUID, request: Request, to: str = Query(max_length=40),
    _: Staff = Depends(platform_admin),
) -> dict:
    async with _back_office(request) as conn:
        target = await _target(conn, to)
    async with request.app.state.db.tenant(business_id) as conn:
        return await template_change.plan(conn, target)


@router.post("/businesses/{business_id}/template")
async def change_business_template(
    business_id: UUID, request: Request, body: Annotated[dict[str, Any], Body()],
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Apply a template to a business, doing exactly what the preview said (`preview` is its
    hash). With `set_business_type` the business's type, which decides its onboarding and
    its price list, follows the template too."""
    to, seen = str(body.get("to", "")), str(body.get("preview", ""))
    try:
        async with _back_office(request) as conn:
            target = await _target(conn, to)
        async with request.app.state.db.tenant(business_id) as conn:
            done = await template_change.apply(
                conn, team.actor_of(staff), target, seen, by="ALYR back office")
        async with _back_office(request) as conn:
            if body.get("set_business_type"):
                await conn.fetchval(
                    "select admin_set_business_type($1, $2)", business_id, business_type_of(target))
            await backoffice.audit(
                conn, staff, "business.template", "business", business_id,
                business_id=business_id,
                detail={"to": to, "turned_on": [i["key"] for i in done["turn_on"]],
                        "set_business_type": bool(body.get("set_business_type"))},
            )
    except BilingualError as error:
        raise _fail(error) from error
    return done
