"""A client pays ALYR by card through Paddle (ALY-180, D-074, spec 035).

Paddle is played by a fake on the HTTP transport (it answers what developer.paddle.com
documents), and its webhooks are signed the way Paddle signs them. Everything else is the
real path: the owner's go-live page, the job, the webhook route, PostgreSQL."""

import asyncio
import hashlib
import hmac
import json
import time
from uuid import uuid4

import httpx
import pytest

from alyr.config import Settings
from alyr.core import access, paddle
from alyr.db import Database
from conftest import APP_DSN
from test_access import payment
from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_pricing import ADMIN, client_of, pricing_restored  # noqa: F401 - fixture
from test_readiness import accept_price, line

SECRET = "pdl_ntfset_test_secret"
HOOK = "/api/billing/paddle/webhook"


class FakePaddle:
    """Paddle's API, as much as ALYR uses: create a transaction, read it, read a subscription."""

    def __init__(self) -> None:
        self.transactions: dict[str, dict] = {}
        self.subscriptions: dict[str, dict] = {}
        self.created: list[dict] = []
        self.refuse = False
        self.keys: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.keys.append(request.headers.get("authorization", ""))
        assert request.url.host == "sandbox-api.paddle.com"
        if request.method == "POST" and request.url.path == "/transactions":
            if self.refuse:
                return httpx.Response(400, json={"error": {"code": "bad_request"}})
            body = json.loads(request.content)
            self.created.append(body)
            ref = f"txn_{uuid4().hex[:26]}"
            subtotal = sum(int(i["price"]["unit_price"]["amount"]) for i in body["items"])
            self.transactions[ref] = {
                "id": ref, "status": "draft", "currency_code": "USD", "subscription_id": None,
                "custom_data": body["custom_data"], "billed_at": None,
                "details": {"totals": {"subtotal": str(subtotal), "discount": "0",
                                       "tax": "0", "total": str(subtotal),
                                       "grand_total": str(subtotal)}},
                "checkout": {"url": f"https://app.alyr.qa/app/billing?_ptxn={ref}"},
            }
            return httpx.Response(201, json={"data": self.transactions[ref], "meta": {}})
        kind, _, ref = request.url.path.strip("/").partition("/")
        found = {"transactions": self.transactions, "subscriptions": self.subscriptions}[kind]
        if ref not in found:
            return httpx.Response(404, json={"error": {"code": "not_found"}})
        return httpx.Response(200, json={"data": found[ref], "meta": {}})

    def pay(self, ref: str, *, subtotal: int | None = None) -> str:
        """The client pays in Paddle's checkout; Paddle makes the subscription."""
        txn = self.transactions[ref]
        sub = f"sub_{uuid4().hex[:26]}"
        txn |= {"status": "completed", "subscription_id": sub,
                "billed_at": "2026-10-29T08:00:00.000Z"}
        if subtotal is not None:
            txn["details"]["totals"] |= {"subtotal": str(subtotal), "grand_total": str(subtotal)}
        self.subscriptions[sub] = {"id": sub, "status": "active",
                                   "custom_data": txn["custom_data"]}
        return sub

    def renew(self, sub: str, cents: int) -> str:
        ref = f"txn_{uuid4().hex[:26]}"
        self.transactions[ref] = {
            "id": ref, "status": "completed", "currency_code": "USD", "subscription_id": sub,
            "custom_data": self.subscriptions[sub]["custom_data"],
            "billed_at": "2026-11-29T08:00:00.000Z", "origin": "subscription_recurring",
            "details": {"totals": {"subtotal": str(cents), "discount": "0", "tax": "0",
                                   "total": str(cents), "grand_total": str(cents)}},
        }
        return ref


@pytest.fixture
def fake(monkeypatch):
    for name, value in (("ALYR_CARD_BILLING", "paddle"), ("ALYR_PADDLE_API_KEY", "pdl_sdbx_key"),
                        ("ALYR_PADDLE_CLIENT_TOKEN", "test_clienttoken"),
                        ("ALYR_PADDLE_WEBHOOK_SECRET", SECRET)):
        monkeypatch.setenv(name, value)
    paddle_api = FakePaddle()
    monkeypatch.setattr(paddle, "transport", httpx.MockTransport(paddle_api.handle))
    return paddle_api


@pytest.fixture
def owner(fake, client_factory):
    return client_factory()


@pytest.fixture
def office(fake, client_factory):
    return client_factory()


def signature(body: bytes, secret: str = SECRET, ts: int | None = None) -> str:
    ts = int(time.time()) if ts is None else ts
    digest = hmac.new(secret.encode(), f"{ts}:".encode() + body, hashlib.sha256).hexdigest()
    return f"ts={ts};h1={digest}"


def hook(client, event_type: str, data: dict, **sign):
    body = json.dumps({"event_id": f"evt_{uuid4().hex[:26]}", "event_type": event_type,
                       "occurred_at": "2026-10-29T08:00:00Z", "data": data}).encode()
    return client.post(HOOK, content=body,
                       headers={"paddle-signature": signature(body, **sign),
                                "content-type": "application/json"})


