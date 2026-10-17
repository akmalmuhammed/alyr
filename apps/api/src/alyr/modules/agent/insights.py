"""The Agent's rules, one entry each (`01-research.md`, section B).

An insight says when it is true (`find`), how to say so in English and Arabic (`say`),
and where the owner acts on it: a screen that exists (`action`), or, when nothing is
built for it yet, an honest status line (`status`). Its `rule` is shown on the card in
plain words, so anyone can check why it appeared. Nothing here guesses or predicts.

Kinds, in the order the dashboard shows them:
* `task`: work waiting now. Shown under "Needs you now", never dismissed.
* `money`: money owed or unpaid. Hidden from staff who may not see money.
* `knowledge`: worth knowing. Those with an action come before those without.

Arabic is written whole for each count (`count()` for the noun, `agree()` for the verb
and pronoun), never joined from fragments, and every name or figure is kept whole with
`B` so a Latin name does not scramble the line (05-critique P0-5).

To add a rule: write `find` and `say`, and add an `Insight` to `INSIGHTS`.
"""

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import timedelta

from alyr.catalog import Text
from alyr.core.words import (
    APPOINTMENTS,
    CHATS,
    CUSTOMERS,
    DAYS,
    ITEMS,
    JOBS,
    ORDERS,
    PATIENTS,
    TIMES,
    VISITS,
    Noun,
)
from alyr.modules.agent.facts import Facts, Row
from alyr.modules.agent.words import (
    B,
    agree,
    count,
    day_month,
    minutes,
    money,
    noun_after,
    rich,
    when_text,
)

WEEKS: Noun = (("week", "weeks"), ("أسبوع واحد", "أسبوعان", "أسابيع", "أسبوعاً"))
REGULARS: Noun = (
    ("regular", "regulars"),
    ("زبون دائم واحد", "زبونان دائمان", "زبائن دائمين", "زبوناً دائماً"),
)
CANCELLATIONS: Noun = (
    ("late cancellation", "late cancellations"),
    ("إلغاء متأخر واحد", "إلغاءان متأخران", "إلغاءات متأخرة", "إلغاءً متأخراً"),
)
REASONS = {
    "price": Text("price", "السعر"),
    "not_available": Text("not available", "غير متوفر"),
    "no_reply": Text("stopped replying", "توقف عن الرد"),
    "went_elsewhere": Text("went elsewhere", "ذهب إلى غيرنا"),
    "other": Text("another reason", "سبب آخر"),
}
NO_CONSENT = Text(
    "Information only. Writing to them needs their marketing consent, which ALYR does not "
    "collect yet.",
    "للعلم فقط. مراسلتهم تحتاج موافقتهم التسويقية، وALYR لا تجمعها بعد.",
)
INFO_ONLY = Text("Information only.", "للعلم فقط.")


def visit_noun(business_type: str) -> Noun:
    """What a booking is called in this trade (A12)."""
    if business_type == "clinic":
        return APPOINTMENTS
    if business_type == "home":
        return JOBS
    return VISITS


def people_noun(business_type: str) -> Noun:
    """Who the business serves: a clinic's are patients («مراجعون»)."""
    return PATIENTS if business_type == "clinic" else CUSTOMERS


@dataclass(frozen=True)
class Action:
    label: Text
    href: str


@dataclass
class Finding:
    rows: list[Row] = field(default_factory=list)
    noun: Noun = CUSTOMERS
    numbers: dict = field(default_factory=dict)
    # How many the rule counted, when that is not the number of rows (weeks, replies).
    total: int | None = None

    @property
    def n(self) -> int:
        return self.total if self.total is not None else len(self.rows)

    def fingerprint(self, key: str) -> str:
        """Changes when the counted records or their numbers change, so a card set
        aside with "Not now" comes back when there is something new to see."""
        data = {
            "key": key, "ids": sorted(r.id for r in self.rows),
            "numbers": {k: str(v) for k, v in sorted(self.numbers.items())},
        }
        return hashlib.sha1(json.dumps(data).encode()).hexdigest()[:16]


