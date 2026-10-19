"""Discounts and coupon codes (ALY-150, `specs/014-pricing-pack/spec.md`): the feature off and on,
what a coupon says for every reason it may be refused, totals before payment equal to what is
charged, the order's snapshot, usage limits under a real race, cancelling giving a use back, the
owner's rules, and the chat in English and Arabic.

The arithmetic itself is tried on thousands of random carts in test_pricing_totals.py.
"""

import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg
import pytest

from alyr.modules.items import discounts, wa_coupon
from alyr.seed import AGENT_EMAIL, DEMO_SLUG
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    STRANGER,
    catalog_module_on,
    talk,
)
from concurrency import LockWatch, hold_open, warm
from conftest import OWNER_DSN
from order_links import token
from test_consent import owner_sql
from test_items import counted, detail, line, mk, on_hand, order, people
from test_order_by_code import ids, orders_of, tap
from test_orders import customer
from test_sign_in import sign_in
from test_templates import no_templates_left_over, office, owner  # noqa: F401  (fixtures by name)

STORE = f"/api/store/{DEMO_SLUG}"


def switch(client, on=True):
    response = client.put("/api/features/discounts", json={"enabled": on})
    assert response.status_code == 200, response.text


@pytest.fixture
def shop(client):
    switch(client)
    return client


def rule(client, **more) -> dict:
    body = {"kind": "coupon", "code": "RAMADAN10", "value_type": "percent", "percent": 10, **more}
    response = client.post("/api/discounts", json=body)
    assert response.status_code == 200, response.text
    return response.json()["rule"]


def auto(client, **more) -> dict:
    return rule(client, kind="auto", code="", **more)


def cake(client, price=10_000, **more):
    return mk(client, name="Dates cake", name_ar="كيكة تمر", category="Cakes", price=price, **more)


def check(client, who, lines, coupons=(), **more):
    response = client.post(f"{STORE}/cart/check", json={
        "items": lines, "token": token(who["id"]), "coupons": list(coupons), **more,
    })
    return response


def past(days=2):
    return (datetime.now(UTC) - timedelta(days=days)).isoformat()


def future(days=2):
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def orders_row(order_id):
    [row] = owner_sql("select * from orders where id = $1", UUID(order_id))
    return row


def uses_of(rule_id):
    [row] = owner_sql("select uses from discount_rules where id = $1", UUID(rule_id))
    return row["uses"]


def cancel(client, order_id):
    response = client.post(f"/api/orders/{order_id}/status", json={"status": "cancelled"})
    assert response.status_code == 200, response.text
    return response.json()


# ── the feature off: invisible and inert ────────────────────────────────────────────────


def test_it_is_off_by_default_and_the_api_refuses_with_feature_off(client):
    for call in (
        lambda: client.get("/api/discounts"),
        lambda: client.post("/api/discounts", json={"kind": "coupon", "code": "OFF123",
                                                    "value_type": "percent", "percent": 5}),
    ):
        response = call()
        assert response.status_code == 422
        body = response.json()["detail"]
        assert body["code"] == "feature_off" and body["message"] and body["message_ar"]
    [who] = people(client, 1)
    item = cake(client)
    refused = check(client, who, [line(item)], ["RAMADAN10"])
    assert refused.status_code == 422 and detail(refused)["code"] == "feature_off"
    placed = order(client, who, [line(item)], coupons=["RAMADAN10"])
    assert placed.status_code == 422 and detail(placed)["code"] == "feature_off"
    assert owner_sql("select count(*) as n from orders where total = 10000")[0]["n"] == 0


def test_with_the_feature_off_the_cart_check_and_the_page_read_as_they_always_did(client):
    [who] = people(client, 1)
    item = cake(client)
    answer = check(client, who, [line(item, 2)]).json()
    assert set(answer) == {"ok", "lines", "total", "total_text", "group"}
    assert answer["total"] == 20_000
    assert set(answer["lines"][0]) >= {"unit_price", "line_total"}
    assert "discount" not in answer["lines"][0]
    assert "pricing" not in client.get(STORE).json()
    placed = order(client, who, [line(item, 2)]).json()
    assert "pricing" not in placed and placed["total"] == 20_000
    row = orders_row(placed["order_id"])
    assert (row["subtotal"], row["discount_total"], row["total"]) == (20_000, 0, 20_000)
    listed = next(o for o in client.get("/api/orders").json()["orders"]
                  if o["id"] == placed["order_id"])
    assert "discounts" not in listed and "discount_total" not in listed


def test_switching_it_off_makes_every_rule_inert_but_keeps_them(client):
    switch(client)
    made = auto(client, percent=10)
    [who] = people(client, 1)
    item = cake(client)
    assert check(client, who, [line(item)]).json()["total"] == 9_000
    switch(client, False)
    assert check(client, who, [line(item)]).json()["total"] == 10_000
    assert "pricing" not in check(client, who, [line(item)]).json()
    assert client.get("/api/discounts").status_code == 422
    switch(client)
    assert uses_of(made["id"]) == 0
    assert check(client, who, [line(item)]).json()["total"] == 9_000  # it was only kept


def test_the_features_screen_names_it_in_plain_words_off_by_default(client):
    groups = client.get("/api/features").json()["groups"]
    feature = next(f for g in groups for f in g["features"] if f["key"] == "discounts")
    assert feature["name"] == "Discounts and coupon codes" and feature["enabled"] is False
    assert feature["name_ar"] and feature["hint_ar"] and "capabilit" not in str(feature).lower()
    switch(client)
    groups = client.get("/api/features").json()["groups"]
    feature = next(f for g in groups for f in g["features"] if f["key"] == "discounts")
    assert feature["enabled"] is True


# ── a coupon, end to end ──────────────────────────────────────────────────────────────────


