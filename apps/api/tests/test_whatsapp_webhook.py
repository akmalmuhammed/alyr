import hashlib
import hmac
import json

from alyr.channels.base import OutboundMessage
from conftest import APP_SECRET, NUMBER_ID, VERIFY_TOKEN


def meta_payload(message_id="wamid.1", number_id=NUMBER_ID, text="hello"):
    return {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {"phone_number_id": number_id},
                            "messages": [
                                {
                                    "id": message_id,
                                    "from": "97455500001",
                                    "timestamp": "1790000000",
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ],
                        }
                    }
                ]
            }
        ]
    }


def signed_post(client, payload, secret=APP_SECRET):
    raw = json.dumps(payload).encode()
    digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post(
        "/webhooks/whatsapp",
        content=raw,
        headers={"x-hub-signature-256": f"sha256={digest}", "content-type": "application/json"},
    )


class RecordingChannel:
    name = "meta"

    def __init__(self):
        self.sent: list[OutboundMessage] = []
        self.addresses = []

    async def send(self, from_number_id, message, address):
        self.sent.append(message)
        self.addresses.append(address)


def test_verification_returns_challenge_when_token_matches(client):
    response = client.get(
        "/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "42"},
    )
    assert response.status_code == 200
    assert response.text == "42"


def test_verification_rejects_wrong_token(client):
    response = client.get(
        "/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42"},
    )
    assert response.status_code == 403


def test_missing_signature_is_rejected(client):
    response = client.post("/webhooks/whatsapp", json=meta_payload())
    assert response.status_code == 401


def test_wrong_signature_is_rejected_and_nothing_is_sent(client):
    channel = RecordingChannel()
    client.app.state.outbound.channels["meta"] = channel
    response = signed_post(client, meta_payload(), secret="someone-else")
    assert response.status_code == 401
    assert channel.sent == []


def test_valid_message_gets_a_reply(client):
    channel = RecordingChannel()
    client.app.state.outbound.channels["meta"] = channel
    response = signed_post(client, meta_payload())
    assert response.status_code == 200
    assert len(channel.sent) == 1
    assert channel.addresses[0].phone == "97455500001"


def test_duplicate_delivery_is_handled_once(client):
    channel = RecordingChannel()
    client.app.state.outbound.channels["meta"] = channel
    signed_post(client, meta_payload(message_id="wamid.dup"))
    signed_post(client, meta_payload(message_id="wamid.dup"))
    assert len(channel.sent) == 1


def test_message_for_unknown_number_is_acknowledged_and_dropped(client):
    channel = RecordingChannel()
    client.app.state.outbound.channels["meta"] = channel
    response = signed_post(client, meta_payload(number_id="not-ours"))
    assert response.status_code == 200
    assert channel.sent == []


def test_status_updates_without_messages_are_ignored(client):
    channel = RecordingChannel()
    client.app.state.outbound.channels["meta"] = channel
    payload = {"entry": [{"changes": [{"value": {"statuses": [{"status": "delivered"}]}}]}]}
    assert signed_post(client, payload).status_code == 200
    assert channel.sent == []


# WhatsApp usernames: a customer can arrive with a user ID and no phone number (D-009).

USER_ID = "QA.13491208655302741918"


def username_only_payload(message_id="wamid.u1", user_id=USER_ID, text="balance"):
    """The shape Meta documents when the phone number is withheld: no `from`, no `wa_id`."""
    return {
        "entry": [
            {
                "id": "waba-1",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "metadata": {"phone_number_id": NUMBER_ID},
                            "contacts": [
                                {
                                    "profile": {"name": "Sheena Nelson", "username": "sheena"},
                                    "user_id": user_id,
                                }
                            ],
                            "messages": [
                                {
                                    "from_user_id": user_id,
                                    "id": message_id,
                                    "timestamp": "1790000000",
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ],
                        },
                    }
                ],
            }
        ]
    }


def test_customer_with_no_phone_number_is_answered_by_user_id(client):
    channel = RecordingChannel()
    client.app.state.outbound.channels["meta"] = channel
    assert signed_post(client, username_only_payload()).status_code == 200
    assert len(channel.sent) == 1
    assert channel.addresses[0].phone is None
    assert channel.addresses[0].user_id == USER_ID
    assert "QAR 0" in channel.sent[0].body

    people = client.get("/api/ledger/summary").json()["customers"]
    sheena = next(c for c in people if c["user_id"] == USER_ID)
    assert (sheena["name"], sheena["username"]) == ("Sheena Nelson", "sheena")
    assert sheena["phone"] is None


def test_same_user_id_twice_is_one_contact(client):
    client.app.state.outbound.channels["meta"] = RecordingChannel()
    signed_post(client, username_only_payload(message_id="wamid.a"))
    signed_post(client, username_only_payload(message_id="wamid.b"))
    people = client.get("/api/ledger/summary").json()["customers"]
    assert sum(1 for c in people if c["user_id"] == USER_ID) == 1


def test_user_id_change_keeps_the_contact_and_its_history(client):
    channel = RecordingChannel()
    client.app.state.outbound.channels["meta"] = channel
    signed_post(client, username_only_payload(message_id="wamid.before"))
    new_id = "QA.99999999999999999999"
    update = {
        "entry": [
            {
                "id": "waba-1",
                "changes": [
                    {
                        "field": "user_id_update",
                        "value": {
                            "metadata": {"phone_number_id": NUMBER_ID},
                            "user_id_update": [
                                {
                                    "detail": "User id for Sheena has been updated.",
                                    "user_id": {"previous": USER_ID, "current": new_id},
                                    "timestamp": "1790000100",
                                }
                            ],
                        },
                    }
                ],
            }
        ]
    }
    assert signed_post(client, update).status_code == 200
    signed_post(client, username_only_payload(message_id="wamid.after", user_id=new_id))

    people = client.get("/api/ledger/summary").json()["customers"]
    assert [c["user_id"] for c in people if c["name"] == "Sheena Nelson"] == [new_id]
    history = client.get(f"/sim/conversations/{new_id}").json()["messages"]
    assert len([m for m in history if m["direction"] == "in"]) == 2
