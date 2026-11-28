"""A sentence per check, for the Checks screen (Discovery 2.0, agent C3; api-gaps U2-3).

`GET /checks` gives each place's state per check. The screen shows each as a plain sentence: what
was looked at and what it showed ("Your Google opening hours match the hours on your website",
"... do not match: Fri differs"). A difference quotes the evidence of the check's open finding,
worded as `words.py` words it; a check that was not measured says "{what was looked at}: Not
measured.", and a difference whose evidence cannot be quoted (an older check-up, or Google's text
removed after 30 days) says the rule's plain sentence instead, never an empty or a raw value.

The twelve core checks' words are here; the first-party checks' are in `words_firstparty.py`
(`check_sentence`). `words.py` does not import this file. The voice is the Agent's: it says what
was compared and what it found, by rule; no first person, nothing that says or implies AI. The
Arabic is a draft for the native reviewer (ALY-66), each sentence whole, counts through
`counted()`.
"""

from alyr.core.words import Noun, counted
from alyr.modules.discovery import words as w
from alyr.modules.discovery import words_firstparty as fpw

PASS, FAIL, NOT_MEASURED = "pass", "fail", "not_measured"
_ISOLATE = ("⁨", "⁩")  # a number, a name or a list inside an Arabic sentence

PHOTOS: Noun = (("photo", "photos"), ("صورة واحدة", "صورتان", "صور", "صورة"))
REVIEWS: Noun = (("review", "reviews"), ("مراجعة واحدة", "مراجعتان", "مراجعات", "مراجعة"))
LOW_REVIEWS: Noun = (
    ("low-rated review", "low-rated reviews"),
    ("مراجعة واحدة منخفضة التقييم", "مراجعتان منخفضتا التقييم", "مراجعات منخفضة التقييم",
     "مراجعة منخفضة التقييم"),
)
DAYS: Noun = (("day", "days"), ("يوم واحد", "يومين", "أيام", "يوماً"))

NOT_MEASURED_TEXT = fpw.NOT_MEASURED

# rule id -> what the check looks at, for "{subject}: Not measured."
SUBJECTS: dict[str, tuple[str, str]] = {
    "listing_missing": ("Your business on Google Maps", "منشأتك على خرائط Google"),
    "listing_unclaimed": (
        "Whether your Google listing is claimed", "توثيق صفحتك على Google باسم المنشأة"),
    "hours_missing": ("Opening hours on your Google listing", "ساعات العمل على صفحتك في Google"),
    "hours_conflict": (
        "Your Google opening hours against your website",
        "ساعات العمل على Google مقارنةً بموقعك الإلكتروني",
    ),
    "phone_conflict": (
        "The phone number on Google against your website",
        "رقم الهاتف على Google مقارنةً بموقعك الإلكتروني",
    ),
    "name_conflict": (
        "Your business name across your listings", "اسم منشأتك عبر صفحاتك على Google"),
    "category_missing": (
        "The main category on your Google listing", "التصنيف الرئيسي على صفحتك في Google"),
    "photos_few": ("Photos on your Google listing", "الصور على صفحتك في Google"),
    "website_location_missing": ("This place on your website", "هذا الفرع في موقعك الإلكتروني"),
    "whatsapp_link_missing": (
        "The WhatsApp link on your Google listing and website",
        "رابط واتساب على صفحتك في Google وفي موقعك الإلكتروني",
    ),
    "review_unanswered": ("Replies to your Google reviews", "الردود على مراجعاتك في Google"),
    "rating_low": ("Your Google rating", "تقييمك على Google"),
}