def test_a_percentage_coupon_comes_off_line_by_line_and_the_order_charges_exactly_that(shop):
    client = shop
    made = rule(client)
    [who] = people(client, 1)
    item = cake(client)
    other = mk(client, name="Tea", name_ar="شاي", category="Drinks", price=2_500)
    cart = [line(item, 2), line(other, 3)]
    answer = check(client, who, cart, ["ramadan 10"]).json()
    pricing = answer["pricing"]
    assert pricing["subtotal"] == 27_500 and pricing["discount_total"] == 2_750
    assert answer["total"] == 24_750 and pricing["goods"] == 24_750
    assert [c["ok"] for c in pricing["coupons"]] == [True]
    assert pricing["coupons"][0]["code"] == "RAMADAN10" and pricing["coupons"][0]["amount"] == 2_750
    assert pricing["discounts"][0]["text"] == "10% off your order"
    assert pricing["discounts"][0]["text_ar"] == "خصم 10% على طلبك"
    # line by line: what each line pays adds up to the total, and the discounts to the discount
    shown = [x for x in answer["lines"] if x["ok"]]
    assert sum(x["line_total_after"] for x in shown) == 24_750
    assert sum(x["discount"] for x in shown) == 2_750
    assert [x["discount"] for x in shown] == [2_000, 750]

    placed = order(client, who, cart, coupons=["RAMADAN10"], expected_total=24_750).json()
    assert placed["total"] == 24_750 and placed["pricing"]["discount_total"] == 2_750
    row = orders_row(placed["order_id"])
    assert (row["subtotal"], row["discount_total"], row["total"]) == (27_500, 2_750, 24_750)
    lines = owner_sql("select discount, price, quantity from order_items where order_id = $1 "
                      "order by discount desc", UUID(placed["order_id"]))
    assert [r["discount"] for r in lines] == [2_000, 750]
    # the payment link asks for exactly the total that was shown
    [request] = owner_sql("select amount from payment_requests where order_id = $1",
                          UUID(placed["order_id"]))
    assert request["amount"] == 24_750
    # a snapshot of what was given
    [snap] = owner_sql(
        "select * from order_discounts where order_id = $1", UUID(placed["order_id"])
    )
    assert (snap["code"], snap["amount_off"], snap["rule_text"], snap["rule_id"]) == (
        "RAMADAN10", 2_750, "10% off your order", UUID(made["id"]))
    assert snap["rule_text_ar"] == "خصم 10% على طلبك" and snap["value_type"] == "percent"
    assert uses_of(made["id"]) == 1
    # the owner sees it on the order, the customer on the tracking page
    listed = next(o for o in client.get("/api/orders").json()["orders"]
                  if o["id"] == placed["order_id"])
    assert listed["subtotal"] == 27_500 and listed["discount_total"] == 2_750
    assert listed["discounts"][0]["code"] == "RAMADAN10" and listed["items"][0]["discount"]
    tenant = owner_sql("select id from tenants where slug = $1", DEMO_SLUG)[0]["id"]
    tracked = client.get(f"/api/track/{tenant}/{placed['order_id']}").json()["order"]
    assert tracked["discount_total"] == 2_750 and tracked["total"] == 24_750
    assert tracked["discounts"][0]["amount"] == 2_750
    # the message the customer gets says what came off
    sent = client.get(f"/sim/conversations/{who['phone']}").json()["messages"][-1]["body"]
    assert "2,750" not in sent or "27.50" not in sent  # (amounts are written QAR 27.50 style)
    assert "QAR 247.50" in sent


def test_the_order_is_a_snapshot_a_later_change_to_the_rule_never_rewrites_it(shop):
    client = shop
    made = rule(client)
    [who] = people(client, 1)
    item = cake(client)
    placed = order(client, who, [line(item)], coupons=["RAMADAN10"]).json()
    changed = client.put(f"/api/discounts/{made['id']}", json={
        "kind": "coupon", "code": "RAMADAN10", "value_type": "percent", "percent": 50,
    })
    assert changed.status_code == 200, changed.text
    client.post(f"/api/discounts/{made['id']}/end")
    row = orders_row(placed["order_id"])
    assert (row["subtotal"], row["discount_total"], row["total"]) == (10_000, 1_000, 9_000)
    [snap] = owner_sql(
        "select * from order_discounts where order_id = $1", UUID(placed["order_id"])
    )
    assert snap["rule_text"] == "10% off your order" and str(snap["percent"]) == "10.000"
    listed = next(o for o in client.get("/api/orders").json()["orders"]
                  if o["id"] == placed["order_id"])
    assert listed["discounts"][0]["text"] == "10% off your order"
    # and item prices changing later changes nothing on the order either
    client.put(f"/api/items/{item['id']}", json={"price": 99_999})
    assert orders_row(placed["order_id"])["total"] == 9_000


def test_the_total_shown_must_be_the_total_charged(shop):
    client = shop
    rule(client)
    [who] = people(client, 1)
    item = cake(client)
    wrong = order(client, who, [line(item)], coupons=["RAMADAN10"], expected_total=10_000)
    assert wrong.status_code == 409
    body = detail(wrong)
    assert body["code"] == "total_changed" and body["total"] == 9_000
    assert "QAR 90" in body["message"] and body["message_ar"]
    assert body["pricing"]["discount_total"] == 1_000
    assert owner_sql("select count(*) as n from orders")[0]["n"] == 0


def test_a_discount_never_takes_the_goods_below_qar_1(shop):
    client = shop
    rule(client, code="FREE100", percent=100)
    rule(client, code="BIGOFF", value_type="amount", percent=None, amount=1_000_000)
    [who] = people(client, 1)
    item = cake(client, price=2_500)
    for code in ("FREE100", "BIGOFF"):
        answer = check(client, who, [line(item)], [code]).json()
        assert answer["total"] == 100 and answer["pricing"]["discount_total"] == 2_400
    placed = order(client, who, [line(item)], coupons=["FREE100"]).json()
    assert placed["total"] == 100
    cheap = mk(client, name="Sweet", name_ar="حلوى", price=60)
    answer = check(client, who, [line(cheap)], ["FREE100"]).json()
    assert answer["total"] == 60 and answer["pricing"]["coupons"][0]["reason"] == "coupon_no_effect"


