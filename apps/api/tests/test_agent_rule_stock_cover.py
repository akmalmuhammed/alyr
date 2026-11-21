"""The Agent's stock_cover rule (insights plan S1): an item counted in stock whose stock lasts
3 days or fewer at the pace of the last 14 days, when it sold on 5 or more of those days.

The first half is pure (facts built by hand). The second reads a real database: orders placed
through the product's own order route, so the stock log has the rows the product writes, and
then dated back, because the rule looks at 14 days."""

import re
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from alyr.core.auth import Staff
from alyr.modules.agent import facts as agent_facts
from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY
from alyr.modules.agent.rules import RULES, stock_cover
from alyr.modules.agent.words import plain
from alyr.modules.items.cart import CartLine
from alyr.seed import DEMO_TENANT_ID
from test_agent import ARABIC, NOW, facts
from test_consent import owner_sql
from test_features_api import switch
from test_items import counted, fresh, mk, people, place_at, vid
from test_onboarding import new_business

KEY = stock_cover.KEY
BANNED = re.compile(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon)\b")
QATAR = ZoneInfo("Asia/Qatar")
THU = date(2026, 10, 15)  # NOW is Thursday 15 Oct 2026, 16:20 in Doha


def entry(name="Chocolate cake", on_hand=3, sold=14, days_sold=5, **more) -> dict:
    return {
        "id": f"v-{name}-{more.get('variant', '')}", "name": name, "name_ar": "كعكة الشوكولاتة",
        "variant": "", "variant_ar": "", "unit": "piece", "on_hand": on_hand, "sold": sold,
        "days_sold": days_sold, **more,
    }


def known(*items, total=None) -> Facts:
    return facts(extra={KEY: {"total": len(items) if total is None else total,
                              "items": list(items)}})


def said(f: Facts, lang: str) -> tuple[str, str]:
    found = INSIGHT_BY_KEY[KEY].find(f)
    first, second = INSIGHT_BY_KEY[KEY].say(found, f, lang)
    return plain(first), plain(second)


# ── pure: the threshold, both languages, money ─────────────────────────────────────────


def test_it_is_registered_with_its_number_and_a_screen_that_exists():
    insight = INSIGHT_BY_KEY[KEY]
    assert stock_cover in RULES
    assert (insight.number, insight.kind, insight.module, insight.money) == (
        28, "knowledge", "orders", False
    )
    assert insight.action is not None and insight.action.href == "/app/catalog"


def test_quiet_with_nothing_gathered_or_nothing_short():
    insight = INSIGHT_BY_KEY[KEY]
    assert insight.find(facts()) is None
    assert insight.find(known()) is None


@pytest.mark.parametrize("below", [
    entry(days_sold=4),  # sold on only 4 of the 14 days
    entry(on_hand=4),  # 4 ÷ (14 ÷ 14) = 4 days of cover
    entry(on_hand=43, sold=200),  # 43 × 14 = 602 > 3 × 200
    entry(on_hand=0),  # already out: the Catalog says so (Sold out now), this is not it
    entry(sold=0, days_sold=0),
])
def test_quiet_just_short_of_each_threshold(below):
    assert INSIGHT_BY_KEY[KEY].find(known(below)) is None


@pytest.mark.parametrize("at", [
    entry(on_hand=3, sold=14, days_sold=5),  # exactly 3.0 days, exactly 5 days
    entry(on_hand=1, sold=5, days_sold=5),
    entry(on_hand=Decimal("2.5"), sold=Decimal("12"), days_sold=7, unit="kg"),
])
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_speaks_at_its_threshold_in_both_languages(at, lang):
    f = known(at)
    assert INSIGHT_BY_KEY[KEY].find(f) is not None
    first, second = said(f, lang)
    for text in (first, second):
        assert text.strip() and "{" not in text and "}" not in text, text
        assert not BANNED.search(text.lower()), text
    assert bool(ARABIC.search(first)) == (lang == "ar")
    assert bool(ARABIC.search(second)) == (lang == "ar")
    assert "14" in first and "3" in first


