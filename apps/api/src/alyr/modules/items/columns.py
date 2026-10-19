"""The columns of the Catalog's import and export files, and the templates (D-039, ALY-108).

One definition of a column serves four jobs: the header an owner sees in either language,
the other spellings of that header the importer recognises (a supplier's price list, a file
from another system), what the column means for the "How to fill" sheet, and how its
words are written. The Arabic is a draft until a native speaker reviews it (ALY-66); all of
it is in this file and `import_words.py` so a reviewer reads it in two places.

One row of a file is one size or colour of an item. An item with sizes repeats its name on
each row; an item without any is one row.
"""

from dataclasses import dataclass
from decimal import Decimal

from alyr.catalog import Text
from alyr.modules.items import values


@dataclass(frozen=True)
class Column:
    key: str
    en: str
    ar: str
    kind: str  # id readonly text money signed_money whole yesno word date list photos
    aliases: tuple[str, ...]
    width: int
    hint: Text

    def label(self, lang: str) -> str:
        return self.ar if lang == "ar" else self.en


COLUMNS: tuple[Column, ...] = (
    Column(
        "id", "Item ID", "رقم الصنف", "id",
        ("id", "itemid", "item id", "الرقم", "المعرف", "معرف الصنف"), 14,
        Text(
            "Filled in by ALYR when you export. Keep it to update that item; leave it empty "
            "for a new item.",
            "تملؤه ALYR عند التصدير. أبقِه لتحديث الصنف نفسه، واتركه فارغاً لصنف جديد.",
        ),
    ),
    Column(
        "code", "Item code (ALYR)", "كود الصنف (ALYR)", "readonly",
        ("alyr code", "alyr item code", "كود ALYR"), 12,
        Text(
            "The short number ALYR gave the item: customers send it in the chat to order. Only "
            "for reading: it is never changed by a file.",
            "الرقم القصير الذي أعطته ALYR للصنف: يرسله العملاء في المحادثة للطلب. للقراءة فقط: "
            "لا يتغير بأي ملف.",
        ),
    ),
    Column(
        "name", "Name (English)", "الاسم بالإنجليزية", "text",
        ("name", "item", "item name", "product", "product name", "english name", "name en",
         "name english", "title", "اسم", "الاسم", "اسم الصنف", "اسم المنتج", "الصنف", "المنتج",
         "الاسم بالانجليزي", "الاسم بالانجليزية"), 28,
        Text("The item's name in English, up to 120 letters.",
             "اسم الصنف بالإنجليزية، حتى 120 حرفاً."),
    ),
    Column(
        "name_ar", "Name (Arabic)", "الاسم بالعربية", "text",
        ("arabic name", "name ar", "name arabic", "اسم عربي", "الاسم العربي", "الاسم بالعربي",
         "الاسم عربي"), 28,
        Text("The name in Arabic. Needed before the item can go on sale.",
             "الاسم بالعربية. مطلوب قبل عرض الصنف للبيع."),
    ),
    Column(
        "sku", "SKU", "رمز الصنف", "text",
        ("item sku", "item code", "product code", "code", "sku code", "الرمز", "رمز المنتج",
         "كود الصنف", "الكود"), 14,
        Text("Your own code for the item, up to 40 letters. Never used twice in the shop.",
             "رمزك الخاص للصنف، حتى 40 حرفاً. لا يتكرر في المتجر."),
    ),
    Column(
        "category", "Category", "الفئة", "text",
        ("section", "group", "type", "categories", "القسم", "التصنيف", "الفئه", "المجموعة"), 18,
        Text("The group the item is listed under, such as Drinks. A new name makes a new group.",
             "المجموعة التي يُعرض فيها الصنف، مثل المشروبات. الاسم الجديد ينشئ مجموعة جديدة."),
    ),
    Column(
        "price", "Price (QAR)", "السعر (ر.ق)", "money",
        ("price", "price qar", "qar", "qr", "selling price", "unit price", "السعر",
         "سعر البيع", "السعر بالريال", "السعر ريال"), 12,
        Text("In riyals, such as 12.50. Needed to put the item on sale.",
             "بالريال، مثل 12.50. مطلوب لعرض الصنف للبيع."),
    ),
    Column(
        "sale_price", "Sale price (QAR)", "سعر العرض (ر.ق)", "money",
        ("sale price", "sale", "offer price", "discount price", "special price", "سعر العرض",
         "سعر التخفيض", "السعر بعد الخصم"), 14,
        Text("Below the price. Leave empty to keep the sale as it is; write 0 to end it.",
             "أقل من السعر. اتركه فارغاً لإبقاء العرض كما هو؛ اكتب 0 لإنهائه."),
    ),
    Column(
        "sale_starts", "Sale starts", "بداية العرض", "date",
        ("sale start", "sale from", "starts", "من تاريخ العرض", "يبدأ العرض"), 13,
        Text("A date, such as 2026-10-31 or 31/10/2026. Empty means from now.",
             "تاريخ، مثل 2026-10-31 أو 31/10/2026. الفارغ يعني من الآن."),
    ),
    Column(
        "sale_ends", "Sale ends", "نهاية العرض", "date",
        ("sale end", "sale until", "sale to", "ends", "ينتهي العرض", "إلى تاريخ العرض"), 13,
        Text("The last day of the sale. Empty means no end date.",
             "آخر يوم في العرض. الفارغ يعني بلا تاريخ انتهاء."),
    ),
    Column(
        "unit", "Sold by", "يُباع بالـ", "word",
        ("unit", "uom", "unit of measure", "الوحدة", "وحدة البيع", "يباع بال"), 11,
        Text("piece, kg, g, litre, ml, metre, tola, box, pack, portion or hour. Weights and "
             "volumes may be sold in fractions.",
             "قطعة أو كيلو أو غرام أو لتر أو مل أو متر أو تولة أو علبة أو عبوة أو حصة أو ساعة. "
             "الأوزان والأحجام يمكن بيعها بالكسور."),
    ),
    Column(
        "pack_size", "Units in a pack", "عدد الوحدات في العبوة", "quantity",
        ("pack size", "units per pack", "pack", "pack qty", "حجم العبوة", "عدد في العبوة"), 12,
        Text("How many units one pack holds. For something sold by weight or volume, the step "
             "it is ordered in, such as 0.25 (a quarter kilo).",
             "كم وحدة في العبوة الواحدة. وللمباع بالوزن أو الحجم: الخطوة التي يُطلب بها، "
             "مثل 0.25 (ربع كيلو)."),
    ),
    Column(
        "min_order", "Smallest order", "أقل كمية للطلب", "quantity",
        ("minimum order", "min order", "moq", "minimum", "min qty", "الحد الأدنى للطلب",
         "أقل طلب"), 12,
        Text("The least a customer can order, from 1 to 999 (for something sold by weight or "
             "volume it can be a fraction, such as 0.25).",
             "أقل كمية يمكن للعميل طلبها، من 1 إلى 999 (وللمباع بالوزن أو الحجم يمكن أن تكون "
             "كسراً، مثل 0.25)."),
    ),
    Column(
        "tags", "Tags", "الوسوم", "list",
        ("tag", "labels", "label", "keywords", "وسوم", "العلامات", "الكلمات المفتاحية"), 20,
        Text("Words like Halal or Spicy, separated by commas.",
             "كلمات مثل حلال أو حار، يفصل بينها فاصلة."),
    ),
    Column(
        "status", "Status", "الحالة", "word",
        ("state", "الحاله"), 12,
        Text("Draft, On sale, Hidden or Archived. Empty is On sale when the item is complete.",
             "مسودة أو معروض للبيع أو مخفي أو مؤرشف. الفارغ يعني معروض للبيع إن كان الصنف مكتملاً."),
    ),
    Column(
        "rule", "How it runs out", "كيف ينفد", "word",
        ("stock rule", "availability rule", "rule", "stock type", "inventory type",
         "نوع المخزون", "طريقة النفاد"), 20,
        Text("Always available, On or off, Counted in stock, or A number each day. Empty is "
             "Counted when you give a stock number, otherwise On or off.",
             "متاح دائماً أو تشغيل أو إيقاف أو محسوب في المخزون أو عدد في اليوم. الفارغ يعني "
             "محسوباً إن كتبت رقم المخزون، وإلا تشغيل أو إيقاف."),
    ),
    Column(
        "available", "Available", "متاح", "yesno",
        ("availability", "متوفر", "الإتاحة"), 11,
        Text("Yes, or No when it is sold out. Empty keeps it as it is.",
             "نعم، أو لا إذا نفد. الفارغ يبقيه كما هو."),
    ),
    Column(
        "variant", "Size or colour", "المقاس أو اللون", "text",
        ("variant", "size", "colour", "color", "size/colour", "option", "variation", "المقاس",
         "اللون", "الحجم", "النوع", "الخيار"), 16,
        Text("One row for each size or colour of the same item. Leave empty for an item "
             "without any.",
             "صف لكل مقاس أو لون من الصنف نفسه. اتركه فارغاً للصنف الذي ليس له مقاسات."),
    ),
    Column(
        "variant_ar", "Size or colour (Arabic)", "المقاس أو اللون بالعربية", "text",
        ("variant ar", "variant arabic", "size ar", "colour ar", "color ar",
         "المقاس بالعربية", "اللون بالعربية"), 16,
        Text("The same in Arabic.", "الشيء نفسه بالعربية."),
    ),
    Column(
        "variant_sku", "Size or colour SKU", "رمز المقاس أو اللون", "text",
        ("variant sku", "size sku", "colour sku", "color sku", "رمز المقاس", "رمز اللون",
         "كود المقاس"), 16,
        Text("The code of this size or colour, up to 40 letters. Never used twice in the shop.",
             "رمز هذا المقاس أو اللون، حتى 40 حرفاً. لا يتكرر في المتجر."),
    ),
    Column(
        "price_diff", "Price difference (QAR)", "فرق السعر (ر.ق)", "signed_money",
        ("price difference", "price delta", "extra price", "size price difference",
         "فرق السعر", "الفرق في السعر", "زيادة السعر"), 14,
        Text("What this size or colour costs more (or less, with a minus) than the price.",
             "ما يزيد (أو ينقص، بعلامة ناقص) سعر هذا المقاس أو اللون عن السعر."),
    ),
    Column(
        "stock", "In stock", "المخزون", "quantity",
        ("stock", "quantity", "qty", "on hand", "opening stock", "stock qty", "inventory",
         "الكمية", "العدد", "الرصيد", "الكمية المتوفرة"), 11,
        Text("How many you have now (12.5 for 12.5 kg). It is recorded in the stock log as "
             "“Import”.",
             "كم لديك الآن (12.5 لـ 12.5 كغ). يُسجَّل في سجل المخزون بسبب «استيراد»."),
    ),
    Column(
        "low_stock", "Low-stock number", "رقم المخزون القليل", "quantity",
        ("low stock", "low stock at", "low stock level", "reorder level", "reorder point",
         "minimum stock", "min stock", "alert at", "المخزون القليل", "حد المخزون القليل",
         "حد إعادة الطلب"), 13,
        Text("For items counted in stock: the number at or below which ALYR tells you it is "
             "running low (0 to 100,000). Empty keeps the shop's number from Catalog settings.",
             "للأصناف المحسوبة في المخزون: الرقم الذي تنبهك ALYR عنده أو دونه بأن المخزون قليل "
             "(من 0 إلى 100,000). الفارغ يبقي رقم المتجر من إعدادات الكتالوج."),
    ),
    Column(
        "per_day", "Per day", "العدد اليومي", "quantity",
        ("daily limit", "per day", "daily", "daily quantity", "الحد اليومي", "كل يوم", "في اليوم"),
        11,
        Text("For items with a number each day: how many can be sold in a day.",
             "للأصناف التي لها عدد في اليوم: كم يمكن بيعه في اليوم."),
    ),
    Column(
        "description", "Description", "الوصف", "text",
        ("details", "description en", "english description", "وصف", "التفاصيل"), 34,
        Text("A sentence or two for the customer, in English.",
             "جملة أو جملتان للعميل بالإنجليزية."),
    ),
    Column(
        "description_ar", "Description (Arabic)", "الوصف بالعربية", "text",
        ("description ar", "arabic description", "الوصف العربي", "الوصف بالعربي"), 34,
        Text("The same in Arabic.", "الشيء نفسه بالعربية."),
    ),
    Column(
        "photo", "Photos", "الصور", "photos",
        ("photo", "image", "images", "picture", "pictures", "photo file", "file name",
         "filename", "صورة", "الصورة", "اسم الصورة", "اسم ملف الصورة", "ملف الصورة"), 24,
        Text("The photo file names, such as shawarma.jpg, separated by commas (the first is the "
             "cover). Upload a zip of the photos with the file. A web link is not downloaded.",
             "أسماء ملفات الصور، مثل shawarma.jpg، يفصل بينها فاصلة (الأولى هي الغلاف). ارفع "
             "ملف zip للصور مع الملف. روابط الويب لا تُنزَّل."),
    ),
)