# ── every reason a code is refused, in both languages ──────────────────────────────────────


def reason_of(client, who, lines, code):
    pricing = check(client, who, lines, [code]).json()["pricing"]
    [result] = pricing["coupons"]
    assert result["ok"] is False and pricing["discount_total"] == 0
    return result


def test_the_reasons_a_code_is_refused_are_plain_and_in_both_languages(shop):
    client = shop
    [who, other] = people(client, 2)
    item = cake(client)
    cart = [line(item)]

    unknown = reason_of(client, who, cart, "NOPE123")
    assert unknown["reason"] == "coupon_unknown"
    assert unknown["message"] == "We do not recognise the code NOPE123."
    assert unknown["message_ar"] == "لا نعرف الرمز NOPE123."

    rule(client, code="OLD10", ends_at=past(), starts_at=past(10))
    ended = reason_of(client, who, cart, "old10")
    assert ended["reason"] == "coupon_ended" and ended["message"].startswith("This code ended on ")
    assert re.search(r"ended on \d{1,2} [A-Z][a-z]{2}", ended["message"])
    assert ended["message_ar"].startswith("انتهى هذا الرمز في ")

    rule(client, code="SOON10", starts_at=future(3))
    soon = reason_of(client, who, cart, "SOON10")
    assert soon["reason"] == "coupon_not_started" and "starts on" in soon["message"]

    paused = rule(client, code="PAUSED1")
    client.post(f"/api/discounts/{paused['id']}/pause")
    assert reason_of(client, who, cart, "PAUSED1")["reason"] == "coupon_paused"

    ended_by_owner = rule(client, code="STOPPED1")
    client.post(f"/api/discounts/{ended_by_owner['id']}/end")
    assert reason_of(client, who, cart, "STOPPED1")["reason"] == "coupon_ended"

    rule(client, code="MIN100", min_order=10_000)
    short = reason_of(client, who, [line(mk(client, name="Tea", name_ar="شاي", price=9_999))],
                      "MIN100")
    assert short["reason"] == "coupon_minimum"
    assert short["message"] == "Minimum order QAR 100 for this code."
    assert short["message_ar"] == "الحد الأدنى للطلب 100 ر.ق لهذا الرمز."

    rule(client, code="CAKEONLY", scope="selected", categories=["Drinks"])
    assert reason_of(client, who, cart, "CAKEONLY")["reason"] == "coupon_no_match"

    groups = client.get("/api/price-groups").json()["groups"]
    wholesale = client.post("/api/price-groups", json={"name": "Wholesale", "name_ar": "جملة"})
    group_id = wholesale.json()["group"]["id"]
    rule(client, code="TRADE10", group_id=group_id)
    assert reason_of(client, who, cart, "TRADE10")["reason"] == "coupon_group"
    assert groups  # (the default group exists)
    client.put(f"/api/price-groups/customers/{who['id']}", json={"group_id": group_id})
    assert check(client, who, cart, ["TRADE10"]).json()["pricing"]["coupons"][0]["ok"] is True
    assert reason_of(client, other, cart, "TRADE10")["reason"] == "coupon_group"

    full = rule(client, code="LAST1", usage_limit=1)
    assert order(client, who, cart, coupons=["LAST1"]).status_code == 200
    used_up = reason_of(client, other, cart, "LAST1")
    assert used_up["reason"] == "coupon_used_up"
    assert used_up["message"] == "This code has been used up."
    assert uses_of(full["id"]) == 1

    rule(client, code="ONCE1", per_customer_limit=1)
    assert order(client, other, cart, coupons=["ONCE1"]).status_code == 200
    again = reason_of(client, other, cart, "ONCE1")
    assert again["reason"] == "coupon_used_by_you"
    assert again["message"] == "You have already used this code."
    assert check(client, who, cart, ["ONCE1"]).json()["pricing"]["coupons"][0]["ok"] is True


def test_a_refused_code_refuses_the_order_and_changes_nothing(shop):
    client = shop
    [who] = people(client, 1)
    item = counted(client, 5, name="Last cake", name_ar="كيكة", price=10_000)
    rule(client, code="OLD10", ends_at=past(), starts_at=past(10))
    refused = order(client, who, [line(item)], coupons=["OLD10"])
    assert refused.status_code == 409
    body = detail(refused)
    assert body["code"] == "coupon_ended" and body["coupon"] == "OLD10"
    assert body["message_ar"].startswith("انتهى هذا الرمز")
    assert on_hand(client, item) == 5
    unknown = order(client, who, [line(item)], coupons=["NOPE123"])
    assert unknown.status_code == 422 and detail(unknown)["code"] == "coupon_unknown"
    assert owner_sql("select count(*) as n from orders")[0]["n"] == 0


# ── automatic discounts and several rules ──────────────────────────────────────────────────


def test_an_automatic_discount_applies_by_itself_and_the_page_can_say_so(shop):
    client = shop
    auto(client, percent=10, min_order=20_000)
    [who] = people(client, 1)
    item = cake(client)
    page = client.get(STORE).json()
    assert page["pricing"]["discounts"]["offers"] == [
        {"text": "10% off orders over QAR 200", "text_ar": "خصم 10% على الطلبات فوق 200 ر.ق"}]
    small = check(client, who, [line(item)]).json()
    assert small["total"] == 10_000 and small["pricing"]["discounts"] == []
    big = check(client, who, [line(item, 3)]).json()
    assert big["total"] == 27_000 and big["pricing"]["discounts"][0]["kind"] == "auto"
    placed = order(client, who, [line(item, 3)]).json()
    assert placed["total"] == 27_000
    [snap] = owner_sql("select kind, code, amount_off from order_discounts where order_id = $1",
                       UUID(placed["order_id"]))
    assert (snap["kind"], snap["code"], snap["amount_off"]) == ("auto", "", 3_000)


