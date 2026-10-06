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

    async def send(self, from_number_id, message):
        self.sent.append(message)


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
    assert channel.sent[0].to_number == "97455500001"


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
