"""Agent rule `carts` (insights plan C4): customers who started an order in the chat and did not
finish it. Pure checks of the threshold and the words, then the real query on real PostgreSQL:
what is counted, what is left out, the value, another shop's rows, and an empty shop."""

import asyncio
import re
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import pytest

from alyr.db import Database
from alyr.modules.agent import rules, view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY
from alyr.modules.agent.rules import carts
from alyr.modules.agent.words import plain
from alyr.modules.items import chat_cart
from conftest import APP_DSN, OWNER_DSN
from test_agent import ARABIC, EVERYTHING, NOW, facts, keys

KEY = carts.KEY
INSIGHT = carts.INSIGHT


def stored(n: int = 3, value: int = 6_000) -> dict:
    rows = [(f"id-{i}", f"Customer {i}", value // n) for i in range(min(n, 10))]
    return {KEY: {"n": n, "value": value, "rows": rows}}


# ── the pure rule ───────────────────────────────────────────


def test_it_is_registered_as_number_26_and_needs_the_orders_module_and_money():
    assert INSIGHT_BY_KEY[KEY] is INSIGHT and INSIGHT.number == 26
    assert INSIGHT.module == "orders" and INSIGHT.money is True
    # Knowledge, not a money card: it asks for nothing to be paid, it has no action to put
    # Volt on, and only a knowledge card can be set aside with "Not now" (view.py).
    assert INSIGHT.kind == "knowledge" and INSIGHT.action is None and INSIGHT.status


@pytest.mark.parametrize("extra", [
    {},  # nothing gathered (the module is off, or the reader may not see money)
    stored(0, 0),
    stored(2, 5_000),  # one short of three people
    stored(3, 0),  # three drafts with nothing to pay for
])
def test_quiet_just_short_of_its_threshold(extra):
    assert INSIGHT.find(facts(extra=extra)) is None


def test_speaks_at_three_people():
    found = INSIGHT.find(facts(extra=stored(3, 6_000)))
    assert found is not None and found.n == 3
    assert found.numbers == {"n": 3, "value": 6_000}
    assert [r.label for r in found.rows] == ["Customer 0", "Customer 1", "Customer 2"]


@pytest.mark.parametrize("n", [3, 4, 10, 11, 40])
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_speaks_in_both_languages(n, lang):
    f = facts(extra=stored(n, 123_450))
    found = INSIGHT.find(f)
    first, second = INSIGHT.say(found, f, lang)
    for parts in (first, second):
        text = plain(parts)
        assert text.strip() and "{" not in text and "}" not in text, text
    words = (plain(first) + " " + plain(second)).lower()
    assert not re.search(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon)\b", words), words
    assert "قريباً" not in words
    if lang == "ar":
        assert ARABIC.search(plain(first)) and ARABIC.search(plain(second))
        assert "ر.ق" in plain(first) and "QAR" not in plain(first)
    else:
        assert not ARABIC.search(words)
        assert f"{n} customers" in plain(first) and "QAR" in plain(first)
    # The figure is kept whole on screen.
    assert any(isinstance(p, dict) and "1,234.50" in p["b"] for p in first)


def test_the_arabic_verb_agrees_with_the_count():
    three = plain(INSIGHT.say(INSIGHT.find(facts(extra=stored(3, 600))), facts(), "ar")[0])
    assert "عملاء بدؤوا طلباً في المحادثة ولم يكملوه" in three


def test_the_rule_line_states_what_it_counts_in_both_languages():
    assert "3 or more" in INSIGHT.rule.en and "1 to 6 hours" in INSIGHT.rule.en
    assert ARABIC.search(INSIGHT.rule.ar) and "6" in INSIGHT.rule.ar


def test_a_reader_who_may_not_see_money_gets_no_card():
    extra = stored(5, 20_000)
    rendered = view.render(facts(extra=extra, money=True), "en")
    assert KEY in keys(rendered["suggestions"])
    card = next(c for c in rendered["suggestions"] if c["key"] == KEY)
    assert card["status"] == "Information only." and card["action"] is None
    assert not card["primary"]  # Volt marks work to do; this is something to know
    assert KEY not in keys(view.render(facts(extra=extra, money=False), "en")["suggestions"])


class Untouched:
    """A connection that fails the test if the rule asks it anything."""

    async def fetch(self, *a, **k):
        raise AssertionError("the rule queried the database when it should not have")


def test_gather_all_does_not_run_it_without_money_or_without_the_orders_module(monkeypatch):
    # Only this rule: the others, registered beside it, rightly query for a reader with no money.
    monkeypatch.setattr(rules, "RULES", tuple(r for r in rules.RULES if r.INSIGHT.key == KEY))

    async def go():
        no_money = Facts(now=NOW, modules=EVERYTHING, money=False)
        await rules.gather_all(Untouched(), no_money)
        no_orders = Facts(now=NOW, modules=frozenset({"inbox"}), money=True)
        await rules.gather_all(Untouched(), no_orders)
        assert KEY not in no_money.extra and KEY not in no_orders.extra

    asyncio.run(go())


# ── the real query ──────────────────────────────────────────


def hours(n: float) -> datetime:
    return datetime.now(UTC) - timedelta(hours=n)


async def make_shop(owner: asyncpg.Connection, name: str) -> dict:
    tenant = uuid4()
    await owner.execute("insert into tenants (id, name) values ($1, $2)", tenant, name)
    return {"id": tenant, "name": name}


async def make_customer(owner, shop, name, role="customer", wa_user_id=None) -> dict:
    row = await owner.fetchrow(
        "insert into contacts (tenant_id, phone, name, role, wa_user_id) "
        "values ($1, $2, $3, $4, $5) returning id",
        shop["id"], f"9745{uuid4().int % 10**7:07d}", name, role, wa_user_id,
    )
    return row["id"]


class Drafts:
    """Drafts made the way the chat makes them (chat_cart.open_for and save). The product stamps
    `updated_at` with the database's clock, so `age` moves them in time afterwards, once every
    draft exists: making one clears the shop's expired ones, as the chat does."""

    def __init__(self, db, owner):
        self.db, self.owner, self.timings = db, owner, []

    async def start(self, shop, contact, lines, touched, expires=None) -> None:
        async with self.db.tenant(shop["id"]) as conn:
            cart = await chat_cart.open_for(conn, contact)
            cart.lines = lines
            await chat_cart.save(conn, cart)
        expires = expires or touched + chat_cart.CART_LIFE
        self.timings.append((shop["id"], contact, touched, expires))

    async def age(self) -> None:
        for tenant, contact, touched, expires in self.timings:
            await self.owner.execute(
                "update chat_carts set updated_at = $3, expires_at = $4 "
                "where tenant_id = $1 and contact_id = $2", tenant, contact, touched, expires,
            )


def line(price: int, quantity) -> dict:
    return {"item_id": str(uuid4()), "variant_id": None, "quantity": quantity, "price": price}


async def place_order(owner, shop, contact, number, created) -> None:
    await owner.execute(
        "insert into orders (tenant_id, contact_id, number, total, created_at) "
        "values ($1, $2, $3, 1000, $4)", shop["id"], contact, number, created,
    )


async def read(db, shop, now=None) -> dict:
    async with db.tenant(shop["id"], readonly=True) as conn:
        f = Facts(now=now or datetime.now(UTC), modules=EVERYTHING, money=True)
        await carts.gather(conn, f)
        return f.extra[KEY]


def scenario():
    async def go():
        owner = await asyncpg.connect(OWNER_DSN)
        db = Database(APP_DSN)
        await db.connect()
        drafts = Drafts(db, owner)
        try:
            a = await make_shop(owner, "Carts A")
            b = await make_shop(owner, "Carts B")
            empty = await make_shop(owner, "Carts empty")
            await make_customer(owner, empty, "Nobody ordering")

            # Shop A: three drafts that count, and the ones that must not.
            c1 = await make_customer(owner, a, "Counted one")
            await drafts.start(a, c1, [line(1_500, 2), line(1_000, 0.5)], hours(2))
            c2 = await make_customer(owner, a, "Counted fraction")
            await drafts.start(a, c2, [line(333, 1.5)], hours(3))  # 499.5, half up: 500
            c3 = await make_customer(owner, a, "Ordered before the draft")
            await place_order(owner, a, c3, 1, hours(5))
            await drafts.start(a, c3, [line(2_000, 1)], hours(2))
            still_typing = await make_customer(owner, a, "Still typing")
            await drafts.start(a, still_typing, [line(9_000, 1)], hours(0.5))
            ordered_after = await make_customer(owner, a, "Ordered after")
            await drafts.start(a, ordered_after, [line(9_000, 1)], hours(2))
            await place_order(owner, a, ordered_after, 2, hours(1))
            gone = await make_customer(owner, a, "Draft ran out")
            await drafts.start(a, gone, [line(9_000, 1)], hours(8), expires=hours(2))
            staff = await make_customer(owner, a, "A staff member", role="staff")
            await drafts.start(a, staff, [line(9_000, 1)], hours(2))
            blank = await make_customer(owner, a, "Emptied it")
            await drafts.start(a, blank, [], hours(2))
            tester = await make_customer(owner, a, "Test contact", wa_user_id="TEST.1")
            await drafts.start(a, tester, [line(9_000, 1)], hours(2))

            # Shop B: four drafts of its own, worth a great deal, that A must never see.
            for i in range(4):
                who = await make_customer(owner, b, f"B customer {i}")
                await drafts.start(b, who, [line(100_000, 1)], hours(2))

            await drafts.age()
            return {
                "a": await read(db, a), "b": await read(db, b), "empty": await read(db, empty),
                "in_table": await owner.fetchval(
                    "select count(*) from chat_carts where tenant_id = $1", a["id"]),
                "ids": {"c1": str(c1), "c2": str(c2), "c3": str(c3)},
            }
        finally:
            await db.close()
            await owner.close()

    return asyncio.run(go())


@pytest.fixture(scope="module")
def seen():
    return scenario()


def test_counts_only_drafts_idle_for_an_hour_and_not_yet_expired_with_no_order_since(seen):
    got = seen["a"]
    assert got["n"] == 3
    assert {r[0] for r in got["rows"]} == set(seen["ids"].values())


def test_the_table_holds_nine_drafts_of_this_shop_and_three_of_them_count(seen):
    # Else the left-out cases could all have been cleared away before the query ran.
    assert seen["in_table"] == 9


def test_the_value_is_each_line_price_times_quantity_rounded_half_up(seen):
    # 1,500 x 2 + 1,000 x 0.5 = 3,500 | 333 x 1.5 = 499.5, which is 500 | 2,000 x 1 = 2,000
    assert seen["a"]["value"] == 3_500 + 500 + 2_000
    by_id = {r[0]: r[2] for r in seen["a"]["rows"]}
    assert by_id[seen["ids"]["c1"]] == 3_500 and by_id[seen["ids"]["c2"]] == 500
    assert [r[2] for r in seen["a"]["rows"]] == [3_500, 2_000, 500]  # largest first


def test_another_shops_drafts_are_not_counted_here_or_there(seen):
    assert seen["b"]["n"] == 4 and seen["b"]["value"] == 400_000
    assert not {r[0] for r in seen["b"]["rows"]} & {r[0] for r in seen["a"]["rows"]}


def test_a_shop_with_no_drafts_gets_zeroes_and_no_card(seen):
    assert seen["empty"] == {"n": 0, "value": 0, "rows": []}
    assert INSIGHT.find(facts(extra={KEY: seen["empty"]})) is None


def test_what_the_database_found_becomes_the_card(seen):
    f = facts(extra={KEY: seen["a"]})
    found = INSIGHT.find(f)
    assert found.n == 3 and found.numbers["value"] == 6_000
    assert "QAR 60" in plain(INSIGHT.say(found, f, "en")[0])


def test_a_draft_older_than_its_six_hours_stops_counting_at_the_moment_it_expires():
    """The same drafts, read at three moments: too early, in the window, after they expired."""

    async def go():
        owner = await asyncpg.connect(OWNER_DSN)
        db = Database(APP_DSN)
        await db.connect()
        drafts = Drafts(db, owner)
        try:
            shop = await make_shop(owner, "Carts window")
            touched = datetime(2026, 10, 15, 6, 0, tzinfo=UTC)
            for i in range(3):
                who = await make_customer(owner, shop, f"Window {i}")
                await drafts.start(shop, who, [line(1_000, 1)], touched)
            await drafts.age()
            return [
                (await read(db, shop, touched + after))["n"]
                for after in (timedelta(minutes=59), timedelta(hours=1),
                              timedelta(hours=5, minutes=59), timedelta(hours=6),
                              timedelta(hours=7))
            ]
        finally:
            await db.close()
            await owner.close()

    assert asyncio.run(go()) == [0, 3, 3, 0, 0]
