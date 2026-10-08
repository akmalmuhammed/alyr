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


def _assignee(row) -> dict | None:
    if row["assigned_to"] is None:
        return None
    return {"id": str(row["assigned_to"]), "name": row["assignee_name"]}


async def conversations(
    conn: asyncpg.Connection, status: str = "open", assigned: str = "any",
    me: UUID | None = None,
) -> list[dict]:
    """Customers who have written to the shop, newest activity first."""
    rows = await conn.fetch(
        "select c.id, c.name, c.phone, c.username, c.inbox_status, c.assistant_paused, "
        f"      c.consent_service, {_WINDOW} as window_open, "
        "       c.last_inbound_at + interval '24 hours' as window_closes_at, "
        "       last.body, last.direction, last.kind, last.status, last.created_at, "
        "       c.assigned_to, u.name as assignee_name, "
        "       (select count(*) from messages m where m.contact_id = c.id "
        "          and m.direction = 'in' "
        "          and m.created_at > coalesce(c.inbox_read_at, '-infinity'))::int as unread "
        "from contacts c left join users u on u.id = c.assigned_to "
        "join lateral (select body, direction, kind, status, created_at from messages m "
        "              where m.contact_id = c.id order by created_at desc limit 1) last on true "
        # Only customers who have written: a reminder run must not fill the inbox.
        "where c.role = 'customer' and c.last_inbound_at is not null "
        "  and ($1 = 'all' or c.inbox_status = $1) "
        "  and ($2 = 'any' or ($2 = 'none' and c.assigned_to is null) "
        "       or ($2 = 'me' and c.assigned_to = $3)) "
        "order by last.created_at desc",
        status, assigned, me,
    )
    return [
        {
            "id": str(r["id"]), "name": r["name"], "phone": r["phone"],
            "username": r["username"], "status": r["inbox_status"],
            "assistant_paused": r["assistant_paused"],
            "opted_out": r["consent_service"] == "revoked",
            "window_open": r["window_open"],
            "window_closes_at": _iso(r["window_closes_at"]) if r["window_open"] else None,
            "unread": r["unread"], "assigned": _assignee(r),
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
        "       c.last_inbound_at + interval '24 hours' as window_closes_at, "
        "       c.assigned_to, u.name as assignee_name "
        "from contacts c left join users u on u.id = c.assigned_to "
        "where c.id = $1 and c.role = 'customer'",
        contact_id,
    )
    if contact is None:
        return None
    rows = await conn.fetch(
        "select id, direction, kind, body, payload, status, error, sent_by, created_at "
        "from messages where contact_id = $1 order by created_at",
        contact_id,
    )
    notes = await conn.fetch(
        "select id, body, author_name, created_at from inbox_notes "
        "where contact_id = $1 order by created_at",
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
            "assigned": _assignee(contact),
        },
        "notes": [
            {**dict(n), "id": str(n["id"]), "created_at": _iso(n["created_at"])} for n in notes
        ],
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
    conn: asyncpg.Connection, outbound: Outbound, contact_id: UUID, text: str, sent_by: str,
    sender_id: UUID | None = None,
) -> dict:
    """Send a typed reply from a staff member. Answering by hand pauses the assistant for
    this customer, reopens the conversation, and takes it if nobody has it yet."""
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
            "inbox_read_at = clock_timestamp(), assigned_to = coalesce(assigned_to, $2) "
            "where id = $1",
            contact_id, sender_id,
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


async def assign(conn: asyncpg.Connection, contact_id: UUID, user_id: UUID | None) -> bool:
    """Give a conversation to a team member, or to nobody. Only people who work for
    this shop can be given one."""
    if user_id is not None:
        member = await conn.fetchval(
            "select true from memberships where user_id = $1 "
            "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
            user_id,
        )
        if not member:
            raise InboxError("that person is not on this shop's team")
    updated = await conn.execute(
        "update contacts set assigned_to = $2 where id = $1 and role = 'customer'",
        contact_id, user_id,
    )
    return updated == "UPDATE 1"


async def add_note(
    conn: asyncpg.Connection, contact_id: UUID, text: str, author_id: UUID | None,
    author_name: str,
) -> str:
    """A note only staff can see. It is never sent to the customer."""
    text = text.strip()
    if not text:
        raise InboxError("the note is empty")
    known = await conn.fetchval(
        "select true from contacts where id = $1 and role = 'customer'", contact_id
    )
    if not known:
        raise LookupError("no such customer")
    note_id = await conn.fetchval(
        "insert into inbox_notes (contact_id, body, author_id, author_name) "
        "values ($1, $2, $3, $4) returning id",
        contact_id, text, author_id, author_name,
    )
    return str(note_id)


async def saved_replies(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch("select id, title, body from saved_replies order by created_at")
    return [{"id": str(r["id"]), "title": r["title"], "body": r["body"]} for r in rows]


async def save_reply(conn: asyncpg.Connection, title: str, body: str) -> str:
    title, body = title.strip(), body.strip()
    if not title or not body:
        raise InboxError("a saved reply needs a title and a text")
    reply_id = await conn.fetchval(
        "insert into saved_replies (title, body) values ($1, $2) returning id", title, body
    )
    return str(reply_id)


async def delete_saved_reply(conn: asyncpg.Connection, reply_id: UUID) -> bool:
    return await conn.execute("delete from saved_replies where id = $1", reply_id) == "DELETE 1"
