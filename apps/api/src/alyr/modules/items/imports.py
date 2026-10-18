"""Importing a spreadsheet: keep the upload, preview it, apply it once, undo it once
(D-039, ALY-108).

The shape is the bulk actions' (`bulk.py`): the owner sees exactly what will happen, then
applies it carrying the preview's hash, and the newest import can be undone once.

* **Upload** reads the file, builds the plan and stores the file (not before: a file that
  cannot be read stores nothing). The row is `preview`.
* **Preview** is the plan again, from the stored file and the shop as it is now.
* **Apply** builds the plan once more and refuses (`changed_since_preview`) if it is not the
  one the owner saw. Then, in one transaction, it adds and updates every item the plan says
  and writes the stock numbers into the stock log as an opening count or a count with the
  reason "Import". A row that was left out in the preview stays out. If anything unexpected
  fails, the whole import is rolled back: it is never half done.
* **Undo** puts the newest applied import back: items it added are removed (or archived if
  they have since been ordered), items it changed get their old values and stock back, and
  anything edited since is left alone and named.

Every function takes a tenant-scoped connection.
"""

from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr.core import jobs, team
from alyr.core.images import PhotoRefused
from alyr.core.media import MediaService
from alyr.core.team import Actor
from alyr.modules.items import (
    import_photos,
    import_plan,
    service,
    sheets,
    stock,
)
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.import_plan import Plan, Snapshot
from alyr.modules.items.xlsx import SheetError

Refused = SheetError  # a request that cannot be carried out: code, English, Arabic, status

DUPLICATE_MODES = import_plan.DUPLICATE_MODES
PREVIEW_KEEP_HOURS = 24
PREVIEW_MAX = 10
PROBLEMS_SHOWN = 300

# Words for the ways an upload can be refused (the file itself: `xlsx.py`, `sheets.py`).
REFUSALS = {
    "no_header": (
        "ALYR could not find the column names. The first row needs at least a Name column. "
        "Download the template to see the columns.",
        "لم يجد ALYR أسماء الأعمدة. يحتاج الصف الأول إلى عمود «الاسم» على الأقل. نزّل النموذج "
        "لترى الأعمدة.",
    ),
    "no_items": (
        "The file has column names but no items under them.",
        "الملف فيه أسماء الأعمدة لكن بلا أصناف تحتها.",
    ),
    "too_many_rows": (
        f"This file has more than {import_plan.MAX_DATA_ROWS:,} rows. Split it into files of "
        f"{import_plan.MAX_DATA_ROWS:,} rows or fewer.",
        f"في هذا الملف أكثر من {import_plan.MAX_DATA_ROWS:,} صف. قسّمه إلى ملفات لا يزيد كل منها "
        f"على {import_plan.MAX_DATA_ROWS:,} صف.",
    ),
}


def _refusal(code: str, status: int = 422) -> Refused:
    english, arabic = REFUSALS[code]
    return Refused(code, english, arabic, status)


def _gone() -> Refused:
    return Refused(
        "import_not_found", "That import is no longer there.", "هذا الاستيراد لم يعد موجوداً.",
        404,
    )


# ── reading the shop and building the plan ────────────────

async def snapshot(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID
) -> Snapshot:
    entries = await service.load(conn, clock)
    used = sum(1 for e in entries if e.item["status"] != "archived")
    limit = media.settings.catalog_max_items
    assets = {
        r["source_sha256"]: r["id"]
        for r in await conn.fetch(
            "select source_sha256, id from media_assets where state <> 'removed'"
        )
    }
    attached: dict[UUID, set[UUID]] = {}
    for r in await conn.fetch(
        "select owner_id, asset_id from media_links where owner_kind = 'item'"
    ):
        attached.setdefault(r["owner_id"], set()).add(r["asset_id"])
    return Snapshot(
        tenant_id, clock.tz, entries, [c["name"] for c in await service.categories(conn)],
        limit, max(limit - used, 0), assets, attached,
    )


