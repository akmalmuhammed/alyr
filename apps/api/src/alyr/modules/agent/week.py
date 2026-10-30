"""The Sunday report as ALYR Agent reads it (ALY-99, `docs/agent-dashboard/12-report-card-log.md`).

The weekly report (D-030) used to be every product's section in plain lines. It is now a
report card: a branded image (`card.py`) with a short text under it. Both come from here,
and both use the dashboard's engine, so the card, the text and the dashboard never
disagree:

* the facts are `facts.gather()` read at the last moment of the week (Saturday 23:59:59.999999
  shop time), so "this week" is the whole reported week and "last week" the week before it,
  the same days on both sides (A2);
* the main product and the week's state come from `view.lead()` and `view.state_of()`;
* a change is a percentage only when both weeks count 20 or more (A3, `view._comparable`);
* the next step is the dashboard's first suggestion, by the same rules (`insights.py`),
  read when the report goes out.

Every sentence is a whole template per language, with `counted()` for the nouns and
`agree()` for the verbs, never Arabic joined from translated fragments. Nothing says or
implies AI (E1).
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import asyncpg

from alyr import catalog
from alyr.channels.base import MAX_CAPTION
from alyr.core.auth import Staff
from alyr.core.words import MESSAGES, ORDERS, REMINDERS, REQUESTS, counted
from alyr.modules.agent import facts as facts_
from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import people_noun, visit_noun
from alyr.modules.agent.words import (
    DAY_SHORT,
    MONTHS,
    agree,
    money,
    noun_after,
    plain,
)

# Right-to-left mark. A WhatsApp line takes its direction from its first strong letter, so
# an Arabic line that opens with "ALYR Chat" would run left to right without it.
RLM = "\u200f"
PRODUCT_OF = {"orders": "chat", "bookings": "bookings", "ledger": "accounts", "inbox": "chat"}
DAY_INITIAL = ("ح", "ن", "ث", "ر", "خ", "ج", "س")  # Sunday to Saturday
NO_SHOWS = (("no-show", "no-shows"), ("غياب واحد", "غيابان", "حالات غياب", "حالة غياب"))


def T(lang: str, en: str, ar: str) -> str:  # noqa: N802 - reads as a template table
    return ar if lang == "ar" else en


@dataclass
class Week:
    """One business's reported week: its facts at the week's end, and the facts the next
    step is read from (the moment the report goes out)."""

    week_start: date
    f: Facts
    later: Facts
    shop: dict

    @property
    def main(self) -> str:
        return view.lead(self.f)

    @property
    def state(self) -> str:
        return view.state_of(self.f, self.main)


async def read(conn: asyncpg.Connection, week_start: date, now: datetime | None = None) -> Week:
    """The week that began on `week_start` (a Sunday), as the owner sees it. `conn` is
    tenant-scoped. `now` is when the report goes out; the next step is read then."""
    tenant = await conn.fetchrow(
        "select id, name, name_ar, timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    from alyr.modules import report  # report imports this module

    _, end = report.bounds(week_start, tenant["timezone"] or "Asia/Qatar")
    # The report is for the owner: every number, money included.
    reader = Staff(None, "", "", "owner", tenant["id"])
    f = await facts_.gather(conn, reader, end - timedelta(microseconds=1))
    now = now or datetime.now(UTC)
    later = await facts_.gather(conn, reader, now) if now > end else f
    shop = {"en": tenant["name"], "ar": tenant["name_ar"] or tenant["name"]}
    return Week(week_start, f, later, shop)


# ── small words ───────────────────────────────────────────


def week_label(week_start: date, lang: str) -> str:
    """"4–10 Oct", "27 Sep – 3 Oct"; «4–10 أكتوبر»."""
    end = week_start + timedelta(days=6)
    months = MONTHS[lang]
    if week_start.month == end.month:
        return f"{week_start.day}–{end.day} {months[end.month - 1]}"
    return f"{week_start.day} {months[week_start.month - 1]} – {end.day} {months[end.month - 1]}"


def figure(dirhams: int) -> str:
    """An amount without its unit, "8,520" (the unit is drawn on its own)."""
    whole, part = divmod(abs(dirhams), 100)
    return ("-" if dirhams < 0 else "") + f"{whole:,}" + (f".{part:02d}" if part else "")


def _unit(f: Facts) -> tuple:
    """What the main measure counts: orders, visits, jobs, appointments or customers."""
    main = view.lead(f)
    return {"orders": ORDERS, "bookings": visit_noun(f.business_type)}.get(
        main, people_noun(f.business_type))


def _top_item(f: Facts, lang: str) -> tuple[str, int] | None:
    """The most ordered item of the week (`risers` holds both weeks, item by item)."""
    sold = [(name, cur) for name, cur, _ in f.risers if cur > 0]
    if not sold:
        return None
    name, quantity = max(sold, key=lambda r: (r[1], r[0]))
    return (f.names_ar.get(name, name) if lang == "ar" else name), quantity


def _over_60(f: Facts) -> int:
    return f.buckets.get("d61_90", 0) + f.buckets.get("d90_plus", 0)


# ── the hero number ───────────────────────────────────────


def hero(w: Week, lang: str) -> dict:
    """The one number the card leads with: the measure the week's bars draw, so the number
    and the bars always agree. Its change follows the dashboard's rules."""
    f, main = w.f, w.main
    if main == "orders":
        key, cur, last, base = "sales", f.sales, f.sales_last, (f.orders, f.orders_last)
        label = T(lang, "Sales", "المبيعات")
    elif main == "bookings":
        noun = visit_noun(f.business_type)[0][1]
        key, cur, last, base = "visits", f.visits, f.visits_last, (f.visits, f.visits_last)
        label = {
            "visits": T(lang, "Visits", "الزيارات"),
            "appointments": T(lang, "Appointments", "المواعيد"),
            "jobs": T(lang, "Jobs", "المهام"),
        }[noun]
    elif main == "ledger":
        # Collected has no count behind it, so it never shows a percentage (as on the
        # dashboard).
        key, cur, last, base = "collected", f.collected, f.collected_last, (0, 0)
        label = T(lang, "Collected", "المحصَّل")
    else:
        key, cur, last, base = "wrote", f.wrote, f.wrote_last, (f.wrote, f.wrote_last)
        label = T(lang, "Wrote to you", "راسلوك")
    is_money = key in ("sales", "collected")
    shown = figure(cur) if is_money else f"{cur:,}"
    before = (money(last, lang) if is_money else f"{last:,}")

    state = w.state
    if state == "first_week":
        change = {"dir": None, "text": T(lang, "First week on ALYR", "أسبوعك الأول مع ALYR")}
    elif state != "quiet" and view._comparable(*base) and last:
        pct = view._pct(cur, last)
        if pct > 0:
            change = {"dir": "up", "text": T(lang, f"up {pct}% on the week before",
                                             f"{pct}% عن الأسبوع السابق")}
        elif pct < 0:
            change = {"dir": "down", "text": T(lang, f"down {-pct}% on the week before",
                                               f"{-pct}% عن الأسبوع السابق")}
        else:
            change = {"dir": "level", "text": T(lang, "level with the week before",
                                                "كما في الأسبوع السابق")}
    else:
        change = {"dir": None, "text": T(lang, f"The week before: {before}",
                                         f"الأسبوع السابق: {before}")}
    return {
        "key": key, "label": label, "value": shown,
        "unit": T(lang, "QAR", "ر.ق") if is_money else None,
        "change": change,
    }


