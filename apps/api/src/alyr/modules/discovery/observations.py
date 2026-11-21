"""What ALYR staff saw on a remote audit, recorded by hand (spec 065, "As built: a real business",
D-169). The `manual` source reads these rows; nothing here reads from Google or any outside place.

One row is one place as seen on one day, by one member of ALYR staff, and a row is never changed or
deleted (the database grants the app role `select` and `insert` only): a correction is a new row,
and the connector reads the last thing staff recorded for each place. Each block is optional, and
**a block that was not recorded is "not checked", never "nothing there"**: the rule that needs it
answers "not measured" and says nothing. An empty value inside a block (no hours shown, no
categories) is "looked, and there is nothing", and a rule can fire on it.

What is never stored: the text of a review and the reviewer's name. They are a third party's
personal data and Google's content, and no rule needs them: a review is a rating, the date it was
posted and whether the business replied. Unknown keys are refused, so a pasted review cannot
slip in beside the three that are kept.

The shapes (all keys optional unless said):

    listing  {found (required), claimed, name, phone, address, hours, categories, photo_count,
              rating, review_count, url}
    website  {url, reachable, has_location_page, lists_location, hours, phone, whatsapp_link}
    reviews  [{rating 1-5, posted_on, replied}]
    social   {instagram|facebook|tiktok|snapchat|x|youtube: {url, linked_from_site}}

`hours` is `{"sat": ["07:00", "22:00"], "sun": null, ...}` with every day present (null: closed), or
`{}` for "the page shows no hours". `social` is kept and shown back to staff; no rule reads it.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

import asyncpg

from alyr.modules.discovery.connectors.base import WEEK

KIND = "manual"
MAX_REVIEWS = 300
HISTORY = 20
SOCIAL = ("instagram", "facebook", "tiktok", "snapchat", "x", "youtube")

_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_URL = re.compile(r"^https?://[^\s]+$", re.I)
_LINE = re.compile(r"[\r\n\t\x00-\x1f]")


class ObservationError(ValueError):
    """Something in what staff recorded cannot be stored. The message is for staff, in English
    (the back office is English), and says which field."""


@dataclass(frozen=True)
class Observation:
    """One place as staff saw it on one day: plain data, loaded by the engine so the connector
    does no I/O."""

    id: UUID
    location_id: UUID
    observed_on: date
    recorded_at: datetime
    recorded_by: str
    where: str
    listing: dict | None
    website: dict | None
    reviews: list[dict] | None
    social: dict | None


# ── checking what staff typed ───────────────────────────────────────────────────────────


def _only(block: dict, allowed: tuple[str, ...], name: str) -> None:
    extra = sorted(set(block) - set(allowed))
    if extra:
        raise ObservationError(f"{name}: {', '.join(extra)} is not recorded here")


def _line(value: object, longest: int, name: str) -> str:
    if not isinstance(value, str) or _LINE.search(value):
        raise ObservationError(f"{name}: write one line of text")
    text = " ".join(value.split())
    if len(text) > longest:
        raise ObservationError(f"{name}: at most {longest} characters")
    return text


def _flag(value: object, name: str) -> bool:
    if not isinstance(value, bool):
        raise ObservationError(f"{name}: yes or no")
    return value


def _count(value: object, name: str, top: int = 1_000_000) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= top:
        raise ObservationError(f"{name}: a whole number from 0 to {top}")
    return value


def _url(value: object, name: str) -> str:
    text = _line(value, 300, name)
    if text and not _URL.match(text):
        raise ObservationError(f"{name}: a web address starts with http:// or https://")
    return text


def _date(value: object, name: str) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as error:
        raise ObservationError(f"{name}: write the date as year-month-day") from error


def _hours(value: object, name: str) -> dict:
    """Seven days, each `[open, close]` or null; or `{}` for "no hours shown"."""
    if not isinstance(value, dict):
        raise ObservationError(f"{name}: the week's hours, or none")
    if not value:
        return {}
    if set(value) != set(WEEK):
        raise ObservationError(f"{name}: give all seven days, a closed day as closed")
    week: dict = {}
    for day in WEEK:
        span = value[day]
        if span is None:
            week[day] = None
            continue
        if not (isinstance(span, (list, tuple)) and len(span) == 2
                and all(isinstance(t, str) and _TIME.match(t) for t in span)
                and span[0] < span[1]):
            raise ObservationError(f"{name} {day}: times as 07:00 to 22:00, opening before closing")
        week[day] = [span[0], span[1]]
    # Closed every day is the same as no hours shown: the rules read open days only.
    return week if any(week.values()) else {}


def _listing(block: object) -> dict | None:
    if block is None:
        return None
    if not isinstance(block, dict):
        raise ObservationError("listing: a block of facts")
    _only(block, ("found", "claimed", "name", "phone", "address", "hours", "categories",
                  "photo_count", "rating", "review_count", "url"), "listing")
    if "found" not in block:
        raise ObservationError("listing: say whether a listing was found")
    out: dict = {"found": _flag(block["found"], "listing found")}
    if not out["found"]:
        return out  # nothing else of a listing that is not there is kept
    for key, longest in (("name", 160), ("phone", 40), ("address", 200)):
        if key in block and block[key] is not None:
            out[key] = _line(block[key], longest, f"listing {key}")
    if block.get("claimed") is not None:
        out["claimed"] = _flag(block["claimed"], "listing claimed")
    if block.get("hours") is not None:
        out["hours"] = _hours(block["hours"], "listing hours")
    if block.get("categories") is not None:
        cats = block["categories"]
        if not isinstance(cats, list) or len(cats) > 10:
            raise ObservationError("listing categories: a list of at most 10")
        out["categories"] = [c for c in (_line(x, 80, "listing category") for x in cats) if c]
    if block.get("photo_count") is not None:
        out["photo_count"] = _count(block["photo_count"], "listing photos", 100_000)
    if block.get("review_count") is not None:
        out["review_count"] = _count(block["review_count"], "listing review count")
    if block.get("rating") is not None:
        rating = block["rating"]
        if isinstance(rating, bool) or not isinstance(rating, (int, float)) or not 1 <= rating <= 5:
            raise ObservationError("listing rating: a number from 1 to 5")
        out["rating"] = round(float(rating), 1)
    if block.get("url") is not None:
        out["url"] = _url(block["url"], "listing url")
    return out


def _website(block: object) -> dict | None:
    if block is None:
        return None
    if not isinstance(block, dict):
        raise ObservationError("website: a block of facts")
    _only(block, ("url", "reachable", "has_location_page", "lists_location", "hours", "phone",
                  "whatsapp_link"), "website")
    out: dict = {}
    if block.get("url") is not None:
        out["url"] = _url(block["url"], "website url")
    for key in ("reachable", "has_location_page", "lists_location"):
        if block.get(key) is not None:
            out[key] = _flag(block[key], f"website {key.replace('_', ' ')}")
    if block.get("hours") is not None:
        out["hours"] = _hours(block["hours"], "website hours")
    if block.get("phone") is not None:
        out["phone"] = _line(block["phone"], 40, "website phone")
    if block.get("whatsapp_link") is not None:
        out["whatsapp_link"] = _url(block["whatsapp_link"], "website whatsapp link")
    return out


def _reviews(block: object, observed_on: date, listed: int | None) -> list[dict] | None:
    if block is None:
        return None
    if not isinstance(block, list) or len(block) > MAX_REVIEWS:
        raise ObservationError(f"reviews: a list of at most {MAX_REVIEWS}")
    out = []
    for n, item in enumerate(block, start=1):
        if not isinstance(item, dict):
            raise ObservationError(f"review {n}: a rating, a date and whether it was answered")
        # The text and the author are refused here by name: this is the guard that keeps a
        # reviewer's words and name out of ALYR (D-169).
        _only(item, ("rating", "posted_on", "replied"), f"review {n}")
        if set(item) != {"rating", "posted_on", "replied"}:
            raise ObservationError(f"review {n}: give a rating, a date and whether it was answered")
        rating = item["rating"]
        if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
            raise ObservationError(f"review {n} rating: a whole number from 1 to 5")
        posted = _date(item["posted_on"], f"review {n} date")
        if posted > observed_on:
            raise ObservationError(f"review {n}: it was posted after the day it was seen")
        out.append({"rating": rating, "posted_on": posted.isoformat(),
                    "replied": _flag(item["replied"], f"review {n} answered")})
    if listed is not None and len(out) > listed:
        raise ObservationError(
            f"reviews: {len(out)} are listed but the listing says {listed} in all"
        )
    return out


def _social(block: object) -> dict | None:
    if block is None:
        return None
    if not isinstance(block, dict):
        raise ObservationError("social: a block of facts")
    _only(block, SOCIAL, "social")
    out: dict = {}
    for platform, item in block.items():
        if item is None:
            continue
        if not isinstance(item, dict):
            raise ObservationError(f"social {platform}: a link and whether the site links to it")
        _only(item, ("url", "linked_from_site"), f"social {platform}")
        entry: dict = {"url": _line(item.get("url", ""), 300, f"social {platform} link")}
        if item.get("linked_from_site") is not None:
            entry["linked_from_site"] = _flag(item["linked_from_site"], f"social {platform}")
        out[platform] = entry
    return out


def clean(raw: object, today: date) -> dict:
    """What staff recorded, in its one plain shape, or an `ObservationError`. `today` is the shop's
    day: a day that has not happened cannot have been seen."""
    if not isinstance(raw, dict):
        raise ObservationError("record the observation as a block of facts")
    _only(raw, ("observed_on", "where", "listing", "website", "reviews", "social"), "observation")
    if "observed_on" not in raw:
        raise ObservationError("observed_on: say which day this was seen")
    observed_on = _date(raw["observed_on"], "observed_on")
    if observed_on > today:
        raise ObservationError("observed_on: a day that has not happened yet")
    if (today - observed_on).days > 366:
        raise ObservationError("observed_on: more than a year ago")
    listing = _listing(raw.get("listing"))
    listed = listing.get("review_count") if listing else None
    out = {
        "observed_on": observed_on.isoformat(),
        "where": _line(raw.get("where") or "", 300, "where it was seen"),
        "listing": listing,
        "website": _website(raw.get("website")),
        "reviews": _reviews(raw.get("reviews"), observed_on, listed),
        "social": _social(raw.get("social")),
    }
    if all(out[k] is None for k in ("listing", "website", "reviews", "social")):
        raise ObservationError("record at least one thing that was seen")
    return out


# ── the table ───────────────────────────────────────────────────────────────────────────

_COLUMNS = (
    "id, location_id, observed_on, recorded_at, recorded_by, seen_where, listing, website, "
    "reviews, social"
)


def _observation(row: asyncpg.Record) -> Observation:
    return Observation(
        row["id"], row["location_id"], row["observed_on"], row["recorded_at"], row["recorded_by"],
        row["seen_where"], row["listing"], row["website"], row["reviews"], row["social"],
    )


async def record(
    conn: asyncpg.Connection, location_id: UUID, raw: object, by: str, today: date
) -> Observation:
    """Store one observation for one place of this shop. Appends; nothing is ever updated."""
    data = clean(raw, today)
    if not await conn.fetchval("select exists (select 1 from discovery_locations where id = $1)",
                               location_id):
        raise LookupError("no such place in this business")
    row = await conn.fetchrow(
        f"insert into discovery_observations (location_id, observed_on, recorded_by, seen_where, "
        f"listing, website, reviews, social) values ($1, $2, $3, $4, $5, $6, $7, $8) "
        f"returning {_COLUMNS}",
        location_id, date.fromisoformat(data["observed_on"]), by[:160] or "ALYR", data["where"],
        data["listing"], data["website"], data["reviews"], data["social"],
    )
    return _observation(row)


async def latest(conn: asyncpg.Connection) -> dict[UUID, Observation]:
    """For each place of this shop, the last thing staff recorded."""
    rows = await conn.fetch(
        f"select distinct on (location_id) {_COLUMNS} from discovery_observations "
        f"order by location_id, recorded_at desc, id desc"
    )
    return {r["location_id"]: _observation(r) for r in rows}


async def history(conn: asyncpg.Connection, location_id: UUID) -> list[dict]:
    """The rounds recorded for a place, newest first: when it was seen, when it was recorded, by
    whom, and what was recorded (never the values)."""
    rows = await conn.fetch(
        f"select {_COLUMNS} from discovery_observations where location_id = $1 "
        f"order by recorded_at desc, id desc limit $2",
        location_id, HISTORY,
    )
    return [view(_observation(r), full=False) for r in rows]


def view(obs: Observation, full: bool = True) -> dict:
    out = {
        "id": str(obs.id),
        "location_id": str(obs.location_id),
        "observed_on": obs.observed_on.isoformat(),
        "recorded_at": obs.recorded_at.isoformat(),
        "recorded_by": obs.recorded_by,
        "where": obs.where,
        "recorded": [k for k in ("listing", "website", "reviews", "social")
                     if getattr(obs, k) is not None],
    }
    if full:
        out |= {"listing": obs.listing, "website": obs.website, "reviews": obs.reviews,
                "social": obs.social}
    return out