BY_KEY = {c.key: c for c in COLUMNS}
ORDER = tuple(c.key for c in COLUMNS)
# Which kinds of column are numbers in the file (a spreadsheet gets a number cell).
MONEY = ("price", "sale_price", "price_diff")
WHOLE = ("code",)
# Numbers of units: a whole number, or up to three decimals for something sold by weight or
# volume (ALY-149).
QUANTITY = ("pack_size", "min_order", "stock", "low_stock", "per_day")
# The stock rules that count; the low-stock number means something only for these.
COUNTED = ("count", "daily_limit")


# The feature a column belongs to (ALY-148). A column of a feature that is off is left out of
# the files, unless an item of the shop still uses the feature (its data is then still in the
# file, so a round trip loses nothing). The rest are every shop's.
NEEDS: dict[str, str] = {
    "variant": "variants", "variant_ar": "variants", "variant_sku": "variants",
    "price_diff": "variants", "pack_size": "pack_rules|decimal_quantity",
    "min_order": "pack_rules|decimal_quantity",
    "tags": "tags", "available": "rule_switch", "stock": "rule_count",
    "per_day": "rule_daily_limit", "low_stock": "rule_count|rule_daily_limit",
}


def allowed(keeps) -> tuple[str, ...]:
    """The columns a shop's files have, in order. `keeps(feature)` says whether the feature
    is on or still used."""
    return tuple(
        k for k in ORDER
        if k not in NEEDS or any(keeps(feature) for feature in NEEDS[k].split("|"))
    )


