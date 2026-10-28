"""Bookings: services, resources, opening hours, free times, and the bookings themselves.

All time arithmetic is done by PostgreSQL in the shop's own time zone, so "9 am" means
9 am at the shop whatever machine runs this code.

A shop can list its resources (chairs, people, rooms; D-062): one customer at a time per
resource, so two customers can have the same time on two chairs. A shop that lists none is
held to one customer at a time, as before. Which resource a booking takes is decided under
the shop's lock, so two customers cannot be given the same last one.

Every function takes a tenant-scoped connection.
"""

from datetime import date, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.core import jobs, team, templates
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound
from alyr.core.team import Actor

REMINDER = "booking_reminder"
SLOT_STEP_MINUTES = 30
# A customer cannot book something starting in the next few minutes.
LEAD_MINUTES = 30
REMIND_BEFORE = timedelta(hours=2)
MAX_DAYS_AHEAD = 60
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"
_TZ = f"(select timezone from tenants where id = {_TENANT})"


class BookingError(Exception):
    """A booking request that cannot be carried out; `code` is stable, the message is
    safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _service(row) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "name_ar": row["name_ar"],
        "duration_minutes": row["duration_minutes"], "price": row["price"],
        "price_text": fmt_qar(row["price"]) if row["price"] else "",
        "active": row["active"],
    }


async def list_services(conn: asyncpg.Connection, only_active: bool = False) -> list[dict]:
    rows = await conn.fetch(
        "select id, name, name_ar, duration_minutes, price, active from services "
        "where active or not $1 order by sort, created_at",
        only_active,
    )
    return [_service(r) for r in rows]


async def add_service(
    conn: asyncpg.Connection, name: str, name_ar: str, duration_minutes: int, price: int
) -> str:
    service_id = await conn.fetchval(
        "insert into services (name, name_ar, duration_minutes, price, sort) "
        "values ($1, $2, $3, $4, (select coalesce(max(sort), 0) + 1 from services)) returning id",
        name.strip(), name_ar.strip(), duration_minutes, price,
    )
    return str(service_id)


async def update_service(
    conn: asyncpg.Connection, service_id: UUID, name: str | None, name_ar: str | None,
    duration_minutes: int | None, price: int | None,
) -> bool:
    """Change a service's name, length or price. Bookings already made keep the name they
    were made with."""
    updated = await conn.execute(
        "update services set name = coalesce(nullif($2, ''), name), "
        "name_ar = coalesce($3, name_ar), duration_minutes = coalesce($4, duration_minutes), "
        "price = coalesce($5, price) where id = $1",
        service_id, name.strip() if name is not None else None,
        name_ar.strip() if name_ar is not None else None, duration_minutes, price,
    )
    return updated == "UPDATE 1"


async def set_service_active(conn: asyncpg.Connection, service_id: UUID, active: bool) -> bool:
    updated = await conn.execute(
        "update services set active = $2 where id = $1", service_id, active
    )
    return updated == "UPDATE 1"


async def hours(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        "select weekday, opens, closes from business_hours order by weekday, opens"
    )
    return [
        {"weekday": r["weekday"], "opens": r["opens"].strftime("%H:%M"),
         "closes": r["closes"].strftime("%H:%M")}
        for r in rows
    ]


async def set_hours(conn: asyncpg.Connection, periods: list[tuple[int, str, str]]) -> None:
    """Replace the whole week's opening hours. Each period is (weekday, opens, closes)."""
    await conn.execute("delete from business_hours")
    for weekday, opens, closes in periods:
        try:
            await conn.execute(
                "insert into business_hours (weekday, opens, closes) "
                "values ($1, $2::text::time, $3::text::time)",
                weekday, opens, closes,
            )
        except (asyncpg.CheckViolationError, asyncpg.DataError) as error:
            raise BookingError(
                "bad_hours", "Each opening period needs a day and a closing time after opening."
            ) from error


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


async def has_resources(conn: asyncpg.Connection) -> bool:
    """Whether this shop lists resources at all. If not, it has one lane, as it always had."""
    return bool(await conn.fetchval("select exists (select 1 from booking_resources)"))


