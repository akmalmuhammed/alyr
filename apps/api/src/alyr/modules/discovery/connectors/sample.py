"""The sample connector: a made-up car-care business in Doha with five branches (spec 065).

**Fictional only.** "Nuqta Car Care" was invented for this file. On 7 Nov 2026 a web search for the
name with Doha, car care and Qatar found no business of that name, and none in Qatar named Nuqta
at all (the only matches were unrelated companies in Libya, the UAE and Kuwait). A web search
cannot see Google Maps, Instagram or the trademark register: those are the founder's to check
before the name is shown to anyone outside ALYR. It does not resemble Auto Fast Track or any real
prospect. Its phone numbers use the 5555 01xx range and its web addresses end in `.example`, so
none of them can be a real number or site.

**No network, no I/O.** `snapshot` only builds data from the locations it is given, the run's
clock and the overrides the engine loaded for it, so a run on it is the same every time and works
anywhere. Its writes (spec 066) change nothing outside ALYR either: `apply` hands the value the
fictional owner approved to the state store (`discovery_sample_state`, the business's own rows)
and the script lets it win for its field, so a later check-up shows the effect of an approval.

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

from dataclasses import replace
from datetime import timedelta
from uuid import UUID

from alyr.modules.discovery.connectors.base import (
    Change,
    Hours,
    Listing,
    Location,
    PlaceSnapshot,
    Receipt,
    Review,
    RunContext,
    Snapshot,
    Website,
    WriteContext,
    WriteError,
    hours_to_json,
    same,
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


# What the fictional owner has confirmed about each branch (spec 066): the hours the sample's
# listings should show, the number each branch answers on, the category, the name and the
# business's WhatsApp number. Written when the sample is turned on, so a proposal has an "after".
PHONES = {
    "west-bay": "+97455550110",
    "wakra": "+97455550112",
    "lusail": "+97455550113",
    "sadd": "+97455550114",
    "industrial": "+97455550115",
}
NAMES = {
    "west-bay": BUSINESS,
    "wakra": f"{BUSINESS} - Wakra",
    "lusail": f"{BUSINESS} - Lusail",
    "sadd": f"{BUSINESS} - Al Sadd",
    "industrial": f"{BUSINESS} - Industrial Area",
}


def facts_for(location: Location, ordinal: int) -> dict[str, dict] | None:
    """The sample's own truth for a place, or None for a place past the fifth branch."""
    number = _index(location, ordinal)
    if number >= len(BRANCHES):
        return None
    key = BRANCHES[number][0]
    return {
        "hours": hours_to_json(STANDARD),
        "phone": {"phone": PHONES[key]},
        "category": {"category": "Car wash"},
        "name": {"name": NAMES[key]},
        "whatsapp": {"phone": WHATSAPP},
    }


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


# Everything the sample can change, and everything it can put back (spec 066).
WRITES = frozenset({
    ("listing", "hours"), ("website", "hours"), ("listing", "phone"), ("website", "phone"),
    ("listing", "category"), ("listing", "name"), ("website", "whatsapp_link"),
    ("listing", "review_reply"),
})
# A fictional owner may take back what they approved for a week.
UNDO_DAYS = 7
_ABSENT = object()


def _hours_of(value: dict) -> Hours:
    return {d: (tuple(t) if t else None) for d, t in value.items()}  # type: ignore[misc]


def _with_overrides(place: PlaceSnapshot, overrides) -> PlaceSnapshot:
    """The script's place with what the fictional owner changed on top: an override wins for its
    field and can only add to what the script already improved."""

    def over(target: str, field: str, ref: str = ""):
        return overrides.get((place.location_id, target, field, ref), _ABSENT)

    listing, web, reviews = place.listing, place.website, place.reviews
    if listing.found:
        change: dict = {}
        if (v := over("listing", "hours")) is not _ABSENT:
            change["hours"] = _hours_of(v)
        if (v := over("listing", "phone")) is not _ABSENT:
            change["phone"] = v["phone"]
        if (v := over("listing", "category")) is not _ABSENT:
            change["categories"] = [v["category"]] + [
                c for c in (listing.categories or []) if c != v["category"]
            ]
        if (v := over("listing", "name")) is not _ABSENT:
            change["name"] = v["name"]
        listing = replace(listing, **change)
    if web is not None:
        change = {}
        if (v := over("website", "hours")) is not _ABSENT:
            change["hours"] = _hours_of(v)
        if (v := over("website", "phone")) is not _ABSENT:
            change["phone"] = v["phone"]
        if (v := over("website", "whatsapp_link")) is not _ABSENT:
            change["whatsapp_link"] = v["url"]
        web = replace(web, **change)
    if reviews is not None:
        reviews = [
            replace(r, replied=True, reply_text=v["reply"])
            if (v := over("listing", "review_reply", r.source_ref)) is not _ABSENT
            else r
            for r in reviews
        ]
    return PlaceSnapshot(place.location_id, listing, web, reviews)


