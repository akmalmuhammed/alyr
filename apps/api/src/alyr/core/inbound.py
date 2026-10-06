import logging

from alyr.channels.base import Channel, Choice, InboundMessage, OutboundMessage

log = logging.getLogger("alyr.inbound")


class InboundHandler:
    """Shared path for every customer message: tenant lookup, dedupe, then a reply.

    Tenant lookup and dedupe are in memory until the database (ALY-13) and Redis
    sessions (ALY-14) land. Module routing replaces `_reply` once Module B exists.
    """

    def __init__(self, tenants_by_number_id: dict[str, str]) -> None:
        self._tenants = tenants_by_number_id
        self._seen: set[str] = set()

    async def handle(self, message: InboundMessage, channel: Channel) -> bool:
        """Return True if the message was processed, False if it was dropped."""
        tenant = self._tenants.get(message.to_number_id)
        if tenant is None:
            # Content is deliberately not logged: it is a customer's message.
            log.warning("message for unknown number id %s dropped", message.to_number_id)
            return False
        if message.message_id in self._seen:
            return False
        self._seen.add(message.message_id)

        await channel.send(message.to_number_id, self._reply(tenant, message))
        return True

    def _reply(self, tenant: str, message: InboundMessage) -> OutboundMessage:
        return OutboundMessage(
            to_number=message.from_number,
            kind="buttons",
            body=f"Welcome to {tenant}. How can we help?",
            choices=(
                Choice("balance", "My balance"),
                Choice("order", "Place an order"),
                Choice("human", "Talk to staff"),
            ),
        )
