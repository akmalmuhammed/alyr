"""The Catalog's foundation (ALY-102, D-039): items, variants, options, availability rules,
the stock log, the price history, and the API that manages them. The scenarios of the plan
that this package owns are in test_catalog_scenarios.py, which uses the helpers here.
"""

import json
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import asyncpg
import pytest

from alyr.core import team
from alyr.modules.items import stock
from alyr.modules.items.cart import CartLine
from alyr.modules.orders import service as orders
from alyr.seed import AGENT_EMAIL, DEMO_SLUG, DEMO_TENANT_ID
from test_consent import owner_sql
from test_sign_in import sign_in

STORE = f"/api/store/{DEMO_SLUG}"
QATAR = ZoneInfo("Asia/Qatar")
ACTOR = team.Actor(None, "Test")
EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]


# ------------------------------------------------------------------------ helpers

def mk(client, **fields) -> dict:
    """Add a live item through the API and return it."""
    body = {"name": "Shawarma", "name_ar": "شاورما", "price": 1200, "status": "live", **fields}
    response = client.post("/api/items", json=body)
    assert response.status_code == 200, response.text
    return response.json()["item"]


def counted(client, on_hand: int, **fields) -> dict:
    """An item counted in stock, with an opening count."""
    return mk(client, stock_rule="count", opening_stock=on_hand, **fields)


def fresh(client, item: dict) -> dict:
    response = client.get(f"/api/items/{item['id']}")
    assert response.status_code == 200, response.text
    return response.json()


def vid(item: dict, name: str | None = None) -> str:
    return next(v["id"] for v in item["variants"] if name is None or v["name"] == name)


def on_hand(client, item: dict, name: str | None = None) -> int:
    return next(
        v["on_hand"] for v in fresh(client, item)["variants"] if name is None or v["name"] == name
    )


def line(item: dict, quantity: int = 1, **more) -> dict:
    return {"product_id": item["id"], "quantity": quantity, **more}


def people(client, count: int = 2) -> list[dict]:
    """Demo customers who can pay by link."""
    found = client.get("/api/ledger/summary").json()["customers"]
    return [c for c in found if c["phone"]][:count]


def order(client, contact: dict, lines: list[dict], payment: str = "link", **more):
    return client.post(
        f"{STORE}/orders",
        json={"contact_id": contact["id"], "items": lines, "payment": payment, **more},
    )


def detail(response) -> dict:
    return response.json()["detail"]


def pay(client, placed: dict) -> dict:
    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", placed["pay_url"]).groups()
    return client.post(f"/api/pay/{tenant_id}/{payment_id}/complete")


def on_shop(client, fn, *args, **kwargs):
    """Run something against the demo shop inside the app's own event loop."""

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return await fn(conn, *args, **kwargs)

    return client.portal.call(go)


def place_at(client, contact: dict, lines: list[CartLine], now: datetime, **more):
    """Place an order as if it were `now` on the shop's wall clock."""
    return on_shop(
        client,
        lambda conn: orders.create_order(
            conn, DEMO_TENANT_ID, UUID(contact["id"]), lines, more.pop("payment", "link"),
            "http://web.test", client.app.state.outbound, now=now, **more,
        ),
    )


def drain(client):
    client.portal.call(client.app.state.jobs.drain)


def log_rows(client, item: dict, **query) -> list[dict]:
    response = client.get(f"/api/items/{item['id']}/stock-log", params=query)
    assert response.status_code == 200, response.text
    return response.json()["log"]


def reconciled(client) -> bool:
    """The number on every variant equals the total of its log."""
    return on_shop(client, stock.mismatches) == []


# ------------------------------------------------------------------ an item, plainly

