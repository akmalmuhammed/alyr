"""What delivery says, in English and Arabic (ALY-150 part 2, `specs/014-pricing-pack/spec.md`).

A refusal has a stable code (for a screen to act on) and a plain sentence in both languages built
from the code and its details. The Arabic is a draft until a native review (ALY-66); every word of
it is in this file.
"""

from datetime import date, time

from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.modules.items import text

# code: (English, Arabic)
MESSAGES: dict[str, tuple[str, str]] = {
    "fulfilment_required": (
        "Choose pickup or delivery.", "اختر الاستلام من المتجر أو التوصيل."
    ),
    "pickup_off": (
        "This shop does not offer pickup. Choose delivery.",
        "هذا المتجر لا يتيح الاستلام. اختر التوصيل.",
    ),
    "delivery_off": (
        "This shop does not deliver. Choose pickup.",
        "هذا المتجر لا يوصّل. اختر الاستلام.",
    ),
    "zone_required": (
        "Choose where we deliver to.", "اختر منطقة التوصيل."
    ),
    "zone_unknown": (
        "We do not deliver to that area.", "لا نوصّل إلى هذه المنطقة."
    ),
    "address_required": (
        "Write the address to deliver to.", "اكتب عنوان التوصيل."
    ),
    "delivery_minimum": (
        "Delivery to {zone} needs an order of at least {minimum}.",
        "التوصيل إلى {zone} يتطلب طلباً لا يقل عن {minimum}.",
    ),
    "delivery_no_day": (
        "We have no delivery day for {zone} in the next two weeks.",
        "لا يوجد يوم توصيل إلى {zone} خلال الأسبوعين القادمين.",
    ),
    "fee_changed": (
        "The delivery fee changed to {fee}. Please check your total.",
        "تغيّرت رسوم التوصيل إلى {fee}. راجع إجمالي طلبك.",
    ),
}

# What the customer reads about a day: "today", "tomorrow", "Wed 21 Oct".
DAY = {"en": ("today", "tomorrow"), "ar": ("اليوم", "غداً")}


def money(amount: int, lang: str) -> str:
    return fmt_qar_ar(amount) if lang == "ar" else fmt_qar(amount)


def day_text(day: date, today: date, lang: str) -> str:
    return text.when_text(day, today, "ar" if lang == "ar" else "en")


def days_text(days: list[int] | tuple[int, ...], lang: str) -> str:
    """"Sun, Wed" or "Every day"."""
    lang = "ar" if lang == "ar" else "en"
    if not days or len(set(days)) == 7:
        return "كل يوم" if lang == "ar" else "Every day"
    names = text.WEEKDAYS[lang]
    return ("، " if lang == "ar" else ", ").join(names[d] for d in sorted(set(days)))


def cutoff_text(cutoff: time | None, lang: str) -> str:
    if cutoff is None:
        return ""
    hour = cutoff.hour % 12 or 12
    ar = lang == "ar"
    mark = ("ص" if cutoff.hour < 12 else "م") if ar else ("AM" if cutoff.hour < 12 else "PM")
    clock = f"{hour}:{cutoff.minute:02d} {mark}"
    return f"اطلب قبل {clock}" if ar else f"Order before {clock}"


def say(code: str, lang: str, details: dict | None = None) -> str:
    lang = "ar" if lang == "ar" else "en"
    details = dict(details or {})
    words: dict[str, object] = {}
    zone = details.get("zone")
    if zone is not None:
        words["zone"] = (zone.get("name_ar") if lang == "ar" and zone.get("name_ar")
                         else zone.get("name"))
    for key in ("minimum", "fee"):
        if key in details:
            words[key] = money(details[key], lang)
    english, arabic = MESSAGES[code]
    return (arabic if lang == "ar" else english).format_map(_Blank(words))


class _Blank(dict):
    def __missing__(self, key: str) -> str:
        return ""
