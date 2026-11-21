"""ALYR Agent rule `margin` (M1, "your best sellers earn you the least per sale").

* The rule on facts alone: quiet just short of each threshold, speaking at it, in English and
  Arabic, and silent for anyone who may not see money.
* Its `gather` on real PostgreSQL, through the product's own order path, with a second shop
  whose sales must not show up and a shop with no costs.
* Who can ever see a cost through it: a non-manager's Facts never carry it, `gather_all` does
  not even call the rule for them, and nothing the agent role is sent holds a cost.
"""

import asyncio
import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import asyncpg
import pytest

from alyr.core.auth import Staff
from alyr.modules.agent import facts as agent_facts
from alyr.modules.agent import rules, view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.rules import margin
from alyr.modules.agent.words import plain
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID, OWNER_EMAIL
from catalog_wa import catalog_module_on  # noqa: F401  (the autouse fixture is used by name)
from conftest import OWNER_DSN
from test_consent import owner_sql
from test_cost import cost_of, costs_on
from test_cost_leaks import COST, PRICE, seen_in
from test_items import line, mk, order, people
from test_onboarding import new_business
from test_sign_in import sign_in

NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)
ARABIC = re.compile(r"[؀-ۿ]")
BANNED = re.compile(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon)\b")
KEY = margin.KEY


def sold(name, units, per_unit, costed=None, key=None) -> dict:
    """One item as `gather` hands it over: units sold, units with a cost kept, and what those
    earned (so the margin of one unit is `per_unit`)."""
    costed = units if costed is None else costed
    return {"key": key or name, "name": name, "name_ar": f"{name} ع", "units": Decimal(units),
            "costed": Decimal(costed), "profit": per_unit * costed}


def facts(items, **more) -> Facts:
    return Facts(now=NOW, modules=frozenset({"orders"}), business_type="bakery",
                 started=NOW - timedelta(days=60), extra={KEY: {"items": items}}, **more)


# 30 units over 6 items. The cake sells most (12) and earns QAR 3 a sale; the lowest third
# of six is two items (the cake, the tart). The average is QAR 10.20.
def shop(cake_units=12, drop=0) -> list[dict]:
    items = [
        sold("Oud cake", cake_units, 300), sold("Rose tart", 8, 1400),
        sold("Date roll", 5, 1500), sold("Mint tea", 3, 1600),
        sold("Lemon bar", 1, 1700), sold("Fig loaf", 1, 1800),
    ]
    return items[: len(items) - drop]


def test_it_speaks_at_its_thresholds_and_names_the_best_seller():
    found = margin.find(facts(shop()))
    assert found is not None and found.n == 1
    assert found.numbers == {"name": "Oud cake", "name_ar": "Oud cake ع", "margin": 300,
                             "average": 1020, "costed": 6, "sold": 6}


def test_it_is_quiet_one_unit_short_of_thirty():
    assert margin.find(facts(shop(cake_units=11))) is None  # 29 units
    assert margin.find(facts(shop(cake_units=12))) is not None  # 30 units


def test_it_is_quiet_with_four_costed_items_and_speaks_with_five():
    four = [sold("Oud cake", 12, 300), sold("Rose tart", 8, 1400), sold("Date roll", 5, 1500),
            sold("Mint tea", 5, 1600)]
    five = [sold("Oud cake", 12, 300), sold("Rose tart", 8, 1400), sold("Date roll", 5, 1500),
            sold("Mint tea", 3, 1600), sold("Lemon bar", 2, 1700)]
    assert margin.find(facts(four)) is None
    assert margin.find(facts(five)) is not None  # one item is the lowest third of five


def test_an_item_counts_only_with_a_cost_on_four_in_five_of_its_units():
    # Without the cake, the lowest of the rest is the smallest seller, which is not a best seller.
    rest = [sold("Rose tart", 9, 1800), sold("Date roll", 8, 1700), sold("Mint tea", 6, 1600),
            sold("Lemon bar", 5, 1500), sold("Fig loaf", 4, 1400)]
    exactly_80 = [sold("Oud cake", 10, 300, costed=8), *rest]
    just_under = [sold("Oud cake", 10, 300, costed=7), *rest]
    assert margin.find(facts(exactly_80)) is not None
    assert margin.find(facts(just_under)) is None  # 70%: the cake is left out, nothing remains


