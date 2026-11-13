"""Agent rule 35, "discounts given" (`modules/agent/rules/discounts.py`, plan row M2).

Two halves, as the rule brief asks. The first needs no database: the words at the threshold in
both languages, quiet just short of it, and the manager-only number. The second gathers from a
real PostgreSQL: the 30 days, the cancelled and test orders left out, the biggest rule named, a
second shop whose rows must not show up (row-level security), an empty shop, and the switch.
"""

import asyncio
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.core.auth import Staff
from alyr.db import Database
from alyr.modules.agent import facts as facts_
from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY
from alyr.modules.agent.rules import discounts
from alyr.modules.agent.words import plain
from conftest import APP_DSN, OWNER_DSN
from test_agent import facts as make_facts
from test_onboarding import new_business

KEY = discounts.KEY
NOW = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
ARABIC = re.compile(r"[؀-ۿ]")


def data(**values) -> dict:
    base = {"total": 14_000, "orders": 12, "top_amount": 12_000, "top_label": "Ramadan 10",
            "top_label_ar": "رمضان 10"}
    return base | values


def speak(extra: dict, lang: str, **more):
    f = make_facts(extra={KEY: extra}, **more)
    found = INSIGHT_BY_KEY[KEY].find(f)
    assert found is not None
    first, second = INSIGHT_BY_KEY[KEY].say(found, f, lang)
    return plain(first), plain(second), found


# ── the words and the thresholds, no database ─────────────────────────────────────────────


def test_it_is_registered_as_rule_35_a_money_rule_of_the_orders_module():
    insight = INSIGHT_BY_KEY[KEY]
    assert (insight.number, insight.kind, insight.module, insight.money) == (
        35, "knowledge", "orders", True)
    # Its card points at a screen that exists (the Catalog's Discounts button), not at a promise.
    assert insight.action and insight.action.href == "/app/catalog" and insight.status is None


@pytest.mark.parametrize("extra", [
    data(orders=9),  # nine orders: one short
    data(total=0, top_amount=0),
    None,
])
def test_it_is_quiet_just_below_ten_orders_and_with_nothing_gathered(extra):
    f = make_facts(extra={KEY: extra} if extra is not None else {})
    assert INSIGHT_BY_KEY[KEY].find(f) is None


def test_it_speaks_at_ten_orders():
    f = make_facts(extra={KEY: data(orders=10)})
    found = INSIGHT_BY_KEY[KEY].find(f)
    assert found is not None and found.n == 10


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_it_speaks_in_both_languages_with_no_guessing_words(lang):
    first, second, found = speak(data(), lang)
    for text in (first, second):
        assert text.strip() and "{" not in text and "}" not in text, text
    if lang == "ar":
        assert ARABIC.search(first) and ARABIC.search(second)
        assert "QAR" not in first and "ر.ق" in first  # the Arabic page never says QAR
        assert "رمضان 10" in second  # the Arabic name of the rule
    else:
        assert "QAR" in first and "140" in first
        assert "86%" in second and "Ramadan 10" in second and "12 orders" in second
        assert not ARABIC.search(first + second)
    words = (first + " " + second).lower()
    assert not re.search(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon)\b", words), words
    assert "قريباً" not in words
    # It says what was given and from where, never what the discounts did to the orders.
    assert not re.search(r"larger|bigger|lifted|boost|grew|more sales|أكبر|ارتفع|زاد", words)


def test_the_english_text_is_exact():
    first, second, _ = speak(data(), "en")
    assert first == "You gave away QAR 140 in discounts in 30 days"
    assert second == "12 orders had a discount; 86% of the amount came from “Ramadan 10”."


def test_the_arabic_agrees_with_the_count_and_keeps_the_name_whole():
    first, second, found = speak(data(orders=12), "ar")
    assert first == "بلغت الخصومات التي منحتها 140 ر.ق خلال 30 يوماً"
    assert second == "12 طلباً عليها خصم، و86% من المبلغ جاء من «رمضان 10»."
    ten = speak(data(orders=10), "ar")[1]
    assert ten.startswith("10 طلبات عليها خصم")  # the plural of three to ten
    f = make_facts(extra={KEY: data()})
    parts = INSIGHT_BY_KEY[KEY].say(INSIGHT_BY_KEY[KEY].find(f), f, "ar")[1]
    assert {"b": "رمضان 10"} in parts and {"b": "86%"} in parts


def test_when_the_arabic_name_is_missing_the_other_name_is_used():
    second = speak(data(top_label_ar=""), "ar")[1]
    assert "«Ramadan 10»" in second


