"""Customer price groups (wholesale) and SKU (ALY-127, D-039, `specs/003-price-groups-and-sku`).

A shop prices by group: a customer in a group pays that group's price where it set one and the
normal price where it did not. The group decides the price in the cart check, on the order
page, in the order and on its payment link; the order keeps a copy of the group's name and the
price it charged. A SKU is a code the owner picks, never repeated within a shop. Every test goes
through the real path: PostgreSQL, the order page's HTTP API, the workspace's HTTP API.
"""

import re
import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.db import Database
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from conftest import APP_DSN, OWNER_DSN
from test_consent import owner_sql
from test_items import STORE, detail, fresh, line, mk, order, pay, people, vid
from test_orders import customer
from test_sign_in import other_shop_with_owner, sign_in

# ---------------------------------------------------------------------------- helpers

def make_group(client, name="Wholesale", name_ar="الجملة") -> dict:
    answer = client.post("/api/price-groups", json={"name": name, "name_ar": name_ar})
    assert answer.status_code == 200, answer.text
    return answer.json()["group"]


def group_list(client) -> list[dict]:
    answer = client.get("/api/price-groups")
    assert answer.status_code == 200, answer.text
    return answer.json()["groups"]


def default_group(client) -> dict:
    return next(g for g in group_list(client) if g["is_default"])


def put_in(client, contact: dict, group: dict | None):
    return client.put(
        f"/api/price-groups/customers/{contact['id']}",
        json={"group_id": group["id"] if group else None},
    )


def set_price(client, item: dict, group: dict, price: int | None, variant: str | None = None,
              reason: str = ""):
    answer = client.put(f"/api/items/{item['id']}/group-prices", json={
        "prices": [{"group_id": group["id"], "variant_id": variant, "price": price}],
        "reason": reason,
    })
    assert answer.status_code == 200, answer.text
    return answer.json()["prices"]


def check(client, lines: list[dict], contact: dict | None = None) -> dict:
    body = {"items": lines}
    if contact:
        body["contact_id"] = contact["id"]
    answer = client.post(f"{STORE}/cart/check", json=body)
    assert answer.status_code == 200, answer.text
    return answer.json()


def page(client, contact: dict | None = None) -> dict:
    answer = client.get(STORE, params={"c": contact["id"]} if contact else None)
    assert answer.status_code == 200, answer.text
    return answer.json()


def on_page(shown: dict, item: dict) -> dict:
    return next(p for p in shown["products"] if p["id"] == item["id"])


def amount_to_pay(client, placed: dict) -> int:
    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", placed["pay_url"]).groups()
    return client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["amount"]


def order_row(client, placed: dict) -> dict:
    return next(o for o in client.get("/api/orders").json()["orders"]
                if o["id"] == placed["order_id"])


def refused(response) -> str:
    assert response.status_code == 422, response.text
    return response.json()["detail"]["code"]


# --------------------------------------------------------------------- the groups

def test_a_shop_always_has_a_default_group_that_can_be_renamed_but_not_removed(client):
    groups = group_list(client)
    assert [(g["name"], g["name_ar"], g["is_default"]) for g in groups] == [
        ("Retail", "التجزئة", True),
    ]
    renamed = client.put(f"/api/price-groups/{groups[0]['id']}",
                         json={"name": "Walk-in", "name_ar": "الزبائن"})
    assert renamed.json()["group"]["name"] == "Walk-in"
    gone = client.delete(f"/api/price-groups/{groups[0]['id']}")
    assert refused(gone) == "default_group"
    assert [g["is_default"] for g in group_list(client)] == [True]


def test_a_group_has_a_name_in_both_languages_and_a_name_used_once(client):
    both = make_group(client, "Contractors", "المقاولون")
    assert (both["name"], both["name_ar"]) == ("Contractors", "المقاولون")
    # A name in one language is used for the other, so both are always there.
    arabic_only = client.post("/api/price-groups", json={"name_ar": "الموظفون"}).json()["group"]
    assert (arabic_only["name"], arabic_only["name_ar"]) == ("الموظفون", "الموظفون")
    english_only = client.post("/api/price-groups", json={"name": "Staff"}).json()["group"]
    assert english_only["name_ar"] == "Staff"
    assert refused(client.post("/api/price-groups", json={"name": "contractors"})) == (
        "price_group_name_taken"
    )
    blank = client.post("/api/price-groups", json={"name": "  "})
    assert refused(blank) == "price_group_name_needed"
    assert [g["name"] for g in group_list(client)] == [
        "Retail", "Contractors", "الموظفون", "Staff",
    ]


