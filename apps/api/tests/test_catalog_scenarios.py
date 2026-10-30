"""The scenarios of the Catalog plan that ALY-102 owns, one test each, numbered as in the
plan (D-039): 1 to 12, 18, 19, 21, 22, 27 and 29.

Every test goes through the real path: PostgreSQL, the order page's HTTP API, the
simulator's conversation. Where a scenario depends on the time of day, the clock is held
still by handing the checkout a moment (`place_at`) instead of waiting for one.
"""

import asyncio
import json
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.core import team
from alyr.db import Database
from alyr.modules.items import stock
from alyr.modules.items.cart import CartLine
from alyr.modules.items.stock import Take
from alyr.modules.orders import holds as order_holds
from alyr.modules.orders import service as orders
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID
from conftest import APP_DSN
from order_links import token
from test_bookings import book
from test_consent import conversation, owner_sql, say
from test_items import (
    ACTOR,
    EVERY_DAY,
    QATAR,
    STORE,
    counted,
    detail,
    drain,
    fresh,
    line,
    log_rows,
    mk,
    on_hand,
    on_shop,
    order,
    pay,
    people,
    place_at,
    reconciled,
    restaurant_item,
    vid,
)
from test_orders import customer, product
from test_sign_in import other_shop_with_owner, sign_in
from test_track import tracked as track_of


def another(client) -> dict:
    """A demo customer who is not Ahmed."""
    return next(p for p in people(client, 5) if p["phone"] != AHMED_PHONE)


def repeat(client, contact: dict):
    """"Same as last time" from the order page."""
    return client.post(
        f"{STORE}/orders/repeat", json={"token": token(contact["id"]), "payment": "link"}
    )


# ---------------------------------------------------- 1. the last item, twice at once

def test_scenario_01_two_customers_paying_for_the_last_item_at_once_one_succeeds(client):
    last = counted(client, 1, name="Last tiramisu", name_ar="تيراميسو")
    cable = product(client, "Cable 2.5 mm")
    first, second = people(client)
    start = threading.Barrier(2)

    def buy(who):
        start.wait()  # both pay at the same moment
        return order(client, who, [line(last), {"product_id": cable["id"], "quantity": 2}])

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(buy, (first, second)))
    won, lost = sorted(results, key=lambda r: r.status_code)
    assert (won.status_code, lost.status_code) == (200, 409)

    refusal = detail(lost)
    assert refusal["code"] == "sold_out"
    gone, rest = refusal["lines"]
    assert (gone["ok"], gone["code"], gone["left"]) == (False, "sold_out", 0)
    assert rest["ok"] is True  # the rest of the cart is still good
    assert on_hand(client, last) == 0
    assert len(client.get("/api/orders").json()["orders"]) == 1
    assert reconciled(client)


def test_scenario_01_the_database_step_gives_the_last_item_to_one_of_two_takers(client):
    """The two takers hold the same variant's row at once: the second has to wait for the
    first, and then finds nothing left."""
    last = counted(client, 1)
    variant = UUID(vid(last))

    async def scenario():
        db = client.app.state.db
        taken, release = asyncio.Event(), asyncio.Event()

        async def first():
            async with db.tenant(DEMO_TENANT_ID) as conn:
                short = await stock.reserve(conn, [Take(variant, 1)], uuid4(), ACTOR)
                taken.set()
                await release.wait()  # keeps its transaction (and the row) open
                return short

        async def second():
            await taken.wait()
            async with db.tenant(DEMO_TENANT_ID) as conn:
                return await stock.reserve(conn, [Take(variant, 1)], uuid4(), ACTOR)

        one, two = asyncio.create_task(first()), asyncio.create_task(second())
        await asyncio.sleep(0.5)
        waiting = not two.done()
        release.set()
        return waiting, await one, await two

    waiting, first_short, second_short = client.portal.call(scenario)
    assert waiting, "the second taker should be queued behind the first"
    assert first_short == []
    assert [(s["wanted"], s["left"]) for s in second_short] == [(1, 0)]
    assert reconciled(client)


def test_scenario_01_many_customers_at_once_never_sell_more_than_there_is(client):
    item = counted(client, 3, name="Pistachio tart", name_ar="تارت الفستق")
    buyers = people(client, 8)
    start = threading.Barrier(len(buyers))

    def buy(who):
        start.wait()
        return order(client, who, [line(item)])

    with ThreadPoolExecutor(len(buyers)) as pool:
        results = list(pool.map(buy, buyers))
    assert Counter(r.status_code for r in results) == {200: 3, 409: 5}
    assert on_hand(client, item) == 0
    assert [r["kind"] for r in log_rows(client, item)].count("sold") == 3
    assert reconciled(client)


# ----------------------------------------------------------- 2. sold out in the cart

def test_scenario_02_an_item_that_sells_out_in_a_cart_is_caught_before_payment(client):
    cake = counted(client, 2, name="Cheesecake slice", name_ar="تشيز كيك", category="Desserts")
    counted(client, 5, name="Brownie", name_ar="براوني", category="Desserts")
    ahmed, other = customer(client), another(client)
    # Ahmed has two slices in his cart; before he pays, someone else buys both.
    assert order(client, other, [line(cake, 2)]).status_code == 200

    check = client.post(f"{STORE}/cart/check", json={"items": [line(cake, 2)]}).json()
    assert check["ok"] is False
    bad = check["lines"][0]
    assert (bad["code"], bad["message"]) == ("sold_out", "Cheesecake slice is sold out.")
    assert bad["message_ar"] == "نفد «تشيز كيك»."
    assert [a["name"] for a in bad["alternatives"]] == ["Brownie"]

    refused = order(client, ahmed, [line(cake, 2)])
    assert refused.status_code == 409 and detail(refused)["code"] == "sold_out"
    assert detail(refused)["lines"][0]["alternatives"][0]["name"] == "Brownie"
    # He was never asked to pay: no order, no payment link.
    assert owner_sql(
        "select count(*) as n from payment_requests where contact_id = $1", UUID(ahmed["id"])
    )[0]["n"] == 0


