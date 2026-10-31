"""Bookings: services, resources, opening hours, free times, and the bookings themselves.

All time arithmetic is done by PostgreSQL in the shop's own time zone, so "9 am" means
9 am at the shop whatever machine runs this code.

A shop can list its resources (chairs, people, rooms; D-069): one customer at a time per
resource, so two customers can have the same time on two chairs. A shop that lists none is
held to one customer at a time, as before. Which resource a booking takes is decided under
the shop's lock, so two customers cannot be given the same last one, and the database
refuses it anyway (`bookings_no_overlap`).

D-084 adds: a resource's own working hours (none set: the shop's), the customer's choice of
"anyone" or one resource, bookings made by staff at any minute (a walk-in), and deposits
(`deposits.py`): a service may ask one, the booking holds the time until it is paid.

Every function takes a tenant-scoped connection.
"""

from datetime import date, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.core import jobs, team, templates
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound
from alyr.core.team import Actor
from alyr.modules.bookings import words

REMINDER = "booking_reminder"
SLOT_STEP_MINUTES = 30
# A customer cannot book something starting in the next few minutes.
LEAD_MINUTES = 30
REMIND_BEFORE = timedelta(hours=2)
MAX_DAYS_AHEAD = 60
MAX_SERVICES = 100
# Staff may enter a visit that has already started (a walk-in written down afterwards), up to
# this long ago.
STAFF_LOOK_BACK = timedelta(hours=12)
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"
_TZ = f"(select timezone from tenants where id = {_TENANT})"


class BookingError(Exception):
    """A booking request that cannot be carried out; `code` is stable, the message is
    safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def deposit_amount(kind: str, value: int, price: int) -> int:
    """What a service's deposit comes to, in dirhams: a fixed amount, or a share of the price
    rounded to the nearest dirham. Nothing for a percentage of a service with no price."""
    if kind == "fixed":
        return value
    if kind == "percent":
        return (price * value + 50) // 100
    return 0


def _service(row) -> dict:
    deposit = deposit_amount(row["deposit_kind"], row["deposit_value"], row["price"])
    return {
        "id": str(row["id"]), "name": row["name"], "name_ar": row["name_ar"],
        "duration_minutes": row["duration_minutes"], "price": row["price"],
        "price_text": fmt_qar(row["price"]) if row["price"] else "",
        "active": row["active"],
        "deposit_kind": row["deposit_kind"], "deposit_value": row["deposit_value"],
        "deposit": deposit, "deposit_text": fmt_qar(deposit) if deposit else "",
    }


_SERVICE_COLUMNS = (
    "id, name, name_ar, duration_minutes, price, active, deposit_kind, deposit_value"
)


async def list_services(
    conn: asyncpg.Connection, only_active: bool = False, detail: bool = False
) -> list[dict]:
    """The shop's services in their order. `detail` is for the workspace's own screen: who does
    each one (`resource_ids`, empty for everyone who takes bookings) and how many bookings
    still to come are on it (`upcoming`). The booking page asks for neither."""
    rows = await conn.fetch(
        f"select {_SERVICE_COLUMNS} from services "
        "where active or not $1 order by sort, created_at",
        only_active,
    )
    out = [_service(r) for r in rows]
    if detail:
        who: dict[str, list[str]] = {}
        for link in await conn.fetch("select service_id, resource_id from service_resources"):
            who.setdefault(str(link["service_id"]), []).append(str(link["resource_id"]))
        ahead = {
            str(r["service_id"]): r["n"]
            for r in await conn.fetch(
                "select service_id, count(*)::int as n from bookings "
                "where status = 'booked' and ends_at > now() group by 1"
            )
        }
        for one in out:
            one["resource_ids"] = who.get(one["id"], [])
            one["upcoming"] = ahead.get(one["id"], 0)
    return out


def _clean_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise BookingError("bad_name", "A service needs a name.")
    return name


def _check_deposit(kind: str, value: int, price: int) -> int:
    """The deposit a service may ask, as it is stored: none, a share of the price from 1% to
    100%, or a fixed amount from QAR 1 and, when the service has a price, not above it."""
    if kind == "none":
        return 0
    if kind == "percent":
        if not 1 <= value <= 100:
            raise BookingError("bad_deposit", "A deposit share is between 1% and 100%.")
        if not price:
            raise BookingError(
                "deposit_needs_price", "A share of the price needs the service to have a price."
            )
        return value
    if value < 100:
        raise BookingError("bad_deposit", "A fixed deposit is at least QAR 1.")
    if price and value > price:
        raise BookingError("bad_deposit", "A deposit cannot be more than the service's price.")
    return value


async def add_service(
    conn: asyncpg.Connection, name: str, name_ar: str, duration_minutes: int, price: int,
    deposit_kind: str = "none", deposit_value: int = 0, resource_ids: list[UUID] | None = None,
) -> str:
    """Add a service, with its deposit and the people or chairs that do it if they are known.
    The caller's transaction makes it all or nothing."""
    name = _clean_name(name)
    value = _check_deposit(deposit_kind, deposit_value, price)
    if await conn.fetchval("select count(*) from services") >= MAX_SERVICES:
        raise BookingError(
            "too_many_services", f"A shop can list up to {MAX_SERVICES} services."
        )
    service_id = await conn.fetchval(
        "insert into services (name, name_ar, duration_minutes, price, deposit_kind, "
        "    deposit_value, sort) "
        "values ($1, $2, $3, $4, $5, $6, (select coalesce(max(sort), 0) + 1 from services)) "
        "returning id",
        name, name_ar.strip(), duration_minutes, price, deposit_kind, value,
    )
    if resource_ids:
        await set_service_resources(conn, service_id, resource_ids)
    return str(service_id)


async def update_service(
    conn: asyncpg.Connection, service_id: UUID, name: str | None, name_ar: str | None,
    duration_minutes: int | None, price: int | None,
    deposit_kind: str | None = None, deposit_value: int | None = None,
    resource_ids: list[UUID] | None = None,
) -> bool:
    """Change a service's name, length, price, deposit or who does it (an empty list: all of
    them). Bookings already made keep the name, the price and the deposit they were made with.
    The deposit is checked against the price the service will have, so a price cannot be
    lowered under a fixed deposit."""
    current = await conn.fetchrow(
        "select price, deposit_kind, deposit_value from services where id = $1 for update",
        service_id,
    )
    if current is None:
        return False
    final_price = price if price is not None else current["price"]
    kind = deposit_kind if deposit_kind is not None else current["deposit_kind"]
    value = _check_deposit(
        kind,
        (deposit_value or 0) if deposit_kind is not None else current["deposit_value"],
        final_price,
    )
    await conn.execute(
        "update services set name = coalesce($2, name), name_ar = coalesce($3, name_ar), "
        "duration_minutes = coalesce($4, duration_minutes), price = coalesce($5, price), "
        "deposit_kind = $6, deposit_value = $7 where id = $1",
        service_id, _clean_name(name) if name is not None else None,
        name_ar.strip() if name_ar is not None else None, duration_minutes, price,
        kind, value,
    )
    if resource_ids is not None:
        await set_service_resources(conn, service_id, resource_ids)
    return True


