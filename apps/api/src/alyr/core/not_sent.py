"""Messages that did not reach a customer, and sending one again (specs/036).

A message ALYR or the shop sent can end two ways short of the customer's phone:

* `blocked`: the outbound layer refused it (no consent, the customer said stop, or free text
  outside the 24-hour window). It never left ALYR.
* `failed`: it was let through but did not arrive. Either the job gave up after every retry
  ("could not be delivered": ALYR could not hand it to WhatsApp), or WhatsApp reported a
  failure in its own words.

`listing` is what the workspace's "Not sent" screen reads. `retry` sends one again, through
the same checks the outbound layer makes on a new message, against the customer's consent and
window as they are now: a customer who said stop since is never sent it. Every function takes
a tenant-scoped connection.
"""

from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core import consent, jobs, team, templates
from alyr.core.outbound import SEND
from alyr.core.team import Actor

DAYS = 14
GAVE_UP = "could not be delivered"

# What the outbound layer records for a refusal (`consent.refusal`), as the screen names it.
BLOCKED = {"window_closed", "no_consent", "opted_out", "no_marketing_consent",
           "no_back_in_stock_consent"}

_ROW = (
    "select m.id, m.contact_id, m.kind, m.body, m.payload, m.status, m.error, m.created_at, "
    "       c.name, c.phone, c.consent_service, c.consent_marketing, c.consent_back_in_stock, "
    "       coalesce(c.last_inbound_at > now() - interval '24 hours', false) as window_open "
    "from messages m join contacts c on c.id = m.contact_id "
    "where m.direction = 'out' "
)


def reason(status: str, error: str | None) -> str:
    """The reason as the screen names it: one of BLOCKED, `gave_up` or `whatsapp`."""
    if status == "blocked":
        return error if error in BLOCKED else "no_consent"
    return "gave_up" if error == GAVE_UP else "whatsapp"


def _file_lost(row: asyncpg.Record) -> bool:
    """A refused message's picture or file was never kept (`Outbound.send`), so it cannot go
    again without it."""
    if row["status"] != "blocked":
        return False
    if row["kind"] in ("image", "document"):
        return True
    header = templates.CATALOGUE.get(row["payload"].get("template", ""))
    return header is not None and header.header in ("image", "document")


def refusal_now(row: asyncpg.Record) -> str | None:
    """Why this message may not go now, or None. The same rule as `consent.refusal`, applied
    to what the message was: a notice sent as ordinary text inside the window is still the
    template it stood for, so its consent is the template's; and as text it also needs the
    window open, now."""
    stored = row["payload"]
    if stored.get("template"):
        as_template = OutboundMessage(
            to=row["contact_id"], kind="template", template_name=stored["template"],
            template_category=stored.get("category"),
        )
        why = consent.refusal(row, as_template)
        if why is None and row["kind"] != "template" and not row["window_open"]:
            why = "window_closed"
        return why
    kind = "document" if row["kind"] == "document" else "text"
    return consent.refusal(row, OutboundMessage(to=row["contact_id"], kind=kind))


def _entry(row: asyncpg.Record) -> dict:
    why = reason(row["status"], row["error"])
    lost = _file_lost(row)
    now = None if lost else refusal_now(row)
    return {
        "id": str(row["id"]),
        "contact_id": str(row["contact_id"]),
        "customer": row["name"] or "",
        "phone": row["phone"],
        "body": row["body"][:280],
        "status": row["status"],
        "reason": why,
        # WhatsApp's own words, in English, when it was WhatsApp that refused it.
        "whatsapp_said": row["error"] if why == "whatsapp" else None,
        "created_at": row["created_at"].isoformat(),
        "can_retry": not lost and now is None,
        "why_not": "file_lost" if lost else now,
    }


async def listing(conn: asyncpg.Connection) -> list[dict]:
    """The last DAYS days of messages that did not reach a customer, newest first."""
    rows = await conn.fetch(
        _ROW + f"and m.status in ('failed', 'blocked') "
        f"and m.created_at > now() - interval '{DAYS} days' "
        "order by m.created_at desc limit 100"
    )
    return [_entry(r) for r in rows]


class NotSendable(Exception):
    def __init__(self, why: str) -> None:
        super().__init__(why)
        self.why = why


async def retry(conn: asyncpg.Connection, message_id: UUID, actor: Actor) -> None:
    """Send one message again. Raises LookupError if there is no such message that did not
    reach its customer, and NotSendable with the reason if it may not go now."""
    row = await conn.fetchrow(
        _ROW + "and m.id = $1 and m.status in ('failed', 'blocked') for update of m", message_id
    )
    if row is None:
        raise LookupError("no such message")
    if _file_lost(row):
        raise NotSendable("file_lost")
    why = refusal_now(row)
    if why is not None:
        if row["status"] == "blocked" and why != row["error"]:
            # Still refused, for a different reason now: say the one that holds today.
            await conn.execute("update messages set error = $2 where id = $1", message_id, why)
        raise NotSendable(why)
    await conn.execute(
        "update messages set status = 'queued', error = null where id = $1", message_id
    )
    # The job that gave up is sent round again; a message WhatsApp refused, or one that was
    # never let through, gets a new job.
    parked = await conn.fetchval(
        "select id from jobs where kind = $1 and status = 'failed' "
        "and payload->>'message_id' = $2 order by created_at desc limit 1",
        SEND, str(message_id),
    )
    if parked is None or not await jobs.retry(conn, parked):
        await jobs.enqueue(conn, SEND, {"message_id": str(message_id)})
    await team.record(
        conn, "conversation", row["contact_id"], "message_retried", actor, row["contact_id"],
        {"message_id": str(message_id)},
    )


async def failed_recently(
    conn: asyncpg.Connection, now: datetime, hours: int = 48
) -> list[asyncpg.Record]:
    """Messages that failed (not those refused by rule) in the `hours` before `now`, newest
    first: what ALYR Agent puts under "Needs you now"."""
    return await conn.fetch(
        "select m.id, m.created_at, c.name from messages m "
        "join contacts c on c.id = m.contact_id "
        "where m.direction = 'out' and m.status = 'failed' "
        "and m.created_at > $1::timestamptz - make_interval(hours => $2) "
        "and m.created_at <= $1 order by m.created_at desc",
        now, hours,
    )