# rule id -> the sentence when the check matches.
PASSES: dict[str, tuple[str, str]] = {
    "listing_missing": ("Your business is on Google Maps.", "منشأتك موجودة على خرائط Google."),
    "listing_unclaimed": (
        "Your Google listing is claimed by the business.",
        "صفحتك على Google موثّقة باسم المنشأة.",
    ),
    "hours_missing": (
        "Your Google listing shows opening hours.", "صفحتك على Google تعرض ساعات العمل."),
    "hours_conflict": (
        "Your Google opening hours match the hours on your website.",
        "ساعات العمل على Google تطابق الساعات في موقعك الإلكتروني.",
    ),
    "phone_conflict": (
        "The phone number on your Google listing matches the one on your website.",
        "رقم الهاتف على صفحتك في Google يطابق الرقم في موقعك الإلكتروني.",
    ),
    "name_conflict": (
        "Your business name is spelled the same way on every listing.",
        "اسم منشأتك مكتوب بالصيغة نفسها في كل صفحاتها.",
    ),
    "category_missing": (
        "Your Google listing has a main category.", "صفحتك على Google لها تصنيف رئيسي."),
    "photos_few": (
        "Your Google listing has 5 photos or more.", "صفحتك على Google فيها 5 صور أو أكثر."),
    "website_location_missing": (
        "Your website lists this place.", "موقعك الإلكتروني يذكر هذا الفرع."),
    "whatsapp_link_missing": (
        "Your Google listing or website shows a WhatsApp link to your number.",
        "صفحتك على Google أو موقعك الإلكتروني يعرض رابط واتساب إلى رقمك.",
    ),
    "review_unanswered": (
        "Fewer than 3 low-rated Google reviews have waited more than 7 days for a reply.",
        "أقل من 3 مراجعات منخفضة التقييم على Google تنتظر رداً منذ أكثر من 7 أيام.",
    ),
    "rating_low": ("Your Google rating is 4.0 or more.", "تقييمك على Google هو 4.0 أو أكثر."),
}

# rule id -> the sentence for a difference when its evidence cannot be quoted.
DIFFERS: dict[str, tuple[str, str]] = {
    "listing_missing": (
        "Your business was not found on Google Maps.", "لم يُعثر على منشأتك على خرائط Google."),
    "listing_unclaimed": (
        "Your Google listing is not claimed by the business.",
        "صفحتك على Google غير موثّقة باسم المنشأة.",
    ),
    "hours_missing": (
        "Your Google listing shows no opening hours.", "صفحتك على Google لا تعرض ساعات العمل."),
    "hours_conflict": (
        "Your Google opening hours do not match the hours on your website.",
        "ساعات العمل على Google لا تطابق الساعات في موقعك الإلكتروني.",
    ),
    "phone_conflict": (
        "The phone number on your Google listing does not match the one on your website.",
        "رقم الهاتف على صفحتك في Google لا يطابق الرقم في موقعك الإلكتروني.",
    ),
    "name_conflict": (
        "Your business name is spelled more than one way across your listings.",
        "اسم منشأتك مكتوب بأكثر من صيغة في صفحاتها.",
    ),
    "category_missing": (
        "Your Google listing has no category.", "صفحتك على Google بلا تصنيف."),
    "photos_few": (
        "Your Google listing has fewer than 5 photos.", "صفحتك على Google فيها أقل من 5 صور."),
    "website_location_missing": (
        "Your website does not list this place.", "موقعك الإلكتروني لا يذكر هذا الفرع."),
    "whatsapp_link_missing": (
        "The WhatsApp link on your Google listing or website is missing or opens another number.",
        "رابط واتساب على صفحتك في Google أو في موقعك الإلكتروني غير موجود أو يفتح رقماً آخر.",
    ),
    "review_unanswered": (
        "Low-rated Google reviews have waited more than 7 days for a reply.",
        "مراجعات منخفضة التقييم على Google تنتظر رداً منذ أكثر من 7 أيام.",
    ),
    "rating_low": ("Your Google rating is below 4.0.", "تقييمك على Google أقل من 4.0."),
}

