import logging
from dataclasses import asdict
from datetime import datetime
from uuid import UUID

from alyr.channels.base import InboundMessage
from alyr.channels.meta import DeliveryStatus, UserIdUpdate
from alyr.core import consent, identity, jobs, team
from alyr.core.media import MediaService
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules import router

log = logging.getLogger("alyr.inbound")

INBOUND = "inbound_message"


class InboundHandler:
    """Shared path for every customer message.

    `accept` is all the webhook does: find the tenant, drop duplicates, queue a job.
    `process` is the job: work out who is writing, record the message, let a module
    answer, and queue the answers.
    """

    def __init__(
        self, db: Database, outbound: Outbound, public_web_url: str,
        media: MediaService | None = None,
    ) -> None:
        self._db = db
        self._outbound = outbound
        self._web = public_web_url
        self._media = media

    async def _tenant_for(self, number_id: str):
        async with self._db.unscoped() as conn:
            return await conn.fetchval(
                "select tenant_id from channel_numbers where number_id = $1", number_id
            )

    async def accept(self, message: InboundMessage) -> bool:
        """Return True if the message was queued, False if it was dropped."""
        tenant_id = await self._tenant_for(message.to_number_id)
        if tenant_id is None:
            # Content is deliberately not logged: it is a customer's message.
            log.warning("message for unknown number id %s dropped", message.to_number_id)
            return False
        queued = False
        async with self._db.tenant(tenant_id) as conn:
            first_time = await conn.fetchval(
                "insert into processed_messages (message_id) values ($1) "
                "on conflict do nothing returning true",
                message.message_id,
            )
            if first_time:
                payload = asdict(message)
                payload["received_at"] = message.received_at.isoformat()
                await jobs.enqueue(conn, INBOUND, payload)
                queued = True
        return queued

    async def process(self, tenant_id: UUID, payload: dict) -> None:
        """Job handler for one inbound message."""
        fields = dict(payload)
        fields["received_at"] = datetime.fromisoformat(fields["received_at"])
        message = InboundMessage(**fields)
        async with self._db.tenant(tenant_id) as conn:
            contact = await identity.resolve_contact(
                conn, message.from_number, message.from_user_id,
                message.username, message.profile_name,
            )
            await conn.execute(
                "update contacts set number_id = $1 "
                "where id = $2 and number_id is distinct from $1",
                message.to_number_id, contact["id"],
            )
            await conn.execute(
                "insert into messages (contact_id, direction, kind, body, payload, status, "
                "                      wa_message_id) "
                "values ($1, 'in', $2, $3, $4, 'received', $5)",
                contact["id"], message.kind, message.text,
                ({"reply_id": message.reply_id} if message.reply_id else {})
                | ({"media_id": message.media_id} if message.media_id else {}),
                message.message_id,
            )
            shop = await conn.fetchrow(
                "select name, name_ar from tenants where id = $1", tenant_id
            )
            arabic_name = contact["lang"] == "ar" and shop["name_ar"]
            shop_name = shop["name_ar"] if arabic_name else shop["name"]
            reply = await consent.on_inbound(conn, contact, message, shop_name)
            # A new message reopens a closed conversation. While a person is handling
            # the customer, the assistant stays quiet for typed messages; a tapped
            # button still works, so "Pay now" never goes unanswered.
            was_closed = await conn.fetchval(
                "select inbox_status = 'closed' from contacts where id = $1", contact["id"]
            )
            paused = await conn.fetchval(
                "update contacts set inbox_status = 'open' where id = $1 "
                "returning assistant_paused",
                contact["id"],
            )
            if was_closed and contact["role"] == "customer":
                # On the record, so a manager sees why a "sold" conversation is open again.
                await team.record(
                    conn, "conversation", contact["id"], "reopened", team.CUSTOMER, contact["id"]
                )
            if reply is not None:
                replies = [reply]
            elif paused and contact["role"] == "customer" and not message.reply_id:
                replies = []
            else:
                replies = await router.handle(
                    conn, tenant_id, contact, message, self._web, self._outbound, self._media
                )
            for reply in replies:
                await self._outbound.send(conn, reply)

    async def handle_status(self, status: DeliveryStatus) -> bool:
        """A delivery report from the channel: sent, delivered, read or failed."""
        tenant_id = await self._tenant_for(status.number_id)
        if tenant_id is None:
            return False
        async with self._db.tenant(tenant_id) as conn:
            moved = await self._outbound.record_status(
                conn, status.message_id, status.status, status.error
            )
            if moved:
                # A document the shop's other system is waiting to hear about (ALY-142).
                from alyr.modules.documents import delivery

                await delivery.on_message_status(
                    conn, status.message_id, status.status, status.error)
            return moved

    async def handle_user_id_update(self, update: UserIdUpdate) -> bool:
        """A customer's WhatsApp user ID changed. Return True if a contact was moved."""
        async with self._db.unscoped() as conn:
            tenant_ids = await conn.fetch(
                "select distinct tenant_id from channel_numbers "
                "where number_id = $1 or (waba_id is not null and waba_id = $2)",
                update.number_id, update.waba_id,
            )
        moved = False
        for row in tenant_ids:
            async with self._db.tenant(row["tenant_id"]) as conn:
                moved |= await identity.apply_user_id_update(conn, update.previous, update.current)
        if not moved:
            log.warning("user id update matched no contact")
        return moved
