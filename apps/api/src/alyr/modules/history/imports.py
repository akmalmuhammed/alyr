"""Importing a business's past visits: upload (the dry run), preview, apply, undo (D-197, D-198,
spec 070).

The sales import (`modules/connect/sale_imports.py`) is the model, and so is its habit:

1. **Upload** keeps what was read from the file (it is read once, off the event loop, before a
   transaction is open) and answers with a **preview of every row**: which column is which, what
   each row would make or why it cannot, what already exists, and every problem with its row
   number in English and Arabic. Nothing is written but that preview row. Staff can change the
   mapping and the options and see the preview again.
2. **Apply** carries the preview's hash, so what is applied is exactly what was seen, and writes
   the whole file **in one transaction**. If anything fails, nothing is made.
3. **Undo** takes back the newest applied import whole: its visits, and the clients, services and
   stylists it made that nothing else uses.

What it writes: `services` (switched off: history, not something to book), `booking_resources`
(the stylists, switched off), `contacts` (marked, never reachable until the person writes to the
shop), `bookings` (final states only, marked, with a row key so a file read twice makes one
visit), and an `activity` record for a cancellation the file gives a time for (so the Agent's
"cancelled late" rule has something to count).

What it never writes: a message, a reminder, a review request, a consent record, a job, an event
sent to a shop's own system. `tests/test_history_import.py` counts every one of those tables
before and after.
"""

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from secrets import token_hex
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core.team import Actor
from alyr.modules.bookings import service as bookings_service
from alyr.modules.history import plan
from alyr.modules.history.plan import Problem, Visit
from alyr.modules.history.words import HistoryError
from alyr.modules.items import xlsx
from alyr.modules.items.xlsx import Sheet

SHOWN_ROWS = 50
SHOWN_PROBLEMS = 200
ROWS_PAGE = 200
ARABIC = re.compile(r"[؀-ۿ]")
STATE_ORDER = ("ready", "existing", "duplicate", "problem", "skipped")


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      default=str).encode("utf-8")


def _digest(parts: list[bytes]) -> str:
    h = hashlib.sha256()
    for part in parts:
        h.update(hashlib.sha256(part).digest())
    return h.hexdigest()


async def tenant_of(conn: asyncpg.Connection) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "select id, timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")


async def bookings_on(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval(
        "select exists (select 1 from tenant_modules where module_key = 'bookings' and enabled)"))


def _rows(row: asyncpg.Record) -> tuple[list[list[object]], bool]:
    if row["sheet"] is None:
        raise HistoryError("import_not_found", 404)
    sheet = xlsx.from_stored(row["sheet"])
    return sheet.rows, sheet.truncated


async def _salt(conn: asyncpg.Connection, row: asyncpg.Record) -> bytes:
    """The business's secret for keys: the one its first applied or undone import fixed, else this
    preview's own. The same client keeps the same key across files."""
    first = await conn.fetchval(
        "select key_salt from history_imports where status <> 'preview' "
        "order by created_at, id limit 1")
    return bytes.fromhex(first or row["key_salt"])


def _mapping_and_options(row: asyncpg.Record) -> tuple[dict, dict]:
    return dict(row["mapping"] or {}), dict(row["options"] or {})


# ── the plan: what a file would make against what the business already has ──────────────────


@dataclass
class Plan:
    row: asyncpg.Record
    built: plan.Built
    states: dict[int, str]  # file row -> ready / existing / duplicate / problem / skipped
    make: list[Visit]  # visits to write, in time order
    skipped_problem_rows: int
    counts: dict
    needs_bookings_switch: bool
    already_imported: bool
    salt: bytes


def _norm(text: str) -> str:
    return plan.norm(text)