# ── the seven days ────────────────────────────────────────


def days(w: Week, lang: str) -> list[dict]:
    """Sunday to Saturday, each against the same day the week before (A9: last week as a
    ghost). The busiest day is the one signal. A day the business is closed says so."""
    chart = view._week(w.f, w.main, lang)
    if chart is None:
        return []
    out = []
    for i, day in enumerate(chart["days"]):
        state = {"today": "past"}.get(day["state"], day["state"])
        out.append({
            # In Arabic the day's initial, as Arabic calendars head their weeks: the
            # names do not fit seven columns at a size a phone can read.
            "label": DAY_INITIAL[i] if lang == "ar" else DAY_SHORT[lang][i],
            "state": state,
            "value": day["value"] if state == "past" else None,
            "last": day["last"],
            "text": (figure(day["value"]) if chart["format"] == "money" else
                     f"{day['value']:,}") if state == "past" and day["value"] else None,
        })
    best = max((d for d in out if d["value"]), key=lambda d: d["value"], default=None)
    for d in out:
        d["signal"] = d is best
    return out


# ── the key facts ─────────────────────────────────────────


def _facts_by_module(w: Week, lang: str) -> dict[str, list[dict]]:
    f = w.f
    who = people_noun(f.business_type)
    found: dict[str, list[dict]] = {}
    if "orders" in f.modules:
        rows = []
        top = _top_item(f, lang)
        if top:
            name, quantity = top
            rows.append({"key": "top_item", "label": T(lang, "Most ordered", "الأكثر طلباً"),
                         "value": name,
                         "note": T(lang, f"{quantity:,} ordered", f"الكمية: {quantity:,}")})
        rows.append({"key": "came_back", "label": T(lang, "Came back", "عادوا للطلب"),
                     "value": f"{f.came_back:,}",
                     "note": T(lang, "ordered again", agree(
                         f.came_back, "طلب مرة أخرى", "طلبا مرة أخرى", "طلبوا مرة أخرى"))})
        if w.main != "orders":
            rows.insert(0, {"key": "orders", "label": T(lang, "Orders", "الطلبات"),
                            "value": f"{f.orders:,}", "note": money(f.sales, lang)})
        found["orders"] = rows
    if "bookings" in f.modules:
        noun = visit_noun(f.business_type)
        booked = f.visits + f.no_shows_week
        rows = [{
            "key": "no_shows", "label": T(lang, "No-shows", "الغياب"),
            "value": f"{f.no_shows_week:,}",
            "note": T(lang, f"of {booked:,} due", f"من أصل {booked:,}"),
        }, {
            "key": "booked_ahead", "label": T(lang, "Booked ahead", "المحجوز القادم"),
            "value": f"{f.booked_ahead:,}",
            "note": T(lang, "next 7 days", "خلال 7 أيام"),
        }]
        if w.main != "bookings":
            label = {"visits": T(lang, "Visits", "الزيارات"),
                     "appointments": T(lang, "Appointments", "المواعيد"),
                     "jobs": T(lang, "Jobs", "المهام")}[noun[0][1]]
            rows.insert(0, {"key": "visits", "label": label, "value": f"{f.visits:,}",
                            "note": T(lang, f"{counted(f.no_shows_week, NO_SHOWS, lang)}",
                                      f"الغياب: {f.no_shows_week}")})
        found["bookings"] = rows
    if "ledger" in f.modules:
        rows = [{
            "key": "owed", "label": T(lang, "Owed to you", "المستحق لك"),
            "value": money(f.owed, lang),
            "note": T(lang, f"by {counted(f.owing, who, lang)}",
                      f"{counted(f.owing, who, lang)} " + agree(f.owing, "مدين", "مدينان",
                                                                 "مدينون")),
        }]
        if w.main != "ledger":
            rows.append({"key": "collected", "label": T(lang, "Collected", "المحصَّل"),
                         "value": money(f.collected, lang),
                         "note": T(lang, f"before: {money(f.collected_last, lang)}",
                                   f"قبله: {money(f.collected_last, lang)}")})
        else:
            rows.append({"key": "over_60", "label": T(lang, "Over 60 days", "أكثر من 60 يوماً"),
                         "value": money(_over_60(f), lang),
                         "note": T(lang, "of what is owed", "مما هو مستحق")})
        found["ledger"] = rows
    if "inbox" in f.modules:
        rows = [{"key": "new_customers", "label": T(lang, "New customers", "عملاء جدد"),
                 "value": f"{f.new_customers:,}",
                 "note": T(lang, "first message", "أول رسالة")}]
        if w.main != "inbox":
            rows.insert(0, {"key": "wrote", "label": T(lang, "Wrote to you", "راسلوك"),
                            "value": f"{f.wrote:,}",
                            "note": T(lang, noun_after(f.wrote, who, lang),
                                      noun_after(f.wrote, who, lang))})
        found["inbox"] = rows
    return found