def owing(owner, office):
    tenant, _, name = new_business(owner, paid=False)
    accept_price(owner, office, name)
    return tenant, client_of(office, name)["id"]


def start_card(owner) -> dict:
    answer = owner.post(f"{BASE}/payment/card")
    assert answer.status_code == 200, answer.text
    state = owner.get(f"{BASE}/payment/card").json()
    return state


def test_paying_by_card_settles_go_live_and_renewals_add_a_period(owner, office, fake):
    _, client_id = owing(owner, office)
    due = payment(owner)
    assert due["status"] == "unpaid" and due["card"]["provider"] == "paddle"

    state = start_card(owner)
    checkout = state["checkout"]
    assert checkout["status"] == "open" and checkout["transaction"].startswith("txn_")
    assert state["paddle"] == {"token": "test_clienttoken", "environment": "sandbox"}
    assert fake.keys[0] == "Bearer pdl_sdbx_key"

    # What Paddle was asked: the setup once and the plan every month, in US cents at the peg,
    # and nothing about the client but ALYR's checkout ID.
    sent = fake.created[0]
    setup, plan = (int(i["price"]["unit_price"]["amount"]) for i in sent["items"])
    row = owner_sql("select * from card_checkouts where id = $1", checkout["id"])[0]
    assert (setup + plan, plan) == (row["charge_amount"], row["period_charge"])
    assert row["amount"] == due["due"] and setup + plan == paddle.usd_cents(
        due["due"] - row["period_amount"]) + paddle.usd_cents(row["period_amount"])
    assert "billing_cycle" not in sent["items"][0]["price"]
    assert sent["items"][1]["price"]["billing_cycle"] == {"interval": "month", "frequency": 1}
    assert sent["custom_data"] == {"alyr_checkout": checkout["id"]}
    assert sent["currency_code"] == "USD"
    assert due["card"]["amount_text"] == checkout["amount_text"] == paddle.usd_text(setup + plan)
    # Pressing Pay again opens the same checkout.
    assert start_card(owner)["checkout"]["id"] == checkout["id"] and len(fake.created) == 1

    sub = fake.pay(checkout["transaction"])
    txn = fake.transactions[checkout["transaction"]]
    assert hook(owner, "transaction.completed", txn).status_code == 200
    assert hook(owner, "transaction.completed", txn).status_code == 200  # Paddle retries
    assert hook(owner, "subscription.created", fake.subscriptions[sub]).status_code == 200

    paid = payment(owner)
    assert paid["status"] == "paid" and paid["card"] is None
    assert [(p["method"], p["provider"], p["amount"]) for p in paid["payments"]] == [
        ("card", "paddle", due["due"])]
    assert paid["payments"][0]["paid_text"] == paddle.usd_text(setup + plan)
    assert paid["payments"][0]["received_on"] == "2026-10-29"
    assert line(owner.get(f"{BASE}/readiness").json(), "paid")["status"] == "done"
    after = owner.get(f"{BASE}/payment/card").json()["checkout"]
    assert (after["status"], after["subscription_status"], after["transaction"]) == (
        "paid", "active", None)

    # The back office sees the card payment beside the ones recorded by hand.
    seen = client_of(office, owner.get(f"{BASE}/state").json()["business"]["name"])["access"]
    assert seen["checkout"]["status"] == "paid" and seen["payments"][0]["method"] == "card"

    # A renewal is one more period, recorded once.
    renewal = fake.renew(sub, plan)
    assert hook(owner, "transaction.completed", fake.transactions[renewal]).status_code == 200
    assert hook(owner, "transaction.paid", fake.transactions[renewal]).status_code == 200
    amounts = [p["amount"] for p in payment(owner)["payments"]]
    assert amounts == [due["due"], row["period_amount"]]
    assert client_id == str(row["client_id"])


def test_a_payment_that_does_not_match_is_never_recorded(owner, office, fake):
    owing(owner, office)
    checkout = start_card(owner)["checkout"]
    fake.pay(checkout["transaction"], subtotal=100)
    hook(owner, "transaction.completed", fake.transactions[checkout["transaction"]])
    assert payment(owner)["status"] == "unpaid" and payment(owner)["payments"] == []
    after = owner.get(f"{BASE}/payment/card").json()["checkout"]
    assert after["status"] == "mismatch" and "ALYR asked" in after["problem"]
    assert line(owner.get(f"{BASE}/readiness").json(), "paid")["status"] == "todo"


def test_a_renewal_of_someone_elses_subscription_is_not_recorded(owner, office, fake):
    owing(owner, office)
    checkout = start_card(owner)["checkout"]
    sub = fake.pay(checkout["transaction"])
    hook(owner, "transaction.completed", fake.transactions[checkout["transaction"]])
    stranger = fake.renew(sub, 100)
    fake.transactions[stranger]["custom_data"] = {"alyr_checkout": str(uuid4())}
    fake.transactions[stranger]["subscription_id"] = "sub_somebodyelse"
    hook(owner, "transaction.completed", fake.transactions[stranger])
    assert len(payment(owner)["payments"]) == 1