async def free_times(
    conn: asyncpg.Connection, service_id: UUID, day: date, resource_id: UUID | None = None
) -> list[datetime]:
    """Start times on `day` (the shop's calendar day) when this service can be booked: free on
    at least one resource that does it, or on `resource_id` when one is asked for."""
    minutes = await conn.fetchval(
        "select duration_minutes from services where id = $1 and active", service_id
    )
    if minutes is None:
        raise BookingError("unknown_service", "That service is not available.")
    slots = f"""
        from business_hours h,
             generate_series(
                 ($1::date + h.opens) at time zone {_TZ},
                 (($1::date + h.closes) at time zone {_TZ}) - make_interval(mins => $2),
                 make_interval(mins => $3)) s
        where h.weekday = extract(dow from $1::date)::int
          and s > now() + make_interval(mins => $4)
          and s < now() + make_interval(days => $5)
    """
    if not await has_resources(conn):
        if resource_id is not None:
            return []  # a shop with no resources has nothing to ask for
        rows = await conn.fetch(
            f"""
            select s as starts_at {slots}
              and not exists (
                  select 1 from bookings b where b.status = 'booked'
                    and tstzrange(b.starts_at, b.ends_at)
                        && tstzrange(s, s + make_interval(mins => $2)))
            order by s
            """,
            day, minutes, SLOT_STEP_MINUTES, LEAD_MINUTES, MAX_DAYS_AHEAD,
        )
        return [r["starts_at"] for r in rows]
    rows = await conn.fetch(
        f"""
        with eligible as ({_eligible("$6", "$7")})
        select s as starts_at {slots}
          and exists (
              select 1 from eligible e
              where not exists (
                  select 1 from bookings b where b.status = 'booked' and b.resource_id = e.id
                    and tstzrange(b.starts_at, b.ends_at)
                        && tstzrange(s, s + make_interval(mins => $2))))
        order by s
        """,
        day, minutes, SLOT_STEP_MINUTES, LEAD_MINUTES, MAX_DAYS_AHEAD, service_id, resource_id,
    )
    return [r["starts_at"] for r in rows]


async def _pick_resource(
    conn: asyncpg.Connection, service_id: UUID, starts_at: datetime, ends_at: datetime,
    wanted: UUID | None = None, prefer: UUID | None = None,
) -> UUID | None:
    """The resource a booking takes: the one asked for, else the one it already had (a move
    keeps the same chair if it is free), else the first free one in the shop's order. None
    for a shop with no resources. Called under the shop's lock, so the answer holds."""
    if not await has_resources(conn):
        return None
    found = await conn.fetchval(
        f"""
        with eligible as ({_eligible("$3", "$4")})
        select e.id from eligible e
        where not exists (
            select 1 from bookings b where b.status = 'booked' and b.resource_id = e.id
              and tstzrange(b.starts_at, b.ends_at) && tstzrange($1, $2))
        order by (e.id = $5::uuid) desc nulls last, e.sort, e.created_at
        limit 1
        """,
        starts_at, ends_at, service_id, wanted, prefer,
    )
    if found is None:
        raise BookingError("not_free", "That time is no longer free. Please pick another.")
    return found


# ----------------------------------------------------------------------- resources

async def list_resources(conn: asyncpg.Connection, only_active: bool = False) -> list[dict]:
    """The shop's resources in their order, each with the services narrowed to it (an empty
    list means it does every service)."""
    rows = await conn.fetch(
        "select id, name, name_ar, active from booking_resources "
        "where active or not $1 order by sort, created_at",
        only_active,
    )
    by_resource: dict[UUID, list[str]] = {}
    for link in await conn.fetch("select resource_id, service_id from service_resources"):
        by_resource.setdefault(link["resource_id"], []).append(str(link["service_id"]))
    return [
        {
            "id": str(r["id"]), "name": r["name"], "name_ar": r["name_ar"],
            "active": r["active"], "services": by_resource.get(r["id"], []),
        }
        for r in rows
    ]