def key_facts(w: Week, lang: str, limit: int = 3) -> list[dict]:
    """Two or three facts beside the hero, chosen by the products switched on and the type
    of business: the main product's first, then what is owed (if credit accounts are on),
    then each other product's first, then the rest."""
    found = _facts_by_module(w, lang)
    main = w.main
    order: list[dict] = []
    if found.get(main):
        order.append(found[main][0])
    if "ledger" in found and main != "ledger":
        order.append(found["ledger"][0])
    for module in ("orders", "bookings", "ledger"):
        if module != main and module in found:
            order.append(found[module][0])
    for module in (main, "orders", "bookings", "ledger", "inbox"):
        order += found.get(module, [])
    picked: list[dict] = []
    for fact in order:
        if fact["key"] not in {p["key"] for p in picked}:
            picked.append(fact)
    return picked[:limit]


# ── the summary sentence ──────────────────────────────────


def summary(w: Week, lang: str) -> str:
    """One statement of the week that agrees with the card and the dashboard: the main
    measure in its own words, then the comparison with the week before (A1, A2, A3)."""
    f, main, state = w.f, w.main, w.state
    unit = _unit(f)
    who = people_noun(f.business_type)
    cur, last = view._measure(f, main)
    if state == "empty":
        return T(lang, "Nothing came in last week.", "لم يصلك شيء الأسبوع الماضي.")
    if state == "first_week":
        start = f.comparisons_from
        return T(
            lang,
            f"Your first week on ALYR: {counted(cur, unit, lang)}. Comparisons start "
            f"{start.day} {MONTHS['en'][start.month - 1]}.",
            f"أسبوعك الأول مع ALYR: {counted(cur, unit, lang)}. تبدأ المقارنات يوم "
            f"{start.day} {MONTHS['ar'][start.month - 1]}.",
        )
    if state == "quiet":
        return T(lang, f"Last week: {counted(cur, unit, lang)}; the week before: "
                       f"{counted(last, unit, lang)}.",
                 f"الأسبوع الماضي: {counted(cur, unit, lang)}، والأسبوع الذي قبله: "
                 f"{counted(last, unit, lang)}.")
    if main == "orders":
        first = T(lang, f"Last week: {counted(f.orders, ORDERS, lang)}, {money(f.sales, lang)}.",
                  f"الأسبوع الماضي: {counted(f.orders, ORDERS, lang)}، {money(f.sales, lang)}.")
        measures = [(T(lang, "Orders", "الطلبات"), f.orders, f.orders_last),
                    (T(lang, "sales", "المبيعات"), f.sales, f.sales_last)]
    elif main == "bookings":
        noun = visit_noun(f.business_type)
        first = T(lang,
                  f"Last week: {counted(f.visits, noun, lang)}, "
                  f"{counted(f.no_shows_week, NO_SHOWS, lang)}.",
                  f"الأسبوع الماضي: {counted(f.visits, noun, lang)}، والغياب {f.no_shows_week}.")
        label = {"visits": T(lang, "Visits", "الزيارات"),
                 "appointments": T(lang, "Appointments", "المواعيد"),
                 "jobs": T(lang, "Jobs", "المهام")}[noun[0][1]]
        measures = [(label, f.visits, f.visits_last)]
    elif main == "ledger":
        return T(lang,
                 f"{money(f.owed, lang)} owed to you by {counted(f.owing, who, lang)}; "
                 f"{money(f.collected, lang)} collected last week.",
                 f"{money(f.owed, lang)} مستحقة لك، و{_unpaid(f.owing, who)}. "
                 f"وحُصّل {money(f.collected, lang)} الأسبوع الماضي.")
    else:
        first = T(lang, f"Last week: {counted(f.wrote, who, lang)} wrote to you.",
                  f"الأسبوع الماضي: راسلك {counted(f.wrote, who, lang)}.")
        measures = [(T(lang, "Customers who wrote", "العملاء الذين راسلوك"), f.wrote,
                     f.wrote_last)]
    if view._comparable(cur, last):
        parts = []
        for i, (label, now_, before) in enumerate(measures):
            p = view._pct(now_, before)
            if lang == "ar":
                text = (f"{label} أكثر بـ{p}%" if p > 0 else f"{label} أقل بـ{-p}%" if p < 0
                        else f"{label} بلا تغيير")
                parts.append(text if i == 0 else f"و{text}")
            else:
                parts.append(f"{label} up {p}%" if p > 0 else f"{label} down {-p}%" if p < 0
                             else f"{label} level")
        compare = (("، ".join(parts) + " عن الأسبوع الذي قبله.") if lang == "ar"
                   else (", ".join(parts) + " on the week before."))
    else:
        compare = T(lang, f"The week before: {counted(last, unit, lang)}.",
                    f"الأسبوع الذي قبله: {counted(last, unit, lang)}.")
    return f"{first} {compare}"


