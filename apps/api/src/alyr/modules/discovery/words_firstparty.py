"""The words of the first-party checks (`firstparty.py`), in English and Arabic, in the shape of
`words.py`: each rule's title, rule, why, what happens and what is needed; the labels, places and
values of its evidence; and the column heading of each check.

The engine (workstream B) merges these into `words.py`'s lookups through one import, and words a
value with `value_text` here first (it answers None for a value that is not one of these markers).
This file imports nothing from `words.py`, so that import cannot go round in a circle.

The voice is the Agent's: it counts, compares and shows the rule. Nothing here says or implies AI,
claims ALYR changed something outside ALYR, or puts a figure on lost sales. The Arabic is a draft
for the native reviewer (ALY-66), written whole per sentence; counts agree through `counted()`.
"""

from datetime import date

from alyr.core.words import ORDERS, Noun, counted
from alyr.modules.agent.words import DAY_SHORT, MONTHS

BOOKINGS: Noun = (("booking", "bookings"), ("حجز واحد", "حجزان", "حجوزات", "حجزاً"))

# rule id -> (title, rule, why, what_happens, what_is_needed), each (English, Arabic).
RULE_WORDS: dict[str, dict[str, tuple[str, str]]] = {
    "hours_vs_activity": {
        "title": (
            "The listed hours leave out times when customers order and book",
            "الساعات المنشورة لا تشمل أوقاتاً يطلب فيها العملاء ويحجزون",
        ),
        "rule": (
            "on at least 3 of the last 4 of the same weekday, ALYR has orders or bookings at a "
            "time the listing or the website shows the business closed",
            "في 3 على الأقل من آخر 4 أيام من اليوم نفسه في الأسبوع، توجد في ALYR طلبات أو "
            "حجوزات في وقت تُظهر فيه صفحة Google أو الموقع الإلكتروني أن المنشأة مغلقة",
        ),
        "why": (
            "A customer who checks the hours first sees closed and may go elsewhere, while the "
            "business's own records in ALYR show customers ordering and booking at those times.",
            "العميل الذي يتحقق من الساعات أولاً يرى أنكم مغلقون وقد يذهب إلى غيركم، بينما تُظهر "
            "سجلات المنشأة في ALYR عملاء يطلبون ويحجزون في تلك الأوقات.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once the listed hours cover these times, the next "
            "check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين تشمل الساعات المنشورة هذه الأوقات يُغلق الفحص "
            "التالي هذا البند.",
        ),
        "what_is_needed": (
            "The owner confirms the real opening hours for each day. ALYR never sets hours "
            "on the strength of orders or bookings alone.",
            "يؤكد المالك ساعات العمل الفعلية لكل يوم. لا تأخذ ALYR الساعات من الطلبات أو "
            "الحجوزات وحدها.",
        ),
    },
    "own_links_present": {
        "title": (
            "The link to the booking or order page is missing",
            "رابط صفحة الحجز أو الطلب غير موجود",
        ),
        "rule": (
            "the listing or the website does not link to the business's own booking page or "
            "order page on ALYR",
            "صفحة Google أو الموقع الإلكتروني لا يربط بصفحة الحجز أو صفحة الطلب الخاصة "
            "بالمنشأة على ALYR",
        ),
        "why": (
            "A customer who finds the business has to call or search again to book or order, "
            "instead of tapping once.",
            "العميل الذي يجد المنشأة يضطر إلى الاتصال أو البحث مجدداً ليحجز أو يطلب، بدلاً من "
            "نقرة واحدة.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once the links are there, the next check-up closes "
            "this item.",
            "لا يتغير شيء من تلقاء نفسه. حين تُضاف الروابط يُغلق الفحص التالي هذا البند.",
        ),
        "what_is_needed": (
            "The owner, or the person who looks after the website, adds the links shown here.",
            "يضيف المالك، أو من يتولى الموقع الإلكتروني، الروابط المذكورة هنا.",
        ),
    },
    "whatsapp_number_mismatch": {
        "title": (
            "A WhatsApp link points to a number that is not the business's",
            "رابط واتساب يشير إلى رقم ليس رقم المنشأة",
        ),
        "rule": (
            "a WhatsApp link on the listing or the website points to a number other than the "
            "business's confirmed WhatsApp number",
            "رابط واتساب على صفحة Google أو في الموقع الإلكتروني يشير إلى رقم غير رقم واتساب "
            "المؤكد للمنشأة",
        ),
        "why": (
            "Customers who tap it write to another number, and their messages never reach the "
            "business.",
            "العملاء الذين ينقرون عليه يراسلون رقماً آخر، ولا تصل رسائلهم إلى المنشأة.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once every link points to the confirmed number, the "
            "next check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين تشير كل الروابط إلى الرقم المؤكد يُغلق الفحص "
            "التالي هذا البند.",
        ),
        "what_is_needed": (
            "The owner corrects the link on the listing or the website, or confirms a different "
            "number in ALYR.",
            "يصحح المالك الرابط على صفحة Google أو في الموقع الإلكتروني، أو يؤكد رقماً آخر في "
            "ALYR.",
        ),
    },
    "bilingual_name_rule": {
        "title": (
            "The listing's name repeats the business name in two languages",
            "اسم الصفحة على Google يكرر اسم المنشأة بلغتين",
        ),
        "rule": (
            "the name on the listing carries the business's English name and its Arabic name "
            "together",
            "الاسم على صفحة Google يجمع اسم المنشأة بالإنجليزية واسمها بالعربية معاً",
        ),
        "why": (
            "Google's guidelines, as updated in August 2026, do not allow the same name written "
            "in two scripts in the name field, even when the shop sign shows both. A listing that "
            "breaks a guideline can be suspended.",
            "لا تسمح إرشادات Google، كما حُدّثت في أغسطس 2026، بكتابة الاسم نفسه بخطّين في حقل "
            "الاسم، حتى لو كانت لافتة المحل تحمل الاثنين. والصفحة المخالفة للإرشادات قد تُعلَّق.",
        ),
        "what_happens": (
            "Nothing changes by itself, and ALYR does not change a name for you. Once the name "
            "field carries one name, the next check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه، ولا تغيّر ALYR الاسم نيابةً عنك. حين يحمل حقل الاسم "
            "اسماً واحداً يُغلق الفحص التالي هذا البند.",
        ),
        "what_is_needed": (
            "The owner chooses the one name the listing uses and changes it on Google.",
            "يختار المالك اسماً واحداً للصفحة ويغيّره على Google.",
        ),
    },
    "season_due": {
        "title": (
            "Season due: confirm the hours for it",
            "موسم قادم: أكّد ساعات العمل فيه",
        ),
        "rule": (
            "Ramadan is 4 weeks away or its start was announced, Eid was announced, or Qatar "
            "National Day is 3 weeks away",
            "بقيت 4 أسابيع على رمضان أو أُعلن بدؤه، أو أُعلن العيد، أو بقيت 3 أسابيع على اليوم "
            "الوطني لقطر",
        ),
        "why": (
            "Many businesses change their hours during these days. A customer who sees the "
            "usual hours may arrive at a closed door.",
            "تغيّر منشآت كثيرة ساعاتها في هذه الأيام، والعميل الذي يرى الساعات المعتادة قد يصل "
            "والباب مغلق.",
        ),
        "what_happens": (
            "Nothing changes by itself. ALYR does not guess dates: they come from a calendar ALYR "
            "staff keep and correct when the official date is announced. This item closes once "
            "the day arrives.",
            "لا يتغير شيء من تلقاء نفسه. لا تخمّن ALYR التواريخ: تأتي من تقويم يحتفظ به فريق "
            "ALYR ويصححه حين يُعلن التاريخ الرسمي. يُغلق هذا البند حين يحل اليوم.",
        ),
        "what_is_needed": (
            "The owner says whether the hours stay the same, and if not, the hours for those "
            "days.",
            "يحدد المالك إن كانت الساعات ستبقى كما هي، وإن لم تكن، فالساعات لتلك الأيام.",
        ),
    },
}

