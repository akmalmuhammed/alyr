"""Decides which module answers a customer's message.

Each module is offered the message in turn and may decline. The ledger is last because
it also owns the greeting menu. Only the modules the shop has switched on
(`tenant_modules`) are offered the message (decision D-027).

The Catalog (D-039) is three more things in that line: for a registered staff number, its
commands and photos (`wa_staff`); for a customer, an item named by its code, link or SKU and the
order that follows (`wa_order`, ALY-136), then item names and the menu (`wa_customer`).
Both only in a shop whose `catalog` module is on. A number that is not registered staff
never reaches the commands, whatever it writes.
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
from alyr.core.media import MediaService
from alyr.core.normalise import has_arabic
from alyr.core.outbound import Outbound
from alyr.modules import report
from alyr.modules.bookings import chat as bookings_chat
from alyr.modules.items import wa_customer, wa_order, wa_staff
from alyr.modules.ledger import chat as ledger_chat
from alyr.modules.orders import chat as orders_chat
from alyr.modules.owner import chat as owner_chat


async def handle(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact: asyncpg.Record,
    message: InboundMessage,
    web_url: str,
    outbound: Outbound,
    media: MediaService | None = None,
) -> list[OutboundMessage]:
    # A staff number asking about the shop, or anyone proving a phone with LINK (D-065).
    replies = await owner_chat.maybe_handle(conn, contact, message)
    if replies is not None:
        return replies
    rows = await conn.fetch("select module_key from tenant_modules where enabled")
    modules = {r["module_key"] for r in rows}
    if contact["role"] == "staff":
        replies = await report.on_staff_message(conn, contact, message)
        if replies is not None:
            return replies
        if "catalog" in modules:
            replies = await wa_staff.maybe_handle(conn, contact, message)
            if replies is not None:
                return replies
    if "catalog" in modules and contact["role"] != "staff" and media is not None:
        # An item named by its code, its link or its SKU, and the answers to the questions that
        # follow (Confirm, Change, Place order). Before the other modules, so that a code is
        # never taken for something else; a message with no code in it passes through.
        replies = await wa_order.maybe_handle(
            conn, tenant_id, contact, message, web_url, media, outbound, "orders" in modules
        )
        if replies is not None:
            return replies
    if "bookings" in modules:
        replies = await bookings_chat.maybe_handle(
            conn, tenant_id, contact, message, web_url, outbound
        )
        if replies is not None:
            return replies
    if "catalog" in modules and contact["role"] != "staff" and media is not None:
        replies = await wa_customer.maybe_handle(
            conn, tenant_id, contact, message, web_url, media, "orders" in modules
        )
        if replies is not None:
            return replies
    if "orders" in modules:
        replies = await orders_chat.maybe_handle(conn, tenant_id, contact, message, web_url)
        if replies is not None:
            return replies
    if "ledger" in modules:
        return await ledger_chat.handle(conn, tenant_id, contact, message, web_url)
    if "bookings" in modules and contact["role"] != "staff":
        return await bookings_chat.greeting(conn, tenant_id, contact, message)
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
