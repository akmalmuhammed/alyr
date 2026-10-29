"""The shared inbox: every customer conversation, for staff to read and answer by hand.

Replies go through the outbound layer like every other message, so the 24-hour window
and consent rules apply to people exactly as they do to the assistant.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core import team
from alyr.core.outbound import Outbound
from alyr.core.team import Actor

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
        "       c.assigned_to, u.name as assignee_name, c.price_group_id "
        "from contacts c left join users u on u.id = c.assigned_to "
        "where c.id = $1 and c.role = 'customer' and c.forgotten_at is null",
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
            # The customer's price group (wholesale), or null for the shop's default.
            "price_group_id": str(contact["price_group_id"]) if contact["price_group_id"]
            else None,
        },
        "notes": [
            {**dict(n), "id": str(n["id"]), "created_at": _iso(n["created_at"])} for n in notes
        ],
        "activity": await team.history(conn, contact_id),
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
    this customer, reopens the conversation, and takes it if nobody has it yet. If the
    shop signs replies, the sender's first name goes under the text."""
    text = text.strip()
    if not text:
        raise InboxError("the reply is empty")
    known = await conn.fetchval(
        "select true from contacts where id = $1 and role = 'customer' "
        "and forgotten_at is null", contact_id
    )
    if not known:
        raise LookupError("no such customer")
    if await team.sign_replies(conn):
        text = team.signed(text, sent_by)
    result = await outbound.send(conn, OutboundMessage(to=contact_id, body=text))
    await conn.execute(
        "update messages set sent_by = $2, sent_by_user = $3 where id = $1",
        result.message_id, sent_by, sender_id,
    )
    if result.blocked is None:
        await conn.execute(
            "update contacts set assistant_paused = true, inbox_status = 'open', "
            "inbox_read_at = clock_timestamp() where id = $1",
            contact_id,
        )
        await team.claim(conn, "conversation", contact_id, Actor(sender_id, sent_by))
    return {"message_id": str(result.message_id), "blocked": result.blocked}


async def set_status(
    conn: asyncpg.Connection, contact_id: UUID, status: str, actor: Actor = team.ASSISTANT,
    outcome: str | None = None, reason: str | None = None,
) -> bool:
    """Close or reopen a conversation. Closing hands the customer back to the assistant
    and records how it ended: sold, booked, answered, or lost and why."""
    if status not in ("open", "closed"):
        raise InboxError("status must be open or closed")
    if status == "closed":
        if outcome is not None and outcome not in team.OUTCOMES:
            raise InboxError("outcome must be sold, booked, answered or lost")
        if reason is not None and (outcome != "lost" or reason not in team.LOST_REASONS):
            raise InboxError("a reason is given only for a lost customer, from the list")
    before = await conn.fetchval(
        "select inbox_status from contacts where id = $1 and role = 'customer'", contact_id
    )
    if before is None:
        return False
    await conn.execute(
        "update contacts set inbox_status = $2, "
        "assistant_paused = assistant_paused and $2 = 'open', "
        "inbox_read_at = case when $2 = 'closed' then clock_timestamp() else inbox_read_at end "
        "where id = $1",
        contact_id, status,
    )
    if before != status:
        await team.record(
            conn, "conversation", contact_id, "closed" if status == "closed" else "reopened",
            actor, contact_id,
            {"outcome": outcome, "reason": reason} if status == "closed" else None,
        )
    return True


async def set_assistant(conn: asyncpg.Connection, contact_id: UUID, paused: bool) -> bool:
    updated = await conn.execute(
        "update contacts set assistant_paused = $2 where id = $1 and role = 'customer'",
        contact_id, paused,
    )
    return updated == "UPDATE 1"


async def assign(
    conn: asyncpg.Connection, contact_id: UUID, user_id: UUID | None,
    actor: Actor = team.ASSISTANT,
) -> bool:
    """Give a conversation to a team member, or to nobody. Only people who work for
    this shop can be given one."""
    try:
        return await team.assign(conn, "conversation", contact_id, user_id, actor)
    except team.TeamError as error:
        raise InboxError(str(error)) from error


async def add_note(
    conn: asyncpg.Connection, contact_id: UUID, text: str, author_id: UUID | None,
    author_name: str,
) -> str:
    """A note only staff can see. It is never sent to the customer."""
    text = text.strip()
    if not text:
        raise InboxError("the note is empty")
    known = await conn.fetchval(
        "select true from contacts where id = $1 and role = 'customer' "
        "and forgotten_at is null", contact_id
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