# ------------------------------------------------------------ 3. the price changes

def test_scenario_03_a_price_change_between_add_and_pay_is_shown_before_payment(client):
    karak = mk(client, name="Karak", name_ar="كرك", price=500)
    ahmed = customer(client)
    # His page showed QAR 5. Before he pays, staff raise it to QAR 7.
    client.put(f"/api/items/{karak['id']}", json={"price": 700})

    refused = order(client, ahmed, [line(karak, 2, expected_price=500)])
    assert refused.status_code == 409
    problem = detail(refused)
    assert problem["code"] == "price_changed"
    assert (problem["lines"][0]["old_price"], problem["lines"][0]["new_price"]) == (500, 700)
    assert "changed from QAR 5 to QAR 7" in problem["message"]
    # An Arabic sentence writes money the Arabic way, never "QAR" (ALY-112).
    assert "من 5 ر.ق إلى 7 ر.ق" in problem["message_ar"]
    assert "QAR" not in problem["message_ar"]
    assert client.get("/api/orders").json()["orders"] == []  # nothing was ordered or charged

    confirmed = order(client, ahmed, [line(karak, 2, expected_price=700)])
    assert confirmed.status_code == 200 and confirmed.json()["total"] == 1400
    # The same question can be asked without placing anything.
    check = client.post(
        f"{STORE}/cart/check", json={"items": [line(karak, 1, expected_price=500)]}
    ).json()
    assert (check["ok"], check["lines"][0]["code"]) == (False, "price_changed")


# ------------------------------------------------------- 4. hidden by its schedule

def test_scenario_04_an_item_hidden_by_its_schedule_says_when_it_is_next_available(client):
    now = datetime.now(QATAR)
    other_days = [d for d in EVERY_DAY if d != (now.weekday() + 1) % 7]
    breakfast = mk(client, name="Breakfast plate", name_ar="فطور", schedule=[
        {"weekdays": other_days, "opens": "06:00", "closes": "11:00"},
    ])
    assert breakfast["availability"]["reason"] == "not_now"

    refused = order(client, people(client)[0], [line(breakfast)])
    assert refused.status_code == 409
    problem = detail(refused)
    tomorrow = (now + timedelta(days=1)).date().isoformat()
    assert problem["code"] == "not_now"
    assert problem["lines"][0]["next_at"].startswith(f"{tomorrow}T06:00")
    assert problem["message"] == "Breakfast plate can be ordered again tomorrow at 6:00 AM."
    assert "غداً الساعة 6:00 ص" in problem["message_ar"]
    # The order page lists it apart, with when it is back.
    page = client.get(STORE).json()
    assert breakfast["id"] not in [p["id"] for p in page["products"]]
    listed = next(p for p in page["unavailable"] if p["id"] == breakfast["id"])
    assert listed["reason"] == "not_now" and listed["next_at"].startswith(tomorrow)


def test_scenario_04_the_hours_of_the_day_decide_it_too(client):
    fatayer = mk(client, name="Fatayer", name_ar="فطاير", schedule=[
        {"weekdays": EVERY_DAY, "opens": "06:00", "closes": "11:00"},
    ])
    ahmed, lines = people(client)[0], [CartLine(UUID(fatayer["id"]), 1)]
    place_at(client, ahmed, lines, datetime(2026, 10, 19, 9, 0, tzinfo=QATAR))
    with pytest.raises(orders.OrderError) as late:
        place_at(client, ahmed, lines, datetime(2026, 10, 19, 13, 0, tzinfo=QATAR))
    assert late.value.code == "not_now"
    assert late.value.lines[0]["next_at"] == "2026-10-20T06:00:00+03:00"


# ------------------------------------------------------------ 5. after the cut-off

def test_scenario_05_an_order_after_the_cutoff_is_offered_the_next_day_or_refused(client):
    cake = mk(client, name="Birthday cake", name_ar="كعكة عيد ميلاد", schedule=[
        {"weekdays": EVERY_DAY, "lead_days": 1, "cutoff": "18:00"},
    ])
    ahmed, lines = customer(client), [CartLine(UUID(cake["id"]), 1)]
    before = datetime(2026, 10, 19, 17, 0, tzinfo=QATAR)  # a Monday
    after = datetime(2026, 10, 19, 19, 0, tzinfo=QATAR)

    placed = place_at(client, ahmed, lines, before)
    assert placed["fulfil_on"] == "2026-10-20"  # before six: tomorrow
    assert owner_sql(
        "select fulfil_on from orders where id = $1", UUID(placed["order_id"])
    )[0]["fulfil_on"] == date(2026, 10, 20)

    offered = place_at(client, ahmed, lines, after)
    assert offered["fulfil_on"] == "2026-10-21"  # after six: offered the next day available

    with pytest.raises(orders.OrderError) as refused:
        place_at(client, ahmed, lines, after, for_date=date(2026, 10, 20))
    assert refused.value.code == "after_cutoff"
    assert refused.value.lines[0]["next_date"] == "2026-10-21"
    assert str(refused.value) == (
        "It is too late to order Birthday cake for tomorrow. "
        "The next day it can be ordered for is Wed 21 Oct."
    )
    # Over HTTP, a date already gone is refused with the reason.
    yesterday = (datetime.now(QATAR) - timedelta(days=1)).date().isoformat()
    past = order(client, ahmed, [line(cake)], for_date=yesterday)
    assert (past.status_code, detail(past)["code"]) == (409, "past")


