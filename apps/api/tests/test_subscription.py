"""A client's plan after go-live: paid up, past due, paused or cancelled (ALY-218, D-080,
spec 040).

The rules are a pure function, checked first by itself. Then the real path: a business that
went live and paid its first period, the back office recording payments and cancellations over
HTTP, the hourly check on PostgreSQL with mail and Paddle played by fakes on their transports,
and the outbound layer refusing what ALYR may not send while a client is paused."""

import json
from datetime import date, timedelta
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.channels.base import OutboundMessage
from alyr.config import Settings, get_settings
from alyr.core import mail, subscription
from alyr.core.subscription import add_months, state
from test_access import pay, payment
from test_card_billing import FakePaddle
from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_pricing import ADMIN, client_of, pricing_restored  # noqa: F401 - fixture
from test_readiness import accept_price

PRICE = {"setup": 100_000, "period": 45_000, "months": 1}
LIVE = date(2026, 10, 1)


def at(on, *, paid=145_000, price=PRICE, live_on=LIVE, waived=False, cancels_on=None,
       grace_days=14, pause=True):
    return state(waived=waived, price=price, paid=paid, live_on=live_on, cancels_on=cancels_on,
                 on=on, grace_days=grace_days, pause=pause)


def test_a_month_later_is_the_same_day_or_the_months_last():
    assert add_months(date(2027, 1, 31), 1) == date(2027, 2, 28)
    assert add_months(date(2028, 1, 31), 1) == date(2028, 2, 29)
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)
    assert add_months(date(2026, 12, 1), 0) == date(2026, 12, 1)


def test_the_plan_falls_due_then_pauses_after_the_grace_period():
    # The first period is paid at go-live: it runs to the same day next month.
    now = at(date(2026, 10, 31))
    assert (now["state"], now["paid_through"], now["owed"]) == ("active", date(2026, 11, 1), 0)
    due = at(date(2026, 11, 1))
    assert (due["state"], due["overdue_days"], due["owed"]) == ("past_due", 0, 45_000)
    assert due["pause_on"] == date(2026, 11, 15) and due["paused"] == ""
    assert at(date(2026, 11, 14))["state"] == "past_due"
    paused = at(date(2026, 11, 15))
    assert (paused["state"], paused["paused"], paused["overdue_days"]) == (
        "suspended", "overdue", 14)
    # Two months behind: both are owed.
    assert at(date(2026, 12, 2))["owed"] == 90_000
    # Paying a period moves the date a month on; paying less than a period does not.
    assert at(date(2026, 11, 20), paid=190_000)["state"] == "active"
    assert at(date(2026, 11, 20), paid=189_999)["state"] == "suspended"
    # With the pause switched off, a client stays past due and nothing pauses.
    off = at(date(2027, 3, 1), pause=False)
    assert (off["state"], off["pause_on"], off["paused"]) == ("past_due", None, "")


def test_before_go_live_and_without_a_price_nothing_is_overdue():
    waiting = at(date(2027, 6, 1), paid=0, live_on=None)
    assert (waiting["state"], waiting["owed"], waiting["paused"]) == (
        "awaiting_payment", 145_000, "")
    assert at(date(2027, 6, 1), live_on=None)["state"] == "active"
    assert at(date(2027, 6, 1), price=None)["state"] == "no_price"
    # Waived (a pilot, a demo): never due.
    assert at(date(2027, 6, 1), paid=0, waived=True)["state"] == "active"
    # A plan with nothing to pay each period never falls due.
    assert at(date(2027, 6, 1), price=PRICE | {"period": 0}, paid=100_000)["state"] == "active"


def test_a_plan_paid_every_three_months_falls_due_every_three_months():
    three = PRICE | {"months": 3}
    assert at(date(2026, 12, 31), price=three)["state"] == "active"
    due = at(date(2027, 1, 2), price=three)
    assert (due["state"], due["paid_through"], due["owed"]) == (
        "past_due", date(2027, 1, 1), 45_000)


def test_a_cancellation_takes_effect_on_its_day_even_when_paid_or_waived():
    day = date(2026, 10, 20)
    assert at(date(2026, 10, 19), cancels_on=day)["state"] == "active"
    gone = at(day, cancels_on=day, waived=True)
    assert (gone["state"], gone["paused"]) == ("cancelled", "cancelled")


