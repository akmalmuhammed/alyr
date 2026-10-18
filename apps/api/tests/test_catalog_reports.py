"""The Catalog in the weekly report (ALY-109, D-039, spec 007): sold-out items and for how
long, customers who asked for something sold out, low stock, the best sellers and what did not
sell, in English and Arabic, from a week of demo activity (orders, cancellations, sold-out
events in all three ways an item runs out, customers asking). Every test goes through the real
path: PostgreSQL, the order page's HTTP API, the staff API and the chat simulator.

The shop's own Catalog module is off for every shop until go-live; these tests switch it on
for the demo shop (the autouse fixture) and, where they say so, off again.
"""

import json
from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from alyr.modules import report
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import demand, spells
from alyr.modules.items import report as catalog_report
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
from catalog_wa import catalog_module_on, talk  # noqa: F401  (the autouse fixture is used by name)
from test_consent import owner_sql
from test_items import STORE, counted, line, mk, on_shop, order, pay, people
from test_orders import customer
from test_reports import at, build, section, send_week
from test_sign_in import other_shop_with_owner

QATAR = ZoneInfo("Asia/Qatar")
SHOP = {"en": "Al Noor Electricals", "ar": "النور للكهربائيات"}


# ── the week ────────────────────────────────────────────────────────────────────────


@pytest.fixture
def week() -> date:
    """The last complete week (Sunday to Saturday) in the shop's time: a week in the past, so
    everything in it is something the test put there."""
    return report.last_full_week(datetime.now(UTC), "Asia/Qatar")


def retime_order(order_id: str, when: datetime) -> None:
    owner_sql("update orders set created_at = $2 where id = $1", UUID(order_id), when)
    owner_sql("update stock_movements set created_at = $2 where order_id = $1",
              UUID(order_id), when)


def catalog_lines(client, week, lang="en") -> list[str]:
    built = build(client, week)
    view = report.render(built, SHOP, lang)
    return next((s["lines"] for s in view["sections"] if s["key"] == "catalog"), [])


