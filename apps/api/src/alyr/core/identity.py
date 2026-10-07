"""Who is this? Contacts are identified by WhatsApp's business-scoped user ID (BSUID),
with the phone number as an optional attribute. See docs/decisions.md D-009.

Every function takes a tenant-scoped connection.
"""

import logging

import asyncpg

log = logging.getLogger("alyr.identity")

_FIELDS = "id, name, role, lang, phone, wa_user_id, username, credit_limit"
# Tables whose rows follow a contact when two records turn out to be the same person.
_FOLLOWERS = ("messages", "ledger_entries", "payment_requests", "orders")


async def resolve_contact(
    conn: asyncpg.Connection,
    phone: str = "",
    user_id: str = "",
    username: str = "",
    profile_name: str = "",
) -> asyncpg.Record:
    """Find the contact a message came from, creating it on first contact.

    Matches on user ID first, then phone, and fills in whichever identifier was missing.
    If the user ID and the phone turn out to belong to two separate records (a contact
    imported by phone, and the same person arriving later by username), they are merged.
    """
    if not (phone or user_id):
        raise ValueError("need a phone number or a user id")
    by_id = by_phone = None
    if user_id:
        by_id = await conn.fetchrow(
            f"select {_FIELDS} from contacts where wa_user_id = $1", user_id
        )
    if phone:
        by_phone = await conn.fetchrow(f"select {_FIELDS} from contacts where phone = $1", phone)

    if by_id and by_phone and by_id["id"] != by_phone["id"]:
        contact = await _merge(conn, keep=by_phone, drop=by_id, user_id=user_id)
    elif by_id or by_phone:
        contact = by_id or by_phone
    else:
        name = profile_name or username or (f"+{phone}" if phone else "WhatsApp customer")
        return await conn.fetchrow(
            f"insert into contacts (phone, wa_user_id, username, name) "
            f"values ($1, $2, $3, $4) returning {_FIELDS}",
            phone or None, user_id or None, username or None, name,
        )

    return await conn.fetchrow(
        "update contacts set "
        "  phone = coalesce(phone, $2), "
        "  wa_user_id = coalesce($3, wa_user_id), "
        "  username = coalesce($4, username) "
        f"where id = $1 returning {_FIELDS}",
        contact["id"], phone or None, user_id or None, username or None,
    )


async def _merge(conn, keep: asyncpg.Record, drop: asyncpg.Record, user_id: str):
    """Fold `drop` into `keep`. The phone record is kept because it is the one the merchant
    created or imported and the one the ledger hangs on."""
    for table in _FOLLOWERS:
        await conn.execute(
            f"update {table} set contact_id = $1 where contact_id = $2", keep["id"], drop["id"]
        )
    await conn.execute("delete from ledger_accounts where contact_id = $1", drop["id"])
    await conn.execute("delete from contacts where id = $1", drop["id"])
    log.info("merged two records for one WhatsApp user")
    return await conn.fetchrow(
        f"update contacts set wa_user_id = $2 where id = $1 returning {_FIELDS}",
        keep["id"], user_id,
    )


async def apply_user_id_update(conn: asyncpg.Connection, previous: str, current: str) -> bool:
    """Meta says a customer's user ID changed. Keep the contact and its history."""
    updated = await conn.execute(
        "update contacts set wa_user_id = $2 where wa_user_id = $1", previous, current
    )
    return updated == "UPDATE 1"
