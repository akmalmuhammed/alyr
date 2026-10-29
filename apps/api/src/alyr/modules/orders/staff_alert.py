"""Staff told about a new order on WhatsApp (go-live checklist item 42, D-079).

Until now a new order showed only on an open workspace screen. When an order is placed (on the
order page, in the chat, or "same as last time"), `service.create_order` queues a job, and the
job tells every staff number the owner marked for new orders (`contacts.order_alerts`, in the
workspace's staff numbers): the order's number and total, what it holds, how it is paid and
how it reaches the customer, and where to confirm it. Inside a number's 24-hour window that is
an ordinary message; outside it, the template `order_new_staff`, which Meta must approve first
(ALY-172), as for the stock and refund alerts (`modules/items/alerts.py`).

Nobody is marked until the owner marks a number, so a busy shop is never sent a message per
order it did not ask for. The owner's own test order tells nobody: it is counted nowhere
(D-064). A job, so placing an order never waits for WhatsApp.

Every function that takes a connection needs a tenant-scoped one.
"""

from uuid import UUID

import asyncpg

from alyr.core import identity, jobs, templates
from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.items import qty, staff
from alyr.modules.orders import service

JOB = "orders.staff_alert"
TEMPLATE = "order_new_staff"
# More lines than this and the message says how many more, so a long order stays short.
MAX_LINES = 8

_WORDS = {
    "title": ("New order {number} · {total}", "طلب جديد رقم {number} · {total}"),
    "from": ("From {name}", "من {name}"),
    "more": ("and {n} more", "و{n} غيرها"),
    "unpaid": ("Not paid yet", "لم يُدفع بعد"),
    "paid": ("Paid", "مدفوع"),
    "on_account": ("On account", "على الحساب"),
    "pickup": ("Pickup", "استلام من المتجر"),
    "delivery": ("Delivery", "توصيل"),
    "delivery_to": ("Delivery to {zone}", "توصيل إلى {zone}"),
    "on_day": ("on {day}", "يوم {day}"),
    "table": ("Table {label}", "طاولة {label}"),
    "confirm": ("Confirm it in ALYR: {url}", "أكّده في ALYR: {url}"),
}


def _say(key: str, lang: str, **details: object) -> str:
    english, arabic = _WORDS[key]
    return (arabic if lang == "ar" else english).format(**details)


def _line(item: dict, lang: str) -> str:
    """One line as staff read it: "2 x Croissant (Large, Extra butter)"."""
    arabic = lang == "ar"
    name = (item["name_ar"] or item["name"]) if arabic else (item["name"] or item["name_ar"])
    extra = [item["variant_ar"] or item["variant"] if arabic else item["variant"]]
    extra += item["options_ar"] if arabic else item["options"]
    extra = [e for e in extra if e]
    amount = qty.label(item["quantity"], item["unit"], item["unit_shown"], lang)
    return f"{amount} x {name}" + (f" ({', '.join(extra)})" if extra else "")


def _how(order: dict, lang: str) -> str:
    """How the order reaches the customer, and how it is paid: "Delivery to Al Waab on
    2026-11-02 · Not paid yet"."""
    parts = []
    way = order.get("fulfilment")
    if way and way["mode"] == "delivery":
        zone = (way.get("zone_ar") or way.get("zone")) if lang == "ar" else way.get("zone")
        said = _say("delivery_to", lang, zone=zone) if zone else _say("delivery", lang)
        if way.get("deliver_on"):
            said += " " + _say("on_day", lang, day=way["deliver_on"])
        parts.append(said)
    elif way:
        parts.append(_say("pickup", lang))
    if order["table"]:
        parts.append(_say("table", lang, label=order["table"]))
    parts.append(_say(order["payment"], lang))
    return " · ".join(parts)


def message(order: dict, customer: str, shop: str, lang: str, url: str) -> tuple[str, tuple]:
    """The text sent inside a number's window, and the template's four values for outside it:
    the shop, the order's number, its total, and what it holds with how it goes."""
    lines = [_line(item, lang) for item in order["items"]]
    shown = lines[:MAX_LINES]
    if len(lines) > MAX_LINES:
        shown.append(_say("more", lang, n=len(lines) - MAX_LINES))
    how = _how(order, lang)
    total = fmt_qar_ar(order["total"]) if lang == "ar" else fmt_qar(order["total"])
    body = "\n".join([
        _say("title", lang, number=order["number"], total=total),
        *([_say("from", lang, name=customer)] if customer else []),
        "",
        *shown,
        "",
        how,
        _say("confirm", lang, url=url),
    ])
    holds = ", ".join(shown)
    return body, (shop, str(order["number"]), total, f"{holds}. {how}")


async def queue(conn: asyncpg.Connection, order_id: UUID, wa_user_id: str | None) -> None:
    """Called when an order is placed, in its transaction: queue the alert, unless the order is
    the owner's own test or nobody is marked to be told."""
    if identity.is_test_user(wa_user_id):
        return
    if await conn.fetchval("select true from contacts where role = 'staff' and order_alerts "
                           "limit 1"):
        await jobs.enqueue(conn, JOB, {"order_id": str(order_id)})


class StaffAlerts:
    """Job handler for `orders.staff_alert`: one new order, every number marked for it."""

    def __init__(self, db: Database, outbound: Outbound, web_url: str) -> None:
        self._db = db
        self._outbound = outbound
        self._url = f"{web_url.rstrip('/')}/app/orders?show=unconfirmed"

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        order_id = UUID(payload["order_id"])
        async with self._db.tenant(tenant_id) as conn:
            order = await service.tracking(conn, order_id)
            who = await conn.fetchrow(
                "select c.name, c.phone, o.is_test from orders o "
                "join contacts c on c.id = o.contact_id where o.id = $1", order_id)
            if order is None or who is None or who["is_test"]:
                return
            # A contact with no WhatsApp name is stored under its number: no name, then.
            customer = "" if (who["name"] or "") in ("", who["phone"]) else who["name"]
            shop = await conn.fetchrow(
                "select name, name_ar from tenants "
                "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")
            for person in await staff.order_watchers(conn):
                lang = "ar" if person["lang"] == "ar" else "en"
                title = (shop["name_ar"] or shop["name"]) if lang == "ar" else shop["name"]
                body, params = message(order, customer, title, lang, self._url)
                await self._outbound.send(
                    conn, templates.notice(person["id"], TEMPLATE, lang, body, *params)
                )