# ------------------------------------------------------ 6. more than there is

def test_scenario_06_a_quantity_above_stock_shows_the_maximum(client):
    croissant = counted(client, 3, name="Croissant", name_ar="كرواسون")
    ahmed = customer(client)
    refused = order(client, ahmed, [line(croissant, 5)])
    assert refused.status_code == 409
    problem = detail(refused)
    row = problem["lines"][0]
    assert (problem["code"], row["max_quantity"], row["left"], row["requested"]) == (
        "not_enough", 3, 3, 5,
    )
    assert problem["message"] == "Only 3 of Croissant left. Please order 3 or fewer."
    # The same item on two lines is counted together, not line by line.
    twice = order(client, ahmed, [line(croissant, 2), line(croissant, 2)])
    assert twice.status_code == 409
    assert [x["ok"] for x in detail(twice)["lines"]] == [True, False]
    assert detail(twice)["lines"][1]["max_quantity"] == 1
    assert on_hand(client, croissant) == 3  # nothing was taken
    assert order(client, ahmed, [line(croissant, 3)]).status_code == 200
    # The shop's own minimum is a limit too.
    dates = mk(client, name="Box of dates", name_ar="علبة تمر", min_order=6)
    below = order(client, ahmed, [line(dates, 2)])
    assert (below.status_code, detail(below)["code"]) == (422, "below_minimum")
    assert order(client, ahmed, [line(dates, 6)]).status_code == 200


# ------------------------------------------------- 7. a required option is missing

def test_scenario_07_a_required_option_that_is_missing_is_named(client):
    pizza, other_pizza = restaurant_item(client), restaurant_item(client)
    ahmed = customer(client)
    size, extras = pizza["option_groups"]
    large = size["options"][1]
    cheese, olives, mushrooms = extras["options"]

    missing = order(client, ahmed, [line(pizza)])
    problem = detail(missing)
    assert (missing.status_code, problem["code"]) == (422, "option_required")
    assert problem["lines"][0]["group_id"] == size["id"]  # the field to highlight
    assert problem["message"] == "Choose Size for Pizza."
    assert "الحجم" in problem["message_ar"]

    everything = [large["id"], cheese["id"], olives["id"], mushrooms["id"]]
    too_many = order(client, ahmed, [line(pizza, 1, option_ids=everything)])
    assert detail(too_many)["code"] == "option_too_many"
    foreign = order(client, ahmed, [line(pizza, 1, option_ids=[
        other_pizza["option_groups"][0]["options"][0]["id"]])])
    assert detail(foreign)["code"] == "option_invalid"  # another item's choice is not allowed

    placed = order(client, ahmed, [line(pizza, 2, option_ids=[large["id"], cheese["id"]])])
    assert placed.status_code == 200
    assert placed.json()["total"] == 2 * (3000 + 400 + 200)


# --------------------------------------------- 8. a pay link that is never paid

def test_scenario_08_a_pay_link_never_paid_releases_its_stock_after_30_minutes(client):
    cheesecake = counted(client, 2, name="Cheesecake", name_ar="تشيز كيك")
    ahmed, other = customer(client), another(client)
    say(client, AHMED_PHONE, "hello")  # opens his 24-hour window, so he is told in plain words
    placed = order(client, ahmed, [line(cheesecake, 2)]).json()

    expires = datetime.fromisoformat(placed["hold_expires_at"])
    assert 29 <= (expires - datetime.now(UTC)).total_seconds() / 60 <= 31
    assert on_hand(client, cheesecake) == 0
    assert order(client, other, [line(cheesecake)]).status_code == 409  # held for him
    queued = owner_sql(
        "select run_at from jobs where kind = 'stock_hold_expiry' and status = 'queued'"
    )
    assert len(queued) == 1 and abs((queued[0]["run_at"] - expires).total_seconds()) < 1

    # Thirty-one minutes pass.
    owner_sql("update stock_holds set expires_at = now() - interval '1 minute' "
              "where status = 'held'")
    owner_sql("update jobs set run_at = now() where kind = 'stock_hold_expiry'")
    drain(client)

    assert on_hand(client, cheesecake) == 2  # back on the shelf
    assert client.get("/api/orders").json()["orders"][0]["status"] == "cancelled"
    assert "was not paid within 30 minutes" in conversation(client)[-1]["body"]  # he is told
    late = pay(client, placed)  # the link no longer pays
    assert (late.status_code, detail(late)["code"]) == (409, "expired")
    assert order(client, other, [line(cheesecake, 2)]).status_code == 200  # someone else can
    assert [r["kind"] for r in log_rows(client, cheesecake)] == [
        "sold", "cancelled_restocked", "sold", "opening",
    ]
    assert reconciled(client)


