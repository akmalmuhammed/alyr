"""What the Catalog says to a customer or to staff, in English and Arabic.

Every refusal the checkout can give has a stable code (for a screen to act on) and a plain
sentence in both languages (for a screen that just shows it). The sentences are built from
the code and its details, so they never disagree. The Arabic has not been reviewed by a
native speaker (ALY-66).
"""

import re
from datetime import date, datetime, timedelta

from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.modules.items import qty

WEEKDAYS = {
    "en": ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"),
    "ar": ("الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"),
}
MONTHS = {
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
    "ar": ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر",
           "أكتوبر", "نوفمبر", "ديسمبر"),
}

# code: (English, Arabic). {name} is the item, in the language of the sentence.
MESSAGES: dict[str, tuple[str, str]] = {
    "unavailable": (
        "{name} is no longer available.",
        "«{name}» لم يعد متاحاً.",
    ),
    "sold_out": (
        "{name} is sold out.",
        "نفد «{name}».",
    ),
    "not_enough": (
        "Only {left} of {name} left. Please order {left} or fewer.",
        "المتبقي من «{name}» {left} فقط. اطلب {left} أو أقل.",
    ),
    "bad_quantity": (
        "Choose a quantity of {name} between 1 and 999.",
        "اختر كمية من «{name}» بين 1 و999.",
    ),
    # A fraction of something counted (a piece, a box), and a quantity of a measure (kg, litre)
    # that cannot be asked for (ALY-149).
    "not_whole": (
        "{name} is sold by the whole piece. Choose a whole number.",
        "«{name}» يُباع بالقطعة الكاملة. اختر عدداً صحيحاً.",
    ),
    "bad_amount": (
        "Choose a quantity of {name} above zero, up to 999.",
        "اختر كمية من «{name}» أكبر من صفر وحتى 999.",
    ),
    "off_step": (
        "{name} is sold in steps of {pack}. Choose {suggest}.",
        "«{name}» يُباع بمضاعفات {pack}. اختر {suggest}.",
    ),
    "below_minimum": (
        "The least you can order of {name} is {minimum}.",
        "أقل كمية يمكن طلبها من «{name}» هي {minimum}.",
    ),
    "not_now": (
        "{name} can be ordered again {when}.",
        "يمكن طلب «{name}» مجدداً {when}.",
    ),
    "closed": (
        "{name} cannot be ordered right now.",
        "لا يمكن طلب «{name}» حالياً.",
    ),
    "after_cutoff": (
        "It is too late to order {name} for {for_when}. The next day it can be ordered "
        "for is {when}.",
        "فات وقت طلب «{name}» ليوم {for_when}. أقرب يوم متاح هو {when}.",
    ),
    "not_that_day": (
        "{name} cannot be ordered for {for_when}. The next day it can be ordered for is {when}.",
        "لا يمكن طلب «{name}» ليوم {for_when}. أقرب يوم متاح هو {when}.",
    ),
    "past": (
        "Pick a date that has not passed for {name}.",
        "اختر تاريخاً لم يمضِ لـ«{name}».",
    ),
    "price_changed": (
        "The price of {name} changed from {old} to {new}. Please check your total.",
        "تغيّر سعر «{name}» من {old} إلى {new}. تحقق من المبلغ الإجمالي.",
    ),
    "variant_required": (
        "Choose a size or option for {name}.",
        "اختر المقاس أو النوع لـ«{name}».",
    ),
    "variant_unavailable": (
        "That choice of {name} is no longer available.",
        "هذا الاختيار من «{name}» لم يعد متاحاً.",
    ),
    "option_required": (
        "Choose {group} for {name}.",
        "اختر {group} لـ«{name}».",
    ),
    "option_invalid": (
        "That choice is not available for {name}.",
        "هذا الخيار غير متاح لـ«{name}».",
    ),
    "option_too_many": (
        "Choose at most {max} for {group} on {name}.",
        "اختر {max} على الأكثر من {group} لـ«{name}».",
    ),
    "too_many_holds": (
        "You already have {n} orders waiting to be paid. Pay for one, or wait for it to "
        "lapse, before ordering more.",
        "لديك {n} طلبات بانتظار الدفع. ادفع أحدها أو انتظر انتهاء مهلته قبل طلب المزيد.",
    ),
    "cart_changed": (
        "Some items in your cart changed. Please check them and try again.",
        "تغيّرت بعض الأصناف في سلتك. راجعها وحاول مرة أخرى.",
    ),
    "nothing_available": (
        "None of the items from your last order can be ordered now.",
        "لا يمكن الآن طلب أي صنف من طلبك السابق.",
    ),
    "no_previous_order": (
        "We could not find an earlier order to repeat.",
        "لم نجد طلباً سابقاً لإعادته.",
    ),
    "hold_expired": (
        "Order #{number} was cancelled because it was not paid within {minutes} minutes. "
        "The items were put back.",
        "تم إلغاء الطلب رقم {number} لأنه لم يُدفع خلال {minutes} دقيقة، وأُعيدت الأصناف.",
    ),
    "not_pack_multiple": (
        "{name} is sold in packs of {pack}. Choose {suggest}.",
        "«{name}» يُباع في عبوات من {pack}. اختر {suggest}.",
    ),
    # What the order page tells a customer whose order cannot be placed for a reason that
    # is not about one item.
    "over_limit": (
        "This order would take your account over its limit of {limit}. Pay by link instead.",
        "سيتجاوز هذا الطلب الحد المسموح لحسابك وهو {limit}. ادفع عبر الرابط بدلاً من ذلك.",
    ),
    "no_account": (
        "You do not have a credit account with this shop. Pay by link instead.",
        "ليس لديك حساب آجل لدى هذا المتجر. ادفع عبر الرابط بدلاً من ذلك.",
    ),
    "unknown_customer": (
        "We could not find you. Message the shop on WhatsApp for a new order link.",
        "لم نتمكن من التعرف عليك. راسل المتجر على واتساب للحصول على رابط طلب جديد.",
    ),
    "empty": (
        "Your order is empty. Add something first.",
        "طلبك فارغ. أضف صنفاً أولاً.",
    ),
    "bad_payment": (
        "Choose to pay by link or on your account.",
        "اختر الدفع عبر الرابط أو على حسابك.",
    ),
    "bad_link": (
        "This order link is not valid. Message the shop on WhatsApp to get a new one.",
        "رابط الطلب هذا غير صالح. راسل المتجر على واتساب للحصول على رابط جديد.",
    ),
    "expired_link": (
        "This order link has expired. Message the shop on WhatsApp to get a new one.",
        "انتهت صلاحية رابط الطلب هذا. راسل المتجر على واتساب للحصول على رابط جديد.",
    ),
}