def test_one_rule_giving_all_of_it_is_said_so_and_never_rounds_up_to_a_hundred():
    only = speak(data(total=12_000, top_amount=12_000), "en")[1]
    assert only == "12 orders had a discount, all of it from “Ramadan 10”."
    all_ar = speak(data(total=12_000, top_amount=12_000), "ar")[1]
    assert all_ar.endswith("والمبلغ كله من «رمضان 10».")
    # 99.6% of the money is not "all of it".
    almost = speak(data(total=100_000, top_amount=99_600), "en")[1]
    assert "99%" in almost and "100%" not in almost


def test_amounts_are_whole_dirhams_shown_with_the_pence_only_when_there_are_some():
    assert speak(data(total=112_000, top_amount=90_000), "en")[0].endswith(
        "QAR 1,120 in discounts in 30 days")
    assert "QAR 1,120.50" in speak(data(total=112_050, top_amount=90_000), "en")[0]


def test_a_card_set_aside_comes_back_when_another_rule_gives_the_most_not_with_every_order():
    key = INSIGHT_BY_KEY[KEY]
    a = key.find(make_facts(extra={KEY: data()}))
    more = key.find(make_facts(extra={KEY: data(total=15_000, orders=13, top_amount=13_000)}))
    other = key.find(make_facts(extra={KEY: data(top_label="Free delivery")}))
    assert a.fingerprint(KEY) == more.fingerprint(KEY) != other.fingerprint(KEY)


def test_only_a_manager_is_shown_the_card():
    money_on = view.render(make_facts(extra={KEY: data()}, orders=41, orders_last=30,
                                      sales=312_000, sales_last=290_000), "en")
    assert KEY in [c["key"] for c in money_on["suggestions"]]
    card = next(c for c in money_on["suggestions"] if c["key"] == KEY)
    assert card["action"]["href"] == "/app/catalog" and card["status"] is None
    assert card["rule"].startswith("RULE · ") and card["rule"].endswith("· 12 orders")
    money_off = view.render(make_facts(extra={KEY: data()}, money=False, orders=41,
                                       orders_last=30, sales=312_000, sales_last=290_000), "en")
    assert KEY not in [c["key"] for c in money_off["suggestions"]]
    # Even when the numbers were somehow in the facts, the rule itself refuses a reader who
    # may not see money.
    assert INSIGHT_BY_KEY[KEY].find(make_facts(extra={KEY: data()}, money=False)) is None


def test_it_is_for_shops_with_orders_only():
    from alyr.modules.agent.model import applies

    assert applies(INSIGHT_BY_KEY[KEY], frozenset({"orders"}))
    assert not applies(INSIGHT_BY_KEY[KEY], frozenset({"bookings", "ledger"}))


# ── gathered from a real database ─────────────────────────────────────────────────────────


def owner_run(work):
    """Run `work(owner_connection)` as the database owner and give back what it returns."""
    async def go():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await work(conn)
        finally:
            await conn.close()

    return asyncio.run(go())


def make_shop(client, features: bool = True) -> UUID:
    """A new bakery with Orders and the Catalog on, and Discounts switched on (or left off)."""
    tenant, _slug, _name = new_business(client, kind="bakery")
    tenant = UUID(str(tenant))

    async def set_up(conn):
        for module in ("orders", "catalog"):
            await conn.execute(
                "insert into tenant_modules (tenant_id, module_key, enabled) values ($1, $2, true) "
                "on conflict (tenant_id, module_key) do update set enabled = true",
                tenant, module,
            )
        await switch(conn, tenant, features)

    owner_run(set_up)
    return tenant


async def switch(conn, tenant: UUID, on: bool) -> None:
    await conn.execute(
        "insert into shop_features (tenant_id, key, enabled, set_by) "
        "values ($1, 'discounts', $2, 'owner') "
        "on conflict (tenant_id, key) do update set enabled = $2",
        tenant, on,
    )