Say = Callable[[Finding, Facts, str], tuple[list, list | None]]


@dataclass(frozen=True)
class Insight:
    key: str
    number: int  # its row in the research catalogue
    kind: str  # task | money | knowledge
    module: str
    rule: Text
    find: Callable[[Facts], Finding | None]
    say: Say
    action: Action | None = None
    status: Text | None = None
    money: bool = False


def _first(rows: list[Row]) -> Row:
    return rows[0]


def _who(f: Facts) -> Noun:
    return people_noun(f.business_type)


# ── tasks: Needs you now ─────────────────────────────────


def _find_waiting(f: Facts) -> Finding | None:
    if not f.waiting:
        return None
    nobody = sum(1 for r in f.waiting if r.detail.get("nobody"))
    longest = max(r.detail.get("minutes", 0) for r in f.waiting)
    return Finding(f.waiting, _who(f), {"nobody": nobody, "longest": longest})


def _say_waiting(x: Finding, f: Facts, lang: str):
    noun = noun_after(x.n, x.noun, lang)
    longest = B(minutes(x.numbers["longest"] * 60, lang))
    nobody = x.numbers["nobody"]
    if lang == "ar":
        words = rich(f"{noun} بانتظار الرد")
        detail = (
            rich("{k} بلا مسؤول · أطول انتظار {t}", k=B(str(nobody)), t=longest) if nobody
            else rich("أطول انتظار {t}", t=longest)
        )
    else:
        words = rich(f"{noun} waiting for an answer")
        detail = (
            rich("{k} with nobody on them · longest {t}", k=B(str(nobody)), t=longest)
            if nobody else rich("longest {t}", t=longest)
        )
    return words, detail


def _find_unconfirmed(f: Facts) -> Finding | None:
    if not f.unconfirmed:
        return None
    oldest = max(r.detail.get("minutes", 0) for r in f.unconfirmed)
    return Finding(f.unconfirmed, ORDERS, {"oldest": oldest})


def _say_unconfirmed(x: Finding, f: Facts, lang: str):
    noun = noun_after(x.n, ORDERS, lang)
    oldest = B(minutes(x.numbers["oldest"] * 60, lang))
    if lang == "ar":
        return rich(f"{noun} بحاجة إلى تأكيد"), rich("أقدمها منذ {t}", t=oldest)
    verb = "needs" if x.n == 1 else "need"
    return rich(f"{noun} {verb} confirming"), rich("the oldest for {t}", t=oldest)


def _find_unmarked(f: Facts) -> Finding | None:
    if not f.unmarked:
        return None
    return Finding(f.unmarked, visit_noun(f.business_type))


def _say_unmarked(x: Finding, f: Facts, lang: str):
    noun = noun_after(x.n, x.noun, lang)
    if lang == "ar":
        return rich(f"{noun} بلا تسجيل حضور"), rich("أرقام الغياب ناقصة حتى تُسجَّل.")
    which = "it is" if x.n == 1 else "they are"
    return rich(f"{noun} not marked"), rich(f"Until {which} marked, the no-show figures are short.")


# ── money ─────────────────────────────────────────────────


def _find_overdue(f: Facts) -> Finding | None:
    week_ago = f.now - timedelta(days=7)
    rows = [
        Row(a.id, a.name, {"days": a.oldest_days, "balance": a.balance,
                           "overdue": a.balance - a.buckets.get("d0_30", 0)})
        for a in sorted(f.accounts, key=lambda a: -a.oldest_days)
        if a.balance > 0 and a.oldest_days >= 30 and not a.promised
        and (a.last_reminded_at is None or a.last_reminded_at < week_ago)
    ]
    if not rows:
        return None
    return Finding(rows, _who(f), {"amount": sum(r.detail["overdue"] for r in rows)})