def test_the_shop_can_change_how_long_an_unpaid_order_holds_its_stock(client):
    rest = {
        "day_starts": "00:00", "agents_edit_items": False, "low_stock_at": 5,
        "sold_out_display": "grey", "wholesale_layout": False, "whatsapp_number": "",
        "whatsapp_mode": "chat",
    }
    assert client.get("/api/items/settings").json() == {"hold_minutes": 30, **rest}
    saved = client.put("/api/items/settings", json={"hold_minutes": 10})
    assert saved.json() == {"hold_minutes": 10, **rest}
    assert client.put("/api/items/settings", json={"hold_minutes": 2}).status_code == 422
    item = counted(client, 1)
    placed = order(client, customer(client), [line(item)]).json()
    minutes = (datetime.fromisoformat(placed["hold_expires_at"]) - datetime.now(UTC)
               ).total_seconds() / 60
    assert 9 <= minutes <= 10.5


def test_an_order_paid_in_time_keeps_its_stock_when_the_hold_would_have_ended(client):
    item = counted(client, 2)
    placed = order(client, customer(client), [line(item, 2)]).json()
    assert pay(client, placed).json() == {"status": "paid"}
    hold = owner_sql(
        "select status, expires_at from stock_holds where order_id = $1",
        UUID(placed["order_id"]),
    )[0]
    assert (hold["status"], hold["expires_at"]) == ("committed", None)
    owner_sql("update jobs set run_at = now() where kind = 'stock_hold_expiry'")
    drain(client)
    assert on_hand(client, item) == 0
    assert client.get("/api/orders").json()["orders"][0]["status"] == "new"


def test_an_order_for_items_nobody_counts_holds_nothing_and_never_expires(client):
    cable = product(client, "Cable 2.5 mm")
    placed = order(client, customer(client), [{"product_id": cable["id"], "quantity": 1}]).json()
    assert placed["hold_expires_at"] is None
    assert owner_sql(
        "select count(*) as n from jobs where tenant_id = $1 and kind = 'stock_hold_expiry'",
        DEMO_TENANT_ID,
    )[0]["n"] == 0
    assert owner_sql(
        "select count(*) as n from stock_holds where tenant_id = $1", DEMO_TENANT_ID
    )[0]["n"] == 0


# --------------------------------------- 9. cancelling before it was made

def test_scenario_09_a_customer_who_cancels_before_it_was_made_gets_the_stock_back(client):
    muffin = counted(client, 4, name="Muffin", name_ar="مافن")
    ahmed = customer(client)
    placed = order(client, ahmed, [line(muffin, 3)]).json()
    assert on_hand(client, muffin) == 1

    result = on_shop(
        client, orders.cancel_order, UUID(placed["order_id"]), client.app.state.outbound,
        team.CUSTOMER, None, "Changed my mind",
    )
    assert (result["stock_returned"], result["refund_due"]) == (3, False)
    assert on_hand(client, muffin) == 4
    back = log_rows(client, muffin)[0]
    assert (back["kind"], back["delta"], back["reason"]) == (
        "cancelled_restocked", 3, "Changed my mind",
    )
    assert (back["actor"]["name"], back["order_number"]) == ("Customer", placed["number"])

    again = on_shop(
        client, orders.cancel_order, UUID(placed["order_id"]), client.app.state.outbound,
    )
    assert again["already"] is True and on_hand(client, muffin) == 4  # only once


def test_scenario_09_staff_cancelling_through_the_workspace_does_the_same(client):
    muffin = counted(client, 4, name="Muffin", name_ar="مافن")
    placed = order(client, customer(client), [line(muffin, 2)]).json()
    cancelled = client.post(
        f"/api/orders/{placed['order_id']}/status", json={"status": "cancelled"}
    )
    assert cancelled.json() == {
        "status": "cancelled", "stock_returned": 2, "refund_due": False, "refund_text": None,
    }
    assert on_hand(client, muffin) == 4
    # A cancelled order stays cancelled: its stock is gone, so the customer orders again.
    revive = client.post(f"/api/orders/{placed['order_id']}/status", json={"status": "confirmed"})
    assert revive.status_code == 422


def test_an_order_that_was_already_made_keeps_its_stock_sold_unless_staff_say_otherwise(client):
    muffin = counted(client, 6, name="Muffin", name_ar="مافن")
    ahmed = customer(client)
    ready = order(client, ahmed, [line(muffin, 2)]).json()
    client.post(f"/api/orders/{ready['order_id']}/status", json={"status": "ready"})
    client.post(f"/api/orders/{ready['order_id']}/status", json={"status": "cancelled"})
    assert on_hand(client, muffin) == 4  # made, so the two muffins are gone for good

    # If staff say the muffins can be sold again, they go back.
    ready = order(client, ahmed, [line(muffin, 2)]).json()
    assert on_hand(client, muffin) == 2
    client.post(f"/api/orders/{ready['order_id']}/status", json={"status": "ready"})
    client.post(
        f"/api/orders/{ready['order_id']}/status", json={"status": "cancelled", "restock": True}
    )
    assert on_hand(client, muffin) == 4


# -------------------------------------------- 10. cancelling after payment

