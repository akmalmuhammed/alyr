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

from alyr.modules.discovery import normalize
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
# A place whose reviews, old enough to have been answered, number this many and have not had one
# reply is as silent as one with three unanswered complaints (first-client audit T9, D-169): "no low
# review waits" must not read as "healthy" for a business that has never answered anyone.
SILENT_NEEDS_REVIEWS = 10
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
    """A phone number as its international digits, read in Qatar when it has no country code, so
    "+974 5555 0112", "00974 55550112", "5555 0112" and «٥٥٥٥٠١١٢» are one number; "" when it is
    not a number (`normalize.phone_key`)."""
    return normalize.phone_key(value)


def whatsapp_digits(link: str) -> str:
    """The number a WhatsApp link points to (wa.me/<number> or ...?phone=<number>), or "". A
    WhatsApp link always carries the country code, so its digits are read as international."""
    link = normalize.ascii_digits(link or "")
    found = re.search(r"wa\.me/\+?(\d+)", link) or re.search(r"[?&]phone=\+?(\d+)", link)
    return normalize.phone_key("+" + found.group(1)) if found else ""


def name_key(name: str, area: str = "") -> str:
    """A business name for comparing, Arabic or Latin (`normalize.name_key`): lower case, folded,
    no legal suffix (W.L.L., «ذ.م.م»), no branch part after a dash or bar, no punctuation, no
    spaces ("Car Care" and "Carcare" are one spelling)."""
    return normalize.name_key(name, area)


def owner_side_measured(snapshot: Snapshot) -> bool:
    """Whether the source can see the owner's side of a listing: whether it is claimed, the owner's
    replies to reviews, the rating over time. Google's public read (Places) has no such fields
    (research R2), and the sample stands for that read while the Business Profile is not connected
    (Discovery decision 9), so only a connected Business Profile says them. A round ALYR staff
    recorded by hand (`manual`, D-169) is a person reading the public page, which does show the
    owner's replies and whether the listing is claimed; what they did not record is `None`."""
    return snapshot.business_profile or snapshot.source == "manual"


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
    if place.listing.found is None:
        return None  # the source did not say whether there is one
    if place.listing.found:
        return PASS, ()
    return FAIL, (Evidence("listing_status", "~not_found", "listing"),)


def _listing_unclaimed(location, place, ctx):
    listing = _listing(place)
    if not owner_side_measured(ctx.snapshot) or listing is None or listing.claimed is None:
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
    if listing is None or web is None:
        return None
    same = normalize.same_phone(listing.phone, web.phone)
    if same is None:
        return None  # one side has no number to compare
    if same:
        return PASS, ()
    return FAIL, (
        Evidence("listing_phone", listing.phone, "listing"),
        Evidence("website_phone", web.phone, "website"),
    )


def _spellings(names: list[tuple[str, str, str]]) -> list[list[tuple[str, str, str]]]:
    """Listings of one script in groups, each group one name (`normalize.same_name`): a name joins
    the first group it is the same as any member of."""
    groups: list[list[tuple[str, str, str]]] = []
    for item in names:
        for group in groups:
            if any(normalize.same_name(item[0], o[0], item[2], o[2]) for o in group):
                group.append(item)
                break
        else:
            groups.append([item])
    return groups


def _name_conflict(ctx: Context) -> list[Outcome]:
    """The business is spelled one way or several, across all its listings: one finding for the
    whole business, listing every spelling and where it is.

    Names are compared inside one script only (`normalize`): an Arabic listing beside an English
    one is never a difference. It fails when two listings of one script are different names; it
    passes only when every listing was compared with the others, so listings in both scripts with
    no difference inside either are not measured."""
    by_script: dict[str, list[tuple[str, str, str]]] = {}
    for location, place in ctx.places():
        listing = _listing(place) if place is not None else None
        if listing is None or not listing.name:
            continue
        script = normalize.script_of(name_key(listing.name, location.area))
        if script:
            by_script.setdefault(script, []).append(
                (listing.name, location.area or location.name, location.area)
            )
    if sum(len(v) for v in by_script.values()) < 2:
        return [Outcome("name_conflict", None, NOT_MEASURED)]
    grouped = [_spellings(names) for names in by_script.values()]
    differ = [groups for groups in grouped if len(groups) > 1]
    if differ:
        evidence = tuple(
            Evidence("listing_name", f"{name} ({where})", "listing")
            for groups in differ
            for group in groups
            for name, where, _ in group
        )
        return [Outcome("name_conflict", None, FAIL, evidence)]
    if len(by_script) > 1:
        return [Outcome("name_conflict", None, NOT_MEASURED)]
    return [Outcome("name_conflict", None, PASS)]


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
    """Fails when 3 or more reviews of 3 stars or fewer, older than 7 days, have no reply, or when
    10 or more reviews older than 7 days have not had a single reply (of any stars). The second is
    what a five-star page that nobody ever answered looked like before: passing."""
    if place.reviews is None or not owner_side_measured(ctx.snapshot):
        return None  # whether the owner replied is not something a public read can see
    now = ctx.now or ctx.snapshot.taken_at
    cutoff = now - UNANSWERED_AFTER
    settled = [r for r in place.reviews if r.posted_at < cutoff]  # old enough to have been answered
    waiting = [r for r in settled if r.rating <= LOW_STARS and not r.replied]
    silent = len(settled) >= SILENT_NEEDS_REVIEWS and not any(r.replied for r in settled)
    if len(waiting) < LOW_REVIEWS_NEEDED and not silent:
        return PASS, ()
    evidence: list[Evidence] = []
    if len(waiting) >= LOW_REVIEWS_NEEDED:
        evidence.append(Evidence("unanswered_reviews", str(len(waiting)), "reviews"))
    if silent:
        evidence.append(Evidence("replies_seen", f"~of:0:{len(settled)}", "reviews"))
    pending = settled if silent else waiting
    oldest = max((now - r.posted_at).days for r in pending)
    evidence.append(Evidence("oldest_unanswered", str(oldest), "reviews"))
    return FAIL, tuple(evidence)


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


def effective_kind(rule: Rule, writes, by_hand: bool = False) -> str:
    """`agent` only while the connector can write something for the rule; otherwise the rule's own
    Phase 1 kind (spec 066). The engine refreshes a finding's kind with this on every upsert.

    A hand-recorded source (D-169) can write nothing, and an `agent` finding reads "ALYR can change
    this after you approve": for it that is never true, so such a finding is the owner's (or
    whoever the owner asks to change the listing by hand) and reads "Needs you or Google"."""
    if writable(rule.id, writes):
        return "agent"
    return "owner" if by_hand and rule.kind == "agent" else rule.kind


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