def _say_overdue(x: Finding, f: Facts, lang: str):
    amount = B(money(x.numbers["amount"], lang))
    first = _first(x.rows)
    name, days = B(first.label), count(first.detail["days"], DAYS, lang)
    if lang == "ar":
        title = rich("{a} مستحقة منذ 30 يوماً أو أكثر، دون تذكير منذ 7 أيام", a=amount)
        if x.n == 1:
            return title, rich("يدين بها {name}، منذ {d}.", name=name, d=days)
        return title, rich("يدين بها {who}. أقدمهم {name}، منذ {d}.",
                           who=count(x.n, x.noun, lang), name=name, d=days)
    title = rich("{a} owed 30+ days, not reminded in 7 days", a=amount)
    if x.n == 1:
        return title, rich("Owed by {name}, {d}.", name=name, d=days)
    return title, rich("Owed by {who}. The oldest is {name}, {d}.",
                       who=count(x.n, x.noun, lang), name=name, d=days)


def _find_promise_passed(f: Facts) -> Finding | None:
    return Finding(f.promises_passed, _who(f)) if f.promises_passed else None


def _say_promise_passed(x: Finding, f: Facts, lang: str):
    first = _first(x.rows)
    name = B(first.label)
    when = day_month(first.detail["promised_until"], lang)
    who = count(x.n, x.noun, lang)
    if lang == "ar":
        verb = agree(x.n, "لم يسدد في الموعد الذي وعد به", "لم يسددا في الموعد الذي وعدا به",
                     "لم يسددوا في الموعد الذي وعدوا به")
        return rich("{who} " + verb, who=who), rich("وعد {name} بالسداد قبل {d}.", name=name,
                                                    d=when)
    return (rich("{who} did not pay by the date they promised", who=who),
            rich("{name} promised to pay by {d}.", name=name, d=when))


def _find_open_links(f: Facts) -> Finding | None:
    if not f.open_links:
        return None
    return Finding(f.open_links, ORDERS, {"amount": sum(r.detail["amount"] for r in f.open_links)})


def _say_open_links(x: Finding, f: Facts, lang: str):
    amount = B(money(x.numbers["amount"], lang))
    if lang == "ar":
        return (
            rich("{n} برابط دفع مفتوح منذ أكثر من يوم", n=count(x.n, ORDERS, lang)),
            rich("{a} بانتظار الدفع. إعادة إرسال الرابط غير متاحة بعد.", a=amount),
        )
    return (
        rich("{n} with a payment link open for over a day", n=count(x.n, ORDERS, lang)),
        rich("{a} still to pay. Sending a link again is not built yet.", a=amount),
    )


def _find_over_limit(f: Facts) -> Finding | None:
    rows = [Row(a.id, a.name, {"balance": a.balance}) for a in f.accounts if a.over_limit]
    return Finding(rows, _who(f)) if rows else None


def _say_over_limit(x: Finding, f: Facts, lang: str):
    first = _first(x.rows)
    name, amount = B(first.label), B(money(first.detail["balance"], lang))
    who = count(x.n, x.noun, lang)
    if lang == "ar":
        verb = agree(x.n, "تجاوز حد الائتمان", "تجاوزا حد الائتمان", "تجاوزوا حد الائتمان")
        return rich("{who} " + verb, who=who), rich("على {name} {a}.", name=name, a=amount)
    return (rich("{who} over their credit limit", who=who),
            rich("{name} owes {a}.", name=name, a=amount))


def _find_owed_growing(f: Facts) -> Finding | None:
    weeks = f.owed_weeks
    if len(weeks) < 3 or not all(sales > payments for sales, payments in weeks):
        return None
    gap = sum(sales - payments for sales, payments in weeks)
    return Finding([], WEEKS, {"gap": gap}, total=len(weeks))


def _say_owed_growing(x: Finding, f: Facts, lang: str):
    gap = B(money(x.numbers["gap"], lang))
    if lang == "ar":
        return (
            rich("زاد المستحق لك ثلاثة أسابيع متتالية"),
            rich("الآجل الجديد زاد عن المحصَّل بـ{g} في تلك الأسابيع.", g=gap),
        )
    return (
        rich("What you are owed grew three weeks running"),
        rich("{g} more given on credit than collected in those weeks.", g=gap),
    )


# ── knowledge with a screen to act on ─────────────────────


