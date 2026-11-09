"""What a connector gives the rules: plain data, no I/O inside (spec 065).

**None means "the connector did not say".** A field that is `None` was not returned or not
measured, and the rule that needs it answers `not_measured`; it never fires on it. An empty value
(an empty string, an empty list, no hours at all) means "measured, and there is nothing": that
is what a rule can fire on. A connector never raises for "not found": it returns
`Listing(found=False)`. Anything else is a `ConnectorError` with a plain message, and the run
fails with it.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol, runtime_checkable
from uuid import UUID

# {"sun": ("07:00", "22:00"), "fri": None, ...}: a day with no (open, close) is closed. Days are
# `sun mon tue wed thu fri sat`.
DAYS = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
Hours = dict[str, tuple[str, str] | None]
# The week as the owner and the screens read it (spec 066): Saturday first.
WEEK = ("sat", "sun", "mon", "tue", "wed", "thu", "fri")


def hours_to_json(hours: Hours | None) -> dict:
    """Opening hours as plain JSON, all seven days present: `{"sat": ["07:00", "22:00"], ...}`,
    a closed day `null`.
    No hours at all (None or {}) is `{}`: nothing shown, which is not the same as closed."""
    days = {d: tuple(v) for d, v in (hours or {}).items() if v}
    if not days:
        return {}
    return {d: list(days[d]) if d in days else None for d in WEEK}


def hours_from_json(value: dict | None) -> Hours:
    return {d: (tuple(v) if v else None) for d, v in (value or {}).items() if d in WEEK}  # type: ignore[misc]


def normal(field: str, value: object) -> object:
    """A value in the form two values are compared in, so a write that was already done is
    recognised and a changed "before" is caught: hours by day, a number by its digits, text trimmed
    and case-folded, an empty reply equal to none."""
    value = value if isinstance(value, dict) else {}
    if field == "hours":
        days = {d: tuple(v) for d, v in value.items() if v and d in WEEK}
        return tuple(sorted(days.items()))
    if field == "phone":
        found = re.sub(r"\D", "", value.get("phone") or "")
        found = found[2:] if found.startswith("00") else found
        return found[3:] if found.startswith("974") and len(found) > 8 else found
    if field == "whatsapp_link":
        found = re.search(r"wa\.me/\+?(\d+)", value.get("url") or "")
        return found.group(1) if found else (value.get("url") or "").strip().casefold()
    key = {"category": "category", "name": "name", "review_reply": "reply"}[field]
    return " ".join((value.get(key) or "").split()).casefold()


def same(field: str, a: object, b: object) -> bool:
    return normal(field, a) == normal(field, b)


@dataclass(frozen=True)
class Location:
    """A place the check covers: a row of `discovery_locations`."""

    id: UUID
    name: str
    name_ar: str = ""
    area: str = ""
    place_ref: str | None = None
    website_url: str | None = None
    whatsapp_e164: str | None = None
    is_primary: bool = False
    position: int = 0


@dataclass(frozen=True)
class Listing:
    found: bool
    claimed: bool | None = None
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    hours: Hours | None = None
    categories: list[str] | None = None
    photo_count: int | None = None
    rating: float | None = None
    review_count: int | None = None
    url: str | None = None
    # A link to the business's WhatsApp on the listing, "" if there is none. Google's listing
    # fields hold none, so a real connector leaves it None (not measured).
    whatsapp_link: str | None = None


@dataclass(frozen=True)
class Website:
    url: str
    reachable: bool | None = None
    has_location_page: bool | None = None
    hours: Hours | None = None
    phone: str | None = None
    # The link a visitor taps to write on WhatsApp, "" if the page has none.
    whatsapp_link: str | None = None
    lists_location: bool | None = None


@dataclass(frozen=True)
class Review:
    source_ref: str
    rating: int
    posted_at: datetime
    author_name: str = ""
    body: str = ""
    language: str = "en"
    replied: bool = False
    reply_text: str = ""


@dataclass(frozen=True)
class PlaceSnapshot:
    location_id: UUID
    listing: Listing
    website: Website | None = None
    # None: reviews were not read. A list, possibly empty: they were.
    reviews: list[Review] | None = None


@dataclass(frozen=True)
class Snapshot:
    source: str  # the connector's kind; the source of every review in it
    taken_at: datetime
    places: list[PlaceSnapshot] = field(default_factory=list)

    def of(self, location_id: UUID) -> PlaceSnapshot | None:
        for place in self.places:
            if place.location_id == location_id:
                return place
        return None


class ConnectorError(Exception):
    """A source that could not be read. The message is plain and safe to show, in both
    languages; the run fails with it and keeps its log."""

    def __init__(self, code: str, en: str, ar: str) -> None:
        self.code, self.en, self.ar = code, en, ar
        super().__init__(en)


class BudgetExceeded(ConnectorError):
    def __init__(self) -> None:
        from alyr.modules.discovery.words import ERRORS

        en, ar = ERRORS["run_budget_exceeded"]
        super().__init__("run_budget_exceeded", en, ar)


@dataclass
class RunContext:
    """What a connector may know about this run. `spend` is how an outside call is paid for: it
    raises before the call that would pass the budget, so a runaway stops at the limit.

    `overrides` is what the fictional owner of the sample business changed by approving a proposal
    (spec 066), loaded by the engine so the connector still does no I/O: `(location id, target,
    field, subject ref)` to the value written. A real source has none."""

    now: datetime
    prior_done_runs: int = 0
    cost_budget: int = 100
    spent: int = 0
    overrides: Mapping[tuple, object] = field(default_factory=dict)

    def spend(self, units: int) -> None:
        if self.spent + units > self.cost_budget:
            raise BudgetExceeded()
        self.spent += units


class Connector(Protocol):
    kind: str

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot: ...


# ── writing (spec 066): the interface a source implements to change something ──────────────


@dataclass(frozen=True)
class Change:
    """What a connector is asked to do: plain data, the same values the owner approved. `before`
    is what the owner saw (and what the live value must still be); `after` is what is written."""

    type: str
    target: str
    field: str
    location: Location
    subject_ref: str
    before: object
    after: object


@dataclass(frozen=True)
class Receipt:
    ref: str  # the source's own id for what it did
    at: datetime
    undo_until: datetime | None  # None: this write cannot be undone


class WriteError(Exception):
    """A write that did not happen, with the words in both languages (nothing a stack trace).

    `stale_before` the live value is not the "before" the owner saw; `not_permitted` the account
    may not edit it; `refused` the source refused the value; `unavailable` try again (the only
    retryable one). A write never raises for "already done": `read_current` says so first."""

    def __init__(self, code: str, en: str, ar: str) -> None:
        self.code, self.en, self.ar = code, en, ar
        super().__init__(en)

    @property
    def retryable(self) -> bool:
        return self.code == "unavailable"


class StateStore(Protocol):
    """Where the sample connector keeps what its fictional owner changed. The real implementation
    is the database's (`apply.py`); a real source never uses it."""

    async def put(self, location_id: UUID, target: str, field: str, subject_ref: str,
                  value: object, proposal_id: UUID | None) -> None: ...

    async def delete(self, location_id: UUID, target: str, field: str,
                     subject_ref: str) -> None: ...


@dataclass
class WriteContext:
    """What a write may know. `idempotency_key` is the proposal's id. `stage` is where the sample
    business stands (the stage its last check-up saw); `overrides` what its owner already changed.
    `spend` is the cost budget of a write (10 units for a real source, 0 for the sample)."""

    now: datetime
    idempotency_key: str
    stage: int = 0
    overrides: Mapping[tuple, object] = field(default_factory=dict)
    state: StateStore | None = None
    cost_budget: int = 10
    spent: int = 0

    def spend(self, units: int) -> None:
        if self.spent + units > self.cost_budget:
            raise BudgetExceeded()
        self.spent += units


@runtime_checkable
class WritableConnector(Protocol):
    """A connector that can also change things. `writes` and `undoable` are sets of
    `(target, field)`. The engine knows a connector can write by `isinstance` and its `writes`."""

    kind: str
    writes: frozenset[tuple[str, str]]
    undoable: frozenset[tuple[str, str]]

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot: ...

    async def read_current(self, change: Change, ctx: WriteContext) -> object: ...

    async def apply(self, change: Change, ctx: WriteContext) -> Receipt: ...

    async def undo(self, change: Change, receipt: Receipt, ctx: WriteContext) -> None: ...