def test_webhooks_need_paddles_signature(owner, office, fake):
    owing(owner, office)
    checkout = start_card(owner)["checkout"]
    fake.pay(checkout["transaction"])
    txn = fake.transactions[checkout["transaction"]]
    assert hook(owner, "transaction.completed", txn, secret="wrong").status_code == 401
    old = int(time.time()) - 3600
    assert hook(owner, "transaction.completed", txn, ts=old).status_code == 401
    body = b'{"event_type": "transaction.completed"}'
    assert owner.post(HOOK, content=body).status_code == 401
    assert payment(owner)["payments"] == []
    # Signed, about nothing of ours: answered, so Paddle does not retry, and ignored.
    assert hook(owner, "transaction.completed", {"id": "txn_nothingofours"}).status_code == 200
    assert hook(owner, "customer.created", {"id": "ctm_01"}).status_code == 200


def test_signature_check():
    body = b'{"a":1}'
    now = 1_761_724_800
    header = signature(body, ts=now)
    assert paddle.signed(header, body, SECRET, now=now + 10)
    assert not paddle.signed(header, body + b" ", SECRET, now=now)
    assert not paddle.signed(header, body, SECRET, now=now + 301)
    # While Paddle rotates the secret it sends two signatures; either may match.
    rotated = f"{header};h1={'0' * 64}"
    assert paddle.signed(rotated, body, SECRET, now=now)
    assert not paddle.signed(f"ts={now};ts={now};h1=x", body, SECRET, now=now)
    assert not paddle.signed("", body, SECRET, now=now)
    # Secret Manager's placeholder for a value not given yet is never a secret.
    assert not paddle.signed(signature(body, secret="unset", ts=now), body, "unset", now=now)
    assert paddle.usd_cents(36400) == 10000 and paddle.usd_cents(45000) == 12363  # 123.626...


def test_card_is_offered_only_when_paddle_is_set_up_and_the_client_is_not_switched_off(
    owner, office, fake
):
    _, client_id = owing(owner, office)
    # The back office switches card payment off for this client: it is on the audit log.
    answer = office.put(f"{ADMIN}/clients/{client_id}/card-billing", json={"card_billing": "off"})
    assert answer.status_code == 200 and answer.json()["card"] is None
    assert answer.json()["card_billing"] == "off"
    assert office.get(f"{ADMIN}/audit").json()["entries"][0]["action"] == "client.card_billing"
    assert owner.post(f"{BASE}/payment/card").status_code == 422
    office.put(f"{ADMIN}/clients/{client_id}/card-billing", json={"card_billing": None})
    assert payment(owner)["card"] is not None

    # A part paid by hand: the rest is paid by transfer, not by card.
    office.post(f"{ADMIN}/clients/{client_id}/payments", json={
        "amount": 1000, "method": "bank_transfer", "received_on": "2026-10-29"})
    assert payment(owner)["card"] is None
    refused = owner.post(f"{BASE}/payment/card")
    assert refused.status_code == 422 and "transfer" in refused.json()["detail"]

    # Without all of Paddle's values, or with the platform switch off, nobody is offered a
    # card, whatever the back office says.
    full = Settings(card_billing="paddle", paddle_api_key="k", paddle_client_token="t",
                    paddle_webhook_secret="s")
    assert access.card_provider(full, None) == access.card_provider(full, "paddle") == "paddle"
    assert access.card_provider(full, "off") == ""
    assert access.card_provider(full.model_copy(update={"paddle_webhook_secret": ""}), None) == ""
    assert access.card_provider(full.model_copy(update={"card_billing": ""}), "paddle") == ""
    assert access.card_provider(full.model_copy(update={"paddle_environment": "prod"}), None) == ""
    assert access.card_provider(full.model_copy(update={"paddle_api_key": "unset"}), None) == ""


def test_paddle_refusing_the_checkout_marks_it_failed(owner, office, fake):
    owing(owner, office)
    fake.refuse = True
    checkout = start_card(owner)["checkout"]
    assert checkout["status"] == "failed" and "400" in checkout["problem"]
    # The owner can press Pay again once Paddle accepts.
    fake.refuse = False
    assert start_card(owner)["checkout"]["status"] == "open"


def test_an_owner_cannot_write_what_paddle_is_asked_to_charge(owner, office, fake):
    tenant, client_id = owing(owner, office)

    async def scenario():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant) as conn:
                await conn.execute(
                    "insert into card_checkouts (client_id, business_id, amount, charge_amount) "
                    "values ($1, $2, 1, 1)", client_id, tenant,
                )
        finally:
            await db.close()

    with pytest.raises(Exception, match="row-level security"):
        asyncio.run(scenario())