LABELS: dict[str, tuple[str, str]] = {
    "fp_listing_day": ("Hours on the listing that day", "الساعات على صفحة Google في ذلك اليوم"),
    "fp_website_day": (
        "Hours on the website that day", "الساعات في الموقع الإلكتروني في ذلك اليوم"),
    "fp_outside_listing": (
        "Orders and bookings outside the listing's hours", "طلبات وحجوزات خارج ساعات صفحة Google"),
    "fp_outside_website": (
        "Orders and bookings outside the website's hours",
        "طلبات وحجوزات خارج ساعات الموقع الإلكتروني",
    ),
    "fp_confirmed_hours": ("Hours the owner confirmed", "الساعات التي أكدها المالك"),
    "fp_booking_link": ("Link to the booking page", "رابط صفحة الحجز"),
    "fp_order_link": ("Link to the order page", "رابط صفحة الطلب"),
    "fp_expected_booking": ("The business's booking page", "صفحة الحجز الخاصة بالمنشأة"),
    "fp_expected_order": ("The business's order page", "صفحة الطلب الخاصة بالمنشأة"),
    "fp_confirmed_whatsapp": (
        "The business's confirmed WhatsApp number", "رقم واتساب المؤكد للمنشأة"),
    "fp_name_en": ("The business's name in English", "اسم المنشأة بالإنجليزية"),
    "fp_name_ar": ("The business's name in Arabic", "اسم المنشأة بالعربية"),
    "fp_season": ("Season due", "موسم قادم"),
}
WHERE: dict[str, tuple[str, str]] = {
    "alyr_records": ("Orders and bookings in ALYR", "الطلبات والحجوزات في ALYR"),
    "alyr_pages": ("The business's pages on ALYR", "صفحات المنشأة على ALYR"),
    "alyr_calendar": ("ALYR's calendar of dates", "تقويم التواريخ لدى ALYR"),
}
VALUES: dict[str, tuple[str, str]] = {
    "~fp_missing": ("Not there", "غير موجود"),
    "~fp_not_confirmed": ("Not confirmed yet", "لم تُؤكَّد بعد"),
}
# rule id -> what passing looks like, in a few words (the column heading per place).
CHECK_NAMES: dict[str, tuple[str, str]] = {
    "hours_vs_activity": (
        "Hours cover orders and bookings", "الساعات تشمل الطلبات والحجوزات"),
    "own_links_present": ("Booking and order links", "روابط الحجز والطلب"),
    "whatsapp_number_mismatch": ("WhatsApp number matches", "رقم واتساب مطابق"),
    "bilingual_name_rule": ("Name in one language", "الاسم بلغة واحدة"),
    "season_due": ("Seasonal hours", "ساعات المواسم"),
}
SEASON_NAMES: dict[str, tuple[str, str]] = {
    "ramadan": ("Ramadan", "رمضان"),
    "eid_al_fitr": ("Eid al-Fitr", "عيد الفطر"),
    "eid_al_adha": ("Eid al-Adha", "عيد الأضحى"),
    "national_day": ("Qatar National Day", "اليوم الوطني لقطر"),
}
# How a season's date is said: published in advance, announced, or a date that does not move.
SEASON_WHEN: dict[str, tuple[str, str]] = {
    "expected": ("{name}, expected to start around {day}", "{name}، يُتوقع أن يبدأ نحو {day}"),
    "announced": ("{name}, starting {day} as announced", "{name}، يبدأ في {day} حسب الإعلان"),
    "fixed": ("{name}, {day}", "{name}، {day}"),
}
CLOSED = ("closed", "مغلق")