# Differences that quote their evidence. Each template is whole per language.
HOURS_DIFFER = (
    "Your Google opening hours do not match the hours on your website: {days} {verb}.",
    "ساعات العمل على Google لا تطابق الساعات في موقعك الإلكتروني: الاختلاف في {days}.",
)
HOURS_DIFFER_VERB = ("differs", "differ")
PHONE_DIFFER = (
    "The phone number on your Google listing, {listing}, does not match the one on your "
    "website, {website}.",
    "رقم الهاتف على صفحتك في Google، {listing}، لا يطابق الرقم في موقعك الإلكتروني، {website}.",
)
NAME_DIFFER = (
    "Your business name is spelled more than one way across your listings: {names}.",
    "اسم منشأتك مكتوب بأكثر من صيغة في صفحاتها: {names}.",
)
PHOTOS_DIFFER = (
    "Your Google listing has {photos}, fewer than 5.",
    "صفحتك على Google فيها {photos}، أي أقل من 5.",
)
LOCATION_NO_PAGE = (
    "Your website lists this place, with no page of its own.",
    "موقعك الإلكتروني يذكر هذا الفرع، بلا صفحة خاصة به.",
)
WHATSAPP_NONE: dict[str, tuple[str, str]] = {
    "listing": ("Your Google listing shows no WhatsApp link.",
                "صفحتك على Google لا تعرض رابط واتساب."),
    "website": ("Your website shows no WhatsApp link.", "موقعك الإلكتروني لا يعرض رابط واتساب."),
}
WHATSAPP_OTHER: dict[str, tuple[str, str]] = {
    "listing": ("The WhatsApp link on your Google listing opens another number, {shown}.",
                "رابط واتساب على صفحتك في Google يفتح رقماً آخر، {shown}."),
    "website": ("The WhatsApp link on your website opens another number, {shown}.",
                "رابط واتساب في موقعك الإلكتروني يفتح رقماً آخر، {shown}."),
}
REVIEWS_WAITING = (
    "{reviews} on Google have waited more than 7 days for a reply; the oldest, {days}.",
    "{reviews} على Google تنتظر رداً منذ أكثر من 7 أيام؛ أقدمها منذ {days}.",
)
REVIEWS_SILENT = (
    "None of your {reviews} on Google older than 7 days has a reply.",
    "لا رد على أي من مراجعاتك على Google الأقدم من 7 أيام، وعددها {count}.",
)
RATING_DIFFER = (
    "Your Google rating is {rating} from {reviews}, below 4.0.",
    "تقييمك على Google هو {rating} من {reviews}، أي أقل من 4.0.",
)


def _pick(pair: tuple[str, str], lang: str) -> str:
    return pair[1] if lang == "ar" else pair[0]


def _iso(text: str, lang: str) -> str:
    return f"{_ISOLATE[0]}{text}{_ISOLATE[1]}" if lang == "ar" else text


def _value(evidence: list[dict], label: str, where: str | None = None) -> str | None:
    """The stored value of a piece of evidence, if it can be quoted: not missing, not Google's text
    removed after 30 days, not a marker this sentence does not expect."""
    for item in evidence:
        if item.get("label") == label and (where is None or item.get("where") == where):
            value = item.get("value")
            if isinstance(value, str) and value and value != "~removed":
                return value
    return None


def _int(value: str | None) -> int | None:
    return int(value) if value is not None and value.isdigit() else None


def _hours_conflict(evidence, lang):
    days = _value(evidence, "hours_differ")
    if not days or not days.startswith("~days:"):
        return None
    keys = [k for k in days[len("~days:"):].split(",") if k]
    if not keys:
        return None
    return _pick(HOURS_DIFFER, lang).format(
        days=_iso(w.day_list(",".join(keys), lang), lang),
        verb=HOURS_DIFFER_VERB[0 if len(keys) == 1 else 1])


def _phone_conflict(evidence, lang):
    listing, website = _value(evidence, "listing_phone"), _value(evidence, "website_phone")
    if not listing or not website or listing.startswith("~") or website.startswith("~"):
        return None
    return _pick(PHONE_DIFFER, lang).format(
        listing=fpw.phone_shown(listing, lang), website=fpw.phone_shown(website, lang))


def _name_conflict(evidence, lang):
    names = [e["value"] for e in evidence if e.get("label") == "listing_name"
             and isinstance(e.get("value"), str) and e["value"] and not e["value"].startswith("~")]
    if len(names) < 2:
        return None
    joined = ("، " if lang == "ar" else "; ").join(_iso(n, lang) for n in names)
    return _pick(NAME_DIFFER, lang).format(names=joined)


def _photos_few(evidence, lang):
    n = _int(_value(evidence, "photos"))
    if n is None:
        return None
    return _pick(PHOTOS_DIFFER, lang).format(photos=counted(n, PHOTOS, lang))


def _website_location(evidence, lang):
    value = _value(evidence, "website_location")
    if value == "~no_page":
        return _pick(LOCATION_NO_PAGE, lang)
    if value == "~not_listed":
        return _pick(DIFFERS["website_location_missing"], lang)
    return None


