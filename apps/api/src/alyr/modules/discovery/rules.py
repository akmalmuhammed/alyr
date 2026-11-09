"""Discovery's rules, one entry each (spec 065), in the way the Agent's insights are (D-035).

A rule is a pure function of the snapshot (and what was found before): it measures, it never
guesses. For each place, or for the whole business, it answers one of

* `pass`: measured, and fine;
* `fail`: measured, and a finding with its evidence;
* `not_measured`: the connector did not say (a field is `None`), or there is too little to tell
  (fewer than 10 reviews for a rating). **It never fires on missing data**, and a finding is
  never closed on it either: a rule that cannot tell leaves what it found alone.

The words of every rule, in English and Arabic, are in `words.py`; this file is what is true and
what it is worth. To add a rule: write a check, add a `Rule` to `RULES`, add its words.
"""

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import UUID

from alyr.modules.discovery.connectors.base import (
    DAYS,
    Hours,
    Listing,
    Location,
    PlaceSnapshot,
    Snapshot,
    Website,
)

PASS, FAIL, NOT_MEASURED = "pass", "fail", "not_measured"
PARTS = ("presence", "reviews", "website", "whatsapp", "ai")

MIN_PHOTOS = 5
LOW_REVIEWS_NEEDED = 3
LOW_STARS = 3
UNANSWERED_AFTER = timedelta(days=7)
RATING_FLOOR = 4.0
RATING_NEEDS_REVIEWS = 10


@dataclass(frozen=True)
class Evidence:
    """What was seen, where. `label` and `where` are keys that `words.py` words in either
    language; `value` is plain text, or a `~marker` that `words.py` words too."""

    label: str
    value: str
    where: str


@dataclass(frozen=True)
class Outcome:
    rule_id: str
    location_id: UUID | None  # None: the whole business
    state: str
    evidence: tuple[Evidence, ...] = ()

    @property
    def fingerprint(self) -> str:
        return fingerprint(self.rule_id, self.location_id)


def fingerprint(rule_id: str, location_id: UUID | None) -> str:
    """The same on every run, so a finding is updated, never repeated."""
    return f"{rule_id}:{location_id or '*'}"


@dataclass(frozen=True)
class Previous:
    """A finding from an earlier run, as a rule may look at it. No Phase 1 rule needs it; it is
    in the contract so a rule can say "still" or "again" later."""

    fingerprint: str
    status: str


@dataclass(frozen=True)
class Context:
    snapshot: Snapshot
    locations: list[Location]
    previous: Mapping[str, Previous] = field(default_factory=dict)
    now: datetime | None = None

    def places(self):
        """Each place with what the connector said about it (None if it said nothing)."""
        for location in self.locations:
            yield location, self.snapshot.of(location.id)


Check = Callable[[Context], list[Outcome]]


@dataclass(frozen=True)
class Rule:
    id: str
    part: str  # presence, reviews, website, whatsapp (ai is not measured in Phase 1)
    kind: str  # agent, owner, process
    severity: str  # high, medium, low
    weight: int  # what each of its checks counts for inside its part
    check: Check


# ── reading the data ────────────────────────────────────────────────────────────────────


def digits(value: str | None) -> str:
    """A phone number as digits only, without Qatar's country code, so "+974 5555 0112",
    "00974 55550112" and "5555 0112" are one number."""
    found = re.sub(r"\D", "", value or "")
    if found.startswith("00"):
        found = found[2:]
    if found.startswith("974") and len(found) > 8:
        found = found[3:]
    return found


def whatsapp_digits(link: str) -> str:
    """The number a WhatsApp link points to (wa.me/<number> or ...?phone=<number>), or ""."""
    found = re.search(r"wa\.me/\+?(\d+)", link) or re.search(r"[?&]phone=\+?(\d+)", link)
    return digits(found.group(1)) if found else ""


_LEGAL = re.compile(r"\b(w\.?\s?l\.?\s?l\.?|l\.?l\.?c\.?|co\.?|ltd\.?|company)\b", re.I)


