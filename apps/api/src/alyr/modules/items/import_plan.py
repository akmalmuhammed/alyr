"""Working out what an uploaded file would do, before anything is saved (D-039, ALY-108).

`build` reads the rows of a file, checks every one, groups the rows that belong to one item,
decides for each item whether it would be added, updated, left as it is or left out, and
says so row by row in English and Arabic. It reads the shop (a `Snapshot`, loaded by the
caller) and writes nothing, so the preview and the import use the same function and the
import can prove it applies exactly what the owner saw (the plan's `hash`).

How a file is read
------------------
* One row is one size or colour of an item. A row with a name starts an item; a row under it
  with the same name and a size or colour, or no name and a size or colour, is another of its
  sizes. An item with an `Item ID` (what an export writes) is found by that ID wherever its
  rows are. Two separate items with one name are never merged: they are warned about.
* An empty cell keeps what the shop already has. A cell that is wrong makes its whole item be
  left out and says which row and why; the other items are not affected.
* An item that cannot go on sale yet (no price, no Arabic name) is added as a draft and the
  row says so, instead of being refused.
* Stock numbers are not edits: they become stock-log entries when applied.
"""

import hashlib
import json
import re
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from alyr import capabilities
from alyr.core.media import parse_photo_ref
from alyr.core.normalise import fmt_qar, has_arabic
from alyr.modules.items import columns, import_words, qty, service, values
from alyr.modules.items import costs as costs_module
from alyr.modules.items import fields as owner_fields
from alyr.modules.items.import_words import Issue, issue
from alyr.modules.items.values import CellError
from alyr.modules.items.xlsx import Sheet

# May the person asking see and import costs (an owner or admin of a shop that keeps costs)? The
# import routes set it for each request (`routes/items_import.py`); the plan reads it, so a
# cost never reaches a preview that someone else may open (ALY-150).
COSTS: ContextVar[bool] = ContextVar("import_costs", default=False)

MAX_DATA_ROWS = 3000
MAX_VARIANTS = 100
MAX_PHOTOS = 8
HEADER_SEARCH_ROWS = 10
DUPLICATE_MODES = ("create", "update", "skip")
PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

# The longest each text may be (the API's own limits).
LIMITS = {
    "name": 120, "name_ar": 120, "sku": 40, "variant_sku": 40, "category": 60, "variant": 80,
    "variant_ar": 80,
    "description": 1000, "description_ar": 1000,
}
# Keys an item carries once, whichever of its rows holds them.
ITEM_KEYS = (
    "name", "name_ar", "sku", "category", "price", "sale_price", "sale_starts", "sale_ends", "unit",
    "pack_size", "min_order", "low_stock", "tags", "status", "rule", "available",
    "description", "description_ar",
)
FORMULA_TEXT = ("name", "name_ar", "sku", "variant_sku", "category", "variant", "variant_ar",
                "description",
                "description_ar", "tags", "photo")


# ── what the plan reads about the shop, and the zip of photos ─────────────

@dataclass
class Snapshot:
    """The shop as the planner needs to see it. The caller loads it inside the same
    transaction it will apply in."""

    tenant_id: UUID
    tz: ZoneInfo
    items: list[service.Loaded]
    categories: list[str]
    limit: int  # how many items the shop may have
    room: int  # how many more it may add now
    # Photos already in the library, by the hash that names them -> the photo's ID.
    assets: dict[str, UUID] = field(default_factory=dict)
    # Photos already on the items that exist, by item ID.
    attached: dict[UUID, set[UUID]] = field(default_factory=dict)
    # The columns the shop's features allow (None: all of them). A column of a feature the shop
    # has switched off is read, noted and left out (ALY-148).
    allowed: frozenset[str] | None = None
    # The shop's own fields that are active (ALY-148): their columns are read too.
    fields: list[dict] = field(default_factory=list)
    # "Sold by weight or volume" is on: a unit other than the kilo, or a fraction, may be added.
    decimal_ok: bool = True
    # The costs kept, when the file may carry them (ALY-150: an owner or admin, a shop that keeps
    # costs); None otherwise, and the cost column is then left out. `cost_note` says why when the
    # shop does keep costs and this person may not import them.
    costs: dict | None = None
    cost_note: str = ""


@dataclass
class ZipView:
    """What the planner needs to know of the zip: which file names it holds."""

    by_name: dict[str, list[str]]       # lower-case file name -> entries with that name
    by_stem: dict[str, list[str]]       # squashed name without extension -> entries
    unusable: list[str]                 # entries that are not JPEG, PNG or WebP
    entries: int


# ── the plan ──────────────────────────────────────────────

@dataclass
class VariantOp:
    row: int
    name: str
    name_ar: str
    price_diff: int | None
    stock: int | None
    per_day: int | None
    sku: str | None = None
    custom: dict | None = None  # the owner's own fields for this size (what the file changes)


@dataclass
class ItemPlan:
    rows: list[int]
    action: str = "create"  # create, update, unchanged, skip, error
    name: str = ""
    name_ar: str = ""
    target: UUID | None = None
    notes: list[tuple[int, Issue]] = field(default_factory=list)
    data: dict = field(default_factory=dict)         # create: the item; update: the changes
    variants: list[VariantOp] = field(default_factory=list)
    photos: list[dict] = field(default_factory=list)  # {"zip": entry} or {"asset": id}
    diff: list[dict] = field(default_factory=list)    # what an update changes, for the preview
    # What the cost column sets: [{row, variant, variant_id, cost}] (dirhams). Only ever filled
    # for a person who may see costs.
    costs: list[dict] = field(default_factory=list)
    draft: bool = False
    stock_moves: int = 0

    @property
    def errors(self) -> list[tuple[int, Issue]]:
        return [n for n in self.notes if n[1].level == "error"]

    def view(self) -> dict:
        creating = self.action == "create"
        price = self.data.get("price") if creating else None
        return {
            "row": self.rows[0], "rows": self.rows, "action": self.action, "name": self.name,
            "name_ar": self.name_ar, "id": str(self.target) if self.target else None,
            "draft": self.draft, "variants": sum(1 for v in self.variants if v.name),
            "photos": len(self.photos), "stock_moves": self.stock_moves,
            "price": price, "price_text": fmt_qar(price) if price else None,
            "category": (self.data.get("category") or None) if creating else None,
            "diff": [d for d in self.diff if COSTS.get() or d["column"] != "cost"],
            **({"costs": self.costs} if self.costs and COSTS.get() else {}),
            "issues": [{**import_words.view(n), "row": row} for row, n in self.notes],
        }

    def signature(self) -> dict:
        """Everything that decides what this item does, as plain data, for the hash."""
        return {
            "rows": self.rows, "action": self.action, "target": str(self.target),
            "data": self.data, "variants": [vars(v) for v in self.variants],
            "photos": self.photos, "diff": self.diff, "costs": self.costs,
            "notes": [(row, n.code, n.args) for row, n in self.notes],
        }