class Demo:
    """A week at the demo shop. Ten items, all made before the week began; then, in the week:

    * Sunday: Ahmed buys 3 Cable 2.5 mm and 20 Switch 1 gang.
    * Monday: 15 Switch 1 gang, 2 Distribution board; the last 10 Breaker 16 A sell, at 14:00,
      and 20 more arrive at 20:00 (out for 6 hours).
    * Tuesday: Cable 2.5 mm is switched off at 10:00 (back on Thursday at 10:00: 2 days). A
      Distribution board order (2) and an order on Ahmed's account (30 Switch 1 gang) are
      both cancelled: neither is a sale.
    * Wednesday: 1 Distribution board; the day's 5 Socket 13 A double sell at 11:00 (out until
      the day ends: 13 hours).
    * Friday: LED flood light is switched off at 12:00 and stays off (2 days to the week's end).
    * Customers asked for sold-out items on Tuesday, Wednesday and Saturday.
    """

    def __init__(self, client, week):
        self.client, self.week = client, week
        owner_sql("delete from items where tenant_id = $1", DEMO_TENANT_ID)
        self.cable = mk(client, name="Cable 2.5 mm", name_ar="كيبل 2.5 مم", price=22_500,
                        category="Cables")
        self.breaker = counted(client, 10, name="Breaker 16 A", name_ar="قاطع 16 أمبير",
                               price=1_800, category="Breakers")
        self.socket = mk(client, name="Socket 13 A double", name_ar="مقبس 13 أمبير مزدوج",
                         price=1_600, category="Fittings", stock_rule="daily_limit",
                         daily_limit=5)
        self.flood = mk(client, name="LED flood light 100 W", name_ar="كشاف ليد 100 واط",
                        price=7_500, category="Lighting")
        self.gang = mk(client, name="Switch 1 gang", name_ar="مفتاح إنارة مفرد", price=900,
                       category="Fittings")
        self.board = mk(client, name="Distribution board 12 way", name_ar="لوحة توزيع 12 خط",
                        price=18_500, category="Breakers")
        self.conduit = mk(client, name="Flexible conduit 20 mm", name_ar="خرطوم مرن 20 مم",
                          price=8_500, category="Cables")
        self.cable4 = mk(client, name="Cable 4 mm", name_ar="كيبل 4 مم", price=36_000,
                         category="Cables")
        self.breaker63 = mk(client, name="Breaker 63 A three pole", name_ar="قاطع 63 أمبير ثلاثي",
                            price=9_500, category="Breakers")
        self.cable15 = counted(client, 3, name="Cable 1.5 mm", name_ar="كيبل 1.5 مم",
                               price=14_500, category="Cables")
        before = at(week, -2, 10)  # the Friday before the week
        owner_sql("update items set created_at = $2 where tenant_id = $1",
                  DEMO_TENANT_ID, before)
        owner_sql("update stock_movements set created_at = $2 where tenant_id = $1",
                  DEMO_TENANT_ID, before)
        self.who = people(client, 5)
        self.ahmed = customer(client)

    def sell(self, who, item, quantity, day, hour, payment="link") -> str:
        placed = order(self.client, self.who[who] if isinstance(who, int) else who,
                       [line(item, quantity)], payment)
        assert placed.status_code == 200, placed.text
        if payment == "link":
            assert pay(self.client, placed.json()).status_code == 200
        retime_order(placed.json()["order_id"], at(self.week, day, hour))
        return placed.json()["order_id"]

    def cancel(self, order_id: str, day: int, hour: int) -> None:
        done = self.client.post(f"/api/orders/{order_id}/status", json={"status": "cancelled"})
        assert done.status_code == 200, done.text
        owner_sql("update stock_movements set created_at = $2 where order_id = $1",
                  UUID(order_id), at(self.week, day, hour))

    def flip(self, item, available, day, hour) -> None:
        done = self.client.post(f"/api/items/{item['id']}/switch", json={"available": available})
        assert done.status_code == 200, done.text
        owner_sql(
            "update activity set created_at = $3 where subject = 'item' and subject_id = $1 "
            "and action = $2 and created_at > now() - interval '1 minute'",
            UUID(item["id"]), "switched_on" if available else "switched_off",
            at(self.week, day, hour),
        )

    def ask(self, who, item, day, hour, via="order_page") -> None:
        contact = self.who[who]
        on_shop(self.client, demand.record, UUID(contact["id"]), [UUID(item["id"])], via,
                at(self.week, day, hour))

    def play(self) -> "Demo":
        c = self.client
        # Sunday
        self.sell(0, self.cable, 3, 0, 11)
        self.sell(1, self.gang, 20, 0, 12)
        # Monday
        self.sell(2, self.gang, 15, 1, 9)
        self.sell(0, self.board, 2, 1, 10)
        self.sell(1, self.breaker, 6, 1, 12)
        self.sell(2, self.breaker, 4, 1, 14)  # the last ten: out from 14:00
        received = c.post(f"/api/items/{self.breaker['id']}/stock",
                          json={"kind": "received", "quantity": 20, "reason": "delivery"})
        assert received.status_code == 200, received.text
        owner_sql("update stock_movements set created_at = $2 where kind = 'received' "
                  "and tenant_id = $1", DEMO_TENANT_ID, at(self.week, 1, 20))
        # Tuesday: the cable is switched off; two orders are cancelled
        self.flip(self.cable, False, 2, 10)
        gone = self.sell(3, self.board, 2, 2, 11)
        self.cancel(gone, 2, 12)
        tab = self.sell(self.ahmed, self.gang, 30, 2, 13, payment="account")
        self.cancel(tab, 2, 14)
        # Wednesday: one board, and the day's five sockets
        self.sell(4, self.board, 1, 3, 9)
        sockets = self.sell(0, self.socket, 5, 3, 11)
        today = datetime.now(QATAR).date()
        wednesday = (self.week + timedelta(days=3))
        owner_sql("update stock_movements set day = $2 where order_id = $1 and day is not null",
                  UUID(sockets), wednesday)
        owner_sql("update variant_day_stock set day = $2 where day = $3 and tenant_id = $1",
                  DEMO_TENANT_ID, wednesday, today)
        # Thursday: the cable is back
        self.flip(self.cable, True, 4, 10)
        # Friday: the flood light is switched off and stays off
        self.flip(self.flood, False, 5, 12)
        # Customers who asked for what was not there
        self.ask(0, self.cable, 2, 15)
        self.ask(1, self.cable, 3, 10, "whatsapp")
        self.ask(0, self.cable, 3, 16)  # the same customer, another day: one customer
        self.ask(2, self.socket, 3, 14)
        self.ask(0, self.flood, 6, 20)
        return self


