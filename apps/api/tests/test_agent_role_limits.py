"""What the agent role may not change: prices, services, opening hours, bulk reminders, saved
replies and failed-job retries belong to owners and admins (ALY-117, audit of 17 Oct, H1)."""

from uuid import uuid4

from alyr.seed import AGENT_EMAIL, OWNER_EMAIL
from test_sign_in import sign_in

WEEK = {"periods": [{"weekday": 0, "opens": "09:00", "closes": "17:00"}]}


def calls(client):
    """Each manager-only change, as a function of the client making it."""
    some_id = str(uuid4())
    return {
        "add a service": lambda c: c.post(
            "/api/services", json={"name": "Quote", "duration_minutes": 30, "price": 100}
        ),
        "change a service": lambda c: c.patch(
            f"/api/services/{some_id}",
            json={"name": "Quote", "duration_minutes": 30, "price": 100},
        ),
        "switch a service": lambda c: c.post(
            f"/api/services/{some_id}/active", json={"active": False}
        ),
        "set the hours": lambda c: c.put("/api/hours", json=WEEK),
        "remind every debtor": lambda c: c.post("/api/ledger/reminders", json={"min_days": 3650}),
        "delete a saved reply": lambda c: c.delete(f"/api/inbox/saved-replies/{some_id}"),
        "retry a failed job": lambda c: c.post(f"/api/jobs/{some_id}/retry"),
    }


def test_an_agent_cannot_change_services_hours_reminders_replies_or_jobs(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    for name, call in calls(agent).items():
        refused = call(agent)
        assert refused.status_code == 403, (name, refused.text)
        assert refused.json()["detail"] == "Only the owner or an admin can change this."


def test_the_owner_still_can(client_factory, monkeypatch):
    """The same calls are not refused for the owner: they reach their routes (404 for an
    unknown id, 200 where the call is real), so the agent's 403 above is about the role."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner = client_factory()
    sign_in(owner, OWNER_EMAIL)
    for name, call in calls(owner).items():
        assert call(owner).status_code != 403, name


def test_an_agent_adds_a_product_only_when_the_owner_lets_agents_edit_items(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()  # one client: building another resets the database
    product = {"name": "Cable", "price": 500}

    sign_in(client, OWNER_EMAIL)
    assert client.put("/api/items/settings", json={"agents_edit_items": False}).status_code == 200
    client.cookies.clear()
    sign_in(client, AGENT_EMAIL)
    assert client.post("/api/products", json=product).status_code == 403

    client.cookies.clear()
    sign_in(client, OWNER_EMAIL)
    assert client.put("/api/items/settings", json={"agents_edit_items": True}).status_code == 200
    client.cookies.clear()
    sign_in(client, AGENT_EMAIL)
    assert client.post("/api/products", json=product).status_code == 200
