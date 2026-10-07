"""Order link: a customer orders from a shop's page and pays by link or on account.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound
from alyr.modules.ledger import service as ledger

MAX_QUANTITY = 999
STATUSES = ("new", "confirmed", "ready", "done", "cancelled")


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
        "select id, lang, credit_limit from contacts where id = $1", contact_id
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
    order_id = await conn.fetchval(
        "insert into orders (contact_id, number, total, payment) values ($1, $2, $3, $4) "
        "returning id",
        contact_id, number, total, "on_account" if payment == "account" else "unpaid",
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
    await outbound.send(
        conn,
        OutboundMessage(
            to=contact_id, kind="template",
            body=f"{head}\n{summary}\n{total_line}\n{closing}",
            template_name="order_received", template_category="utility",
        ),
    )
    return {
        "order_id": str(order_id), "number": number, "total": total,
        "total_text": fmt_qar(total), "payment": payment, "pay_url": pay_url,
    }


_STATUS_TEXT = {
    "confirmed": ("Order #{n} is confirmed.", "تم تأكيد الطلب رقم {n}."),
    "ready": ("Order #{n} is ready for collection.", "الطلب رقم {n} جاهز للاستلام."),
    "done": ("Order #{n} is complete. Thank you.", "تم إنجاز الطلب رقم {n}. شكراً لك."),
    "cancelled": ("Order #{n} has been cancelled.", "تم إلغاء الطلب رقم {n}."),
}


async def set_status(
    conn: asyncpg.Connection, order_id: UUID, status: str, outbound: Outbound
) -> bool:
    """Move an order along and tell the customer. Returns False if there is no such order."""
    if status not in _STATUS_TEXT:
        raise OrderError("bad_status", "Unknown order status.")
    row = await conn.fetchrow(
        "update orders set status = $2 where id = $1 and status is distinct from $2 "
        "returning contact_id, number",
        order_id, status,
    )
    if row is None:
        return bool(await conn.fetchval("select 1 from orders where id = $1", order_id))
    lang = await conn.fetchval("select lang from contacts where id = $1", row["contact_id"])
    english, arabic = _STATUS_TEXT[status]
    body = (arabic if lang == "ar" else english).format(n=row["number"])
    await outbound.send(
        conn,
        OutboundMessage(
            to=row["contact_id"], kind="template", body=body,
            template_name=f"order_{status}", template_category="utility",
        ),
    )
    return True


async def list_orders(conn: asyncpg.Connection) -> list[dict]:
    orders = await conn.fetch(
        "select o.id, o.number, o.status, o.payment, o.total, o.created_at, c.name as customer "
        "from orders o join contacts c on c.id = o.contact_id order by o.number desc"
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
        }
        for o in orders
    ]
