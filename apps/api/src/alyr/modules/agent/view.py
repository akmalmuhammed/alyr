"""The `AgentView`: everything the dashboard draws, every word already in the reader's
language and every number already formatted (`03-build-brief.md`, `01-research.md` C).

The screen renders this and decides nothing. Staff who may not see money (the agent role,
`02-data.md` §9) get a view without it: no sales, nothing owed or collected, no amounts.
"""

from datetime import datetime, timedelta
from math import ceil

import asyncpg

from alyr.core.auth import Staff
from alyr.core.words import CUSTOMERS, DAYS, MESSAGES, NUMBERS, ORDERS, REMINDERS
from alyr.modules.agent import facts as facts_
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHTS, Finding, Insight, applies, visit_noun
from alyr.modules.agent.words import (
    DAY_LONG,
    DAY_PLURAL,
    DAY_SHORT,
    MONTHS,
    RULE,
    B,
    clock,
    count,
    day_month,
    minutes,
    money,
    noun_after,
    rich,
    rule_line,
    sunday_index,
)

VERSION = 1
QUIET_BELOW = 5
PERCENT_FROM = 20
TYPE_LEAD = {
    "restaurant": "orders", "shop": "orders", "travel": "orders",
    "salon": "bookings", "spa": "bookings", "clinic": "bookings", "home": "bookings",
    "wholesale": "ledger",
}
CITY = {"Asia/Qatar": ("Doha", "الدوحة")}


def T(lang: str, en: str, ar: str) -> str:  # noqa: N802 - reads as a template table
    return ar if lang == "ar" else en


async def build(
    conn: asyncpg.Connection, staff: Staff, lang: str = "en", now: datetime | None = None
) -> dict:
    lang = "ar" if lang == "ar" else "en"
    f = await facts_.gather(conn, staff, now)
    snoozed = {
        r["insight_key"]: r["fingerprint"]
        for r in await conn.fetch(
            "select insight_key, fingerprint from agent_snoozes where until > $1", f.now
        )
    }
    return render(f, lang, snoozed)


def render(f: Facts, lang: str, snoozed: dict | None = None) -> dict:
    """The view from facts alone, so every part can be tested without a database."""
    main = lead(f)
    state = state_of(f, main)
    needs = _needs(f, lang)
    return {
        "version": VERSION,
        "lang": lang,
        "dir": "rtl" if lang == "ar" else "ltr",
        "now": f.now.isoformat(),
        "state": state,
        "money": f.money,
        "lead": main,
        "header": _header(f, main, state, lang),
        "needs": needs,
        "kpis": [] if state == "empty" else _kpis(f, main, state, lang),
        "placeholders": _placeholders(f, lang) if state == "empty" else [],
        "suggestions": [] if state == "empty" else _suggestions(f, state, lang, snoozed or {}),
        "done": _done(f, lang),
        "week": None if state == "empty" else _week(f, main, lang),
        "hours": None if state == "empty" else _hours(f, lang),
        "top": None if state == "empty" else _top(f, main, lang),
        "owed": _owed(f, lang),
        "team": None if state == "empty" else _team(f, lang),
        "report": _report(f, lang),
        "comparisons_from": (
            day_month(f.comparisons_from, lang) if state == "first_week" else None
        ),
    }


# ── what the business mainly runs on, and its state ──────


def lead(f: Facts) -> str:
    """The product whose numbers come first: by type of business, else the first one on."""
    preferred = TYPE_LEAD.get(f.business_type)
    if preferred in f.modules:
        return preferred
    for module in ("orders", "bookings", "ledger"):
        if module in f.modules:
            return module
    return "inbox"


def _measure(f: Facts, main: str) -> tuple[int, int]:
    return {
        "orders": (f.orders, f.orders_last),
        "bookings": (f.visits + f.made, f.visits_last + f.made_last),
        "ledger": (f.owing, f.owing),
        "inbox": (f.wrote, f.wrote_last),
    }[main]