def _find_ready(f: Facts) -> Finding | None:
    return Finding(f.ready_waiting, ORDERS) if f.ready_waiting else None


def _say_ready(x: Finding, f: Facts, lang: str):
    first = _first(x.rows)
    number, name = B(f"#{first.detail['number']}"), B(first.label)
    hours = first.detail["hours"]
    if lang == "ar":
        return (
            rich("{n} " + agree(x.n, "جاهز", "جاهزان", "جاهزة") + " منذ أكثر من ساعتين",
                 n=count(x.n, ORDERS, lang)),
            rich("الطلب {no} للعميل {name} ينتظر منذ {h}.", no=number, name=name,
                 h=B(f"{hours} س")),
        )
    return (
        rich("{n} ready for over 2 hours", n=count(x.n, ORDERS, lang)),
        rich("{no} for {name} has waited longest, {h}.", no=number, name=name,
             h=B(f"{hours} h")),
    )


def _find_repeat_no_show(f: Facts) -> Finding | None:
    return Finding(f.repeat_no_shows, _who(f)) if f.repeat_no_shows else None


def _say_repeat_no_show(x: Finding, f: Facts, lang: str):
    first = _first(x.rows)
    name = B(first.label)
    when = when_text(first.detail["next"].astimezone(f.zone), f.local, lang)
    who = count(x.n, x.noun, lang)
    if lang == "ar":
        verb = agree(x.n, "تغيّب مرتين ولديه حجز جديد", "تغيّبا مرتين ولديهما حجز جديد",
                     "تغيّبوا مرتين ولديهم حجز جديد")
        return rich("{who} " + verb, who=who), rich("موعد {name} {w}.", name=name, w=when)
    return (rich("{who} who missed twice {verb} booked again", who=who,
                 verb="is" if x.n == 1 else "are"),
            rich("{name} is booked {w}.", name=name, w=when))


def _find_slow_answers(f: Facts) -> Finding | None:
    now, before = f.first_answer, f.first_answer_before
    if now is None or before is None or now <= 30 * 60 or now <= before:
        return None
    return Finding([], CUSTOMERS, {"now": now, "before": before}, total=0)


def _say_slow_answers(x: Finding, f: Facts, lang: str):
    now, before = B(minutes(x.numbers["now"], lang)), B(minutes(x.numbers["before"], lang))
    if lang == "ar":
        return (
            rich("تباطأ أول رد إلى {t}", t=now),
            rich("في الأيام السبعة التي قبلها: {t}. وقت كل شخص في شاشة الفريق.", t=before),
        )
    return (
        rich("First answers slowed to {t}", t=now),
        rich("The 7 days before: {t}. Each person's time is on the Team screen.", t=before),
    )


def _find_booked_value(f: Facts) -> Finding | None:
    if not f.priced or f.booked_value_ahead <= 0:
        return None
    return Finding([], visit_noun(f.business_type), {"value": f.booked_value_ahead},
                   total=f.booked_ahead)


def _say_booked_value(x: Finding, f: Facts, lang: str):
    value = B(money(x.numbers["value"], lang))
    if lang == "ar":
        return (
            rich("{v} محجوزة للأيام السبعة القادمة", v=value),
            rich("{n} بأسعار الخدمات الحالية.", n=count(x.n, x.noun, lang)),
        )
    return (
        rich("{v} booked for the next 7 days", v=value),
        rich("{n} at today's service prices.", n=count(x.n, x.noun, lang)),
    )


# ── knowledge, for information ────────────────────────────


def no_show_rate(f: Facts) -> tuple[int, int] | None:
    """No-shows as a whole percentage of visits due in 30 days, rounded once, so the
    number shown and the rule's threshold always agree (05-critique P2-5)."""
    base = f.completed_30 + f.no_shows_30
    if base == 0:
        return None
    return round(100 * f.no_shows_30 / base), base


def _find_no_show_rate(f: Facts) -> Finding | None:
    rate = no_show_rate(f)
    if rate is None or f.no_shows_30 < 3 or rate[0] < 10:
        return None
    return Finding([], visit_noun(f.business_type), {"rate": rate[0], "base": rate[1]},
                   total=f.no_shows_30)