# ── one line per product ──────────────────────────────────


def products(w: Week) -> list[str]:
    """The products the business uses, its main product first (ALYR Agent is the report
    itself, so it has no line)."""
    using = [p for p in catalog.products_for(w.f.modules) if p not in ("agent",)]
    lead = PRODUCT_OF[w.main]
    return sorted(using, key=lambda p: (p != lead, using.index(p)))


def _line(w: Week, product: str, lang: str) -> list[str]:
    """A product's numbers as clauses: the first is its headline."""
    f = w.f
    who = people_noun(f.business_type)
    if product == "chat":
        if "orders" not in f.modules:
            return [T(lang, f"{counted(f.wrote, who, lang)} wrote to you",
                      f"راسلك {counted(f.wrote, who, lang)}"),
                    T(lang, f"{counted(f.new_customers, who, lang)} new",
                      f"الجدد منهم: {f.new_customers}")]
        if not f.orders:
            return [T(lang, "no orders", "لا طلبات")]
        out = [T(lang, f"{counted(f.orders, ORDERS, lang)}, {money(f.sales, lang)}",
                 f"{counted(f.orders, ORDERS, lang)}، {money(f.sales, lang)}")]
        if f.came_back:
            out.append(T(lang, f"{f.came_back:,} came back",
                         f"{counted(f.came_back, who, lang)} " + agree(
                             f.came_back, "عاد للطلب", "عادا للطلب", "عادوا للطلب")))
        top = _top_item(f, lang)
        if top:
            out.append(T(lang, f"most ordered: {top[0]} ({top[1]:,})",
                         f"الأكثر طلباً: {top[0]} ({top[1]:,})"))
        return out
    if product == "bookings":
        noun = visit_noun(f.business_type)
        out = [T(lang, f"{counted(f.visits, noun, lang)}, "
                       f"{counted(f.no_shows_week, NO_SHOWS, lang)}",
                 f"{counted(f.visits, noun, lang)}، والغياب {f.no_shows_week}"),
               T(lang, f"{f.booked_ahead:,} booked for this week",
                 f"المحجوز لهذا الأسبوع: {f.booked_ahead}")]
        if f.unmarked:
            n = len(f.unmarked)
            out.append(T(lang, f"{n:,} not marked yet",
                         f"{counted(n, noun, lang)} بلا تسجيل حضور"))
        return out
    # Accounts: what came in leads; in a week when nothing did, what is owed leads.
    collected = T(lang, f"{money(f.collected, lang)} collected", f"حُصّل {money(f.collected, lang)}")
    owed = (T(lang, f"{money(f.owed, lang)} owed by {counted(f.owing, who, lang)}",
              f"{money(f.owed, lang)} مستحقة، و{_unpaid(f.owing, who)}") if f.owing
            else T(lang, "nobody owes you anything", "لا أحد عليه مستحقات لك"))
    out = ([collected, owed] if f.collected else
           [owed, T(lang, "nothing collected", "لم يُحصَّل شيء")])
    if _over_60(f):
        out.append(T(lang, f"{money(_over_60(f), lang)} over 60 days",
                     f"منها {money(_over_60(f), lang)} أكثر من 60 يوماً"))
    return out