def test_an_item_has_both_languages_a_price_a_unit_tags_and_a_status(client):
    made = client.post("/api/items", json={
        "name": "Chicken shawarma", "name_ar": "شاورما دجاج",
        "description": "Wrapped in saj bread", "description_ar": "ملفوف بخبز الصاج",
        "category": "Wraps", "price": 1200, "unit": "portion", "min_order": 2, "pack_size": 1,
        "tags": ["halal", "spicy", "Halal", " "],
    })
    assert made.status_code == 200
    item = made.json()["item"]
    assert (item["name"], item["name_ar"], item["status"]) == (
        "Chicken shawarma", "شاورما دجاج", "draft",  # nothing is live until the owner says so
    )
    assert (item["unit"], item["min_order"], item["pack_size"]) == ("portion", 2, 1)
    assert item["tags"] == ["halal", "spicy"]  # trimmed and without repeats
    assert item["price_text"] == "QAR 12"
    assert [v["is_default"] for v in item["variants"]] == [True]  # every item has a variant
    assert made.json()["id"] == item["id"]
    assert fresh(client, item)["description_ar"] == "ملفوف بخبز الصاج"


def test_the_arabic_name_is_required_before_an_item_goes_live(client):
    refused = client.post("/api/items", json={"name": "Tea", "price": 500, "status": "live"})
    assert refused.status_code == 422
    assert detail(refused)["code"] == "arabic_needed"
    draft = client.post("/api/items", json={"name": "Tea", "price": 500}).json()["item"]
    assert draft["status"] == "draft"
    going_live = client.post(f"/api/items/{draft['id']}/status", json={"status": "live"})
    assert going_live.status_code == 422
    assert client.put(
        f"/api/items/{draft['id']}", json={"name_ar": "شاي", "status": "live"}
    ).status_code == 200
    assert fresh(client, draft)["status"] == "live"


def test_only_live_items_are_sold_and_archived_ones_leave_the_list(client):
    tea = mk(client, name="Tea", name_ar="شاي", status="draft")
    names = lambda: [p["name"] for p in client.get(STORE).json()["products"]]  # noqa: E731
    assert "Tea" not in names()
    client.post(f"/api/items/{tea['id']}/status", json={"status": "live"})
    assert "Tea" in names()
    client.post(f"/api/items/{tea['id']}/status", json={"status": "hidden"})
    assert "Tea" not in names()
    client.post(f"/api/items/{tea['id']}/status", json={"status": "archived"})
    listed = [i["name"] for i in client.get("/api/items").json()["items"]]
    assert "Tea" not in listed
    assert "Tea" in [
        i["name"] for i in client.get("/api/items", params={"archived": True}).json()["items"]
    ]


def test_the_items_list_searches_both_languages_and_filters(client):
    mk(client, name="Karak tea", name_ar="شاي كرك", category="Drinks", tags=["hot"])
    mk(client, name="Lemon mint", name_ar="ليمون بالنعناع", category="Drinks", status="hidden")
    def search(**query):
        return [i["name"] for i in client.get("/api/items", params=query).json()["items"]]

    assert search(q="كرك") == ["Karak tea"]
    assert search(q="HOT") == ["Karak tea"]  # tags are searched too
    assert search(category="Drinks", status="hidden") == ["Lemon mint"]
    assert len(search()) == 14  # the 12 demo items and these two


def test_unit_and_rule_come_from_the_lists(client):
    for bad in ({"unit": "bucket"}, {"stock_rule": "whenever"}, {"status": "gone"}):
        refused = client.post("/api/items", json={"name": "X", "price": 100, **bad})
        assert refused.status_code == 422, bad


def test_the_last_changes_leave_the_rest_of_the_item_alone(client):
    item = mk(client, name="Karak", name_ar="كرك", category="Drinks", tags=["hot"])
    client.put(f"/api/items/{item['id']}", json={"price": 600})
    after = fresh(client, item)
    assert (after["price"], after["name"], after["category"], after["tags"]) == (
        600, "Karak", "Drinks", ["hot"],
    )
    assert client.put(f"/api/items/{item['id']}", json={"name": None}).status_code == 422
    assert client.put(f"/api/items/{uuid4()}", json={"price": 1}).status_code == 404


