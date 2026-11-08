"""Discovery's words, in English and Arabic (spec 065, `docs/agent-dashboard/06-messaging.md`).

The voice is the Agent's: it counts, compares and shows the rule. No first person, no "smart",
"intelligent", "learns", "predicts", "notices"; nothing here says or implies AI, and nothing says
ALYR changed something outside ALYR, because in Phase 1 it changes nothing. A test fails on an
empty string, on an ellipsis in either language and on a banned word.

The Arabic is a draft until ALY-66 (a native reviewer), written whole for each sentence (agreement
through `counted()` and `agree()`), never joined from fragments.
"""

from alyr.core.words import Noun, counted
from alyr.modules.agent.words import DAY_SHORT, MONTHS, agree

PROBLEMS: Noun = (
    ("problem", "problems"),
    ("مشكلة واحدة", "مشكلتان", "مشكلات", "مشكلة"),
)
THINGS: Noun = (
    ("thing to do", "things to do"),
    ("أمر واحد", "أمران", "أمور", "أمراً"),
)

# rule id -> (title, rule, why, what_happens, what_is_needed), each (English, Arabic).
RULE_WORDS: dict[str, dict[str, tuple[str, str]]] = {
    "listing_missing": {
        "title": (
            "This place has no listing on Google Maps",
            "لا توجد لهذا الفرع صفحة على خرائط Google",
        ),
        "rule": (
            "a place on your list has no listing on Google Maps",
            "فرع في قائمتك ليست له صفحة على خرائط Google",
        ),
        "why": (
            "A customer who searches for this place finds nothing, or finds someone else first.",
            "العميل الذي يبحث عن هذا الفرع لا يجد شيئاً، أو يجد غيركم أولاً.",
        ),
        "what_happens": (
            "Nothing changes by itself. When the listing exists, the next check-up "
            "finds it and this item closes.",
            "لا يتغير شيء من تلقاء نفسه. حين تُنشأ الصفحة يجدها الفحص التالي ويُغلق هذا البند.",
        ),
        "what_is_needed": (
            "The owner creates the listing and verifies it with Google.",
            "ينشئ المالك الصفحة ويوثّقها لدى Google.",
        ),
    },
    "listing_unclaimed": {
        "title": (
            "The listing is not claimed by the business",
            "صفحة الفرع على Google غير مُوثّقة باسم المنشأة",
        ),
        "rule": (
            "a listing exists but the business has not claimed it",
            "للفرع صفحة على Google لكن المنشأة لم تطالب بملكيتها",
        ),
        "why": (
            "Until it is claimed, the business cannot correct its hours, number or photos, "
            "and anyone can suggest changes to it.",
            "ما دامت الصفحة غير مُوثّقة، لا تستطيع المنشأة تصحيح ساعاتها أو رقمها أو صورها، "
            "ويستطيع أي شخص اقتراح تعديلات عليها.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once the listing is claimed, the next "
            "check-up confirms it and this item closes.",
            "لا يتغير شيء من تلقاء نفسه. حين تُوثَّق الصفحة يؤكد ذلك الفحص التالي ويُغلق هذا البند.",
        ),
        "what_is_needed": (
            "The owner claims the listing and finishes Google's verification.",
            "يطالب المالك بملكية الصفحة ويُكمل التوثيق لدى Google.",
        ),
    },
    "hours_missing": {
        "title": ("Opening hours are missing on Google", "ساعات العمل غير مذكورة على Google"),
        "rule": ("the listing has no opening hours", "صفحة الفرع على Google بلا ساعات عمل"),
        "why": (
            "A customer cannot tell whether you are open, and the listing shows less than "
            "the ones around it.",
            "لا يعرف العميل إن كنتم مفتوحين، وتعرض الصفحة معلومات أقل من الصفحات المجاورة.",
        ),
        "what_happens": (
            "Nothing changes by itself. Mark it done after the hours are on "
            "Google; the next check-up looks again.",
            "لا يتغير شيء من تلقاء نفسه. علّمه منجزاً بعد إضافة الساعات إلى Google، "
            "وسيتحقق الفحص التالي.",
        ),
        "what_is_needed": (
            "The opening hours for each day, from the owner.",
            "ساعات العمل لكل يوم، من المالك.",
        ),
    },
    "hours_conflict": {
        "title": (
            "The listing and the website show different hours",
            "ساعات العمل على Google تختلف عن ساعات الموقع الإلكتروني",
        ),
        "rule": (
            "the listing and the website show different opening hours",
            "صفحة Google والموقع الإلكتروني يعرضان ساعات عمل مختلفة",
        ),
        "why": (
            "A customer who trusts the wrong hours arrives at a closed door.",
            "العميل الذي يعتمد على الساعات الخاطئة يصل والباب مغلق.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once both show the same hours, the next "
            "check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين يعرض الاثنان الساعات نفسها يُغلق "
            "الفحص التالي هذا البند.",
        ),
        "what_is_needed": ("The owner says which hours are right.", "يحدد المالك الساعات الصحيحة."),
    },
    "phone_conflict": {
        "title": (
            "The listing and the website show different phone numbers",
            "رقم الهاتف على Google يختلف عن الرقم في الموقع الإلكتروني",
        ),
        "rule": (
            "the listing and the website show different phone numbers",
            "صفحة Google والموقع الإلكتروني يعرضان رقمين مختلفين",
        ),
        "why": (
            "Calls go to the wrong number, or to none.",
            "تذهب المكالمات إلى رقم خاطئ أو لا تصل.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once both show the same number, the next "
            "check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين يعرض الاثنان الرقم نفسه يُغلق الفحص التالي هذا البند.",
        ),
        "what_is_needed": ("The owner says which number is right.", "يحدد المالك الرقم الصحيح."),
    },
    "name_conflict": {
        "title": (
            "The business is spelled differently on its listings",
            "اسم المنشأة مكتوب بأكثر من صيغة على صفحاتها",
        ),
        "rule": (
            "the business name is spelled differently between its listings",
            "اسم المنشأة مكتوب بصيغ مختلفة بين صفحاتها",
        ),
        "why": (
            "Customers and search treat different spellings as different businesses, so "
            "reviews and searches are split between them.",
            "يعامل العملاء ومحركات البحث الصيغ المختلفة كأنها منشآت مختلفة، فتتوزع "
            "المراجعات وعمليات البحث بينها.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once every listing uses one spelling, the "
            "next check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين تعتمد كل الصفحات صيغة واحدة يُغلق "
            "الفحص التالي هذا البند.",
        ),
        "what_is_needed": (
            "The owner chooses one spelling for every branch, and each branch uses it.",
            "يختار المالك صيغة واحدة للاسم في كل الفروع، ويلتزم بها كل فرع.",
        ),
    },
    "category_missing": {
        "title": ("The listing has no main category", "لا يوجد تصنيف رئيسي لصفحة الفرع"),
        "rule": ("the listing has no primary category", "صفحة الفرع بلا تصنيف رئيسي"),
        "why": (
            "Google shows a listing for the searches its category matches. Without one it "
            "can be missed.",
            "تعرض Google الصفحة في عمليات البحث التي يطابقها تصنيفها، وبدونه قد لا تظهر.",
        ),
        "what_happens": (
            "Nothing changes by itself. Mark it done after the category is set; "
            "the next check-up looks again.",
            "لا يتغير شيء من تلقاء نفسه. علّمه منجزاً بعد تحديد التصنيف، وسيتحقق الفحص التالي.",
        ),
        "what_is_needed": (
            "The category that describes the main service, from the owner.",
            "التصنيف الذي يصف الخدمة الرئيسية، من المالك.",
        ),
    },
    "photos_few": {
        "title": ("The listing has fewer than 5 photos", "على صفحة الفرع أقل من 5 صور"),
        "rule": ("the listing has fewer than 5 photos", "على صفحة الفرع أقل من 5 صور"),
        "why": (
            "Customers use photos to judge a place before they visit. A listing with few "
            "photos shows them little.",
            "يحكم العملاء على المكان من صوره قبل أن يزوروه، والصفحة القليلة الصور تُريهم القليل.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once there are 5 or more, the next "
            "check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين تبلغ الصور 5 أو أكثر يُغلق الفحص التالي هذا البند.",
        ),
        "what_is_needed": (
            "Photos of the place, taken by the owner or the team.",
            "صور للمكان، يلتقطها المالك أو الفريق.",
        ),
    },
    "website_location_missing": {
        "title": (
            "This place is missing from the website",
            "هذا الفرع غير مذكور في الموقع الإلكتروني",
        ),
        "rule": (
            "a place is not on the website, or has no page of its own",
            "فرع غير مذكور في الموقع الإلكتروني، أو لا صفحة خاصة به",
        ),
        "why": (
            "A customer who looks for this branch on your website cannot find its address "
            "or hours.",
            "العميل الذي يبحث عن هذا الفرع في موقعكم لا يجد عنوانه ولا ساعاته.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once the website has a page for it, the "
            "next check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين يصبح للفرع صفحة في الموقع يُغلق "
            "الفحص التالي هذا البند.",
        ),
        "what_is_needed": (
            "The person who looks after the website adds a page for this place.",
            "يضيف من يتولى الموقع الإلكتروني صفحة لهذا الفرع.",
        ),
    },
    "whatsapp_link_missing": {
        "title": ("There is no working WhatsApp link", "لا يوجد رابط واتساب صحيح"),
        "rule": (
            "the website or the listing has no WhatsApp link, or it points to a different number",
            "الموقع الإلكتروني أو صفحة Google بلا رابط واتساب، أو الرابط يشير إلى رقم آخر",
        ),
        "why": (
            "A customer who wants to write to you on WhatsApp has no direct way to, or "
            "writes to a number that is not yours.",
            "العميل الذي يريد مراسلتكم على واتساب لا يجد طريقاً مباشراً، أو يراسل رقماً ليس رقمكم.",
        ),
        "what_happens": (
            "Nothing changes by itself. Once the link points to the business's "
            "number, the next check-up closes this item.",
            "لا يتغير شيء من تلقاء نفسه. حين يشير الرابط إلى رقم المنشأة يُغلق "
            "الفحص التالي هذا البند.",
        ),
        "what_is_needed": (
            "The person who looks after the website adds the link for the "
            "business's WhatsApp number.",
            "يضيف من يتولى الموقع الإلكتروني رابط واتساب لرقم المنشأة.",
        ),
    },
    "review_unanswered": {
        "title": ("Low reviews are waiting for an answer", "مراجعات منخفضة التقييم تنتظر رداً"),
        "rule": (
            "3 or more reviews of 3 stars or fewer, older than 7 days, have no reply",
            "3 مراجعات أو أكثر بتقييم 3 نجوم أو أقل، مضى عليها أكثر من 7 أيام، بلا رد",
        ),
        "why": (
            "A reply shows the next customer that someone pays attention to what is written. "
            "A complaint with no reply looks ignored.",
            "الرد يُري العميل التالي أن أحداً يقرأ ما يُكتب. والشكوى بلا رد تبدو مهملة.",
        ),
        "what_happens": (
            "Nothing is sent for you. Mark it done after the replies are written; "
            "the next check-up counts again.",
            "لا يُرسل شيء نيابةً عنك. علّمه منجزاً بعد كتابة الردود، وسيعدّ الفحص التالي من جديد.",
        ),
        "what_is_needed": (
            "The owner or a manager writes a reply to each, on Google.",
            "يكتب المالك أو المدير رداً على كل منها، على Google.",
        ),
    },
    "rating_low": {
        "title": ("The rating is below 4.0", "التقييم أقل من 4.0"),
        "rule": (
            "the rating is below 4.0 with at least 10 reviews",
            "التقييم أقل من 4.0 مع 10 مراجعات على الأقل",
        ),
        "why": (
            "Customers often compare ratings when they choose between places.",
            "يقارن العملاء غالباً بين التقييمات حين يختارون بين الأماكن.",
        ),
        "what_happens": (
            "Nothing changes by itself. The rating moves only as new reviews come "
            "in; each check-up measures it again.",
            "لا يتغير شيء من تلقاء نفسه. يتحرك التقييم بوصول مراجعات جديدة، وكل فحص يقيسه من جديد.",
        ),
        "what_is_needed": (
            "The owner goes through the low reviews and decides what to change at the branch.",
            "يقرأ المالك المراجعات المنخفضة ويقرر ما يتغير في الفرع.",
        ),
    },
}

