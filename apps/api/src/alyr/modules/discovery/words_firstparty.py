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
from alyr.modules.agent.words import DAY_PLURAL, DAY_SHORT, MONTHS

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

# ── GET /first-party: where each fact comes from (agent C3) ──────────────────────────────
# source key -> the words under a fact on the screen. The WhatsApp number's keys are
# `FirstPartyFacts.whatsapp_source`.
FACT_SOURCES: dict[str, tuple[str, str]] = {
    "alyr_records": ("Orders and bookings in ALYR", "الطلبات والحجوزات في ALYR"),
    "alyr_pages": ("The business's pages on ALYR", "صفحات المنشأة على ALYR"),
    "business": ("The business's details in ALYR", "بيانات المنشأة في ALYR"),
    "owner": ("Confirmed in ALYR", "مؤكَّد في ALYR"),
    "sample": ("Sample data", "بيانات تجريبية"),
    "shop_settings": ("The number on the order page", "الرقم في صفحة الطلب"),
    "meta": ("The number connected to ALYR on WhatsApp", "الرقم المتصل بـ ALYR على واتساب"),
}

# ── a sentence per check (agent C3) ───────────────────────────────────────────────────────
# What was looked at and what it showed, in the reader's language, for the Checks screen
# (`check_sentences.py` gives the twelve core checks theirs). A check that was not measured says
# `"{subject}: Not measured."`. Each template is whole per language; values are filled in.
NOT_MEASURED = ("{subject}: Not measured.", "{subject}: لم يُقَس.")
SUBJECTS: dict[str, tuple[str, str]] = {
    "hours_vs_activity": (
        "Your listed hours against orders and bookings in ALYR",
        "ساعاتك المنشورة مقارنةً بالطلبات والحجوزات في ALYR",
    ),
    "own_links_present": (
        "Links to your booking and order pages on ALYR",
        "روابط صفحتَي الحجز والطلب الخاصتين بك على ALYR",
    ),
    "whatsapp_number_mismatch": (
        "WhatsApp links against your confirmed number",
        "روابط واتساب مقارنةً برقمك المؤكد",
    ),
    "bilingual_name_rule": (
        "The name on your Google listing", "الاسم على صفحتك في Google"),
    "season_due": ("Seasonal dates in ALYR's calendar", "مواعيد المواسم في تقويم ALYR"),
}
PASSES: dict[str, tuple[str, str]] = {
    "hours_vs_activity": (
        "Over the last 4 weeks, your listed hours cover every time ALYR has orders or bookings "
        "on 3 or more of the same weekday.",
        "خلال آخر 4 أسابيع، تشمل ساعاتك المنشورة كل وقت فيه طلبات أو حجوزات في ALYR في 3 أيام "
        "أو أكثر من اليوم نفسه في الأسبوع.",
    ),
    "own_links_present": (
        "Your Google listing or website links to your own pages on ALYR.",
        "صفحتك على Google أو موقعك الإلكتروني يربط بصفحاتك الخاصة على ALYR.",
    ),
    "whatsapp_number_mismatch": (
        "Every WhatsApp link shown opens your confirmed WhatsApp number.",
        "كل روابط واتساب الظاهرة تفتح رقم واتساب المؤكد لديك.",
    ),
    "bilingual_name_rule": (
        "The name on your Google listing is in one language.",
        "الاسم على صفحتك في Google بلغة واحدة.",
    ),
    "season_due": (
        "By ALYR's calendar, no Ramadan, Eid or National Day is close.",
        "حسب تقويم ALYR، لا يقترب رمضان أو العيد أو اليوم الوطني.",
    ),
}
# A difference with no evidence left to quote (an older check-up): the rule's own words.
DIFFERS: dict[str, tuple[str, str]] = {
    "hours_vs_activity": (
        "Your listed hours leave out times when ALYR has orders or bookings.",
        "ساعاتك المنشورة لا تشمل أوقاتاً فيها طلبات أو حجوزات في ALYR.",
    ),
    "own_links_present": (
        "Your Google listing or website has no link to your booking or order page on ALYR.",
        "لا يوجد في صفحتك على Google أو في موقعك الإلكتروني رابط إلى صفحة الحجز أو الطلب "
        "الخاصة بك على ALYR.",
    ),
    "whatsapp_number_mismatch": (
        "A WhatsApp link shown opens a number that is not your confirmed number.",
        "رابط واتساب ظاهر يفتح رقماً غير رقمك المؤكد.",
    ),
    "bilingual_name_rule": (
        "The name on your Google listing carries your English and Arabic names together.",
        "الاسم على صفحتك في Google يجمع اسمك بالإنجليزية واسمك بالعربية معاً.",
    ),
    "season_due": (
        "By ALYR's calendar, a season is close: Ramadan, Eid or National Day.",
        "حسب تقويم ALYR، يقترب موسم: رمضان أو العيد أو اليوم الوطني.",
    ),
}
# Where a first-party difference was seen, as the object of a sentence.
SEEN_ON: dict[str, tuple[str, str]] = {
    "listing": ("Google listing", "صفحتك على Google"),
    "website": ("website", "موقعك الإلكتروني"),
}
HOURS_DIFFER = (
    "Your {where} shows {days}, while ALYR has orders or bookings outside those hours on "
    "{busy} of the last 4 {weekdays}.",
    "يظهر في {where} ({days})، بينما في ALYR طلبات أو حجوزات خارج هذه الساعات في {busy} من "
    "آخر 4 أسابيع.",
)
HOURS_DIFFER_DAYS = (
    "Your {where} shows {days}, while ALYR has orders or bookings outside those hours on 3 or "
    "more of the last 4 of each of those weekdays.",
    "يظهر في {where} ({days})، بينما في ALYR طلبات أو حجوزات خارج هذه الساعات في 3 أو أكثر "
    "من آخر 4 أسابيع في كل يوم منها.",
)
LINKS_MISSING: dict[str, tuple[str, str]] = {
    "booking": (
        "Your {where} has no link to your booking page on ALYR.",
        "لا يوجد في {where} رابط إلى صفحة الحجز الخاصة بك على ALYR.",
    ),
    "order": (
        "Your {where} has no link to your order page on ALYR.",
        "لا يوجد في {where} رابط إلى صفحة الطلب الخاصة بك على ALYR.",
    ),
    "both": (
        "Your {where} has no link to your booking page or your order page on ALYR.",
        "لا يوجد في {where} رابط إلى صفحة الحجز ولا إلى صفحة الطلب الخاصتين بك على ALYR.",
    ),
}
NUMBER_DIFFERS = (
    "A WhatsApp link on your {where} opens {shown}, not your confirmed number {confirmed}.",
    "رابط واتساب في {where} يفتح {shown}، لا رقمك المؤكد {confirmed}.",
)
NAME_TWICE = (
    "The name on your Google listing, {name}, carries your English and Arabic names together.",
    "الاسم على صفحتك في Google، {name}، يجمع اسمك بالإنجليزية واسمك بالعربية معاً.",
)
SEASON_CLOSE = (
    "By ALYR's calendar, a season is close: {seasons}.",
    "حسب تقويم ALYR، يقترب موسم: {seasons}.",
)


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


