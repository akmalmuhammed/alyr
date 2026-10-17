"""What the Catalog says to a customer or to staff, in English and Arabic.

Every refusal the checkout can give has a stable code (for a screen to act on) and a plain
sentence in both languages (for a screen that just shows it). The sentences are built from
the code and its details, so they never disagree. The Arabic has not been reviewed by a
native speaker (ALY-66).
"""

from datetime import date, datetime, timedelta

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
}

# The details that carry an item's, group's or choice's own name; the Arabic is used in
# an Arabic sentence when there is one.
_NAMED = ("name", "group", "variant")


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