@pytest.fixture
def demo(client, week) -> Demo:
    return Demo(client, week).play()


# ── a week of demo activity gives exactly these lines ───────────────────────────────

ENGLISH = [
    "Sold out this week: Cable 2.5 mm (2 days), LED flood light 100 W (2 days, still out), "
    "Socket 13 A double (13 hours) and 1 more",
    "Customers who asked for something sold out: 3 (Cable 2.5 mm 2, LED flood light 100 W 1)",
    "Low on stock now: Cable 1.5 mm (3 left)",
    "Most sold: Switch 1 gang (35), Breaker 16 A (10), Socket 13 A double (5)",
    "Biggest earners: Cable 2.5 mm QAR 675, Distribution board 12 way QAR 555, "
    "Switch 1 gang QAR 315",
    "Did not sell this week: Breaker 63 A three pole, Cable 1.5 mm, Cable 4 mm and 1 more",
]
ARABIC = [
    "نفدت هذا الأسبوع: كيبل 2.5 مم (يومان)، كشاف ليد 100 واط (يومان، لا يزال نافداً)، "
    "مقبس 13 أمبير مزدوج (13 ساعة) وصنف واحد آخر",
    "عملاء طلبوا صنفاً نافداً: 3 (كيبل 2.5 مم 2، كشاف ليد 100 واط 1)",
    "مخزون قليل الآن: كيبل 1.5 مم (المتبقي 3)",
    "الأكثر مبيعاً: مفتاح إنارة مفرد (35)، قاطع 16 أمبير (10)، مقبس 13 أمبير مزدوج (5)",
    "الأكثر إيراداً: كيبل 2.5 مم QAR 675، لوحة توزيع 12 خط QAR 555، مفتاح إنارة مفرد QAR 315",
    "لم تُبَع هذا الأسبوع: قاطع 63 أمبير ثلاثي، كيبل 1.5 مم، كيبل 4 مم وصنف واحد آخر",
]


def test_a_week_of_demo_activity_gives_exactly_these_lines_in_english(client, demo, week):
    built = build(client, week)
    assert [s["key"] for s in built["sections"]] == ["ledger", "orders", "catalog", "bookings",
                                                      "inbox"]
    view = report.render(built, SHOP, "en")
    shown = next(s for s in view["sections"] if s["key"] == "catalog")
    assert shown["title"] == "Catalog"
    assert shown["lines"] == ENGLISH
    # In the whole report it sits between the orders and the bookings, as a block of lines.
    block = "Catalog\n" + "\n".join(ENGLISH)
    assert block in view["text"]
    assert view["text"].index("Orders") < view["text"].index(block) < view["text"].index(
        "Bookings")
    assert shown["headline"] == "4 items sold out"


def test_a_week_of_demo_activity_gives_exactly_these_lines_in_arabic(client, demo, week):
    view = report.render(build(client, week), SHOP, "ar")
    shown = next(s for s in view["sections"] if s["key"] == "catalog")
    assert shown["title"] == "الكتالوج"
    assert shown["lines"] == ARABIC
    assert "الكتالوج\n" + "\n".join(ARABIC) in view["text"]
    assert shown["headline"] == "نفد 4 أصناف"