def test_the_words_in_english_and_arabic():
    f = known(entry(on_hand=2, sold=18, days_sold=6))  # 2 × 14 ÷ 18 = 1.6 days
    assert said(f, "en") == (
        "1 item could run out within 3 days at the pace of the last 14 days",
        "Chocolate cake: 2 left, about 2 days.",
    )
    assert said(f, "ar") == (
        "صنف واحد قد ينفد خلال 3 أيام بوتيرة آخر 14 يوماً",
        "كعكة الشوكولاتة: بقي 2، يكفي نحو يومين.",
    )
    under = known(entry(on_hand=1, sold=70, days_sold=9))  # 0.2 days
    assert said(under, "en")[1] == "Chocolate cake: 1 left, under a day."
    assert said(under, "ar")[1] == "كعكة الشوكولاتة: بقي 1، يكفي أقل من يوم."
    assert said(known(entry()), "ar")[1].endswith("نحو 3 أيام.")  # exactly 3.0
    assert said(known(entry(on_hand=1, sold=14)), "en")[1].endswith("about 1 day.")


def test_a_measure_keeps_its_unit_and_its_fraction():
    f = known(entry(name="Dates", on_hand=Decimal("1.5"), sold=Decimal("7.5"), days_sold=5,
                    unit="kg"))
    assert said(f, "en")[1] == "Dates: 1.5 kg left, about 3 days."
    assert said(f, "ar")[1] == "كعكة الشوكولاتة: بقي 1.5 كغ، يكفي نحو 3 أيام."


def test_a_size_is_named_beside_the_item_and_the_arabic_name_is_used_in_arabic():
    f = known(entry(name="Abaya", variant="Black / M", variant_ar="أسود / م"))
    assert said(f, "en")[1].startswith("Abaya · Black / M: ")
    assert said(f, "ar")[1].startswith("كعكة الشوكولاتة · أسود / م: ")
    bare = known(entry(name="Abaya", variant="Black / M"))  # no Arabic name for the size
    assert said(bare, "ar")[1].startswith("كعكة الشوكولاتة · Black / M: ")


def test_arabic_agrees_with_how_many():
    def first(n):
        items = [entry(name=f"Cake {i}", on_hand=1, sold=5, days_sold=5) for i in range(n)]
        return said(known(*items), "ar")[0]

    assert first(1) == "صنف واحد قد ينفد خلال 3 أيام بوتيرة آخر 14 يوماً"
    assert first(2) == "صنفان قد ينفدان خلال 3 أيام بوتيرة آخر 14 يوماً"
    assert first(3) == "3 أصناف قد تنفد خلال 3 أيام بوتيرة آخر 14 يوماً"
    assert first(11) == "11 صنفاً قد تنفد خلال 3 أيام بوتيرة آخر 14 يوماً"


def test_it_shows_the_three_with_the_least_cover_and_counts_the_rest():
    items = [
        entry(name="D slow", on_hand=3, sold=14),  # 3.0 days
        entry(name="B mid", on_hand=2, sold=14),  # 2.0 days
        entry(name="A fast", on_hand=1, sold=14),  # 1.0 day
        entry(name="C mid", on_hand=2, sold=14),  # 2.0 days, after B by name
        entry(name="E none", on_hand=1, sold=14, days_sold=4),  # not short at all
    ]
    f = known(*items, total=6)  # the database counted 6 short, the card keeps the worst few
    found = INSIGHT_BY_KEY[KEY].find(f)
    assert [r.label for r in found.rows] == ["A fast", "B mid", "C mid"]
    assert found.n == 6
    first, second = said(f, "en")
    assert first.startswith("6 items could run out")
    assert second == (
        "A fast: 1 left, about 1 day; B mid: 2 left, about 2 days; "
        "C mid: 2 left, about 2 days. 3 more."
    )
    assert said(f, "ar")[1].endswith("و3 أخرى.")
    # With more rows than the card shows, the count is what the database said, not 3.
    assert INSIGHT_BY_KEY[KEY].find(known(*items[:4])).n == 4


