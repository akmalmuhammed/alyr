"""ALYR Agent rule `second_order` (insights plan, row C2): of the customers whose first order or
visit was 31 to 90 days ago, how many came back within 30 days.

Two parts: the rule's words and thresholds from facts alone, and its numbers read from a real
PostgreSQL through the same `facts.gather` the workspace uses, with a second shop whose rows
must not show up and a shop with nothing."""

import asyncio
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.core.auth import Staff
from alyr.db import Database
from alyr.modules.agent import facts as agent_facts
from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INFO_ONLY, INSIGHT_BY_KEY
from alyr.modules.agent.rules import second_order
from alyr.modules.agent.words import plain
from conftest import APP_DSN, OWNER_DSN

NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)
ARABIC = re.compile(r"[؀-ۿ]")
BANNED = re.compile(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon)\b|قريباً")
INSIGHT = second_order.INSIGHT
KEY = second_order.KEY


def facts(**values) -> Facts:
    base = {"now": NOW, "modules": frozenset({"orders"}), "business_type": "restaurant",
            "started": NOW - timedelta(days=200)}
    return Facts(**(base | values))


def with_numbers(firsts: int, back: int, **values) -> Facts:
    return facts(extra={KEY: {"firsts": firsts, "back": back}}, **values)


# ── the rule, from facts alone ────────────────────────────


def test_the_rule_is_registered_as_number_31_for_information_only():
    assert INSIGHT_BY_KEY[KEY] is INSIGHT
    assert (INSIGHT.number, INSIGHT.kind, INSIGHT.module) == (31, "knowledge", "orders|bookings")
    assert INSIGHT.money is False and INSIGHT.action is None
    assert INSIGHT.status == INFO_ONLY


def test_it_is_quiet_below_twenty_first_timers_and_without_numbers():
    assert INSIGHT.find(facts()) is None
    assert INSIGHT.find(with_numbers(19, 19)) is None
    assert INSIGHT.find(with_numbers(0, 0)) is None
    found = INSIGHT.find(with_numbers(20, 0))
    assert found is not None and found.n == 20


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_it_speaks_at_twenty_in_both_languages(lang):
    f = with_numbers(20, 5)
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
        assert plain(first) == "5 of 20 first-time customers came back (25%)"
    else:
        assert plain(first) == "20 عميلاً جاؤوا لأول مرة، عاد منهم 5 (25%)"


def test_the_percentage_is_rounded_once_and_a_clinic_says_patients():
    assert [second_order.percent(a, b) for a, b in [(1, 3), (2, 3), (1, 8), (7, 7), (0, 25)]] == [
        33, 67, 13, 100, 0]
    f = with_numbers(40, 9, business_type="clinic")  # 22.5 rounds to 23
    found = INSIGHT.find(f)
    assert plain(INSIGHT.say(found, f, "en")[0]) == "9 of 40 first-time patients came back (23%)"
    assert plain(INSIGHT.say(found, f, "ar")[0]) == "40 مراجعاً جاؤوا لأول مرة، عاد منهم 9 (23%)"


def test_the_card_appears_on_the_screen_with_its_rule_and_no_action():
    f = with_numbers(25, 6, orders=5, orders_last=5)
    cards = {c["key"]: c for c in view.render(f, "en")["suggestions"]}
    card = cards[KEY]
    assert plain(card["title"]) == "6 of 25 first-time customers came back (24%)"
    assert card["status"] == "Information only." and card["action"] is None
    assert card["rule"].startswith("RULE · first order or visit 31 to 90 days ago")
    assert card["rule"].endswith("· 25 customers")
    assert KEY not in {c["key"] for c in view.render(with_numbers(19, 6), "en")["suggestions"]}


# ── the numbers, from a real database ─────────────────────


def day(days: float, hour: int = 10) -> datetime:
    """`days` before NOW, at `hour` UTC that day (Doha is three hours ahead)."""
    return (NOW - timedelta(days=days)).replace(hour=hour, minute=0)