async def _make_plan(conn: asyncpg.Connection, row: asyncpg.Record) -> Plan:
    rows, truncated = _rows(row)
    mapping, options = _mapping_and_options(row)
    tenant = await tenant_of(conn)
    salt = await _salt(conn, row)
    built = plan.build(rows, mapping, options, tz=tenant["timezone"], salt=salt,
                       now=datetime.now(UTC), truncated=truncated)
    skip = bool(options.get("skip_problem_rows"))
    states: dict[int, str] = {}
    ready: list[Visit] = []
    for result in built.results:
        if result.state == "problem":
            states[result.row] = "skipped" if skip else "problem"
        elif result.state == "duplicate":
            states[result.row] = "duplicate"
        else:
            states[result.row] = "ready"
            ready.append(result.visit)
    # Visits the business already holds from an earlier import: skipped, not made twice.
    held = {r["history_row_key"] for r in await conn.fetch(
        "select history_row_key from bookings where history_row_key = any($1::text[])",
        [v.row_key for v in ready])}
    make = []
    for v in sorted(ready, key=lambda v: (v.start, v.row)):
        if v.row_key in held:
            states[v.row] = "existing"
        else:
            make.append(v)

    keys = sorted({v.client_key for v in make})
    known_by_key = {r["history_key"] for r in await conn.fetch(
        "select history_key from contacts where history_key = any($1::text[])", keys)}
    keep = bool(options.get("keep_personal"))
    phones = sorted({v.phone for v in make if v.phone and v.client_key not in known_by_key})
    known_phones: set[str] = set()
    if keep and phones:
        for r in await conn.fetch(
                "select phone from contacts where phone = any($1::text[]) "
                "or phone = any($2::text[])", phones, ["+" + p for p in phones]):
            known_phones.add(r["phone"].lstrip("+"))
    clients_known = sum(1 for k in keys if k in known_by_key)
    by_key_phone = {v.client_key: v.phone for v in make if v.phone}
    clients_known += sum(1 for k in keys if k not in known_by_key
                         and by_key_phone.get(k) in known_phones)

    have_services = _service_index(await conn.fetch("select id, name, name_ar from services"))
    wanted = {_norm(v.service): v for v in make}
    services_matched = sum(1 for n in wanted if n in have_services)
    have_resources = _service_index(await conn.fetch(
        "select id, name, name_ar from booking_resources"))
    stylists = {_norm(v.stylist) for v in make if v.stylist}
    stylists_matched = sum(1 for n in stylists if n in have_resources)

    by_status: dict[str, int] = {}
    for v in make:
        by_status[v.status] = by_status.get(v.status, 0) + 1
    counts = {
        "rows": built.rows,
        "visits": len(make),
        "existing": sum(1 for s in states.values() if s == "existing"),
        "duplicates": sum(1 for s in states.values() if s == "duplicate"),
        "problems": len(built.problems),
        "skipped": sum(1 for s in states.values() if s == "skipped"),
        "by_status": by_status,
        "clients_new": len(keys) - clients_known,
        "clients_known": clients_known,
        "services_new": len(wanted) - services_matched,
        "services_matched": services_matched,
        "stylists_new": len(stylists) - stylists_matched,
        "stylists_matched": stylists_matched,
        "no_stylist": sum(1 for v in make if not v.stylist),
        "late_cancellation_times": sum(1 for v in make if v.cancelled_at is not None),
    }
    already = bool(await conn.fetchval(
        "select exists (select 1 from history_imports where status = 'applied' "
        "and file_sha256 = $1 and id <> $2)", row["file_sha256"], row["id"]))
    return Plan(row, built, states, make, counts["skipped"], counts,
                not await bookings_on(conn), already, salt)


def _service_index(records) -> dict[str, UUID]:
    """Names (English and Arabic) of what a business already has, to the row's ID."""
    out: dict[str, UUID] = {}
    for r in records:
        for name in (r["name"], r["name_ar"]):
            if name and _norm(name):
                out.setdefault(_norm(name), r["id"])
    return out


def _problem_hash(problems: list[Problem]) -> bytes:
    return canonical([p.as_dict() for p in problems])


def _digest_of(p: Plan) -> str:
    mapping, options = _mapping_and_options(p.row)
    states = [f"{result.row}|{p.states.get(result.row, '')}|"
              f"{result.visit.row_key if result.visit else ''}" for result in p.built.results]
    return _digest([
        p.row["file_sha256"].encode(), canonical(mapping), canonical(options),
        *[s.encode() for s in states], _problem_hash(p.built.problems)])


