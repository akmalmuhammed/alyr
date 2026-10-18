"""What the order link says in a chat: a customer asks to order and gets their link."""

import re
from uuid import UUID

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
from alyr.core import links
from alyr.core.normalise import has_arabic, western_digits

ORDER_WORDS = ("order", "menu", "catalog", "catalogue", "buy", "shop",
               "اطلب", "أطلب", "طلب", "منتجات", "قائمة")

# "Order table 7", «طلب طاولة 7»: what the shop's public order page offers as the message to
# start with when it was opened from a table's QR code. The table goes into the customer's
# own link, signed.
TABLE = re.compile(r"(?:table|طاول[ةه])\s*#?\s*([a-z0-9]{1,6})", re.IGNORECASE)


def table_in(text: str) -> str:
    """The table label a message names, or an empty string."""
    found = TABLE.search(western_digits(text))
    return links.clean_table(found.group(1).upper()) if found else ""


def order_link(
    web_url: str, slug: str, contact_id: UUID, tenant_id: UUID, table: str = ""
) -> str:
    """The order page link for ONE customer. It carries a signed token, not the bare contact ID
    (`core/links.py`; the ID is inside the token, readable by whoever holds the link, and
    alone it grants nothing here): whoever holds the link is that customer until the token
    runs out, and a link that is edited, or made for another shop, is refused."""
    return links.order_url(web_url, slug, tenant_id, contact_id, table)


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
    table = table_in(message.text)
    link = order_link(web_url, slug, contact["id"], tenant_id, table)
    arabic = contact["lang"] == "ar" or has_arabic(message.text)
    if table:
        body = (
            f"تفضل، اختر طلبك لطاولة {table} من هنا: {link}" if arabic
            else f"Here is our order page for table {table}. Pick what you need: {link}"
        )
    else:
        body = (
            f"تفضل، اختر طلبك من هنا: {link}" if arabic
            else f"Here is our order page. Pick what you need: {link}"
        )
    return [OutboundMessage(to=contact["id"], body=body)]
