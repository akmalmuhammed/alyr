"""Tests for additive inbox listing, search, filtering and customer context (J04)."""

from alyr.modules.inbox import listing
from alyr.seed import AHMED_PHONE
from test_consent import ahmed, say


def test_inbox_listing_counts(client):
    res = client.get("/api/inbox/conversations?limit=10").json()
    assert "counts" in res
    assert "open" in res["counts"]
    assert "closed" in res["counts"]
    assert "unassigned" in res["counts"]
    # The chips' counts: waiting, not delivered and window closed are counted too.
    for key in ("waiting", "not_delivered", "window_closed", "mine", "unread"):
        assert isinstance(res["counts"][key], int)


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


def test_waiting_and_not_delivered_chips_filter_by_their_own_rule(client):
    """Someone who has only just written is not waiting yet (10 minutes, as on Home)."""
    say(client, AHMED_PHONE, "Do you have a slot on Thursday?")
    waiting = client.get("/api/inbox/conversations?chip=waiting").json()
    assert all(c["last"]["direction"] == "in" for c in waiting["conversations"])
    names = [c["name"] for c in waiting["conversations"]]
    assert "Ahmed Al-Kuwari" not in names, "written seconds ago"
    refused = client.get("/api/inbox/conversations?chip=not_delivered").json()
    assert all(c["last"]["direction"] == "out" for c in refused["conversations"])
    closed_window = client.get("/api/inbox/conversations?chip=window_closed").json()
    assert all(c["window_open"] is False for c in closed_window["conversations"])


def test_each_row_names_who_sent_its_last_message(client):
    say(client, AHMED_PHONE, "hello")
    rows = client.get("/api/inbox/conversations?limit=5").json()["conversations"]
    assert rows and "sent_by" in rows[0]["last"]


CONTEXT = {
    "id": "c1", "name": "A", "phone": "+974 5555 0000", "visits": 4,
    "spent_12mo": 231000, "balance_owed": 25000,
    "orders": [{"number": 1013, "total": 4500}], "next_booking": None,
    "consent": {"service": "granted", "marketing": "unknown"},
}


def test_an_owner_and_an_admin_get_the_whole_context():
    for role in ("owner", "admin"):
        assert listing.for_role(CONTEXT, role) == CONTEXT


def test_the_agent_role_gets_no_aggregates_in_the_response_at_all():
    """Spent and owes are aggregates (ui-rules section 16): left out by the server."""
    agent = listing.for_role(CONTEXT, "agent")
    for key in listing.AGGREGATES:
        assert key not in agent
    # What an agent works with stays: the orders with their own totals, the booking and the consent.
    assert agent["orders"] == CONTEXT["orders"]
    assert agent["visits"] == 4 and agent["consent"] == CONTEXT["consent"]
    # The input is not changed: the same dict can be shown to an owner next.
    assert "spent_12mo" in CONTEXT


def test_an_unknown_or_missing_role_is_treated_as_an_agent():
    for role in (None, "", "somebody"):
        assert "balance_owed" not in listing.for_role(CONTEXT, role)