def custom_column(field: dict) -> Column:
    """The column of one of the shop's own fields (ALY-148). Its key is `custom:<key>`; its
    headers are the field's names, and the field's key is another spelling the importer knows."""
    en = field["label"] or field["label_ar"]
    ar = field["label_ar"] or field["label"]
    where = ("on each size or colour", "على كل مقاس أو لون") if field["applies_to"] == "variant" \
        else ("on the item", "على الصنف")
    kinds = {
        "text": ("Text, up to 200 letters", "نص حتى 200 حرف"),
        "number": ("A number" + (f" ({field['unit']})" if field["unit"] else ""),
                   "رقم" + (f" ({field['unit']})" if field["unit"] else "")),
        "choice": ("One of: " + ", ".join(c["label"] or c["label_ar"] for c in field["choices"]
                                          if c["active"]),
                   "واحد من: " + "، ".join(c["label_ar"] or c["label"] for c in field["choices"]
                                           if c["active"])),
        "yes_no": ("Yes or No", "نعم أو لا"),
        "date": ("A date, such as 2026-10-31", "تاريخ، مثل 2026-10-31"),
    }[field["kind"]]
    return Column(
        f"custom:{field['key']}", en, ar, "custom", (field["key"],), 18,
        Text(f"Your own field, {where[0]}. {kinds[0]}.", f"حقلك الخاص، {where[1]}. {kinds[1]}."),
    )


