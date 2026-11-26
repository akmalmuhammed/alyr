"""The words of the Answers check, in English and Arabic (spec 068, D-168).

**What may be said.** `docs/honesty.md` bans "AI", "assistant", "smart", "knows", "reads" and the
like in anything ALYR says, because ALYR uses no model and nothing may imply it does. This feature
is about what other tools answer, so it needs a name for them: the decision (D-168) is "answer
tools" and "answers" («أدوات الإجابة»، «الإجابات»). No product is named, and nothing says ALYR
asks "a model". The founder can change the term here and in the web copy file. The same banned
word and ellipsis tests as the rest of Discovery's words run over everything in this file.

The Arabic is a draft until ALY-66, written whole for each sentence, agreement through
`counted()`.
"""

from alyr.core.words import Noun, counted

ANSWERS: Noun = (
    ("answer", "answers"),
    ("إجابة واحدة", "إجابتان", "إجابات", "إجابة"),
)

PART_NAME = ("Answers", "الإجابات")
PART_HINT = (
    "How often your business is named when people ask answer tools for your trade in your city",
    "عدد المرات التي يُذكر فيها نشاطك عندما يسأل الناس أدوات الإجابة عن مجالك في مدينتك",
)
RULE = (
    "By rule: an answer names your business when it contains the name of the business or of one "
    "of its places. Each tool and each language is counted on its own.",
    "بالقاعدة: تذكر الإجابة نشاطك عندما تتضمن اسم النشاط أو اسم أحد فروعه. تُعدّ كل أداة وكل لغة "
    "على حدة.",
)
CAUTION = (
    "Answers change every time they are asked. Where a name appears in a list changes too, so it "
    "is not shown.",
    "تتغير الإجابات في كل مرة تُطرح فيها الأسئلة، ويتغير معها موضع الاسم في القائمة، لذلك لا يُعرض.",
)
LIMITS = (
    "Names are matched as written: a nickname or a misspelling is not counted. The answers come "
    "from the tools' developer interfaces and speak only for these questions.",
    "تُطابَق الأسماء كما هي مكتوبة: لا يُحتسب اسم التدلل ولا الخطأ الإملائي. تأتي الإجابات من "
    "واجهات المطوّرين لدى الأدوات، ولا تعبّر إلا عن هذه الأسئلة.",
)
SAMPLE_MARK = (
    "Sample answers, made up for the sample business",
    "إجابات تجريبية لنشاط تجريبي",
)
ENGINE_SAMPLE = ("Sample answers", "إجابات تجريبية")

LANGS = {"en": ("English", "الإنجليزية"), "ar": ("Arabic", "العربية")}

