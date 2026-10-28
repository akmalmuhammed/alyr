"""Back in stock: "tell me when it is back" (D-039, ALY-106, plan scenario 13).

A customer who finds an item sold out can ask to be told. The request is a row in
`stock_watches`, made after the customer agreed (`wa_customer.py`: the agreement is a
consent record of its own, like every other). When stock returns, `events.py` queues a job
and this module sends **one** message to each customer waiting for that item, then closes
the request. There is no second message, however often the item sells out and returns.

**Which kind of message.** Inside the customer's 24-hour window it is an ordinary text:
Meta needs no template there. Outside it, only a template will do. Meta's template
guidelines (checked 18 Oct 2026) call a utility template one that is non-promotional and
triggered by the user's action, but list a saved search that found a match among the
retargeting examples that are "marketing even if requested by users". An item back in
stock is the nearest thing, so `back_in_stock` is filed as **marketing**. What the
customer agreed to is narrower than marketing, though: the consent purpose `back_in_stock`
(one message, about the item they asked for), recorded when they said yes. It is not
marketing consent and never sets `consent_marketing`, so broadcasts (ALY-44) still need an
explicit opt-in. The outbound layer sends this template only to a customer who holds it;
STOP takes it back and START does not give it back. A request that nothing came of in 60
days expires.

The send is in the same transaction as closing the request, so a request is closed if and
only if its message was recorded, and a retried job cannot send twice.
"""

import logging
from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core import templates
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import service
from alyr.modules.items.wa_text import say, shown
from alyr.modules.orders.chat import order_link

log = logging.getLogger("alyr.catalog.watches")

TEMPLATE = "back_in_stock"


async def waiting_for(conn: asyncpg.Connection, contact_id: UUID, item_id: UUID) -> bool:
    return bool(await conn.fetchval(
        "select true from stock_watches where contact_id = $1 and item_id = $2 "
        "and status = 'waiting' and expires_at > now()",
        contact_id, item_id,
    ))


async def add(conn: asyncpg.Connection, contact_id: UUID, item_id: UUID) -> bool:
    """Put a customer on the list for an item. False if they already are."""
    made = await conn.fetchval(
        "insert into stock_watches (contact_id, item_id) values ($1, $2) "
        "on conflict do nothing returning true",
        contact_id, item_id,
    )
    return bool(made)


async def cancel_all(conn: asyncpg.Connection, contact_id: UUID) -> int:
    """The customer said stop: nothing more is sent to them, so every request closes."""
    done = await conn.execute(
        "update stock_watches set status = 'cancelled', closed_at = now() "
        "where contact_id = $1 and status = 'waiting'",
        contact_id,
    )
    return int(done.split()[-1])


class BackInStock:
    """Job handler for `catalog.back_in_stock`."""

    def __init__(self, db: Database, outbound: Outbound, web_url: str) -> None:
        self._db, self._outbound, self._web = db, outbound, web_url

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        async with self._db.tenant(tenant_id) as conn:
            await self.tell(conn, tenant_id, UUID(payload["item_id"]))

    async def tell(self, conn: asyncpg.Connection, tenant_id: UUID, item_id: UUID) -> int:
        """Send the one message to everyone waiting for this item, if it can be ordered
        now. Returns how many requests were closed with a message sent."""
        await conn.execute(
            "update stock_watches set status = 'expired', closed_at = now() "
            "where item_id = $1 and status = 'waiting' and expires_at <= now()",
            item_id,
        )
        clock = await shop_clock.load(conn)
        entry = await service.get(conn, clock, item_id)
        if entry is None or not entry.state(clock).orderable:
            return 0  # not back after all (a schedule, a switch): they keep waiting
        shop = await conn.fetchrow(
            "select name, name_ar, slug from tenants where id = $1", tenant_id
        )
        waiting = await conn.fetch(
            "select w.id, w.contact_id, c.lang, c.consent_back_in_stock, "
            "coalesce(c.last_inbound_at > now() - interval '24 hours', false) as window_open "
            "from stock_watches w join contacts c on c.id = w.contact_id "
            "where w.item_id = $1 and w.status = 'waiting' order by w.created_at "
            "for update of w skip locked",
            item_id,
        )
        sent = 0
        for watch in waiting:
            lang = watch["lang"]
            if watch["consent_back_in_stock"] != "granted":
                # The agreement is gone (taken back some other way): nothing goes, in or out
                # of the window, and the request says why it was closed.
                await conn.execute(
                    "update stock_watches set status = 'not_sent', closed_at = now(), "
                    "reason = 'no_back_in_stock_consent' where id = $1 and status = 'waiting'",
                    watch["id"],
                )
                continue
            # Close it first, in this transaction: the request and its message stand or
            # fall together, and a second run finds nothing waiting.
            claimed = await conn.fetchval(
                "update stock_watches set status = 'sent', closed_at = now() "
                "where id = $1 and status = 'waiting' returning id",
                watch["id"],
            )
            if claimed is None:
                continue
            shop_name = shop["name_ar"] if lang == "ar" and shop["name_ar"] else shop["name"]
            name = shown(entry.item, lang)
            link = order_link(self._web, shop["slug"], watch["contact_id"], tenant_id)
            if watch["window_open"]:
                message = OutboundMessage(
                    to=watch["contact_id"], lang=lang,
                    body=say("back_in_stock", lang, shop=shop_name, name=name, link=link),
                )
            else:
                message = templates.notice(
                    watch["contact_id"], TEMPLATE, lang,
                    say("back_in_stock", lang, shop=shop_name, name=name, link=link),
                    shop_name, name, link,
                )
            result = await self._outbound.send(conn, message)
            if result.blocked:
                # Refused (no agreement to messages like this, or stopped since): the
                # request is closed all the same, and says why.
                await conn.execute(
                    "update stock_watches set status = 'not_sent', reason = $2 where id = $1",
                    watch["id"], result.blocked,
                )
            else:
                sent += 1
        return sent