async def set_service_active(conn: asyncpg.Connection, service_id: UUID, active: bool) -> bool:
    """Hide a service from the booking page, or show it again. Bookings already made on it
    stay where they are."""
    updated = await conn.execute(
        "update services set active = $2 where id = $1", service_id, active
    )
    return updated == "UPDATE 1"


def _periods(rows) -> list[dict]:
    return [
        {"weekday": r["weekday"], "opens": r["opens"].strftime("%H:%M"),
         "closes": r["closes"].strftime("%H:%M")}
        for r in rows
    ]


async def hours(conn: asyncpg.Connection) -> list[dict]:
    return _periods(await conn.fetch(
        "select weekday, opens, closes from business_hours order by weekday, opens"
    ))


async def _write_periods(
    conn: asyncpg.Connection, table: str, periods: list[tuple[int, str, str]],
    resource_id: UUID | None = None,
) -> None:
    for weekday, opens, closes in periods:
        try:
            if resource_id is None:
                await conn.execute(
                    f"insert into {table} (weekday, opens, closes) "
                    "values ($1, $2::text::time, $3::text::time)",
                    weekday, opens, closes,
                )
            else:
                await conn.execute(
                    f"insert into {table} (resource_id, weekday, opens, closes) "
                    "values ($4, $1, $2::text::time, $3::text::time)",
                    weekday, opens, closes, resource_id,
                )
        except (asyncpg.CheckViolationError, asyncpg.DataError) as error:
            raise BookingError(
                "bad_hours", "Each working period needs a day and a closing time after opening."
            ) from error


def _check_week(periods: list[tuple[int, str, str]]) -> None:
    """A week the engine can use: each period closes after it opens, and two periods of one
    day do not overlap (a midday break is two periods with a gap between them). Times are
    "HH:MM", so they sort as text."""
    by_day: dict[int, list[tuple[str, str]]] = {}
    for weekday, opens, closes in periods:
        if closes <= opens:
            raise BookingError(
                "bad_hours", "Each working period needs a day and a closing time after opening."
            )
        by_day.setdefault(weekday, []).append((opens, closes))
    for spans in by_day.values():
        spans.sort()
        for (_, closes), (opens, _) in zip(spans, spans[1:], strict=False):
            if opens < closes:
                raise BookingError(
                    "bad_hours_overlap", "Two periods on one day cannot overlap."
                )


async def set_hours(conn: asyncpg.Connection, periods: list[tuple[int, str, str]]) -> None:
    """Replace the whole week's opening hours. Each period is (weekday, opens, closes)."""
    _check_week(periods)
    await conn.execute("delete from business_hours")
    await _write_periods(conn, "business_hours", periods)


async def set_resource_hours(
    conn: asyncpg.Connection, resource_id: UUID, periods: list[tuple[int, str, str]]
) -> bool:
    """Replace one resource's own week. An empty week means it works the shop's hours."""
    if not await conn.fetchval(
        "select exists (select 1 from booking_resources where id = $1)", resource_id
    ):
        return False
    _check_week(periods)
    await conn.execute("delete from resource_hours where resource_id = $1", resource_id)
    await _write_periods(conn, "resource_hours", periods, resource_id)
    return True


# ------------------------------------------------------------------------ days off

MAX_CLOSURES = 200
MAX_CLOSURE_DAYS = 366


async def shop_today(conn: asyncpg.Connection) -> date:
    """Today on the shop's own calendar."""
    return await conn.fetchval(f"select (now() at time zone {_TZ})::date")


def _closure(row) -> dict:
    return {
        "id": str(row["id"]), "first": row["first_day"].isoformat(),
        "last": row["last_day"].isoformat(), "reason": row["reason"],
        "reason_ar": row["reason_ar"],
        "resource": {
            "id": str(row["resource_id"]), "name": row["resource_name"],
            "name_ar": row["resource_name_ar"],
        } if row["resource_id"] else None,
        # Bookings still booked inside it: a closure never cancels one, the shop moves them.
        "standing": row["standing"],
    }


_CLOSURE_ROWS = f"""
    select c.id, c.resource_id, c.first_day, c.last_day, c.reason, c.reason_ar,
           r.name as resource_name, r.name_ar as resource_name_ar,
           (select count(*)::int from bookings b where b.status = 'booked'
              and (b.starts_at at time zone {_TZ})::date between c.first_day and c.last_day
              and (c.resource_id is null or b.resource_id = c.resource_id)) as standing
    from booking_closures c left join booking_resources r on r.id = c.resource_id
"""


async def list_closures(conn: asyncpg.Connection) -> list[dict]:
    """The days off that are not over yet, soonest first: the whole shop's (a holiday) and one
    person's or chair's (their leave)."""
    rows = await conn.fetch(
        _CLOSURE_ROWS + "where c.last_day >= $1 order by c.first_day, c.created_at",
        await shop_today(conn),
    )
    return [_closure(r) for r in rows]


async def add_closure(
    conn: asyncpg.Connection, first: date, last: date, resource_id: UUID | None,
    reason: str, reason_ar: str,
) -> dict:
    """Close the shop, or one person or chair, from `first` to `last` (shop calendar days,
    both included). Bookings already inside stay booked; the answer counts them."""
    if last < first or (last - first).days >= MAX_CLOSURE_DAYS:
        raise BookingError(
            "bad_closure", "Choose a first day, and a last day that is the same or later "
            "and within a year."
        )
    today = await shop_today(conn)
    if last < today:
        raise BookingError("closure_past", "That time has already passed.")
    if resource_id is not None and not await conn.fetchval(
        "select exists (select 1 from booking_resources where id = $1)", resource_id
    ):
        raise BookingError("unknown_resource", "That person or chair is not available.")
    if await conn.fetchval(
        "select count(*) from booking_closures where last_day >= $1", today
    ) >= MAX_CLOSURES:
        raise BookingError("too_many_closures", f"A shop can list up to {MAX_CLOSURES} days off.")
    closure_id = await conn.fetchval(
        "insert into booking_closures (resource_id, first_day, last_day, reason, reason_ar) "
        "values ($1, $2, $3, $4, $5) returning id",
        resource_id, first, last, reason.strip(), reason_ar.strip(),
    )
    return _closure(await conn.fetchrow(_CLOSURE_ROWS + "where c.id = $1", closure_id))


