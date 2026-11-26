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

**Sources and searches (Discovery 2.0).** Each answer also cites made-up pages and names made-up
searches, so the screens can show "Where the answers got their facts". Every host ends in
`.example`, a name reserved so it can never be a real site (RFC 2606). Every answer cites the
guide; the "where" and "recommended" answers also cite the forum; an answer that names the business
also cites the listings page (with the West Bay branch's number, which the sample owner confirmed:
"matches"), and the "where" answers that name it cite the business's own site, whose Al Wakra
page shows the old number +974 5555 0129 until stage 1 ("differs") and the confirmed one after
("matches"), as the sample connector's website does.
"""

from alyr.modules.discovery.answers import questions
from alyr.modules.discovery.answers.engines import AskContext, EngineError, RawAnswer, Source

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


# (url, English title, Arabic title, English passage, Arabic passage). All made up.
GUIDE = (
    "https://doha-car-guide.example/car-care", "Car care in Doha: a short guide",
    "دليل قصير للعناية بالسيارات في الدوحة",
    "Sahm Auto Spa and Hayat Detailing Lab are two of the names that come up most.",
    "سهم أوتو سبا ومختبر حياة للتلميع من أكثر الأسماء التي تتكرر.",
)
FORUM = (
    "https://www.qatar-motoring-forum.example/t/where-car-wash",
    "Where do you take your car in Doha?", "أين تأخذ سيارتك في الدوحة؟",
    "Basma Car Spa was quick for me; Qamar Gloss Centre is open late.",
    "بسمة كار سبا كان سريعاً، ومركز قمر للتلميع يعمل حتى وقت متأخر.",
)
LISTINGS = (
    "https://gulf-listings.example/doha/nuqta-car-care", "Nuqta Car Care - West Bay",
    "نقطة لعناية السيارات - الخليج الغربي",
    "Nuqta Car Care, West Bay. Phone +974 5555 0110.",
    "نقطة لعناية السيارات، الخليج الغربي. الهاتف +974 5555 0110.",
)
SITE = (
    "https://nuqta-carcare.example/wakra", "Nuqta Car Care - Al Wakra",
    "نقطة لعناية السيارات - الوكرة",
    "Nuqta Car Care, Al Wakra branch. Call {phone}.",
    "نقطة لعناية السيارات، فرع الوكرة. اتصل على {phone}.",
)
SITE_PHONE = ("+974 5555 0129", "+974 5555 0112")  # before stage 1, from stage 1
SEARCHES: dict[tuple[str, str], tuple[str, ...]] = {
    ("best", "en"): ("best car care Doha", "car wash Doha reviews"),
    ("where", "en"): ("car care Doha", "car wash near West Bay Doha"),
    ("recommended", "en"): ("recommended car detailing Doha",),
    ("best", "ar"): ("أفضل العناية بالسيارات الدوحة",),
    ("where", "ar"): ("غسيل سيارات الدوحة", "العناية بالسيارات الدوحة"),
    ("recommended", "ar"): ("تلميع سيارات موصى به الدوحة",),
}


def _source(page: tuple[str, ...], ar: bool, **blanks: str) -> Source:
    title, passage = (page[2], page[4]) if ar else (page[1], page[3])
    return Source(page[0], title, passage.format(**blanks))


def sources_for(key: str, lang: str, place: int | None, stage: int) -> tuple[Source, ...]:
    ar = lang == "ar"
    cited = [_source(GUIDE, ar)]
    if key in ("where", "recommended"):
        cited.append(_source(FORUM, ar))
    if place is not None:
        cited.append(_source(LISTINGS, ar))
        if key == "where":
            cited.append(_source(SITE, ar, phone=SITE_PHONE[1 if stage >= 1 else 0]))
    return tuple(cited)


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
        return RawAnswer(
            _write(key, request.lang, place, stage),
            sources_for(key, request.lang, place, stage),
            SEARCHES[(key, request.lang)],
        )


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
