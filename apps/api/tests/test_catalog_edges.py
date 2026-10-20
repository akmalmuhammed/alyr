"""Edges of the Catalog engine that the plan's scenarios do not name, found by reviewing it:
orders staff have taken on, races between a cancel and a status change, daily limits that
were topped up or lowered, made-to-order items with a full day, and what deleting an item
may take with it.
"""

import asyncio
import contextlib
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID

import pytest

from alyr import worker
from alyr.core import team
from alyr.modules.items.cart import CartLine
from alyr.modules.orders import holds as order_holds
from alyr.modules.orders import service as orders
from alyr.seed import DEMO_TENANT_ID
from test_catalog_scenarios import another
from test_consent import owner_sql
from test_items import (
    EVERY_DAY,
    counted,
    detail,
    drain,
    fresh,
    line,
    log_rows,
    mk,
    monday_at,
    on_hand,
    on_shop,
    order,
    pay,
    people,
    place_at,
    reconciled,
)
from test_orders import customer


def rewind_holds(hours: int = 1):
    """Make every hold in the demo shop, and its expiry job, due."""
    owner_sql(
        "update stock_holds set expires_at = now() - make_interval(hours => $2) "
        "where status = 'held' and tenant_id = $1", DEMO_TENANT_ID, hours,
    )
    owner_sql(
        "update jobs set run_at = now() - make_interval(hours => $2) "
        "where kind = 'stock_hold_expiry' and tenant_id = $1", DEMO_TENANT_ID, hours,
    )


# ------------------------------------------------- orders staff have taken on

@pytest.mark.parametrize("status", ["confirmed", "ready", "done"])
def test_a_hold_that_runs_out_does_not_cancel_an_order_staff_have_already_moved_on(
    client, status
):
    """The customer paid at the counter, say: staff moved the order on without the link
    being paid. When its hold runs out it is a sale, not a cancellation."""
    item = counted(client, 2, name="Samosa tray", name_ar="صينية سمبوسة")
    placed = order(client, customer(client), [line(item, 2)]).json()
    client.post(f"/api/orders/{placed['order_id']}/status", json={"status": status})
    rewind_holds()
    drain(client)
    assert client.get("/api/orders").json()["orders"][0]["status"] == status
    assert on_hand(client, item) == 0  # still sold
    hold = owner_sql(
        "select status from stock_holds where order_id = $1", UUID(placed["order_id"])
    )[0]
    assert hold["status"] == "committed"
    assert reconciled(client)


def test_a_status_change_that_races_a_cancel_cannot_bring_the_order_back(client):
    item = counted(client, 2, name="Samosa tray", name_ar="صينية سمبوسة")
    placed = order(client, customer(client), [line(item, 2)]).json()
    order_id, outbound = UUID(placed["order_id"]), client.app.state.outbound

    async def scenario():
        db = client.app.state.db
        cancelled, release = asyncio.Event(), asyncio.Event()

        async def cancel():
            async with db.tenant(DEMO_TENANT_ID) as conn:
                result = await orders.cancel_order(conn, order_id, outbound, team.ASSISTANT)
                cancelled.set()
                await release.wait()  # holds the order's row until the other has queued
                return result

        async def confirm():
            await cancelled.wait()
            async with db.tenant(DEMO_TENANT_ID) as conn:
                try:
                    await orders.set_status(conn, order_id, "confirmed", outbound)
                except orders.OrderError as error:
                    return error.code
                return "moved on"

        one, two = asyncio.create_task(cancel()), asyncio.create_task(confirm())
        await asyncio.sleep(0.5)
        release.set()
        return await one, await two

    result, outcome = client.portal.call(scenario)
    assert result["stock_returned"] == 2
    assert outcome == "cancelled"  # refused, not applied after the cancel
    assert client.get("/api/orders").json()["orders"][0]["status"] == "cancelled"
    assert on_hand(client, item) == 2


def test_cancelling_orders_that_hold_the_same_items_in_opposite_order_cannot_deadlock(client):
    first = counted(client, 40, name="Falafel", name_ar="فلافل")
    second = counted(client, 40, name="Hummus", name_ar="حمص")
    ahmed, other = customer(client), another(client)

    def cancel(order_id):
        return client.post(f"/api/orders/{order_id}/status", json={"status": "cancelled"})

    for _ in range(6):
        one = order(client, ahmed, [line(first), line(second)]).json()
        two = order(client, other, [line(second), line(first)]).json()
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(cancel, [one["order_id"], two["order_id"]]))
        assert [r.status_code for r in results] == [200, 200]
    assert (on_hand(client, first), on_hand(client, second)) == (40, 40)
    assert reconciled(client)