async def add_resource(conn: asyncpg.Connection, name: str, name_ar: str = "") -> str:
    """Add a resource. The first one a shop adds takes over the bookings still to come, so
    they keep blocking it (until now they were all in the shop's one lane)."""
    first = not await has_resources(conn)
    resource_id = await conn.fetchval(
        "insert into booking_resources (name, name_ar, sort) "
        "values ($1, $2, (select coalesce(max(sort), 0) + 1 from booking_resources)) "
        "returning id",
        name.strip(), name_ar.strip(),
    )
    if first:
        await conn.execute(
            "update bookings set resource_id = $1 "
            "where resource_id is null and status = 'booked' and ends_at > now()",
            resource_id,
        )
    return str(resource_id)


async def update_resource(
    conn: asyncpg.Connection, resource_id: UUID, name: str | None, name_ar: str | None
) -> bool:
    updated = await conn.execute(
        "update booking_resources set name = coalesce(nullif(btrim($2), ''), name), "
        "name_ar = coalesce($3, name_ar) where id = $1",
        resource_id, name, name_ar.strip() if name_ar is not None else None,
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


async def _when_text(conn: asyncpg.Connection, starts_at: datetime, arabic: bool) -> str:
    """The time as the shop's customers read it, in the shop's time zone."""
    pattern = "DD/MM HH24:MI" if arabic else "FMDy FMDD Mon, FMHH12:MI AM"
    return await conn.fetchval(
        f"select to_char($1::timestamptz at time zone {_TZ}, $2)", starts_at, pattern
    )


async def _shop_name(conn: asyncpg.Connection, arabic: bool) -> str:
    shop = await conn.fetchrow(f"select name, name_ar from tenants where id = {_TENANT}")
    return shop["name_ar"] if arabic and shop["name_ar"] else shop["name"]


async def _schedule_reminder(conn: asyncpg.Connection, booking_id: UUID, starts_at: datetime):
    if not await conn.fetchval(f"select booking_reminders from tenants where id = {_TENANT}"):
        return  # the business switched reminders off during onboarding or later
    run_at = starts_at - REMIND_BEFORE
    if await conn.fetchval("select $1::timestamptz > now()", run_at):
        await jobs.enqueue(
            conn, REMINDER,
            {"booking_id": str(booking_id), "starts_at": starts_at.isoformat()}, run_at,
        )


async def _lock(conn: asyncpg.Connection, tenant_id: UUID) -> None:
    """One booking at a time per shop decides who gets a time. Held until the transaction
    ends, so the free resource found next is still free when the booking is written."""
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"bookings:{tenant_id}")


async def _place(
    conn: asyncpg.Connection, service_id: UUID, starts_at: datetime,
    wanted: UUID | None = None, prefer: UUID | None = None,
) -> tuple[asyncpg.Record, UUID | None]:
    """Check that this service can start at this time, and which resource takes it. Returns
    the service and the resource (None for a shop with no resources)."""
    service = await conn.fetchrow(
        "select id, name, name_ar, duration_minutes from services where id = $1 and active",
        service_id,
    )
    if service is None:
        raise BookingError("unknown_service", "That service is not available.")
    if wanted is not None and not await conn.fetchval(
        "select exists (select 1 from booking_resources where id = $1 and active)", wanted
    ):
        raise BookingError("unknown_resource", "That resource is not available.")
    day = await conn.fetchval(f"select ($1::timestamptz at time zone {_TZ})::date", starts_at)
    if starts_at not in await free_times(conn, service_id, day, wanted):
        raise BookingError("not_free", "That time is no longer free. Please pick another.")
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    resource = await _pick_resource(conn, service_id, starts_at, ends_at, wanted, prefer)
    return service, resource


