"""The owner's test order (ALY-168, D-064, spec 028).

On the private test line the owner orders as `TEST.<user>`, through the real chat and the real
order page. The order is real for them (the page, the stock it takes, the list, the message
when it is ready) and nothing else: it is marked, it is counted nowhere, it gets no document,
no money moves, and when the test is over it is cancelled and its stock is back."""

import ast
import dataclasses
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

from alyr.core.auth import Staff
from alyr.modules import report
from alyr.modules.agent import facts as agent_facts
from test_consent import owner_sql
from test_onboarding import BASE, new_business

SRC = Path(__file__).resolve().parent.parent / "src" / "alyr"


def shop_with_stock(client, stock=10):
    """A new shop with one item on sale and `stock` of it counted."""
    tenant, slug, name = new_business(client, kind="shop")
    made = client.post("/api/items", json={
        "name": "Tea tin", "name_ar": "علبة شاي", "price": 1200, "status": "live",
        "stock_rule": "count", "opening_stock": stock,
    })
    assert made.status_code in (200, 201), made.text
    return tenant, slug, made.json()["id"]


def stock_left(client, item_id):
    item = client.get(f"/api/items/{item_id}").json()
    return item["variants"][0]["on_hand"]


def order_from_test_line(client, slug, quantity=2):
    """What the owner does in /start: say "menu" on the test line, open the link, order."""
    answer = client.post(f"{BASE}/test-chat", json={"text": "menu"}).json()
    link = answer["messages"][-1]["body"]
    assert f"/s/{slug}?t=" in link
    token = link.split("?t=")[1].split()[0]
    page = client.get(f"/api/store/{slug}", headers={"x-order-link": token}).json()
    assert page["customer"] is not None and page["link"]["state"] == "ok"
    tea = next(p for p in page["products"] if p["name"] == "Tea tin")
    return client.post(f"/api/store/{slug}/orders", json={
        "token": token, "items": [{"product_id": tea["id"], "quantity": quantity}],
        "payment": "link",
    })


def orders_of(client):
    return client.get("/api/orders").json()["orders"]


# ------------------------------------------------------------------------ what it is

def test_an_order_from_the_test_line_is_marked_test_and_pays_on_collection(client):
    tenant, slug, item = shop_with_stock(client)
    placed = order_from_test_line(client, slug)
    assert placed.status_code == 200, placed.text
    [order] = orders_of(client)
    assert order["test"] is True and order["status"] == "new"
    # The page asked for "link"; a test order moves no money, so it is pay on collection.
    assert order["payment"] == "unpaid"
    assert owner_sql(
        "select count(*)::int as n from payment_requests where tenant_id = $1", tenant
    )[0]["n"] == 0
    marked = owner_sql("select is_test from orders where tenant_id = $1", tenant)
    assert [r["is_test"] for r in marked] == [True]


def test_a_test_order_takes_stock_like_any_order(client):
    _, slug, item = shop_with_stock(client, stock=10)
    assert order_from_test_line(client, slug, quantity=3).status_code == 200
    assert stock_left(client, item) == 7


def test_the_owner_marks_it_ready_and_sees_the_customers_message(client):
    _, slug, _ = shop_with_stock(client)
    order_from_test_line(client, slug)
    [order] = orders_of(client)
    ready = client.post(f"/api/orders/{order['id']}/status", json={"status": "ready"})
    assert ready.status_code == 200, ready.text
    last = client.get(f"{BASE}/test-chat").json()["messages"][-1]
    assert f"Order #{order['number']} is ready" in last["body"]


# -------------------------------------------------------------- it is counted nowhere

def read_all(client, tenant, now):
    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            staff = Staff(None, "Owner", "", "owner", tenant)
            gathered = await agent_facts.gather(conn, staff, now)
            built = await report.build(conn, gathered.week_start)
            return gathered, built

    return client.portal.call(go)