@dataclass
class Plan:
    options: dict
    items: list[ItemPlan] = field(default_factory=list)
    notes: list[Issue] = field(default_factory=list)  # about the file, not a row
    rows: int = 0
    new_categories: list[dict] = field(default_factory=list)
    photos: dict = field(default_factory=dict)

    @property
    def hash(self) -> str:
        body = json.dumps(
            [self.options, [i.signature() for i in self.items], self.photos],
            sort_keys=True, separators=(",", ":"), default=str,
        )
        return hashlib.sha256(body.encode()).hexdigest()[:16]

    def actionable(self) -> list[ItemPlan]:
        return [i for i in self.items if i.action in ("create", "update")]

    def counts(self) -> dict:
        by = {a: sum(1 for i in self.items if i.action == a)
              for a in ("create", "update", "unchanged", "skip", "error")}
        warnings = sum(1 for i in self.items for _r, n in i.notes if n.level == "warning")
        return {
            "rows": self.rows, "items": len(self.items), **by,
            "warnings": warnings,
            "drafts": sum(1 for i in self.actionable() if i.draft),
            "stock_moves": sum(i.stock_moves for i in self.actionable()),
            "photos": sum(len(i.photos) for i in self.actionable()),
        }

    def view(self) -> dict:
        return {
            "hash": self.hash, "options": self.options, "summary": {
                **self.counts(), "new_categories": self.new_categories,
                "zip": self.photos,
            },
            "notes": [import_words.view(n) for n in self.notes],
            "items": [i.view() for i in self.items],
        }


# ── reading the table ─────────────────────────────────────

@dataclass
class RawRow:
    number: int
    cells: dict[str, object]
    formulas: set[str]


def _blank(raw: object) -> bool:
    return raw is None or (isinstance(raw, str) and not raw.strip())


def find_header(
    sheet: Sheet, allowed: frozenset[str] | None = None, own: dict[str, str] | None = None,
    cost_note: str = "",
) -> tuple[int, dict[int, str], list[Issue]]:
    """The row that holds the column names, which column is which, and notes about columns
    that are not understood. Looks in the first rows, so a file may have a title above."""
    best: tuple[int, dict[int, str]] | None = None
    for index, row in enumerate(sheet.rows[:HEADER_SEARCH_ROWS]):
        found: dict[int, str] = {}
        for col, cell in enumerate(row):
            key = columns.column_for(cell) if not _blank(cell) else None
            if not key and own and not _blank(cell):
                key = own.get(values.squash(values.as_text(cell)))
            if key:
                found[col] = key
        if {"name", "name_ar", "id"} & set(found.values()) and (
            best is None or len(found) > len(best[1])
        ):
            best = (index, found)
            if len(found) >= 3:
                break
    notes: list[Issue] = []
    if best is None:
        return -1, {}, notes
    index, found = best
    seen: set[str] = set()
    mapping: dict[int, str] = {}
    for col in sorted(found):
        key = found[col]
        if key in seen:
            notes.append(issue("duplicate_column", value=values.as_text(sheet.rows[index][col])))
            continue
        seen.add(key)
        if allowed is not None and not key.startswith("custom:") and key not in allowed:
            if key == "cost" and cost_note == "owner_only":
                notes.append(issue("column_owner_only", key,
                                   value=values.as_text(sheet.rows[index][col])[:60]))
                continue
            cap = capabilities.BY_KEY[columns.NEEDS[key].split("|")[0]]
            notes.append(issue(
                "column_off", key, feature=cap.name.en, feature_ar=cap.name.ar,
                value=values.as_text(sheet.rows[index][col])[:60],
            ))
            continue
        mapping[col] = key
    unknown = [
        values.as_text(c) for col, c in enumerate(sheet.rows[index])
        if not _blank(c) and col not in found
    ]
    notes.extend(issue("unknown_column", value=u[:60]) for u in unknown[:10])
    return index, mapping, notes


def read_rows(sheet: Sheet, header: int, mapping: dict[int, str]) -> list[RawRow]:
    rows = []
    for index in range(header + 1, len(sheet.rows)):
        row = sheet.rows[index]
        cells: dict[str, object] = {}
        formulas: set[str] = set()
        for col, key in mapping.items():
            raw = row[col] if col < len(row) else None
            if (index, col) in sheet.formulas:
                formulas.add(key)
            if not _blank(raw):
                cells[key] = raw
        if cells or formulas:
            rows.append(RawRow(sheet.first_row + index, cells, formulas))
    return rows


# ── one row ───────────────────────────────────────────────

@dataclass
class Parsed:
    row: int
    values: dict[str, object] = field(default_factory=dict)
    notes: list[tuple[int, Issue]] = field(default_factory=list)
    clear_sale: bool = False

    @property
    def failed(self) -> bool:
        return any(n.level == "error" for _r, n in self.notes)


def _add(parsed: Parsed, code: str, column: str | None = None, **args: object) -> None:
    parsed.notes.append((parsed.row, issue(code, column, **args)))


def _parse_custom(field_: dict, cell: object):
    """A cell of one of the shop's own fields, as the value it holds, or a `FieldError`."""
    if field_["kind"] == "date" and not isinstance(cell, str):
        cell = values.parse_date(cell)
        cell = cell.isoformat() if cell else None
    elif field_["kind"] == "date":
        parsed = values.parse_date(cell)
        cell = parsed.isoformat() if parsed else cell
    return owner_fields.clean_value(field_, cell)