def test_scenario_10_staff_cancelling_after_payment_says_a_refund_is_due(client):
    cake = counted(client, 2, name="Cake", name_ar="كعكة")
    placed = order(client, customer(client), [line(cake, 2)]).json()
    assert pay(client, placed).status_code == 200

    cancelled = client.post(
        f"/api/orders/{placed['order_id']}/status", json={"status": "cancelled"}
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["refund_due"] is True
    assert cancelled.json()["refund_text"] == "QAR 24"
    row = client.get("/api/orders").json()["orders"][0]
    # Cancelled, but the money was taken: the shop refunds it from its own payment account.
    assert (row["status"], row["payment"]) == ("cancelled", "paid")
    history = owner_sql(
        "select action, detail from activity where subject = 'order' and subject_id = $1 "
        "order by created_at", UUID(placed["order_id"]),
    )
    assert [h["action"] for h in history][-2:] == ["cancelled", "refund_due"]
    assert json.loads(history[-1]["detail"])["amount"] == "QAR 24"
    assert on_hand(client, cake) == 2  # it had not been made, so the stock came back too
    assert "cancelled" in conversation(client)[-1]["body"]


# ------------------------------------------ 11. on a credit account

def test_scenario_11_an_order_on_a_credit_account_gets_the_same_checks(client):
    tart = counted(client, 2, name="Fig tart", name_ar="تارت التين")
    ahmed, other = customer(client), another(client)
    assert order(client, other, [line(tart, 2)]).status_code == 200  # the last two go by link

    refused = order(client, ahmed, [line(tart)], "account")
    assert (refused.status_code, detail(refused)["code"]) == (409, "sold_out")
    assert customer(client)["balance_text"] == "QAR 1,850"  # nothing went on the account

    client.post(f"/api/items/{tart['id']}/stock", json={"kind": "received", "quantity": 3})
    too_many = order(client, ahmed, [line(tart, 5)], "account")
    assert detail(too_many)["code"] == "not_enough"
    placed = order(client, ahmed, [line(tart, 3)], "account")
    assert placed.status_code == 200
    assert customer(client)["balance_text"] == "QAR 1,886"
    # On account, the stock is sold at once: there is no hold to run out.
    assert placed.json()["hold_expires_at"] is None
    held = owner_sql(
        "select status, expires_at from stock_holds where order_id = $1",
        UUID(placed.json()["order_id"]),
    )
    assert [(h["status"], h["expires_at"]) for h in held] == [("committed", None)]


# ------------------------------------------- 12. same as last time

def test_scenario_12_same_as_last_time_orders_the_rest_and_names_the_missing_item(client):
    tart = mk(client, name="Fig tart", name_ar="تارت التين")
    pie = counted(client, 5, name="Pecan pie", name_ar="فطيرة البقان", price=1000)
    cable = product(client, "Cable 2.5 mm")
    ahmed = customer(client)
    say(client, AHMED_PHONE, "hello")  # an open window: he reads the shop's own wording
    first = order(
        client, ahmed, [line(tart), line(pie, 2), {"product_id": cable["id"], "quantity": 1}]
    )
    assert first.status_code == 200

    # Before he comes back the tart is gone, and the pie costs more.
    client.post(f"/api/items/{tart['id']}/switch", json={"available": False})
    client.put(f"/api/items/{pie['id']}", json={"price": 1500})
    again = repeat(client, ahmed)
    assert again.status_code == 200, again.text
    body = again.json()
    assert [(x["name"], x["code"]) for x in body["left_out"]] == [("Fig tart", "unavailable")]
    assert [(c["name"], c["was"], c["now"]) for c in body["price_changes"]] == [
        ("Pecan pie", 1000, 1500),
    ]
    newest = client.get("/api/orders").json()["orders"][0]
    assert sorted(i["name"] for i in newest["items"]) == ["Cable 2.5 mm, 100 m roll", "Pecan pie"]
    assert body["total"] == 2 * 1500 + 22500
    told = conversation(client)[-1]["body"]
    assert "Not included, because it is not available now: Fig tart" in told
    assert on_hand(client, pie) == 1  # 5, less 2 and 2

    # With nothing left to order, he is told so instead.
    client.post(f"/api/items/{pie['id']}/switch", json={"available": False})
    client.post(f"/api/items/{cable['id']}/switch", json={"available": False})
    nothing = repeat(client, ahmed)
    assert (nothing.status_code, detail(nothing)["code"]) == (409, "nothing_available")
    # A customer with no earlier order has nothing to repeat.
    none = repeat(client, another(client))
    assert (none.status_code, detail(none)["code"]) == (404, "no_previous_order")


# ----------------------------------------- 18. two staff, one item

def test_scenario_18_two_staff_changing_the_same_item_both_count(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()  # two apps: built before either signs in
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    item = counted(owner, 10, name="Water 1.5 L", name_ar="ماء")

    def receive(who_how):
        client, quantity = who_how
        return client.post(
            f"/api/items/{item['id']}/stock",
            json={"kind": "received", "quantity": quantity, "reason": "Delivery"},
        )

    work = [(owner, 5), (agent, 3)] * 10
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(receive, work))
    assert {r.status_code for r in results} == {200}
    assert on_hand(owner, item) == 10 + 10 * 5 + 10 * 3  # no change was lost
    who = Counter(
        (r["actor"]["name"], r["delta"]) for r in log_rows(owner, item) if r["kind"] == "received"
    )
    assert who == {("Fatima Al-Noor", 5): 10, ("Yusuf Rahman", 3): 10}  # and the log says who
    assert reconciled(owner)


def test_stock_stays_equal_to_its_log_under_a_mix_of_orders_restocks_and_cancels(client):
    item = counted(client, 6, name="Hummus", name_ar="حمص")
    buyers = people(client, 10)
    start = threading.Barrier(len(buyers) + 3)

    def buy(n_who):
        n, who = n_who
        start.wait()
        placed = order(client, who, [line(item)])
        cancelled = False
        if placed.status_code == 200 and n % 2 == 0:
            client.post(
                f"/api/orders/{placed.json()['order_id']}/status", json={"status": "cancelled"}
            )
            cancelled = True
        return placed.status_code, cancelled

    def receive(_):
        start.wait()
        return client.post(
            f"/api/items/{item['id']}/stock", json={"kind": "received", "quantity": 1}
        ).status_code

    with ThreadPoolExecutor(len(buyers) + 3) as pool:
        buying = [pool.submit(buy, pair) for pair in enumerate(buyers)]
        receiving = [pool.submit(receive, n) for n in range(3)]
        results = [f.result() for f in buying]
        received = [f.result() for f in receiving]
    assert set(received) == {200}
    kinds = Counter(r["kind"] for r in log_rows(client, item))
    # What the log holds is what really happened: one sale per order placed, one restock
    # per order cancelled, and the number is their total, never below zero.
    assert kinds["sold"] == [status for status, _ in results].count(200)
    assert kinds["cancelled_restocked"] == sum(1 for _, cancelled in results if cancelled)
    assert on_hand(client, item) == 6 + 3 + kinds["cancelled_restocked"] - kinds["sold"]
    assert on_hand(client, item) >= 0
    assert reconciled(client)


# --------------------------------------------- 19. the count disagrees

def test_scenario_19_a_stock_count_that_differs_is_recorded_with_a_reason(client):
    water = counted(client, 10, name="Water 1.5 L", name_ar="ماء")
    counted_8 = client.post(
        f"/api/items/{water['id']}/count", json={"counted": 8, "reason": "Two crates damaged"}
    )
    assert counted_8.status_code == 200
    assert counted_8.json() == {
        "kind": "counted", "balance": 8, "before": 10, "counted": 8, "difference": -2,
    }
    row = log_rows(client, water)[0]
    assert (row["kind"], row["delta"], row["balance_after"], row["reason"]) == (
        "counted", -2, 8, "Two crates damaged",
    )
    assert on_hand(client, water) == 8

    silent = client.post(f"/api/items/{water['id']}/count", json={"counted": 5})
    assert (silent.status_code, detail(silent)["code"]) == (422, "reason_needed")
    assert on_hand(client, water) == 8  # nothing changed without a reason

    same = client.post(f"/api/items/{water['id']}/count", json={"counted": 8})
    assert same.json()["difference"] == 0
    latest = log_rows(client, water)[0]  # a count that agrees is on the record too
    assert (latest["kind"], latest["delta"]) == ("counted", 0)
    assert reconciled(client)


# ------------------------------------------------- 21. duplicate names

def test_scenario_21_duplicate_item_names_are_warned_and_allowed_with_variants(client):
    body = {"name": "Abaya", "name_ar": "عباية", "price": 20000, "status": "live"}
    first = client.post("/api/items", json=body)
    assert first.json()["warnings"] == []
    second = client.post("/api/items", json={**body, "price": 25000})
    assert second.status_code == 200  # allowed
    warning = second.json()["warnings"][0]
    assert (warning["code"], warning["item_id"]) == ("duplicate_name", first.json()["id"])
    third = client.post(
        "/api/items", json={**body, "variants": [{"name": "Black"}, {"name": "Navy"}]}
    )
    assert third.status_code == 200 and third.json()["warnings"]
    assert [v["name"] for v in third.json()["item"]["variants"]] == ["Black", "Navy"]
    assert [i["name"] for i in client.get("/api/items").json()["items"]].count("Abaya") == 3
    # Renaming an item onto another's name warns too.
    other = mk(client, name="Kandura", name_ar="كندورة")
    renamed = client.put(f"/api/items/{other['id']}", json={"name": "abaya "})
    assert renamed.status_code == 200 and len(renamed.json()["warnings"]) == 3


# ------------------------------------- 22. deleting an item with history

def test_scenario_22_deleting_an_item_with_order_history_archives_it(client):
    special = mk(client, name="Old special", name_ar="خاص قديم")
    never_sold = mk(client, name="Never sold", name_ar="لم يبع")
    ahmed = customer(client)
    placed = order(client, ahmed, [line(special, 2)]).json()

    deleted = client.delete(f"/api/items/{special['id']}")
    assert deleted.json() == {"result": "archived"}
    kept = fresh(client, special)
    assert (kept["status"], kept["has_orders"]) == ("archived", True)
    row = client.get("/api/orders").json()["orders"][0]
    # The order still shows what was bought.
    assert [(i["name"], i["quantity"]) for i in row["items"]] == [("Old special", 2)]
    tracked = track_of(client, placed)
    assert tracked["items"][0]["name"] == "Old special"
    assert special["id"] not in [p["id"] for p in client.get(STORE).json()["products"]]
    assert order(client, ahmed, [line(special)]).status_code == 422  # and it cannot be ordered

    async def delete_directly():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await conn.execute("delete from items where id = $1", UUID(special["id"]))

    with pytest.raises(asyncpg.ForeignKeyViolationError):  # the database refuses too
        client.portal.call(delete_directly)

    assert client.delete(f"/api/items/{never_sold['id']}").json() == {"result": "deleted"}
    assert client.get(f"/api/items/{never_sold['id']}").status_code == 404
    assert client.delete(f"/api/items/{uuid4()}").status_code == 404


def test_an_order_keeps_a_copy_of_its_variant_and_options_as_ordered(client):
    pizza = restaurant_item(client)
    ahmed = customer(client)
    size, extras = pizza["option_groups"]
    placed = order(client, ahmed, [line(pizza, 1, option_ids=[
        size["options"][1]["id"], extras["options"][0]["id"]])]).json()
    abaya = mk(client, name="Abaya", name_ar="عباية", price=25000, stock_rule="count", variants=[
        {"name": "Black / L", "name_ar": "أسود / ك", "price_delta": 2000, "opening_stock": 2},
    ])
    bought = order(client, ahmed, [line(abaya, 1, variant_id=vid(abaya))]).json()

    # The menu changes afterwards: new names, new prices, the choices gone.
    client.put(f"/api/items/{pizza['id']}", json={"name": "Pizza Deluxe", "price": 9900,
                                                   "option_groups": []})
    client.put(f"/api/items/{abaya['id']}", json={"variants": [
        {"id": vid(abaya), "name": "Navy / L", "price_delta": 9000},
    ]})
    orders_now = {o["id"]: o for o in client.get("/api/orders").json()["orders"]}
    pizza_line = orders_now[placed["order_id"]]["items"][0]
    assert (pizza_line["name"], pizza_line["options"], pizza_line["line_text"]) == (
        "Pizza", ["Large", "Cheese"], "QAR 36",
    )
    abaya_line = orders_now[bought["order_id"]]["items"][0]
    assert (abaya_line["variant"], abaya_line["line_text"]) == ("Black / L", "QAR 270")
    tracked = track_of(client, bought)
    assert tracked["items"][0]["variant"] == "Black / L"
    saved = json.loads(owner_sql(
        "select options::text as o from order_items where order_id = $1",
        UUID(placed["order_id"]),
    )[0]["o"])
    assert [(o["group"], o["name"], o["price_delta"]) for o in saved] == [
        ("Size", "Large", 400), ("Extras", "Cheese", 200),
    ]


# ------------------------------ 27. the worker was off for hours

def test_scenario_27_a_worker_that_was_off_for_hours_catches_up_on_holds_and_reminders(client):
    brownies = counted(client, 3, name="Brownie", name_ar="براوني")
    say(client, AHMED_PHONE, "hello")
    placed = order(client, customer(client), [line(brownies, 3)]).json()
    booking = book(client).json()
    before = len(conversation(client))

    # The worker is off. Hours pass; the hold ended, and a reminder came due.
    owner_sql("update stock_holds set expires_at = now() - interval '4 hours' "
              "where status = 'held'")
    owner_sql("update jobs set run_at = now() - interval '4 hours' "
              "where kind in ('stock_hold_expiry', 'booking_reminder')")
    held_meanwhile = owner_sql(
        "select on_hand from item_variants where item_id = $1", UUID(brownies["id"])
    )
    assert held_meanwhile[0]["on_hand"] == 0  # nothing has run by itself

    drain(client)  # the worker starts and runs everything that is due
    assert on_hand(client, brownies) == 3
    said = [m["body"] for m in conversation(client)[before:]]
    assert any("was not paid within 30 minutes" in body for body in said)
    assert any(f"Reminder: booking {booking['number']}" in body for body in said)
    assert owner_sql(
        "select status from payment_requests where order_id = $1", UUID(placed["order_id"])
    )[0]["status"] == "expired"


def test_scenario_27_the_startup_sweep_catches_up_a_hold_whose_job_was_lost(client):
    item = counted(client, 2, name="Date bar", name_ar="لوح التمر")
    order(client, customer(client), [line(item, 2)])
    owner_sql("delete from jobs where kind = 'stock_hold_expiry'")  # lost
    owner_sql("update stock_holds set expires_at = now() - interval '3 hours' "
              "where status = 'held'")

    def sweep():
        return client.portal.call(
            order_holds.sweep_all, client.app.state.db, client.app.state.outbound
        )

    assert sweep() == 1
    assert on_hand(client, item) == 2
    assert sweep() == 0  # and doing it again changes nothing


# ----------------------------------------------- 29. another shop's items

NEW_TABLES = (
    "item_categories", "item_variants", "item_option_groups", "item_options", "item_schedules",
    "variant_day_stock", "item_price_history", "stock_movements", "stock_holds",
)


def a_second_shop(sign_in_with: str) -> UUID:
    shop = other_shop_with_owner(sign_in_with)
    owner_sql("update tenants set slug = $2 where id = $1", shop, f"other-{uuid4().hex[:8]}")
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'orders')", shop)
    return shop


