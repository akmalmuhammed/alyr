import pytest

from alyr.channels.base import Choice, OutboundMessage
from alyr.channels.meta import to_graph_payload


def test_simulated_message_gets_the_same_reply_a_real_one_would(client):
    response = client.post("/sim/messages", json={"from_number": "97455500002", "text": "hello"})
    assert response.status_code == 200
    messages = response.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["kind"] == "buttons"
    assert "Al Noor Electricals" in messages[0]["body"]


def test_conversation_can_be_read_back(client):
    client.post("/sim/messages", json={"from_number": "97455500003", "text": "hi"})
    client.post("/sim/messages", json={"from_number": "97455500003", "text": "again"})
    messages = client.get("/sim/conversations/97455500003").json()["messages"]
    assert len(messages) == 2


def test_more_than_three_buttons_is_refused():
    choices = tuple(Choice(str(i), f"Option {i}") for i in range(4))
    with pytest.raises(ValueError):
        OutboundMessage(to_number="97455500001", kind="buttons", body="Pick", choices=choices)


def test_template_needs_name_and_category():
    with pytest.raises(ValueError):
        OutboundMessage(to_number="97455500001", kind="template")


def test_buttons_are_serialised_for_the_graph_api():
    message = OutboundMessage(
        to_number="97455500001",
        kind="buttons",
        body="Pay now?",
        choices=(Choice("pay", "Pay now"), Choice("later", "Later")),
    )
    payload = to_graph_payload(message)
    assert payload["type"] == "interactive"
    assert payload["interactive"]["type"] == "button"
    assert [b["reply"]["id"] for b in payload["interactive"]["action"]["buttons"]] == [
        "pay",
        "later",
    ]
