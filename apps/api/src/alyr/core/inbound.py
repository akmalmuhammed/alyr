import logging

from alyr.channels.base import InboundMessage
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.ledger import chat as ledger_chat

log = logging.getLogger("alyr.inbound")


class InboundHandler:
    """Shared path for every customer message: find the tenant, drop duplicates,
    record the message, let the module answer, send the answers."""

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
            await conn.execute(
                "insert into messages (phone, direction, kind, body, payload) "
                "values ($1, 'in', $2, $3, $4)",
                message.from_number, message.kind, message.text,
                {"reply_id": message.reply_id} if message.reply_id else {},
            )
            # Module B is the only module so far. Routing by enabled module comes with the next one.
            replies = await ledger_chat.handle(conn, tenant_id, message, self._web)
            await conn.execute(
                "update contacts set number_id = $1 "
                "where phone = $2 and number_id is distinct from $1",
                message.to_number_id, message.from_number,
            )
            for reply in replies:
                await self._outbound.send(conn, reply)
        return True
