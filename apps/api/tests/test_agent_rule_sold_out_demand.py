"""ALYR Agent rule 27, sold-out demand (plan row C5): customers who asked for an item while it
was sold out, in the last 30 days, and how many of them are waiting to be told when it is back.

Two kinds of test, as the rule brief asks: the rule on its own (facts in, two lines out, in
both languages, quiet just below its threshold), and `gather` against a real PostgreSQL, with
the rows the Catalog writes, a second shop whose rows must not show up (row-level security),
a shop with nothing, and a shop without the Catalog.
"""

import re
from datetime import timedelta

import pytest

from alyr.core.auth import Staff
from alyr.modules.agent import facts as agent_facts
from alyr.modules.agent import rules, view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY, INSIGHTS
from alyr.modules.agent.model import applies
from alyr.modules.agent.rules import sold_out_demand as rule
from alyr.modules.agent.words import plain
from test_agent import ARABIC, NOW, facts
from test_consent import owner_sql

KEY = rule.KEY
INSIGHT = rule.INSIGHT
BANNED = re.compile(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon)\b|قريباً")


def item(name="Almond cake", name_ar="كعكة اللوز", people=3, waiting=0):
    return {"id": f"item-{name}", "name": name, "name_ar": name_ar, "people": people,
            "waiting": waiting}


def known(*items) -> dict:
    return {"extra": {KEY: {"items": list(items)}}}


def said(f: Facts, lang: str) -> tuple[str, str]:
    found = INSIGHT.find(f)
    assert found is not None
    first, second = INSIGHT.say(found, f, lang)
    return plain(first), plain(second)


# ── the rule on its own ───────────────────────────────────


def test_it_is_registered_as_rule_27_with_a_screen_to_open():
    assert rule in rules.RULES
    assert INSIGHT_BY_KEY[KEY] is INSIGHT and INSIGHT in INSIGHTS
    assert (INSIGHT.number, INSIGHT.kind, INSIGHT.module) == (27, "knowledge", "orders")
    assert INSIGHT.money is False and INSIGHT.status is None
    assert INSIGHT.action.href == "/app/catalog?show=sold_out"
    assert applies(INSIGHT, frozenset({"orders"})) and not applies(INSIGHT, frozenset({"inbox"}))


def test_it_is_quiet_with_nothing_gathered_or_just_below_three_customers():
    assert INSIGHT.find(facts()) is None
    assert INSIGHT.find(facts(extra={KEY: {"items": []}})) is None
    assert INSIGHT.find(facts(**known(item(people=2, waiting=2)))) is None
    # Two items with two customers each are two coincidences, not a pattern.
    assert INSIGHT.find(facts(**known(item("A", people=2), item("B", people=2)))) is None


def test_it_speaks_at_three_customers_and_names_the_top_item():
    f = facts(**known(item(people=3, waiting=1)))
    found = INSIGHT.find(f)
    assert found.n == 3 and [r.label for r in found.rows] == ["Almond cake"]
    assert said(f, "en") == (
        "3 customers asked for Almond cake in 30 days while it was sold out",
        "1 of them is waiting to be told when it is back.",
    )


def test_only_items_with_three_or_more_customers_are_named_and_the_top_one_leads():
    f = facts(**known(item("Almond cake", people=17, waiting=9), item("Date bun", "كعكة التمر", 4),
                      item("Pistachio roll", "لفة الفستق", 2)))
    found = INSIGHT.find(f)
    assert [r.label for r in found.rows] == ["Almond cake", "Date bun"]
    assert found.n == 17
    first, second = said(f, "en")
    assert first == "17 customers asked for Almond cake in 30 days while it was sold out"
    assert second == "9 of them are waiting to be told when it is back. Also asked for: Date bun."
    first_ar, second_ar = said(f, "ar")
    assert "كعكة اللوز" in first_ar and "كعكة التمر" in second_ar
    assert "Pistachio" not in second and "الفستق" not in second_ar


@pytest.mark.parametrize("waiting,english", [
    (0, "None of them is waiting to be told when it is back."),
    (1, "1 of them is waiting to be told when it is back."),
    (2, "2 of them are waiting to be told when it is back."),
    (5, "All of them are waiting to be told when it is back."),
])
def test_it_says_how_many_are_waiting_to_be_told(waiting, english):
    f = facts(**known(item(people=5, waiting=waiting)))
    assert said(f, "en")[1] == english


@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.parametrize("waiting", [0, 1, 2, 4, 5])
@pytest.mark.parametrize("people", [3, 5, 17])
def test_both_languages_are_whole_sentences_without_guessing_words(lang, waiting, people):
    if waiting > people:
        return
    f = facts(**known(item(people=people, waiting=waiting), item("Date bun", "كعكة التمر", 3)))
    first, second = said(f, lang)
    for text in (first, second):
        assert text.strip()
        assert "{" not in text and "}" not in text, text
        assert not BANNED.search(text.lower()), text
    if lang == "ar":
        assert ARABIC.search(first) and ARABIC.search(second)
        # The figures are Western digits; the item's Arabic name stands in for its English one.
        assert str(people) in first and "كعكة اللوز" in first and "Almond" not in first
    else:
        assert not ARABIC.search(first + second.replace("Date bun", ""))
        assert str(people) in first and "Almond cake" in first


