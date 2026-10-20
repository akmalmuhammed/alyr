"""The owner's own fields on items and sizes (D-039 "As built (feature engine)", ALY-148,
`specs/012-feature-engine/spec.md`).

A shop defines fields: "Serves" (a number), "Allergens" (one of a list), "Warranty months",
"Concentration", "Gift wrap available" (yes or no), "Best before" (a date). Each has a key that
never changes, a name in English and Arabic, a kind, whether it is on an item or on each size or
colour, whether customers see it, whether it is searched, whether it is required, and an order.
A field is **archived, never deleted**: its values stay on the items and come back if it does.

Values are kept in the `custom` column of the item or the size, an object keyed by the field's
key (`migrations/0036_custom_fields.sql` says why a column and not a table). A key with no value
is simply not there. The kind is checked here, against the definition:

* `text`: up to 200 characters;
* `number`: a number, up to four decimals, Arabic digits accepted;
* `choice`: one of the field's choices (by value or by name in either language);
* `yes_no`: true or false;
* `date`: `YYYY-MM-DD`.

At most `MAX_FIELDS` fields are active in a shop; a choice list holds at most `MAX_CHOICES`.
A required field must have a value before an item goes on sale (a draft may lack it) and, for a
field on sizes, on every size that can be sold. Where the "Your own fields" feature is off the
screens do not show fields and nothing is required, and no value can be added to an item that has
none.

Every function takes a tenant-scoped connection.
"""

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.normalise import western_digits
from alyr.core.team import Actor
from alyr.modules.items import changes, columns
from alyr.modules.items.service import BilingualError

KINDS = ("text", "number", "choice", "yes_no", "date")
APPLIES = ("item", "variant")
MAX_FIELDS = 20
MAX_CHOICES = 30
MAX_TEXT = 200
MAX_LABEL = 60
MAX_NUMBER = Decimal("1000000000")


class FieldError(BilingualError):
    """A field or a value that cannot be accepted. The message is safe to show, in both
    languages."""


def _err(code: str, en: str, ar: str) -> FieldError:
    return FieldError(code, en, ar)


# ── reading ───────────────────────────────────────────────────────────────────────────


def _choice(c: dict) -> dict:
    return {
        "value": c["value"], "label": c.get("label", ""), "label_ar": c.get("label_ar", ""),
        "active": c.get("active", True),
    }


def view(row: asyncpg.Record | dict) -> dict:
    choices = row["choices"]
    return {
        "id": str(row["id"]), "key": row["key"], "label": row["label"], "label_ar": row["label_ar"],
        "kind": row["kind"], "applies_to": row["applies_to"],
        "choices": [_choice(c) for c in choices or []], "unit": row["unit"],
        "shown_to_customers": row["shown_to_customers"], "searchable": row["searchable"],
        "required": row["required"], "sort": row["sort"],
        "archived": row["archived_at"] is not None,
    }


async def rows(conn: asyncpg.Connection, archived: bool = True) -> list[dict]:
    """The shop's fields in the owner's order. `archived` includes the archived ones, last."""
    found = await conn.fetch(
        "select * from custom_fields "
        + ("" if archived else "where archived_at is null ")
        + "order by archived_at is not null, sort, created_at, key"
    )
    return [view(r) for r in found]


async def active(conn: asyncpg.Connection) -> list[dict]:
    return await rows(conn, archived=False)


async def get(conn: asyncpg.Connection, field_id: UUID) -> dict | None:
    row = await conn.fetchrow("select * from custom_fields where id = $1", field_id)
    return view(row) if row else None


def by_key(fields: list[dict]) -> dict[str, dict]:
    return {f["key"]: f for f in fields}


# ── writing a definition ──────────────────────────────────────────────────────────────


def slug(text: str) -> str:
    """A key from a name: lower-case letters and digits with underscores, up to 30 long, and
    starting with a letter. A name with no Latin letters in it gets `field`."""
    key = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:30].strip("_")
    if not key:
        return "field"
    return key if key[0].isalpha() else f"f_{key}"[:30]


