"""The shared inbox: every customer conversation, for staff to read and answer by hand.

Replies go through the outbound layer like every other message, so the 24-hour window
and consent rules apply to people exactly as they do to the assistant.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core.outbound import Outbound

_WINDOW = "coalesce(c.last_inbound_at > now() - interval '24 hours', false)"


class InboxError(Exception):
    """A request the inbox cannot carry out; the message is safe to show to staff."""


def _iso(value) -> str | None:
    return value.isoformat() if value else None


async def conversations(conn: asyncpg.Connection, status: str = "open") -> list[dict]:
    """Customers who have written to the shop, newest activity first."""
    rows = await conn.fetch(
        "select c.id, c.name, c.phone, c.username, c.inbox_status, c.assistant_paused, "
        f"      c.consent_service, {_WINDOW} as window_open, "
        "       c.last_inbound_at + interval '24 hours' as window_closes_at, "
        "       last.body, last.direction, last.kind, last.status, last.created_at, "
        "       (select count(*) from messages m where m.contact_id = c.id "
        "          and m.direction = 'in' "
        "          and m.created_at > coalesce(c.inbox_read_at, '-infinity'))::int as unread "
        "from contacts c "
        "join lateral (select body, direction, kind, status, created_at from messages m "
        "              where m.contact_id = c.id order by created_at desc limit 1) last on true "
        # Only customers who have written: a reminder run must not fill the inbox.
        "where c.role = 'customer' and c.last_inbound_at is not null "
        "  and ($1 = 'all' or c.inbox_status = $1) "
        "order by last.created_at desc",
        status,
    )
    return [
        {
            "id": str(r["id"]), "name": r["name"], "phone": r["phone"],
            "username": r["username"], "status": r["inbox_status"],
            "assistant_paused": r["assistant_paused"],
            "opted_out": r["consent_service"] == "revoked",
            "window_open": r["window_open"],
            "window_closes_at": _iso(r["window_closes_at"]) if r["window_open"] else None,
            "unread": r["unread"],
            "last": {
                "body": r["body"], "direction": r["direction"], "kind": r["kind"],
                "status": r["status"], "created_at": _iso(r["created_at"]),
            },
        }
        for r in rows
    ]


async def thread(conn: asyncpg.Connection, contact_id: UUID) -> dict | None:
    contact = await conn.fetchrow(
        "select c.id, c.name, c.phone, c.username, c.inbox_status, c.assistant_paused, "
        f"      c.consent_service, {_WINDOW} as window_open, "
        "       c.last_inbound_at + interval '24 hours' as window_closes_at "
        "from contacts c where c.id = $1 and c.role = 'customer'",
        contact_id,
    )
    if contact is None:
        return None
    rows = await conn.fetch(
        "select id, direction, kind, body, payload, status, error, sent_by, created_at "
        "from messages where contact_id = $1 order by created_at",
        contact_id,
    )
    return {
        "customer": {
            "id": str(contact["id"]), "name": contact["name"], "phone": contact["phone"],
            "username": contact["username"], "status": contact["inbox_status"],
            "assistant_paused": contact["assistant_paused"],
            "opted_out": contact["consent_service"] == "revoked",
            "window_open": contact["window_open"],
            "window_closes_at": (
                _iso(contact["window_closes_at"]) if contact["window_open"] else None
            ),
        },
        "messages": [
            {**dict(r), "id": str(r["id"]), "created_at": _iso(r["created_at"])} for r in rows
        ],
    }


async def mark_read(conn: asyncpg.Connection, contact_id: UUID) -> bool:
    updated = await conn.execute(
        "update contacts set inbox_read_at = clock_timestamp() "
        "where id = $1 and role = 'customer'",
        contact_id,
    )
    return updated == "UPDATE 1"


async def reply(
    conn: asyncpg.Connection, outbound: Outbound, contact_id: UUID, text: str, sent_by: str
) -> dict:
    """Send a typed reply from a staff member. Answering by hand pauses the assistant for
    this customer and reopens the conversation."""
    text = text.strip()
    if not text:
        raise InboxError("the reply is empty")
    known = await conn.fetchval(
        "select true from contacts where id = $1 and role = 'customer'", contact_id
    )
    if not known:
        raise LookupError("no such customer")
    result = await outbound.send(conn, OutboundMessage(to=contact_id, body=text))
    await conn.execute("update messages set sent_by = $2 where id = $1", result.message_id, sent_by)
    if result.blocked is None:
        await conn.execute(
            "update contacts set assistant_paused = true, inbox_status = 'open', "
            "inbox_read_at = clock_timestamp() where id = $1",
            contact_id,
        )
    return {"message_id": str(result.message_id), "blocked": result.blocked}


async def set_status(conn: asyncpg.Connection, contact_id: UUID, status: str) -> bool:
    """Close or reopen a conversation. Closing hands the customer back to the assistant."""
    if status not in ("open", "closed"):
        raise InboxError("status must be open or closed")
    updated = await conn.execute(
        "update contacts set inbox_status = $2, "
        "assistant_paused = assistant_paused and $2 = 'open', "
        "inbox_read_at = case when $2 = 'closed' then clock_timestamp() else inbox_read_at end "
        "where id = $1 and role = 'customer'",
        contact_id, status,
    )
    return updated == "UPDATE 1"


async def set_assistant(conn: asyncpg.Connection, contact_id: UUID, paused: bool) -> bool:
    updated = await conn.execute(
        "update contacts set assistant_paused = $2 where id = $1 and role = 'customer'",
        contact_id, paused,
    )
    return updated == "UPDATE 1"