def custom_columns(fields: list[dict]) -> dict[str, Column]:
    """The columns of a shop's active fields, by their `custom:` key, in the owner's order."""
    return {col.key: col for col in (custom_column(f) for f in fields if not f["archived"])}


def custom_index(columns_: dict[str, Column]) -> dict[str, str]:
    """Every spelling of every custom header, squashed, mapped to its column's key. A header the
    fixed columns already know is theirs: a field cannot be named like one."""
    found: dict[str, str] = {}
    for col in columns_.values():
        for spelling in (col.en, col.ar, *col.aliases):
            found.setdefault(values.squash(spelling), col.key)
    return found


def header_index() -> dict[str, str]:
    """Every spelling of every header, squashed, mapped to the column it names."""
    found: dict[str, str] = {}
    for column in COLUMNS:
        for spelling in (column.en, column.ar, column.key, *column.aliases):
            found.setdefault(values.squash(spelling), column.key)
    return found


HEADERS = header_index()


def column_for(header: object) -> str | None:
    return HEADERS.get(values.squash(values.as_text(header)))


# ── the words in the cells ────────────────────────────────

# key: (English as shown in a file, Arabic as shown in a file, other spellings accepted)
WORDS: dict[str, dict[str, tuple[str, ...]]] = {
    "unit": {
        "piece": ("Piece", "قطعة", "pc", "pcs", "each", "unit", "حبة"),
        "kg": ("Kilo", "كيلو", "kg", "kilogram", "kgs", "كغ", "كجم", "كيلوغرام", "كيلوجرام"),
        "box": ("Box", "علبة", "boxes", "صندوق", "كرتون"),
        "pack": ("Pack", "عبوة", "packet", "packs", "باكيت", "رزمة"),
        "portion": ("Portion", "حصة", "serving", "servings", "meal", "وجبة", "طبق"),
        "hour": ("Hour", "ساعة", "hr", "hrs", "hours"),
        "g": ("Gram", "غرام", "g", "gm", "gms", "grams", "gram", "غ", "جرام", "غم"),
        "l": ("Litre", "لتر", "l", "ltr", "liter", "litres", "liters", "ليتر"),
        "ml": ("Millilitre", "مليلتر", "ml", "mls", "millilitre", "milliliter", "مل", "ملل"),
        "m": ("Metre", "متر", "m", "mtr", "meter", "metres", "meters", "م"),
        "tola": ("Tola", "تولة", "tola", "tolas", "تولا", "توله"),
    },
    "status": {
        "draft": ("Draft", "مسودة", "مسوده"),
        "live": ("On sale", "معروض للبيع", "live", "active", "published", "for sale", "معروض",
                 "للبيع", "نشط", "منشور"),
        "hidden": ("Hidden", "مخفي", "مخفى"),
        "archived": ("Archived", "مؤرشف", "archive", "أرشيف", "مؤرشفة"),
    },
    "rule": {
        "always": ("Always available", "متاح دائماً", "always", "made to order", "دائما"),
        "switch": ("On or off", "تشغيل أو إيقاف", "on/off", "switch", "toggle", "مفتاح"),
        "count": ("Counted in stock", "محسوب في المخزون", "counted", "count", "by count",
                  "بالعدد", "محسوب"),
        "daily_limit": ("A number each day", "عدد في اليوم", "daily limit", "per day", "daily",
                        "حد يومي", "عدد يومي"),
    },
}
YESNO = {"en": ("Yes", "No"), "ar": ("نعم", "لا")}