def _done(w: Week, lang: str) -> str | None:
    """What ALYR did for the business in the week (A8), as one sentence. In Arabic each
    count follows its label, which keeps every noun in its plain form."""
    f = w.f
    rows = [
        (f.sent_for_you, MESSAGES, "", "رسائل أرسلتها نيابة عنك"),
        (f.booking_reminders_sent, REMINDERS, "booking ", "تذكيرات بالمواعيد"),
        (f.review_requests_sent, REQUESTS, "review ", "طلبات تقييم"),
        (f.payment_reminders_sent, REMINDERS, "payment ", "تذكيرات بالدفع"),
    ]
    rows = [r for r in rows if r[0]]
    if not rows:
        return None
    if lang == "ar":
        return "، و".join(f"{label}: {n:,}" for n, _, _, label in rows) + "."
    items = [f"{n:,} {kind}{noun_after(n, noun, lang)}" for n, noun, kind, _ in rows]
    joined = items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]
    return f"ALYR sent {joined} for you."


def _unpaid(n: int, who) -> str:
    """«6 عملاء لم يسددوا بعد»: the verb agrees with how many people, and no preposition
    puts the count in a case `counted()` does not have."""
    return f"{counted(n, who, 'ar')} " + agree(n, "لم يسدد بعد", "لم يسددا بعد",
                                               "لم يسددوا بعد")