def name_key(name: str, area: str = "") -> str:
    """A business name for comparing: lower case, no legal suffix (W.L.L.), no branch part after
    a dash or bar, no punctuation, no spaces ("Car Care" and "Carcare" are one spelling)."""
    text = re.split(r"\s[-–—|]\s", name, maxsplit=1)[0]
    text = _LEGAL.sub(" ", text.casefold())
    for word in re.findall(r"\w+", area.casefold()):
        text = re.sub(rf"\b{re.escape(word)}\b", " ", text)
    return re.sub(r"[\W_]+", "", text)


def open_days(hours: Hours | None) -> dict[str, tuple[str, str]]:
    return {d: tuple(v) for d, v in (hours or {}).items() if v}  # type: ignore[misc]


def hours_text(hours: Hours) -> str:
    """ "sun-thu 07:00-22:00, fri 13:00-22:00": days that share hours are run together."""
    days = open_days(hours)
    groups: list[tuple[list[str], tuple[str, str]]] = []
    for day in DAYS:
        if day not in days:
            continue
        if (
            groups
            and groups[-1][1] == days[day]
            and DAYS.index(groups[-1][0][-1]) == DAYS.index(day) - 1
        ):
            groups[-1][0].append(day)
        else:
            groups.append(([day], days[day]))
    return (
        ", ".join(
            (f"{d[0]}-{d[-1]}" if len(d) > 1 else d[0]) + f" {h[0]}-{h[1]}" for d, h in groups
        )
        or "~none"
    )


# ── the twelve checks ───────────────────────────────────────────────────────────────────


def _per_place(rule_id: str, decide) -> Check:
    """A check that looks at each place on its own. `decide(location, place)` answers
    (state, evidence) or None for not measured."""

    def check(ctx: Context) -> list[Outcome]:
        out = []
        for location, place in ctx.places():
            result = decide(location, place, ctx) if place is not None else None
            if result is None:
                out.append(Outcome(rule_id, location.id, NOT_MEASURED))
            else:
                state, evidence = result
                out.append(Outcome(rule_id, location.id, state, tuple(evidence)))
        return out

    return check


def _listing(place: PlaceSnapshot) -> Listing | None:
    """The listing, when there is one to read."""
    return place.listing if place.listing.found else None


def _listing_missing(location, place, ctx):
    if place.listing.found:
        return PASS, ()
    return FAIL, (Evidence("listing_status", "~not_found", "listing"),)


def _listing_unclaimed(location, place, ctx):
    listing = _listing(place)
    if listing is None or listing.claimed is None:
        return None
    if listing.claimed:
        return PASS, ()
    return FAIL, (Evidence("claimed", "~no", "listing"),)


def _hours_missing(location, place, ctx):
    listing = _listing(place)
    if listing is None or listing.hours is None:
        return None
    if open_days(listing.hours):
        return PASS, ()
    return FAIL, (Evidence("listing_hours", "~none", "listing"),)


def _hours_conflict(location, place, ctx):
    listing, web = _listing(place), place.website
    if listing is None or web is None or not open_days(listing.hours) or not open_days(web.hours):
        return None
    a, b = open_days(listing.hours), open_days(web.hours)
    if a == b:
        return PASS, ()
    differ = [d for d in DAYS if a.get(d) != b.get(d)]
    return FAIL, (
        Evidence("listing_hours", hours_text(listing.hours), "listing"),
        Evidence("website_hours", hours_text(web.hours), "website"),
        Evidence("hours_differ", "~days:" + ",".join(differ), "website"),
    )


def _phone_conflict(location, place, ctx):
    listing, web = _listing(place), place.website
    if listing is None or web is None or not digits(listing.phone) or not digits(web.phone):
        return None
    if digits(listing.phone) == digits(web.phone):
        return PASS, ()
    return FAIL, (
        Evidence("listing_phone", listing.phone, "listing"),
        Evidence("website_phone", web.phone, "website"),
    )


