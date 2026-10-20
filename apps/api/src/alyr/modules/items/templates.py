"""Templates made in the back office (D-039 "As built (feature engine)", ALY-148,
`specs/012-feature-engine/spec.md`).

A template is a kind of business as a configuration of the Catalog (`shop_templates.py`). The
ten built-in types and the plain one are code; one ALYR's staff make for a new kind of client is
a row of `business_templates` (migration 0037) with the same shape, so a new kind of client needs
no release: start from the closest template, switch features, name the section, choose the
layout, list the starter categories and fields, save.

This file validates what is saved, turns a row into a `ShopTemplate` (which every other part of
the program already reads) and back into a plain answer for the back office. Writing needs
a connection on which the caller has declared itself ALYR staff (`app.platform_admin`); reading
needs none. Nothing here is ever deleted: a template a shop uses must stay readable, so one is
archived and is no longer offered.
"""

import re
from typing import Any

import asyncpg

from alyr import capabilities, presets, shop_templates
from alyr.catalog import Text
from alyr.modules.items import fields as item_fields
from alyr.modules.items.service import UNITS, BilingualError
from alyr.presets_catalog import ALERTS, RULES, STYLES, CatalogSetup, Layout
from alyr.shop_templates import FieldSeed, ShopTemplate

MAX_CATEGORIES = 30
FOCUS_PARTS = ("options", "schedule", "variants", "groups")
_FOCUS_FEATURE = {"options": "options", "schedule": "schedule", "variants": "variants",
                  "groups": "price_groups"}
_KEY = re.compile(r"^[a-z][a-z0-9-]{2,39}$")
_TIME = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")


class TemplateError(BilingualError):
    """A template that cannot be saved. The message is safe to show, in both languages."""


def _err(code: str, en: str, ar: str) -> TemplateError:
    return TemplateError(code, en, ar)


# ── a row as a template ───────────────────────────────────────────────────────────────


def _seed(raw: dict) -> FieldSeed:
    return FieldSeed(
        key=raw["key"], label=Text(raw.get("label", ""), raw.get("label_ar", "")),
        kind=raw.get("kind", "text"), applies_to=raw.get("applies_to", "item"),
        choices=tuple(
            Text(c.get("label", ""), c.get("label_ar", "")) for c in raw.get("choices", [])
        ),
        shown=bool(raw.get("shown", False)), searchable=bool(raw.get("searchable", False)),
        required=bool(raw.get("required", False)), unit=raw.get("unit", ""),
    )


def _seed_view(seed: FieldSeed) -> dict:
    return {
        "key": seed.key, "label": seed.label.en, "label_ar": seed.label.ar, "kind": seed.kind,
        "applies_to": seed.applies_to,
        "choices": [{"label": c.en, "label_ar": c.ar} for c in seed.choices],
        "shown": seed.shown, "searchable": seed.searchable, "required": seed.required,
        "unit": seed.unit,
    }


def to_template(row: asyncpg.Record | dict) -> ShopTemplate:
    """A stored template as the rest of the program reads one."""
    stored = row["features"] or {}
    overrides = {
        key: (bool(v.get("enabled", True)), dict(v.get("config") or {}))
        for key, v in stored.items() if key in capabilities.SHOWN_KEYS
    }
    features = shop_templates.full_features(overrides)
    alerts = tuple(
        a for a in ALERTS if features[f"{a}_alerts"][0]
    )
    lead = (row["lead_days"], row["lead_cutoff"]) if row["lead_days"] is not None else None
    setup = CatalogSetup(
        section=Text(row["section"], row["section_ar"] or row["section"]),
        sub=Text(row["sub"], row["sub_ar"] or row["sub"]), rule=row["rule"], unit=row["unit"],
        low_stock_at=row["low_stock_at"], sold_out=row["sold_out"], alerts=alerts,
        layout=Layout(row["layout_style"]), focus=tuple(row["focus"] or ()),
        categories=tuple((c["name"], c.get("name_ar", "")) for c in row["categories"] or []),
        gets=(), samples=(), lead=lead,
    )
    return ShopTemplate(
        key=row["key"], name=Text(row["name"], row["name_ar"] or row["name"]),
        based_on=row["based_on"], builtin=False, setup=setup, features=features,
        fields=tuple(_seed(f) for f in row["fields"] or []),
        note=Text(row["note"], row["note_ar"] or row["note"]), offered=row["offered"],
    )


