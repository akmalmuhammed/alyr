"""Making, issuing, crediting and reading documents (ALY-138, spec 011).

Every function takes a tenant-scoped connection (`async with db.tenant(id) as conn`); the
caller's transaction is the issuing transaction. That is what makes issuing atomic: the
number, the PDF, the hash and the status change commit together or not at all.

The life of a document:

    draft  ──issue──▶  issued  ──credit note covering it all──▶  void

* A **draft** has no number and can be changed or thrown away.
* **Issuing** allocates the next number under a row lock (`numbering.py`), copies the seller
  and the customer onto the document, hashes what it says, draws the PDF, and stores the PDF and
  flips the status, in the one transaction. From that moment the database refuses any change
  (migration 0034).
* A **credit note** is a new numbered document that points at the invoice (or receipt) it
  cancels, in whole or in part. When credit notes add up to the whole of it, the invoice
  becomes **void**. Nothing is ever deleted.

Every step that changes something writes who did it on the activity record.
"""

import asyncio
import hashlib
import re
from collections.abc import Mapping
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.documents import (
    access,
    build,
    canonical,
    kinds,
    numbering,
    prepare,
    settings,
    words,
)
from alyr.modules.documents.errors import DocumentError
from alyr.modules.documents.render import render as render_doc
from alyr.modules.documents.render import sample

SUBJECT = settings.SUBJECT
KEY_PATTERN = re.compile(r"[A-Za-z0-9_.:-]{8,80}")
# The columns a draft keeps, in the order the SQL below lists them.
DRAFT_COLUMNS = (
    "kind", "audience", "languages", "layout", "currency", "currency_exponent", "due_date",
    "customer", "contact_id", "gross_minor", "discount_minor", "tax_minor", "rounding_minor",
    "total_minor", "paid_minor", "branch_key", "payments", "notes", "terms", "reason", "source",
    "source_ref", "related_document_id",
)
LINE_COLUMNS = (
    "position", "description", "description_ar", "sku", "quantity", "unit", "unit_price_minor",
    "discount_minor", "tax_rate_bp", "line_net_minor", "tax_minor", "line_total_minor",
)


def _clock() -> datetime:
    """The instant of issuing. A function of its own so a test can set the date."""
    return datetime.now(UTC)


async def render_pdf(doc) -> bytes:
    """Draw a `Doc` in a thread: drawing is plain CPU work and must not hold the event loop.
    A function of its own so a test can make it fail or count its calls."""
    return await asyncio.to_thread(render_doc, doc)


# ── small reads ───────────────────────────────────────────────────────────────────────────