# ── the real path ────────────────────────────────────────


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def letters(monkeypatch):
    """Mail on, and a list of what was sent (the sign-in codes left out)."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    sent: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" not in body["subject"]:
            sent.append(body)
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    yield sent
    get_settings.cache_clear()


def live_client(owner, office, *, days_ago: int, lang: str = "en"):
    """A business that went live `days_ago` days ago and paid its setup and first month, with
    an owner address that could be real. Answers the tenant, the client's ID and the address."""
    tenant, _, name = new_business(owner, paid=False)
    accept_price(owner, office, name)
    client_id = client_of(office, name)["id"]
    assert pay(office, client_id, payment(owner)["due"]).status_code == 200
    address = f"owner-{uuid4().hex[:8]}@shop-test.com"
    owner_sql(
        "update tenants set live_at = now() - make_interval(days => $2), owner_lang = $3 "
        "where id = $1", tenant, days_ago, lang,
    )
    owner_sql("update clients set contact_email = $2 where id = $1", UUID(client_id), address)
    return tenant, client_id, address


def went_live(tenant, days_ago):
    owner_sql("update tenants set live_at = now() - make_interval(days => $2) where id = $1",
              tenant, days_ago)


def check(client, client_id, on=None):
    async def go():
        return await subscription.check(
            client.app.state.db, UUID(client_id), Settings(), on or subscription.today()
        )

    return client.portal.call(go)


def to(letters, address):
    return [m for m in letters if m["to"] == [address]]


def customer(tenant) -> UUID:
    """A customer who wrote within the last 24 hours and agreed to service messages."""
    return owner_sql(
        "insert into contacts (tenant_id, phone, name, consent_service, last_inbound_at) "
        "values ($1, $2, 'Maryam', 'granted', now()) returning id",
        tenant, f"9745{uuid4().int % 10_000_000:07d}",
    )[0]["id"]


def send(client, tenant, contact, *, typed=False):
    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            return await client.app.state.outbound.send(
                conn, OutboundMessage(to=contact, body="Your order is ready", typed=typed)
            )

    return client.portal.call(go)


def paused_row(client_id):
    return owner_sql(
        "select billing_state, sending_paused_at, sending_paused_reason, cancels_on "
        "from clients where id = $1", UUID(client_id),
    )[0]


def test_an_overdue_client_is_reminded_then_paused_and_paying_lifts_it(
    client, office, letters
):
    tenant, client_id, address = live_client(client, office, days_ago=32)
    who = customer(tenant)

    # A month and a day or so after go-live: due, everything still works, one email.
    assert check(client, client_id) == 1
    assert check(client, client_id) == 0  # never the same email twice
    row = paused_row(client_id)
    assert (row["billing_state"], row["sending_paused_at"]) == ("past_due", None)
    [due] = to(letters, address)
    assert due["subject"] == "Your ALYR payment is due" and "/app" in due["text"]
    plan = payment(client)["subscription"]
    assert plan["state"] == "past_due" and plan["owed"] > 0 and plan["pause_on"]
    assert send(client, tenant, who).blocked is None

    # Three days before the pause, a warning.
    through = date.fromisoformat(plan["paid_through"])
    assert check(client, client_id, through + timedelta(days=11)) == 1
    assert to(letters, address)[-1]["subject"].startswith("ALYR pauses your WhatsApp replies on")

    # Past the grace period: ALYR's automatic messages pause, a typed reply still goes.
    went_live(tenant, 46)
    assert check(client, client_id) == 1
    row = paused_row(client_id)
    assert (row["billing_state"], row["sending_paused_reason"]) == ("suspended", "overdue")
    assert row["sending_paused_at"] is not None
    assert to(letters, address)[-1]["subject"] == "Your automatic WhatsApp replies are paused"
    assert send(client, tenant, who).blocked == "billing_paused"
    assert send(client, tenant, who, typed=True).blocked is None
    blocked = owner_sql(
        "select status, error from messages where contact_id = $1 and status = 'blocked'", who
    )
    assert [(m["status"], m["error"]) for m in blocked] == [("blocked", "billing_paused")]

    # The workspace stays open and says what is owed.
    owed = payment(client)
    assert owed["subscription"]["state"] == "suspended"
    assert owed["subscription"]["paused"] == "overdue"
    assert client.get(f"{BASE}/state").status_code == 200

    # Recording the payment lifts the pause at once, without waiting for the hourly check.
    answer = pay(office, client_id, owed["subscription"]["owed"])
    assert answer.status_code == 200 and answer.json()["subscription"]["state"] == "active"
    assert paused_row(client_id)["sending_paused_at"] is None
    assert send(client, tenant, who).blocked is None


def test_the_email_is_in_the_owners_language(client, office, letters):
    _, client_id, address = live_client(client, office, days_ago=33, lang="ar")
    assert check(client, client_id) == 1
    [letter] = to(letters, address)
    assert letter["subject"] == "حان موعد دفعتك لـ ALYR"
    assert 'dir="rtl"' in letter["html"]