async def create_booking(
    conn: asyncpg.Connection, tenant_id: UUID, outbound: Outbound, contact_id: UUID,
    service_id: UUID, starts_at: datetime, note: str = "", resource_id: UUID | None = None,
) -> dict:
    contact = await conn.fetchrow(
        "select id, lang, assigned_to from contacts where id = $1 and role = 'customer'",
        contact_id,
    )
    if contact is None:
        raise BookingError("unknown_customer", "Open the booking link from your chat again.")
    await _lock(conn, tenant_id)
    service, resource = await _place(conn, service_id, starts_at, resource_id)
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    number = await conn.fetchval("select coalesce(max(number), 100) + 1 from bookings")
    try:
        async with conn.transaction():
            # Whoever is looking after this customer's chat looks after the visit too.
            booking_id = await conn.fetchval(
                "insert into bookings (number, contact_id, service_id, service_name, "
                "                      starts_at, ends_at, note, assigned_to, resource_id) "
                "values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id",
                number, contact_id, service_id, service["name"], starts_at, ends_at,
                note.strip()[:500], contact["assigned_to"], resource,
            )
    except asyncpg.ExclusionViolationError as error:
        raise BookingError(
            "not_free", "That time was just taken. Please pick another."
        ) from error
    resource_name = await _resource_name(conn, resource)
    await team.record(
        conn, "booking", booking_id, "booked", team.CUSTOMER, contact_id,
        {"number": number, "service": service["name"], "starts_at": starts_at.isoformat(),
         "resource": resource_name},
    )
    arabic = contact["lang"] == "ar"
    when = await _when_text(conn, starts_at, arabic)
    shop = await _shop_name(conn, arabic)
    name = service["name_ar"] if arabic and service["name_ar"] else service["name"]
    body = (
        f"تم تأكيد حجزك رقم {number} لدى {shop}: {name}، {when}. "
        "للإلغاء أرسل «حجزي»." if arabic
        else f"Booking {number} confirmed at {shop}: {name}, {when}. "
             "To cancel, send \"my booking\"."
    )
    await outbound.send(conn, templates.notice(
        contact_id, "booking_confirmed", contact["lang"], body, number, shop, name, when,
    ))
    await _schedule_reminder(conn, booking_id, starts_at)
    return {"id": str(booking_id), "number": number, "when_text": when,
            "starts_at": starts_at.isoformat(), "service": service["name"],
            "resource": resource_name}


async def _resource_name(conn: asyncpg.Connection, resource_id: UUID | None) -> str | None:
    if resource_id is None:
        return None
    return await conn.fetchval("select name from booking_resources where id = $1", resource_id)


async def cancel(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, notify: bool = True,
    actor: Actor = team.CUSTOMER,
) -> bool:
    """Cancel a booking that has not been finished. The time becomes free again."""
    row = await conn.fetchrow(
        "update bookings set status = 'cancelled' where id = $1 and status = 'booked' "
        "returning number, contact_id, starts_at",
        booking_id,
    )
    if row is None:
        return False
    await team.record(
        conn, "booking", booking_id, "cancelled", actor, row["contact_id"],
        {"number": row["number"]},
    )
    if notify:
        arabic = await conn.fetchval(
            "select lang = 'ar' from contacts where id = $1", row["contact_id"]
        )
        when = await _when_text(conn, row["starts_at"], arabic)
        body = (
            f"تم إلغاء حجزك رقم {row['number']} ({when})." if arabic
            else f"Booking {row['number']} ({when}) has been cancelled."
        )
        await outbound.send(conn, templates.notice(
            row["contact_id"], "booking_cancelled", "ar" if arabic else "en", body,
            row["number"], when,
        ))
    return True


async def reschedule(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, starts_at: datetime,
    actor: Actor = team.CUSTOMER,
) -> dict:
    await _lock(conn, await conn.fetchval(f"select {_TENANT}"))
    current = await conn.fetchrow(
        "select number, contact_id, service_id, starts_at, ends_at, resource_id from bookings "
        "where id = $1 and status = 'booked' for update",
        booking_id,
    )
    if current is None:
        raise LookupError("no such booking")
    # Free the old time first so the booking does not block itself, then check the new. A
    # move keeps the same resource when it is free then, and takes another when it is not.
    await conn.execute("update bookings set status = 'cancelled' where id = $1", booking_id)
    service, resource = await _place(
        conn, current["service_id"], starts_at, prefer=current["resource_id"]
    )
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    await conn.execute(
        "update bookings set status = 'booked', starts_at = $2, ends_at = $3, "
        "resource_id = $4, reminded_at = null where id = $1",
        booking_id, starts_at, ends_at, resource,
    )
    await team.claim(conn, "booking", booking_id, actor)
    await team.record(
        conn, "booking", booking_id, "moved", actor, current["contact_id"],
        {"number": current["number"], "starts_at": starts_at.isoformat(),
         "resource": await _resource_name(conn, resource)},
    )
    arabic = await conn.fetchval(
        "select lang = 'ar' from contacts where id = $1", current["contact_id"]
    )
    when = await _when_text(conn, starts_at, arabic)
    body = (
        f"تم تغيير موعد حجزك رقم {current['number']} إلى {when}." if arabic
        else f"Booking {current['number']} has been moved to {when}."
    )
    await outbound.send(conn, templates.notice(
        current["contact_id"], "booking_moved", "ar" if arabic else "en", body,
        current["number"], when,
    ))
    await _schedule_reminder(conn, booking_id, starts_at)
    return {"id": str(booking_id), "when_text": when, "starts_at": starts_at.isoformat()}


