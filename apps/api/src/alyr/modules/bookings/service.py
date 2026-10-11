"""Bookings: services, opening hours, free times, and the bookings themselves.

All time arithmetic is done by PostgreSQL in the shop's own time zone, so "9 am" means
9 am at the shop whatever machine runs this code.

Every function takes a tenant-scoped connection.
"""

from datetime import date, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core import jobs
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound

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


async def free_times(conn: asyncpg.Connection, service_id: UUID, day: date) -> list[datetime]:
    """Start times on `day` (the shop's calendar day) when this service can be booked."""
    minutes = await conn.fetchval(
        "select duration_minutes from services where id = $1 and active", service_id
    )
    if minutes is None:
        raise BookingError("unknown_service", "That service is not available.")
    rows = await conn.fetch(
        f"""
        select s as starts_at
        from business_hours h,
             generate_series(
                 ($1::date + h.opens) at time zone {_TZ},
                 (($1::date + h.closes) at time zone {_TZ}) - make_interval(mins => $2),
                 make_interval(mins => $3)) s
        where h.weekday = extract(dow from $1::date)::int
          and s > now() + make_interval(mins => $4)
          and s < now() + make_interval(days => $5)
          and not exists (
              select 1 from bookings b where b.status = 'booked'
                and tstzrange(b.starts_at, b.ends_at)
                    && tstzrange(s, s + make_interval(mins => $2)))
        order by s
        """,
        day, minutes, SLOT_STEP_MINUTES, LEAD_MINUTES, MAX_DAYS_AHEAD,
    )
    return [r["starts_at"] for r in rows]


async def _when_text(conn: asyncpg.Connection, starts_at: datetime, arabic: bool) -> str:
    """The time as the shop's customers read it, in the shop's time zone."""
    pattern = "DD/MM HH24:MI" if arabic else "FMDy FMDD Mon, FMHH12:MI AM"
    return await conn.fetchval(
        f"select to_char($1::timestamptz at time zone {_TZ}, $2)", starts_at, pattern
    )


async def _shop_name(conn: asyncpg.Connection, arabic: bool) -> str:
    shop = await conn.fetchrow(f"select name, name_ar from tenants where id = {_TENANT}")
    return shop["name_ar"] if arabic and shop["name_ar"] else shop["name"]


def _notice(contact_id: UUID, name: str, body: str) -> OutboundMessage:
    # A template, because the customer may have last written more than 24 hours ago.
    return OutboundMessage(
        to=contact_id, kind="template", body=body, template_name=name,
        template_category="utility",
    )


async def _schedule_reminder(conn: asyncpg.Connection, booking_id: UUID, starts_at: datetime):
    run_at = starts_at - REMIND_BEFORE
    if await conn.fetchval("select $1::timestamptz > now()", run_at):
        await jobs.enqueue(
            conn, REMINDER,
            {"booking_id": str(booking_id), "starts_at": starts_at.isoformat()}, run_at,
        )


async def _place(
    conn: asyncpg.Connection, service_id: UUID, starts_at: datetime
) -> tuple[asyncpg.Record, datetime]:
    """Check that this service can start at this time. Returns the service and local day."""
    service = await conn.fetchrow(
        "select id, name, name_ar, duration_minutes from services where id = $1 and active",
        service_id,
    )
    if service is None:
        raise BookingError("unknown_service", "That service is not available.")
    day = await conn.fetchval(f"select ($1::timestamptz at time zone {_TZ})::date", starts_at)
    if starts_at not in await free_times(conn, service_id, day):
        raise BookingError("not_free", "That time is no longer free. Please pick another.")
    return service, day