def test_the_report_the_workspace_and_the_email_carry_the_section(client, demo, week):
    page = client.get("/api/reports/weekly?weeks_ago=1").json()
    keys = [s["key"] for s in page["sections"]]
    assert keys == ["ledger", "orders", "catalog", "bookings", "inbox"]
    mine = page["sections"][keys.index("catalog")]
    assert mine["title"] == {"en": "Catalog", "ar": "الكتالوج"}
    assert mine["lines"] == {"en": ENGLISH, "ar": ARABIC}
    subject, text, html = report.email(build(client, week), SHOP)
    assert ENGLISH[0] in text and ARABIC[0] in text and "<h3" in html
    assert "Catalog</h3>" in html and "الكتالوج</h3>" in html


def test_the_stored_week_holds_the_numbers_as_plain_json(client, demo, week):
    built = build(client, week)
    numbers = section(built, "catalog")["numbers"]
    assert numbers["sold_out"]["count"] == 4 and len(numbers["sold_out"]["items"]) == 3
    assert numbers["asked"]["customers"] == 3
    assert numbers["low"] == {"count": 1, "items": [
        {"name": "Cable 1.5 mm", "name_ar": "كيبل 1.5 مم", "left": 3}]}
    assert numbers["idle"]["count"] == 4 and len(numbers["idle"]["items"]) == 3
    assert section(built, "catalog")["before"] == {}
    # What is stored is what the owner can be sent again: it renders the same from the copy.
    again = json.loads(json.dumps(built))
    assert report.render(again, SHOP, "en")["text"] == report.render(built, SHOP, "en")["text"]


def test_the_sunday_job_stores_the_week_with_the_catalog_in_it(client, demo, week):
    send_week(client, week)
    [row] = owner_sql(
        "select sections from weekly_reports where tenant_id = $1 and week_start = $2",
        DEMO_TENANT_ID, week,
    )
    stored = {"week_start": week.isoformat(), "sections": json.loads(row["sections"])}
    assert [s["key"] for s in stored["sections"]] == ["ledger", "orders", "catalog", "bookings",
                                                       "inbox"]
    view = report.render(stored, SHOP, "en")
    assert next(s for s in view["sections"] if s["key"] == "catalog")["lines"] == ENGLISH
    assert report.render(stored, SHOP, "ar")["text"].count("الكتالوج\n" + ARABIC[0]) == 1


# ── how long each item was sold out, the three ways an item runs out ────────────────


def test_an_item_switched_off_counted_out_or_out_for_the_day_has_its_hours_worked_out(
    client, demo, week
):
    start, end = report.bounds(week, "Asia/Qatar")

    async def look(conn):
        clock = await shop_clock.load(conn)
        return await spells.sold_out(conn, clock, start, end)

    found = {s.name: (s.minutes, s.still) for s in on_shop(client, look)}
    assert found == {
        "Cable 2.5 mm": (48 * 60, False),  # a switch: Tuesday 10:00 to Thursday 10:00
        "Breaker 16 A": (6 * 60, False),  # counted: 14:00 to the delivery at 20:00
        "Socket 13 A double": (13 * 60, False),  # a daily limit: 11:00 to the day's end
        "LED flood light 100 W": (36 * 60, True),  # a switch left off, Friday 12:00 on
    }
    # The same week seen from the Saturday before it began knows none of this.
    quiet = on_shop(client, lambda conn: _spells_between(conn, start - timedelta(days=7), start))
    assert quiet == []


async def _spells_between(conn, start, end):
    return await spells.sold_out(conn, await shop_clock.load(conn), start, end)


