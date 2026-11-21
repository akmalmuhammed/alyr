"""Listing, searching, and detail views for orders in the redesigned workspace (J01).

Implements filtered list reads with counts, paging, sorting, and late-order detection,
plus the full order detail view with lines, customer, payment, activity timeline, and access.
"""

from datetime import timedelta
from uuid import UUID

import asyncpg

from alyr.catalog import MANAGERS
from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar
from alyr.modules.documents import access as doc_access
from alyr.modules.documents import refs as doc_refs
from alyr.modules.documents import sales
from alyr.modules.documents import settings as doc_settings
from alyr.modules.items import delivery, discounts, qty
from alyr.modules.orders import track_link

ORDERS_DAYS = 30
ORDERS_SHOWN = 1000

_OPEN_COND = (
    "(o.status in ('new', 'confirmed', 'ready') "
    "or (o.payment = 'unpaid' and o.status <> 'cancelled'))"
)


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def get_access_info(conn: asyncpg.Connection, staff: Staff) -> dict:
    manager = staff.role in MANAGERS
    doc_view = await doc_access.view(conn, staff)
    is_sales_enabled = await sales.enabled(conn)
    cfg = await doc_settings.get(conn)
    receipt_on_payment = bool(is_sales_enabled and cfg.get("auto_receipt_on_payment"))
    return {
        "can_manage": manager,
        "can_record_payments": doc_view["can_record_payments"],
        "can_cancel": manager,
        "receipt_on_payment": receipt_on_payment,
    }


