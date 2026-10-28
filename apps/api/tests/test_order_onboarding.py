"""Order businesses follow their own onboarding steps (ALY-164, D-063, spec 027).

The path is inert until `presets.BUILT_WAYS` lists `orders` (its screens and its test order
are built in the pull requests that follow), so the first tests prove nothing changed for
anyone, and the rest switch it on for the test and prove the plumbing."""

import pytest

from alyr import presets
from test_consent import owner_sql
from test_onboarding import BASE, new_business

ADMIN = "/api/admin"
ORDER_TYPES = ("restaurant", "bakery", "grocery", "shop", "fashion")


@pytest.fixture(autouse=True)
def type_switches_restored():
    """The back office's switches are global; put them back after every test."""
    before = owner_sql("select * from business_type_settings")
    yield
    owner_sql("delete from business_type_settings")
    for r in before:
        owner_sql(
            "insert into business_type_settings (key, availability, price_mode) "
            "values ($1, $2, $3)", r["key"], r["availability"], r["price_mode"],
        )


@pytest.fixture
def office(client_factory):
    """The back office. On a local machine the unsigned demo user counts as ALYR staff."""
    return client_factory()


@pytest.fixture
def orders_built(monkeypatch):
    """Pretend the order path's screens exist (they arrive in the next pull requests)."""
    monkeypatch.setattr(presets, "BUILT_WAYS", ("appointments", "orders"))


def switch(office, key, availability="self_serve"):
    return office.put(
        f"{ADMIN}/pricing/types/{key}",
        json={"availability": availability, "price_mode": "prepared"},
    )


def setup_requests(tenant):
    return owner_sql("select step_key from setup_requests where tenant_id = $1", tenant)


# --------------------------------------------------------------- inert by default

def test_which_types_follow_which_way_is_declared_in_one_place():
    ways = {p.key: presets.self_serve_way(p) for p in presets.PRESETS}
    assert {k for k, w in ways.items() if w == "orders"} == set(ORDER_TYPES)
    assert {k for k, w in ways.items() if w == "appointments"} == {
        "salon", "spa", "clinic", "home"
    }
    assert ways["wholesale"] is None and ways["travel"] is None
    # Every way a type can follow has its steps.
    assert set(ways.values()) - {None} <= set(presets.STEPS)
    assert presets.STEPS["orders"] == ("products", "handover", "try", "plan", "golive")


def test_nothing_changes_for_anyone_while_the_order_screens_are_not_built(client, office):
    types = {t["key"]: t for t in office.get(f"{ADMIN}/pricing").json()["types"]}
    for key in ORDER_TYPES:
        assert types[key]["can_self_serve"] is False and types[key]["availability"] == "with_alyr"
    assert types["salon"]["can_self_serve"] is True
    refused = switch(office, "bakery")
    assert refused.status_code == 422 and "set up with ALYR" in refused.json()["detail"]

    # A new bakery is set up with ALYR, as before: one step and a setup request.
    tenant, _, _ = new_business(client, kind="bakery")
    state = client.get(f"{BASE}/state").json()
    assert (state["way"], state["steps"]) == ("assisted", ["assisted", "plan", "golive"])
    assert [r["step_key"] for r in setup_requests(tenant)] == ["onboarding"]


def test_an_older_business_is_still_read_as_it_always_was(client):
    """Where an older business with no stored way is read from is `Preset.way`, which this
    change did not touch: a bakery is `assisted`, not the new `orders`."""
    bakery = presets.PRESET_BY_KEY["bakery"]
    assert bakery.way == "assisted"
    tenant, _, _ = new_business(client, kind="bakery")
    owner_sql("update tenants set onboarding_way = '' where id = $1", tenant)
    state = client.get(f"{BASE}/state").json()
    assert state["way"] == "assisted" and state["steps"] == ["assisted", "plan", "golive"]


# ------------------------------------------------------------- switched on, for the test

def test_the_back_office_can_switch_an_order_type_to_self_serve(office, orders_built):
    types = {t["key"]: t for t in office.get(f"{ADMIN}/pricing").json()["types"]}
    assert all(types[k]["can_self_serve"] for k in ORDER_TYPES)
    assert switch(office, "bakery").status_code == 200
    after = {t["key"]: t for t in office.get(f"{ADMIN}/pricing").json()["types"]}
    assert after["bakery"]["availability"] == "self_serve"
    # The default for every other type is unchanged: nothing is on until the founder says.
    assert all(after[k]["availability"] == "with_alyr" for k in ORDER_TYPES if k != "bakery")


def test_wholesale_and_travel_cannot_be_switched_whatever_is_built(office, orders_built):
    for key in ("wholesale", "travel"):
        refused = switch(office, key)
        assert refused.status_code == 422 and "set up with ALYR" in refused.json()["detail"], key
        assert office.get(f"{ADMIN}/pricing").json()["types"]


def test_a_switched_bakery_follows_the_order_steps_and_asks_nobody(
    client, office, orders_built
):
    assert switch(office, "bakery").status_code == 200
    listed = {t["key"]: t for t in client.get(f"{BASE}/types").json()["types"]}
    assert listed["bakery"]["way"] == "orders"
    assert listed["restaurant"]["way"] == "assisted"        # not switched

    tenant, _, _ = new_business(client, kind="bakery")
    state = client.get(f"{BASE}/state").json()
    assert (state["way"], state["step"]) == ("orders", "products")
    assert state["steps"] == ["products", "handover", "try", "plan", "golive"]
    assert state["finished"] is False
    # The type's own catalog is there to start from, and no one at ALYR was asked to set it up.
    assert state["catalog"] and state["catalog"]["samples"] > 0
    assert setup_requests(tenant) == []


def test_the_owner_can_leave_and_come_back_to_the_step_they_were_on(
    client, office, orders_built
):
    switch(office, "bakery")
    new_business(client, kind="bakery")
    saved = client.patch(f"{BASE}/state", json={"step": "handover"})
    assert saved.status_code == 200
    assert client.get(f"{BASE}/state").json()["step"] == "handover"
    assert client.patch(f"{BASE}/state", json={"step": "nonsense"}).status_code == 422


def test_what_the_steps_write_turns_the_readiness_checks_green(client, office, orders_built):
    switch(office, "bakery")
    new_business(client, kind="bakery")

    def checks():
        return {c["key"]: c["status"] for c in client.get(f"{BASE}/readiness").json()["checks"]}

    before = checks()
    assert before["content"] == "todo" and before["payments"] == "todo"

    # products: keep a sample and put it on sale (what the screen's Keep button does).
    sample = next(i for i in client.get("/api/items").json()["items"] if i.get("sample"))
    assert client.post(f"/api/items/{sample['id']}/adopt").status_code == 200
    live = client.put(f"/api/items/{sample['id']}", json={"status": "live"})
    assert live.status_code == 200, live.text

    # handover: how customers pay.
    chose = client.patch(f"{BASE}/steps/payments", json={"choice": "cash_transfer"})
    assert chose.status_code == 200, chose.text

    after = checks()
    assert after["content"] == "done" and after["payments"] == "done"
    # The test order, the plan, the payment and WhatsApp are the steps still to come.
    assert after["test"] == "todo" and after["whatsapp"] == "todo"