def test_a_count_corrected_in_minutes_is_not_a_sell_out(client, week):
    item = counted(client, 4, name="Dates", name_ar="تمر")
    owner_sql("update items set created_at = $2 where id = $1", UUID(item["id"]), at(week, -1, 9))
    owner_sql("update stock_movements set created_at = $2 where tenant_id = $1",
              DEMO_TENANT_ID, at(week, -1, 9))
    vid = item["variants"][0]["id"]
    for kind, quantity, minute in (("wasted", 4, 0), ("received", 4, 40)):
        done = client.post(f"/api/items/{item['id']}/stock", json={
            "kind": kind, "quantity": quantity, "variant_id": vid, "reason": "recount"})
        assert done.status_code == 200, done.text
        owner_sql("update stock_movements set created_at = $2 where kind = $3 "
                  "and variant_id = $1",
                  UUID(vid), at(week, 2, 10) + timedelta(minutes=minute), kind)
    start, end = report.bounds(week, "Asia/Qatar")
    found = on_shop(client, lambda conn: _spells_between(conn, start, end))
    assert [s for s in found if s.name == "Dates"] == []  # 40 minutes out: left out
    owner_sql("update stock_movements set created_at = $2 where kind = 'received' "
              "and variant_id = $1", UUID(vid), at(week, 2, 12))
    found = on_shop(client, lambda conn: _spells_between(conn, start, end))
    assert [(s.name, s.minutes) for s in found if s.name == "Dates"] == [("Dates", 120)]


def test_a_draft_that_went_live_mid_week_was_not_sold_out_before_it(client, week):
    item = counted(client, 0, name="Dates", name_ar="تمر", status="draft")
    owner_sql("update items set created_at = $2 where id = $1", UUID(item["id"]), at(week, -1, 9))
    changed = client.put(f"/api/items/{item['id']}", json={"status": "live"})
    assert changed.status_code == 200, changed.text
    owner_sql("update activity set created_at = $2 where subject_id = $1 and action = 'updated'",
              UUID(item["id"]), at(week, 3, 12))
    received = client.post(f"/api/items/{item['id']}/stock",
                           json={"kind": "received", "quantity": 5, "reason": "delivery"})
    assert received.status_code == 200, received.text
    owner_sql("update stock_movements set created_at = $2 where kind = 'received' and "
              "tenant_id = $1", DEMO_TENANT_ID, at(week, 3, 12) + timedelta(minutes=5))
    start, end = report.bounds(week, "Asia/Qatar")
    found = on_shop(client, lambda conn: _spells_between(conn, start, end))
    assert [s for s in found if s.name == "Dates"] == []  # empty only while it was a draft


def test_a_switch_saved_with_the_item_leaves_the_same_record_as_one_flipped(client):
    item = mk(client, name="Dates", name_ar="تمر")
    assert client.put(f"/api/items/{item['id']}", json={"available": False}).status_code == 200
    log = client.get(f"/api/items/{item['id']}/activity").json()["activity"]
    assert "switched_off" in [row["action"] for row in log]


# ── a cancelled order is not a sale ─────────────────────────────────────────────────


def test_a_cancelled_or_reversed_order_is_not_a_sale(client, demo, week):
    numbers = section(build(client, week), "catalog")["numbers"]
    units = {r["name"]: (r["units"], r["value"]) for r in numbers["top_units"]}
    assert units["Switch 1 gang"] == (35, 31_500)  # not 65: the account order was cancelled
    value = {r["name"]: r["value"] for r in numbers["top_value"]}
    assert value["Distribution board 12 way"] == 55_500  # not 92,500: two were cancelled
    # The board's cancelled order is on the record all the same.
    assert owner_sql("select count(*) as n from orders where tenant_id = $1 "
                     "and status = 'cancelled'", DEMO_TENANT_ID)[0]["n"] == 2


# ── the section is short, and absent when there is nothing to say ───────────────────


def test_the_lines_are_left_out_when_they_have_nothing_to_say(client, week):
    mk(client, name="Dates", name_ar="تمر")
    assert catalog_lines(client, week) == []
    assert catalog_lines(client, week, "ar") == []
    view = report.render(build(client, week), SHOP, "en")
    assert [s["key"] for s in view["sections"]] == ["ledger", "orders", "bookings", "inbox"]
    assert "Catalog" not in view["text"]