async def remove_closure(conn: asyncpg.Connection, closure_id: UUID) -> bool:
    return await conn.execute(
        "delete from booking_closures where id = $1", closure_id
    ) == "DELETE 1"


async def shop_closed_on(conn: asyncpg.Connection, day: date) -> dict | None:
    """Why the whole shop is closed on this day, if it is: {reason, reason_ar}."""
    row = await conn.fetchrow(
        "select reason, reason_ar from booking_closures where resource_id is null "
        "and $1::date between first_day and last_day order by created_at limit 1", day,
    )
    return {"reason": row["reason"], "reason_ar": row["reason_ar"]} if row else None


def _eligible(service: str, wanted: str) -> str:
    """SQL for the resources that may do one service, or only the one asked for. A service
    with no row in service_resources is done by every active resource. `service` and
    `wanted` are the numbers of the query parameters that hold them."""
    return f"""
        select r.id, r.sort, r.created_at from booking_resources r
        where r.active
          and ({wanted}::uuid is null or r.id = {wanted}::uuid)
          and (not exists (select 1 from service_resources sr where sr.service_id = {service})
               or exists (select 1 from service_resources sr
                          where sr.service_id = {service} and sr.resource_id = r.id))
    """


def _shut(day: str, rid: str) -> str:
    """SQL for "the shop is closed that day, or this resource is off": a day in `booking_closures`
    for the whole shop or for the resource (D-141). `day` is a query parameter, or an expression
    that gives the shop's calendar day."""
    return f"""exists (select 1 from booking_closures c
                where {day}::date between c.first_day and c.last_day
                  and (c.resource_id is null or c.resource_id = {rid}))"""


def _working(day: str) -> str:
    """SQL for when each eligible resource works on the shop's calendar day `day` (a query
    parameter number): its own hours if it has any, else the shop's opening hours; nothing on
    a day the shop or the resource is closed (D-141). Needs a CTE called `eligible` before it."""
    dow = f"extract(dow from {day}::date)::int"
    return f"""
        select e.id as rid, ({day}::date + rh.opens) at time zone {_TZ} as opens_at,
               ({day}::date + rh.closes) at time zone {_TZ} as closes_at
        from eligible e join resource_hours rh on rh.resource_id = e.id and rh.weekday = {dow}
        where not {_shut(day, "e.id")}
        union all
        select e.id, ({day}::date + h.opens) at time zone {_TZ},
               ({day}::date + h.closes) at time zone {_TZ}
        from eligible e join business_hours h on h.weekday = {dow}
        where not exists (select 1 from resource_hours rh where rh.resource_id = e.id)
          and not {_shut(day, "e.id")}
    """


async def has_resources(conn: asyncpg.Connection) -> bool:
    """Whether this shop lists resources at all. If not, it has one lane, as it always had."""
    return bool(await conn.fetchval("select exists (select 1 from booking_resources)"))


async def free_times(
    conn: asyncpg.Connection, service_id: UUID, day: date, resource_id: UUID | None = None,
    ignore_booking: UUID | None = None,
) -> list[datetime]:
    """Start times on `day` (the shop's calendar day) when this service can be booked: a
    resource that does it is working then and free, or `resource_id` is, when one is asked
    for. Each resource's times start from its own opening on the shop's 30-minute step.
    `ignore_booking` leaves one booking out, so a booking being moved does not block itself."""
    minutes = await conn.fetchval(
        "select duration_minutes from services where id = $1 and active", service_id
    )
    if minutes is None:
        raise BookingError("unknown_service", "That service is not available.")
    if not await has_resources(conn):
        if resource_id is not None:
            return []  # a shop with no resources has nothing to ask for
        rows = await conn.fetch(
            f"""
            select s as starts_at
            from business_hours h,
                 generate_series(
                     ($1::date + h.opens) at time zone {_TZ},
                     (($1::date + h.closes) at time zone {_TZ}) - make_interval(mins => $2),
                     make_interval(mins => $3)) s
            where h.weekday = extract(dow from $1::date)::int
              and not exists (select 1 from booking_closures c where c.resource_id is null
                              and $1::date between c.first_day and c.last_day)
              and s > now() + make_interval(mins => $4)
              and s < now() + make_interval(days => $5)
              and not exists (
                  select 1 from bookings b where b.status = 'booked'
                    and b.id is distinct from $6::uuid
                    and tstzrange(b.starts_at, b.ends_at)
                        && tstzrange(s, s + make_interval(mins => $2)))
            order by s
            """,
            day, minutes, SLOT_STEP_MINUTES, LEAD_MINUTES, MAX_DAYS_AHEAD, ignore_booking,
        )
        return [r["starts_at"] for r in rows]
    rows = await conn.fetch(
        f"""
        with eligible as ({_eligible("$6", "$7")}), working as ({_working("$1")})
        select distinct s as starts_at
        from working w,
             generate_series(w.opens_at, w.closes_at - make_interval(mins => $2),
                             make_interval(mins => $3)) s
        where s > now() + make_interval(mins => $4)
          and s < now() + make_interval(days => $5)
          and not exists (
              select 1 from bookings b where b.status = 'booked' and b.resource_id = w.rid
                and b.id is distinct from $8::uuid
                and tstzrange(b.starts_at, b.ends_at)
                    && tstzrange(s, s + make_interval(mins => $2)))
        order by 1
        """,
        day, minutes, SLOT_STEP_MINUTES, LEAD_MINUTES, MAX_DAYS_AHEAD, service_id, resource_id,
        ignore_booking,
    )
    return [r["starts_at"] for r in rows]


