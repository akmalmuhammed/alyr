"""What the order link says in a chat: a customer asks to order and gets their link, and an
order shop's welcome when nothing more specific applies (ALY-272)."""

import re
from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core import links
from alyr.core.normalise import has_arabic, western_digits
from alyr.modules.items import match

ORDER_WORDS = ("order", "menu", "catalog", "catalogue", "buy", "shop",
               "اطلب", "أطلب", "طلب", "منتجات", "قائمة")

# "Order table 7", «طلب طاولة 7»: what the shop's public order page offers as the message to
# start with when it was opened from a table's QR code. The table goes into the customer's
# own link, signed.
TABLE = re.compile(r"(?:table|طاول[ةه])\s*#?\s*([a-z0-9]{1,6})", re.IGNORECASE)

# A message that is only a greeting gets the welcome every time (folded as item names are).
HELLO = {
    " ".join(match.tokens(w)) for w in (
        "hello", "hi", "hey", "salam", "salaam", "assalamu alaikum", "good morning",
        "good evening", "مرحبا", "مرحباً", "هلا", "اهلا", "أهلاً", "السلام عليكم", "سلام عليكم",
        "صباح الخير", "مساء الخير",
    )
}


def table_in(text: str) -> str:
    """The table label a message names, or an empty string."""
    found = TABLE.search(western_digits(text))
    return links.clean_table(found.group(1).upper()) if found else ""


def order_link(
    web_url: str, slug: str, contact_id: UUID, tenant_id: UUID, table: str = "",
    item: UUID | str = "",
) -> str:
    """The order page link for ONE customer. It carries a signed token, not the bare contact ID
    (`core/links.py`; the ID is inside the token, readable by whoever holds the link, and
    alone it grants nothing here): whoever holds the link is that customer until the token
    runs out, and a link that is edited, or made for another shop, is refused."""
    return links.order_url(web_url, slug, tenant_id, contact_id, table, item)


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
    # "menu" is the welcome's button, when the Catalog has nothing on sale to list.
    wants_order = message.reply_id in ("order", "menu") or (
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


async def greeting(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact: asyncpg.Record,
    message: InboundMessage,
    web_url: str,
    orders_on: bool,
    catalog_on: bool,
) -> list[OutboundMessage] | None:
    """The welcome an order shop answers with when no module took the message (ALY-272): the
    shop's name, the customer's order link and the menu button. A greeting always gets it, and
    so does the first message in 12 hours. Anything else returns None: the customer hears that
    the shop will reply, rather than the same welcome under every question. The message is in
    the inbox either way."""
    if contact["role"] == "staff" or message.kind not in ("text", "interactive"):
        return None
    if " ".join(match.tokens(message.text)) not in HELLO:
        recent = await conn.fetchval(
            "select count(*) from messages where contact_id = $1 and direction = 'in' "
            "and created_at > now() - interval '12 hours'",
            contact["id"],
        )
        if recent > 1:  # this message is already stored (`core/inbound.py`)
            return None
    shop = await conn.fetchrow("select name, name_ar, slug from tenants where id = $1", tenant_id)
    arabic = contact["lang"] == "ar" or has_arabic(message.text)
    if arabic and contact["lang"] != "ar":
        # Remembered, so the confirmation that follows is in Arabic too (as bookings do).
        await conn.execute("update contacts set lang = 'ar' where id = $1", contact["id"])
    name = shop["name_ar"] if arabic and shop["name_ar"] else shop["name"]
    if orders_on and shop["slug"]:
        link = order_link(web_url, shop["slug"], contact["id"], tenant_id)
        body = (
            f"أهلاً بك في {name}. تقدر تطلب من هنا: {link}\n"
            "إذا عندك سؤال، اكتبه وسنرد عليك هنا." if arabic
            else f"Welcome to {name}. You can order here: {link}\n"
            "If you have a question, write it and we will reply here."
        )
    elif catalog_on:
        body = (
            f"أهلاً بك في {name}. اضغط «القائمة» لترى ما لدينا. "
            "إذا عندك سؤال، اكتبه وسنرد عليك هنا." if arabic
            else f"Welcome to {name}. Tap See the menu for what we have. "
            "If you have a question, write it and we will reply here."
        )
    else:
        return None
    if not catalog_on:
        return [OutboundMessage(to=contact["id"], body=body)]
    return [OutboundMessage(
        to=contact["id"], kind="buttons", body=body,
        choices=(Choice("menu", "القائمة" if arabic else "See the menu"),),
    )]