def state_of(f: Facts, main: str) -> str:
    if not f.has_records:
        return "empty"
    if f.first_week:
        return "first_week"
    cur, last = _measure(f, main)
    if main != "ledger" and cur < QUIET_BELOW and last < QUIET_BELOW:
        return "quiet"
    return "normal"


# ── header ────────────────────────────────────────────────


def _header(f: Facts, main: str, state: str, lang: str) -> dict:
    local = f.local
    city = CITY.get(f.tz, ("", ""))
    city = city[1] if lang == "ar" else city[0]
    day = local.date()
    month = MONTHS[lang][day.month - 1]
    if lang == "ar":
        weekday = DAY_LONG["ar"][sunday_index(day)]
        eyebrow = f"اليوم · {weekday} {day.day} {month} · {clock(local)} {city}"
    else:
        weekday = DAY_SHORT["en"][sunday_index(day)]
        eyebrow = f"Today · {weekday} {day.day} {month} · {clock(local)} {city}"
    hour = local.hour
    name = f.first_name
    if lang == "ar":
        greet = "صباح الخير" if hour < 12 else "مساء الخير"
        greeting = f"{greet} يا {name}." if name else f"{greet}."
    else:
        greet = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"
        greeting = f"{greet}, {name}." if name else f"{greet}."
    return {
        "eyebrow": eyebrow.strip(),
        "greeting": greeting,
        "summary": _summary(f, main, state, lang),
        "updated": T(lang, f"Updated {clock(local)}", f"حُدّث {clock(local)}"),
    }