def test_a_sale_price_has_dates_and_the_price_history_keeps_every_price(client):
    item = mk(client, price=1000)
    start = datetime.now(UTC) - timedelta(hours=1)
    end = datetime.now(UTC) + timedelta(days=2)
    saved = client.put(f"/api/items/{item['id']}", json={
        "sale_price": 800, "sale_starts_at": start.isoformat(), "sale_ends_at": end.isoformat(),
        "reason": "Weekend offer",
    })
    assert saved.status_code == 200
    on_sale = fresh(client, item)
    assert (on_sale["sale_active"], on_sale["current_price"], on_sale["price"]) == (
        True, 800, 1000,
    )
    assert next(p for p in client.get(STORE).json()["products"] if p["id"] == item["id"])[
        "price"
    ] == 800  # the order page shows what it will charge
    off = client.put(f"/api/items/{item['id']}", json={"price": 1100, "sale_price": None})
    assert off.status_code == 200, off.text
    assert fresh(client, item)["sale_ends_at"] is None  # the sale's dates went with it
    history = client.get(f"/api/items/{item['id']}/price-history").json()["history"]
    assert [(h["price"], h["sale_price"]) for h in history] == [
        (1100, None), (1000, 800), (1000, None),
    ]
    assert history[1]["reason"] == "Weekend offer"
    assert history[0]["changed_by"]["name"] == "Workspace"
    # A sale must come in under the usual price, and end after it starts.
    for bad in ({"sale_price": 1100}, {"sale_price": 900, "sale_ends_at": start.isoformat(),
                                         "sale_starts_at": end.isoformat()}):
        assert client.put(f"/api/items/{item['id']}", json=bad).status_code == 422


def test_the_price_history_and_the_stock_log_cannot_be_rewritten_by_the_app(client):
    item = counted(client, 5)

    async def try_it(sql):
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await conn.execute(sql)

    for sql in (
        "update item_price_history set price = 1",
        "delete from item_price_history",
        "update stock_movements set delta = 100",
        "delete from stock_movements",
    ):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            client.portal.call(try_it, sql)
    assert log_rows(client, item)[0]["kind"] == "opening"


# ------------------------------------------------------------------ variants, options

def test_variants_have_their_own_stock_and_price_difference(client):
    abaya = mk(client, name="Abaya", name_ar="عباية", price=25000, stock_rule="count", variants=[
        {"name": "Black / M", "name_ar": "أسود / م", "opening_stock": 3},
        {"name": "Black / L", "name_ar": "أسود / ك", "price_delta": 2000, "opening_stock": 1},
    ])
    assert [(v["name"], v["on_hand"], v["is_default"]) for v in abaya["variants"]] == [
        ("Black / M", 3, False), ("Black / L", 1, False),
    ]
    ahmed = people(client)[0]
    needs_one = order(client, ahmed, [line(abaya)])
    assert needs_one.status_code == 422 and detail(needs_one)["code"] == "variant_required"
    placed = order(client, ahmed, [line(abaya, 1, variant_id=vid(abaya, "Black / L"))])
    assert placed.status_code == 200
    assert placed.json()["total"] == 27000  # the price difference is charged
    assert (on_hand(client, abaya, "Black / L"), on_hand(client, abaya, "Black / M")) == (0, 3)
    sold_out = order(client, ahmed, [line(abaya, 1, variant_id=vid(abaya, "Black / L"))])
    assert sold_out.status_code == 409
    assert detail(sold_out)["message"] == "Abaya (Black / L) is sold out."
    # The medium is still for sale, and is offered instead.
    alternative = detail(sold_out)["lines"][0]["alternatives"][0]
    assert (alternative["variant_id"], alternative["price"]) == (vid(abaya, "Black / M"), 25000)
    medium = line(abaya, 3, variant_id=vid(abaya, "Black / M"))
    assert order(client, ahmed, [medium]).status_code == 200


def test_the_first_variant_added_takes_over_the_items_own_stock(client):
    cake = counted(client, 6, name="Cake", name_ar="كعكة")
    saved = client.put(f"/api/items/{cake['id']}", json={"variants": [
        {"name": "Small", "name_ar": "صغير"}, {"name": "Large", "name_ar": "كبير"},
    ]}).json()["item"]
    assert [(v["name"], v["on_hand"]) for v in saved["variants"]] == [("Small", 6), ("Large", 0)]
    assert not saved["variants"][0]["is_default"]
    # Leaving one out switches it off; its stock and history stay.
    client.put(f"/api/items/{cake['id']}", json={"variants": [
        {"id": saved["variants"][0]["id"], "name": "Small", "name_ar": "صغير"},
    ]})
    after = fresh(client, cake)
    assert [(v["name"], v["active"]) for v in after["variants"]] == [
        ("Small", True), ("Large", False),
    ]
    two_same = client.put(f"/api/items/{cake['id']}", json={"variants": [
        {"name": "Small"}, {"name": "small"},
    ]})
    assert two_same.status_code == 422 and detail(two_same)["code"] == "duplicate_variant"
    assert reconciled(client)