def test_it_is_not_a_money_rule_so_staff_without_money_see_it_too():
    f = facts(money=False, extra={KEY: {"total": 1, "items": [entry()]}})
    assert INSIGHT_BY_KEY[KEY].find(f) is not None
    cards = view.render(f, "en")["suggestions"]
    card = next(c for c in cards if c["key"] == KEY)
    assert card["action"]["href"] == "/app/catalog"
    assert plain(card["title"]).startswith("1 item could run out within 3 days")
    assert card["rule"].startswith("RULE · counted in stock, sold on 5 or more of the last 14")
    assert card["rule"].endswith("· 1 item")
    assert "QAR" not in str(card)


def test_it_stays_off_when_the_shop_has_no_orders_module():
    from alyr.modules.agent.model import applies

    assert applies(INSIGHT_BY_KEY[KEY], frozenset({"orders"}))
    assert not applies(INSIGHT_BY_KEY[KEY], frozenset({"bookings", "inbox"}))


# ── a real database ────────────────────────────────────────────────────────────────────


def at(days_ago: int, hour: int = 10, minute: int = 0, second: int = 0) -> datetime:
    """A moment on the shop's wall, `days_ago` days before Thursday 15 Oct 2026."""
    day = THU - timedelta(days=days_ago)
    return datetime.combine(day, time(hour, minute, second), QATAR).astimezone(UTC)


def contact(client) -> dict:
    return people(client, 1)[0]


def sell(client, item, quantity, when, *, variant=None, pay="later", cancel=False,
         test=False) -> str:
    """An order through the real route, then its stock rows dated to `when` (a give-back an
    hour later, as a cancelled order's would be)."""
    chosen = UUID(vid(item, variant)) if variant else None
    placed = place_at(client, contact(client), [CartLine(UUID(item["id"]), quantity, chosen)],
                      datetime.now(UTC), payment=pay)
    order_id = placed["order_id"]
    if test:
        owner_sql("update orders set is_test = true where id = $1", UUID(order_id))
    if cancel:
        answer = client.post(f"/api/orders/{order_id}/status", json={"status": "cancelled"})
        assert answer.status_code == 200, answer.text
    owner_sql("update stock_movements set created_at = $2 where order_id = $1 and "
              "kind = 'sold'", UUID(order_id), when)
    owner_sql("update stock_movements set created_at = $2 where order_id = $1 and "
              "kind = 'cancelled_restocked'", UUID(order_id), when + timedelta(hours=1))
    return order_id


def sell_each_day(client, item, quantities, days_ago, **more):
    for quantity, ago in zip(quantities, days_ago, strict=True):
        sell(client, item, quantity, at(ago), **more)


async def read(conn, tenant, role="owner") -> Facts:
    return await agent_facts.gather(conn, Staff(None, "Owner", "", role, tenant), NOW)


def read_shop(client, tenant=DEMO_TENANT_ID, role="owner") -> Facts:
    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            return await read(conn, tenant, role)

    return client.portal.call(go)


def rule_only(client, tenant) -> dict:
    """What the rule gathers for a shop, with nothing else read."""

    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            f = Facts(now=NOW)
            await stock_cover.gather(conn, f)
            return f.extra[KEY]

    return client.portal.call(go)


def names(gathered: dict) -> list[str]:
    return [f"{i['name']} · {i['variant']}" if i["variant"] else i["name"]
            for i in gathered["items"]]


