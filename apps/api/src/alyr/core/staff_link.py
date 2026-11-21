"""Linking a staff WhatsApp number to the person who holds it (ALY-130, decision D-065).

Until now `contacts.role = 'staff'` was only a flag: nothing proved who held the number or
which person, and so which role, was behind it. A signed-in person asks the workspace for a
one-time code and sends `LINK <code>` from their phone to the shop's number. That proves
they control the login and the phone, whatever identifier WhatsApp gives us for the sender
(the phone number is optional, D-009, so a typed number could not be matched).

The role is never copied onto the contact: `caller_for` reads it from the person's
membership each time, so removing them or changing their role takes effect on their next
message.

Every function takes a tenant-scoped connection.
"""

import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.core import consent, team
from alyr.core.actions import Caller

CODE_DIGITS = 8
LIFETIME = timedelta(minutes=10)
# Wrong tries against the shop in all, over the life of its live codes. At this many the
# codes are dead and the person asks for a new one; a stranger gets ten guesses in 10^8.
MAX_WRONG = 10

_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
LINK_MESSAGE = re.compile(rf"^\s*(?:link|ربط)\s+(\d{{{CODE_DIGITS}}})\s*$", re.IGNORECASE)

PREFERENCES = ("portal", "whatsapp", "both")


def parse(text: str) -> str | None:
    """The code in a `LINK 12345678` message, or None if the message is anything else.
    Arabic-Indic digits are accepted, since a phone keyboard may type them."""
    found = LINK_MESSAGE.match(text.translate(_ARABIC_DIGITS))
    return found.group(1) if found else None


def _digest(code: str) -> str:
    return hashlib.sha256(f"staff-link:{code}".encode()).hexdigest()


@dataclass(frozen=True)
class Linked:
    user_id: UUID
    name: str
    role: str


async def issue(conn: asyncpg.Connection, user_id: UUID) -> tuple[str, datetime]:
    """A new code for this person; any earlier live code of theirs stops working."""
    await conn.execute(
        "update staff_link_codes set used_at = now() where user_id = $1 and used_at is null",
        user_id,
    )
    code = f"{secrets.randbelow(10**CODE_DIGITS):0{CODE_DIGITS}d}"
    expires_at = await conn.fetchval(
        "insert into staff_link_codes (user_id, code_hash, expires_at) "
        "values ($1, $2, now() + $3) returning expires_at",
        user_id, _digest(code), LIFETIME,
    )
    return code, expires_at


async def redeem(
    conn: asyncpg.Connection, contact: asyncpg.Record, code: str
) -> Linked | str:
    """The sender proved the code from their phone: this contact is now that person's.

    Returns who it linked, or a reason: "refused" (no such live code, or it was wrong;
    the same answer either way, so a guess learns nothing) or "taken" (the number already
    belongs to another person, who must unlink it first)."""
    row = await conn.fetchrow(
        "select id, user_id from staff_link_codes "
        "where code_hash = $1 and used_at is null and expires_at > now() and attempts < $2 "
        "for update",
        _digest(code), MAX_WRONG,
    )
    member = None
    if row is not None:
        member = await conn.fetchrow(
            "select m.role, u.name from memberships m join users u on u.id = m.user_id "
            "where m.user_id = $1 "
            "and m.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
            row["user_id"],
        )
    if row is None or member is None:
        # Count the miss against every live code of the shop (but never one that did match).
        await conn.execute(
            "update staff_link_codes set attempts = attempts + 1 "
            "where used_at is null and expires_at > now()"
        )
        return "refused"
    if contact["user_id"] is not None and contact["user_id"] != row["user_id"]:
        return "taken"
    # One number per person: a new link replaces the old one. The old number stays a staff
    # number (a weekly-report setting survives) but runs no commands.
    await conn.execute(
        "update contacts set user_id = null, verified_at = null "
        "where user_id = $1 and id <> $2",
        row["user_id"], contact["id"],
    )
    await conn.execute(
        "update contacts set user_id = $1, role = 'staff', verified_at = now() where id = $2",
        row["user_id"], contact["id"],
    )
    if contact["role"] != "staff" and member["role"] in ("owner", "admin"):
        # A number that was a customer's has just become the owner's or an admin's own: it is
        # told about the week and about each booking from now on, and can switch either off on
        # the Team screen (D-193). A number the shop already registered as staff keeps the
        # settings the owner gave it. An agent (a stylist) is never given the weekly report.
        await conn.execute(
            "update contacts set weekly_report = true, booking_alerts = true where id = $1",
            contact["id"],
        )
        await _agree(conn, contact["id"], "staff_link")
    await conn.execute("update staff_link_codes set used_at = now() where id = $1", row["id"])
    await team.record(
        conn, "team", row["user_id"], "whatsapp_linked",
        team.Actor(row["user_id"], member["name"]),
        contact_id=contact["id"], channel="whatsapp",
    )
    return Linked(row["user_id"], member["name"], member["role"])


async def _agree(conn: asyncpg.Connection, contact_id: UUID, source: str) -> None:
    """A person who proves their own phone and then asks for the shop's messages on it has agreed
    to them: record it, unless the number never answered (unknown). A number that said STOP is
    left as it is: STOP means stop, and START brings it back."""
    if await consent.current(conn, contact_id, "service") == "unknown":
        await consent.record(conn, contact_id, "service", "granted", source)