# The method line (DECISIONS 6). `{tools}` is "Answer tool 1 and Answer tool 2" unless naming is
# switched on; `{place}` the area and city the questions were asked as from.
METHOD = (
    "ALYR asked the same public questions through the developer interfaces of {tools}, as if the "
    "asker were in {place}. Those interfaces can answer differently from the tools' own apps.",
    "طرحت ALYR الأسئلة العامة نفسها عبر واجهات المطوّرين لدى {tools}، كما لو كان السائل في "
    "{place}. وقد تختلف إجابات هذه الواجهات عمّا تعرضه تطبيقات الأدوات نفسها.",
)
METHOD_SAMPLE = (
    "These are sample answers, made up for the sample business. No answer tool was asked.",
    "هذه إجابات تجريبية لنشاط تجريبي، ولم تُسأل أي أداة إجابة.",
)
RANGE_NOTE = (
    "The range is where the share of answers naming you most likely lies, for these questions "
    "and this tool (95%, Wilson method). A share is given from 30 answers. A change is named only "
    "when both check-ups counted at least 30 answers from that tool in that language and the "
    "ranges do not overlap.",
    "النطاق هو المدى الذي تقع فيه على الأرجح نسبة الإجابات التي تذكر نشاطك، لهذه الأسئلة ولهذه "
    "الأداة (95%، طريقة ويلسون). تُعطى النسبة ابتداءً من 30 إجابة. ولا يُذكر أي تغيير إلا إذا "
    "عُدّت 30 إجابة على الأقل من تلك الأداة بتلك اللغة في كلا الفحصين ولم يتداخل النطاقان.",
)
QUOTE_NOTE = (
    "Answers are shown as the answer tools gave them. ALYR did not write them and acts on nothing "
    "in them.",
    "تُعرض الإجابات كما أعطتها أدوات الإجابة. لم تكتبها ALYR ولا تنفّذ أي شيء مما ورد فيها.",
)
SOURCES_TITLE = ("Where the answers got their facts", "من أين أخذت الإجابات معلوماتها")
SOURCES_NOTE = (
    "The pages each answer tool said it used. ALYR does not open them. Where a page names your "
    "business with a phone number, that number is compared with the numbers you confirmed.",
    "الصفحات التي قالت كل أداة إجابة إنها استندت إليها. لا تفتحها ALYR. وحيث تذكر الصفحة نشاطك "
    "مع رقم هاتف، يُقارن ذلك الرقم بالأرقام التي أكّدتها.",
)
CHECK = {
    "matches": ("Matches what you confirmed", "يطابق ما أكّدته"),
    "differs": ("Differs from what you confirmed", "يختلف عمّا أكّدته"),
    "not_read": ("Nothing in it to compare", "لا شيء فيها للمقارنة"),
}
CHANGE = {
    "first": (
        "Nothing to compare yet: this is the first count.",
        "لا شيء للمقارنة بعد: هذا هو العدّ الأول.",
    ),
    "not_enough": (
        "No change is named: that needs at least 30 answers in both check-ups, and they counted "
        "{previous} and then {last}.",
        "لا يُذكر أي تغيير: يلزم لذلك 30 إجابة على الأقل في كلا الفحصين، وقد عُدّت {previous} ثم "
        "{last}.",
    ),
    "no_change": (
        "No change: the ranges overlap ({p_low} to {p_high}% before, {low} to {high}% now).",
        "لا تغيير: النطاقان متداخلان (من {p_low} إلى {p_high}% قبل، ومن {low} إلى {high}% الآن).",
    ),
    "up": (
        "More answers named you than at the check-up before ({p_low} to {p_high}% before, {low} "
        "to {high}% now), and the ranges do not overlap.",
        "ذكرت نشاطَك إجاباتٌ أكثر مما في الفحص السابق (من {p_low} إلى {p_high}% قبل، ومن {low} إلى "
        "{high}% الآن)، والنطاقان غير متداخلين.",
    ),
    "down": (
        "Fewer answers named you than at the check-up before ({p_low} to {p_high}% before, {low} "
        "to {high}% now), and the ranges do not overlap.",
        "ذكرت نشاطَك إجاباتٌ أقل مما في الفحص السابق (من {p_low} إلى {p_high}% قبل، ومن {low} إلى "
        "{high}% الآن)، والنطاقان غير متداخلين.",
    ),
}

NOT_ASKED = ("Not asked yet.", "لم يُطرح أي سؤال بعد.")
TOO_FEW = (
    "Too few answers were counted to measure.",
    "عدد الإجابات التي حُسبت قليل جداً للقياس.",
)

# Codes an engine or a request can raise, with plain words. Merged into `words.ERRORS`, so a
# refusal carries both languages like every other one.
ERRORS: dict[str, tuple[str, str]] = {
    "engine_unavailable": ("That source is not available.", "هذا المصدر غير متاح."),
    "engine_off": ("Asking outside ALYR is switched off.", "السؤال خارج ALYR متوقف."),
    "engine_no_key": ("This source has no key set.", "لا يوجد مفتاح لهذا المصدر."),
    "monthly_cap": (
        "This month's limit for asking was reached.", "تم بلوغ حد الأسئلة لهذا الشهر."),
    "engine_timeout": (
        "The source took too long to answer.", "استغرق المصدر وقتاً طويلاً في الإجابة."),
    "engine_failed": ("The source could not answer.", "تعذّر على المصدر الإجابة."),
    "answers_budget": (
        "The limit for asking was reached, so the rest was not asked.",
        "تم بلوغ حد الأسئلة، لذلك لم تُطرح الأسئلة المتبقية."),
    "sample_only": (
        "The sample answers cover car care in Doha only.",
        "الإجابات التجريبية تغطي العناية بالسيارات في الدوحة فقط."),
    "bad_trade": ("Choose a trade from the list.", "اختر مجالاً من القائمة."),
    "bad_city": ("Choose a city from the list.", "اختر مدينة من القائمة."),
    "bad_engine": ("That source cannot be switched on.", "لا يمكن تشغيل هذا المصدر."),
    "needs_trade": (
        "Choose your trade and your city first.", "اختر مجالك ومدينتك أولاً."),
    "bad_area": ("Choose an area of your city from the list.", "اختر منطقة من مدينتك من القائمة."),
}