async def _plan(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    data: bytes, filename: str, options: dict, zip_data: bytes | None, zip_name: str | None,
) -> tuple[Plan, str]:
    kind, sheet = sheets.read_table(data, filename)
    zip_view = (
        import_photos.index(zip_data, media.settings.media_max_upload_bytes) if zip_data else None
    )
    label = {"name": zip_name, "bytes": len(zip_data)} if zip_data else None
    try:
        plan = import_plan.build(
            sheet, options, await snapshot(conn, media, clock, tenant_id), zip_view, label
        )
    except ValueError as error:
        raise _refusal(str(error)) from error
    return plan, kind


def _check_mode(mode: str) -> str:
    if mode not in DUPLICATE_MODES:
        raise Refused(
            "bad_option", "Choose what to do with names that already exist.",
            "اختر ما يُفعل بالأسماء الموجودة بالفعل.",
        )
    return mode


# ── the upload and its preview ────────────────────────────

def _by(row: asyncpg.Record) -> dict:
    return {"id": str(row["actor_id"]) if row["actor_id"] else None, "name": row["actor_name"]}


def _zip_info(row: asyncpg.Record) -> dict | None:
    return {"name": row["zip_name"]} if row["zip_name"] else None


def preview_view(row: asyncpg.Record, plan: Plan) -> dict:
    return {
        "id": str(row["id"]), "status": "preview", "filename": row["filename"],
        "kind": row["kind"], "zip": _zip_info(row), "at": row["created_at"].isoformat(),
        "by": _by(row), **plan.view(),
    }


async def _tidy(conn: asyncpg.Connection) -> None:
    """Previews nobody applied are not kept for long, and not more than a few."""
    await conn.execute(
        "delete from item_imports where status = 'preview' and created_at < "
        "now() - make_interval(hours => $1)", PREVIEW_KEEP_HOURS,
    )
    await conn.execute(
        "delete from item_imports where status = 'preview' and id in ("
        "select id from item_imports where status = 'preview' "
        "order by created_at desc offset $1)", PREVIEW_MAX - 1,
    )


async def start(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    actor: Actor, data: bytes, filename: str, on_duplicate: str,
) -> dict:
    """Read an uploaded sheet and keep it for the owner to look at. Raises `Refused` (and
    stores nothing) for a file that cannot be used."""
    options = {"on_duplicate": _check_mode(on_duplicate)}
    plan, kind = await _plan(conn, media, clock, tenant_id, data, filename, options, None, None)
    await _tidy(conn)
    row = await conn.fetchrow(
        "insert into item_imports (filename, kind, file, options, actor_id, actor_name) "
        "values ($1, $2, $3, $4, $5, $6) returning *",
        filename[:200] or "items", kind, data, options, actor.id, actor.name,
    )
    return preview_view(row, plan)


async def _row(conn: asyncpg.Connection, import_id: UUID, lock: bool = False) -> asyncpg.Record:
    row = await conn.fetchrow(
        "select * from item_imports where id = $1" + (" for update" if lock else ""), import_id
    )
    if row is None:
        raise _gone()
    return row


async def _row_plan(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    row: asyncpg.Record,
) -> Plan:
    if row["status"] != "preview" or row["file"] is None:
        raise Refused(
            "already_applied", "This import has already been done.",
            "تم هذا الاستيراد بالفعل.", 409,
        )
    plan, _kind = await _plan(
        conn, media, clock, tenant_id, row["file"], row["filename"], dict(row["options"]),
        row["zip"], row["zip_name"],
    )
    return plan


async def preview(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    import_id: UUID,
) -> dict:
    row = await _row(conn, import_id)
    if row["status"] != "preview":
        return await result_view(conn, row)
    return preview_view(row, await _row_plan(conn, media, clock, tenant_id, row))


