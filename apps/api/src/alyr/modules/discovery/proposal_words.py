"""The words of Discovery's proposals, asks and commands, in English and Arabic (spec 066, D-166).

Rule-based voice, whole strings per language, never fragments joined (agreement through `counted()`
and `agree()`). No first person in ALYR's own words ("I", "we", "us", "our"), no AI word, no emoji;
an Arabic line on WhatsApp opens with U+200F so it runs right to left. A test fails on an empty
string, an ellipsis, a banned word and a missing language.

**One exception, on purpose:** a review's reply is a public answer the owner approved, written in
the shop's own voice ("us", "the team"), so `REPLIES` is outside the first-person test. Its text is
chosen by rule from the review's stars and language, and **no word of the review is ever copied
into it**: a review is third-party text and stays data.

The Arabic is a draft until ALY-66 (a native reviewer).
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from alyr.core.words import CHANGES, counted
from alyr.modules.discovery.connectors.base import WEEK

RLM = "‏"  # keeps a line of Arabic running right to left next to digits and Latin

# What a proposal changes, in the reader's language.
FIELD_LABELS: dict[str, tuple[str, str]] = {
    "hours": ("Opening hours", "ساعات العمل"),
    "phone": ("Phone number", "رقم الهاتف"),
    "category": ("Main category", "التصنيف الرئيسي"),
    "name": ("Business name", "اسم المنشأة"),
    "whatsapp_link": ("WhatsApp link", "رابط واتساب"),
    "review_reply": ("Reply to a review", "الرد على مراجعة"),
}
# Where: never "Google" (for the sample it is not Google).
WHERE: dict[str, tuple[str, str]] = {
    "listing": ("the listing", "الملف التجاري"),
    "website": ("the website", "الموقع الإلكتروني"),
}
NONE_TEXT: dict[str, tuple[str, str]] = {
    "default": ("none", "لا شيء"),
    "review_reply": ("no reply", "لا رد"),
}
CLOSED = ("closed", "مغلق")
TO = ("to", "إلى")
DAY_LONG_AR = ("السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة")
DAY_SHORT_EN = ("Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri")

# The title of a proposal by type and target; `{place}` is the place's name.
TITLES: dict[tuple[str, str], tuple[str, str]] = {
    ("set_hours", "listing"): (
        "Set the opening hours at {place}", "ضبط ساعات العمل في {place}"),
    ("set_hours", "website"): (
        "Correct the opening hours on the website for {place}",
        "تصحيح ساعات العمل في الموقع الإلكتروني لـ{place}"),
    ("set_phone", "listing"): (
        "Correct the phone number at {place}", "تصحيح رقم الهاتف في {place}"),
    ("set_phone", "website"): (
        "Correct the phone number on the website for {place}",
        "تصحيح رقم الهاتف في الموقع الإلكتروني لـ{place}"),
    ("set_category", "listing"): (
        "Set the main category at {place}", "تحديد التصنيف الرئيسي في {place}"),
    ("set_name", "listing"): (
        "Correct the business name at {place}", "تصحيح اسم المنشأة في {place}"),
    ("add_whatsapp_link", "website"): (
        "Add the WhatsApp link to the website for {place}",
        "إضافة رابط واتساب إلى الموقع الإلكتروني لـ{place}"),
    ("reply_to_review", "listing"): (
        "Reply to a review rated {rating} of 5 at {place}",
        "الرد على مراجعة بتقييم {rating} من 5 في {place}"),
}

# "By rule: ..." for a proposal: what the rule saw and the fact it rests on, by rule and target.
RULE_LINES: dict[tuple[str, str], tuple[str, str]] = {
    ("hours_missing", "listing"): (
        "The listing shows no opening hours, and you confirmed this branch's hours.",
        "لا تظهر ساعات عمل في الملف التجاري، وقد أكّدت ساعات هذا الفرع."),
    ("hours_conflict", "listing"): (
        "The listing shows different hours from the ones you confirmed for this branch.",
        "يعرض الملف التجاري ساعات تختلف عن التي أكّدتها لهذا الفرع."),
    ("hours_conflict", "website"): (
        "The website shows different hours from the ones you confirmed for this branch.",
        "يعرض الموقع الإلكتروني ساعات تختلف عن التي أكّدتها لهذا الفرع."),
    ("phone_conflict", "listing"): (
        "The listing shows a different phone number from the one you confirmed for this branch.",
        "يعرض الملف التجاري رقم هاتف يختلف عن الذي أكّدته لهذا الفرع."),
    ("phone_conflict", "website"): (
        "The website shows a different phone number from the one you confirmed for this branch.",
        "يعرض الموقع الإلكتروني رقم هاتف يختلف عن الذي أكّدته لهذا الفرع."),
    ("category_missing", "listing"): (
        "The listing has no main category, and you confirmed this branch's category.",
        "لا يوجد تصنيف رئيسي للملف التجاري، وقد أكّدت تصنيف هذا الفرع."),
    ("name_conflict", "listing"): (
        "The listing spells the name differently from the name you confirmed for this branch.",
        "يكتب الملف التجاري الاسم بصيغة تختلف عن الاسم الذي أكّدته لهذا الفرع."),
    ("whatsapp_link_missing", "website"): (
        "The website has no WhatsApp link to this branch's number, which you confirmed.",
        "لا يوجد في الموقع الإلكتروني رابط واتساب إلى رقم هذا الفرع الذي أكّدته."),
    ("review_unanswered", "listing"): (
        "A review of 3 stars or fewer, older than 7 days, has no reply. The reply is a fixed "
        "text chosen by the stars.",
        "مراجعة بتقييم 3 نجوم أو أقل، مضى عليها أكثر من 7 أيام، بلا رد. والرد نص ثابت "
        "يُختار بحسب النجوم."),
}

# A failure's reason, the line that says what was or was not changed (always "nothing" today), and
# what happens next. `{where}` is "listing" or "website" (English) and the Arabic place word.
FAILURES: dict[str, dict[str, tuple[str, str]]] = {
    "stale_before": {
        "reason": ("The {where} changed since this was proposed.",
                   "تغيّر {where} منذ اقتراح هذا التعديل."),
        "next": ("The next check-up proposes it again.", "يقترحه الفحص التالي من جديد."),
    },
    "connector_off": {
        "reason": ("The source is switched off.", "المصدر متوقف."),
        "next": ("", ""),
    },
    "connector_unavailable": {
        "reason": ("The source could not be reached.", "تعذّر الوصول إلى المصدر."),
        "next": ("You can try again.", "يمكنك المحاولة مرة أخرى."),
    },
    "not_permitted": {
        "reason": ("This account is not allowed to make that change.",
                   "هذا الحساب غير مصرّح له بهذا التعديل."),
        "next": ("", ""),
    },
    "refused": {
        "reason": ("The source refused the change.", "رفض المصدر التعديل."),
        "next": ("", ""),
    },
    "apply_gave_up": {
        "reason": ("The change could not be applied after several tries.",
                   "تعذّر تطبيق التعديل بعد عدة محاولات."),
        "next": ("You can try again.", "يمكنك المحاولة مرة أخرى."),
    },
}
NOTHING_CHANGED = ("Nothing was changed.", "لم يتغير شيء.")
WHERE_FAILURE = {
    "listing": ("listing", "الملف التجاري"),
    "website": ("website", "الموقع الإلكتروني"),
}

# The review's reply, chosen by rule: rating (1 or 2, 3) and language. The shop's own voice.
# `{contact}` is "us on WhatsApp at +974 5555 0150" or "the branch" (Arabic: «معنا عبر واتساب على
# الرقم …» or «مع الفرع»). At most 240 characters (a test).
REPLIES: dict[str, str] = {
    "reply_low_en": (
        "Thank you for telling us. We are sorry the visit did not go as it should have. "
        "Please contact {contact} so the team can put it right."
    ),
    "reply_mid_en": (
        "Thank you for your feedback. We want every visit to be better than this one. "
        "Please contact {contact} and tell the team how."
    ),
    "reply_low_ar": (
        "شكراً لإبلاغنا. نأسف لأن الزيارة لم تكن كما ينبغي. "
        "يرجى التواصل {contact} ليتمكن الفريق من تصحيح الأمر."
    ),
    "reply_mid_ar": (
        "شكراً على ملاحظاتكم. نريد أن تكون كل زيارة أفضل من هذه. "
        "يرجى التواصل {contact} وإخبار الفريق كيف."
    ),
}
CONTACTS = {
    "whatsapp": {"en": "us on WhatsApp at {number}", "ar": "معنا عبر واتساب على الرقم {number}"},
    "branch": {"en": "the branch", "ar": "مع الفرع"},
}
MAX_REPLY = 240

# What the history of a proposal says (the activity record, worded).
HISTORY: dict[str, tuple[str, str]] = {
    "proposal.propose.engine": ("A check-up prepared this change.", "أعدّ الفحص هذا التعديل."),
    "proposal.propose.person": ("{name} prepared this change.", "أعدّ {name} هذا التعديل."),
    "proposal.approve": ("{name} approved this change{via}.", "وافق {name} على هذا التعديل{via}."),
    "proposal.decline": ("{name} declined this change{via}.", "رفض {name} هذا التعديل{via}."),
    "proposal.expire.time": (
        "It expired after 14 days. Nothing was applied.", "انتهت مهلته بعد 14 يوماً. لم يُطبَّق شيء."),
    "proposal.expire.finding_gone": (
        "A check-up no longer found the problem. Nothing was applied.",
        "لم يجد الفحص المشكلة بعد الآن. لم يُطبَّق شيء."),
    "proposal.expire.finding_done": (
        "The item was marked done. Nothing was applied.", "عُلّم البند منجزاً. لم يُطبَّق شيء."),
    "proposal.expire.finding_skipped": (
        "The item was set aside. Nothing was applied.", "أُجّل البند. لم يُطبَّق شيء."),
    "proposal.expire.superseded": (
        "A newer change replaced it. Nothing was applied.",
        "حلّ محلّه تعديل أحدث. لم يُطبَّق شيء."),
    "proposal.apply": ("The change was applied.", "طُبّق التعديل."),
    "proposal.fail": ("The change was not applied: {reason}", "لم يُطبَّق التعديل: {reason}"),
    "proposal.undo": ("{name} undid this change.", "تراجع {name} عن هذا التعديل."),
    "proposal.verify.confirmed": (
        "A check-up confirmed it.", "أكّد الفحص أن التعديل ظاهر."),
    "proposal.verify.not_confirmed": (
        "Applied, but the next check-up still found it.",
        "طُبّق، لكن الفحص التالي ما زال يجد المشكلة."),
}
VIA = {
    "whatsapp": (" from WhatsApp", " من واتساب"),
    "portal": (" in the workspace", " في مساحة العمل"),
}

# ── the asks on WhatsApp ────────────────────────────────────────────────────────────────

BUTTONS: dict[str, tuple[str, str]] = {
    "approve": ("Approve", "موافقة"),
    "later": ("Not now", "ليس الآن"),
    "details": ("See details", "التفاصيل"),
}
ASK_HEAD = (
    "*{shop}*: a change is waiting for your approval.",
    "*{shop}*: يوجد تعديل بانتظار موافقتك.",
)
ASK_NOW = ("Now on {where}: {before}", "الحالي في {where}: {before}")
ASK_PROPOSED = ("Proposed: {after}", "المقترح: {after}")
ASK_RULE = ("_By rule: {rule}_", "_بحسب القاعدة: {rule}_")
ASK_TAP = (
    "Nothing changes until you tap Approve.",
    "لا يتغير شيء قبل أن تضغط «موافقة».",
)
ASK_LINE = ("{label} at {place}", "{label} في {place}")
DETAIL_HEAD = ("*{shop}*: {title}", "*{shop}*: {title}")
DETAIL_NOW = ("Now on {where}:", "الحالي في {where}:")
DETAIL_PROPOSED = ("Proposed:", "المقترح:")
DETAIL_LINK = ("Open it in your workspace: {link}", "افتحه في مساحة العمل: {link}")

# The template outside the 24-hour window. Written and HELD: not submitted to Meta (the founder's
# go), and used only while `ALYR_DISCOVERY_ASK_TEMPLATE_APPROVED` is on. Meta may file it as
# marketing, in which case it is not used.
TEMPLATE_EN = (
    "Change waiting at {{1}}: {{2}} for {{3}} would go from {{4}} to {{5}}. Nothing changes "
    "until you tap Approve. Send PROPOSALS OFF to stop these messages."
)
TEMPLATE_AR = (
    "تعديل بانتظارك في {{1}}: {{2}} لـ{{3}} سيتغير من {{4}} إلى {{5}}. لا يتغير شيء قبل أن "
    "تضغط «موافقة». أرسل «إيقاف التعديلات» لإيقاف هذه الرسائل."
)

# What a tap is answered with.
REPLY: dict[str, tuple[str, str]] = {
    "approved": (
        "Approved: {what} at {place}. The change is being applied.",
        "تمت الموافقة: {what} في {place}. يجري تطبيق التعديل."),
    "already": ("This change was already approved.", "سبقت الموافقة على هذا التعديل."),
    "applied": (
        "Done: {what} at {place} is now {after}. You can undo it in your workspace until {date}.",
        "تم: {what} في {place} أصبح {after}. يمكنك التراجع عنه من مساحة العمل حتى {date}."),
    "applied_no_undo": (
        "Done: {what} at {place} is now {after}.", "تم: {what} في {place} أصبح {after}."),
    "failed": (
        "The change was not applied: {reason} Nothing was changed. It stays in your workspace.",
        "لم يُطبَّق التعديل: {reason} لم يتغير شيء. يبقى في مساحة العمل."),
    "later": (
        "Okay. It stays in your workspace under Proposals until {date}.",
        "حسناً. يبقى في مساحة العمل ضمن التعديلات المقترحة حتى {date}."),
    "closed": ("This change is closed. Nothing was applied.", "أُغلق هذا التعديل. لم يُطبَّق شيء."),
    "other_branch": (
        "That change belongs to another branch. The owner approves it.",
        "هذا التعديل يخص فرعاً آخر. يوافق عليه صاحب المحل."),
    "gone": (
        "That request is no longer available. Open your workspace to see what is waiting.",
        "لم يعد هذا الطلب متاحاً. افتح مساحة العمل لترى ما ينتظرك."),
    "not_linked": (
        "This number is not linked to a login. Ask the owner to link it from the workspace.",
        "هذا الرقم غير مربوط بحساب. اطلب من صاحب المحل ربطه من مساحة العمل."),
    "off": (
        "Done. These messages are off for this number. Send PROPOSALS ON to turn them back on.",
        "تم. توقفت هذه الرسائل لهذا الرقم. أرسل «تشغيل التعديلات» لإعادتها."),
    "on": (
        "Done. Changes waiting for your approval will be sent to this number again.",
        "تم. ستصلك التعديلات التي تنتظر موافقتك على هذا الرقم من جديد."),
    "nothing": ("Nothing is waiting.", "لا شيء ينتظرك."),
    "waiting_head": ("*{n} waiting for you*", "*{n} بانتظارك*"),
    "more": ("and {n} more", "و{n} أخرى"),
    "open": ("Open them in your workspace: {link}", "افتحها في مساحة العمل: {link}"),
}
COMMAND_HELP = {
    "proposals": (
        "PROPOSALS: changes waiting for your approval", "التعديلات: التعديلات بانتظار موافقتك"
    ),
    "off": ("PROPOSALS OFF: stop sending them to this number",
            "إيقاف التعديلات: أوقف إرسالها إلى هذا الرقم"),
}

# What the brief line and the Agent's "Needs you now" say; `{n}` is a counted noun.
BRIEF = {
    "line": ("{n} waiting for your approval", "{n} بانتظار موافقتك"),
    "rule": (
        "a proposed change is waiting for your approval, not older than 14 days",
        "تعديل مقترح بانتظار موافقتك، عمره أقل من 14 يوماً",
    ),
    "detail_oldest": ("the oldest for {n}", "أقدمها منذ {n}"),
}


def pick(pair: tuple[str, str], lang: str) -> str:
    return pair[1] if lang == "ar" else pair[0]


def lines(lang: str, *rows: str) -> str:
    """A message as lines; in Arabic every non-empty line opens with U+200F."""
    if lang == "ar":
        rows = tuple(f"{RLM}{row}" if row else row for row in rows)
    return "\n".join(rows)


def lower_first(text: str, lang: str) -> str:
    """A sentence continued after "By rule:" starts in lower case in English."""
    return text if lang == "ar" or not text else text[0].lower() + text[1:]


# ── hours, values and a change in words ────────────────────────────────────────────────


def _day(index: int, lang: str) -> str:
    return DAY_LONG_AR[index] if lang == "ar" else DAY_SHORT_EN[index]


def _span(value, lang: str) -> str:
    if not value:
        return pick(CLOSED, lang)
    return f"{value[0]} {pick(TO, lang)} {value[1]}"


def hours_lines(hours: dict | None, lang: str) -> list[dict]:
    """The seven rows the approval sheet shows, Saturday first. No hours at all: no rows."""
    if not hours or not any(hours.values()):
        return []
    return [{"day": day, "text": _span(hours.get(day), lang)} for day in WEEK]


def hours_text(hours: dict | None, lang: str) -> str:
    """One line: consecutive days with the same hours are run together ("Sat to Thu 07:00 to
    22:00; Fri 13:00 to 22:00"; a closed day: "Fri closed")."""
    if not hours or not any(hours.values()):
        return pick(NONE_TEXT["default"], lang)
    groups: list[tuple[list[int], object]] = []
    for index, day in enumerate(WEEK):
        value = tuple(hours[day]) if hours.get(day) else None
        if groups and groups[-1][1] == value:
            groups[-1][0].append(index)
        else:
            groups.append(([index], value))
    parts = []
    for indexes, value in groups:
        first, last = _day(indexes[0], lang), _day(indexes[-1], lang)
        days = first if len(indexes) == 1 else f"{first} {pick(TO, lang)} {last}"
        parts.append(f"{days} {_span(value, lang)}")
    return ("؛ " if lang == "ar" else "; ").join(parts)


def value_text(field: str, value: dict | None, lang: str) -> str:
    """A before or an after as one line."""
    value = value if isinstance(value, dict) else {}
    if field == "hours":
        return hours_text(value, lang)
    key = {"phone": "phone", "category": "category", "name": "name", "whatsapp_link": "url",
           "review_reply": "reply"}[field]
    found = (value.get(key) or "").strip()
    if found:
        return found
    return pick(NONE_TEXT["review_reply" if field == "review_reply" else "default"], lang)


def change_lines(change: dict, lang: str, target: str = "listing") -> dict:
    """The one function the workspace and WhatsApp both call to word a change, so the two cannot
    disagree: `{field_label, where, before: {text, lines}, after: {text, lines}}`. `lines` is the
    seven days for hours and empty for everything else."""
    field = change["field"]
    out = {
        "field_label": pick(FIELD_LABELS[field], lang),
        "where": pick(WHERE[target], lang),
    }
    for side in ("before", "after"):
        value = change.get(side)
        out[side] = {
            "text": value_text(field, value, lang),
            "lines": hours_lines(value, lang) if field == "hours" else [],
        }
    return out


# ── titles, rule lines, failures, replies ──────────────────────────────────────────────


def title(ptype: str, target: str, place: str, lang: str, rating: int | None = None) -> str:
    return pick(TITLES[(ptype, target)], lang).format(place=place, rating=rating)


def rule_line(rule_id: str, target: str, lang: str) -> str:
    return pick(RULE_LINES[(rule_id, target)], lang)


def failure(code: str | None, target: str, lang: str, *, short: bool = False) -> str:
    """A failure in plain words: the reason, what was changed (nothing), what happens next.
    `short` is the reason alone, for the WhatsApp message that adds the rest itself."""
    entry = FAILURES.get(code or "") or FAILURES["refused"]
    where = pick(WHERE_FAILURE[target], lang)
    reason = pick(entry["reason"], lang).format(where=where)
    if short:
        return reason
    tail = pick(entry["next"], lang)
    return " ".join(part for part in (reason, pick(NOTHING_CHANGED, lang), tail) if part)


def format_number(e164: str) -> str:
    """+97455550150 as +974 5555 0150 (Qatar's numbers in groups of four); any other as given."""
    if e164.startswith("+974") and len(e164) == 12:
        return f"+974 {e164[4:8]} {e164[8:]}"
    return e164


def reply_text(rating: int, language: str, whatsapp_e164: str | None) -> tuple[str, str]:
    """The reply for a review of this many stars, and the template's name. `ar` gets Arabic;
    anything else gets English. Nothing of the review is in it."""
    lang = "ar" if language == "ar" else "en"
    name = f"reply_{'low' if rating <= 2 else 'mid'}_{lang}"
    if whatsapp_e164:
        contact = CONTACTS["whatsapp"][lang].format(number=format_number(whatsapp_e164))
    else:
        contact = CONTACTS["branch"][lang]
    return REPLIES[name].format(contact=contact), name


def shop_date(moment: datetime, tz: str, lang: str) -> str:
    """The shop's own date: "Tue 24 Nov" or «24/11»."""
    local = moment.astimezone(ZoneInfo(tz or "Asia/Qatar"))
    if lang == "ar":
        return f"{local.day}/{local.month}"
    names = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    return f"{names[local.weekday()]} {local.day} {months[local.month - 1]}"


def n_changes(n: int, lang: str) -> str:
    return counted(n, CHANGES, lang)


def waiting_text(n: int, lang: str) -> str:
    """"2 changes waiting for your approval" / «تعديلان بانتظار موافقتك»."""
    return pick(BRIEF["line"], lang).format(n=counted(n, CHANGES, lang))


def all_texts() -> list[str]:
    """Every fixed string, for the tests that look for gaps, ellipses and banned words. The
    review replies are outside the first-person test and are returned by `reply_texts`."""
    out: list[str] = []
    tables = (
        FIELD_LABELS, WHERE, NONE_TEXT, TITLES, RULE_LINES, BUTTONS, REPLY, COMMAND_HELP,
        HISTORY, VIA, BRIEF, WHERE_FAILURE, CONTACTS_FLAT,
    )
    for table in tables:
        for pair in table.values():
            out.extend(pair)
    for entry in FAILURES.values():
        for pair in entry.values():
            out.extend(pair)
    for pair in (
        CLOSED, TO, NOTHING_CHANGED, ASK_HEAD, ASK_NOW, ASK_PROPOSED, ASK_RULE, ASK_TAP, ASK_LINE,
        DETAIL_HEAD, DETAIL_NOW, DETAIL_PROPOSED, DETAIL_LINK,
    ):
        out.extend(pair)
    out.extend((TEMPLATE_EN, TEMPLATE_AR))
    out.extend(DAY_LONG_AR)
    out.extend(DAY_SHORT_EN)
    return out


# A flat view of CONTACTS for `all_texts`: (English, Arabic) pairs.
CONTACTS_FLAT = {k: (v["en"], v["ar"]) for k, v in CONTACTS.items()}
