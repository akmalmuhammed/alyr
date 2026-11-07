"""The sample connector: a made-up car-care business in Doha with five branches (spec 065).

**Fictional only.** "Nuqta Car Care" was invented for this file. On 7 Nov 2026 a web search for the
name with Doha, car care and Qatar found no business of that name, and none in Qatar named Nuqta
at all (the only matches were unrelated companies in Libya, the UAE and Kuwait). A web search
cannot see Google Maps, Instagram or the trademark register: those are the founder's to check
before the name is shown to anyone outside ALYR. It does not resemble Auto Fast Track or any real
prospect. Its phone numbers use the 5555 01xx range and its web addresses end in `.example`, so
none of them can be a real number or site.

**No network, no I/O.** `snapshot` only builds data from the locations it is given and the run's
clock, so a run on it is the same every time and works anywhere.

**Three improvement stages.** Run *n* returns stage `min(n_prior_done_runs, 3)`. Stage 0 is
deliberately untidy, so every one of the twelve rules fires at least once. Each later stage is the
owner having fixed something:

* stage 1: opening hours added at Al Sadd, a category and the right phone on the website for
  Al Wakra, the website's hours at the Industrial Area, two of the four unanswered reviews at
  Al Sadd replied to;
* stage 2: a listing made for Lusail, Al Wakra's listing claimed and given photos, a page for
  Al Sadd on the website;
* stage 3: the WhatsApp links right, one spelling of the name, Al Sadd's rating up.

At stage 3 nothing is found. The five branches map to the shop's places by `place_ref`
(`sample:<key>`), else by position; a place past the fifth is not found.
"""

from datetime import timedelta

from alyr.modules.discovery.connectors.base import (
    Hours,
    Listing,
    Location,
    PlaceSnapshot,
    Review,
    RunContext,
    Snapshot,
    Website,
)

KIND = "sample"
LAST_STAGE = 3
SITE = "https://nuqta-carcare.example"
WHATSAPP = "+97455550150"
WA_LINK = "https://wa.me/97455550150"
WRONG_WA_LINK = "https://wa.me/97455550999"

BUSINESS = "Nuqta Car Care"
BUSINESS_AR = "نقطة لعناية السيارات"

# key, English, Arabic, the area as Google would show it, the area in Arabic
BRANCHES = (
    ("west-bay", "West Bay", "الخليج الغربي"),
    ("wakra", "Al Wakra", "الوكرة"),
    ("lusail", "Lusail", "لوسيل"),
    ("sadd", "Al Sadd", "السد"),
    ("industrial", "Industrial Area", "المنطقة الصناعية"),
)

STANDARD: Hours = {
    "sun": ("07:00", "22:00"),
    "mon": ("07:00", "22:00"),
    "tue": ("07:00", "22:00"),
    "wed": ("07:00", "22:00"),
    "thu": ("07:00", "22:00"),
    "fri": ("13:00", "22:00"),
    "sat": ("07:00", "22:00"),
}
EARLY_CLOSE: Hours = {d: (v[0], "20:00") if v else None for d, v in STANDARD.items()}


def locations_to_create() -> list[dict]:
    """The five branches as the places a shop gets when it turns the sample on with none."""
    return [
        {
            "name": f"{BUSINESS} - {area}",
            "name_ar": f"{BUSINESS_AR} - {area_ar}",
            "area": area,
            "place_ref": f"sample:{key}",
            "website_url": f"{SITE}/{key}",
            "whatsapp_e164": WHATSAPP,
            "is_primary": key == "west-bay",
        }
        for key, area, area_ar in BRANCHES
    ]


def _index(location: Location, ordinal: int) -> int:
    ref = location.place_ref or ""
    if ref.startswith("sample:"):
        for number, (key, _area, _ar) in enumerate(BRANCHES):
            if ref == f"sample:{key}":
                return number
    return ordinal


class SampleConnector:
    kind = KIND

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot:
        stage = min(ctx.prior_done_runs, LAST_STAGE)
        places = []
        for ordinal, location in enumerate(locations):
            number = _index(location, ordinal)
            if number >= len(BRANCHES):
                places.append(PlaceSnapshot(location.id, Listing(found=False)))
                continue
            places.append(_branch(number, location, stage, ctx))
        return Snapshot(KIND, ctx.now, places)


def _ago(ctx: RunContext, days: int):
    return (ctx.now - timedelta(days=days)).replace(microsecond=0)


def _review(ctx, branch, n, rating, days, who, body, replied=False, language="en", reply=""):
    return Review(
        source_ref=f"sample-{branch}-{n}",
        rating=rating,
        posted_at=_ago(ctx, days),
        author_name=who,
        body=body,
        language=language,
        replied=replied,
        reply_text=reply if replied else "",
    )


THANKS = "Thank you for your visit. We are glad it went well."