def parse_row(raw: RawRow, defs: dict[str, dict] | None = None) -> Parsed:
    parsed = Parsed(raw.number)
    for key in raw.formulas:
        value = raw.cells.get(key)
        if value is None:
            _add(parsed, "formula_blank", key)
        else:
            _add(parsed, "formula_value", key, value=values.as_text(value)[:60])
    for key, cell in raw.cells.items():
        if key.startswith("custom:"):
            found_field = (defs or {}).get(key[7:])
            if found_field is None:
                continue
            try:
                value = _parse_custom(found_field, cell)
            except (owner_fields.FieldError, CellError) as error:
                en = str(error) if isinstance(error, owner_fields.FieldError) else str(error.code)
                _add(parsed, "custom_bad", None, detail=en,
                     detail_ar=getattr(error, "message_ar", en))
                continue
            if value is not None:
                parsed.values[key] = value
            continue
        column = columns.BY_KEY[key]
        try:
            value = _parse_cell(column, cell)
        except CellError as error:
            _add(parsed, error.code, key, **error.args_)
            continue
        if key in FORMULA_TEXT and key not in raw.formulas and values.starts_like_formula(cell):
            _add(parsed, "text_formula", key, start=str(cell).lstrip()[0])
        if value is not None:
            parsed.values[key] = value
    # "0" in the sale price column ends a sale; it is not a price.
    if parsed.values.get("sale_price") == 0:
        parsed.clear_sale = True
        del parsed.values["sale_price"]
    for key in ("price",):
        if parsed.values.get(key) == 0:
            del parsed.values[key]
    sale_start, sale_end = parsed.values.get("sale_starts"), parsed.values.get("sale_ends")
    if sale_start and sale_end and sale_end < sale_start:
        _add(parsed, "sale_dates")
    return parsed


def _parse_cell(column: columns.Column, cell: object) -> object:
    kind, key = column.kind, column.key
    if kind == "id":
        text = values.clean(cell)
        try:
            return UUID(text)
        except ValueError as error:
            raise CellError("bad_id", value=text[:60]) from error
    if kind == "readonly":
        return None  # the item's code (ALY-136): in the file to be read, never to be written
    if kind == "text":
        text = values.clean(cell, multiline=key.startswith("description"))
        if len(text) > LIMITS[key]:
            raise CellError("too_long", max=LIMITS[key])
        return text or None
    if kind == "money":
        return values.parse_money(cell)
    if kind == "signed_money":
        return values.parse_money(cell, signed=True)
    if kind == "whole":
        return values.parse_int(cell, 0, 99_999)  # the item code column is read only
    if kind == "quantity":
        # A whole number, or up to three decimals for something sold by weight or volume; the
        # item's unit decides whether a fraction is allowed (`_check_quantities`).
        low, high = {
            "pack_size": (Decimal("0.001"), 100_000), "min_order": (Decimal("0.001"), 999),
            "stock": (0, 1_000_000), "low_stock": (0, 100_000), "per_day": (0, 1_000_000),
        }[key]
        return values.parse_qty(cell, low, high)
    if kind == "yesno":
        return values.parse_bool(cell)
    if kind == "date":
        return values.parse_date(cell)
    if kind == "word":
        group = {"unit": "unit", "status": "status", "rule": "rule"}[key]
        try:
            return columns.parse_word_cell(group, cell, "bad_word")
        except CellError as error:
            raise CellError("bad_word", value=error.args_.get("value", ""), group=group) from error
    if kind == "list":
        tags = values.split_list(cell)
        if len(tags) > 20 or any(len(t) > 30 for t in tags):
            raise CellError("too_many_tags", max_tags=20, max=30)
        return tags or None
    if kind == "photos":
        return [t for t in re.split(r"[,;|\n،؛]+", values.as_text(cell)) if t.strip()] or None
    raise AssertionError(kind)


# ── grouping rows into items ──────────────────────────────

def _squash(text: object) -> str:
    return values.squash(values.as_text(text))


def group_rows(rows: list[RawRow]) -> list[list[RawRow]]:
    """Which rows are one item. See the module note."""
    blocks: list[list[RawRow]] = []
    by_id: dict[str, list[RawRow]] = {}
    previous: list[RawRow] | None = None
    for row in rows:
        ident = values.clean(row.cells.get("id")).lower()
        name, name_ar = row.cells.get("name"), row.cells.get("name_ar")
        variant = row.cells.get("variant") or row.cells.get("variant_ar")
        if ident:
            if ident in by_id:
                by_id[ident].append(row)
                previous = by_id[ident]
            else:
                previous = by_id[ident] = [row]
                blocks.append(previous)
            continue
        if previous is not None and variant:
            first = previous[0].cells
            same = (
                (not name and not name_ar)
                or (name and first.get("name") and _squash(name) == _squash(first["name"]))
                or (name_ar and first.get("name_ar")
                    and _squash(name_ar) == _squash(first["name_ar"]))
            )
            if same:
                previous.append(row)
                continue
        previous = [row]
        blocks.append(previous)
    return blocks


# ── building the plan ─────────────────────────────────────

def _sale_time(day: date, end: bool, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time(23, 59, 59) if end else time(0), tz)


def _existing_by_names(snapshot: Snapshot) -> tuple[dict[str, list], dict[UUID, service.Loaded]]:
    names: dict[str, list] = {}
    by_id: dict[UUID, service.Loaded] = {}
    for entry in snapshot.items:
        by_id[entry.item["id"]] = entry
        if entry.item["status"] == "archived":
            continue
        for key in {_squash(entry.item["name"]), _squash(entry.item["name_ar"])} - {""}:
            names.setdefault(key, []).append(entry)
    return names, by_id


_NUMBERS = re.compile(r"\d+")


def _edits(a: str, b: str) -> int:
    """How many single-letter edits turn a into b, up to 2 (3 means more)."""
    if abs(len(a) - len(b)) > 2:
        return 3
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return min(previous[-1], 3)


