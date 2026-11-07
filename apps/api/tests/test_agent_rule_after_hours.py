"""after_hours (plan row O1): the hours of the day when new chats start and a person seldom
answers. The rule's thresholds in both languages from facts alone, then `gather` on the real
database: what counts as a new chat and as a staff answer, the shop's own time zone, and
another shop's rows kept out."""

import asyncio
import re
from datetime import UTC, datetime, timedelta
from itertools import count
from uuid import uuid4
from zoneinfo import ZoneInfo

import asyncpg

from alyr.db import Database
from alyr.modules.agent import rules, view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY
from alyr.modules.agent.model import applies
from alyr.modules.agent.rules import after_hours
from alyr.modules.agent.words import plain
from conftest import APP_DSN, OWNER_DSN
from test_onboarding import new_business

KEY = after_hours.KEY
INSIGHT = after_hours.INSIGHT
ARABIC = re.compile(r"[؀-ۿ]")
QATAR = ZoneInfo("Asia/Qatar")
NUMBERS = count(1)

# Thursday 15 Oct 2026, 16:20 in Doha.
NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)


def facts(by_hour: dict | None, total: int | None = None, **values) -> Facts:
    extra = {}
    if by_hour is not None:
        extra[KEY] = {"by_hour": by_hour,
                      "total": sum(s for s, _ in by_hour.values()) if total is None else total}
    base = {"now": NOW, "modules": frozenset({"inbox"}), "business_type": "restaurant",
            "started": NOW - timedelta(days=60), "extra": extra}
    return Facts(**(base | values))


# Mornings that are answered, so the evening is the only window and the total is 40 or more.
HEALTHY = {9: (30, 30)}


def evening(answered_at_21=1, started=11, hours=(21, 22)) -> dict:
    """22 new chats at 21:00 and 22:00, one answered by a person (52 in all with the morning)."""
    return HEALTHY | {h: (started, answered_at_21 if h == 21 else 0) for h in hours}


# ── the rule, from facts alone ────────────────────────────


def test_it_is_numbered_29_a_knowledge_card_for_the_inbox_that_links_to_it():
    assert INSIGHT_BY_KEY[KEY] is INSIGHT and INSIGHT.number == 29
    assert INSIGHT.kind == "knowledge" and INSIGHT.module == "inbox" and not INSIGHT.money
    assert INSIGHT.action.href == "/app/inbox" and INSIGHT.status is None
    assert applies(INSIGHT, frozenset({"inbox"})) and not applies(INSIGHT, frozenset({"orders"}))


def test_it_says_nothing_without_data_or_below_forty_new_chats():
    assert INSIGHT.find(facts(None)) is None
    assert INSIGHT.find(facts({})) is None
    at_39 = {20: (10, 0), 9: (29, 29)}
    assert sum(s for s, _ in at_39.values()) == 39
    assert INSIGHT.find(facts(at_39)) is None
    at_40 = {20: (10, 0), 9: (30, 30)}
    assert INSIGHT.find(facts(at_40)) is not None


def test_an_hour_needs_ten_new_chats():
    assert INSIGHT.find(facts(HEALTHY | {20: (9, 0)}, total=40)) is None
    assert INSIGHT.find(facts(HEALTHY | {20: (10, 0)})) is not None


def test_under_a_quarter_answered_not_a_quarter():
    # 12 chats: a quarter is 3. Two answered qualifies, three does not.
    assert INSIGHT.find(facts(HEALTHY | {20: (12, 2)})) is not None
    assert INSIGHT.find(facts(HEALTHY | {20: (12, 3)})) is None
    # 10 chats: a quarter is 2.5, so two qualifies and three does not.
    assert INSIGHT.find(facts(HEALTHY | {20: (10, 2)})) is not None
    assert INSIGHT.find(facts(HEALTHY | {20: (10, 3)})) is None