def test_saving_an_item_while_a_customer_orders_it_does_not_deadlock(client):
    item = counted(client, 200, name="Falafel", name_ar="فلافل", category="Mezze")
    buyers = people(client, 6)

    def buy(who):
        return order(client, who, [line(item)]).status_code

    def save(n):
        return client.put(f"/api/items/{item['id']}", json={
            "variants": [{"id": item["variants"][0]["id"], "name": "", "daily_limit": None}],
            "description": f"edit {n}",
        }).status_code

    with ThreadPoolExecutor(8) as pool:
        buying = [pool.submit(buy, who) for who in buyers]
        saving = [pool.submit(save, n) for n in range(6)]
        assert {f.result() for f in buying} == {200}
        assert {f.result() for f in saving} == {200}
    assert reconciled(client)


# ----------------------------------------------------------- daily limits

def test_a_daily_limit_that_was_topped_up_lets_a_bigger_order_through(client):
    cake = mk(client, name="Batch cake", name_ar="كعكة", stock_rule="daily_limit", daily_limit=2)
    ahmed = customer(client)
    topped = client.post(f"/api/items/{cake['id']}/stock", json={
        "kind": "received", "quantity": 3, "reason": "Baked a second tray"})
    assert topped.json()["balance"] == 5
    assert order(client, ahmed, [line(cake, 3)]).status_code == 200  # more than the limit of 2
    wasted = client.post(f"/api/items/{cake['id']}/stock", json={
        "kind": "wasted", "quantity": 2, "reason": "Dropped"})
    assert wasted.status_code == 200 and wasted.json()["balance"] == 0
    assert reconciled(client)


def test_a_daily_item_with_a_limit_of_zero_sells_what_was_made_that_morning(client):
    """Made fresh each day: the limit is zero until the baker says how many came out."""
    bread = mk(client, name="Saj bread", name_ar="خبز صاج", stock_rule="daily_limit",
               daily_limit=0)
    ahmed = customer(client)
    assert detail(order(client, ahmed, [line(bread)]))["code"] == "sold_out"
    assert client.post(f"/api/items/{bread['id']}/stock", json={
        "kind": "received", "quantity": 10, "reason": "Morning batch"}).status_code == 200
    assert order(client, ahmed, [line(bread, 4)]).status_code == 200
    assert fresh(client, bread)["variants"][0]["left"] == 6


def test_cancelling_after_the_limit_was_lowered_still_puts_the_stock_back_on_the_record(client):
    cake = mk(client, name="Batch cake", name_ar="كعكة", stock_rule="daily_limit", daily_limit=5)
    ahmed, other = customer(client), another(client)
    monday = monday_at(12)
    place_at(client, ahmed, [CartLine(UUID(cake["id"]), 3)], monday)
    second = place_at(client, other, [CartLine(UUID(cake["id"]), 2)], monday)
    client.put(f"/api/items/{cake['id']}", json={"daily_limit": 2})  # lowered below what is sold

    result = on_shop(
        client, orders.cancel_order, UUID(second["order_id"]), client.app.state.outbound,
        team.ASSISTANT,
    )
    assert result["stock_returned"] == 2
    kinds = [r["kind"] for r in log_rows(client, cake)]
    assert kinds.count("cancelled_restocked") == 1  # the log says so, not just the answer
    assert reconciled(client)


def test_a_made_to_order_item_offers_the_next_day_when_the_first_is_full(client):
    cake = mk(client, name="Birthday cake", name_ar="كعكة عيد ميلاد", stock_rule="daily_limit",
              daily_limit=1, schedule=[{"weekdays": EVERY_DAY, "lead_days": 1, "cutoff": "18:00"}])
    ahmed, other = customer(client), another(client)
    lines = [CartLine(UUID(cake["id"]), 1)]
    noon = monday_at(12)
    tuesday, wednesday = (noon + timedelta(days=n) for n in (1, 2))
    assert place_at(client, ahmed, lines, noon)["fulfil_on"] == tuesday.date().isoformat()
    # Tuesday is full. With no day chosen, Wednesday is offered rather than "sold out".
    assert place_at(client, other, lines, noon)["fulfil_on"] == wednesday.date().isoformat()
    on_page = on_shop(client, orders.storefront)
    assert cake["id"] in [p["id"] for p in on_page["products"]]
    # Asking for the full day by name is still refused, with what is left.
    with pytest.raises(orders.OrderError) as full:
        place_at(client, ahmed, lines, noon, for_date=tuesday.date())
    assert full.value.code == "sold_out"


# ------------------------------------------------------------ price rules

