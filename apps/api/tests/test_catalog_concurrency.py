"""The Catalog's races, proved to be races (ALY-110, D-039 scenarios 1, 8, 18 and the double
click on "pay").

The older tests of these scenarios (test_catalog_scenarios.py, test_catalog_edges.py) start
their threads together and check who won. That would also pass if the second request only
started after the first had finished. Here each race is made certain: the step that must be
protected is held open inside its transaction (`concurrency.hold_open`), and a watcher on
another database connection (`concurrency.LockWatch`) has to see one session waiting for
another. Remove the protection (a conditional update, a row lock, the "only if still pending"
guard) and these fail; the mutation checks in specs/009-catalog-scenarios/spec.md say which
breakage was used on which test.
"""

import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from alyr.modules.items import holds as stock_holds
from alyr.modules.items import stock
from alyr.modules.orders import holds as order_holds
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from concurrency import LockWatch, hold_open, warm
from test_consent import owner_sql
from test_items import (
    counted,
    detail,
    drain,
    line,
    log_rows,
    on_hand,
    order,
    pay,
    people,
    reconciled,
)
from test_orders import customer
from test_sign_in import sign_in


def sweep(client) -> int:
    """The worker's look for holds that have run out, in the app's own event loop."""
    return client.portal.call(
        order_holds.expire_shop, client.app.state.db, client.app.state.outbound, DEMO_TENANT_ID
    )


def rewind(order_id: str) -> None:
    """The hold of one order has run out."""
    owner_sql(
        "update stock_holds set expires_at = now() - interval '1 hour' "
        "where order_id = $1 and status = 'held'", UUID(order_id),
    )


def state(order_id: str) -> dict:
    """What became of one order: its status, payment, holds and payment links."""
    [row] = owner_sql(
        "select o.status, o.payment, "
        "(select array_agg(distinct h.status) from stock_holds h where h.order_id = o.id) as holds, "
        "(select array_agg(p.status order by p.created_at) from payment_requests p "
        " where p.order_id = o.id) as requests from orders o where o.id = $1", UUID(order_id),
    )
    return dict(row)


# ------------------------------------------------ 1. the last item, at the same moment

