from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, OutboundMessage
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound
from alyr.modules.ledger.ageing import Aged, age

# Every function takes a tenant-scoped connection (Database.tenant). RLS does the filtering.

REMINDER_COOLDOWN_DAYS = 3
PROMISE_DAYS = 7


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
    if kind == "payment":
        # Any payment ends a promise: the next reminder run looks at the new balance.
        await conn.execute(
            "update ledger_accounts set promised_until = null where contact_id = $1", contact_id
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
        "select c.id, c.name, c.phone, c.wa_user_id, c.username, c.lang, c.credit_limit, "
        "a.promised_until, a.last_reminded_at "
        "from contacts c left join ledger_accounts a on a.contact_id = c.id "
        "where c.role = 'customer' order by c.name"
    )
    rows = await conn.fetch("select contact_id, kind, amount, created_at from ledger_entries")
    by_contact: dict[UUID, list] = {}
    for r in rows:
        by_contact.setdefault(r["contact_id"], []).append((r["kind"], r["amount"], r["created_at"]))
    collected = await conn.fetchrow(
        "select coalesce(sum(amount), 0)::bigint as total, count(*) as payments "
        "from payment_requests where status = 'paid' and order_id is null"
    )
    now = datetime.now(UTC)
    out, totals = [], Aged()
    for c in customers:
        a = age(by_contact.get(c["id"], []), now)
        promised = c["promised_until"]
        out.append(
            {
                "id": str(c["id"]), "name": c["name"], "phone": c["phone"],
                "user_id": c["wa_user_id"], "username": c["username"], "lang": c["lang"],
                "balance": a.balance, "balance_text": fmt_qar(a.balance),
                "oldest_days": a.oldest_days, "buckets": a.buckets,
                "over_limit": c["credit_limit"] > 0 and a.balance > c["credit_limit"],
                "promised_until": promised.isoformat()
                if promised and promised >= now.date() else None,
                "last_reminded_at": c["last_reminded_at"].isoformat()
                if c["last_reminded_at"] else None,
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
        "collected_by_link": collected["total"],
        "collected_by_link_text": fmt_qar(collected["total"]),
        "payments_by_link": collected["payments"],
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


def reminder_tier(oldest_days: int) -> str:
    """Tone follows the age of the debt: gentle, then firm, then final."""
    if oldest_days >= 90:
        return "final"
    if oldest_days >= 60:
        return "firm"
    return "gentle"


def reminder_text(
    lang: str, shop: str, shop_ar: str, amount: int, days: int, link: str, tier: str
) -> str:
    money = fmt_qar(amount)
    if lang == "ar":
        name = shop_ar or shop
        opening = {
            "gentle": f"تذكير ودي من {name}: عليك مبلغ {money}.",
            "firm": f"تذكير من {name}: مبلغ {money} متأخر السداد.",
            "final": f"إشعار أخير من {name}: مبلغ {money} متأخر منذ أكثر من ٩٠ يوماً. "
                     "نرجو السداد أو التواصل معنا اليوم.",
        }[tier]
        return f"{opening} أقدم فاتورة غير مدفوعة منذ {days} يوماً. للدفع: {link}"
    opening = {
        "gentle": f"A friendly reminder from {shop}: {money} is due.",
        "firm": f"Reminder from {shop}: {money} is now overdue.",
        "final": f"Final notice from {shop}: {money} has been overdue for more than 90 days. "
                 "Please pay or contact us today.",
    }[tier]
    return f"{opening} Your oldest unpaid purchase was {days} days ago. Pay here: {link}"


async def send_reminders(
    conn: asyncpg.Connection, tenant_id: UUID, outbound: Outbound, web_url: str, min_days: int
) -> dict:
    """Remind customers whose oldest unpaid purchase is at least `min_days` old.

    Skips anyone who has promised a date that has not passed, and anyone reminded in the
    last few days, so one press of the button can never spam a customer.
    """
    shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    now = datetime.now(UTC)
    result = {"sent": 0, "skipped_promised": 0, "skipped_recent": 0}
    for customer in (await summary(conn))["customers"]:
        if customer["balance"] <= 0 or customer["oldest_days"] < min_days:
            continue
        if customer["promised_until"]:
            result["skipped_promised"] += 1
            continue
        last = customer["last_reminded_at"]
        if last and now - datetime.fromisoformat(last) < timedelta(days=REMINDER_COOLDOWN_DAYS):
            result["skipped_recent"] += 1
            continue
        contact_id = UUID(customer["id"])
        link = await create_payment_request(
            conn, tenant_id, contact_id, customer["balance"], web_url
        )
        arabic = customer["lang"] == "ar"
        await outbound.send(
            conn,
            OutboundMessage(
                to=contact_id,
                kind="template",
                body=reminder_text(
                    customer["lang"], shop["name"], shop["name_ar"], customer["balance"],
                    customer["oldest_days"], link, reminder_tier(customer["oldest_days"]),
                ),
                choices=(
                    Choice("pay", "ادفع الآن" if arabic else "Pay now"),
                    Choice("promise", "سأدفع خلال أسبوع" if arabic else "I'll pay within a week"),
                ),
                template_name="payment_reminder",
                template_category="utility",
            ),
        )
        await conn.execute(
            "insert into ledger_accounts (contact_id, last_reminded_at, reminder_count) "
            "values ($1, now(), 1) on conflict (contact_id) do update "
            "set last_reminded_at = now(), reminder_count = ledger_accounts.reminder_count + 1",
            contact_id,
        )
        result["sent"] += 1
    return result


async def promise_to_pay(conn: asyncpg.Connection, contact_id: UUID) -> date:
    """The customer says they will pay within a week. Reminders pause until then."""
    until = datetime.now(UTC).date() + timedelta(days=PROMISE_DAYS)
    await conn.execute(
        "insert into ledger_accounts (contact_id, promised_until) values ($1, $2) "
        "on conflict (contact_id) do update set promised_until = $2",
        contact_id, until,
    )
    return until


def entry_notice(lang: str, shop: str, shop_ar: str, kind: str, amount: int, balance: int) -> str:
    """Tell the customer about every entry, so the ledger is a record both sides have seen."""
    money, total = fmt_qar(amount), fmt_qar(balance)
    if lang == "ar":
        what = "دفعة بمبلغ" if kind == "payment" else "شراء آجل بمبلغ"
        return f"{shop_ar or shop}: تم تسجيل {what} {money}. رصيدك الآن {total}."
    what = "a payment of" if kind == "payment" else "a credit purchase of"
    return f"{shop}: we recorded {what} {money}. Your balance is now {total}."


async def complete_payment(
    conn: asyncpg.Connection, payment_id: UUID, outbound: Outbound
) -> str:
    """Mark a payment request paid, record it in the ledger and tell the customer.

    Safe to call twice: the second call changes nothing.
    """
    row = await conn.fetchrow(
        "update payment_requests set status = 'paid', paid_at = now() "
        "where id = $1 and status = 'pending' "
        "returning contact_id, amount, provider, order_id",
        payment_id,
    )
    if row is None:
        exists = await conn.fetchval("select 1 from payment_requests where id = $1", payment_id)
        return "paid" if exists else "not_found"
    lang = await conn.fetchval("select lang from contacts where id = $1", row["contact_id"])
    if row["order_id"] is not None:
        # Paying for an order settles the order. It was never a debt, so the ledger
        # is not touched.
        number = await conn.fetchval(
            "update orders set payment = 'paid' where id = $1 returning number", row["order_id"]
        )
        body = (
            f"تم استلام {fmt_qar(row['amount'])} للطلب رقم {number}. شكراً لك." if lang == "ar"
            else f"Received {fmt_qar(row['amount'])} for order #{number}. Thank you."
        )
        await outbound.send(conn, OutboundMessage(to=row["contact_id"], body=body))
        return "paid"
    await add_entry(
        conn, row["contact_id"], "payment", row["amount"],
        note="Paid by payment link", created_by=row["provider"],
    )
    balance = (await aged(conn, row["contact_id"])).balance
    if lang == "ar":
        body = f"تم استلام {fmt_qar(row['amount'])}. رصيدك الآن {fmt_qar(balance)}. شكراً لك."
    else:
        body = (
            f"Received {fmt_qar(row['amount'])}. Your balance is now {fmt_qar(balance)}. "
            "Thank you."
        )
    await outbound.send(conn, OutboundMessage(to=row["contact_id"], body=body))
    return "paid"