def word_for(group: str, key: str, lang: str) -> str:
    """The word a file shows for a stored value, in the file's language."""
    english, arabic, *_ = WORDS[group][key]
    return arabic if lang == "ar" else english


def parse_word_cell(group: str, cell: object, code: str) -> str:
    return values.parse_word(cell, WORDS[group], code)


def choices(group: str, lang: str) -> tuple[str, ...]:
    return tuple(word_for(group, k, lang) for k in WORDS[group])


# ── templates by type of business ─────────────────────────

@dataclass(frozen=True)
class Kind:
    key: str
    name: Text
    columns: tuple[str, ...]
    # Each example is column key -> a value in the units of the file (riyals, whole numbers,
    # a stored key for a word). The names are made up.
    examples: tuple[dict, ...]
    note: Text


def _d(value: str) -> Decimal:
    return Decimal(value)


KINDS: tuple[Kind, ...] = (
    Kind(
        "generic", Text("Any business", "أي نشاط"),
        ("name", "name_ar", "sku", "category", "price", "variant", "variant_ar", "variant_sku",
         "price_diff", "stock", "description", "description_ar", "photo"),
        (
            {"name": "Cotton scarf", "name_ar": "وشاح قطني", "sku": "SCARF",
             "category": "Accessories", "price": _d("45"), "variant": "Blue", "variant_ar": "أزرق",
             "variant_sku": "SCARF-BLU", "stock": 12, "description": "Soft cotton, 180 cm.",
             "description_ar": "قطن ناعم، 180 سم.", "photo": "cotton-scarf.jpg"},
            {"name": "Cotton scarf", "name_ar": "وشاح قطني", "variant": "Grey",
             "variant_ar": "رمادي", "variant_sku": "SCARF-GRY", "stock": 7},
            {"name": "Ceramic mug", "name_ar": "كوب خزفي", "sku": "MUG-01", "category": "Home",
             "price": _d("25.50"), "stock": 30},
        ),
        Text("Use this one if your business is not listed.",
             "استخدم هذا النموذج إن لم يكن نشاطك في القائمة."),
    ),
    Kind(
        "restaurant", Text("Restaurant and café", "مطعم ومقهى"),
        ("name", "name_ar", "category", "price", "sale_price", "description", "description_ar",
         "tags", "rule", "available", "per_day", "photo"),
        (
            {"name": "Chicken shawarma", "name_ar": "شاورما دجاج", "category": "Wraps",
             "price": _d("14"), "description": "Chicken, garlic sauce, pickles.",
             "description_ar": "دجاج وثوم ومخلل.", "tags": "Halal", "rule": "switch",
             "available": True, "photo": "chicken-shawarma.jpg"},
            {"name": "Lentil soup", "name_ar": "شوربة عدس", "category": "Starters",
             "price": _d("9"), "sale_price": _d("7.50"), "tags": "Halal, Vegetarian",
             "rule": "daily_limit", "per_day": 40},
            {"name": "Mint lemonade", "name_ar": "ليمون بالنعناع", "category": "Drinks",
             "price": _d("12"), "rule": "switch", "available": True},
        ),
        Text("One row for each dish or drink. Sizes and extras are set on screen.",
             "صف لكل طبق أو مشروب. المقاسات والإضافات تُضبط من الشاشة."),
    ),
    Kind(
        "bakery", Text("Bakery and home kitchen", "مخبز ومطبخ منزلي"),
        ("name", "name_ar", "category", "price", "variant", "variant_ar", "price_diff",
         "rule", "per_day", "description", "description_ar", "tags", "photo"),
        (
            {"name": "Date cake", "name_ar": "كيك التمر", "category": "Cakes",
             "price": _d("60"), "variant": "Small", "variant_ar": "صغير",
             "rule": "daily_limit", "per_day": 6, "tags": "Halal"},
            {"name": "Date cake", "name_ar": "كيك التمر", "variant": "Large",
             "variant_ar": "كبير", "price_diff": _d("40"), "per_day": 3},
            {"name": "Cheese croissant", "name_ar": "كرواسون الجبن", "category": "Pastry",
             "price": _d("8"), "rule": "daily_limit", "per_day": 50},
        ),
        Text("A daily number is how many you can make each day.",
             "العدد اليومي هو ما تستطيع تحضيره كل يوم."),
    ),
    Kind(
        "grocery", Text("Grocery and baqala", "بقالة"),
        ("name", "name_ar", "sku", "category", "price", "unit", "pack_size", "min_order", "stock",
         "low_stock", "tags", "photo"),
        (
            {"name": "Basmati rice 5 kg", "name_ar": "أرز بسمتي 5 كجم", "sku": "RICE-5KG",
             "category": "Rice", "price": _d("38"), "unit": "pack", "stock": 24,
             "low_stock": 6},
            {"name": "Fresh tomatoes", "name_ar": "طماطم طازجة", "sku": "TOM-KG",
             "category": "Vegetables", "price": _d("4.50"), "unit": "kg", "min_order": 1,
             "stock": 60},
            {"name": "Mineral water 12 pack", "name_ar": "مياه معدنية 12 عبوة", "sku": "WAT-12",
             "category": "Drinks", "price": _d("11"), "unit": "pack", "pack_size": 12,
             "stock": 40},
        ),
        Text("The stock number is how many of the unit you have.",
             "رقم المخزون هو عدد الوحدات التي لديك."),
    ),
    Kind(
        "fashion", Text("Fashion and gifts", "أزياء وهدايا"),
        ("name", "name_ar", "sku", "category", "price", "sale_price", "variant", "variant_ar",
         "variant_sku", "price_diff", "stock", "description", "description_ar", "photo"),
        (
            {"name": "Black abaya", "name_ar": "عباية سوداء", "sku": "ABY-BLK",
             "category": "Abayas", "price": _d("260"), "variant": "52", "variant_ar": "52",
             "variant_sku": "ABY-BLK-52", "stock": 4,
             "description": "Crepe, hidden buttons.", "description_ar": "كريب بأزرار مخفية.",
             "photo": "black-abaya.jpg"},
            {"name": "Black abaya", "name_ar": "عباية سوداء", "variant": "54",
             "variant_ar": "54", "variant_sku": "ABY-BLK-54", "stock": 6},
            {"name": "Gift box", "name_ar": "علبة هدايا", "sku": "GFT-01", "category": "Gifts",
             "price": _d("85"), "sale_price": _d("70"), "stock": 15},
        ),
        Text("One row for each size or colour of the same item.",
             "صف لكل مقاس أو لون من الصنف نفسه."),
    ),
    Kind(
        "shop", Text("Shop and retail", "متجر"),
        ("name", "name_ar", "sku", "category", "price", "sale_price", "variant", "variant_ar",
         "variant_sku", "price_diff", "stock", "low_stock", "description", "description_ar",
         "tags", "photo"),
        (
            {"name": "Phone case", "name_ar": "غطاء هاتف", "sku": "CASE",
             "category": "Accessories", "price": _d("30"), "variant": "Black",
             "variant_ar": "أسود", "variant_sku": "CASE-BLK", "stock": 20, "low_stock": 4},
            {"name": "Phone case", "name_ar": "غطاء هاتف", "variant": "Clear",
             "variant_ar": "شفاف", "variant_sku": "CASE-CLR", "stock": 14},
            {"name": "Desk lamp", "name_ar": "مصباح مكتب", "sku": "LAMP-01", "category": "Home",
             "price": _d("75"), "stock": 9, "description": "LED, three brightness levels.",
             "description_ar": "ليد بثلاث درجات إضاءة."},
        ),
        Text("One row for each size or colour of the same item.",
             "صف لكل مقاس أو لون من الصنف نفسه."),
    ),
    Kind(
        "wholesale", Text("Wholesale and trading", "جملة وتجارة"),
        ("name", "name_ar", "sku", "category", "price", "unit", "pack_size", "min_order", "stock",
         "low_stock", "photo"),
        (
            {"name": "A4 paper, box of 5 reams", "name_ar": "ورق A4، كرتون 5 رزم",
             "sku": "PAP-A4-5", "category": "Stationery", "price": _d("96"), "unit": "box",
             "pack_size": 5, "min_order": 10, "stock": 400, "low_stock": 50},
            {"name": "Stainless steel pot 24 cm", "name_ar": "قدر ستانلس 24 سم",
             "sku": "POT-SS-24", "category": "Kitchenware", "price": _d("55"), "unit": "piece",
             "min_order": 6, "stock": 150},
            {"name": "Cleaning liquid 4 L", "name_ar": "سائل تنظيف 4 لتر", "sku": "CLN-4L",
             "category": "Cleaning", "price": _d("17.50"), "unit": "pack", "pack_size": 4,
             "min_order": 12, "stock": 300},
        ),
        Text("Prices here are the usual price. Prices for groups of customers are not in the file.",
             "الأسعار هنا هي السعر المعتاد. أسعار مجموعات العملاء ليست في الملف."),
    ),
    Kind(
        "services", Text("Services and products", "خدمات ومنتجات"),
        ("name", "name_ar", "category", "price", "unit", "rule", "description",
         "description_ar", "photo"),
        (
            {"name": "Haircut", "name_ar": "قص شعر", "category": "Hair", "price": _d("60"),
             "unit": "piece", "rule": "always"},
            {"name": "Home AC check", "name_ar": "فحص مكيف منزلي", "category": "Home visits",
             "price": _d("120"), "unit": "hour", "rule": "always",
             "description": "Includes a written report.",
             "description_ar": "يشمل تقريراً مكتوباً."},
            {"name": "Hair serum", "name_ar": "سيروم للشعر", "category": "Products",
             "price": _d("48"), "rule": "count"},
        ),
        Text("Services you sell by time are booked in Bookings; this file is for what you "
             "also list for ordering.",
             "الخدمات التي تُباع بالموعد تُحجز من الحجوزات؛ هذا الملف لما تعرضه للطلب أيضاً."),
    ),
)
KIND_BY_KEY = {k.key: k for k in KINDS}

# Template names are matched against the business type a shop signed up as.
KIND_OF_BUSINESS = {
    "restaurant": "restaurant", "shop": "shop", "wholesale": "wholesale",
    "salon": "services", "spa": "services", "clinic": "services", "home": "services",
    "bakery": "bakery", "grocery": "grocery", "fashion": "fashion",
}

# A row whose two names are both an example's is most likely an example left in the file.
EXAMPLE_PAIRS = {
    (values.squash(row["name"]), values.squash(row["name_ar"]))
    for kind in KINDS for row in kind.examples
}


def kind_for(business_type: str | None) -> Kind:
    return KIND_BY_KEY[KIND_OF_BUSINESS.get((business_type or "").lower(), "generic")]