def build(
    sheet: Sheet, options: dict, snapshot: Snapshot, zip_view: ZipView | None = None,
    zip_label: dict | None = None,
) -> Plan:
    """The plan for a sheet. Raises `ValueError(code)` for a file that cannot be read as
    an item list at all (`no_header`, `no_items`, `too_many_rows`)."""
    mode = options.get("on_duplicate", "create")
    plan = Plan(options={"on_duplicate": mode})
    own = columns.custom_columns(snapshot.fields)
    header, mapping, notes = find_header(
        sheet, snapshot.allowed, columns.custom_index(own), snapshot.cost_note
    )
    if header < 0:
        raise ValueError("no_header")
    plan.notes.extend(notes)
    if sheet.truncated:
        plan.notes.append(issue("cut_off"))
    rows = read_rows(sheet, header, mapping)
    if not rows:
        raise ValueError("no_items")
    if len(rows) > MAX_DATA_ROWS:
        raise ValueError("too_many_rows")
    plan.rows = len(rows)

    by_name, by_id = _existing_by_names(snapshot)
    known_categories = {values.squash(c): c for c in snapshot.categories}
    claimed: dict[UUID, int] = {}
    skus = Skus(_sku_owners(snapshot))
    file_names: dict[str, list[int]] = {}
    room = snapshot.room
    new_cats: dict[str, dict] = {}
    cat_seen: dict[str, str] = {}

    blocks = group_rows(rows)
    defs = owner_fields.by_key(snapshot.fields)
    for block in blocks:
        item = _plan_item(
            block, mode, snapshot, by_name, by_id, known_categories, claimed, zip_view, skus,
            defs,
        )
        # The same name twice in one file is warned about, never merged.
        if item.action in ("create", "update") and item.name:
            for key in {_squash(item.name), _squash(item.name_ar)} - {""}:
                file_names.setdefault(key, []).append(item.rows[0])
        if item.action == "create":
            if room <= 0:
                item.action = "error"
                item.notes.append((item.rows[0], issue("item_limit", limit=snapshot.limit)))
            else:
                room -= 1
        category = item.data.get("category") if item.action in ("create", "update") else None
        if category:
            key = values.squash(category)
            if key not in known_categories:
                entry = new_cats.setdefault(key, {"name": category, "items": 0})
                entry["items"] += 1
            cat_seen.setdefault(key, category)
        plan.items.append(item)

    for item in plan.items:
        if item.action not in ("create", "update"):
            continue
        row = item.rows[0]
        others = sorted({
            r for key in {_squash(item.name), _squash(item.name_ar)} - {""}
            for r in file_names.get(key, []) if r != row
        })
        if others:
            item.notes.append((row, issue(
                "duplicate_in_file", value=item.name or item.name_ar,
                rows=", ".join(str(r) for r in others[:5]),
            )))
    # A category that is one letter away from another is probably a typo. Two that differ
    # only in a number (Size 1, Size 10) are on purpose.
    spelled = {**known_categories, **cat_seen}
    for key, entry in new_cats.items():
        for other_key, other in spelled.items():
            if (
                other_key != key and len(key) > 4 and _edits(key, other_key) <= 1
                and _NUMBERS.sub("", key) != _NUMBERS.sub("", other_key)
            ):
                for item in plan.items:
                    if values.squash(item.data.get("category") or "") == key:
                        item.notes.append((item.rows[0], issue(
                            "similar_category", value=entry["name"], other=other,
                        )))
                        break
                break
    plan.new_categories = sorted(new_cats.values(), key=lambda c: c["name"].lower())
    if zip_view is not None:
        used = {
            ref["zip"] for i in plan.actionable() for ref in i.photos if "zip" in ref
        }
        left = sorted({e for names in zip_view.by_name.values() for e in names} - used)
        plan.photos = {
            "entries": zip_view.entries, "used": len(used), "unused": left[:50],
            "unused_count": len(left), "unusable": zip_view.unusable[:50],
            **(zip_label or {}),
        }
    return plan


def _plan_item(
    block: list[RawRow], mode: str, snapshot: Snapshot, by_name: dict, by_id: dict,
    known_categories: dict[str, str], claimed: dict[UUID, int], zip_view: ZipView | None,
    skus: "Skus", defs: dict[str, dict] | None = None,
) -> ItemPlan:
    defs = defs or {}
    parsed = [parse_row(r, defs) for r in block]
    plan = ItemPlan(rows=[r.number for r in block])
    for p in parsed:
        plan.notes.extend(p.notes)
    first = parsed[0]

    def pick(key: str) -> object | None:
        """The first row's value, else the first row below that has one."""
        for p in parsed:
            if key in p.values:
                return p.values[key]
        return None

    # A cell that disagrees with the item's first row is not used; say so.
    for key in ITEM_KEYS:
        base = pick(key)
        for p in parsed[1:]:
            if base is not None and key in p.values and p.values[key] != base and key != "tags":
                plan.notes.append((p.row, issue("differs", key)))
    merged = {key: pick(key) for key in ITEM_KEYS if pick(key) is not None}
    clear_sale = any(p.clear_sale for p in parsed)
    ident = pick("id")

    # Names
    name = str(merged.get("name") or "")
    name_ar = str(merged.get("name_ar") or "")
    if not name and not name_ar and ident is None:  # an item found by its ID keeps its names
        plan.notes.append((first.row, issue("name_needed")))
    plan.name, plan.name_ar = name or name_ar, name_ar
    if (_squash(name), _squash(name_ar)) in columns.EXAMPLE_PAIRS:
        plan.notes.append((first.row, issue("example_row")))

    # The owner's own fields: the item's from the first row that has them, each size's from its row.
    item_custom = {
        k: v for k, f in defs.items() if f["applies_to"] == "item" and not f["archived"]
        for v in [pick(f"custom:{k}")] if v is not None
    }

    # Sizes and colours
    variants = _variants(block, parsed, plan, merged, defs)
    if plan.errors:
        plan.action = "error"
        return plan

    # Which item is this?
    entry = None
    if ident is not None:
        entry = by_id.get(ident)
        if entry is None:
            plan.notes.append((first.row, issue("unknown_id")))
            plan.action = "error"
            return plan
        plan.action = "update"
    else:
        keys = {_squash(name), _squash(name_ar)} - {""}
        found: list = []
        for k in keys:
            for e in by_name.get(k, []):
                if e not in found:
                    found.append(e)
        if found:
            if mode == "skip":
                plan.action = "skip"
                plan.notes.append((first.row, issue("skipped_existing", value=name or name_ar)))
                return plan
            if mode == "update":
                if len(found) > 1:
                    plan.notes.append(
                        (first.row, issue("ambiguous_match", value=name or name_ar))
                    )
                    plan.action = "error"
                    return plan
                entry = found[0]
                plan.action = "update"
                plan.notes.append((first.row, issue("updates_existing", value=entry.item["name"])))
            else:
                plan.notes.append((first.row, issue("duplicate_name", value=name or name_ar)))
    if entry is not None:
        target = entry.item["id"]
        if target in claimed:
            plan.notes.append((first.row, issue("same_item_twice", rows=str(claimed[target]))))
            plan.action = "error"
            return plan
        claimed[target] = first.row
        plan.target = target

    if entry is None:
        _create(plan, merged, variants, clear_sale, first, known_categories, snapshot,
                item_custom, defs)
    else:
        _update(plan, entry, merged, variants, clear_sale, first, known_categories, snapshot,
                item_custom, defs)
    _check_skus(plan, parsed, skus)
    if plan.errors:
        plan.action = "error"
        return plan
    _costs(plan, parsed, entry, snapshot)
    _photos(plan, parsed, snapshot, zip_view)
    if plan.action == "update" and not plan.diff and not plan.photos and not plan.stock_moves \
            and not plan.costs:
        plan.action = "unchanged"
        plan.notes.append((first.row, issue("nothing_to_change")))
    return plan


