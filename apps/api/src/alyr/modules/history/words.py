"""What the visits import says when it refuses or finds a problem in a row, in English and Arabic
together so the Arabic can be read in one pass (ALY-66: a draft until a native speaker has been
through it). Modern Standard Arabic, Western digits, product and field names kept as they are.

Nothing here says or implies a model: these are counts and rules.
"""

from alyr.catalog import Text
from alyr.modules.documents.errors import DocumentError


class HistoryError(DocumentError):
    """A refusal of the visits import. A `DocumentError` in every way that matters (the app's one
    handler answers it with `detail`, `code`, `message_ar` and whatever `extra` says), with its
    words kept here."""

    def __init__(self, code: str, status: int = 422, **extra: object) -> None:
        self.code, self.status, self.extra = code, status, extra
        self.en = ERRORS[code].en
        self.ar = ERRORS[code].ar
        Exception.__init__(self, self.en)


ERRORS: dict[str, Text] = {
    "import_not_found": Text(
        "There is no such import for this business.", "لا يوجد استيراد بهذا الرقم لهذا النشاط.",
    ),
    "import_not_preview": Text(
        "This import was already applied, undone or discarded.",
        "سبق تطبيق هذا الاستيراد أو التراجع عنه أو حذفه.",
    ),
    "import_too_big": Text(
        "The file is too big. Split it into smaller files.", "الملف كبير جداً. قسّمه إلى ملفات أصغر.",
    ),
    "import_changed": Text(
        "The preview changed since it was shown. Look at it again before applying.",
        "تغيّرت المعاينة منذ عرضها. راجعها مجدداً قبل التطبيق.",
    ),
    "import_has_problems": Text(
        "Some rows have problems. Fix the file, or choose to skip the rows with problems.",
        "في بعض الصفوف مشكلات. صحّح الملف أو اختر تخطي الصفوف التي فيها مشكلات.",
    ),
    "import_empty": Text(
        "There is nothing to import: no row would make a visit.",
        "لا شيء للاستيراد: لا صف ينتج عنه زيارة.",
    ),
    "already_imported": Text(
        "This exact file was already imported. Undo that import first if you need to redo it.",
        "سبق استيراد هذا الملف نفسه. تراجع عن ذلك الاستيراد أولاً إن أردت إعادته.",
    ),
    "bookings_off": Text(
        "This business does not have Bookings switched on. Staff can switch it on as part of "
        "the import: say so when you apply.",
        "خدمة الحجوزات غير مفعّلة لهذا النشاط. يمكن للموظفين تفعيلها ضمن الاستيراد: اذكر ذلك "
        "عند التطبيق.",
    ),
    "nothing_to_undo": Text(
        "There is no applied import to undo.", "لا يوجد استيراد مطبّق للتراجع عنه.",
    ),
    "not_newest": Text(
        "Only the newest applied import can be undone. Undo the newer ones first.",
        "لا يمكن التراجع إلا عن أحدث استيراد مطبّق. تراجع عن الأحدث أولاً.",
    ),
    "not_undoable": Text(
        "A receipt, invoice or payment was recorded against one of these visits, so the import "
        "cannot be taken back as a whole.",
        "سُجّل إيصال أو فاتورة أو دفعة على إحدى هذه الزيارات، فلا يمكن التراجع عن الاستيراد كاملاً.",
    ),
    "options_invalid": Text(
        "One of the options is not valid.", "أحد الخيارات غير صالح.",
    ),
}


def _q(text: object) -> str:
    return "«" + str(text)[:60] + "»"