def test_a_test_order_is_counted_nowhere_the_owner_reads(client):
    tenant, slug, _ = shop_with_stock(client)
    now = datetime.now(UTC) + timedelta(hours=1)
    before, report_before = read_all(client, tenant, now)

    assert order_from_test_line(client, slug).status_code == 200
    after, report_after = read_all(client, tenant, now)

    # The Agent: not an order, not a sale, not "waiting for you to confirm it".
    assert (after.orders, after.sales, after.unconfirmed) == (0, 0, [])
    mine, theirs = dataclasses.asdict(before), dataclasses.asdict(after)
    # Everything the Agent reads is as it was. The one exception is what is true while the
    # test chat is open: it is one open conversation, until the owner finishes (below).
    differs = [name for name in mine if mine[name] != theirs[name] and name != "team"]
    assert differs == [], differs
    for key in ("sales", "sold", "orders"):
        assert mine["team"]["totals"].get(key) == theirs["team"]["totals"].get(key), key
    assert [(p["sales"], p["orders"]) for p in mine["team"]["people"]] == [
        (p["sales"], p["orders"]) for p in theirs["team"]["people"]
    ]
    # The weekly result report reads the same.
    assert report_before == report_after
    # The home cards: nothing "today" for the shop.
    cards = {c["key"]: c["value"] for c in client.get("/api/workspace/home").json()["cards"]}
    assert cards.get("orders_today", 0) == 0
    # When the owner has finished the test, it is as if it never happened.
    assert client.post(f"{BASE}/finish").json()["test_orders_cancelled"] == 1
    finished, report_finished = read_all(client, tenant, now)
    final = dataclasses.asdict(finished)
    # (`started` moves: finishing is what marks the business as set up.)
    assert [k for k in mine if final[k] != mine[k] and k != "started"] == []
    assert report_finished == report_before


# --------------------------------------------------------------- the end of the test

def test_finishing_cancels_the_test_order_and_gives_its_stock_back(client):
    tenant, slug, item = shop_with_stock(client, stock=10)
    order_from_test_line(client, slug, quantity=4)
    assert stock_left(client, item) == 6
    messages_before = client.get(f"{BASE}/test-chat").json()["messages"]

    done = client.post(f"{BASE}/finish").json()
    assert done == {"finished": True, "test_bookings_cancelled": 0, "test_orders_cancelled": 1}
    assert stock_left(client, item) == 10
    [order] = orders_of(client)
    assert order["status"] == "cancelled" and order["test"] is True
    # Nobody is told: the test chat has nothing new, and no refund alert was raised.
    assert client.get(f"{BASE}/test-chat").json()["messages"] == messages_before
    assert owner_sql(
        "select count(*)::int as n from activity where tenant_id = $1 and action = 'refund_due'",
        tenant,
    )[0]["n"] == 0


def test_a_test_order_the_owner_marked_ready_still_gives_its_stock_back(client):
    _, slug, item = shop_with_stock(client, stock=10)
    order_from_test_line(client, slug, quantity=2)
    [order] = orders_of(client)
    client.post(f"/api/orders/{order['id']}/status", json={"status": "ready"})
    assert stock_left(client, item) == 8
    assert client.post(f"{BASE}/finish").json()["test_orders_cancelled"] == 1
    assert stock_left(client, item) == 10


def test_finishing_again_cancels_nothing_twice(client):
    _, slug, item = shop_with_stock(client, stock=10)
    order_from_test_line(client, slug)
    assert client.post(f"{BASE}/finish").json()["test_orders_cancelled"] == 1
    assert client.post(f"{BASE}/finish").json()["test_orders_cancelled"] == 0
    assert stock_left(client, item) == 10


def test_a_real_customers_order_is_never_cancelled_by_the_end_of_the_test(client):
    """Only the owner's own test customer's orders are touched."""
    tenant, slug, item = shop_with_stock(client, stock=10)
    order_from_test_line(client, slug, quantity=1)
    [test_order] = orders_of(client)
    # A real customer's order in the same shop, made in the database as another contact.
    owner_sql(
        "insert into contacts (tenant_id, wa_user_id, name, role) values ($1, '97455500777', "
        "'Real Customer', 'customer')", tenant,
    )
    real = owner_sql("select id from contacts where wa_user_id = '97455500777'")[0]["id"]
    owner_sql(
        "insert into orders (tenant_id, contact_id, number, total) values ($1, $2, 2001, 500)",
        tenant, real,
    )
    assert owner_sql("select is_test from orders where number = 2001")[0]["is_test"] is False
    assert client.post(f"{BASE}/finish").json()["test_orders_cancelled"] == 1
    statuses = {o["number"]: o["status"] for o in orders_of(client)}
    assert statuses[2001] == "new" and statuses[test_order["number"]] == "cancelled"


# ------------------------------------------------- no documents, no money, no refund

def test_a_test_order_cannot_be_marked_paid_and_makes_no_document(client):
    _, slug, _ = shop_with_stock(client)
    order_from_test_line(client, slug)
    [order] = orders_of(client)
    paid = client.post(f"/api/orders/{order['id']}/paid", json={"method": "cash"})
    assert paid.status_code == 409 and paid.json()["code"] == "order_is_test", paid.text
    assert orders_of(client)[0]["payment"] == "unpaid"


# ---------------------------------------------------------------------- the guard

