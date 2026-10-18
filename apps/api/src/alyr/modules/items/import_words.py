"""What the import tells the owner about each row, in English and Arabic (D-039, ALY-108).

Every note about a row or a file has a stable `code` (for a screen to act on), a level, and
a sentence in both languages built from the code and its details, so the two never
disagree. The levels:

* `error`: the row cannot be imported and is left out; the rest of the file is not affected;
* `warning`: the row is imported, and the owner should know something about it;
* `info`: said so nothing is a surprise (a name was filled in from the other language).

The Arabic has not been reviewed by a native speaker (ALY-66).
"""

from dataclasses import dataclass

from alyr.modules.items import columns

# code: (level, English, Arabic). {column} is a column's header in the sentence's language;
# the other braces are filled from the details the importer gives.
MESSAGES: dict[str, tuple[str, str, str]] = {
    # ── the row cannot be imported ──
    "name_needed": (
        "error",
        "This row has no name. Give it a name in English or Arabic.",
        "هذا الصف بلا اسم. اكتب له اسماً بالعربية أو الإنجليزية.",
    ),
    "too_long": (
        "error",
        "{column} is too long: the most is {max} letters.",
        "{column} طويل جداً: الحد الأقصى {max} حرفاً.",
    ),
    "bad_money": (
        "error",
        "{column}: “{value}” is not a price. Write it like 12 or 12.50.",
        "{column}: «{value}» ليس سعراً. اكتبه مثل 12 أو 12.50.",
    ),
    "money_decimals": (
        "error",
        "{column}: “{value}” has more than two decimals. A riyal is 100 dirhams, so use at "
        "most two.",
        "{column}: «{value}» فيه أكثر من خانتين عشريتين. الريال 100 درهم، فاستخدم خانتين على "
        "الأكثر.",
    ),
    "ambiguous_number": (
        "error",
        "{column}: “{value}” could mean two different amounts. Write it plainly, like 1250 or "
        "1.25.",
        "{column}: «{value}» قد يعني مبلغين مختلفين. اكتبه بوضوح، مثل 1250 أو 1.25.",
    ),
    "negative_money": (
        "error",
        "{column}: “{value}” cannot be below zero.",
        "{column}: «{value}» لا يمكن أن يكون أقل من صفر.",
    ),
    "money_too_big": (
        "error",
        "{column}: “{value}” is more than the most allowed, QAR 1,000,000.",
        "{column}: «{value}» أكبر من الحد الأقصى المسموح، 1,000,000 ر.ق.",
    ),
    "bad_number": (
        "error",
        "{column}: “{value}” is not a number.",
        "{column}: «{value}» ليس رقماً.",
    ),
    "not_whole": (
        "error",
        "{column}: “{value}” must be a whole number.",
        "{column}: «{value}» يجب أن يكون عدداً صحيحاً.",
    ),
    "out_of_range": (
        "error",
        "{column}: “{value}” must be between {low} and {high}.",
        "{column}: «{value}» يجب أن يكون بين {low} و{high}.",
    ),
    "bad_yes_no": (
        "error",
        "{column}: write Yes or No, not “{value}”.",
        "{column}: اكتب نعم أو لا، وليس «{value}».",
    ),
    "bad_word": (
        "error",
        "{column}: “{value}” is not one of: {allowed}.",
        "{column}: «{value}» ليس من: {allowed}.",
    ),
    "bad_date": (
        "error",
        "{column}: “{value}” is not a date. Write it like 2026-10-31 or 31/10/2026.",
        "{column}: «{value}» ليس تاريخاً. اكتبه مثل 2026-10-31 أو 31/10/2026.",
    ),
    "sale_not_below": (
        "error",
        "The sale price must be below the price.",
        "يجب أن يكون سعر العرض أقل من السعر.",
    ),
    "sale_dates": (
        "error",
        "The sale must end after it starts, and a sale needs a sale price.",
        "يجب أن ينتهي العرض بعد بدايته، ويحتاج العرض إلى سعر عرض.",
    ),
    "variant_needs_name": (
        "error",
        "This item has sizes or colours, so every row needs the size or colour it is for.",
        "لهذا الصنف مقاسات أو ألوان، لذلك يحتاج كل صف إلى المقاس أو اللون الذي يخصه.",
    ),
    "duplicate_variant": (
        "error",
        "The size or colour “{value}” is on this item twice (row {rows}).",
        "المقاس أو اللون «{value}» مكرر في هذا الصنف (الصف {rows}).",
    ),
    "too_many_variants": (
        "error",
        "An item can have up to {max} sizes or colours.",
        "يمكن أن يكون للصنف حتى {max} مقاساً أو لوناً.",
    ),
    "too_many_tags": (
        "error",
        "Tags: use at most {max_tags} tags of {max} letters each.",
        "الوسوم: استخدم {max_tags} وسماً على الأكثر، وكل وسم حتى {max} حرفاً.",
    ),
    "bad_id": (
        "error",
        "The item ID “{value}” is not a valid ID. Clear it to add a new item.",
        "رقم الصنف «{value}» غير صالح. امسحه لإضافة صنف جديد.",
    ),
    "unknown_id": (
        "error",
        "No item with this ID is in your catalog. If the file came from another shop, clear "
        "the ID to add it as a new item.",
        "لا يوجد في الكتالوج صنف بهذا الرقم. إن كان الملف من متجر آخر فامسح الرقم لإضافته "
        "كصنف جديد.",
    ),
    "ambiguous_match": (
        "error",
        "More than one item is called “{value}”, so ALYR cannot tell which one to update. Use "
        "the Item ID.",
        "أكثر من صنف باسم «{value}»، لذلك لا يعرف ALYR أيّها يُحدَّث. استخدم رقم الصنف.",
    ),
    "same_item_twice": (
        "error",
        "This row would update the same item as row {rows}. Use the Item ID to tell them apart.",
        "هذا الصف سيحدّث الصنف نفسه الذي يحدّثه الصف {rows}. استخدم رقم الصنف للتمييز بينهما.",
    ),
    "item_limit": (
        "error",
        "Your shop has reached its limit of {limit} items, so this one was left out. Nothing "
        "has been deleted.",
        "وصل متجرك إلى الحد الأقصى للأصناف ({limit})، لذلك لم يُضَف هذا الصنف. لم يُحذف شيء.",
    ),
    "price_diff_low": (
        "error",
        "A price difference cannot bring the price of “{value}” to zero or below.",
        "فرق السعر لا يمكن أن يجعل سعر «{value}» صفراً أو أقل.",
    ),
    "not_allowed": (
        "error",
        "{message}",
        "{message_ar}",
    ),
    # ── imported, with something to know ──
    "arabic_missing": (
        "warning",
        "There is no Arabic name, so this item is saved as a draft and is not on sale. Add the "
        "Arabic name to put it on sale.",
        "لا يوجد اسم بالعربية، لذلك يُحفظ هذا الصنف كمسودة وغير معروض للبيع. أضف الاسم "
        "العربي لعرضه للبيع.",
    ),
    "price_missing": (
        "warning",
        "There is no price, so this item is saved as a draft and is not on sale.",
        "لا يوجد سعر، لذلك يُحفظ هذا الصنف كمسودة وغير معروض للبيع.",
    ),
    "not_put_on_sale": (
        "warning",
        "This item was not put on sale: it needs an Arabic name and a price first.",
        "لم يُعرض هذا الصنف للبيع: يحتاج أولاً إلى اسم بالعربية وسعر.",
    ),
    "name_not_arabic": (
        "warning",
        "The Arabic name has no Arabic letters.",
        "الاسم العربي لا يحتوي على أحرف عربية.",
    ),
    "duplicate_name": (
        "warning",
        "An item called “{value}” is already in your catalog. This row adds another one. If they "
        "are one product, use sizes or colours instead.",
        "يوجد في الكتالوج صنف باسم «{value}». هذا الصف يضيف صنفاً آخر. إن كانا منتجاً واحداً "
        "فاستخدم المقاسات أو الألوان.",
    ),
    "duplicate_in_file": (
        "warning",
        "“{value}” is also on row {rows} of this file. They stay separate items.",
        "«{value}» موجود أيضاً في الصف {rows} من هذا الملف. يبقيان صنفين منفصلين.",
    ),
    "example_row": (
        "warning",
        "This looks like one of the example rows from the template. Delete it if you do not "
        "sell it.",
        "يبدو هذا الصف أحد الأمثلة من النموذج. احذفه إن كنت لا تبيعه.",
    ),
    "formula_value": (
        "warning",
        "{column}: this cell holds a formula. ALYR never calculates formulas, so it used the "
        "value the file saved (“{value}”).",
        "{column}: تحتوي هذه الخلية على معادلة. لا يحسب ALYR المعادلات أبداً، لذلك استخدم "
        "القيمة المحفوظة في الملف («{value}»).",
    ),
    "formula_blank": (
        "warning",
        "{column}: this cell holds a formula with no saved value, so it was left empty.",
        "{column}: تحتوي هذه الخلية على معادلة بلا قيمة محفوظة، لذلك تُركت فارغة.",
    ),
    "text_formula": (
        "warning",
        "{column}: starts with “{start}”, which a spreadsheet may treat as a formula. It is "
        "kept as plain text.",
        "{column}: يبدأ بـ «{start}» الذي قد يعامله برنامج الجداول كمعادلة. يُحفظ كنص عادي.",
    ),
    "stock_ignored": (
        "warning",
        "The stock number was not imported: this item is not counted in stock. Set “How it "
        "runs out” to Counted in stock to import it.",
        "لم يُستورد رقم المخزون: هذا الصنف غير محسوب في المخزون. اجعل «كيف ينفد» محسوباً في "
        "المخزون لاستيراده.",
    ),
    "per_day_ignored": (
        "warning",
        "The number per day was not used: this item does not run out by a number each day.",
        "لم يُستخدم العدد اليومي: هذا الصنف لا ينفد بعدد في اليوم.",
    ),
    "per_day_needed": (
        "warning",
        "This item runs out by a number each day but has no number, so it cannot be sold "
        "yet and is saved as a draft.",
        "هذا الصنف ينفد بعدد في اليوم لكن بلا عدد، لذلك لا يمكن بيعه بعد ويُحفظ كمسودة.",
    ),
    "differs": (
        "warning",
        "{column} here is not the same as on the first row of this item. The first row's value "
        "is used.",
        "{column} هنا يختلف عن الصف الأول لهذا الصنف. تُستخدم قيمة الصف الأول.",
    ),
    "similar_category": (
        "warning",
        "The category “{value}” looks like “{other}”. Check the spelling.",
        "الفئة «{value}» تشبه «{other}». تحقق من الإملاء.",
    ),
    "photo_missing": (
        "warning",
        "The photo “{value}” is not in the zip, so it was not added.",
        "الصورة «{value}» ليست في ملف zip، لذلك لم تُضَف.",
    ),
    "photo_needs_zip": (
        "warning",
        "This row names photos, but no zip of photos has been added.",
        "يذكر هذا الصف صوراً، لكن لم يُضَف ملف zip للصور.",
    ),
    "photo_ambiguous": (
        "warning",
        "Two files in the zip are called “{value}”, so it was not added.",
        "ملفان في zip باسم «{value}»، لذلك لم تُضَف الصورة.",
    ),
    "photo_bad_type": (
        "warning",
        "“{value}” is not a JPEG, PNG or WebP picture, so it was not added.",
        "«{value}» ليست صورة JPEG أو PNG أو WebP، لذلك لم تُضَف.",
    ),
    "photo_url": (
        "warning",
        "“{value}” is a web link. ALYR does not download links: put the photo in the zip and "
        "write its file name.",
        "«{value}» رابط ويب. لا ينزّل ALYR الروابط: ضع الصورة في ملف zip واكتب اسم ملفها.",
    ),
    "photo_too_many": (
        "warning",
        "An item can have up to {max} photos. The rest were not added.",
        "يمكن أن يكون للصنف حتى {max} صور. لم تُضَف الباقية.",
    ),
    "photo_not_zip_name": (
        "warning",
        "“{value}” is not a photo file name (it has no .jpg, .png or .webp).",
        "«{value}» ليس اسم ملف صورة (ليس فيه .jpg أو .png أو .webp).",
    ),
    # ── said so it is no surprise ──
    "english_from_arabic": (
        "info",
        "There is no English name, so the Arabic name is used for both.",
        "لا يوجد اسم بالإنجليزية، لذلك يُستخدم الاسم العربي للاثنين.",
    ),
    "arabic_in_english": (
        "info",
        "The name is in Arabic, so it is also used as the Arabic name.",
        "الاسم بالعربية، لذلك يُستخدم أيضاً كاسم عربي.",
    ),
    "updates_existing": (
        "info",
        "Updates the item “{value}” that is already in your catalog.",
        "يحدّث الصنف «{value}» الموجود في الكتالوج.",
    ),
    "skipped_existing": (
        "info",
        "An item called “{value}” is already in your catalog, so this row was left out, as you "
        "chose.",
        "يوجد في الكتالوج صنف باسم «{value}»، لذلك تُرك هذا الصف كما اخترت.",
    ),
    "nothing_to_change": (
        "info",
        "Nothing is different from what is in your catalog.",
        "لا يوجد أي اختلاف عما في الكتالوج.",
    ),
    "photo_by_name": (
        "info",
        "The photo “{value}” was matched by the item's name.",
        "طُبقت الصورة «{value}» حسب اسم الصنف.",
    ),
    "sale_ended": (
        "info",
        "The sale is ended.",
        "يُنهى العرض.",
    ),
    # ── about the whole file ──
    "unknown_column": (
        "warning",
        "The column “{value}” is not one ALYR uses, so it was left out.",
        "العمود «{value}» ليس من الأعمدة التي يستخدمها ALYR، لذلك تُرك.",
    ),
    "duplicate_column": (
        "warning",
        "The column “{value}” appears more than once. Only the first is used.",
        "العمود «{value}» مكرر. يُستخدم الأول فقط.",
    ),
    "cut_off": (
        "warning",
        "The file has more rows than ALYR reads at once, so the rest were not read.",
        "في الملف صفوف أكثر مما يقرؤه ALYR دفعة واحدة، لذلك لم تُقرأ الباقية.",
    ),
}


