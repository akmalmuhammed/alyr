"""A client can pay ALYR without chasing it (ALY-274, the go-live audit of 29 Oct): ALYR's
staff see who accepted and has not paid, the owner is emailed once when their price is ready,
switching a product on shows and confirms its price and leaves staff an item, and the
onboarding board follows a payment at once."""

import json
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import mail
from alyr.seed import AGENT_EMAIL
from test_access import pay, payment
from test_back_office import today
from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_pricing import ADMIN, client_of, open_quote, pricing_restored  # noqa: F401 - fixture
from test_readiness import accept_price, board, check, line
from test_sign_in import sign_in
from test_subscription import letters, to  # noqa: F401 - fixture
from test_workspace import product, shell, switch_on


@pytest.fixture
def office(client_factory):
    return client_factory()


def reachable(client_id: str, lang: str = "en") -> str:
    """Give the client an address that could be a real person's, and the language they read."""
    address = f"owner-{uuid4().hex[:8]}@shop-test.com"
    owner_sql("update clients set contact_email = $2 where id = $1", UUID(client_id), address)
    owner_sql("update tenants set owner_lang = $2 where client_id = $1", UUID(client_id), lang)
    return address


def publish(office, name):
    quote = open_quote(client_of(office, name))
    assert office.post(f"{ADMIN}/quotes/{quote['id']}/publish").status_code == 200
    return quote


def notified(quote_id: str):
    return owner_sql("select owner_notified_at from quotes where id = $1", UUID(quote_id))[0][0]


def waiting(office, client_id: str, kind: str) -> list[dict]:
    return [i for i in today(office)["items"] if i["client_id"] == client_id and i["kind"] == kind]


# ── CJ-14: the owner is told when their price is ready ───────


def test_publishing_a_price_emails_the_owner_once(client, office, letters):  # noqa: F811
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    quote = open_quote(client_of(office, name))
    monthly = quote["totals"]["monthly_total_text"]

    publish(office, name)
    mine = to(letters, address)
    assert len(mine) == 1
    letter = mine[0]
    assert letter["subject"] == f"Your ALYR price is ready: {monthly} a month"
    # The plain-text twin carries what the HTML says, with the link written out.
    assert monthly in letter["text"] and "http://web.test/app" in letter["text"]
    assert monthly in letter["html"] and 'href="http://web.test/app"' in letter["html"]
    assert notified(quote["id"]) is not None

    # Publishing again, or taking it back and publishing again, never sends a second one.
    publish(office, name)
    assert office.post(f"{ADMIN}/quotes/{quote['id']}/unpublish").status_code == 200
    publish(office, name)
    assert len(to(letters, address)) == 1


def test_the_email_is_in_the_language_the_owner_signed_up_in(client, office, letters):  # noqa: F811
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"], lang="ar")
    publish(office, name)
    letter = to(letters, address)[0]
    assert "سعرك من ALYR جاهز" in letter["subject"] and "ر.ق" in letter["subject"]
    assert "QAR" not in letter["subject"] + letter["text"] + letter["html"]
    assert 'dir="rtl"' in letter["html"]


def test_a_price_shown_at_sign_up_is_not_emailed(client, office, letters):  # noqa: F811
    office.put(f"{ADMIN}/pricing/types/salon",
               json={"availability": "self_serve", "price_mode": "automatic"})
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    assert client.get(f"{BASE}/quote").json()["status"] == "published"
    # The owner saw it on their screen when they signed up; publishing it again says nothing.
    publish(office, name)
    assert not to(letters, address)


def test_publishing_works_with_mail_unconfigured_or_an_address_that_cannot_be_real(
    client, office, monkeypatch
):
    monkeypatch.delenv("ALYR_EMAIL_API_KEY", raising=False)
    get_settings.cache_clear()
    sent: list[dict] = []
    monkeypatch.setattr(mail, "transport", httpx.MockTransport(
        lambda request: sent.append(json.loads(request.content)) or httpx.Response(200)))
    _, _, name = new_business(client, paid=False)
    quote = publish(office, name)
    assert not sent and notified(quote["id"]) is None

    # Mail on, but the address is one reserved for examples: nothing is sent or claimed.
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    office.post(f"{ADMIN}/quotes/{quote['id']}/unpublish")
    publish(office, name)
    assert not [m for m in sent if "price is ready" in m["subject"]]
    assert notified(quote["id"]) is None
    get_settings.cache_clear()