def test_scenario_01_the_two_requests_really_meet_in_the_database(client, monkeypatch):
    """Both customers are in the checkout at once: the second waits on the first's row, then
    finds nothing left. `watch.blocked` is the proof that it waited."""
    last = counted(client, 1, name="Last tiramisu", name_ar="تيراميسو")
    warm(client)
    first, second = people(client)
    hold_open(monkeypatch, stock, "move", 0.4)  # whoever takes the item keeps its row a while
    start = threading.Barrier(2)

    def buy(who):
        start.wait()
        return order(client, who, [line(last)])

    with LockWatch("item_variants") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(buy, (first, second)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert watch.blocked >= 1, f"the two requests never met in the database: {watch}"
    refusal = detail(next(r for r in results if r.status_code == 409))
    assert (refusal["code"], refusal["lines"][0]["left"]) == ("sold_out", 0)
    assert on_hand(client, last) == 0
    assert [r["kind"] for r in log_rows(client, last)].count("sold") == 1
    assert reconciled(client)


def test_scenario_01_eight_at_once_for_three_never_sell_more_than_three(client, monkeypatch):
    item = counted(client, 3, name="Pistachio tart", name_ar="تارت الفستق")
    warm(client)
    buyers = people(client, 8)
    hold_open(monkeypatch, stock, "move", 0.15)
    start = threading.Barrier(len(buyers))

    def buy(who):
        start.wait()
        return order(client, who, [line(item)])

    with LockWatch("item_variants") as watch, ThreadPoolExecutor(len(buyers)) as pool:
        results = list(pool.map(buy, buyers))
    assert sorted(r.status_code for r in results) == [200] * 3 + [409] * 5
    assert watch.blocked >= 2, f"too few of them waited: {watch}"
    assert on_hand(client, item) == 0 and reconciled(client)


# -------------------------------------------- 18. two staff, the same item, at once

def test_scenario_18_two_staff_counting_the_same_shelf_at_once_both_counts_are_kept(
    client_factory, monkeypatch
):
    """The owner counts 8 and an agent counts 12 at the same moment. Whichever gets the row
    first is recorded against the system's number; the other is recorded against the first's.
    Without the row lock both would read 10 and the shelf would end at neither count."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    item = counted(owner, 10, name="Water 1.5 L", name_ar="ماء")
    hold_open(monkeypatch, stock, "move", 0.4)
    start = threading.Barrier(2)

    def count(who_how):
        client, number, why = who_how
        start.wait()
        return client.post(f"/api/items/{item['id']}/count", json={"counted": number, "reason": why})

    work = [(owner, 8, "Two crates damaged"), (agent, 12, "A crate was in the back")]
    with LockWatch("item_variants") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(count, work))
    assert [r.status_code for r in results] == [200, 200]
    assert watch.blocked >= 1, f"the two counts never met in the database: {watch}"
    rows = [r for r in reversed(log_rows(owner, item)) if r["kind"] == "counted"]
    assert len(rows) == 2
    counts = {8, 12}
    first, second = rows
    first_count = first["balance_after"]
    second_count = second["balance_after"]
    assert {first_count, second_count} == counts  # both numbers are in the log
    assert first["delta"] == first_count - 10  # the first is measured against the system's
    assert second["delta"] == second_count - first_count  # the second against the first's
    assert on_hand(owner, item) == second_count  # the shelf ends at the later count
    assert reconciled(owner)


def test_scenario_18_two_staff_receiving_stock_at_once_both_deliveries_count(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    item = counted(owner, 10, name="Dates 1 kg", name_ar="تمر")
    hold_open(monkeypatch, stock, "move", 0.25)
    start = threading.Barrier(2)

    def receive(who_how):
        client, quantity = who_how
        start.wait()
        return client.post(
            f"/api/items/{item['id']}/stock", json={"kind": "received", "quantity": quantity}
        )

    with LockWatch("item_variants") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(receive, [(owner, 5), (agent, 3)]))
    assert [r.status_code for r in results] == [200, 200]
    assert watch.blocked >= 1, f"the two deliveries never met in the database: {watch}"
    assert on_hand(owner, item) == 18 and reconciled(owner)
    balances = [r["balance_after"] for r in reversed(log_rows(owner, item))]
    assert balances[0] == 10 and balances[-1] == 18  # each row built on the one before


# ------------------------------------- 8. the hold runs out as the customer pays

def test_scenario_08_the_customer_pays_as_the_hold_runs_out_and_payment_wins(
    client, monkeypatch
):
    """The payment has the link's row; the sweep that is about to give the stock back has to
    wait, finds the link paid, and leaves the order alone."""
    item = counted(client, 1, name="Cheesecake", name_ar="تشيز كيك")
    warm(client)
    placed = order(client, people(client)[0], [line(item)]).json()
    rewind(placed["order_id"])
    entered = hold_open(monkeypatch, stock_holds, "commit", 0.5)  # the payment keeps the link
    outcome = {}

    def paying():
        outcome["pay"] = pay(client, placed)

    with LockWatch("payment_requests") as watch:
        payer = threading.Thread(target=paying)
        payer.start()
        assert entered.wait(10)  # the payment has the link
        cancelled = sweep(client)
        payer.join()
    assert outcome["pay"].status_code == 200 and outcome["pay"].json() == {"status": "paid"}
    assert cancelled == 0
    assert watch.blocked >= 1, f"the sweep never waited for the payment: {watch}"
    got = state(placed["order_id"])
    assert (got["status"], got["payment"], got["holds"], got["requests"]) == (
        "new", "paid", ["committed"], ["paid"],
    )
    assert on_hand(client, item) == 0  # sold, not given back
    assert [r["kind"] for r in log_rows(client, item)].count("cancelled_restocked") == 0
    assert reconciled(client)


def test_scenario_08_the_hold_runs_out_as_the_customer_pays_and_the_release_wins(
    client, monkeypatch
):
    """The sweep has the link first: the payment waits, then is told the link has expired.
    The stock goes back once, and nothing is both paid and given back."""
    item = counted(client, 1, name="Cheesecake", name_ar="تشيز كيك")
    warm(client)
    placed = order(client, people(client)[0], [line(item)]).json()
    rewind(placed["order_id"])
    entered = hold_open(monkeypatch, stock_holds, "release", 0.5)  # the release keeps the link
    outcome = {}

    def sweeping():
        outcome["cancelled"] = sweep(client)

    with LockWatch("payment_requests") as watch:
        sweeper = threading.Thread(target=sweeping)
        sweeper.start()
        assert entered.wait(10)  # the sweep has the link
        late = pay(client, placed)
        sweeper.join()
    assert (late.status_code, detail(late)["code"]) == (409, "expired")
    assert outcome["cancelled"] == 1
    assert watch.blocked >= 1, f"the payment never waited for the release: {watch}"
    got = state(placed["order_id"])
    assert (got["status"], got["payment"], got["holds"], got["requests"]) == (
        "cancelled", "unpaid", ["released"], ["expired"],
    )
    assert on_hand(client, item) == 1  # back on the shelf, once
    kinds = [r["kind"] for r in log_rows(client, item)]
    assert kinds.count("cancelled_restocked") == 1 and kinds.count("sold") == 1
    assert reconciled(client)


def test_scenario_08_payment_and_expiry_in_any_order_end_one_way_only(client):
    """Fifteen rounds of the same race with no help: payment and the sweep start within a few
    milliseconds of each other, in either order. Every round ends as exactly one of "paid and
    kept" or "expired and given back", never both and never neither."""
    rng = random.Random(8)
    warm(client)
    kept = given_back = 0
    for n in range(15):
        item = counted(client, 1, name=f"Tart {n}", name_ar="تارت")
        placed = order(client, people(client)[0], [line(item)]).json()
        rewind(placed["order_id"])
        start = threading.Barrier(2)
        delays = [rng.uniform(0, 0.03), rng.uniform(0, 0.03)]

        def paying(d=delays[0], start=start, placed=placed):
            start.wait()
            time.sleep(d)
            return pay(client, placed)

        def sweeping(d=delays[1], start=start):
            start.wait()
            time.sleep(d)
            return sweep(client)

        with ThreadPoolExecutor(2) as pool:
            paid_answer, swept = pool.submit(paying), pool.submit(sweeping)
            late, cancelled = paid_answer.result(), swept.result()
        got = state(placed["order_id"])
        if late.status_code == 200:  # the payment got there first
            assert cancelled == 0, n
            assert (got["status"], got["payment"], got["holds"]) == ("new", "paid", ["committed"])
            assert on_hand(client, item) == 0
            kept += 1
        else:  # the hold was given back first
            assert (late.status_code, detail(late)["code"], cancelled) == (409, "expired", 1), n
            assert (got["status"], got["payment"], got["holds"]) == (
                "cancelled", "unpaid", ["released"],
            )
            assert on_hand(client, item) == 1
            given_back += 1
        assert reconciled(client), n
    assert kept + given_back == 15


# ----------------------------------- 9. two people cancel the same order at once

def test_scenario_09_two_people_cancelling_one_order_at_once_give_the_stock_back_once(
    client, monkeypatch
):
    """The customer and a colleague both press cancel on an order that is on the customer's
    credit account (it has no payment link to queue behind). The second waits for the first's
    hold on the order's row, finds it cancelled and gives nothing back: the shelf gets the 2
    units once, not twice, and the sale comes off the account once."""
    item = counted(client, 3, name="Muffin", name_ar="مافن")
    warm(client)
    made = order(client, customer(client), [line(item, 2)], "account")
    assert made.status_code == 200, made.text
    placed = made.json()
    assert on_hand(client, item) == 1
    hold_open(monkeypatch, stock_holds, "release", 0.4)
    start = threading.Barrier(2)

    def cancel(_):
        start.wait()
        return client.post(
            f"/api/orders/{placed['order_id']}/status", json={"status": "cancelled"}
        )

    with LockWatch("orders") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(cancel, range(2)))
    assert [r.status_code for r in results] == [200, 200]
    assert watch.blocked >= 1, f"the two cancels never met in the database: {watch}"
    assert on_hand(client, item) == 3  # given back once
    assert [r["kind"] for r in log_rows(client, item)].count("cancelled_restocked") == 1
    assert state(placed["order_id"])["holds"] == ["released"]
    reversals = owner_sql(
        "select count(*) as n from ledger_entries where tenant_id = $1 and order_id = $2 "
        "and kind = 'reversal'", DEMO_TENANT_ID, UUID(placed["order_id"]),
    )
    assert reversals[0]["n"] == 1
    assert reconciled(client)


