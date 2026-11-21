"""The back office's door to one business's visits import (D-197, D-198, spec 070,
docs/runbooks/visits-import.md).

ALYR staff run an import for a business without any screen: they send the file, read the dry run,
and apply it with its hash. The same pattern as the rest of the back office (`routes/admin.py`):
only ALYR's own staff, signed in within the last 12 hours and past the second factor, and every
step written to the audit log (`platform_audit`) with counts and the file's hash, never its
contents.

The import itself runs as the business, in a transaction of its own that carries that business's
row-level security (`db.tenant(business_id)`): it can touch no other business. Only the audit
entry and the switching on of Bookings need the back office's own connection.
"""

import hashlib
from contextlib import asynccontextmanager
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from alyr.config import get_settings
from alyr.core import backoffice
from alyr.core.auth import Staff
from alyr.core.team import Actor
from alyr.modules.history import imports, plan
from alyr.modules.history.words import HistoryError
from alyr.modules.items import sheets
from alyr.modules.items.xlsx import SheetError
from alyr.routes.admin import _back_office, platform_admin

router = APIRouter(prefix="/api/admin/businesses/{business_id}/visits-imports",
                   tags=["back office"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ImportChange(Strict):
    mapping: dict[str, str] | None = None
    options: dict | None = None


class ImportApply(Strict):
    preview: str = Field(min_length=1, max_length=100)
    # Switch Bookings on for this business as part of the import, when it is off. Said aloud, so
    # nobody switches a product on by accident.
    switch_on_bookings: bool = False


def _actor(staff: Staff) -> Actor:
    return Actor(None, staff.name or staff.email or "ALYR", via="back office")


@asynccontextmanager
async def _business(request: Request, business_id: UUID):
    """A connection scoped to this business, or 404 when there is no such business."""
    async with request.app.state.db.tenant(business_id) as conn:
        if await imports.tenant_of(conn) is None:
            raise HTTPException(status_code=404, detail="no such business")
        yield conn


async def _audit(request: Request, staff: Staff, business_id: UUID, action: str,
                 detail: dict) -> None:
    async with _back_office(request) as conn:
        client_id = await conn.fetchval("select client_id from tenants where id = $1", business_id)
        await backoffice.audit(conn, staff, action, "business", business_id,
                               client_id=client_id, business_id=business_id, detail=detail)


async def _file(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise HistoryError("import_too_big", 413)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise HistoryError("import_too_big", 413)
    return bytes(body)


def _sheet_failure(error: SheetError) -> JSONResponse:
    return JSONResponse(status_code=error.status, content={
        "detail": error.en, "code": error.code, "message_ar": error.ar})


@router.get("/template")
async def template(business_id: UUID, lang: Literal["en", "ar"] = "en",
                   _: Staff = Depends(platform_admin)) -> Response:
    """A CSV with the columns the import reads and three made-up visits, to send to whoever holds
    the business's other system, so they know what to export."""
    data = sheets.write_csv(plan.template_rows(lang))
    name = "alyr-visits-template-ar.csv" if lang == "ar" else "alyr-visits-template.csv"
    return Response(data, media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@router.post("", status_code=201)
async def upload(business_id: UUID, request: Request,
                 filename: str = Query(default="visits.csv", max_length=200),
                 staff: Staff = Depends(platform_admin)):
    """Send a file (the request body): the dry run. Nothing is made; the answer is a preview of
    every row with its problems, in English and Arabic."""
    limit = get_settings().catalog_import_max_bytes
    data = await _file(request, limit)
    try:
        # Read once, here: off the event loop and before a transaction is open.
        _kind, sheet = await sheets.off_loop(sheets.read_table, data, filename)
        async with _business(request, business_id) as conn:
            shown = await imports.upload(conn, _actor(staff), filename, data, limit, sheet)
    except SheetError as error:
        return _sheet_failure(error)
    await _audit(request, staff, business_id, "history.previewed", {
        "import": shown["id"], "filename": filename[:80],
        "sha256": hashlib.sha256(data).hexdigest(), "rows": shown["counts"]["rows"],
        "problems": shown["problems_total"]})
    return shown


@router.get("")
async def history(business_id: UUID, request: Request, _: Staff = Depends(platform_admin)):
    async with _business(request, business_id) as conn:
        return {**await imports.history(conn), "data_from": await imports.data_from(conn)}


@router.post("/undo")
async def undo_newest(business_id: UUID, request: Request,
                      staff: Staff = Depends(platform_admin)):
    """Take back the newest applied import, whole."""
    async with _business(request, business_id) as conn:
        done = await imports.undo(conn, _actor(staff))
    await _audit(request, staff, business_id, "history.undone", {
        "import": done["id"], "visits": done["visits_removed"], "removed": done["removed"],
        "kept": done["kept"]})
    return done


@router.get("/{import_id}")
async def get_import(business_id: UUID, import_id: UUID, request: Request,
                     _: Staff = Depends(platform_admin)):
    async with _business(request, business_id) as conn:
        return await imports.show(conn, import_id)


@router.get("/{import_id}/rows")
async def get_rows(business_id: UUID, import_id: UUID, request: Request,
                   state: Literal["ready", "existing", "duplicate", "problem", "skipped"]
                   | None = None,
                   offset: int = Query(default=0, ge=0), limit: int = Query(default=200, ge=1),
                   _: Staff = Depends(platform_admin)):
    """Every row of a preview and what it would make, a page at a time."""
    async with _business(request, business_id) as conn:
        return await imports.rows(conn, import_id, state=state, offset=offset, limit=limit)


@router.put("/{import_id}")
async def change_import(business_id: UUID, import_id: UUID, body: ImportChange, request: Request,
                        _: Staff = Depends(platform_admin)):
    """Say which column is which, or change the options, and get the preview again."""
    async with _business(request, business_id) as conn:
        return await imports.change(conn, import_id, **body.model_dump(exclude_unset=True))


@router.post("/{import_id}/apply")
async def apply_import(business_id: UUID, import_id: UUID, body: ImportApply, request: Request,
                       staff: Staff = Depends(platform_admin)):
    """Make every visit in the file, in one transaction, exactly as previewed."""
    async with _business(request, business_id) as conn:
        # Everything that can refuse is checked before anything is switched on.
        await imports.check_apply(conn, import_id, body.preview,
                                  bookings_switched=body.switch_on_bookings)
        switching = body.switch_on_bookings and not await imports.bookings_on(conn)
    if switching:
        async with _back_office(request) as conn:
            await conn.execute("select admin_set_module($1, 'bookings', true)", business_id)
        await _audit(request, staff, business_id, "module.on", {
            "module": "bookings", "for": "visits import", "import": str(import_id)})
    async with _business(request, business_id) as conn:
        done = await imports.apply(conn, _actor(staff), import_id, body.preview,
                                   bookings_switched=body.switch_on_bookings)
    await _audit(request, staff, business_id, "history.applied", {
        "import": done["id"], "counts": done["counts"], "exported_on": done["exported_on"],
        "first_visit_on": done["first_visit_on"], "last_visit_on": done["last_visit_on"],
        "hash": body.preview, "bookings_switched_on": switching})
    return done


@router.post("/{import_id}/undo")
async def undo_import(business_id: UUID, import_id: UUID, request: Request,
                      staff: Staff = Depends(platform_admin)):
    """Take back this import, which must be the newest applied one."""
    async with _business(request, business_id) as conn:
        done = await imports.undo(conn, _actor(staff), import_id)
    await _audit(request, staff, business_id, "history.undone", {
        "import": done["id"], "visits": done["visits_removed"], "removed": done["removed"],
        "kept": done["kept"]})
    return done


@router.delete("/{import_id}")
async def discard_import(business_id: UUID, import_id: UUID, request: Request,
                         staff: Staff = Depends(platform_admin)) -> dict:
    async with _business(request, business_id) as conn:
        await imports.discard(conn, import_id)
    await _audit(request, staff, business_id, "history.discarded", {"import": str(import_id)})
    return {"deleted": True}