def test_one_line_when_the_same_items_lead_by_units_and_by_money(client, week):
    dates = mk(client, name="Dates", name_ar="تمر", price=1_000)
    figs = mk(client, name="Figs", name_ar="تين", price=500)
    owner_sql("update items set created_at = $2 where tenant_id = $1", DEMO_TENANT_ID,
              at(week, -1, 9))
    who = people(client, 2)
    for item, quantity, day in ((dates, 3, 1), (figs, 2, 2)):
        placed = order(client, who[0], [line(item, quantity)])
        assert pay(client, placed.json()).status_code == 200
        retime_order(placed.json()["order_id"], at(week, day, 10))
    assert catalog_lines(client, week)[:1] == [
        "Most sold: Dates (3, QAR 30), Figs (2, QAR 10)"]
    assert catalog_lines(client, week, "ar")[:1] == [
        "الأكثر مبيعاً: تمر (3، QAR 30)، تين (2، QAR 10)"]


def test_a_week_with_no_sales_does_not_list_every_item_as_unsold(client, week):
    mk(client, name="Dates", name_ar="تمر")
    owner_sql("update items set created_at = $2 where tenant_id = $1", DEMO_TENANT_ID,
              at(week, -1, 9))
    assert catalog_lines(client, week) == []


def test_lists_are_capped_and_the_nouns_agree_in_arabic(client, week):
    # Fifteen items nobody bought, in a week in which one item sold.
    owner_sql("delete from items where tenant_id = $1", DEMO_TENANT_ID)
    sold = mk(client, name="Tea", name_ar="شاي")
    for n in range(15):
        mk(client, name=f"Item {n:02d}", name_ar=f"صنف {n:02d}")
    owner_sql("update items set created_at = $2 where tenant_id = $1", DEMO_TENANT_ID,
              at(week, -1, 9))
    placed = order(client, people(client, 1)[0], [line(sold)])
    pay(client, placed.json())
    retime_order(placed.json()["order_id"], at(week, 1, 10))
    assert catalog_lines(client, week)[-1] == (
        "Did not sell this week: Item 00, Item 01, Item 02 and 12 more")
    assert catalog_lines(client, week, "ar")[-1] == (
        "لم تُبَع هذا الأسبوع: صنف 00، صنف 01، صنف 02 و12 صنفاً آخر")
    for n, expected in ((1, "وصنف واحد آخر"), (2, "وصنفان آخران"), (5, "و5 أصناف أخرى"),
                        (11, "و11 صنفاً آخر")):
        text = catalog_report._join(["a"], n + 1, "ar")
        assert text == "a " + expected, (n, text)
    assert catalog_report._join(["a", "b"], 2, "ar") == "a، b"
    assert catalog_report._join(["a", "b"], 2, "en") == "a, b"


def test_durations_count_in_hours_then_days_in_both_languages():
    def length(minutes, lang, still=False):
        row = {"name": "A", "name_ar": "ب", "minutes": minutes, "still": still}
        return catalog_report._lasted(row, lang)

    assert length(60, "en") == "A (1 hour)"
    assert length(150, "en") == "A (3 hours)"
    assert length(23 * 60 + 29, "en") == "A (23 hours)"
    assert length(24 * 60, "en") == "A (1 day)"
    assert length(47 * 60, "en") == "A (2 days)"
    assert length(7 * 24 * 60, "en", still=True) == "A (7 days, still out)"
    assert length(60, "ar") == "ب (ساعة واحدة)"
    assert length(120, "ar") == "ب (ساعتان)"
    assert length(5 * 60, "ar") == "ب (5 ساعات)"
    assert length(24 * 60, "ar") == "ب (يوم واحد)"
    assert length(2 * 24 * 60, "ar") == "ب (يومان)"
    assert length(7 * 24 * 60, "ar", still=True) == "ب (7 أيام، لا يزال نافداً)"