def _say_no_show_rate(x: Finding, f: Facts, lang: str):
    rate = B(f"{x.numbers['rate']}%")
    noun = visit_noun(f.business_type)
    if lang == "ar":
        line = (
            "{n} من {b}. التذكير يصل قبل كل موعد بساعتين." if f.booking_reminders
            else "{n} من {b}، والتذكيرات متوقفة. تشغيلها من صفحة الإعداد."
        )
        plural = {"visits": "الزيارات", "appointments": "المواعيد", "jobs": "المهام"}[noun[0][1]]
        return (rich("{r} من " + plural + " انتهت بالغياب خلال 30 يوماً", r=rate),
                rich(line, n=B(str(x.n)), b=B(str(x.numbers["base"]))))
    line = (
        "{n} of {b}. A reminder goes 2 hours before each visit." if f.booking_reminders
        else "{n} of {b}, and reminders are off. They are switched on in setup."
    )
    return (rich("{r} of {noun} were no-shows in 30 days", r=rate, noun=noun[0][1]),
            rich(line, n=B(str(x.n)), b=B(str(x.numbers["base"]))))


def _find_quiet_regulars(f: Facts) -> Finding | None:
    return Finding(f.quiet_regulars, REGULARS) if f.quiet_regulars else None


def _say_quiet_regulars(x: Finding, f: Facts, lang: str):
    first = _first(x.rows)
    name = B(first.label)
    times = count(first.detail["times"], TIMES, lang)
    days = count(first.detail["days"], DAYS, lang)
    who = count(x.n, REGULARS, lang)
    if lang == "ar":
        verb = agree(x.n, "غاب أكثر من 30 يوماً", "غابا أكثر من 30 يوماً",
                     "غابوا أكثر من 30 يوماً")
        return (rich("{who} " + verb, who=who),
                rich("{name}: {t} من قبل، آخرها قبل {d}.", name=name, t=times, d=days))
    return (rich("{who} quiet for over 30 days", who=who),
            rich("{name}: {t} before, the last {d} ago.", name=name, t=times, d=days))


def _find_due_back(f: Facts) -> Finding | None:
    return Finding(f.due_back, _who(f)) if f.due_back else None


def _say_due_back(x: Finding, f: Facts, lang: str):
    first = _first(x.rows)
    name = B(first.label)
    usual = count(first.detail["usual"], DAYS, lang)
    days = count(first.detail["days"], DAYS, lang)
    who = count(x.n, x.noun, lang)
    if lang == "ar":
        verb = agree(x.n, "حان موعد عودته", "حان موعد عودتهما", "حان موعد عودتهم")
        return (rich("{who} " + verb, who=who),
                rich("يأتي {name} عادة كل {u}، ومضى {d}.", name=name, u=usual, d=days))
    return (rich("{who} due back", who=who),
            rich("{name} usually comes every {u}; it has been {d}.", name=name, u=usual,
                 d=days))


def _find_thin_days(f: Facts) -> Finding | None:
    if len(f.thin_days) < 2:
        return None
    quietest = min(f.thin_days, key=lambda d: d[1])
    return Finding([], DAYS, {"day": quietest[0], "share": round(100 * quietest[1])},
                   total=len(f.thin_days))


def _say_thin_days(x: Finding, f: Facts, lang: str):
    from alyr.modules.agent.words import DAY_LONG, sunday_index

    day = DAY_LONG[lang][sunday_index(x.numbers["day"])]
    share = B(f"{x.numbers['share']}%")
    if lang == "ar":
        return (
            rich("{n} من الأيام السبعة القادمة محجوزة بأقل من 30%", n=count(x.n, DAYS, lang)),
            rich("أهدأها {day}، محجوز {s}.", day=day, s=share),
        )
    return (
        rich("{n} in the next 7 are under 30% booked", n=count(x.n, DAYS, lang)),
        rich("The quietest is {day}, {s} booked.", day=day, s=share),
    )


