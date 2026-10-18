"""Telling the shop's managers (ALY-106, D-039): low-stock and sold-out alerts (once a day for
each, not at night, in the language of the manager and inside or outside their 24-hour window),
and the refund notices (a paid order cancelled; a payment that arrived after its link had
expired). Also the low-stock number an item can have of its own."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest

from alyr.core import templates
from alyr.modules.items import alerts, events
from alyr.modules.ledger import service as ledger
from alyr.seed import OWNER_PHONE, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    ARABIC,
    catalog_module_on,
    sent,
    talk,
    window_closed,
)
from test_consent import owner_sql
from test_items import counted, fresh, line, mk, on_shop, order, pay, people
from test_sign_in import other_shop_with_owner

QATAR = ZoneInfo("Asia/Qatar")


@pytest.fixture(autouse=True)
def midday(monkeypatch):
    """Alerts are not sent at night, so the tests that are not about the night run at noon on
    the shop's clock, whenever they really run."""
    noon = datetime.now(QATAR).replace(hour=12, minute=0, second=0, microsecond=0)
    monkeypatch.setattr(alerts, "utc_now", lambda: noon.astimezone(UTC))


def sell(client, item, quantity=1, who=0, **more):
    """A customer orders and takes the stock (a pay-link order holds it)."""
    placed = order(client, people(client, 5)[who], [line(item, quantity, **more)], payment="link")
    assert placed.status_code == 200, placed.text
    return placed.json()


def open_window(phone=OWNER_PHONE):
    owner_sql("update contacts set last_inbound_at = now() where phone = $1", phone)


def told(client, phone=OWNER_PHONE) -> list[dict]:
    return sent(client, phone)


# ── low stock and sold out ───────────────────────────────────────────────────────────


def test_a_sale_that_takes_an_item_to_the_low_stock_number_tells_the_manager_once_a_day(client):
    open_window()
    item = counted(client, 8, name="Dates", name_ar="تمر")
    sell(client, item, 2, 0)  # 6 left: not low yet
    assert told(client) == []
    sell(client, item, 1, 1)  # 5 left: at the shop's number
    [low] = told(client)
    assert low["kind"] == "text" and low["body"] == "Low stock: Dates has only 5 left."
    sell(client, item, 1, 2)  # 4 left: it has already said so today
    assert len(told(client)) == 1
    # Running out is the second alert, and is also sent once.
    sell(client, item, 4, 3)
    [_, gone] = told(client)
    assert gone["body"] == "Sold out: Dates has just run out, so customers cannot order it."
    client.post(f"/api/items/{item['id']}/stock", json={"kind": "received", "quantity": 3,
                                                        "reason": "delivery"})
    sell(client, item, 3, 4)  # gone again, the same day
    assert len(told(client)) == 2
    # A counter staff member who is not a manager is not told.
    assert told(client, STAFF_PHONE) == []


def test_the_alert_is_in_the_managers_language(client):
    owner_sql("update contacts set lang = 'ar' where phone = $1", OWNER_PHONE)
    open_window()
    item = counted(client, 6, name="Dates", name_ar="تمر")
    sell(client, item, 1)
    [low] = told(client)
    assert ARABIC.search(low["body"]) and low["body"] == "مخزون منخفض: «تمر» المتبقي منه 5 فقط."
    sell(client, item, 5, 1)
    assert told(client)[-1]["body"] == "نفد: «تمر» نفد للتو، فلا يستطيع العملاء طلبه."


def test_outside_the_managers_window_the_alert_is_a_template(client):
    window_closed(OWNER_PHONE)
    item = counted(client, 6, name="Dates", name_ar="تمر")
    sell(client, item, 1)
    [low] = told(client)
    assert low["kind"] == "template" and low["payload"]["template"] == "stock_low"
    assert low["payload"]["category"] == "utility"
    assert low["payload"]["params"] == ["Al Noor Electricals", "Dates", "5"]
    assert low["body"].startswith("Low stock at Al Noor Electricals: Dates has only 5 left")
    sell(client, item, 5, 1)
    assert told(client)[-1]["payload"]["template"] == "stock_sold_out"


