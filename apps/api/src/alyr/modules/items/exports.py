"""The files an owner downloads: the shop's items, and the empty templates (D-039, ALY-108).

An export is what the import reads: one row for each size or colour of an item, the item's
own columns repeated on each, its `Item ID` first, so a file edited in Excel and uploaded
again updates the same items. It holds everything an owner can see on the Catalog screen:
names, prices, sale, unit, stock, categories, tags, status and a link to each photo.

Any text that a spreadsheet could take for a formula (it starts with = + - @, a tab or a
return) is written with a leading apostrophe, which Excel shows as nothing and does not run;
the import takes the apostrophe off again. Numbers are written as numbers, so a price of
-2 stays a number.
"""

from decimal import Decimal

from alyr.modules.items import columns, costs, fields, service, xlsx
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.sheets import write_csv

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CSV_TYPE = "text/csv; charset=utf-8"
FORMATS = ("xlsx", "csv")

_RISKY = ("=", "+", "-", "@", "\t", "\r")


def safe_text(text: str) -> str:
    """Text for a cell, with an apostrophe in front when a spreadsheet might run it."""
    return "'" + text if text.startswith(_RISKY) else text


def _money(dirhams: int | None) -> Decimal | None:
    return None if dirhams is None else Decimal(dirhams) / 100


def _day(moment, clock: ShopClock) -> str | None:
    return moment.astimezone(clock.tz).date().isoformat() if moment else None


def _custom_cell(field_: dict, raw: object, lang: str) -> object:
    """One of the shop's own fields' values, as a cell: a number as a number, a choice by its
    name in the file's language, yes or no as words, a date as written, text made safe."""
    if raw is None:
        return None
    if field_["kind"] == "number":
        return Decimal(str(raw))
    if field_["kind"] == "yes_no":
        return columns.YESNO["ar" if lang == "ar" else "en"][0 if raw else 1]
    if field_["kind"] == "choice":
        return safe_text(fields.say(field_, raw, lang))
    return safe_text(str(raw))


def item_rows(
    entries: list[service.Loaded], clock: ShopClock, covers: dict[str, list[str]], lang: str,
    keys: tuple[str, ...] = columns.ORDER, own: list[dict] | None = None,
    kept: dict | None = None,
) -> list[list[object]]:
    """Rows of values, one per size or colour, in the order of `keys`. `covers` maps an
    item's ID to the web addresses of its photos, cover first. `own` are the shop's own fields
    (a `custom:<key>` column each)."""
    out: list[list[object]] = []
    defs = fields.by_key(own or [])
    yes, no = columns.YESNO["ar" if lang == "ar" else "en"]
    for entry in entries:
        i = entry.item
        active = [v for v in entry.variants if v["active"]]
        named = any(v["name"] or v["name_ar"] for v in active)
        rows = active if named else (active[:1] or [None])
        for n, v in enumerate(rows):
            cells: dict[str, object] = {
                "id": str(i["id"]), "code": i["code"],
                "name": safe_text(i["name"]), "name_ar": safe_text(i["name_ar"]),
                "sku": safe_text(i["sku"]),
                "category": safe_text(i["category"]),
                "price": _money(i["price"]), "sale_price": _money(i["sale_price"]),
                "sale_starts": _day(i["sale_starts_at"], clock) if i["sale_price"] else None,
                "sale_ends": _day(i["sale_ends_at"], clock) if i["sale_price"] else None,
                "unit": columns.word_for("unit", i["unit"], lang),
                "pack_size": i["pack_size"], "min_order": i["min_order"],
                "tags": safe_text(", ".join(i["tags"])),
                "status": columns.word_for("status", i["status"], lang),
                "rule": columns.word_for("rule", i["stock_rule"], lang),
                "available": yes if i["available"] else no,
                "variant": safe_text(v["name"]) if v and named else "",
                "variant_ar": safe_text(v["name_ar"]) if v and named else "",
                "variant_sku": safe_text(v["sku"]) if v else "",
                "price_diff": _money(v["price_delta"]) if v and named else None,
                "stock": v["on_hand"] if v and i["stock_rule"] == "count" else None,
                "low_stock": (
                    i["low_stock_at"] if i["stock_rule"] in columns.COUNTED else None
                ),
                "per_day": v["daily_limit"] if v and i["stock_rule"] == "daily_limit" else None,
                "description": safe_text(i["description"]),
                "description_ar": safe_text(i["description_ar"]),
                "photo": safe_text(", ".join(covers.get(str(i["id"]), []))) if n == 0 else "",
            }
            if "cost" in keys and kept is not None:
                # What one unit of this size costs: its own cost, else the item's.
                own_id = v["id"] if v and named else None
                cells["cost"] = _money(costs.effective(kept, i["id"], own_id))
            for k in keys:
                if k.startswith("custom:") and k[7:] in defs:
                    mine = defs[k[7:]]
                    holder = i if mine["applies_to"] == "item" else v
                    held = holder["custom"] if holder else {}
                    cells[k] = _custom_cell(mine, (held or {}).get(mine["key"]), lang)
            out.append([cells.get(k) for k in keys])
    return out