def _summary(f: Facts, main: str, state: str, lang: str) -> list[dict]:
    """One sentence before any number (A1): facts plain, the comparison muted."""

    def fact(parts):
        return {"muted": False, "text": parts}

    def muted(parts):
        return {"muted": True, "text": parts}

    if state == "empty":
        first = {
            "orders": T(lang, "Nothing yet. Your first order shows here.",
                        "لا شيء بعد. يظهر هنا أول طلب يصلك."),
            "bookings": T(lang, "Nothing yet. Your first booking shows here.",
                          "لا شيء بعد. يظهر هنا أول حجز."),
            "ledger": T(lang, "Nothing yet. The credit accounts you open show here.",
                        "لا شيء بعد. تظهر هنا الحسابات الآجلة التي تفتحها."),
            "inbox": T(lang, "Nothing yet. Customers who write to you show here.",
                       "لا شيء بعد. يظهر هنا العملاء الذين يراسلونك."),
        }[main]
        return [fact(rich(first))]

    noun = visit_noun(f.business_type)
    so_far = {
        "orders": count(f.orders, ORDERS, lang),
        "bookings": count(f.visits, noun, lang),
        "ledger": count(f.owing, CUSTOMERS, lang),
        "inbox": count(f.wrote, CUSTOMERS, lang),
    }[main]
    if state == "first_week":
        start = f.comparisons_from
        day = DAY_LONG[lang][sunday_index(start)]
        return [
            fact(rich(T(lang, "First week: {n} so far.", "أسبوعك الأول: {n} حتى الآن."), n=so_far)),
            muted(rich(T(lang, "Comparisons start {day} {date}.",
                         "تبدأ المقارنات يوم {day} {date}."),
                       day=day, date=day_month(start, lang))),
        ]
    if state == "quiet":
        return [fact(rich(T(lang, "A quiet week so far: {n}.", "أسبوع هادئ حتى الآن: {n}."),
                          n=so_far))]

    parts: list[dict] = []
    if main == "orders":
        if f.money:
            parts.append(fact(rich(T(lang, "Week so far: {n}, {v}.", "الأسبوع حتى الآن: {n}، {v}."),
                                   n=so_far, v=B(money(f.sales, lang)))))
        else:
            parts.append(fact(rich(
                T(lang, "Week so far: {n}.", "الأسبوع حتى الآن: {n}."), n=so_far)))
        parts.append(muted(_compare(f.orders - f.orders_last, lang)))
    elif main == "bookings":
        parts.append(fact(rich(
            T(lang, "Week so far: {n}, {k} no-shows.", "الأسبوع حتى الآن: {n}، وغياب {k}."),
            n=so_far, k=f.no_shows_week)))
        parts.append(muted(_compare(f.visits - f.visits_last, lang)))
        parts.append(fact(rich(
            T(lang, "{n} booked for the next 7 days.", "{n} محجوزة للأيام السبعة القادمة."),
            n=count(f.booked_ahead, noun, lang))))
    elif main == "ledger":
        if f.money:
            over = f.buckets.get("d61_90", 0) + f.buckets.get("d90_plus", 0)
            parts.append(fact(rich(T(lang, "{v} owed to you by {n}.", "{v} مستحقة لك على {n}."),
                                   v=B(money(f.owed, lang)), n=so_far)))
            parts.append(muted(rich(T(lang, "{v} of it is over 60 days.",
                                      "منها {v} متأخرة أكثر من 60 يوماً."),
                                    v=B(money(over, lang)))))
            parts.append(fact(rich(T(lang, "{v} collected this week.", "{v} حُصّلت هذا الأسبوع."),
                                   v=B(money(f.collected, lang)))))
        else:
            parts.append(fact(rich(T(lang, "{n} with an open account.", "{n} لديهم حساب مفتوح."),
                                   n=so_far)))
    else:
        parts.append(fact(rich(T(lang, "Week so far: {n} wrote to you.",
                                 "الأسبوع حتى الآن: راسلك {n}."),
                               n=so_far)))
        parts.append(muted(_compare(f.wrote - f.wrote_last, lang)))

    if f.unconfirmed and main == "orders":
        n = len(f.unconfirmed)
        parts.append(fact(rich(T(lang, "{n} {verb} waiting.", "{n} بانتظار التأكيد."),
                               n=count(n, ORDERS, lang), verb="is" if n == 1 else "are")))
    elif f.waiting:
        n = len(f.waiting)
        parts.append(fact(rich(T(lang, "{n} {verb} waiting for an answer.", "{n} بانتظار الرد."),
                               n=count(n, CUSTOMERS, lang), verb="is" if n == 1 else "are")))
    return parts


def _compare(diff: int, lang: str) -> list:
    if diff > 0:
        return rich(T(lang, "Up {d} on the same days last week.",
                      "أكثر بـ{d} من الأيام نفسها في الأسبوع الماضي."), d=B(str(diff)))
    if diff < 0:
        return rich(T(lang, "Down {d} on the same days last week.",
                      "أقل بـ{d} من الأيام نفسها في الأسبوع الماضي."), d=B(str(-diff)))
    return rich(T(lang, "The same as the same days last week.",
                  "مثل الأيام نفسها في الأسبوع الماضي."))


# ── needs you now ─────────────────────────────────────────


def _needs(f: Facts, lang: str) -> dict:
    items = []
    for insight in INSIGHTS:
        if insight.kind != "task" or not applies(insight, f.modules):
            continue
        found = insight.find(f)
        if not found:
            continue
        words, detail = insight.say(found, f, lang)
        items.append({
            "key": insight.key, "count": found.n, "words": words, "detail": detail,
            "href": insight.action.href if insight.action else None,
            "rule": rule_line(insight.rule.get(lang), count(found.n, found.noun, lang), lang),
        })
    return {"items": items[:3], "empty": T(lang, "Nothing is waiting.", "لا شيء ينتظرك.")}


# ── the four numbers ──────────────────────────────────────