async def create_booking(
    conn: asyncpg.Connection, tenant_id: UUID, outbound: Outbound, contact_id: UUID,
    service_id: UUID, starts_at: datetime, note: str = "",
) -> dict:
    contact = await conn.fetchrow(
        "select id, lang from contacts where id = $1 and role = 'customer'", contact_id
    )
    if contact is None:
        raise BookingError("unknown_customer", "Open the booking link from your chat again.")
    service, _ = await _place(conn, service_id, starts_at)
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"bookings:{tenant_id}")
    number = await conn.fetchval("select coalesce(max(number), 100) + 1 from bookings")
    try:
        async with conn.transaction():
            booking_id = await conn.fetchval(
                "insert into bookings (number, contact_id, service_id, service_name, "
                "                      starts_at, ends_at, note) "
                "values ($1, $2, $3, $4, $5, $6, $7) returning id",
                number, contact_id, service_id, service["name"], starts_at, ends_at,
                note.strip()[:500],
            )
    except asyncpg.ExclusionViolationError as error:
        raise BookingError(
            "not_free", "That time was just taken. Please pick another."
        ) from error
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
    await outbound.send(conn, _notice(contact_id, "booking_confirmed", body))
    await _schedule_reminder(conn, booking_id, starts_at)
    return {"id": str(booking_id), "number": number, "when_text": when,
            "starts_at": starts_at.isoformat(), "service": service["name"]}


async def cancel(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, notify: bool = True
) -> bool:
    """Cancel a booking that has not been finished. The time becomes free again."""
    row = await conn.fetchrow(
        "update bookings set status = 'cancelled' where id = $1 and status = 'booked' "
        "returning number, contact_id, starts_at",
        booking_id,
    )
    if row is None:
        return False
    if notify:
        arabic = await conn.fetchval(
            "select lang = 'ar' from contacts where id = $1", row["contact_id"]
        )
        when = await _when_text(conn, row["starts_at"], arabic)
        body = (
            f"تم إلغاء حجزك رقم {row['number']} ({when})." if arabic
            else f"Booking {row['number']} ({when}) has been cancelled."
        )
        await outbound.send(conn, _notice(row["contact_id"], "booking_cancelled", body))
    return True


async def reschedule(
    conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID, starts_at: datetime
) -> dict:
    current = await conn.fetchrow(
        "select number, contact_id, service_id, starts_at, ends_at from bookings "
        "where id = $1 and status = 'booked' for update",
        booking_id,
    )
    if current is None:
        raise LookupError("no such booking")
    # Free the old time first so the booking does not block itself, then check the new.
    await conn.execute("update bookings set status = 'cancelled' where id = $1", booking_id)
    service, _ = await _place(conn, current["service_id"], starts_at)
    ends_at = starts_at + timedelta(minutes=service["duration_minutes"])
    await conn.execute(
        "update bookings set status = 'booked', starts_at = $2, ends_at = $3, "
        "reminded_at = null where id = $1",
        booking_id, starts_at, ends_at,
    )
    arabic = await conn.fetchval(
        "select lang = 'ar' from contacts where id = $1", current["contact_id"]
    )
    when = await _when_text(conn, starts_at, arabic)
    body = (
        f"تم تغيير موعد حجزك رقم {current['number']} إلى {when}." if arabic
        else f"Booking {current['number']} has been moved to {when}."
    )
    await outbound.send(conn, _notice(current["contact_id"], "booking_moved", body))
    await _schedule_reminder(conn, booking_id, starts_at)
    return {"id": str(booking_id), "when_text": when, "starts_at": starts_at.isoformat()}


async def set_outcome(conn: asyncpg.Connection, booking_id: UUID, status: str) -> bool:
    """Mark what happened: the customer came, or did not."""
    if status not in ("completed", "no_show"):
        raise BookingError("bad_status", "Status must be completed or no_show.")
    updated = await conn.execute(
        "update bookings set status = $2 where id = $1 and status = 'booked'",
        booking_id, status,
    )
    return updated == "UPDATE 1"


async def list_bookings(
    conn: asyncpg.Connection, first: date, last: date, contact_id: UUID | None = None
) -> list[dict]:
    rows = await conn.fetch(
        f"""
        select b.id, b.number, b.service_name, b.starts_at, b.ends_at, b.status, b.note,
               c.id as contact_id, c.name as customer, c.phone,
               to_char(b.starts_at at time zone {_TZ}, 'FMDy FMDD Mon, FMHH12:MI AM') as when_text
        from bookings b join contacts c on c.id = b.contact_id
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
            await self._outbound.send(
                conn, _notice(row["contact_id"], "booking_reminder", body)
            )