def build_the_demo_shop(client) -> dict:
    # Six days of three: sold 18, 2 left after a dropped tray (a waste is not a sale).
    cake = counted(client, 23, name="Chocolate cake", name_ar="كعكة الشوكولاتة")
    sell_each_day(client, cake, [3] * 6, range(0, 6))
    sell(client, cake, 1, NOW + timedelta(hours=1))  # after the moment we read: not counted
    wasted = client.post(f"/api/items/{cake['id']}/stock",
                         json={"kind": "wasted", "quantity": 2, "reason": "dropped"})
    assert wasted.status_code == 200, wasted.text
    # (dated inside the window, so that counting it as a sale would show)
    owner_sql("update stock_movements set created_at = $1 where kind = 'wasted' and "
              "variant_id = $2", at(1, 12), UUID(vid(cake)))
    # Exactly 3.0 days: 14 sold on 5 days, 3 left; a cancelled order nets out.
    dates = counted(client, 17, name="Dates", name_ar="تمر")
    sell_each_day(client, dates, [3, 3, 3, 3, 2], [1, 2, 3, 4, 5])
    sell(client, dates, 2, at(3, 15), cancel=True)
    # One more on hand than that is 4.0 days.
    figs = counted(client, 18, name="Figs", name_ar="تين")
    sell_each_day(client, figs, [3, 3, 3, 3, 2], [1, 2, 3, 4, 5])
    # Sells fast but on 4 days only; plenty, selling on 6 days.
    bread = counted(client, 24, name="Bread", name_ar="خبز")
    sell_each_day(client, bread, [5] * 4, [1, 2, 3, 4])
    rice = counted(client, 100, name="Rice", name_ar="أرز")
    sell_each_day(client, rice, [3] * 6, range(0, 6))
    # Sold on 5 days, but 20 to 24 days ago.
    honey = counted(client, 20, name="Honey", name_ar="عسل")
    sell_each_day(client, honey, [3] * 5, range(20, 25))
    # The window starts at midnight on Fri 2 Oct: 00:00:30 is in, 23:59:30 the evening before
    # is out.
    inside = counted(client, 11, name="Edge in", name_ar="داخل")
    sell(client, inside, 2, at(13, 0, 0, 30))
    sell_each_day(client, inside, [2] * 4, [1, 2, 3, 4])
    outside = counted(client, 11, name="Edge out", name_ar="خارج")
    sell(client, outside, 2, at(14, 23, 59, 30))
    sell_each_day(client, outside, [2] * 4, [1, 2, 3, 4])
    # An order the owner made to try the shop is not customers wanting it.
    gift = counted(client, 11, name="Gift box", name_ar="هدية")
    for ago in range(1, 6):
        sell(client, gift, 2, at(ago), test=True)
    # Not live, or archived, or a size switched off, or not counted per item.
    hidden = counted(client, 11, name="Hidden", name_ar="مخفي")
    archived = counted(client, 11, name="Archived", name_ar="مؤرشف")
    for item in (hidden, archived):
        sell_each_day(client, item, [2] * 5, range(1, 6))
    owner_sql("update items set status = 'hidden' where id = $1", UUID(hidden["id"]))
    owner_sql("update items set status = 'archived' where id = $1", UUID(archived["id"]))
    daily = mk(client, name="Daily loaf", name_ar="رغيف", stock_rule="daily_limit",
               daily_limit=50)
    sell_each_day(client, daily, [2] * 5, range(0, 5))
    # Sizes: each has its own stock and its own pace.
    abaya = mk(client, name="Abaya", name_ar="عباية", stock_rule="count", variants=[
        {"name": "Small", "name_ar": "صغير", "opening_stock": 11},
        {"name": "Large", "name_ar": "كبير", "opening_stock": 40},
        {"name": "Tiny", "name_ar": "صغير جدا", "opening_stock": 11},
    ])
    sell_each_day(client, abaya, [2] * 5, range(0, 5), variant="Small")
    sell_each_day(client, abaya, [1] * 5, range(0, 5), variant="Large")
    sell_each_day(client, abaya, [2] * 5, range(0, 5), variant="Tiny")
    owner_sql("update item_variants set active = false where id = $1", UUID(vid(abaya, "Tiny")))
    # A measure.
    assert switch(client, "decimal_quantity", True).status_code == 200
    kilos = mk(client, name="Dates kg", name_ar="تمر بالكيلو", unit="kg", stock_rule="count",
               opening_stock=9, pack_size="0.5", min_order="0.5")
    sell_each_day(client, kilos, [Decimal("1.5")] * 5, range(0, 5))
    # Units a customer is holding for a pay link are already out of the shelf and count as sold.
    held = counted(client, 12, name="Hold item", name_ar="محجوز")
    sell_each_day(client, held, [2] * 4, [1, 2, 3, 4])
    sell(client, held, 2, at(0), pay="link")
    return {"abaya": abaya, "held": held, "dates": dates, "kilos": kilos}