async def _pick_resource(
    conn: asyncpg.Connection, service_id: UUID, starts_at: datetime, ends_at: datetime,
    wanted: UUID | None = None, prefer: UUID | None = None, staff: bool = False,
) -> UUID | None:
    """The resource a booking takes: the one asked for, else the one it already had (a move
    keeps the same chair if it is free), else the first free one in the shop's order. A
    customer's booking takes only a resource working at that time; staff may place one
    outside its hours (a walk-in before opening). None for a shop with no resources. Called
    under the shop's lock, so the answer holds."""
    if not await has_resources(conn):
        return None
    found = await conn.fetchval(
        f"""
        with eligible as ({_eligible("$3", "$4")}),
             working as ({_working("($1::timestamptz at time zone " + _TZ + ")::date")})
        select e.id from eligible e
        where ($6 or exists (select 1 from working w where w.rid = e.id
                             and w.opens_at <= $1 and w.closes_at >= $2))
          and not exists (
            select 1 from bookings b where b.status = 'booked' and b.resource_id = e.id
              and tstzrange(b.starts_at, b.ends_at) && tstzrange($1, $2))
        order by (e.id = $5::uuid) desc nulls last, e.sort, e.created_at
        limit 1
        """,
        starts_at, ends_at, service_id, wanted, prefer, staff,
    )
    if found is None:
        raise BookingError("not_free", "That time is no longer free. Please pick another.")
    return found


# ----------------------------------------------------------------------- resources

async def list_resources(conn: asyncpg.Connection, only_active: bool = False) -> list[dict]:
    """The shop's resources in their order, each with the services narrowed to it (an empty
    list means it does every service) and its own week (empty: the shop's hours)."""
    rows = await conn.fetch(
        "select id, name, name_ar, active, kind from booking_resources "
        "where active or not $1 order by sort, created_at",
        only_active,
    )
    by_resource: dict[UUID, list[str]] = {}
    for link in await conn.fetch("select resource_id, service_id from service_resources"):
        by_resource.setdefault(link["resource_id"], []).append(str(link["service_id"]))
    week: dict[UUID, list] = {}
    for period in await conn.fetch(
        "select resource_id, weekday, opens, closes from resource_hours order by weekday, opens"
    ):
        week.setdefault(period["resource_id"], []).append(period)
    return [
        {
            "id": str(r["id"]), "name": r["name"], "name_ar": r["name_ar"],
            "active": r["active"], "kind": r["kind"],
            "services": by_resource.get(r["id"], []), "hours": _periods(week.get(r["id"], [])),
        }
        for r in rows
    ]


async def add_resource(
    conn: asyncpg.Connection, name: str, name_ar: str = "", kind: str = "person"
) -> str:
    """Add a resource. The first one a shop adds takes over the bookings still to come, so
    they keep blocking it (until now they were all in the shop's one lane)."""
    first = not await has_resources(conn)
    resource_id = await conn.fetchval(
        "insert into booking_resources (name, name_ar, kind, sort) "
        "values ($1, $2, $3, (select coalesce(max(sort), 0) + 1 from booking_resources)) "
        "returning id",
        name.strip(), name_ar.strip(), kind,
    )
    if first:
        await conn.execute(
            "update bookings set resource_id = $1 "
            "where resource_id is null and status = 'booked' and ends_at > now()",
            resource_id,
        )
    return str(resource_id)


async def update_resource(
    conn: asyncpg.Connection, resource_id: UUID, name: str | None, name_ar: str | None,
    kind: str | None = None,
) -> bool:
    updated = await conn.execute(
        "update booking_resources set name = coalesce(nullif(btrim($2), ''), name), "
        "name_ar = coalesce($3, name_ar), kind = coalesce($4, kind) where id = $1",
        resource_id, name, name_ar.strip() if name_ar is not None else None, kind,
    )
    return updated == "UPDATE 1"


async def set_resource_active(conn: asyncpg.Connection, resource_id: UUID, active: bool) -> bool:
    """Switch a resource off (it takes no new bookings; the ones it has stay) or on. A shop
    must keep one active, or nobody could book it."""
    if not active:
        others = await conn.fetchval(
            "select count(*) from booking_resources where active and id <> $1", resource_id
        )
        if not others:
            raise BookingError(
                "last_resource", "Keep at least one resource active, or customers cannot book."
            )
    updated = await conn.execute(
        "update booking_resources set active = $2 where id = $1", resource_id, active
    )
    return updated == "UPDATE 1"


async def set_service_resources(
    conn: asyncpg.Connection, service_id: UUID, resource_ids: list[UUID]
) -> bool:
    """Say which resources do this service. An empty list means all of them."""
    if not await conn.fetchval("select exists (select 1 from services where id = $1)", service_id):
        return False
    wanted = list(dict.fromkeys(resource_ids))
    if wanted:
        active = await conn.fetchval(
            "select count(*) from booking_resources where active and id = any($1::uuid[])",
            wanted,
        )
        if active != len(wanted):
            raise BookingError(
                "unknown_resource", "Choose resources of this shop that are switched on."
            )
    await conn.execute("delete from service_resources where service_id = $1", service_id)
    for resource_id in wanted:
        await conn.execute(
            "insert into service_resources (service_id, resource_id) values ($1, $2)",
            service_id, resource_id,
        )
    return True


async def doers(conn: asyncpg.Connection) -> dict[str, list[str]]:
    """For each service, the active people or chairs that do it, in the shop's order: all of
    them for a service nobody was chosen for, else the ones chosen. The booking page offers
    exactly these (a chair with nothing chosen for it does every service only while no service
    is narrowed, so the page cannot guess it from the chair's own list)."""
    out: dict[str, list[str]] = {}
    for row in await conn.fetch(
        "select s.id as service_id, r.id as resource_id from services s "
        "join booking_resources r on r.active "
        "where not exists (select 1 from service_resources sr where sr.service_id = s.id) "
        "   or exists (select 1 from service_resources sr "
        "              where sr.service_id = s.id and sr.resource_id = r.id) "
        "order by r.sort, r.created_at"
    ):
        out.setdefault(str(row["service_id"]), []).append(str(row["resource_id"]))
    return out


async def resource(conn: asyncpg.Connection, resource_id: UUID | None) -> dict | None:
    """One resource as messages name it: {name, name_ar, kind}, or None."""
    if resource_id is None:
        return None
    row = await conn.fetchrow(
        "select name, name_ar, kind from booking_resources where id = $1", resource_id
    )
    return dict(row) if row else None


# ----------------------------------------------------------------------- wording

async def when_text(conn: asyncpg.Connection, starts_at: datetime, arabic: bool) -> str:
    """The time as the shop's customers read it, in the shop's time zone."""
    pattern = "DD/MM HH24:MI" if arabic else "FMDy FMDD Mon, FMHH12:MI AM"
    return await conn.fetchval(
        f"select to_char($1::timestamptz at time zone {_TZ}, $2)", starts_at, pattern
    )


_when_text = when_text  # the older name, still used by the chat