def test_options_have_required_choices_and_priced_extras(client):
    pizza = restaurant_item(client)
    assert [g["name"] for g in pizza["option_groups"]] == ["Size", "Extras"]
    size = pizza["option_groups"][0]
    assert size["required"] and [o["price_delta"] for o in size["options"]] == [0, 400]
    # The order page lists them without the ones switched off.
    page = next(p for p in client.get(STORE).json()["products"] if p["id"] == pizza["id"])
    assert page["option_groups"][1]["options"][0]["price_delta_text"] == "QAR 2"
    # Replacing the set keeps the ids of the choices that stay.
    kept = size["options"][1]
    client.put(f"/api/items/{pizza['id']}", json={"option_groups": [
        {"id": size["id"], "name": "Size", "name_ar": "الحجم", "required": True, "options": [
            {"id": kept["id"], "name": "Large", "name_ar": "كبير", "price_delta": 500},
        ]},
    ]})
    again = fresh(client, pizza)
    assert [g["name"] for g in again["option_groups"]] == ["Size"]
    assert [(o["id"], o["price_delta"]) for o in again["option_groups"][0]["options"]] == [
        (kept["id"], 500),
    ]
    empty_required = client.put(f"/api/items/{pizza['id']}", json={"option_groups": [
        {"name": "Crust", "required": True, "options": []},
    ]})
    assert empty_required.status_code == 422


def restaurant_item(client) -> dict:
    return mk(client, name="Pizza", name_ar="بيتزا", price=3000, option_groups=[
        {"name": "Size", "name_ar": "الحجم", "required": True, "options": [
            {"name": "Small", "name_ar": "صغير"},
            {"name": "Large", "name_ar": "كبير", "price_delta": 400},
        ]},
        {"name": "Extras", "name_ar": "إضافات", "max_choices": 2, "options": [
            {"name": "Cheese", "name_ar": "جبن", "price_delta": 200},
            {"name": "Olives", "name_ar": "زيتون", "price_delta": 150},
            {"name": "Mushrooms", "name_ar": "فطر", "price_delta": 150},
        ]},
    ])


# --------------------------------------------------------------- availability rules

def test_a_switch_item_sells_until_staff_turn_it_off(client):
    item = mk(client)
    ahmed = people(client)[0]
    assert order(client, ahmed, [line(item)]).status_code == 200
    off = client.post(f"/api/items/{item['id']}/switch", json={"available": False})
    assert off.status_code == 200
    refused = order(client, ahmed, [line(item)])
    assert (refused.status_code, detail(refused)["code"]) == (422, "unavailable")
    assert item["id"] not in [p["id"] for p in client.get(STORE).json()["products"]]
    client.post(f"/api/items/{item['id']}/switch", json={"available": True})
    assert order(client, ahmed, [line(item)]).status_code == 200


def test_an_always_item_has_no_switch_and_ignores_one(client):
    service = mk(client, name="Custom engraving", name_ar="نقش", stock_rule="always")
    flip = client.post(f"/api/items/{service['id']}/switch", json={"available": False})
    assert flip.status_code == 422 and detail(flip)["code"] == "no_switch"
    assert order(client, people(client)[0], [line(service, 3)]).status_code == 200


def test_a_counted_item_sells_down_to_zero_and_a_sold_out_item_stays_listed_apart(client):
    item = counted(client, 2, name="Tiramisu", name_ar="تيراميسو")
    ahmed = people(client)[0]
    assert order(client, ahmed, [line(item, 2)]).status_code == 200
    page = client.get(STORE).json()
    assert item["id"] not in [p["id"] for p in page["products"]]
    gone = next(p for p in page["unavailable"] if p["id"] == item["id"])
    assert (gone["reason"], gone["left"]) == ("sold_out", 0)
    assert fresh(client, item)["availability"] == {
        "orderable": False, "reason": "sold_out", "left": 0, "next_at": None, "next_date": None,
    }