def test_an_item_with_sizes_names_the_sizes_that_are_low(client):
    open_window()
    item = mk(client, name="Abaya", name_ar="عباية", stock_rule="count", variants=[
        {"name": "Black M", "name_ar": "أسود M", "opening_stock": 9},
        {"name": "Black L", "name_ar": "أسود L", "opening_stock": 4},
    ])
    medium, large = (next(v["id"] for v in fresh(client, item)["variants"] if v["name"] == name)
                     for name in ("Black M", "Black L"))
    sell(client, item, 1, 0, variant_id=medium)  # 8 left of M: nothing to say
    assert told(client) == []
    sell(client, item, 1, 1, variant_id=large)  # 3 left of L: low
    [low] = told(client)
    assert low["body"] == "Low stock: Abaya has only Black L: 3 left."


def test_an_item_can_have_its_own_low_stock_number(client):
    open_window()
    own = counted(client, 6, name="Dates", name_ar="تمر", low_stock_at=1)
    sell(client, own, 4, 0)  # 2 left: low by the shop's 5, not by its own 1
    assert told(client) == []
    sell(client, own, 1, 1)  # 1 left
    assert [m["body"] for m in told(client)] == ["Low stock: Dates has only 1 left."]
    # The shop's number can be raised, and an item without its own follows it.
    client.put("/api/items/settings", json={"low_stock_at": 10})
    other = counted(client, 12, name="Figs", name_ar="تين")
    sell(client, other, 2, 2)  # 10 left
    assert told(client)[-1]["body"] == "Low stock: Figs has only 10 left."


def test_only_counted_items_on_sale_alert(client):
    open_window()
    switch = mk(client, name="Shawarma", name_ar="شاورما")
    talk(client, STAFF_PHONE, "sold out shawarma")
    draft = counted(client, 3, name="Figs", name_ar="تين", status="draft")
    assert fresh(client, switch)["available"] is False
    assert on_shop(client, StockAlertsAt(client).check, _uuid(draft)) is None
    assert on_shop(client, StockAlertsAt(client).check, _uuid(switch)) is None
    assert told(client) == []


def _uuid(item):
    return UUID(item["id"])


class StockAlertsAt:
    """A `StockAlerts` for the demo shop whose clock a test holds still."""

    def __init__(self, client, now: datetime | None = None):
        self.handler = alerts.StockAlerts(
            client.app.state.db, client.app.state.outbound, (lambda: now) if now else None
        )

    async def check(self, conn, item_id):
        return await self.handler.check(conn, item_id)


def test_no_alert_is_sent_at_night_and_the_morning_looks_again(client):
    open_window()
    item = counted(client, 4, name="Dates", name_ar="تمر")
    item_id = _uuid(item)
    night = datetime(2026, 10, 20, 23, 30, tzinfo=QATAR)
    assert on_shop(client, StockAlertsAt(client, night).check, item_id) is None
    assert told(client) == []
    # It waits for the morning: a job for 07:00 on the shop's clock, queued once.
    [job] = owner_sql("select run_at from jobs where kind = $1 and status = 'queued'",
                      events.STOCK_ALERT)
    assert job["run_at"].astimezone(QATAR) == datetime(2026, 10, 21, 7, 0, tzinfo=QATAR)
    assert on_shop(client, StockAlertsAt(client, night + timedelta(minutes=10)).check,
                   item_id) is None
    assert owner_sql("select count(*) from jobs where kind = $1 and status = 'queued'",
                     events.STOCK_ALERT)[0][0] == 1
    # Before the morning, in the small hours, it still waits.
    assert on_shop(client, StockAlertsAt(client, datetime(2026, 10, 21, 3, 0, tzinfo=QATAR)).check,
                   item_id) is None
    # In the morning it is still low, so it says so; and only once that day.
    morning = datetime(2026, 10, 21, 7, 30, tzinfo=QATAR)
    assert on_shop(client, StockAlertsAt(client, morning).check, item_id) == "low"
    assert on_shop(client, StockAlertsAt(client, morning.replace(hour=9)).check, item_id) is None
    assert [m["body"] for m in told(client)] == ["Low stock: Dates has only 4 left."]
    # The next day, still low: it says so again.
    tomorrow = morning + timedelta(days=1)
    assert on_shop(client, StockAlertsAt(client, tomorrow).check, item_id) == "low"
    assert len(told(client)) == 2


def test_an_item_filled_again_overnight_says_nothing_in_the_morning(client):
    open_window()
    item = counted(client, 4, name="Dates", name_ar="تمر")
    night = datetime(2026, 10, 20, 22, 30, tzinfo=QATAR)
    on_shop(client, StockAlertsAt(client, night).check, _uuid(item))
    client.post(f"/api/items/{item['id']}/stock", json={"kind": "received", "quantity": 40,
                                                        "reason": "delivery"})
    morning = datetime(2026, 10, 21, 7, 0, tzinfo=QATAR)
    assert on_shop(client, StockAlertsAt(client, morning).check, _uuid(item)) is None
    assert told(client) == []