def test_only_one_of_two_codes_unless_both_are_stackable_and_the_better_wins(shop):
    client = shop
    rule(client, code="TEN10", percent=10)
    rule(client, code="TWENTY20", percent=20)
    [who] = people(client, 1)
    item = cake(client)
    pricing = check(client, who, [line(item)], ["TEN10", "TWENTY20"]).json()["pricing"]
    assert pricing["discount_total"] == 2_000
    by_code = {c["code"]: c for c in pricing["coupons"]}
    assert by_code["TWENTY20"]["ok"] is True
    assert by_code["TEN10"]["ok"] is False and by_code["TEN10"]["reason"] == "coupon_not_combined"
    assert by_code["TEN10"]["message"] == "This code cannot be used together with TWENTY20."
    refused = order(client, who, [line(item)], coupons=["TEN10", "TWENTY20"])
    assert refused.status_code == 409 and detail(refused)["code"] == "coupon_not_combined"


def test_two_stackable_codes_both_apply_one_after_the_other(shop):
    client = shop
    rule(client, code="STACK1", percent=10, stackable=True)
    rule(client, code="STACK2", percent=10, stackable=True)
    [who] = people(client, 1)
    item = cake(client)
    pricing = check(client, who, [line(item)], ["STACK1", "STACK2"]).json()["pricing"]
    assert [d["amount"] for d in pricing["discounts"]] == [1_000, 900] and pricing["goods"] == 8_100
    placed = order(client, who, [line(item)], coupons=["STACK1", "STACK2"],
                   expected_total=8_100).json()
    assert placed["total"] == 8_100
    rows = owner_sql(
        "select code, amount_off from order_discounts where order_id = $1 order by sort",
        UUID(placed["order_id"]),
    )
    assert [(r["code"], r["amount_off"]) for r in rows] == [("STACK1", 1_000), ("STACK2", 900)]


def test_more_than_three_codes_on_one_order_is_refused(shop):
    client = shop
    [who] = people(client, 1)
    item = cake(client)
    answer = check(client, who, [line(item)], ["AAA111", "BBB222", "CCC333", "DDD444"])
    assert answer.status_code == 422 and detail(answer)["code"] == "coupon_too_many"


def test_a_code_for_chosen_items_and_a_category_takes_off_only_those(shop):
    client = shop
    item = cake(client)
    tea = mk(client, name="Tea", name_ar="شاي", category="Drinks", price=2_500)
    rule(client, code="CAKES20", percent=20, scope="selected", categories=["cakes"])
    rule(client, code="TEA50", percent=50, scope="selected", item_ids=[tea["id"]])
    [who] = people(client, 1)
    cart = [line(item), line(tea, 2)]
    cakes = check(client, who, cart, ["CAKES20"]).json()
    assert cakes["pricing"]["discount_total"] == 2_000
    assert [x["discount"] for x in cakes["lines"]] == [2_000, 0]
    one = check(client, who, cart, ["TEA50"]).json()
    assert one["pricing"]["discount_total"] == 2_500 and one["total"] == 12_500


def test_buy_three_get_one_free(shop):
    client = shop
    item = cake(client, price=1_250)
    auto(client, value_type="free_units", percent=None, buy_qty=3, get_qty=1, scope="selected",
         item_ids=[item["id"]])
    [who] = people(client, 1)
    assert check(client, who, [line(item, 3)]).json()["total"] == 3_750
    four = check(client, who, [line(item, 4)]).json()
    assert four["total"] == 3_750 and four["pricing"]["discounts"][0]["text"] == (
        "Buy 3 get 1 free on selected items")
    placed = order(client, who, [line(item, 8)]).json()
    assert placed["total"] == 7_500  # two free of eight
    [snap] = owner_sql("select amount_off, buy_qty, get_qty from order_discounts "
                       "where order_id = $1", UUID(placed["order_id"]))
    assert (snap["amount_off"], snap["buy_qty"], snap["get_qty"]) == (2_500, 3, 1)


def test_a_group_price_replaces_a_sale_price_and_the_discount_comes_after_either(shop):
    client = shop
    item = cake(client, price=10_000, sale_price=8_000)
    rule(client, code="TEN10", percent=10)
    [who] = people(client, 1)
    # sale price first, then the order discount on what that came to
    assert check(client, who, [line(item)], ["TEN10"]).json()["total"] == 7_200
    group = client.post("/api/price-groups", json={"name": "Trade", "name_ar": "تجار"}).json()
    gid = group["group"]["id"]
    client.put(f"/api/items/{item['id']}/group-prices", json={"prices": [
        {"group_id": gid, "variant_id": None, "price": 9_000}]})
    client.put(f"/api/price-groups/customers/{who['id']}", json={"group_id": gid})
    # the group's price replaces the sale price (spec 003); the code is taken off that
    assert check(client, who, [line(item)], ["TEN10"]).json()["total"] == 8_100


# ── usage, under a real race, and giving a use back ───────────────────────────────────────