SETS = {
    "orders": ("sales", "orders", "came_back", "paid_link"),
    "bookings": ("visits", "booked_ahead", "no_show_rate", "new_bookings"),
    "ledger": ("owed", "collected", "over_60", "promised"),
    "inbox": ("wrote", "waiting", "first_answer", "new_customers"),
}
MONEY_KPIS = {"sales", "paid_link", "owed", "collected", "over_60"}
NEEDS_MODULE = {
    "sales": "orders", "orders": "orders", "came_back": "orders", "paid_link": "orders",
    "visits": "bookings", "booked_ahead": "bookings", "no_show_rate": "bookings",
    "new_bookings": "bookings", "owed": "ledger", "collected": "ledger", "over_60": "ledger",
    "promised": "ledger", "wrote": "inbox", "waiting": "inbox", "first_answer": "inbox",
    "new_customers": "inbox",
}


def kpi_keys(f: Facts, main: str) -> list[str]:
    """Four numbers (C): a single product shows its own four; with several, two from the
    main product, then "Owed to you" if credit accounts are on, then "Waiting"."""
    products = [m for m in ("orders", "bookings", "ledger") if m in f.modules]
    if len(products) <= 1:
        order = [*SETS[main], *SETS["inbox"]]
    else:
        order = [*SETS[main][:2]]
        if "ledger" in f.modules and main != "ledger":
            order.append("owed")
        order.append("waiting")
        order += [*SETS[main][2:]]
        order += [k for p in products if p != main for k in SETS[p]]
        order += [*SETS["inbox"]]
    keys: list[str] = []
    for key in order:
        if key in keys or NEEDS_MODULE[key] not in f.modules:
            continue
        if key in MONEY_KPIS and not f.money:
            continue
        keys.append(key)
    return keys[:4]


def _change(f: Facts, state: str, cur: int, last: int, base_cur: int, base_last: int,
            fmt, lang: str) -> dict | None:
    """Against the same span last week (A2). A percentage only when both periods count 20
    or more (A3); otherwise last week's figure as it is."""
    if state == "first_week":
        return None
    if state != "quiet" and base_cur >= PERCENT_FROM and base_last >= PERCENT_FROM and last:
        pct = round(100 * (cur - last) / last)
        if pct > 0:
            return {"dir": "up", "text": rich(T(lang, "▲ {p} on last week",
                                                "▲ {p} عن الأسبوع الماضي"),
                                              p=B(f"{pct}%"))}
        if pct < 0:
            return {"dir": "down", "text": rich(T(lang, "▼ {p} on last week",
                                                  "▼ {p} عن الأسبوع الماضي"),
                                                p=B(f"{-pct}%"))}
        return {"dir": "level", "text": rich(T(lang, "Level with last week", "مثل الأسبوع الماضي"))}
    return {"dir": None,
            "text": rich(T(lang, "Last week {v}", "الأسبوع الماضي {v}"), v=B(fmt(last)))}


