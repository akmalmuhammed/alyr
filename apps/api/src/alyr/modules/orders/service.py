"""Order link: a customer orders from a shop's page and pays by link or on account.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core import team, templates
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound
from alyr.core.team import Actor
from alyr.modules.ledger import service as ledger

MAX_QUANTITY = 999
STATUSES = ("new", "confirmed", "ready", "done", "cancelled")


def track_url(web_url: str, tenant_id: UUID, order_id: UUID) -> str:
    """The customer's own page for one order. Like a payment link, it carries the shop's
    ID because the customer is not signed in, and the order's ID, which cannot be guessed."""
    return f"{web_url}/t/{tenant_id}/{order_id}"


def _track_line(url: str, arabic: bool) -> str:
    return f"تتبّع طلبك: {url}" if arabic else f"Track your order: {url}"


class OrderError(Exception):
    """The order cannot be placed as asked. `code` tells the caller why."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


async def list_products(conn: asyncpg.Connection, only_available: bool = False) -> list[dict]:
    rows = await conn.fetch(
        "select id, name, name_ar, category, price, available from products "
        "where available or not $1 order by category, sort, name",
        only_available,
    )
    return [
        {**dict(r), "id": str(r["id"]), "price_text": fmt_qar(r["price"])} for r in rows
    ]


async def can_use_account(conn: asyncpg.Connection, contact_id: UUID) -> bool:
    """Only customers the shop has given a credit limit may put an order on account."""
    limit = await conn.fetchval("select credit_limit from contacts where id = $1", contact_id)
    return bool(limit and limit > 0)


async def create_order(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact_id: UUID,
    items: list[tuple[UUID, int]],
    payment: str,
    web_url: str,
    outbound: Outbound,
) -> dict:
    """Place an order. Prices always come from the database, never from the caller."""
    contact = await conn.fetchrow(
        "select id, lang, credit_limit, assigned_to from contacts where id = $1", contact_id
    )
    if contact is None:
        raise OrderError("unknown_customer", "We could not find this customer.")
    if not items:
        raise OrderError("empty", "The cart is empty.")

    lines, total = [], 0
    for product_id, quantity in items:
        if not 1 <= quantity <= MAX_QUANTITY:
            raise OrderError("bad_quantity", "Quantity must be between 1 and 999.")
        product = await conn.fetchrow(
            "select id, name, name_ar, price from products where id = $1 and available",
            product_id,
        )
        if product is None:
            raise OrderError("unavailable", "One of the items is no longer available.")
        lines.append((product, quantity))
        total += product["price"] * quantity

    if payment == "account":
        if not contact["credit_limit"] > 0:
            raise OrderError("no_account", "This customer does not have a credit account.")
        balance = (await ledger.aged(conn, contact_id)).balance
        if balance + total > contact["credit_limit"]:
            raise OrderError(
                "over_limit",
                f"This order would take the account over its limit of "
                f"{fmt_qar(contact['credit_limit'])}. Pay by link instead.",
            )
    elif payment != "link":
        raise OrderError("bad_payment", "Choose to pay by link or on account.")

    # One order number at a time per shop, so numbers never repeat.
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"orders:{tenant_id}")
    number = await conn.fetchval("select coalesce(max(number), 1000) + 1 from orders")
    # Whoever is looking after this customer's chat looks after the order too.
    order_id = await conn.fetchval(
        "insert into orders (contact_id, number, total, payment, assigned_to) "
        "values ($1, $2, $3, $4, $5) returning id",
        contact_id, number, total, "on_account" if payment == "account" else "unpaid",
        contact["assigned_to"],
    )
    await team.record(
        conn, "order", order_id, "placed", team.CUSTOMER, contact_id,
        {"number": number, "total": fmt_qar(total), "payment": payment},
    )
    for product, quantity in lines:
        await conn.execute(
            "insert into order_items (order_id, product_id, name, price, quantity) "
            "values ($1, $2, $3, $4, $5)",
            order_id, product["id"], product["name"], product["price"], quantity,
        )

    arabic = contact["lang"] == "ar"
    summary = "\n".join(
        f"{quantity} x {(product['name_ar'] if arabic and product['name_ar'] else product['name'])}"
        f"  {fmt_qar(product['price'] * quantity)}"
        for product, quantity in lines
    )
    # A template blank cannot hold a line break, so the items go on one line there.
    items = ", ".join(
        f"{quantity} x {(product['name_ar'] if arabic and product['name_ar'] else product['name'])}"
        for product, quantity in lines
    )
    pay_url = None
    if payment == "account":
        await ledger.add_entry(
            conn, contact_id, "sale", total, note=f"Order #{number}", created_by="Order link"
        )
        balance = (await ledger.aged(conn, contact_id)).balance
        closing = (
            f"تم تسجيله على حسابك. رصيدك الآن {fmt_qar(balance)}." if arabic
            else f"Put on your account. Your balance is now {fmt_qar(balance)}."
        )
    else:
        pay_url = await conn.fetchval(
            "insert into payment_requests (contact_id, amount, order_id) values ($1, $2, $3) "
            "returning id",
            contact_id, total, order_id,
        )
        pay_url = f"{web_url}/pay/{tenant_id}/{pay_url}"
        closing = f"للدفع: {pay_url}" if arabic else f"Pay here: {pay_url}"

    head = f"تم استلام الطلب رقم {number}." if arabic else f"Order #{number} received."
    total_line = f"الإجمالي: {fmt_qar(total)}" if arabic else f"Total: {fmt_qar(total)}"
    track = _track_line(track_url(web_url, tenant_id, order_id), arabic)
    # The tracking link goes in the module's own wording. An approved template cannot
    # change, so a notice sent after the 24-hour window arrives without it.
    await outbound.send(conn, templates.notice(
        contact_id, "order_received_account" if payment == "account" else "order_received_pay",
        contact["lang"], f"{head}\n{summary}\n{total_line}\n{closing}\n{track}",
        number, items, fmt_qar(total), fmt_qar(balance) if payment == "account" else pay_url,
    ))
    return {
        "order_id": str(order_id), "number": number, "total": total,
        "total_text": fmt_qar(total), "payment": payment, "pay_url": pay_url,
        "track_url": track_url(web_url, tenant_id, order_id),
    }


_STATUS_TEXT = {
    "confirmed": ("Order #{n} is confirmed.", "تم تأكيد الطلب رقم {n}."),
    "ready": ("Order #{n} is ready for collection.", "الطلب رقم {n} جاهز للاستلام."),
    "done": ("Order #{n} is complete. Thank you.", "تم إنجاز الطلب رقم {n}. شكراً لك."),
    "cancelled": ("Order #{n} has been cancelled.", "تم إلغاء الطلب رقم {n}."),
}


async def set_status(
    conn: asyncpg.Connection, order_id: UUID, status: str, outbound: Outbound,
    actor: Actor = team.ASSISTANT, web_url: str | None = None,
) -> bool:
    """Move an order along and tell the customer. Returns False if there is no such order.
    Whoever moves an order nobody has becomes responsible for it."""
    if status not in _STATUS_TEXT:
        raise OrderError("bad_status", "Unknown order status.")
    row = await conn.fetchrow(
        "update orders set status = $2 where id = $1 and status is distinct from $2 "
        "returning contact_id, number",
        order_id, status,
    )
    if row is None:
        return bool(await conn.fetchval("select 1 from orders where id = $1", order_id))
    await team.claim(conn, "order", order_id, actor)
    await team.record(
        conn, "order", order_id, status, actor, row["contact_id"], {"number": row["number"]}
    )
    lang = await conn.fetchval("select lang from contacts where id = $1", row["contact_id"])
    english, arabic = _STATUS_TEXT[status]
    body = (arabic if lang == "ar" else english).format(n=row["number"])
    if web_url and status != "cancelled":
        tenant_id = await conn.fetchval(
            "select nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
        body += "\n" + _track_line(track_url(web_url, tenant_id, order_id), lang == "ar")
    await outbound.send(conn, templates.notice(
        row["contact_id"], f"order_{status}", lang, body, row["number"],
    ))
    return True


async def list_orders(conn: asyncpg.Connection) -> list[dict]:
    orders = await conn.fetch(
        "select o.id, o.number, o.status, o.payment, o.total, o.created_at, c.name as customer, "
        "       o.assigned_to, u.name as assignee "
        "from orders o join contacts c on c.id = o.contact_id "
        "left join users u on u.id = o.assigned_to order by o.number desc"
    )
    items = await conn.fetch("select order_id, name, price, quantity from order_items")
    by_order: dict[UUID, list[dict]] = {}
    for item in items:
        by_order.setdefault(item["order_id"], []).append(
            {"name": item["name"], "quantity": item["quantity"],
             "line_text": fmt_qar(item["price"] * item["quantity"])}
        )
    return [
        {
            "id": str(o["id"]), "number": o["number"], "status": o["status"],
            "payment": o["payment"], "total": o["total"], "total_text": fmt_qar(o["total"]),
            "customer": o["customer"], "created_at": o["created_at"].isoformat(),
            "items": by_order.get(o["id"], []),
            "assigned": {"id": str(o["assigned_to"]), "name": o["assignee"]}
            if o["assigned_to"] else None,
        }
        for o in orders
    ]


# What the customer sees on the tracking page, in the order it happens.
TRACK_STEPS = ("placed", "confirmed", "ready", "done")


async def tracking(conn: asyncpg.Connection, order_id: UUID) -> dict | None:
    """One order as its customer may see it: what they bought, where it has got to and
    when, who at the shop is looking after it, and how to pay if they have not.
    Nothing about other customers, and only the first name of the staff member."""
    order = await conn.fetchrow(
        "select o.id, o.number, o.status, o.payment, o.total, o.created_at, c.lang, "
        "       split_part(u.name, ' ', 1) as handler "
        "from orders o join contacts c on c.id = o.contact_id "
        "left join users u on u.id = o.assigned_to where o.id = $1",
        order_id,
    )
    if order is None:
        return None
    items = await conn.fetch(
        "select o.name, p.name_ar, o.price, o.quantity from order_items o "
        "left join products p on p.id = o.product_id where o.order_id = $1 order by o.name",
        order_id,
    )
    events = await conn.fetch(
        "select action, min(created_at) as at from activity "
        "where subject = 'order' and subject_id = $1 group by action",
        order_id,
    )
    when = {e["action"]: e["at"] for e in events}
    when.setdefault("placed", order["created_at"])
    pending = await conn.fetchval(
        "select id from payment_requests where order_id = $1 and status = 'pending' "
        "order by created_at desc limit 1",
        order_id,
    )
    return {
        "number": order["number"], "status": order["status"], "payment": order["payment"],
        "total_text": fmt_qar(order["total"]), "lang": order["lang"],
        "handler": order["handler"] or None,
        "items": [
            {"name": i["name"], "name_ar": i["name_ar"] or "", "quantity": i["quantity"],
             "line_text": fmt_qar(i["price"] * i["quantity"])}
            for i in items
        ],
        "steps": [
            {"key": key, "at": when[key].isoformat() if key in when else None}
            for key in TRACK_STEPS
        ],
        "cancelled_at": when["cancelled"].isoformat() if "cancelled" in when else None,
        "paid_at": when["paid"].isoformat() if "paid" in when else None,
        "payment_id": str(pending) if pending and order["payment"] == "unpaid" else None,
    }