def _clean_choices(raw: list[dict] | None) -> list[dict]:
    out, seen = [], set()
    for n, c in enumerate(raw or []):
        label = " ".join(str(c.get("label", "")).split())
        label_ar = " ".join(str(c.get("label_ar", "")).split())
        if not label and not label_ar:
            raise _err("choice_name_needed", "Give every choice a name.", "اكتب اسماً لكل خيار.")
        if len(label) > MAX_LABEL or len(label_ar) > MAX_LABEL:
            raise _err("choice_too_long", f"A choice can be up to {MAX_LABEL} letters.",
                       f"يمكن أن يصل الخيار إلى {MAX_LABEL} حرفاً.")
        value = str(c.get("value") or "") or slug(label or label_ar) or f"choice_{n + 1}"
        if value in seen:
            value = f"{value}_{n + 1}"
        seen.add(value)
        out.append({"value": value, "label": label, "label_ar": label_ar,
                    "active": bool(c.get("active", True))})
    if len(out) > MAX_CHOICES:
        raise _err("too_many_choices", f"A field can have up to {MAX_CHOICES} choices.",
                   f"يمكن أن يحتوي الحقل على {MAX_CHOICES} خياراً على الأكثر.")
    return out


def _clean_labels(label: str, label_ar: str) -> tuple[str, str]:
    label, label_ar = " ".join((label or "").split()), " ".join((label_ar or "").split())
    if not label and not label_ar:
        raise _err("field_name_needed", "Give the field a name.", "اكتب اسماً للحقل.")
    for name in (label, label_ar):
        if name and columns.column_for(name):
            raise _err(
                "field_name_taken", f"“{name}” is already the name of a column in your files. "
                "Choose another name.", f"«{name}» اسم عمود موجود في ملفاتك. اختر اسماً آخر.")
    if len(label) > MAX_LABEL or len(label_ar) > MAX_LABEL:
        raise _err("field_name_too_long", f"A name can be up to {MAX_LABEL} letters.",
                   f"يمكن أن يصل الاسم إلى {MAX_LABEL} حرفاً.")
    return label, label_ar


async def _count_active(conn: asyncpg.Connection) -> int:
    return await conn.fetchval("select count(*) from custom_fields where archived_at is null")


def _too_many() -> FieldError:
    return _err(
        "too_many_fields", f"A shop can have up to {MAX_FIELDS} fields. Archive one you do not "
        "use to add another.",
        f"يمكن أن يكون للمتجر {MAX_FIELDS} حقلاً على الأكثر. أرشف حقلاً لا تستخدمه لتضيف آخر.",
    )


async def create(
    conn: asyncpg.Connection, actor: Actor, data: dict, *, record: bool = True
) -> dict:
    """Add a field. `data`: `label`, `label_ar`, `kind`, `applies_to`, `choices` (for a list),
    `unit`, `shown_to_customers`, `searchable`, `required`, and `key` (a template's; otherwise
    made from the name)."""
    label, label_ar = _clean_labels(data.get("label", ""), data.get("label_ar", ""))
    kind = data.get("kind", "text")
    applies = data.get("applies_to", "item")
    if kind not in KINDS:
        raise _err("bad_kind", "Choose text, number, a list, yes or no, or a date.",
                   "اختر نصاً أو رقماً أو قائمة أو نعم/لا أو تاريخاً.")
    if applies not in APPLIES:
        raise _err("bad_applies", "A field is for the item or for each size or colour.",
                   "الحقل للصنف أو لكل مقاس أو لون.")
    choices = _clean_choices(data.get("choices")) if kind == "choice" else []
    if kind == "choice" and not any(c["active"] for c in choices):
        raise _err("choices_needed", "Add the choices a customer or you can pick from.",
                   "أضف الخيارات التي يمكن الاختيار منها.")
    unit = " ".join(str(data.get("unit", "")).split())[:12] if kind == "number" else ""
    if await _count_active(conn) >= MAX_FIELDS:
        raise _too_many()
    taken = {r["key"] for r in await conn.fetch("select key from custom_fields")}
    base = data.get("key") or slug(label or "") or "field"
    if data.get("key") and base in taken:
        raise _err("field_exists", f"A field with the key “{base}” already exists.",
                   f"يوجد حقل بالمفتاح «{base}» بالفعل.")
    key, n = base, 1
    while key in taken:
        n += 1
        key = f"{base[:27]}_{n}"
    sort = (await conn.fetchval("select coalesce(max(sort), -1) + 1 from custom_fields"))
    row = await conn.fetchrow(
        "insert into custom_fields (key, label, label_ar, kind, applies_to, choices, unit, "
        "shown_to_customers, searchable, required, sort, created_by) "
        "values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12) returning *",
        key, label, label_ar, kind, applies, choices, unit,
        bool(data.get("shown_to_customers", False)), bool(data.get("searchable", False)),
        bool(data.get("required", False)), sort, actor.name,
    )
    made = view(row)
    if record:
        await team.record(conn, changes.SUBJECT, row["id"], "custom_field_added", actor, None,
                          {"key": key, "name": label or label_ar, "kind": kind,
                           "applies_to": applies})
    return made


