"""What is in the business now, by area, read from the database (spec 063). The command prints
this after a load (and for a rehearsal, what the load would leave), and the tests read it."""

from datetime import datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.demo.build import TZ
from alyr.modules.ledger import service as ledger


async def collect(conn: asyncpg.Connection, tenant_id: UUID, now: datetime) -> dict[str, dict]:
    """Counts per area. `conn` reads the business (any role that may)."""
    one = lambda sql, *a: conn.fetchval(sql, tenant_id, *a)  # noqa: E731
    today = now.astimezone(TZ).date()
    monday = today - timedelta(days=today.weekday())
    week = lambda col: (  # noqa: E731 - this week, last week
        f"count(*) filter (where {col} >= $2 and {col} < $3) as this_week, "
        f"count(*) filter (where {col} >= $4 and {col} < $2) as last_week")
    start = datetime.combine(monday, datetime.min.time(), TZ)
    args = (start, start + timedelta(days=7), start - timedelta(days=7))
    orders = await conn.fetchrow(
        "select count(*) as total, "
        "count(*) filter (where status = 'new') as new, "
        "count(*) filter (where status = 'confirmed') as confirmed, "
        "count(*) filter (where status = 'ready') as ready, "
        "count(*) filter (where status = 'done') as done, "
        "count(*) filter (where status = 'cancelled') as cancelled, "
        "count(*) filter (where payment = 'on_account') as on_account, "
        "count(*) filter (where payment = 'paid') as paid, "
        "count(*) filter (where payment = 'unpaid' and status <> 'cancelled') as waiting_payment, "
        f"{week('created_at')}, "
        "coalesce(sum(total) filter (where status <> 'cancelled'), 0)::bigint as value "
        "from orders where tenant_id = $1", tenant_id, *args)
    cash = await one("select count(*) from manual_payments where subject = 'order'")
    bookings = await conn.fetchrow(
        "select count(*) as total, "
        "count(*) filter (where starts_at >= $2) as upcoming, "
        "count(*) filter (where status = 'no_show') as no_shows, "
        "count(*) filter (where status = 'cancelled') as cancelled, "
        "count(*) filter (where deposit > 0) as with_deposit, "
        "count(*) filter (where (starts_at at time zone 'Asia/Qatar')::date = $3) as today, "
        "count(*) filter (where (starts_at at time zone 'Asia/Qatar')::date = $3 + 1) as tomorrow "
        "from bookings where tenant_id = $1", tenant_id, now, today)
    chats = await conn.fetchrow(
        "select count(*) as contacts, "
        "count(*) filter (where role = 'customer' and last_inbound_at is not null) as "
        "conversations, "
        "count(*) filter (where inbox_status = 'open' and role = 'customer') as open, "
        "count(*) filter (where consent_service = 'revoked') as opted_out, "
        "count(*) filter (where credit_limit > 0) as accounts "
        "from contacts where tenant_id = $1", tenant_id)
    waiting = await one(
        "select count(*) from contacts c where c.tenant_id = $1 and c.role = 'customer' and "
        "c.inbox_status = 'open' and (select direction from messages m where m.contact_id = c.id "
        "order by created_at desc limit 1) = 'in'")
    messages = await one("select count(*) from messages where tenant_id = $1")
    items = await conn.fetchrow(
        "select count(*) as items, count(*) filter (where status = 'live') as live, "
        "count(*) filter (where status = 'hidden') as hidden, "
        "count(*) filter (where status = 'draft') as draft "
        "from items where tenant_id = $1", tenant_id)
    docs = {r["kind"]: r["n"] for r in await conn.fetch(
        "select kind, count(*)::int as n from documents where tenant_id = $1 and "
        "status <> 'draft' group by kind", tenant_id)}
    unpaid = await one(
        "select count(*) from documents d where d.tenant_id = $1 and d.kind = 'invoice' and "
        "d.status = 'issued' and d.total_minor > d.paid_minor + coalesce((select sum(amount_minor) "
        "from manual_payments m where m.subject = 'invoice' and m.subject_id = d.id), 0)")
    buckets = dict.fromkeys(("d0_30", "d31_60", "d61_90", "d90_plus"), 0)
    over = balance = 0
    for row in await conn.fetch(
            "select id, credit_limit from contacts where tenant_id = $1 and credit_limit > 0",
            tenant_id):
        aged = await ledger.aged(conn, row["id"])
        for key, amount in aged.buckets.items():
            buckets[key] += amount
        balance += aged.balance
        over += aged.balance > row["credit_limit"]
    return {
        "Catalog": {
            "items": items["items"], "live": items["live"], "hidden": items["hidden"],
            "draft": items["draft"],
            "categories": await one("select count(*) from item_categories where tenant_id = $1"),
            "variants": await one("select count(*) from item_variants where tenant_id = $1"),
            "photos": await one("select count(*) from media_assets where tenant_id = $1"),
            "price groups": await one("select count(*) from price_groups where tenant_id = $1"),
            "delivery zones": await one("select count(*) from delivery_zones where tenant_id = $1"),
            "coupons": await one("select count(*) from discount_rules where tenant_id = $1"),
        },
        "Customers": {"contacts": chats["contacts"], "business accounts": chats["accounts"]},
        "Orders": {
            "orders": orders["total"], "new": orders["new"], "confirmed": orders["confirmed"],
            "ready": orders["ready"], "done": orders["done"], "cancelled": orders["cancelled"],
            "on account": orders["on_account"], "paid": orders["paid"],
            "cash recorded by hand": cash, "waiting for payment": orders["waiting_payment"],
            "this week": orders["this_week"], "last week": orders["last_week"],
            "value (QAR)": orders["value"] // 100,
        },
        "Bookings": {
            "bookings": bookings["total"], "upcoming": bookings["upcoming"],
            "today": bookings["today"], "tomorrow": bookings["tomorrow"],
            "no-shows": bookings["no_shows"], "cancelled": bookings["cancelled"],
            "with a deposit": bookings["with_deposit"],
        },
        "Inbox": {
            "conversations": chats["conversations"], "open": chats["open"],
            "waiting for an answer": waiting, "opted out": chats["opted_out"],
            "messages": messages,
        },
        "Credit accounts": {
            "accounts": chats["accounts"], "balance (QAR)": balance // 100,
            "0-30 days (QAR)": buckets["d0_30"] // 100,
            "31-60 days (QAR)": buckets["d31_60"] // 100,
            "61-90 days (QAR)": buckets["d61_90"] // 100,
            "over 90 days (QAR)": buckets["d90_plus"] // 100, "over their limit": over,
        },
        "Documents": {
            **{k.replace("_", " "): v for k, v in sorted(docs.items())},
            "unpaid invoices": unpaid,
            "not delivered": await one(
                "select count(*) from document_deliveries where tenant_id = $1 and "
                "status = 'failed'"),
        },
        "Team": {"members": await one("select count(*) from memberships where tenant_id = $1")},
    }


def table(summary: dict[str, dict]) -> str:
    """The summary as a plain table for the terminal."""
    lines = []
    for area, rows in summary.items():
        lines.append(f"  {area}")
        for key, value in rows.items():
            lines.append(f"      {key:<26}{value:>8}")
    return "\n".join(lines)