def _find_late_cancellations(f: Facts) -> Finding | None:
    if f.late_cancellations < 3:
        return None
    return Finding([], CANCELLATIONS, total=f.late_cancellations)


def _say_late_cancellations(x: Finding, f: Facts, lang: str):
    if lang == "ar":
        return (
            rich("{n} خلال 30 يوماً", n=count(x.n, CANCELLATIONS, lang)),
            rich("أُلغيت قبل موعدها بأقل من 24 ساعة."),
        )
    return (
        rich("{n} in 30 days", n=count(x.n, CANCELLATIONS, lang)),
        rich("Cancelled less than 24 hours before the start."),
    )


def _find_lost_reason(f: Facts) -> Finding | None:
    if not f.lost_reasons:
        return None
    reason, n = max(f.lost_reasons.items(), key=lambda kv: (kv[1], kv[0]))
    if n < 3:
        return None
    return Finding([], CHATS, {"reason": reason}, total=n)


def _say_lost_reason(x: Finding, f: Facts, lang: str):
    reason = REASONS.get(x.numbers["reason"], REASONS["other"]).get(lang)
    if lang == "ar":
        verb = agree(x.n, "خُسرت", "خُسرتا", "خُسرت")
        return (
            rich("{n} " + verb + " بسبب «{r}» خلال 30 يوماً", n=count(x.n, CHATS, lang),
                 r=reason),
            rich("يُسجَّل السبب عند إغلاق المحادثة كخسارة."),
        )
    return (
        rich("{n} lost to “{r}” in 30 days", n=count(x.n, CHATS, lang), r=reason),
        rich("The reason is recorded when a chat is closed as lost."),
    )


def _find_unused(f: Facts) -> Finding | None:
    if f.orders_30d < 30 or not f.unused_products:
        return None
    return Finding(f.unused_products, ITEMS, {"orders": f.orders_30d})


def _say_unused(x: Finding, f: Facts, lang: str):
    if lang == "ar":
        names = "، ".join(r.detail.get("name_ar") or r.label for r in x.rows[:3])
        return (
            rich("{n} في قائمتك بلا طلبات خلال 30 يوماً", n=count(x.n, ITEMS, lang)),
            rich("منها: {names}.", names=B(names)),
        )
    names = ", ".join(r.label for r in x.rows[:3])
    return (
        rich("{n} on your menu had no orders in 30 days", n=count(x.n, ITEMS, lang)),
        rich("{names}.", names=B(names)),
    )


def _find_riser(f: Facts) -> Finding | None:
    if not f.risers:
        return None
    name, cur, prev = max(f.risers, key=lambda r: (r[1] - r[2], r[1], r[0]))
    if cur - prev < 5:
        return None
    return Finding([], ITEMS, {"name": name, "cur": cur, "prev": prev}, total=cur - prev)


def _say_riser(x: Finding, f: Facts, lang: str):
    n = x.numbers
    if lang == "ar":
        name = f.names_ar.get(n["name"], n["name"])
        return (
            rich("{name}: أكثر بـ{d} من الأسبوع الماضي", name=B(name), d=B(str(x.n))),
            rich("{cur} حتى الآن هذا الأسبوع، و{prev} حتى الوقت نفسه من الأسبوع الماضي.",
                 cur=B(str(n["cur"])), prev=B(str(n["prev"]))),
        )
    return (
        rich("{name} is up {d} on last week", name=B(n["name"]), d=B(str(x.n))),
        rich("{cur} sold so far this week; {prev} by this time last week.",
             cur=B(str(n["cur"])), prev=B(str(n["prev"]))),
    )


SEND_REMINDERS = Text("Send reminders", "أرسل التذكيرات")
SHOW_ORDERS = Text("Show the orders", "اعرض الطلبات")
SHOW_ACCOUNTS = Text("Show the accounts", "اعرض الحسابات")
SHOW_BOOKINGS = Text("Show the bookings", "اعرض الحجوزات")

