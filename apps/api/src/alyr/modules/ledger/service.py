from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound
from alyr.modules.ledger.ageing import Aged, age

# Every function takes a tenant-scoped connection (Database.tenant). RLS does the filtering.


async def add_entry(
    conn: asyncpg.Connection,
    contact_id: UUID,
    kind: str,
    amount: int,
    note: str = "",
    created_by: str = "",
    at: datetime | None = None,
) -> None:
    await conn.execute(
        "insert into ledger_entries (contact_id, kind, amount, note, created_by, created_at) "
        "values ($1, $2, $3, $4, $5, coalesce($6, now()))",
        contact_id, kind, amount, note, created_by, at,
    )


async def aged(conn: asyncpg.Connection, contact_id: UUID) -> Aged:
    rows = await conn.fetch(
        "select kind, amount, created_at from ledger_entries where contact_id = $1", contact_id
    )
    return age([(r["kind"], r["amount"], r["created_at"]) for r in rows], datetime.now(UTC))


async def recent_entries(conn: asyncpg.Connection, contact_id: UUID, limit: int = 50) -> list:
    return await conn.fetch(
        "select kind, amount, note, created_by, created_at from ledger_entries "
        "where contact_id = $1 order by created_at desc limit $2",
        contact_id, limit,
    )


async def summary(conn: asyncpg.Connection) -> dict:
    customers = await conn.fetch(
        "select id, name, phone, lang from contacts where role = 'customer' order by name"
    )
    rows = await conn.fetch("select contact_id, kind, amount, created_at from ledger_entries")
    by_contact: dict[UUID, list] = {}
    for r in rows:
        by_contact.setdefault(r["contact_id"], []).append((r["kind"], r["amount"], r["created_at"]))
    now = datetime.now(UTC)
    out, totals = [], Aged()
    for c in customers:
        a = age(by_contact.get(c["id"], []), now)
        out.append(
            {
                "id": str(c["id"]), "name": c["name"], "phone": c["phone"],
                "balance": a.balance, "balance_text": fmt_qar(a.balance),
                "oldest_days": a.oldest_days, "buckets": a.buckets,
            }
        )
        if a.balance > 0:
            totals.balance += a.balance
            for key, value in a.buckets.items():
                totals.buckets[key] += value
    out.sort(key=lambda c: c["balance"], reverse=True)
    return {
        "outstanding": totals.balance,
        "outstanding_text": fmt_qar(totals.balance),
        "buckets": totals.buckets,
        "customers_owing": sum(1 for c in out if c["balance"] > 0),
        "customers": out,
    }


async def create_payment_request(
    conn: asyncpg.Connection, tenant_id: UUID, contact_id: UUID, amount: int, web_url: str
) -> str:
    """Record a payment request and return the link the customer opens."""
    payment_id = await conn.fetchval(
        "insert into payment_requests (contact_id, amount) values ($1, $2) returning id",
        contact_id, amount,
    )
    return f"{web_url}/pay/{tenant_id}/{payment_id}"


def reminder_text(lang: str, shop: str, shop_ar: str, amount: int, days: int, link: str) -> str:
    if lang == "ar":
        return (
            f"تذكير من {shop_ar or shop}: عليك مبلغ {fmt_qar(amount)} "
            f"وأقدم فاتورة غير مدفوعة منذ {days} يوماً. للدفع: {link}"
        )
    return (
        f"Reminder from {shop}: {fmt_qar(amount)} is due. "
        f"Your oldest unpaid purchase was {days} days ago. Pay here: {link}"
    )


async def send_reminders(
    conn: asyncpg.Connection, tenant_id: UUID, outbound: Outbound, web_url: str, min_days: int
) -> int:
    """Remind every customer whose oldest unpaid purchase is at least `min_days` old."""
    shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    langs = {
        str(r["id"]): r["lang"]
        for r in await conn.fetch("select id, lang from contacts where role = 'customer'")
    }
    sent = 0
    for customer in (await summary(conn))["customers"]:
        if customer["balance"] <= 0 or customer["oldest_days"] < min_days:
            continue
        link = await create_payment_request(
            conn, tenant_id, UUID(customer["id"]), customer["balance"], web_url
        )
        await outbound.send(
            conn,
            OutboundMessage(
                to_number=customer["phone"],
                kind="template",
                body=reminder_text(
                    langs[customer["id"]], shop["name"], shop["name_ar"],
                    customer["balance"], customer["oldest_days"], link,
                ),
                template_name="payment_reminder",
                template_category="utility",
            ),
        )
        sent += 1
    return sent


async def complete_payment(
    conn: asyncpg.Connection, payment_id: UUID, outbound: Outbound
) -> str:
    """Mark a payment request paid, record it in the ledger and tell the customer.

    Safe to call twice: the second call changes nothing.
    """
    row = await conn.fetchrow(
        "update payment_requests set status = 'paid', paid_at = now() "
        "where id = $1 and status = 'pending' returning contact_id, amount, provider",
        payment_id,
    )
    if row is None:
        exists = await conn.fetchval("select 1 from payment_requests where id = $1", payment_id)
        return "paid" if exists else "not_found"
    await add_entry(
        conn, row["contact_id"], "payment", row["amount"],
        note="Paid by payment link", created_by=row["provider"],
    )
    contact = await conn.fetchrow(
        "select phone, lang from contacts where id = $1", row["contact_id"]
    )
    balance = (await aged(conn, row["contact_id"])).balance
    if contact["lang"] == "ar":
        body = f"تم استلام {fmt_qar(row['amount'])}. رصيدك الآن {fmt_qar(balance)}. شكراً لك."
    else:
        body = (
            f"Received {fmt_qar(row['amount'])}. Your balance is now {fmt_qar(balance)}. "
            "Thank you."
        )
    await outbound.send(conn, OutboundMessage(to_number=contact["phone"], body=body))
    return "paid"