# ── sizes and colours ─────────────────────────────────────

def _variants(
    block: list[RawRow], parsed: list[Parsed], plan: ItemPlan, merged: dict,
    defs: dict[str, dict] | None = None,
) -> list[VariantOp]:
    ops: list[VariantOp] = []
    first = parsed[0].values
    named = len(block) > 1 or bool(first.get("variant") or first.get("variant_ar"))
    seen: dict[str, int] = {}
    for p in parsed:
        name = str(p.values.get("variant") or "")
        name_ar = str(p.values.get("variant_ar") or "")
        if named and not (name or name_ar):
            plan.notes.append((p.row, issue("variant_needs_name")))
            continue
        if named:
            key = _squash(name or name_ar)
            if key in seen:
                plan.notes.append(
                    (p.row, issue("duplicate_variant", value=name or name_ar, rows=str(seen[key])))
                )
                continue
            seen[key] = p.row
        mine = {
            k: p.values[f"custom:{k}"] for k, f in (defs or {}).items()
            if f["applies_to"] == "variant" and f"custom:{k}" in p.values
        }
        ops.append(VariantOp(
            p.row, name or name_ar, name_ar, p.values.get("price_diff"), p.values.get("stock"),
            p.values.get("per_day"), p.values.get("variant_sku"), mine or None,
        ))
    if len(ops) > MAX_VARIANTS:
        plan.notes.append((block[0].number, issue("too_many_variants", max=MAX_VARIANTS)))
    return ops


# ── a new item ────────────────────────────────────────────

def _rule_of(merged: dict, variants: list[VariantOp]) -> str:
    if "rule" in merged:
        return str(merged["rule"])
    if any(v.stock is not None for v in variants):
        return "count"
    if any(v.per_day is not None for v in variants):
        return "daily_limit"
    return "switch"


@dataclass
class Skus:
    """Which codes are taken: by the shop's items and sizes (`owners`, lower case, each with
    the item that has it and how to name it) and, so far, by this file (`claimed`)."""

    owners: dict[str, tuple[UUID, str]]
    claimed: dict[str, int] = field(default_factory=dict)


def _sku_owners(snapshot: Snapshot) -> dict[str, tuple[UUID, str]]:
    """Every code in use, archived items and switched-off sizes included (they keep theirs)."""
    owners: dict[str, tuple[UUID, str]] = {}
    for entry in snapshot.items:
        item = entry.item
        label = item["name"] or item["name_ar"]
        if item.get("sku"):
            owners[item["sku"].lower()] = (item["id"], label)
        for v in entry.variants:
            if v.get("sku"):
                owners[v["sku"].lower()] = (
                    item["id"], f"{label} ({v['name'] or v['name_ar']})" if v["name"] or
                    v["name_ar"] else label,
                )
    return owners


def _check_skus(plan: ItemPlan, parsed: list["Parsed"], skus: Skus) -> None:
    """A code is used once in a shop, across items and sizes (case does not matter), and
    once in a file. A row that would break that is an error, naming what has the code."""
    if plan.errors:
        return
    codes: list[tuple[int, str, str]] = []
    for p in parsed:
        if p.values.get("sku"):
            codes.append((p.row, "sku", str(p.values["sku"])))
            break  # the item's own code is one code, however many rows repeat it
    codes += [
        (p.row, "variant_sku", str(p.values["variant_sku"]))
        for p in parsed if p.values.get("variant_sku")
    ]
    seen: dict[str, int] = {}
    claims: list[tuple[str, int]] = []
    for row, _column, code in codes:
        key = code.lower()
        owner = skus.owners.get(key)
        if key in seen:
            plan.notes.append((row, issue("sku_repeated", value=code, rows=str(seen[key]))))
        elif owner is not None and owner[0] != plan.target:
            plan.notes.append((row, issue("sku_taken", value=code, other=owner[1])))
        elif key in skus.claimed:
            plan.notes.append((row, issue("sku_repeated", value=code, rows=str(skus.claimed[key]))))
        seen.setdefault(key, row)
        claims.append((key, row))
    if not plan.errors:
        for key, row in claims:
            skus.claimed[key] = row


def _snap_category(text: str | None, known: dict[str, str]) -> str:
    if not text:
        return ""
    return known.get(values.squash(text), text)


def _custom_required(
    plan: ItemPlan, row: int, defs: dict[str, dict], item_values: dict, variants: list[VariantOp],
) -> bool:
    """A required field of the shop with no value: noted, and the item is saved as a draft
    (returns True), as one without a price is."""
    short = False
    for f in defs.values():
        if f["archived"] or not f["required"]:
            continue
        if f["applies_to"] == "item":
            gap = f["key"] not in item_values
        else:
            gap = any(f["key"] not in (v.custom or {}) for v in variants) if variants else True
        if gap:
            error = owner_fields.required_error(f)
            plan.notes.append((row, issue(
                "custom_missing", None, detail=str(error), detail_ar=error.message_ar)))
            short = True
    return short


def _fraction(value: object) -> bool:
    return value is not None and value != int(value)  # type: ignore[call-overload]


def _check_quantities(
    plan: ItemPlan, row: int, unit: str, wanted: dict, variants: list[VariantOp],
    snapshot: Snapshot, current: dict,
) -> None:
    """A fraction needs a unit that is measured (kg, g, litre, ml, metre, tola), and a unit or
    fraction the shop has not switched on ("Sold by weight or volume") cannot be added. Both are
    errors on the item, said in the preview, so the apply never meets them (ALY-149)."""
    keys = ("pack_size", "min_order", "low_stock")
    fractional = [k for k in keys if _fraction(wanted.get(k))]
    fractional += ["stock" for v in variants if _fraction(v.stock) or _fraction(v.per_day)]
    if fractional and not qty.is_measure(unit):
        # A counted unit (a piece, a box...) takes whole numbers: say which cell, as a whole-number
        # column always has.
        for k in keys:
            if _fraction(wanted.get(k)):
                plan.notes.append((row, issue("not_whole", k, value=qty.fmt(wanted[k]))))
        for v in variants:
            if _fraction(v.stock):
                plan.notes.append((v.row, issue("not_whole", "stock", value=qty.fmt(v.stock))))
            if _fraction(v.per_day):
                plan.notes.append((v.row, issue("not_whole", "per_day", value=qty.fmt(v.per_day))))
        return
    if snapshot.decimal_ok:
        return
    new_unit = unit != current.get("unit", "piece") and unit not in qty.LEGACY_UNITS
    new_fraction = any(
        _fraction(wanted.get(k)) and wanted.get(k) != current.get(k if k != "low_stock" else
                                                                   "low_stock_at")
        for k in keys
    ) or any(_fraction(v.stock) or _fraction(v.per_day) for v in variants)
    if new_unit or new_fraction:
        plan.notes.append((row, issue("decimal_off")))