def test_a_limited_code_cannot_be_over_used_by_two_orders_at_once(shop, monkeypatch):
    client = shop
    made = rule(client, code="LAST1", usage_limit=1)
    item = counted(client, 5, name="Cake x", name_ar="كيك", price=10_000)
    first, second = people(client, 2)
    warm(client)
    hold_open(monkeypatch, discounts, "claim", 0.4)
    start = threading.Barrier(2)

    def buy(who):
        start.wait()
        return order(client, who, [line(item)], coupons=["LAST1"])

    # (orders of one shop are numbered one at a time, behind an advisory lock: the two meet
    # there. The conditional update below is proved on its own in the next test.)
    with LockWatch("") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(buy, (first, second)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert watch.blocked >= 1, f"the two orders never met in the database: {watch}"
    loser = detail(next(r for r in results if r.status_code == 409))
    assert loser["code"] == "coupon_used_up"
    assert uses_of(made["id"]) == 1
    # the loser's order was rolled back with its stock
    assert on_hand(client, item) == 4
    assert owner_sql("select count(*) as n from order_discounts")[0]["n"] == 1


def test_the_conditional_update_alone_gives_the_last_use_to_one_of_two_transactions(shop):
    """Not through the order path (whose number lock would queue the two): two transactions claim
    the last use of a code at the same moment, and the second waits on the rule's row."""
    import asyncio

    from alyr.modules.orders import totals
    from alyr.seed import DEMO_TENANT_ID
    from test_items import on_shop

    client = shop
    made = rule(client, code="LAST1", usage_limit=1, per_customer_limit=1)
    item = cake(client)
    first, second = people(client, 2)
    placed = [order(client, who, [line(item)]).json()["order_id"] for who in (first, second)]
    row = on_shop(client, lambda conn: conn.fetchrow(
        "select * from discount_rules where id = $1", UUID(made["id"])))
    applied = [totals.Applied(discounts.to_rule(row), 1_000, {0: 1_000})]
    db = client.app.state.db

    async def attempt(order_id, who):
        async with db.tenant(DEMO_TENANT_ID) as conn:
            try:
                await discounts.claim(conn, UUID(order_id), UUID(who["id"]), applied,
                                      datetime.now(UTC))
            except discounts.DiscountError as error:
                return error.code
            await asyncio.sleep(0.5)  # holds the row until its transaction ends
            return "used"

    async def both():
        return await asyncio.gather(attempt(placed[0], first), attempt(placed[1], second))

    with LockWatch("discount_rules") as watch:
        results = client.portal.call(both)
    assert sorted(results) == ["coupon_used_up", "used"]
    assert watch.blocked >= 1, f"the two never met at the rule's row: {watch}"
    assert uses_of(made["id"]) == 1
    assert owner_sql("select count(*) as n from order_discounts")[0]["n"] == 1


def test_eight_orders_at_once_for_a_code_with_three_uses_give_exactly_three(shop, monkeypatch):
    client = shop
    made = rule(client, code="THREE3", usage_limit=3)
    item = cake(client)
    buyers = people(client, 8)
    warm(client)
    hold_open(monkeypatch, discounts, "claim", 0.15)
    start = threading.Barrier(len(buyers))

    def buy(who):
        start.wait()
        return order(client, who, [line(item)], coupons=["THREE3"])

    with ThreadPoolExecutor(len(buyers)) as pool:
        results = list(pool.map(buy, buyers))
    assert sorted(r.status_code for r in results).count(200) == 3
    assert {detail(r)["code"] for r in results if r.status_code != 200} == {"coupon_used_up"}
    assert uses_of(made["id"]) == 3
    assert owner_sql("select count(*) as n from order_discounts")[0]["n"] == 3


def test_one_customers_two_simultaneous_orders_cannot_both_use_a_once_only_code(shop, monkeypatch):
    client = shop
    made = rule(client, code="ONCE1", per_customer_limit=1)
    item = cake(client)
    [who] = people(client, 1)
    warm(client)
    hold_open(monkeypatch, discounts, "claim", 0.3)
    start = threading.Barrier(2)

    def buy(_):
        start.wait()
        return order(client, who, [line(item)], coupons=["ONCE1"])

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(buy, (1, 2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert detail(next(r for r in results if r.status_code == 409))["code"] == "coupon_used_by_you"
    assert uses_of(made["id"]) == 1


def test_the_database_itself_refuses_a_use_beyond_the_limit(shop):
    made = rule(shop, code="LAST1", usage_limit=1)

    async def over():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            await conn.execute("update discount_rules set uses = 2 where id = $1", UUID(made["id"]))
        finally:
            await conn.close()

    import asyncio

    with pytest.raises(asyncpg.CheckViolationError):
        asyncio.run(over())


def test_cancelling_an_order_gives_the_use_back_once(shop):
    client = shop
    made = rule(client, code="LAST1", usage_limit=1)
    item = cake(client)
    first, second = people(client, 2)
    placed = order(client, first, [line(item)], coupons=["LAST1"]).json()
    assert order(client, second, [line(item)], coupons=["LAST1"]).status_code == 409
    assert uses_of(made["id"]) == 1
    listed = client.get("/api/discounts").json()
    entry = next(r for r in listed["rules"] if r["id"] == made["id"])
    assert (entry["uses"], entry["given"], entry["state"]) == (1, 1_000, "used_up")
    assert listed["given_total"] == 1_000

    cancel(client, placed["order_id"])
    assert uses_of(made["id"]) == 0
    # cancelled twice: nothing more is given back
    again = client.post(f"/api/orders/{placed['order_id']}/status", json={"status": "cancelled"})
    assert again.status_code == 200 and uses_of(made["id"]) == 0
    entry = next(r for r in client.get("/api/discounts").json()["rules"] if r["id"] == made["id"])
    assert (entry["uses"], entry["given"], entry["state"]) == (0, 0, "active")
    # the next customer can have it, and the cancelled order keeps its snapshot, marked returned
    assert order(client, second, [line(item)], coupons=["LAST1"]).status_code == 200
    [old] = owner_sql("select returned_at from order_discounts where order_id = $1",
                      UUID(placed["order_id"]))
    assert old["returned_at"] is not None
    log = owner_sql("select detail from activity where subject = 'order' and subject_id = $1 "
                    "and action = 'cancelled'", UUID(placed["order_id"]))
    assert json.loads(log[0]["detail"])["coupon_uses_returned"] == 1


def test_a_customers_own_limit_comes_back_when_their_order_is_cancelled(shop):
    client = shop
    rule(client, code="ONCE1", per_customer_limit=1)
    item = cake(client)
    [who] = people(client, 1)
    placed = order(client, who, [line(item)], coupons=["ONCE1"]).json()
    assert order(client, who, [line(item)], coupons=["ONCE1"]).status_code == 409
    cancel(client, placed["order_id"])
    assert order(client, who, [line(item)], coupons=["ONCE1"]).status_code == 200


def test_an_order_cancelled_by_the_hold_running_out_gives_its_use_back_too(shop):
    client = shop
    made = rule(client, code="LAST1", usage_limit=1)
    item = counted(client, 3, name="Held cake", name_ar="كيكة", price=10_000)
    [who] = people(client, 1)
    placed = order(client, who, [line(item)], coupons=["LAST1"]).json()
    assert uses_of(made["id"]) == 1
    owner_sql("update stock_holds set expires_at = now() - interval '1 hour' "
              "where order_id = $1", UUID(placed["order_id"]))
    from test_catalog_concurrency import sweep

    assert sweep(client) >= 1
    assert uses_of(made["id"]) == 0


def test_an_order_on_account_is_charged_and_ledgered_at_the_discounted_total(shop):
    client = shop
    rule(client, code="TEN10")
    item = cake(client)
    who = customer(client)
    placed = order(client, who, [line(item, 2)], payment="account", coupons=["TEN10"])
    assert placed.status_code == 200, placed.text
    assert placed.json()["total"] == 18_000
    [entry] = owner_sql("select amount from ledger_entries where order_id = $1 and kind = 'sale'",
                        UUID(placed.json()["order_id"]))
    assert entry["amount"] == 18_000


# ── the owner's rules ────────────────────────────────────────────────────────────────────


def test_the_owners_list_shows_state_usage_and_what_was_given_away(shop):
    client = shop
    live = rule(client, code="LIVE10")
    scheduled = rule(client, code="LATER10", starts_at=future(2))
    paused = rule(client, code="PAUSED1")
    client.post(f"/api/discounts/{paused['id']}/pause")
    ended = rule(client, code="DONE10", starts_at=past(10), ends_at=past(1))
    by_id = {r["id"]: r for r in client.get("/api/discounts").json()["rules"]}
    assert by_id[live["id"]]["state"] == "active"
    assert by_id[scheduled["id"]]["state"] == "scheduled"
    assert by_id[paused["id"]]["state"] == "paused"
    assert by_id[ended["id"]]["state"] == "ended"
    item = cake(client)
    [who] = people(client, 1)
    order(client, who, [line(item, 2)], coupons=["LIVE10"])
    listed = client.get("/api/discounts").json()
    entry = next(r for r in listed["rules"] if r["id"] == live["id"])
    assert (entry["uses"], entry["given"], entry["given_text"]) == (1, 2_000, "QAR 20")
    assert listed["given_total"] == 2_000


def test_a_rule_is_checked_in_both_languages_when_it_is_made(shop):
    client = shop
    good = {"kind": "coupon", "code": "GOOD10", "value_type": "percent", "percent": 10}

    def make(**more):
        return client.post("/api/discounts", json={**good, **more})

    for bad, code in (
        ({"code": "ab"}, "bad_code"), ({"code": "has space!"}, "bad_code"),
        ({"percent": 0}, "bad_percent"), ({"percent": 101}, "bad_percent"),
        ({"percent": "10.1234"}, None),
        ({"scope": "selected"}, "scope_empty"),
        ({"scope": "selected", "item_ids": ["00000000-0000-0000-0000-000000000001"]},
         "unknown_item"),
        ({"usage_limit": 0}, "bad_usage_limit"),
        ({"starts_at": future(5), "ends_at": future(2)}, "bad_dates"),
        ({"value_type": "amount", "percent": None}, "bad_amount"),
        ({"value_type": "free_units", "percent": None}, "bad_buy"),
        ({"kind": "other"}, "bad_kind"),
    ):
        response = make(**bad)
        assert response.status_code == 422, (bad, response.text)
        if code:
            body = response.json()["detail"]
            assert body["code"] == code and body["message"] and body["message_ar"], bad
    assert make().status_code == 200
    taken = make(code="good-10")  # the same code spelled another way
    assert taken.status_code == 422 and taken.json()["detail"]["code"] == "code_taken"
    assert make(code="جديد10").status_code == 200  # an Arabic code is fine


def test_a_used_code_keeps_its_name_and_its_limit_cannot_fall_below_its_uses(shop):
    client = shop
    made = rule(client, code="USED10", usage_limit=5)
    item = cake(client)
    people_ = people(client, 2)
    for who in people_:
        assert order(client, who, [line(item)], coupons=["USED10"]).status_code == 200
    base = {"kind": "coupon", "value_type": "percent", "percent": 10}
    renamed = client.put(f"/api/discounts/{made['id']}",
                         json={**base, "code": "NEWNAME", "usage_limit": 5})
    assert renamed.status_code == 422 and renamed.json()["detail"]["code"] == "code_locked"
    lower = client.put(f"/api/discounts/{made['id']}",
                       json={**base, "code": "USED10", "usage_limit": 1})
    assert lower.status_code == 422 and lower.json()["detail"]["code"] == "limit_below_uses"
    fine = client.put(f"/api/discounts/{made['id']}",
                      json={**base, "code": "USED10", "usage_limit": 2})
    assert fine.status_code == 200 and fine.json()["rule"]["state"] == "used_up"


def test_pause_resume_and_end(shop):
    client = shop
    made = rule(client, code="PAUSE10")
    [who] = people(client, 1)
    item = cake(client)
    path = f"/api/discounts/{made['id']}"
    assert client.post(f"{path}/pause").json()["rule"]["state"] == "paused"
    assert check(client, who, [line(item)], ["PAUSE10"]).json()["pricing"]["coupons"][0]["reason"] \
        == "coupon_paused"
    assert client.post(f"{path}/resume").json()["rule"]["state"] == "active"
    assert check(client, who, [line(item)], ["PAUSE10"]).json()["total"] == 9_000
    ended = client.post(f"{path}/end").json()["rule"]
    assert ended["state"] == "ended" and ended["ends_at"]
    assert check(client, who, [line(item)], ["PAUSE10"]).json()["pricing"]["coupons"][0]["reason"] \
        == "coupon_ended"
    again = client.post(f"{path}/resume")
    assert again.status_code == 422 and again.json()["detail"]["code"] == "ended"
    assert client.put(path, json={"kind": "coupon", "code": "PAUSE10", "value_type": "percent",
                                  "percent": 5}).status_code == 422
    assert client.post(f"{path}/dance").status_code == 422
    assert client.post("/api/discounts/00000000-0000-0000-0000-000000000009/pause").status_code \
        == 404


def test_ending_a_rule_that_has_not_started_ends_it_cleanly(shop):
    made = rule(shop, code="LATER10", starts_at=future(3), ends_at=future(9))
    ended = shop.post(f"/api/discounts/{made['id']}/end")
    assert ended.status_code == 200 and ended.json()["rule"]["state"] == "ended"


def test_only_owners_and_admins_see_and_change_the_rules(shop):
    client = shop
    made = rule(client, code="PRIVATE1")
    sign_in(client, AGENT_EMAIL)
    assert client.get("/api/discounts").status_code == 403
    assert client.post("/api/discounts", json={"kind": "coupon", "code": "AGENT10",
                                               "value_type": "percent", "percent": 5}
                       ).status_code == 403
    assert client.post(f"/api/discounts/{made['id']}/end").status_code == 403


def test_every_change_to_a_rule_is_on_the_activity_record(shop):
    client = shop
    made = rule(client, code="AUDIT10")
    client.put(f"/api/discounts/{made['id']}", json={
        "kind": "coupon", "code": "AUDIT10", "value_type": "percent", "percent": 15})
    client.post(f"/api/discounts/{made['id']}/pause")
    client.post(f"/api/discounts/{made['id']}/resume")
    client.post(f"/api/discounts/{made['id']}/end")
    actions = [r["action"] for r in client.get("/api/items/settings/activity").json()["activity"]
               if r["subject_id"] == made["id"]]
    assert actions[::-1] == ["discount_added", "discount_changed", "discount_paused",
                             "discount_resumed", "discount_ended"]


def test_an_order_page_for_a_shop_without_the_orders_module_has_no_discounts_route(client):
    # (the routes answer where the Catalog or the orders module is on, like the Catalog's own)
    assert client.get("/api/discounts").status_code in (200, 422)


# ── the weekly report ─────────────────────────────────────────────────────────────────────


def test_the_weekly_report_has_one_line_for_what_was_given_away_and_only_while_it_is_on(shop):
    from datetime import date

    from alyr.modules import report
    from test_catalog_reports import catalog_lines, retime_order
    from test_reports import at

    client = shop
    week: date = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    rule(client, code="EID25", percent=25)
    rule(client, code="SAVE10")
    item = cake(client)
    first, second, third = people(client, 3)
    placed = [
        order(client, first, [line(item)], coupons=["EID25"]).json(),
        order(client, second, [line(item)], coupons=["EID25"]).json(),
        order(client, third, [line(item)], coupons=["SAVE10"]).json(),
    ]
    for n, one in enumerate(placed):
        retime_order(one["order_id"], at(week, 1, 10 + n))
    cancel(client, placed[2]["order_id"])  # gave nothing: its use went back
    english = [x for x in catalog_lines(client, week) if x.startswith("Discounts")]
    assert english == ["Discounts given this week: QAR 50 on 2 orders (EID25 2)"]
    arabic = [x for x in catalog_lines(client, week, "ar") if x.startswith("خصومات")]
    assert arabic == ["خصومات منحتها هذا الأسبوع: 50 ر.ق على طلبان (EID25 2)"]
    switch(client, False)
    assert not [x for x in catalog_lines(client, week) if x.startswith("Discounts")]


def test_a_shop_that_never_used_discounts_has_no_discount_line_in_its_report(client):
    from alyr.modules import report
    from test_catalog_reports import catalog_lines

    week = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    assert not [x for x in catalog_lines(client, week) if "iscount" in x]


# ── the chat, in English and Arabic ───────────────────────────────────────────────────────


def draft_with(client, phone, item, quantity):
    """Put `quantity` of an item in the customer's draft the way a customer does: send its code
    with a quantity, tap Confirm. Returns the draft message."""
    asked = talk(client, phone, f"{item['code']} x {quantity}")[-1]
    return tap(client, phone, asked, 0)[-1]


def test_what_a_message_about_a_code_means():
    cases = {
        "coupon RAMADAN10": ["RAMADAN10"],
        "Coupon: ramadan10": ["ramadan10"],
        "use promo code SAVE20 please": ["SAVE20"],
        "I have a voucher WELCOME5": ["WELCOME5"],
        "discount code EID25": ["EID25"],
        "كوبون رمضان10": ["رمضان10"],
        "عندي كود خصم EID25": ["EID25"],
        "رمز الخصم SAVE20": ["SAVE20"],
        "قسيمة WELCOME5 لو سمحت": ["WELCOME5"],
        "coupon": [],
        "I have a coupon": [],
    }
    for text, candidates in cases.items():
        ask = wa_coupon.parse(text)
        assert ask is not None and ask.candidates == candidates, text
    for text in ("hello", "2 dates cake", "code 214", "discount please", "can I get a discount",
                 "I would like to order for my birthday and also my sister's with a coupon "
                 "if you have any left over please"):
        assert wa_coupon.parse(text) is None, text


def test_a_customer_types_a_coupon_into_the_draft_and_sees_the_discount_before_paying(shop):
    client = shop
    rule(client, code="RAMADAN10")
    item = cake(client, price=5_000)
    draft_with(client, STRANGER, item, 4)
    reply = talk(client, STRANGER, "coupon RAMADAN10")[-1]
    assert "Items: QAR 200" in reply["body"]
    assert "Discount (RAMADAN10): -QAR 20" in reply["body"]
    assert "Total: QAR 180" in reply["body"]
    assert ids(reply) == ["cart_place", "cart_clear"]
    # placing it charges exactly what the draft showed
    placed = talk(client, STRANGER, reply_id="cart_place")
    [row] = orders_of(STRANGER)
    assert row["total"] == 18_000
    [snap] = owner_sql("select d.code, d.amount_off, o.subtotal from order_discounts d "
                       "join orders o on o.id = d.order_id where o.id = $1", row["id"])
    assert (snap["code"], snap["amount_off"], snap["subtotal"]) == ("RAMADAN10", 2_000, 20_000)
    body = placed[-1]["body"]
    assert "Discount (RAMADAN10): -QAR 20" in body and "QAR 180" in body


def test_the_code_can_come_before_the_items_and_is_kept_for_the_order(shop):
    client = shop
    rule(client, code="EARLY10")
    item = cake(client, price=5_000)
    first = talk(client, STRANGER, "promo code early10")[-1]
    assert "EARLY10" in first["body"] and "10% off your order" in first["body"]
    assert "Add items" in first["body"]
    draft = draft_with(client, STRANGER, item, 2)
    assert "Discount (EARLY10): -QAR 10" in draft["body"] and "Total: QAR 90" in draft["body"]


def test_the_same_in_arabic(shop):
    client = shop
    rule(client, code="رمضان10", name="خصم رمضان")
    item = cake(client, price=5_000)
    asked = talk(client, STRANGER, f"رقم {item['code']} x 4")[-1]
    tap(client, STRANGER, asked, 0)
    reply = talk(client, STRANGER, "كوبون رمضان10")[-1]
    assert "خصم (رمضان10): -20 ر.ق" in reply["body"]
    assert "الأصناف: 200 ر.ق" in reply["body"] and "الإجمالي: 180 ر.ق" in reply["body"]
    assert "QAR" not in reply["body"]
    talk(client, STRANGER, reply_id="cart_place")
    assert orders_of(STRANGER)[0]["total"] == 18_000


def test_a_code_the_shop_does_not_have_is_said_so_in_the_customers_language(shop):
    client = shop
    english = talk(client, STRANGER, "coupon NOPE123")[-1]["body"]
    assert english == "We do not recognise the code NOPE123."
    assert "coupon RAMADAN10" in talk(client, STRANGER, "I have a coupon")[-1]["body"]
    arabic = talk(client, STRANGER, "كوبون NOPE123")[-1]["body"]
    assert arabic == "لا نعرف الرمز NOPE123."
    assert "كوبون RAMADAN10" in talk(client, STRANGER, "عندي كوبون")[-1]["body"]


def test_a_code_that_ends_while_the_customer_decides_is_dropped_and_said(shop):
    client = shop
    made = rule(client, code="SOON10")
    item = cake(client, price=5_000)
    draft_with(client, STRANGER, item, 2)
    assert "Discount" in talk(client, STRANGER, "coupon SOON10")[-1]["body"]
    client.post(f"/api/discounts/{made['id']}/end")
    reply = talk(client, STRANGER, reply_id="cart_place")
    body = "\n".join(m["body"] for m in reply)
    assert "SOON10" in body and "This code ended on" in body and "Total: QAR 100" in body
    assert orders_of(STRANGER) == []
    talk(client, STRANGER, reply_id="cart_place")  # the code is forgotten: now it is placed
    assert [o["total"] for o in orders_of(STRANGER)] == [10_000]


def test_a_code_that_needs_more_in_the_order_stays_in_the_draft(shop):
    client = shop
    rule(client, code="BIG100", min_order=20_000)
    item = cake(client, price=10_000)
    draft_with(client, STRANGER, item, 1)
    reply = talk(client, STRANGER, "coupon BIG100")[-1]
    assert "Minimum order QAR 200 for this code." in reply["body"]
    assert "Discount" not in reply["body"]
    asked = talk(client, STRANGER, f"{item['code']} x 2")[-1]
    again = tap(client, STRANGER, asked, 0)[-1]
    assert "Discount (BIG100): -QAR 30" in again["body"] and "Total: QAR 270" in again["body"]


def test_if_the_last_use_goes_to_someone_else_while_the_customer_decides_they_are_told(shop):
    client = shop
    made = rule(client, code="LAST1", usage_limit=1)
    item = cake(client, price=5_000)
    draft_with(client, STRANGER, item, 2)
    talk(client, STRANGER, "coupon LAST1")
    [rival] = people(client, 1)
    assert order(client, rival, [line(item)], coupons=["LAST1"]).status_code == 200
    reply = talk(client, STRANGER, reply_id="cart_place")
    assert any("used up" in m["body"] for m in reply)
    assert orders_of(STRANGER) == []
    assert uses_of(made["id"]) == 1


def test_with_the_feature_off_the_chat_does_not_treat_a_code_word_specially(client):
    reply = talk(client, STRANGER, "coupon RAMADAN10")
    assert not any("recognise the code" in m["body"] or "Discount" in m["body"] for m in reply)


# ── a template made in the back office can include it ───────────────────────────────────────


def test_a_template_made_in_the_back_office_can_switch_discounts_on_for_every_shop_made_from_it(
    office, owner
):
    from test_templates import made, new_with

    registry = office.get("/api/admin/templates").json()["registry"]
    assert "discounts" in str(registry)
    mine = made(office, name="Cake shop", features={"discounts": {"enabled": True}})
    assert mine["features"]["discounts"]["enabled"] is True
    plain = made(office, name="Plain shop")
    assert plain["features"]["discounts"]["enabled"] is False
    shop = new_with(office, mine["key"])
    sign_in(owner, shop["email"])
    groups = owner.get("/api/features").json()["groups"]
    feature = next(f for g in groups for f in g["features"] if f["key"] == "discounts")
    assert feature["enabled"] is True
    assert owner.get("/api/discounts").status_code == 200
    # a shop made from the other template has it off
    other = new_with(office, plain["key"])
    sign_in(owner, other["email"])
    assert owner.get("/api/discounts").status_code == 422
