"""The questions, built and never typed (spec 068, "What is asked").

A question comes from a **closed list of trades and cities** and three fixed templates, so it is
always generic and public: "best car care in Doha". It holds no business name, no person, no
phone number and no digit. `build` is the only way to make one, and the only thing an engine is
given is an `EngineRequest`, which has exactly two fields: a test fails if a field is added.
Nothing a shop's own customers, contacts, messages, orders, reviews or team hold can enter here
(hard rule 2, ALY-51).
"""

from dataclasses import dataclass

# key: (English plural phrase, Arabic plural phrase). No clinic or health trade: honesty.md.
TRADES: dict[str, tuple[str, str]] = {
    "car_care": ("car care", "خدمات العناية بالسيارات"),
    "restaurant": ("restaurants", "مطاعم"),
    "cafe": ("cafes", "مقاهي"),
    "bakery": ("bakeries", "مخابز"),
    "salon": ("women's salons", "صالونات نسائية"),
    "barber": ("barbers", "صالونات حلاقة"),
    "spa": ("spas", "مراكز سبا"),
    "gym": ("gyms", "نوادي رياضية"),
    "grocery": ("grocery stores", "بقالات"),
    "fashion": ("clothing stores", "متاجر ملابس"),
    "ac_repair": ("AC repair services", "خدمات إصلاح المكيفات"),
    "home_services": ("home maintenance services", "خدمات الصيانة المنزلية"),
}
CITIES: dict[str, tuple[str, str]] = {
    "doha": ("Doha", "الدوحة"),
    "al_rayyan": ("Al Rayyan", "الريان"),
    "al_wakra": ("Al Wakra", "الوكرة"),
    "al_khor": ("Al Khor", "الخور"),
    "lusail": ("Lusail", "لوسيل"),
    "umm_salal": ("Umm Salal", "أم صلال"),
    "dubai": ("Dubai", "دبي"),
    "abu_dhabi": ("Abu Dhabi", "أبوظبي"),
    "sharjah": ("Sharjah", "الشارقة"),
    "riyadh": ("Riyadh", "الرياض"),
    "jeddah": ("Jeddah", "جدة"),
    "kuwait_city": ("Kuwait City", "مدينة الكويت"),
    "manama": ("Manama", "المنامة"),
    "muscat": ("Muscat", "مسقط"),
}
# key: (English, Arabic). Always the same text for the same trade and city, so a change in an
# answer is a change in the answer and not in the question.
TEMPLATES: dict[str, tuple[str, str]] = {
    "best": ("best {t} in {c}", "أفضل {t} في {c}"),
    "where": ("where can I find good {t} in {c}?", "أين أجد {t} جيدة في {c}؟"),
    "recommended": ("recommended {t} in {c}", "{t} موصى بها في {c}"),
}
MAX_QUESTIONS_PER_ENGINE = len(TEMPLATES) * 2


@dataclass(frozen=True)
class PublicQuestion:
    key: str
    lang: str
    text: str


@dataclass(frozen=True)
class EngineRequest:
    """Everything an engine is ever sent. Two fields, on purpose: a test pins them."""

    text: str
    lang: str


def build(trade: str, city: str) -> list[PublicQuestion]:
    """The six questions for a trade and a city, in a fixed order (English first)."""
    if trade not in TRADES:
        raise ValueError("unknown trade")
    if city not in CITIES:
        raise ValueError("unknown city")
    out = []
    for position, lang in enumerate(("en", "ar")):
        for key, templates in TEMPLATES.items():
            text = templates[position].format(t=TRADES[trade][position], c=CITIES[city][position])
            out.append(PublicQuestion(key, lang, text))
    return out


def request_of(question: PublicQuestion) -> EngineRequest:
    return EngineRequest(question.text, question.lang)


def label(table: dict[str, tuple[str, str]], key: str | None, lang: str) -> str:
    if key not in table:
        return ""
    return table[key][1 if lang == "ar" else 0]


def options(table: dict[str, tuple[str, str]], lang: str) -> list[dict]:
    return [{"key": k, "label": label(table, k, lang)} for k in table]