def view(template: ShopTemplate, *, archived: bool = False, shops: int = 0) -> dict:
    """A template (built-in or made here) as the back office's editor reads it."""
    s = template.setup
    return {
        "key": template.key, "name": template.name.en, "name_ar": template.name.ar,
        "note": template.note.en, "note_ar": template.note.ar, "builtin": template.builtin,
        "based_on": template.based_on, "offered": template.offered, "archived": archived,
        "section": s.section.en, "section_ar": s.section.ar, "sub": s.sub.en, "sub_ar": s.sub.ar,
        "layout_style": s.layout.style, "rule": s.rule, "unit": s.unit,
        "low_stock_at": s.low_stock_at, "sold_out": s.sold_out,
        "lead_days": s.lead[0] if s.lead else None, "lead_cutoff": s.lead[1] if s.lead else "",
        "focus": list(s.focus),
        "features": {k: {"enabled": on, "config": config}
                     for k, (on, config) in template.features.items()},
        "categories": [{"name": n, "name_ar": a} for n, a in s.categories],
        "fields": [_seed_view(f) for f in template.fields],
        "shops": shops,
    }


# ── reading ───────────────────────────────────────────────────────────────────────────


async def get(conn: asyncpg.Connection, key: str) -> ShopTemplate | None:
    row = await conn.fetchrow("select * from business_templates where key = $1", key)
    return to_template(row) if row else None


async def archived(conn: asyncpg.Connection, key: str) -> bool:
    return bool(await conn.fetchval(
        "select archived_at is not null from business_templates where key = $1", key))


async def listing(conn: asyncpg.Connection) -> list[dict]:
    """Every template made in the back office, with how many shops use each."""
    rows = await conn.fetch(
        "select * from business_templates order by archived_at is not null, created_at"
    )
    used = {
        r["template_key"]: r["shops"]
        for r in await conn.fetch("select * from admin_template_usage()")
    }
    return [view(to_template(r), archived=r["archived_at"] is not None, shops=used.get(r["key"], 0))
            for r in rows]


def builtin_views() -> list[dict]:
    return [view(t) for t in shop_templates.BUILTIN.values()]


async def every(conn: asyncpg.Connection) -> list[ShopTemplate]:
    """Every template made in the back office that is not archived."""
    rows = await conn.fetch(
        "select * from business_templates where archived_at is null order by created_at")
    return [to_template(r) for r in rows]


async def offered(conn: asyncpg.Connection) -> list[ShopTemplate]:
    """The templates a shop's owner may switch to: made here, offered and not archived."""
    rows = await conn.fetch(
        "select * from business_templates where offered and archived_at is null "
        "order by created_at")
    return [to_template(r) for r in rows]


# ── checking what is saved ────────────────────────────────────────────────────────────


def _text(data: dict, name: str, limit: int, *, needed: bool = False, label: str = "") -> str:
    value = " ".join(str(data.get(name) or "").split())
    if needed and not value:
        raise _err(f"{name}_needed", f"Give the template its {label or name}.",
                   f"اكتب {label or name} للنموذج.")
    if len(value) > limit:
        raise _err(f"{name}_too_long", f"The {label or name} can be up to {limit} letters.",
                   f"يمكن أن يصل {label or name} إلى {limit} حرفاً.")
    return value