def test_a_daily_limit_resets_with_the_shop_day_and_the_shop_chooses_when_it_begins(client):
    cake = mk(client, name="Date cake", name_ar="كعكة التمر", stock_rule="daily_limit",
              daily_limit=3)
    ahmed = people(client)[0]
    monday = datetime(2026, 10, 19, 14, 0, tzinfo=QATAR)
    for _ in range(3):
        place_at(client, ahmed, [CartLine(UUID(cake["id"]), 1)], monday)
    with pytest.raises(orders.OrderError) as sold_out:
        place_at(client, ahmed, [CartLine(UUID(cake["id"]), 1)], monday)
    assert sold_out.value.code == "sold_out"
    # The next morning the limit is back.
    tuesday = monday + timedelta(days=1)
    place_at(client, ahmed, [CartLine(UUID(cake["id"]), 3)], tuesday)
    # A bakery whose day starts at 4 am: 2 am on Wednesday still belongs to Tuesday.
    saved = client.put("/api/items/settings", json={"day_starts": "04:00"})
    assert saved.json() == {"hold_minutes": 30, "day_starts": "04:00"}
    with pytest.raises(orders.OrderError):
        place_at(client, ahmed, [CartLine(UUID(cake["id"]), 1)],
                 datetime(2026, 10, 21, 2, 0, tzinfo=QATAR))
    place_at(client, ahmed, [CartLine(UUID(cake["id"]), 1)],
             datetime(2026, 10, 21, 4, 0, tzinfo=QATAR))
    assert reconciled(client)


def test_a_daily_limit_can_be_topped_up_for_the_day_and_a_burnt_batch_written_off(client):
    cake = mk(client, name="Batch", name_ar="دفعة", stock_rule="daily_limit", daily_limit=2)
    today = datetime.now(QATAR).date().isoformat()
    made_more = client.post(f"/api/items/{cake['id']}/stock", json={
        "kind": "received", "quantity": 3, "reason": "Baked a second tray"})
    assert made_more.status_code == 200 and made_more.json()["balance"] == 5
    burnt = client.post(f"/api/items/{cake['id']}/stock", json={
        "kind": "wasted", "quantity": 1, "reason": "Burnt"})
    assert burnt.json()["balance"] == 4
    assert fresh(client, cake)["variants"][0]["left"] == 4
    # Each change belongs to the day it was made for.
    assert {r["day"] for r in log_rows(client, cake)} == {today}
    assert reconciled(client)
    assert client.post(f"/api/items/{cake['id']}/stock", json={
        "kind": "opening", "quantity": 1}).status_code == 422  # an opening count is for stock