class Ledger:
    """Writes a shop's discounted orders straight into the tables, the way the order code
    stores them (migration 0040): the order's `discount_total` and one `order_discounts` row
    for each rule that gave something. Nothing here prices anything."""

    def __init__(self, conn, tenant: UUID, first_number: int = 1000) -> None:
        self.conn, self.tenant, self.number = conn, tenant, first_number
        self.contact: UUID | None = None
        self.words: dict[UUID, tuple[str, str, str, str]] = {}  # id -> kind, code, name, name_ar

    async def rule(self, kind: str, label: str, label_ar: str, code: str = "") -> UUID:
        is_coupon = kind == "coupon"
        rule = await self.conn.fetchval(
            "insert into discount_rules (tenant_id, kind, code, code_key, name, name_ar, "
            "value_type, percent, amount) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) "
            "returning id",
            self.tenant, kind, code, code.lower(), label, label_ar,
            "percent" if is_coupon else "amount", 10 if is_coupon else None,
            None if is_coupon else 500,
        )
        self.words[rule] = (kind, code, label, label_ar)
        return rule

    async def order(self, days_ago: float, given: list[tuple[UUID, int]], *,
                    status: str = "done", is_test: bool = False, returned: bool = False) -> None:
        if self.contact is None:
            self.contact = await self.conn.fetchval(
                "select id from contacts where tenant_id = $1 and name = 'Fatima'", self.tenant
            ) or await self.conn.fetchval(
                "insert into contacts (tenant_id, phone, name) values ($1, $2, 'Fatima') "
                "returning id", self.tenant, f"9745{uuid4().int % 10_000_000:07d}",
            )
        self.number += 1
        off = sum(amount for _rule, amount in given)
        who = self.contact
        if is_test:
            # A trigger marks an order test by its customer (migration 0056), not by the code.
            who = await self.conn.fetchval(
                "insert into contacts (tenant_id, phone, name, wa_user_id) "
                "values ($1, $2, 'Owner test', $3) returning id",
                self.tenant, f"9745{uuid4().int % 10_000_000:07d}", f"TEST.{uuid4().hex[:8]}",
            )
        order = await self.conn.fetchval(
            "insert into orders (tenant_id, contact_id, number, status, total, subtotal, "
            "discount_total, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
            self.tenant, who, self.number, status, 5_000, 5_000 + off, off,
            NOW - timedelta(days=days_ago),
        )
        marked = await self.conn.fetchval("select is_test from orders where id = $1", order)
        assert marked == is_test
        for sort, (rule, amount) in enumerate(given):
            kind, code, name, name_ar = self.words[rule]
            await self.conn.execute(
                "insert into order_discounts (tenant_id, order_id, rule_id, kind, code, name, "
                "name_ar, rule_text, rule_text_ar, value_type, amount_off, sort, returned_at, "
                "created_at) values ($1, $2, $3, $4, $5, $6, $7, '10% off', 'خصم 10%', "
                "'percent', $8, $9, $10, $11)",
                self.tenant, order, rule, kind, code, name, name_ar, amount, sort,
                NOW if returned else None, NOW - timedelta(days=days_ago),
            )

    async def plain_order(self, days_ago: float) -> None:
        await self.order(days_ago, [])


async def fill_main_shop(conn, tenant: UUID) -> tuple[UUID, UUID]:
    """Twelve orders in the window: eight with the coupon alone (QAR 10 each) and four with the
    coupon and a QAR 5 automatic discount. 140 given, 120 of it by the coupon. Then the ones
    that must not count."""
    book = Ledger(conn, tenant)
    coupon = await book.rule("coupon", "Ramadan 10", "رمضان 10", "RAMADAN10")
    auto = await book.rule("auto", "Free delivery", "توصيل مجاني")
    for day in range(8):
        await book.order(1 + day, [(coupon, 1_000)])
    for day in range(4):
        await book.order(2 + day, [(coupon, 1_000), (auto, 500)])
    # Left out: cancelled, the test line's, a discount given back, older than 30 days, none.
    await book.order(3, [(auto, 50_000)], status="cancelled")
    await book.order(3, [(auto, 50_000)], is_test=True)
    await book.order(3, [(auto, 50_000)], returned=True)
    await book.order(31, [(auto, 50_000)])
    await book.plain_order(2)
    return coupon, auto


async def read(tenant: UUID, role: str = "owner", lang: str = "en") -> tuple[Facts, dict | None]:
    db = Database(APP_DSN)
    await db.connect()
    try:
        async with db.tenant(tenant) as conn:
            user = await conn.fetchrow(
                "select u.id, u.name from memberships m join users u on u.id = m.user_id "
                "where m.role = 'owner'"
            )
            staff = Staff(user["id"], user["name"], "", role, tenant)
            f = await facts_.gather(conn, staff, NOW)
            return f, (await view.build(conn, staff, lang, now=NOW))
    finally:
        await db.close()


def gathered(tenant: UUID, **more) -> tuple[dict | None, dict]:
    f, screen = asyncio.run(read(tenant, **more))
    return f.extra.get(KEY), screen


def test_it_adds_up_the_30_days_names_the_biggest_rule_and_leaves_the_rest_out(client_factory):
    client = client_factory()
    tenant = make_shop(client)
    # Another shop with far more discount than this one: none of it may show up here.
    other = make_shop(client)

    async def fill(conn):
        await fill_main_shop(conn, tenant)
        book = Ledger(conn, other)
        rule = await book.rule("coupon", "Eid 50", "عيد 50", code="EID50")
        for day in range(15):
            await book.order(1 + day, [(rule, 99_999)])

    owner_run(fill)

    mine, screen = gathered(tenant)
    assert mine == {"total": 14_000, "orders": 12, "top_amount": 12_000,
                    "top_label": "Ramadan 10", "top_label_ar": "رمضان 10"}
    card = next(c for c in screen["suggestions"] if c["key"] == KEY)
    assert plain(card["title"]) == "You gave away QAR 140 in discounts in 30 days"
    assert "Eid 50" not in plain(card["line"]) and "86%" in plain(card["line"])

    theirs, _ = gathered(other)
    assert theirs == {"total": 1_499_985, "orders": 15, "top_amount": 1_499_985,
                      "top_label": "Eid 50", "top_label_ar": "عيد 50"}


