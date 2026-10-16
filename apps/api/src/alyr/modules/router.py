"""Decides which module answers a customer's message.

Each module is offered the message in turn and may decline. The ledger is last because
it also owns the greeting menu. Only the modules the shop has switched on
(`tenant_modules`) are offered the message (decision D-027).
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
from alyr.core.normalise import has_arabic
from alyr.core.outbound import Outbound
from alyr.modules.bookings import chat as bookings_chat
from alyr.modules.ledger import chat as ledger_chat
from alyr.modules.orders import chat as orders_chat


async def handle(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact: asyncpg.Record,
    message: InboundMessage,
    web_url: str,
    outbound: Outbound,
) -> list[OutboundMessage]:
    rows = await conn.fetch("select module_key from tenant_modules where enabled")
    modules = {r["module_key"] for r in rows}
    if "bookings" in modules:
        replies = await bookings_chat.maybe_handle(
            conn, tenant_id, contact, message, web_url, outbound
        )
        if replies is not None:
            return replies
    if "orders" in modules:
        replies = await orders_chat.maybe_handle(conn, tenant_id, contact, message, web_url)
        if replies is not None:
            return replies
    if "ledger" in modules:
        return await ledger_chat.handle(conn, tenant_id, contact, message, web_url)
    return _acknowledge(contact, message)


def _acknowledge(contact: asyncpg.Record, message: InboundMessage) -> list[OutboundMessage]:
    """When no module answers, the customer still hears that the shop got the message.
    A person replies from the inbox."""
    if contact["role"] == "staff":
        return []
    arabic = contact["lang"] == "ar" or has_arabic(message.text)
    body = (
        "شكراً لرسالتك، سنرد عليك قريباً." if arabic
        else "Thanks for your message. We will reply shortly."
    )
    return [OutboundMessage(to=contact["id"], body=body)]