# ── the next step ─────────────────────────────────────────


def next_step(w: Week, lang: str) -> dict:
    """The dashboard's first card, by its own rules, read when the report goes out: a
    suggestion with a screen to act on, then a task waiting now, then something worth
    knowing. Each comes with its rule."""
    agent_view = view.render(w.later, lang)
    cards = agent_view["suggestions"]
    needs = [i for i in agent_view["needs"]["items"] if i["key"] != "setup"]
    for card in cards:
        if card["action"]:
            return {"kind": "action", "key": card["key"], "action": card["action"]["label"],
                    "title": plain(card["title"]), "rule": _rule(card["rule"], lang)}
    for item in needs:
        return {"kind": "task", "key": item["key"], "action": None,
                "title": plain(item["words"]), "rule": _rule(item["rule"], lang)}
    for card in cards:
        return {"kind": "info", "key": card["key"], "action": None,
                "title": plain(card["title"]), "status": card["status"],
                "rule": _rule(card["rule"], lang)}
    return {"kind": "none", "key": None, "action": None,
            "title": T(lang, "Nothing needs you this week", "لا شيء ينتظرك هذا الأسبوع"),
            "rule": None}


def _rule(line: str, lang: str) -> str:
    """"RULE · …" as the dashboard's mono line; in a message it reads "Rule · …"."""
    return "Rule" + line[len("RULE"):] if lang == "en" and line.startswith("RULE") else line