def _name_conflict(ctx: Context) -> list[Outcome]:
    """The business is spelled one way or several, across all its listings: one finding for the
    whole business, listing every spelling and where it is."""
    seen: dict[str, list[tuple[str, str]]] = {}
    for location, place in ctx.places():
        listing = _listing(place) if place is not None else None
        if listing is None or not listing.name:
            continue
        seen.setdefault(name_key(listing.name, location.area), []).append(
            (listing.name, location.area or location.name)
        )
    if sum(len(v) for v in seen.values()) < 2:
        return [Outcome("name_conflict", None, NOT_MEASURED)]
    if len(seen) == 1:
        return [Outcome("name_conflict", None, PASS)]
    evidence = tuple(
        Evidence("listing_name", f"{name} ({where})", "listing")
        for variants in seen.values()
        for name, where in variants
    )
    return [Outcome("name_conflict", None, FAIL, evidence)]


def _category_missing(location, place, ctx):
    listing = _listing(place)
    if listing is None or listing.categories is None:
        return None
    if listing.categories:
        return PASS, ()
    return FAIL, (Evidence("categories", "~none", "listing"),)


def _photos_few(location, place, ctx):
    listing = _listing(place)
    if listing is None or listing.photo_count is None:
        return None
    if listing.photo_count >= MIN_PHOTOS:
        return PASS, ()
    return FAIL, (Evidence("photos", str(listing.photo_count), "listing"),)


def _website_location_missing(location, place, ctx):
    web: Website | None = place.website
    if web is None or web.reachable is False:
        return None
    if web.lists_location is None and web.has_location_page is None:
        return None
    if web.lists_location is False:
        return FAIL, (Evidence("website_location", "~not_listed", "website"),)
    if web.has_location_page is False:
        return FAIL, (Evidence("website_location", "~no_page", "website"),)
    return PASS, ()


def _whatsapp_link_missing(location, place, ctx):
    web = place.website
    sources = []
    if web is not None and web.reachable is not False and web.whatsapp_link is not None:
        sources.append(("website_whatsapp", web.whatsapp_link, "website"))
    listing = _listing(place)
    if listing is not None and listing.whatsapp_link is not None:
        sources.append(("listing_whatsapp", listing.whatsapp_link, "listing"))
    if not sources:
        return None
    expected = digits(location.whatsapp_e164)
    evidence, bad = [], False
    for label, link, where in sources:
        if not link:
            bad = True
            evidence.append(Evidence(label, "~none", where))
        elif expected and whatsapp_digits(link) != expected:
            bad = True
            evidence.append(Evidence(label, link, where))
    if not bad:
        return PASS, ()
    if expected and any(e.value != "~none" for e in evidence):
        evidence.append(Evidence("expected_whatsapp", location.whatsapp_e164 or "", "business"))
    return FAIL, evidence


def _review_unanswered(location, place, ctx):
    if place.reviews is None:
        return None
    cutoff = (ctx.now or ctx.snapshot.taken_at) - UNANSWERED_AFTER
    waiting = [
        r for r in place.reviews if r.rating <= LOW_STARS and not r.replied and r.posted_at < cutoff
    ]
    if len(waiting) < LOW_REVIEWS_NEEDED:
        return PASS, ()
    now = ctx.now or ctx.snapshot.taken_at
    oldest = max((now - r.posted_at).days for r in waiting)
    return FAIL, (
        Evidence("unanswered_reviews", str(len(waiting)), "reviews"),
        Evidence("oldest_unanswered", str(oldest), "reviews"),
    )


def _rating_low(location, place, ctx):
    listing = _listing(place)
    if listing is None or listing.rating is None or listing.review_count is None:
        return None
    if listing.review_count < RATING_NEEDS_REVIEWS:
        return None  # too few reviews to say
    if listing.rating >= RATING_FLOOR:
        return PASS, ()
    return FAIL, (
        Evidence("rating", f"{listing.rating:.1f}", "listing"),
        Evidence("review_count", str(listing.review_count), "listing"),
    )


