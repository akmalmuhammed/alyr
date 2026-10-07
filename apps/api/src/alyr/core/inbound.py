import logging

from alyr.channels.base import InboundMessage
from alyr.channels.meta import UserIdUpdate
from alyr.core import identity
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules import router

log = logging.getLogger("alyr.inbound")


class InboundHandler:
    """Shared path for every customer message: find the tenant, drop duplicates, work out
    who is writing, record the message, let the module answer, send the answers."""

    def __init__(self, db: Database, outbound: Outbound, public_web_url: str) -> None:
        self._db = db
        self._outbound = outbound
        self._web = public_web_url

    async def handle(self, message: InboundMessage) -> bool:
        """Return True if the message was processed, False if it was dropped."""
        async with self._db.unscoped() as conn:
            tenant_id = await conn.fetchval(
                "select tenant_id from channel_numbers where number_id = $1",
                message.to_number_id,
            )
        if tenant_id is None:
            # Content is deliberately not logged: it is a customer's message.
            log.warning("message for unknown number id %s dropped", message.to_number_id)
            return False

        async with self._db.tenant(tenant_id) as conn:
            first_time = await conn.fetchval(
                "insert into processed_messages (message_id) values ($1) "
                "on conflict do nothing returning true",
                message.message_id,
            )
            if not first_time:
                return False
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
                "insert into messages (contact_id, direction, kind, body, payload) "
                "values ($1, 'in', $2, $3, $4)",
                contact["id"], message.kind, message.text,
                {"reply_id": message.reply_id} if message.reply_id else {},
            )
            replies = await router.handle(conn, tenant_id, contact, message, self._web)
            for reply in replies:
                await self._outbound.send(conn, reply)
        return True

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