def test_the_arabic_falls_back_to_the_english_name_when_there_is_no_arabic_one():
    f = facts(**known(item("Almond cake", "", people=4, waiting=0)))
    assert "Almond cake" in said(f, "ar")[0]


def test_a_card_set_aside_with_not_now_comes_back_when_the_numbers_move():
    def finger(**kw):
        return INSIGHT.find(facts(**known(item(**kw)))).fingerprint(KEY)

    assert finger(people=5, waiting=2) == finger(people=5, waiting=2)
    assert finger(people=5, waiting=2) != finger(people=6, waiting=2)
    assert finger(people=5, waiting=2) != finger(people=5, waiting=3)


def test_the_card_reaches_the_screen_for_a_manager_and_for_staff_without_money():
    base = {"orders": 41, "orders_last": 33, "sales": 312_000, "sales_last": 290_000,
            "came_back": 12, "came_back_last": 9, "orders_30d": 80}
    for money in (True, False):
        f = facts(**base, money=money, **known(item("Almond cake", people=17, waiting=9)))
        cards = {c["key"]: c for c in view.render(f, "en")["suggestions"]}
        assert KEY in cards, (money, list(cards))
        card = cards[KEY]
        assert card["action"] == {"label": "Show the sold out items",
                                  "href": "/app/catalog?show=sold_out"}
        assert card["rule"].startswith("RULE · 3 or more customers asked for the same item")
        assert card["rule"].endswith("17 customers")
        assert [r["label"] for r in card["rows"]] == ["Almond cake"]


# ── gather, on a real database ────────────────────────────

THEN = NOW - timedelta(days=3)


def shop(name="Cake shop", modules=("orders", "catalog")):
    tenant = owner_sql("insert into tenants (name) values ($1) returning id", name)[0]["id"]
    for module in modules:
        owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, $2)",
                  tenant, module)
    return tenant


def make_item(tenant, name, name_ar="", status="live"):
    return owner_sql(
        "insert into items (tenant_id, name, name_ar, price, status) "
        "values ($1, $2, $3, 5000, $4) returning id", tenant, name, name_ar, status,
    )[0]["id"]


_phones = iter(range(5_000_000, 6_000_000))


def person(tenant, back_in_stock="granted", role="customer", wa_user_id=None):
    n = next(_phones)
    return owner_sql(
        "insert into contacts (tenant_id, phone, name, role, wa_user_id, consent_back_in_stock) "
        "values ($1, $2, $3, $4, $5, $6) returning id",
        tenant, f"+974{n}", f"Customer {n}", role, wa_user_id, back_in_stock,
    )[0]["id"]


def ask(tenant, who, what, when=THEN, via="whatsapp"):
    owner_sql(
        "insert into sold_out_asks (tenant_id, contact_id, item_id, day, via, created_at) "
        "values ($1, $2, $3, $4::timestamptz::date, $5, $6) on conflict do nothing",
        tenant, who, what, when, via, when,
    )


def watch(tenant, who, what, status="waiting", expires=NOW + timedelta(days=10)):
    owner_sql(
        "insert into stock_watches (tenant_id, contact_id, item_id, status, expires_at) "
        "values ($1, $2, $3, $4, $5)", tenant, who, what, status, expires,
    )


def read(client, tenant, modules=frozenset({"orders", "catalog"}), money=True) -> Facts:
    async def go():
        f = Facts(now=NOW, modules=modules, money=money)
        async with client.app.state.db.tenant(tenant) as conn:
            await rules.gather_all(conn, f)
        return f

    return client.portal.call(go)


def gathered(client, tenant, **kw) -> list[dict]:
    return read(client, tenant, **kw).extra.get(KEY, {}).get("items", [])