# ── a shop without the Catalog module hears nothing of it ───────────────────────────


def test_a_shop_without_the_catalog_module_has_no_catalog_section(client, demo, week):
    with_it = report.render(build(client, week), SHOP, "en")
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'catalog'",
              DEMO_TENANT_ID)
    built = build(client, week)
    assert [s["key"] for s in built["sections"]] == ["ledger", "orders", "bookings", "inbox"]
    without = report.render(built, SHOP, "en")
    assert "Catalog" not in without["text"] and "sold out" not in without["text"].lower()
    # Everything else reads exactly as it did: the text is the same less the one block.
    block = "Catalog\n" + "\n".join(ENGLISH)
    assert with_it["text"].replace("\n\n" + block, "") == without["text"]
    assert without["summary"] == with_it["summary"].replace("; 4 items sold out", "")
    assert [s["key"] for s in client.get("/api/reports/weekly").json()["sections"]] == [
        "ledger", "orders", "bookings", "inbox"]


# ── customers who asked for something sold out: the record behind the line ──────────


def asks():
    return owner_sql("select a.contact_id, a.item_id, a.day, a.via from sold_out_asks a "
                     "where a.tenant_id = $1 order by a.created_at", DEMO_TENANT_ID)


def test_a_cart_check_with_a_sold_out_item_is_noted_once_per_customer_item_and_day(client):
    item = counted(client, 1, name="Dates", name_ar="تمر")
    other = mk(client, name="Figs", name_ar="تين")
    sold = order(client, people(client, 1)[0], [line(item, 1)])
    assert sold.status_code == 200
    who = people(client, 2)[1]
    for _ in range(3):  # trying three times in one day is one ask
        checked = client.post(f"{STORE}/cart/check", json={
            "items": [line(item, 1), line(other, 1)], "contact_id": who["id"]})
        assert checked.status_code == 200 and not checked.json()["ok"]
    found = asks()
    assert [(str(r["contact_id"]), str(r["item_id"]), r["via"]) for r in found] == [
        (who["id"], item["id"], "order_page")]
    # A check with no customer (nobody to count) writes nothing.
    client.post(f"{STORE}/cart/check", json={"items": [line(item, 1)]})
    assert len(asks()) == 1
    # Tomorrow it is a new ask.
    day_after = datetime.now(QATAR) + timedelta(days=1)
    on_shop(client, demand.record, UUID(who["id"]), [UUID(item["id"])], "order_page", day_after)
    assert len(asks()) == 2


def test_a_switched_off_item_counts_but_a_price_change_or_a_schedule_does_not(client):
    switch = mk(client, name="Dates", name_ar="تمر")
    client.post(f"/api/items/{switch['id']}/switch", json={"available": False})
    priced = mk(client, name="Figs", name_ar="تين", price=500)
    who = people(client, 1)[0]
    checked = client.post(f"{STORE}/cart/check", json={
        "items": [line(switch), line(priced, 1, expected_price=900)], "contact_id": who["id"]})
    codes = {row["item_id"]: row["code"] for row in checked.json()["lines"] if not row["ok"]}
    assert codes == {switch["id"]: "unavailable", priced["id"]: "price_changed"}
    assert [str(r["item_id"]) for r in asks()] == [switch["id"]]


def test_a_refused_order_notes_the_ask_even_though_the_order_is_rolled_back(client):
    item = counted(client, 1, name="Dates", name_ar="تمر")
    first, second = people(client, 2)
    assert order(client, first, [line(item, 1)]).status_code == 200
    refused = order(client, second, [line(item, 1)])
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "sold_out"
    assert [(str(r["contact_id"]), str(r["item_id"])) for r in asks()] == [
        (second["id"], item["id"])]
    assert owner_sql("select count(*) as n from orders where tenant_id = $1",
                     DEMO_TENANT_ID)[0]["n"] == 1