async def update(conn: asyncpg.Connection, actor: Actor, field_id: UUID, data: dict) -> dict | None:
    """Change a field. Its key, kind and where it applies never change (its values would not
    mean the same). Names, the unit, choices (added, renamed, switched off; one that has been
    used is switched off, not removed), who sees it, whether it is searched or required, and its
    place can."""
    row = await conn.fetchrow("select * from custom_fields where id = $1 for update", field_id)
    if row is None:
        return None
    before = view(row)
    label, label_ar = _clean_labels(
        data.get("label", before["label"]), data.get("label_ar", before["label_ar"]))
    choices = before["choices"]
    if "choices" in data and before["kind"] == "choice":
        sent = _clean_choices(data["choices"])
        used = {c["value"] for c in before["choices"]}
        kept = {c["value"] for c in sent}
        # A choice the owner took out is kept, switched off: items may already hold it.
        choices = sent + [
            {**c, "active": False} for c in before["choices"] if c["value"] not in kept
        ]
        if not any(c["active"] for c in choices):
            raise _err("choices_needed", "Add the choices a customer or you can pick from.",
                       "أضف الخيارات التي يمكن الاختيار منها.")
        if len(choices) > MAX_CHOICES + len(used):
            raise _err("too_many_choices", f"A field can have up to {MAX_CHOICES} choices.",
                       f"يمكن أن يحتوي الحقل على {MAX_CHOICES} خياراً على الأكثر.")
    unit = (" ".join(str(data["unit"]).split())[:12]
            if "unit" in data and before["kind"] == "number" else before["unit"])
    new = {
        "label": label, "label_ar": label_ar, "choices": choices, "unit": unit,
        "shown_to_customers": bool(data.get("shown_to_customers", before["shown_to_customers"])),
        "searchable": bool(data.get("searchable", before["searchable"])),
        "required": bool(data.get("required", before["required"])),
        "sort": int(data.get("sort", before["sort"])),
    }
    await conn.execute(
        "update custom_fields set label = $2, label_ar = $3, choices = $4::jsonb, unit = $5, "
        "shown_to_customers = $6, searchable = $7, required = $8, sort = $9, updated_at = now() "
        "where id = $1",
        field_id, new["label"], new["label_ar"], new["choices"], new["unit"],
        new["shown_to_customers"], new["searchable"], new["required"], new["sort"],
    )
    after = {**before, **new}
    diff = [{"field": k, "from": before[k], "to": new[k]} for k in new if before[k] != new[k]]
    if diff:
        await team.record(conn, changes.SUBJECT, field_id, "custom_field_changed", actor, None,
                          {"key": before["key"], "name": before["label"] or before["label_ar"],
                           "changes": diff})
    return after


async def archive(conn: asyncpg.Connection, actor: Actor, field_id: UUID,
                  restore: bool = False) -> dict | None:
    """Archive a field (its values stay), or bring it back."""
    row = await conn.fetchrow("select * from custom_fields where id = $1 for update", field_id)
    if row is None:
        return None
    if restore and row["archived_at"] is not None and await _count_active(conn) >= MAX_FIELDS:
        raise _too_many()
    if (row["archived_at"] is not None) != (not restore):
        await conn.execute(
            "update custom_fields set archived_at = " + ("null" if restore else "now()")
            + ", updated_at = now() where id = $1", field_id)
        await team.record(
            conn, changes.SUBJECT, field_id,
            "custom_field_restored" if restore else "custom_field_archived", actor, None,
            {"key": row["key"], "name": row["label"] or row["label_ar"]})
    return await get(conn, field_id)


async def seed(conn: asyncpg.Connection, actor: Actor, seeds) -> list[str]:
    """Give a shop a template's starter fields. A field whose key the shop already has (even
    archived, even changed) is left exactly as it is. Returns the keys added. Nothing is put on
    the activity record here: the start of a shop is not a change, and a change of template
    records itself with the fields it added."""
    have = {r["key"] for r in await conn.fetch("select key from custom_fields")}
    added = []
    for seed_ in seeds:
        if seed_.key in have:
            continue
        if await _count_active(conn) >= MAX_FIELDS:
            break
        await create(conn, actor, {
            "key": seed_.key, "label": seed_.label.en, "label_ar": seed_.label.ar,
            "kind": seed_.kind, "applies_to": seed_.applies_to, "unit": seed_.unit,
            "choices": [{"label": c.en, "label_ar": c.ar} for c in seed_.choices],
            "shown_to_customers": seed_.shown, "searchable": seed_.searchable,
            "required": seed_.required,
        }, record=False)
        added.append(seed_.key)
    return added


