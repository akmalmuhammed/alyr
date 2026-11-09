"""What the owner has confirmed about a place: the only source of a proposal's "after" (spec 066).

ALYR does not guess what the real opening hours are. A proposal's value comes from a **fact**: a
value a person typed and confirmed (or, for the sample business, the fictional owner's own truth),
or the place's own name and WhatsApp number, which the owner typed when they listed it. Nothing
else is a fact: not a finding's evidence, not a value read from Google or the website (those are
what is wrong), and never a review's words.

`effective` is what a proposal reads: the row, else the default, else nothing.
"""

import re
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.modules.discovery.connectors.base import WEEK
from alyr.modules.discovery.errors import DiscoveryError

KEYS = ("hours", "phone", "category", "name", "whatsapp")
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_NUMBER = re.compile(r"^\+[1-9][0-9]{6,14}$")
_ONE_LINE = re.compile(r"[\r\n\t\x00-\x1f]")


@dataclass(frozen=True)
class Fact:
    location_id: UUID
    key: str
    value: dict
    source: str  # owner, sample, or places (a default read from the place's own details)
    confirmed_by_name: str | None
    confirmed_at: datetime | None
    default: bool = False


def _text(value: object, longest: int) -> str:
    text = " ".join(str(value or "").split())
    if not text or len(text) > longest or _ONE_LINE.search(text):
        raise DiscoveryError("bad_fact")
    return text


def validate(key: str, value: object) -> dict:
    """A fact's value in its one plain shape, or a 422 with the words (`bad_hours`, `bad_phone`,
    `bad_fact`). Nothing else is stored."""
    if key not in KEYS:
        raise DiscoveryError("bad_fact")
    if not isinstance(value, dict):
        raise DiscoveryError("bad_fact")
    if key == "hours":
        if set(value) != set(WEEK):
            raise DiscoveryError("bad_hours")
        week: dict = {}
        for day in WEEK:
            span = value[day]
            if span is None:
                week[day] = None
                continue
            if not (isinstance(span, (list, tuple)) and len(span) == 2
                    and all(isinstance(t, str) and _TIME.match(t) for t in span)
                    and span[0] < span[1]):
                raise DiscoveryError("bad_hours")
            week[day] = [span[0], span[1]]
        if not any(week.values()):
            raise DiscoveryError("bad_hours")
        return week
    if key in ("phone", "whatsapp"):
        if set(value) != {"phone"} or not isinstance(value["phone"], str):
            raise DiscoveryError("bad_phone")
        number = value["phone"].replace(" ", "")
        if not _NUMBER.match(number):
            raise DiscoveryError("bad_phone")
        return {"phone": number}
    field = "category" if key == "category" else "name"
    if set(value) != {field}:
        raise DiscoveryError("bad_fact")
    return {field: _text(value[field], 80 if key == "category" else 160)}


def _fact(row: asyncpg.Record) -> Fact:
    return Fact(
        row["location_id"], row["key"], row["value"], row["source"],
        row["confirmed_name"] or None, row["confirmed_at"],
    )


async def load(conn: asyncpg.Connection, location_ids: list[UUID] | None = None) -> dict:
    """`(location id, key) -> Fact` for the places given (all of the shop's when none): the
    stored rows, then the defaults for `name` and `whatsapp` where there is no row."""
    places = await conn.fetch(
        "select id, name, whatsapp_e164 from discovery_locations "
        "where ($1::uuid[] is null or id = any($1))",
        location_ids,
    )
    rows = await conn.fetch(
        "select * from discovery_facts where ($1::uuid[] is null or location_id = any($1))",
        location_ids,
    )
    found = {(r["location_id"], r["key"]): _fact(r) for r in rows}
    for place in places:
        if (place["id"], "name") not in found:
            found[(place["id"], "name")] = Fact(
                place["id"], "name", {"name": place["name"]}, "places", None, None, True
            )
        if (place["id"], "whatsapp") not in found and place["whatsapp_e164"]:
            found[(place["id"], "whatsapp")] = Fact(
                place["id"], "whatsapp", {"phone": place["whatsapp_e164"]}, "places", None, None,
                True,
            )
    return found


async def effective(conn: asyncpg.Connection, location_id: UUID, key: str) -> Fact | None:
    return (await load(conn, [location_id])).get((location_id, key))


async def write(
    conn: asyncpg.Connection, location_id: UUID, key: str, value: dict, *, source: str,
    user_id: UUID | None, name: str,
) -> None:
    """Store a fact (one row per place and key). An `owner` fact needs the person's name."""
    if source == "owner" and not name:
        raise DiscoveryError("forbidden", 403)
    await conn.execute(
        "insert into discovery_facts (location_id, key, value, source, confirmed_by, "
        "confirmed_name) values ($1, $2, $3, $4, $5, $6) "
        "on conflict (tenant_id, location_id, key) do update set value = excluded.value, "
        "source = excluded.source, confirmed_by = excluded.confirmed_by, "
        "confirmed_name = excluded.confirmed_name, confirmed_at = now(), updated_at = now()",
        location_id, key, value, source, user_id, name[:160] if source == "owner" else "",
    )


def view(fact: Fact) -> dict:
    return {
        "location_id": str(fact.location_id),
        "key": fact.key,
        "value": fact.value,
        "source": fact.source,
        "confirmed_by_name": fact.confirmed_by_name,
        "confirmed_at": fact.confirmed_at.isoformat() if fact.confirmed_at else None,
        "default": fact.default,
    }
