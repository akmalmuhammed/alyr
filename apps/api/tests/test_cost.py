"""Cost price and margin (ALY-150 part 3, `specs/014-pricing-pack/spec.md`): the feature off and on,
a cost for an item and for each size with its history, the margin it leaves, a warning (never a
block) when a price is under the cost, what an order keeps of the cost at the time, the margin of
an order, the value of the stock, the weekly report's lines, and the template of the back office.

Who sees a cost is tried in test_cost_leaks.py.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from alyr.seed import AGENT_EMAIL
from catalog_wa import catalog_module_on  # noqa: F401  (the autouse fixture is used by name)
from test_consent import owner_sql
from test_discounts import cancel, rule
from test_discounts import shop as discounts_on  # noqa: F401  (fixture by name)
from test_items import counted, line, mk, order, people
from test_sign_in import sign_in
from test_templates import no_templates_left_over, office, owner  # noqa: F401  (fixtures by name)


def costs_on(client, on=True):
    response = client.put("/api/features/cost_margin", json={"enabled": on})
    assert response.status_code == 200, response.text


def cost_of(client, item, **body):
    response = client.put(f"/api/items/{item['id']}/cost", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def cake(client, price=10_000, **more):
    return mk(client, name="Dates cake", name_ar="كيكة تمر", category="Cakes", price=price, **more)


def sized(client):
    return mk(client, name="Layer cake", name_ar="كيكة طبقات", category="Cakes", price=10_000,
              variants=[{"name": "Small", "name_ar": "صغير", "price_delta": 0},
                        {"name": "Large", "name_ar": "كبير", "price_delta": 4_000}])


# ── off: invisible and inert ────────────────────────────────────────────────────────────


def test_it_is_off_by_default_and_every_route_says_so(client):
    item = cake(client)
    for call in (
        lambda: client.get(f"/api/items/{item['id']}/cost"),
        lambda: client.put(f"/api/items/{item['id']}/cost", json={"cost": 500}),
        lambda: client.get("/api/items/margins"),
        lambda: client.get("/api/items/valuation"),
        lambda: client.get("/api/orders/margins"),
    ):
        response = call()
        assert response.status_code == 422 and response.json()["detail"]["code"] == "feature_off"
        assert response.json()["detail"]["message_ar"]
    saved = client.put(f"/api/items/{item['id']}", json={"price": 1})
    assert saved.status_code == 200 and "cost_warnings" not in saved.json()


def test_the_features_screen_names_it_in_plain_words_and_says_who_sees_it(client):
    groups = client.get("/api/features").json()["groups"]
    feature = next(f for g in groups for f in g["features"] if f["key"] == "cost_margin")
    assert feature["name"] == "Cost price and margin" and feature["enabled"] is False
    assert "never do" in feature["hint"] and feature["name_ar"] and feature["hint_ar"]
    assert "capabilit" not in str(feature).lower()


def test_with_it_off_an_order_keeps_no_cost_and_nothing_reads_as_before(client):
    costs_on(client)
    item = cake(client)
    cost_of(client, item, cost=4_000)
    costs_on(client, False)
    [who] = people(client, 1)
    placed = order(client, who, [line(item)]).json()
    assert owner_sql("select count(*) as n from order_item_costs")[0]["n"] == 0
    assert set(placed) >= {"order_id", "total"} and "margin" not in str(placed)


# ── a cost and its margin ──────────────────────────────────────────────────────────────────


def test_an_item_has_a_cost_and_the_margin_it_leaves(client):
    costs_on(client)
    item = cake(client, price=10_000)
    assert client.get(f"/api/items/{item['id']}/cost").json()["cost"] is None
    saved = cost_of(client, item, cost=6_250)
    assert saved["cost"] == 6_250 and saved["warnings"] == []
    assert saved["margin"] == {"price": 10_000, "cost": 6_250, "amount": 3_750, "pct": "37.5"}
    assert saved["history"][0]["cost"] == 6_250 and saved["history"][0]["by"]
    # halves go up: 1 in 3 is 33.3, 2 in 3 is 66.7
    other = cake(client, price=300)
    assert cost_of(client, other, cost=200)["margin"]["pct"] == "33.3"
    assert cost_of(client, other, cost=100)["margin"]["pct"] == "66.7"
    assert cost_of(client, other, cost=0)["margin"] == {
        "price": 300, "cost": 0, "amount": 300, "pct": "100.0"}


def test_a_sale_price_is_the_price_the_margin_is_worked_on(client):
    costs_on(client)
    item = cake(client, price=10_000, sale_price=8_000)
    saved = cost_of(client, item, cost=6_000)
    assert saved["price"] == 8_000 and saved["margin"]["amount"] == 2_000
    assert saved["margin"]["pct"] == "25.0"


def test_each_size_can_have_its_own_cost_and_a_size_without_one_costs_what_the_item_costs(client):
    costs_on(client)
    item = sized(client)
    small, large = (v["id"] for v in item["variants"] if v["name"])
    saved = cost_of(client, item, cost=3_000, variants={large: 5_500})
    by_name = {v["name"]: v for v in saved["variants"]}
    assert by_name["Small"]["cost"] is None and by_name["Small"]["effective"] == 3_000
    assert by_name["Large"]["cost"] == 5_500 and by_name["Large"]["effective"] == 5_500
    assert by_name["Large"]["price"] == 14_000
    assert by_name["Large"]["margin"]["amount"] == 8_500
    assert by_name["Small"]["margin"]["amount"] == 7_000
    # a size's cost is taken away: it costs what the item costs again
    again = cost_of(client, item, variants={large: None})
    assert {v["name"]: v["effective"] for v in again["variants"]} == {
        "Small": 3_000, "Large": 3_000}
    assert small  # (named sizes only)


def test_only_what_changed_is_written_and_the_history_says_who_and_when(client):
    costs_on(client)
    item = cake(client)
    cost_of(client, item, cost=4_000)
    cost_of(client, item, cost=4_000)  # saved again as it was
    cost_of(client, item, cost=4_500, reason="Flour went up")
    cost_of(client, item, cost=None)
    history = client.get(f"/api/items/{item['id']}/cost").json()["history"]
    assert [h["cost"] for h in history] == [None, 4_500, 4_000]
    assert history[1]["reason"] == "Flour went up"
    assert owner_sql("select count(*) as n from item_costs")[0]["n"] == 0


def test_a_cost_is_checked(client):
    costs_on(client)
    item = cake(client)
    for bad in ({"cost": -1}, {"cost": 10**12}, {"cost": 1.5}, {"unknown": 1}):
        assert client.put(f"/api/items/{item['id']}/cost", json=bad).status_code == 422, bad
    other = sized(client)
    stranger = [v["id"] for v in other["variants"] if v["name"]][0]
    refused = client.put(f"/api/items/{item['id']}/cost", json={"variants": {stranger: 100}})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "unknown_size"
    assert client.put("/api/items/00000000-0000-0000-0000-000000000009/cost",
                      json={"cost": 1}).status_code == 404


def test_deleting_an_item_takes_its_cost_and_history_with_it(client):
    costs_on(client)
    item = cake(client)
    cost_of(client, item, cost=1_000)
    assert client.delete(f"/api/items/{item['id']}").status_code == 200
    assert owner_sql("select count(*) as n from item_costs")[0]["n"] == 0
    assert owner_sql("select count(*) as n from item_cost_history")[0]["n"] == 0


# ── a warning, never a block ──────────────────────────────────────────────────────────────


def test_a_price_under_the_cost_is_a_warning_in_both_languages_and_saves_anyway(client):
    costs_on(client)
    item = cake(client, price=10_000)
    cost_of(client, item, cost=6_000)
    saved = client.put(f"/api/items/{item['id']}", json={"price": 5_000})
    assert saved.status_code == 200
    [warning] = saved.json()["cost_warnings"]
    assert warning["code"] == "below_cost" and (warning["price"], warning["cost"]) == (5_000, 6_000)
    assert warning["message"] == "The price QAR 50 is below what it costs you (QAR 60). " \
                                 "You can still save it."
    assert warning["message_ar"].startswith("السعر 50 ر.ق أقل من تكلفته عليك")
    assert client.get(f"/api/items/{item['id']}").json()["price"] == 5_000  # it was saved
    sale = client.put(f"/api/items/{item['id']}", json={"price": 10_000, "sale_price": 5_500})
    assert sale.json()["cost_warnings"][0]["code"] == "sale_below_cost"
    fine = client.put(f"/api/items/{item['id']}", json={"price": 10_000, "sale_price": 7_000})
    assert "cost_warnings" not in fine.json()


def test_the_cost_screen_warns_too_and_a_new_item_with_a_cost_already_kept_cannot_exist(client):
    costs_on(client)
    item = sized(client)
    large = next(v["id"] for v in item["variants"] if v["name"] == "Large")
    saved = cost_of(client, item, cost=3_000, variants={large: 15_000})  # large sells at 14,000
    [warning] = saved["warnings"]
    assert warning["variant_id"] == large and "(Large)" in warning["message"]
    assert "(كبير)" in warning["message_ar"]


# ── on an order ─────────────────────────────────────────────────────────────────────────────


def test_an_order_keeps_what_each_unit_cost_when_it_was_placed(client):
    costs_on(client)
    item = cake(client, price=10_000)
    cost_of(client, item, cost=4_000)
    [who] = people(client, 1)
    placed = order(client, who, [line(item, 3)]).json()
    oid = UUID(placed["order_id"])
    [kept] = owner_sql("select unit_cost from order_item_costs where order_item_id in "
                       "(select id from order_items where order_id = $1)", oid)
    assert kept["unit_cost"] == 4_000
    cost_of(client, item, cost=9_000)
    client.put(f"/api/items/{item['id']}", json={"price": 99_000})
    margin = client.get("/api/orders/margins").json()["margins"][placed["order_id"]]
    assert margin == {"revenue": 30_000, "cost": 12_000, "amount": 18_000, "pct": "60.0",
                      "complete": True}


def test_an_orders_margin_is_after_discounts_and_leaves_out_delivery(discounts_on):  # noqa: F811
    client = discounts_on
    costs_on(client)
    client.put("/api/features/delivery_fees", json={"enabled": True})
    client.put("/api/delivery", json={"delivery": True, "flat_fee": 2_000})
    rule(client, code="TEN10")
    item = cake(client, price=10_000)
    cost_of(client, item, cost=4_000)
    [who] = people(client, 1)
    placed = client.post("/api/store/al-noor/orders", json={
        "token": __import__("order_links").token(who["id"]), "items": [line(item, 2)],
        "payment": "link", "coupons": ["TEN10"],
        "fulfilment": {"mode": "delivery", "address": "Villa 1"},
    })
    assert placed.status_code == 200, placed.text
    margin = client.get("/api/orders/margins").json()["margins"][placed.json()["order_id"]]
    # 20,000 of goods less 2,000 discount, against 8,000 of cost; the 2,000 fee is not margin
    assert (margin["revenue"], margin["cost"], margin["amount"]) == (18_000, 8_000, 10_000)
    assert margin["pct"] == "55.6"


def test_an_order_with_some_lines_costless_says_it_is_incomplete(client):
    costs_on(client)
    kept, bare = cake(client, price=10_000), mk(client, name="Tea", name_ar="شاي", price=2_000)
    cost_of(client, kept, cost=4_000)
    [who] = people(client, 1)
    placed = order(client, who, [line(kept), line(bare)]).json()
    margin = client.get("/api/orders/margins").json()["margins"][placed["order_id"]]
    assert margin["complete"] is False and margin["revenue"] == 10_000
    nothing = order(client, who, [line(bare)]).json()
    assert nothing["order_id"] not in client.get("/api/orders/margins").json()["margins"]


def test_a_cost_added_after_an_order_does_not_change_that_order(client):
    costs_on(client)
    item = cake(client)
    [who] = people(client, 1)
    placed = order(client, who, [line(item)]).json()
    cost_of(client, item, cost=1_000)
    assert placed["order_id"] not in client.get("/api/orders/margins").json()["margins"]


# ── the list and the stock ──────────────────────────────────────────────────────────────────


def test_the_list_has_the_margin_of_each_item_with_a_cost_the_worst_size_first(client):
    costs_on(client)
    plain, with_sizes, bare = cake(client), sized(client), mk(client, name="Tea", name_ar="شاي")
    cost_of(client, plain, cost=4_000)
    large = next(v["id"] for v in with_sizes["variants"] if v["name"] == "Large")
    cost_of(client, with_sizes, cost=3_000, variants={large: 13_000})
    margins = client.get("/api/items/margins").json()["margins"]
    assert margins[plain["id"]]["amount"] == 6_000 and margins[plain["id"]]["pct"] == "60.0"
    assert margins[with_sizes["id"]]["amount"] == 1_000  # the large: 14,000 less 13,000
    assert margins[with_sizes["id"]]["below_cost"] is False
    assert bare["id"] not in margins
    cost_of(client, with_sizes, variants={large: 15_000})
    assert client.get("/api/items/margins").json()["margins"][with_sizes["id"]]["below_cost"]


def test_the_stock_tab_has_one_number_for_what_the_counted_stock_cost(client):
    costs_on(client)
    a = counted(client, 10, name="Flour bag", name_ar="دقيق", price=5_000)
    b = counted(client, 4, name="Sugar bag", name_ar="سكر", price=3_000)
    c = counted(client, 7, name="Butter", name_ar="زبدة", price=2_000)
    mk(client, name="Not counted", name_ar="غير معدود", price=100)
    cost_of(client, a, cost=1_250)
    cost_of(client, b, cost=800)
    answer = client.get("/api/items/valuation").json()
    assert answer["value"] == 10 * 1_250 + 4 * 800 and answer["value_text"] == "QAR 157"
    assert (answer["items"], answer["missing"]) == (2, 1)
    assert c  # (no cost kept: counted as missing, not in the value)


def test_a_sizes_own_cost_is_used_for_its_own_stock(client):
    costs_on(client)
    item = mk(client, name="Layer cake", name_ar="كيكة", price=10_000, stock_rule="count",
              variants=[{"name": "Small", "name_ar": "ص", "price_delta": 0, "opening_stock": 5},
                        {"name": "Large", "name_ar": "ك", "price_delta": 4_000,
                         "opening_stock": 2}])
    large = next(v["id"] for v in item["variants"] if v["name"] == "Large")
    cost_of(client, item, cost=1_000, variants={large: 3_000})
    assert client.get("/api/items/valuation").json()["value"] == 5 * 1_000 + 2 * 3_000


# ── the weekly report ───────────────────────────────────────────────────────────────────────


def test_the_weekly_report_has_the_estimated_margin_and_what_sold_at_a_loss(client):
    from alyr.modules import report
    from test_catalog_reports import catalog_lines, retime_order
    from test_reports import at

    costs_on(client)
    week = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    fine = cake(client, price=10_000)
    loss = mk(client, name="Pistachio tart", name_ar="تارت", price=1_000)
    thin = mk(client, name="Date roll", name_ar="لفة", price=1_000)
    bare = mk(client, name="Tea", name_ar="شاي", price=500)
    cost_of(client, fine, cost=4_000)
    cost_of(client, loss, cost=1_400)
    cost_of(client, thin, cost=950)
    a, b = people(client, 2)
    placed = [
        order(client, a, [line(fine, 2), line(loss, 2), line(thin, 4)]).json(),
        order(client, b, [line(fine), line(bare)]).json(),
    ]
    for n, one in enumerate(placed):
        retime_order(one["order_id"], at(week, 2, 9 + n))
    lines = catalog_lines(client, week)
    # revenue 20,000 + 2,000 + 4,000 + 10,000 = 36,000; cost 8,000 + 2,800 + 3,800 + 4,000
    assert "Estimated gross margin: QAR 174 (48.3%) on 2 orders" in lines
    assert any(x.endswith("had items with no cost kept, so those items are not in the margin")
               for x in lines)
    assert "Sold for less than they cost: Pistachio tart" in lines
    assert "Low margin (under 10%): Date roll (5.0%)" in lines
    arabic = catalog_lines(client, week, "ar")
    assert any(x.startswith("هامش الربح الإجمالي التقديري: 174 ر.ق (48.3%)") for x in arabic)
    assert "بيعت بأقل من تكلفتها: تارت" in arabic
    costs_on(client, False)
    assert not [x for x in catalog_lines(client, week) if "margin" in x.lower()]


def test_a_cancelled_order_is_not_in_the_margin(client):
    from alyr.modules import report
    from test_catalog_reports import catalog_lines, retime_order
    from test_reports import at

    costs_on(client)
    week = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    item = cake(client)
    cost_of(client, item, cost=1_000)
    [who] = people(client, 1)
    placed = order(client, who, [line(item)]).json()
    retime_order(placed["order_id"], at(week, 2, 9))
    cancel(client, placed["order_id"])
    assert not [x for x in catalog_lines(client, week) if "margin" in x.lower()]


def test_a_shop_that_never_kept_costs_has_no_margin_line(client):
    from alyr.modules import report
    from test_catalog_reports import catalog_lines

    week = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    assert not [x for x in catalog_lines(client, week) if "margin" in x.lower()]


# ── who may ask ──────────────────────────────────────────────────────────────────────────────


def test_an_agent_is_refused_by_every_cost_route_even_with_the_feature_on_or_off(client):
    costs_on(client)
    item = cake(client)
    cost_of(client, item, cost=1_000)
    sign_in(client, AGENT_EMAIL)
    for method, path in (
        ("get", f"/api/items/{item['id']}/cost"), ("put", f"/api/items/{item['id']}/cost"),
        ("get", "/api/items/margins"), ("get", "/api/items/valuation"),
        ("get", "/api/orders/margins"),
    ):
        call = getattr(client, method)
        response = call(path, json={"cost": 1}) if method == "put" else call(path)
        assert response.status_code == 403, (path, response.text)


def test_the_precision_of_a_percentage_is_one_decimal_and_exact():
    from alyr.modules.items import costs

    assert costs.pct(1, 3) == Decimal("33.3") and costs.pct(2, 3) == Decimal("66.7")
    assert costs.pct(125, 1000) == Decimal("12.5") and costs.pct(-5, 100) == Decimal("-5.0")
    assert costs.pct(1, 0) is None and costs.margin(100, None) is None
    # half goes up: 0.05% of 100 is 0.05, 1 in 2000 is 0.05%
    assert costs.pct(1, 2000) == Decimal("0.1")


# ── a template made in the back office can include it ─────────────────────────────────────


def test_a_template_made_in_the_back_office_can_switch_cost_and_margin_on(office, owner):  # noqa: F811
    from test_templates import made, new_with

    mine = made(office, name="Cake shop", features={"cost_margin": {"enabled": True}})
    assert mine["features"]["cost_margin"]["enabled"] is True
    shop = new_with(office, mine["key"])
    sign_in(owner, shop["email"])
    assert owner.get("/api/items/margins").status_code == 200
    plain = new_with(office, made(office, name="Plain")["key"])
    sign_in(owner, plain["email"])
    assert owner.get("/api/items/margins").status_code == 422