def _create(
    plan: ItemPlan, merged: dict, variants: list[VariantOp], clear_sale: bool, first: Parsed,
    known: dict[str, str], snapshot: Snapshot, item_custom: dict | None = None,
    defs: dict[str, dict] | None = None,
) -> None:
    row = first.row
    name, name_ar = str(merged.get("name") or ""), str(merged.get("name_ar") or "")
    if not name and name_ar:
        name = name_ar
        plan.notes.append((row, issue("english_from_arabic")))
    elif name and not name_ar and has_arabic(name):
        name_ar = name
        plan.notes.append((row, issue("arabic_in_english")))
    if name_ar and not has_arabic(name_ar):
        plan.notes.append((row, issue("name_not_arabic", "name_ar")))
    plan.name, plan.name_ar = name, name_ar

    rule = _rule_of(merged, variants)
    _check_quantities(
        plan, row, str(merged.get("unit") or "piece"), merged, variants, snapshot, {}
    )
    price = merged.get("price")
    status = str(merged.get("status") or "live")
    sale = merged.get("sale_price")
    if sale is not None and (price is None or sale >= price):
        plan.notes.append((row, issue("sale_not_below")))
    starts, ends = merged.get("sale_starts"), merged.get("sale_ends")
    if (starts or ends) and sale is None:
        plan.notes.append((row, issue("sale_dates")))
    lowest = min(price or 0, sale if sale is not None else (price or 0))
    for v in variants:
        if v.price_diff is not None and price and lowest + v.price_diff <= 0:
            plan.notes.append((v.row, issue("price_diff_low", value=v.name or name)))

    # Per-variant numbers only mean something for the rule that uses them.
    for v in variants:
        if v.stock is not None and rule != "count":
            plan.notes.append((v.row, issue("stock_ignored")))
            v.stock = None
        if v.per_day is not None and rule != "daily_limit":
            plan.notes.append((v.row, issue("per_day_ignored")))
            v.per_day = None

    low_stock = merged.get("low_stock")
    if low_stock is not None and rule not in columns.COUNTED:
        plan.notes.append((row, issue("low_stock_ignored")))
        low_stock = None

    draft = False
    if status in ("live", "hidden") and not price:
        plan.notes.append((row, issue("price_missing")))
        draft = True
    if status == "live" and not name_ar:
        plan.notes.append((row, issue("arabic_missing")))
        draft = True
    if rule == "daily_limit" and any(v.per_day is None for v in variants):
        plan.notes.append((row, issue("per_day_needed")))
    if status == "live" and defs and _custom_required(plan, row, defs, item_custom or {}, variants):
        draft = True
    if draft:
        status = "draft"
    plan.draft = status == "draft" and merged.get("status") != "draft"

    data = {
        "name": name, "name_ar": name_ar, "sku": str(merged.get("sku") or ""),
        "description": str(merged.get("description") or ""),
        "description_ar": str(merged.get("description_ar") or ""),
        "category": _snap_category(merged.get("category"), known),
        "price": price or 0, "sale_price": sale,
        "sale_starts_at": _sale_time(starts, False, snapshot.tz) if starts and sale else None,
        "sale_ends_at": _sale_time(ends, True, snapshot.tz) if ends and sale else None,
        "unit": merged.get("unit") or "piece", "pack_size": merged.get("pack_size"),
        "min_order": merged.get("min_order") or 1, "tags": merged.get("tags") or [],
        "stock_rule": rule, "available": merged.get("available", True), "status": status,
        "low_stock_at": low_stock,
    }
    if data["sale_starts_at"] and data["sale_ends_at"] and data["sale_ends_at"] <= data[
        "sale_starts_at"
    ]:
        plan.notes.append((row, issue("sale_dates")))
    if rule == "always":
        data["available"] = True
    if item_custom:
        data["custom"] = item_custom
    plan.data = data
    plan.variants = variants
    plan.stock_moves = sum(1 for v in variants if v.stock)


# ── an item that already exists ───────────────────────────

def _money_text(value: int | None) -> str:
    return fmt_qar(value) if value is not None else ""


def _diff(plan: ItemPlan, key: str, before: object, after: object, variant: str = "") -> None:
    plan.diff.append({
        "column": key, "label": columns.BY_KEY[key].en, "label_ar": columns.BY_KEY[key].ar,
        "variant": variant, "before": _show(key, before), "after": _show(key, after),
    })


def _show(key: str, value: object) -> str:
    if value is None or value == "":
        return ""
    if key in ("price", "sale_price", "price_diff", "cost"):
        return fmt_qar(int(value))  # type: ignore[arg-type]
    if key in ("unit", "status", "rule"):
        return columns.word_for(key, str(value), "en")
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value)


def _diff_custom(
    plan: ItemPlan, field_: dict, before: object, after: object, variant: str = ""
) -> None:
    plan.diff.append({
        "column": f"custom:{field_['key']}", "label": field_["label"] or field_["label_ar"],
        "label_ar": field_["label_ar"] or field_["label"], "variant": variant,
        "before": owner_fields.say(field_, before, "en"),
        "after": owner_fields.say(field_, after, "en"),
    })


