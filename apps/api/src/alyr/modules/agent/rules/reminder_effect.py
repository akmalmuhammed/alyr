"""Rule 36, `reminder_effect` (plan row V4): no-shows with a reminder and without one.

It says what happened and nothing about why: "bookings with a reminder were no-shows 4% of
the time, without one 14%". A shop whose reminders were on for only a part of the last 90
days has both groups; a shop that always had them (or never had them) has one group and the
rule stays quiet.

A reminder is a job queued when the booking is confirmed, for 2 hours before it starts
(`bookings.service.schedule_reminder`, `REMIND_BEFORE`), and `Reminders.send` sets
`bookings.reminded_at` when it runs. So a booking made less than 2 hours before it starts
can never have one, whatever the shop's setting; comparing those with the rest would put
the same-day and walk-in visits (who are there, or will be) in the "without" group and make
a reminder look better than it is. They are left out, and so are:

* a walk-in written down by staff (`walk_in`): nothing is sent for it;
* a booking whose deposit is still due or has expired (`deposit_state`): the reminder skips
  a booking that is not confirmed.

How many were left out is counted and said on the card. A booking moved to within 2 hours of
its new start is not left out (the table keeps no move time); it only makes the "without"
group look better, so it works against the rule speaking, never for it.

One query, 90 days of `starts_at` (the `(tenant_id, starts_at)` index of `bookings_when`),
and only bookings that ended as `completed` or `no_show`.
"""

from alyr.catalog import Text
from alyr.core.words import Noun
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Finding, Insight
from alyr.modules.agent.words import B, count, rich
from alyr.modules.bookings.service import REMIND_BEFORE

KEY = "reminder_effect"
WINDOW_DAYS = 90
MIN_EACH = 15  # bookings in each group
MIN_GAP = 5  # points of no-show rate, without a reminder minus with one
LEAD_HOURS = int(REMIND_BEFORE.total_seconds() // 3600)

BOOKINGS: Noun = (
    ("booking", "bookings"), ("حجز واحد", "حجزان", "حجوزات", "حجزاً"),
)

_QUERY = """
    select
        count(*) filter (where ok and reminded) as with_n,
        count(*) filter (where ok and reminded and no_show) as with_ns,
        count(*) filter (where ok and not reminded) as without_n,
        count(*) filter (where ok and not reminded and no_show) as without_ns,
        count(*) filter (where not ok) as left_out
    from (
        select
            reminded_at is not null as reminded,
            status = 'no_show' as no_show,
            (not walk_in
             and created_at <= starts_at - $2::interval
             and deposit_state not in ('due', 'expired')) as ok
        from bookings
        where starts_at >= $1::timestamptz - make_interval(days => $3)
          and starts_at < $1
          and status in ('completed', 'no_show')
    ) b
"""


async def gather(conn, f: Facts) -> None:
    row = await conn.fetchrow(_QUERY, f.now, REMIND_BEFORE, WINDOW_DAYS)
    f.extra[KEY] = {k: int(row[k]) for k in
                    ("with_n", "with_ns", "without_n", "without_ns", "left_out")}


def _pct(no_shows: int, of: int) -> int:
    """A whole percentage, half up, rounded once so the number shown and the threshold
    always agree."""
    return (200 * no_shows + of) // (2 * of)


def find(f: Facts) -> Finding | None:
    d = f.extra.get(KEY)
    if not d or d["with_n"] < MIN_EACH or d["without_n"] < MIN_EACH:
        return None
    with_rate = _pct(d["with_ns"], d["with_n"])
    without_rate = _pct(d["without_ns"], d["without_n"])
    if without_rate - with_rate < MIN_GAP:
        return None
    # Only the two rates are in `numbers`: a card set aside with "Not now" comes back when
    # they change, not every day a booking is added to the counts.
    return Finding([], BOOKINGS, {"with": with_rate, "without": without_rate},
                   total=d["with_n"] + d["without_n"])


def say(x: Finding, f: Facts, lang: str):
    d = f.extra[KEY]
    a, b = B(f"{x.numbers['with']}%"), B(f"{x.numbers['without']}%")
    reminded = count(d["with_n"], BOOKINGS, lang)
    not_reminded = count(d["without_n"], BOOKINGS, lang)
    out = count(d["left_out"], BOOKINGS, lang)
    if lang == "ar":
        line = "خلال {days} يوماً: {r} مع تذكير و{u} بدونه."
        if d["left_out"]:
            line += (
                " المستبعد: {out}، وهي حجوزات تمت قبل موعدها بأقل من ساعتين، أو حضور مباشر، "
                "أو عربونها غير مدفوع."
            )
        line += " هذا ما حدث، وليس سببه."
        if not f.booking_reminders:
            line += " التذكيرات متوقفة الآن."
        return (
            rich("الغياب {a} في الحجوزات مع تذكير، و{b} في الحجوزات بدون تذكير", a=a, b=b),
            rich(line, days=B(str(WINDOW_DAYS)), r=reminded, u=not_reminded, out=out),
        )
    line = "In {days} days: {r} with a reminder, {u} without."
    if d["left_out"]:
        line += (
            " Left out: {out} made under " + str(LEAD_HOURS) + " hours before the start, "
            "walk-ins, and bookings whose deposit was not paid."
        )
    line += " This is what happened, not why."
    if not f.booking_reminders:
        line += " Reminders are off now."
    return (
        rich("Bookings with a reminder were no-shows {a} of the time, without one {b}",
             a=a, b=b),
        rich(line, days=B(str(WINDOW_DAYS)), r=reminded, u=not_reminded, out=out),
    )


# There is no workspace screen for the booking reminders setting (it is chosen at sign-up and
# kept in `tenants.booking_reminders`), so the card carries a status line, not an action.
INSIGHT = Insight(
    KEY, 36, "knowledge", "bookings",
    Text(
        f"last {WINDOW_DAYS} days of bookings that ended as came or no-show, made at least "
        f"{LEAD_HOURS} hours ahead; {MIN_EACH}+ with a reminder and {MIN_EACH}+ without, and "
        f"the no-show share {MIN_GAP} points or more higher without one",
        f"آخر {WINDOW_DAYS} يوماً من الحجوزات التي انتهت بحضور أو غياب وحُجزت قبل موعدها "
        f"بساعتين على الأقل؛ {MIN_EACH} حجزاً أو أكثر مع تذكير ومثلها بدونه، ونسبة الغياب "
        f"أعلى بدون تذكير بـ {MIN_GAP} نقاط أو أكثر",
    ),
    find, say,
    status=Text(
        "Information only. Reminders are chosen at sign-up; the workspace has no switch for "
        "them.",
        "للعلم فقط. التذكيرات تُختار عند التسجيل، ولا يوجد لها مفتاح في مساحة العمل.",
    ),
)