def test_the_agent_role_flips_switches_and_counts_stock_but_cannot_edit_items(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    item = counted(owner, 5, name="Samosa", name_ar="سمبوسة")
    assert agent.post("/api/items", json={"name": "X", "price": 1}).status_code == 403
    assert agent.put(f"/api/items/{item['id']}", json={"price": 5}).status_code == 403
    assert agent.delete(f"/api/items/{item['id']}").status_code == 403
    assert agent.put("/api/items/settings", json={"hold_minutes": 10}).status_code == 403
    assert agent.get("/api/items/settings").status_code == 200
    flipped = agent.post(f"/api/items/{item['id']}/switch", json={"available": False})
    assert flipped.status_code == 200
    assert agent.post(f"/api/items/{item['id']}/stock", json={
        "kind": "received", "quantity": 5}).status_code == 200
    assert agent.get("/api/items").status_code == 200
    who = log_rows(owner, item)[0]["actor"]["name"]
    assert who == "Yusuf Rahman"


def test_the_items_api_needs_a_sign_in_and_the_orders_module(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    signed_out = client_factory()
    assert signed_out.get("/api/items").status_code == 401
    assert signed_out.post("/api/items", json={"name": "X", "price": 1}).status_code == 401
    owner = client_factory()
    sign_in(owner)
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'orders'",
              DEMO_TENANT_ID)
    assert owner.get("/api/items").status_code == 403  # the shop has not switched orders on


# ------------------------------------------------------ schedules, categories, the record

def test_a_schedule_round_trips_and_a_date_range_overrides_the_usual_week(client):
    soup = mk(client, name="Harees", name_ar="هريس", schedule=[
        {"weekdays": EVERY_DAY, "opens": "06:00", "closes": "11:00"},
        {"weekdays": EVERY_DAY, "opens": "21:00", "closes": "23:30",
         "valid_from": "2027-02-09", "valid_to": "2027-03-10"},
    ])
    assert [(w["opens"], w["valid_from"]) for w in soup["schedule"]] == [
        ("06:00:00", None), ("21:00:00", "2027-02-09"),
    ]
    ahmed, lines = people(client)[0], [CartLine(UUID(soup["id"]), 1)]
    place_at(client, ahmed, lines, datetime(2027, 2, 5, 8, 0, tzinfo=QATAR))  # the usual hours
    with pytest.raises(orders.OrderError) as in_ramadan:
        place_at(client, ahmed, lines, datetime(2027, 2, 15, 8, 0, tzinfo=QATAR))
    assert in_ramadan.value.code == "not_now"
    assert in_ramadan.value.lines[0]["next_at"] == "2027-02-15T21:00:00+03:00"
    place_at(client, ahmed, lines, datetime(2027, 2, 15, 22, 0, tzinfo=QATAR))  # the new hours
    # The schedule is replaced as a whole, and can be cleared.
    client.put(f"/api/items/{soup['id']}", json={"schedule": []})
    assert fresh(client, soup)["schedule"] == []
    place_at(client, ahmed, lines, datetime(2027, 2, 15, 8, 0, tzinfo=QATAR))
    bad = client.put(f"/api/items/{soup['id']}", json={"schedule": [
        {"opens": "11:00", "closes": "06:00"}]})
    assert bad.status_code == 422 and detail(bad)["code"] == "bad_schedule"


def test_categories_keep_the_owners_order_and_arabic_names(client):
    mk(client, name="Pie", name_ar="فطيرة", category="Desserts")
    mk(client, name="Latte", name_ar="لاتيه", category="Drinks")
    before = client.get("/api/items/categories").json()["categories"]
    assert {c["name"] for c in before} == {
        "Cables", "Breakers", "Lighting", "Fittings", "Desserts", "Drinks",
    }
    saved = client.put("/api/items/categories", json=[
        {"name": "Drinks", "name_ar": "مشروبات"}, {"name": "Desserts", "name_ar": "حلويات"},
    ]).json()["categories"]
    # The ones the owner ordered come first, then any an item uses that has no row yet.
    assert [(c["name"], c["name_ar"]) for c in saved[:2]] == [
        ("Drinks", "مشروبات"), ("Desserts", "حلويات"),
    ]
    assert {c["name"] for c in saved[2:]} == {"Cables", "Breakers", "Lighting", "Fittings"}
    twice = client.put("/api/items/categories", json=[{"name": "A"}, {"name": "a"}])
    assert twice.status_code == 422


def test_changes_to_an_item_are_on_the_record_with_who_made_them(client):
    item = mk(client, name="Karak", name_ar="كرك", price=500)
    client.put(f"/api/items/{item['id']}", json={"price": 700})
    client.post(f"/api/items/{item['id']}/switch", json={"available": False})
    client.post(f"/api/items/{item['id']}/status", json={"status": "hidden"})
    history = owner_sql(
        "select action, actor_name, detail from activity where subject = 'item' "
        "and subject_id = $1 order by created_at", UUID(item["id"]),
    )
    assert [h["action"] for h in history] == ["created", "updated", "switched_off", "updated"]
    assert {h["actor_name"] for h in history} == {"Workspace"}
    price = json.loads(history[1]["detail"])
    assert (price["price_from"], price["price_to"]) == ("QAR 5", "QAR 7")


def test_an_item_cannot_be_left_without_a_choice_that_can_be_sold(client):
    item = mk(client)
    empty = client.put(f"/api/items/{item['id']}", json={"variants": []})
    assert empty.status_code == 422 and detail(empty)["code"] == "variant_needed"
    # The photo is a slot for the photo pipeline: nothing here sets it.
    assert fresh(client, item)["photo_id"] is None
    assert all(v["photo_id"] is None for v in fresh(client, item)["variants"])