async def _tenant(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(
        "select name, name_ar, timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    return dict(row)


async def _row(conn: asyncpg.Connection, doc_id: UUID, *, lock: bool = False) -> dict:
    row = await conn.fetchrow(
        "select * from documents where id = $1" + (" for update" if lock else ""), doc_id
    )
    if row is None:
        raise DocumentError("not_found", 404)
    return dict(row)


async def _lines(conn: asyncpg.Connection, doc_id: UUID) -> list[dict]:
    rows = await conn.fetch(
        "select * from document_lines where document_id = $1 order by position", doc_id
    )
    return [dict(r) for r in rows]


def _check_key(key: str | None) -> None:
    if key is not None and not KEY_PATTERN.fullmatch(key):
        raise DocumentError("key_invalid", 400)


async def _lock_key(conn: asyncpg.Connection, key: str) -> None:
    """Two requests with one key take turns, so the second finds what the first made."""
    await conn.execute(
        "select pg_advisory_xact_lock(hashtextextended("
        "coalesce(nullif(current_setting('app.tenant_id', true), ''), '') || ':' || $1, 0))",
        key,
    )


# Shared with the sales package (payments recorded by hand use the same key rule and lock).
check_key = _check_key
lock_key = _lock_key


async def _by_key(conn: asyncpg.Connection, key: str) -> dict | None:
    row = await conn.fetchrow("select * from documents where issue_key = $1", key)
    return dict(row) if row else None


# ── drafts ────────────────────────────────────────────────────────────────────────────────


async def _fill_from_contact(conn: asyncpg.Connection, columns: dict) -> None:
    """A draft made for one of the shop's contacts starts with their name and number."""
    contact_id = columns.get("contact_id")
    if not contact_id:
        return
    contact = await conn.fetchrow("select name, phone from contacts where id = $1", contact_id)
    if contact is None:
        columns["contact_id"] = None
        return
    customer = columns["customer"]
    if not (customer.get("name") or customer.get("name_ar")) and contact["name"]:
        customer["name"] = contact["name"]
    if not customer.get("phone") and contact["phone"]:
        customer["phone"] = contact["phone"]


async def _write_lines(conn: asyncpg.Connection, doc_id: UUID, lines: list[dict]) -> None:
    await conn.execute("delete from document_lines where document_id = $1", doc_id)
    if lines:
        await conn.executemany(
            f"insert into document_lines (document_id, {', '.join(LINE_COLUMNS)}) "
            f"values ($1, {', '.join(f'${i}' for i in range(2, len(LINE_COLUMNS) + 2))})",
            [(doc_id, *(line[c] for c in LINE_COLUMNS)) for line in lines],
        )


async def create_draft(conn: asyncpg.Connection, staff: Staff, body: Mapping) -> dict:
    shop = await settings.get(conn)
    prepared = prepare.prepare(body, shop)
    columns = prepared["columns"]
    # Only code inside ALYR sets this (the API's draft body has no such field): a receipt for
    # a payment against an invoice points at the invoice (sales.py, payments.py).
    columns["related_document_id"] = body.get("related_document_id")
    await settings.branch_for(conn, columns["branch_key"], must_be_active=True)
    await _fill_from_contact(conn, columns)
    actor = team.actor_of(staff)
    row = await conn.fetchrow(
        f"insert into documents ({', '.join(DRAFT_COLUMNS)}, created_by, created_by_user) "
        f"values ({', '.join(f'${i}' for i in range(1, len(DRAFT_COLUMNS) + 3))}) returning id",
        *(columns[c] for c in DRAFT_COLUMNS), actor.name, staff.user_id,
    )
    doc_id = row["id"]
    await _write_lines(conn, doc_id, prepared["lines"])
    await team.record(
        conn, SUBJECT, doc_id, "draft_created", actor, columns.get("contact_id"),
        {"kind": columns["kind"], "total_minor": columns["total_minor"]},
    )
    return await get(conn, staff, doc_id)


async def update_draft(conn: asyncpg.Connection, staff: Staff, doc_id: UUID, body: Mapping) -> dict:
    row = await _row(conn, doc_id, lock=True)
    access.require_own_or_manager(staff, row["created_by_user"])
    if row["status"] != "draft":
        raise DocumentError("not_a_draft", 409)
    shop = await settings.get(conn)
    prepared = prepare.prepare(body, shop)
    columns = prepared["columns"]
    columns["related_document_id"] = row["related_document_id"]
    await settings.branch_for(conn, columns["branch_key"], must_be_active=True)
    await _fill_from_contact(conn, columns)
    assignments = ", ".join(f"{c} = ${i}" for i, c in enumerate(DRAFT_COLUMNS, start=2))
    await conn.execute(
        f"update documents set {assignments}, updated_at = now() where id = $1",
        doc_id, *(columns[c] for c in DRAFT_COLUMNS),
    )
    await _write_lines(conn, doc_id, prepared["lines"])
    await team.record(
        conn, SUBJECT, doc_id, "draft_updated", team.actor_of(staff), columns.get("contact_id"),
        {"kind": columns["kind"], "total_minor": columns["total_minor"]},
    )
    return await get(conn, staff, doc_id)


async def delete_draft(conn: asyncpg.Connection, staff: Staff, doc_id: UUID) -> None:
    """Throw a draft away. An issued document is never deleted (the database refuses)."""
    row = await _row(conn, doc_id, lock=True)
    access.require_own_or_manager(staff, row["created_by_user"])
    if row["status"] != "draft":
        raise DocumentError("not_a_draft", 409)
    await conn.execute("delete from documents where id = $1", doc_id)
    await team.record(conn, SUBJECT, doc_id, "draft_deleted", team.actor_of(staff),
                      row["contact_id"], {"kind": row["kind"]})


# ── issuing ───────────────────────────────────────────────────────────────────────────────


async def issue(
    conn: asyncpg.Connection, staff: Staff, doc_id: UUID, *, key: str | None = None
) -> tuple[dict, bool]:
    """Issue a draft. Returns (the document, whether this was a replay of an earlier issue
    with the same key). Everything below happens in the caller's transaction."""
    _check_key(key)
    await access.require_issue(conn, staff)
    if key:
        await _lock_key(conn, key)
        earlier = await _by_key(conn, key)
        if earlier is not None:
            if earlier["id"] != doc_id:
                raise DocumentError("key_reused", 409)
            return await get(conn, staff, doc_id), True
    row = await _row(conn, doc_id, lock=True)
    access.require_own_or_manager(staff, row["created_by_user"])
    if row["status"] != "draft":
        raise DocumentError("already_issued", 409)
    await _do_issue(conn, staff, row, key)
    return await get(conn, staff, doc_id), False


async def create_and_issue(
    conn: asyncpg.Connection, staff: Staff, body: Mapping, *, key: str
) -> tuple[dict, bool]:
    """Make a document and issue it in one request, for a sale at the counter or another
    system's call. The key is required: a retry must find the document, not make a second."""
    if key is None:
        raise DocumentError("key_needed", 400)
    _check_key(key)
    await access.require_issue(conn, staff)
    await _lock_key(conn, key)
    earlier = await _by_key(conn, key)
    if earlier is not None:
        return await get(conn, staff, earlier["id"]), True
    draft = await create_draft(conn, staff, body)
    row = await _row(conn, UUID(draft["id"]), lock=True)
    await _do_issue(conn, staff, row, key)
    return await get(conn, staff, row["id"]), False


async def _do_issue(
    conn: asyncpg.Connection, staff: Staff, row: dict, key: str | None
) -> None:
    """The heart of it. `row` is the draft, locked. Raises (and so rolls everything back,
    the number with it) if the document cannot be issued or any step fails."""
    shop = await settings.get(conn)
    tenant = await _tenant(conn)
    lines = await _lines(conn, row["id"])
    branch = await settings.branch_for(conn, row["branch_key"],
                                       must_be_active=row["kind"] != "credit_note")
    seller = settings.seller_snapshot(shop, tenant["name"], tenant["name_ar"], branch)
    customer = dict(row["customer"] or {})
    if not (customer.get("name") or customer.get("name_ar")) and row["contact_id"]:
        await _fill_from_contact(conn, {"contact_id": row["contact_id"], "customer": customer})
    notes, terms = prepare.default_texts(row, shop)
    columns = {**row, "customer": customer, "notes": notes, "terms": terms}
    prepare.check_issuable(columns, lines, seller, shop)

    # Lock the series and take the number. From here to the commit nobody else can issue
    # in this series, so this is also the part to keep short: the drawing is the slow bit.
    alloc = await numbering.allocate(
        conn, row["kind"], row["branch_key"], tenant["timezone"], clock=_clock
    )
    full = {
        **columns, "series_key": alloc.series_key, "number": alloc.number,
        "number_year": alloc.number_year, "seq": alloc.seq, "issued_at": alloc.issued_at,
        "issue_date": alloc.issue_date, "seller": seller,
    }
    content_hash = canonical.hash_content(canonical.content_of(full, lines))
    full["content_hash"] = content_hash

    related_row = None
    if row["related_document_id"]:
        related_row = await _row(conn, row["related_document_id"])
    logo, stamp = await settings.images_of(conn)
    doc = build.make_doc(full, lines, seller, build.brand_of(shop, logo, stamp),
                         related=related_row)
    pdf = await render_pdf(doc)
    pdf_sha = hashlib.sha256(pdf).hexdigest()

    await conn.execute(
        "insert into document_files (document_id, content, sha256, bytes) values ($1, $2, $3, $4)",
        row["id"], pdf, pdf_sha, len(pdf),
    )
    actor = team.actor_of(staff)
    await conn.execute(
        "update documents set status = 'issued', series_key = $2, number = $3, "
        "number_year = $4, seq = $5, issued_at = $6, issue_date = $7, customer = $8, "
        "seller = $9, notes = $10, terms = $11, hash_version = $12, content_hash = $13, "
        "pdf_sha256 = $14, pdf_bytes = $15, issue_key = $16, issued_by = $17, "
        "issued_by_user = $18 where id = $1",
        row["id"], alloc.series_key, alloc.number, alloc.number_year, alloc.seq,
        alloc.issued_at, alloc.issue_date, customer, seller, notes, terms,
        canonical.HASH_VERSION, content_hash, pdf_sha, len(pdf), key, actor.name, staff.user_id,
    )
    await team.record(
        conn, SUBJECT, row["id"], "issued", actor, row["contact_id"],
        {"kind": row["kind"], "number": alloc.number, "total_minor": row["total_minor"],
         "currency": row["currency"]},
    )


# ── credit notes ──────────────────────────────────────────────────────────────────────────


async def credit_note(
    conn: asyncpg.Connection, staff: Staff, doc_id: UUID, *, reason: str,
    lines: list[Mapping] | None = None, key: str | None = None,
) -> tuple[dict, bool]:
    """Issue a credit note against an issued invoice, receipt or deposit receipt.

    With no `lines` it credits the whole document, once; the document is then void. With
    `lines` it credits part of it (and the document is void when credit notes have covered it
    all). A credit note is itself a numbered, immutable document. Returns (the credit note,
    replayed)."""
    _check_key(key)
    access.require_manager(staff)
    if key:
        await _lock_key(conn, key)
        earlier = await _by_key(conn, key)
        if earlier is not None:
            if earlier["related_document_id"] != doc_id:
                raise DocumentError("key_reused", 409)
            return await get(conn, staff, earlier["id"]), True
    target = await _row(conn, doc_id, lock=True)
    if target["status"] == "void":
        raise DocumentError("already_void", 409)
    if target["status"] != "issued" or not kinds.KINDS[target["kind"]].creditable:
        raise DocumentError("cannot_credit", 409)
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise DocumentError("credit_needs_reason")
    credited, credited_exact = await conn.fetchrow(
        "select coalesce(sum(total_minor), 0), coalesce(sum(total_minor - rounding_minor), 0) "
        "from documents where related_document_id = $1 and kind = 'credit_note' "
        "and status = 'issued'", doc_id,
    )
    if lines is None:
        if credited:
            raise DocumentError("credit_needs_lines")
        original = await _lines(conn, doc_id)
        credit_lines = [{c: line[c] for c in LINE_COLUMNS} for line in original]
    else:
        credit_lines = [
            prepare.clean_line(raw, position, tax_enabled=True)
            for position, raw in enumerate(lines, start=1)
        ]
    if not credit_lines:
        raise DocumentError("no_lines")
    totals = prepare.totals_of(credit_lines)
    # The original's cash rounding is credited with the last of it: a credit note that brings
    # the credited amounts (before rounding) up to the original's takes the rounding too, so
    # credit notes can add up to the whole of a document that was rounded.
    rounding = 0
    if credited_exact + totals["total_minor"] == target["total_minor"] - target["rounding_minor"]:
        rounding = target["rounding_minor"]
    totals["rounding_minor"] = rounding
    totals["total_minor"] += rounding
    if credited + totals["total_minor"] > target["total_minor"]:
        raise DocumentError("credit_too_big", 409)

    actor = team.actor_of(staff)
    columns = {
        "kind": "credit_note", "audience": target["audience"], "languages": target["languages"],
        "layout": target["layout"], "currency": target["currency"],
        "currency_exponent": target["currency_exponent"], "due_date": None,
        "customer": target["customer"], "contact_id": target["contact_id"], **totals,
        "branch_key": target["branch_key"], "paid_minor": 0, "payments": [], "notes": {},
        "terms": {}, "reason": reason, "source": "manual", "source_ref": "",
        "related_document_id": doc_id,
    }
    created = await conn.fetchrow(
        f"insert into documents ({', '.join(DRAFT_COLUMNS)}, created_by, created_by_user) "
        f"values ({', '.join(f'${i}' for i in range(1, len(DRAFT_COLUMNS) + 3))}) returning *",
        *(columns[c] for c in DRAFT_COLUMNS), actor.name, staff.user_id,
    )
    note = dict(created)
    await _write_lines(conn, note["id"], credit_lines)
    await _do_issue(conn, staff, note, key)
    done = await _row(conn, note["id"])
    # Void the original when credit notes now cover all of it.
    if credited + totals["total_minor"] == target["total_minor"]:
        await conn.execute(
            "update documents set status = 'void', voided_at = now(), "
            "voided_by_document_id = $2 where id = $1", doc_id, note["id"],
        )
        await team.record(
            conn, SUBJECT, doc_id, "voided", actor, target["contact_id"],
            {"number": target["number"], "credit_note": done["number"]},
        )
    await team.record(
        conn, SUBJECT, note["id"], "credit_note_issued", actor, target["contact_id"],
        {"against": target["number"], "number": done["number"],
         "total_minor": totals["total_minor"]},
    )
    return await get(conn, staff, note["id"]), False


# ── reading ───────────────────────────────────────────────────────────────────────────────


def _iso(value):
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def _line_public(line: Mapping) -> dict:
    out = {c: line[c] for c in LINE_COLUMNS}
    # A quantity is exact, so it travels as text, never as a float.
    out["quantity"] = format(Decimal(line["quantity"]).quantize(Decimal("0.001")), "f")
    return out


def retention_of(row: Mapping) -> dict | None:
    if row["issue_date"] is None:
        return None
    years = kinds.RETENTION_YEARS
    issued = row["issue_date"]
    try:
        until = issued.replace(year=issued.year + years)
    except ValueError:  # 29 February, and the target year has none
        until = issued.replace(year=issued.year + years, month=3, day=1)
    return {"years": years, "confirmed": kinds.RETENTION_CONFIRMED, "keep_until": until.isoformat()}


async def get(conn: asyncpg.Connection, staff: Staff, doc_id: UUID) -> dict:
    row = await _row(conn, doc_id)
    access.require_own_or_manager(staff, row["created_by_user"])
    lines = await _lines(conn, doc_id)
    related = None
    if row["related_document_id"]:
        r = await _row(conn, row["related_document_id"])
        related = {"id": str(r["id"]), "kind": r["kind"], "number": r["number"],
                   "status": r["status"]}
    credits = [
        {"id": str(c["id"]), "number": c["number"], "total_minor": c["total_minor"],
         "issue_date": _iso(c["issue_date"])}
        for c in await conn.fetch(
            "select id, number, total_minor, issue_date from documents "
            "where related_document_id = $1 and kind = 'credit_note' and status = 'issued' "
            "order by seq", doc_id)
    ]
    voided_by = None
    if row["voided_by_document_id"]:
        v = await _row(conn, row["voided_by_document_id"])
        voided_by = {"id": str(v["id"]), "number": v["number"]}
    warnings = []
    if row["status"] == "draft":
        # A draft has no copy of the seller yet: judge it by the shop's settings as they are.
        tenant = await _tenant(conn)
        seller = settings.seller_snapshot(await settings.get(conn), tenant["name"],
                                          tenant["name_ar"])
        warnings = [
            {"code": code, "en": words.WARNINGS[code].en, "ar": words.WARNINGS[code].ar}
            for code in prepare.warnings_for(row, lines, seller)
        ]
    return {
        "id": str(row["id"]), "kind": row["kind"], "status": row["status"],
        "audience": row["audience"], "languages": row["languages"], "layout": row["layout"],
        "currency": row["currency"], "currency_exponent": row["currency_exponent"],
        "number": row["number"], "series_key": row["series_key"],
        "issued_at": _iso(row["issued_at"]), "issue_date": _iso(row["issue_date"]),
        "due_date": _iso(row["due_date"]), "customer": row["customer"], "seller": row["seller"],
        "contact_id": _iso(row["contact_id"]),
        "branch": row["branch_key"],
        "totals": {
            "gross_minor": row["gross_minor"], "discount_minor": row["discount_minor"],
            "tax_minor": row["tax_minor"], "rounding_minor": row["rounding_minor"],
            "total_minor": row["total_minor"],
            "paid_minor": row["paid_minor"], "balance_minor": row["balance_minor"],
        },
        "payments": row["payments"], "notes": row["notes"], "terms": row["terms"],
        "reason": row["reason"], "source": row["source"], "source_ref": row["source_ref"],
        "related": related, "credit_notes": credits, "voided_by": voided_by,
        "voided_at": _iso(row["voided_at"]),
        "lines": [_line_public(line) for line in lines],
        "content_hash": row["content_hash"], "hash_version": row["hash_version"],
        "pdf": ({"sha256": row["pdf_sha256"], "bytes": row["pdf_bytes"]}
                if row["pdf_sha256"] else None),
        "created_by": row["created_by"], "created_at": _iso(row["created_at"]),
        "issued_by": row["issued_by"], "retention": retention_of(row), "warnings": warnings,
    }


async def list_documents(
    conn: asyncpg.Connection, staff: Staff, *, kind: str | None = None, status: str | None = None,
    q: str | None = None, limit: int = 50, offset: int = 0,
) -> dict:
    where, args = [], []

    def add(sql: str, value) -> None:
        args.append(value)
        where.append(sql.replace("?", f"${len(args)}"))

    if kind:
        add("kind = ?", kind)
    if status:
        add("status = ?", status)
    if q:
        add("(position(lower(?) in lower(coalesce(number, ''))) > 0 "
            "or position(lower(?) in lower(coalesce(customer ->> 'name', ''))) > 0 "
            "or position(lower(?) in lower(coalesce(customer ->> 'name_ar', ''))) > 0)", q)
    if not access.is_manager(staff):
        add("created_by_user = ?", staff.user_id)
    clause = (" where " + " and ".join(where)) if where else ""
    rows = await conn.fetch(
        "select id, kind, status, number, issue_date, currency, currency_exponent, total_minor, "
        "balance_minor, customer, created_at, created_by from documents" + clause
        + f" order by coalesce(issued_at, created_at) desc, id limit ${len(args) + 1} "
        f"offset ${len(args) + 2}", *args, limit, offset,
    )
    total = await conn.fetchval("select count(*) from documents" + clause, *args)
    return {
        "total": total,
        "documents": [
            {"id": str(r["id"]), "kind": r["kind"], "status": r["status"], "number": r["number"],
             "issue_date": _iso(r["issue_date"]), "currency": r["currency"],
             "currency_exponent": r["currency_exponent"], "total_minor": r["total_minor"],
             "balance_minor": r["balance_minor"],
             "customer_name": (r["customer"] or {}).get("name")
             or (r["customer"] or {}).get("name_ar", ""),
             "created_at": _iso(r["created_at"]), "created_by": r["created_by"]}
            for r in rows
        ],
    }


async def pdf_of(conn: asyncpg.Connection, staff: Staff, doc_id: UUID) -> tuple[bytes, dict]:
    row = await _row(conn, doc_id)
    access.require_own_or_manager(staff, row["created_by_user"])
    if row["status"] == "draft":
        raise DocumentError("not_issued", 409)
    data = await conn.fetchval("select content from document_files where document_id = $1", doc_id)
    return bytes(data), row


async def verify(conn: asyncpg.Connection, doc_id: UUID) -> dict:
    """Recompute an issued document's hash from what the database holds now, and check the
    stored PDF against its recorded SHA-256. A change anyone made to the content (which the
    database should have refused) shows here."""
    row = await _row(conn, doc_id)
    if row["status"] == "draft":
        raise DocumentError("not_issued", 409)
    lines = await _lines(conn, doc_id)
    recomputed = canonical.hash_content(canonical.content_of(row, lines))
    data = await conn.fetchval("select content from document_files where document_id = $1", doc_id)
    pdf_sha = hashlib.sha256(bytes(data)).hexdigest()
    return {
        "ok": recomputed == row["content_hash"] and pdf_sha == row["pdf_sha256"],
        "content_hash": row["content_hash"], "recomputed": recomputed,
        "hash_version": row["hash_version"],
        "pdf_ok": pdf_sha == row["pdf_sha256"],
    }


async def activity_of(conn: asyncpg.Connection, doc_id: UUID) -> list[dict]:
    await _row(conn, doc_id)  # a document of another shop is not found, however it is asked
    rows = await conn.fetch(
        "select action, detail, actor_name, created_at from activity "
        "where subject = 'document' and subject_id = $1 order by created_at, id", doc_id)
    return [{"action": r["action"], "detail": r["detail"], "actor": r["actor_name"],
             "at": _iso(r["created_at"])} for r in rows]


# ── previews: the same page, drawn from a draft or a sample, never numbered ───────────────


async def preview_pdf(
    conn: asyncpg.Connection, staff: Staff, *, body: Mapping | None = None,
    draft_id: UUID | None = None, kind: str | None = None, layout: str | None = None,
    languages: str | None = None,
) -> bytes:
    """Draw a document that does not exist: from a draft, from a body, or (with neither)
    from a made-up sale of the given kind. Writes nothing and takes no number, so a preview
    can be asked for as often as a person likes. `layout` and `languages` override the
    document's own so the owner can see how it looks in each."""
    shop = await settings.get(conn)
    tenant = await _tenant(conn)
    related = None
    if draft_id is not None:
        row = await _row(conn, draft_id)
        access.require_own_or_manager(staff, row["created_by_user"])
        lines = await _lines(conn, draft_id)
        columns = dict(row)
    else:
        if body is None:
            if kind not in kinds.KINDS:
                raise DocumentError("kind_unknown", field="kind")
            body = sample.sample_body(kind)
            if kind == "credit_note":
                related = {"kind": "invoice", "number": sample.SAMPLE_INVOICE_NUMBER}
        prepared = prepare.prepare(body if kind != "credit_note" else {**body, "kind": "receipt"},
                                   shop)
        columns = {**prepared["columns"], "id": None, "number": None, "issued_at": None,
                   "content_hash": None}
        columns["kind"] = body["kind"]
        columns["balance_minor"] = columns["total_minor"] - columns["paid_minor"]
        lines = prepared["lines"]
    if layout:
        if layout not in kinds.LAYOUTS:
            raise DocumentError("layout_unknown", field="layout")
        columns["layout"] = layout
    if languages:
        if languages not in kinds.LANGUAGES:
            raise DocumentError("kind_unknown", field="languages")
        columns["languages"] = languages
    settings.check_audience_language(columns["audience"], columns["languages"])
    columns["notes"], columns["terms"] = prepare.default_texts(columns, shop)
    columns["issue_date"] = datetime.now(UTC).astimezone(ZoneInfo(tenant["timezone"])).date()
    branch = await settings.branch_for(conn, columns["branch_key"], must_be_active=False)
    seller = settings.seller_snapshot(shop, tenant["name"], tenant["name_ar"], branch)
    logo, stamp = await settings.images_of(conn)
    doc = build.make_doc(columns, lines, seller, build.brand_of(shop, logo, stamp),
                         related=related, preview=True)
    return await render_pdf(doc)
