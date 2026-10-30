"""Business-type templates, on the demo shop (ALY-107, D-039): the owner's alert switches
(which the type starts), and that WhatsApp, staff and customers alike, never see a sample item.
The onboarding side is in test_catalog_business_types.py. Everything goes through the chat
simulator and the same job queue as live traffic; nothing reaches Meta."""

from uuid import UUID

import pytest

from alyr.seed import AHMED_PHONE, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    catalog_module_on,
    talk,
)
from test_catalog_alerts import midday, open_window, sell, told  # noqa: F401
from test_consent import owner_sql
from test_items import counted, fresh, mk


@pytest.fixture(autouse=True)
def no_samples_left_behind():
    """Other tests change every shop's items at once with owner SQL, and a sample can only be
    a draft: leave none behind."""
    owner_sql("delete from items where is_sample")
    yield
    owner_sql("delete from items where is_sample")


def make_sample(client, **fields) -> dict:
    """An item that is a sample, as onboarding makes them (a draft with the mark)."""
    item = mk(client, status="draft", **fields)
    owner_sql("update items set is_sample = true, sample_key = 'test' where id = $1",
              UUID(item["id"]))
    return item


# ── the alerts the type starts, which the owner can switch ────────────────────────────


def test_the_low_stock_alert_follows_the_owners_switch(client):
    open_window()
    client.put("/api/items/setup", json={"alerts": {"low_stock": False}})
    item = counted(client, 8, name="Dates", name_ar="تمر")
    sell(client, item, 3, 0)  # 5 left: low, but the owner has switched that alert off
    assert told(client) == []
    # Running out is the other alert, and it is still on.
    sell(client, item, 5, 1)
    assert [m["body"] for m in told(client)] == [
        "Sold out: Dates has just run out, so customers cannot order it."]
    # Switch it on and an item that is low says so.
    client.put("/api/items/setup", json={"alerts": {"low_stock": True}})
    other = counted(client, 8, name="Figs", name_ar="تين")
    sell(client, other, 3, 2)
    assert told(client)[-1]["body"] == "Low stock: Figs has only 5 left."


def test_the_sold_out_alert_follows_the_owners_switch(client):
    open_window()
    client.put("/api/items/setup", json={"alerts": {"sold_out": False}})
    item = counted(client, 6, name="Dates", name_ar="تمر")
    sell(client, item, 1, 0)  # 5 left: low, still on
    sell(client, item, 5, 1)  # gone: the owner switched this alert off
    assert [m["body"] for m in told(client)] == ["Low stock: Dates has only 5 left."]


def test_a_shop_that_never_chose_has_both_alerts_on_as_it_always_had(client):
    open_window()
    assert client.get("/api/items/setup").json()["alerts"] == {"low_stock": True, "sold_out": True}
    item = counted(client, 6, name="Dates", name_ar="تمر")
    sell(client, item, 1, 0)
    sell(client, item, 5, 1)
    assert len(told(client)) == 2


# ── WhatsApp never sees a sample ──────────────────────────────────────────────────────


def test_staff_commands_do_not_find_samples(client):
    sample = make_sample(client, name="Shawarma", name_ar="شاورما")
    reply = talk(client, STAFF_PHONE, "sold out shawarma")[-1]
    assert "No item is called" in reply["body"]
    reply = talk(client, STAFF_PHONE, "price shawarma 12")[-1]
    assert "No item is called" in reply["body"]
    reply = talk(client, STAFF_PHONE, "نفذ شاورما")[-1]
    assert "لا يوجد صنف" in reply["body"]
    assert fresh(client, sample)["price"] == 1200 and fresh(client, sample)["sample"] is True
    # Once the owner makes it theirs, the same words find it.
    client.post(f"/api/items/{sample['id']}/adopt")
    owner_sql("update items set status = 'live' where id = $1", UUID(sample["id"]))
    assert "Shawarma is now sold out" in talk(client, STAFF_PHONE, "sold out shawarma")[-1]["body"]


def test_a_customer_asking_for_a_sample_is_shown_nothing(client):
    make_sample(client, name="Shawarma", name_ar="شاورما")
    for text in ("shawarma", "do you have shawarma", "شاورما", "menu"):
        replies = talk(client, AHMED_PHONE, text)
        assert replies, text
        for reply in replies:
            assert "shawarma" not in (reply["body"] or "").lower(), (text, reply["body"])
            assert reply["kind"] != "image", text
            assert "شاورما" not in (reply["body"] or ""), text
