"""The shop's registered staff numbers: who may change the Catalog by WhatsApp (D-039).

A staff number is a contact whose `role` is `staff`; the weekly report (D-030) already
chooses its recipients among them. The owner registers a number here, in the workspace.
A message from any other number is a customer's, answered like a customer's: it never
reaches the staff commands, and nothing it says reveals that they exist.

Some staff numbers are **managers** (`catalog_manager`): they get the stock and refund
alerts, and may put a draft made from a photo on sale. A shop that has marked nobody as a
manager falls back to the numbers that receive the weekly report, who are the owner's.

A number marked with **new orders** (`order_alerts`) is told about every order placed
(`modules/orders/staff_alert.py`, D-079). Nobody is, until the owner marks a number.

A number marked with **new bookings** (`booking_alerts`) is told about each booking a customer
makes and each one they cancel (`modules/bookings/staff_alert.py`, D-192). An owner's or an
admin's own phone is marked when they link it (`core/staff_link.py`); any other number only when
the owner marks it. A number marked for the **weekly report** (`weekly_report`) receives it
(D-030); registering a number is the owner choosing, so the form asks for it.

Every function takes a tenant-scoped connection.
"""

import re
from uuid import UUID

import asyncpg

from alyr.core import consent, staff_link
from alyr.core.normalise import western_digits

_FIELDS = (
    "id, name, phone, lang, catalog_manager, weekly_report, order_alerts, booking_alerts"
)
# E.164 numbers have at most 15 digits; the shortest real ones have about 8.
_DIGITS = re.compile(r"\d{8,15}")