LABELS: dict[str, tuple[str, str]] = {
    "listing_status": ("Listing", "الصفحة"),
    "claimed": ("Claimed by the business", "موثّقة باسم المنشأة"),
    "listing_hours": ("Hours on the listing", "الساعات على صفحة Google"),
    "website_hours": ("Hours on the website", "الساعات في الموقع الإلكتروني"),
    "hours_differ": ("Days that differ", "الأيام المختلفة"),
    "listing_phone": ("Phone on the listing", "الهاتف على صفحة Google"),
    "website_phone": ("Phone on the website", "الهاتف في الموقع الإلكتروني"),
    "listing_name": ("Name on the listing", "الاسم على صفحة Google"),
    "categories": ("Categories on the listing", "التصنيفات على صفحة Google"),
    "photos": ("Photos on the listing", "الصور على صفحة Google"),
    "website_location": ("This place on the website", "هذا الفرع في الموقع الإلكتروني"),
    "website_whatsapp": ("WhatsApp link on the website", "رابط واتساب في الموقع الإلكتروني"),
    "listing_whatsapp": ("WhatsApp link on the listing", "رابط واتساب على صفحة Google"),
    "expected_whatsapp": ("The business's WhatsApp number", "رقم واتساب المنشأة"),
    "unanswered_reviews": (
        "Reviews of 3 stars or fewer, over 7 days old, with no reply",
        "مراجعات بتقييم 3 نجوم أو أقل، مضى عليها أكثر من 7 أيام، بلا رد",
    ),
    "oldest_unanswered": ("The oldest, in days", "أقدمها، بالأيام"),
    "rating": ("Rating on the listing", "التقييم على صفحة Google"),
    "review_count": ("Reviews on the listing", "عدد المراجعات على صفحة Google"),
}
WHERE: dict[str, tuple[str, str]] = {
    "listing": ("Google listing", "صفحة Google"),
    "website": ("Website", "الموقع الإلكتروني"),
    "reviews": ("Google reviews", "مراجعات Google"),
    "business": ("The business's details in ALYR", "بيانات المنشأة في ALYR"),
}
# "(sample data)": said beside where a fact came from when the source is the fictional sample.
SAMPLE_NOTE = ("sample data", "بيانات تجريبية")
VALUES: dict[str, tuple[str, str]] = {
    "~not_found": ("Not found", "غير موجودة"),
    "~no": ("No", "لا"),
    "~none": ("None", "لا شيء"),
    "~not_listed": ("Not listed", "غير مذكور"),
    "~no_page": ("Listed, with no page of its own", "مذكور، بلا صفحة خاصة به"),
}