def test_only_owners_and_admins_manage_groups_but_the_whole_team_can_read_them(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    group = make_group(owner)
    who = people(owner, 1)[0]
    assert agent.get("/api/price-groups").status_code == 200
    assert agent.post("/api/price-groups", json={"name": "Mine"}).status_code == 403
    assert agent.put(f"/api/price-groups/{group['id']}", json={"name": "X"}).status_code == 403
    assert agent.delete(f"/api/price-groups/{group['id']}").status_code == 403
    assert put_in(agent, who, group).status_code == 403
    assert agent.put(f"/api/items/{uuid4()}/group-prices", json={
        "prices": [{"group_id": group["id"], "price": 5}]}).status_code in (403, 404)
    assert put_in(owner, who, group).status_code == 200


def test_the_groups_answer_only_where_orders_or_the_catalog_are_on(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    assert client_factory().get("/api/price-groups").status_code == 401
    owner = client_factory()
    sign_in(owner)
    assert owner.get("/api/price-groups").status_code == 200
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'orders'",
              DEMO_TENANT_ID)
    assert owner.get("/api/price-groups").status_code == 403


def test_removing_a_group_sends_its_customers_back_to_the_default_and_keeps_its_prices(client):
    cable = mk(client, name="Cable", name_ar="كابل", price=1000)
    group = make_group(client)
    buyer = people(client, 1)[0]
    set_price(client, cable, group, 800)
    assert put_in(client, buyer, group).status_code == 200
    assert next(g for g in group_list(client) if g["id"] == group["id"])["customers"] == 1

    gone = client.delete(f"/api/price-groups/{group['id']}")
    assert gone.json()["moved"] == 1
    assert [g["id"] for g in group_list(client)] == [default_group(client)["id"]]
    # The customer pays the normal price again, and the item no longer lists the group's price.
    assert check(client, [line(cable)], buyer)["total"] == 1000
    assert fresh(client, cable)["group_prices"] == []
    # What was set is kept in the books, and the name can be used again.
    kept = owner_sql("select count(*) as n from item_group_price_history where group_id = $1",
                     UUID(group["id"]))
    assert kept[0]["n"] == 1
    assert make_group(client)["id"] != group["id"]
    assert client.delete(f"/api/price-groups/{group['id']}").status_code == 404
    # It is on the customer's record.
    thread = client.get(f"/api/inbox/conversations/{buyer['id']}").json()
    moves = [a for a in thread["activity"] if a["action"] == "price_group"]
    assert [m["detail"] for m in moves] == [
        {"from": "Retail", "to": "Wholesale"}, {"from": "Wholesale", "to": "Retail"},
    ]


# --------------------------------------------------------- a customer's group

def test_staff_put_a_customer_in_a_group_and_the_conversation_shows_it(client):
    buyer = people(client, 1)[0]
    group = make_group(client)
    assert client.get(f"/api/inbox/conversations/{buyer['id']}").json()["customer"][
        "price_group_id"] is None
    assert put_in(client, buyer, group).json()["group"]["name"] == "Wholesale"
    assert client.get(f"/api/inbox/conversations/{buyer['id']}").json()["customer"][
        "price_group_id"] == group["id"]
    # None is the default group, stored as no group at all.
    assert put_in(client, buyer, None).json()["group"]["is_default"] is True
    assert client.get(f"/api/inbox/conversations/{buyer['id']}").json()["customer"][
        "price_group_id"] is None
    assert put_in(client, {"id": str(uuid4())}, group).status_code == 404
    assert refused(client.put(f"/api/price-groups/customers/{buyer['id']}",
                              json={"group_id": str(uuid4())})) == "unknown_group"
    moves = [a["detail"] for a in client.get(
        f"/api/inbox/conversations/{buyer['id']}").json()["activity"]
        if a["action"] == "price_group"]
    assert moves == [{"from": "Retail", "to": "Wholesale"}, {"from": "Wholesale", "to": "Retail"}]


# ------------------------------------------------------------- what each group pays

def test_a_wholesale_and_a_retail_customer_ordering_the_same_item_in_the_same_minute_are_each_charged_their_own_price(client):  # noqa: E501
    cable = mk(client, name="Cable", name_ar="كابل", price=1000)
    retail, wholesale = people(client, 2)
    group = make_group(client)
    set_price(client, cable, group, 800)
    put_in(client, wholesale, group)
    start = threading.Barrier(2)

    def buy(who):
        start.wait()  # both order at the same moment
        return order(client, who, [line(cable, 3)])

    with ThreadPoolExecutor(2) as pool:
        first, second = list(pool.map(buy, (retail, wholesale)))
    assert (first.status_code, second.status_code) == (200, 200), (first.text, second.text)
    mine, theirs = first.json(), second.json()

    assert (mine["total"], mine["price_group"]["name"]) == (3000, "Retail")
    assert (theirs["total"], theirs["price_group"]["name"]) == (2400, "Wholesale")
    # The order shows the group and what each line was charged ...
    assert (order_row(client, mine)["price_group"]["name"],
            order_row(client, mine)["items"][0]["price"]) == ("Retail", 1000)
    wholesale_order = order_row(client, theirs)
    assert wholesale_order["price_group"] == {
        "name": "Wholesale", "name_ar": "الجملة", "is_default": False,
    }
    assert (wholesale_order["items"][0]["price"], wholesale_order["total"]) == (800, 2400)
    # ... and the payment link asks for the same amount.
    assert (amount_to_pay(client, mine), amount_to_pay(client, theirs)) == (3000, 2400)
    assert pay(client, theirs).status_code == 200


def test_a_group_with_no_price_for_an_item_pays_the_normal_price(client):
    priced = mk(client, name="Cable", name_ar="كابل", price=1000)
    unpriced = mk(client, name="Switch", name_ar="مفتاح", price=500)
    buyer = people(client, 1)[0]
    group = make_group(client)
    set_price(client, priced, group, 800)
    put_in(client, buyer, group)
    cart = check(client, [line(priced), line(unpriced, 2)], buyer)
    assert [(ln["unit_price"], ln["price_source"]) for ln in cart["lines"]] == [
        (800, "group"), (500, "normal"),
    ]
    assert cart["total"] == 800 + 1000
    placed = order(client, buyer, [line(priced), line(unpriced, 2)]).json()
    assert placed["total"] == 1800
    # Taking the group's price away puts the group back on the normal price.
    set_price(client, priced, group, None)
    assert check(client, [line(priced)], buyer)["total"] == 1000


def test_a_sale_price_is_the_normal_price_until_the_group_has_one_of_its_own(client):
    item = mk(client, name="Lamp", name_ar="مصباح", price=1000, sale_price=700)
    buyer = people(client, 1)[0]
    group = make_group(client)
    put_in(client, buyer, group)
    assert check(client, [line(item)], buyer)["total"] == 700  # the sale is the normal price
    set_price(client, item, group, 900)
    # The group's price replaces the normal price, a sale included: it was agreed with them.
    assert check(client, [line(item)], buyer)["total"] == 900
    assert check(client, [line(item)])["total"] == 700


def test_a_size_pays_the_groups_item_price_plus_its_difference_unless_it_has_its_own(client):
    shirt = mk(client, name="Shirt", name_ar="قميص", price=1000, variants=[
        {"name": "Small", "name_ar": "صغير"},
        {"name": "Large", "name_ar": "كبير", "price_delta": 300},
    ])
    small, large = vid(shirt, "Small"), vid(shirt, "Large")
    buyer = people(client, 1)[0]
    group = make_group(client)
    put_in(client, buyer, group)

    def cost(size: str) -> int:
        return check(client, [line(shirt, variant_id=size)], buyer)["total"]

    assert (cost(small), cost(large)) == (1000, 1300)  # no price for the group yet
    set_price(client, shirt, group, 800)
    assert (cost(small), cost(large)) == (800, 1100)  # the item's price, and the size's difference
    set_price(client, shirt, group, 900, variant=large)
    assert (cost(small), cost(large)) == (800, 900)  # a price of its own for the size wins
    assert sorted((p["variant_id"], p["price"]) for p in fresh(client, shirt)["group_prices"]
                  if p["variant_id"]) == [(large, 900)]
    shown = on_page(page(client, buyer), shirt)
    assert [(v["name"], v["price"], v["price_source"]) for v in shown["variants"]] == [
        ("Small", 800, "group"), ("Large", 900, "group"),
    ]
    assert [(v["name"], v["price"], v["price_source"]) for v in on_page(
        page(client), shirt)["variants"]] == [("Small", 1000, "normal"), ("Large", 1300, "normal")]


def test_the_order_page_and_the_cart_check_show_each_customer_their_own_prices(client):
    cable = mk(client, name="Cable", name_ar="كابل", price=1000)
    retail, wholesale = people(client, 2)
    group = make_group(client)
    set_price(client, cable, group, 800)
    put_in(client, wholesale, group)

    plain = page(client, retail)
    assert plain["group"]["is_default"] is True
    row = on_page(plain, cable)
    assert (row["price"], row["price_source"], row["list_price"]) == (1000, "normal", None)
    assert "normal_price" not in row

    theirs = page(client, wholesale)
    assert theirs["group"] == {
        "id": group["id"], "name": "Wholesale", "name_ar": "الجملة", "is_default": False,
    }
    row = on_page(theirs, cable)
    assert (row["price"], row["price_text"], row["price_source"]) == (800, "QAR 8", "group")
    assert (row["normal_price"], row["normal_price_text"], row["list_price"]) == (
        1000, "QAR 10", 1000,
    )
    # A page opened with no customer shows the normal prices.
    assert on_page(page(client), cable)["price"] == 1000

    wholesale_cart = check(client, [line(cable, 2)], wholesale)
    assert wholesale_cart["group"]["name"] == "Wholesale"
    shown = wholesale_cart["lines"][0]
    assert (shown["unit_price"], shown["line_total"], shown["price_source"]) == (800, 1600, "group")
    assert (shown["normal_unit_price"], shown["normal_unit_price_text"]) == (1000, "QAR 10")
    plain_cart = check(client, [line(cable, 2)], retail)
    assert plain_cart["group"]["is_default"] is True
    assert "normal_unit_price" not in plain_cart["lines"][0]
    assert check(client, [line(cable, 2)])["total"] == 2000

    # The price the customer was shown is checked against their own price.
    stale = check(client, [line(cable, expected_price=1000)], wholesale)["lines"][0]
    assert (stale["code"], stale["new_price"]) == ("price_changed", 800)
    placed = order(client, wholesale, [line(cable, expected_price=1000)])
    assert (placed.status_code, detail(placed)["code"]) == (409, "price_changed")
    assert order(client, wholesale, [line(cable, expected_price=800)]).status_code == 200


def test_an_order_on_account_and_its_ledger_sale_use_the_groups_price(client):
    cable = mk(client, name="Cable", name_ar="كابل", price=1000)
    ahmed = customer(client)
    group = make_group(client)
    set_price(client, cable, group, 800)
    put_in(client, ahmed, group)
    placed = order(client, ahmed, [line(cable, 4)], "account")
    assert placed.status_code == 200, placed.text
    assert placed.json()["total"] == 3200
    assert customer(client)["balance"] == ahmed["balance"] + 3200


def test_same_as_last_time_charges_todays_price_for_the_customers_group(client):
    cable = mk(client, name="Cable", name_ar="كابل", price=1000)
    buyer = people(client, 1)[0]
    group = make_group(client)
    set_price(client, cable, group, 800)
    put_in(client, buyer, group)
    assert order(client, buyer, [line(cable, 2)]).status_code == 200
    set_price(client, cable, group, 700)
    again = client.post(f"{STORE}/orders/repeat", json={"contact_id": buyer["id"],
                                                          "payment": "link"})
    assert again.status_code == 200, again.text
    assert again.json()["total"] == 1400
    assert [(c["was"], c["now"]) for c in again.json()["price_changes"]] == [(800, 700)]
    assert again.json()["price_group"]["name"] == "Wholesale"


def test_an_order_keeps_the_price_and_the_group_it_was_charged_whatever_changes_later(client):
    cable = mk(client, name="Cable", name_ar="كابل", price=1000, sku="CBL-1")
    buyer = people(client, 1)[0]
    group = make_group(client)
    set_price(client, cable, group, 800)
    put_in(client, buyer, group)
    placed = order(client, buyer, [line(cable, 3)]).json()

    # Everything about the group and the price changes, and the customer moves away.
    set_price(client, cable, group, 500)
    client.put(f"/api/price-groups/{group['id']}", json={"name": "Trade", "name_ar": "تجارة"})
    client.put(f"/api/items/{cable['id']}", json={"price": 1500, "sku": "CBL-2"})
    put_in(client, buyer, None)
    assert client.delete(f"/api/price-groups/{group['id']}").status_code == 200

    row = order_row(client, placed)
    assert row["price_group"] == {"name": "Wholesale", "name_ar": "الجملة", "is_default": False}
    assert (row["total"], row["items"][0]["price"], row["items"][0]["sku"]) == (2400, 800, "CBL-1")
    assert amount_to_pay(client, placed) == 2400
    tracked = client.get(f"/api/track/{DEMO_TENANT_ID}/{placed['order_id']}").json()["order"]
    assert tracked["total_text"] == "QAR 24"
    # A new order is charged by the new facts.
    assert order(client, buyer, [line(cable)]).json()["total"] == 1500


# ------------------------------------------------------------ prices and their history

def test_group_prices_keep_a_history_like_the_normal_price_does(client):
    cable = mk(client, name="Cable", name_ar="كابل", price=1000)
    group = make_group(client)
    set_price(client, cable, group, 800, reason="Agreed with the contractors")
    set_price(client, cable, group, 750)
    set_price(client, cable, group, 750)  # unchanged: nothing to record
    set_price(client, cable, group, None)
    history = client.get(f"/api/items/{cable['id']}/group-price-history").json()["history"]
    assert [(h["price"], h["group"]["name"], h["reason"]) for h in history] == [
        (None, "Wholesale", ""), (750, "Wholesale", ""),
        (800, "Wholesale", "Agreed with the contractors"),
    ]
    assert history[-1]["changed_by"]["name"] and history[-1]["at"]
    did = client.get(f"/api/items/{cable['id']}/activity").json()["activity"]
    assert [a["action"] for a in did].count("group_prices") == 3
    # The normal price's own history is not touched by any of it.
    assert len(client.get(f"/api/items/{cable['id']}/price-history").json()["history"]) == 1
    # An item with such a history is archived, never deleted.
    assert client.delete(f"/api/items/{cable['id']}").json() == {"result": "archived"}


def test_a_group_price_must_make_sense_and_belong_to_this_shop(client):
    shirt = mk(client, name="Shirt", name_ar="قميص", price=1000, variants=[
        {"name": "Small", "name_ar": "صغير", "price_delta": -300}, {"name": "Large"},
    ])
    other_item = mk(client, name="Hat", name_ar="قبعة", price=500)
    group = make_group(client)
    default = default_group(client)

    def put(rows):
        return client.put(f"/api/items/{shirt['id']}/group-prices", json={"prices": rows})

    assert refused(put([{"group_id": default["id"], "price": 500}])) == "default_group_price"
    assert refused(put([{"group_id": str(uuid4()), "price": 500}])) == "unknown_group"
    assert refused(put([{"group_id": group["id"], "price": 250}])) == "bad_group_price"
    assert refused(put([{"group_id": group["id"], "variant_id": vid(other_item), "price": 5}])) == (
        "unknown_variant"
    )
    assert put([{"group_id": group["id"], "price": 0}]).status_code == 422  # not above zero
    assert refused(put([{"group_id": group["id"], "price": 900},
                        {"group_id": group["id"], "price": 800}])) == "repeated_price"
    assert client.put(f"/api/items/{uuid4()}/group-prices", json={
        "prices": [{"group_id": group["id"], "price": 5}]}).status_code == 404
    # Nothing was saved by the refused calls.
    assert fresh(client, shirt)["group_prices"] == []
    assert put([{"group_id": group["id"], "price": 400}]).status_code == 200  # 400 - 300 > 0


def test_group_prices_are_saved_with_the_item_in_one_step(client):
    group = make_group(client)
    made = client.post("/api/items", json={
        "name": "Cable", "name_ar": "كابل", "price": 1000, "status": "live",
        "group_prices": [{"group_id": group["id"], "price": 800}],
    })
    assert made.status_code == 200, made.text
    item = made.json()["item"]
    assert [(p["group_id"], p["price"]) for p in item["group_prices"]] == [(group["id"], 800)]
    changed = client.put(f"/api/items/{item['id']}", json={
        "price": 1100, "group_prices": [{"group_id": group["id"], "price": 850}],
    })
    assert changed.json()["item"]["group_prices"][0]["price"] == 850
    # One refusal undoes the whole save: the price stays what it was.
    bad = client.put(f"/api/items/{item['id']}", json={
        "price": 1200, "group_prices": [{"group_id": str(uuid4()), "price": 5}],
    })
    assert refused(bad) == "unknown_group"
    assert fresh(client, item)["price"] == 1100


# ---------------------------------------------------------- one shop cannot see another's

def test_two_shops_cannot_see_each_others_groups_or_prices():
    async def scenario():
        a, b = uuid4(), uuid4()
        conn = await asyncpg.connect(OWNER_DSN)
        item = uuid4()
        try:
            for tenant_id, name in ((a, "Shop A"), (b, "Shop B")):
                await conn.execute("insert into tenants (id, name) values ($1, $2)",
                                   tenant_id, name)
            group = await conn.fetchval(
                "insert into price_groups (tenant_id, name, name_ar, is_default) "
                "values ($1, 'Retail', 'التجزئة', true) returning id", a)
            wholesale = await conn.fetchval(
                "insert into price_groups (tenant_id, name, name_ar) "
                "values ($1, 'Wholesale', 'الجملة') returning id", a)
            await conn.execute(
                "insert into items (id, tenant_id, name, price) values ($1, $2, 'Cable', 1000)",
                item, a)
            await conn.execute(
                "insert into item_group_prices (tenant_id, group_id, item_id, price) "
                "values ($1, $2, $3, 800)", a, wholesale, item)
            await conn.execute(
                "insert into item_group_price_history (tenant_id, group_id, item_id, price) "
                "values ($1, $2, $3, 800)", a, wholesale, item)
        finally:
            await conn.close()
        db = Database(APP_DSN)
        await db.connect()
        try:
            seen = {}
            for who, tenant_id in (("a", a), ("b", b)):
                async with db.tenant(tenant_id) as app:
                    seen[who] = [
                        await app.fetchval(f"select count(*) from {table}")
                        for table in ("price_groups", "item_group_prices",
                                      "item_group_price_history")
                    ]
            async with db.tenant(b) as app:
                renamed = await app.execute("update price_groups set name = 'Hacked'")
                removed = await app.execute("delete from price_groups")
                moved = await app.execute("update item_group_prices set price = 1")
            async with db.tenant(a) as app:
                kept = await app.fetchval("select string_agg(name, ',' order by name) "
                                          "from price_groups")
                price = await app.fetchval("select price from item_group_prices")
            writes = []
            for table, columns in (
                ("price_groups", "(tenant_id, name, name_ar) values ($1, 'x', 'x')"),
                ("item_group_prices",
                 f"(tenant_id, group_id, item_id, price) values ($1, '{wholesale}', '{item}', 1)"),
                ("item_group_price_history",
                 f"(tenant_id, group_id, item_id) values ($1, '{wholesale}', '{item}')"),
            ):
                try:
                    async with db.tenant(b) as app:
                        await app.execute(f"insert into {table} {columns}", a)
                    writes.append("written")
                except asyncpg.InsufficientPrivilegeError:
                    writes.append("refused")
            return seen, (renamed, removed, moved), (kept, price), writes, group
        finally:
            await db.close()

    import asyncio

    seen, untouched, kept, writes, _default = asyncio.run(scenario())
    assert seen == {"a": [2, 1, 1], "b": [0, 0, 0]}
    assert untouched == ("UPDATE 0", "DELETE 0", "UPDATE 0")
    assert kept == ("Retail,Wholesale", 800)
    assert writes == ["refused", "refused", "refused"]


def test_another_shops_owner_sees_only_their_own_groups_and_cannot_use_ours(client):
    mine = make_group(client)
    cable = mk(client, name="Cable", name_ar="كابل", price=1000)
    buyer = people(client, 1)[0]
    other = other_shop_with_owner("omar-groups@other.example")
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')", other)
    client.cookies.clear()
    sign_in(client, "omar-groups@other.example")

    theirs = group_list(client)
    assert [(g["name"], g["is_default"], g["customers"]) for g in theirs] == [("Retail", True, 0)]
    assert mine["id"] not in [g["id"] for g in theirs]
    assert client.put(f"/api/price-groups/{mine['id']}", json={"name": "Hacked"}).status_code == 404
    assert client.delete(f"/api/price-groups/{mine['id']}").status_code == 404
    assert put_in(client, buyer, mine).status_code == 404  # not their customer
    own_item = mk(client, name="Their cable", name_ar="كابلهم", price=900)
    stolen = client.put(f"/api/items/{own_item['id']}/group-prices", json={
        "prices": [{"group_id": mine["id"], "price": 5}]})
    assert refused(stolen) == "unknown_group"
    assert client.get(f"/api/items/{cable['id']}/group-prices").status_code == 404
    assert client.put(f"/api/items/{cable['id']}/group-prices", json={
        "prices": [{"group_id": theirs[0]["id"], "price": 5}]}).status_code in (404, 422)
    client.cookies.clear()
    assert [g["name"] for g in group_list(client)] == ["Retail", "Wholesale"]
    assert fresh(client, cable)["group_prices"] == []


# ------------------------------------------------------------------------------- SKU

def test_an_item_and_its_sizes_can_have_a_sku_and_blank_is_allowed_many_times(client):
    plain = mk(client, name="Plain", name_ar="عادي")
    assert plain["sku"] == ""
    again = mk(client, name="Plain two", name_ar="عادي٢")
    assert again["sku"] == ""
    coded = mk(client, name="Shirt", name_ar="قميص", sku="  TS-100  ", variants=[
        {"name": "Small", "name_ar": "صغير", "sku": "TS-100-S"},
        {"name": "Large", "name_ar": "كبير", "sku": "TS-100-L"},
        {"name": "Huge", "name_ar": "ضخم"},
    ])
    assert coded["sku"] == "TS-100"  # spaces at the ends are not part of a code
    assert [(v["name"], v["sku"]) for v in coded["variants"]] == [
        ("Small", "TS-100-S"), ("Large", "TS-100-L"), ("Huge", ""),
    ]
    assert fresh(client, coded)["variants"][0]["sku"] == "TS-100-S"
    # A form that leaves the variants' codes out keeps them; an empty one clears.
    saved = client.put(f"/api/items/{coded['id']}", json={"variants": [
        {"id": v["id"], "name": v["name"], "name_ar": v["name_ar"]} for v in coded["variants"]
    ]}).json()["item"]
    assert [v["sku"] for v in saved["variants"]] == ["TS-100-S", "TS-100-L", ""]
    cleared = client.put(f"/api/items/{coded['id']}", json={"sku": ""}).json()["item"]
    assert cleared["sku"] == ""
    assert client.put(f"/api/items/{coded['id']}", json={"sku": None}).status_code == 200
    long = client.put(f"/api/items/{coded['id']}", json={"sku": "X" * 41})
    assert long.status_code == 422  # beyond the 40 characters allowed


def test_a_sku_is_used_once_in_a_shop_whatever_its_case_and_wherever_it_is(client):
    shirt = mk(client, name="Shirt", name_ar="قميص", sku="TS-100", variants=[
        {"name": "Small", "name_ar": "صغير", "sku": "TS-100-S"}, {"name": "Large"},
    ])

    def taken(**fields):
        answer = client.post("/api/items", json={
            "name": "Other", "name_ar": "آخر", "price": 100, "status": "live", **fields})
        return answer

    # Another item with the same code, in any case, even one with spaces round it.
    for code in ("TS-100", "ts-100", " Ts-100 "):
        answer = taken(sku=code)
        assert refused(answer) == "sku_taken"
        assert "Shirt" in answer.json()["detail"]["message"]
    # A code used by a size of another item, the other way round and across the tables.
    assert refused(taken(sku="ts-100-s")) == "sku_taken"
    assert refused(taken(variants=[{"name": "A", "sku": "TS-100"}, {"name": "B"}])) == "sku_taken"
    assert refused(taken(variants=[{"name": "A", "sku": "TS-100-S"}, {"name": "B"}])) == "sku_taken"
    # The same code twice inside one item.
    assert refused(taken(sku="NEW-1", variants=[{"name": "A", "sku": "new-1"}, {"name": "B"}])) == (
        "sku_repeated"
    )
    assert refused(taken(variants=[{"name": "A", "sku": "Q"}, {"name": "B", "sku": "q"}])) == (
        "sku_repeated"
    )
    # Editing an item to take an existing code, and editing it to keep its own.
    second = taken(sku="TS-200").json()["item"]
    assert refused(client.put(f"/api/items/{second['id']}", json={"sku": "ts-100"})) == "sku_taken"
    assert client.put(f"/api/items/{second['id']}", json={"sku": "TS-200", "price": 150}
                      ).status_code == 200
    resized = client.put(f"/api/items/{second['id']}", json={"variants": [
        {"name": "Big", "sku": "TS-100-S"}, {"name": "Little"}]})
    assert refused(resized) == "sku_taken"
    # An item's code against its own size's code.
    assert refused(client.put(f"/api/items/{shirt['id']}", json={"sku": "TS-100-S"})) == (
        "sku_repeated"
    )
    # Nothing was changed by any refusal.
    assert fresh(client, shirt)["sku"] == "TS-100"
    assert fresh(client, second)["variants"][0]["name"] == ""
    # An archived item keeps its code, and says so; clearing it frees the code.
    client.post(f"/api/items/{shirt['id']}/status", json={"status": "archived"})
    assert refused(taken(sku="TS-100")) == "sku_taken"
    client.put(f"/api/items/{shirt['id']}", json={"sku": ""})
    assert taken(sku="TS-100").status_code == 200


def test_the_database_itself_refuses_a_repeated_sku_in_one_table(client):
    """The app checks across the two tables under a lock; the unique indexes underneath keep
    every other way of writing from repeating a code inside a table."""
    shirt = mk(client, name="Shirt", name_ar="قميص", sku="DB-1")
    with pytest.raises(asyncpg.UniqueViolationError):
        owner_sql("insert into items (tenant_id, name, price, sku) values ($1, 'x', 1, 'db-1')",
                  DEMO_TENANT_ID)
    with pytest.raises(asyncpg.UniqueViolationError):
        owner_sql("update item_variants set sku = 'v-1' where item_id = $1", UUID(shirt["id"]))
        owner_sql(
            "insert into item_variants (tenant_id, item_id, name, sku) values ($1, $2, 'b', 'V-1')",
            DEMO_TENANT_ID, UUID(shirt["id"]),
        )


def test_two_saves_at_the_same_moment_cannot_both_take_a_sku(client):
    start = threading.Barrier(2)

    def make(fields):
        start.wait()
        return client.post("/api/items", json={
            "name": "Thing", "name_ar": "شيء", "price": 100, "status": "live", **fields})

    # The same code on two items, and the same code on an item and on another's size.
    for first, second in (
        ({"sku": "RACE-1"}, {"sku": "race-1", "name": "Thing two"}),
        ({"sku": "RACE-2"}, {"variants": [{"name": "A", "sku": "RACE-2"}, {"name": "B"}],
                             "name": "Thing two"}),
    ):
        start.reset()
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(make, (first, second)))
        assert sorted(r.status_code for r in results) == [200, 422], [r.text for r in results]


