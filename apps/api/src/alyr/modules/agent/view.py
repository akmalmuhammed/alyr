"""The `AgentView`: everything the dashboard draws, every word already in the reader's
language and every number already formatted (`03-build-brief.md`, `01-research.md` C,
`05-critique.md`).

The screen renders this and decides nothing. Staff who may not see money (the agent role,
`02-data.md` §9) get a view without it: no sales, nothing owed or collected, no amounts.
Every comparison is like with like: this week from Sunday to now against last week from
Sunday to the same time, and a partial today against a partial day last week.
"""

from datetime import datetime, timedelta
from math import ceil

import asyncpg

from alyr import catalog as shop_catalog
from alyr.core import workspace
from alyr.core.auth import Staff
from alyr.core.words import DAYS, MESSAGES, NUMBERS, ORDERS, REMINDERS, STEPS
from alyr.modules.agent import facts as facts_
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import (
    INSIGHTS,
    Finding,
    Insight,
    applies,
    no_show_rate,
    people_noun,
    visit_noun,
)
from alyr.modules.agent.words import (
    DAY_LONG,
    DAY_PLURAL,
    DAY_SHORT,
    MONTHS,
    NBSP,
    RULE,
    B,
    agree,
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

VERSION = 2
QUIET_BELOW = 5
PERCENT_FROM = 20
HOURS_FROM = 50  # a busiest-hours grid needs this many events to mean anything
TYPE_LEAD = {
    "restaurant": "orders", "shop": "orders", "travel": "orders",
    "bakery": "orders", "grocery": "orders", "fashion": "orders",
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
    if "catalog" in f.modules:
        f.stock = await workspace.counts(conn, f.modules, f.now)
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
    empty = state == "empty"
    return {
        "version": VERSION,
        "lang": lang,
        "dir": "rtl" if lang == "ar" else "ltr",
        "now": f.now.isoformat(),
        "state": state,
        "money": f.money,
        "lead": main,
        "header": _header(f, main, state, lang),
        "needs": _needs(f, state, lang),
        "kpis": [] if empty else _kpis(f, main, state, lang),
        "kpi_caption": None if empty or state == "first_week" else _caption(f, lang),
        "catalog": _catalog(f, lang),
        "placeholders": _placeholders(f, lang) if empty else [],
        "suggestions": [] if empty else _suggestions(f, main, state, lang, snoozed or {}),
        "done": _done(f, lang),
        "week": None if empty else _week(f, main, lang),
        "hours": None if empty else _hours(f, lang),
        "top": None if empty else _top(f, main, lang),
        "owed": _owed(f, lang),
        "team": None if empty else _team(f, lang),
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
        "bookings": (f.visits, f.visits_last),
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


def _pct(cur: int, last: int) -> int:
    return round(100 * (cur - last) / last)


def _comparable(cur: int, last: int) -> bool:
    """A percentage only when both periods count 20 or more (A3)."""
    return cur >= PERCENT_FROM and last >= PERCENT_FROM and last > 0


# ── header ────────────────────────────────────────────────


def _header(f: Facts, main: str, state: str, lang: str) -> dict:
    local = f.local
    city = CITY.get(f.tz, ("", ""))
    city = city[1] if lang == "ar" else city[0]
    day = local.date()
    weekday = DAY_LONG[lang][sunday_index(day)] if lang == "ar" else DAY_SHORT[lang][
        sunday_index(day)]
    date = f"{weekday} {day.day} {MONTHS[lang][day.month - 1]}"
    hour = local.hour
    name = f.first_name_ar if lang == "ar" else f.first_name
    if lang == "ar":
        greet = "صباح الخير" if hour < 12 else "مساء الخير"
        greeting = f"{greet} يا {name}" if name else greet
    else:
        greet = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"
        greeting = f"{greet}, {name}" if name else greet
    updated = T(lang, f"Updated {clock(local)}", f"حُدّث {clock(local)}")
    return {
        "greeting": greeting,
        "date": date,
        "updated": updated,
        # The workspace's line: who, when, how fresh (05-critique P1-1).
        "eyebrow": f"{greeting} · {date} · {updated}",
        # The homepage figure's line: a moment, not a date that ages (P0-6).
        "when": f"{DAY_LONG[lang][sunday_index(day)]} · {clock(local)}",
        "city": city,
        "summary": _summary(f, main, state, lang),
    }


def _compare(f: Facts, main: str, lang: str) -> list:
    """Name the measure and use the numbers' own figures (05-critique P0-1)."""
    parts = []
    measures = {
        "orders": [(T(lang, "Orders", "الطلبات"), f.orders, f.orders_last, f.orders,
                    f.orders_last)],
        "bookings": [(T(lang, "Visits", "الزيارات") if visit_noun(f.business_type)[0][1]
                      == "visits" else T(lang, "Appointments", "المواعيد"),
                      f.visits, f.visits_last, f.visits, f.visits_last)],
        "inbox": [(T(lang, "Customers who wrote", "العملاء الذين راسلوك"),
                   f.wrote, f.wrote_last, f.wrote, f.wrote_last)],
    }[main]
    if main == "orders" and f.money:
        measures.append((T(lang, "sales", "المبيعات"), f.sales, f.sales_last, f.orders,
                         f.orders_last))
    if not all(_comparable(base, base_last) for _, _, _, base, base_last in measures):
        return []
    for i, (label, cur, last, _, _) in enumerate(measures):
        p = _pct(cur, last)
        label = label if i == 0 or lang == "ar" else label.lower()
        if lang == "ar":
            text = (f"{label} أكثر بـ{p}%" if p > 0 else f"{label} أقل بـ{-p}%" if p < 0
                    else f"{label} بلا تغيير")
            parts.append(text if i == 0 else f"و{text}")
        else:
            parts.append(f"{label} up {p}%" if p > 0 else f"{label} down {-p}%" if p < 0
                         else f"{label} level")
    if lang == "ar":
        return rich("، ".join(parts) + " عن الأيام نفسها من الأسبوع الماضي.")
    return rich(", ".join(parts) + " on the same days last week.")


def _summary(f: Facts, main: str, state: str, lang: str) -> list[dict]:
    """One sentence before any number (A1): facts plain, the comparison muted."""

    def fact(parts):
        return {"muted": False, "text": parts}

    def muted(parts):
        return {"muted": True, "text": parts}

    if state == "empty":
        verb = {"orders": ("order", "يطلبون"), "bookings": ("book", "يحجزون")}.get(main)
        if verb:
            return [fact(rich(T(lang, f"Nothing yet. This page fills in as customers write and "
                                      f"{verb[0]}.",
                                f"لا شيء بعد. تمتلئ هذه الصفحة حين يراسلك العملاء و{verb[1]}.")))]
        return [fact(rich(T(lang, "Nothing yet. This page fills in as customers write.",
                            "لا شيء بعد. تمتلئ هذه الصفحة حين يراسلك العملاء.")))]

    noun = visit_noun(f.business_type)
    who = people_noun(f.business_type)
    cur, last = _measure(f, main)
    unit = {"orders": ORDERS, "bookings": noun, "ledger": who, "inbox": who}[main]
    if state == "first_week":
        start = f.comparisons_from
        day = DAY_LONG[lang][sunday_index(start)]
        return [
            fact(rich(T(lang, "First week: {n} so far.", "أسبوعك الأول: {n} حتى الآن."),
                      n=count(cur, unit, lang))),
            muted(rich(T(lang, "Comparisons start {day} {date}.",
                         "تبدأ المقارنات يوم {day} {date}."),
                       day=day, date=day_month(start, lang))),
        ]
    if state == "quiet":
        # Counts, side by side; no judgement of the week (P1-10).
        return [fact(rich(T(lang, "{n} so far; {m} by this time last week.",
                            "{n} حتى الآن، و{m} حتى هذا الوقت من الأسبوع الماضي."),
                          n=count(cur, unit, lang), m=B(str(last))))]

    parts: list[dict] = []
    if main == "orders":
        if f.money:
            parts.append(fact(rich(T(lang, "Week so far: {n}, {v}.",
                                     "الأسبوع حتى الآن: {n}، {v}."),
                                   n=count(f.orders, ORDERS, lang), v=B(money(f.sales, lang)))))
        else:
            parts.append(fact(rich(T(lang, "Week so far: {n}.", "الأسبوع حتى الآن: {n}."),
                                   n=count(f.orders, ORDERS, lang))))
    elif main == "bookings":
        parts.append(fact(rich(
            T(lang, "Week so far: {n}, {k}.", "الأسبوع حتى الآن: {n}، وغياب {k}."),
            n=count(f.visits, noun, lang),
            k=count(f.no_shows_week, NO_SHOWS, lang) if lang == "en" else B(str(f.no_shows_week)))))
    elif main == "ledger":
        if f.money:
            over = f.buckets.get("d61_90", 0) + f.buckets.get("d90_plus", 0)
            parts.append(fact(rich(T(lang, "{v} owed to you by {n}.", "{v} مستحقة لك على {n}."),
                                   v=B(money(f.owed, lang)), n=count(f.owing, who, lang))))
            parts.append(muted(rich(T(lang, "{v} of it is over 60 days.",
                                      "منها {v} متأخرة أكثر من 60 يوماً."),
                                    v=B(money(over, lang)))))
            parts.append(fact(rich(T(lang, "{v} collected this week.", "{v} حُصّلت هذا الأسبوع."),
                                   v=B(money(f.collected, lang)))))
        else:
            parts.append(fact(rich(T(lang, "{n} with an open account.", "{n} لديهم حساب مفتوح."),
                                   n=count(f.owing, who, lang))))
    else:
        parts.append(fact(rich(T(lang, "Week so far: {n} wrote to you.",
                                 "الأسبوع حتى الآن: راسلك {n}."), n=count(f.wrote, who, lang))))

    if main != "ledger":
        compared = _compare(f, main, lang)
        if compared:
            parts.append(muted(compared))
        else:
            parts.append(muted(rich(T(lang, "By this time last week: {n}.",
                                      "حتى هذا الوقت من الأسبوع الماضي: {n}."),
                                    n=count(last, unit, lang))))
    if main == "bookings":
        parts.append(fact(rich(
            T(lang, "{n} booked for the next 7 days.", "المحجوز للأيام السبعة القادمة: {n}."),
            n=count(f.booked_ahead, noun, lang))))
    if f.unconfirmed and main == "orders":
        n = len(f.unconfirmed)
        parts.append(fact(rich(T(lang, "{n} {verb} confirming.", "{n} بحاجة إلى تأكيد."),
                               n=count(n, ORDERS, lang), verb="needs" if n == 1 else "need")))
    elif f.waiting:
        n = len(f.waiting)
        parts.append(fact(rich(T(lang, "{n} {verb} waiting for an answer.", "{n} بانتظار الرد."),
                               n=count(n, who, lang), verb="is" if n == 1 else "are")))
    return parts


# ── needs you now ─────────────────────────────────────────


def _needs(f: Facts, state: str, lang: str) -> dict:
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
    # Setup left to do folds into one row once the business has records (P1-2); while it
    # has none, the workspace shows the whole checklist instead.
    if f.setup and state != "empty":
        product, steps = f.setup[0]
        n = sum(len(s) for _, s in f.setup)
        first = steps[0]
        name = product["ar"] if lang == "ar" else product["en"]
        if lang == "ar":
            words = rich(agree(n, "خطوة إعداد متبقية في {p}", "خطوتا إعداد متبقيتان في {p}",
                               "خطوات إعداد متبقية في {p}"), p=B(name))
        else:
            words = rich(f"{noun_after(n, STEPS, lang)} left for {{p}}", p=B(name))
        items.append({
            "key": "setup", "count": n, "words": words,
            "detail": rich(first["label"]["ar"] if lang == "ar" else first["label"]["en"]),
            "href": f"/app/{first['screen']}" if first["screen"] else "/app/connections",
            "rule": f"{RULE[lang]} · " + T(lang, "a step of a product you use, not done yet",
                                          "خطوة في منتج تستخدمه ولم تُنجز بعد"),
        })
    return {
        "items": items[:4],
        "empty": T(lang, "Nothing is waiting.", "لا شيء ينتظرك."),
    }


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
    main product, then "Owed to you" if credit accounts are on, then the main product's
    next. "Waiting" is not repeated here: Needs you now already says it (P1-3)."""
    products = [m for m in ("orders", "bookings", "ledger") if m in f.modules]
    if len(products) <= 1:
        order = [*SETS[main], *SETS["inbox"]]
    else:
        order = [*SETS[main][:2]]
        if "ledger" in f.modules and main != "ledger":
            order.append("owed")
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


def _caption(f: Facts, lang: str) -> str:
    """One line for the strip: what every change is measured against (P0-1)."""
    at = clock(f.local)
    return T(lang, f"Against Sunday to {at} last week",
             f"مقارنةً بالأحد حتى {at} من الأسبوع الماضي")


def _change(state: str, cur: int, last: int, base_cur: int, base_last: int, fmt,
            lang: str) -> dict | None:
    """▲ 5% when both periods count 20 or more (A3); otherwise last week's figure."""
    if state == "first_week":
        return None
    if state != "quiet" and _comparable(base_cur, base_last) and last:
        pct = _pct(cur, last)
        if pct > 0:
            return {"dir": "up", "text": rich("▲ {p}", p=B(f"{pct}%")),
                    "said": T(lang, f"up {pct}%", f"أكثر بـ{pct}%")}
        if pct < 0:
            return {"dir": "down", "text": rich("▼ {p}", p=B(f"{-pct}%")),
                    "said": T(lang, f"down {-pct}%", f"أقل بـ{-pct}%")}
        return {"dir": "level", "text": rich(T(lang, "Level", "بلا تغيير")), "said": None}
    return {"dir": None, "text": rich(T(lang, "Last week {v}", "الأسبوع الماضي {v}"),
                                      v=B(fmt(last))), "said": None}


def _money_value(dirhams: int, lang: str) -> dict:
    """The figure and its unit apart, so the unit can be drawn small (P1-5)."""
    whole, part = divmod(abs(dirhams), 100)
    figure = ("-" if dirhams < 0 else "") + f"{whole:,}" + (f".{part:02d}" if part else "")
    return {"value": figure, "unit": T(lang, "QAR", "ر.ق"), "unit_first": lang != "ar"}


def _kpis(f: Facts, main: str, state: str, lang: str) -> list[dict]:
    def n(value: int) -> str:
        return f"{value:,}"

    def m(value: int) -> str:
        return money(value, lang)

    def plain(text: str) -> dict:
        return {"value": text, "unit": None, "unit_first": False}

    noun = visit_noun(f.business_type)
    visits_label = {
        "visits": T(lang, "Visits this week", "الزيارات هذا الأسبوع"),
        "appointments": T(lang, "Appointments this week", "المواعيد هذا الأسبوع"),
        "jobs": T(lang, "Jobs this week", "المهام هذا الأسبوع"),
    }[noun[0][1]]
    rate = no_show_rate(f)
    if rate and rate[1] >= PERCENT_FROM:
        rate_value = {"value": str(rate[0]), "unit": "%", "unit_first": False}
    else:
        base = rate[1] if rate else 0
        rate_value = {"value": str(f.no_shows_30), "unit": T(lang, f"of {base}", f"من {base}"),
                      "unit_first": False}
    over_60 = f.buckets.get("d61_90", 0) + f.buckets.get("d90_plus", 0)
    answer = minutes(f.first_answer, lang).split(NBSP)
    cards = {
        "sales": (T(lang, "Sales this week", "المبيعات هذا الأسبوع"), _money_value(f.sales, lang),
                  "/app/orders",
                  _change(state, f.sales, f.sales_last, f.orders, f.orders_last, m, lang)),
        "orders": (T(lang, "Orders this week", "الطلبات هذا الأسبوع"), plain(n(f.orders)),
                   "/app/orders",
                   _change(state, f.orders, f.orders_last, f.orders, f.orders_last, n, lang)),
        "came_back": (T(lang, "Came back this week", "عادوا للطلب هذا الأسبوع"),
                      plain(n(f.came_back)), "/app/orders",
                      _change(state, f.came_back, f.came_back_last, f.came_back,
                              f.came_back_last, n, lang)),
        "paid_link": (T(lang, "Paid by link", "مدفوع عبر الرابط"),
                      _money_value(f.paid_link, lang), "/app/orders?show=paid",
                      _change(state, f.paid_link, f.paid_link_last, f.paid_link_count,
                              f.paid_link_count_last, m, lang)),
        "visits": (visits_label, plain(n(f.visits)), "/app/bookings",
                   _change(state, f.visits, f.visits_last, f.visits, f.visits_last, n, lang)),
        "booked_ahead": (T(lang, "Booked, next 7 days", "محجوز للأيام السبعة القادمة"),
                         plain(n(f.booked_ahead)), "/app/bookings", None),
        "no_show_rate": (T(lang, "No-shows, 30 days", "الغياب خلال 30 يوماً"), rate_value,
                         "/app/bookings?show=no_show", None),
        "new_bookings": (T(lang, "New bookings this week", "حجوزات جديدة هذا الأسبوع"),
                         plain(n(f.made)), "/app/bookings",
                         _change(state, f.made, f.made_last, f.made, f.made_last, n, lang)),
        "owed": (T(lang, "Owed to you", "مستحق لك"), _money_value(f.owed, lang), "/app/ledger",
                 _change(state, f.owed, f.owed_last, f.owing, f.owing, m, lang)),
        "collected": (T(lang, "Collected this week", "المحصَّل هذا الأسبوع"),
                      _money_value(f.collected, lang), "/app/ledger",
                      _change(state, f.collected, f.collected_last, 0, 0, m, lang)),
        "over_60": (T(lang, "Over 60 days", "متأخر أكثر من 60 يوماً"),
                    _money_value(over_60, lang), "/app/ledger?show=overdue", None),
        "promised": (T(lang, "Promised to pay", "وعدوا بالسداد"),
                     plain(n(sum(1 for a in f.accounts if a.promised))),
                     "/app/ledger?show=promised", None),
        "wrote": (T(lang, "Wrote to you", "راسلوك"), plain(n(f.wrote)), "/app/inbox",
                  _change(state, f.wrote, f.wrote_last, f.wrote, f.wrote_last, n, lang)),
        "waiting": (T(lang, "Waiting now", "بانتظار الرد الآن"), plain(n(len(f.waiting))),
                    "/app/inbox?show=waiting", None),
        "first_answer": (
            T(lang, "First answer, 7 days", "أول رد، 7 أيام"),
            {"value": answer[0], "unit": answer[1] if len(answer) > 1 else None,
             "unit_first": False},
            "/app/team",
            None if f.first_answer_before is None or state == "first_week" else {
                "dir": None, "said": None,
                "text": rich(T(lang, "The 7 days before {v}", "الأيام السبعة قبلها {v}"),
                             v=B(minutes(f.first_answer_before, lang)))}),
        "new_customers": (T(lang, "New customers", "عملاء جدد"), plain(n(f.new_customers)),
                          "/app/inbox",
                          _change(state, f.new_customers, f.new_customers_last,
                                  f.new_customers, f.new_customers_last, n, lang)),
    }
    out = []
    for key in kpi_keys(f, main):
        label, value, href, change = cards[key]
        out.append({"key": key, "label": label, **value, "money": key in MONEY_KPIS,
                    "href": href, "change": change})
    return out


def _catalog(f: Facts, lang: str) -> dict | None:
    """The Catalog's cards, for a shop that has the module: how many items are sold out and
    how many are low, each the number of rows in the Catalog list it opens (`href`, the
    list's own filter). They are declared with the module (`catalog.py`), not here. With none
    to show, the card is a number and no link: there is no list to open."""
    if f.stock is None:
        return None
    module = shop_catalog.MODULE_BY_KEY["catalog"]
    cards = []
    for card in module.cards:
        value = f.stock[card.count]
        cards.append({
            "key": card.key, "label": card.label.get(lang), "value": value, "text": f"{value:,}",
            "href": card.href if value else None,
        })
    return {"title": T(lang, "Catalog", "الكتالوج"), "cards": cards}


def _placeholders(f: Facts, lang: str) -> list[dict]:
    """The empty state keeps the real shape, saying what will appear (C, States; 05-critique
    P1-10): the week, the hours and a list, each drawn as a dashed outline."""
    slots = []
    if "orders" in f.modules:
        slots.append({"kind": "week", "text": T(lang, "Orders, by day", "الطلبات حسب اليوم")})
    elif "bookings" in f.modules:
        slots.append({"kind": "week", "text": T(lang, "Visits, by day", "الزيارات حسب اليوم")})
    if "orders" in f.modules or "bookings" in f.modules:
        slots.append({"kind": "hours",
                      "text": T(lang, "Busiest hours", "أكثر الساعات ازدحاماً")})
    if "ledger" in f.modules:
        slots.append({"kind": "list",
                      "text": T(lang, "Money owed, by age", "المستحق حسب العمر")})
    if "inbox" in f.modules:
        slots.append({"kind": "list",
                      "text": T(lang, "Customers who wrote", "العملاء الذين راسلوك")})
    return slots


# ── suggestions ───────────────────────────────────────────


def _card(insight: Insight, found: Finding, f: Facts, lang: str, primary: bool) -> dict:
    title, line = insight.say(found, f, lang)
    counted = count(found.n, found.noun, lang) if found.n else ""
    rule = insight.rule.get(lang)
    return {
        "key": insight.key,
        "kind": insight.kind,
        "primary": primary,
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


def _suggestions(f: Facts, main: str, state: str, lang: str, snoozed: dict) -> list[dict]:
    """At most 3: money first, then knowledge with a screen to act on, then knowledge for
    information (B, "Order"). Within knowledge, the main product's rules first, so a
    bakery hears about its orders before its tastings. A person counted by a card above
    is not counted again, and a card left with nobody is dropped (P1-3). In the first week
    only the ones with an action show."""

    def rank(insight: Insight) -> int:
        if insight.kind == "money":
            return 0
        if insight.key == "booked_value":
            return 9  # worth knowing, never anything to do: always last
        relevant = main in insight.module.split("|")
        return (1 if relevant else 3) + (0 if insight.action else 1)

    cards, seen = [], set()
    candidates = sorted(
        (i for i in INSIGHTS if i.kind != "task" and applies(i, f.modules)), key=rank
    )
    for insight in candidates:
        if insight.money and not f.money:
            continue
        if state == "first_week" and insight.action is None:
            continue
        found = insight.find(f)
        if not found:
            continue
        if insight.kind == "knowledge" and found.rows and found.total is None:
            found.rows = [r for r in found.rows if r.id not in seen]
            if not found.rows:
                continue
        if insight.kind == "knowledge" and snoozed.get(insight.key) == found.fingerprint(
                insight.key):
            continue
        # Volt marks only work to do: a task or money card, never knowledge (P1-10).
        primary = not cards and insight.kind == "money"
        cards.append(_card(insight, found, f, lang, primary))
        seen |= {r.id for r in found.rows}
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
    """Seven days from Sunday, each against the same day last week. Today is compared up
    to the same time; days to come show what is booked, on the same axis; a day the
    business is closed says so (P0-2)."""
    booked: dict = {}
    if main == "orders":
        if f.money:
            data = {d: v for d, (_, v) in f.orders_by_day.items()}
            fmt, key = "money", "sales"
        else:
            data = {d: c for d, (c, _) in f.orders_by_day.items()}
            fmt, key = "count", "orders"
    elif main == "bookings":
        data, fmt, key, booked = f.visits_by_day, "count", "visits", f.booked_by_day
    elif main == "ledger" and f.money:
        data, fmt, key = f.collected_by_day, "money", "collected"
    elif "inbox" in f.modules:
        data, fmt, key = f.chats_by_day, "count", "chats"
    else:
        return None

    def text(value: int) -> str:
        return money(value, lang) if fmt == "money" else f"{value:,}"

    started = (f.started or f.now).astimezone(f.zone).date()
    days = []
    for i in range(7):
        day = f.week_start + timedelta(days=i)
        weekday = sunday_index(day)
        if f.opening and weekday not in f.opening:
            state = "closed"
        elif day < started:
            state = "before"  # before the business was on ALYR: nothing to draw (P1-10)
        else:
            state = "past" if day < f.today else "today" if day == f.today else "coming"
        value = data.get(day, 0) if state in ("past", "today") else None
        last = data.get(day - timedelta(days=7), 0)
        if day - timedelta(days=7) < started:
            last = None
        # last week to this time, only when the business was on ALYR on that day
        by_now = f.last_by_now.get(key) if state == "today" and last is not None else None
        n_booked = booked.get(day) if state in ("today", "coming") else None
        days.append({
            "date": day.isoformat(),
            "label": DAY_SHORT[lang][i],
            "state": state,
            "value": value,
            "value_text": text(value) if value is not None else None,
            "last": last,
            "last_text": text(last) if last is not None else None,
            "last_by_now": by_now,
            "last_by_now_text": text(by_now) if by_now is not None else None,
            "booked": n_booked,
            "booked_text": (T(lang, f"{n_booked} booked", f"{n_booked} محجوزة")
                            if n_booked else None),
        })
    values = [d["value"] or 0 for d in days] + [d["last"] or 0 for d in days]
    values += [(d["value"] or 0) + (d["booked"] or 0) for d in days]  # today: done + booked
    return {
        "title": T(lang, "By day", "حسب اليوم"),
        "format": fmt,
        "max": max(values + [1]),
        "days": days,
        "legend": {
            "last": T(lang, "Same day last week", "اليوم نفسه من الأسبوع الماضي"),
            "by_now": T(lang, "Last week by this time", "الأسبوع الماضي حتى هذا الوقت"),
            "closed": T(lang, "Closed", "مغلق"),
            "booked": T(lang, "Booked", "محجوز"),
        },
    }


# ── busiest hours ─────────────────────────────────────────


def _hours(f: Facts, lang: str) -> dict | None:
    """When the business is busiest over 28 days, once there is enough to say (P1-10).
    Hours the business is closed stay blank."""
    if not f.hours_grid or f.hours_total < HOURS_FROM:
        return None
    first, last = f.hours_range
    hours = list(range(first, min(last, 24)))
    peak = max(f.hours_grid.values())
    rows = []
    for dow in range(7):
        periods = f.opening.get(dow, [])
        cells = []
        for hour in hours:
            open_now = not f.opening or any(o <= hour < c for o, c in periods)
            value = f.hours_grid.get((dow, hour), 0)
            if not open_now and not value:
                cells.append(-1)
            else:
                cells.append(0 if value == 0 else max(1, ceil(4 * value / peak)))
        rows.append({"label": DAY_SHORT[lang][dow], "cells": cells})
    ranked = sorted(f.hours_grid.items(), key=lambda kv: (-kv[1], kv[0]))[:3]

    def words(dow: int, hour: int) -> dict:
        return {"day": DAY_PLURAL[lang][dow], "range": f"{hour:02d}:00–{(hour + 1) % 24:02d}:00"}

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
    history = any(prev > 0 for _, _, prev in source)
    before = [name for name, _, prev in sorted(source, key=lambda r: (-r[2], r[0])) if prev > 0]
    peak = current[0][1]
    rows = []
    for rank, (name, cur, prev) in enumerate(current):
        if not history:
            change = None  # nothing to compare with yet
        elif prev == 0 or name not in before:
            change = {"dir": None, "text": T(lang, "New", "جديد"), "said": None}
        else:
            moved = before.index(name) - rank
            change = (
                {"dir": "up", "text": f"▲ {moved}", "said": T(lang, f"up {moved}", f"صعد {moved}")}
                if moved > 0 else
                {"dir": "down", "text": f"▼ {-moved}",
                 "said": T(lang, f"down {-moved}", f"نزل {-moved}")}
                if moved < 0 else {"dir": "level", "text": "—", "said": T(lang, "same", "كما هو")}
            )
        rows.append({
            "name": f.names_ar.get(name, name) if lang == "ar" else name,
            "value": cur, "value_text": f"{cur:,}", "share": round(cur / peak, 3),
            "change": change,
        })
    return {
        "title": title,
        "change_label": (T(lang, "Rank vs previous 28 days", "الترتيب مقابل الـ28 يوماً السابقة")
                         if history else None),
        "rows": rows,
    }


# ── money owed ────────────────────────────────────────────


def _owed(f: Facts, lang: str) -> dict | None:
    if "ledger" not in f.modules or not f.money:
        return None
    labels = {
        "d0_30": T(lang, "0–30 days", "0–30 يوماً"),
        "d31_60": T(lang, "31–60", "31–60"),
        "d61_90": T(lang, "61–90", "61–90"),
        "d90_plus": T(lang, "Over 90 days", "أكثر من 90 يوماً"),
    }
    total = f.owed
    segments = [
        {"key": key, "label": labels[key], "amount_text": money(f.buckets.get(key, 0), lang),
         "share": round(f.buckets.get(key, 0) / total, 3) if total else 0}
        for key in ("d0_30", "d31_60", "d61_90", "d90_plus")
    ]
    oldest = max(f.accounts, key=lambda a: a.oldest_days, default=None)
    delta = f.owed - f.owed_last
    if delta > 0:
        change = rich(T(lang, "{v} more than a week ago", "أكثر بـ{v} من قبل أسبوع"),
                      v=B(money(delta, lang)))
    elif delta < 0:
        change = rich(T(lang, "{v} less than a week ago", "أقل بـ{v} من قبل أسبوع"),
                      v=B(money(-delta, lang)))
    else:
        change = rich(T(lang, "The same as a week ago", "كما كان قبل أسبوع"))
    return {
        "title": T(lang, "Owed to you", "المستحق لك"),
        "total": _money_value(total, lang),
        "total_text": money(total, lang),
        "customers": count(f.owing, people_noun(f.business_type), lang),
        "change": change,
        "segments": segments,
        "oldest": rich(
            T(lang, "Oldest: {name}, {days}, {v}.", "الأقدم: {name}، منذ {days}، {v}."),
            name=B(oldest.name), days=count(oldest.oldest_days, DAYS, lang),
            v=B(money(oldest.balance, lang)),
        ) if oldest else None,
        "empty": T(lang, "Nobody owes you anything.", "لا أحد عليه مستحقات لك."),
    }


# ── team ──────────────────────────────────────────────────


def _team(f: Facts, lang: str) -> dict | None:
    if not f.team:
        return None
    rows = []
    for p in f.team["people"]:
        answer = minutes(p["median_reply_seconds"], lang)
        if lang == "ar":
            line = (f"{count(p['replies'], REPLIES, lang)} · أول رد {answer} · "
                    f"{p['open']} مفتوحة · {p['waiting']} بانتظار الرد")
        else:
            line = (f"{count(p['replies'], REPLIES, lang)} · first answer {answer} · "
                    f"{p['open']} open · {p['waiting']} waiting")
        rows.append({"name": p["name"], "replies": p["replies"], "first_answer": answer,
                     "open": p["open"], "waiting": p["waiting"], "line": line})
    nobody = f.team["unassigned"]["waiting"]
    who = people_noun(f.business_type)
    return {
        "rows": rows,
        "unassigned": rich(T(lang, "{n} waiting with nobody on them",
                             "{n} بانتظار الرد بلا مسؤول"),
                           n=count(nobody, who, lang)) if nobody else None,
        "everyone": f.team["can_see_everyone"],
    }


REPLIES = (("reply", "replies"), ("رد واحد", "ردّان", "ردود", "رداً"))
NO_SHOWS = (("no-show", "no-shows"), ("غياب واحد", "غيابان", "حالات غياب", "حالة غياب"))


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