class StaffError(Exception):
    """A staff number that cannot be saved. `code` is stable; the message is safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def clean_phone(raw: str) -> str | None:
    """A phone number as the contacts table keeps it: digits only, in international form,
    no plus and no leading 00. None when it cannot be a number."""
    digits = re.sub(r"[\s\-().+]", "", western_digits(raw))
    digits = digits.removeprefix("00")
    return digits if _DIGITS.fullmatch(digits) else None


def _shown(row: asyncpg.Record) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "phone": row["phone"], "lang": row["lang"],
        "manager": row["catalog_manager"], "weekly_report": row["weekly_report"],
        "order_alerts": row["order_alerts"], "booking_alerts": row["booking_alerts"],
    }


async def listing(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        f"select {_FIELDS} from contacts where role = 'staff' order by name, created_at"
    )
    return [_shown(r) for r in rows]


async def get(conn: asyncpg.Connection, contact_id: UUID) -> dict | None:
    """One staff number as the screens show it, or None if it is not a staff number."""
    row = await conn.fetchrow(
        f"select {_FIELDS} from contacts where id = $1 and role = 'staff'", contact_id
    )
    return _shown(row) if row else None


async def find(conn: asyncpg.Connection, phone: str) -> dict | None:
    """The staff number that has this phone, or None (no such number, or it is a customer's)."""
    number = clean_phone(phone)
    if number is None:
        return None
    row = await conn.fetchrow(
        f"select {_FIELDS} from contacts where phone = $1 and role = 'staff'", number
    )
    return _shown(row) if row else None


async def _agree_to_notices(conn: asyncpg.Connection, contact_id: UUID) -> None:
    """The owner registering a number is the agreement to be told about the shop's own
    stock and money. Without it the outbound layer would refuse the alerts."""
    state = await conn.fetchval("select consent_service from contacts where id = $1", contact_id)
    if state != "granted":
        await consent.record(conn, contact_id, "service", "granted", "staff_registration")


async def register(
    conn: asyncpg.Connection, name: str, phone: str, lang: str = "en", manager: bool = False,
    order_alerts: bool = False, weekly_report: bool | None = None,
    booking_alerts: bool | None = None,
) -> dict:
    """Register a number as staff. A number the shop already knows as a customer becomes
    staff (its history stays). Registering a staff number again changes its details. The
    weekly report and the booking alerts are off for a new number unless asked for; asked
    again with nothing said (None) they stay as they were, so registering an owner's linked
    number a second time does not switch their report off."""
    name = " ".join(name.split())
    number = clean_phone(phone)
    if not name:
        raise StaffError("name_needed", "Give the person's name.")
    if number is None:
        raise StaffError(
            "bad_phone", "That phone number does not look right. Use the international form, "
            "for example 974 5550 0001.",
        )
    row = await conn.fetchrow(
        "insert into contacts (phone, name, role, lang, catalog_manager, order_alerts, "
        "    weekly_report, booking_alerts) "
        "values ($1, $2, 'staff', $3, $4, $5, coalesce($6, false), coalesce($7, false)) "
        "on conflict (tenant_id, phone) do update set role = 'staff', name = excluded.name, "
        "lang = excluded.lang, catalog_manager = excluded.catalog_manager, "
        "order_alerts = excluded.order_alerts, "
        "weekly_report = coalesce($6, contacts.weekly_report), "
        "booking_alerts = coalesce($7, contacts.booking_alerts) "
        f"returning {_FIELDS}",
        number, name[:80], "ar" if lang == "ar" else "en", manager, order_alerts,
        weekly_report, booking_alerts,
    )
    await _agree_to_notices(conn, row["id"])
    return _shown(row)


async def update(
    conn: asyncpg.Connection, contact_id: UUID, name: str | None = None,
    lang: str | None = None, manager: bool | None = None, order_alerts: bool | None = None,
    weekly_report: bool | None = None, booking_alerts: bool | None = None,
) -> dict | None:
    """Change a staff number's name, language, whether it is a manager, whether it is told
    about new orders or new bookings and whether it receives the weekly report. None if there
    is no such staff number."""
    if name is not None and not " ".join(name.split()):
        raise StaffError("name_needed", "Give the person's name.")
    row = await conn.fetchrow(
        "update contacts set name = coalesce($2, name), lang = coalesce($3, lang), "
        "catalog_manager = coalesce($4, catalog_manager), "
        "order_alerts = coalesce($5, order_alerts), "
        "weekly_report = coalesce($6, weekly_report), "
        "booking_alerts = coalesce($7, booking_alerts) "
        f"where id = $1 and role = 'staff' returning {_FIELDS}",
        contact_id, " ".join(name.split())[:80] if name is not None else None,
        ("ar" if lang == "ar" else "en") if lang is not None else None, manager, order_alerts,
        weekly_report, booking_alerts,
    )
    if row is None:
        return None
    await _agree_to_notices(conn, row["id"])
    return _shown(row)


async def remove(conn: asyncpg.Connection, contact_id: UUID) -> bool:
    """Stop treating a number as staff: it is an ordinary customer from now on, and the
    history stays. Returns False if there is no such staff number."""
    return await staff_link.stand_down(conn, contact_id=contact_id) is not None


async def order_watchers(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    """Who is told about each new order: the staff numbers marked for it, and nobody else."""
    return await conn.fetch(
        "select id, name, lang from contacts where role = 'staff' and order_alerts order by name"
    )


async def booking_watchers(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    """Who is told about each new booking and each cancellation: the staff numbers marked for it,
    and nobody else. `window_open` says whether the number wrote to ALYR in the last 24 hours."""
    return await conn.fetch(
        "select id, name, lang, coalesce(last_inbound_at > now() - interval '24 hours', false) "
        "as window_open from contacts where role = 'staff' and booking_alerts order by name"
    )


async def managers(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    """Who is told about low stock, sold-out items and refunds due: the managers, or, in a
    shop that has chosen none, the numbers that receive the weekly report."""
    found = await conn.fetch(
        "select id, name, lang from contacts where role = 'staff' and catalog_manager "
        "order by name"
    )
    if found:
        return found
    return await conn.fetch(
        "select id, name, lang from contacts where role = 'staff' and weekly_report "
        "order by name"
    )