def _whatsapp_link(evidence, lang):
    sentences = []
    for item in evidence:
        label, where, value = item.get("label"), item.get("where"), item.get("value")
        if label not in ("listing_whatsapp", "website_whatsapp") or where not in WHATSAPP_NONE:
            continue
        if value == "~none":
            sentences.append(_pick(WHATSAPP_NONE[where], lang))
        elif isinstance(value, str) and value and not value.startswith("~"):
            shown = fpw.link_shown(value)
            sentences.append(
                _pick(WHATSAPP_OTHER[where], lang).format(shown=fpw.phone_shown(shown, lang)))
    return " ".join(sentences) or None


def _review_unanswered(evidence, lang):
    waiting = _int(_value(evidence, "unanswered_reviews"))
    oldest = _int(_value(evidence, "oldest_unanswered"))
    if waiting is not None and oldest is not None:
        return _pick(REVIEWS_WAITING, lang).format(
            reviews=counted(waiting, LOW_REVIEWS, lang), days=counted(oldest, DAYS, lang))
    seen = _value(evidence, "replies_seen")
    if seen and seen.startswith("~of:"):
        total = _int(seen.split(":")[-1])
        if total is not None:
            return _pick(REVIEWS_SILENT, lang).format(
                reviews=counted(total, REVIEWS, lang), count=total)
    return None


def _rating_low(evidence, lang):
    rating, count = _value(evidence, "rating"), _int(_value(evidence, "review_count"))
    if not rating or rating.startswith("~") or count is None:
        return None
    return _pick(RATING_DIFFER, lang).format(
        rating=_iso(rating, lang), reviews=counted(count, REVIEWS, lang))


_QUOTED = {
    "hours_conflict": _hours_conflict,
    "phone_conflict": _phone_conflict,
    "name_conflict": _name_conflict,
    "photos_few": _photos_few,
    "website_location_missing": _website_location,
    "whatsapp_link_missing": _whatsapp_link,
    "review_unanswered": _review_unanswered,
    "rating_low": _rating_low,
}


def sentence(rule_id: str, state: str, evidence: list[dict] | None, lang: str) -> str | None:
    """What one check looked at and what it showed, in the reader's language (`en` or `ar`), or
    None for a rule or a state this module does not word (never shown as something else)."""
    if rule_id in fpw.SUBJECTS:
        if state not in (PASS, FAIL, NOT_MEASURED):
            return None
        return fpw.check_sentence(rule_id, state, evidence, lang)
    if rule_id not in SUBJECTS:
        return None
    if state == PASS:
        return _pick(PASSES[rule_id], lang)
    if state == NOT_MEASURED:
        return _pick(NOT_MEASURED_TEXT, lang).format(subject=_pick(SUBJECTS[rule_id], lang))
    if state != FAIL:
        return None
    quote = _QUOTED.get(rule_id)
    found = None
    if quote is not None:
        try:
            found = quote(list(evidence or []), lang)
        except (ValueError, IndexError, KeyError, TypeError):
            found = None  # evidence in a shape this code does not know: the plain sentence
    return found or _pick(DIFFERS[rule_id], lang)


def sentences(rule_id: str, state: str, evidence: list[dict] | None) -> dict[str, str] | None:
    """`{sentence_en, sentence_ar}` for one check at one place, or None."""
    en, ar = sentence(rule_id, state, evidence, "en"), sentence(rule_id, state, evidence, "ar")
    if en is None or ar is None:
        return None
    return {"sentence_en": en, "sentence_ar": ar}


def all_texts() -> list[str]:
    """Every template this file can say, for the tests that look for gaps, ellipses and banned
    words."""
    out: list[str] = []
    for table in (SUBJECTS, PASSES, DIFFERS, WHATSAPP_NONE, WHATSAPP_OTHER):
        for pair in table.values():
            out.extend(pair)
    for pair in (HOURS_DIFFER, HOURS_DIFFER_VERB, PHONE_DIFFER, NAME_DIFFER, PHOTOS_DIFFER,
                 LOCATION_NO_PAGE, REVIEWS_WAITING, REVIEWS_SILENT, RATING_DIFFER):
        out.extend(pair)
    return out