def _row_listing(p: Plan, tz: str, state: str | None = None, offset: int = 0,
                 limit: int = SHOWN_ROWS) -> list[dict]:
    zone = ZoneInfo(tz)
    keep = bool(p.row["options"].get("keep_personal"))
    out = []
    seen = 0
    for result in p.built.results:
        shown = p.states.get(result.row, "problem")
        if state and shown != state:
            continue
        seen += 1
        if seen <= offset:
            continue
        item: dict = {"row": result.row, "state": shown}
        if result.visit is not None:
            v = result.visit
            local = v.start.astimezone(zone)
            item |= {"date": local.date().isoformat(), "time": local.strftime("%H:%M"),
                     "minutes": v.minutes, "service": v.service,
                     "stylist": v.stylist or None, "status": v.status, "price": v.price,
                     "client": ((v.name or (f"+{v.phone}" if v.phone else ""))
                                if keep else "") or plan.label_of(v.client_key)}
        if result.problems:
            item["problems"] = [x.as_dict() for x in result.problems]
        out.append(item)
        if len(out) >= limit:
            break
    return out


async def _preview(conn: asyncpg.Connection, row: asyncpg.Record) -> dict:
    p = await _make_plan(conn, row)
    return _preview_dict((await tenant_of(conn))["timezone"], p)


def _preview_dict(tz: str, p: Plan) -> dict:
    row = p.row
    rows, _ = _rows(row)
    mapping, options = _mapping_and_options(row)
    missing = plan.missing_required(mapping, options)
    skip = bool(options.get("skip_problem_rows"))
    problems = p.built.problems
    can_apply = (
        row["status"] == "preview" and not p.already_imported and not missing
        and p.counts["visits"] > 0 and (not problems or skip))
    first = min((v.start for v in p.make), default=None)
    last = max((v.start for v in p.make), default=None)
    return {
        "id": str(row["id"]), "filename": row["filename"], "status": row["status"],
        "headers": plan.headers_of(rows), "mapping": mapping, "options": options,
        "columns": [{"key": c.key, "label": c.label.en, "label_ar": c.label.ar,
                     "needed": c.needed} for c in plan.COLUMNS],
        "missing": missing,
        "counts": p.counts,
        "notes": p.built.notes,
        "rows": _row_listing(p, tz),
        "problems": [x.as_dict() for x in problems[:SHOWN_PROBLEMS]],
        "problems_total": len(problems),
        "first_visit": first.isoformat() if first else None,
        "last_visit": last.isoformat() if last else None,
        "needs_bookings_switch": p.needs_bookings_switch,
        "already_imported": p.already_imported,
        "hash": _digest_of(p),
        "can_apply": can_apply,
    }


# ── upload, change, preview ──────────────────────────────────────────────────────────────


async def upload(conn: asyncpg.Connection, actor: Actor, filename: str, data: bytes,
                 max_bytes: int, sheet: Sheet) -> dict:
    """Keep what was read from a file (`sheets.read_table`, which the caller runs off the event
    loop: a file that cannot be read stops there) and preview it. The raw file is not kept."""
    if len(data) > max_bytes:
        raise HistoryError("import_too_big", 413)
    headers = plan.headers_of(sheet.rows)
    mapping = plan.auto_mapping(headers)
    salt = await conn.fetchval(
        "select key_salt from history_imports order by created_at, id limit 1") or token_hex(32)
    row = await conn.fetchrow(
        "insert into history_imports (filename, file_sha256, sheet, mapping, options, key_salt, "
        "actor_id, actor_name) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *",
        (filename or "visits.csv")[:200], hashlib.sha256(data).hexdigest(), xlsx.to_stored(sheet),
        mapping, {}, salt, actor.id, actor.name)
    return await _preview(conn, row)


