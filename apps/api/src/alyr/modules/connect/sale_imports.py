"""Importing a POS's sales export: upload, preview, apply, undo (ALY-142, spec 016).

The Catalog's import (`modules/items/imports.py`) is the model, and its file reading, its limits
and its habits are reused: the file is read by `items.sheets` (CSV in UTF-8, UTF-16 or the Arabic
Windows code page, comma, semicolon or tab; or Excel), nothing in it is ever calculated, and the
upload is the request's body.

1. **Upload** stores the file, with what was read from it (it is read once, off the event loop
   and before a transaction is open, ALY-278), and answers with a **preview of every row**:
   which column is which (found by name in either language, or from a saved mapping that fits
   the file), every sale it would make, and every problem with its row number in English and
   Arabic. Nothing is written but the stored file. The shop can change the mapping and the
   options (the kind of document when the file has no such column, a way of paying when it has
   none, whether to send) and see the preview again, and can save a mapping under a name for
   next time.
2. **Apply** carries the preview's hash, so what is applied is exactly what was seen, and makes
   the whole file **in one transaction through the same door as the open API** (`ingest.accept`):
   every sale is idempotent (a sale ALYR already has is skipped, not made twice), every number
   is checked, every customer found or made. If anything fails, nothing is made.
3. **Undo** takes back the newest import, while nothing in it was sent to a customer: its
   documents are **withdrawn** (kept on record, marked, never deleted) and its sales are free to
   be imported again. It is refused for documents ALYR numbered (a gapless counter and issued
   paper are never taken back; cancel those with a credit note) and for an import that cancelled
   other documents.

A file holds up to 200 sales and 2,000 rows: applying draws a PDF for each inside one
transaction.
"""

import hashlib
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.team import Actor
from alyr.modules.connect import ingest, sale_import_plan, terms, webhooks
from alyr.modules.connect.sale_import_plan import Problem
from alyr.modules.connect.words import ConnectError
from alyr.modules.documents import money
from alyr.modules.documents import settings as doc_settings
from alyr.modules.documents.errors import DocumentError
from alyr.modules.items import xlsx
from alyr.modules.items.xlsx import Sheet

SUBJECT = doc_settings.SUBJECT
SHOWN_SALES = 50
SHOWN_PROBLEMS = 200
OPTION_KEYS = ("kind", "send", "default_payment_method")
KINDS = ("receipt", "invoice", "credit_note", "quote", "proforma", "delivery_note",
         "deposit_receipt")


def clean_options(raw: object) -> dict:
    """The shop's choices for this file, only the ones that exist."""
    if not isinstance(raw, dict):
        return {}
    out: dict = {}
    if raw.get("kind") in KINDS:
        out["kind"] = raw["kind"]
    if isinstance(raw.get("send"), bool):
        out["send"] = raw["send"]
    method = raw.get("default_payment_method")
    if isinstance(method, str) and sale_import_plan._word(method, sale_import_plan.METHOD_WORDS):
        out["default_payment_method"] = sale_import_plan._word(
            method, sale_import_plan.METHOD_WORDS)
    return out


def _digest(parts: list[bytes]) -> str:
    h = hashlib.sha256()
    for part in parts:
        h.update(hashlib.sha256(part).digest())
    return h.hexdigest()


# ── reading a stored upload ──────────────────────────────────────────────────────────────


def _rows(row: asyncpg.Record) -> tuple[list[list[object]], bool]:
    """What was read from the file when it arrived. An upload kept before it was (ALY-278) is
    not read again here: it is gone, and the shop sends the file again."""
    if row["sheet"] is None:
        raise ConnectError("import_not_found", 404)
    sheet = xlsx.from_stored(row["sheet"])
    return sheet.rows, sheet.truncated


async def _tenant(conn: asyncpg.Connection) -> asyncpg.Record:
    return await conn.fetchrow(
        "select id, timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")


def _problem_of(error: DocumentError, row: int, sale: str) -> Problem:
    en, ar = error.en, error.ar
    if error.code == "totals_mismatch" and "expected_total_minor" in error.extra:
        sent = money.plain(error.extra["sent_total_minor"], 2)
        worked = money.plain(error.extra["expected_total_minor"], 2)
        en += f" (The file says {sent}; the lines add up to {worked}.)"
        ar += f" (يذكر الملف {sent}، وتبلغ البنود {worked}.)"
    return Problem(row, error.code, en, ar, sale, str(error.extra.get("field", "")))