def _branch(number: int, location: Location, stage: int, ctx: RunContext) -> PlaceSnapshot:
    key, area, _area_ar = BRANCHES[number]
    site = f"{SITE}/{key}"
    listing_url = SITE
    whatsapp_right = WA_LINK

    if key == "west-bay":
        # The tidy branch: nothing to find here.
        listing = Listing(
            True,
            claimed=True,
            name=BUSINESS,
            phone="+974 5555 0110",
            address="West Bay, Doha",
            hours=STANDARD,
            categories=["Car wash", "Car detailing service"],
            photo_count=24,
            rating=4.6,
            review_count=120,
            url=listing_url,
        )
        web = Website(site, True, True, STANDARD, "+974 5555 0110", whatsapp_right, True)
        reviews = [
            _review(
                ctx,
                key,
                1,
                5,
                40,
                "Hamad A.",
                "Quick and careful. The car came back spotless.",
                True,
                reply=THANKS,
            ),
            _review(
                ctx,
                key,
                2,
                5,
                25,
                "Mariam S.",
                "خدمة ممتازة وفريق محترم.",
                True,
                "ar",
                "شكراً لزيارتكم.",
            ),
            _review(ctx, key, 3, 4, 15, "Yusuf R.", "Good job, a little wait on Friday."),
            # Posted three days ago: too new to count as unanswered.
            _review(ctx, key, 4, 2, 3, "Daniel P.", "The interior was still damp when I left."),
        ]
    elif key == "wakra":
        claimed = stage >= 2
        listing = Listing(
            True,
            claimed=claimed,
            name=f"{BUSINESS} - Wakra" if stage >= 3 else "Nuqta Car Wash - Wakra",
            phone="+974 5555 0112",
            address="Al Wakra, Doha",
            hours=STANDARD,
            categories=["Car wash"] if stage >= 1 else [],
            photo_count=14 if stage >= 2 else 3,
            rating=4.2,
            review_count=56,
            url=listing_url,
        )
        web = Website(
            site,
            True,
            True,
            STANDARD,
            "+974 5555 0112" if stage >= 1 else "+974 5555 0129",
            whatsapp_right,
            True,
        )
        reviews = [
            # Two unanswered low reviews: under the three the rule needs.
            _review(ctx, key, 1, 3, 18, "Khalid M.", "Fine, but they did not vacuum the boot."),
            _review(ctx, key, 2, 2, 27, "Noura T.", "الانتظار كان طويلاً.", language="ar"),
            _review(ctx, key, 3, 5, 9, "Ali H.", "Friendly staff.", True, reply=THANKS),
        ]
    elif key == "lusail":
        web = Website(site, True, True, STANDARD, "+974 5555 0113", whatsapp_right, True)
        if stage >= 2:
            listing = Listing(
                True,
                claimed=True,
                name=f"{BUSINESS} - Lusail",
                phone="+974 5555 0113",
                address="Lusail, Doha",
                hours=STANDARD,
                categories=["Car wash"],
                photo_count=9,
                rating=4.5,
                review_count=11,
                url=listing_url,
            )
            reviews = [
                _review(ctx, key, n, 5, 10 + n, who, text, True, reply=THANKS)
                for n, (who, text) in enumerate(
                    (
                        ("Salma K.", "Spotless."),
                        ("Omar Z.", "Very fast."),
                        ("Reem D.", "Good value."),
                    ),
                    start=1,
                )
            ]
        else:
            # No listing at all: a customer searching for the branch finds nothing.
            listing = Listing(found=False)
            reviews = None
    elif key == "sadd":
        listing = Listing(
            True,
            claimed=True,
            name="NUQTA CAR CARE W.L.L.",
            phone="+974 5555 0114",
            address="Al Sadd, Doha",
            hours=STANDARD if stage >= 1 else {},
            categories=["Car wash"],
            photo_count=18,
            rating=4.1 if stage >= 3 else 3.4,
            review_count=48 if stage >= 3 else 41,
            url=listing_url,
        )
        web = Website(
            site,
            True,
            stage >= 2,
            STANDARD,
            "+974 5555 0114",
            whatsapp_right if stage >= 3 else "",
            True,
        )
        low = (
            (2, 12, "Faisal Q.", "Waited an hour and nobody told me why."),
            (3, 20, "Hessa N.", "Average. The wheels were left dirty."),
            (1, 33, "Jassim B.", "Scratch on the door after the wash."),
            (3, 41, "Lina W.", "تنظيف عادي والسعر مرتفع."),
        )
        reviews = [
            _review(
                ctx,
                key,
                n,
                rating,
                days,
                who,
                text,
                replied=stage >= 1 and n <= 2,
                language="ar" if n == 4 else "en",
                reply="We are sorry. Please write to us and we will put it right.",
            )
            for n, (rating, days, who, text) in enumerate(low, start=1)
        ] + [
            _review(ctx, key, 5, 5, 8, "Abdulla F.", "Best wash in the area.", True, reply=THANKS),
        ]
    else:  # industrial
        listing = Listing(
            True,
            claimed=True,
            name=f"{BUSINESS} - Industrial Area",
            phone="+974 5555 0115",
            address="Industrial Area, Doha",
            hours=STANDARD,
            categories=["Car wash", "Car detailing service"],
            photo_count=31,
            rating=4.4,
            review_count=88,
            url=listing_url,
        )
        web = Website(
            site,
            True,
            True,
            STANDARD if stage >= 1 else EARLY_CLOSE,
            "+974 5555 0115",
            whatsapp_right if stage >= 3 else WRONG_WA_LINK,
            True,
        )
        reviews = [
            _review(ctx, key, 1, 5, 30, "Majid L.", "Reliable every time.", True, reply=THANKS),
            _review(ctx, key, 2, 4, 14, "Sheikha A.", "كل شيء تمام.", True, "ar", "شكراً لكم."),
        ]
    return PlaceSnapshot(location.id, listing, web, reviews)
