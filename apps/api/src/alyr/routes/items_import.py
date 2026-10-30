"""Importing and exporting the Catalog as Excel or CSV (D-039, ALY-108).

Downloads: a template per type of business (`/import/template`) and every item of the shop
(`/export`), in English or Arabic, as .xlsx or CSV.

Uploading is in steps so nothing is saved before the owner has seen it: send the sheet
(`POST /import`), which answers with a preview of every row; optionally add a zip of photos
(`PUT /import/{id}/photos`); then apply it (`POST /import/{id}/apply`) carrying the preview's
`hash`. The newest import can be undone once (`POST /import/undo`).

The file is sent as the request body, like a photo (`routes/media.py`), so a phone shows real
upload progress and no form-parsing library is needed. Owners and admins import; so do agents
when the owner has allowed them to edit items. Anyone signed in can download.

These routes are included before `routes/items.py`, whose `/{item_id}` would otherwise
take `/export` for an item.
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.core.media import MediaService
from alyr.modules.items import (
    access,
    clock,
    columns,
    costs,
    exports,
    features,
    import_photos,
    imports,
    photos,
    service,
    sheets,
)
from alyr.modules.items.import_plan import COSTS
from alyr.modules.items.xlsx import SheetError
from alyr.routes.deps import current_staff


async def _may_see_costs(request: Request, staff: Staff = Depends(current_staff)) -> None:
    """Costs are the owner's and the admins' alone (ALY-150). Whether this person may see them in
    a file is decided here, once for the request: the export, the template and the import's plan
    all read it, so a cost reaches nobody else. (An async dependency, so what it sets is seen by
    the route.)"""
    allowed = False
    if access.is_manager(staff):
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            allowed = (await features.load(conn)).on("cost_margin")
    COSTS.set(allowed)


router = APIRouter(
    prefix="/api/items", tags=["items"], dependencies=[Depends(_may_see_costs)]
)

Lang = Literal["en", "ar"]
Format = Literal["xlsx", "csv"]
Duplicates = Literal["create", "update", "skip"]


class Options(BaseModel):
    on_duplicate: Duplicates


class Apply(BaseModel):
    preview: str = Field(min_length=1, max_length=64, description="The preview's hash")


def _fail(error: SheetError) -> HTTPException:
    return HTTPException(
        status_code=error.status,
        detail={"code": error.code, "message": error.en, "message_ar": error.ar},
    )


def _media(request: Request) -> MediaService:
    return request.app.state.media


async def _body(request: Request, limit: int) -> bytes:
    """The request body, never more than `limit` bytes."""
    too_big = SheetError(
        "file_too_large",
        f"This file is larger than {limit // (1024 * 1024)} MB. Split it into smaller files.",
        f"حجم هذا الملف أكبر من {limit // (1024 * 1024)} ميغابايت. قسّمه إلى ملفات أصغر.", 413,
    )
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise _fail(too_big)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise _fail(too_big)
    return bytes(body)


def _download(data: bytes, name: str, content_type: str) -> Response:
    return Response(
        content=data, media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )


# ── downloads ──


@router.get("/export")
async def export_items(
    request: Request, lang: Lang = "en", format: Format = "xlsx",
    staff: Staff = Depends(current_staff),
) -> Response:
    """Every item of the shop, one row for each size or colour, with its ID, prices, stock,
    category, tags, status and photo links. Edit it in Excel and upload it to update."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        shop_clock = await clock.load(conn)
        entries = await service.load(conn, shop_clock)
        by_item = await _media(request).photos_for(
            conn, photos.ITEM, [e.item["id"] for e in entries]
        )
        covers = {
            str(item_id): [p["urls"]["large"] for p in found if p.get("urls")]
            for item_id, found in by_item.items()
        }
        keys = await features.file_columns(conn, costs=COSTS.get())
        own = await features.own_fields(conn)
        kept = await costs.kept(conn) if "cost" in keys else None
        data, name, content_type = exports.export_file(
            entries, shop_clock, covers, lang, format, keys, own, kept
        )
    return _download(data, name, content_type)