async def _preview_of(conn: asyncpg.Connection, row: asyncpg.Record) -> dict:
    rows, truncated = _rows(row)
    headers = sale_import_plan.headers_of(rows)
    mapping = row["mapping"] or {}
    options = row["options"] or {}
    shop = await doc_settings.get(conn)
    tenant = await _tenant(conn)
    built = sale_import_plan.build(rows, mapping, options, tz=tenant["timezone"],
                                   shop_currency=shop["currency"], truncated=truncated)
    problems = list(built.problems)
    cards, ready, existing = [], 0, 0
    sender = ingest.Sender(Actor(None, "Preview"), via="csv", import_id=row["id"])
    digests: list[bytes] = []
    for sale_id, first_row, sale in built.sales:
        key = f"csv-{row['id']}-{hashlib.sha1(sale_id.encode()).hexdigest()[:16]}"
        state = "ready"
        try:
            answer = await ingest.accept(conn, sender, sale, key, dry=True)
            if answer is not None:
                state = "existing"
                existing += 1
            else:
                ready += 1
        except DocumentError as error:
            problems.append(_problem_of(error, first_row, sale_id))
            state = "problem"
        digests.append(f"{sale_id}|{state}|{sale.totals.total_minor}".encode())
        if len(cards) < SHOWN_SALES:
            customer = sale.customer
            cards.append({
                "sale_id": sale_id, "row": first_row, "kind": sale.kind,
                "number": sale.external_document_number,
                "customer": customer.name or customer.name_ar or customer.company
                or customer.phone, "phone": customer.phone,
                "lines": len(sale.lines), "total_minor": sale.totals.total_minor,
                "currency": sale.currency, "state": state})
    problems.sort(key=lambda p: (p.row, p.code))
    digest = _digest([hashlib.sha256(bytes(row["file"])).digest(),
                      ingest.canonical(mapping), ingest.canonical(options), *digests,
                      ingest.canonical([p.as_dict() for p in problems])])
    return {
        "id": str(row["id"]), "filename": row["filename"], "status": row["status"],
        "headers": headers, "mapping": mapping, "options": options,
        "columns": [{"key": c.key, "label": c.label.en, "label_ar": c.label.ar,
                     "needed": c.needed} for c in sale_import_plan.COLUMNS],
        "missing": sale_import_plan.missing_required(mapping, options),
        "counts": {"rows": built.rows, "sales": built.sale_count, "ready": ready,
                   "existing": existing, "problems": len(problems)},
        "sales": cards,
        "problems": [p.as_dict() for p in problems[:SHOWN_PROBLEMS]],
        "problems_total": len(problems),
        "hash": digest,
        "can_apply": row["status"] == "preview" and not problems and ready > 0,
    }


# ── upload, change, preview ──────────────────────────────────────────────────────────────


async def upload(conn: asyncpg.Connection, actor: Actor, filename: str, data: bytes,
                 max_bytes: int, sheet: Sheet) -> dict:
    """Store a file and what was read from it (`sheets.read_table`, which the caller runs off the
    event loop: a file that cannot be read stops there), and preview it."""
    if len(data) > max_bytes:
        raise ConnectError("import_too_big", 413)
    headers = sale_import_plan.headers_of(sheet.rows)
    mapping = sale_import_plan.auto_mapping(headers)
    template_name = None
    for saved in await conn.fetch(
            "select name, mapping, options from sale_import_templates order by updated_at desc"):
        if sale_import_plan.mapping_fits(saved["mapping"], headers):
            mapping = sale_import_plan.clean_mapping(saved["mapping"], headers)
            template_name = saved["name"]
            options = clean_options(saved["options"])
            break
    else:
        options = {}
    row = await conn.fetchrow(
        "insert into sale_imports (filename, file, sheet, mapping, options, actor_id, actor_name) "
        "values ($1, $2, $3, $4, $5, $6, $7) returning *",
        (filename or "sales.csv")[:200], data, xlsx.to_stored(sheet), mapping, options, actor.id,
        actor.name)
    preview = await _preview_of(conn, row)
    return {**preview, "template": template_name}


