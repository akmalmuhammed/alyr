"""A shop's document settings: who is selling, how its documents look, and the rules around
them (one row per shop, `document_settings`), and its numbering series.

* **The seller.** The business name in both languages, its commercial registration (CR)
  number, tax ID, licence number, address, phone and email. They are copied onto each
  document when it is issued, so editing them later never rewrites a document already given
  to a customer. A shop with no CR number issues receipts, not invoices, and each says so.
* **The look.** Layout (A4, A5, thermal 80 mm), the brand colour, the logo, a signature or
  stamp, which optional columns and blocks show, header and footer text, terms and notes per
  kind, the bank details.
* **Language.** Arabic first by default. Arabic only and English only are allowed, but a
  document sold to a consumer in Qatar always carries Arabic (MEC Circular 5 of 2016, as
  we read it; the lawyer's confirmation is ALY-51): the rule is enforced here, when the
  settings are saved, and again when a document is issued.
* **Who may issue.** Owners and admins always may. An agent may only when `agents_may_issue`
  is on.

Every function takes a tenant-scoped connection.
"""

import hashlib
import io
import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import asyncpg
from PIL import Image

from alyr.core import images, team
from alyr.core.team import Actor
from alyr.modules.documents import colours, kinds, money, numbering
from alyr.modules.documents.errors import DocumentError

SUBJECT = "document"

# The columns a client may change, with the longest text each takes (the database checks
# the same limits; this gives the person a message instead of an error).
TEXT_LIMITS = {
    "business_name": 120, "business_name_ar": 120, "commercial_registration": 40,
    "tax_id": 40, "licence_number": 40, "address": 300, "address_ar": 300, "phone": 40,
    "email": 120, "bank_details": 400, "header_en": 200, "header_ar": 200,
    "footer_en": 300, "footer_ar": 300,
}
FLAGS = (
    "tax_enabled", "show_sku", "show_discounts", "show_customer_tax_id", "show_bank",
    "show_signature", "show_alyr_mark", "agents_may_issue",
    # What happens on its own (ALY-139): which sales make a document, which channels send it,
    # and who may record a payment by hand.
    "auto_receipt_on_payment", "auto_invoice_credit_sales", "auto_deposit_receipt",
    "auto_send_whatsapp", "auto_send_email", "agents_may_record_payments",
)
CHOICES = {
    "languages": kinds.LANGUAGES, "default_audience": kinds.AUDIENCES, "layout": kinds.LAYOUTS,
    "send_mode": kinds.SEND_MODES,
}
# Terms and notes per kind: at most this many characters in each language.
KIND_TEXT_LIMIT = 600

_COLUMNS = (
    *TEXT_LIMITS, *FLAGS, *CHOICES, "currency", "tax_rate_bp", "cash_rounding_minor",
    "brand_color", "terms", "notes",
    "logo_sha256", "stamp_sha256", "updated_at", "updated_by",
)
_SELECT = (
    f"select {', '.join(_COLUMNS)}, logo_png is not null as has_logo, "
    "stamp_png is not null as has_stamp from document_settings"
)

# Pictures: a logo or a stamp is a small PNG kept in the settings row.
IMAGE_MAX_BYTES = 2 * 1024 * 1024
IMAGE_LONG_SIDE = 800
IMAGE_MAX_PIXELS = 25_000_000


async def shop_id(conn: asyncpg.Connection):
    return await conn.fetchval("select nullif(current_setting('app.tenant_id', true), '')::uuid")


async def ensure(conn: asyncpg.Connection) -> None:
    """The settings row and the default series, made the first time anything needs them."""
    await conn.execute("insert into document_settings default values on conflict do nothing")
    # The shop itself is the main branch; its series come first, the series FK needs it.
    await conn.execute("insert into document_branches (branch_key) values ('main') "
                       "on conflict do nothing")
    await _series_for(conn, "main", "")


async def _series_for(conn: asyncpg.Connection, branch_key: str, code: str) -> None:
    """The branch's counters, one per kind, each prefix the kind's with the branch's code."""
    await conn.execute(
        "insert into document_series (kind, series_key, prefix) "
        "select k, $3, p || $4 from unnest($1::text[], $2::text[]) as t(k, p) "
        "on conflict do nothing",
        list(kinds.KINDS), [k.prefix for k in kinds.KINDS.values()], branch_key, code,
    )


