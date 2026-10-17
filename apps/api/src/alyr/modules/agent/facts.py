"""Everything the Agent's rules and screen need, read in one business's scope as it stood
at a given moment.

`gather()` runs inside `db.tenant()`, so row-level security limits every query to the
business in scope; nothing here filters by tenant itself. Every query is bounded by `now`
rather than the database clock, so the sample screens can be read at a fixed moment.
Weeks run Sunday 00:00 to Sunday 00:00 in the shop's time zone, as the weekly report's do
(D-030). "This week" is Sunday to now; "last week" is the same span seven days earlier.
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from statistics import median
from zoneinfo import ZoneInfo

import asyncpg

from alyr import catalog
from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules import report
from alyr.modules.ledger import service as ledger

WAITING_MINUTES = team.WAITING_MINUTES
UNCONFIRMED_MINUTES = 15
READY_HOURS = 2
LINK_HOURS = 24


@dataclass
class Row:
    """One counted record behind a rule: what the "show me" list names."""

    id: str
    label: str
    detail: dict = field(default_factory=dict)


@dataclass
class Account:
    id: str
    name: str
    balance: int
    oldest_days: int
    buckets: dict
    promised: bool
    last_reminded_at: datetime | None
    over_limit: bool


@dataclass
class Facts:
    now: datetime
    tz: str = "Asia/Qatar"
    modules: frozenset = frozenset()
    business_type: str = ""
    started: datetime | None = None
    booking_reminders: bool = True
    first_name: str = ""
    money: bool = True
    has_records: bool = True
    # The team inbox
    waiting: list = field(default_factory=list)
    wrote: int = 0
    wrote_last: int = 0
    new_customers: int = 0
    new_customers_last: int = 0
    first_answer: int | None = None  # median seconds, last 7 days
    first_answer_before: int | None = None  # the 7 days before that
    lost_reasons: dict = field(default_factory=dict)  # last 30 days
    chats_by_day: dict = field(default_factory=dict)
    # Orders
    orders: int = 0
    orders_last: int = 0
    sales: int = 0
    sales_last: int = 0
    came_back: int = 0
    came_back_last: int = 0
    paid_link: int = 0
    paid_link_last: int = 0
    paid_link_count: int = 0
    paid_link_count_last: int = 0
    unconfirmed: list = field(default_factory=list)
    ready_waiting: list = field(default_factory=list)
    open_links: list = field(default_factory=list)
    orders_by_day: dict = field(default_factory=dict)  # date -> (count, sales)
    top_items: list = field(default_factory=list)  # (name, last 28 days, the 28 before)
    risers: list = field(default_factory=list)  # (name, this week, last week)
    unused_products: list = field(default_factory=list)
    orders_30d: int = 0
    quiet_regulars: list = field(default_factory=list)
    # Bookings
    visits: int = 0
    visits_last: int = 0
    no_shows_week: int = 0
    made: int = 0
    made_last: int = 0
    booked_ahead: int = 0
    booked_value_ahead: int = 0
    priced: bool = False
    unmarked: list = field(default_factory=list)
    completed_30: int = 0
    no_shows_30: int = 0
    repeat_no_shows: list = field(default_factory=list)
    thin_days: list = field(default_factory=list)  # (date, share booked) under 30%
    open_days_ahead: int = 0
    late_cancellations: int = 0
    due_back: list = field(default_factory=list)
    visits_by_day: dict = field(default_factory=dict)
    booked_share_by_day: dict = field(default_factory=dict)
    top_services: list = field(default_factory=list)
    # Credit accounts
    accounts: list = field(default_factory=list)
    owed: int = 0
    owed_last: int = 0
    owing: int = 0
    buckets: dict = field(default_factory=dict)
    collected: int = 0
    collected_last: int = 0
    promises_passed: list = field(default_factory=list)
    owed_weeks: list = field(default_factory=list)  # (sales, payments), oldest week first
    collected_by_day: dict = field(default_factory=dict)
    # Done for the business this week
    sent_for_you: int = 0
    booking_reminders_sent: int = 0
    payment_reminders_sent: int = 0
    paid_by_link_week: int = 0
    # The team and the report
    team: dict | None = None
    report_on: bool = True
    report_numbers: int = 0
    report_at: datetime | None = None
    # Busiest hours: (Sunday-first day, hour) -> count over 28 days
    hours_grid: dict = field(default_factory=dict)
    hours_range: tuple = (7, 22)
    # Arabic names of products and services, for the Arabic view of top items.
    names_ar: dict = field(default_factory=dict)

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.tz)

    @property
    def local(self) -> datetime:
        return self.now.astimezone(self.zone)

    @property
    def today(self) -> date:
        return self.local.date()

    @property
    def week_start(self) -> date:
        """The Sunday this week began."""
        return self.today - timedelta(days=(self.today.weekday() + 1) % 7)

    def at(self, day: date) -> datetime:
        """Midnight at the start of `day`, shop time."""
        return datetime.combine(day, time(0), self.zone)

    @property
    def first_week(self) -> bool:
        return self.started is not None and self.now - self.started < timedelta(days=7)

    @property
    def comparisons_from(self) -> date:
        """The first Sunday with a whole week before it to compare with."""
        start = (self.started or self.now).astimezone(self.zone).date()
        sunday = start - timedelta(days=(start.weekday() + 1) % 7)
        return sunday + timedelta(days=14)


def _rows(records, label: str = "name", **detail_keys) -> list[Row]:
    return [
        Row(str(r["id"]), r[label] or "", {k: r[v] for k, v in detail_keys.items()})
        for r in records
    ]


async def gather(conn: asyncpg.Connection, staff: Staff, now: datetime | None = None) -> Facts:
    now = now or datetime.now(UTC)
    shop = await conn.fetchrow(
        "select timezone, business_type, coalesce(onboarded_at, created_at) as started, "
        "booking_reminders from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    modules = frozenset(
        r["module_key"] for r in await conn.fetch(
            "select module_key from tenant_modules where enabled"
        )
    )
    f = Facts(
        now=now,
        tz=shop["timezone"] or "Asia/Qatar",
        modules=modules,
        business_type=shop["business_type"] or "",
        started=shop["started"],
        booking_reminders=shop["booking_reminders"],
        first_name=(staff.name.split()[0] if staff.user_id and staff.name.strip() else ""),
        money=staff.role in catalog.MANAGERS,
    )
    ws = f.at(f.week_start)
    span = (ws, now)
    last = (ws - timedelta(days=7), now - timedelta(days=7))
    chart = (ws - timedelta(days=7), now)  # last week and this week, by day

    f.has_records = bool(await conn.fetchval(
        "select exists (select 1 from orders where created_at <= $1) "
        "or exists (select 1 from bookings where created_at <= $1) "
        "or exists (select 1 from ledger_entries where created_at <= $1) "
        "or exists (select 1 from messages m join contacts c on c.id = m.contact_id "
        "           where c.role = 'customer' and m.direction = 'in' and m.created_at <= $1)",
        now,
    ))
    if "inbox" in modules:
        await _inbox(conn, f, span, last, chart)
        f.team = await team.performance(conn, staff, 7, now)
    if "orders" in modules:
        await _orders(conn, f, span, last, chart)
    if "bookings" in modules:
        await _bookings(conn, f, span, last, chart)
    if "ledger" in modules:
        await _ledger(conn, f, span, last, chart)
    if modules & {"orders", "bookings"}:
        await _quiet_regulars(conn, f)
    if "orders" in modules:
        f.names_ar |= {
            r["name"]: r["name_ar"]
            for r in await conn.fetch("select name, name_ar from products where name_ar <> ''")
        }
    if "bookings" in modules:
        f.names_ar |= {
            r["name"]: r["name_ar"]
            for r in await conn.fetch("select name, name_ar from services where name_ar <> ''")
        }
    await _done(conn, f, span)
    await _hours(conn, f)
    await _report(conn, f)
    return f


async def _inbox(conn, f: Facts, span, last, chart) -> None:
    now = f.now
    f.waiting = [
        Row(str(r["id"]), r["name"], {
            "minutes": int((now - r["since"]).total_seconds() // 60),
            "assignee": r["assignee"], "nobody": r["assigned_to"] is None,
        })
        for r in await conn.fetch(
            "select c.id, c.name, c.assigned_to, u.name as assignee, l.created_at as since "
            "from contacts c join lateral (select direction, created_at from messages m "
            "  where m.contact_id = c.id and coalesce(m.status, '') <> 'blocked' "
            "    and m.created_at <= $1 order by created_at desc limit 1) l on true "
            "left join users u on u.id = c.assigned_to "
            "where c.role = 'customer' and c.inbox_status = 'open' and l.direction = 'in' "
            f"  and l.created_at < $1::timestamptz - interval '{WAITING_MINUTES} minutes' "
            "order by l.created_at",
            now,
        )
    ]
    row = await conn.fetchrow(
        "select count(distinct m.contact_id) filter (where m.created_at >= $1 and m.created_at < "
        "$2) as wrote, "
        "count(distinct m.contact_id) filter (where m.created_at >= $3 and m.created_at < $4) as "
        "wrote_last "
        "from messages m join contacts c on c.id = m.contact_id "
        "where c.role = 'customer' and m.direction = 'in' and m.created_at >= $3 and m.created_at "
        "< $2",
        *span, *last,
    )
    f.wrote, f.wrote_last = row["wrote"], row["wrote_last"]
    row = await conn.fetchrow(
        "select count(*) filter (where created_at >= $1 and created_at < $2) as new, "
        "count(*) filter (where created_at >= $3 and created_at < $4) as new_last "
        "from contacts where role = 'customer'",
        *span, *last,
    )
    f.new_customers, f.new_customers_last = row["new"], row["new_last"]
    f.first_answer = await _median_first_answer(conn, f.now - timedelta(days=7), f.now)
    f.first_answer_before = await _median_first_answer(
        conn, f.now - timedelta(days=14), f.now - timedelta(days=7)
    )
    f.lost_reasons = {
        r["reason"]: r["n"]
        for r in await conn.fetch(
            "select coalesce(detail->>'reason', 'other') as reason, count(*)::int as n "
            "from activity where subject = 'conversation' and action = 'closed' "
            "and detail->>'outcome' = 'lost' and created_at >= $1 and created_at < $2 group by 1",
            f.now - timedelta(days=30), f.now,
        )
    }
    f.chats_by_day = {
        r["d"]: r["n"]
        for r in await conn.fetch(
            "select (m.created_at at time zone $3::text)::date as d, "
            "count(distinct m.contact_id)::int as n from messages m "
            "join contacts c on c.id = m.contact_id "
            "where c.role = 'customer' and m.direction = 'in' "
            "and m.created_at >= $1 and m.created_at < $2 group by 1",
            *chart, f.tz,
        )
    }


async def _median_first_answer(conn, start: datetime, end: datetime) -> int | None:
    """The middle wait before a person's first answer, as the team report measures it
    (D-028): an answer from the assistant counts as an answer."""
    value = await conn.fetchval(
        """
        with replies as (
            select r.created_at,
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
            where r.direction = 'out' and r.sent_by_user is not null
              and r.created_at >= $1 and r.created_at < $2
              and coalesce(r.status, '') <> 'blocked'
        )
        select percentile_cont(0.5) within group (
                   order by extract(epoch from created_at - waited_from))
        from replies where waited_from is not null
        """,
        start, end,
    )
    return round(value) if value is not None else None


async def _orders(conn, f: Facts, span, last, chart) -> None:
    now = f.now
    row = await conn.fetchrow(
        "select count(*) filter (where created_at >= $1 and created_at < $2) as n, "
        "coalesce(sum(total) filter (where created_at >= $1 and created_at < $2), 0)::bigint as v, "
        "count(*) filter (where created_at >= $3 and created_at < $4) as ln, "
        "coalesce(sum(total) filter (where created_at >= $3 and created_at < $4), 0)::bigint as lv "
        "from orders where status <> 'cancelled' and created_at >= $3 and created_at < $2",
        *span, *last,
    )
    f.orders, f.sales, f.orders_last, f.sales_last = row["n"], row["v"], row["ln"], row["lv"]
    came_back = (
        "select count(distinct o.contact_id) from orders o where o.status <> 'cancelled' "
        "and o.created_at >= $1 and o.created_at < $2 and exists (select 1 from orders p "
        "where p.contact_id = o.contact_id and p.status <> 'cancelled' and p.created_at < $1)"
    )
    f.came_back = await conn.fetchval(came_back, *span)
    f.came_back_last = await conn.fetchval(came_back, *last)
    paid = (
        "select coalesce(sum(amount), 0)::bigint as v, count(*) as n from payment_requests "
        "where status = 'paid' and order_id is not null and paid_at >= $1 and paid_at < $2"
    )
    row = await conn.fetchrow(paid, *span)
    f.paid_link, f.paid_link_count = row["v"], row["n"]
    row = await conn.fetchrow(paid, *last)
    f.paid_link_last, f.paid_link_count_last = row["v"], row["n"]

    f.unconfirmed = [
        Row(str(r["id"]), r["name"], {"number": r["number"], "minutes":
            int((now - r["created_at"]).total_seconds() // 60)})
        for r in await conn.fetch(
            "select o.id, o.number, c.name, o.created_at from orders o "
            "join contacts c on c.id = o.contact_id where o.status = 'new' "
            f"and o.created_at < $1::timestamptz - interval '{UNCONFIRMED_MINUTES} minutes' "
            "order by o.created_at",
            now,
        )
    ]
    f.ready_waiting = [
        Row(str(r["id"]), r["name"], {"number": r["number"], "hours":
            int((now - r["at"]).total_seconds() // 3600)})
        for r in await conn.fetch(
            "select o.id, o.number, c.name, a.at from orders o "
            "join contacts c on c.id = o.contact_id "
            "join lateral (select max(created_at) as at from activity where subject = 'order' "
            "  and subject_id = o.id and action = 'ready') a on true "
            f"where o.status = 'ready' and a.at < $1::timestamptz - interval '{READY_HOURS} hours' "
            "order by a.at",
            now,
        )
    ]
    f.open_links = [
        Row(str(r["id"]), r["name"], {"number": r["number"], "amount": r["amount"]})
        for r in await conn.fetch(
            "select o.id, o.number, c.name, p.amount from payment_requests p "
            "join orders o on o.id = p.order_id join contacts c on c.id = o.contact_id "
            "where p.status = 'pending' and p.created_at < $1::timestamptz - interval "
            f"'{LINK_HOURS} hours' "
            "and o.status not in ('cancelled', 'done') order by p.created_at",
            now,
        )
    ]
    f.orders_by_day = {
        r["d"]: (r["n"], r["v"])
        for r in await conn.fetch(
            "select (created_at at time zone $3::text)::date as d, count(*)::int as n, "
            "coalesce(sum(total), 0)::bigint as v from orders where status <> 'cancelled' "
            "and created_at >= $1 and created_at < $2 group by 1",
            *chart, f.tz,
        )
    }
    f.top_items = [
        (r["name"], r["cur"], r["prev"])
        for r in await conn.fetch(
            "select i.name, coalesce(sum(i.quantity) filter (where o.created_at >= $2), 0)::int "
            "as cur, "
            "coalesce(sum(i.quantity) filter (where o.created_at < $2), 0)::int as prev "
            "from order_items i join orders o on o.id = i.order_id "
            "where o.status <> 'cancelled' and o.created_at >= $1 and o.created_at < $3 "
            "group by i.name order by cur desc, i.name",
            now - timedelta(days=56), now - timedelta(days=28), now,
        )
    ]
    f.risers = [
        (r["name"], r["cur"], r["prev"])
        for r in await conn.fetch(
            "select i.name, "
            "coalesce(sum(i.quantity) filter (where o.created_at >= $3), 0)::int as cur, "
            "coalesce(sum(i.quantity) filter (where o.created_at < $2), 0)::int as prev "
            "from order_items i join orders o on o.id = i.order_id "
            "where o.status <> 'cancelled' and o.created_at >= $1 and o.created_at < $4 "
            "and (o.created_at < $2 or o.created_at >= $3) group by i.name",
            last[0], last[1], span[0], span[1],
        )
    ]
    f.orders_30d = await conn.fetchval(
        "select count(*) from orders where status <> 'cancelled' "
        "and created_at >= $1 and created_at < $2",
        now - timedelta(days=30), now,
    )
    f.unused_products = _rows(await conn.fetch(
        "select p.id, p.name, p.name_ar from products p where p.available and p.created_at < $1 "
        "and not exists (select 1 from order_items i join orders o on o.id = i.order_id "
        "  where i.product_id = p.id and o.status <> 'cancelled' "
        "  and o.created_at >= $1 and o.created_at < $2) order by p.sort, p.name",
        now - timedelta(days=30), now,
    ), name_ar="name_ar")


async def _bookings(conn, f: Facts, span, last, chart) -> None:
    now = f.now
    row = await conn.fetchrow(
        "select "
        "count(*) filter (where status = 'completed' and starts_at >= $1 and starts_at < $2) as "
        "visits, "
        "count(*) filter (where status = 'completed' and starts_at >= $3 and starts_at < $4) as "
        "visits_last, "
        "count(*) filter (where status = 'no_show' and starts_at >= $1 and starts_at < $2) as "
        "no_shows, "
        "count(*) filter (where created_at >= $1 and created_at < $2) as made, "
        "count(*) filter (where created_at >= $3 and created_at < $4) as made_last, "
        "count(*) filter (where status = 'booked' and starts_at >= $2 "
        "  and starts_at < $2::timestamptz + interval '7 days') as ahead, "
        "count(*) filter (where status = 'completed' and starts_at >= $2::timestamptz - interval "
        "'30 days' "
        "  and starts_at < $2) as completed_30, "
        "count(*) filter (where status = 'no_show' and starts_at >= $2::timestamptz - interval "
        "'30 days' "
        "  and starts_at < $2) as no_shows_30 "
        "from bookings where created_at <= $2",
        *span, *last,
    )
    f.visits, f.visits_last, f.no_shows_week = row["visits"], row["visits_last"], row["no_shows"]
    f.made, f.made_last, f.booked_ahead = row["made"], row["made_last"], row["ahead"]
    f.completed_30, f.no_shows_30 = row["completed_30"], row["no_shows_30"]
    f.priced = bool(await conn.fetchval("select exists (select 1 from services where price > 0)"))
    f.booked_value_ahead = await conn.fetchval(
        "select coalesce(sum(s.price), 0)::bigint from bookings b join services s on s.id = "
        "b.service_id "
        "where b.status = 'booked' and b.starts_at >= $1 and b.starts_at < $1::timestamptz + "
        "interval '7 days'",
        now,
    )
    f.unmarked = [
        Row(str(r["id"]), r["name"], {"number": r["number"], "starts_at": r["starts_at"]})
        for r in await conn.fetch(
            "select b.id, b.number, c.name, b.starts_at from bookings b "
            "join contacts c on c.id = b.contact_id "
            "where b.status = 'booked' and b.ends_at < $1 order by b.starts_at",
            now,
        )
    ]
    f.repeat_no_shows = [
        Row(str(r["id"]), r["name"], {"no_shows": r["no_shows"], "next": r["next"]})
        for r in await conn.fetch(
            "select c.id, c.name, n.no_shows, min(b.starts_at) as next from contacts c "
            "join (select contact_id, count(*)::int as no_shows from bookings "
            "      where status = 'no_show' and starts_at >= $1::timestamptz - interval '90 days' "
            "      and starts_at < $1 group by contact_id having count(*) >= 2) n "
            "  on n.contact_id = c.id "
            "join bookings b on b.contact_id = c.id and b.status = 'booked' "
            "  and b.starts_at >= $1 and b.starts_at < $1::timestamptz + interval '7 days' "
            "group by c.id, c.name, n.no_shows order by next",
            now,
        )
    ]
    f.late_cancellations = await conn.fetchval(
        "select count(*) from activity a join bookings b on b.id = a.subject_id "
        "where a.subject = 'booking' and a.action = 'cancelled' "
        "and a.created_at >= $1::timestamptz - interval '30 days' and a.created_at < $1 "
        "and a.created_at > b.starts_at - interval '24 hours'",
        now,
    )
    due = []
    for r in await conn.fetch(
        "select c.id, c.name, array_agg(b.starts_at order by b.starts_at) as visits "
        "from bookings b join contacts c on c.id = b.contact_id "
        "where b.status = 'completed' and b.starts_at < $1 group by c.id, c.name "
        "having count(*) >= 3 and not exists (select 1 from bookings f "
        "  where f.contact_id = c.id and f.status = 'booked' and f.starts_at >= $1)",
        now,
    ):
        visits = r["visits"]
        gaps = [(b - a).total_seconds() / 86400 for a, b in zip(visits, visits[1:], strict=False)]
        usual = median(gaps)
        since = (now - visits[-1]).total_seconds() / 86400
        if usual > 0 and since > 1.5 * usual:
            due.append(Row(str(r["id"]), r["name"], {"days": int(since), "usual": round(usual)}))
    f.due_back = due

    # Opening minutes per day ahead, and how much of them is booked.
    hours = await conn.fetch("select weekday, opens, closes from business_hours")
    open_minutes = {d: 0 for d in range(7)}
    for h in hours:
        open_minutes[h["weekday"]] += (
            datetime.combine(date.min, h["closes"]) - datetime.combine(date.min, h["opens"])
        ).seconds // 60
    booked = {
        r["d"]: r["minutes"]
        for r in await conn.fetch(
            "select (starts_at at time zone $3::text)::date as d, "
            "sum(extract(epoch from ends_at - starts_at) / 60)::int as minutes from bookings "
            "where status = 'booked' and starts_at >= $1 and starts_at < $2 group by 1",
            f.at(f.today), f.at(f.today + timedelta(days=8)), f.tz,
        )
    }
    thin = []
    shares = {}
    for offset in range(0, 8):
        day = f.today + timedelta(days=offset)
        opening = open_minutes[(day.weekday() + 1) % 7]
        if not opening:
            continue
        share = min(booked.get(day, 0) / opening, 1.0)
        shares[day] = share
        if 1 <= offset <= 7:
            f.open_days_ahead += 1
            if share < 0.3:
                thin.append((day, share))
    f.thin_days = thin
    f.booked_share_by_day = shares
    f.visits_by_day = {
        r["d"]: r["n"]
        for r in await conn.fetch(
            "select (starts_at at time zone $3::text)::date as d, count(*)::int as n from bookings "
            "where status = 'completed' and starts_at >= $1 and starts_at < $2 group by 1",
            *chart, f.tz,
        )
    }
    f.top_services = [
        (r["name"], r["cur"], r["prev"])
        for r in await conn.fetch(
            "select service_name as name, "
            "count(*) filter (where starts_at >= $2)::int as cur, "
            "count(*) filter (where starts_at < $2)::int as prev from bookings "
            "where status in ('completed', 'booked') and starts_at >= $1 and starts_at < $3 "
            "group by service_name order by cur desc, service_name",
            now - timedelta(days=56), now - timedelta(days=28), now,
        )
    ]


async def _ledger(conn, f: Facts, span, last, chart) -> None:
    now = f.now
    summary = await ledger.summary(conn, now)
    f.accounts = [
        Account(
            c["id"], c["name"], c["balance"], c["oldest_days"], c["buckets"],
            c["promised_until"] is not None,
            datetime.fromisoformat(c["last_reminded_at"]) if c["last_reminded_at"] else None,
            c["over_limit"],
        )
        for c in summary["customers"]
        if c["balance"] > 0
    ]
    f.owed, f.owing = summary["outstanding"], summary["customers_owing"]
    f.buckets = summary["buckets"]
    f.owed_last = (await ledger.summary(conn, now - timedelta(days=7)))["outstanding"]
    paid = (
        "select coalesce(sum(amount), 0)::bigint from ledger_entries "
        "where kind = 'payment' and created_at >= $1 and created_at < $2"
    )
    f.collected = await conn.fetchval(paid, *span)
    f.collected_last = await conn.fetchval(paid, *last)
    owing = {a.id for a in f.accounts}
    f.promises_passed = [
        Row(str(r["id"]), r["name"], {"promised_until": r["promised_until"]})
        for r in await conn.fetch(
            "select c.id, c.name, a.promised_until from ledger_accounts a "
            "join contacts c on c.id = a.contact_id where a.promised_until < $1 "
            "order by a.promised_until",
            f.today,
        )
        if str(r["id"]) in owing
    ]
    weeks = []
    for k in (3, 2, 1):
        start = f.at(f.week_start - timedelta(days=7 * k))
        end = f.at(f.week_start - timedelta(days=7 * (k - 1)))
        row = await conn.fetchrow(
            "select coalesce(sum(amount) filter (where kind = 'sale'), 0)::bigint as sales, "
            "coalesce(sum(amount) filter (where kind = 'payment'), 0)::bigint as payments "
            "from ledger_entries where created_at >= $1 and created_at < $2",
            start, end,
        )
        weeks.append((row["sales"], row["payments"]))
    f.owed_weeks = weeks
    f.collected_by_day = {
        r["d"]: r["v"]
        for r in await conn.fetch(
            "select (created_at at time zone $3::text)::date as d, sum(amount)::bigint as v "
            "from ledger_entries where kind = 'payment' and created_at >= $1 and created_at < $2 "
            "group by 1",
            *chart, f.tz,
        )
    }


async def _quiet_regulars(conn, f: Facts) -> None:
    """Three or more orders or visits 31 to 120 days ago, and none in the last 30."""
    parts = []
    if "orders" in f.modules:
        parts.append(
            "select contact_id, created_at as at from orders "
            "where status <> 'cancelled' and created_at < $3"
        )
    if "bookings" in f.modules:
        parts.append(
            "select contact_id, starts_at as at from bookings "
            "where status = 'completed' and starts_at < $3"
        )
    f.quiet_regulars = [
        Row(str(r["id"]), r["name"], {"times": r["times"], "days": int(
            (f.now - r["last"]).total_seconds() // 86400)})
        for r in await conn.fetch(
            f"with ev as ({' union all '.join(parts)}) "
            "select c.id, c.name, count(*) filter (where ev.at >= $1 and ev.at < $2)::int as "
            "times, "
            "max(ev.at) as last from ev join contacts c on c.id = ev.contact_id "
            "where c.role = 'customer' group by c.id, c.name "
            "having count(*) filter (where ev.at >= $1 and ev.at < $2) >= 3 and max(ev.at) < $2 "
            "order by max(ev.at) desc",
            f.now - timedelta(days=120), f.now - timedelta(days=30), f.now,
        )
    ]


async def _done(conn, f: Facts, span) -> None:
    """What ALYR did for the business this week: messages it sent, reminders, money
    paid through its links."""
    f.sent_for_you = await conn.fetchval(
        "select count(*) from messages m join contacts c on c.id = m.contact_id "
        "where c.role = 'customer' and m.direction = 'out' and m.sent_by = '' "
        "and m.status in ('sent', 'delivered', 'read') and m.created_at >= $1 and m.created_at < "
        "$2",
        *span,
    )
    if "bookings" in f.modules:
        f.booking_reminders_sent = await conn.fetchval(
            "select count(*) from bookings where reminded_at >= $1 and reminded_at < $2", *span
        )
    if "ledger" in f.modules:
        f.payment_reminders_sent = await conn.fetchval(
            "select count(*) from messages where direction = 'out' "
            "and payload->>'template' like 'payment_reminder%' "
            "and status not in ('blocked', 'failed') and created_at >= $1 and created_at < $2",
            *span,
        )
    f.paid_by_link_week = await conn.fetchval(
        "select coalesce(sum(amount), 0)::bigint from payment_requests "
        "where status = 'paid' and paid_at >= $1 and paid_at < $2",
        *span,
    )


async def _hours(conn, f: Facts) -> None:
    """When the business is busiest, over 28 days: orders placed, visits, or customers
    writing, whichever the business mainly runs on."""
    if "orders" in f.modules:
        source = "select created_at as at from orders where status <> 'cancelled'"
    elif "bookings" in f.modules:
        source = (
            "select starts_at as at from bookings "
            "where status in ('completed', 'booked', 'no_show')"
        )
    else:
        source = (
            "select m.created_at as at from messages m join contacts c on c.id = m.contact_id "
            "where c.role = 'customer' and m.direction = 'in'"
        )
    f.hours_grid = {
        (r["dow"], r["hour"]): r["n"]
        for r in await conn.fetch(
            f"select extract(dow from at at time zone $3::text)::int as dow, "
            f"extract(hour from at at time zone $3::text)::int as hour, count(*)::int as n "
            f"from ({source}) ev where at >= $1 and at < $2 group by 1, 2",
            f.now - timedelta(days=28), f.now, f.tz,
        )
    }
    span = await conn.fetchrow(
        "select min(extract(hour from opens))::int as first, "
        "max(ceil(extract(epoch from closes) / 3600))::int as last from business_hours"
    )
    if span and span["first"] is not None:
        f.hours_range = (span["first"], max(span["last"], span["first"] + 1))


async def _report(conn, f: Facts) -> None:
    f.report_on = await report.enabled(conn)
    f.report_numbers = len(await report.recipients(conn))
    _, f.report_at = report.next_send(f.now, f.tz)