async def set_options(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    import_id: UUID, on_duplicate: str,
) -> dict:
    row = await _row(conn, import_id, lock=True)
    options = {**row["options"], "on_duplicate": _check_mode(on_duplicate)}
    row = await conn.fetchrow(
        "update item_imports set options = $2 where id = $1 and status = 'preview' returning *",
        import_id, options,
    ) or row
    return preview_view(row, await _row_plan(conn, media, clock, tenant_id, row))


async def set_zip(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    import_id: UUID, data: bytes | None, name: str,
) -> dict:
    """Add (or, with no data, take away) the zip of photos for a preview. A zip that cannot
    be read is refused and the preview keeps whatever it had."""
    row = await _row(conn, import_id, lock=True)
    if data:
        import_photos.index(data, media.settings.media_max_upload_bytes)  # raises if unusable
    row = await conn.fetchrow(
        "update item_imports set zip = $2, zip_name = $3 where id = $1 and status = 'preview' "
        "returning *", import_id, data or None, (name[:200] or "photos.zip") if data else None,
    ) or row
    return preview_view(row, await _row_plan(conn, media, clock, tenant_id, row))


async def discard(conn: asyncpg.Connection, import_id: UUID) -> None:
    done = await conn.execute(
        "delete from item_imports where id = $1 and status = 'preview'", import_id
    )
    if done != "DELETE 1":
        raise _gone()


# ── applying ──────────────────────────────────────────────

_ITEM_FIELDS = (
    "name", "name_ar", "description", "description_ar", "category", "price", "sale_price",
    "sale_starts_at", "sale_ends_at", "unit", "pack_size", "min_order", "tags", "stock_rule",
    "available", "status",
)
_VARIANT_FIELDS = ("name", "name_ar", "price_delta", "daily_limit", "active")


def _ser(value: object) -> object:
    """A value as the undo record keeps it."""
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, list | tuple):
        return [_ser(v) for v in value]
    return value


def _deser(key: str, value: object) -> object:
    if key in ("sale_starts_at", "sale_ends_at") and isinstance(value, str):
        return datetime.fromisoformat(value)
    return value


def _item_state(entry: service.Loaded, keys) -> dict:
    return {k: _ser(entry.item[k]) for k in keys}


def _variant_state(entry: service.Loaded) -> list[dict]:
    return [
        {"id": str(v["id"]), **{k: _ser(v[k]) for k in _VARIANT_FIELDS}} for v in entry.variants
    ]


async def _opening(conn, vid, n: int, actor: Actor) -> None:
    if n > 0:
        await stock.move(conn, vid, "opening", n, actor, "Import")


async def _create(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, actor: Actor,
    item: import_plan.ItemPlan, order: int,
) -> dict:
    data = {k: v for k, v in item.data.items()}
    data["sort"] = order
    named = len(item.variants) > 1 or bool(item.variants and item.variants[0].name)
    if named:
        data["variants"] = [
            {"name": v.name, "name_ar": v.name_ar, "price_delta": v.price_diff or 0,
             "daily_limit": v.per_day, "active": True}
            for v in item.variants
        ]
    elif item.variants and item.variants[0].per_day is not None:
        data["daily_limit"] = item.variants[0].per_day
    await media.assert_can_add_item(conn)
    made = (await service.create_item(conn, data, actor, clock))["item"]
    item_id = UUID(made["id"])
    moved = []
    for op in item.variants:
        if not op.stock:
            continue
        variant = next(
            (v for v in made["variants"] if (v["name"] == op.name if named else True)), None
        )
        if variant is not None:
            await _opening(conn, UUID(variant["id"]), op.stock, actor)
            moved.append({"variant_id": variant["id"], "variant": op.name, "after": op.stock})
    entry = await service.get(conn, clock, item_id)
    return {
        "op": "create", "id": str(item_id), "name": item.name, "name_ar": item.name_ar,
        "after": _item_state(entry, _ITEM_FIELDS), "variants_after": _variant_state(entry),
        "stock": moved,
    }