def _update(
    plan: ItemPlan, entry: service.Loaded, merged: dict, variants: list[VariantOp],
    clear_sale: bool, first: Parsed, known: dict[str, str], snapshot: Snapshot,
    item_custom: dict | None = None, defs: dict[str, dict] | None = None,
) -> None:
    row = first.row
    item = entry.item
    changes: dict = {}
    plan.name, plan.name_ar = item["name"], item["name_ar"]

    def set_(key: str, field_: str, new: object, kind: str | None = None) -> None:
        old = item[field_]
        if isinstance(new, str) and isinstance(old, str):
            # A name or description the way the file would spell it: spaces are not changes.
            old = values.clean(old, multiline=field_.startswith("description"))
        if new is not None and new != old:
            changes[field_] = new
            _diff(plan, kind or key, item[field_], new)

    name, name_ar = merged.get("name"), merged.get("name_ar")
    if name and not name_ar and not item["name_ar"] and has_arabic(str(name)):
        name_ar = name
        plan.notes.append((row, issue("arabic_in_english")))
    if not name and name_ar and not item["name"]:
        name = name_ar
    set_("name", "name", name)
    set_("name_ar", "name_ar", name_ar)
    if name_ar and not has_arabic(str(name_ar)):
        plan.notes.append((row, issue("name_not_arabic", "name_ar")))
    plan.name = str(changes.get("name") or item["name"] or item["name_ar"])
    plan.name_ar = str(changes.get("name_ar") or item["name_ar"])
    set_("sku", "sku", merged.get("sku"))
    set_("description", "description", merged.get("description"))
    set_("description_ar", "description_ar", merged.get("description_ar"))
    if merged.get("category") is not None:
        set_("category", "category", _snap_category(merged["category"], known))
    set_("unit", "unit", merged.get("unit"))
    set_("pack_size", "pack_size", merged.get("pack_size"))
    set_("min_order", "min_order", merged.get("min_order"))
    _check_quantities(
        plan, row, str(changes.get("unit") or item["unit"]),
        {"pack_size": changes.get("pack_size", item["pack_size"]),
         "min_order": changes.get("min_order", item["min_order"]),
         "low_stock": merged.get("low_stock")},
        variants, snapshot, item,
    )
    if merged.get("tags") is not None and merged["tags"] != list(item["tags"]):
        changes["tags"] = merged["tags"]
        _diff(plan, "tags", list(item["tags"]), merged["tags"])
    if "available" in merged and merged["available"] != item["available"]:
        changes["available"] = merged["available"]
        _diff(plan, "available", item["available"], merged["available"])

    # The owner's own fields on the item: what the file says and the shop has not.
    now_custom = dict(item["custom"] or {})
    custom_changes = {k: v for k, v in (item_custom or {}).items() if now_custom.get(k) != v}
    for k, v in custom_changes.items():
        _diff_custom(plan, (defs or {})[k], now_custom.get(k), v)
    if custom_changes:
        changes["custom"] = custom_changes

    # Price and sale
    price = merged.get("price")
    new_price = price if price is not None else item["price"]
    set_("price", "price", price)
    sale = merged.get("sale_price")
    starts, ends = merged.get("sale_starts"), merged.get("sale_ends")
    if clear_sale:
        if item["sale_price"] is not None:
            changes["sale_price"] = None
            _diff(plan, "sale_price", item["sale_price"], None)
        plan.notes.append((row, issue("sale_ended")))
        sale_after = None
    else:
        sale_after = sale if sale is not None else item["sale_price"]
        if sale is not None and sale != item["sale_price"]:
            changes["sale_price"] = sale
            _diff(plan, "sale_price", item["sale_price"], sale)
    if sale_after is not None and not (0 < sale_after < new_price):
        plan.notes.append((row, issue("sale_not_below")))
    if sale_after is None and (starts or ends) and not clear_sale:
        plan.notes.append((row, issue("sale_dates")))
    if sale_after is not None:
        # A file holds days; a sale set on screen may end at any hour of its last day.
        for key, field_, day, end in (
            ("sale_starts", "sale_starts_at", starts, False),
            ("sale_ends", "sale_ends_at", ends, True),
        ):
            current = item[field_]
            same_day = current is not None and current.astimezone(snapshot.tz).date() == day
            if day is not None and not same_day:
                changes[field_] = _sale_time(day, end, snapshot.tz)
                _diff(plan, key, current, changes[field_])
        sa = changes.get("sale_starts_at", item["sale_starts_at"])
        ea = changes.get("sale_ends_at", item["sale_ends_at"])
        if sa and ea and ea <= sa:
            plan.notes.append((row, issue("sale_dates")))

    # How it runs out
    rule = str(merged.get("rule") or item["stock_rule"])
    if rule != item["stock_rule"]:
        changes["stock_rule"] = rule
        _diff(plan, "rule", item["stock_rule"], rule)
    if merged.get("low_stock") is not None:
        if rule in columns.COUNTED:
            set_("low_stock", "low_stock_at", merged["low_stock"])
        else:
            plan.notes.append((row, issue("low_stock_ignored")))

    # Status: going on sale needs a price and an Arabic name
    status = merged.get("status")
    final_ar = changes.get("name_ar", item["name_ar"])
    if status is not None and status != item["status"]:
        short = None
        if status in ("live", "hidden") and not new_price:
            short = "price_missing"
        elif status == "live" and not final_ar:
            short = "arabic_missing"
        if short:
            plan.notes.append((row, issue("not_put_on_sale")))
        else:
            changes["status"] = status
            _diff(plan, "status", item["status"], status)

    # Sizes and colours, and their numbers
    active = [v for v in entry.variants if v["active"]]
    by_name = {_squash(v["name"] or v["name_ar"]): v for v in active if v["name"] or v["name_ar"]}
    ops: list[VariantOp] = []
    moves = 0
    limits: dict[UUID, int | None] = {v["id"]: v["daily_limit"] for v in active}
    unnumbered_new = False
    low = min(new_price, sale_after if sale_after is not None else new_price)
    for v in variants:
        has_data = any(x is not None for x in (v.stock, v.per_day, v.price_diff, v.sku))
        existing = None
        if v.name:
            existing = by_name.get(_squash(v.name))
        elif len(active) == 1:
            existing = active[0]
        elif has_data:
            plan.notes.append((v.row, issue("variant_needs_name")))
            continue
        if v.stock is not None and rule != "count":
            plan.notes.append((v.row, issue("stock_ignored")))
            v.stock = None
        if v.per_day is not None and rule != "daily_limit":
            plan.notes.append((v.row, issue("per_day_ignored")))
            v.per_day = None
        if v.price_diff is not None and new_price and low + v.price_diff <= 0:
            plan.notes.append((v.row, issue("price_diff_low", value=v.name or plan.name)))
            continue
        label = v.name or (existing["name"] if existing else "")
        if existing is None:
            ops.append(v)
            unnumbered_new = unnumbered_new or v.per_day is None
            _diff(plan, "variant", "", v.name, label)
            if v.stock:
                moves += 1
                _diff(plan, "stock", "", v.stock, v.name)
            continue
        touched = False
        if v.per_day is not None:
            limits[existing["id"]] = v.per_day
        if v.price_diff is not None and v.price_diff != existing["price_delta"]:
            _diff(plan, "price_diff", existing["price_delta"], v.price_diff, label)
            touched = True
        if v.per_day is not None and v.per_day != existing["daily_limit"]:
            _diff(plan, "per_day", existing["daily_limit"], v.per_day, label)
            touched = True
        if v.name_ar and v.name_ar != existing["name_ar"]:
            touched = True
        if v.sku is not None and v.sku != existing["sku"]:
            _diff(plan, "variant_sku", existing["sku"], v.sku, label)
            touched = True
        mine = {
            k: val for k, val in (v.custom or {}).items()
            if (existing["custom"] or {}).get(k) != val
        }
        for k, val in mine.items():
            _diff_custom(plan, (defs or {})[k], (existing["custom"] or {}).get(k), val, label)
            touched = True
        if touched:
            ops.append(VariantOp(
                v.row, existing["name"], v.name_ar, v.price_diff, None, v.per_day, v.sku,
                mine or None,
            ))
        if v.stock is not None and v.stock != existing["on_hand"]:
            _diff(plan, "stock", existing["on_hand"], v.stock, label)
            moves += 1
            ops.append(VariantOp(v.row, existing["name"], "", None, v.stock, None))
    # A number each day needs a number for every size (the engine refuses a size without).
    if rule == "daily_limit" and (unnumbered_new or any(n is None for n in limits.values())):
        plan.notes.append((row, issue("per_day_needed")))
    # A required field must not be left empty on an item that is for sale.
    final_status = changes.get("status", item["status"])
    if final_status == "live" and defs and (custom_changes or "status" in changes):
        final = {**now_custom, **custom_changes}
        for f in defs.values():
            if f["required"] and not f["archived"] and f["applies_to"] == "item" \
                    and f["key"] not in final:
                error = owner_fields.required_error(f)
                plan.notes.append((row, issue(
                    "custom_required", None, detail=str(error), detail_ar=error.message_ar)))
    plan.variants = ops
    plan.stock_moves = moves
    plan.data = changes


