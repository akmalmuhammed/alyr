"""Decimal quantities and the pricing pack together (ALY-149 with ALY-150).

The pricing pack's arithmetic was written for quantities that are not whole (one rounding rule,
half up, once per line). These tests go through the real path with 0.333 kg and 1.5 kg and check
that the page's total, the charged total, the stored line and the margin all agree to the dirham.
"""

from uuid import UUID

from catalog_wa import catalog_module_on  # noqa: F401  (the autouse fixture is used by name)
from order_links import token
from test_consent import owner_sql
from test_cost import cost_of, costs_on
from test_decimal_quantities import by_weight, dates  # noqa: F401  (fixture and helper)
from test_discounts import rule
from test_discounts import switch as discounts_switch
from test_items import line, order, people
from test_orders import STORE


def test_a_coupon_on_a_fraction_charges_what_the_page_said(by_weight):  # noqa: F811
    client = by_weight
    discounts_switch(client)
    rule(client, code="TEN10", percent=10)
    item = dates(client, 20)
    [who] = people(client, 1)
    body = {"items": [line(item, "1.5")], "token": token(who["id"]), "coupons": ["TEN10"]}
    page = client.post(f"{STORE}/cart/check", json=body)
    assert page.status_code == 200, page.text
    placed = order(client, who, [line(item, "1.5")], coupons=["TEN10"])
    assert placed.status_code == 200, placed.text
    # the page's total is the charged total, which is the rounded line less its discount
    assert page.json()["total"] == placed.json()["total"]
    [row] = owner_sql(
        "select o.total, l.quantity, l.price, l.discount from orders o "
        "join order_items l on l.order_id = o.id where o.id = $1",
        UUID(placed.json()["order_id"]),
    )
    # 1.5 kg at QAR 12.50 is QAR 18.75: 1,875 minor units, whole; the discount comes off that
    assert row["quantity"] == 1.5 and row["discount"] > 0
    assert row["total"] == round(row["price"] * row["quantity"]) - row["discount"]


def test_a_line_that_needs_rounding_is_the_same_everywhere(by_weight):  # noqa: F811
    client = by_weight
    item = dates(client, 20, pack_size="0.001", min_order="0.001")
    [who] = people(client, 1)
    placed = order(client, who, [line(item, "0.333")])
    assert placed.status_code == 200, placed.text
    # 1250 x 0.333 = 416.25: the line is 416, once, and the order is that line
    assert placed.json()["total"] == 416
    [row] = owner_sql("select total from orders where id = $1", UUID(placed.json()["order_id"]))
    assert row["total"] == 416
    listed = client.get("/api/orders").json()
    listed = listed["orders"] if isinstance(listed, dict) else listed
    [shown] = [o for o in listed if o["number"] == placed.json()["number"]][0]["items"]
    assert (shown["quantity"], shown["line_text"]) == (0.333, "QAR 4.16")


def test_the_margin_of_a_fraction_rounds_each_line_once(by_weight):  # noqa: F811
    client = by_weight
    costs_on(client)
    item = dates(client, 20, pack_size="0.001", min_order="0.001")
    cost_of(client, item, cost=800)
    [who] = people(client, 1)
    placed = order(client, who, [line(item, "0.333")]).json()
    margin = client.get("/api/orders/margins").json()["margins"][placed["order_id"]]
    # the line brought in round(416.25) = 416 and cost round(266.4) = 266
    assert (margin["revenue"], margin["cost"], margin["amount"]) == (416, 266, 150)
    assert margin["pct"] == "36.1" and margin["complete"] is True