def _pick(pair: tuple[str, str], lang: str) -> str:
    return pair[1] if lang == "ar" else pair[0]


def _day(iso: str, lang: str, weekday: bool = False) -> str:
    """ "20 Nov 2026" or «20 نوفمبر 2026», with the short weekday first if asked; Western digits."""
    day = date.fromisoformat(iso)
    text = f"{day.day} {MONTHS[lang][day.month - 1]} {day.year}"
    if weekday:
        text = f"{DAY_SHORT[lang][(day.weekday() + 1) % 7]} {text}"
    return text


def value_text(value: str, lang: str) -> str | None:
    """A first-party marker in the reader's language, or None when `value` is not one (then
    `words.value_text` words it)."""
    if value in VALUES:
        return _pick(VALUES[value], lang)
    if value.startswith("~fp_act:"):
        iso, orders, bookings = value[len("~fp_act:"):].split(":")
        parts = []
        if orders != "-":
            parts.append(counted(int(orders), ORDERS, lang))
        if bookings != "-":
            parts.append(counted(int(bookings), BOOKINGS, lang))
        joined = ("، " if lang == "ar" else ", ").join(parts)
        return f"{_day(iso, lang, weekday=True)}: {joined}"
    if value.startswith("~fp_day:"):
        weekday, shown = value[len("~fp_day:"):].split(":", 1)
        names = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
        hours = _pick(CLOSED, lang) if shown == "closed" else shown
        return f"{DAY_SHORT[lang][names.index(weekday)]}: {hours}"
    if value.startswith("~fp_season:"):
        key, iso, state = value[len("~fp_season:"):].split(":")
        return _pick(SEASON_WHEN[state], lang).format(
            name=_pick(SEASON_NAMES[key], lang), day=_day(iso, lang))
    return None


def rule_text(rule_id: str, field: str, lang: str) -> str:
    return _pick(RULE_WORDS[rule_id][field], lang)


def all_texts() -> list[str]:
    """Every string this file can say, for the tests that look for gaps, ellipses and banned
    words."""
    out: list[str] = []
    for fields in RULE_WORDS.values():
        for pair in fields.values():
            out.extend(pair)
    for table in (LABELS, WHERE, VALUES, CHECK_NAMES, SEASON_NAMES, SEASON_WHEN):
        for pair in table.values():
            out.extend(pair)
    out.extend(CLOSED)
    return out
