"""The identity the whole pricing pack rests on, tried through the real path (ALY-150):

    what the customer was shown  =  what the order stored  =  what the payment asks for
    total = sum(line price x quantity) - sum(line discounts) + delivery fee

on randomised carts with random discount codes (percentages, amounts, buy-N-get-one, scopes,
stackable or not), automatic discounts, and pickup or delivery to zones with free-over and minimum
rules. The arithmetic alone is tried on 4,000 carts in test_pricing_totals.py; this one goes
through HTTP, PostgreSQL and the stored snapshots.
"""

import random
from uuid import UUID

from alyr.seed import DEMO_SLUG
from catalog_wa import catalog_module_on  # noqa: F401  (the autouse fixture is used by name)
from order_links import token
from test_consent import owner_sql
from test_delivery import deliver_on, go, settings, zone
from test_discounts import check, rule, switch
from test_items import line, mk, people

STORE = f"/api/store/{DEMO_SLUG}"


def test_what_was_shown_is_what_was_stored_and_what_the_payment_asks_for(client):
    switch(client)
    deliver_on(client)
    rng = random.Random(1510)
    categories = ["Cakes", "Drinks", "Gifts"]
    items = [
        mk(client, name=f"Item {n}", name_ar=f"صنف {n}", category=rng.choice(categories),
           price=rng.choice([350, 995, 1_250, 2_575, 4_000, 7_333, 12_345]))
        for n in range(6)
    ]
    codes = []
    for n in range(7):
        kind = rng.choice(["percent", "amount", "free_units"])
        scope = rng.choice(["order", "selected"])
        body = {
            "code": f"RND{n}", "value_type": kind, "stackable": rng.random() < 0.5,
            "scope": scope, "min_order": rng.choice([0, 0, 2_000, 8_000]),
            "percent": rng.choice([5, 10, 12.5, 33.333, 50]) if kind == "percent" else None,
            "amount": rng.choice([100, 500, 2_550, 9_999]) if kind == "amount" else None,
            "buy_qty": rng.randrange(1, 4) if kind == "free_units" else None,
            "get_qty": 1 if kind == "free_units" else None,
        }
        if scope == "selected":
            body["categories"] = rng.sample(categories, 1)
            body["item_ids"] = [rng.choice(items)["id"]]
        codes.append(rule(client, **body)["code"])
    rule(client, kind="auto", code="", value_type="percent", percent=7, min_order=15_000)
    zones = [
        zone(client, name=f"Zone {n}", name_ar=f"منطقة {n}", fee=rng.choice([0, 500, 1_500, 2_525]),
             free_over=rng.choice([None, 10_000, 30_000]), min_order=rng.choice([0, 0, 3_000]))
        for n in range(3)
    ]
    settings(client, delivery=True, flat_fee=1_000)
    customers = people(client, 8)

    placed = with_discount = with_fee = free_delivery = 0
    for n in range(60):
        who = customers[n % len(customers)]
        cart = [
            line(rng.choice(items), rng.randrange(1, 10))
            for _ in range(rng.randrange(1, 5))
        ]
        typed = rng.sample(codes, rng.randrange(0, 3))
        mode = rng.choice(["pickup", "delivery", "delivery"])
        fulfilment = go(mode, rng.choice([z["id"] for z in zones] + [None]))
        shown = check(client, who, cart, typed, fulfilment=fulfilment).json()
        if not shown["ok"]:
            continue  # (the minimum was not met, or a code did not fit: nothing to place)
        coupons = [c["code"] for c in shown["pricing"]["coupons"] if c["ok"]]
        answer = client.post(f"{STORE}/orders", json={
            "token": token(who["id"]), "items": cart, "payment": "link", "coupons": coupons,
            "fulfilment": fulfilment, "expected_total": shown["total"],
        })
        assert answer.status_code == 200, (cart, coupons, fulfilment, answer.text)
        order = answer.json()
        placed += 1
        assert order["total"] == shown["total"]
        oid = UUID(order["order_id"])
        [row] = owner_sql("select * from orders where id = $1", oid)
        lines = owner_sql("select price, quantity, discount from order_items where order_id = $1",
                          oid)
        goods = sum(r["price"] * r["quantity"] for r in lines)
        off = sum(r["discount"] for r in lines)
        given = owner_sql("select coalesce(sum(amount_off), 0) as n, count(*) as c "
                          "from order_discounts where order_id = $1", oid)[0]
        [request] = owner_sql("select amount from payment_requests where order_id = $1", oid)
        # every piece is stored and they add up
        assert row["subtotal"] == goods
        assert row["discount_total"] == off == given["n"]
        assert row["total"] == goods - off + row["delivery_fee"] == shown["total"]
        assert request["amount"] == row["total"]
        assert row["total"] > 0 and (off == 0) == (given["c"] == 0)
        assert shown["pricing"]["discount_total"] == off
        if row["fulfilment"] == "pickup":
            assert row["delivery_fee"] == 0
        # the goods keep at least QAR 1
        assert goods - off >= min(goods, 100)
        with_discount += off > 0
        with_fee += row["delivery_fee"] > 0
        free_delivery += row["fulfilment"] == "delivery" and row["delivery_fee"] == 0
    assert placed >= 30, f"only {placed} of 60 random carts could be placed"
    # the random orders really did exercise all three
    assert with_discount >= 8 and with_fee >= 8 and free_delivery >= 1, (
        placed, with_discount, with_fee, free_delivery)
