"""Listing, filtering, search and customer context for the redesigned inbox (J04)."""

from typing import Any
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.modules.inbox import service

_WINDOW = "coalesce(c.last_inbound_at > now() - interval '24 hours', false)"

# Open conversations whose customer is waiting for a person: the last message that was not
# refused is theirs, it is older than `team.WAITING_MINUTES` (the rule Home and the team page
# use), and a typed reply can still go.
_WAITING = (
    "(c.inbox_status = 'open' and " + _WINDOW + " and exists (select 1 from ("
    "select m.direction, m.created_at from messages m where m.contact_id = c.id "
    "and coalesce(m.status, '') <> 'blocked' order by m.created_at desc limit 1) l "
    "where l.direction = 'in' and l.created_at < now() - "
    f"interval '{team.WAITING_MINUTES} minutes'))"
)

# Open conversations whose last message (ours) did not reach the customer.
_NOT_DELIVERED = (
    "(c.inbox_status = 'open' and exists (select 1 from ("
    "select m.direction, m.status from messages m where m.contact_id = c.id "
    "order by m.created_at desc limit 1) l "
    "where l.direction = 'out' and l.status in ('failed', 'blocked')))"
)


async def get_inbox_counts(
    conn: asyncpg.Connection, me: UUID | None = None
) -> dict[str, int]:
    """Calculate summary counts for the tabs and chips of the inbox."""
    # Open total
    open_count = await conn.fetchval(
        "select count(*)::int from contacts c "
        "where c.role = 'customer' and c.last_inbound_at is not null and c.inbox_status = 'open' "
        "and c.forgotten_at is null"
    ) or 0

    # Closed total
    closed_count = await conn.fetchval(
        "select count(*)::int from contacts c "
        "where c.role = 'customer' and c.last_inbound_at is not null and c.inbox_status = 'closed' "
        "and c.forgotten_at is null"
    ) or 0

    # Unassigned open
    unassigned_count = await conn.fetchval(
        "select count(*)::int from contacts c "
        "where c.role = 'customer' and c.last_inbound_at is not null and c.inbox_status = 'open' "
        "and c.assigned_to is null and c.forgotten_at is null"
    ) or 0

    # Assigned to current user
    mine_count = 0
    if me:
        mine_count = await conn.fetchval(
            "select count(*)::int from contacts c "
            "where c.role = 'customer' and c.last_inbound_at is not null "
            "and c.inbox_status = 'open' "
            "and c.assigned_to = $1 and c.forgotten_at is null",
            me,
        ) or 0

    # Unread open
    unread_count = await conn.fetchval(
        "select count(*)::int from contacts c "
        "where c.role = 'customer' and c.last_inbound_at is not null "
        "and c.inbox_status = 'open' "
        "and c.last_in_message_at > coalesce(c.inbox_read_at, '-infinity') "
        "and c.forgotten_at is null"
    ) or 0

    # Waiting, not delivered and window closed: the chips' counts, by the rules the chips filter by.
    waiting_count = await conn.fetchval(
        "select count(*)::int from contacts c where c.role = 'customer' "
        "and c.last_inbound_at is not null "
        f"and c.forgotten_at is null and {_WAITING}"
    ) or 0
    not_delivered_count = await conn.fetchval(
        "select count(*)::int from contacts c where c.role = 'customer' "
        "and c.last_inbound_at is not null "
        f"and c.forgotten_at is null and {_NOT_DELIVERED}"
    ) or 0
    window_closed_count = await conn.fetchval(
        "select count(*)::int from contacts c where c.role = 'customer' "
        "and c.last_inbound_at is not null "
        f"and c.inbox_status = 'open' and c.forgotten_at is null and not {_WINDOW}"
    ) or 0

    return {
        "open": open_count,
        "closed": closed_count,
        "unassigned": unassigned_count,
        "mine": mine_count,
        "unread": unread_count,
        "waiting": waiting_count,
        "not_delivered": not_delivered_count,
        "window_closed": window_closed_count,
    }


