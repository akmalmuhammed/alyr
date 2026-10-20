"""A receipt or an invoice made from an order adds up to what the customer was charged, with the
order's discounts and its delivery fee (ALY-150 with ALY-139): the paper shows each line's
discount and the delivery as a line of its own, and its total is the order's total.
"""

from documents_sales_support import (
    customer,
    documents,
    item,
    pay_by_link,
    place,
    placed,
    sales_shop,
)
from test_consent import owner_sql


def switch_on(shop, *features):
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog') "
              "on conflict (tenant_id, module_key) do update set enabled = true", shop.tenant_id)
    for key in features:
        done = shop.owner.put(f"/api/features/{key}", json={"enabled": True})
        assert done.status_code == 200, done.text


def test_a_receipt_for_a_discounted_and_delivered_order_adds_up_to_the_order(
    client_factory, monkeypatch
):
    shop = sales_shop(client_factory, monkeypatch)
    switch_on(shop, "discounts", "delivery_fees")
    made = shop.owner.post("/api/discounts", json={
        "kind": "coupon", "code": "TEN10", "value_type": "percent", "percent": 10})
    assert made.status_code == 200, made.text
    zone = shop.owner.post("/api/delivery/zones", json={
        "name": "Al Wakra", "name_ar": "الوكرة", "fee": 1_500})
    assert zone.status_code == 200, zone.text
    assert shop.owner.put("/api/delivery", json={"delivery": True}).status_code == 200
    who = customer(shop)
    bread = item(shop, price=1_000)
    cake = item(shop, "Date cake", "كيكة التمر", price=4_500)

    answer = shop.owner.post(f"/api/store/{shop.slug}/orders", json={
        "token": who.token, "payment": "link", "coupons": ["TEN10"],
        "items": [{"product_id": bread["id"], "quantity": 3},
                  {"product_id": cake["id"], "quantity": 2}],
        "fulfilment": {"mode": "delivery", "zone_id": zone.json()["zone"]["id"],
                       "address": "Villa 12, Street 4"},
    })
    assert answer.status_code == 200, answer.text
    order = answer.json()
    assert order["total"] == 3_000 + 9_000 - 1_200 + 1_500  # 12,000 less 10%, plus the fee

    assert pay_by_link(shop, order).json() == {"status": "paid"}
    [receipt] = documents(shop)
    assert receipt["total_minor"] == order["total"] == 12_300
    shown = shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]
    lines = {x["description"]: x for x in shown["lines"]}
    assert lines["Delivery (Al Wakra)"]["unit_price_minor"] == 1_500
    assert lines["Delivery (Al Wakra)"]["description_ar"] == "التوصيل (الوكرة)"
    assert sum(x["discount_minor"] for x in shown["lines"]) == 1_200


def test_a_shop_without_a_discount_or_a_fee_gets_the_same_receipt_as_before(
    client_factory, monkeypatch
):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    order = placed(shop, who, [(item(shop), 12)])
    assert pay_by_link(shop, order).json() == {"status": "paid"}
    [receipt] = documents(shop)
    shown = shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]
    assert receipt["total_minor"] == 12 * 350 == order["total"]
    assert [x["description"] for x in shown["lines"]] == ["Fresh Arabic bread"]
    assert shown["lines"][0]["discount_minor"] == 0
    assert place  # (the same helper the other sales tests place orders with)
