"""More read-only actions an owner can ask about the shop (ALY-290, spec 067).

Same rules as `asks.py`: each returns plain data, changes nothing, and an agent sees no money
(D-035). **None of the arithmetic is new.** Sales and the comparison with last week come from
the Agent dashboard's own facts (`modules/agent/facts.py`) and, for a closed week, from the
weekly report's reading of the week (`modules/agent/week.py`); the tips are the dashboard's
suggestions as `view.build` draws them; the stock lists are the Catalog list's own filters
(`modules/items/listing.py`). A number here is the number on the screen it came from.
"""

from datetime import timedelta
from uuid import UUID

import asyncpg

from alyr.core.actions import (
    ALL_ROLES,
    MONEY_ROLES,
    ActionError,
    Caller,
    register,
)
from alyr.core.auth import Staff
from alyr.modules import report
from alyr.modules.agent import facts as facts_
from alyr.modules.agent import view, week
from alyr.modules.agent.words import plain
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import listing

_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"
PERIODS = ("today", "yesterday", "this_week", "last_week")


async def staff_of(conn: asyncpg.Connection, caller: Caller) -> Staff:
    """The caller as the dashboard's engine knows a person (it reads the role from it)."""
    email = ""
    if caller.user_id:
        email = await conn.fetchval("select email from users where id = $1", caller.user_id) or ""
    tenant: UUID = await conn.fetchval(f"select {_TENANT}")
    return Staff(caller.user_id, caller.name, email, caller.role, tenant)


# ── shop_info ─────────────────────────────────────────────────────────────────────────────