def _kpis(f: Facts, main: str, state: str, lang: str) -> list[dict]:
    def n(value: int) -> str:
        return f"{value:,}"

    def m(value: int) -> str:
        return money(value, lang)

    noun = visit_noun(f.business_type)
    visits_label = {
        "visits": T(lang, "Visits this week", "الزيارات هذا الأسبوع"),
        "appointments": T(lang, "Appointments this week", "المواعيد هذا الأسبوع"),
        "jobs": T(lang, "Jobs this week", "المهام هذا الأسبوع"),
    }[noun[0][1]]
    base_rate = f.completed_30 + f.no_shows_30
    over_60 = f.buckets.get("d61_90", 0) + f.buckets.get("d90_plus", 0)
    cards = {
        "sales": (T(lang, "Sales this week", "المبيعات هذا الأسبوع"), m(f.sales), "/app/orders",
                  _change(f, state, f.sales, f.sales_last, f.orders, f.orders_last, m, lang)),
        "orders": (T(lang, "Orders this week", "الطلبات هذا الأسبوع"), n(f.orders), "/app/orders",
                   _change(f, state, f.orders, f.orders_last, f.orders, f.orders_last, n, lang)),
        "came_back": (T(lang, "Came back", "عادوا للطلب"), n(f.came_back), "/app/orders",
                      _change(f, state, f.came_back, f.came_back_last, f.came_back,
                              f.came_back_last, n, lang)),
        "paid_link": (T(lang, "Paid by link", "مدفوع عبر الرابط"), m(f.paid_link),
                      "/app/orders?show=paid",
                      _change(f, state, f.paid_link, f.paid_link_last, f.paid_link_count,
                              f.paid_link_count_last, m, lang)),
        "visits": (visits_label, n(f.visits), "/app/bookings",
                   _change(f, state, f.visits, f.visits_last, f.visits, f.visits_last, n, lang)),
        "booked_ahead": (T(lang, "Booked, next 7 days", "محجوز للأيام السبعة القادمة"),
                         n(f.booked_ahead), "/app/bookings", None),
        "no_show_rate": (
            T(lang, "No-shows, 30 days", "الغياب خلال 30 يوماً"),
            (f"{round(100 * f.no_shows_30 / base_rate)}%" if base_rate >= 10
             else T(lang, f"{f.no_shows_30} of {base_rate}", f"{f.no_shows_30} من {base_rate}")),
            "/app/bookings?show=no_show", None),
        "new_bookings": (T(lang, "New bookings", "حجوزات جديدة"), n(f.made), "/app/bookings",
                         _change(f, state, f.made, f.made_last, f.made, f.made_last, n, lang)),
        "owed": (T(lang, "Owed to you", "مستحق لك"), m(f.owed), "/app/ledger",
                 _change(f, state, f.owed, f.owed_last, f.owing, f.owing, m, lang)),
        "collected": (T(lang, "Collected this week", "المحصَّل هذا الأسبوع"), m(f.collected),
                      "/app/ledger",
                      _change(f, state, f.collected, f.collected_last, 0, 0, m, lang)),
        "over_60": (T(lang, "Over 60 days", "متأخر أكثر من 60 يوماً"), m(over_60),
                    "/app/ledger?show=overdue", None),
        "promised": (T(lang, "Promised to pay", "وعدوا بالسداد"),
                     n(sum(1 for a in f.accounts if a.promised)),
                     "/app/ledger?show=promised", None),
        "wrote": (T(lang, "Wrote to you", "راسلوك"), n(f.wrote), "/app/inbox",
                  _change(f, state, f.wrote, f.wrote_last, f.wrote, f.wrote_last, n, lang)),
        "waiting": (T(lang, "Waiting now", "بانتظار الرد الآن"), n(len(f.waiting)),
                    "/app/inbox?show=waiting", None),
        "first_answer": (
            T(lang, "First answer, 7 days", "أول رد، 7 أيام"), minutes(f.first_answer, lang),
            "/app/team",
            None if f.first_answer_before is None or state == "first_week" else {
                "dir": None, "text": rich(T(lang, "The 7 days before {v}",
                                            "الأيام السبعة قبلها {v}"),
                                          v=B(minutes(f.first_answer_before, lang)))}),
        "new_customers": (T(lang, "New customers", "عملاء جدد"), n(f.new_customers), "/app/inbox",
                          _change(f, state, f.new_customers, f.new_customers_last,
                                  f.new_customers, f.new_customers_last, n, lang)),
    }
    out = []
    for key in kpi_keys(f, main):
        label, value, href, change = cards[key]
        out.append({"key": key, "label": label, "value": value, "money": key in MONEY_KPIS,
                    "href": href, "change": change})
    return out


