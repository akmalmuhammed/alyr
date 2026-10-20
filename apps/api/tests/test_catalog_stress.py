"""The Catalog's one promise, tried again and again (ALY-110, D-039): stock never goes
negative, never oversells, and the stock log always adds up to the number on the shelf.

Each round makes two counted items and sends a dozen things at them at once from as many
threads: customers ordering (by link and on account), paying, cancelling, staff receiving,
wasting and counting, and the worker giving back holds that have run out. Then every item in
the shop is checked against what the log says happened (the same rule as
`modules/items/stock.py` `mismatches()`, and more). The rounds are marked `stress` so a quick
local run can leave them out (`-m "not stress"`); CI runs the default 50 of them, and a
longer soak is `ALYR_STRESS_ROUNDS=500`.
"""

import os
import random
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from alyr.modules.orders import holds as order_holds
from alyr.seed import DEMO_TENANT_ID
from concurrency import LockWatch, warm
from test_consent import owner_sql
from test_items import counted, line, order, pay, people, reconciled

ROUNDS = int(os.environ.get("ALYR_STRESS_ROUNDS", "50"))
ACTIONS = ("buy", "buy_pay", "buy_cancel", "buy_cancel_twice", "buy_account", "receive", "waste",
           "count", "sweep")
WEIGHTS = (6, 3, 3, 2, 1, 2, 1, 1, 2)


def after_every_round(client, round_number: int) -> None:
    """Everything the shop's stock says, against what its log says."""
    assert reconciled(client), f"round {round_number}: a number on the shelf is not its log"
    negative = owner_sql(
        "select count(*) as n from item_variants where tenant_id = $1 and on_hand < 0",
        DEMO_TENANT_ID,
    )
    assert negative[0]["n"] == 0, f"round {round_number}: stock below zero"
    for v in owner_sql(
        "select v.on_hand, "
        " coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id "
        "           where oi.variant_id = v.id and o.status <> 'cancelled'), 0)::int as live, "
        " coalesce((select sum(m.delta) from stock_movements m where m.variant_id = v.id "
        "  and m.kind in ('opening', 'received', 'wasted', 'counted', 'adjusted')), 0)::int as added, "
        " coalesce((select -sum(m.delta) from stock_movements m where m.variant_id = v.id "
        "  and m.kind in ('sold', 'cancelled_restocked')), 0)::int as taken "
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
    paid_twice = owner_sql(
        "select count(*) as n from (select order_id from payment_requests where tenant_id = $1 "
        "and status = 'paid' and order_id is not null group by order_id having count(*) > 1) x",
        DEMO_TENANT_ID,
    )
    assert paid_twice[0]["n"] == 0, f"round {round_number}: an order paid twice"
    totals = owner_sql(
        "select count(*) as n from orders o where o.tenant_id = $1 and o.total <> "
        "(select sum(price * quantity) from order_items where order_id = o.id)", DEMO_TENANT_ID,
    )
    assert totals[0]["n"] == 0, f"round {round_number}: an order that does not add up"


def give_back_what_ran_out(client) -> None:
    """The worker's sweep: every hold that has run out is given back."""
    owner_sql(
        "update stock_holds set expires_at = now() - interval '1 hour' "
        "where status = 'held' and tenant_id = $1", DEMO_TENANT_ID,
    )
    client.portal.call(
        order_holds.expire_shop, client.app.state.db, client.app.state.outbound, DEMO_TENANT_ID
    )


def one_round(client, rng, buyers, n: int) -> int:
    """Two items and a dozen things at once. Returns how many of them were sweeps."""
    items = [
        counted(client, rng.randint(1, 5), name=f"Stress {n}-{k}", name_ar="اختبار")
        for k in range(2)
    ]
    plan = rng.choices(ACTIONS, WEIGHTS, k=rng.randint(9, 13))
    start = threading.Barrier(len(plan))

    def act(step, kind):
        start.wait()
        item = items[step % 2]
        who = buyers[step % len(buyers)]
        qty = 1 + step % 3
        if kind.startswith("buy"):
            lines = [line(item, qty)]
            if step % 4 == 0:
                lines.append(line(items[(step + 1) % 2], 1))  # two lines, in either order
            on_account = kind in ("buy_account", "buy_cancel_twice")
            placed = order(client, who, lines, "account" if on_account else "link")
            assert placed.status_code in (200, 409), (n, kind, placed.text)
            if placed.status_code == 200 and kind == "buy_pay":
                paid = pay(client, placed.json())
                assert paid.status_code in (200, 409), (n, kind, paid.text)
            if placed.status_code == 200 and kind.startswith("buy_cancel"):
                url = f"/api/orders/{placed.json()['order_id']}/status"
                # Two people cancel the same order together, or one person alone.
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
            "receive": {"kind": "received", "quantity": 1 + step % 4, "reason": "Delivery"},
            "waste": {"kind": "wasted", "quantity": 1, "reason": "Dropped"},
        }.get(kind)
        if body is not None:
            done = client.post(f"/api/items/{item['id']}/stock", json=body)
        else:
            done = client.post(
                f"/api/items/{item['id']}/count",
                json={"counted": step % 6, "reason": "Counted the shelf"},
            )
        assert done.status_code < 500, (n, kind, done.text)

    with ThreadPoolExecutor(len(plan)) as pool:
        list(pool.map(lambda pair: act(*pair), enumerate(plan)))
    return plan.count("sweep")


@pytest.mark.stress
def test_stock_never_goes_negative_never_oversells_and_always_matches_its_log(client):
    rng = random.Random(110)
    buyers = people(client, 10)
    sweeps = 0
    warm(client)
    with LockWatch("item_variants") as watch:
        for n in range(ROUNDS):
            sweeps += one_round(client, rng, buyers, n)
            after_every_round(client, n)
    # A last sweep and look: nothing was left held, and the shop still adds up.
    give_back_what_ran_out(client)
    after_every_round(client, ROUNDS)
    assert sweeps > 0 or ROUNDS < 10  # the worker's sweep was part of the mix
    # The rounds really were concurrent: sessions waited on each other's rows.
    assert watch.blocked >= 1, f"no two requests ever met in the database: {watch}"
