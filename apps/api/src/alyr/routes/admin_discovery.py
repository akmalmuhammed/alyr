"""Discovery on a real business, recorded by ALYR staff (D-169, spec 065 "As built: a real
business"): the back office's door to the `manual` source.

Only ALYR staff (`platform_admin`: staff list, signed in within 12 hours, the second factor while it
is required) reach these, and every route opens **exactly one business**, the one in its address,
the way the other back-office routes do (`admin.py` `create_business`, `admin_templates.py`): the
work is a transaction scoped to that business (row-level security hides every other), and the audit
entry is written on the back-office connection before either commits, so a write that cannot be
audited is not kept. Nothing here lists, searches or reads across businesses.

What staff may do for a business whose Discovery module is switched on: set its places, turn the
manual source on or off, record what a remote audit saw (a place, a day, the listing's facts, the
site's, each review as a rating, a date and whether it was answered, the social links), and run the
check-up on what was recorded. What they cannot do: record a reviewer's name or words (refused by
`observations.clean`), run a check-up from anywhere else (`engine.start_run` refuses a manual source
unless staff run it), or approve, apply or ask anything (a hand source declares no writes, so no
proposal exists). Nothing is sent, no outside source is read, and no model is used.

The activity record of the business carries each change with the staff member's name and the words
"(ALYR)", so the owner can see who recorded what.
"""

from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from alyr.core import backoffice
from alyr.core.actions import OWNER, Caller, module_on
from alyr.core.auth import Staff
from alyr.modules.discovery import KEY, actions, connectors, engine, observations
from alyr.modules.discovery.connectors.manual import STALE_AFTER_DAYS
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.items import clock as shop_clock
from alyr.routes.admin import _back_office, _by, platform_admin
from alyr.routes.discovery import LocationIn