def _placeholders(f: Facts, lang: str) -> list[str]:
    """The empty state keeps the real shape, saying what will appear (C, States)."""
    slots = []
    if "orders" in f.modules:
        slots.append(T(lang, "Your first order shows here", "يظهر هنا أول طلب يصلك"))
    if "bookings" in f.modules:
        slots.append(T(lang, "Your first booking shows here", "يظهر هنا أول حجز"))
    if "ledger" in f.modules:
        slots.append(T(lang, "The credit accounts you open show here",
                       "تظهر هنا الحسابات الآجلة التي تفتحها"))
    if "inbox" in f.modules:
        slots.append(T(lang, "Customers who write to you show here",
                       "يظهر هنا العملاء الذين يراسلونك"))
    return slots


# ── suggestions ───────────────────────────────────────────


def _card(insight: Insight, found: Finding, f: Facts, lang: str) -> dict:
    title, line = insight.say(found, f, lang)
    counted = count(found.n, found.noun, lang) if found.n else ""
    rule = insight.rule.get(lang)
    return {
        "key": insight.key,
        "kind": insight.kind,
        "title": title,
        "line": line,
        "rule": rule_line(rule, counted, lang) if counted else f"{RULE[lang]} · {rule}",
        "rows": [{"id": r.id, "label": r.label} for r in found.rows[:10]],
        "more": max(len(found.rows) - 10, 0),
        "action": (
            {"label": insight.action.label.get(lang), "href": insight.action.href}
            if insight.action else None
        ),
        "status": insight.status.get(lang) if insight.status else None,
        "snooze": (
            {"key": insight.key, "fingerprint": found.fingerprint(insight.key)}
            if insight.kind == "knowledge" and f.money else None
        ),
    }


def _suggestions(f: Facts, state: str, lang: str, snoozed: dict) -> list[dict]:
    """At most 3: money first, then knowledge with a screen to act on, then knowledge for
    information (B, "Order"). In the first week only the ones with an action show."""
    cards = []
    for insight in INSIGHTS:
        if insight.kind == "task" or not applies(insight, f.modules):
            continue
        if insight.money and not f.money:
            continue
        if state == "first_week" and insight.action is None:
            continue
        found = insight.find(f)
        if not found:
            continue
        fingerprint = found.fingerprint(insight.key)
        if insight.kind == "knowledge" and snoozed.get(insight.key) == fingerprint:
            continue
        cards.append(_card(insight, found, f, lang))
        if len(cards) == 3:
            break
    return cards


# ── done for you this week ────────────────────────────────


def _done(f: Facts, lang: str) -> dict:
    rows = []

    def add(key, value, label, href):
        rows.append({"key": key, "value": value, "label": label, "href": href})

    if f.sent_for_you:
        n = f.sent_for_you
        add("sent", f"{n:,}", T(lang, f"{noun_after(n, MESSAGES, lang)} ALYR sent for you",
                                f"{noun_after(n, MESSAGES, lang)} أرسلتها ALYR نيابة عنك"),
            "/app/inbox")
    if f.booking_reminders_sent:
        n = f.booking_reminders_sent
        add("booking_reminders", f"{n:,}",
            T(lang, f"booking {noun_after(n, REMINDERS, lang)}",
              f"{noun_after(n, REMINDERS, lang)} بالمواعيد"), "/app/bookings")
    if f.payment_reminders_sent:
        n = f.payment_reminders_sent
        add("payment_reminders", f"{n:,}",
            T(lang, f"payment {noun_after(n, REMINDERS, lang)}",
              f"{noun_after(n, REMINDERS, lang)} بالدفع"), "/app/ledger")
    if f.money and f.paid_by_link_week:
        add("paid", money(f.paid_by_link_week, lang),
            T(lang, "paid through ALYR links", "دُفعت عبر روابط ALYR"),
            "/app/orders?show=paid" if "orders" in f.modules else "/app/ledger")
    return {"rows": rows, "empty": T(lang, "Nothing yet this week.", "لا شيء بعد هذا الأسبوع.")}


# ── the week ──────────────────────────────────────────────