# ── cost ──────────────────────────────────────────────────

def _costs(plan: ItemPlan, parsed: list[Parsed], entry: service.Loaded | None,
           snapshot: Snapshot) -> None:
    """The cost column (ALY-150): what each row says one unit costs. A row of a named size sets
    that size's own cost (not when it is what the size already costs, by itself or from the
    item); any other row sets the item's. Only for a person who may see costs: for anyone else
    the column was left out of the file's mapping and there is nothing here."""
    if snapshot.costs is None:
        return
    kept = snapshot.costs
    item_id = entry.item["id"] if entry is not None else None
    sizes = {
        _squash(v["name"] or v["name_ar"]): v
        for v in (entry.variants if entry is not None else []) if v["active"]
        and (v["name"] or v["name_ar"])
    }
    named = len(parsed) > 1 or any(
        p.values.get("variant") or p.values.get("variant_ar") for p in parsed
    )
    for p in parsed:
        cost = p.values.get("cost")
        if cost is None:
            continue
        name = str(p.values.get("variant") or p.values.get("variant_ar") or "")
        if named and name:
            existing = sizes.get(_squash(name))
            now = costs_module.effective(kept, item_id, existing["id"]) if existing else None
            if existing is not None and now == cost:
                continue
            label = existing["name"] if existing else name
            plan.costs.append({
                "row": p.row, "variant": label,
                "variant_id": str(existing["id"]) if existing else None, "cost": cost,
            })
            if entry is not None:
                _diff(plan, "cost", now, cost, label)
        else:
            now = kept.get((item_id, None)) if entry is not None else None
            if entry is not None and now == cost:
                continue
            plan.costs.append({"row": p.row, "variant": "", "variant_id": None, "cost": cost})
            if entry is not None:
                _diff(plan, "cost", now, cost)


# ── photos ────────────────────────────────────────────────

def _photos(
    plan: ItemPlan, parsed: list[Parsed], snapshot: Snapshot, zip_view: ZipView | None
) -> None:
    names: list[tuple[int, str]] = []
    for p in parsed:
        for token in p.values.get("photo", []) or []:
            names.append((p.row, token.strip()))
    already = snapshot.attached.get(plan.target, set()) if plan.target else set()
    refs: list[dict] = []
    asked = False
    for row, token in names:
        lowered = token.lower()
        own = parse_photo_ref(token) if "/" in token else None
        if lowered.startswith(("http://", "https://", "www.")) or own:
            asset = snapshot.assets.get(own[1]) if own and own[0] == snapshot.tenant_id else None
            if asset is None:
                plan.notes.append((row, issue("photo_url", value=token[:80])))
            elif asset not in already:
                refs.append({"asset": str(asset)})
            continue
        asked = True
        if zip_view is None:
            continue
        entries = zip_view.by_name.get(lowered)
        if not entries and not lowered.endswith(PHOTO_EXTENSIONS):
            entries = [
                e for ext in PHOTO_EXTENSIONS for e in zip_view.by_name.get(lowered + ext, [])
            ] or None
        if not entries:
            if "." in lowered and not lowered.endswith(PHOTO_EXTENSIONS):
                plan.notes.append((row, issue("photo_bad_type", value=token[:80])))
            else:
                plan.notes.append((row, issue("photo_missing", value=token[:80])))
        elif len(entries) > 1:
            plan.notes.append((row, issue("photo_ambiguous", value=token[:80])))
        else:
            refs.append({"zip": entries[0]})
    if asked and zip_view is None:
        plan.notes.append((plan.rows[0], issue("photo_needs_zip")))
    if not names and zip_view is not None:
        # No file names in the row: a file called like the item belongs to it.
        for key in {_squash(plan.name), _squash(plan.name_ar)} - {""}:
            found = zip_view.by_stem.get(key)
            if found and len(found) == 1:
                refs.append({"zip": found[0]})
                plan.notes.append((
                    plan.rows[0], issue("photo_by_name", value=found[0].split("/")[-1]),
                ))
                break
    unique: list[dict] = []
    for ref in refs:
        if ref not in unique:
            unique.append(ref)
    room = MAX_PHOTOS - len(already)
    if len(unique) > max(room, 0):
        plan.notes.append((plan.rows[0], issue("photo_too_many", max=MAX_PHOTOS)))
        unique = unique[: max(room, 0)]
    plan.photos = unique