async def list_conversations_filtered(
    conn: asyncpg.Connection,
    *,
    status: str = "open",
    assigned: str = "any",
    chip: str | None = None,
    q: str | None = None,
    me: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Filter and search conversations with support for chips and pagination."""
    where_parts = [
        "c.role = 'customer'",
        "c.last_inbound_at is not null",
        "c.forgotten_at is null",
    ]
    params: list[Any] = []

    # Status
    if status in ("open", "closed"):
        params.append(status)
        where_parts.append(f"c.inbox_status = ${len(params)}")

    # Assigned
    if assigned == "none":
        where_parts.append("c.assigned_to is null")
    elif assigned == "me" and me:
        params.append(me)
        where_parts.append(f"c.assigned_to = ${len(params)}")

    # Chips
    if chip == "unassigned":
        where_parts.append("c.assigned_to is null")
    elif chip == "mine" and me:
        params.append(me)
        where_parts.append(f"c.assigned_to = ${len(params)}")
    elif chip == "window_closed":
        where_parts.append("not " + _WINDOW)
    elif chip == "waiting":
        where_parts.append(_WAITING)
    elif chip == "not_delivered":
        where_parts.append(_NOT_DELIVERED)

    # Search query
    if q and q.strip():
        search_term = f"%{q.strip().lower()}%"
        params.append(search_term)
        idx = len(params)
        where_parts.append(
            f"(lower(coalesce(c.name, '')) like ${idx} "
            f" or c.phone like ${idx} "
            f" or lower(coalesce(c.username, '')) like ${idx})"
        )

    where_sql = " and ".join(where_parts)

    count_sql = f"select count(*)::int from contacts c where {where_sql}"
    total = await conn.fetchval(count_sql, *params) or 0

    # Query rows
    params.append(limit)
    limit_idx = len(params)
    params.append(offset)
    offset_idx = len(params)

    query = (
        "select c.id, c.name, c.phone, c.username, c.inbox_status, c.assistant_paused, "
        f"      c.consent_service, {_WINDOW} as window_open, "
        "       c.last_inbound_at + interval '24 hours' as window_closes_at, "
        "       last.body, last.direction, last.kind, last.status, last.created_at, last.sent_by, "
        "       c.assigned_to, u.name as assignee_name, "
        "       case when c.last_in_message_at > coalesce(c.inbox_read_at, '-infinity') then "
        "         (select count(*) from messages m where m.contact_id = c.id "
        "            and m.direction = 'in' "
        "            and m.created_at > coalesce(c.inbox_read_at, '-infinity'))::int "
        "         else 0 end as unread "
        f"from contacts c "
        f"left join users u on u.id = c.assigned_to "
        f"join lateral (select body, direction, kind, status, created_at, sent_by from messages m "
        f"              where m.contact_id = c.id order by created_at desc limit 1) last on true "
        f"where {where_sql} "
        f"order by last.created_at desc limit ${limit_idx} offset ${offset_idx}"
    )

    rows = await conn.fetch(query, *params)
    results = [
        {
            "id": str(r["id"]),
            "name": r["name"] or r["phone"],
            "phone": r["phone"],
            "username": r["username"],
            "status": r["inbox_status"],
            "assistant_paused": bool(r["assistant_paused"]),
            "opted_out": r["consent_service"] == "revoked",
            "window_open": bool(r["window_open"]),
            "window_closes_at": service._iso(r["window_closes_at"]) if r["window_open"] else None,
            "unread": r["unread"],
            "assigned": service._assignee(r),
            "last": {
                "body": r["body"],
                "direction": r["direction"],
                "kind": r["kind"],
                "status": r["status"],
                "created_at": service._iso(r["created_at"]),
                # Who sent it: a person's name, or None for an automatic reply (`messages.sent_by`).
                "sent_by": r["sent_by"] or None,
            },
        }
        for r in rows
    ]
    return results, total


# What a staff member with the agent role must not receive: the customer's totals (ui-rules
# section 16). Per-order totals stay; the 12-month spend and the balance owed are aggregates, for
# owners and admins.
AGGREGATES = ("spent_12mo", "balance_owed")


def for_role(context: dict[str, Any], role: str | None) -> dict[str, Any]:
    """The customer context as `role` may see it. The agent role gets no aggregates in the
    response at all: they are left out, not hidden by the screen. An unknown role is an agent."""
    if role in ("owner", "admin"):
        return context
    return {key: value for key, value in context.items() if key not in AGGREGATES}


async def get_customer_context(
    conn: asyncpg.Connection, contact_id: UUID, role: str | None = "owner"
) -> dict[str, Any] | None:
    """Retrieve full customer context for the 3rd workbench pane, as `role` may see it."""
    contact = await conn.fetchrow(
        "select c.id, c.name, c.phone, c.username, c.created_at, c.consent_service, "
        "       c.consent_marketing, c.price_group_id, c.lang "
        "from contacts c "
        "where c.id = $1 and c.role = 'customer' and c.forgotten_at is null",
        contact_id,
    )
    if not contact:
        return None

    # Order count & 12-month total spend
    orders_info = await conn.fetchrow(
        "select count(*)::int as total_orders, "
        "       coalesce(sum(case when status in ('confirmed', 'ready', 'done') "
        "                         and payment = 'paid' then total else 0 end), "
        "                0)::bigint as spent_12mo "
        "from orders "
        "where contact_id = $1 and created_at > now() - interval '12 months' and is_test = false",
        contact_id,
    )

    # Last 3 orders
    order_rows = await conn.fetch(
        "select id, number, total, status, payment, created_at "
        "from orders "
        "where contact_id = $1 and is_test = false "
        "order by created_at desc limit 3",
        contact_id,
    )

    # Next upcoming booking
    next_booking = await conn.fetchrow(
        "select id, number, starts_at, ends_at, status, service_name "
        "from bookings "
        "where contact_id = $1 and starts_at > now() and status not in ('cancelled', 'completed') "
        "order by starts_at asc limit 1",
        contact_id,
    )

    # The customer's price group: their own, or the shop's default one, in its two names.
    group = await conn.fetchrow(
        "select name, name_ar from price_groups "
        "where (id = $1 or ($1::uuid is null and is_default)) and archived_at is null limit 1",
        contact["price_group_id"],
    )

    # Credit balance from ledger if available
    credit_info = await conn.fetchrow(
        "select coalesce(sum(case when kind = 'sale' then amount "
        "                         when kind = 'payment' then -amount "
        "                         else amount end), 0)::bigint as balance "
        "from ledger_entries "
        "where contact_id = $1",
        contact_id,
    )

    context = {
        "id": str(contact["id"]),
        "name": contact["name"] or contact["phone"],
        "phone": contact["phone"],
        "since": contact["created_at"].strftime("%b %Y") if contact["created_at"] else None,
        "visits": orders_info["total_orders"] if orders_info else 0,
        "spent_12mo": orders_info["spent_12mo"] if orders_info else 0,
        "balance_owed": max(0, credit_info["balance"]) if credit_info else 0,
        "price_group": group["name"] if group else None,
        "price_group_ar": group["name_ar"] if group else None,
        "lang": contact["lang"] or "ar",
        "orders": [
            {
                "id": str(o["id"]),
                "number": o["number"],
                "total": o["total"],
                "status": o["status"],
                "payment": o["payment"],
                "created_at": service._iso(o["created_at"]),
            }
            for o in order_rows
        ],
        "next_booking": {
            "id": str(next_booking["id"]),
            "number": next_booking["number"],
            "starts_at": service._iso(next_booking["starts_at"]),
            "ends_at": service._iso(next_booking["ends_at"]),
            "status": next_booking["status"],
            "service_name": next_booking["service_name"],
        } if next_booking else None,
        "consent": {
            "service": contact["consent_service"] or "agreed",
            "marketing": contact["consent_marketing"] or "unknown",
        },
    }
    return for_role(context, role)
