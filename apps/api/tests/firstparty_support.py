"""Builders for the first-party tests (Discovery 2.0, workstream C): a shop's own records as the
rules see them, and a rule context that carries them.

The sample case is Nuqta Car Care (fictional, as in the rest of Discovery's tests): its listing says
closed on Friday, while ALYR holds 7 orders and 11 bookings on the last 4 Fridays; the owner's real
Friday hours are 13:00 to 22:00. "Today" is Thursday 26 Nov 2026, so the 4 weeks are 29 Oct to
25 Nov and the Fridays are 30 Oct, 6, 13 and 20 Nov.
"""

import dataclasses
from datetime import UTC, date, datetime, timedelta

from alyr.modules.discovery import firstparty, rules
from alyr.modules.discovery.connectors import Snapshot

TODAY = date(2026, 11, 26)
NOW = datetime(2026, 11, 26, 6, 0, tzinfo=UTC)  # 09:00 in Doha
FRIDAYS = (date(2026, 10, 30), date(2026, 11, 6), date(2026, 11, 13), date(2026, 11, 20))
# Orders placed and bookings that started on each of those Fridays, by hour in Doha: 7 and 11.
FRIDAY_ORDERS = ({14: 1, 18: 1}, {15: 1}, {13: 1, 16: 1, 20: 1}, {19: 1})
FRIDAY_BOOKINGS = ({14: 1, 16: 1, 18: 1}, {15: 1, 17: 1}, {13: 1, 15: 1, 17: 1, 19: 1},
                   {16: 1, 20: 1})
REAL_HOURS = {d: ("07:00", "22:00") for d in ("sat", "sun", "mon", "tue", "wed", "thu")} | {
    "fri": ("13:00", "22:00")}
CLOSED_FRIDAY = {d: v for d, v in REAL_HOURS.items() if d != "fri"} | {"fri": None}
WHATSAPP = "+97455550150"
BOOKING = "https://web.test/b/nuqta-car-care"
ORDER = "https://web.test/s/nuqta-car-care"
WA_LINK = "https://wa.me/97455550150"


def activity(orders: dict[date, dict[int, int]] | None = None,
             bookings: dict[date, dict[int, int]] | None = None, *,
             orders_on: bool = True, bookings_on: bool = True,
             today: date = TODAY) -> tuple[firstparty.DayActivity, ...]:
    """Every day of the 4 weeks before `today`, oldest first, with the counts given (none else)."""
    days = []
    for n in range(firstparty.WEEKS * 7, 0, -1):
        day = today - timedelta(days=n)
        days.append(firstparty.DayActivity(
            day,
            dict((orders or {}).get(day, {})) if orders_on else None,
            dict((bookings or {}).get(day, {})) if bookings_on else None,
        ))
    return tuple(days)


def nuqta_activity(**more) -> tuple[firstparty.DayActivity, ...]:
    return activity(dict(zip(FRIDAYS, FRIDAY_ORDERS, strict=True)),
                    dict(zip(FRIDAYS, FRIDAY_BOOKINGS, strict=True)), **more)


def facts(**more) -> firstparty.FirstPartyFacts:
    base = {
        "tenant_id": None,
        "timezone": "Asia/Qatar",
        "today": TODAY,
        "measured_from": date(2026, 6, 1),
        "activity": nuqta_activity(),
        "links": firstparty.OwnLinks(BOOKING, ORDER, WA_LINK),
        "whatsapp": WHATSAPP,
        "whatsapp_source": "owner",
        "name_en": "Nuqta Car Care",
        "name_ar": "نقطة للعناية بالسيارات",
        "confirmed_hours": {},
        "seasons": firstparty.SEASONS,
    }
    return firstparty.FirstPartyFacts(**(base | more))


def with_first_party(ctx: rules.Context, fp) -> rules.Context:
    """The context the engine builds once workstream B adds `Context.first_party`. Until then the
    field is set on the frozen object directly, which is all a rule reads."""
    if "first_party" in {f.name for f in dataclasses.fields(rules.Context)}:
        return dataclasses.replace(ctx, first_party=fp)
    object.__setattr__(ctx, "first_party", fp)
    return ctx


def context(*places, fp=None, now: datetime = NOW) -> rules.Context:
    ctx = rules.Context(Snapshot("sample", now, [p[1] for p in places]), [p[0] for p in places],
                        {}, now)
    return with_first_party(ctx, fp)


def check(rule_id: str, ctx: rules.Context) -> list[rules.Outcome]:
    return firstparty.RULE_BY_ID[rule_id].check(ctx)


def single(rule_id: str, ctx: rules.Context) -> rules.Outcome:
    found = check(rule_id, ctx)
    assert len(found) == 1, found
    return found[0]