def test_the_job_a_sale_queues_runs_in_the_background(client):
    """The sale queues the job; the worker's handler is the one registered at start."""
    open_window()
    item = counted(client, 6, name="Dates", name_ar="تمر")
    sell(client, item, 1)
    done = owner_sql("select status from jobs where kind = $1", events.STOCK_ALERT)
    assert [r["status"] for r in done] == ["done"]


def test_with_no_manager_the_report_recipients_are_told_and_with_none_nobody_is(client):
    open_window()
    owner_sql("update contacts set catalog_manager = false where phone = $1", OWNER_PHONE)
    item = counted(client, 6, name="Dates", name_ar="تمر")
    sell(client, item, 1, 0)
    assert len(told(client)) == 1  # Fatima receives the weekly report, so she is the owner
    owner_sql("update contacts set weekly_report = false where phone = $1", OWNER_PHONE)
    other = counted(client, 6, name="Figs", name_ar="تين")
    sell(client, other, 1, 1)
    assert len(told(client)) == 1
    # Nobody was told, so nothing was counted as sent: a manager registered later is told.
    recorded = owner_sql("select count(*) from stock_alerts where item_id = $1", _uuid(other))
    assert recorded[0][0] == 0


def test_one_shops_sales_never_alert_another_shops_manager(client):
    open_window()
    other = other_shop_with_owner(f"omar-{uuid4().hex[:8]}@other.example")
    owner_sql("insert into channel_numbers (number_id, tenant_id, channel) values "
              "('sim-other', $1, 'simulator') on conflict do nothing", other)
    manager = owner_sql(
        "insert into contacts (tenant_id, phone, name, role, catalog_manager, consent_service, "
        "last_inbound_at) values ($1, '97455500999', 'Their owner', 'staff', true, 'granted', "
        "now()) returning id", other,
    )[0]["id"]
    owner_sql(
        "insert into items (tenant_id, name, name_ar, price, status, stock_rule) "
        "values ($1, 'Dates', 'تمر', 900, 'live', 'count')", other,
    )
    their_item = owner_sql("select id from items where tenant_id = $1", other)[0]["id"]
    owner_sql("update item_variants set on_hand = 3 where item_id = $1", their_item)
    # Their item is low; it is checked as their shop, and only their manager is told.
    handler = alerts.StockAlerts(client.app.state.db, client.app.state.outbound)

    async def check_theirs():
        async with client.app.state.db.tenant(other) as conn:
            return await handler.check(conn, their_item)

    assert client.portal.call(check_theirs) == "low"
    assert owner_sql("select count(*) from messages where contact_id = $1", manager)[0][0] == 1
    assert told(client) == []
    owner_sql("delete from jobs where tenant_id = $1", other)


# ── refunds due ──────────────────────────────────────────────────────────────────────


def cancel(client, placed):
    answer = client.post(f"/api/orders/{placed['order_id']}/status", json={"status": "cancelled"})
    assert answer.status_code == 200, answer.text
    return answer.json()


def test_cancelling_an_order_the_customer_paid_for_tells_the_owner_a_refund_is_due(client):
    open_window()
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    placed = sell(client, item)
    pay(client, placed)
    result = cancel(client, placed)
    assert result.get("refund_due") is True
    [notice] = told(client)
    assert notice["body"] == (
        f"Refund due: order {placed['number']} for QAR 12 was cancelled after the customer "
        "paid. The refund is yours to make from your own payment account: ALYR never holds "
        "money."
    )
    # Cancelling again changes nothing and says nothing more.
    cancel(client, placed)
    assert len(told(client)) == 1


def test_a_refund_notice_outside_the_window_is_a_template_and_in_arabic_when_asked(client):
    window_closed(OWNER_PHONE)
    owner_sql("update contacts set lang = 'ar' where phone = $1", OWNER_PHONE)
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    placed = sell(client, item)
    pay(client, placed)
    cancel(client, placed)
    [notice] = told(client)
    assert notice["kind"] == "template" and notice["payload"]["template"] == "refund_due"
    assert notice["payload"]["lang"] == "ar" and ARABIC.search(notice["body"])
    assert notice["payload"]["params"] == [
        "النور للكهربائيات", str(placed["number"]), "QAR 12"]