def test_the_item_list_finds_an_item_by_its_sku_or_by_a_sizes_sku(client):
    shirt = mk(client, name="Shirt", name_ar="قميص", sku="ZQ-4410", variants=[
        {"name": "Small", "name_ar": "صغير", "sku": "ZQ-4410-S"}, {"name": "Large"},
    ])
    mk(client, name="Hat", name_ar="قبعة", sku="QH-7731")
    mk(client, name="Scarf", name_ar="وشاح")

    def found(q):
        return [i["name"] for i in client.get("/api/items", params={"q": q}).json()["items"]]

    assert found("zq-4410") == ["Shirt"]
    assert found("ZQ-4410-S") == ["Shirt"]  # a size's code finds its item
    assert found("qh-7731") == ["Hat"]
    assert found("4410") == ["Shirt"]  # part of a code
    assert found("nothing-like-it") == []
    assert [i["sku"] for i in client.get("/api/items").json()["items"]
            if i["name"] == "Shirt"] == ["ZQ-4410"]
    assert fresh(client, shirt)["variants"][0]["sku"] == "ZQ-4410-S"


def test_an_order_shows_the_sku_of_what_was_ordered_as_it_was_then(client):
    shirt = mk(client, name="Shirt", name_ar="قميص", sku="TS-100", variants=[
        {"name": "Small", "name_ar": "صغير", "sku": "TS-100-S"},
        {"name": "Large", "name_ar": "كبير"},
    ])
    hat = mk(client, name="Hat", name_ar="قبعة", sku="HAT-7")
    buyer = people(client, 1)[0]
    placed = order(client, buyer, [
        line(shirt, variant_id=vid(shirt, "Small")), line(shirt, variant_id=vid(shirt, "Large")),
        line(hat),
    ])
    assert placed.status_code == 200, placed.text
    codes = {i["name"]: i["sku"] for i in order_row(client, placed.json())["items"]}
    # A size's own code, else the item's.
    assert sorted(i["sku"] for i in order_row(client, placed.json())["items"]) == [
        "HAT-7", "TS-100", "TS-100-S"]
    assert codes["Hat"] == "HAT-7"
    # Changing the code later does not rewrite the order.
    client.put(f"/api/items/{hat['id']}", json={"sku": "HAT-8"})
    assert "HAT-7" in [i["sku"] for i in order_row(client, placed.json())["items"]]
    # The order page shows the codes to the customer who orders.
    row = on_page(page(client), shirt)
    assert (row["sku"], [v["sku"] for v in row["variants"]]) == ("TS-100", ["TS-100-S", ""])