async def shop_name(conn: asyncpg.Connection, arabic: bool) -> str:
    shop = await conn.fetchrow(f"select name, name_ar from tenants where id = {_TENANT}")
    return shop["name_ar"] if arabic and shop["name_ar"] else shop["name"]


_shop_name = shop_name


async def service_words(conn: asyncpg.Connection, booking_id: UUID, arabic: bool) -> str:
    """The service and who does it, as one phrase: "Blow-dry with Reem"."""
    row = await conn.fetchrow(
        "select b.service_name, s.name_ar, b.resource_id from bookings b "
        "left join services s on s.id = b.service_id where b.id = $1",
        booking_id,
    )
    name = row["name_ar"] if arabic and row["name_ar"] else row["service_name"]
    return name + words.with_whom(await resource(conn, row["resource_id"]), arabic)


async def schedule_reminder(conn: asyncpg.Connection, booking_id: UUID, starts_at: datetime):
    if not await conn.fetchval(f"select booking_reminders from tenants where id = {_TENANT}"):
        return  # the business switched reminders off during onboarding or later
    run_at = starts_at - REMIND_BEFORE
    if await conn.fetchval("select $1::timestamptz > now()", run_at):
        await jobs.enqueue(
            conn, REMINDER,
            {"booking_id": str(booking_id), "starts_at": starts_at.isoformat()}, run_at,
        )


_schedule_reminder = schedule_reminder


async def lock(conn: asyncpg.Connection, tenant_id: UUID) -> None:
    """One booking at a time per shop decides who gets a time. Held until the transaction
    ends, so the free resource found next is still free when the booking is written."""
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"bookings:{tenant_id}")


_lock = lock


async def _place(
    conn: asyncpg.Connection, service_id: UUID, starts_at: datetime,
    wanted: UUID | None = None, prefer: UUID | None = None, staff: bool = False,
) -> tuple[asyncpg.Record, UUID | None]:
    """Check that this service can start at this time, and which resource takes it. Returns
    the service and the resource (None for a shop with no resources).

    A customer may take only a time on the page's list (the shop's step, working hours, not
    in the next half hour). Staff may place a booking at any minute from a few hours ago to
    the furthest bookable day: a walk-in comes at 4:10. Neither may take a taken resource."""
    service = await conn.fetchrow(
        f"select {_SERVICE_COLUMNS}, sort from services where id = $1 and active",
        service_id,
    )
    if service is None:
        raise BookingError("unknown_service", "That service is not available.")
    if wanted is not None and not await conn.fetchval(
        "select exists (select 1 from booking_resources where id = $1 and active)", wanted
    ):
        raise BookingError("unknown_resource", "That resource is not available.")
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    if staff:
        too_early, too_late = await conn.fetchrow(
            "select $1::timestamptz < now() - $2::interval, "
            "$1::timestamptz > now() + make_interval(days => $3)",
            starts_at, STAFF_LOOK_BACK, MAX_DAYS_AHEAD,
        )
        if too_early or too_late:
            raise BookingError("bad_time", "Choose a time from today up to 60 days ahead.")
        if not await has_resources(conn) and await conn.fetchval(
            "select exists (select 1 from bookings where status = 'booked' "
            "and tstzrange(starts_at, ends_at) && tstzrange($1, $2))",
            starts_at, ends_at,
        ):
            raise BookingError("not_free", "Someone is already booked at that time.")
    else:
        day = await conn.fetchval(f"select ($1::timestamptz at time zone {_TZ})::date", starts_at)
        if starts_at not in await free_times(conn, service_id, day, wanted):
            raise BookingError("not_free", "That time is no longer free. Please pick another.")
    chosen = await _pick_resource(conn, service_id, starts_at, ends_at, wanted, prefer, staff)
    return service, chosen


async def _insert(
    conn: asyncpg.Connection, contact: asyncpg.Record, service: asyncpg.Record,
    starts_at: datetime, note: str, resource_id: UUID | None, walk_in: bool = False,
    deposit: int = 0, terms: dict | None = None, hold_until: datetime | None = None,
) -> tuple[UUID, int]:
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    number = await conn.fetchval("select coalesce(max(number), 100) + 1 from bookings")
    try:
        async with conn.transaction():
            # Whoever is looking after this customer's chat looks after the visit too.
            booking_id = await conn.fetchval(
                "insert into bookings (number, contact_id, service_id, service_name, "
                "    starts_at, ends_at, note, assigned_to, resource_id, walk_in, deposit, "
                "    deposit_state, deposit_terms, hold_until) "
                "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) "
                "returning id",
                number, contact["id"], service["id"], service["name"], starts_at, ends_at,
                note.strip()[:500], contact["assigned_to"], resource_id, walk_in, deposit,
                "due" if deposit else "none", terms or {}, hold_until,
            )
    except asyncpg.ExclusionViolationError as error:
        raise BookingError(
            "not_free", "That time was just taken. Please pick another."
        ) from error
    return booking_id, number


async def _customer(conn: asyncpg.Connection, contact_id: UUID) -> asyncpg.Record:
    contact = await conn.fetchrow(
        "select id, lang, assigned_to, name from contacts where id = $1 and role = 'customer'",
        contact_id,
    )
    if contact is None:
        raise BookingError("unknown_customer", "Open the booking link from your chat again.")
    return contact


async def _told(conn: asyncpg.Connection, contact_id: UUID, result) -> dict:
    """What staff need to know about a message to a customer: whether the outbound layer took it,
    and when it did not (the customer said stop, never agreed to messages, ALYR's sending for the
    shop is paused), why and where to reach them, so staff tell them themselves."""
    sent = result.blocked is None
    return {
        "sent": sent, "reason": result.blocked,
        "phone": None if sent else await conn.fetchval(
            "select phone from contacts where id = $1", contact_id
        ),
    }


async def _confirm(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, number: int,
    contact: asyncpg.Record, starts_at: datetime,
) -> tuple[str, dict]:
    """Tell the customer the booking is confirmed and queue the reminder. Returns the time
    as the customer reads it, and whether the customer was told (`_told`)."""
    arabic = contact["lang"] == "ar"
    when = await when_text(conn, starts_at, arabic)
    shop = await shop_name(conn, arabic)
    what = await service_words(conn, booking_id, arabic)
    body = (
        f"تم تأكيد حجزك رقم {number} لدى {shop}: {what}، {when}. "
        "للإلغاء أرسل «حجزي»." if arabic
        else f"Booking {number} confirmed at {shop}: {what}, {when}. "
             "To cancel, send \"my booking\"."
    )
    sent = await outbound.send(conn, templates.notice(
        contact["id"], "booking_confirmed", contact["lang"], body, number, shop, what, when,
    ))
    await schedule_reminder(conn, booking_id, starts_at)
    return when, await _told(conn, contact["id"], sent)


