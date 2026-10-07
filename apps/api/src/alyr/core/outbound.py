from uuid import UUID

import asyncpg

from alyr.channels.base import Address, Channel, Choice, OutboundMessage
from alyr.core import jobs
from alyr.db import Database

SEND = "send_message"


class Outbound:
    """The only way a message leaves Alyr. Modules hand messages here; they never call a
    channel themselves. Consent, the 24-hour window and messaging limits are enforced
    here when they are built (ALY-40, ALY-41).

    `send` records the message and queues a job in the caller's transaction. The job
    runner calls `deliver` afterwards, so a slow or failing channel never loses a
    message and never holds a web request open.
    """

    def __init__(self, channels: dict[str, Channel], db: Database | None = None) -> None:
        self.channels = channels
        self._db = db

    async def send(self, conn: asyncpg.Connection, message: OutboundMessage) -> UUID:
        """Queue a message to a contact. `conn` must be tenant-scoped."""
        exists = await conn.fetchval("select 1 from contacts where id = $1", message.to)
        if not exists:
            raise LookupError("no such contact for this tenant")
        payload: dict = {}
        if message.choices:
            payload["choices"] = [{"id": c.id, "title": c.title} for c in message.choices]
        if message.kind == "template":
            payload["template"] = message.template_name
            payload["category"] = message.template_category
        message_id = await conn.fetchval(
            "insert into messages (contact_id, direction, kind, body, payload, status) "
            "values ($1, 'out', $2, $3, $4, 'queued') returning id",
            message.to, message.kind, message.body, payload,
        )
        await jobs.enqueue(conn, SEND, {"message_id": str(message_id)})
        return message_id

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