def test_neighbouring_hours_make_one_window_and_the_busiest_window_is_named():
    by_hour = HEALTHY | {20: (10, 0), 21: (15, 1), 22: (12, 0), 14: (11, 0), 15: (11, 0)}
    found = INSIGHT.find(facts(by_hour))
    n = found.numbers
    # 20 to 23 holds 37 chats; 14 to 16 holds 22.
    assert (n["from"], n["to"], found.n, n["answered"]) == (20, 23, 37, 1)
    assert n["all"] == 30 + 37 + 22 and n["share"] == 42  # 37 of 89


def test_the_window_can_cross_midnight():
    found = INSIGHT.find(facts(HEALTHY | {23: (15, 0), 0: (12, 1), 1: (10, 0)}))
    assert (found.numbers["from"], found.numbers["to"], found.n) == (23, 2, 37)


def test_a_window_ending_at_the_last_hour_ends_at_midnight():
    found = INSIGHT.find(facts(HEALTHY | {22: (12, 0), 23: (12, 0)}))
    assert (found.numbers["from"], found.numbers["to"]) == (22, 0)


def test_two_windows_of_the_same_size_name_the_earlier_one():
    found = INSIGHT.find(facts(HEALTHY | {13: (12, 0), 20: (12, 0)}))
    assert found.numbers["from"] == 13


def test_the_share_is_of_all_new_chats_rounded_once():
    # 22 of 52 is 42.3%
    assert INSIGHT.find(facts(evening())).numbers["share"] == 42
    # 22 of 40 is 55%
    assert INSIGHT.find(facts(evening(), total=40)).numbers["share"] == 55
    # 0.5 rounds up, not to the even number
    assert INSIGHT.find(facts({21: (11, 0), 9: (189, 189)})).numbers["share"] == 6  # 5.5%


def test_every_hour_failing_is_no_window_so_it_is_quiet():
    assert INSIGHT.find(facts({h: (10, 0) for h in range(24)})) is None


def test_not_now_belongs_to_the_window_not_to_the_day_s_counts():
    a = INSIGHT.find(facts(evening()))
    b = INSIGHT.find(facts(evening(0, started=12)))  # more chats, none answered: same window
    c = INSIGHT.find(facts(evening(hours=(20, 21, 22))))
    assert a.fingerprint(KEY) == b.fingerprint(KEY) != c.fingerprint(KEY)


def test_english_wording():
    f = facts(evening())  # 22 of 52 chats from 21:00 to 23:00, one answered
    first, second = INSIGHT.say(INSIGHT.find(f), f, "en")
    assert plain(first) == "42% of new chats start between 21:00 and 23:00"
    assert plain(second) == (
        "A person answered only 1 of 22 chats within 60 minutes. Automatic replies are not "
        "counted."
    )
    f = facts(evening(0))
    _, second = INSIGHT.say(INSIGHT.find(f), f, "en")
    assert plain(second).startswith("A person answered none of 22 chats within 60 minutes.")


def test_arabic_wording():
    f = facts(evening())
    first, second = INSIGHT.say(INSIGHT.find(f), f, "ar")
    assert plain(first) == "42% من المحادثات الجديدة تبدأ بين 21:00 و23:00"
    assert plain(second) == (
        "ردّ شخص على 1 فقط من 22 محادثة خلال 60 دقيقة. الردود الآلية لا تُحتسب."
    )
    f = facts(evening(0))
    _, second = INSIGHT.say(INSIGHT.find(f), f, "ar")
    assert plain(second).startswith("لم يردّ شخص على أي من 22 محادثة")
    # the figures stay whole on screen
    assert {"b": "21:00"} in first and {"b": "42%"} in first


def test_it_speaks_at_its_threshold_in_both_languages_without_a_mind_at_work():
    for lang in ("en", "ar"):
        f = facts(HEALTHY | {20: (10, 0)})
        parts = INSIGHT.say(INSIGHT.find(f), f, lang)
        for p in parts:
            text = plain(p)
            assert text.strip() and "{" not in text and "}" not in text, text
            assert bool(ARABIC.search(text)) == (lang == "ar"), text
        words = " ".join(plain(p) for p in parts).lower()
        assert not re.search(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon)\b", words)
        assert "قريباً" not in words
    for text in (INSIGHT.rule.en, INSIGHT.rule.ar):
        assert text.strip() and "{" not in text