def test_the_numbers_from_a_real_stock_log(client):
    made = build_the_demo_shop(client)
    got = rule_only(client, DEMO_TENANT_ID)

    flagged = names(got)
    assert flagged == [
        "Abaya · Small",  # 1 left, 10 sold: 1.4 days
        "Edge in",  # 1 left, 10 sold: 1.4 days
        "Chocolate cake",  # 2 left, 18 sold: 1.6 days
        "Dates kg",  # 1.5 kg left, 7.5 kg sold: 2.8 days
        "Hold item",  # 2 left, 10 sold: 2.8 days
        "Dates",  # 3 left, 14 sold: exactly 3.0 days
    ], flagged
    assert got["total"] == 6
    by_name = {n: i for n, i in zip(flagged, got["items"], strict=True)}

    cake = by_name["Chocolate cake"]
    assert (cake["on_hand"], cake["sold"], cake["days_sold"]) == (2, 18, 6)
    dates = by_name["Dates"]  # the cancelled order of 2 took 2 and gave 2 back
    assert (dates["on_hand"], dates["sold"], dates["days_sold"]) == (3, 14, 5)
    kilos = by_name["Dates kg"]
    assert (kilos["on_hand"], kilos["sold"], kilos["unit"]) == (Decimal("1.5"), Decimal("7.5"),
                                                                "kg")
    held = by_name["Hold item"]
    assert (held["on_hand"], held["sold"], held["days_sold"]) == (2, 10, 5)
    assert owner_sql(
        "select count(*)::int as n from stock_holds where status = 'held' and variant_id = $1",
        UUID(vid(made["held"])),
    )[0]["n"] == 1
    # Sizes are named; the one that sells slowly and the one switched off are not there.
    assert by_name["Abaya · Small"]["variant_ar"] == "صغير"
    assert not [n for n in flagged if "Large" in n or "Tiny" in n]
    # Left out, each for its reason: Figs 4.0 days, Bread 4 days sold, Rice plenty, Honey old,
    # Edge out 4 days in the window, Gift box a test order, Hidden, Archived, Daily loaf.
    assert not {"Figs", "Bread", "Rice", "Honey", "Edge out", "Gift box", "Hidden", "Archived",
                "Daily loaf"} & set(flagged)


def test_on_hand_is_what_the_catalog_shows(client):
    made = build_the_demo_shop(client)
    got = rule_only(client, DEMO_TENANT_ID)
    # The Stock tab lists every counted item; its row for a size is that size's on_hand.
    listed = client.get("/api/items?filter=stocked&limit=500").json()["items"]
    shown = {v["id"]: v["on_hand"] for item in listed for v in item["variants"] if v["active"]}
    assert len(got["items"]) == 6
    for flagged in got["items"]:
        assert shown[flagged["id"]] == flagged["on_hand"], flagged["name"]
    # The item's own screen adds its sizes up; for an item with one size that is the same.
    for key in ("held", "dates", "kilos"):
        item = fresh(client, made[key])
        flagged = next(i for i in got["items"] if i["name"] == item["name"])
        assert sum(v["on_hand"] for v in item["variants"]) == flagged["on_hand"]
    # And it is what the log adds up to, the one number the Catalog keeps.
    assert owner_sql(
        "select v.id from item_variants v left join (select variant_id, sum(delta) as t from "
        "stock_movements where day is null group by variant_id) m on m.variant_id = v.id "
        "where v.tenant_id = $1 and v.on_hand <> coalesce(m.t, 0)", DEMO_TENANT_ID
    ) == []


