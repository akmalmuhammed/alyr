"""What a connector gives the rules: plain data, no I/O inside (spec 065).

**None means "the connector did not say".** A field that is `None` was not returned or not
measured, and the rule that needs it answers `not_measured`; it never fires on it. An empty value
(an empty string, an empty list, no hours at all) means "measured, and there is nothing": that
is what a rule can fire on. A connector never raises for "not found": it returns
`Listing(found=False)`. Anything else is a `ConnectorError` with a plain message, and the run
fails with it.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol
from uuid import UUID

# {"sun": ("07:00", "22:00"), "fri": None, ...}: a day with no (open, close) is closed. Days are
# `sun mon tue wed thu fri sat`.
DAYS = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
Hours = dict[str, tuple[str, str] | None]


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
    raises before the call that would pass the budget, so a runaway stops at the limit."""

    now: datetime
    prior_done_runs: int = 0
    cost_budget: int = 100
    spent: int = 0

    def spend(self, units: int) -> None:
        if self.spent + units > self.cost_budget:
            raise BudgetExceeded()
        self.spent += units


class Connector(Protocol):
    kind: str

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot: ...