async def _update(
    conn: asyncpg.Connection, clock: ShopClock, actor: Actor, item: import_plan.ItemPlan
) -> dict:
    entry = await service.get(conn, clock, item.target)
    if entry is None:
        raise service.ItemError("gone", "The item is no longer there.")
    changes = dict(item.data)
    keys = set(changes)
    if "sale_price" in changes and changes["sale_price"] is None:
        keys |= {"sale_starts_at", "sale_ends_at"}
    before = _item_state(entry, keys)
    variants_before = _variant_state(entry)
    active = [v for v in entry.variants if v["active"]]
    by_name = {
        import_plan._squash(v["name"] or v["name_ar"]): v
        for v in active if v["name"] or v["name_ar"]
    }

    touched: dict[UUID, dict] = {}
    fresh: list[import_plan.VariantOp] = []
    stock_ops: list[tuple[UUID | None, str, int]] = []  # (existing id, name, number)
    for op in item.variants:
        existing = (
            by_name.get(import_plan._squash(op.name)) if op.name
            else (active[0] if len(active) == 1 else None)
        )
        if existing is None:
            fresh.append(op)
            if op.stock is not None:
                stock_ops.append((None, op.name, op.stock))
            continue
        change: dict = {}
        if op.price_diff is not None and op.price_diff != existing["price_delta"]:
            change["price_delta"] = op.price_diff
        if op.per_day is not None and op.per_day != existing["daily_limit"]:
            change["daily_limit"] = op.per_day
        if op.name_ar and op.name_ar != existing["name_ar"]:
            change["name_ar"] = op.name_ar
        if change:
            touched[existing["id"]] = {**touched.get(existing["id"], {}), **change}
        if op.stock is not None:
            stock_ops.append((existing["id"], op.name, op.stock))

    if touched or fresh:
        default_only = len(entry.variants) == 1 and entry.variants[0]["is_default"]
        new_inputs = [
            {"name": op.name, "name_ar": op.name_ar, "price_delta": op.price_diff or 0,
             "daily_limit": op.per_day, "active": True}
            for op in fresh
        ]
        if default_only and fresh and not touched:
            changes["variants"] = new_inputs  # the first takes over the item's own variant
        else:
            changes["variants"] = [
                {"id": str(v["id"]), "name": v["name"],
                 "name_ar": touched.get(v["id"], {}).get("name_ar", v["name_ar"]),
                 "price_delta": touched.get(v["id"], {}).get("price_delta", v["price_delta"]),
                 "daily_limit": touched.get(v["id"], {}).get("daily_limit", v["daily_limit"]),
                 "active": v["active"]}
                for v in entry.variants
            ] + new_inputs
    if changes:
        await service.update_item(conn, item.target, changes, actor, clock, reason="Import")
    after_entry = await service.get(conn, clock, item.target)
    moved = []
    before_ids = {v["id"] for v in entry.variants}
    for vid, name, number in stock_ops:
        if vid is None:
            found = next(
                (v for v in after_entry.variants
                 if v["active"] and import_plan._squash(v["name"] or v["name_ar"])
                 == import_plan._squash(name)), None,
            )
            if found is None:
                continue
            vid = found["id"]
        existed = vid in before_ids
        was = await stock.left(conn, vid)
        if existed:
            if was != number:
                await stock.count(conn, vid, number, actor, "Import")
                moved.append({"variant_id": str(vid), "variant": name, "before": was,
                              "after": number, "kind": "counted"})
        elif number > 0:
            await _opening(conn, vid, number, actor)
            moved.append({"variant_id": str(vid), "variant": name, "before": 0,
                          "after": number, "kind": "opening"})
    record = {
        "op": "update", "id": str(item.target), "name": item.name, "name_ar": item.name_ar,
        "before": before, "after": _item_state(after_entry, keys), "stock": moved,
    }
    if "variants" in changes:
        record["variants_before"] = variants_before
        record["variants_after"] = _variant_state(after_entry)
    return record