def _styles(keys: tuple[str, ...]) -> list[int]:
    return [
        xlsx.MONEY if k in columns.MONEY else xlsx.WHOLE if k in columns.WHOLE else xlsx.DEFAULT
        for k in keys
    ]


def _by_key(own: list[dict] | None) -> dict[str, columns.Column]:
    return {**columns.BY_KEY, **columns.custom_columns(own or [])}


def _specs(
    keys: tuple[str, ...], lang: str, with_choices: bool = False, own: list[dict] | None = None
) -> list[xlsx.Column]:
    out = []
    found = _by_key(own)
    for k in keys:
        choices: tuple[str, ...] = ()
        if with_choices and k in ("unit", "status", "rule"):
            choices = columns.choices(k, lang)
        elif with_choices and k == "available":
            choices = columns.YESNO["ar" if lang == "ar" else "en"]
        out.append(xlsx.Column(found[k].width, choices))
    return out


def _headers(keys: tuple[str, ...], lang: str, own: list[dict] | None = None) -> list[object]:
    found = _by_key(own)
    return [found[k].label(lang) for k in keys]


def export_file(
    entries: list[service.Loaded], clock: ShopClock, covers: dict[str, list[str]], lang: str,
    fmt: str, keys: tuple[str, ...] = columns.ORDER, own: list[dict] | None = None,
    kept: dict | None = None,
) -> tuple[bytes, str, str]:
    """(bytes, file name, content type) for every item of the shop, with the columns its
    features give it (`keys`) and one for each of its own fields (`own`)."""
    keys = (*keys, *columns.custom_columns(own or []))
    body = item_rows(entries, clock, covers, lang, keys, own, kept)
    stamp = clock.today.isoformat()
    if fmt == "csv":
        data = write_csv([_headers(keys, lang, own), *body])
        return data, f"alyr-items-{stamp}.csv", CSV_TYPE
    sheet = xlsx.SheetSpec(
        "الأصناف" if lang == "ar" else "Items", [_headers(keys, lang, own), *body],
        _specs(keys, lang, own=own), right_to_left=lang == "ar", column_styles=_styles(keys),
    )
    return xlsx.write([sheet]), f"alyr-items-{stamp}.xlsx", XLSX_TYPE


# ── the templates ─────────────────────────────────────────

