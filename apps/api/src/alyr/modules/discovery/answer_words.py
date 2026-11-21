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
    "of its places. Position is its place in the answer's list.",
    "بالقاعدة: تذكر الإجابة نشاطك عندما تتضمن اسم النشاط أو اسم أحد فروعه. الترتيب هو مكانه في "
    "قائمة الإجابة.",
)
CAUTION = (
    "Answers change from one asking to the next. A few points is not a trend.",
    "تتغير الإجابات من مرة سؤال إلى أخرى. بضع نقاط ليست اتجاهاً.",
)
LIMITS = (
    "Names are matched as written: a nickname or a misspelling is not counted. An answer with no "
    "list can name your business but gives no position.",
    "تُطابَق الأسماء كما هي مكتوبة: لا يُحتسب اسم التدلل ولا الخطأ الإملائي. قد تذكر الإجابة التي "
    "بلا قائمة نشاطك لكنها لا تعطي ترتيباً.",
)
SAMPLE_MARK = (
    "Sample answers, made up for the sample business",
    "إجابات تجريبية لنشاط تجريبي",
)
ENGINE_SAMPLE = ("Sample answers", "إجابات تجريبية")

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


def all_texts() -> list[str]:
    out: list[str] = []
    for pair in (PART_NAME, PART_HINT, RULE, CAUTION, LIMITS, SAMPLE_MARK, ENGINE_SAMPLE,
                 NOT_ASKED, TOO_FEW):
        out.extend(pair)
    for pair in ERRORS.values():
        out.extend(pair)
    out.extend(STEP.values())
    for named, total in ((0, 6), (1, 1), (4, 6)):
        out.extend(headline(named, total, True, lang) for lang in ("en", "ar"))
    return out