# code -> (English, Arabic). `status` is the route's choice (errors.py).
ERRORS: dict[str, tuple[str, str]] = {
    "module_off": (
        "Discovery is not switched on for this business.",
        "ميزة الاكتشاف غير مفعّلة لهذه المنشأة.",
    ),
    "forbidden": (
        "Only the owner or an admin can do this.",
        "المالك أو المدير فقط يستطيع فعل ذلك.",
    ),
    "not_found": ("There is no such item in this business.", "لا يوجد هذا العنصر في هذه المنشأة."),
    "bad_status": (
        "A finding can be set aside, put back on the list or marked done; nothing else.",
        "يمكن تأجيل البند أو إعادته إلى القائمة أو تعليمه منجزاً، ولا شيء غير ذلك.",
    ),
    "run_too_soon": (
        "A check-up was started a moment ago. Try again later.",
        "بدأ فحص قبل لحظات. حاول مرة أخرى لاحقاً.",
    ),
    "no_connection": ("Turn on Discovery first.", "فعّل الاكتشاف أولاً."),
    "no_locations": ("Add at least one place first.", "أضف فرعاً واحداً على الأقل أولاً."),
    "too_many_locations": ("A business can have at most 50 places.", "الحد الأقصى لعدد الفروع 50."),
    "name_required": ("Every place needs a name.", "لكل فرع اسم لا بد منه."),
    "bad_url": (
        "A web address must start with http:// or https://.",
        "يجب أن يبدأ عنوان الموقع بـ http:// أو https://.",
    ),
    "bad_number": (
        "A WhatsApp number must be written as +, the country code and the number.",
        "يُكتب رقم واتساب بعلامة + ثم رمز الدولة ثم الرقم.",
    ),
    "unknown_place": (
        "One of the places is not on this business's list.",
        "أحد الفروع ليس في قائمة هذه المنشأة.",
    ),
    "bad_connector": ("That source is not available.", "هذا المصدر غير متاح."),
    "bad_month": (
        "A month is written as year-month, for example 2026-11.",
        "يُكتب الشهر هكذا: السنة-الشهر، مثل 2026-11.",
    ),
    "run_budget_exceeded": (
        "The check-up was stopped because it passed its limit of steps or cost.",
        "أُوقف الفحص لأنه تجاوز حدّه من الخطوات أو الكلفة.",
    ),
    "too_many_findings": (
        "The check-up was stopped because it found more than 200 things.",
        "أُوقف الفحص لأنه وجد أكثر من 200 بند.",
    ),
    "run_interrupted": (
        "The check-up was interrupted before it finished. Start another.",
        "انقطع الفحص قبل أن يكتمل. ابدأ فحصاً آخر.",
    ),
    "connector_unavailable": ("That source is not available.", "هذا المصدر غير متاح."),
    "finding_closed": ("A check-up has already closed this item.", "أغلق فحص سابق هذا البند."),
    "run_in_progress": (
        "A check-up is running. Wait for it to finish, then change the places.",
        "هناك فحص يعمل الآن. انتظر انتهاءه ثم عدّل الفروع.",
    ),
    "run_failed": ("The check-up could not finish. Try again.", "تعذّر إكمال الفحص. حاول مرة أخرى."),
}