# ---------------------------------------------------------------- the migration

MIGRATION = "0026_price_groups_and_sku.sql"


async def migrate_a_populated_database(limited: bool) -> dict:
    """Builds a throwaway database up to the migration before this one, fills it the way a
    live shop is, applies this one, and looks at what each shop has afterwards. Run as a
    superuser and as an owner that row-level security applies to."""
    from alyr.migrate import MIGRATIONS, ensure_app_role
    from test_catalog_migration import LIMITED_ROLE, dsn_for

    base = urlparse_path(OWNER_DSN)
    scratch = f"{base}_mig26_{'limited' if limited else 'super'}"
    admin = await asyncpg.connect(dsn_for(OWNER_DSN, "postgres"))
    try:
        await ensure_app_role(admin, APP_DSN)
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        if limited:
            await admin.execute(f"drop role if exists {LIMITED_ROLE}")
            await admin.execute(
                f"create role {LIMITED_ROLE} login password 'check' nosuperuser nobypassrls"
            )
            await admin.execute(f'create database "{scratch}" owner {LIMITED_ROLE}')
        else:
            await admin.execute(f'create database "{scratch}"')
        migrating = await asyncpg.connect(
            dsn_for(OWNER_DSN, scratch, LIMITED_ROLE if limited else None,
                    "check" if limited else None)
        )
        shops = [uuid4(), uuid4()]
        try:
            files = sorted(MIGRATIONS.glob("*.sql"))
            for path in [f for f in files if f.name < MIGRATION]:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))
            for n, shop in enumerate(shops):
                await migrating.execute(
                    "insert into tenants (id, name, slug) values ($1, $2, $3)",
                    shop, f"Old {n}", f"old-{n}")
                await migrating.execute("select set_config('app.tenant_id', $1, false)", str(shop))
                contact = uuid4()
                await migrating.execute(
                    "insert into contacts (id, phone, name) values ($1, $2, 'Ahmed')",
                    contact, f"9745500000{n}")
                item = await migrating.fetchval(
                    "insert into items (name, price) values ('Cable', 1000) returning id")
                order = uuid4()
                await migrating.execute(
                    "insert into orders (id, contact_id, number, total) "
                    "values ($1, $2, 1001, 1000)",
                    order, contact)
                await migrating.execute(
                    "insert into order_items (order_id, item_id, name, price, quantity) "
                    "values ($1, $2, 'Cable', 1000, 1)", order, item)
            await migrating.execute("reset app.tenant_id")
            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / MIGRATION).read_text(encoding="utf-8"))
        finally:
            await migrating.close()
        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            result = {
                "groups": await look.fetch(
                    "select tenant_id, name, name_ar, is_default, archived_at from price_groups "
                    "order by tenant_id"),
                "shops": shops,
                "contacts": await look.fetch("select price_group_id from contacts"),
                "orders": await look.fetch(
                    "select number, total, price_group_id, price_group_name from orders"),
                "lines": await look.fetch("select price, sku from order_items"),
                "items": await look.fetch("select name, price, sku from items"),
                "forced": await look.fetch(
                    "select relname, relforcerowsecurity as forced from pg_class "
                    "where relname = any($1) and relkind = 'r'",
                    ["price_groups", "item_group_prices", "item_group_price_history",
                     "ledger_entries", "contacts", "orders", "items"]),
            }
        finally:
            await look.close()
        app = await asyncpg.connect(dsn_for(APP_DSN, scratch))
        try:
            seen = []
            for shop in shops:
                async with app.transaction():
                    await app.execute("select set_config('app.tenant_id', $1, true)", str(shop))
                    seen.append(await app.fetchval("select count(*) from price_groups"))
            result["app_sees"] = seen
        finally:
            await app.close()
        return result
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


