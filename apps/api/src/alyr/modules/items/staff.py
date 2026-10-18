"""The shop's registered staff numbers: who may change the Catalog by WhatsApp (D-039).

A staff number is a contact whose `role` is `staff`; the weekly report (D-030) already
chooses its recipients among them. The owner registers a number here, in the workspace.
A message from any other number is a customer's, answered like a customer's: it never
reaches the staff commands, and nothing it says reveals that they exist.

Some staff numbers are **managers** (`catalog_manager`): they get the stock and refund
alerts, and may put a draft made from a photo on sale. A shop that has marked nobody as a
manager falls back to the numbers that receive the weekly report, who are the owner's.

Every function takes a tenant-scoped connection.
"""

import re
from uuid import UUID

import asyncpg

from alyr.core import consent
from alyr.core.normalise import western_digits

_FIELDS = "id, name, phone, lang, catalog_manager, weekly_report"
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
    }


async def listing(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        f"select {_FIELDS} from contacts where role = 'staff' order by name, created_at"
    )
    return [_shown(r) for r in rows]


async def _agree_to_notices(conn: asyncpg.Connection, contact_id: UUID) -> None:
    """The owner registering a number is the agreement to be told about the shop's own
    stock and money. Without it the outbound layer would refuse the alerts."""
    state = await conn.fetchval("select consent_service from contacts where id = $1", contact_id)
    if state != "granted":
        await consent.record(conn, contact_id, "service", "granted", "staff_registration")


async def register(
    conn: asyncpg.Connection, name: str, phone: str, lang: str = "en", manager: bool = False
) -> dict:
    """Register a number as staff. A number the shop already knows as a customer becomes
    staff (its history stays). Registering a staff number again changes its details."""
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
        "insert into contacts (phone, name, role, lang, catalog_manager) "
        "values ($1, $2, 'staff', $3, $4) "
        "on conflict (tenant_id, phone) do update set role = 'staff', name = excluded.name, "
        "lang = excluded.lang, catalog_manager = excluded.catalog_manager "
        f"returning {_FIELDS}",
        number, name[:80], "ar" if lang == "ar" else "en", manager,
    )
    await _agree_to_notices(conn, row["id"])
    return _shown(row)


async def update(
    conn: asyncpg.Connection, contact_id: UUID, name: str | None = None,
    lang: str | None = None, manager: bool | None = None,
) -> dict | None:
    """Change a staff number's name, language or whether it is a manager. None if there
    is no such staff number."""
    if name is not None and not " ".join(name.split()):
        raise StaffError("name_needed", "Give the person's name.")
    row = await conn.fetchrow(
        "update contacts set name = coalesce($2, name), lang = coalesce($3, lang), "
        "catalog_manager = coalesce($4, catalog_manager) "
        f"where id = $1 and role = 'staff' returning {_FIELDS}",
        contact_id, " ".join(name.split())[:80] if name is not None else None,
        ("ar" if lang == "ar" else "en") if lang is not None else None, manager,
    )
    if row is None:
        return None
    await _agree_to_notices(conn, row["id"])
    return _shown(row)


async def remove(conn: asyncpg.Connection, contact_id: UUID) -> bool:
    """Stop treating a number as staff: it is an ordinary customer from now on, and the
    history stays. Returns False if there is no such staff number."""
    row = await conn.fetchrow(
        "update contacts set role = 'customer', catalog_manager = false, weekly_report = false "
        "where id = $1 and role = 'staff' returning id",
        contact_id,
    )
    if row is None:
        return False
    await conn.execute("delete from staff_pending where contact_id = $1", contact_id)
    return True


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