async def get(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(_SELECT)
    if row is None:
        await ensure(conn)
        row = await conn.fetchrow(_SELECT)
    return dict(row)


async def series_rows(conn: asyncpg.Connection) -> list[dict]:
    """Every numbering series with the number the next document will get (`next_number`; the
    screen says "next", never "reserved": another document may be issued first)."""
    rows = await conn.fetch(
        "select kind, series_key, prefix, pad, yearly_reset, number_year, last_number "
        "from document_series order by kind, series_key"
    )
    if not rows:
        await ensure(conn)
        return await series_rows(conn)
    tz = await conn.fetchval(
        "select timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")
    year = datetime.now(ZoneInfo(tz)).year
    return [{**dict(r), "next_number": numbering.next_number(r, year)} for r in rows]


async def recent_changes(conn: asyncpg.Connection, limit: int = 20) -> list[dict]:
    """What was changed in the document settings, newest first: who, when, and which settings
    (never the text of a bank detail or a note; the activity record keeps only the names)."""
    rows = await conn.fetch(
        "select action, detail, actor_name, created_at from activity "
        "where subject = 'document' "
        "and subject_id = nullif(current_setting('app.tenant_id', true), '')::uuid "
        "and action in ('settings_changed', 'logo_changed', 'stamp_changed', 'series_changed', "
        "'branch_added', 'branch_changed') order by created_at desc, id desc limit $1",
        max(1, min(limit, 50)))
    return [{"action": r["action"], "detail": r["detail"], "actor": r["actor_name"],
             "at": r["created_at"].astimezone(UTC).isoformat(timespec="seconds")
             .replace("+00:00", "Z")} for r in rows]


def check_audience_language(audience: str, languages: str) -> None:
    """A consumer document always carries Arabic."""
    if audience == "consumer" and not kinds.has_arabic(languages):
        raise DocumentError("arabic_required", field="languages")


def _clean_kind_texts(value: object) -> dict:
    """{kind: {"en": ..., "ar": ...}} with unknown kinds refused and the text limited."""
    if not isinstance(value, dict):
        raise DocumentError("text_too_long", field="terms")
    clean: dict = {}
    for kind, pair in value.items():
        if kind not in kinds.KINDS or not isinstance(pair, dict):
            raise DocumentError("kind_unknown", field=str(kind))
        item = {}
        for lang in ("en", "ar"):
            text = str(pair.get(lang, "")).strip()
            if len(text) > KIND_TEXT_LIMIT:
                raise DocumentError("text_too_long", field=f"{kind}.{lang}")
            if text:
                item[lang] = text
        if item:
            clean[kind] = item
    return clean


def _clean(changes: dict) -> dict:
    clean: dict = {}
    for name, value in changes.items():
        if name in TEXT_LIMITS:
            text = (value or "").strip()
            if len(text) > TEXT_LIMITS[name]:
                raise DocumentError("text_too_long", field=name)
            clean[name] = text
        elif name in FLAGS:
            clean[name] = bool(value)
        elif name in CHOICES:
            if value not in CHOICES[name]:
                raise DocumentError(
                    {"layout": "layout_unknown", "send_mode": "send_mode_invalid"}.get(
                        name, "kind_unknown"), field=name)
            clean[name] = value
        elif name == "currency":
            if value not in money.CURRENCIES:
                raise DocumentError("currency_unknown", field=name)
            clean[name] = value
        elif name == "cash_rounding_minor":
            if isinstance(value, bool) or value not in kinds.CASH_ROUNDING_STEPS:
                raise DocumentError("rounding_invalid", field=name)
            clean[name] = value
        elif name == "tax_rate_bp":
            if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 10000:
                raise DocumentError("amount_too_big", field=name)
            clean[name] = value
        elif name == "brand_color":
            if value in (None, ""):
                clean[name] = None
                continue
            text = str(value).strip().lower()
            if not re.fullmatch(r"#[0-9a-f]{6}", text):
                raise DocumentError("colour_invalid", field=name)
            if colours.contrast(text, colours.PAPER) < colours.RULE_CONTRAST:
                raise DocumentError("colour_too_light", field=name)
            clean[name] = text
        elif name in ("terms", "notes"):
            clean[name] = _clean_kind_texts(value)
    return clean


# The same checks, for a preview that tries settings out before they are saved.
clean = _clean


async def update(conn: asyncpg.Connection, actor: Actor, changes: dict) -> dict:
    """Change some settings; what is not sent stays as it was. Refuses a combination that
    would let a consumer document go out without Arabic. Writes who changed what."""
    before = await get(conn)
    clean = _clean(changes)
    after = {**before, **clean}
    check_audience_language(after["default_audience"], after["languages"])
    if not clean:
        return before
    names = list(clean)
    assignments = ", ".join(f"{name} = ${i}" for i, name in enumerate(names, start=2))
    await conn.execute(
        f"update document_settings set {assignments}, updated_at = now(), updated_by = $1",
        actor.name, *[clean[name] for name in names],
    )
    diff = []
    for name in names:
        if before[name] == clean[name]:
            continue
        if name in TEXT_LIMITS or name in ("terms", "notes"):
            diff.append({"field": name})
        else:
            diff.append({"field": name, "from": before[name], "to": clean[name]})
    if diff:
        await team.record(conn, SUBJECT, await shop_id(conn), "settings_changed", actor, None,
                          {"changes": diff})
    return await get(conn)


# ── The logo and the stamp ────────────────────────────────────────────────────────────────


def prepare_image(data: bytes) -> tuple[bytes, str]:
    """Check an uploaded picture with the same rules as product photos (by content, no SVG,
    no metadata, no animation: `core/images.py`) and return it as a PNG no larger than
    800 pixels on the long side, with its SHA-256. Raises `PhotoRefused` for a bad file."""
    if len(data) > IMAGE_MAX_BYTES:
        raise DocumentError("image_too_big", 413)
    variants = images.process(data, IMAGE_MAX_PIXELS)
    chosen = max((v for v in variants if v.long_side <= IMAGE_LONG_SIDE), key=lambda v: v.long_side,
                 default=variants[0])
    with Image.open(io.BytesIO(chosen.data)) as picture:
        picture.load()
        out = io.BytesIO()
        picture.save(out, "PNG", optimize=True)
    png = out.getvalue()
    return png, hashlib.sha256(png).hexdigest()


async def set_image(
    conn: asyncpg.Connection, actor: Actor, which: str, png: bytes | None, sha: str | None
) -> dict:
    """Put a logo or a stamp in place, or take it away (`png` None)."""
    if which not in ("logo", "stamp"):
        raise DocumentError("image_invalid")
    await get(conn)  # makes the row
    await conn.execute(
        f"update document_settings set {which}_png = $1, {which}_sha256 = $2, "
        "updated_at = now(), updated_by = $3",
        png, sha, actor.name,
    )
    await team.record(
        conn, SUBJECT, await shop_id(conn), f"{which}_changed", actor, None,
        {"removed": png is None},
    )
    return await get(conn)


async def images_of(conn: asyncpg.Connection) -> tuple[bytes | None, bytes | None]:
    row = await conn.fetchrow("select logo_png, stamp_png from document_settings")
    return (row["logo_png"], row["stamp_png"]) if row else (None, None)


# ── Numbering series ──────────────────────────────────────────────────────────────────────


async def update_series(
    conn: asyncpg.Connection, actor: Actor, kind: str, series_key: str,
    *, prefix: str | None = None, pad: int | None = None, yearly_reset: bool | None = None,
) -> dict:
    """Change how a series is written. Never its counter: that only moves when a document is
    issued, and the database refuses anything else."""
    if kind not in kinds.KINDS:
        raise DocumentError("kind_unknown")
    await ensure(conn)
    # The same lock issuing takes, so a number is never half in the old format.
    row = await conn.fetchrow(
        "select * from document_series where kind = $1 and series_key = $2 for update",
        kind, series_key,
    )
    if row is None:
        raise DocumentError("series_unknown", 404)
    new_prefix = prefix if prefix is not None else row["prefix"]
    if not re.fullmatch(r"[A-Z0-9]{1,8}", new_prefix):
        raise DocumentError("prefix_invalid", field="prefix")
    new_pad = pad if pad is not None else row["pad"]
    if not 1 <= new_pad <= 10:
        raise DocumentError("prefix_invalid", field="pad")
    new_yearly = yearly_reset if yearly_reset is not None else row["yearly_reset"]
    try:
        await conn.execute(
            "update document_series set prefix = $3, pad = $4, yearly_reset = $5 "
            "where kind = $1 and series_key = $2",
            kind, series_key, new_prefix, new_pad, new_yearly,
        )
    except asyncpg.UniqueViolationError as error:
        raise DocumentError("prefix_taken", 409, field="prefix") from error
    changes = [
        {"field": f, "from": row[f], "to": v}
        for f, v in (("prefix", new_prefix), ("pad", new_pad), ("yearly_reset", new_yearly))
        if row[f] != v
    ]
    if changes:
        await team.record(conn, SUBJECT, await shop_id(conn), "series_changed", actor, None,
                          {"kind": kind, "series": series_key, "changes": changes})
    return next(r for r in await series_rows(conn)
                if r["kind"] == kind and r["series_key"] == series_key)


# ── What the documents read ───────────────────────────────────────────────────────────────


def seller_snapshot(
    row: dict, tenant_name: str, tenant_name_ar: str, branch: dict | None = None
) -> dict:
    """The seller as it is written onto a document at issue: the shop's own details, with
    the name the shop was created under when it has not written its own. A branch that has
    its own address or phone puts them in place of the shop's, and is named."""
    branch = branch if branch and branch["branch_key"] != "main" else None
    snapshot = {
        "name": row["business_name"] or tenant_name,
        "name_ar": row["business_name_ar"] or tenant_name_ar,
        "commercial_registration": row["commercial_registration"],
        "tax_id": row["tax_id"],
        "licence_number": row["licence_number"],
        "address": row["address"],
        "address_ar": row["address_ar"],
        "phone": row["phone"],
        "email": row["email"],
        "logo_sha256": row["logo_sha256"],
        "stamp_sha256": row["stamp_sha256"],
        "registered": bool(row["commercial_registration"]),
    }
    if branch:
        for field in ("address", "address_ar", "phone"):
            if branch[field]:
                snapshot[field] = branch[field]
        snapshot["branch"] = {"key": branch["branch_key"], "name": branch["name"],
                              "name_ar": branch["name_ar"]}
    return snapshot


# ── Branches ──────────────────────────────────────────────────────────────────────────────

_BRANCH = ("select branch_key, name, name_ar, code, address, address_ar, phone, active "
           "from document_branches")


async def branches(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(_BRANCH + " order by (branch_key <> 'main'), created_at")
    if not rows:
        await ensure(conn)
        return await branches(conn)
    return [dict(r) for r in rows]


async def branch_for(conn: asyncpg.Connection, key: str, *, must_be_active: bool) -> dict:
    """One branch of this shop. A draft can only be made for a branch that is switched on."""
    await get(conn)  # the main branch exists once the shop's settings do
    row = await conn.fetchrow(_BRANCH + " where branch_key = $1", key)
    if row is None or (must_be_active and not row["active"]):
        raise DocumentError("branch_unknown", 422, field="branch")
    return dict(row)


async def save_branch(conn: asyncpg.Connection, actor: Actor, key: str, changes: dict) -> dict:
    """Add a branch or change one. The code is chosen once, when the branch is made: it is in
    the prefix of its numbers. A branch is switched off, never deleted."""
    if not re.fullmatch(r"[a-z0-9]{1,12}", key):
        raise DocumentError("branch_unknown", 422, field="branch")
    await ensure(conn)
    existing = await conn.fetchrow(
        "select * from document_branches where branch_key = $1 for update", key)
    fields: dict = {}
    for name, limit in (("name", 80), ("name_ar", 80), ("address", 300), ("address_ar", 300),
                        ("phone", 40)):
        if changes.get(name) is not None:
            text = str(changes[name]).strip()
            if len(text) > limit:
                raise DocumentError("text_too_long", field=name)
            fields[name] = text
    if changes.get("active") is not None:
        fields["active"] = bool(changes["active"])
    if existing is None:
        code = (changes.get("code") or "").strip().upper()
        if key == "main":
            raise DocumentError("branch_main", 422, field="branch")
        if not re.fullmatch(r"[A-Z0-9]{1,4}", code):
            raise DocumentError("code_invalid", 422, field="code")
        try:
            await conn.execute(
                "insert into document_branches (branch_key, code, name, name_ar, address, "
                "address_ar, phone, active) values ($1, $2, $3, $4, $5, $6, $7, $8)",
                key, code, fields.get("name", ""), fields.get("name_ar", ""),
                fields.get("address", ""), fields.get("address_ar", ""), fields.get("phone", ""),
                fields.get("active", True),
            )
            await _series_for(conn, key, code)
        except asyncpg.UniqueViolationError as error:
            raise DocumentError("code_taken", 409, field="code") from error
        action, detail = "branch_added", {"branch": key, "code": code}
    else:
        if changes.get("code") and changes["code"].strip().upper() != existing["code"]:
            raise DocumentError("code_invalid", 422, field="code")
        if key == "main" and fields.get("active") is False:
            raise DocumentError("branch_main", 422, field="active")
        if fields:
            assignments = ", ".join(f"{n} = ${i}" for i, n in enumerate(fields, start=2))
            await conn.execute(f"update document_branches set {assignments} "
                               "where branch_key = $1", key, *fields.values())
        action, detail = "branch_changed", {"branch": key, "fields": sorted(fields)}
    await team.record(conn, SUBJECT, await shop_id(conn), action, actor, None, detail)
    return next(b for b in await branches(conn) if b["branch_key"] == key)

