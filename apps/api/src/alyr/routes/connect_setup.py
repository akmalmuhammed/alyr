"""Setting up connected mode from the workspace: API keys, who owns the numbers, webhook
addresses and the CSV import of sales (ALY-142, spec 015).

This is what a person does, signed in: only owners and admins (an agent never sees a key), only
for a shop with Documents on. The machine's side is `routes/connect.py`. Every change here is on
the activity record with who made it; a new key and a new webhook secret are shown once, in the
answer that makes them.

The import's file is the request body, like the Catalog's (`routes/items_import.py`), so a phone
shows real upload progress and no form-parsing library is needed.
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from alyr.config import get_settings
from alyr.core.auth import Staff
from alyr.core.team import actor_of
from alyr.modules.connect import keys, sale_import_plan, sale_imports, terms, webhooks
from alyr.modules.connect.words import ConnectError
from alyr.modules.documents import access, authority
from alyr.modules.documents import settings as doc_settings
from alyr.modules.items import sheets
from alyr.modules.items.xlsx import SheetError
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/connect-setup", tags=["connect-setup"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KeyIn(Strict):
    name: str = Field(min_length=1, max_length=60)
    scopes: list[Literal["sales:write", "documents:read", "webhooks"]] = Field(min_length=1)
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=1000)


class AuthorityIn(Strict):
    changes: dict[str, Literal["alyr", "external"]] = Field(min_length=1)


class WebhookIn(Strict):
    url: str = Field(max_length=500)
    events: list[str] = Field(min_length=1, max_length=5)
    name: str = Field(default="", max_length=60)


class WebhookPatch(Strict):
    url: str | None = Field(default=None, max_length=500)
    events: list[str] | None = Field(default=None, max_length=5)
    name: str | None = Field(default=None, max_length=60)
    enabled: bool | None = None


class ImportChange(Strict):
    mapping: dict[str, str] | None = None
    options: dict | None = None


class ImportApply(Strict):
    preview: str = Field(min_length=1, max_length=64, description="The preview's hash")


class TemplateIn(Strict):
    name: str = Field(min_length=1, max_length=60)
    mapping: dict[str, str]
    options: dict = Field(default_factory=dict)


def _db(request: Request):
    return request.app.state.db


def _manager(staff: Staff) -> None:
    access.require_manager(staff)


def _sheet_failure(error: SheetError) -> JSONResponse:
    return JSONResponse(status_code=error.status, content={
        "detail": error.en, "code": error.code, "message_ar": error.ar})


# ── the whole picture, for the screen ────────────────────────────────────────────────────


@router.get("/overview")
async def overview(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Everything the connection screen shows, in one call: the terms, the keys, who numbers
    each kind, the webhook addresses and the recent imports."""
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {
            "terms": await terms.status(conn),
            "keys": await keys.list_keys(conn),
            "scopes": list(keys.SCOPES), "default_rate_limit": keys.DEFAULT_RATE,
            "authority": await authority.get_all(conn),
            "webhooks": await webhooks.list_endpoints(conn),
            "events": list(webhooks.EVENTS),
            "imports": (await sale_imports.history(conn, 5))["imports"],
            "templates": await sale_imports.list_templates(conn),
            "send_mode": (await doc_settings.get(conn))["send_mode"],
            "base_url": get_settings().public_web_url,
            "docs": "docs/connect-api.md",
        }


# ── the terms ────────────────────────────────────────────────────────────────────────────


@router.post("/terms/accept")
async def accept_terms(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"terms": await terms.accept(conn, actor_of(staff))}


# ── keys ─────────────────────────────────────────────────────────────────────────────────