def _clean_features(raw: dict | None, rule: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for key, value in (raw or {}).items():
        cap = capabilities.BY_KEY.get(key)
        if cap is None or not cap.built or cap.core or key not in capabilities.SHOWN_KEYS:
            raise _err("unknown_feature", "There is no such feature.", "لا توجد هذه الميزة.")
        on = True if cap.always_on else bool((value or {}).get("enabled", cap.default))
        config = dict(cap.config)
        for name, v in ((value or {}).get("config") or {}).items():
            allowed = cap.choices.get(name)
            if name not in cap.config or (allowed is not None and v not in allowed):
                raise _err("bad_choice", "Choose one of the options shown.",
                           "اختر أحد الخيارات المعروضة.")
            config[name] = v
        out[key] = {"enabled": on, "config": config if cap.config else {}}
    # What a switched-on feature needs must be on too, and the usual way a new item runs out
    # must be one the template allows.
    full = shop_templates.full_features({k: (v["enabled"], v["config"]) for k, v in out.items()})
    for cap in capabilities.SWITCHABLE:
        if full[cap.key][0]:
            for dep in cap.depends_on:
                if not full[dep][0]:
                    raise _err(
                        "feature_needs",
                        f"“{cap.name.en}” needs “{capabilities.BY_KEY[dep].name.en}” switched on.",
                        f"«{cap.name.ar}» تحتاج إلى تشغيل «{capabilities.BY_KEY[dep].name.ar}».")
    needed = capabilities.RULE_FEATURE.get(rule)
    if needed and not full[needed][0]:
        raise _err(
            "rule_off", f"A new item cannot start as “{rule}” while “"
            f"{capabilities.BY_KEY[needed].name.en}” is off.",
            f"لا يمكن أن يبدأ الصنف الجديد بهذه الطريقة والميزة «{capabilities.BY_KEY[needed].name.ar}» متوقفة.")
    return out


def _clean_categories(raw: list[dict] | None) -> list[dict]:
    out, seen = [], set()
    for row in raw or []:
        name = " ".join(str(row.get("name", "")).split())
        name_ar = " ".join(str(row.get("name_ar", "")).split())
        if not name:
            continue
        if len(name) > 60 or len(name_ar) > 60:
            raise _err("category_too_long", "A category name can be up to 60 letters.",
                       "يمكن أن يصل اسم الفئة إلى 60 حرفاً.")
        if name.lower() in seen:
            raise _err("category_twice", f"“{name}” is listed twice.", f"«{name}» مكرر.")
        seen.add(name.lower())
        out.append({"name": name, "name_ar": name_ar})
    if len(out) > MAX_CATEGORIES:
        raise _err("too_many_categories", f"A template can have up to {MAX_CATEGORIES} categories.",
                   f"يمكن أن يحتوي النموذج على {MAX_CATEGORIES} فئة على الأكثر.")
    return out


def _clean_fields(raw: list[dict] | None) -> list[dict]:
    out, keys = [], set()
    for f in raw or []:
        label, label_ar = item_fields._clean_labels(f.get("label", ""), f.get("label_ar", ""))
        kind, applies = f.get("kind", "text"), f.get("applies_to", "item")
        if kind not in item_fields.KINDS or applies not in item_fields.APPLIES:
            raise _err("bad_field", "A starter field has a kind that does not exist.",
                       "لحقل البداية نوع غير موجود.")
        choices = item_fields._clean_choices(f.get("choices")) if kind == "choice" else []
        if kind == "choice" and not choices:
            raise item_fields._err("choices_needed", "Add the choices a customer or you can pick from.",
                                   "أضف الخيارات التي يمكن الاختيار منها.")
        key = f.get("key") or item_fields.slug(label or label_ar)
        if not re.match(r"^[a-z][a-z0-9_]{0,29}$", key):
            key = item_fields.slug(key)
        base, i = key, 1
        while key in keys:
            i += 1
            key = f"{base[:27]}_{i}"
        keys.add(key)
        out.append({
            "key": key, "label": label, "label_ar": label_ar, "kind": kind, "applies_to": applies,
            "choices": [{"label": c["label"], "label_ar": c["label_ar"]} for c in choices],
            "shown": bool(f.get("shown", False)), "searchable": bool(f.get("searchable", False)),
            "required": bool(f.get("required", False)),
            "unit": " ".join(str(f.get("unit", "")).split())[:12] if kind == "number" else "",
        })
    if len(out) > item_fields.MAX_FIELDS:
        raise item_fields._too_many()
    return out


def clean(data: dict[str, Any]) -> dict[str, Any]:
    """The values to store for a template, checked, or a `TemplateError` in both languages."""
    based_on = _text(data, "based_on", 30)
    if based_on and based_on not in presets.PRESET_BY_KEY:
        raise _err("bad_type", "Choose one of ALYR's business types, or none.",
                   "اختر أحد أنواع الأنشطة لدى ALYR أو لا شيء.")
    layout = data.get("layout_style", "grid")
    rule = data.get("rule", "switch")
    unit = data.get("unit", "piece")
    sold_out = data.get("sold_out", "grey")
    if layout not in STYLES or rule not in RULES or unit not in UNITS or sold_out not in (
        "grey", "hide"
    ):
        raise _err("bad_value", "Choose a layout, a way of running out, a unit and a sold-out "
                   "look from the lists.", "اختر التخطيط وطريقة النفاد والوحدة وشكل النفاد من القوائم.")
    low = data.get("low_stock_at", 5)
    if not isinstance(low, int) or isinstance(low, bool) or not 0 <= low <= 100_000:
        raise _err("bad_low_stock", "Choose a low-stock number between 0 and 100,000.",
                   "اختر رقم المخزون القليل بين 0 و100,000.")
    features = _clean_features(data.get("features"), rule)
    full = shop_templates.full_features({k: (v["enabled"], v["config"]) for k, v in features.items()})
    lead_days = data.get("lead_days")
    cutoff = _text(data, "lead_cutoff", 5)
    if lead_days is not None:
        if not isinstance(lead_days, int) or not 0 <= lead_days <= 60:
            raise _err("bad_lead", "Notice is between 0 and 60 days.", "المهلة بين 0 و60 يوماً.")
        if not (full["schedule"][0] and full["pickup_date"][0]):
            raise _err("lead_needs_features",
                       "Notice for new items needs “Times it can be ordered” and “Pickup or "
                       "delivery day” switched on.",
                       "المهلة تحتاج إلى تشغيل «أوقات الطلب» و«يوم الاستلام أو التوصيل».")
    if cutoff and not _TIME.match(cutoff):
        raise _err("bad_cutoff", "Write the last time to order like 18:00.",
                   "اكتب آخر وقت للطلب مثل 18:00.")
    focus = [p for p in data.get("focus") or [] if p in FOCUS_PARTS
             and full[_FOCUS_FEATURE[p]][0]]
    return {
        "name": _text(data, "name", 60, needed=True, label="a name"),
        "name_ar": _text(data, "name_ar", 60), "note": _text(data, "note", 300),
        "note_ar": _text(data, "note_ar", 300), "based_on": based_on,
        "offered": bool(data.get("offered", False)),
        "section": _text(data, "section", 40, needed=True, label="a section name"),
        "section_ar": _text(data, "section_ar", 40), "sub": _text(data, "sub", 200),
        "sub_ar": _text(data, "sub_ar", 200), "layout_style": layout, "rule": rule, "unit": unit,
        "low_stock_at": low, "sold_out": sold_out, "lead_days": lead_days,
        "lead_cutoff": cutoff if lead_days is not None else "", "focus": focus,
        "features": features, "categories": _clean_categories(data.get("categories")),
        "fields": _clean_fields(data.get("fields")),
    }


def key_for(data: dict, taken: set[str]) -> str:
    """The key of a new template: the one asked for, else made from the name; never a built-in's
    and never one that exists."""
    wanted = str(data.get("key") or "").strip().lower()
    base = wanted or re.sub(r"[^a-z0-9]+", "-", str(data.get("name", "")).lower()).strip("-")[:36]
    if not base or not base[0].isalpha():
        base = f"kind-{base}".strip("-")[:36]
    base = base.ljust(3, "x")
    if wanted and (wanted in taken or wanted in shop_templates.BUILTIN or not _KEY.match(wanted)):
        raise _err("key_taken", "That key is not available. Choose another or leave it empty.",
                   "هذا المفتاح غير متاح. اختر غيره أو اتركه فارغاً.")
    key, n = base, 1
    while key in taken or key in shop_templates.BUILTIN:
        n += 1
        key = f"{base[:34]}-{n}"
    return key


# ── writing (back office) ─────────────────────────────────────────────────────────────


_COLUMNS = (
    "name", "name_ar", "note", "note_ar", "based_on", "offered", "section", "section_ar", "sub",
    "sub_ar", "layout_style", "rule", "unit", "low_stock_at", "sold_out", "lead_days",
    "lead_cutoff", "focus", "features", "categories", "fields",
)


async def create(conn: asyncpg.Connection, by: str, data: dict) -> dict:
    values = clean(data)
    taken = {r["key"] for r in await conn.fetch("select key from business_templates")}
    key = key_for(data, taken)
    row = await conn.fetchrow(
        f"insert into business_templates (key, {', '.join(_COLUMNS)}, created_by, updated_by) "
        f"values ($1, {', '.join(f'${n}' for n in range(2, len(_COLUMNS) + 2))}, "
        f"${len(_COLUMNS) + 2}, ${len(_COLUMNS) + 2}) returning *",
        key, *(values[c] for c in _COLUMNS), by,
    )
    return view(to_template(row))


async def update(conn: asyncpg.Connection, by: str, key: str, data: dict) -> dict | None:
    """Save a template's values (the whole template: what is not sent is not kept). A shop that
    already uses it keeps what it has: a template is read when a shop is made or its type is
    changed, and a change of type only adds."""
    if key in shop_templates.BUILTIN:
        raise _err("builtin", "ALYR's own templates cannot be edited. Duplicate one and change "
                   "the copy.", "نماذج ALYR نفسها لا تُعدَّل. انسخ أحدها وعدّل النسخة.")
    values = clean(data)
    sets = ", ".join(f"{c} = ${n}" for n, c in enumerate(_COLUMNS, start=3))
    row = await conn.fetchrow(
        f"update business_templates set {sets}, updated_by = $2, updated_at = now() "
        f"where key = $1 returning *",
        key, by, *(values[c] for c in _COLUMNS),
    )
    return view(to_template(row), archived=row["archived_at"] is not None) if row else None


async def archive(conn: asyncpg.Connection, by: str, key: str, restore: bool = False) -> dict | None:
    row = await conn.fetchrow(
        "update business_templates set archived_at = " + ("null" if restore else "now()")
        + ", updated_by = $2, updated_at = now() where key = $1 returning *", key, by)
    return view(to_template(row), archived=row["archived_at"] is not None) if row else None
