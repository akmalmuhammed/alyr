"""The sample answer engine: made-up answers about a made-up business (spec 068).

**Fictional only.** The business is "Nuqta Car Care" (the sample connector's, spec 065), and its
five competitors here are invented for this file: Sahm Auto Spa, Hayat Detailing Lab, Basma Car
Spa, Qamar Gloss Centre and Rukn Polish House. On 10 Nov 2026 a web search for the five with Doha,
Qatar and car care found no business of any of those names. A web search cannot see Google Maps,
Instagram or the trademark register: those are the founder's to check before a name is shown
outside ALYR. None of it is a statement about any real business, and none of it is a result.

**No network, no I/O, deterministic.** The same question at the same stage gives the same answer.
Like the sample connector it has three improvement stages, by the number of earlier done
check-ups (`min(n, 3)`); the share of answers that name the business goes 1 of 6, 2 of 6, 4 of 6,
6 of 6, and its place in the list moves up. Some answers name it only in a sentence, not in the
list, so the reading has all three cases (listed, named in a sentence, not named).

It answers only car care in Doha: for another trade or city it raises `sample_only`.
"""

from alyr.modules.discovery.answers import questions
from alyr.modules.discovery.answers.engines import AskContext, EngineError, RawAnswer

KIND = "sample"
LAST_STAGE = 3
BUSINESS = ("Nuqta Car Care", "نقطة لعناية السيارات")
BUSINESS_BLURB = (
    "five branches across Doha, open every day",
    "خمسة فروع في أنحاء الدوحة، تعمل كل يوم",
)

# English name, Arabic name, English blurb, Arabic blurb. All made up.
COMPETITORS = (
    ("Sahm Auto Spa", "سهم أوتو سبا", "hand wash and polish, appointments by phone",
     "غسيل يدوي وتلميع، المواعيد بالهاتف"),
    ("Hayat Detailing Lab", "مختبر حياة للتلميع", "paint correction and ceramic coating",
     "تصحيح الطلاء والطلاء الخزفي"),
    ("Basma Car Spa", "بسمة كار سبا", "interior cleaning, quick turnaround",
     "تنظيف داخلي وإنجاز سريع"),
    ("Qamar Gloss Centre", "مركز قمر للتلميع", "polishing and wax, open late",
     "تلميع وشمع، يعمل حتى وقت متأخر"),
    ("Rukn Polish House", "بيت ركن للتلميع", "full-detail packages",
     "باقات تفصيل كاملة"),
)

# Where the business stands in the answer to each question, at stages 0 to 3.
# None: not named. 0: named in a sentence after the list, not in it. n: the n-th item of the list.
PLACES: dict[tuple[str, str], tuple[int | None, ...]] = {
    ("best", "en"): (None, None, 4, 2),
    ("where", "en"): (5, 4, 3, 1),
    ("recommended", "en"): (None, None, 0, 5),
    ("best", "ar"): (None, 4, 3, 2),
    ("where", "ar"): (None, None, None, 1),
    ("recommended", "ar"): (None, None, None, 3),
}
KEYS = {(q.text, q.lang): q.key for q in questions.build("car_care", "doha")}
# Each question rotates the competitors, so the lists are not all the same.
ROTATE = {"best": 0, "where": 2, "recommended": 4}


def expected_named(stage: int) -> int:
    """How many of the six answers name the business at a stage (for the tests)."""
    return sum(1 for places in PLACES.values() if places[min(stage, LAST_STAGE)] is not None)


class SampleEngine:
    kind = KIND
    live = False
    cost_per_call = 0

    async def ask(self, request: questions.EngineRequest, ctx: AskContext) -> RawAnswer:
        key = KEYS.get((request.text, request.lang))
        if key is None:
            raise EngineError(
                "sample_only",
                "The sample answers cover car care in Doha only.",
                "الإجابات التجريبية تغطي العناية بالسيارات في الدوحة فقط.",
            )
        stage = max(0, min(ctx.stage, LAST_STAGE))
        place = PLACES[(key, request.lang)][stage]
        return RawAnswer(_write(key, request.lang, place, stage))


def _write(key: str, lang: str, place: int | None, stage: int) -> str:
    ar = lang == "ar"
    shift = ROTATE[key]
    ordered = [COMPETITORS[(shift + i) % len(COMPETITORS)] for i in range(len(COMPETITORS))]
    rows = [(c[1], c[3]) if ar else (c[0], c[2]) for c in ordered]
    if place:  # listed: put the business in at that place and keep five items
        name = BUSINESS[1] if ar else BUSINESS[0]
        if key == "best" and not ar and stage >= 2:
            name = f"{name} (West Bay)"  # a branch's name: the reading must still match
        rows.insert(place - 1, (name, BUSINESS_BLURB[1 if ar else 0]))
        rows = rows[:5]
    lines = [f"{i}. **{name}** - {blurb}" for i, (name, blurb) in enumerate(rows, start=1)]
    if ar:
        head = "إليك بعض الخيارات ذات التقييمات الجيدة في مجال خدمات العناية بالسيارات في الدوحة:"
        tail = (
            "\n\nويُذكر أيضاً نقطة لعناية السيارات ولها عدة فروع، لكن الآراء حولها متباينة."
            if place == 0 else "\n\nيُنصح بالتأكد من ساعات العمل قبل الزيارة."
        )
    else:
        head = "Here are some well-reviewed options for car care in Doha:"
        tail = (
            "\n\nNuqta Car Care also comes up, with several branches, though opinions differ."
            if place == 0 else "\n\nCheck the opening hours before you go."
        )
    return head + "\n\n" + "\n".join(lines) + tail