async def get(conn: asyncpg.Connection, import_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow("select * from history_imports where id = $1 for update", import_id)
    if row is None:
        raise HistoryError("import_not_found", 404)
    return row


async def change(conn: asyncpg.Connection, import_id: UUID, *, mapping: dict | None = None,
                 options: dict | None = None) -> dict:
    """Choose which column is which, or the options, and preview the file again."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise HistoryError("import_not_preview", 409)
    rows, _ = _rows(row)
    headers = plan.headers_of(rows)
    new_mapping = plan.clean_mapping(mapping, headers) if mapping is not None else row["mapping"]
    new_options = plan.clean_options(options) if options is not None else row["options"]
    row = await conn.fetchrow(
        "update history_imports set mapping = $2, options = $3 where id = $1 returning *",
        import_id, new_mapping, new_options)
    return await _preview(conn, row)


async def show(conn: asyncpg.Connection, import_id: UUID) -> dict:
    row = await get(conn, import_id)
    if row["status"] == "preview":
        return await _preview(conn, row)
    return _summary(row)


async def rows(conn: asyncpg.Connection, import_id: UUID, *, state: str | None = None,
               offset: int = 0, limit: int = ROWS_PAGE) -> dict:
    """Every row of a preview, with what it would make or why not, a page at a time."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise HistoryError("import_not_preview", 409)
    p = await _make_plan(conn, row)
    tz = (await tenant_of(conn))["timezone"]
    listing = _row_listing(p, tz, state, max(offset, 0), max(1, min(limit, ROWS_PAGE)))
    total = sum(1 for s in p.states.values() if not state or s == state)
    problem_rows = {x.row for x in p.built.problems}
    for item in listing:
        if item["state"] == "problem" and item["row"] in problem_rows and "problems" not in item:
            item["problems"] = [x.as_dict() for x in p.built.problems if x.row == item["row"]]
    return {"id": str(import_id), "state": state, "offset": offset, "total": total,
            "rows": listing}


# ── apply ────────────────────────────────────────────────────────────────────────────────


def _has_arabic(text: str) -> bool:
    return bool(ARABIC.search(text))


async def _ready(conn: asyncpg.Connection, row: asyncpg.Record, preview_hash: str,
                 bookings_switched: bool) -> Plan:
    """The plan for this preview, once every reason to refuse has been checked."""
    p = await _make_plan(conn, row)
    if _digest_of(p) != preview_hash:
        raise HistoryError("import_changed", 409)
    if p.already_imported:
        raise HistoryError("already_imported", 409)
    if p.needs_bookings_switch and not bookings_switched:
        raise HistoryError("bookings_off", 409)
    mapping, options = _mapping_and_options(row)
    if plan.missing_required(mapping, options) or (
            p.built.problems and not options.get("skip_problem_rows")):
        raise HistoryError("import_has_problems", 409, problems=[
            x.as_dict() for x in p.built.problems[:SHOWN_PROBLEMS]])
    if not p.make:
        raise HistoryError("import_empty", 422)
    return p


async def check_apply(conn: asyncpg.Connection, import_id: UUID, preview_hash: str,
                      *, bookings_switched: bool = False) -> None:
    """Everything `apply` would refuse for, without writing anything: so a caller can switch
    Bookings on for the import only once the import is certain to go through."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise HistoryError("import_not_preview", 409)
    await _ready(conn, row, preview_hash, bookings_switched)


async def apply(conn: asyncpg.Connection, actor: Actor, import_id: UUID, preview_hash: str,
                *, bookings_switched: bool = False) -> dict:
    """Make every visit in the file, in one transaction, exactly as previewed. `bookings_switched`
    says staff have switched Bookings on for this business as part of this import."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise HistoryError("import_not_preview", 409)
    tenant = await tenant_of(conn)
    # One import and one booking being made at a time per business: numbers and keys are taken
    # in turn, and a file applied twice at once makes its visits once.
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"history:{tenant['id']}")
    await bookings_service.lock(conn, tenant["id"])
    p = await _ready(conn, row, preview_hash, bookings_switched)
    _, options = _mapping_and_options(row)

    made = await _write(conn, p, import_id, options)

    first = min(v.start for v in p.make).astimezone(ZoneInfo(tenant["timezone"])).date()
    last = max(v.start for v in p.make).astimezone(ZoneInfo(tenant["timezone"])).date()
    today = datetime.now(UTC).astimezone(ZoneInfo(tenant["timezone"])).date()
    # The day the file was cut cannot be after today.
    exported = min(date.fromisoformat(options["exported_on"]), today) if options.get(
        "exported_on") else today
    summary = {"counts": {**p.counts, **made}, "notes": [n["code"] for n in p.built.notes]}
    row = await conn.fetchrow(
        "update history_imports set status = 'applied', sheet = null, summary = $2, "
        "key_salt = $3, source = $4, exported_on = $5, first_visit_on = $6, last_visit_on = $7, "
        "applied_at = now() where id = $1 returning *",
        import_id, summary, p.salt.hex(), options.get("source", ""), exported, first, last)
    return _summary(row)