async def set_outcome(
    conn: asyncpg.Connection, booking_id: UUID, status: str, actor: Actor = team.ASSISTANT
) -> bool:
    """Mark what happened: the customer came, or did not. Whoever marks a visit nobody
    had becomes responsible for it."""
    if status not in ("completed", "no_show"):
        raise BookingError("bad_status", "Status must be completed or no_show.")
    row = await conn.fetchrow(
        "update bookings set status = $2 where id = $1 and status = 'booked' "
        "returning number, contact_id",
        booking_id, status,
    )
    if row is None:
        return False
    await team.claim(conn, "booking", booking_id, actor)
    await team.record(
        conn, "booking", booking_id, status, actor, row["contact_id"], {"number": row["number"]}
    )
    return True


async def list_bookings(
    conn: asyncpg.Connection, first: date, last: date, contact_id: UUID | None = None
) -> list[dict]:
    rows = await conn.fetch(
        f"""
        select b.id, b.number, b.service_name, b.starts_at, b.ends_at, b.status, b.note,
               c.id as contact_id, c.name as customer, c.phone,
               b.assigned_to, u.name as assignee,
               b.resource_id, res.name as resource_name, res.name_ar as resource_name_ar,
               to_char(b.starts_at at time zone {_TZ}, 'FMDy FMDD Mon, FMHH12:MI AM') as when_text
        from bookings b join contacts c on c.id = b.contact_id
        left join users u on u.id = b.assigned_to
        left join booking_resources res on res.id = b.resource_id
        where (b.starts_at at time zone {_TZ})::date between $1 and $2
          and ($3::uuid is null or b.contact_id = $3)
        order by b.starts_at
        """,
        first, last, contact_id,
    )
    return [
        {
            "id": str(r["id"]), "number": r["number"], "service": r["service_name"],
            "starts_at": r["starts_at"].isoformat(), "ends_at": r["ends_at"].isoformat(),
            "when_text": r["when_text"], "status": r["status"], "note": r["note"],
            "customer": r["customer"], "contact_id": str(r["contact_id"]), "phone": r["phone"],
            "assigned": {"id": str(r["assigned_to"]), "name": r["assignee"]}
            if r["assigned_to"] else None,
            # Which chair, person or room holds it; null for a shop with no resources.
            "resource": {
                "id": str(r["resource_id"]), "name": r["resource_name"],
                "name_ar": r["resource_name_ar"],
            } if r["resource_id"] else None,
        }
        for r in rows
    ]


async def next_booking(conn: asyncpg.Connection, contact_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "select id, number, service_name, starts_at from bookings "
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
            row = await conn.fetchrow(
                "update bookings set reminded_at = now() "
                "where id = $1 and status = 'booked' and reminded_at is null "
                "  and starts_at = $2::timestamptz and starts_at > now() "
                "returning number, contact_id, service_name, starts_at",
                UUID(payload["booking_id"]), datetime.fromisoformat(payload["starts_at"]),
            )
            if row is None:
                return  # cancelled, moved, already reminded, or already past
            arabic = await conn.fetchval(
                "select lang = 'ar' from contacts where id = $1", row["contact_id"]
            )
            when = await _when_text(conn, row["starts_at"], arabic)
            shop = await _shop_name(conn, arabic)
            body = (
                f"تذكير: حجزك رقم {row['number']} لدى {shop}، {when}." if arabic
                else f"Reminder: booking {row['number']} at {shop}, {when}."
            )
            await self._outbound.send(conn, templates.notice(
                row["contact_id"], "booking_reminder", "ar" if arabic else "en", body,
                row["number"], shop, when,
            ))