def test_it_counts_distinct_customers_per_item_over_30_days(client):
    tenant = shop()
    cake = make_item(tenant, "Almond cake", "كعكة اللوز")
    bun = make_item(tenant, "Date bun", "كعكة التمر")
    roll = make_item(tenant, "Pistachio roll", "لفة الفستق")
    rare = make_item(tenant, "Saffron tart")
    old = make_item(tenant, "Old loaf", status="archived")
    c1, c2, c3, c4, c5, c6 = (person(tenant) for _ in range(6))

    # c1 asks for the cake on three different days: one customer.
    for days in (3, 4, 20):
        ask(tenant, c1, cake, NOW - timedelta(days=days))
    for who in (c2, c3, c4, c5):
        ask(tenant, who, cake)
    # c6 asked 31 days ago: outside the 30 days. A customer is not counted for the day after.
    ask(tenant, c6, cake, NOW - timedelta(days=31))
    # Not customers: staff, and the owner's own test line.
    ask(tenant, person(tenant, role="staff"), cake)
    ask(tenant, person(tenant, wa_user_id="TEST.owner"), cake)
    # A phone-only customer (no WhatsApp user ID) is a customer and counts.
    ask(tenant, person(tenant), cake)
    # The bun: three customers, one of them also asked for the cake.
    for who in (c1, c2, c3):
        ask(tenant, who, bun)
    # The roll has two, the tart one, the archived loaf four: only the roll and tart can show,
    # and the card names at most three items.
    for who in (c1, c2):
        ask(tenant, who, roll)
    ask(tenant, c1, rare)
    for who in (c1, c2, c3, c4):
        ask(tenant, who, old)

    # Waiting for the cake: c1 (counts); c2 whose agreement was taken back; c3 whose request
    # has expired; c4 who was already told; c5 who cancelled. Waiting for the bun: c1, c2, c3.
    watch(tenant, c1, cake)
    owner_sql("update contacts set consent_back_in_stock = 'revoked' where id = $1", c2)
    watch(tenant, c2, cake)
    watch(tenant, c3, cake, expires=NOW - timedelta(days=1))
    watch(tenant, c4, cake, status="sent")
    watch(tenant, c5, cake, status="cancelled")
    for who in (c1, c3):
        watch(tenant, who, bun)

    got = gathered(client, tenant)
    assert [(i["name"], i["name_ar"], i["people"], i["waiting"]) for i in got] == [
        ("Almond cake", "كعكة اللوز", 6, 1),   # c1..c5 and the phone-only customer
        ("Date bun", "كعكة التمر", 3, 2),
        ("Pistachio roll", "لفة الفستق", 2, 0),
    ]
    assert all(set(i) == {"id", "name", "name_ar", "people", "waiting"} for i in got)
    # What the owner reads: the roll is under three customers and is left out.
    f = read(client, tenant)
    found = INSIGHT.find(f)
    assert [r.label for r in found.rows] == ["Almond cake", "Date bun"] and found.n == 6
    assert said(f, "en")[0] == "6 customers asked for Almond cake in 30 days while it was sold out"


def test_it_never_shows_another_shops_asks(client):
    mine, theirs = shop("My cakes"), shop("Their cakes")
    my_cake, their_cake = make_item(mine, "Almond cake"), make_item(theirs, "Almond cake")
    for _ in range(3):
        ask(mine, person(mine), my_cake)
    for _ in range(9):
        who = person(theirs)
        ask(theirs, who, their_cake)
        watch(theirs, who, their_cake)
    # Each shop reads only its own rows, through row-level security.
    assert [(i["people"], i["waiting"]) for i in gathered(client, mine)] == [(3, 0)]
    assert [(i["people"], i["waiting"]) for i in gathered(client, theirs)] == [(9, 9)]


def test_a_shop_with_no_asks_gathers_nothing_and_the_rule_is_quiet(client):
    empty = shop("Empty")
    make_item(empty, "Almond cake")
    f = read(client, empty)
    assert f.extra[KEY] == {"items": []}
    assert INSIGHT.find(f) is None


def test_a_shop_without_the_catalog_is_not_asked(client):
    tenant = shop("No catalog", modules=("orders",))
    cake = make_item(tenant, "Almond cake")
    for _ in range(5):
        ask(tenant, person(tenant), cake)
    f = read(client, tenant, modules=frozenset({"orders"}))
    assert KEY not in f.extra and INSIGHT.find(f) is None


def test_staff_who_may_not_see_money_still_get_it_because_it_is_not_money(client):
    tenant = shop()
    cake = make_item(tenant, "Almond cake")
    for _ in range(4):
        ask(tenant, person(tenant), cake)
    assert [i["people"] for i in gathered(client, tenant, money=False)] == [4]


def test_the_agent_gathers_it_with_everything_else(client):
    tenant = shop()
    cake = make_item(tenant, "Almond cake", "كعكة اللوز")
    for _ in range(3):
        who = person(tenant)
        ask(tenant, who, cake)
        watch(tenant, who, cake)

    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            return await agent_facts.gather(conn, Staff(None, "Owner", "", "owner", tenant), NOW)

    f = client.portal.call(go)
    assert f.extra[KEY]["items"][0]["people"] == 3
    assert said(f, "ar")[1].startswith("كلهم ينتظرون")


def test_the_one_query_is_bounded_in_time_and_in_rows():
    # `sold_out_asks_week (tenant_id, created_at)` answers the window; the answer is at most
    # three items (the EXPLAIN is in the commit message).
    assert rule.DAYS == 30 and rule.MAX_ITEMS == 3
    assert "a.created_at > $1 and a.created_at <= $2" in rule._ASKED
    assert "limit $3" in rule._ASKED