async def create_booking(
    conn: asyncpg.Connection, tenant_id: UUID, outbound: Outbound, contact_id: UUID,
    service_id: UUID, starts_at: datetime, note: str = "", resource_id: UUID | None = None,
    web_url: str = "",
) -> dict:
    """A customer books from their link. A service that asks a deposit holds the time until
    the deposit is paid by link (`deposits.py`); otherwise the booking is confirmed now."""
    from alyr.modules.bookings import deposits

    contact = await _customer(conn, contact_id)
    await lock(conn, tenant_id)
    service, chosen = await _place(conn, service_id, starts_at, resource_id)
    amount = deposit_amount(service["deposit_kind"], service["deposit_value"], service["price"])
    terms = await deposits.shop_terms(conn) if amount else None
    hold_until = await deposits.hold_end(conn) if amount else None
    booking_id, number = await _insert(
        conn, contact, service, starts_at, note, chosen, deposit=amount, terms=terms,
        hold_until=hold_until,
    )
    named = await resource(conn, chosen)
    await team.record(
        conn, "booking", booking_id, "booked", team.CUSTOMER, contact_id,
        {"number": number, "service": service["name"], "starts_at": starts_at.isoformat(),
         "resource": named["name"] if named else None,
         "deposit": fmt_qar(amount) if amount else None},
    )
    out = {"id": str(booking_id), "number": number, "starts_at": starts_at.isoformat(),
           "service": service["name"], "resource": named["name"] if named else None,
           "resource_ar": (named["name_ar"] or named["name"]) if named else None,
           "deposit": None}
    if amount:
        out["deposit"] = await deposits.ask(
            conn, tenant_id, outbound, booking_id, number, contact, starts_at, amount, terms,
            hold_until, web_url,
        )
        out["when_text"] = await when_text(conn, starts_at, contact["lang"] == "ar")
    else:
        out["when_text"], _ = await _confirm(conn, outbound, booking_id, number, contact, starts_at)
    return out


async def staff_booking(
    conn: asyncpg.Connection, tenant_id: UUID, outbound: Outbound, actor: Actor,
    contact_id: UUID, service_id: UUID, starts_at: datetime, resource_id: UUID | None = None,
    note: str = "", walk_in: bool = False,
) -> dict:
    """Staff write a booking down: a walk-in standing at the counter, or a booking taken by
    phone. Any minute, never a taken resource, no deposit. A walk-in is not messaged; a
    booking by phone gets the confirmation and the reminder, like one from the page."""
    contact = await conn.fetchrow(
        "select id, lang, assigned_to, name from contacts where id = $1 and role = 'customer'",
        contact_id,
    )
    if contact is None:
        raise BookingError("unknown_customer", "Choose a customer of this shop.")
    await lock(conn, tenant_id)
    service, chosen = await _place(conn, service_id, starts_at, resource_id, staff=True)
    booking_id, number = await _insert(conn, contact, service, starts_at, note, chosen, walk_in)
    named = await resource(conn, chosen)
    await team.claim(conn, "booking", booking_id, actor)
    await team.record(
        conn, "booking", booking_id, "booked", actor, contact_id,
        {"number": number, "service": service["name"], "starts_at": starts_at.isoformat(),
         "resource": named["name"] if named else None, "by_staff": True,
         "walk_in": walk_in or None},
    )
    told = None
    if walk_in:
        when = await when_text(conn, starts_at, contact["lang"] == "ar")
    else:
        when, told = await _confirm(conn, outbound, booking_id, number, contact, starts_at)
    return {"id": str(booking_id), "number": number, "when_text": when,
            "starts_at": starts_at.isoformat(), "service": service["name"],
            "resource": named["name"] if named else None, "walk_in": walk_in,
            # None for a walk-in: the customer is standing there and nothing was sent.
            "told": told}


async def walk_in_customer(
    conn: asyncpg.Connection, name: str, phone: str, lang: str = "en"
) -> UUID:
    """The customer a staff member types in: the one with that phone number if the shop has
    them, else a new record. Every customer record can be reached (`contacts_reachable`), so
    a phone number is needed; Qatar's eight digits get 974. A new record has not agreed to
    messages, so nothing ALYR starts is sent to it until the customer writes."""
    digits = "".join(ch for ch in phone if ch.isdigit()).removeprefix("00")
    if len(digits) == 8 and digits[0] in "34567":
        digits = "974" + digits
    if not 8 <= len(digits) <= 15:
        raise BookingError("bad_phone", "Write the customer's phone number.")
    found = await conn.fetchval(
        "select id from contacts where phone = $1 and role = 'customer'", digits
    )
    if found:
        return found
    return await conn.fetchval(
        "insert into contacts (phone, name, lang) values ($1, $2, $3) returning id",
        digits, name.strip()[:120], "ar" if lang == "ar" else "en",
    )


async def find_customers(conn: asyncpg.Connection, query: str, limit: int = 6) -> list[dict]:
    """Customers of the shop whose name or phone number holds what was typed, for the desk to
    choose one instead of typing them again. Two characters at least; the owner's own test
    customers are left out."""
    text = query.strip()
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(text) < 2:
        return []
    rows = await conn.fetch(
        "select id, name, phone, lang, consent_service from contacts "
        "where role = 'customer' and (wa_user_id is null or wa_user_id not like 'TEST.%') "
        "  and (name ilike '%' || $1 || '%' or (length($2) >= 3 and phone like '%' || $2 || '%')) "
        "order by (name ilike $1 || '%') desc, name limit $3",
        text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"), digits, limit,
    )
    return [
        {"id": str(r["id"]), "name": r["name"], "phone": r["phone"], "lang": r["lang"],
         "consent": r["consent_service"]}
        for r in rows
    ]


async def cancel(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, notify: bool = True,
    actor: Actor = team.CUSTOMER, refund: bool | None = None,
) -> bool:
    """Cancel a booking that has not been finished; False if there was none to cancel."""
    return await cancel_booking(conn, outbound, booking_id, notify, actor, refund) is not None