def test_it_offers_no_message_and_reaches_the_owner_s_screen_as_a_card():
    f = facts(evening(), first_name="Fatima")
    card = next(c for c in view.render(f, "en")["suggestions"] if c["key"] == KEY)
    assert card["action"] == {"label": "Open the inbox", "href": "/app/inbox"}
    assert card["status"] is None and card["kind"] == "knowledge" and not card["primary"]
    assert card["rule"].startswith("RULE · 28 days, 40 or more new chats")
    assert card["rule"].endswith("· 22 chats")
    ar = next(c for c in view.render(f, "ar")["suggestions"] if c["key"] == KEY)
    assert ar["action"]["href"] == "/app/inbox" and ARABIC.search(ar["rule"])
    # a shop without the inbox never meets it
    without = facts(evening(), modules=frozenset({"orders"}))
    assert KEY not in [c["key"] for c in view.render(without, "en")["suggestions"]]


# ── gather, on the real database ──────────────────────────


def local(days_ago: int, hour: int, minute: int = 0) -> datetime:
    """A moment in Doha's time, `days_ago` days before the day of NOW."""
    day = NOW.astimezone(QATAR).date() - timedelta(days=days_ago)
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=QATAR).astimezone(UTC)


async def put_chats(conn, tenant_id, user_id, plans, prefix="C", role="customer", test=False):
    """Each plan is one customer: (messages) where a message is (direction, moment, by_staff).
    Returns the customer ids."""
    ids = []
    for i, plan in enumerate(plans):
        phone = f"+9745{next(NUMBERS):07d}"
        wa = f"{'TEST.' if test else ''}{phone}"
        contact = await conn.fetchval(
            "insert into contacts (tenant_id, phone, wa_user_id, name, role) "
            "values ($1, $2, $3, $4, $5) returning id",
            tenant_id, phone, wa, f"{prefix} {i}", role,
        )
        ids.append(contact)
        await conn.executemany(
            "insert into messages (tenant_id, contact_id, direction, kind, body, created_at, "
            "status, sent_by_user) values ($1, $2, $3, 'text', 'x', $4, $5, $6)",
            [(tenant_id, contact, d, at, "received" if d == "in" else "sent",
              user_id if by_staff else None) for d, at, by_staff in plan],
        )
    return ids


def asked(at):
    return ("in", at, False)


def staff_reply(at):
    return ("out", at, True)


def auto_reply(at):
    return ("out", at, False)