# Problems in a row: (English, Arabic). `{field_en}` / `{field_ar}` are filled with the column's
# name in each language, `{value}` with what the file said.
PROBLEMS: dict[str, tuple[str, str]] = {
    "missing_column": (
        "The file has no column for {field_en}. Choose which column it is.",
        "لا يوجد في الملف عمود لـ {field_ar}. اختر العمود المناسب.",
    ),
    "no_client_column": (
        "The file has no column that tells one client from another: a client number, a phone "
        "number or a name. Choose one.",
        "لا يوجد في الملف عمود يميّز عميلاً عن آخر: رقم العميل أو الهاتف أو الاسم. اختر أحدها.",
    ),
    "too_many_rows": (
        "The file has more than {limit} rows. Split it into smaller files.",
        "في الملف أكثر من {limit} صف. قسّمه إلى ملفات أصغر.",
    ),
    "blank": ("{field_en} is empty.", "حقل {field_ar} فارغ."),
    "bad_date": (
        "{field_en} {value} is not a date. Write it as 2026-10-31 or 31/10/2026.",
        "{field_ar} {value} ليس تاريخاً. اكتبه هكذا 2026-10-31 أو 31/10/2026.",
    ),
    "bad_time": (
        "{field_en} {value} is not a time of day. Write it as 14:30 or 2:30 PM.",
        "{field_ar} {value} ليس وقتاً من اليوم. اكتبه هكذا 14:30 أو 2:30 م.",
    ),
    "no_time": (
        "This visit has no time of day. The busiest-hours count needs one. Add a time column, "
        "or choose to accept dates with no time.",
        "ليس لهذه الزيارة وقت من اليوم، وعدّ أوقات الذروة يحتاجه. أضف عمود الوقت أو اختر قبول "
        "التواريخ بلا وقت.",
    ),
    "bad_status": (
        "{field_en} {value} is not came, did not come or cancelled.",
        "{field_ar} {value} ليست حضر أو لم يحضر أو ملغي.",
    ),
    "not_final": (
        "{field_en} {value} is not final. Only visits that came, did not come or were "
        "cancelled are imported.",
        "{field_ar} {value} ليست حالة نهائية. تُستورد فقط الزيارات التي حضرت أو لم تحضر أو "
        "أُلغيت.",
    ),
    "in_future": (
        "This visit is in the future but is marked as {value}. Only visits that are over can "
        "have come or not come.",
        "هذه الزيارة في المستقبل لكنها مسجلة كـ {value}. لا يمكن أن تكون الزيارة حضرت أو لم تحضر "
        "قبل انتهائها.",
    ),
    "bad_money": (
        "{field_en} {value} is not an amount.", "{field_ar} {value} ليس مبلغاً.",
    ),
    "bad_duration": (
        "{field_en} {value} is not a number of minutes between 5 and 600.",
        "{field_ar} {value} ليست عدد دقائق بين 5 و600.",
    ),
    "end_before_start": (
        "The visit ends before it starts.", "تنتهي الزيارة قبل أن تبدأ.",
    ),
    "no_client": (
        "This row has no client number, phone number or name to tell the client by.",
        "لا يحتوي هذا الصف على رقم عميل أو هاتف أو اسم لتمييز العميل.",
    ),
    "bad_phone": (
        "{field_en} {value} is not a phone number.", "{field_ar} {value} ليس رقم هاتف.",
    ),
    "too_long": (
        "{field_en} is longer than 120 characters.", "حقل {field_ar} أطول من 120 حرفاً.",
    ),
    "date_out_of_range": (
        "{field_en} {value} is before 2015 or more than a year ahead.",
        "{field_ar} {value} قبل 2015 أو بعد أكثر من سنة من الآن.",
    ),
}

# Things worth saying that do not stop the import.
NOTES: dict[str, tuple[str, str]] = {
    "duplicate_in_file": (
        "The same visit appears more than once in this file. Only the first is imported.",
        "تظهر الزيارة نفسها أكثر من مرة في هذا الملف. تُستورد الأولى فقط.",
    ),
    "dates_day_first": (
        "Dates such as 03/04/2026 are taken as day first (3 April). If your file writes the month "
        "first, choose that option.",
        "تُؤخذ التواريخ مثل 03/04/2026 باليوم أولاً (3 أبريل). إن كان ملفك يكتب الشهر أولاً "
        "فاختر ذلك الخيار.",
    ),
    "no_price": (
        "Some visits have no price in the file; they are imported with no price, not with the "
        "service's price today.",
        "لبعض الزيارات لا سعر في الملف؛ تُستورد بلا سعر، لا بسعر الخدمة اليوم.",
    ),
}
