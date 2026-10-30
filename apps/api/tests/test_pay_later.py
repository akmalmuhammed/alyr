"""A shop with no online account takes its money on collection (ALY-170, spec 024): the order
page asks for no payment, the order is placed unpaid with its stock kept, and staff mark it
paid when the cash or transfer arrives. Every test goes through the real path."""

from uuid import UUID

from alyr.seed import AHMED_PHONE
from test_consent import owner_sql
from test_items import counted, line, order
from test_order_cancel_credit import staff_cancel
from test_orders import STORE, customer
from test_reports import at, build, future_week, section

CASH_AND_TRANSFER = {"online": False, "ways": ["cash", "bank_transfer"]}
WAYS = "/api/orders-payment-ways"


def pay_on_collection(client, **more):
    answer = client.put(WAYS, json=CASH_AND_TRANSFER | more)
    assert answer.status_code == 200, answer.text


def a_cash_order(client, quantity=2):
    """Two cakes from an item counted in stock, asked for the way the page asks (`link`)."""
    cake = counted(client, 10, name="Honey cake", name_ar="كعكة عسل", price=4500)
    answer = order(client, customer(client, AHMED_PHONE), [line(cake, quantity)], "link")
    assert answer.status_code == 200, answer.text
    return answer.json()


def holds(order_id):
    return [r["status"] for r in owner_sql(
        "select status from stock_holds where order_id = $1", UUID(order_id))]


def listed(client, order_id):
    return next(o for o in client.get("/api/orders").json()["orders"] if o["id"] == order_id)


def test_a_shop_that_takes_money_on_collection_places_the_order_unpaid_with_no_link(client):
    pay_on_collection(client)
    page = client.get(STORE).json()
    assert page["settings"]["pay"] == CASH_AND_TRANSFER

    placed = a_cash_order(client)
    assert placed["payment"] == "later" and placed["pay_url"] is None
    assert placed["pay_ways"] == ["cash", "bank_transfer"]
    assert owner_sql("select 1 from payment_requests where order_id = $1",
                     UUID(placed["order_id"])) == []
    # The stock is the order's for good: nothing runs out, so nothing is given back unpaid.
    assert holds(placed["order_id"]) == ["committed"]
    assert placed["hold_expires_at"] is None
    assert listed(client, placed["order_id"])["payment"] == "unpaid"

    said = owner_sql(
        "select payload from messages where direction = 'out' order by created_at desc limit 1")
    assert "Pay by cash or bank transfer when you collect." in said[0]["payload"]


def test_staff_mark_it_paid_by_cash_and_it_counts_as_paid_everywhere(client):
    pay_on_collection(client)
    placed = a_cash_order(client)

    done = client.post(f"/api/orders/{placed['order_id']}/paid", json={"method": "cash"})
    assert done.status_code == 200, done.text
    assert done.json()["payment"]["method"] == "cash"
    assert done.json()["payment"]["amount_minor"] == placed["total"]
    # No Documents on this shop, so no receipt, and nothing about it breaks.
    assert done.json()["receipt"] is None
    assert listed(client, placed["order_id"])["payment"] == "paid"
    assert holds(placed["order_id"]) == ["committed"]
    # On the activity record, by whom and how.
    activity = owner_sql(
        "select detail from activity where subject_id = $1 and action = 'paid'",
        UUID(placed["order_id"]))
    assert len(activity) == 1
    # Twice is refused, not doubled.
    again = client.post(f"/api/orders/{placed['order_id']}/paid", json={"method": "cash"})
    assert again.status_code == 409

    # The weekly report counts it as paid.
    week = future_week()
    owner_sql("update orders set created_at = $2 where id = $1", UUID(placed["order_id"]),
              at(week, 4))
    numbers = section(build(client, week), "orders")["numbers"]
    assert (numbers["paid_orders"], numbers["paid_online"]) == (1, placed["total"])


def test_a_transfer_keeps_its_reference_and_an_unknown_way_is_refused(client):
    pay_on_collection(client)
    placed = a_cash_order(client)
    refused = client.post(f"/api/orders/{placed['order_id']}/paid", json={"method": "bitcoin"})
    assert refused.status_code == 422
    done = client.post(
        f"/api/orders/{placed['order_id']}/paid",
        json={"method": "bank_transfer", "reference": "QNB 88123"},
    )
    assert done.status_code == 200
    assert done.json()["payment"]["reference"] == "QNB 88123"


def test_cancelling_an_unpaid_order_gives_the_stock_back_and_owes_no_refund(client):
    pay_on_collection(client)
    placed = a_cash_order(client)
    cancelled = staff_cancel(client, placed)
    assert cancelled.status_code == 200
    assert cancelled.json()["refund_due"] is False
    assert holds(placed["order_id"]) == ["released"]


def test_the_payment_ways_must_name_a_way_and_only_owners_change_them(client):
    none = client.put(WAYS, json={"online": False, "ways": []})
    assert none.status_code == 422 and "at least one" in none.json()["detail"]
    assert client.put(WAYS, json={"ways": ["gold"]}).status_code == 422
    pay_on_collection(client)
    # Turning the link back on keeps the ways for later.
    back = client.put(WAYS, json={"online": True}).json()
    assert back == {"online": True, "ways": ["cash", "bank_transfer"], "online_possible": True}
    placed = a_cash_order(client)
    assert placed["payment"] == "link" and placed["pay_url"]


def test_choosing_cash_and_transfer_on_the_go_live_list_turns_the_link_off(client):
    from test_onboarding import new_business
    from test_readiness import step

    tenant, _, _ = new_business(client)

    def settings():
        [row] = owner_sql(
            "select pay_online, pay_later_ways from shop_settings where tenant_id = $1", tenant)
        return row["pay_online"], list(row["pay_later_ways"])

    assert step(client, "payments", choice="cash_transfer").status_code == 200
    assert settings() == (False, ["cash", "bank_transfer"])
    assert step(client, "payments", choice="online").status_code == 200
    assert settings() == (True, ["cash", "bank_transfer"])


def test_with_documents_on_the_same_action_still_makes_the_receipt(client_factory, monkeypatch):
    from documents_sales_support import customer as shop_customer
    from documents_sales_support import placed as shop_placed
    from documents_sales_support import sales_shop

    shop = sales_shop(client_factory, monkeypatch)
    assert shop.owner.put(WAYS, json=CASH_AND_TRANSFER).status_code == 200
    order_ = shop_placed(shop, shop_customer(shop))
    assert order_["payment"] == "later"
    done = shop.owner.post(f"/api/orders/{order_['order_id']}/paid", json={"method": "cash"})
    assert done.status_code == 200, done.text
    assert done.json()["receipt"]["kind"] == "receipt"
    assert done.json()["payment"]["receipt_document_id"] == done.json()["receipt"]["id"]
