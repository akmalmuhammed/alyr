"""ALYR Agent rule `top_customers` (insights plan, row C3): the ten customers who spent most in
90 days, said only when none of them has had a message from the shop in 30 days.

Two parts: the rule's words, thresholds and money rule from facts alone, and its numbers read
from a real PostgreSQL through the same `facts.gather` the workspace uses, with a second shop
whose rows must not show up and a shop with nothing."""

import re
from datetime import timedelta

import pytest

from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts, Row
from alyr.modules.agent.insights import INFO_ONLY, INSIGHT_BY_KEY
from alyr.modules.agent.rules import top_customers
from alyr.modules.agent.words import plain
from test_agent_rule_second_order import ARABIC, BANNED, NOW, Shop, day, read

INSIGHT = top_customers.INSIGHT
KEY = top_customers.KEY
NB = " "


def facts(**values) -> Facts:
    base = {"now": NOW, "modules": frozenset({"orders"}), "business_type": "restaurant",
            "started": NOW - timedelta(days=200)}
    return Facts(**(base | values))


def numbers(customers=36, total=458_000, heard=0, spends=None) -> dict:
    spends = spends or [10_000 + 100 * i for i in range(10)]
    return {"customers": customers, "total": total, "heard": heard,
            "top": [(f"id-{i}", f"Customer {i}", v) for i, v in enumerate(spends)]}


def with_numbers(**values) -> Facts:
    return facts(extra={KEY: numbers(**values)})


# ── the rule, from facts alone ────────────────────────────


def test_the_rule_is_registered_as_number_32_for_information_only_and_money():
    assert INSIGHT_BY_KEY[KEY] is INSIGHT
    assert (INSIGHT.number, INSIGHT.kind, INSIGHT.module) == (32, "knowledge", "orders|bookings")
    assert INSIGHT.money is True and INSIGHT.action is None
    assert INSIGHT.status == INFO_ONLY


def test_it_is_quiet_below_thirty_customers_when_any_top_customer_heard_or_without_numbers():
    assert INSIGHT.find(facts()) is None
    assert INSIGHT.find(with_numbers(customers=29)) is None
    assert INSIGHT.find(with_numbers(customers=30)) is not None
    assert INSIGHT.find(with_numbers(heard=1)) is None
    assert INSIGHT.find(with_numbers(heard=10)) is None
    # Fewer than ten who spent cannot be "the top 10".
    assert INSIGHT.find(with_numbers(spends=[1_000] * 9)) is None
    assert INSIGHT.find(facts(extra={KEY: numbers(total=0, spends=[0] * 10)})) is None


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_it_speaks_at_thirty_in_both_languages(lang):
    spends = [10_050] * 10  # 100,500 dirhams: QAR 1,005
    f = with_numbers(customers=30, total=400_000, spends=spends)
    found = INSIGHT.find(f)
    first, second = INSIGHT.say(found, f, lang)
    for parts in (first, second):
        text = plain(parts)
        assert text.strip()
        assert "{" not in text and "}" not in text, text
        assert not BANNED.search(text.lower()), text
    assert bool(ARABIC.search(plain(first))) == (lang == "ar")
    assert bool(ARABIC.search(plain(second))) == (lang == "ar")
    if lang == "en":
        assert plain(first) == (
            f"Your 10 best customers spent QAR{NB}1,005 in 90 days; "
            "none has heard from you in a month")
        assert plain(second) == (
            f"That is 25% of the QAR{NB}4,000 that 30 customers spent in the same 90 days.")
    else:
        assert plain(first) == (
            f"أنفق أفضل 10 من عملائك 1,005{NB}ر.ق خلال 90 يوماً، ولم تصلهم منك رسالة منذ شهر")
        assert plain(second) == (
            f"أنفق 30 عميلاً ما مجموعه 4,000{NB}ر.ق في المدة نفسها، وحصتهم منه 25%.")


def test_a_clinic_says_patients():
    f = with_numbers(customers=31, total=400_000)
    f.business_type = "clinic"
    found = INSIGHT.find(f)
    assert "highest-spending patients" in plain(INSIGHT.say(found, f, "en")[0])
    assert "31 patients" in plain(INSIGHT.say(found, f, "en")[1])
    assert "مراجعيك" in plain(INSIGHT.say(found, f, "ar")[0])
    assert "31 مراجعاً" in plain(INSIGHT.say(found, f, "ar")[1])