@dataclass(frozen=True)
class Issue:
    """One note about a row (or the file): what it is, which column, and its details."""

    code: str
    column: str | None = None
    args: tuple[tuple[str, object], ...] = ()

    @property
    def level(self) -> str:
        return MESSAGES[self.code][0]

    def detail(self) -> dict:
        return dict(self.args)


def issue(code: str, column: str | None = None, **args: object) -> Issue:
    return Issue(code, column, tuple(sorted(args.items(), key=lambda kv: kv[0])))


class _Blank(dict):
    def __missing__(self, key: str) -> str:
        return ""


def say(found: Issue, lang: str) -> str:
    """The sentence for a note, in one language."""
    lang = "ar" if lang == "ar" else "en"
    _level, english, arabic = MESSAGES[found.code]
    words = _Blank(found.detail())
    if found.column:
        words["column"] = columns.BY_KEY[found.column].label(lang)
    if found.code == "bad_word":
        words["allowed"] = ", ".join(columns.choices(str(words["group"]), lang))
    return (arabic if lang == "ar" else english).format_map(words)


def view(found: Issue) -> dict:
    """A note as the API shows it: both sentences, so a screen needs no second request."""
    return {
        "level": found.level, "code": found.code, "column": found.column,
        "message": say(found, "en"), "message_ar": say(found, "ar"),
    }