def _week(f: Facts, main: str, lang: str) -> dict | None:
    booked: dict = {}
    if main == "orders":
        if f.money:
            title = T(lang, "Sales this week", "المبيعات هذا الأسبوع")
            data = {d: v for d, (_, v) in f.orders_by_day.items()}
            fmt = "money"
        else:
            title = T(lang, "Orders this week", "الطلبات هذا الأسبوع")
            data = {d: c for d, (c, _) in f.orders_by_day.items()}
            fmt = "count"
    elif main == "bookings":
        noun = visit_noun(f.business_type)
        title = {
            "visits": T(lang, "Visits this week", "الزيارات هذا الأسبوع"),
            "appointments": T(lang, "Appointments this week", "المواعيد هذا الأسبوع"),
            "jobs": T(lang, "Jobs this week", "المهام هذا الأسبوع"),
        }[noun[0][1]]
        data, fmt, booked = f.visits_by_day, "count", f.booked_share_by_day
    elif main == "ledger" and f.money:
        title = T(lang, "Collected this week", "المحصَّل هذا الأسبوع")
        data, fmt = f.collected_by_day, "money"
    elif "inbox" in f.modules:
        title = T(lang, "Chats this week", "المحادثات هذا الأسبوع")
        data, fmt = f.chats_by_day, "count"
    else:
        return None

    def text(value: int) -> str:
        return money(value, lang) if fmt == "money" else f"{value:,}"

    days = []
    for i in range(7):
        day = f.week_start + timedelta(days=i)
        state = "past" if day < f.today else "today" if day == f.today else "coming"
        value = data.get(day, 0) if state != "coming" else None
        last = data.get(day - timedelta(days=7), 0)
        days.append({
            "date": day.isoformat(),
            "label": DAY_SHORT[lang][i],
            "state": state,
            "value": value,
            "value_text": text(value) if value is not None else None,
            "last": last,
            "last_text": text(last),
            "booked": round(booked[day], 2) if state != "past" and day in booked else None,
        })
    peak = max([d["value"] or 0 for d in days] + [d["last"] for d in days] + [1])
    total = sum(d["value"] or 0 for d in days)
    return {"title": title, "format": fmt, "max": peak, "days": days,
            "total_text": text(total)}


# ── busiest hours ─────────────────────────────────────────


def _hours(f: Facts, lang: str) -> dict | None:
    if not f.hours_grid:
        return None
    first, last = f.hours_range
    hours = list(range(first, min(last, 24)))
    peak = max(f.hours_grid.values())
    rows = []
    for dow in range(7):
        cells = []
        for hour in hours:
            value = f.hours_grid.get((dow, hour), 0)
            cells.append(0 if value == 0 else max(1, ceil(4 * value / peak)))
        rows.append({"label": DAY_SHORT[lang][dow], "cells": cells})
    ranked = sorted(f.hours_grid.items(), key=lambda kv: (-kv[1], kv[0]))[:3]

    def words(dow: int, hour: int) -> str:
        return f"{DAY_PLURAL[lang][dow]} {hour:02d}:00–{(hour + 1) % 24:02d}:00"

    return {
        "title": T(lang, "Busiest hours, 28 days", "أكثر الساعات ازدحاماً، 28 يوماً"),
        "hours": [f"{h:02d}" for h in hours],
        "rows": rows,
        "top": words(*ranked[0][0]),
        "top3": [words(*cell) for cell, _ in ranked],
    }


# ── top items or services ─────────────────────────────────