def test_same_as_last_time_notes_what_could_not_be_ordered_again(client):
    gone = counted(client, 1, name="Dates", name_ar="تمر")
    stays = mk(client, name="Figs", name_ar="تين")
    who = people(client, 2)[0]
    assert order(client, who, [line(gone, 1), line(stays, 1)]).status_code == 200
    again = client.post(f"{STORE}/orders/repeat", json={"contact_id": who["id"],
                                                         "payment": "link"})
    assert again.status_code == 200 and len(again.json()["left_out"]) == 1
    assert [str(r["item_id"]) for r in asks()] == [gone["id"]]


def test_a_customer_who_sees_a_sold_out_item_in_the_chat_is_noted_and_staff_are_not(client):
    item = mk(client, name="Dates", name_ar="تمر")
    client.post(f"/api/items/{item['id']}/switch", json={"available": False})
    card = talk(client, AHMED_PHONE, "dates")
    assert any("sold out" in m["body"].lower() for m in card)
    assert [(r["via"], str(r["item_id"])) for r in asks()] == [("whatsapp", item["id"])]
    talk(client, AHMED_PHONE, "dates")  # again today: still one
    assert len(asks()) == 1
    # Asking to be told when it is back is the same ask, and the watch is a record of its own.
    asked = talk(client, AHMED_PHONE, "tell me when dates are back")[-1]
    agreed = next(c for c in asked["payload"]["choices"] if c["id"].startswith("notify_yes:"))
    talk(client, AHMED_PHONE, reply_id=agreed["id"])
    waiting = owner_sql("select count(*) as n from stock_watches where status = 'waiting'")
    assert waiting[0]["n"] == 1
    assert len(asks()) == 1
    # A number the owner registered as staff is not a customer.
    staff = UUID(str(owner_sql("select id from contacts where role = 'staff' limit 1")[0]["id"]))
    assert on_shop(client, demand.record, staff, [UUID(item["id"])], "whatsapp") == 0
    assert len(asks()) == 1


def test_items_not_on_sale_and_a_shop_without_the_module_are_not_noted(client):
    draft = mk(client, name="Dates", name_ar="تمر", status="draft")
    who = UUID(people(client, 1)[0]["id"])
    assert on_shop(client, demand.record, who, [UUID(draft["id"])], "order_page") == 0
    live = mk(client, name="Figs", name_ar="تين")
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'catalog'",
              DEMO_TENANT_ID)
    assert on_shop(client, demand.record, who, [UUID(live["id"])], "order_page") == 0
    assert asks() == []
    with pytest.raises(ValueError):
        on_shop(client, demand.record, who, [UUID(live["id"])], "carrier pigeon")


def test_one_shop_cannot_see_or_write_anothers_asks(client):
    item = mk(client, name="Dates", name_ar="تمر")
    who = UUID(people(client, 1)[0]["id"])
    assert on_shop(client, demand.record, who, [UUID(item["id"])], "order_page") == 1
    other = other_shop_with_owner("owner-asks@other.example")

    async def look(conn):
        return await conn.fetchval("select count(*) from sold_out_asks")

    async def as_other():
        async with client.app.state.db.tenant(other) as conn:
            seen = await look(conn)
            import asyncpg

            with pytest.raises(asyncpg.exceptions.PostgresError):
                await conn.execute(
                    "insert into sold_out_asks (tenant_id, contact_id, item_id, day, via) "
                    "values ($1, $2, $3, current_date, 'whatsapp')",
                    DEMO_TENANT_ID, who, UUID(item["id"]),
                )
            return seen

    assert client.portal.call(as_other) == 0
    assert on_shop(client, look) == 1
    async def without_a_shop(conn):
        return await conn.fetchval("select count(*) from sold_out_asks")

    async def unscoped():
        async with client.app.state.db.unscoped() as conn:
            return await without_a_shop(conn)

    assert client.portal.call(unscoped) == 0