async def _write(conn: asyncpg.Connection, p: Plan, import_id: UUID, options: dict) -> dict:
    """The rows. Services and stylists first, then the clients, then the visits."""
    keep = bool(options.get("keep_personal"))
    make = p.make
    default_minutes = options.get("default_minutes", plan.DEFAULT_MINUTES)

    # ── services: what the business already has by name, else one switched off ──
    services = _service_index(await conn.fetch("select id, name, name_ar from services"))
    made_services = 0
    last_of: dict[str, Visit] = {}
    price_of: dict[str, int] = {}
    for v in make:  # time order, so the last one seen is the newest
        last_of[_norm(v.service)] = v
        if v.price:
            price_of[_norm(v.service)] = v.price
    for key, v in last_of.items():
        if key in services:
            continue
        name_ar = v.service_ar or (v.service if _has_arabic(v.service) else "")
        services[key] = await conn.fetchval(
            "insert into services (name, name_ar, duration_minutes, price, active, sort, "
            "history_import_id) values ($1, $2, $3, $4, false, 0, $5) returning id",
            v.service, name_ar[:120], v.minutes or default_minutes, price_of.get(key, 0),
            import_id)
        made_services += 1
        if v.service_ar and _norm(v.service_ar):
            services.setdefault(_norm(v.service_ar), services[key])

    # ── stylists, when the file names them ──
    resources = _service_index(await conn.fetch("select id, name, name_ar from booking_resources"))
    made_resources = 0
    for v in make:
        key = _norm(v.stylist) if v.stylist else ""
        if not key or key in resources:
            continue
        resources[key] = await conn.fetchval(
            "insert into booking_resources (name, name_ar, kind, active, sort, history_import_id) "
            "values ($1, $2, 'person', false, "
            "(select coalesce(max(sort), 0) + 1 from booking_resources), $3) returning id",
            v.stylist, v.stylist if _has_arabic(v.stylist) else "", import_id)
        made_resources += 1

    # ── clients ──
    by_client: dict[str, list[Visit]] = {}
    for v in make:
        by_client.setdefault(v.client_key, []).append(v)
    contacts: dict[str, UUID] = {r["history_key"]: r["id"] for r in await conn.fetch(
        "select id, history_key from contacts where history_key = any($1::text[])",
        list(by_client))}
    native: dict[str, UUID] = {}
    if keep:
        phones = sorted({v.phone for v in make if v.phone})
        for r in await conn.fetch(
                "select id, phone from contacts where phone = any($1::text[]) "
                "or phone = any($2::text[])", phones, ["+" + x for x in phones]):
            native[r["phone"].lstrip("+")] = r["id"]
        used_phones = set(native)
    else:
        used_phones = set()
    made_contacts = 0
    for key, visits in by_client.items():
        if key in contacts:
            continue
        phone = next((v.phone for v in visits if v.phone), "")
        if keep and phone and phone in native:
            contacts[key] = native[phone]
            continue
        # The first visit the person came to (a cancelled one is not a visit), else the first row.
        came = [v for v in visits if v.status != "cancelled"] or visits
        first = min(v.start for v in came)
        name = next((v.name for v in visits if v.name), "")
        if not keep:
            name, phone = plan.label_of(key), ""
        elif not name:
            name = f"+{phone}" if phone else plan.label_of(key)
        if phone and phone in used_phones:
            phone = ""  # two clients in the file share a number (a family): the first keeps it
        if phone:
            used_phones.add(phone)
        lang = "ar" if keep and _has_arabic(name) else "en"
        contacts[key] = await conn.fetchval(
            "insert into contacts (phone, name, lang, created_at, history_import_id, history_key) "
            "values ($1, $2, $3, $4, $5, $6) returning id",
            phone or None, name[:120], lang, first, import_id, key)
        made_contacts += 1

    # ── the visits ──
    base = await conn.fetchval("select coalesce(max(number), 100) from bookings")
    now = datetime.now(UTC)
    records, activity = [], []
    for offset, v in enumerate(make, start=1):
        booking_id = uuid4()
        created = min(v.booked_at or v.start, v.start, now)
        records.append((
            booking_id, base + offset, contacts[v.client_key], services[_norm(v.service)],
            v.service, v.start, v.end, v.status, created,
            resources.get(_norm(v.stylist)) if v.stylist else None, v.price or 0,
            import_id, v.row_key))
        if v.status == "cancelled" and v.cancelled_at is not None and v.cancelled_at <= now:
            activity.append((booking_id, contacts[v.client_key], base + offset, v.cancelled_at))
    await conn.executemany(
        "insert into bookings (id, number, contact_id, service_id, service_name, starts_at, "
        "ends_at, status, created_at, resource_id, price, history_import_id, history_row_key) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)", records)
    if activity:
        await conn.executemany(
            "insert into activity (subject, subject_id, contact_id, action, detail, actor_name, "
            "channel, created_at) values ('booking', $1, $2, 'cancelled', $3, 'Import', "
            "'system', $4)",
            [(b, c, {"number": n, "imported": True}, at) for b, c, n, at in activity])
    return {"visits_made": len(records), "clients_made": made_contacts,
            "services_made": made_services, "stylists_made": made_resources,
            "cancellations_recorded": len(activity)}