@register("shop_info", ALL_ROLES)
async def shop_info(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """The business as the workspace has it: names, type, time zone, opening hours and the parts
    of ALYR it uses. No customer, no money."""
    shop = await conn.fetchrow(
        f"select name, name_ar, business_type, timezone, owner_lang from tenants "
        f"where id = {_TENANT}"
    )
    modules = [
        r["module_key"]
        for r in await conn.fetch(
            "select module_key from tenant_modules where enabled order by module_key"
        )
    ]
    hours: dict[int, list[str]] = {}
    for r in await conn.fetch("select weekday, opens, closes from business_hours order by 1, 2"):
        hours.setdefault(r["weekday"], []).append(
            f"{r['opens'].strftime('%H:%M')}-{r['closes'].strftime('%H:%M')}"
        )
    return {
        "name": shop["name"],
        "name_ar": shop["name_ar"],
        "business_type": shop["business_type"],
        "time_zone": shop["timezone"] or "Asia/Qatar",
        "language": shop["owner_lang"] if shop["owner_lang"] in ("en", "ar") else "en",
        "currency": "QAR",
        "modules_on": modules,
        # Sunday first, as the week runs here (weekday 0 is Sunday). A day with no hours is
        # closed; a business that has set none says so.
        "opening_hours": [
            {"day": name, "hours": hours.get(n, [])}
            for n, name in enumerate(
                ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
            )
        ] if hours else None,
    }


# ── low_stock ─────────────────────────────────────────────────────────────────────────────


@register("low_stock", ALL_ROLES, module="catalog")
async def low_stock(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """What has run out or is running low: the two lists the Catalog's filters hold, from the
    same reading (`listing.read`), so the counts equal the rows of the list they open."""
    clock = await shop_clock.load(conn)
    views, low_at = await listing.read(conn, clock)
    chips = listing.tally(views, low_at)
    low = sorted(
        (
            {
                "name": v["name"], "name_ar": v["name_ar"], "code": v["code"],
                "left": listing.lowest_left(v, low_at),
                "unit": v["unit"] if v["quantity"]["show_unit"] else None,
            }
            for v in views if listing.is_low(v, low_at)
        ),
        key=lambda row: (row["left"], row["name"]),
    )
    sold_out = [
        {"name": v["name"], "name_ar": v["name_ar"], "code": v["code"]}
        for v in views if "sold_out" in listing.kinds_of(v, low_at)
    ]
    return {
        "low_stock_number": low_at,
        "low_count": chips["low_stock"],
        "sold_out_count": chips["sold_out"],
        "low": low[: 25],
        "sold_out": sold_out[: 25],
        "more_low": max(0, len(low) - 25),
        "more_sold_out": max(0, len(sold_out) - 25),
    }


# ── sales_summary ─────────────────────────────────────────────────────────────────────────


def _against(cur: int, last: int, base_cur: int, base_last: int) -> dict:
    """The comparison the dashboard draws: a percentage only when both periods count 20 or more
    (A3), else last week's figure beside this one."""
    out = {"was": last, "difference": cur - last}
    if view._comparable(base_cur, base_last) and last:
        out["percent"] = view._pct(cur, last)
    return out


@register("sales_summary", MONEY_ROLES, module="orders")
async def sales_summary(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Orders and sales for today, yesterday, this week (Sunday to now) or last week, each against
    its own comparison: this week against last week to the same time and a day against the same
    weekday last week, exactly as the dashboard compares, and last week as the weekly report
    reads it. A cancelled order counts for nothing, as everywhere. Owners and admins only."""
    period = args.get("period") or "today"
    if period not in PERIODS:
        raise ActionError("Choose today, yesterday, this_week or last_week.")
    staff = await staff_of(conn, caller)
    f = await facts_.gather(conn, staff)

    if period == "last_week":
        sunday = report.last_full_week(f.now, f.tz)
        w = await week.read(conn, sunday)
        closed = w.f
        return {
            "period": period, "from": sunday.isoformat(),
            "to": (sunday + timedelta(days=6)).isoformat(),
            "orders": closed.orders, "sales": closed.sales,
            "came_back": closed.came_back, "paid_by_link": closed.paid_link,
            "compared_with": "the week before",
            "orders_against": _against(closed.orders, closed.orders_last, closed.orders,
                                       closed.orders_last),
            "sales_against": _against(closed.sales, closed.sales_last, closed.orders,
                                      closed.orders_last),
        }

    if period == "this_week":
        return {
            "period": period, "from": f.week_start.isoformat(), "to": f.today.isoformat(),
            "orders": f.orders, "sales": f.sales, "came_back": f.came_back,
            "paid_by_link": f.paid_link,
            "compared_with": "last week, Sunday to the same time",
            "orders_against": _against(f.orders, f.orders_last, f.orders, f.orders_last),
            "sales_against": _against(f.sales, f.sales_last, f.orders, f.orders_last),
        }

    day = f.today - timedelta(days=1 if period == "yesterday" else 0)
    orders, sales = f.orders_by_day.get(day, (0, 0))
    out = {
        "period": period, "from": day.isoformat(), "to": day.isoformat(),
        "orders": orders, "sales": sales,
    }
    if period == "today":
        last = f.last_by_now
        out["compared_with"] = "the same weekday last week, to the same time"
        if "orders" in last:
            out["orders_against"] = {"was": last["orders"], "difference": orders - last["orders"]}
            out["sales_against"] = {"was": last["sales"], "difference": sales - last["sales"]}
    else:
        before = f.orders_by_day.get(day - timedelta(days=7))
        out["compared_with"] = "the same weekday the week before"
        if before is not None or day - timedelta(days=7) >= f.week_start - timedelta(days=7):
            was_orders, was_sales = before or (0, 0)
            out["orders_against"] = {"was": was_orders, "difference": orders - was_orders}
            out["sales_against"] = {"was": was_sales, "difference": sales - was_sales}
    return out


# ── insights ──────────────────────────────────────────────────────────────────────────────


@register("insights", ALL_ROLES)
async def insights(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """The tips the dashboard shows now: what needs the owner (the tasks) and up to three
    suggestions, each with the rule that raised it written out. Built by the dashboard's own
    `view.build`, for this person: an agent gets it without money, as the screen does."""
    lang = "ar" if args.get("lang") == "ar" else "en"
    staff = await staff_of(conn, caller)
    built = await view.build(conn, staff, lang)
    return {
        "lang": lang,
        "needs": [
            {"key": n["key"], "count": n["count"], "title": plain(n["words"]), "rule": n["rule"],
             "screen": n["href"]}
            for n in built["needs"]["items"]
        ],
        "tips": [
            {
                "key": s["key"], "kind": s["kind"], "title": plain(s["title"]),
                "rule": s["rule"],
                "screen": s["action"]["href"] if s["action"] else None,
                "what_to_do": s["action"]["label"] if s["action"] else s["status"],
                # The names a card counts, as the dashboard lists them: who they are is for the
                # tool's own `present` to cut down to what a customer may be shown as.
                "rows": [r["label"] for r in s["rows"]],
                "more_rows": s["more"],
            }
            for s in built["suggestions"]
        ],
    }