# ── values ────────────────────────────────────────────────────────────────────────────


def clean_value(field: dict, raw):
    """A value as it is stored, or None for "no value". Raises `FieldError` for one that does
    not fit the field."""
    name = field["label"] or field["label_ar"]
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    kind = field["kind"]
    if kind == "text":
        text = " ".join(str(raw).split()) if "\n" not in str(raw) else str(raw).strip()
        if len(text) > MAX_TEXT:
            raise _err("value_too_long", f"{name} can be up to {MAX_TEXT} letters.",
                       f"يمكن أن يصل «{name}» إلى {MAX_TEXT} حرفاً.")
        return text
    if kind == "number":
        if isinstance(raw, bool):
            raise _bad_number(name)
        try:
            number = Decimal(western_digits(str(raw)).replace(",", "").strip())
        except InvalidOperation:
            raise _bad_number(name) from None
        if not number.is_finite() or abs(number) >= MAX_NUMBER:
            raise _bad_number(name)
        number = number.quantize(Decimal("0.0001")).normalize()
        return int(number) if number == number.to_integral_value() else float(number)
    if kind == "yes_no":
        if isinstance(raw, bool):
            return raw
        word = str(raw).strip().lower()
        if word in ("yes", "true", "1", "نعم", "y"):
            return True
        if word in ("no", "false", "0", "لا", "n"):
            return False
        raise _err("bad_yes_no", f"{name}: choose yes or no.", f"«{name}»: اختر نعم أو لا.")
    if kind == "date":
        try:
            return date.fromisoformat(str(raw).strip()).isoformat()
        except ValueError:
            raise _err("bad_date", f"{name}: write a date like 2026-10-31.",
                       f"«{name}»: اكتب تاريخاً مثل 2026-10-31.") from None
    # choice: by value, or by a name in either language
    wanted = str(raw).strip()
    folded = wanted.lower()
    for c in field["choices"]:
        if wanted == c["value"] or folded in (c["label"].lower(), c["label_ar"].lower()):
            return c["value"]
    raise _err("bad_choice", f"{name}: choose one of the choices.",
               f"«{name}»: اختر أحد الخيارات.")


def _bad_number(name: str) -> FieldError:
    return _err("bad_number", f"{name}: write a number.", f"«{name}»: اكتب رقماً.")


def merged(current: dict | None, sent: dict | None, defs: dict[str, dict], applies: str) -> dict:
    """The values an item (or size) will have: what it has, changed by what was sent (a null
    removes one). Only a key of an active field of the right place may be sent."""
    out = dict(current or {})
    for key, raw in (sent or {}).items():
        field = defs.get(key)
        if field is None or field["applies_to"] != applies:
            raise _err("unknown_field", f"There is no field “{key}” here.",
                       f"لا يوجد حقل «{key}» هنا.")
        if field["archived"]:
            raise _err("field_archived", f"“{field['label'] or field['label_ar']}” is archived.",
                       f"«{field['label_ar'] or field['label']}» مؤرشف.")
        value = clean_value(field, raw)
        if value is None:
            out.pop(key, None)
        else:
            out[key] = value
    return out


def missing(defs: list[dict], applies: str, values: dict | None) -> list[dict]:
    """The required, active fields of this place that have no value."""
    return [
        f for f in defs
        if f["applies_to"] == applies and f["required"] and not f["archived"]
        and (values or {}).get(f["key"]) is None
    ]


def required_error(field: dict, where: str = "") -> FieldError:
    name_en, name_ar = field["label"] or field["label_ar"], field["label_ar"] or field["label"]
    return _err("field_required", f"{name_en} is needed before this can go on sale{where}.",
                f"«{name_ar}» مطلوب قبل عرض الصنف للبيع.")


# ── words for a value, for a screen, a file or an order line ──────────────────────────


def _number_text(value, unit: str) -> str:
    text = f"{value:g}" if isinstance(value, float) else str(value)
    return f"{text} {unit}".strip()


def say(field: dict, value, lang: str) -> str:
    """A value in words, in one language: a choice by its name, yes or no, a number with its
    unit."""
    ar = lang == "ar"
    if value is None:
        return ""
    kind = field["kind"]
    if kind == "yes_no":
        return ("نعم" if value else "لا") if ar else ("Yes" if value else "No")
    if kind == "choice":
        for c in field["choices"]:
            if c["value"] == value:
                return (c["label_ar"] or c["label"]) if ar else (c["label"] or c["label_ar"])
        return str(value)
    if kind == "number":
        return _number_text(value, field["unit"])
    return str(value)