# The details that carry an item's, group's or choice's own name; the Arabic is used in
# an Arabic sentence when there is one.
_NAMED = ("name", "group", "variant")
# A detail on the left may come as dirhams under the key on the right; it is written the way
# the sentence's language writes money (an Arabic sentence never says "QAR").
_MONEY = {"old": "old_price", "new": "new_price", "limit": "limit_amount"}
# The details that are quantities of the item, which take the item's unit when it is a measure.
_QUANTITIES = ("left", "minimum", "pack", "suggest", "requested", "max_quantity")


def when_text(moment: datetime | date, today: date, lang: str) -> str:
    """"today at 6:00 AM", "tomorrow", "Mon 19 Oct at 6:00 AM": a time or a day, as a
    customer would say it. `moment` is on the shop's wall clock."""
    ar = lang == "ar"
    day = moment.date() if isinstance(moment, datetime) else moment
    if day == today:
        label = "اليوم" if ar else "today"
    elif day == today + timedelta(days=1):
        label = "غداً" if ar else "tomorrow"
    else:
        names, months = WEEKDAYS[lang], MONTHS[lang]
        weekday = names[(day.weekday() + 1) % 7]
        label = f"{weekday} {day.day} {months[day.month - 1]}"
    if not isinstance(moment, datetime):
        return label
    hour = moment.hour % 12 or 12
    clock = f"{hour}:{moment.minute:02d} " + (
        ("ص" if moment.hour < 12 else "م") if ar else ("AM" if moment.hour < 12 else "PM")
    )
    return f"{label} الساعة {clock}" if ar else f"{label} at {clock}"


def say(code: str, lang: str, details: dict, today: date | None = None) -> str:
    """The sentence for a code, in one language. `details` may hold `next_at` or
    `next_date` and `for_date` (datetimes and dates on the shop's wall clock); they are
    turned into words here, against `today`."""
    lang = "ar" if lang == "ar" else "en"
    words = dict(details)
    for key in _NAMED:
        if lang == "ar" and details.get(f"{key}_ar"):
            words[key] = details[f"{key}_ar"]
    for word, key in _MONEY.items():
        if isinstance(details.get(key), int):
            words[word] = fmt_qar_ar(details[key]) if lang == "ar" else fmt_qar(details[key])
    unit = details.get("unit")
    if unit:
        # A measure's numbers carry its unit: "Only 2.5 kg of Dates left".
        for key in _QUANTITIES:
            if details.get(key) is not None:
                words[key] = qty.with_unit(details[key], unit, lang)
    today = today or date.today()
    when = details.get("next_at") or details.get("next_date")
    if when:
        words["when"] = when_text(when, today, lang)
    if details.get("for_date"):
        words["for_when"] = when_text(details["for_date"], today, lang)
    english, arabic = MESSAGES[code]
    return (arabic if lang == "ar" else english).format_map(_Blank(words))


class _Blank(dict):
    """A sentence still reads if a detail is missing."""

    def __missing__(self, key: str) -> str:
        return ""


# ── searching the shop's own items (the workspace list) ─────────────────────────────────
#
# People write the same Arabic word several ways: with or without the marks above the
# letters, the alef written four ways, the final yeh as ya or alef maqsura, the round ta as
# ha, and with a Persian keyboard's kaf and yeh. A search compares both sides after folding
# all of that to one spelling, so «شاورما» finds «شاورمة» and «أرز» finds «ارز».

_FOLD = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",   # alef with hamza, madda, wasla
    "ى": "ي", "ی": "ي", "ئ": "ي",             # alef maqsura, Persian yeh, yeh with hamza
    "ة": "ه",                                  # ta marbuta
    "ؤ": "و",                                  # waw with hamza
    "ک": "ك",                                  # Persian kaf
    "ـ": None,                                 # tatweel, the stretch line
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
})
_MARKS = re.compile("[ً-ٰٟۖ-ۭ]")  # tashkeel and small marks
_SEPARATORS = re.compile(r"[\s,.;:/\\|()\[\]{}\-_+*«»\"'`،؛؟]+")


def fold(text: str) -> str:
    """Lower case, one spelling for each Arabic letter people mix up, no marks."""
    return _MARKS.sub("", text.lower().translate(_FOLD)).strip()


def search_words(query: str) -> list[str]:
    """The words of a search, folded. An empty search has none."""
    return [w for w in _SEPARATORS.split(fold(query)) if w]


def matches(words: list[str], *fields: str) -> bool:
    """Every word of the search is found somewhere in the fields (part of a word counts,
    so «شاور» finds «شاورما»)."""
    if not words:
        return True
    haystack = " ".join(fold(f) for f in fields if f)
    return all(w in haystack for w in words)