class Shop:
    """One made-up business, built as the database owner with the minimum SQL."""

    def __init__(self, conn: asyncpg.Connection, tenant: UUID):
        self.conn, self.tenant, self.numbers = conn, tenant, 1000

    @classmethod
    async def make(cls, conn, modules=("orders", "bookings"), name="Loyalty test shop"):
        tenant = await conn.fetchval(
            "insert into tenants (name) values ($1) returning id", f"{name} {uuid4().hex[:6]}")
        for module in modules:
            await conn.execute(
                "insert into tenant_modules (tenant_id, module_key) values ($1, $2)",
                tenant, module)
        shop = cls(conn, tenant)
        shop.service = await conn.fetchval(
            "insert into services (tenant_id, name, duration_minutes, price) "
            "values ($1, 'Haircut', 30, 5000) returning id", tenant)
        return shop

    async def customer(self, name="Customer", role="customer", wa_user_id=None) -> UUID:
        wa = wa_user_id or f"9745{uuid4().int % 10_000_000:07d}"
        return await self.conn.fetchval(
            "insert into contacts (tenant_id, phone, wa_user_id, name, role) "
            "values ($1, $2, $3, $4, $5) returning id",
            self.tenant, wa if not wa.startswith("TEST.") else None, wa, name, role)

    async def order(self, who: UUID, at: datetime, total: int = 4500, status="done") -> None:
        self.numbers += 1
        await self.conn.execute(
            "insert into orders (tenant_id, contact_id, number, status, total, created_at) "
            "values ($1, $2, $3, $4, $5, $6)",
            self.tenant, who, self.numbers, status, total, at)

    async def visit(self, who: UUID, at: datetime, status="completed", price=None) -> None:
        self.numbers += 1
        await self.conn.execute(
            "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
            "starts_at, ends_at, status, price) values ($1, $2, $3, $4, 'Haircut', "
            "$5::timestamptz, $5::timestamptz + interval '30 minutes', $6, $7)",
            self.tenant, self.numbers, who, self.service, at, status, price)

    async def message(self, who: UUID, at: datetime, direction="out", status="sent") -> None:
        await self.conn.execute(
            "insert into messages (tenant_id, contact_id, direction, kind, body, status, "
            "created_at) values ($1, $2, $3, 'text', 'hello', $4, $5)",
            self.tenant, who, direction, status, at)


def read(build, role="owner"):
    """Build shops with `build(conn)`, which returns the tenants to read, then gather the
    Agent's facts for each of them through the app role (row-level security on)."""

    async def go():
        owner = await asyncpg.connect(OWNER_DSN)
        try:
            tenants = await build(owner)
        finally:
            await owner.close()
        db = Database(APP_DSN)
        await db.connect()
        try:
            out = []
            for tenant in tenants:
                async with db.tenant(tenant) as conn:
                    out.append(await agent_facts.gather(
                        conn, Staff(None, "Owner", "", role, tenant), NOW))
            return out
        finally:
            await db.close()

    return asyncio.run(go())


