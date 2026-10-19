"""The 50-round stress test of the Catalog (test_catalog_stress.py), again with weights (ALY-149):
the same promise for stock held in quarters of a kilo. Stock never goes negative, never oversells
and always matches its log, to the gram, whatever mix of customers, payments, cancels, staff and
sweeps arrives at once.

The whole-number test next door is untouched and still runs, so "existing integer behaviour is
identical" is shown by that test passing as it was; this one shows the same engine holds for
fractions.
"""

import os
import random
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from alyr.seed import DEMO_TENANT_ID
from concurrency import LockWatch, warm
from test_catalog_stress import ACTIONS, WEIGHTS, give_back_what_ran_out
from test_consent import owner_sql
from test_features_api import switch
from test_items import counted, line, order, pay, people, reconciled

ROUNDS = int(os.environ.get("ALYR_DECIMAL_STRESS_ROUNDS", "25"))
QUARTERS = ("0.25", "0.5", "0.75", "1", "1.25", "1.5")


def after_every_round(client, round_number: int) -> None:
    """Everything the shop's stock says, against what its log says, in exact decimals."""
    assert reconciled(client), f"round {round_number}: a number on the shelf is not its log"
    negative = owner_sql(
        "select count(*) as n from item_variants where tenant_id = $1 and on_hand < 0",
        DEMO_TENANT_ID,
    )
    assert negative[0]["n"] == 0, f"round {round_number}: stock below zero"
    for v in owner_sql(
        "select v.on_hand, "
        " coalesce((select sum(oi.quantity) from order_items oi "
        "           join orders o on o.id = oi.order_id "
        "           where oi.variant_id = v.id and o.status <> 'cancelled'), 0) as live, "
        " coalesce((select sum(m.delta) from stock_movements m where m.variant_id = v.id "
        "  and m.kind in ('opening', 'received', 'wasted', 'counted', 'adjusted')), 0) as added, "
        " coalesce((select -sum(m.delta) from stock_movements m where m.variant_id = v.id "
        "  and m.kind in ('sold', 'cancelled_restocked')), 0) as taken "
        "from item_variants v where v.tenant_id = $1", DEMO_TENANT_ID,
    ):
        assert v["live"] == v["taken"], f"round {round_number}: {dict(v)}"  # what is sold is held
        assert v["live"] <= v["added"], f"round {round_number}: oversold {dict(v)}"
        assert v["on_hand"] == v["added"] - v["live"], f"round {round_number}: {dict(v)}"
    holds = owner_sql(
        "select count(*) as n from stock_holds h join orders o on o.id = h.order_id "
        "where h.tenant_id = $1 and ((o.status = 'cancelled' and h.status <> 'released') "
        "or (o.status <> 'cancelled' and h.status = 'released'))", DEMO_TENANT_ID,
    )
    assert holds[0]["n"] == 0, f"round {round_number}: a hold that does not match its order"
    totals = owner_sql(
        "select count(*) as n from orders o where o.tenant_id = $1 and o.total <> "
        "(select sum(round(price * quantity)) from order_items where order_id = o.id)",
        DEMO_TENANT_ID,
    )
    assert totals[0]["n"] == 0, f"round {round_number}: an order that is not the sum of its lines"
    fractions = owner_sql(
        "select count(*) as n from item_variants where tenant_id = $1 and "
        "on_hand * 4 <> trunc(on_hand * 4)", DEMO_TENANT_ID,
    )
    assert fractions[0]["n"] == 0, f"round {round_number}: stock that is not in whole quarters"


def one_round(client, rng, buyers, n: int) -> int:
    items = [
        counted(client, rng.choice(QUARTERS), name=f"Stress {n}-{k}", name_ar="اختبار",
                unit="kg", pack_size="0.25", min_order="0.25", price=1850 + 7 * k)
        for k in range(2)
    ]
    plan = rng.choices(ACTIONS, WEIGHTS, k=rng.randint(9, 13))
    start = threading.Barrier(len(plan))

    def act(step, kind):
        start.wait()
        item = items[step % 2]
        who = buyers[step % len(buyers)]
        amount = QUARTERS[step % len(QUARTERS)]
        if kind.startswith("buy"):
            lines = [line(item, amount)]
            if step % 4 == 0:
                lines.append(line(items[(step + 1) % 2], "0.25"))
            on_account = kind in ("buy_account", "buy_cancel_twice")
            placed = order(client, who, lines, "account" if on_account else "link")
            assert placed.status_code in (200, 409), (n, kind, placed.text)
            if placed.status_code == 200 and kind == "buy_pay":
                paid = pay(client, placed.json())
                assert paid.status_code in (200, 409), (n, kind, paid.text)
            if placed.status_code == 200 and kind.startswith("buy_cancel"):
                url = f"/api/orders/{placed.json()['order_id']}/status"
                presses = 2 if kind == "buy_cancel_twice" else 1
                with ThreadPoolExecutor(presses) as pair:
                    answers = list(pair.map(
                        lambda _: client.post(url, json={"status": "cancelled"}), range(presses)
                    ))
                assert [a.status_code for a in answers] == [200] * presses, (n, kind)
            return
        if kind == "sweep":
            give_back_what_ran_out(client)
            return
        body = {
            "receive": {"kind": "received", "quantity": QUARTERS[step % 4], "reason": "Delivery"},
            "waste": {"kind": "wasted", "quantity": "0.25", "reason": "Dropped"},
        }.get(kind)
        if body is not None:
            done = client.post(f"/api/items/{item['id']}/stock", json=body)
        else:
            done = client.post(
                f"/api/items/{item['id']}/count",
                json={"counted": QUARTERS[step % 6], "reason": "Counted the shelf"},
            )
        assert done.status_code < 500, (n, kind, done.text)

    with ThreadPoolExecutor(len(plan)) as pool:
        list(pool.map(lambda pair: act(*pair), enumerate(plan)))
    return plan.count("sweep")


@pytest.mark.stress
def test_stock_in_quarters_of_a_kilo_never_goes_negative_or_oversells_and_matches_its_log(client):
    assert switch(client, "decimal_quantity", True).status_code == 200
    rng = random.Random(149)
    buyers = people(client, 10)
    sweeps = 0
    warm(client)
    with LockWatch("item_variants") as watch:
        for n in range(ROUNDS):
            sweeps += one_round(client, rng, buyers, n)
            after_every_round(client, n)
    give_back_what_ran_out(client)
    after_every_round(client, ROUNDS)
    assert sweeps > 0 or ROUNDS < 10
    assert watch.blocked >= 1, f"no two requests ever met in the database: {watch}"
