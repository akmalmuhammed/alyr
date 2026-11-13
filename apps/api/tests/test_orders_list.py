"""Tests for redesigned orders listing, filters, search, detail, and roles (J01)."""

from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_SLUG, OWNER_EMAIL
from order_links import token
from test_consent import owner_sql
from test_sign_in import other_shop_with_owner, sign_in

STORE = f"/api/store/{DEMO_SLUG}"


def customer(client, phone=AHMED_PHONE):
    people = client.get("/api/ledger/summary").json()["customers"]
    return next(c for c in people if c["phone"] == phone)


def product(client, name):
    products = client.get(STORE).json()["products"]
    return next(p for p in products if p["name"].startswith(name))


def place(client, contact_id, lines, payment="link"):
    return client.post(
        f"{STORE}/orders",
        json={
            "token": token(contact_id),
            "items": [{"product_id": p["id"], "quantity": q} for p, q in lines],
            "payment": payment,
        },
    )


def test_list_orders_structure_and_counts(client):
    ahmed = customer(client)
    res = place(client, ahmed["id"], [(product(client, "Switch"), 2)], "link")
    assert res.status_code == 200

    resp = client.get("/api/orders").json()
    assert "slug" in resp
    assert "orders" in resp
    assert "total" in resp
    assert "counts" in resp
    assert "late_new" in resp
    assert "access" in resp
    assert "open_total" in resp

    counts = resp["counts"]
    for k in (
        "all", "open", "new", "confirmed", "ready", "done", "cancelled", "pickup", "delivery"
    ):
        assert k in counts

    order = resp["orders"][0]
    assert "id" in order
    assert "number" in order
    assert "status" in order
    assert "payment" in order
    assert "contact_id" in order
    assert "phone" in order
    assert "items" in order
    assert len(order["items"]) > 0
    item = order["items"][0]
    assert "name_ar" in item
    assert "variant_ar" in item
    assert "options_ar" in item


def test_filters_and_paging(client):
    ahmed = customer(client)
    o1 = place(client, ahmed["id"], [(product(client, "Switch"), 1)], "link").json()
    o2 = place(client, ahmed["id"], [(product(client, "Socket"), 1)], "link").json()

    # Filter status=new
    resp = client.get("/api/orders?status=new").json()
    numbers = [o["number"] for o in resp["orders"]]
    assert o1["number"] in numbers
    assert o2["number"] in numbers

    # Sort oldest vs newest
    resp_asc = client.get("/api/orders?sort=oldest&limit=50").json()
    num_asc = [o["number"] for o in resp_asc["orders"]]
    assert num_asc == sorted(num_asc)

    resp_desc = client.get("/api/orders?sort=newest&limit=50").json()
    num_desc = [o["number"] for o in resp_desc["orders"]]
    assert num_desc == sorted(num_desc, reverse=True)

    # Limit and offset
    page1 = client.get("/api/orders?limit=1&offset=0").json()
    assert len(page1["orders"]) == 1
    page2 = client.get("/api/orders?limit=1&offset=1").json()
    assert len(page2["orders"]) == 1
    assert page1["orders"][0]["number"] != page2["orders"][0]["number"]


def test_search(client):
    ahmed = customer(client)
    res = place(client, ahmed["id"], [(product(client, "Cable 2.5 mm"), 1)], "link").json()
    order_num = res["number"]

    # Search by customer name
    by_name = client.get("/api/orders?q=Ahmed").json()
    assert any(o["number"] == order_num for o in by_name["orders"])

    # Search by item name
    by_item = client.get("/api/orders?q=Cable").json()
    assert any(o["number"] == order_num for o in by_item["orders"])

    # Search by number with #
    by_hash = client.get(f"/api/orders?q=%23{order_num}").json()
    assert any(o["number"] == order_num for o in by_hash["orders"])

    # Search by plain number
    by_plain = client.get(f"/api/orders?q={order_num}").json()
    assert any(o["number"] == order_num for o in by_plain["orders"])