@router.post("/keys", status_code=201)
async def make_key(body: KeyIn, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Make a key. The key itself is in the answer once; ALYR keeps only its hash."""
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        row, secret = await keys.create(
            conn, actor_of(staff), name=body.name, scopes=list(body.scopes),
            rate_limit=body.rate_limit_per_minute)
    return {"key": row, "secret": secret}


@router.post("/keys/{key_id}/revoke")
async def revoke_key(key_id: UUID, request: Request,
                     staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"key": await keys.revoke(conn, actor_of(staff), key_id)}


# ── who owns the numbers ─────────────────────────────────────────────────────────────────


@router.put("/authority")
async def set_authority(body: AuthorityIn, request: Request,
                        staff: Staff = Depends(current_staff)) -> dict:
    """Say, for each kind of document, whether ALYR numbers it or the shop's other system does.
    With `external` ALYR never allocates a number for that kind."""
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"authority": await authority.change(conn, actor_of(staff), dict(body.changes))}


# ── webhooks ─────────────────────────────────────────────────────────────────────────────


@router.post("/webhooks", status_code=201)
async def add_webhook(body: WebhookIn, request: Request,
                      staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        row, secret = await webhooks.create(
            conn, actor_of(staff), url=body.url, events=body.events, name=body.name)
    return {"webhook": row, "secret": secret}


@router.put("/webhooks/{webhook_id}")
async def change_webhook(webhook_id: UUID, body: WebhookPatch, request: Request,
                         staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"webhook": await webhooks.update(
            conn, actor_of(staff), webhook_id, **body.model_dump(exclude_unset=True))}


@router.post("/webhooks/{webhook_id}/rotate-secret")
async def rotate_webhook_secret(webhook_id: UUID, request: Request,
                                staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        row, secret = await webhooks.rotate_secret(conn, actor_of(staff), webhook_id)
    return {"webhook": row, "secret": secret}


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(webhook_id: UUID, request: Request,
                       staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await webhooks.send_test(conn, actor_of(staff), webhook_id)


@router.get("/webhooks/{webhook_id}/deliveries")
async def webhook_deliveries(webhook_id: UUID, request: Request,
                             staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"deliveries": await webhooks.deliveries_of(conn, webhook_id)}


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: UUID, request: Request,
                         staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        await webhooks.remove(conn, actor_of(staff), webhook_id)
    return {"deleted": True}


# ── CSV import of sales ──────────────────────────────────────────────────────────────────


async def _file(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise ConnectError("import_too_big", 413)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise ConnectError("import_too_big", 413)
    return bytes(body)


@router.get("/imports/template")
async def import_template(
    staff: Staff = Depends(current_staff), lang: Literal["en", "ar"] = "en",
) -> Response:
    """A CSV with the columns the import reads and two made-up sales to show the shape."""
    _manager(staff)
    data = sheets.write_csv(sale_import_plan.template_rows(lang))
    name = "alyr-sales-import-template-ar.csv" if lang == "ar" else "alyr-sales-import-template.csv"
    return Response(data, media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@router.post("/imports", status_code=201)
async def upload_import(
    request: Request, filename: str = Query(default="sales.csv", max_length=200),
    staff: Staff = Depends(current_staff),
):
    """Send a file (the request body). Nothing is made yet: the answer is a preview of every
    sale in it and every problem, with row numbers."""
    _manager(staff)
    limit = get_settings().catalog_import_max_bytes
    data = await _file(request, limit)
    try:
        async with _db(request).tenant(staff.tenant_id) as conn:
            return await sale_imports.upload(conn, actor_of(staff), filename, data, limit)
    except SheetError as error:
        return _sheet_failure(error)


@router.get("/imports")
async def import_history(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await sale_imports.history(conn)


@router.post("/imports/undo")
async def undo_import(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Take back the newest import while nothing in it has been sent."""
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await sale_imports.undo(conn, actor_of(staff))


@router.get("/imports/{import_id}")
async def get_import(import_id: UUID, request: Request,
                     staff: Staff = Depends(current_staff)):
    _manager(staff)
    try:
        async with _db(request).tenant(staff.tenant_id) as conn:
            return await sale_imports.show(conn, import_id)
    except SheetError as error:
        return _sheet_failure(error)


@router.put("/imports/{import_id}")
async def change_import(import_id: UUID, body: ImportChange, request: Request,
                        staff: Staff = Depends(current_staff)):
    """Say which column is which, or change the options, and get the preview again."""
    _manager(staff)
    try:
        async with _db(request).tenant(staff.tenant_id) as conn:
            return await sale_imports.change(
                conn, import_id, **body.model_dump(exclude_unset=True))
    except SheetError as error:
        return _sheet_failure(error)


@router.post("/imports/{import_id}/apply")
async def apply_import(import_id: UUID, body: ImportApply, request: Request,
                       staff: Staff = Depends(current_staff)):
    """Make every sale in the file, in one transaction, exactly as previewed."""
    _manager(staff)
    try:
        async with _db(request).tenant(staff.tenant_id) as conn:
            return await sale_imports.apply(conn, actor_of(staff), import_id, body.preview)
    except SheetError as error:
        return _sheet_failure(error)


@router.delete("/imports/{import_id}")
async def discard_import(import_id: UUID, request: Request,
                         staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        await sale_imports.discard(conn, import_id)
    return {"deleted": True}


@router.get("/import-templates")
async def get_import_templates(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"templates": await sale_imports.list_templates(conn)}


@router.put("/import-templates")
async def save_import_template(body: TemplateIn, request: Request,
                               staff: Staff = Depends(current_staff)) -> dict:
    """Remember a mapping under a name. A later file whose headers fit it is read with it."""
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"template": await sale_imports.save_template(
            conn, actor_of(staff), body.name, body.mapping, body.options)}


@router.delete("/import-templates/{name}")
async def delete_import_template(name: str, request: Request,
                                 staff: Staff = Depends(current_staff)) -> dict:
    _manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        await sale_imports.delete_template(conn, name)
    return {"deleted": True}