def _problems(plan: Plan) -> list[dict]:
    """The rows with something to read after the import: those left out, and those with a
    warning."""
    out = []
    for item in plan.items:
        shown = [
            n for n in item.view()["issues"] if n["level"] in ("error", "warning")
        ]
        if shown or item.action == "error":
            out.append({
                "row": item.rows[0], "rows": item.rows, "name": item.name,
                "name_ar": item.name_ar, "action": item.action, "issues": shown,
            })
    return out[:PROBLEMS_SHOWN]


async def apply(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    actor: Actor, import_id: UUID, expected: str,
) -> dict:
    """Do what the preview showed. Raises `Refused` if the plan is not the one the owner
    saw, or if anything cannot be done; in that case nothing at all has been changed."""
    row = await _row(conn, import_id, lock=True)
    plan = await _row_plan(conn, media, clock, tenant_id, row)
    if plan.hash != expected:
        raise Refused(
            "changed_since_preview",
            "Something changed since you looked. Review the preview again.",
            "تغيّر شيء منذ المعاينة. راجع المعاينة مرة أخرى.", 409,
        )
    todo = plan.actionable()
    if not todo:
        raise Refused(
            "nothing_to_import", "There is nothing in this file to import.",
            "لا يوجد في هذا الملف ما يُستورد.",
        )
    changes, steps = [], []
    order = 0
    for item in todo:
        try:
            if item.action == "create":
                order += 1
                record = await _create(conn, media, clock, actor, item, order)
            else:
                record = await _update(conn, clock, actor, item)
        except (service.ItemError, stock.StockError, PhotoRefused) as error:
            ar = getattr(error, "ar", "")
            raise Refused(
                "import_failed",
                f"Row {item.rows[0]} (“{item.name}”) could not be imported: {error} Nothing "
                "was changed.",
                f"تعذّر استيراد الصف {item.rows[0]} («{item.name_ar or item.name}»): "
                f"{ar or 'حدث خطأ'}. لم يتغيّر شيء.", 409,
            ) from error
        changes.append(record)
        if item.photos:
            steps.append({"item_id": record["id"], "refs": item.photos, "name": item.name})

    counts = plan.counts()
    summary = {"counts": counts, "problems": _problems(plan), "zip": plan.photos}
    uses_zip = any("zip" in r for s in steps for r in s["refs"])
    photos = import_photos.initial_progress(steps) if steps else {}
    await conn.execute(
        "update item_imports set status = 'applied', applied_at = now(), file = null, "
        "summary = $2, changes = $3, photos = $4, zip = case when $5 then zip else null end, "
        "actor_id = $6, actor_name = $7 where id = $1",
        import_id, summary, changes, photos, uses_zip, actor.id, actor.name,
    )
    await team.record(
        conn, "item", import_id, "import_applied", actor, None,
        {"filename": row["filename"], "created": counts["create"], "updated": counts["update"],
         "stock": counts["stock_moves"], "skipped": counts["error"] + counts["skip"]},
    )
    if steps:
        await jobs.enqueue(conn, import_photos.JOB, {"import_id": str(import_id)})
    return await result_view(conn, await _row(conn, import_id))


# ── what was done ─────────────────────────────────────────

async def _undoable(conn: asyncpg.Connection) -> UUID | None:
    """The import that Undo would put back: the newest one applied or undone, if it is still
    applied."""
    row = await conn.fetchrow(
        "select id, status from item_imports where status in ('applied', 'undone') "
        "order by coalesce(undone_at, applied_at) desc, created_at desc limit 1"
    )
    return row["id"] if row and row["status"] == "applied" else None