def urlparse_path(dsn: str) -> str:
    from urllib.parse import urlparse

    return urlparse(dsn).path.lstrip("/")


@pytest.mark.parametrize("limited", [False, True], ids=["superuser_owner", "row_security_owner"])
def test_every_existing_shop_gets_its_default_group_and_loses_nothing(limited):
    import asyncio

    found = asyncio.run(migrate_a_populated_database(limited))
    assert sorted(g["tenant_id"] for g in found["groups"]) == sorted(found["shops"])
    assert {(g["name"], g["name_ar"], g["is_default"], g["archived_at"]) for g in found["groups"]
            } == {("Retail", "التجزئة", True, None)}
    # Customers have no group of their own, which is the default; orders have no group name.
    assert [c["price_group_id"] for c in found["contacts"]] == [None, None]
    assert [(o["number"], o["total"], o["price_group_id"], o["price_group_name"])
            for o in found["orders"]] == [(1001, 1000, None, "")] * 2
    assert [(ln["price"], ln["sku"]) for ln in found["lines"]] == [(1000, "")] * 2
    assert [(i["name"], i["price"], i["sku"]) for i in found["items"]] == [("Cable", 1000, "")] * 2
    assert all(r["forced"] for r in found["forced"]) and len(found["forced"]) == 7
    assert found["app_sees"] == [1, 1]  # each shop sees its own group through the policy