# ── a sentence per check (agent C3) ───────────────────────────────────────────────────────

_ISOLATE = ("⁨", "⁩")  # a number or a Latin name inside an Arabic sentence


def _iso(text: str, lang: str) -> str:
    return f"{_ISOLATE[0]}{text}{_ISOLATE[1]}" if lang == "ar" else text


def _quotable(value) -> bool:
    """A stored value a sentence may quote: text, and not Google's text removed after 30 days."""
    return isinstance(value, str) and bool(value) and value != "~removed"


def link_shown(link: str) -> str:
    """The number a WhatsApp link opens, as +digits, or the link as shown."""
    digits = "".join(ch for ch in link.split("?", 1)[0].split("/")[-1] if ch.isdigit())
    if "phone=" in link:
        digits = "".join(ch for ch in link.split("phone=", 1)[1].split("&", 1)[0] if ch.isdigit())
    return f"+{digits.removeprefix('00')}" if len(digits) >= 8 else link


def _join(parts: list[str], lang: str) -> str:
    return ("، " if lang == "ar" else "; ").join(parts)


def _hours_sentence(evidence: list[dict], lang: str) -> str | None:
    per_where: dict[str, list[tuple[str, int]]] = {}
    current: list | None = None
    for item in evidence:
        label, value, where = item.get("label"), item.get("value"), item.get("where")
        if label in ("fp_listing_day", "fp_website_day") and _quotable(value):
            current = [value, 0]
            per_where.setdefault(where, []).append(current)  # type: ignore[arg-type]
        elif (isinstance(label, str) and label.startswith("fp_outside_") and current is not None
              and _quotable(value) and value.startswith("~fp_act:")):
            counts = value.split(":")[2:]
            if sum(int(n) for n in counts if n.isdigit()) > 0:
                current[1] += 1
    sentences = []
    for where, days in per_where.items():
        if where not in SEEN_ON:
            return None
        shown = _join([value_text(day, lang) or day for day, _ in days], lang)
        place = _pick(SEEN_ON[where], lang)
        if len(days) == 1:
            weekday = days[0][0][len("~fp_day:"):].split(":", 1)[0]
            names = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
            sentences.append(_pick(HOURS_DIFFER, lang).format(
                where=place, days=shown, busy=days[0][1],
                weekdays=DAY_PLURAL["en"][names.index(weekday)]))
        else:
            sentences.append(_pick(HOURS_DIFFER_DAYS, lang).format(where=place, days=shown))
    return " ".join(sentences) or None