STEP = {
    "ai.answers": "Asked {asked} public questions: your business was named in {named} of "
    "{counted} answers counted.",
    "ai.answers.few": "Asked {asked} public questions: {counted} answers counted, not enough to "
    "measure.",
    "ai.answers.stopped": "Stopped at the limit after {asked} questions: {counted} answers "
    "counted.",
    "ai.answers.failed": "The answers could not be counted this time.",
    "ai.answers.unset": "Answers are switched on but no trade and city are chosen, so nothing "
    "was asked.",
}


def pick(pair: tuple[str, str], lang: str) -> str:
    return pair[1] if lang == "ar" else pair[0]


def headline(named: int | None, counted_n: int, measured: bool, lang: str) -> str:
    """One sentence by rule, a template filled with numbers."""
    if named is None:
        return pick(NOT_ASKED, lang)
    if not measured:
        return pick(TOO_FEW, lang)
    total = counted(counted_n, ANSWERS, lang)
    if lang == "ar":
        if named == 0:
            return f"لم يُذكر نشاطك في أي من {total}."
        return f"ذُكر نشاطك في {named} من {total}."
    if named == 0:
        return f"Not named in any of the {total}."
    return f"Named in {named} of {total}."


def error_text(code: str | None, lang: str) -> str:
    return pick(ERRORS.get(code or "", ERRORS["engine_failed"]), lang)


def joined(items: list[str], lang: str) -> str:
    """"A", "A and B", "A, B and C"; in Arabic «أ وب» with «و» joined to the last."""
    if len(items) < 2:
        return "".join(items)
    if lang == "ar":
        return "، ".join(items[:-1]) + " و" + items[-1]
    return ", ".join(items[:-1]) + " and " + items[-1]


def method(tools: list[str], place: str, sample: bool, lang: str) -> str:
    if sample or not tools:
        return pick(METHOD_SAMPLE, lang)
    return pick(METHOD, lang).format(tools=joined(tools, lang), place=place)


def place_of(city: str, area: str, lang: str) -> str:
    if not area:
        return city
    return f"{area}، {city}" if lang == "ar" else f"{area}, {city}"


def change_reason(state: str, lang: str, *, previous: int = 0, last: int = 0,
                  p_range: dict | None = None, range_: dict | None = None) -> str:
    template = pick(CHANGE[state], lang)
    if state == "not_enough":
        return template.format(previous=counted(previous, ANSWERS, lang),
                               last=counted(last, ANSWERS, lang))
    if state in ("no_change", "up", "down"):
        assert p_range and range_
        return template.format(p_low=p_range["low"], p_high=p_range["high"],
                               low=range_["low"], high=range_["high"])
    return template


def all_texts() -> list[str]:
    out: list[str] = []
    for pair in (PART_NAME, PART_HINT, RULE, CAUTION, LIMITS, SAMPLE_MARK, ENGINE_SAMPLE,
                 NOT_ASKED, TOO_FEW, METHOD_SAMPLE, RANGE_NOTE, QUOTE_NOTE, SOURCES_TITLE,
                 SOURCES_NOTE, *LANGS.values(), *CHECK.values()):
        out.extend(pair)
    for pair in ERRORS.values():
        out.extend(pair)
    out.extend(STEP.values())
    for named, total in ((0, 6), (1, 1), (4, 6)):
        out.extend(headline(named, total, True, lang) for lang in ("en", "ar"))
    for lang in ("en", "ar"):
        tools = [f"T{n}" for n in (1, 2, 3)]
        out.append(method(tools, place_of("Doha", "West Bay", lang), False, lang))
        out.append(change_reason("first", lang))
        out.append(change_reason("not_enough", lang, previous=6, last=12))
        for state in ("no_change", "up", "down"):
            out.append(change_reason(state, lang, previous=30, last=30,
                                     p_range={"low": 20, "high": 50},
                                     range_={"low": 55, "high": 80}))
    return out