# ------------------------------------------------------ the double click on "pay"

def test_a_double_click_on_pay_takes_one_payment_and_sends_one_receipt(client, monkeypatch):
    """Two requests for the same payment link, together. The second waits for the first's
    row, finds the link paid and changes nothing: one payment, one notice, the stock sold
    once and kept."""
    item = counted(client, 2, name="Samosa tray", name_ar="صينية سمبوسة")
    warm(client)
    who = people(client)[0]
    placed = order(client, who, [line(item, 2)]).json()
    hold_open(monkeypatch, stock_holds, "commit", 0.4)
    start = threading.Barrier(2)

    def click(_):
        start.wait()
        return pay(client, placed)

    with LockWatch("payment_requests") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(click, range(2)))
    assert [(r.status_code, r.json()) for r in results] == [(200, {"status": "paid"})] * 2
    assert watch.blocked >= 1, f"the two clicks never met in the database: {watch}"
    got = state(placed["order_id"])
    assert (got["status"], got["payment"], got["holds"], got["requests"]) == (
        "new", "paid", ["committed"], ["paid"],
    )
    receipts = owner_sql(
        "select count(*) as n from messages where tenant_id = $1 and contact_id = $2 "
        "and payload->>'template' = 'payment_received_order'", DEMO_TENANT_ID, UUID(who["id"]),
    )
    assert receipts[0]["n"] == 1  # one "received" message, not two
    paid = owner_sql(
        "select count(*) as n from activity where tenant_id = $1 and subject_id = $2 "
        "and action = 'paid'", DEMO_TENANT_ID, UUID(placed["order_id"]),
    )
    assert paid[0]["n"] == 1  # and one entry on the record
    assert on_hand(client, item) == 0
    assert [r["kind"] for r in log_rows(client, item)] == ["sold", "opening"]
    assert reconciled(client)


def test_clicking_pay_again_after_the_sweep_gave_the_stock_back_is_still_refused(client):
    item = counted(client, 1, name="Cheesecake", name_ar="تشيز كيك")
    warm(client)
    placed = order(client, people(client)[0], [line(item)]).json()
    rewind(placed["order_id"])
    drain(client)
    sweep(client)
    for _ in range(2):  # a second click gets the same answer as the first
        late = pay(client, placed)
        assert (late.status_code, detail(late)["code"]) == (409, "expired")
    assert on_hand(client, item) == 1 and reconciled(client)
    assert [r["kind"] for r in log_rows(client, item)].count("cancelled_restocked") == 1