def test_the_whole_agent_reads_it_and_the_card_says_so(client):
    build_the_demo_shop(client)
    gathered = read_shop(client).extra[KEY]
    assert gathered["total"] == 6
    f = read_shop(client)
    found = INSIGHT_BY_KEY[KEY].find(f)
    first, second = INSIGHT_BY_KEY[KEY].say(found, f, "en")
    assert plain(first) == "6 items could run out within 3 days at the pace of the last 14 days"
    assert plain(second) == (
        "Abaya · Small: 1 left, about 1 day; Edge in: 1 left, about 1 day; "
        "Chocolate cake: 2 left, about 2 days. 3 more."
    )
    # Staff who may not see money still see it: it is stock, not takings.
    assert read_shop(client, role="agent").extra[KEY] == gathered


def test_another_shops_stock_never_shows_and_an_empty_shop_says_nothing(client):
    build_the_demo_shop(client)
    other, _, _ = new_business(client, kind="shop")
    item = owner_sql(
        "insert into items (tenant_id, name, price, status, stock_rule) "
        "values ($1, 'Other cake', 1200, 'live', 'count') returning id", other
    )[0]["id"]
    variant = owner_sql("select id from item_variants where item_id = $1", item)[0]["id"]
    owner_sql("update item_variants set on_hand = 1 where id = $1", variant)
    for ago in range(0, 6):
        owner_sql(
            "insert into stock_movements (tenant_id, variant_id, kind, delta, balance_after, "
            "actor_name, created_at) values ($1, $2, 'sold', -3, 1, 'Customer', $3)",
            other, variant, at(ago),
        )
    empty, _, _ = new_business(client, kind="shop")

    assert names(rule_only(client, other)) == ["Other cake"]
    assert rule_only(client, empty) == {"total": 0, "items": []}
    ours = rule_only(client, DEMO_TENANT_ID)
    assert "Other cake" not in names(ours) and ours["total"] == 6
    # Nothing to say for the shop with no stock log, and the full read agrees.
    assert INSIGHT_BY_KEY[KEY].find(read_shop(client, empty)) is None


def test_a_shop_whose_day_starts_at_four_counts_the_early_hours_with_the_day_before(client):
    cake = counted(client, 11, name="Night cake", name_ar="كعكة الليل")
    owner_sql("update shop_settings set day_starts = time '04:00' where tenant_id = $1",
              DEMO_TENANT_ID)
    try:
        # Five nights, each at 02:00, which belong to the shop day before.
        for ago in range(1, 6):
            sell(client, cake, 2, at(ago, 2))
        assert names(rule_only(client, DEMO_TENANT_ID)) == ["Night cake"]
        # 02:00 on Fri 2 Oct is still Thursday 1 Oct's shop day, before the window's first
        # shop day (Fri 2 Oct from 04:00): the fifth sale drops out and the rule goes quiet.
        owner_sql("update stock_movements set created_at = $1 where kind = 'sold' and "
                  "created_at = $2", at(13, 2), at(5, 2))
        assert rule_only(client, DEMO_TENANT_ID) == {"total": 0, "items": []}
    finally:
        owner_sql("update shop_settings set day_starts = time '00:00' where tenant_id = $1",
                  DEMO_TENANT_ID)


class Counting:
    """A connection that counts the statements sent through it."""

    def __init__(self, conn):
        self.conn, self.sent = conn, []

    def __getattr__(self, name):
        real = getattr(self.conn, name)
        if not name.startswith(("fetch", "execute")):
            return real

        async def counted_call(*args, **kwargs):
            self.sent.append(name)
            return await real(*args, **kwargs)

        return counted_call


def test_the_database_work_is_one_statement_however_many_items_the_shop_counts(client):
    build_the_demo_shop(client)

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            spy = Counting(conn)
            await stock_cover.gather(spy, Facts(now=NOW))
            return spy.sent

    assert client.portal.call(go) == ["fetch"]