async def cancel_booking(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, notify: bool = True,
    actor: Actor = team.CUSTOMER, refund: bool | None = None,
) -> dict | None:
    """Cancel a booking that has not been finished. The time becomes free again. A deposit
    still waiting is no longer asked; a paid one is kept or refunded by the rule the booking
    was made under (`deposits.on_cancel`), unless staff say to refund it. Returns what became of
    the deposit and whether the customer was told, or None if there was no such booking."""
    from alyr.modules.bookings import deposits

    # The pay link first, in the order a payment arriving takes its locks.
    await deposits.expire_link(conn, booking_id)
    row = await conn.fetchrow(
        "select number, contact_id, starts_at, deposit, deposit_state, deposit_terms "
        "from bookings where id = $1 and status = 'booked' for update",
        booking_id,
    )
    if row is None:
        return None
    state = deposits.on_cancel(row, refund)
    await conn.execute(
        "update bookings set status = 'cancelled', deposit_state = $2, hold_until = null "
        "where id = $1",
        booking_id, state,
    )
    await team.record(
        conn, "booking", booking_id, "cancelled", actor, row["contact_id"],
        {"number": row["number"],
         "deposit": state if row["deposit"] else None,
         "amount": fmt_qar(row["deposit"]) if row["deposit"] else None},
    )
    told = None
    if notify:
        arabic = await conn.fetchval(
            "select lang = 'ar' from contacts where id = $1", row["contact_id"]
        )
        lang = "ar" if arabic else "en"
        when = await when_text(conn, row["starts_at"], arabic)
        outcome = words.deposit_outcome(state, row["deposit"], arabic)
        if outcome:
            body = (
                f"تم إلغاء حجزك رقم {row['number']} ({when}). {outcome}" if arabic
                else f"Booking {row['number']} ({when}) has been cancelled. {outcome}"
            )
            sent = await outbound.send(conn, templates.notice(
                row["contact_id"], "booking_cancelled_deposit", lang, body,
                row["number"], when, outcome,
            ))
        else:
            body = (
                f"تم إلغاء حجزك رقم {row['number']} ({when})." if arabic
                else f"Booking {row['number']} ({when}) has been cancelled."
            )
            sent = await outbound.send(conn, templates.notice(
                row["contact_id"], "booking_cancelled", lang, body, row["number"], when,
            ))
        told = await _told(conn, row["contact_id"], sent)
    return {"deposit_state": state, "told": told}


async def reschedule(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, starts_at: datetime,
    actor: Actor = team.CUSTOMER, resource_id: UUID | None = None, staff: bool = True,
) -> dict:
    """Move a booking to another time, another resource, or both. Staff may move it to any
    minute; the resource must be free. A move keeps the same resource when it is free then,
    and takes another when it is not, unless one is asked for."""
    await lock(conn, await conn.fetchval(f"select {_TENANT}"))
    current = await conn.fetchrow(
        "select number, contact_id, service_id, starts_at, ends_at, resource_id from bookings "
        "where id = $1 and status = 'booked' for update",
        booking_id,
    )
    if current is None:
        raise LookupError("no such booking")
    # Free the old time first so the booking does not block itself, then check the new.
    await conn.execute("update bookings set status = 'cancelled' where id = $1", booking_id)
    service, chosen = await _place(
        conn, current["service_id"], starts_at, wanted=resource_id,
        prefer=current["resource_id"], staff=staff,
    )
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    await conn.execute(
        "update bookings set status = 'booked', starts_at = $2, ends_at = $3, "
        "resource_id = $4, reminded_at = null where id = $1",
        booking_id, starts_at, ends_at, chosen,
    )
    named = await resource(conn, chosen)
    was = await resource(conn, current["resource_id"])
    await team.claim(conn, "booking", booking_id, actor)
    await team.record(
        conn, "booking", booking_id, "moved", actor, current["contact_id"],
        {"number": current["number"], "starts_at": starts_at.isoformat(),
         "from": current["starts_at"].isoformat(),
         "resource": named["name"] if named else None,
         "from_resource": was["name"] if was and chosen != current["resource_id"] else None},
    )
    arabic = await conn.fetchval(
        "select lang = 'ar' from contacts where id = $1", current["contact_id"]
    )
    when = await when_text(conn, starts_at, arabic)
    # The resource rides in the time's blank, so the approved template does not change.
    when_with = when + words.with_whom(named, arabic)
    body = (
        f"تم تغيير موعد حجزك رقم {current['number']} إلى {when_with}." if arabic
        else f"Booking {current['number']} has been moved to {when_with}."
    )
    sent = await outbound.send(conn, templates.notice(
        current["contact_id"], "booking_moved", "ar" if arabic else "en", body,
        current["number"], when_with,
    ))
    if await conn.fetchval(
        "select deposit_state in ('none', 'paid') from bookings where id = $1", booking_id
    ):
        await schedule_reminder(conn, booking_id, starts_at)
    return {"id": str(booking_id), "when_text": when, "starts_at": starts_at.isoformat(),
            "resource": named["name"] if named else None,
            "told": await _told(conn, current["contact_id"], sent)}


async def set_outcome(
    conn: asyncpg.Connection, booking_id: UUID, status: str, actor: Actor = team.ASSISTANT,
    outbound: Outbound | None = None,
) -> bool:
    """Mark what happened: the customer came, or did not. Whoever marks a visit nobody
    had becomes responsible for it. A paid deposit is kept or refunded on a no-show by the
    booking's rule, and counts against the bill when the customer came. A customer who came
    is asked for a review, if the shop has that on (`modules/reviews.py`)."""
    from alyr.modules import reviews
    from alyr.modules.bookings import deposits

    if status not in ("completed", "no_show"):
        raise BookingError("bad_status", "Status must be completed or no_show.")
    await deposits.expire_link(conn, booking_id)
    row = await conn.fetchrow(
        "select number, contact_id, deposit, deposit_state, deposit_terms from bookings "
        "where id = $1 and status = 'booked' for update",
        booking_id,
    )
    if row is None:
        return False
    state = deposits.on_outcome(row, status)
    await conn.execute(
        "update bookings set status = $2, deposit_state = $3, hold_until = null where id = $1",
        booking_id, status, state,
    )
    await team.claim(conn, "booking", booking_id, actor)
    await team.record(
        conn, "booking", booking_id, status, actor, row["contact_id"],
        {"number": row["number"], "deposit": state if row["deposit"] else None,
         "amount": fmt_qar(row["deposit"]) if row["deposit"] else None},
    )
    if status == "completed" and outbound is not None:
        await reviews.after_visit(conn, outbound, "booking", booking_id, row["contact_id"])
    return True


