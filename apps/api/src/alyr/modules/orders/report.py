"""Orders in the weekly report: how many came in through WhatsApp, what they were
worth, how they were paid, and who came back. For a restaurant or a shop."""

from datetime import datetime

import asyncpg

from alyr.core.normalise import fmt_qar
from alyr.core.words import ORDERS, counted

TITLE = {"en": "Orders", "ar": "الطلبات"}


async def numbers(conn: asyncpg.Connection, start: datetime, end: datetime, tz: str,
                  current: bool) -> dict:
    row = await conn.fetchrow(
        "select count(*) filter (where status <> 'cancelled') as orders, "
        "coalesce(sum(total) filter (where status <> 'cancelled'), 0)::bigint as value, "
        "count(*) filter (where status = 'cancelled') as cancelled, "
        "coalesce(sum(total) filter (where status <> 'cancelled' and payment = 'paid'), 0)"
        "::bigint as paid_online, "
        "count(*) filter (where status <> 'cancelled' and payment = 'paid') as paid_orders, "
        "coalesce(sum(total) filter (where status <> 'cancelled' and payment = 'on_account'), 0)"
        "::bigint as on_account "
        "from orders where not is_test and created_at >= $1 and created_at < $2",
        start, end,
    )
    out = dict(row)
    if not current:
        return out
    out["repeat"] = await conn.fetchval(
        "select count(distinct o.contact_id) from orders o "
        "where not o.is_test and o.created_at >= $1 and o.created_at < $2 "
        "and o.status <> 'cancelled' "
        "and exists (select 1 from orders p where p.contact_id = o.contact_id "
        "            and p.created_at < $1)",
        start, end,
    )
    top = await conn.fetchrow(
        "select i.name, coalesce(nullif(p.name_ar, ''), i.name) as name_ar, "
        "sum(i.quantity) as quantity "
        "from order_items i join orders o on o.id = i.order_id "
        "left join items p on p.id = i.item_id "
        "where not o.is_test and o.created_at >= $1 and o.created_at < $2 "
        "and o.status <> 'cancelled' "
        "group by i.name, p.name_ar order by quantity desc, i.name limit 1",
        start, end,
    )
    out["top"] = dict(top) if top else None
    return out


def active(n: dict) -> bool:
    return bool(n["orders"] or n["cancelled"])


def headline(n: dict, lang: str) -> str:
    if not n["orders"]:
        return "لا طلبات" if lang == "ar" else "no orders"
    orders = counted(n["orders"], ORDERS, lang)
    money = fmt_qar(n["value"])
    return f"{orders} بقيمة {money}" if lang == "ar" else f"{orders} worth {money}"


def lines(n: dict, before: dict | None, lang: str) -> list[str]:
    ar = lang == "ar"
    if not active(n):
        return ["لم تصلك طلبات هذا الأسبوع." if ar else "No orders came in this week."]
    first = (
        f"طلبات وصلتك: {n['orders']}، بقيمة {fmt_qar(n['value'])}" if ar
        else f"Orders received: {n['orders']}, worth {fmt_qar(n['value'])}"
    )
    if before is not None:
        first += (
            f" (الأسبوع الماضي {before['orders']})" if ar
            else f" (last week {before['orders']})"
        )
    out = [first]
    if n["paid_online"]:
        paid = counted(n["paid_orders"], ORDERS, lang)
        out.append(
            f"المدفوع: {fmt_qar(n['paid_online'])} عن {paid}" if ar
            else f"Paid: {fmt_qar(n['paid_online'])} for {paid}"
        )
    if n["on_account"]:
        out.append(
            f"على الحساب: {fmt_qar(n['on_account'])}" if ar
            else f"Put on account: {fmt_qar(n['on_account'])}"
        )
    out.append(
        f"عملاء طلبوا مرة أخرى: {n['repeat']}" if ar
        else f"Customers who ordered again: {n['repeat']}"
    )
    if n["top"]:
        name = n["top"]["name_ar"] if ar else n["top"]["name"]
        out.append(
            f"الأكثر طلباً: {name} ({n['top']['quantity']})" if ar
            else f"Most ordered: {name} ({n['top']['quantity']})"
        )
    if n["cancelled"]:
        out.append(f"ملغاة: {n['cancelled']}" if ar else f"Cancelled: {n['cancelled']}")
    return out