def _step_sentence(step: dict, lang: str) -> str:
    if step["kind"] == "action":
        return f"{step['action']}: {step['title']}."
    return f"{step['title']}."


# ── the message ───────────────────────────────────────────


def message(w: Week, lang: str) -> dict:
    """The text under the card, about eight lines, with WhatsApp's *bold* and _italics_;
    and the five values of the `weekly_report_card` template."""
    lang = "ar" if lang == "ar" else "en"
    shop = w.shop[lang]
    when = week_label(w.week_start, lang)
    said = summary(w, lang)
    names = {p.key: p.name.get(lang) for p in catalog.PRODUCTS}
    lines = [
        T(lang, f"*ALYR weekly report* · {shop} · {when}",
          f"*تقرير ALYR الأسبوعي* · {shop} · {when}"),
        said,
        "",
    ]
    compact = []
    for product in products(w):
        clauses = _line(w, product, lang)
        lines.append(f"*{names[product]}* · " + " · ".join(clauses))
        compact.append(f"{names[product]}: {clauses[0]}")
    done = _done(w, lang)
    if done:
        lines.append(T(lang, f"*Done for you* · {done}", f"*أنجزته ALYR* · {done}"))
    step = next_step(w, lang)
    heading = (T(lang, "*Worth knowing*", "*للعلم*") if step["kind"] == "info"
               else T(lang, "*Next step*", "*الخطوة التالية*"))
    lines += ["", f"{heading} · {_step_sentence(step, lang)}"]
    if step["rule"]:
        lines.append(f"_{step['rule']}_")
    # The template's last blank: the step and its rule on one line.
    if step["rule"]:
        rule = step["rule"]
        rule = rule[0].lower() + rule[1:] if lang == "en" else rule
        step_line = f"{_step_sentence(step, lang).rstrip('.')} ({rule})"
    else:
        step_line = _step_sentence(step, lang).rstrip(".")
    if step["kind"] == "info":
        step_line = T(lang, f"nothing to do; worth knowing: {step_line}",
                      f"لا شيء مطلوب؛ للعلم: {step_line}")
    products_line = " · ".join(compact)
    # WhatsApp takes at most 1,024 characters under an image: past that, the done line
    # goes first, then each product keeps only its headline.
    if len("\n".join(lines)) > MAX_CAPTION and done:
        lines = [line for line in lines if not line.startswith(("*Done", "*أنجزته"))]
    if len("\n".join(lines)) > MAX_CAPTION:
        start = 3
        for i, product in enumerate(products(w)):
            lines[start + i] = f"*{names[product]}* · {compact[i].split(': ', 1)[1]}"
    if lang == "ar":
        # Each Arabic line runs right to left, even one that opens with a product's name.
        lines = [f"{RLM}{line}" if line else line for line in lines]
    return {
        "caption": _clip(lines),
        "lines": lines,
        "summary": said,
        "next_step": step,
        # The template's blanks: shop, week, summary, products, next step (one line each).
        "template": [shop, when, said, products_line, step_line],
    }


def _clip(lines: list[str]) -> str:
    text = chr(10).join(lines)
    return text if len(text) <= MAX_CAPTION else text[: MAX_CAPTION - 1] + "…"


def card(w: Week, lang: str) -> dict:
    """What the card image draws (`card.py`), every word already in the reader's
    language."""
    lang = "ar" if lang == "ar" else "en"
    return {
        "lang": lang,
        "dir": "rtl" if lang == "ar" else "ltr",
        "shop": w.shop[lang],
        "week": week_label(w.week_start, lang),
        "eyebrow": T(lang, "Weekly report", "التقرير الأسبوعي"),
        "hero": hero(w, lang),
        "days": days(w, lang),
        "facts": key_facts(w, lang),
        "state": w.state,
    }
