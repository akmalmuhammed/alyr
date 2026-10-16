"""Sign-in codes by email through Resend (D-029). No real email is sent: the provider
is replaced by a mock transport that records what it was asked to send."""

import json

import httpx
import pytest

from alyr.core import mail
from alyr.seed import OWNER_EMAIL


@pytest.fixture
def provider(monkeypatch):
    """Turn email on and capture every request to the provider."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    sent: list[dict] = []
    state = {"status": 200}

    def handle(request: httpx.Request) -> httpx.Response:
        sent.append(
            {
                "url": str(request.url),
                "auth": request.headers["authorization"],
                "body": json.loads(request.content),
            }
        )
        return httpx.Response(state["status"], json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return sent, state


def test_a_known_person_gets_their_code_by_email(provider, client):
    sent, _ = provider
    answer = client.post("/api/auth/code", json={"email": " Fatima@AlNoor.example "}).json()
    assert len(sent) == 1
    message = sent[0]
    assert message["url"] == mail.API and message["auth"] == "Bearer re_test_key"
    assert message["body"]["to"] == [OWNER_EMAIL]
    assert message["body"]["from"] == "ALYR <no-reply@alyr.qa>"
    assert answer["dev_code"] in message["body"]["subject"]
    assert answer["dev_code"] in message["body"]["text"] and "رمز الدخول" in message["body"]["text"]
    # The emailed code signs in.
    verified = client.post(
        "/api/auth/verify", json={"email": OWNER_EMAIL, "code": answer["dev_code"]}
    )
    assert verified.status_code == 200


def test_an_unknown_email_gets_the_same_answer_and_no_email(provider, client):
    sent, _ = provider
    answer = client.post("/api/auth/code", json={"email": "nobody@example.com"})
    assert answer.status_code == 200 and answer.json()["sent"] is True
    assert sent == []


def test_when_the_provider_refuses_the_person_is_told_to_try_again(provider, client):
    _, state = provider
    state["status"] = 422
    answer = client.post("/api/auth/code", json={"email": OWNER_EMAIL})
    assert answer.status_code == 503
    assert "try again" in answer.json()["detail"]


def test_without_a_key_nothing_is_sent_and_local_shows_the_code(client):
    assert not mail.configured()
    answer = client.post("/api/auth/code", json={"email": OWNER_EMAIL}).json()
    assert len(answer["dev_code"]) == 6
