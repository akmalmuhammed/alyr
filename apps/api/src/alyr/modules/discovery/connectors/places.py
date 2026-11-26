"""The `places` source: a place's public Google listing, read live through the Places API (New)
(Discovery 2.0, workstream F; research R2 section 3, R6 section 2.1; Discovery decision 9).

* **What is read.** Place Details for the place ID the owner gave (`discovery_locations.place_ref`,
  parsed from a Google Maps link or pasted as it is, `place_id_of`), with a field mask of only what
  a rule reads: the name, the phone (national and international), the website address, the regular
  opening hours, the business status, the Google Maps address of the listing, the rating and how
  many ratings. No reviews, no photos, no address, no text search by name (it costs more and
  guesses).
* **What is kept.** Only the place ID, which Google lets be kept for good. Everything Google
  returns lives in the run's snapshot; what a rule quotes as evidence is labelled `google` with the
  time it was read, so `retention.py` removes it after 30 days, and none of it becomes a finding's
  `observed` values (`proposals._listing_values`): nothing is proposed from it.
* **Not the Business Profile.** This is the public read, so `business_profile` is False:
  `listing_unclaimed` and `review_unanswered` stay "Not measured" until the owner's profile is
  connected.
* **Off unless switched on**: both `ALYR_DISCOVERY_PLACES` (on) and `ALYR_PLACES_KEY` (a key
  restricted to the Places API (New)) must be set. Never for the fictional sample (its refs are
  `sample:...`, which are not place IDs, and `extras_for` leaves the sample out). One request per
  place ID per run, 10 seconds each, one cost unit each on the run (`RunContext.spend`); when the
  run's budget is spent, the places left are not measured.
* **A failure is "not measured"**, never a failed check-up: a place ID Google does not know, a
  refused key, a time-out. Google's "not found" says the ID is stale, not that the business has no
  listing, so `listing_missing` is not measured for it either.
"""

import asyncio
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import ClassVar
from urllib.parse import parse_qs, unquote, urlsplit

import httpx

from alyr.modules.discovery.connectors.base import (
    DAYS,
    BudgetExceeded,
    Hours,
    Listing,
    Location,
    PlaceSnapshot,
    RunContext,
    Snapshot,
)

KIND = "places"
SOURCE = "google"  # the evidence label of what was read here (`base.GOOGLE_SOURCES`)
DETAILS_URL = "https://places.googleapis.com/v1/places/"
TIMEOUT_SECONDS = 10.0
COST_PER_CALL = 1  # cost units on the run, one Place Details call each
LANGUAGE = "en"
# Only what a rule reads (research R2 section 3: the mask decides the price tier).
FIELDS = (
    "displayName",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "websiteUri",
    "regularOpeningHours",
    "businessStatus",
    "googleMapsUri",
    "rating",
    "userRatingCount",
)
FIELD_MASK = ",".join(FIELDS)

# Tests replace this with an httpx.MockTransport; nothing else should.
transport: httpx.AsyncBaseTransport | None = None


def places_on() -> bool:
    """Both settings, or no call at all."""
    flag = os.environ.get("ALYR_DISCOVERY_PLACES", "").strip().lower()
    return flag in ("1", "true", "on", "yes") and bool(_key())


def _key() -> str:
    return os.environ.get("ALYR_PLACES_KEY", "").strip()


# ── the place ID the owner gives ────────────────────────────────────────────────────────────

# A place ID is URL-safe base64 text, "ChIJ..." for most businesses (27 characters), longer for
# other kinds of place. Twenty characters at least, so a name typed by mistake is not taken for one.
_ID = re.compile(r"[A-Za-z0-9_-]{20,200}")
# Links that hide the place behind a redirect: reading them would mean calling another host.
SHORT_HOSTS = ("maps.app.goo.gl", "goo.gl", "g.page", "g.co")
# Query keys that carry a place ID in Google's own links (Maps URLs: `query_place_id`,
# `destination_place_id`, `origin_place_id`; the review links: `placeid`).
ID_KEYS = ("query_place_id", "destination_place_id", "origin_place_id", "place_id", "placeid")