# What each step of a run says in the log: one plain sentence, in English.
_TALLY = "{passed} passed, {failed} found, {unmeasured} not measured."
STEP_SUMMARIES = {
    "run.start": "Started the check-up.",
    "connector.snapshot": "Got {places} from {source}.",
    "rules.presence": "Checked the listings: " + _TALLY,
    "rules.reviews": "Checked the reviews: " + _TALLY,
    "rules.website": "Checked the website: " + _TALLY,
    "rules.whatsapp": "Checked the WhatsApp links: " + _TALLY,
    "findings.save": "Saved the list: {new} new, {kept} still there, {closed} closed.",
    "reviews.save": "Saved {n} reviews.",
    "score.compute": "Worked out the score from the parts that were measured.",
}

STATUSES = ("open", "skipped", "owner_done", "verified", "gone")


def pick(pair: tuple[str, str], lang: str) -> str:
    return pair[1] if lang == "ar" else pair[0]


def rule_text(rule_id: str, field: str, lang: str) -> str:
    return pick(RULE_WORDS[rule_id][field], lang)


def error_text(code: str, lang: str) -> str:
    return pick(ERRORS.get(code, ERRORS["run_failed"]), lang)


def day_list(keys: str, lang: str) -> str:
    """ "sat,sun" as "Sat, Sun" or «سبت، أحد»."""
    names = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
    parts = [DAY_SHORT[lang][names.index(k)] for k in keys.split(",") if k in names]
    return ("، " if lang == "ar" else ", ").join(parts)