async def unlink(conn: asyncpg.Connection, actor: team.Actor, user_id: UUID) -> bool:
    """Take the person's number off. The number stays a staff number; it just stops
    answering to commands. Returns whether there was a number to take off."""
    contact_id = await conn.fetchval(
        "update contacts set user_id = null, verified_at = null where user_id = $1 "
        "returning id",
        user_id,
    )
    if contact_id is None:
        return False
    await team.record(
        conn, "team", user_id, "whatsapp_unlinked", actor, contact_id=contact_id,
        channel="portal",
    )
    return True


async def status(conn: asyncpg.Connection, user_id: UUID) -> dict:
    """Whether this person has a number linked, and which door they prefer."""
    row = await conn.fetchrow(
        "select c.phone, c.verified_at, c.weekly_report, c.booking_alerts from contacts c "
        "where c.user_id = $1", user_id
    )
    preference = await conn.fetchval(
        "select channel_preference from memberships where user_id = $1 "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        user_id,
    )
    phone = row["phone"] if row else None
    email = await conn.fetchval(
        "select booking_emails from memberships where user_id = $1 "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        user_id,
    )
    return {
        "linked": row is not None,
        # Only the end of the number: enough to recognise it, not to copy it.
        "number_ends": phone[-4:] if phone else None,
        "verified_at": row["verified_at"].isoformat() if row else None,
        "preference": preference or "both",
        # What ALYR sends this person (D-193): the two WhatsApp messages need a linked phone
        # (None says there is no phone to switch them on for), the email does not.
        "weekly_report": row["weekly_report"] if row else None,
        "booking_alerts": row["booking_alerts"] if row else None,
        "booking_email": email,
    }


async def set_preference(conn: asyncpg.Connection, user_id: UUID, preference: str) -> None:
    if preference not in PREFERENCES:
        raise ValueError("preference must be portal, whatsapp or both")
    await conn.execute(
        "update memberships set channel_preference = $2 where user_id = $1 "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        user_id, preference,
    )


class AlertError(Exception):
    """A setting that cannot be changed for this person; `code` is stable."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


async def set_alerts(
    conn: asyncpg.Connection, user_id: UUID, role: str, *, weekly_report: bool | None = None,
    booking_alerts: bool | None = None, booking_email: bool | None = None,
) -> None:
    """What ALYR sends this person: the weekly report (owner and admin only: it holds the shop's
    money) and each new booking, both on their linked WhatsApp number, and the email for each new
    booking (owners). Turning a message on is the person asking for it, which is the agreement to
    receive it. Raises AlertError: `report_for_managers`, `link_first`, `emails_for_owners`."""
    if weekly_report is not None and role not in ("owner", "admin"):
        raise AlertError("report_for_managers")
    if booking_email is not None and role != "owner":
        raise AlertError("emails_for_owners")
    if weekly_report is not None or booking_alerts is not None:
        contact_id = await conn.fetchval(
            "select id from contacts where user_id = $1 and role = 'staff'", user_id
        )
        if contact_id is None:
            raise AlertError("link_first")
        await conn.execute(
            "update contacts set weekly_report = coalesce($2, weekly_report), "
            "booking_alerts = coalesce($3, booking_alerts) where id = $1",
            contact_id, weekly_report, booking_alerts,
        )
        if weekly_report or booking_alerts:
            await _agree(conn, contact_id, "alert_setting")
    if booking_email is not None:
        await conn.execute(
            "update memberships set booking_emails = $2 where user_id = $1 "
            "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
            user_id, booking_email,
        )


async def stand_down(
    conn: asyncpg.Connection, *, contact_id: UUID | None = None, user_id: UUID | None = None
) -> UUID | None:
    """Stop treating a number as staff: it is an ordinary customer's from now on, the report and
    every alert are off, it answers to no login and the history stays. Give the contact, or the
    person whose number it is. Returns the contact's ID, or None if there was no such staff
    number. A person taken off the team and a number the owner takes off the list both end here,
    so an ex-colleague's phone is not left receiving the shop's figures (D-193)."""
    found = await conn.fetchval(
        "update contacts set role = 'customer', user_id = null, verified_at = null, "
        "catalog_manager = false, weekly_report = false, order_alerts = false, "
        "booking_alerts = false "
        "where role = 'staff' and (id = $1 or user_id = $2) returning id",
        contact_id, user_id,
    )
    if found is not None:
        await conn.execute("delete from staff_pending where contact_id = $1", found)
    return found


async def caller_for(conn: asyncpg.Connection, contact_id: UUID) -> Caller | None:
    """Who is behind this staff number, as an action's caller; None when the number is not
    linked or the person is no longer on the team. The role is read fresh."""
    row = await conn.fetchrow(
        "select u.id as user_id, u.name, m.role from contacts c "
        "join users u on u.id = c.user_id "
        "join memberships m on m.user_id = u.id "
        "and m.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid "
        "where c.id = $1 and c.role = 'staff'",
        contact_id,
    )
    if row is None:
        return None
    return Caller(row["user_id"], row["name"], row["role"], "whatsapp")