def _links_sentence(evidence: list[dict], lang: str) -> str | None:
    missing: dict[str, set[str]] = {}
    for item in evidence:
        label = item.get("label")
        if label in ("fp_booking_link", "fp_order_link") and item.get("where") in SEEN_ON:
            missing.setdefault(item["where"], set()).add(label[3:-5])
    sentences = []
    for where, kinds in missing.items():
        key = "both" if len(kinds) > 1 else next(iter(kinds))
        sentences.append(_pick(LINKS_MISSING[key], lang).format(
            where=_pick(SEEN_ON[where], lang)))
    return " ".join(sentences) or None


def _number_sentence(evidence: list[dict], lang: str) -> str | None:
    confirmed = next((e.get("value") for e in evidence
                      if e.get("label") == "fp_confirmed_whatsapp"), None)
    if not _quotable(confirmed):
        return None
    sentences = []
    for item in evidence:
        if (item.get("label") in ("listing_whatsapp", "website_whatsapp")
                and item.get("where") in SEEN_ON and _quotable(item.get("value"))):
            sentences.append(_pick(NUMBER_DIFFERS, lang).format(
                where=_pick(SEEN_ON[item["where"]], lang),
                shown=_iso(link_shown(item["value"]), lang), confirmed=_iso(confirmed, lang)))
    return " ".join(dict.fromkeys(sentences)) or None


def _name_sentence(evidence: list[dict], lang: str) -> str | None:
    name = next((e.get("value") for e in evidence if e.get("label") == "listing_name"), None)
    if not _quotable(name):
        return None
    return _pick(NAME_TWICE, lang).format(name=_iso(name, lang))


def _season_sentence(evidence: list[dict], lang: str) -> str | None:
    seasons = [value_text(e["value"], lang) for e in evidence
               if e.get("label") == "fp_season" and _quotable(e.get("value"))]
    seasons = [s for s in seasons if s]
    if not seasons:
        return None
    return _pick(SEASON_CLOSE, lang).format(seasons=_join(seasons, lang))


_DIFFER_SENTENCES = {
    "hours_vs_activity": _hours_sentence,
    "own_links_present": _links_sentence,
    "whatsapp_number_mismatch": _number_sentence,
    "bilingual_name_rule": _name_sentence,
    "season_due": _season_sentence,
}


def check_sentence(rule_id: str, state: str, evidence: list[dict] | None, lang: str) -> str:
    """What a first-party check looked at and what it showed, as one or two sentences in the
    reader's language. `state` is `pass`, `fail` or `not_measured`; `evidence` is the stored
    evidence of the check's open finding (a difference), which the sentence quotes. A difference
    with no evidence left to quote says the rule's own words."""
    if state == "pass":
        return _pick(PASSES[rule_id], lang)
    if state == "fail":
        try:
            found = _DIFFER_SENTENCES[rule_id](list(evidence or []), lang)
        except (ValueError, IndexError, KeyError, TypeError):
            found = None  # evidence in a shape this code does not know: never a broken sentence
        return found or _pick(DIFFERS[rule_id], lang)
    return _pick(NOT_MEASURED, lang).format(subject=_pick(SUBJECTS[rule_id], lang))


def all_texts() -> list[str]:
    """Every string this file can say, for the tests that look for gaps, ellipses and banned
    words."""
    out: list[str] = []
    for fields in RULE_WORDS.values():
        for pair in fields.values():
            out.extend(pair)
    for table in (LABELS, WHERE, VALUES, CHECK_NAMES, SEASON_NAMES, SEASON_WHEN, FACT_SOURCES,
                  SUBJECTS, PASSES, DIFFERS, SEEN_ON, LINKS_MISSING):
        for pair in table.values():
            out.extend(pair)
    for pair in (CLOSED, NOT_MEASURED, HOURS_DIFFER, HOURS_DIFFER_DAYS, NUMBER_DIFFERS,
                 NAME_TWICE, SEASON_CLOSE):
        out.extend(pair)
    return out