async def list_bookings(
    conn: asyncpg.Connection, first: date, last: date, contact_id: UUID | None = None
) -> list[dict]:
    rows = await conn.fetch(
        f"""
        select b.id, b.number, b.service_id, b.service_name, b.starts_at, b.ends_at, b.status,
               b.note, b.walk_in, b.deposit, b.deposit_state, b.hold_until,
               b.price, s.name_ar as service_name_ar,
               c.id as contact_id, c.name as customer, c.phone, c.consent_service as consent,
               b.assigned_to, u.name as assignee,
               b.resource_id, res.name as resource_name, res.name_ar as resource_name_ar,
               res.kind as resource_kind,
               to_char(b.starts_at at time zone {_TZ}, 'FMDy FMDD Mon, FMHH12:MI AM') as when_text,
               to_char(b.starts_at at time zone {_TZ}, 'HH24:MI') as starts_local,
               to_char(b.ends_at at time zone {_TZ}, 'HH24:MI') as ends_local,
               (b.starts_at at time zone {_TZ})::date as day
        from bookings b join contacts c on c.id = b.contact_id
        left join services s on s.id = b.service_id
        left join users u on u.id = b.assigned_to
        left join booking_resources res on res.id = b.resource_id
        where (b.starts_at at time zone {_TZ})::date between $1 and $2
          and ($3::uuid is null or b.contact_id = $3)
        order by b.starts_at, res.sort nulls first
        """,
        first, last, contact_id,
    )
    paid_by_hand = {
        r["subject_id"]: r["paid"] for r in await conn.fetch(
            "select subject_id, sum(amount_minor)::bigint as paid from manual_payments "
            "where subject = 'booking' and subject_id = any($1::uuid[]) group by 1",
            [r["id"] for r in rows],
        )
    } if rows else {}
    out = []
    for r in rows:
        deposit_paid = r["deposit"] if r["deposit_state"] in ("paid", "kept") else 0
        paid = deposit_paid + paid_by_hand.get(r["id"], 0)
        out.append({
            "id": str(r["id"]), "number": r["number"], "service": r["service_name"],
            "service_ar": r["service_name_ar"] or "", "service_id": str(r["service_id"]),
            "starts_at": r["starts_at"].isoformat(), "ends_at": r["ends_at"].isoformat(),
            "starts_local": r["starts_local"], "ends_local": r["ends_local"],
            "day": r["day"].isoformat(),
            "when_text": r["when_text"], "status": r["status"], "note": r["note"],
            "customer": r["customer"], "contact_id": str(r["contact_id"]), "phone": r["phone"],
            # Whether ALYR may message this customer (they wrote first, or agreed): a move or a
            # cancel tells them by WhatsApp only when it is "granted".
            "consent": r["consent"],
            "assigned": {"id": str(r["assigned_to"]), "name": r["assignee"]}
            if r["assigned_to"] else None,
            # Which chair, person or room holds it; null for a shop with no resources.
            "resource": {
                "id": str(r["resource_id"]), "name": r["resource_name"],
                "name_ar": r["resource_name_ar"], "kind": r["resource_kind"],
            } if r["resource_id"] else None,
            "walk_in": r["walk_in"],
            # The deposit, where it stands, and what is left of the price after what was paid.
            "deposit": r["deposit"], "deposit_state": r["deposit_state"],
            "hold_until": r["hold_until"].isoformat() if r["hold_until"] else None,
            "price": r["price"] or 0, "paid": paid,
            "left_to_pay": max((r["price"] or 0) - paid, 0),
        })
    return out


async def day_view(conn: asyncpg.Connection, day: date) -> dict:
    """One day by resource, for the workspace: each resource with when it works that day
    (its own hours or the shop's), the shop's hours, and the day's bookings."""
    weekday = await conn.fetchval("select extract(dow from $1::date)::int", day)
    shop_periods = _periods(await conn.fetch(
        "select weekday, opens, closes from business_hours where weekday = $1 order by opens",
        weekday,
    ))
    bookings = await list_bookings(conn, day, day)
    used = {b["resource"]["id"] for b in bookings if b["resource"]}
    resources = [
        r for r in await list_resources(conn)
        if r["active"] or r["id"] in used
    ]
    closed = await shop_closed_on(conn, day)
    leave = {
        str(r["resource_id"]): {"reason": r["reason"], "reason_ar": r["reason_ar"]}
        for r in await conn.fetch(
            "select resource_id, reason, reason_ar from booking_closures "
            "where resource_id is not null and $1::date between first_day and last_day "
            "order by created_at desc", day,
        )
    }
    for r in resources:
        own = [p for p in r["hours"] if p["weekday"] == weekday]
        r["leave"] = leave.get(r["id"])
        shut = closed is not None or r["leave"] is not None
        r["today"] = [] if shut else (own if r["hours"] else shop_periods)
        r["off"] = shut or (bool(r["hours"]) and not own)
    return {"day": day.isoformat(), "weekday": weekday, "hours": shop_periods, "closed": closed,
            "resources": resources, "bookings": bookings}


async def next_booking(conn: asyncpg.Connection, contact_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "select id, number, service_name, starts_at, resource_id from bookings "
        "where contact_id = $1 and status = 'booked' and starts_at > now() "
        "order by starts_at limit 1",
        contact_id,
    )


class Reminders:
    """Job handler: tell the customer their booking is coming up."""

    def __init__(self, db, outbound: Outbound) -> None:
        self._db = db
        self._outbound = outbound

    async def send(self, tenant_id: UUID, payload: dict) -> None:
        async with self._db.tenant(tenant_id) as conn:
            # A booking still waiting for its deposit is not reminded: it is not confirmed.
            row = await conn.fetchrow(
                "update bookings set reminded_at = now() "
                "where id = $1 and status = 'booked' and reminded_at is null "
                "  and deposit_state in ('none', 'paid') "
                "  and starts_at = $2::timestamptz and starts_at > now() "
                "returning number, contact_id, service_name, starts_at, resource_id",
                UUID(payload["booking_id"]), datetime.fromisoformat(payload["starts_at"]),
            )
            if row is None:
                return  # cancelled, moved, already reminded, or already past
            arabic = await conn.fetchval(
                "select lang = 'ar' from contacts where id = $1", row["contact_id"]
            )
            when = await when_text(conn, row["starts_at"], arabic)
            when_with = when + words.with_whom(await resource(conn, row["resource_id"]), arabic)
            shop = await shop_name(conn, arabic)
            body = (
                f"تذكير: حجزك رقم {row['number']} لدى {shop}، {when_with}." if arabic
                else f"Reminder: booking {row['number']} at {shop}, {when_with}."
            )
            await self._outbound.send(conn, templates.notice(
                row["contact_id"], "booking_reminder", "ar" if arabic else "en", body,
                row["number"], shop, when_with,
            ))