# Every query that reads the `orders` table must either leave the owner's test order out
# (it names `is_test`) or be listed here with the reason it need not. Adding a report that
# counts orders and forgetting the mark fails this test, naming the query. The key is the
# file and the start of the query, so moving code never breaks it but changing a query asks
# for the decision again.
FINE_WITHOUT = {
    ("core/forget.py", "select (select count(*) from messages where contact_id = $1) as messages"):
        "one customer's own records, counted before they are forgotten; every order of theirs "
        "is kept without them, a test one too",
    ("modules/documents/service.py", "select number from orders where id = $1"):
        "the number of one order by its ID",
    ("modules/items/costs.py", "select o.id"):
        "one margin per order, read for that order's own row",
    ("modules/items/discounts.py", "select d.rule_id, count(*)::int as n"):
        "one customer's own uses of a code; the test customer is one customer",
    ("modules/items/discounts.py", "select count(*) from order_discounts d"):
        "one customer's own uses of a code; the test customer is one customer",
    ("modules/items/stock.py", "from stock_movements m join item_variants v"):
        "names the order a stock movement belongs to; the movement is the owner's history",
    ("modules/items/wa_order.py", "select true from orders where contact_id = $1"):
        "one customer's own previous order",
    ("modules/items/wa_order.py", "select id from orders where contact_id = $1"):
        "one customer's own latest order",
    ("modules/ledger/service.py", "select number from orders where id = $1"):
        "the number of one order by its ID",
    ("modules/orders/holds.py", "update payment_requests p set status = 'expired'"):
        "expires payment links; a test order has none",
    ("modules/orders/service.py", "select count(distinct h.order_id) from stock_holds h"):
        "one customer's own unpaid holds",
    ("modules/orders/service.py", "select coalesce(max(number), 1000) + 1 from orders"):
        "the next number; a test order has a number like any order",
    ("modules/orders/service.py", "select id from orders where contact_id = $1"):
        "one customer's own latest order",
    ("modules/orders/service.py", "select status from orders where id = $1"):
        "one order's status by its ID",
    ("modules/orders/service.py", "select o.id, o.number, o.status, o.payment, o.total"):
        "one order on its customer's own tracking page, by a signed link",
    ("core/payments.py", "select p.account_id, p.amount, p.status, p.checkout_url, o.number"):
        "one payment's own order number, for the provider's page (a test order has no payment)",
    ("routes/pay.py", "select p.amount, p.status, p.provider"):
        "one payment page by its ID",
    ("routes/store.py", "select true from orders where contact_id = $1"):
        "one customer's own previous order",
    ("core/readiness.py", "select 1 from orders o join contacts c on c.id = o.contact_id"):
        "the go-live check that the owner tried an order IS the test order",
}

READS_ORDERS = re.compile(r"\b(from|join)\s+orders\b", re.IGNORECASE)


def sql_strings():
    for path in sorted(SRC.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                yield path.relative_to(SRC).as_posix(), node.value, node.lineno


def normalised(text):
    return re.sub(r"\s+", " ", text).strip()


def test_every_query_that_reads_orders_leaves_the_test_order_out_or_says_why_not():
    unmarked = []
    allowed_seen = set()
    for path, text, line in sql_strings():
        if not READS_ORDERS.search(text) or path.startswith("seed"):
            continue
        text = normalised(text)
        if "is_test" in text:
            continue
        key = next(
            (k for k in FINE_WITHOUT if k[0] == path and text.startswith(normalised(k[1]))), None
        )
        if key is None:
            key = next(
                (k for k in FINE_WITHOUT if k[0] == path and normalised(k[1]) in text), None
            )
        if key is not None:
            allowed_seen.add(key)
            continue
        unmarked.append(f"{path}:{line}: {text[:110]}")
    assert not unmarked, (
        "These queries read `orders` without leaving out the owner's test order. Add "
        "`not is_test` (or `not o.is_test`), or list the query in FINE_WITHOUT with the "
        "reason it need not:\n" + "\n".join(unmarked)
    )
    stale = set(FINE_WITHOUT) - allowed_seen
    assert not stale, f"FINE_WITHOUT lists queries that no longer exist: {sorted(stale)}"


def test_the_guard_would_catch_a_new_report_that_forgets_the_mark():
    """The guard's own check: a query that counts orders with no mark is not fine."""
    forgetful = "select count(*) from orders where status <> 'cancelled'"
    assert READS_ORDERS.search(forgetful) and "is_test" not in forgetful
    assert not any(normalised(k[1]) in forgetful for k in FINE_WITHOUT)


def test_the_trigger_is_the_only_way_the_mark_is_set():
    """Nothing in the application writes `is_test`: the database sets it as the order is
    inserted, so no way of making an order can forget it."""
    writers = [
        f"{path}:{line}" for path, text, line in sql_strings()
        if re.search(r"insert into orders[^;]*\bis_test\b", normalised(text))
        or re.search(r"update orders set[^;]*\bis_test\b", normalised(text))
    ]
    assert writers == []