async def result_view(conn: asyncpg.Connection, row: asyncpg.Record) -> dict:
    photos = row["photos"] or {}
    return {
        "id": str(row["id"]), "status": row["status"], "filename": row["filename"],
        "kind": row["kind"], "by": _by(row),
        "at": (row["applied_at"] or row["created_at"]).isoformat(),
        "undone_at": row["undone_at"].isoformat() if row["undone_at"] else None,
        "undone_by": row["undone_by"],
        "summary": row["summary"],
        "photos": {
            "state": photos.get("state"), "total": photos.get("total", 0),
            "done": photos.get("done", 0), "failed": photos.get("failed", []),
        } if photos else None,
        "can_undo": row["status"] == "applied" and (await _undoable(conn)) == row["id"],
    }


async def get(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, tenant_id: UUID,
    import_id: UUID,
) -> dict:
    row = await _row(conn, import_id)
    if row["status"] == "preview":
        return preview_view(row, await _row_plan(conn, media, clock, tenant_id, row))
    return await result_view(conn, row)


async def last(conn: asyncpg.Connection) -> dict | None:
    """The newest import, if it can still be undone."""
    found = await _undoable(conn)
    return await result_view(conn, await _row(conn, found)) if found else None


async def recent(conn: asyncpg.Connection, limit: int = 8) -> list[dict]:
    rows = await conn.fetch(
        "select * from item_imports where status in ('applied', 'undone') "
        "order by coalesce(undone_at, applied_at) desc, created_at desc limit $1", limit,
    )
    newest = await _undoable(conn)
    out = []
    for r in rows:
        counts = (r["summary"] or {}).get("counts", {})
        out.append({
            "id": str(r["id"]), "status": r["status"], "filename": r["filename"],
            "by": _by(r), "at": (r["applied_at"] or r["created_at"]).isoformat(),
            "created": counts.get("create", 0), "updated": counts.get("update", 0),
            "skipped": counts.get("error", 0) + counts.get("skip", 0),
            "undone_at": r["undone_at"].isoformat() if r["undone_at"] else None,
            "undone_by": r["undone_by"], "can_undo": r["id"] == newest,
        })
    return out


# ── undo ──────────────────────────────────────────────────

LEFT = {
    "changed_since": (
        "It was changed after the import, so it was left as it is now.",
        "تغيّر بعد الاستيراد، لذلك تُرك كما هو الآن.",
    ),
    "gone": ("It no longer exists.", "لم يعد موجوداً."),
    "failed": ("It could not be put back.", "تعذّرت إعادته."),
    "kept": (
        "It has been ordered since, so it was archived instead of removed.",
        "طُلب بعد الاستيراد، لذلك أُرشف بدلاً من حذفه.",
    ),
}


def _left(change: dict, code: str) -> dict:
    en, ar = LEFT[code]
    return {"id": change["id"], "name": change["name"], "name_ar": change["name_ar"],
            "code": code, "message": en, "message_ar": ar}


async def _undo_created(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, actor: Actor,
    change: dict,
) -> str:
    """"removed", "archived" or a reason it was left."""
    item_id = UUID(change["id"])
    entry = await service.get(conn, clock, item_id)
    if entry is None:
        return "gone"
    if _item_state(entry, _ITEM_FIELDS) != change["after"] or _variant_state(
        entry
    ) != change["variants_after"]:
        return "changed_since"
    ordered = await conn.fetchval(
        "select exists (select 1 from order_items where item_id = $1)", item_id
    )
    other = await conn.fetchval(
        "select count(*) from stock_movements m join item_variants v on v.id = m.variant_id "
        "where v.item_id = $1 and not (m.kind = 'opening' and m.reason = 'Import')", item_id,
    )
    prices = await conn.fetchval(
        "select count(*) from item_price_history where item_id = $1", item_id
    )
    if ordered or other or prices > 1:
        await conn.execute(
            "update items set status = 'archived', updated_at = now() where id = $1", item_id
        )
        await team.record(
            conn, "item", item_id, "archived", actor, None,
            {"name": change["name"], "because": "an import was undone"},
        )
        return "archived"
    owners = [item_id, *(v["id"] for v in entry.variants)]
    for link in await conn.fetch(
        "select asset_id, owner_kind, owner_id from media_links where owner_id = any($1)", owners
    ):
        await media.detach(conn, link["asset_id"], link["owner_kind"], link["owner_id"])
    await conn.execute("delete from items where id = $1", item_id)
    await team.record(
        conn, "item", item_id, "deleted", actor, None,
        {"name": change["name"], "because": "an import was undone"},
    )
    return "removed"