class CancellingPaddle(FakePaddle):
    """Paddle, also cancelling a subscription (POST /subscriptions/{id}/cancel)."""

    def __init__(self) -> None:
        super().__init__()
        self.cancelled: list[tuple[str, dict]] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.strip("/").split("/")
        if request.method == "POST" and len(path) == 3 and path[2] == "cancel":
            body = json.loads(request.content)
            self.cancelled.append((path[1], body))
            self.subscriptions[path[1]]["status"] = "canceled"
            return httpx.Response(200, json={"data": self.subscriptions[path[1]], "meta": {}})
        return super().handle(request)


def test_a_cancellation_takes_seven_days_then_pauses_and_stops_the_card(
    client, office, letters, monkeypatch
):
    paddle_api = CancellingPaddle()
    from alyr.core import paddle

    monkeypatch.setattr(paddle, "transport", httpx.MockTransport(paddle_api.handle))
    tenant, client_id, address = live_client(client, office, days_ago=3)
    sub = f"sub_{uuid4().hex[:26]}"
    paddle_api.subscriptions[sub] = {"id": sub, "status": "active", "custom_data": {}}
    owner_sql(
        "insert into card_checkouts (client_id, business_id, provider, status, created_by, "
        "subscription_ref, subscription_status) values ($1, $2, 'paddle', 'paid', 'test', $3, "
        "'active')", UUID(client_id), tenant, sub,
    )
    who = customer(tenant)

    url = f"{ADMIN}/clients/{client_id}/cancel"
    assert office.post(url, json={"note": ""}).status_code == 422
    answer = office.post(url, json={"note": "Email from the owner, 29 Oct"})
    assert answer.status_code == 200, answer.text
    today = subscription.today()
    plan = answer.json()["subscription"]
    assert plan["cancels_on"] == (today + timedelta(days=7)).isoformat()
    assert plan["state"] == "active" and plan["cancel_note"] == "Email from the owner, 29 Oct"
    # Asking again keeps the first day.
    assert office.post(url, json={"note": "Again"}).json()["subscription"]["cancels_on"] == (
        plan["cancels_on"])
    log = office.get(f"{ADMIN}/audit", params={"client_id": client_id}).json()["entries"]
    assert [e["action"] for e in log].count("client.cancel") == 2

    # The owner is told the day, once; until then everything works.
    assert check(client, client_id) == 1
    assert check(client, client_id) == 0
    assert to(letters, address)[-1]["subject"].startswith("Your ALYR plan ends on")
    assert send(client, tenant, who).blocked is None
    assert paddle_api.cancelled == []

    # On the day: sending pauses and the card subscription is cancelled at Paddle, once.
    assert check(client, client_id, today + timedelta(days=7)) == 0
    row = paused_row(client_id)
    assert (row["billing_state"], row["sending_paused_reason"]) == ("cancelled", "cancelled")
    assert send(client, tenant, who).blocked == "billing_paused"
    client.portal.call(client.app.state.jobs.drain)
    assert paddle_api.cancelled == [(sub, {"effective_from": "immediately"})]
    check(client, client_id, today + timedelta(days=8))
    client.portal.call(client.app.state.jobs.drain)
    assert len(paddle_api.cancelled) == 1
    status = owner_sql("select subscription_status from card_checkouts where client_id = $1",
                       UUID(client_id))[0]["subscription_status"]
    assert status == "canceled"

    # The client stays after all: undone, and sending starts again. Nothing was deleted.
    undone = office.delete(url)
    assert undone.status_code == 200 and undone.json()["subscription"]["cancels_on"] is None
    assert paused_row(client_id)["sending_paused_at"] is None
    assert send(client, tenant, who).blocked is None
    assert office.delete(f"{ADMIN}/clients/{uuid4()}/cancel").status_code == 404


def test_an_owner_cannot_pause_or_cancel_their_own_plan(client):
    tenant, _, _ = new_business(client)
    client_id = owner_sql("select client_id from tenants where id = $1", tenant)[0]["client_id"]

    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            return await conn.execute(
                "update clients set sending_paused_at = null, cancels_on = null "
                "where id = $1", client_id,
            )

    # Row-level security lets an owner read their client, never change it.
    assert client.portal.call(go) == "UPDATE 0"

    async def notice():
        async with client.app.state.db.tenant(tenant) as conn:
            return await conn.fetch("select * from billing_notices")

    assert client.portal.call(notice) == []