def value_text(value: str, lang: str) -> str:
    if value.startswith("~days:"):
        return day_list(value[len("~days:") :], lang)
    if value in VALUES:
        return pick(VALUES[value], lang)
    return value


def evidence_view(item: dict, lang: str) -> dict:
    """One piece of stored evidence as the reader sees it: `{label, value, where, seen_at}`,
    all plain text."""
    where = pick(WHERE.get(item["where"], (item["where"], item["where"])), lang)
    if item.get("source") == "sample":
        where = f"{where} ({pick(SAMPLE_NOTE, lang)})"
    return {
        "label": pick(LABELS.get(item["label"], (item["label"], item["label"])), lang),
        "value": value_text(item["value"], lang),
        "where": where,
        "seen_at": item["seen_at"],
    }


def month_label(month: str, lang: str) -> str:
    year, number = month.split("-")
    return f"{MONTHS[lang][int(number) - 1]} {year}"


def overview_headline(open_count: int, high: int, has_run: bool, lang: str) -> str:
    """One sentence by rule for the home screen."""
    if not has_run:
        return pick(("No check-up has run yet.", "لم يُجرَ أي فحص بعد."), lang)
    if open_count == 0:
        return pick(("Nothing is open on your list.", "لا شيء مفتوح في قائمتك."), lang)
    if lang == "ar":
        text = f"{counted(open_count, THINGS, 'ar')} في قائمتك"
        if high:
            text += f"، منها {counted(high, THINGS, 'ar')} " + agree(
                high, "عالي الأولوية", "عاليا الأولوية", "عالية الأولوية"
            )
        return text + "."
    text = f"{counted(open_count, THINGS, 'en')} on your list"
    if high:
        text += f", {high} of them high priority"
    return text + "."


