"""Each place's Google place ID (Discovery 2.0, workstream F), on `core/actions.py`.

`discovery.google_place` says whether the Google Places live read is switched on for this shop and
which place ID each place has; `discovery.set_google_place` sets one place's ID from what the owner
pasted (a Google Maps link or the ID itself, `connectors/places.parse_place`), or clears it. Both
are for the owner and an admin only; the change is on the activity record with its channel.

The read is "on" only when both of its settings are set (`places.places_on`) and the shop's source
is not the fictional sample: the sample's places are made up, so no real listing is read for them.
"""

from uuid import UUID

import asyncpg

from alyr.core.actions import Caller, register
from alyr.modules.discovery import actions
from alyr.modules.discovery.connectors import places, sample
from alyr.modules.discovery.errors import DiscoveryError


async def _on(conn: asyncpg.Connection) -> bool:
    if not places.places_on():
        return False
    kind = await conn.fetchval(
        "select kind from discovery_connections where status = 'on' order by created_at desc "
        "limit 1"
    )
    return kind != sample.KIND


async def _view(conn: asyncpg.Connection) -> dict:
    rows = await conn.fetch(
        "select id, name, name_ar, area, place_ref, is_primary from discovery_locations "
        "order by position, created_at"
    )
    return {
        "on": await _on(conn),
        "places": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "name_ar": r["name_ar"],
                "area": r["area"],
                "is_primary": r["is_primary"],
                # Only a real place ID: the sample's own refs are not shown.
                "place_id": places.place_id_of(r["place_ref"]),
            }
            for r in rows
        ],
    }


@register("discovery.google_place", actions.CHANGERS, actions.MODULE)
async def google_place(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    return await _view(conn)


@register("discovery.set_google_place", actions.CHANGERS, actions.MODULE)
async def set_google_place(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """`location_id` and `link` (a Google Maps link or a place ID; "" clears it)."""
    location_id: UUID = args["location_id"]
    try:
        place_id = places.parse_place(args.get("link"))
    except places.PlaceLinkError as error:
        raise DiscoveryError(error.code) from error
    if await conn.fetchval(
        "select exists (select 1 from discovery_runs where status in ('queued', 'running'))"
    ):
        raise DiscoveryError("run_in_progress", 409)
    done = await conn.fetchval(
        "update discovery_locations set place_ref = $2 where id = $1 returning id",
        location_id, place_id,
    )
    if done is None:
        raise DiscoveryError("not_found", 404)
    await actions._record(conn, caller, location_id, "place.google", {"set": place_id is not None})
    return await _view(conn)