# ── undo ─────────────────────────────────────────────────────────────────────────────────


async def undo(conn: asyncpg.Connection, actor: Actor, import_id: UUID | None = None) -> dict:
    """Take back the newest applied import: its visits, and the clients, services and stylists it
    made that nothing else uses. A client who has since written to the shop, or a service or
    stylist something else points at, stays and is no longer marked as the import's. Refused when
    a receipt, invoice or payment was recorded against one of its visits."""
    latest = await conn.fetchrow(
        "select * from history_imports where status = 'applied' "
        "order by applied_at desc, id desc limit 1 for update")
    if latest is None:
        raise HistoryError("nothing_to_undo", 404)
    if import_id is not None and latest["id"] != import_id:
        raise HistoryError("not_newest", 409)
    tenant = await tenant_of(conn)
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"history:{tenant['id']}")
    await bookings_service.lock(conn, tenant["id"])
    ids = [r["id"] for r in await conn.fetch(
        "select id from bookings where history_import_id = $1", latest["id"])]
    if ids and await conn.fetchval(
            "select exists (select 1 from manual_payments where subject = 'booking' "
            "and subject_id = any($1::uuid[])) or exists (select 1 from documents "
            "where source = 'booking' and source_ref = any($2::text[]))",
            ids, [str(i) for i in ids]):
        raise HistoryError("not_undoable", 409)
    removed = await conn.fetchval(
        "with gone as (delete from bookings where history_import_id = $1 returning 1) "
        "select count(*) from gone", latest["id"])
    kept = {"clients": 0, "services": 0, "stylists": 0}
    gone = {"clients": 0, "services": 0, "stylists": 0}

    # A client nobody has written to, with no other record, goes. One with anything else stays.
    deleted = await conn.fetchval(
        "with gone as (delete from contacts c where c.history_import_id = $1 "
        "  and c.last_inbound_at is null "
        "  and not exists (select 1 from bookings b where b.contact_id = c.id) "
        "  and not exists (select 1 from messages m where m.contact_id = c.id) "
        "  and not exists (select 1 from orders o where o.contact_id = c.id) "
        "  and not exists (select 1 from ledger_entries l where l.contact_id = c.id) "
        "  and not exists (select 1 from payment_requests p where p.contact_id = c.id) "
        "  returning 1) select count(*) from gone", latest["id"])
    gone["clients"] = deleted
    kept["clients"] = await conn.fetchval(
        "with moved as (update contacts set history_import_id = null where history_import_id = $1 "
        "returning 1) select count(*) from moved", latest["id"])

    deleted = await conn.fetchval(
        "with gone as (delete from services s where s.history_import_id = $1 "
        "  and not exists (select 1 from bookings b where b.service_id = s.id) "
        "  returning 1) select count(*) from gone", latest["id"])
    gone["services"] = deleted
    kept["services"] = await conn.fetchval(
        "with moved as (update services set history_import_id = null where history_import_id = $1 "
        "returning 1) select count(*) from moved", latest["id"])

    deleted = await conn.fetchval(
        "with gone as (delete from booking_resources r where r.history_import_id = $1 "
        "  and not exists (select 1 from bookings b where b.resource_id = r.id) "
        "  returning 1) select count(*) from gone", latest["id"])
    gone["stylists"] = deleted
    kept["stylists"] = await conn.fetchval(
        "with moved as (update booking_resources set history_import_id = null "
        "where history_import_id = $1 returning 1) select count(*) from moved", latest["id"])

    summary = {**(latest["summary"] or {}), "undone": {
        "visits": removed, "removed": gone, "kept": kept}}
    row = await conn.fetchrow(
        "update history_imports set status = 'undone', undone_at = now(), undone_by = $2, "
        "summary = $3 where id = $1 returning *", latest["id"], actor.name, summary)
    return {**_summary(row), "visits_removed": removed, "removed": gone, "kept": kept}