@router.get("/import/kinds")
async def import_kinds(
    request: Request, lang: Lang = "en", staff: Staff = Depends(current_staff)
) -> dict:
    """The templates on offer, and the one that suits this shop's type of business."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        business = await conn.fetchval(
            "select business_type from tenants "
            "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
    return {"kinds": exports.kinds(lang), "suggested": columns.kind_for(business).key}


@router.get("/import/template")
async def import_template(
    request: Request, kind: str = "generic", lang: Lang = "en", format: Format = "xlsx",
    staff: Staff = Depends(current_staff),
) -> Response:
    """An empty file for one type of business, with its columns in the chosen language and
    three made-up example rows."""
    if kind not in columns.KIND_BY_KEY:
        raise HTTPException(status_code=404, detail="no such template")
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        allowed = await features.file_columns(conn, costs=COSTS.get())
        own = await features.own_fields(conn)
    data, name, content_type = exports.template_file(kind, lang, format, allowed, own)
    return _download(data, name, content_type)


# ── what was done ──


@router.get("/import/last")
async def import_last(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The newest import, if it can still be undone."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"last": await imports.last(conn)}


@router.get("/import/recent")
async def import_recent(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"imports": await imports.recent(conn)}


@router.post("/import/undo")
async def import_undo(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Put the newest import back, once. Items edited since are left as they are."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            return await imports.undo(
                conn, _media(request), await clock.load(conn), team.actor_of(staff)
            )
    except SheetError as error:
        raise _fail(error) from error


# ── uploading, previewing, applying ──


@router.post("/import")
async def import_upload(
    request: Request, filename: str = Query(default="items", max_length=200),
    on_duplicate: Duplicates = "create", staff: Staff = Depends(current_staff),
) -> dict:
    """Send a sheet (.xlsx or CSV) as the request body. Nothing is added to the catalog:
    the answer is a preview of every row, and the `id` to apply it with."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await access.require_edit(conn, staff)
    data = await _body(request, request.app.state.media.settings.catalog_import_max_bytes)
    try:
        # Read once, here: off the event loop and before a transaction is open (ALY-278).
        kind, sheet = await sheets.off_loop(sheets.read_table, data, filename)
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await imports.start(
                conn, _media(request), await clock.load(conn), staff.tenant_id,
                team.actor_of(staff), data, filename, kind, sheet, on_duplicate,
            )
    except SheetError as error:
        raise _fail(error) from error


@router.get("/import/{import_id}")
async def import_get(
    import_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The preview as it is now, or what an applied import did (and how its photos are
    coming along)."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await imports.get(
                conn, _media(request), await clock.load(conn), staff.tenant_id, import_id
            )
    except SheetError as error:
        raise _fail(error) from error


@router.post("/import/{import_id}/options")
async def import_options(
    import_id: UUID, body: Options, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Change what happens to a name that already exists; the preview is worked out again."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            return await imports.set_options(
                conn, _media(request), await clock.load(conn), staff.tenant_id, import_id,
                body.on_duplicate,
            )
    except SheetError as error:
        raise _fail(error) from error


@router.put("/import/{import_id}/photos")
async def import_zip(
    import_id: UUID, request: Request, filename: str = Query(default="photos.zip", max_length=200),
    staff: Staff = Depends(current_staff),
) -> dict:
    """Send a zip of photos as the request body. Rows are matched to its files by name."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await access.require_edit(conn, staff)
    data = await _body(request, request.app.state.media.settings.catalog_import_max_zip_bytes)
    try:
        # Listed once, here, like the sheet (ALY-278); a zip that cannot be used stops here.
        zip_view = await sheets.off_loop(
            import_photos.index, data, _media(request).settings.media_max_upload_bytes
        ) if data else None
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await imports.set_zip(
                conn, _media(request), await clock.load(conn), staff.tenant_id, import_id,
                data, filename, zip_view,
            )
    except SheetError as error:
        raise _fail(error) from error


@router.delete("/import/{import_id}/photos")
async def import_zip_remove(
    import_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            return await imports.set_zip(
                conn, _media(request), await clock.load(conn), staff.tenant_id, import_id,
                None, "", None,
            )
    except SheetError as error:
        raise _fail(error) from error


@router.post("/import/{import_id}/apply")
async def import_apply(
    import_id: UUID, body: Apply, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Do what the preview showed, in one go: if anything fails, nothing is changed."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            return await imports.apply(
                conn, _media(request), await clock.load(conn), staff.tenant_id,
                team.actor_of(staff), import_id, body.preview,
            )
    except SheetError as error:
        raise _fail(error) from error


@router.delete("/import/{import_id}")
async def import_discard(
    import_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Throw away a preview that was not applied."""
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await access.require_edit(conn, staff)
            await imports.discard(conn, import_id)
    except SheetError as error:
        raise _fail(error) from error
    return {"discarded": True}