RULES: tuple[Rule, ...] = (
    Rule(
        "listing_missing",
        "presence",
        "owner",
        "high",
        3,
        _per_place("listing_missing", _listing_missing),
    ),
    Rule(
        "listing_unclaimed",
        "presence",
        "owner",
        "high",
        2,
        _per_place("listing_unclaimed", _listing_unclaimed),
    ),
    Rule(
        "hours_missing", "presence", "agent", "high", 2, _per_place("hours_missing", _hours_missing)
    ),
    Rule(
        "hours_conflict",
        "presence",
        "agent",
        "medium",
        2,
        _per_place("hours_conflict", _hours_conflict),
    ),
    Rule(
        "phone_conflict",
        "presence",
        "agent",
        "high",
        2,
        _per_place("phone_conflict", _phone_conflict),
    ),
    Rule("name_conflict", "presence", "process", "medium", 1, _name_conflict),
    Rule(
        "category_missing",
        "presence",
        "agent",
        "medium",
        1,
        _per_place("category_missing", _category_missing),
    ),
    Rule("photos_few", "presence", "owner", "low", 1, _per_place("photos_few", _photos_few)),
    Rule(
        "website_location_missing",
        "website",
        "owner",
        "medium",
        2,
        _per_place("website_location_missing", _website_location_missing),
    ),
    Rule(
        "whatsapp_link_missing",
        "whatsapp",
        "owner",
        "medium",
        2,
        _per_place("whatsapp_link_missing", _whatsapp_link_missing),
    ),
    Rule(
        "review_unanswered",
        "reviews",
        "owner",
        "medium",
        2,
        _per_place("review_unanswered", _review_unanswered),
    ),
    Rule("rating_low", "reviews", "process", "medium", 2, _per_place("rating_low", _rating_low)),
)
RULE_BY_ID = {r.id: r for r in RULES}

# What a rule can propose (spec 066): (proposal type, field, target) for each. A rule not listed
# here has no proposal (it needs the owner, Google or a change of process), and its finding stays
# as in Phase 1, with "I did this". The "after" of each comes from a fact the owner confirmed
# (`facts.py`) or, for a review reply, a fixed text chosen by rule (`proposal_words.py`).
PROPOSES: dict[str, tuple[tuple[str, str, str], ...]] = {
    "hours_missing": (("set_hours", "hours", "listing"),),
    "hours_conflict": (("set_hours", "hours", "listing"), ("set_hours", "hours", "website")),
    "phone_conflict": (("set_phone", "phone", "listing"), ("set_phone", "phone", "website")),
    "category_missing": (("set_category", "category", "listing"),),
    "name_conflict": (("set_name", "name", "listing"),),
    "whatsapp_link_missing": (("add_whatsapp_link", "whatsapp_link", "website"),),
    "review_unanswered": (("reply_to_review", "review_reply", "listing"),),
}


def writable(rule_id: str, writes) -> tuple[tuple[str, str, str], ...]:
    """The proposals of a rule the connector can make: those whose (target, field) it writes."""
    return tuple(p for p in PROPOSES.get(rule_id, ()) if (p[2], p[1]) in (writes or ()))


def effective_kind(rule: Rule, writes) -> str:
    """`agent` only while the connector can write something for the rule; otherwise the rule's own
    Phase 1 kind (spec 066). The engine refreshes a finding's kind with this on every upsert."""
    return "agent" if writable(rule.id, writes) else rule.kind


SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
KIND_ORDER = {"agent": 0, "owner": 1, "process": 2}


def evaluate(ctx: Context, parts: tuple[str, ...] | None = None) -> list[Outcome]:
    """Every rule's outcome for every place (or the whole business). `parts` limits it to the
    rules of those parts: the engine runs one family at a time, one logged step each."""
    outcomes: list[Outcome] = []
    for rule in RULES:
        if parts is None or rule.part in parts:
            outcomes.extend(rule.check(ctx))
    return outcomes


def check_registry() -> None:
    """Fail fast if the registry is wrong (called at import)."""
    ids = [r.id for r in RULES]
    assert len(ids) == len(set(ids)) == 12, "Phase 1 ships exactly twelve rules"
    for r in RULES:
        assert r.part in PARTS and r.part != "ai", r.id
        assert r.kind in KIND_ORDER and r.severity in SEVERITY_ORDER and r.weight >= 1, r.id


check_registry()