# ── history, the "data from" fact, and discarding a preview ──────────────────────────────


def _summary(row: asyncpg.Record) -> dict:
    def when(value):
        return value.isoformat() if value else None

    return {
        "id": str(row["id"]), "filename": row["filename"], "status": row["status"],
        "source": row["source"], "created_at": when(row["created_at"]),
        "applied_at": when(row["applied_at"]), "undone_at": when(row["undone_at"]),
        "actor": row["actor_name"], "undone_by": row["undone_by"],
        "exported_on": when(row["exported_on"]), "first_visit_on": when(row["first_visit_on"]),
        "last_visit_on": when(row["last_visit_on"]),
        "options": row["options"] or {},
        "counts": (row["summary"] or {}).get("counts", {}),
        "undone": (row["summary"] or {}).get("undone"),
    }


async def history(conn: asyncpg.Connection, limit: int = 20) -> dict:
    rows_ = await conn.fetch(
        "select * from history_imports order by coalesce(applied_at, created_at) desc, id limit $1",
        limit)
    newest = next((r["id"] for r in rows_ if r["status"] == "applied"), None)
    return {"imports": [{**_summary(r), "can_undo": r["id"] == newest} for r in rows_]}


async def data_from(conn: asyncpg.Connection) -> dict | None:
    """Where this business's numbers come from, for the dashboard to say: the export of the newest
    applied import (the day it was cut, what it is, and the first and last visit it holds), with
    the earliest first visit and latest last visit across every applied import still in force.
    None when no import is applied."""
    row = await conn.fetchrow(
        "select (select source from history_imports where status = 'applied' "
        "        order by applied_at desc, id desc limit 1) as source, "
        "       (select exported_on from history_imports where status = 'applied' "
        "        order by applied_at desc, id desc limit 1) as exported_on, "
        "       min(first_visit_on) as first_visit_on, max(last_visit_on) as last_visit_on, "
        "       count(*) as imports "
        "from history_imports where status = 'applied'")
    if not row or not row["imports"]:
        return None
    return {"source": row["source"], "exported_on": row["exported_on"].isoformat(),
            "first_visit_on": row["first_visit_on"].isoformat(),
            "last_visit_on": row["last_visit_on"].isoformat(), "imports": row["imports"]}


async def discard(conn: asyncpg.Connection, import_id: UUID) -> None:
    """Drop a preview nobody applied."""
    row = await get(conn, import_id)
    if row["status"] != "preview":
        raise HistoryError("import_not_preview", 409)
    await conn.execute("delete from history_imports where id = $1", import_id)