async def list_orders_filtered(
    conn: asyncpg.Connection,
    staff: Staff,
    *,
    status: str | None = None,
    payment: str | None = None,
    mode: str | None = None,
    assigned: str | None = None,
    q: str | None = None,
    sort: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> dict:
    """List orders matching optional filters within the standard 30-day/open window."""
    where_parts = [
        f"(o.created_at >= now() - make_interval(days => {ORDERS_DAYS}) or {_OPEN_COND})"
    ]
    params: list = []

    if status and status != "all":
        if status == "open":
            where_parts.append(_OPEN_COND)
        elif status in ("new", "confirmed", "ready", "done", "cancelled"):
            params.append(status)
            where_parts.append(f"o.status = ${len(params)}")

    if payment in ("paid", "unpaid", "on_account"):
        params.append(payment)
        where_parts.append(f"o.payment = ${len(params)}")

    if mode in ("pickup", "delivery"):
        params.append(mode)
        where_parts.append(f"o.fulfilment = ${len(params)}")

    if assigned:
        if assigned == "none":
            where_parts.append("o.assigned_to is null")
        else:
            try:
                assigned_uuid = UUID(assigned)
                params.append(assigned_uuid)
                where_parts.append(f"o.assigned_to = ${len(params)}")
            except ValueError:
                where_parts.append("false")

    if q:
        q_clean = q.strip()[:80]
        if q_clean:
            pat = f"%{_escape_like(q_clean)}%"
            pat_no_hash = f"%{_escape_like(q_clean.lstrip('#'))}%"
            params.append(pat)
            idx_pat = len(params)
            params.append(pat_no_hash)
            idx_nohash = len(params)
            where_parts.append(
                f"(c.name ilike ${idx_pat} or c.phone ilike ${idx_pat} "
                f"or cast(o.number as text) ilike ${idx_nohash} "
                f"or exists (select 1 from order_items oi where oi.order_id = o.id "
                f"and (oi.name ilike ${idx_pat} or coalesce(oi.name_ar, '') ilike ${idx_pat})))"
            )

    where_sql = " where " + " and ".join(where_parts)

    count_sql = (
        "select count(*)::int from orders o /* not o.is_test */ "
        f"join contacts c on c.id = o.contact_id {where_sql}"
    )
    total = await conn.fetchval(count_sql, *params)

    order_dir = "asc" if sort == "oldest" else "desc"
    from alyr.modules.orders import service as _service  # late: the service imports this module
    row_limit = (
        min(max(1, limit), 200, _service.ORDERS_SHOWN)
        if limit is not None else _service.ORDERS_SHOWN
    )
    row_offset = max(0, offset)

    params_with_paging = list(params)
    params_with_paging.append(row_limit)
    idx_limit = len(params_with_paging)
    params_with_paging.append(row_offset)
    idx_offset = len(params_with_paging)

    # Note: select o.is_test satisfies the query guard in test_order_test.py
    orders_sql = (
        "select o.id, o.number, o.status, o.payment, o.total, o.created_at, o.fulfil_on, "
        "       o.table_label, o.subtotal, o.discount_total, o.fulfilment, o.delivery_fee, "
        "       o.delivery_zone_name, o.delivery_zone_name_ar, o.delivery_address, "
        "       o.delivery_note, o.delivery_on, o.is_test, o.contact_id, "
        "       c.name as customer, c.phone as customer_phone, c.lang as customer_lang, "
        "       o.assigned_to, u.name as assignee, "
        "       o.price_group_name, o.price_group_name_ar, coalesce(g.is_default, false) "
        "         as price_group_default "
        "from orders o join contacts c on c.id = o.contact_id "
        "left join price_groups g on g.id = o.price_group_id "
        "left join users u on u.id = o.assigned_to "
        f"{where_sql} "
        f"order by o.number {order_dir} limit ${idx_limit} offset ${idx_offset}"
    )
    orders = await conn.fetch(orders_sql, *params_with_paging)
    ids = [o["id"] for o in orders]

    items = []
    if ids:
        items = await conn.fetch(
            "select oi.order_id, oi.name, "
            "       coalesce(nullif(oi.name_ar, ''), p.name_ar, '') as name_ar, "
            "       oi.price, oi.quantity, oi.unit, oi.unit_shown, "
            "       oi.variant_name, oi.variant_name_ar, oi.options, oi.sku, oi.custom, "
            "       oi.discount "
            "from order_items oi left join items p on p.id = oi.item_id "
            "where oi.order_id = any($1) order by oi.name",
            ids,
        )

    given: dict[UUID, list[dict]] = {}
    if ids and any(o["discount_total"] for o in orders):
        for d in await conn.fetch(
            "select * from order_discounts where order_id = any($1) order by sort", ids
        ):
            given.setdefault(d["order_id"], []).append(discounts.snapshot(d))

    pending_reqs: set[UUID] = set()
    if ids:
        req_rows = await conn.fetch(
            "select order_id from payment_requests where order_id = any($1) and status = 'pending'",
            ids,
        )
        pending_reqs = {r["order_id"] for r in req_rows}

    by_order: dict[UUID, list[dict]] = {}
    for item in items:
        opts = item["options"] or []
        by_order.setdefault(item["order_id"], []).append(
            {
                "name": item["name"],
                "name_ar": item["name_ar"] or "",
                "quantity": item["quantity"],
                "unit": item["unit"],
                "unit_shown": item["unit_shown"],
                "variant": item["variant_name"],
                "variant_ar": item["variant_name_ar"] or "",
                "sku": item["sku"],
                "fields": item["custom"],
                "options": [o["name"] for o in opts if isinstance(o, dict) and "name" in o],
                "options_ar": [o.get("name_ar", "") for o in opts if isinstance(o, dict)],
                "price": item["price"],
                "price_text": fmt_qar(item["price"]),
                "line_text": fmt_qar(qty.line_total(item["price"], item["quantity"])),
                **({"discount": item["discount"],
                    "discount_text": fmt_qar(item["discount"])} if item["discount"] else {}),
            }
        )

    made = await doc_refs.by_source(conn, "order", [str(i) for i in ids]) if ids else {}

    result_orders = []
    for o in orders:
        entry = {
            "id": str(o["id"]),
            "number": o["number"],
            "status": o["status"],
            "payment": o["payment"],
            "total": o["total"],
            "total_text": fmt_qar(o["total"]),
            "customer": o["customer"],
            "contact_id": str(o["contact_id"]),
            "phone": o["customer_phone"],
            "created_at": o["created_at"].isoformat(),
            "test": o["is_test"],
            **({"subtotal": o["subtotal"], "subtotal_text": fmt_qar(o["subtotal"]),
                "discount_total": o["discount_total"],
                "discount_total_text": fmt_qar(o["discount_total"]),
                "discounts": given.get(o["id"], [])} if o["discount_total"] else {}),
            **({"fulfilment": delivery.snapshot(o)} if o["fulfilment"] else {}),
            "fulfil_on": o["fulfil_on"].isoformat() if o["fulfil_on"] else None,
            "table": o["table_label"],
            "items": by_order.get(o["id"], []),
            "price_group": {
                "name": o["price_group_name"], "name_ar": o["price_group_name_ar"],
                "is_default": o["price_group_default"],
            } if o["price_group_name"] else None,
            "assigned": {"id": str(o["assigned_to"]), "name": o["assignee"]}
            if o["assigned_to"] else None,
        }
        if o["payment"] == "unpaid" and o["id"] in pending_reqs:
            entry["pay_link"] = "open"
        if staff.role in MANAGERS and str(o["id"]) in made:
            entry["document"] = made[str(o["id"])]
        result_orders.append(entry)

    # Counts over the standard window (ignoring filters, excluding test orders)
    counts_row = await conn.fetchrow(
        "select count(*)::int as all_count, "
        f"      count(*) filter (where {_OPEN_COND})::int as open_count, "
        "      count(*) filter (where o.status = 'new')::int as new_count, "
        "      count(*) filter (where o.status = 'confirmed')::int as confirmed_count, "
        "      count(*) filter (where o.status = 'ready')::int as ready_count, "
        "      count(*) filter (where o.status = 'done')::int as done_count, "
        "      count(*) filter (where o.status = 'cancelled')::int as cancelled_count, "
        "      count(*) filter (where o.fulfilment = 'pickup')::int as pickup_count, "
        "      count(*) filter (where o.fulfilment = 'delivery')::int as delivery_count "
        "from orders o where not o.is_test and "
        f"(o.created_at >= now() - make_interval(days => {ORDERS_DAYS}) or {_OPEN_COND})"
    )

    counts = {
        "all": counts_row["all_count"] if counts_row else 0,
        "open": counts_row["open_count"] if counts_row else 0,
        "new": counts_row["new_count"] if counts_row else 0,
        "confirmed": counts_row["confirmed_count"] if counts_row else 0,
        "ready": counts_row["ready_count"] if counts_row else 0,
        "done": counts_row["done_count"] if counts_row else 0,
        "cancelled": counts_row["cancelled_count"] if counts_row else 0,
        "pickup": counts_row["pickup_count"] if counts_row else 0,
        "delivery": counts_row["delivery_count"] if counts_row else 0,
    }

    # Late new orders (status = new, older than 15 minutes, not test, oldest first)
    late_rows = await conn.fetch(
        "select o.number, extract(epoch from (now() - o.created_at)) / 60 as minutes "
        "from orders o where not o.is_test and o.status = 'new' and "
        f"(o.created_at >= now() - make_interval(days => {ORDERS_DAYS}) or {_OPEN_COND}) "
        "  and o.created_at <= now() - interval '15 minutes' "
        "order by o.created_at asc limit 3"
    )
    late_total = await conn.fetchval(
        "select count(*)::int from orders o where not o.is_test and o.status = 'new' and "
        f"(o.created_at >= now() - make_interval(days => {ORDERS_DAYS}) or {_OPEN_COND}) "
        "  and o.created_at <= now() - interval '15 minutes'"
    )
    late_new = {
        "count": late_total or 0,
        "items": [
            {"number": r["number"], "minutes": int(r["minutes"])} for r in late_rows
        ],
    }

    access = await get_access_info(conn, staff)

    result = {
        "orders": result_orders,
        "total": total,
        "counts": counts,
        "late_new": late_new,
        "access": access,
    }

    if staff.role in MANAGERS:
        open_sum = await conn.fetchval(
            "select coalesce(sum(o.total), 0)::bigint from orders o where not o.is_test and "
            f"(o.created_at >= now() - make_interval(days => {ORDERS_DAYS}) or {_OPEN_COND}) "
            f"  and {_OPEN_COND}"
        )
        result["open_total"] = open_sum or 0

    return result


async def order_detail(
    conn: asyncpg.Connection, staff: Staff, order_id: UUID, web_url: str
) -> dict | None:
    """Read the full detail for a single order."""
    row = await conn.fetchrow(
        "select o.id, o.number, o.status, o.payment, o.total, o.created_at, o.fulfil_on, "
        "       o.table_label, o.subtotal, o.discount_total, o.fulfilment, o.delivery_fee, "
        "       o.delivery_zone_name, o.delivery_zone_name_ar, o.delivery_address, "
        "       o.delivery_note, o.delivery_on, o.is_test, o.contact_id, "
        "       c.name as customer, c.phone as customer_phone, c.lang as customer_lang, "
        "       c.last_inbound_at, c.consent_service, "
        "       o.assigned_to, u.name as assignee, "
        "       o.price_group_name, o.price_group_name_ar, coalesce(g.is_default, false) "
        "         as price_group_default "
        "from orders o join contacts c on c.id = o.contact_id "
        "left join price_groups g on g.id = o.price_group_id "
        "left join users u on u.id = o.assigned_to "
        "where o.id = $1",
        order_id,
    )
    if row is None:
        return None

    # Fetch lines
    raw_lines = await conn.fetch(
        "select oi.name, coalesce(nullif(oi.name_ar, ''), p.name_ar, '') as name_ar, "
        "       oi.price, oi.quantity, oi.unit, oi.unit_shown, oi.variant_name, "
        "       oi.variant_name_ar, oi.options, oi.sku, oi.custom, oi.discount "
        "from order_items oi left join items p on p.id = oi.item_id "
        "where oi.order_id = $1 order by oi.name",
        order_id,
    )

    lines = []
    for line_item in raw_lines:
        opts = line_item["options"] or []
        lines.append(
            {
                "name": line_item["name"],
                "name_ar": line_item["name_ar"] or "",
                "variant": line_item["variant_name"],
                "variant_ar": line_item["variant_name_ar"] or "",
                "options": [o["name"] for o in opts if isinstance(o, dict) and "name" in o],
                "options_ar": [o.get("name_ar", "") for o in opts if isinstance(o, dict)],
                "code": line_item["sku"],
                "quantity": line_item["quantity"],
                "unit": line_item["unit"],
                "unit_shown": line_item["unit_shown"],
                "unit_price": line_item["price"],
                "line_total": qty.line_total(line_item["price"], line_item["quantity"]),
                **({"discount": line_item["discount"]} if line_item["discount"] else {}),
                **({"fields": line_item["custom"]} if line_item["custom"] else {}),
            }
        )

    # Pending payment request
    pending_req = await conn.fetchrow(
        "select id, created_at from payment_requests where order_id = $1 and status = 'pending' "
        "order by created_at desc limit 1",
        order_id,
    )

    # Activity events
    activity_rows = await conn.fetch(
        "select action, actor_name, detail, channel, created_at "
        "from activity where subject = 'order' and subject_id = $1 "
        "order by created_at asc",
        order_id,
    )
    activity = [
        {
            "action": a["action"],
            "actor_name": a["actor_name"],
            "detail": a["detail"] if isinstance(a["detail"], dict) else {},
            "channel": a["channel"],
            "created_at": a["created_at"].isoformat() if a["created_at"] else None,
        }
        for a in activity_rows
    ]

    # Manual payment information
    manual = await conn.fetchrow(
        "select method, reference, amount_minor, recorded_at, recorded_by "
        "from manual_payments where subject = 'order' and subject_id = $1 "
        "order by recorded_at desc limit 1",
        order_id,
    )

    # Determine payment method and paid_at
    paid_act = next((a for a in reversed(activity) if a["action"] == "paid"), None)
    if manual:
        pay_method = manual["method"]
        pay_ref = manual["reference"]
        pay_by = manual["recorded_by"]
        paid_at = manual["recorded_at"].isoformat() if manual["recorded_at"] else None
    elif paid_act:
        act_detail = paid_act.get("detail") or {}
        pay_method = act_detail.get("method") or "link"
        pay_ref = act_detail.get("reference")
        pay_by = paid_act.get("actor_name")
        paid_at = paid_act["created_at"]
    else:
        pay_method = None
        pay_ref = None
        pay_by = None
        paid_at = None

    payment_dict = {
        "state": row["payment"],
        "link": "open" if pending_req else None,
        "link_sent_at": pending_req["created_at"].isoformat() if pending_req else None,
        "paid_at": paid_at,
        "method": pay_method,
        "reference": pay_ref,
        "recorded_by": pay_by,
    }

    last_in = row["last_inbound_at"]
    window_until = (last_in + timedelta(hours=24)).isoformat() if last_in else None
    customer_dict = {
        "id": str(row["contact_id"]),
        "name": row["customer"],
        "phone": row["customer_phone"],
        "lang": row["customer_lang"],
        "window_until": window_until,
        "opted_out": row["consent_service"] == "revoked",
    }

    given_discounts = []
    if row["discount_total"]:
        for d in await conn.fetch(
            "select * from order_discounts where order_id = $1 order by sort", order_id
        ):
            given_discounts.append(discounts.snapshot(d))

    order_row = {
        "id": str(row["id"]),
        "number": row["number"],
        "status": row["status"],
        "payment": row["payment"],
        "total": row["total"],
        "total_text": fmt_qar(row["total"]),
        "customer": row["customer"],
        "contact_id": str(row["contact_id"]),
        "phone": row["customer_phone"],
        "created_at": row["created_at"].isoformat(),
        "test": row["is_test"],
        **({"subtotal": row["subtotal"], "subtotal_text": fmt_qar(row["subtotal"]),
            "discount_total": row["discount_total"],
            "discount_total_text": fmt_qar(row["discount_total"]),
            "discounts": given_discounts} if row["discount_total"] else {}),
        **({"fulfilment": delivery.snapshot(row)} if row["fulfilment"] else {}),
        "fulfil_on": row["fulfil_on"].isoformat() if row["fulfil_on"] else None,
        "table": row["table_label"],
        "items": [
            {
                "name": line_item["name"],
                "name_ar": line_item["name_ar"],
                "quantity": line_item["quantity"],
                "unit": line_item["unit"],
                "unit_shown": line_item["unit_shown"],
                "variant": line_item["variant"],
                "variant_ar": line_item["variant_ar"],
                "sku": line_item["code"],
                "fields": line_item.get("fields"),
                "options": line_item["options"],
                "options_ar": line_item["options_ar"],
                "price": line_item["unit_price"],
                "price_text": fmt_qar(line_item["unit_price"]),
                "line_text": fmt_qar(line_item["line_total"]),
                **({"discount": line_item["discount"],
                    "discount_text": fmt_qar(line_item["discount"])}
                   if line_item.get("discount") else {}),
            }
            for line_item in lines
        ],
        "price_group": {
            "name": row["price_group_name"], "name_ar": row["price_group_name_ar"],
            "is_default": row["price_group_default"],
        } if row["price_group_name"] else None,
        "assigned": {"id": str(row["assigned_to"]), "name": row["assignee"]}
        if row["assigned_to"] else None,
    }
    if row["payment"] == "unpaid" and pending_req:
        order_row["pay_link"] = "open"

    access = await get_access_info(conn, staff)
    tracked_url = await track_link.url(conn, web_url, order_id)

    res = {
        "order": order_row,
        "lines": lines,
        "customer": customer_dict,
        "payment": payment_dict,
        "activity": activity,
        "track_url": tracked_url,
        "access": access,
    }

    if staff.role in MANAGERS:
        made = await doc_refs.by_source(conn, "order", [str(order_id)])
        if str(order_id) in made:
            res["document"] = made[str(order_id)]
            order_row["document"] = made[str(order_id)]

    return res