def test_an_item_with_no_cost_at_all_does_not_count_as_costed():
    none = [sold("Oud cake", 12, 300, costed=0), *shop()[1:]]
    assert margin.find(facts(none)) is None  # five items, 18 units


def test_it_is_quiet_when_the_best_seller_is_not_among_the_lowest_third():
    high = [sold("Oud cake", 12, 2000), sold("Rose tart", 8, 1900), sold("Date roll", 5, 1800),
            sold("Mint tea", 3, 300), sold("Lemon bar", 1, 400), sold("Fig loaf", 1, 500)]
    assert margin.find(facts(high)) is None


def test_it_is_quiet_when_the_lowest_earner_is_not_one_of_the_three_best_sellers():
    fifth = [sold("Oud cake", 1, 300), sold("Rose tart", 12, 1400), sold("Date roll", 9, 1500),
             sold("Mint tea", 5, 1600), sold("Lemon bar", 3, 1700)]
    assert margin.find(facts(fifth)) is None  # the cake sells fifth of five


def test_it_is_quiet_when_every_item_earns_the_same():
    assert margin.find(facts([sold(n, u, 500) for n, u in
                              [("a", 12), ("b", 8), ("c", 5), ("d", 3), ("e", 1), ("f", 1)]])
                       ) is None


def test_it_reads_the_first_of_several_and_counts_them():
    two = [sold("Oud cake", 12, 300), sold("Rose tart", 8, 400), sold("Date roll", 5, 1500),
           sold("Mint tea", 3, 1600), sold("Lemon bar", 1, 1700), sold("Fig loaf", 1, 1800)]
    found = margin.find(facts(two))
    assert found.n == 2 and found.numbers["name"] == "Oud cake"


def test_finding_does_not_change_what_was_gathered():
    f = facts(shop())
    before = repr(f.extra)
    margin.find(f)
    margin.find(f)
    assert repr(f.extra) == before


def test_it_says_nothing_to_a_reader_who_may_not_see_money():
    assert margin.find(facts(shop(), money=False)) is None
    assert margin.find(facts([])) is None
    assert margin.find(Facts(now=NOW, modules=frozenset({"orders"}))) is None


def test_it_is_a_money_rule_with_a_screen_and_an_honest_rule_line():
    assert margin.INSIGHT.money is True and margin.INSIGHT.kind == "knowledge"
    assert margin.INSIGHT.module == "orders" and margin.INSIGHT.number == 30
    assert margin.INSIGHT.action.href == "/app/catalog"
    assert margin.INSIGHT in rules.INSIGHTS
    assert margin.INSIGHT.rule.en and margin.INSIGHT.rule.ar


@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.parametrize(("several", "average"), [(False, "10.20"), (True, "7.53")])
def test_it_speaks_in_both_languages_with_the_coverage(lang, several, average):
    items = shop()
    if several:
        items[1] = sold("Rose tart", 8, 400)
    f = facts(items)
    found = margin.find(f)
    first, second = margin.INSIGHT.say(found, f, lang)
    text = plain(first) + " " + plain(second)
    for part in (plain(first), plain(second)):
        assert part.strip() and "{" not in part and "}" not in part
        assert not BANNED.search(part.lower()), part
    if lang == "ar":
        assert ARABIC.search(plain(first)) and ARABIC.search(plain(second))
        assert "3" in text and average in text and "6" in text
        assert "ر.ق" in text and "QAR" not in text
    else:
        assert "QAR 3" in text and f"QAR {average}" in text
        assert "Costs are kept for 6 of your 6 items sold in 30 days" in text


def test_the_coverage_is_written_for_every_count():
    f = facts(shop())
    found = margin.find(f)
    found.numbers.update(costed=18, sold=25)
    en = plain(margin.INSIGHT.say(found, f, "en")[1])
    assert "Costs are kept for 18 of your 25 items sold in 30 days." in en
    found.numbers.update(costed=1, sold=1)
    assert "1 of your 1 item sold" in plain(margin.INSIGHT.say(found, f, "en")[1])
    ar = plain(margin.INSIGHT.say(found, f, "ar")[1])
    assert "1" in ar and ARABIC.search(ar)


# ── gather, on real PostgreSQL ─────────────────────────────────────────────────────────────


