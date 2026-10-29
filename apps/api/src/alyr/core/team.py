"""Who is handling what, what each person did, and how the team is doing (D-028).

Every conversation, order, booking and credit account has one person responsible. Every
change to them is written to `activity`, which nobody can edit. The performance numbers
are read from those records and from the messages themselves, never typed in.

Every function takes a tenant-scoped connection.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar

SUBJECTS = ("conversation", "order", "booking", "account")
OUTCOMES = ("sold", "booked", "answered", "lost")
LOST_REASONS = ("price", "not_available", "no_reply", "went_elsewhere", "other")
# A customer whose last message has had no answer for this long is waiting.
WAITING_MINUTES = 10
PERIODS = (1, 7, 30)


class TeamError(Exception):
    """A request about the team that cannot be carried out; the message is safe to show."""


@dataclass(frozen=True)
class Actor:
    """Who did something. `id` is None for the customer, the assistant and the open demo.
    `via` says how, when it was not the workspace: "whatsapp" for a staff member's message
    (the staff number has no sign-in, so `id` is None and `name` is the person's name)."""

    id: UUID | None
    name: str
    via: str = ""


CUSTOMER = Actor(None, "Customer")
ASSISTANT = Actor(None, "Assistant")


def actor_of(staff: Staff) -> Actor:
    return Actor(staff.user_id, staff.name)


# Where each subject keeps its person responsible and its customer.
_TABLE = {
    "conversation": ("contacts", "id", "id", "role = 'customer'"),
    "order": ("orders", "id", "contact_id", "true"),
    "booking": ("bookings", "id", "contact_id", "true"),
    "account": ("ledger_accounts", "contact_id", "contact_id", "true"),
}


async def record(
    conn: asyncpg.Connection,
    subject: str,
    subject_id: UUID,
    action: str,
    actor: Actor,
    contact_id: UUID | None = None,
    detail: dict | None = None,
    channel: str = "portal",
) -> None:
    """Put one thing on the record. `channel` says which door it came through: the
    workspace ("portal"), a message ("whatsapp"), or ALYR itself ("system") (D-065)."""
    await conn.execute(
        "insert into activity (subject, subject_id, contact_id, action, detail, actor_id, "
        "actor_name, channel) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        subject,
        subject_id,
        contact_id,
        action,
        {k: v for k, v in ((detail or {}) | ({"via": actor.via} if actor.via else {})).items()
         if v is not None},
        actor.id,
        actor.name,
        channel,
    )


async def member_name(conn: asyncpg.Connection, user_id: UUID | None) -> str | None:
    """The name of someone on this shop's team, or None if they are not on it."""
    if user_id is None:
        return None
    return await conn.fetchval(
        "select u.name from memberships m join users u on u.id = m.user_id "
        "where m.user_id = $1 "
        "and m.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        user_id,
    )


async def assign(
    conn: asyncpg.Connection,
    subject: str,
    subject_id: UUID,
    user_id: UUID | None,
    actor: Actor,
) -> bool:
    """Make someone responsible, or nobody. Returns False if there is no such item.
    Only people on this shop's team can be given anything."""
    if subject not in SUBJECTS:
        raise TeamError("unknown kind of item")
    to_name = await member_name(conn, user_id)
    if user_id is not None and to_name is None:
        raise TeamError("that person is not on this shop's team")
    table, key, contact_col, where = _TABLE[subject]
    if subject == "account":
        # A credit account's chasing row may not exist yet; the customer must.
        if not await conn.fetchval(
            "select true from contacts where id = $1 and role = 'customer'", subject_id
        ):
            return False
        await conn.execute(
            "insert into ledger_accounts (contact_id) values ($1) on conflict do nothing",
            subject_id,
        )
    row = await conn.fetchrow(
        f"select {table}.assigned_to, u.name, {table}.{contact_col} as contact_id "
        f"from {table} left join users u on u.id = {table}.assigned_to "
        f"where {table}.{key} = $1 and {where}",
        subject_id,
    )
    if row is None:
        return False
    if row["assigned_to"] == user_id:
        return True
    await conn.execute(f"update {table} set assigned_to = $2 where {key} = $1", subject_id, user_id)
    await record(
        conn,
        subject,
        subject_id,
        "assigned",
        actor,
        row["contact_id"],
        {"to": to_name, "from": row["name"]},
    )
    return True


async def claim(conn: asyncpg.Connection, subject: str, subject_id: UUID, actor: Actor) -> None:
    """Whoever acts on an item nobody has becomes responsible for it."""
    if actor.id is None:
        return
    table, key, contact_col, where = _TABLE[subject]
    contact_id = await conn.fetchval(
        f"update {table} set assigned_to = $2 where {key} = $1 and assigned_to is null "
        f"and {where} returning {contact_col}",
        subject_id,
        actor.id,
    )
    if contact_id is not None:
        await record(conn, subject, subject_id, "took", actor, contact_id)


async def history(conn: asyncpg.Connection, contact_id: UUID) -> list[dict]:
    """Everything the team did for one customer, oldest first."""
    rows = await conn.fetch(
        "select id, subject, subject_id, action, detail, actor_name, created_at "
        "from activity where contact_id = $1 order by created_at",
        contact_id,
    )
    return [
        {
            "id": str(r["id"]),
            "subject": r["subject"],
            "subject_id": str(r["subject_id"]),
            "action": r["action"],
            "detail": r["detail"],
            "actor_name": r["actor_name"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


async def sign_replies(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval("select sign_replies from shop_settings"))


async def set_sign_replies(conn: asyncpg.Connection, on: bool) -> None:
    await conn.execute(
        "insert into shop_settings (sign_replies) values ($1) "
        "on conflict (tenant_id) do update set sign_replies = $1",
        on,
    )


def signed(text: str, name: str) -> str:
    """A staff reply with the sender's first name under it, the way people sign off."""
    first = name.split()[0] if name.strip() else ""
    return f"{text}\n\n— {first}" if first else text


async def performance(
    conn: asyncpg.Connection, staff: Staff, days: int, now: datetime | None = None
) -> dict:
    """How each person on the team is doing over the last `days` shop-calendar days,
    today included. Owners and admins see everyone; an agent sees only themselves.
    `now` is for reading the numbers as they were at another moment (the Agent's
    sample screens); by default it is the present."""
    if days not in PERIODS:
        raise TeamError("period must be 1, 7 or 30 days")
    now = now or datetime.now(UTC)
    since = await conn.fetchval(
        "select (date_trunc('day', $2::timestamptz at time zone t.timezone) "
        "- ($1 - 1) * interval '1 day') at time zone t.timezone from tenants t "
        "where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        days, now,
    )
    members = await conn.fetch(
        "select u.id, u.name, m.role from memberships m join users u on u.id = m.user_id "
        "order by u.name"
    )
    people: dict[UUID | None, dict] = {
        m["id"]: _blank(m["id"], m["name"], m["role"]) for m in members
    }
    unassigned = _blank(None, "", "")

    def bucket(user_id):
        return people.get(user_id, unassigned) if user_id is not None else unassigned

    # Open conversations, and those whose customer is still waiting for an answer.
    for r in await conn.fetch(
        "select c.assigned_to, count(*)::int as open, "
        "  count(*) filter (where l.direction = 'in' "
        f"    and l.created_at < $1::timestamptz - interval '{WAITING_MINUTES} minutes')::int "
        "    as waiting, "
        "  min(l.created_at) filter (where l.direction = 'in') as oldest "
        "from contacts c join lateral (select direction, created_at from messages m "
        "  where m.contact_id = c.id and coalesce(m.status, '') <> 'blocked' "
        "  order by created_at desc limit 1) l on true "
        "where c.role = 'customer' and c.inbox_status = 'open' "
        "  and c.last_inbound_at is not null "
        "group by c.assigned_to",
        now,
    ):
        b = bucket(r["assigned_to"])
        b["open"] += r["open"]
        b["waiting"] += r["waiting"]
        if r["waiting"] and r["oldest"] is not None:
            b["_oldest"] = min(filter(None, (b.get("_oldest"), r["oldest"])))

    # Replies, and how long the customer had been waiting when each first answer came.
    for r in await conn.fetch(
        """
        with replies as (
            select r.sent_by_user, r.created_at,
                   (select min(m.created_at) from messages m
                     where m.contact_id = r.contact_id and m.direction = 'in'
                       and m.created_at < r.created_at
                       and m.created_at > coalesce(
                           (select max(o.created_at) from messages o
                             where o.contact_id = r.contact_id and o.direction = 'out'
                               and o.created_at < r.created_at
                               and coalesce(o.status, '') <> 'blocked'),
                           '-infinity')) as waited_from
            from messages r
            where r.direction = 'out' and r.sent_by_user is not null and r.created_at >= $1
              and r.created_at <= $2 and coalesce(r.status, '') <> 'blocked'
        )
        select sent_by_user, count(*)::int as replies,
               percentile_cont(0.5) within group (
                   order by extract(epoch from created_at - waited_from))
                   filter (where waited_from is not null) as median_seconds
        from replies group by sent_by_user
        """,
        since, now,
    ):
        b = bucket(r["sent_by_user"])
        b["replies"] = r["replies"]
        b["median_reply_seconds"] = (
            round(r["median_seconds"]) if r["median_seconds"] is not None else None
        )

    # Why conversations were closed, by the person who closed them.
    for r in await conn.fetch(
        "select actor_id, detail->>'outcome' as outcome, count(*)::int as n from activity "
        "where subject = 'conversation' and action = 'closed' and created_at >= $1 "
        "and created_at <= $2 group by actor_id, detail->>'outcome'",
        since, now,
    ):
        b = bucket(r["actor_id"])
        key = r["outcome"] if r["outcome"] in OUTCOMES else "unsaid"
        b["closed"][key] = b["closed"].get(key, 0) + r["n"]
        b["closed_total"] += r["n"]

    # Orders each person is responsible for, placed in the period and not cancelled.
    for r in await conn.fetch(
        "select assigned_to, count(*)::int as orders, coalesce(sum(total), 0)::bigint as sales, "
        "  coalesce(sum(total) filter (where payment in ('paid', 'on_account')), 0)::bigint "
        "    as settled "
        "from orders where not is_test and created_at >= $1 and created_at <= $2 and status <> "
        "'cancelled' "
        "group by assigned_to",
        since, now,
    ):
        b = bucket(r["assigned_to"])
        b["orders"], b["sales"], b["settled"] = r["orders"], r["sales"], r["settled"]

    # Visits that were due in the period: did the customer come?
    for r in await conn.fetch(
        "select assigned_to, "
        "  count(*) filter (where status = 'completed')::int as completed, "
        "  count(*) filter (where status = 'no_show')::int as no_shows "
        "from bookings where starts_at >= $1 and starts_at <= $2 group by assigned_to",
        since, now,
    ):
        b = bucket(r["assigned_to"])
        b["bookings_completed"], b["no_shows"] = r["completed"], r["no_shows"]

    for b in [*people.values(), unassigned]:
        oldest = b.pop("_oldest", None)
        b["oldest_wait_minutes"] = int((now - oldest).total_seconds() // 60) if oldest else None
        b["sales_text"] = fmt_qar(b["sales"])

    everyone = staff.role != "agent" or staff.user_id is None
    rows = (
        list(people.values())
        if everyone
        else [p for p in people.values() if p["id"] == str(staff.user_id)]
    )
    medians = [
        p["median_reply_seconds"] for p in people.values() if p["median_reply_seconds"] is not None
    ]
    total_sales = sum(p["sales"] for p in people.values()) + unassigned["sales"]
    return {
        "days": days,
        "since": since.isoformat(),
        "waiting_minutes": WAITING_MINUTES,
        "can_see_everyone": everyone,
        "unassigned": {
            "open": unassigned["open"],
            "waiting": unassigned["waiting"],
            "oldest_wait_minutes": unassigned["oldest_wait_minutes"],
            "orders": unassigned["orders"],
            "sales": unassigned["sales"],
            "sales_text": unassigned["sales_text"],
        },
        "totals": {
            "waiting": sum(p["waiting"] for p in people.values()) + unassigned["waiting"],
            "open": sum(p["open"] for p in people.values()) + unassigned["open"],
            "closed": sum(p["closed_total"] for p in people.values()) + unassigned["closed_total"],
            "sold": sum(p["closed"].get("sold", 0) for p in people.values()),
            "sales": total_sales,
            "sales_text": fmt_qar(total_sales),
            # The middle of the people's middles is a fair headline without weighting
            # one very busy person over everyone else.
            "median_reply_seconds": sorted(medians)[len(medians) // 2] if medians else None,
        },
        "people": rows,
    }


def _blank(user_id, name: str, role: str) -> dict:
    return {
        "id": str(user_id) if user_id else None,
        "name": name,
        "role": role,
        "open": 0,
        "waiting": 0,
        "replies": 0,
        "median_reply_seconds": None,
        "closed": {},
        "closed_total": 0,
        "orders": 0,
        "sales": 0,
        "settled": 0,
        "bookings_completed": 0,
        "no_shows": 0,
    }