def test_a_sale_price_and_a_negative_price_difference_cannot_make_a_price_below_zero(client):
    refused = client.post("/api/items", json={
        "name": "Abaya", "name_ar": "عباية", "price": 1000, "sale_price": 500,
        "variants": [{"name": "Plain", "price_delta": -900}],
    })
    assert refused.status_code == 422 and detail(refused)["code"] == "bad_price"


def test_the_first_way_to_add_a_product_refuses_a_blank_name(client):
    blank = client.post("/api/products", json={"name": "   ", "price": 100})
    assert blank.status_code == 422


# ----------------------------------------------------- history is not deleted

def test_deleting_an_item_with_a_stock_or_price_history_archives_it_and_keeps_the_log(client):
    waste = counted(client, 5, name="Dates box", name_ar="علبة تمر")
    client.post(f"/api/items/{waste['id']}/stock", json={
        "kind": "wasted", "quantity": 1, "reason": "Damaged"})
    assert client.delete(f"/api/items/{waste['id']}").json() == {"result": "archived"}
    assert [r["kind"] for r in log_rows(client, waste)] == ["wasted", "opening"]

    repriced = mk(client, name="Tea", name_ar="شاي", price=500)
    client.put(f"/api/items/{repriced['id']}", json={"price": 600})
    assert client.delete(f"/api/items/{repriced['id']}").json() == {"result": "archived"}
    history = client.get(f"/api/items/{repriced['id']}/price-history").json()["history"]
    assert [h["price"] for h in history] == [600, 500]

    plain = mk(client, name="Mistake", name_ar="خطأ")
    assert client.delete(f"/api/items/{plain['id']}").json() == {"result": "deleted"}


# ----------------------------------------------------- what a customer may hold

def test_one_customer_cannot_hold_all_the_stock_by_ordering_without_paying(client):
    item = counted(client, 10, name="Pistachio tart", name_ar="تارت الفستق")
    ahmed, other = customer(client), another(client)
    placed = [order(client, ahmed, [line(item)]) for _ in range(3)]
    assert [r.status_code for r in placed] == [200, 200, 200]
    fourth = order(client, ahmed, [line(item)])
    assert (fourth.status_code, detail(fourth)["code"]) == (409, "too_many_holds")
    assert "3 orders waiting to be paid" in detail(fourth)["message"]
    assert on_hand(client, item) == 7  # the refused order took nothing
    assert order(client, other, [line(item)]).status_code == 200  # others are not affected
    assert pay(client, placed[0].json()).status_code == 200  # paying frees a place
    assert order(client, ahmed, [line(item)]).status_code == 200
    # Orders on a credit account hold nothing, so they are not counted.
    assert order(client, ahmed, [line(item)], "account").status_code == 200


# ------------------------------------------------------------- the worker

def test_the_workers_sweep_runs_the_moment_the_worker_starts(client):
    item = counted(client, 2, name="Date bar", name_ar="لوح التمر")
    order(client, customer(client), [line(item, 2)])
    owner_sql("delete from jobs where kind = 'stock_hold_expiry' and tenant_id = $1",
              DEMO_TENANT_ID)  # the job was lost while the worker was off
    rewind_holds(hours=3)

    async def start_the_worker():
        sweep = asyncio.create_task(
            worker.keep_holds_swept(client.app.state.db, client.app.state.outbound)
        )
        await asyncio.sleep(1.5)  # long enough for the first pass; the next is five minutes on
        sweep.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sweep

    client.portal.call(start_the_worker)
    assert on_hand(client, item) == 2
    assert client.get("/api/orders").json()["orders"][0]["status"] == "cancelled"


def test_a_hold_that_fails_to_release_does_not_stop_the_others_and_is_tried_again(
    client, monkeypatch
):
    first = counted(client, 2, name="Date bar", name_ar="لوح التمر")
    second = counted(client, 2, name="Fig bar", name_ar="لوح التين")
    ahmed, other = customer(client), another(client)
    stuck = order(client, ahmed, [line(first, 2)]).json()
    order(client, other, [line(second, 2)])
    rewind_holds(hours=2)

    real = orders.cancel_order

    async def fails_for_one(conn, order_id, *args, **kwargs):
        if str(order_id) == stuck["order_id"]:
            raise RuntimeError("the channel is down")
        return await real(conn, order_id, *args, **kwargs)

    monkeypatch.setattr(orders, "cancel_order", fails_for_one)
    drain(client)
    assert on_hand(client, second) == 2  # the other order was released all the same
    assert on_hand(client, first) == 0  # the stuck one is untouched, not half done
    assert reconciled(client)

    monkeypatch.setattr(orders, "cancel_order", real)
    swept = client.portal.call(
        order_holds.sweep_all, client.app.state.db, client.app.state.outbound
    )
    assert swept == 1 and on_hand(client, first) == 2  # the next sweep catches it
    assert reconciled(client)