def put(client, who, lines, *, ago=None, status=None, test=False):
    """An order through the shop's own order path, then moved in time or state by the database
    owner (the way a test of a window has to)."""
    placed = order(client, who, lines).json()
    set_ = []
    if ago is not None:
        set_.append(f"created_at = now() - interval '{ago} days'")
    if status:
        set_.append(f"status = '{status}'")
    if test:
        set_.append("is_test = true")
    if set_:
        owner_sql(f"update orders set {', '.join(set_)} where id = $1::uuid", placed["order_id"])
    return placed


def now_plus() -> datetime:
    return datetime.now(UTC) + timedelta(minutes=5)


def run(client, fn):
    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return await fn(conn)

    return client.portal.call(go)


def gathered(client, **more) -> Facts:
    f = Facts(now=now_plus(), modules=frozenset({"orders", "catalog"}), **more)
    run(client, lambda conn: margin.gather(conn, f))
    return f


def stock(client):
    """Six items with costs kept; the cake's cost is the leak test's recognisable one."""
    costs_on(client)
    made = {}
    for name, price, cost in [
        ("Oud cake", PRICE, COST),  # earns 18,663 a unit
        ("Rose tart", 80_000, 20_000), ("Date roll", 70_000, 20_000),
        ("Mint tea", 60_000, 10_000), ("Lemon bar", 90_000, 10_000),
        ("Fig loaf", 95_000, 5_000),
    ]:
        made[name] = mk(client, name=name, name_ar=name + " ع", category="Cakes", price=price)
        cost_of(client, made[name], cost=cost)
    return made


def by_name(f: Facts) -> dict:
    return {i["name"]: i for i in f.extra[KEY]["items"]}


def costed_week(client):
    """30 units over six costed items: the cake sells most and earns least."""
    items = stock(client)
    a, b = people(client, 2)
    put(client, a, [line(items["Oud cake"], 6), line(items["Rose tart"], 8)])
    put(client, b, [line(items["Oud cake"], 6), line(items["Date roll"], 5),
                    line(items["Mint tea"], 3)])
    put(client, a, [line(items["Lemon bar"], 1), line(items["Fig loaf"], 1)])
    return items


def test_gather_adds_up_what_sold_in_thirty_days(client):
    items = costed_week(client)
    f = gathered(client, money=True)
    got = by_name(f)
    assert set(got) == set(items)
    cake = got["Oud cake"]
    assert (cake["units"], cake["costed"]) == (12, 12)
    assert cake["profit"] == 12 * (PRICE - COST)
    assert got["Rose tart"]["profit"] == 8 * 60_000
    found = margin.find(f)
    assert found is not None
    assert found.numbers["margin"] == PRICE - COST and found.numbers["costed"] == 6
    assert found.numbers["name"] == "Oud cake"


def test_only_the_last_thirty_days_of_real_sales_count(client):
    items = stock(client)
    a, _ = people(client, 2)
    put(client, a, [line(items["Oud cake"], 3)])
    put(client, a, [line(items["Oud cake"], 4)], ago=29)
    put(client, a, [line(items["Oud cake"], 5)], ago=31)
    assert by_name(gathered(client, money=True))["Oud cake"]["units"] == 7


def test_cancelled_and_test_orders_do_not_count(client):
    items = stock(client)
    a, _ = people(client, 2)
    put(client, a, [line(items["Oud cake"], 2)])
    put(client, a, [line(items["Oud cake"], 6)], status="cancelled")
    put(client, a, [line(items["Oud cake"], 7)], test=True)
    assert by_name(gathered(client, money=True))["Oud cake"]["units"] == 2


def test_units_without_a_kept_cost_are_counted_but_not_costed(client):
    costs_on(client)
    cake = mk(client, name="Oud cake", name_ar="كيكة", category="Cakes", price=PRICE)
    a, _ = people(client, 2)
    put(client, a, [line(cake, 4)])  # before a cost is kept: no unit cost on the line
    cost_of(client, cake, cost=COST)
    put(client, a, [line(cake, 6)])
    got = by_name(gathered(client, money=True))["Oud cake"]
    assert (got["units"], got["costed"]) == (10, 6)
    assert got["profit"] == 6 * (PRICE - COST)