async def _undo_updated(
    conn: asyncpg.Connection, clock: ShopClock, actor: Actor, change: dict
) -> str | None:
    """None when everything was put back, else why part of it was left."""
    item_id = UUID(change["id"])
    entry = await service.get(conn, clock, item_id)
    if entry is None:
        return "gone"
    left = False
    for move in change.get("stock", []):
        vid = UUID(move["variant_id"])
        now = next((v for v in entry.variants if v["id"] == vid), None)
        if now is None or now["on_hand"] != move["after"]:
            left = True
            continue
        await stock.count(conn, vid, move["before"], actor, "Undo of an import")
    changes = {}
    if change["before"]:
        if _item_state(entry, change["after"].keys()) == change["after"]:
            changes = {k: _deser(k, v) for k, v in change["before"].items()}
        else:
            left = True
    if "variants_before" in change:
        if _variant_state(entry) == change["variants_after"]:
            changes["variants"] = change["variants_before"]
        else:
            left = True
    if changes:
        await service.update_item(
            conn, item_id, changes, actor, clock, require_arabic=False,
            reason="Undo of an import",
        )
    return "changed_since" if left else None


async def undo(
    conn: asyncpg.Connection, media: MediaService, clock: ShopClock, actor: Actor
) -> dict:
    """Put the newest import back, once. Items edited since are left as they are."""
    newest = await _undoable(conn)
    if newest is None:
        raise Refused(
            "nothing_to_undo", "There is no import to undo.", "لا يوجد استيراد للتراجع عنه.", 404
        )
    row = await _row(conn, newest, lock=True)
    if row["status"] != "applied":
        raise Refused(
            "nothing_to_undo", "There is no import to undo.", "لا يوجد استيراد للتراجع عنه.", 404
        )
    removed = archived = restored = 0
    left: list[dict] = []
    created_here = {c["id"] for c in row["changes"] if c["op"] == "create"}
    for change in row["changes"]:
        try:
            async with conn.transaction():  # a savepoint: one failure leaves the others alone
                if change["op"] == "create":
                    outcome = await _undo_created(conn, media, clock, actor, change)
                    if outcome == "removed":
                        removed += 1
                    elif outcome == "archived":
                        archived += 1
                        left.append(_left(change, "kept"))
                    else:
                        left.append(_left(change, outcome))
                else:
                    outcome = await _undo_updated(conn, clock, actor, change)
                    if outcome:
                        left.append(_left(change, outcome))
                    else:
                        restored += 1
        except (service.ItemError, stock.StockError, LookupError, asyncpg.PostgresError):
            left.append(_left(change, "failed"))
    # Photos the job added to items that already existed come off again.
    for attached in (row["photos"] or {}).get("attached", []):
        if attached["item_id"] in created_here:
            continue
        item_id, asset_id = UUID(attached["item_id"]), UUID(attached["asset_id"])
        if await media.detach(conn, asset_id, "item", item_id):
            await conn.execute("update items set updated_at = now() where id = $1", item_id)
    await conn.execute(
        "update item_imports set status = 'undone', undone_at = now(), undone_by = $2, "
        "zip = null where id = $1", newest, actor.name,
    )
    await team.record(
        conn, "item", newest, "import_undone", actor, None,
        {"filename": row["filename"], "removed": removed, "restored": restored,
         "left": len(left)},
    )
    return {
        "id": str(newest), "filename": row["filename"], "removed": removed,
        "archived": archived, "restored": restored, "left": left,
    }

