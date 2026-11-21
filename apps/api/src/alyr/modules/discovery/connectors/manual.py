"""The `manual` source: what ALYR staff saw on a remote audit, recorded by hand (spec 065, D-169).

Nothing here reads outside ALYR, no model is used, and no network library is imported: the engine
loads the last observation of each place (`observations.latest`) into `RunContext.observations`
and this turns them into the plain `Snapshot` the twelve rules score, like any other source.

* **What staff did not record is "not measured".** A block left out (no listing facts, no site
  facts, no reviews) is `None`, and the rule that needs it says nothing; it never reads as "there
  is nothing". A place with no observation at all is left out of the snapshot, so every rule says
  "not measured" for it. A listing block that says no listing was found is `Listing(found=False)`.
* **The date is the day it was seen**, not the day the check-up ran: `taken_at` is the newest
  observation's day, so the rules' "older than 7 days" is counted from when it was looked at, and
  each place keeps its own `observed_at` for its evidence.
* **A review is a rating, a date and whether it was answered.** The reviewer and the words are
  never recorded (`observations.py`), so the `Review` has neither.
* **No writes.** The connector declares none: a finding keeps its Phase 1 kind (owner or process),
  no proposal is made, nothing can be approved or asked on WhatsApp, and "I did this" is confirmed
  only by a new observation (`engine.py`).
"""

from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING

from alyr.modules.discovery.connectors.base import (
    ConnectorError,
    Listing,
    Location,
    PlaceSnapshot,
    Review,
    RunContext,
    Snapshot,
    Website,
    hours_from_json,
)

if TYPE_CHECKING:  # observations.py reads this package's `base`, so it is not imported at run time
    from alyr.modules.discovery.observations import Observation

KIND = "manual"
# A hand-recorded round older than this is called old, in the log and on the screen (days).
STALE_AFTER_DAYS = 14


def day_start(day: date) -> datetime:
    """A day as the moment the rules count from: noon UTC, so no zone moves it to another date."""
    return datetime.combine(day, time(12, 0), UTC)


def _listing(block: dict | None) -> Listing:
    if block is None:
        return Listing(found=None)  # no listing facts were recorded: nothing is measured
    if not block.get("found"):
        return Listing(found=False)
    return Listing(
        found=True,
        claimed=block.get("claimed"),
        name=block.get("name"),
        phone=block.get("phone"),
        address=block.get("address"),
        hours=hours_from_json(block["hours"]) if block.get("hours") is not None else None,
        categories=block.get("categories"),
        photo_count=block.get("photo_count"),
        rating=block.get("rating"),
        review_count=block.get("review_count"),
        url=block.get("url"),
        # Google has no field for a WhatsApp link, so a source that reads the listing leaves it
        # unmeasured; the site's link is what the rule reads.
        whatsapp_link=None,
    )


def _website(block: dict | None, location: Location) -> Website | None:
    if block is None:
        return None
    return Website(
        url=block.get("url") or location.website_url or "",
        reachable=block.get("reachable"),
        has_location_page=block.get("has_location_page"),
        hours=hours_from_json(block["hours"]) if block.get("hours") is not None else None,
        phone=block.get("phone"),
        whatsapp_link=block.get("whatsapp_link"),
        lists_location=block.get("lists_location"),
    )


def _reviews(block: list[dict] | None, location: Location) -> list[Review] | None:
    if block is None:
        return None
    return [
        Review(
            source_ref=f"{location.id}:{n}",
            rating=item["rating"],
            posted_at=day_start(date.fromisoformat(item["posted_on"])),
            replied=bool(item["replied"]),
        )
        for n, item in enumerate(block, start=1)
    ]


class ManualConnector:
    kind = KIND
    # Read by the engine: this source is recorded by people, so a finding the owner marked done is
    # confirmed only by an observation recorded after that (engine `_save_findings`).
    by_hand = True
    writes: frozenset[tuple[str, str]] = frozenset()
    undoable: frozenset[tuple[str, str]] = frozenset()

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot:
        seen: dict = ctx.observations
        places: list[PlaceSnapshot] = []
        newest: Observation | None = None
        for location in locations:
            obs: Observation | None = seen.get(location.id)
            if obs is None:
                continue
            places.append(
                PlaceSnapshot(
                    location.id,
                    _listing(obs.listing),
                    _website(obs.website, location),
                    _reviews(obs.reviews, location),
                    observed_at=day_start(obs.observed_on),
                    recorded_at=obs.recorded_at,
                )
            )
            if newest is None or obs.observed_on > newest.observed_on:
                newest = obs
        if newest is None:
            from alyr.modules.discovery.words import ERRORS

            raise ConnectorError("nothing_recorded", *ERRORS["nothing_recorded"])
        return Snapshot(KIND, day_start(newest.observed_on), places)