def _top(f: Facts, main: str, lang: str) -> dict | None:
    if main == "orders" or ("orders" in f.modules and main != "bookings"):
        source = f.top_items
        title = T(lang, "Top items, 28 days", "الأكثر طلباً، 28 يوماً")
    elif "bookings" in f.modules:
        source = f.top_services
        title = T(lang, "Top services, 28 days", "أكثر الخدمات حجزاً، 28 يوماً")
    else:
        return None
    current = [r for r in source if r[1] > 0][:5]
    if not current:
        return None
    before = [name for name, _, prev in sorted(source, key=lambda r: (-r[2], r[0])) if prev > 0]
    peak = current[0][1]
    rows = []
    for rank, (name, cur, prev) in enumerate(current):
        if prev == 0 or name not in before:
            change = {"dir": None, "text": T(lang, "New", "جديد")}
        else:
            moved = before.index(name) - rank
            change = (
                {"dir": "up", "text": f"▲ {moved}"} if moved > 0
                else {"dir": "down", "text": f"▼ {-moved}"} if moved < 0
                else {"dir": "level", "text": "—"}
            )
        rows.append({
            "name": f.names_ar.get(name, name) if lang == "ar" else name,
            "value": cur, "value_text": f"{cur:,}", "share": round(cur / peak, 3),
            "change": change,
        })
    return {"title": title, "rows": rows}


# ── money owed ────────────────────────────────────────────


def _owed(f: Facts, lang: str) -> dict | None:
    if "ledger" not in f.modules or not f.money:
        return None
    labels = {
        "d0_30": T(lang, "0–30 days", "0–30 يوماً"),
        "d31_60": T(lang, "31–60", "31–60"),
        "d61_90": T(lang, "61–90", "61–90"),
        "d90_plus": T(lang, "90+ days", "أكثر من 90 يوماً"),
    }
    total = f.owed
    segments = [
        {"key": key, "label": labels[key], "amount_text": money(f.buckets.get(key, 0), lang),
         "share": round(f.buckets.get(key, 0) / total, 3) if total else 0}
        for key in ("d0_30", "d31_60", "d61_90", "d90_plus")
    ]
    oldest = max(f.accounts, key=lambda a: a.oldest_days, default=None)
    return {
        "title": T(lang, "Owed to you", "المستحق لك"),
        "total_text": money(total, lang),
        "customers": count(f.owing, CUSTOMERS, lang),
        "segments": segments,
        "oldest": rich(
            T(lang, "Oldest: {name}, {days}, {v}.", "الأقدم: {name}، منذ {days}، {v}."),
            name=oldest.name, days=count(oldest.oldest_days, DAYS, lang),
            v=B(money(oldest.balance, lang)),
        ) if oldest else None,
        "empty": T(lang, "Nobody owes you anything.", "لا أحد عليه مستحقات لك."),
    }


# ── team ──────────────────────────────────────────────────


def _team(f: Facts, lang: str) -> dict | None:
    if not f.team:
        return None
    rows = [
        {"name": p["name"], "replies": p["replies"],
         "first_answer": minutes(p["median_reply_seconds"], lang),
         "open": p["open"], "waiting": p["waiting"]}
        for p in f.team["people"]
    ]
    nobody = f.team["unassigned"]["waiting"]
    return {
        "rows": rows,
        "unassigned": rich(T(lang, "{n} waiting with nobody on them",
                             "{n} بانتظار الرد دون مسؤول"),
                           n=count(nobody, CUSTOMERS, lang)) if nobody else None,
        "everyone": f.team["can_see_everyone"],
    }


# ── the Sunday report ─────────────────────────────────────


def _report(f: Facts, lang: str) -> list | None:
    if not f.money:
        return None
    if not f.report_on:
        return rich(T(lang, "The Sunday report is off.", "تقرير الأحد متوقف."))
    if not f.report_numbers:
        return rich(T(lang, "No number receives the Sunday report yet.",
                      "لا يصل تقرير الأحد إلى أي رقم بعد."))
    at = f.report_at.astimezone(f.zone) if f.report_at else None
    when = f"{at.hour}:{at.minute:02d}" if at else "9:00"
    return rich(T(lang, "Your report goes to {n} on Sunday at {t}.",
                  "يصل تقريرك إلى {n} يوم الأحد الساعة {t}."),
                n=count(f.report_numbers, NUMBERS, lang), t=B(when))