def test_cancelling_an_unpaid_order_needs_no_refund_and_tells_no_one(client):
    open_window()
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    placed = sell(client, item)
    assert cancel(client, placed).get("refund_due") is False
    assert told(client) == []


def test_a_payment_that_arrives_after_its_link_expired_tells_the_owner_once(client):
    open_window()
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    placed = sell(client, item)
    cancel(client, placed)  # its link is expired and the order cancelled
    owner_sql("update payment_requests set provider = 'skipcash' where order_id = $1",
              UUID(placed["order_id"]))
    request = owner_sql("select id from payment_requests where order_id = $1",
                        UUID(placed["order_id"]))[0]["id"]

    async def late(conn):
        return await ledger.complete_payment(conn, request, client.app.state.outbound)

    assert on_shop(client, late) == "expired"
    [notice] = told(client)
    assert notice["body"] == (
        f"Refund due: a payment of QAR 12 arrived for order {placed['number']} after its "
        "payment link expired and the order was cancelled. The refund is yours to make from "
        "your own payment account: ALYR never holds money."
    )
    # A gateway that tells us again does not tell the owner again.
    assert on_shop(client, late) == "expired"
    assert len(told(client)) == 1
    assert owner_sql("select count(*) from activity where action = 'late_payment'")[0][0] == 1


def test_the_stand_in_gateway_moves_no_money_so_it_never_asks_for_a_refund(client):
    open_window()
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    placed = sell(client, item)
    cancel(client, placed)
    request = owner_sql("select id from payment_requests where order_id = $1",
                        UUID(placed["order_id"]))[0]["id"]

    async def late(conn):
        return await ledger.complete_payment(conn, request, client.app.state.outbound)

    assert on_shop(client, late) == "expired"
    assert told(client) == []


# ── an item's own low-stock number, in the API ───────────────────────────────────────


def test_an_item_keeps_its_own_low_stock_number_and_can_clear_it(client):
    item = counted(client, 3, name="Dates", name_ar="تمر")
    assert item["low_stock_at"] is None
    saved = client.put(f"/api/items/{item['id']}", json={"low_stock_at": 2})
    assert saved.status_code == 200 and saved.json()["item"]["low_stock_at"] == 2
    assert fresh(client, item)["low_stock_at"] == 2
    cleared = client.put(f"/api/items/{item['id']}", json={"low_stock_at": None})
    assert cleared.json()["item"]["low_stock_at"] is None
    for bad in (-1, 100_001):
        assert client.put(f"/api/items/{item['id']}", json={"low_stock_at": bad}).status_code == 422
    made = client.post("/api/items", json={"name": "Figs", "name_ar": "تين", "price": 500,
                                           "status": "live", "low_stock_at": 0})
    assert made.json()["item"]["low_stock_at"] == 0


def test_the_low_stock_filter_follows_each_items_own_number(client):
    shop_wide = counted(client, 3, name="Dates", name_ar="تمر")  # 3 is low by the shop's 5
    stricter = counted(client, 3, name="Figs", name_ar="تين", low_stock_at=2)
    looser = counted(client, 8, name="Nuts", name_ar="مكسرات", low_stock_at=10)
    low = client.get("/api/items", params={"filter": "low_stock"}).json()
    assert sorted(i["name"] for i in low["items"]) == ["Dates", "Nuts"]
    assert low["counts"]["low_stock"] == 2
    assert fresh(client, shop_wide)["low_stock_at"] is None
    assert fresh(client, stricter)["low_stock_at"] == 2
    assert fresh(client, looser)["low_stock_at"] == 10


def test_the_new_templates_are_in_the_catalogue_and_back_in_stock_is_marketing():
    for name in ("stock_low", "stock_sold_out", "refund_due", "refund_due_late", "draft_added"):
        assert templates.CATALOGUE[name].category == "utility", name
    assert templates.CATALOGUE["back_in_stock"].category == "marketing"
    assert templates.render("stock_sold_out", "en", ["Al Noor", "Dates"]) == (
        "Sold out at Al Noor: Dates has just run out, so customers cannot order it until you "
        "add stock.")
    assert templates.render("back_in_stock", "ar", ["النور", "تمر", "http://x"]).startswith(
        "أخبار سارة من النور: عاد «تمر» إلى المخزون")
