"""What the order link says in a chat: a customer asks to order and gets their link."""

from uuid import UUID

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
from alyr.core.normalise import has_arabic

ORDER_WORDS = ("order", "menu", "catalog", "catalogue", "buy", "shop",
               "اطلب", "أطلب", "طلب", "منتجات", "قائمة")


def order_link(web_url: str, slug: str, contact_id: UUID) -> str:
    # The link carries the contact, so the order page knows who is ordering without
    # asking them to type anything. The ID is random and not guessable.
    return f"{web_url}/s/{slug}?c={contact_id}"


async def maybe_handle(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact: asyncpg.Record,
    message: InboundMessage,
    web_url: str,
) -> list[OutboundMessage] | None:
    """Answer if this message is about ordering; otherwise return None so another
    module can take it."""
    if contact["role"] == "staff":
        return None
    text = message.text.lower()
    wants_order = message.reply_id == "order" or (
        not message.reply_id and any(word in text for word in ORDER_WORDS)
    )
    if not wants_order:
        return None
    slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
    if not slug:
        return None
    link = order_link(web_url, slug, contact["id"])
    arabic = contact["lang"] == "ar" or has_arabic(message.text)
    body = (
        f"تفضل، اختر طلبك من هنا: {link}" if arabic
        else f"Here is our order page. Pick what you need: {link}"
    )
    return [OutboundMessage(to=contact["id"], body=body)]