def test_role_open_total_and_access(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()

    # As owner
    sign_in(client, OWNER_EMAIL)
    owner_view = client.get("/api/orders").json()
    assert "open_total" in owner_view
    assert owner_view["access"]["can_manage"] is True
    assert owner_view["access"]["can_cancel"] is True

    # As agent
    client_agent = client_factory()
    sign_in(client_agent, AGENT_EMAIL)
    agent_view = client_agent.get("/api/orders").json()
    assert "open_total" not in agent_view
    assert agent_view["access"]["can_manage"] is False
    assert agent_view["access"]["can_cancel"] is False


def test_poll_cache_separation_between_roles(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner_client = client_factory()
    sign_in(owner_client, OWNER_EMAIL)
    owner_res = owner_client.get("/api/orders").json()
    assert "open_total" in owner_res

    agent_client = client_factory()
    sign_in(agent_client, AGENT_EMAIL)
    agent_res = agent_client.get("/api/orders").json()
    # Cached owner response must not leak to agent
    assert "open_total" not in agent_res


def test_order_detail_and_tenant_isolation(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    shop1_client = client_factory()
    other_client = client_factory()

    other_tenant = other_shop_with_owner("other_owner@example.com")
    owner_sql(
        "insert into tenant_modules (tenant_id, module_key) values ($1, 'orders')", other_tenant
    )

    sign_in(shop1_client, OWNER_EMAIL)
    sign_in(other_client, "other_owner@example.com")

    ahmed = customer(shop1_client)
    created = place(
        shop1_client, ahmed["id"], [(product(shop1_client, "Switch"), 1)], "link"
    ).json()
    order_id = created["order_id"]

    # Detail in shop 1
    detail = shop1_client.get(f"/api/orders/{order_id}").json()
    assert detail["order"]["number"] == created["number"]
    assert "lines" in detail
    assert "customer" in detail
    assert "payment" in detail
    assert "activity" in detail
    assert "track_url" in detail
    assert "access" in detail
    assert detail["customer"]["name"] == "Ahmed Al-Kuwari"

    # Lines structure
    line = detail["lines"][0]
    assert "name" in line
    assert "name_ar" in line
    assert "unit_price" in line
    assert "line_total" in line
    assert "code" in line

    # Other shop cannot see or access it
    other_orders = other_client.get("/api/orders").json()
    assert not any(o["id"] == str(order_id) for o in other_orders["orders"])
    assert other_client.get(f"/api/orders/{order_id}").status_code == 404


def test_status_transitions_no_backwards(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    c = client_factory()
    sign_in(c, OWNER_EMAIL)

    ahmed = customer(c)
    order = place(c, ahmed["id"], [(product(c, "Switch"), 1)], "link").json()
    order_id = order["order_id"]

    # new -> confirmed -> ready -> done
    assert c.post(f"/api/orders/{order_id}/status", json={"status": "confirmed"}).status_code == 200
    assert c.post(f"/api/orders/{order_id}/status", json={"status": "ready"}).status_code == 200
    assert c.post(f"/api/orders/{order_id}/status", json={"status": "done"}).status_code == 200

    # Backwards attempt: done -> confirmed returns 422
    backwards = c.post(f"/api/orders/{order_id}/status", json={"status": "confirmed"})
    assert backwards.status_code == 422
    assert "backwards" in backwards.json()["detail"]


def test_agent_cannot_cancel_order(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner_c = client_factory()
    agent_c = client_factory()
    sign_in(owner_c, OWNER_EMAIL)
    sign_in(agent_c, AGENT_EMAIL)

    ahmed = customer(owner_c)
    order = place(owner_c, ahmed["id"], [(product(owner_c, "Switch"), 1)], "link").json()
    order_id = order["order_id"]

    # Agent cancel fails with 403
    res_agent = agent_c.post(f"/api/orders/{order_id}/status", json={"status": "cancelled"})
    assert res_agent.status_code == 403

    # Order remains uncancelled
    detail = owner_c.get(f"/api/orders/{order_id}").json()
    assert detail["order"]["status"] != "cancelled"

    # Owner cancel succeeds
    res_owner = owner_c.post(
        f"/api/orders/{order_id}/status", json={"status": "cancelled", "restock": True}
    )
    assert res_owner.status_code == 200
    assert res_owner.json()["status"] == "cancelled"