router = APIRouter(prefix="/api/admin/businesses/{business_id}/discovery", tags=["back office"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PlacesIn(Strict):
    items: list[LocationIn] = Field(min_length=1, max_length=actions.MAX_LOCATIONS)


class SourceIn(Strict):
    on: bool


@asynccontextmanager
async def _one_business(request: Request, business_id: UUID):
    """The back-office connection (for the audit) and a connection scoped to this one business.
    A business that does not exist is a 404 and a business with Discovery off is a 409: staff
    switch the module on in the business's modules first."""
    async with _back_office(request) as office:
        async with request.app.state.db.tenant(business_id) as conn:
            known = await conn.fetchval(
                "select exists (select 1 from tenants where id = $1)", business_id
            )
            if not known:
                raise HTTPException(status_code=404, detail="no such business")
            if not await module_on(conn, KEY):
                raise HTTPException(
                    status_code=409,
                    detail="Discovery is not switched on for this business: switch it on in the "
                    "business's modules first.",
                )
            yield conn, office


def _caller(staff: Staff) -> Caller:
    """A member of ALYR staff as the activity record names them: by name, with "(ALYR)"."""
    return Caller(staff.user_id, f"{_by(staff)} (ALYR)", OWNER, "portal")


def _refused(error: DiscoveryError) -> HTTPException:
    return HTTPException(
        status_code=error.status,
        detail={"code": error.code, "message": error.en, "message_ar": error.ar},
    )


async def _place(conn: asyncpg.Connection, row: asyncpg.Record) -> dict:
    latest = (await observations.latest(conn)).get(row["id"])
    return actions.location_view(row) | {
        "observation": observations.view(latest) if latest else None,
        "history": await observations.history(conn, row["id"]),
    }


async def _overview(conn: asyncpg.Connection, business_id: UUID) -> dict:
    rows = await conn.fetch("select * from discovery_locations order by position, created_at")
    on = await conn.fetchval(
        "select kind from discovery_connections where status = 'on' order by created_at desc "
        "limit 1"
    )
    last = await conn.fetchrow("select * from discovery_runs order by created_at desc limit 1")
    name = await conn.fetchval("select name from tenants where id = $1", business_id)
    return {
        "business": {"id": str(business_id), "name": name},
        "demo": await engine.is_demo(conn),
        "source": on,
        "places": [await _place(conn, r) for r in rows],
        "last_run": actions.run_view(last, "en") if last else None,
        "stale_after_days": STALE_AFTER_DAYS,
        "social_platforms": list(observations.SOCIAL),
    }


@router.get("")
async def discovery_of_business(
    business_id: UUID, request: Request, _: Staff = Depends(platform_admin)
) -> dict:
    """The places, which source is on, the last thing recorded for each place and the last run."""
    async with _one_business(request, business_id) as (conn, _office):
        return await _overview(conn, business_id)


@router.put("/places")
async def set_places(
    business_id: UUID, body: PlacesIn, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Replace the list of places (the owner's own action, with ALYR staff as the caller): those
    with an `id` are changed, those without are added, those left out are removed with what was
    recorded for them."""
    async with _one_business(request, business_id) as (conn, office):
        try:
            await actions.edit_locations(
                conn, _caller(staff),
                # a place sent without `place_ref` keeps the owner's Google place ID
                {"items": [item.model_dump(exclude_unset=True) for item in body.items]},
            )
        except DiscoveryError as error:
            raise _refused(error) from error
        await backoffice.audit(
            office, staff, "discovery.places", "business", business_id, business_id=business_id,
            detail={"places": len(body.items)},
        )
        return await _overview(conn, business_id)


@router.put("/source")
async def set_source(
    business_id: UUID, body: SourceIn, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Turn the manual source on (which turns any other off) or off. Turning it on gives a business
    with no places one made from its own name, for staff to correct."""
    async with _one_business(request, business_id) as (conn, office):
        if await conn.fetchval(
            "select exists (select 1 from discovery_runs where status in ('queued', 'running'))"
        ):
            raise _refused(DiscoveryError("run_in_progress", 409))
        await actions.switch_connection(conn, _caller(staff), connectors.STAFF_ONLY[0], body.on)
        await backoffice.audit(
            office, staff, "discovery.source_on" if body.on else "discovery.source_off",
            "business", business_id, business_id=business_id, detail={"kind": "manual"},
        )
        return await _overview(conn, business_id)


@router.post("/places/{location_id}/observations")
async def record_observation(
    business_id: UUID, location_id: UUID, body: dict, request: Request,
    staff: Staff = Depends(platform_admin),
) -> dict:
    """Record what staff saw at one place on one day. Append-only: a correction is another one."""
    async with _one_business(request, business_id) as (conn, office):
        today = (await shop_clock.load(conn)).local.date()
        try:
            saved = await observations.record(conn, location_id, body, _by(staff), today)
        except observations.ObservationError as error:
            raise HTTPException(
                status_code=422, detail={"code": "bad_observation", "message": str(error)}
            ) from error
        except LookupError as error:
            raise HTTPException(status_code=404, detail="no such place in this business") from error
        await actions.record_change(
            conn, _caller(staff), location_id, "observation.record",
            {"observed_on": saved.observed_on.isoformat(), "recorded": observations.view(
                saved, full=False)["recorded"]},
        )
        await backoffice.audit(
            office, staff, "discovery.observation", "business", business_id,
            business_id=business_id,
            detail={"place": str(location_id), "observed_on": saved.observed_on.isoformat(),
                    "recorded": observations.view(saved, full=False)["recorded"],
                    "reviews": len(saved.reviews) if saved.reviews is not None else None},
        )
        return {
            "observation": observations.view(saved),
            "history": await observations.history(conn, location_id),
        }


@router.post("/run")
async def run_check_up(
    business_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Run the check-up on what was recorded. Only staff can: the owner's button, a schedule and
    every other door are refused for a hand source (`engine.start_run`)."""
    async with _one_business(request, business_id) as (conn, office):
        try:
            run, created = await engine.start_run(conn, staff.user_id, "manual", by_staff=True)
        except DiscoveryError as error:
            raise _refused(error) from error
        if created:
            await actions.record_change(
                conn, _caller(staff), run["id"], "run.start", {"connector": run["connector_kind"]}
            )
            await backoffice.audit(
                office, staff, "discovery.run", "business", business_id, business_id=business_id,
                detail={"run": str(run["id"])},
            )
        return actions.run_view(run, "en")