def test_a_shop_with_nothing_given_and_a_shop_with_no_orders_gather_nothing(client_factory):
    client = client_factory()
    empty = make_shop(client)
    assert gathered(empty)[0] is None

    plain_shop = make_shop(client)

    async def fill(conn):
        book = Ledger(conn, plain_shop)
        for day in range(12):
            await book.plain_order(1 + day)

    owner_run(fill)
    extra, screen = gathered(plain_shop)
    assert extra is None and KEY not in [c["key"] for c in screen["suggestions"]]


def test_nine_orders_are_too_few_and_ten_are_enough(client_factory):
    client = client_factory()
    tenant = make_shop(client)

    async def nine(conn):
        book = Ledger(conn, tenant)
        rule = await book.rule("coupon", "Ramadan 10", "رمضان 10", "RAMADAN10")
        for day in range(9):
            await book.order(1 + day, [(rule, 1_000)])
        return rule

    rule = owner_run(nine)
    assert gathered(tenant)[0] is None  # nine orders

    async def tenth(conn):
        book = Ledger(conn, tenant, first_number=2000)
        book.words[rule] = ("coupon", "RAMADAN10", "Ramadan 10", "رمضان 10")
        await book.order(2, [(rule, 1_000)])

    owner_run(tenth)
    extra, _ = gathered(tenant)
    assert extra["orders"] == 10 and extra["total"] == 10_000


def test_with_discounts_switched_off_nothing_is_gathered_however_much_was_given(client_factory):
    client = client_factory()
    tenant = make_shop(client, features=False)

    async def fill(conn):
        await fill_main_shop(conn, tenant)

    owner_run(fill)
    extra, screen = gathered(tenant)
    assert extra is None and KEY not in [c["key"] for c in screen["suggestions"]]

    async def on(conn):
        await switch(conn, tenant, True)

    owner_run(on)
    assert gathered(tenant)[0]["total"] == 14_000

    async def off(conn):
        await switch(conn, tenant, False)

    owner_run(off)
    assert gathered(tenant)[0] is None

    # And without the Catalog module the pricing pack is never on (items/features.py).
    async def on_without_catalog(conn):
        await switch(conn, tenant, True)
        await conn.execute(
            "update tenant_modules set enabled = false where tenant_id = $1 "
            "and module_key = 'catalog'", tenant,
        )

    owner_run(on_without_catalog)
    assert gathered(tenant)[0] is None


def test_an_agent_is_gathered_nothing_and_shown_nothing(client_factory):
    """The number is the shop's money: the agent role (no money) never has it gathered."""
    client = client_factory()
    tenant = make_shop(client)

    async def fill(conn):
        await fill_main_shop(conn, tenant)

    owner_run(fill)
    extra, screen = gathered(tenant, role="agent")
    assert extra is None and KEY not in [c["key"] for c in screen["suggestions"]]
    assert gathered(tenant, role="admin")[0]["total"] == 14_000


def test_cancelling_orders_takes_them_out_of_the_count(client_factory):
    client = client_factory()
    tenant = make_shop(client)

    async def fill(conn):
        await fill_main_shop(conn, tenant)

    owner_run(fill)
    assert gathered(tenant)[0]["orders"] == 12

    async def cancel_three(conn):
        await conn.execute(
            "update orders set status = 'cancelled' where id in (select order_id from "
            "order_discounts where tenant_id = $1 and rule_id is not null and returned_at is null "
            "and amount_off = 500 limit 3)", tenant,
        )

    owner_run(cancel_three)
    # Nine are left, below ten, so nothing is gathered and nothing is said.
    extra, screen = gathered(tenant)
    assert extra is None and KEY not in [c["key"] for c in screen["suggestions"]]


def test_a_rule_deleted_since_still_counts_under_the_words_it_was_given_with(client_factory):
    client = client_factory()
    tenant = make_shop(client)

    async def fill(conn):
        coupon, _auto = await fill_main_shop(conn, tenant)
        await conn.execute("delete from discount_rules where id = $1", coupon)
        assert await conn.fetchval(
            "select count(*) from order_discounts where tenant_id = $1 and rule_id is null",
            tenant,
        ) > 0

    owner_run(fill)
    extra, _ = gathered(tenant)
    assert (extra["total"], extra["orders"], extra["top_amount"], extra["top_label"]) == (
        14_000, 12, 12_000, "Ramadan 10")