def report_headline(
    month: str,
    start: int | None,
    end: int | None,
    runs: int,
    fixed: int,
    still_open: int,
    lang: str,
) -> str:
    """The report's one sentence, a template filled with numbers."""
    when = month_label(month, lang)
    if runs == 0:
        return pick((f"No check-up was run in {when}.", f"لم يُجرَ أي فحص في {when}."), lang)
    if lang == "ar":
        if end is None:
            first = f"لم يُقَس شيء في {when}."
        elif start is None or start == end or runs == 1:
            first = f"النتيجة {end} في {when}."
        else:
            verb = "ارتفعت" if end > start else "انخفضت"
            first = f"{verb} النتيجة من {start} إلى {end} في {when}."
        done = (
            "لم يُصلَح شيء بعد"
            if fixed == 0
            else f"{counted(fixed, PROBLEMS, 'ar')} "
            + agree(fixed, "تم إصلاحها", "تم إصلاحهما", "تم إصلاحها")
        )
        left = (
            "ولا شيء مفتوح"
            if still_open == 0
            else f"و{counted(still_open, PROBLEMS, 'ar')} "
            + agree(still_open, "لا تزال مفتوحة", "لا تزالان مفتوحتين", "لا تزال مفتوحة")
        )
        return f"{first} {done}، {left}."
    if end is None:
        first = f"Nothing could be measured in {when}."
    elif start is None or start == end or runs == 1:
        first = f"Score {end} in {when}."
    else:
        first = f"Score {'up' if end > start else 'down'} from {start} to {end} in {when}."
    done = "Nothing fixed yet" if fixed == 0 else f"{counted(fixed, PROBLEMS, 'en')} fixed"
    left = (
        "nothing left open"
        if still_open == 0
        else f"{counted(still_open, PROBLEMS, 'en')} still open"
    )
    return f"{first} {done}, {left}."


def all_texts() -> list[str]:
    """Every string the module can say, for the tests that look for gaps, ellipses and banned
    words."""
    out: list[str] = []
    for words in RULE_WORDS.values():
        for pair in words.values():
            out.extend(pair)
    for table in (LABELS, WHERE, VALUES, ERRORS):
        for pair in table.values():
            out.extend(pair)
    out.extend(SAMPLE_NOTE)
    out.extend(STEP_SUMMARIES.values())
    return out
