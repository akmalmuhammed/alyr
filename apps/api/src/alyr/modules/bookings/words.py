"""What the bookings module says, in English and Arabic (D-084).

Whole sentences per language, never joined from fragments of the other. The Arabic is a
draft until a native speaker reviews it (ALY-66). Money is written by `fmt_qar` in English and
as the amount then «ر.ق» in Arabic, Western digits in both.
"""

from alyr.core.normalise import fmt_qar, fmt_qar_ar


def money(dirhams: int, arabic: bool) -> str:
    """QAR 50 / «50 ر.ق»."""
    return fmt_qar_ar(dirhams) if arabic else fmt_qar(dirhams)


def resource_name(resource: dict | None, arabic: bool) -> str:
    if not resource:
        return ""
    return (resource.get("name_ar") or resource["name"]) if arabic else resource["name"]


def with_whom(resource: dict | None, arabic: bool) -> str:
    """How a booking names its resource after the service: " with Reem" for a person,
    ", Chair 2" for a place, nothing for a shop with none."""
    name = resource_name(resource, arabic)
    if not name:
        return ""
    if resource.get("kind") == "place":
        return f"، {name}" if arabic else f", {name}"
    return f" مع {name}" if arabic else f" with {name}"


def hours_ar(hours: int, by: bool = False) -> str:
    """The cancel window's hours as Arabic counts them after "من" or "بـ", where the dual is
    «ساعتين»: «ساعة واحدة», «ساعتين», «3 ساعات», «24 ساعة». `by` joins «بـ» to it («بساعتين»)."""
    if hours == 1:
        text = "ساعة واحدة"
    elif hours == 2:
        text = "ساعتين"
    else:
        text = f"{hours} ساعات" if 3 <= hours <= 10 else f"{hours} ساعة"
        return f"بـ{text}" if by else text
    return f"ب{text}" if by else text


def terms_sentence(terms: dict, arabic: bool) -> str:
    """The shop's rule for a paid deposit, in one or two sentences, as the customer is shown
    it before paying. `terms` is a booking's `deposit_terms` (or the shop's current rule)."""
    hours = terms.get("cancel_hours", 24)
    no_show, late = terms.get("no_show", "keep"), terms.get("late_cancel", "keep")
    hrs = "1 hour" if hours == 1 else f"{hours} hours"
    if arabic:
        h, by = hours_ar(hours), hours_ar(hours, by=True)
        if no_show == "keep" and late == "keep":
            rule = (f"إذا لم تحضر، أو ألغيت قبل الموعد بأقل من {h}، "
                    "يحتفظ المحل بالعربون.")
        elif no_show == "keep":
            rule = (f"إذا لم تحضر يحتفظ المحل بالعربون. وإذا ألغيت قبل الموعد بأقل من "
                    f"{h} يُرد إليك.")
        elif late == "keep":
            rule = (f"إذا ألغيت قبل الموعد بأقل من {h} يحتفظ المحل بالعربون. "
                    "وإذا لم تحضر يُرد إليك.")
        else:
            rule = "يُرد العربون إليك إذا ألغيت أو لم تحضر."
        return rule + f" إذا ألغيت قبل الموعد {by} أو أكثر يُرد إليك العربون."
    if no_show == "keep" and late == "keep":
        rule = (f"If you do not come, or cancel less than {hrs} before, "
                "the shop keeps the deposit.")
    elif no_show == "keep":
        rule = (f"If you do not come, the shop keeps the deposit. If you cancel less than "
                f"{hrs} before, it is refunded.")
    elif late == "keep":
        rule = (f"If you cancel less than {hrs} before, the shop keeps the deposit. "
                "If you do not come, it is refunded.")
    else:
        rule = "The deposit is refunded if you cancel or do not come."
    return rule + f" Cancel {hrs} or more before and it is refunded."


def deposit_due(number: int, shop: str, what: str, when: str, amount: int, minutes: int,
                url: str, terms: dict, arabic: bool) -> str:
    if arabic:
        return (f"حجزك رقم {number} لدى {shop}: {what}، {when}. الموعد محجوز لك لمدة "
                f"{minutes} دقيقة حتى تدفع العربون {money(amount, True)} من هنا: {url} . "
                + terms_sentence(terms, True))
    return (f"Booking {number} at {shop}: {what}, {when}. The time is held for you for "
            f"{minutes} minutes while you pay the deposit of {money(amount, False)} here: "
            f"{url} . " + terms_sentence(terms, False))


def deposit_paid(number: int, amount: int, what: str, when: str, arabic: bool) -> str:
    if arabic:
        return (f"استلمنا العربون {money(amount, True)} للحجز رقم {number}. تم تأكيد موعدك: "
                f"{what}، {when}. للإلغاء أرسل «حجزي».")
    return (f"We received the deposit of {money(amount, False)} for booking {number}. "
            f"Your visit is confirmed: {what}, {when}. To cancel, send \"my booking\".")


def released(number: int, when: str, arabic: bool) -> str:
    if arabic:
        return (f"أُلغي الحجز رقم {number} ({when}) لأن العربون لم يُدفع في الوقت المحدد. "
                "لم يُخصم أي مبلغ. راسلنا لحجز موعد جديد.")
    return (f"Booking {number} ({when}) was released because the deposit was not paid in "
            "time. Nothing was charged. Send us a message to book again.")


def deposit_outcome(state: str, amount: int, arabic: bool) -> str:
    """What became of a paid deposit, as the cancellation message says it."""
    if state == "kept":
        return (f"يحتفظ المحل بالعربون {money(amount, True)} حسب سياسته." if arabic
                else f"The shop keeps the deposit of {money(amount, False)}, as its rule says.")
    if state == "refund_due":
        return (f"سيرد المحل إليك العربون {money(amount, True)}." if arabic
                else f"The shop will refund your deposit of {money(amount, False)}.")
    return ""
