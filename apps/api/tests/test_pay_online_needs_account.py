"""A payment link only where it can take money (ALY-271).

In production no shop has its own payment account yet, and the stand-in payment page answers
"Test payment page. No money moves." So a shop that chose "Customers pay online" sent every
customer to a page that could not be paid. Now the link is offered only once the shop's own
account is connected, or on a developer machine, where the stand-in plays the provider.
`ALYR_STAND_IN_PAYMENTS=false` shows a developer machine what production gets. Every test goes
through the real path: HTTP in, real PostgreSQL, the chat on the simulator."""

import re
from uuid import UUID

import pytest

from alyr.core.normalise import shown_name
from alyr.seed import AHMED_PHONE, DEMO_SLUG
from test_consent import owner_sql
from test_items import counted, line, order
from test_orders import STORE, customer
from test_readiness import check, step
from test_readiness import line as check_line

WAYS = "/api/orders-payment-ways"


@pytest.fixture
def production_like(client_factory, monkeypatch):
    """A shop with no payment account of its own and no stand-in: what production has today."""
    monkeypatch.setenv("ALYR_STAND_IN_PAYMENTS", "false")
    return client_factory()


def test_with_no_account_customers_pay_on_collection_whatever_was_saved(production_like):
    client = production_like
    # The demo shop saved nothing, which used to mean "online" (D-055).
    assert client.get(WAYS).json() == {
        "online": False, "ways": ["cash", "bank_transfer"], "online_possible": False,
    }
    assert client.get(STORE).json()["settings"]["pay"] == {
        "online": False, "ways": ["cash", "bank_transfer"],
    }


def test_an_order_asked_for_by_link_is_placed_unpaid_with_no_link(production_like):
    client = production_like
    cake = counted(client, 10, name="Honey cake", name_ar="كعكة عسل", price=4500)
    placed = order(client, customer(client, AHMED_PHONE), [line(cake, 2)], "link")
    assert placed.status_code == 200, placed.text
    body = placed.json()
    assert body["payment"] == "later" and body["pay_url"] is None
    assert owner_sql("select 1 from payment_requests where order_id = $1",
                     UUID(body["order_id"])) == []


def test_the_owner_cannot_switch_the_link_on(production_like):
    client = production_like
    answer = client.put(WAYS, json={"online": True})
    assert answer.status_code == 422
    assert "Online payment needs your own account" in answer.json()["detail"]
    # Choosing the ways they take on collection still works.
    kept = client.put(WAYS, json={"online": False, "ways": ["cash", "card_terminal"]})
    assert kept.json() == {
        "online": False, "ways": ["cash", "card_terminal"], "online_possible": False,
    }


def test_the_go_live_list_offers_only_cash_and_transfer(production_like):
    from test_onboarding import new_business

    client = production_like
    new_business(client)
    payments = check_line(check(client), "payments")
    assert payments["choices"] == ["cash_transfer"]
    refused = step(client, "payments", choice="online")
    assert refused.status_code in (400, 422) and "cash_transfer" in refused.text
    assert step(client, "payments", choice="cash_transfer").status_code == 200


def test_a_shop_that_saved_online_before_is_paid_on_collection_now(production_like):
    client = production_like
    owner_sql("insert into shop_settings (tenant_id, pay_online, pay_later_ways) "
              "select id, true, '{}' from tenants where slug = $1 "
              "on conflict (tenant_id) do update set pay_online = true, pay_later_ways = '{}'",
              DEMO_SLUG)
    assert client.get(WAYS).json()["online"] is False


def test_on_a_developer_machine_the_stand_in_still_plays_the_provider(client):
    from test_onboarding import new_business

    assert client.get(WAYS).json()["online_possible"] is True
    new_business(client)
    assert check_line(check(client), "payments")["choices"] == ["cash_transfer", "online"]


# ── a credit-account customer in the chat ─────────────────────────────────────────────


def chat(client, text="", reply_id=""):
    from test_simulator import say

    return say(client, AHMED_PHONE, text, reply_id)[-1]


def test_a_credit_customer_is_told_how_to_pay_the_shop_not_sent_a_link(production_like):
    client = production_like
    before = owner_sql("select count(*)::int as n from payment_requests")[0]["n"]
    answer = chat(client, "pay")
    assert answer["body"].startswith("Your balance is QAR ")
    assert "You can pay us by cash or bank transfer" in answer["body"]
    assert "/pay/" not in answer["body"]
    assert owner_sql("select count(*)::int as n from payment_requests")[0]["n"] == before


def test_the_credit_menu_and_balance_offer_no_pay_now_button(production_like):
    client = production_like
    menu = chat(client, "hello")
    assert [c["id"] for c in menu["payload"]["choices"]] == ["order", "balance"]
    balance = chat(client, reply_id="balance")
    assert balance["body"].startswith("Your balance is") and not balance["payload"].get("choices")


def test_on_a_developer_machine_a_credit_customer_still_gets_the_stand_in_link(client):
    assert "/pay/" in chat(client, "pay")["body"]
    assert [c["id"] for c in chat(client, "hello")["payload"]["choices"]] == [
        "order", "balance", "pay",
    ]


# ── reminders, and a name that is only a phone number ────────────────────────────────────


def test_a_reminder_says_how_to_pay_the_shop_with_no_link(production_like):
    client = production_like
    before = owner_sql("select count(*)::int as n from payment_requests")[0]["n"]
    assert client.post("/api/ledger/reminders", json={"min_days": 30}).json()["sent"] >= 1
    reminder = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
    assert reminder["payload"]["template"] == "payment_reminder_offline"
    assert "/pay/" not in reminder["body"] and "QAR 1,850" in reminder["body"]
    assert "You can pay us by cash or bank transfer" in reminder["body"]
    assert reminder["payload"]["params"][3] == (
        "You can pay us by cash or bank transfer, and we will record it on your account.")
    assert [c["id"] for c in reminder["payload"]["choices"]] == ["promise"]
    assert owner_sql("select count(*)::int as n from payment_requests")[0]["n"] == before
    # The weekly figures count it as a reminder like the others.
    from alyr.modules.ledger.report import REMINDERS

    assert "payment_reminder_offline" in REMINDERS


def test_on_a_developer_machine_a_reminder_still_carries_the_stand_in_link(client):
    assert client.post("/api/ledger/reminders", json={"min_days": 30}).json()["sent"] >= 1
    reminder = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
    assert reminder["payload"]["template"] == "payment_reminder"
    assert "/pay/" in reminder["body"]


def test_a_phone_number_is_never_printed_as_the_customers_name(client):
    assert shown_name("+97455501234") == "" and shown_name("+974 5550 1234") == ""
    assert shown_name("Ahmed Al-Kuwari") == "Ahmed Al-Kuwari" and shown_name(None) == ""
    # A customer with no WhatsApp profile name is stored as "+<phone>" (core/identity.py).
    owner_sql("update contacts set name = $1 where phone = $2", f"+{AHMED_PHONE}", AHMED_PHONE)
    link = re.search(r"/pay/(\S+)/(\S+)", chat(client, "pay")["body"])
    details = client.get(f"/api/pay/{link.group(1)}/{link.group(2)}").json()
    assert details["customer"] == "" and AHMED_PHONE not in str(details)