INSIGHTS: tuple[Insight, ...] = (
    # Tasks, in "Needs you now".
    Insight(
        "waiting", 1, "task", "inbox",
        Text("the customer wrote last and has had no answer for 10 minutes",
             "آخر رسالة من العميل ولم يُرد عليها منذ 10 دقائق"),
        _find_waiting, _say_waiting, Action(Text("Open the inbox", "افتح المحادثات"),
                                            "/app/inbox?show=waiting"),
    ),
    Insight(
        "unconfirmed", 2, "task", "orders",
        Text("new for over 15 minutes", "جديد منذ أكثر من 15 دقيقة"),
        _find_unconfirmed, _say_unconfirmed, Action(SHOW_ORDERS, "/app/orders?show=unconfirmed"),
    ),
    Insight(
        "unmarked", 11, "task", "bookings",
        Text("booked and already over", "محجوز وانتهى وقته"),
        _find_unmarked, _say_unmarked, Action(SHOW_BOOKINGS, "/app/bookings?show=unmarked"),
    ),
    # Money.
    Insight(
        "overdue", 18, "money", "ledger",
        Text("owed 30+ days, no promise, no reminder in 7 days",
             "مستحق منذ 30 يوماً أو أكثر، دون وعد ودون تذكير خلال 7 أيام"),
        _find_overdue, _say_overdue, Action(SEND_REMINDERS, "/app/ledger?show=overdue"),
        money=True,
    ),
    Insight(
        "promise_passed", 19, "money", "ledger",
        Text("the promised date passed with nothing paid", "مضى موعد الوعد ولم يُدفع شيء"),
        _find_promise_passed, _say_promise_passed,
        Action(SEND_REMINDERS, "/app/ledger?show=promise_passed"), money=True,
    ),
    Insight(
        "open_links", 4, "money", "orders",
        Text("payment link open over 24 hours, order not collected",
             "رابط دفع مفتوح منذ أكثر من 24 ساعة والطلب لم يُستلم"),
        _find_open_links, _say_open_links, Action(SHOW_ORDERS, "/app/orders?show=unpaid"),
        money=True,
    ),
    Insight(
        "over_limit", 20, "money", "ledger",
        Text("balance above the customer's credit limit", "الرصيد أعلى من حد ائتمان العميل"),
        _find_over_limit, _say_over_limit, Action(SHOW_ACCOUNTS, "/app/ledger?show=over_limit"),
        money=True,
    ),
    Insight(
        "owed_growing", 21, "money", "ledger",
        Text("credit given above money collected, 3 weeks running",
             "الآجل الجديد أكثر من المحصَّل 3 أسابيع متتالية"),
        _find_owed_growing, _say_owed_growing, Action(SHOW_ACCOUNTS, "/app/ledger"), money=True,
    ),
    # Knowledge with a screen to act on.
    Insight(
        "ready", 3, "knowledge", "orders",
        Text("ready, not collected 2 hours later", "جاهز ولم يُستلم بعد ساعتين"),
        _find_ready, _say_ready, Action(SHOW_ORDERS, "/app/orders?show=ready"),
    ),
    Insight(
        "repeat_no_show", 13, "knowledge", "bookings",
        Text("2+ no-shows in 90 days, booked in the next 7",
             "غياب مرتين أو أكثر خلال 90 يوماً، وحجز خلال الأيام السبعة القادمة"),
        _find_repeat_no_show, _say_repeat_no_show,
        Action(SHOW_BOOKINGS, "/app/bookings?show=repeat_no_show"),
    ),
    Insight(
        "slow_answers", 22, "knowledge", "inbox",
        Text("7-day median first answer over 30 minutes, slower than the 7 days before",
             "وسيط أول رد خلال 7 أيام أكثر من 30 دقيقة، وأبطأ من الأيام السبعة التي قبلها"),
        _find_slow_answers, _say_slow_answers, Action(Text("Open Team", "افتح الفريق"),
                                                      "/app/team"),
    ),
    # Knowledge, for information only.
    Insight(
        "no_show_rate", 12, "knowledge", "bookings",
        Text("no-shows ÷ (came + no-shows) over 30 days; 10% or more, with 3 or more",
             "الغياب ÷ (الحضور + الغياب) خلال 30 يوماً؛ 10% أو أكثر مع 3 حالات أو أكثر"),
        _find_no_show_rate, _say_no_show_rate, status=INFO_ONLY,
    ),
    Insight(
        "quiet_regulars", 6, "knowledge", "orders|bookings",
        Text("3+ orders or visits 31 to 120 days ago, none in the last 30",
             "3 طلبات أو زيارات أو أكثر قبل 31 إلى 120 يوماً، ولا شيء خلال آخر 30 يوماً"),
        _find_quiet_regulars, _say_quiet_regulars, status=NO_CONSENT,
    ),
    Insight(
        "due_back", 17, "knowledge", "bookings",
        Text("3+ visits, the last longer ago than 1.5 × their usual gap, nothing booked",
             "3 زيارات أو أكثر، وآخرها أبعد من 1.5 × المعتاد، ولا حجز قادم"),
        _find_due_back, _say_due_back, status=NO_CONSENT,
    ),
    Insight(
        "thin_days", 14, "knowledge", "bookings",
        Text("booked minutes ÷ opening minutes, each of the next 7 days, under 30%; "
             "2 days or more",
             "الدقائق المحجوزة ÷ دقائق العمل لكل يوم من الأيام السبعة القادمة، "
             "أقل من 30%؛ يومان أو أكثر"),
        _find_thin_days, _say_thin_days, status=INFO_ONLY,
    ),
    Insight(
        "late_cancellations", 16, "knowledge", "bookings",
        Text("cancelled under 24 hours before the start, 3 or more in 30 days",
             "إلغاء قبل الموعد بأقل من 24 ساعة، 3 مرات أو أكثر خلال 30 يوماً"),
        _find_late_cancellations, _say_late_cancellations, status=INFO_ONLY,
    ),
    Insight(
        "lost_reason", 23, "knowledge", "inbox",
        Text("one reason for a lost chat, 3 or more times in 30 days",
             "سبب واحد لخسارة المحادثة، 3 مرات أو أكثر خلال 30 يوماً"),
        _find_lost_reason, _say_lost_reason, status=INFO_ONLY,
    ),
    Insight(
        "unused_items", 9, "knowledge", "orders",
        Text("on the menu, no order in 30 days, while 30 or more orders came in",
             "في القائمة ولا طلب عليه خلال 30 يوماً، مع 30 طلباً أو أكثر في المدة نفسها"),
        _find_unused, _say_unused,
        status=Text("The menu has no screen yet; ALYR changes it when you ask.",
                    "لا شاشة للقائمة بعد؛ تغيّرها ALYR عند طلبك."),
    ),
    Insight(
        "riser", 8, "knowledge", "orders",
        Text("the biggest rise on the same days last week, 5 or more",
             "أكبر زيادة عن الأيام نفسها من الأسبوع الماضي، 5 أو أكثر"),
        _find_riser, _say_riser, status=INFO_ONLY,
    ),
    # Last: useful to know, but it never needs anything doing.
    Insight(
        "booked_value", 15, "knowledge", "bookings",
        Text("booked in the next 7 days, at today's service prices",
             "الحجوزات خلال الأيام السبعة القادمة بأسعار الخدمات الحالية"),
        _find_booked_value, _say_booked_value, Action(SHOW_BOOKINGS, "/app/bookings"),
        money=True,
    ),
)

INSIGHT_BY_KEY = {i.key: i for i in INSIGHTS}


def applies(insight: Insight, modules: frozenset) -> bool:
    return any(m in modules for m in insight.module.split("|"))


def check() -> None:
    keys = [i.key for i in INSIGHTS]
    assert len(keys) == len(set(keys)), "insight keys must be unique"
    for i in INSIGHTS:
        assert i.kind in ("task", "money", "knowledge"), i.key
        assert (i.action is None) != (i.status is None), f"{i.key}: an action or a status"
        assert not i.action or i.action.href.startswith("/app"), i.key


check()
