"""after_hours (plan row O1): the hours of the day when new chats start and a person
seldom answers them.

A new chat is a customer's first message after 24 hours of silence from that customer (the
WhatsApp window; a customer who writes again an hour later is the same chat). It is
"answered" when a member of staff replied within 60 minutes. That is the definition of
`facts._median_first_answer` and `core/team.py`: an outgoing message with `sent_by_user` set,
not blocked. An automatic reply has no `sent_by_user`, so it never counts as an answer.

For each hour of the day in the shop's time zone, over 28 days, the rule keeps the hours
where 10 or more new chats started and fewer than a quarter were answered. Neighbouring such
hours make a window (23:00 and 00:00 are neighbours); the window holding the most new chats
is the one the card names, with its share of all new chats. Under 40 new chats in 28 days
it says nothing, and so it does when every hour of the day qualifies (there is no "after
hours" to point at; the slow-answers card and the Team screen cover that shop).

It only states what happened. The after-hours reply is not built, so the card offers a
link to the inbox and nothing else.
"""

from dataclasses import dataclass
from datetime import timedelta

import asyncpg

from alyr.catalog import Text
from alyr.core.words import CHATS
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Action, Finding, Insight
from alyr.modules.agent.words import B, count, rich

KEY = "after_hours"

DAYS = 28
ANSWER_MINUTES = 60
MIN_NEW_CHATS = 40  # in 28 days, for the rule to say anything
MIN_PER_HOUR = 10  # new chats started in an hour of the day, over 28 days
SILENCE_HOURS = 24  # a customer's message this long after their last one starts a new chat


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    """One query: the new chats of the last 28 days by hour of the day, and how many of them
    a person answered within 60 minutes. A chat younger than 60 minutes has not had its full
    hour yet, so the window ends 60 minutes ago. `messages_contact` (tenant, contact, time)
    answers the look-ups per customer."""
    rows = await conn.fetch(
        f"""
        with inbound as (
            select m.contact_id, m.created_at,
                   lag(m.created_at) over (partition by m.contact_id order by m.created_at)
                       as previous
            from messages m join contacts c on c.id = m.contact_id
            where m.direction = 'in' and c.role = 'customer'
              and coalesce(c.wa_user_id, '') not like 'TEST.%'
              and m.created_at >= $1::timestamptz - interval '{SILENCE_HOURS} hours'
              and m.created_at < $2
        ), chats as (
            select * from inbound
            where created_at >= $1
              and (previous is null
                   or created_at - previous > interval '{SILENCE_HOURS} hours')
        )
        select extract(hour from s.created_at at time zone $3::text)::int as hour,
               count(*)::int as started,
               count(*) filter (where exists (
                   select 1 from messages r
                   where r.contact_id = s.contact_id and r.direction = 'out'
                     and r.sent_by_user is not null and coalesce(r.status, '') <> 'blocked'
                     and r.created_at > s.created_at
                     and r.created_at <= s.created_at + interval '{ANSWER_MINUTES} minutes'
               ))::int as answered
        from chats s
        group by 1
        """,
        f.now - timedelta(days=DAYS), f.now - timedelta(minutes=ANSWER_MINUTES), f.tz,
    )
    by_hour = {r["hour"]: (r["started"], r["answered"]) for r in rows}
    f.extra[KEY] = {"by_hour": by_hour, "total": sum(s for s, _ in by_hour.values())}


@dataclass
class _Window(Finding):
    def fingerprint(self, key: str) -> str:
        # The counts move every day as the 28 days roll on; "Not now" is for this window.
        window = {k: self.numbers[k] for k in ("from", "to")}
        return Finding(numbers=window).fingerprint(key)


def _windows(by_hour: dict) -> list[tuple[int, int, int, int]]:
    """Runs of neighbouring hours that qualify: (first hour, hours long, new chats, answered).
    The day is a circle, so a run can cross midnight."""
    bad = {h for h, (started, answered) in by_hour.items()
           if started >= MIN_PER_HOUR and answered * 4 < started}
    runs = []
    for h in sorted(bad):
        if (h - 1) % 24 in bad:
            continue  # not the start of a run
        length = 1
        while (h + length) % 24 in bad and length < 24:
            length += 1
        runs.append((
            h, length,
            sum(by_hour[(h + i) % 24][0] for i in range(length)),
            sum(by_hour[(h + i) % 24][1] for i in range(length)),
        ))
    return runs


def _find(f: Facts) -> Finding | None:
    data = f.extra.get(KEY)
    if not data or data["total"] < MIN_NEW_CHATS:
        return None
    runs = [r for r in _windows(data["by_hour"]) if r[1] < 24]
    if not runs:
        return None
    first, length, started, answered = max(runs, key=lambda r: (r[2], -r[0]))
    total = data["total"]
    return _Window(
        [], CHATS,
        {"from": first, "to": (first + length) % 24, "answered": answered, "all": total,
         "share": (200 * started + total) // (2 * total)},
        total=started,
    )


def _hour(h: int) -> B:
    return B(f"{h:02d}:00")


def _say(x: Finding, f: Facts, lang: str):
    share = B(f"{x.numbers['share']}%")
    a, b = _hour(x.numbers["from"]), _hour(x.numbers["to"])
    answered = x.numbers["answered"]
    chats = count(x.n, CHATS, lang)
    if lang == "ar":
        title = rich("{p} من المحادثات الجديدة تبدأ بين {a} و{b}", p=share, a=a, b=b)
        if answered == 0:
            return title, rich(
                "لم يردّ شخص على أي من {n} خلال 60 دقيقة. الردود الآلية لا تُحتسب.", n=chats)
        return title, rich(
            "ردّ شخص على {k} فقط من {n} خلال 60 دقيقة. الردود الآلية لا تُحتسب.",
            k=B(str(answered)), n=chats)
    title = rich("{p} of new chats start between {a} and {b}", p=share, a=a, b=b)
    if answered == 0:
        return title, rich(
            "A person answered none of {n} within 60 minutes. Automatic replies are not "
            "counted.", n=chats)
    return title, rich(
        "A person answered only {k} of {n} within 60 minutes. Automatic replies are not "
        "counted.", k=B(str(answered)), n=chats)


INSIGHT = Insight(
    KEY, 29, "knowledge", "inbox",
    Text("28 days, 40 or more new chats (a customer's first message after 24 hours of "
         "silence); the hours with 10 or more where under a quarter got a person's reply "
         "within 60 minutes",
         "28 يوماً و40 محادثة جديدة أو أكثر (أول رسالة من العميل بعد 24 ساعة من الصمت)؛ "
         "الساعات التي فيها 10 محادثات أو أكثر ورد شخص خلال 60 دقيقة على أقل من ربعها"),
    _find, _say,
    Action(Text("Open the inbox", "افتح المحادثات"), "/app/inbox"),
)