class PlaceLinkError(ValueError):
    """`code` is a key of `places_words.ERRORS`."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def place_id_of(text: str | None) -> str | None:
    """The place ID in what was stored or pasted, or None when there is none (a sample ref, a
    name, an empty field)."""
    try:
        return parse_place(text)
    except PlaceLinkError:
        return None


def parse_place(text: str | None) -> str | None:
    """The place ID in a Google Maps link or a pasted ID; None for an empty field. Raises
    `PlaceLinkError("place_link_short")` for a short link (it would have to be opened, which
    means a call to another host) and `PlaceLinkError("place_link_bad")` for anything that holds
    no place ID."""
    value = (text or "").strip()
    if not value:
        return None
    if value.startswith("places/"):
        value = value[len("places/"):]
    if _ID.fullmatch(value):
        return value
    if not re.match(r"^(https?://)?[\w.-]+\.[a-z]{2,}(/|\?|$)", value, re.I):
        raise PlaceLinkError("place_link_bad")
    parts = urlsplit(value if "://" in value else f"https://{value}")
    host = (parts.hostname or "").lower()
    if host in SHORT_HOSTS:
        raise PlaceLinkError("place_link_short")
    if not _google_host(host):
        raise PlaceLinkError("place_link_bad")
    query = parse_qs(parts.query)
    for key in ID_KEYS:
        for found in query.get(key, ()):
            if _ID.fullmatch(found.strip()):
                return found.strip()
    for key in ("q", "query"):
        for found in query.get(key, ()):
            hit = re.fullmatch(r"\s*place_id:([A-Za-z0-9_-]{20,200})\s*", found)
            if hit:
                return hit.group(1)
    # A place page's `data=` holds the place ID after `!19s` when Google puts it there.
    hit = re.search(r"!19s([A-Za-z0-9_-]{20,200})", unquote(parts.path + "?" + parts.query))
    if hit:
        return hit.group(1)
    raise PlaceLinkError("place_link_bad")


def _google_host(host: str) -> bool:
    return bool(re.fullmatch(r"(?:[\w-]+\.)*google\.(?:com|[a-z]{2,3}|com?\.[a-z]{2})", host))


# ── what a read gives the rules ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PlacesListing(Listing):
    """A `Listing` read live on Google's public page. `live_only`: none of it becomes a stored
    value beyond the evidence `retention.py` removes after 30 days."""

    live_only: ClassVar[bool] = True
    source: str = SOURCE
    read_at: datetime | None = None
    business_status: str | None = None  # OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
    website_uri: str | None = None


def hours_of(value: dict | None) -> Hours | None:
    """`regularOpeningHours.periods` as the rules' hours, every day present, a day not named
    closed. Days are Google's 0 (Sunday) to 6 (Saturday). Open all week round the clock (one period
    from Sunday 00:00 with no close) is 00:00 to 24:00 every day. A day with two spans (a split
    shift) or a span longer than a day is not measured: the rules hold one span a day, as the
    website reader does. No `regularOpeningHours` at all is `{}`: the listing shows no hours."""
    if value is None:
        return {}
    periods = value.get("periods")
    if not isinstance(periods, list):
        return None
    if not periods:
        return {}
    assigned: dict[str, tuple[str, str] | None] = {}
    for period in periods:
        start = (period or {}).get("open") or {}
        end = (period or {}).get("close")
        day = start.get("day")
        if not isinstance(day, int) or not 0 <= day <= 6:
            return None
        if end is None:
            if len(periods) == 1 and _clock(start) == "00:00":
                return {d: ("00:00", "24:00") for d in DAYS}
            return None
        opens, closes = _clock(start), _clock(end)
        if opens is None or closes is None or not isinstance(end.get("day"), int):
            return None
        days_later = (end["day"] - day) % 7
        if days_later == 1 and closes == "00:00":
            closes = "24:00"
        elif days_later > 1 or (days_later == 1 and closes > opens) or (
            days_later == 0 and closes <= opens
        ):
            return None  # longer than a day
        name = DAYS[day]
        if name in assigned:
            return None  # a split shift
        assigned[name] = (opens, closes)
    return {d: assigned.get(d) for d in DAYS}


def _clock(point: dict) -> str | None:
    hour, minute = point.get("hour", 0), point.get("minute", 0)
    if not isinstance(hour, int) or not isinstance(minute, int):
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return f"{hour:02d}:{minute:02d}"


def listing_of(body: dict, read_at: datetime) -> PlacesListing:
    """A Place Details answer as the listing the rules read. A field Google leaves out is a field
    the listing does not show ("" or `{}`), except the rating, which is then not measured."""
    name = (body.get("displayName") or {}).get("text")
    phone = body.get("internationalPhoneNumber") or body.get("nationalPhoneNumber") or ""
    rating = body.get("rating")
    count = body.get("userRatingCount")
    return PlacesListing(
        found=True,
        claimed=None,  # not on the public read (decision 9)
        name=name if isinstance(name, str) else None,
        phone=phone if isinstance(phone, str) else None,
        hours=hours_of(body.get("regularOpeningHours")),
        rating=float(rating) if isinstance(rating, int | float) else None,
        review_count=int(count) if isinstance(count, int) else 0,
        url=body.get("googleMapsUri") if isinstance(body.get("googleMapsUri"), str) else None,
        whatsapp_link=None,  # Google's listing has no such field: not measured
        read_at=read_at,
        business_status=body.get("businessStatus") or None,
        website_uri=body.get("websiteUri") or None,
    )


# ── the connector ───────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PlacesRead(Snapshot):
    """The snapshot, with how many place IDs were read and how many could not be."""

    read: int = 0
    missed: int = 0


class PlacesConnector:
    """Adds to a check-up what each place's public Google listing says. Reads only."""

    kind = KIND
    writes: frozenset[tuple[str, str]] = frozenset()
    undoable: frozenset[tuple[str, str]] = frozenset()

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot:
        if not places_on():
            return PlacesRead(KIND, ctx.now, [])
        wanted: dict[str, list[Location]] = {}
        for location in locations:
            place_id = place_id_of(location.place_ref)
            if place_id:
                wanted.setdefault(place_id, []).append(location)
        places: list[PlaceSnapshot] = []
        read = 0
        async with httpx.AsyncClient(
            transport=transport, timeout=TIMEOUT_SECONDS, trust_env=False, follow_redirects=False
        ) as client:
            for place_id, owners in wanted.items():
                try:
                    ctx.spend(COST_PER_CALL)
                except BudgetExceeded:
                    break  # the run's budget is spent: the rest is not measured
                listing = await _details(client, place_id, ctx.now)
                if listing is None:
                    continue
                read += 1
                places.extend(PlaceSnapshot(owner.id, listing) for owner in owners)
        return PlacesRead(KIND, ctx.now, places, business_profile=False, read=read,
                          missed=len(wanted) - read)

    @staticmethod
    def sentence(snapshot: Snapshot) -> str:
        """The run log's line for this step (English, like every step summary)."""
        from alyr.modules.discovery.places_words import STEP

        read, missed = getattr(snapshot, "read", 0), getattr(snapshot, "missed", 0)
        noun = f"{read} Google listing" + ("" if read == 1 else "s")
        if missed:
            return STEP["connector.places.missed"].format(listings=noun, missed=missed)
        return STEP["connector.places"].format(listings=noun)


async def _details(client: httpx.AsyncClient, place_id: str, now: datetime) -> PlacesListing | None:
    """One Place Details call. Any failure is None: not measured."""
    headers = {"X-Goog-Api-Key": _key(), "X-Goog-FieldMask": FIELD_MASK}
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            response = await client.get(
                DETAILS_URL + place_id, params={"languageCode": LANGUAGE}, headers=headers
            )
        if response.status_code != 200:
            return None
        body = response.json()
    except (httpx.HTTPError, TimeoutError, OSError, json.JSONDecodeError, ValueError):
        return None
    if not isinstance(body, dict):
        return None
    return listing_of(body, now)