def label_of(field: dict, lang: str) -> str:
    return (field["label_ar"] or field["label"]) if lang == "ar" else (
        field["label"] or field["label_ar"])


def shown_to_customers(
    defs: list[dict], item_values: dict | None, variant_values: dict | None = None
) -> list[dict]:
    """The fields a customer may see on an item and a size: each with both languages' words."""
    out = []
    for f in defs:
        if f["archived"] or not f["shown_to_customers"]:
            continue
        mine = item_values if f["applies_to"] == "item" else variant_values
        value = (mine or {}).get(f["key"])
        if value is None:
            continue
        out.append({
            "key": f["key"], "label": f["label"] or f["label_ar"],
            "label_ar": f["label_ar"] or f["label"], "kind": f["kind"],
            "text": say(f, value, "en"), "text_ar": say(f, value, "ar"),
            "searchable": f["searchable"],
        })
    return out


def search_text(defs: list[dict], item_values: dict | None, variants: list[dict]) -> list[str]:
    """Words of the searchable fields' values (both languages for a choice), for the list's
    search."""
    out = []
    for f in defs:
        if f["archived"] or not f["searchable"]:
            continue
        holders = (
            [item_values] if f["applies_to"] == "item" else [v.get("custom") for v in variants]
        )
        for values in holders:
            value = (values or {}).get(f["key"])
            if value is None:
                continue
            out += [say(f, value, "en"), say(f, value, "ar")]
    return [w for w in out if w]


# ── what a save will leave on an item and its sizes ───────────────────────────────────


@dataclass
class Plan:
    """The owner's field values an item and its sizes will have after a save, checked."""

    item: dict
    variants: dict[int, dict] = field(default_factory=dict)  # by the size's place in the form
    touched: bool = False  # the save sent values for something


async def plan_values(
    conn: asyncpg.Connection, *, item_now: dict | None, sent: dict | None,
    variant_inputs: list[dict], variants_now: dict[str, dict] | None = None, status: str,
    check_required: bool,
) -> Plan | None:
    """Check the values a save sends and say what the item and its sizes will hold. Returns None
    when the save sends none and nothing needs checking. Raises a `FieldError` for a value that
    does not fit, an archived or unknown field, a value the shop's features do not allow (the
    "Your own fields" feature is off and the item has none), or a required field with no value on
    an item that is going on sale. Nothing is written."""
    # (imported here: features.py builds on service.py, as this module does)
    from alyr.modules.items import features

    touched = bool(sent) or any(v.get("custom") for v in variant_inputs)
    if not touched and not check_required:
        return None
    feats = await features.load(conn)
    if touched and not feats.on("custom_fields") and not (item_now or {}):
        raise features.refuse("custom_fields")
    everything = await rows(conn)
    defs = by_key(everything)
    plan = Plan(merged(item_now, sent, defs, "item"), touched=touched)
    for n, v in enumerate(variant_inputs):
        current = (variants_now or {}).get(str(v.get("id"))) if v.get("id") else None
        plan.variants[n] = merged(current, v.get("custom"), defs, "variant")
    if feats.on("custom_fields") and status == "live" and check_required:
        live = [d for d in everything if not d["archived"]]
        for field_ in missing(live, "item", plan.item):
            raise required_error(field_)
        for values in plan.variants.values():
            for field_ in missing(live, "variant", values):
                raise required_error(field_)
    return plan


# ── saving values ─────────────────────────────────────────────────────────────────────


async def save_item_values(conn: asyncpg.Connection, item_id: UUID, values: dict) -> None:
    await conn.execute("update items set custom = $2::jsonb where id = $1", item_id, values)


async def save_variant_values(conn: asyncpg.Connection, variant_id: UUID, values: dict) -> None:
    await conn.execute(
        "update item_variants set custom = $2::jsonb where id = $1", variant_id, values)


async def usage(conn: asyncpg.Connection) -> dict[str, int]:
    """How many items (or sizes) hold a value for each field, for the screen that says what
    archiving does."""
    out: dict[str, int] = {}
    for r in await conn.fetch(
        "select k as key, count(*) as n from ("
        "  select jsonb_object_keys(custom) as k from items where status <> 'archived' "
        "  union all select jsonb_object_keys(custom) from item_variants"
        ") t group by k"
    ):
        out[r["key"]] = r["n"]
    return out