def _place_at(location: Location, ordinal: int, stage: int, ctx, overrides) -> PlaceSnapshot:
    number = _index(location, ordinal)
    if number >= len(BRANCHES):
        return PlaceSnapshot(location.id, Listing(found=False))
    return _with_overrides(_branch(number, location, stage, ctx), overrides)


def _gone(en: str, ar: str) -> WriteError:
    return WriteError("stale_before", f"{en} Nothing was changed.", f"{ar} لم يتغير شيء.")


def _live(place: PlaceSnapshot, change: Change):
    """The field a change is about, as a proposal shows it."""
    listing, web, field = place.listing, place.website, change.field
    if field == "review_reply":
        review = next((r for r in place.reviews or [] if r.source_ref == change.subject_ref), None)
        if review is None:
            raise _gone("That review is no longer there.", "لم تعد هذه المراجعة موجودة.")
        return {"reply": review.reply_text if review.replied else ""}
    if change.target == "website":
        if web is None:
            raise _gone("The website could not be read.", "تعذّرت قراءة الموقع الإلكتروني.")
        return {
            "hours": hours_to_json(web.hours),
            "phone": {"phone": web.phone or ""},
            "whatsapp_link": {"url": web.whatsapp_link or ""},
        }[field]
    if not listing.found:
        raise _gone("The listing is no longer there.", "لم تعد صفحة الفرع موجودة.")
    return {
        "hours": hours_to_json(listing.hours),
        "phone": {"phone": listing.phone or ""},
        "category": {"category": (listing.categories or [""])[0]},
        "name": {"name": listing.name or ""},
    }[field]


class SampleConnector:
    kind = KIND
    writes = WRITES
    undoable = WRITES

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot:
        stage = min(ctx.prior_done_runs, LAST_STAGE)
        places = [
            _place_at(location, ordinal, stage, ctx, ctx.overrides)
            for ordinal, location in enumerate(locations)
        ]
        return Snapshot(KIND, ctx.now, places)

    async def read_current(self, change: Change, ctx: WriteContext):
        """What the fictional listing shows now: its script at the stage the last check-up saw,
        with what its owner changed since."""
        stage = min(ctx.stage, LAST_STAGE)
        run = RunContext(now=ctx.now, prior_done_runs=stage)
        place = _place_at(change.location, change.location.position, stage, run, ctx.overrides)
        return _live(place, change)

    async def apply(self, change: Change, ctx: WriteContext) -> Receipt:
        if (change.target, change.field) not in self.writes or ctx.state is None:
            raise WriteError(
                "refused", "The sample business cannot change that.",
                "لا يمكن تغيير ذلك في النشاط التوضيحي.",
            )
        await ctx.state.put(
            change.location.id, change.target, change.field, change.subject_ref, change.after,
            UUID(ctx.idempotency_key),
        )
        return Receipt(ctx.idempotency_key, ctx.now, ctx.now + timedelta(days=UNDO_DAYS))

    async def undo(self, change: Change, receipt: Receipt, ctx: WriteContext) -> None:
        """Put the script's value back: delete the override, if it is still the one that was
        written. A change made since is not undone from under whoever made it."""
        if ctx.state is None or (change.target, change.field) not in self.undoable:
            raise WriteError(
                "refused", "The sample business cannot put that back.",
                "لا يمكن إرجاع ذلك في النشاط التوضيحي.",
            )
        if not same(change.field, await self.read_current(change, ctx), change.after):
            raise _gone("It has changed since.", "تغيّر منذ ذلك الحين.")
        await ctx.state.delete(change.location.id, change.target, change.field, change.subject_ref)


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
