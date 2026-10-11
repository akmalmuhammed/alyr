"""Decides which module answers a customer's message.

Each module is offered the message in turn and may decline. The ledger is last because
it also owns the greeting menu. Offering only the modules a tenant has switched on
(`tenant_modules`) comes with sign-in and module settings (ALY-18).
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
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
    replies = await bookings_chat.maybe_handle(
        conn, tenant_id, contact, message, web_url, outbound
    )
    if replies is not None:
        return replies
    replies = await orders_chat.maybe_handle(conn, tenant_id, contact, message, web_url)
    if replies is not None:
        return replies
    return await ledger_chat.handle(conn, tenant_id, contact, message, web_url)