async def get(conn: asyncpg.Connection, import_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow("select * from sale_imports where id = $1 for update", import_id)
    if row is None:
        raise ConnectError("import_not_found", 404)
    return row


async def change(conn: asyncpg.Connection, import_id: UUID, *, mapping: dict | None = None,
                 options: dict | None = None) -> dict:
    """Choose which column is which, or the options, and preview the file again."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise ConnectError("import_not_preview", 409)
    rows, _truncated = _rows(row)
    headers = sale_import_plan.headers_of(rows)
    new_mapping = (sale_import_plan.clean_mapping(mapping, headers) if mapping is not None
                   else row["mapping"])
    new_options = clean_options(options) if options is not None else row["options"]
    row = await conn.fetchrow(
        "update sale_imports set mapping = $2, options = $3 where id = $1 returning *",
        import_id, new_mapping, new_options)
    return await _preview_of(conn, row)


async def show(conn: asyncpg.Connection, import_id: UUID) -> dict:
    row = await get(conn, import_id)
    if row["status"] == "preview":
        return await _preview_of(conn, row)
    return {**_summary(row), "counts": (row["summary"] or {}).get("counts", {})}


# ── apply ────────────────────────────────────────────────────────────────────────────────


async def apply(conn: asyncpg.Connection, actor: Actor, import_id: UUID, preview_hash: str
                ) -> dict:
    """Make every sale in the file, in one transaction, exactly as previewed."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise ConnectError("import_not_preview", 409)
    await terms.require(conn)
    preview = await _preview_of(conn, row)
    if preview["hash"] != preview_hash:
        raise ConnectError("import_changed", 409)
    if preview["problems_total"]:
        raise ConnectError("import_has_errors", 409)
    if not preview["counts"]["sales"]:
        raise ConnectError("import_empty", 422)

    rows, truncated = _rows(row)
    shop = await doc_settings.get(conn)
    tenant = await _tenant(conn)
    built = sale_import_plan.build(rows, row["mapping"], row["options"], tz=tenant["timezone"],
                                   shop_currency=shop["currency"], truncated=truncated)
    sender = ingest.Sender(actor, via="csv", import_id=import_id)
    made, skipped, by_kind = 0, 0, {}
    for sale_id, first_row, sale in built.sales:
        key = f"csv-{import_id}-{hashlib.sha1(sale_id.encode()).hexdigest()[:16]}"
        try:
            answer = await ingest.accept(conn, sender, sale, key)
        except DocumentError as error:  # the whole file is rolled back with this
            raise ConnectError("import_has_errors", 409, problems=[
                _problem_of(error, first_row, sale_id).as_dict()]) from error
        if answer["replayed"]:
            skipped += 1
        else:
            made += 1
            by_kind[sale.kind] = by_kind.get(sale.kind, 0) + 1
    summary = {"counts": {"sales": made + skipped, "made": made, "skipped": skipped},
               "by_kind": by_kind}
    row = await conn.fetchrow(
        "update sale_imports set status = 'applied', file = null, sheet = null, "
        "applied_at = now(), summary = $2 where id = $1 returning *", import_id, summary)
    await team.record(conn, SUBJECT, import_id, "import_applied", actor, None,
                      {"made": made, "skipped": skipped, "filename": row["filename"][:80]})
    return {**_summary(row), "counts": summary["counts"], "by_kind": by_kind}


# ── undo ─────────────────────────────────────────────────────────────────────────────────


async def undo(conn: asyncpg.Connection, actor: Actor) -> dict:
    """Take back the newest applied import: withdraw its documents (kept, marked) and free its
    sales to be imported again. Refused once anything in it was sent, for documents ALYR
    numbered, and for an import that cancelled other documents."""
    latest = await conn.fetchrow(
        "select * from sale_imports where status = 'applied' order by applied_at desc, id "
        "limit 1 for update")
    if latest is None:
        raise ConnectError("import_nothing_to_undo", 404)
    sold = await conn.fetch(
        "select cs.id as sale_row, d.id, d.number, d.number_authority, d.status "
        "from connect_sales cs join documents d on d.id = cs.document_id "
        "where cs.import_id = $1 and cs.released_at is null order by cs.created_at desc, cs.id",
        latest["id"])
    if any(d["number_authority"] != "external" for d in sold):
        raise ConnectError("import_not_undoable", 409)
    ids = [d["id"] for d in sold]
    if await conn.fetchval(
            "select true from documents where voided_by_document_id = any($1) limit 1", ids):
        raise ConnectError("import_not_undoable", 409)
    if await conn.fetchval(
            "select true from document_deliveries where document_id = any($1) "
            "and status <> 'blocked' limit 1", ids):
        raise ConnectError("import_already_sent", 409)
    reason = f"Import {latest['filename'][:60]} undone"
    for d in sold:
        await conn.execute(
            "update documents set withdrawn_at = now(), withdrawn_by = $2, "
            "withdrawn_reason = $3 where id = $1", d["id"], actor.name, reason)
        await conn.execute("update connect_sales set released_at = now() where id = $1",
                           d["sale_row"])
        await webhooks.emit(conn, "document.cancelled", {
            "document_id": str(d["id"]), "number": d["number"], "withdrawn": True})
    row = await conn.fetchrow(
        "update sale_imports set status = 'undone', undone_at = now(), undone_by = $2 "
        "where id = $1 returning *", latest["id"], actor.name)
    await team.record(conn, SUBJECT, latest["id"], "import_undone", actor, None,
                      {"withdrawn": len(sold)})
    return {**_summary(row), "withdrawn": len(sold)}


# ── history and saved mappings ───────────────────────────────────────────────────────────


def _summary(row: asyncpg.Record) -> dict:
    def when(value):
        return value.isoformat() if value else None

    return {
        "id": str(row["id"]), "filename": row["filename"], "status": row["status"],
        "created_at": when(row["created_at"]), "applied_at": when(row["applied_at"]),
        "undone_at": when(row["undone_at"]), "actor": row["actor_name"],
        "undone_by": row["undone_by"], "options": row["options"] or {},
    }


async def history(conn: asyncpg.Connection, limit: int = 10) -> dict:
    rows = await conn.fetch(
        "select * from sale_imports where status <> 'preview' "
        "order by coalesce(applied_at, created_at) desc, id limit $1", limit)
    newest = next((r["id"] for r in rows if r["status"] == "applied"), None)
    return {"imports": [
        {**_summary(r), "counts": (r["summary"] or {}).get("counts", {}),
         "by_kind": (r["summary"] or {}).get("by_kind", {}),
         "can_undo": r["id"] == newest}
        for r in rows]}


async def discard(conn: asyncpg.Connection, import_id: UUID) -> None:
    """Drop a preview nobody applied."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise ConnectError("import_not_preview", 409)
    await conn.execute("delete from sale_imports where id = $1", import_id)


def _template_view(row: asyncpg.Record) -> dict:
    return {"name": row["name"], "mapping": row["mapping"], "options": row["options"],
            "updated_at": row["updated_at"].isoformat()}


async def list_templates(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch("select * from sale_import_templates order by updated_at desc")
    return [_template_view(r) for r in rows]


async def save_template(conn: asyncpg.Connection, actor: Actor, name: str, mapping: dict,
                        options: dict) -> dict:
    name = " ".join((name or "").split())
    if not 1 <= len(name) <= 60:
        raise ConnectError("template_name_invalid")
    clean = {k: v for k, v in (mapping or {}).items()
             if k in sale_import_plan.BY_KEY and isinstance(v, str) and v}
    row = await conn.fetchrow(
        "insert into sale_import_templates (name, mapping, options, created_by) "
        "values ($1, $2, $3, $4) on conflict (tenant_id, name) do update set "
        "mapping = excluded.mapping, options = excluded.options, updated_at = now() "
        "returning *", name, clean, clean_options(options), actor.name)
    return _template_view(row)


async def delete_template(conn: asyncpg.Connection, name: str) -> None:
    gone = await conn.fetchval("delete from sale_import_templates where name = $1 returning 1",
                               name)
    if gone is None:
        raise ConnectError("template_not_found", 404)
