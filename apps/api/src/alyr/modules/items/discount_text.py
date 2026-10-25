"""What discounts say, in English and Arabic (ALY-150, `specs/014-pricing-pack/spec.md`).

Every refusal a coupon can give has a stable code (for a screen to act on) and a plain sentence
in both languages built from the code and its details, so a screen that only shows the sentence
and a screen that acts on the code never disagree. A rule is also described in words ("10% off
orders over QAR 200") for the owner's list, the customer's page and the snapshot kept on an
order. The Arabic is a draft until a native review (ALY-66); every word of it is in this file.
"""

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.modules.items.text import MONTHS

# code: (English, Arabic). {on} is a date, {minimum} money, {other} another discount.
MESSAGES: dict[str, tuple[str, str]] = {
    "coupon_unknown": (
        "We do not recognise the code {code}.",
        "لا نعرف الرمز {code}.",
    ),
    "coupon_paused": (
        "This code is not available right now.",
        "هذا الرمز غير متاح حالياً.",
    ),
    "coupon_not_started": (
        "This code starts on {on}.",
        "يبدأ هذا الرمز في {on}.",
    ),
    "coupon_ended": (
        "This code ended on {on}.",
        "انتهى هذا الرمز في {on}.",
    ),
    "coupon_ended_plain": (
        "This code has ended.",
        "انتهى هذا الرمز.",
    ),
    "coupon_used_up": (
        "This code has been used up.",
        "استُنفد هذا الرمز.",
    ),
    "coupon_used_by_you": (
        "You have already used this code.",
        "لقد استخدمت هذا الرمز من قبل.",
    ),
    "coupon_used_by_you_many": (
        "You have already used this code {limit} times, the most it allows.",
        "لقد استخدمت هذا الرمز {limit} مرات، وهو الحد الأقصى المسموح.",
    ),
    "coupon_group": (
        "This code is not available for your account.",
        "هذا الرمز غير متاح لحسابك.",
    ),
    "coupon_no_match": (
        "This code does not apply to anything in your order.",
        "لا ينطبق هذا الرمز على أي شيء في طلبك.",
    ),
    "coupon_minimum": (
        "Minimum order {minimum} for this code.",
        "الحد الأدنى للطلب {minimum} لهذا الرمز.",
    ),
    "coupon_not_combined": (
        "This code cannot be used together with {other}.",
        "لا يمكن استخدام هذا الرمز مع {other}.",
    ),
    "coupon_no_effect": (
        "This code would not change your total.",
        "هذا الرمز لن يغيّر إجمالي طلبك.",
    ),
    "coupon_duplicate": (
        "You have already entered this code.",
        "لقد أدخلت هذا الرمز من قبل.",
    ),
    "coupon_too_many": (
        "You can use up to {max} codes on one order.",
        "يمكنك استخدام {max} رموز على الأكثر في الطلب الواحد.",
    ),
    "total_changed": (
        "The total changed to {total}. Please check it and try again.",
        "تغيّر الإجمالي إلى {total}. راجعه وحاول مرة أخرى.",
    ),
}


def day_text(moment: datetime | date, tz: str, lang: str, today: date | None = None) -> str:
    """"3 Mar", or "3 Mar 2027" when it is not this year; on the shop's wall clock."""
    if isinstance(moment, datetime):
        day = moment.astimezone(ZoneInfo(tz)).date()
    else:
        day = moment
    year = (today or datetime.now(ZoneInfo(tz)).date()).year
    base = f"{day.day} {MONTHS['ar' if lang == 'ar' else 'en'][day.month - 1]}"
    return base if day.year == year else f"{base} {day.year}"


def number(value: Decimal | int) -> str:
    """10, 12.5: a percentage without trailing zeros."""
    return format(Decimal(value).normalize(), "f")


def money(amount: int, lang: str) -> str:
    return fmt_qar_ar(amount) if lang == "ar" else fmt_qar(amount)


def label_of(rule) -> str:
    """How another discount is named in a sentence: its code, else its name, else a plain
    description."""
    return rule.code or rule.name or ("the automatic discount")


def say(
    code: str, lang: str, details: dict | None = None, tz: str = "Asia/Qatar",
    today: date | None = None,
) -> str:
    """The sentence for a code in one language. `details` may hold `code`, `on` (a date or
    moment), `minimum` and `max`/`limit` (numbers), `total` (money) and `with` (a rule)."""
    lang = "ar" if lang == "ar" else "en"
    details = dict(details or {})
    if code == "coupon_ended" and not details.get("on"):
        code = "coupon_ended_plain"
    if code == "coupon_used_by_you" and (details.get("limit") or 1) > 1:
        code = "coupon_used_by_you_many"
    words: dict[str, object] = {"code": details.get("code", "")}
    if details.get("on"):
        words["on"] = day_text(details["on"], tz, lang, today)
    if "minimum" in details:
        words["minimum"] = money(details["minimum"], lang)
    if "total" in details:
        words["total"] = money(details["total"], lang)
    for key in ("limit", "max"):
        if key in details:
            words[key] = details[key]
    if "with" in details:
        words["other"] = label_of(details["with"])
    english, arabic = MESSAGES[code]
    return (arabic if lang == "ar" else english).format_map(_Blank(words))


class _Blank(dict):
    def __missing__(self, key: str) -> str:
        return ""


# ── a rule in words ─────────────────────────────────────────────────────────────────────


def rule_text(
    value_type: str, lang: str, *, percent: Decimal | None = None, amount: int | None = None,
    buy_qty: int | None = None, get_qty: int | None = None, scope: str = "order",
    min_order: int = 0, kind: str = "coupon",
) -> str:
    """"10% off your order", "10% off orders over QAR 200", "QAR 20 off selected items",
    "Buy 3 get 1 free". The same words are kept on an order beside what it was given."""
    ar = lang == "ar"
    if value_type == "percent":
        what = f"خصم {number(percent)}%" if ar else f"{number(percent)}% off"
    elif value_type == "amount":
        what = f"خصم {money(amount, lang)}" if ar else f"{money(amount, lang)} off"
    else:
        what = (
            f"اشترِ {buy_qty} واحصل على {get_qty} مجاناً" if ar
            else f"Buy {buy_qty} get {get_qty} free"
        )
    chosen = scope == "selected"
    if value_type == "free_units":
        text = what + ((" على أصناف مختارة" if ar else " on selected items") if chosen else "")
        if min_order:
            text += (
                f" عند طلب فوق {money(min_order, lang)}" if ar
                else f" on orders over {money(min_order, lang)}"
            )
        return text
    if chosen:
        text = what + (" على أصناف مختارة" if ar else " selected items")
        if min_order:
            text += (
                f" عند طلب فوق {money(min_order, lang)}" if ar
                else f" on orders over {money(min_order, lang)}"
            )
        return text
    if min_order:
        return what + (
            f" على الطلبات فوق {money(min_order, lang)}" if ar
            else f" orders over {money(min_order, lang)}"
        )
    return what + (" على طلبك" if ar else " your order")