INSTRUCTIONS = {
    "title": ("How to fill in this file", "كيف تملأ هذا الملف"),
    "lines": (
        ("One row is one item. An item with sizes or colours has one row for each size or "
         "colour: write its name on every row.",
         "كل صف صنف واحد. الصنف الذي له مقاسات أو ألوان يكون له صف لكل مقاس أو لون: اكتب "
         "اسمه في كل صف."),
        ("The grey rows are examples. Delete them, then add your own items.",
         "الصفوف الرمادية أمثلة. احذفها ثم أضف أصنافك."),
        ("Every item needs a name in English and in Arabic, and a price, to go on sale. "
         "Without them it is saved as a draft that you can finish later.",
         "يحتاج كل صنف إلى اسم بالإنجليزية وبالعربية وإلى سعر ليُعرض للبيع. بدونها يُحفظ "
         "كمسودة تكملها لاحقاً."),
        ("Prices are in riyals, like 12.50. You can write numbers with Arabic or English "
         "digits.",
         "الأسعار بالريال، مثل 12.50. يمكنك كتابة الأرقام بالأرقام العربية أو الإنجليزية."),
        ("Stock numbers are recorded in the stock log with the reason “Import”.",
         "تُسجَّل أرقام المخزون في سجل المخزون بسبب «استيراد»."),
        ("To update items you already have, export them first: the file then carries each "
         "item's ID. Leave a cell empty to keep what ALYR has.",
         "لتحديث أصناف لديك، صدّرها أولاً: يحمل الملف رقم كل صنف. اترك الخلية فارغة للإبقاء على "
         "ما في ALYR."),
        ("Photos: write the file names (for example shawarma.jpg) and upload a zip of the "
         "photos with this file.",
         "الصور: اكتب أسماء الملفات (مثل shawarma.jpg) وارفع ملف zip للصور مع هذا الملف."),
        ("Formulas are never calculated. Write plain values.",
         "لا تُحسب المعادلات أبداً. اكتب قيماً عادية."),
    ),
    "column": ("Column", "العمود"),
    "meaning": ("What goes in it", "ما يُكتب فيه"),
}


def _instructions(
    kind: columns.Kind, keys: tuple[str, ...], lang: str, own: list[dict] | None = None
) -> xlsx.SheetSpec:
    n = 1 if lang == "ar" else 0
    rows: list[list[object]] = [[INSTRUCTIONS["title"][n]], [kind.note.get(lang)], [""]]
    rows += [[line[n]] for line in INSTRUCTIONS["lines"]]
    rows += [[""], [INSTRUCTIONS["column"][n], INSTRUCTIONS["meaning"][n]]]
    rows += [
        [_by_key(own)[k].label(lang), _by_key(own)[k].hint.get(lang)] for k in keys
    ]
    return xlsx.SheetSpec(
        "كيف تملأ" if lang == "ar" else "How to fill", rows,
        [xlsx.Column(34), xlsx.Column(100)], right_to_left=lang == "ar",
        column_styles=[xlsx.NOTE, xlsx.NOTE],
    )


def _example_value(key: str, value: object, lang: str) -> object:
    if key in ("unit", "status", "rule") and isinstance(value, str):
        return columns.word_for(key, value, lang)
    if key == "available" and isinstance(value, bool):
        return columns.YESNO["ar" if lang == "ar" else "en"][0 if value else 1]
    return value


def template_file(
    kind_key: str, lang: str, fmt: str, allowed: tuple[str, ...] | None = None,
    own: list[dict] | None = None,
) -> tuple[bytes, str, str]:
    """An empty file for one type of business, with its columns in the owner's language and
    three made-up example rows. `allowed` leaves out the columns of features the shop has
    switched off."""
    kind = columns.KIND_BY_KEY.get(kind_key) or columns.KIND_BY_KEY["generic"]
    keys = [k for k in kind.columns if allowed is None or k in allowed]
    if allowed is not None and "cost" in allowed:
        keys.append("cost")  # (the person may see costs and the shop keeps them)
    keys = (*keys, *columns.custom_columns(own or []))
    examples = [
        [_example_value(k, row.get(k), lang) for k in keys] for row in kind.examples
    ]
    name = f"alyr-items-template-{kind.key}-{'ar' if lang == 'ar' else 'en'}"
    if fmt == "csv":
        return write_csv([_headers(keys, lang, own), *examples]), f"{name}.csv", CSV_TYPE
    sheet = xlsx.SheetSpec(
        "الأصناف" if lang == "ar" else "Items", [_headers(keys, lang, own), *examples],
        _specs(keys, lang, with_choices=True, own=own), right_to_left=lang == "ar",
        column_styles=_styles(keys), example_rows=set(range(1, 1 + len(examples))),
    )
    return xlsx.write([sheet, _instructions(kind, keys, lang, own)]), f"{name}.xlsx", XLSX_TYPE


def kinds(lang: str) -> list[dict]:
    """The templates on offer, named in the owner's language."""
    return [
        {"key": k.key, "name": k.name.get(lang), "note": k.note.get(lang)}
        for k in columns.KINDS
    ]