def test_a_later_price_or_cost_change_does_not_move_a_sale_already_made(client):
    items = stock(client)
    a, _ = people(client, 2)
    put(client, a, [line(items["Oud cake"], 2)])
    cost_of(client, items["Oud cake"], cost=PRICE + 1)
    client.put(f"/api/items/{items['Oud cake']['id']}", json={"price": 1})
    assert by_name(gathered(client, money=True))["Oud cake"]["profit"] == 2 * (PRICE - COST)


def test_a_discount_is_taken_off_the_earnings(client):
    items = stock(client)
    a, _ = people(client, 2)
    put(client, a, [line(items["Oud cake"], 2)])
    owner_sql("update order_items set discount = 1000 where item_id = $1::uuid",
              items["Oud cake"]["id"])
    assert by_name(gathered(client, money=True))["Oud cake"]["profit"] == 2 * (PRICE - COST) - 1000


def test_nothing_is_gathered_while_the_feature_is_off_or_no_cost_was_ever_kept(client):
    items = stock(client)
    a, _ = people(client, 2)
    put(client, a, [line(items["Oud cake"], 5)])
    costs_on(client, False)  # hides and stops; the kept costs stay
    assert KEY not in gathered(client, money=True).extra
    costs_on(client, True)
    assert KEY in gathered(client, money=True).extra
    owner_sql("delete from order_item_costs where tenant_id = $1", DEMO_TENANT_ID)
    assert KEY not in gathered(client, money=True).extra


def test_an_empty_shop_gathers_nothing_and_says_nothing(client):
    f = gathered(client, money=True)
    assert KEY not in f.extra and margin.find(f) is None
    costs_on(client)
    f = gathered(client, money=True)
    assert KEY not in f.extra and margin.find(f) is None


OTHER_SHOPS: list = []


@pytest.fixture(autouse=True)
def leave_no_other_shop_costs():
    """The second shop outlives the test (the database is shared by the run), and a test in
    test_cost_leaks.py counts the cost rows of every shop but the demo's."""
    yield
    while OTHER_SHOPS:
        tenant = OTHER_SHOPS.pop()
        for table in ("order_item_costs", "order_items", "orders", "items", "contacts",
                      "shop_features"):
            owner_sql(f"delete from {table} where tenant_id = $1", tenant)


def other_shop(client_factory, now):
    """A second business that keeps costs and sold a great deal of one thing."""
    other = client_factory()
    tenant, _, _ = new_business(other, kind="bakery")
    OTHER_SHOPS.append(tenant)

    async def go():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            await conn.execute(
                "insert into shop_features (tenant_id, key, enabled, set_by) "
                "values ($1, 'cost_margin', true, 'owner') "
                "on conflict (tenant_id, key) do update set enabled = true", tenant)
            who = await conn.fetchval(
                "insert into contacts (tenant_id, phone, name) values ($1, $2, 'Zed') "
                "returning id", tenant, f"9745{uuid4().int % 10**7:07d}")
            item = await conn.fetchval(
                "insert into items (tenant_id, name, price) values ($1, 'Other shop special', "
                "99999) returning id", tenant)
            number = await conn.fetchval(
                "select coalesce(max(number), 0) + 1 from orders where tenant_id = $1", tenant)
            placed = await conn.fetchval(
                "insert into orders (tenant_id, contact_id, number, total, status, created_at) "
                "values ($1, $2, $3, 9999900, 'done', $4) returning id",
                tenant, who, number, now - timedelta(days=2))
            line_ = await conn.fetchval(
                "insert into order_items (tenant_id, order_id, item_id, name, price, quantity) "
                "values ($1, $2, $3, 'Other shop special', 99999, 100) returning id",
                tenant, placed, item)
            await conn.execute(
                "insert into order_item_costs (tenant_id, order_item_id, unit_cost) "
                "values ($1, $2, 1)", tenant, line_)
        finally:
            await conn.close()

    asyncio.run(go())
    # Building a second app reset the demo shop, which put its Catalog module back off.
    owner_sql(
        "insert into tenant_modules (tenant_id, module_key, enabled_by) "
        "values ($1, 'catalog', 'test') on conflict (tenant_id, module_key) "
        "do update set enabled = true", DEMO_TENANT_ID)
    return tenant