async def seed_shop(tenant_id) -> dict:
    """A shop with 40 new chats in 28 days, and every kind of record the rule must handle."""
    conn = await asyncpg.connect(OWNER_DSN)
    try:
        user = await conn.fetchval(
            "insert into users (email, name) values ($1, 'Mona') returning id",
            f"mona-{uuid4().hex[:8]}@shop.example",
        )
        plans = []
        # 21:00 to 22:59 in Doha: 22 chats on 11 days, two a day. One is answered by a person
        # in 59 minutes. Three get an automatic reply in 2 minutes (not an answer). One is
        # answered after 61 minutes (too late). The rest are not answered.
        for day in range(1, 12):
            plans.append([asked(local(day, 21, 5))])
            plans.append([asked(local(day, 22, 40))])
        plans[0] = [asked(local(1, 21, 5)), staff_reply(local(1, 22, 4))]
        for i in (2, 4, 6):
            plans[i] = [asked(local(i // 2 + 1, 21, 5)), auto_reply(local(i // 2 + 1, 21, 7))]
        plans[8] = [asked(local(5, 21, 5)), staff_reply(local(5, 22, 6))]
        # A second message from the same customer 2 hours later is the same chat.
        plans[10] = [asked(local(6, 21, 5)), asked(local(6, 23, 30))]
        # 09:00 to 09:59: 12 chats, each answered by a person in 5 minutes.
        for day in range(1, 13):
            plans.append([asked(local(day, 9, 10)), staff_reply(local(day, 9, 15))])
        # 15:00 to 15:59: 6 chats, not answered (under ten in that hour).
        for day in range(2, 8):
            plans.append([asked(local(day, 15, 30))])
        # Two chats from one customer, two days apart: more than 24 hours of silence between.
        plans.append([asked(local(10, 12, 0)), asked(local(8, 12, 0))])
        # One chat: the second message came 21 hours after the first.
        plans.append([asked(local(3, 17, 0)), asked(local(2, 14, 0))])
        await put_chats(conn, tenant_id, user, plans)
        # Not new chats: older than 28 days (and its follow-up 20 hours later is the same
        # chat, though that follow-up is inside the 28 days), the owner's test customer, a
        # staff number, a chat in the last 30 minutes (it has not had its 60 minutes yet).
        await put_chats(conn, tenant_id, user,
                        [[asked(local(29, 21, 30)), asked(local(28, 18, 0))]], prefix="Old")
        await put_chats(conn, tenant_id, user, [[asked(local(2, 21, 30))]] * 5, test=True,
                        prefix="Test")
        await put_chats(conn, tenant_id, user, [[asked(local(2, 21, 30))]] * 5, role="staff",
                        prefix="Staff")
        await put_chats(conn, tenant_id, user, [[asked(NOW - timedelta(minutes=30))]],
                        prefix="Fresh")
        return {"user": user}
    finally:
        await conn.close()


def read(tenant_id, **values) -> Facts:
    """`gather` for one shop, as `facts.gather` runs it, inside that shop's scope."""
    f = Facts(now=NOW, tz="Asia/Qatar", modules=frozenset({"inbox"}), **values)

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant_id) as conn:
                await rules.gather_all(conn, f)
        finally:
            await db.close()

    asyncio.run(go())
    return f


def test_gather_counts_new_chats_by_the_shops_hour_and_what_a_person_answered(
    client, client_factory
):
    mine, _, _ = new_business(client)
    other, _, _ = new_business(client_factory())
    empty, _, _ = new_business(client_factory())
    asyncio.run(seed_shop(mine))

    f = read(mine)
    data = f.extra[KEY]
    by_hour = data["by_hour"]
    # 21:xx Doha is 18:xx UTC: the shop's hour, not the database's.
    assert by_hour == {
        9: (12, 12), 12: (2, 0), 15: (6, 0), 17: (1, 0), 21: (11, 1), 22: (11, 0),
    }
    # 18 and 6 are the database's hours (UTC) of the evening and morning chats
    assert 18 not in by_hour and 6 not in by_hour
    assert data["total"] == 12 + 2 + 6 + 1 + 22 == 43
    found = INSIGHT.find(f)
    assert (found.numbers["from"], found.numbers["to"]) == (21, 23)
    assert (found.n, found.numbers["answered"], found.numbers["share"]) == (22, 1, 51)
    first, second = INSIGHT.say(found, f, "en")
    assert plain(first) == "51% of new chats start between 21:00 and 23:00"
    assert plain(second).startswith("A person answered only 1 of 22 chats within 60 minutes.")

    # Another shop's chats are not mine, and mine are not theirs (row-level security).
    asyncio.run(seed_shop(other))
    assert read(mine).extra[KEY]["total"] == 43
    assert read(other).extra[KEY]["total"] == 43
    # A shop that has had no chats has nothing, and the rule is quiet.
    nobody = read(empty)
    assert nobody.extra[KEY] == {"by_hour": {}, "total": 0}
    assert INSIGHT.find(nobody) is None


def test_gather_runs_for_a_reader_who_may_not_see_money_and_not_without_the_inbox(client):
    tenant, _, _ = new_business(client)
    asyncio.run(seed_shop(tenant))
    assert KEY in read(tenant, money=False).extra  # the card shows no amount of money

    f = Facts(now=NOW, tz="Asia/Qatar", modules=frozenset({"orders"}))

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant) as conn:
                await rules.gather_all(conn, f)
        finally:
            await db.close()

    asyncio.run(go())
    assert KEY not in f.extra
