"""V3, fill the thin day (docs/work/insights-plan/plan.md): the quietest day of the next 7
is under 30% booked, and at least 3 regulars are due back with nothing booked.

It joins two numbers the Agent already counts, `Facts.thin_days` (`thin_days` rule) and
`Facts.due_back` (`due_back` rule), both read in `facts._bookings`. It asks the database for
nothing, so it adds no cost to the page that every open workspace tab asks for.

Information only. Writing to the regulars needs their marketing consent, which ALYR does not
collect yet (ALY-44), so the card offers no message; its action opens the bookings.

How it sits with the other two cards (`view._suggestions`): it shows the regulars as its own
rows, and ranks above `due_back` and `quiet_regulars` (it has a screen to act on, they have a
status line), so the same people are listed once: they leave those two cards. A person a card
above it already counted is left out of this one, and the count in the sentence is what is
left. The quietest day also appears in the `thin_days` card when 2 or more days are thin;
that card counts days, not people.
"""

from datetime import date

import asyncpg

from alyr.catalog import Text
from alyr.core.words import PATIENTS, Noun
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Action, Finding, Insight
from alyr.modules.agent.words import (
    DAY_LONG,
    B,
    agree,
    count,
    day_month,
    rich,
    sunday_index,
)

KEY = "fill_thin_day"
MIN_REGULARS = 3
# A day counts as thin below this share of its opening minutes (facts.py, `thin_days`).
THIN_BELOW_PERCENT = 30

REGULARS: Noun = (
    ("regular", "regulars"),
    ("زبون دائم واحد", "زبونان دائمان", "زبائن دائمين", "زبوناً دائماً"),
)


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    """Nothing to gather: `find` reads `f.thin_days` and `f.due_back`, which `facts._bookings`
    already fills for the `thin_days` and `due_back` rules. No query, so no cost."""
    return None


def _noun(f: Facts) -> Noun:
    return PATIENTS if f.business_type == "clinic" else REGULARS


def _percent(share: float) -> int:
    """The share as a whole percentage that never reads 30 for a day under 30."""
    return min(round(100 * share), THIN_BELOW_PERCENT - 1)


def find(f: Facts) -> Finding | None:
    if not f.thin_days or len(f.due_back) < MIN_REGULARS:
        return None
    day, share = min(f.thin_days, key=lambda d: d[1])  # the earlier day when two tie
    return Finding(list(f.due_back), _noun(f), {"day": day, "share": _percent(share)})


def say(x: Finding, f: Facts, lang: str):
    day: date = x.numbers["day"]
    name = DAY_LONG[lang][sunday_index(day)]
    when = f"{name} {day_month(day, lang)}"
    share = B(f"{x.numbers['share']}%")
    who = count(x.n, x.noun, lang)
    if lang == "ar":
        verb = agree(
            x.n, "حان موعد عودته ولا حجز لديه", "حان موعد عودتهما ولا حجز لديهما",
            "حان موعد عودتهم ولا حجز لديهم",
        )
        return (
            rich("{when} هو أهدأ يوم في الأيام السبعة القادمة، محجوز {s}", when=when, s=share),
            rich("{who} " + verb + ".", who=who),
        )
    be, has = ("is", "has") if x.n == 1 else ("are", "have")
    return (
        rich("{when} is the quietest of the next 7 days, {s} booked", when=when, s=share),
        rich("{who} " + be + " due back and " + has + " nothing booked.", who=who),
    )


INSIGHT = Insight(
    KEY, 33, "knowledge", "bookings",
    Text(
        "the quietest of the next 7 days is under 30% booked, and 3 or more regulars "
        "(3+ visits, past their usual gap) have nothing booked",
        "أهدأ يوم من الأيام السبعة القادمة محجوز بأقل من 30%، و3 زبائن دائمين أو أكثر "
        "(3 زيارات أو أكثر، ومضى أكثر من معتادهم) بلا حجز قادم",
    ),
    find, say,
    action=Action(Text("Open the bookings", "افتح الحجوزات"), "/app/bookings"),
)