def test_scenario_29_one_shop_cannot_read_or_change_anothers_items(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    mine, theirs = client_factory(), client_factory()
    email = f"omar-{uuid4().hex[:8]}@other.example"
    other_shop = a_second_shop(email)
    sign_in(mine)
    sign_in(theirs, email)

    # The demo shop fills every table the Catalog added.
    abaya = mk(mine, name="Abaya", name_ar="عباية", category="Wear", stock_rule="count",
               variants=[{"name": "Black", "opening_stock": 4}],
               schedule=[{"weekdays": EVERY_DAY}])
    pizza = restaurant_item(mine)
    cake = mk(mine, name="Cake", name_ar="كعكة", stock_rule="daily_limit", daily_limit=5)
    assert mine.put("/api/items/categories", json=[{"name": "Wear", "name_ar": "ملابس"}]
                    ).status_code == 200
    ahmed = customer(mine)
    assert order(mine, ahmed, [line(abaya, 1, variant_id=vid(abaya)), line(cake, 1)]
                 ).status_code == 200
    mine_only = mk(theirs, name="Their tea", name_ar="شايهم")

    # Over the API, the other shop sees none of it and can change none of it.
    assert [i["name"] for i in theirs.get("/api/items").json()["items"]] == ["Their tea"]
    assert theirs.get("/api/items").json()["categories"] == []
    for item in (abaya, pizza, cake):
        base = f"/api/items/{item['id']}"
        calls = [
            theirs.get(base), theirs.put(base, json={"price": 1}), theirs.delete(base),
            theirs.post(f"{base}/status", json={"status": "hidden"}),
            theirs.post(f"{base}/switch", json={"available": False}),
            theirs.post(f"{base}/stock", json={"kind": "received", "quantity": 5}),
            theirs.post(f"{base}/count", json={"counted": 0, "reason": "x"}),
            theirs.get(f"{base}/stock-log"), theirs.get(f"{base}/price-history"),
        ]
        assert [c.status_code for c in calls] == [404] * len(calls), item["name"]
    assert fresh(mine, abaya)["variants"][0]["on_hand"] == 3  # untouched

    # Their order page does not list it, and an order for it is refused.
    slug = owner_sql("select slug from tenants where id = $1", other_shop)[0]["slug"]
    page = theirs.get(f"/api/store/{slug}").json()
    assert [p["name"] for p in page["products"]] == ["Their tea"]
    visitor = owner_sql(
        "insert into contacts (tenant_id, phone, name) values ($1, '97455100001', 'Visitor') "
        "returning id", other_shop,
    )[0]["id"]
    refused = theirs.post(f"/api/store/{slug}/orders", json={
        "token": token(visitor, other_shop), "payment": "link",
        "items": [{"product_id": abaya["id"], "quantity": 1, "variant_id": vid(abaya)}],
    })
    assert (refused.status_code, detail(refused)["code"]) == (422, "unavailable")

    # And in the database itself, whatever the application does.
    their_item = UUID(mine_only["id"])

    async def look():
        db = Database(APP_DSN)
        await db.connect()
        try:
            counts = {}
            for table in (*NEW_TABLES, "items"):
                async with db.tenant(DEMO_TENANT_ID) as conn:
                    own = await conn.fetchval(f"select count(*) from {table}")
                async with db.tenant(other_shop) as conn:
                    foreign = await conn.fetchval(f"select count(*) from {table}")
                counts[table] = (own, foreign)
            changed = []
            for stmt in (
                "update items set name = 'hacked' where id = $1",
                "delete from items where id = $1",
                "update item_variants set on_hand = 9999 where item_id = $1",
                "delete from item_variants where item_id = $1",
                "update item_schedules set closed = true where item_id = $1",
                "delete from item_option_groups where item_id = $1",
            ):
                async with db.tenant(DEMO_TENANT_ID) as conn:
                    changed.append(await conn.execute(stmt, their_item))
            abaya_id = UUID(abaya["id"])
            for insert in (
                "insert into item_variants (tenant_id, item_id, name) values ($1, $2, 'x')",
                "insert into item_schedules (tenant_id, item_id) values ($1, $2)",
                "insert into item_price_history (tenant_id, item_id, price) values ($1, $2, 1)",
                "insert into item_categories (tenant_id, name) values ($1, 'x')",
            ):
                args = (DEMO_TENANT_ID, abaya_id)[: insert.count("$")]
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    async with db.tenant(other_shop) as conn:
                        await conn.execute(insert, *args)
            return counts, changed
        finally:
            await db.close()

    counts, changed = asyncio.run(look())
    assert all(own > 0 for own, _ in counts.values()), "every table had demo rows to protect"
    # The other shop sees only its own tea: one item, its one variant, its one price.
    assert {table: foreign for table, (_, foreign) in counts.items()} == {
        "items": 1, "item_variants": 1, "item_price_history": 1, "item_categories": 0,
        "item_option_groups": 0, "item_options": 0, "item_schedules": 0,
        "variant_day_stock": 0, "stock_movements": 0, "stock_holds": 0,
    }
    assert [c.split()[-1] for c in changed] == ["0"] * len(changed)
    # The demo shop's attempts changed nothing.
    assert fresh(theirs, mine_only)["name"] == "Their tea"


def test_every_table_the_catalog_added_has_forced_row_level_security(client):
    rows = owner_sql(
        "select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced, "
        "exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy, "
        "exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' "
        "        and not a.attisdropped) as has_tenant "
        "from pg_class c where c.relname = any($1) and c.relkind = 'r'",
        [*NEW_TABLES, "items"],
    )
    assert sorted(r["name"] for r in rows) == sorted([*NEW_TABLES, "items"])
    assert all(r["enabled"] and r["forced"] and r["has_policy"] and r["has_tenant"] for r in rows)


def test_the_number_never_goes_below_zero_and_a_drift_from_the_log_is_caught(client):
    """The stock check the other tests lean on (`reconciled`) really does notice a number
    that no longer matches its log, and the database refuses a number below zero."""
    item = counted(client, 5)
    assert reconciled(client)

    async def run(sql):
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await conn.execute(sql, UUID(vid(item)))

    client.portal.call(run, "update item_variants set on_hand = 50 where id = $1")
    assert on_shop(client, stock.mismatches) != []
    with pytest.raises(asyncpg.CheckViolationError):
        client.portal.call(run, "update item_variants set on_hand = -1 where id = $1")
