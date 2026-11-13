"""Tests for additive inbox listing, search, filtering and customer context (J04)."""

from alyr.seed import AHMED_PHONE
from test_consent import ahmed, say


def test_inbox_listing_counts(client):
    res = client.get("/api/inbox/conversations?limit=10").json()
    assert "counts" in res
    assert "open" in res["counts"]
    assert "closed" in res["counts"]
    assert "unassigned" in res["counts"]


def test_inbox_search_filtering(client):
    say(client, AHMED_PHONE, "Do you have ceramic coating?")
    # Search for Ahmed
    found = client.get("/api/inbox/conversations?q=Ahmed").json()
    assert len(found["conversations"]) >= 1
    assert any("Ahmed" in c["name"] for c in found["conversations"])

    # Search for non-existent
    empty = client.get("/api/inbox/conversations?q=nonexistentcustomer123").json()
    assert len(empty["conversations"]) == 0
    assert empty["total"] == 0


def test_inbox_chip_filters(client):
    say(client, AHMED_PHONE, "booking inquiry")
    res = client.get("/api/inbox/conversations?chip=unassigned").json()
    assert "conversations" in res
    for c in res["conversations"]:
        assert c["assigned"] is None


def test_inbox_pagination(client):
    say(client, AHMED_PHONE, "test message")
    page1 = client.get("/api/inbox/conversations?limit=1&offset=0").json()
    assert len(page1["conversations"]) <= 1
    assert "total" in page1


def test_inbox_customer_context(client):
    say(client, AHMED_PHONE, "hello")
    contact = ahmed(client)
    contact_id = contact["id"]

    ctx = client.get(f"/api/inbox/customer/{contact_id}")
    assert ctx.status_code == 200
    data = ctx.json()
    assert data["name"] == "Ahmed Al-Kuwari"
    assert "visits" in data
    assert "spent_12mo" in data
    assert "orders" in data
    assert "consent" in data