def test_it_counts_first_timers_and_who_came_back_through_the_real_path():
    async def build(conn):
        a = await Shop.make(conn)
        # 1. first order 60 days ago, another 10 days later: counted, came back.
        who = await a.customer()
        await a.order(who, day(60))
        await a.order(who, day(50))
        # 2. second order 40 days after the first: counted, did not come back in time.
        who = await a.customer()
        await a.order(who, day(60))
        await a.order(who, day(20))
        # 3. second order exactly 30 days after the first: came back.
        who = await a.customer()
        await a.order(who, day(60))
        await a.order(who, day(30))
        # 4. a second order the same day, in shop time: one visit to the shop, not a return.
        who = await a.customer()
        await a.order(who, day(60, 6))
        await a.order(who, day(60, 8))
        # 5. a second order after midnight in shop time, six hours later: a return.
        who = await a.customer()
        await a.order(who, day(60, 20))
        await a.order(who, day(59, 2))
        # 6. already a customer before the window: not a first-timer.
        who = await a.customer()
        await a.order(who, day(100))
        await a.order(who, day(60))
        # 7. a cancelled order is not a first order, and not a return.
        who = await a.customer()
        await a.order(who, day(80), status="cancelled")
        await a.order(who, day(60))
        await a.order(who, day(55), status="cancelled")
        # 8. first a completed visit, then an order: a return across both modules.
        who = await a.customer()
        await a.visit(who, day(70))
        await a.order(who, day(65))
        # 9. a no-show is not a visit.
        who = await a.customer()
        await a.visit(who, day(70), status="no_show")
        await a.visit(who, day(68), status="cancelled")
        # 10. a completed visit long before: not a first-timer.
        who = await a.customer()
        await a.visit(who, day(120))
        await a.order(who, day(60))
        # 10b. a cancelled order, or a visit that did not happen, long before is not an earlier
        # order: still a first-timer.
        who = await a.customer()
        await a.order(who, day(100), status="cancelled")
        await a.visit(who, day(110), status="no_show")
        await a.order(who, day(60))
        # 11. the test line of the owner, and a member of staff: not customers.
        who = await a.customer(wa_user_id="TEST.owner-1")
        await a.order(who, day(60))
        who = await a.customer(role="staff")
        await a.order(who, day(60))
        # 12. outside the window: first order 20 days ago, or 95 days ago.
        who = await a.customer()
        await a.order(who, day(20))
        who = await a.customer()
        await a.order(who, day(95))
        await a.order(who, day(94))
        # A second shop with first-timers who all came back: none of it may show in the first.
        b = await Shop.make(conn, name="Other shop")
        for _ in range(6):
            who = await b.customer()
            await b.order(who, day(60))
            await b.order(who, day(58))
        # And a shop with nothing at all.
        c = await Shop.make(conn, name="Empty shop")
        return [a.tenant, b.tenant, c.tenant]

    a, b, c = read(build)
    assert a.extra[KEY] == {"firsts": 8, "back": 4}
    assert b.extra[KEY] == {"firsts": 6, "back": 6}
    assert c.extra[KEY] == {"firsts": 0, "back": 0}
    # 8 first-timers is under the 20 the rule needs: the owner sees nothing.
    assert INSIGHT.find(a) is None


def test_it_reads_only_the_modules_the_shop_has_on():
    async def build(conn):
        orders_only = await Shop.make(conn, modules=("orders",))
        who = await orders_only.customer()
        await orders_only.visit(who, day(70))  # a visit does not count in a shop without bookings
        await orders_only.order(who, day(60))
        visits_only = await Shop.make(conn, modules=("bookings",))
        who = await visits_only.customer()
        await visits_only.order(who, day(70))  # nor an order in a shop without orders
        await visits_only.visit(who, day(60))
        await visits_only.visit(who, day(40))
        neither = await Shop.make(conn, modules=("inbox",))
        return [orders_only.tenant, visits_only.tenant, neither.tenant]

    orders_only, visits_only, neither = read(build)
    assert orders_only.extra[KEY] == {"firsts": 1, "back": 0}
    assert visits_only.extra[KEY] == {"firsts": 1, "back": 1}
    assert KEY not in neither.extra


def test_twenty_first_timers_make_the_card_through_the_real_path():
    async def build(conn):
        shop = await Shop.make(conn, modules=("orders",))
        for i in range(20):
            who = await shop.customer()
            await shop.order(who, day(70 - i))
            if i < 5:
                await shop.order(who, day(60 - i))
        return [shop.tenant]

    (f,) = read(build)
    assert f.extra[KEY] == {"firsts": 20, "back": 5}
    found = INSIGHT.find(f)
    assert plain(INSIGHT.say(found, f, "en")[0]) == "5 of 20 first-time customers came back (25%)"