def test_a_refused_email_does_not_use_up_the_notice(client, office, monkeypatch):
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    answers = iter([503, 200])
    seen: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "price is ready" not in body["subject"]:
            return httpx.Response(200, json={"id": "x"})
        seen.append(body)
        return httpx.Response(next(answers), json={"id": "x"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    quote = publish(office, name)  # the provider refuses; the publishing still stands
    assert open_quote(client_of(office, name))["status"] == "published"
    assert notified(quote["id"]) is None
    office.post(f"{ADMIN}/quotes/{quote['id']}/unpublish")
    publish(office, name)
    assert [m["to"] for m in seen] == [[address], [address]]
    assert notified(quote["id"]) is not None
    get_settings.cache_clear()


# ── CJ-5: an accepted, unpaid client is on Today ─────────────


def test_today_lists_a_client_who_accepted_and_has_not_paid(client, office):
    _, _, name = new_business(client, paid=False)
    client_id = client_of(office, name)["id"]
    assert not waiting(office, client_id, "payment")  # nothing is due before the price is accepted
    accept_price(client, office, name)
    (item,) = waiting(office, client_id, "payment")
    due = payment(client)
    assert due["status"] == "unpaid"
    assert item["title"].endswith("accepted: waiting for payment")
    # It carries the reference the client writes on the transfer, and what is still to pay.
    assert due["reference"] in item["detail"] and due["left_text"] in item["detail"]
    # No bank details are set in tests, so staff are told to send them.
    assert "email them" in item["detail"]

    # Part of the money does not clear it; all of it does.
    assert pay(office, client_id, 1000).status_code == 200
    (item,) = waiting(office, client_id, "payment")
    assert "still to pay" in item["detail"]
    assert pay(office, client_id, due["due"] - 1000).status_code == 200
    assert not waiting(office, client_id, "payment")


def test_a_waived_client_is_not_waiting_for_payment(client, office):
    _, _, name = new_business(client, paid=False)
    client_id = client_of(office, name)["id"]
    accept_price(client, office, name)
    assert waiting(office, client_id, "payment")
    waived = office.post(f"{ADMIN}/clients/{client_id}/waive", json={"reason": "Pilot"})
    assert waived.status_code == 200
    assert not waiting(office, client_id, "payment")


def test_the_bank_details_value_is_never_in_the_item(client, office, monkeypatch):
    monkeypatch.setenv("ALYR_BANK_TRANSFER_DETAILS", "FICTIONAL BANK 0000 0000")
    get_settings.cache_clear()
    _, _, name = new_business(client, paid=False)
    client_id = client_of(office, name)["id"]
    accept_price(client, office, name)
    (item,) = waiting(office, client_id, "payment")
    assert "FICTIONAL" not in json.dumps(item)
    assert "shows them the bank details" in item["detail"]
    get_settings.cache_clear()


# ── CJ-24: the onboarding board follows a payment ────────────


def test_recording_a_payment_updates_the_onboarding_board_at_once(client, office):
    tenant, _, name = new_business(client, paid=False)
    accept_price(client, office, name)
    check(client)  # the board shows what the last check saw
    row = next(b for b in board(office)["businesses"] if b["id"] == tenant)
    assert "paid" in row["left"]
    client_id = client_of(office, name)["id"]
    assert pay(office, client_id, payment(client)["due"]).status_code == 200
    row = next(b for b in board(office)["businesses"] if b["id"] == tenant)
    assert "paid" not in row["left"]  # no "Check now" needed
    assert line(check(client), "paid")["status"] == "done"


# ── CJ-15: switching a product on shows its price and tells staff ──


def test_switching_a_product_on_shows_the_price_and_needs_a_confirmation(client, office):
    _, _, name = new_business(client, paid=False)
    accounts = product(shell(client), "accounts")
    assert accounts["status"] == "available"
    # The extra-product price from the price list (D-035), as the quote would charge it.
    assert accounts["adds"] == {
        "monthly": 5000, "monthly_text": "QAR 50", "monthly_text_ar": "50 ر.ق",
    }
    # An included product shows no price to add.
    assert product(shell(client), "agent")["adds"] is None

    # No confirmation, or a different amount than the one shown: nothing is switched on.
    assert client.post("/api/workspace/products/accounts/enable").status_code == 409
    wrong = client.post("/api/workspace/products/accounts/enable", json={"confirm_monthly": 0})
    assert wrong.status_code == 409 and "QAR 50 a month" in wrong.json()["detail"]
    assert product(shell(client), "accounts")["status"] == "available"
    client_id = client_of(office, name)["id"]
    assert not waiting(office, client_id, "change")

    assert switch_on(client, "accounts").status_code == 200
    assert product(shell(client), "accounts")["status"] == "active"
    (item,) = waiting(office, client_id, "change")
    assert "ALYR Accounts" in item["detail"] and "QAR 50 a month" in item["detail"]
    # It is not shown as a call for help.
    assert not waiting(office, client_id, "request")

    # Off and on again leaves one item, not two.
    client.post("/api/workspace/products/accounts/disable")
    assert switch_on(client, "accounts").status_code == 200
    assert len(waiting(office, client_id, "change")) == 1


def test_only_an_owner_or_admin_can_switch_a_product_on(client):
    sign_in(client, AGENT_EMAIL)
    assert client.post("/api/workspace/products/accounts/enable").status_code == 403