def test_the_finding_names_the_ten_for_show_me_and_changes_when_they_do():
    f = with_numbers()
    found = INSIGHT.find(f)
    assert found.n == 10 and [r.label for r in found.rows][:2] == ["Customer 0", "Customer 1"]
    assert all(isinstance(r, Row) for r in found.rows)
    other = INSIGHT.find(with_numbers(spends=[20_000 + 100 * i for i in range(10)]))
    assert found.fingerprint(KEY) != other.fingerprint(KEY)


def test_only_managers_are_shown_the_card():
    f = facts(extra={KEY: numbers()}, orders=5, orders_last=5)
    assert KEY in {c["key"] for c in view.render(f, "en")["suggestions"]}
    f.money = False
    v = view.render(f, "en")
    assert KEY not in {c["key"] for c in v["suggestions"]}
    assert "QAR" not in str(v)


# ── the numbers, from a real database ─────────────────────


async def crowd(shop: Shop, n: int, base: int = 10_000, step: int = 100) -> list:
    """`n` customers, the nth the biggest spender, each with one order in the last 60 days."""
    made = []
    for i in range(1, n + 1):
        who = await shop.customer(f"Customer {i}")
        await shop.order(who, day(10 + i), total=base + step * i)
        made.append(who)
    return made


def test_it_ranks_what_customers_spent_in_90_days_through_the_real_path():
    async def build(conn):
        a = await Shop.make(conn)
        await crowd(a, 35)
        # Visits only: two at an explicit price and one at the service's price when it was
        # booked (5,000), 45,000 in all: the biggest spender. A later price change moves nothing.
        x = await a.customer("Visits only")
        await a.visit(x, day(20), price=20_000)
        await a.visit(x, day(15), price=20_000)
        await a.visit(x, day(5))
        await conn.execute("update services set price = 9999 where id = $1", a.service)
        # None of these is spend: a cancelled order, an order too old, a no-show, a cancelled
        # visit, the owner's test line and a member of staff.
        y = await a.customer("Cancelled and old")
        await a.order(y, day(10), total=1_000_000, status="cancelled")
        await a.order(y, day(95), total=1_000_000)
        z = await a.customer("No-show")
        await a.visit(z, day(10), status="no_show", price=99_999)
        await a.visit(z, day(9), status="cancelled", price=99_999)
        await a.order(await a.customer(wa_user_id="TEST.owner-1"), day(10), total=1_000_000)
        await a.order(await a.customer(role="staff"), day(10), total=1_000_000)
        # Messages that do not count as contact, to a top-ten customer: one they sent, one that
        # failed, one still queued, one sent 31 days ago, and one sent just now (after NOW).
        top = await a.conn.fetchval(
            "select id from contacts where tenant_id = $1 and name = 'Customer 35'", a.tenant)
        await a.message(top, day(5), direction="in", status="received")
        await a.message(top, day(5), status="failed")
        await a.message(top, day(5), status="queued")
        await a.message(top, day(31))
        await a.message(top, NOW + timedelta(minutes=1))
        # A second shop whose customers all spent a fortune: none of it may show in the first.
        b = await Shop.make(conn, name="Other shop")
        await crowd(b, 40, base=1_000_000)
        c = await Shop.make(conn, name="Empty shop")
        return [a.tenant, b.tenant, c.tenant]

    a, b, c = read(build)
    data = a.extra[KEY]
    # 35 customers with an order, plus the one who only visited.
    assert data["customers"] == 36
    assert data["total"] == sum(10_000 + 100 * i for i in range(1, 36)) + 45_000
    assert [name for _, name, _ in data["top"]] == (
        ["Visits only"] + [f"Customer {i}" for i in range(35, 26, -1)])
    assert [v for _, _, v in data["top"]][:3] == [45_000, 13_500, 13_400]
    assert data["heard"] == 0
    found = INSIGHT.find(a)
    assert found is not None
    assert found.numbers["spent"] == 45_000 + sum(10_000 + 100 * i for i in range(27, 36))
    assert plain(INSIGHT.say(found, a, "en")[0]).startswith(
        f"Your 10 best customers spent QAR{NB}1,629 ")
    # The other shop's ten are the biggest spenders there, and nothing of theirs is here.
    assert b.extra[KEY]["customers"] == 40 and b.extra[KEY]["top"][0][2] == 1_004_000
    assert c.extra[KEY] == {"customers": 0, "total": 0, "top": [], "heard": 0}
    assert INSIGHT.find(c) is None


