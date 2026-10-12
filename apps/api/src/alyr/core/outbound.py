from dataclasses import dataclass
from uuid import UUID

import asyncpg

from alyr.channels.base import Address, Channel, Choice, OutboundMessage
from alyr.core import consent, jobs
from alyr.db import Database

SEND = "send_message"


@dataclass(frozen=True)
class SendResult:
    """What the outbound layer did with a message. `blocked` is the reason it was
    refused (window_closed, no_consent, opted_out, no_marketing_consent), or None."""

    message_id: UUID
    blocked: str | None = None


class Outbound:
    """The only way a message leaves Alyr. Modules hand messages here; they never call a
    channel themselves. Meta's rules are enforced here, in one place: free-form text only
    inside the 24-hour window, templates only to customers who agreed, nothing to a
    customer who said stop. Messaging limits come next (ALY-41).

    A refused message is still recorded, marked blocked with the reason, so the shop
    can see that something was not sent and why.

    `send` records the message and queues a job in the caller's transaction. The job
    runner calls `deliver` afterwards, so a slow or failing channel never loses a
    message and never holds a web request open.
    """

    def __init__(self, channels: dict[str, Channel], db: Database | None = None) -> None:
        self.channels = channels
        self._db = db

    async def send(self, conn: asyncpg.Connection, message: OutboundMessage) -> SendResult:
        """Queue a message to a contact, or record why it may not be sent.
        `conn` must be tenant-scoped."""
        contact = await conn.fetchrow(
            "select consent_service, consent_marketing, "
            "coalesce(last_inbound_at > now() - interval '24 hours', false) as window_open "
            "from contacts where id = $1",
            message.to,
        )
        if contact is None:
            raise LookupError("no such contact for this tenant")
        blocked = consent.refusal(contact, message)
        kind = message.kind
        payload: dict = {}
        if message.choices:
            payload["choices"] = [{"id": c.id, "title": c.title} for c in message.choices]
        if message.kind == "template":
            payload["template"] = message.template_name
            payload["category"] = message.template_category
            # While the customer's 24-hour window is open, a notice goes as an ordinary
            # message: it costs nothing and needs no template approved by Meta. Outside
            # the window only the template will do. Consent was checked above on the
            # original, so a customer who said stop still gets nothing. Marketing always
            # stays a template, so every offer is counted and can be opted out of.
            if contact["window_open"] and message.template_category != "marketing":
                kind = "text"
                payload["sent_as"] = "text"
        message_id = await conn.fetchval(
            "insert into messages (contact_id, direction, kind, body, payload, status, error) "
            "values ($1, 'out', $2, $3, $4, $5, $6) returning id",
            message.to, kind, message.body, payload,
            "blocked" if blocked else "queued", blocked,
        )
        if not blocked:
            await jobs.enqueue(conn, SEND, {"message_id": str(message_id)})
        return SendResult(message_id, blocked)

    async def deliver(self, tenant_id: UUID, payload: dict) -> None:
        """Job handler: hand one queued message to its channel."""
        message_id = UUID(payload["message_id"])
        async with self._db.tenant(tenant_id) as conn:
            row = await conn.fetchrow(
                "select m.contact_id, m.kind, m.body, m.payload, m.status, "
                "       c.phone, c.wa_user_id, c.number_id "
                "from messages m join contacts c on c.id = m.contact_id where m.id = $1",
                message_id,
            )
            if row is None or row["status"] != "queued":
                return  # already sent, or the message is gone: nothing to do
            # Use the number this contact already talks to; otherwise the tenant's first.
            number = await conn.fetchrow(
                "select number_id, channel from channel_numbers "
                "where tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid "
                "order by (number_id = $1) desc nulls last, channel limit 1",
                row["number_id"],
            )
        if number is None:
            raise RuntimeError("tenant has no connected number")
        stored = row["payload"]
        message = OutboundMessage(
            to=row["contact_id"], kind=row["kind"], body=row["body"],
            choices=tuple(Choice(c["id"], c["title"]) for c in stored.get("choices", [])),
            template_name=stored.get("template", ""),
            template_category=stored.get("category"),
        )
        provider_id = await self.channels[number["channel"]].send(
            number["number_id"], message,
            Address(phone=row["phone"], user_id=row["wa_user_id"]),
        )
        async with self._db.tenant(tenant_id) as conn:
            await conn.execute(
                "update messages set status = 'sent', wa_message_id = $2, error = null "
                "where id = $1 and status = 'queued'",
                message_id, provider_id,
            )

    async def gave_up(self, tenant_id: UUID, payload: dict) -> None:
        """Job dead-letter handler: the message could not be sent after every retry."""
        async with self._db.tenant(tenant_id) as conn:
            await conn.execute(
                "update messages set status = 'failed', error = 'could not be delivered' "
                "where id = $1 and status = 'queued'",
                UUID(payload["message_id"]),
            )

    async def record_status(
        self, conn: asyncpg.Connection, provider_id: str, status: str, error: str = ""
    ) -> bool:
        """Apply a delivery report from the channel. Reports can arrive out of order, so
        a message only ever moves forward: sent, delivered, read."""
        order = {"sent": 1, "delivered": 2, "read": 3}
        if status == "failed":
            updated = await conn.execute(
                "update messages set status = 'failed', error = $2 where wa_message_id = $1",
                provider_id, error[:300] or "the channel reported a failure",
            )
            return updated == "UPDATE 1"
        if status not in order:
            return False
        earlier = [name for name, rank in order.items() if rank < order[status]]
        updated = await conn.execute(
            "update messages set status = $2 where wa_message_id = $1 and status = any($3)",
            provider_id, status, earlier,
        )
        return updated == "UPDATE 1"