def test_another_shops_sales_never_show_up_and_it_reads_its_own(client, client_factory):
    now = now_plus()
    tenant_b = other_shop(client_factory, now)
    items = stock(client)
    a, _ = people(client, 2)
    put(client, a, [line(items["Oud cake"], 2)])
    mine = gathered(client, money=True)
    assert "Other shop special" not in by_name(mine)
    assert by_name(mine)["Oud cake"]["units"] == 2

    async def theirs():
        f = Facts(now=now, modules=frozenset({"orders", "catalog"}), money=True)
        async with client.app.state.db.tenant(tenant_b) as conn:
            await margin.gather(conn, f)
        return f

    their = client.portal.call(theirs)
    assert set(by_name(their)) == {"Other shop special"}
    assert by_name(their)["Other shop special"]["units"] == 100
    assert "Oud cake" not in by_name(their)


def test_a_shop_that_kept_no_costs_is_not_given_anothers(client, client_factory):
    """The second shop's rows exist and its cost feature is on; this shop never switched it
    on, so its Facts hold nothing (the check is the shop's own, not the database's)."""
    other_shop(client_factory, now_plus())
    assert KEY not in gathered(client, money=True).extra


# ── who may ever see a cost through this rule ──────────────────────────────────────────────


def staff(role, user_id=None):
    return Staff(user_id, role.title(), f"{role}@example.test", role, DEMO_TENANT_ID)


def facts_for(client, role):
    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return await agent_facts.gather(conn, staff(role), now_plus())

    return client.portal.call(go)


def test_a_managers_facts_carry_it_and_a_staff_members_never_do(client):
    costed_week(client)
    for role in ("owner", "admin"):
        mine = facts_for(client, role)
        assert mine.money is True and KEY in mine.extra, role
        assert margin.find(mine) is not None, role
    for role in ("agent", "someone-else"):
        theirs = facts_for(client, role)
        assert theirs.money is False and KEY not in theirs.extra, role
        assert margin.find(theirs) is None, role
        # …and the whole of what they were handed holds no cost figure.
        assert not seen_in(repr(theirs.__dict__)), role


def test_the_rule_is_not_gathered_for_a_reader_who_may_not_see_money(client, monkeypatch):
    costed_week(client)
    called = []

    async def spy(conn, f):
        called.append(f.money)

    monkeypatch.setattr(margin, "gather", spy)

    async def go(money):
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await rules.gather_all(conn, Facts(now=now_plus(), modules=frozenset({"orders"}),
                                              money=money))

    client.portal.call(go, False)
    assert called == []
    client.portal.call(go, True)
    assert called == [True]  # (so the spy does see a manager: the first line proves something)


def test_a_gather_given_a_non_manager_gathers_nothing_even_if_called_directly(client):
    costed_week(client)
    f = gathered(client, money=False)
    assert KEY not in f.extra


def test_what_the_agent_role_is_sent_holds_no_cost_and_no_margin_card(client):
    costed_week(client)
    sign_in(client, AGENT_EMAIL)
    for lang in ("en", "ar"):
        answer = client.get("/api/agent", params={"lang": lang})
        assert answer.status_code == 200
        body = answer.text
        assert not seen_in(body), seen_in(body)
        assert '"key":"margin"' not in body.replace(" ", "")
        assert "Oud cake earns" not in body and "Oud cake is a best seller" not in body
    rendered = view.render(facts_for(client, "agent"), "en")
    assert "margin" not in [c["key"] for c in rendered["suggestions"]]
    assert not seen_in(repr(rendered))


def test_the_owner_is_the_one_who_reads_it(client):
    costed_week(client)
    f = facts_for(client, "owner")
    rendered = view.render(f, "en")
    keys = [c["key"] for c in rendered["suggestions"]]
    # (at most three cards are shown; it may be crowded out by owed money, so it is also asked
    # of the rule directly)
    found = margin.find(f)
    assert found is not None
    first, _ = margin.INSIGHT.say(found, f, "en")
    assert plain(first) == "Oud cake is a best seller and earns QAR 186.63 a sale"
    if "margin" in keys:
        card = next(c for c in rendered["suggestions"] if c["key"] == "margin")
        assert card["action"]["href"] == "/app/catalog"
        assert plain(card["title"]) == plain(first)
    sign_in(client, OWNER_EMAIL)
    assert client.get("/api/agent").status_code == 200