def test_one_sent_message_to_a_top_ten_customer_in_30_days_silences_it():
    async def build(conn):
        out = []
        for status, days_ago, rank in [
            ("sent", 29, 30),        # to the biggest spender: silences
            ("delivered", 1, 21),    # to the tenth: silences
            ("read", 10, 25),        # silences
            ("sent", 29, 20),        # to the eleventh: not one of the ten, so it does not
            ("sent", 30, 30),        # exactly 30 days ago is the edge: it still counts
            ("sent", 31, 30),        # 31 days ago does not
        ]:
            shop = await Shop.make(conn, name=f"Heard {status}")
            made = await crowd(shop, 30)
            await shop.message(made[rank - 1], NOW - timedelta(days=days_ago), status=status)
            out.append(shop.tenant)
        return out

    results = read(build)
    heard = [f.extra[KEY]["heard"] for f in results]
    assert heard == [1, 1, 1, 0, 1, 0]
    assert [INSIGHT.find(f) is None for f in results] == [True, True, True, False, True, False]


def test_an_automatic_message_does_not_count_as_hearing_from_the_shop():
    async def build(conn):
        shop = await Shop.make(conn, name="Automatic only")
        made = await crowd(shop, 30)
        for who in made[-10:]:
            await shop.message(who, NOW - timedelta(days=2), automatic=True)
        return [shop.tenant]

    (f,) = read(build)
    assert f.extra[KEY]["heard"] == 0 and INSIGHT.find(f) is not None


def test_it_needs_thirty_who_spent_and_reads_only_the_modules_the_shop_has_on():
    async def build(conn):
        twenty_nine = await Shop.make(conn, name="Twenty nine")
        await crowd(twenty_nine, 29)
        thirty = await Shop.make(conn, name="Thirty")
        await crowd(thirty, 30)
        # Thirty customers, but one has spent nothing (a visit to a service with no price).
        free = await Shop.make(conn, name="One spent nothing")
        await conn.execute("update services set price = 0 where id = $1", free.service)
        await crowd(free, 29)
        await free.visit(await free.customer("Free"), day(10))
        # A shop without the orders module does not read its orders, and one without bookings
        # does not read its visits.
        visits_only = await Shop.make(conn, modules=("bookings",), name="Visits only shop")
        for i in range(1, 31):
            who = await visits_only.customer(f"Visitor {i}")
            await visits_only.visit(who, day(10 + i), price=1_000 + 10 * i)
            await visits_only.order(who, day(10 + i), total=5_000_000)
        orders_only = await Shop.make(conn, modules=("orders",), name="Orders only shop")
        for i in range(1, 31):
            who = await orders_only.customer(f"Buyer {i}")
            await orders_only.order(who, day(10 + i), total=1_000 + 10 * i)
            await orders_only.visit(who, day(10 + i), price=5_000_000)
        return [s.tenant for s in (twenty_nine, thirty, free, visits_only, orders_only)]

    twenty_nine, thirty, free, visits_only, orders_only = read(build)
    assert twenty_nine.extra[KEY]["customers"] == 29 and INSIGHT.find(twenty_nine) is None
    assert thirty.extra[KEY]["customers"] == 30 and INSIGHT.find(thirty) is not None
    assert free.extra[KEY]["customers"] == 29 and INSIGHT.find(free) is None
    for shop in (visits_only, orders_only):
        assert shop.extra[KEY]["customers"] == 30
        assert shop.extra[KEY]["total"] == sum(1_000 + 10 * i for i in range(1, 31))
        assert INSIGHT.find(shop) is not None


def test_staff_who_may_not_see_money_get_nothing_gathered_and_no_card():
    async def build(conn):
        shop = await Shop.make(conn)
        await crowd(shop, 30)
        return [shop.tenant]

    (owner,) = read(build)
    assert KEY in owner.extra

    async def same_shop_as_agent(conn):
        shop = await Shop.make(conn, name="Agent reads")
        await crowd(shop, 30)
        return [shop.tenant]

    (agent,) = read(same_shop_as_agent, role="agent")
    assert agent.money is False and KEY not in agent.extra
    assert INSIGHT.find(agent) is None
    assert not re.search("QAR", str(view.render(agent, "en")))
