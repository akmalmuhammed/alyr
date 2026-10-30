"""A shop's own payment account, through the simulator gateway (ALY-17, specs/033-payment-adapters).

The whole path over HTTP: the owner pastes keys, a job checks them, a payment link is made on the
account, a job asks the provider for its page, the provider's signed webhook comes in, a job asks
the provider what happened, and only then is the payment paid and the customer told.
"""

import re
from uuid import UUID, uuid4

import pytest

from alyr.config import Settings
from alyr.core import payment_keys
from alyr.gateways import registry
from alyr.gateways.simulator import SIGNATURE, sign
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID
from test_consent import ahmed, owner_sql, say
from test_sign_in import sign_in

KEY = "sim_test_key_7781"


def connect(client, key=KEY, provider="simulator"):
    return client.post(
        "/api/payments/account", json={"provider": provider, "keys": {"secret_key": key}}
    )


def pay_link(client):
    body = say(client, AHMED_PHONE, reply_id="pay")[-1]["body"]
    return re.search(r"/pay/(\S+)/(\S+)", body).groups()


def last_message(client):
    return client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]


def test_keys_are_checked_by_a_job_and_never_come_back(client):
    answer = connect(client)
    assert answer.status_code == 202
    # Answered at once; the job that called the provider ran after the commit.
    assert answer.json()["account"]["status"] == "checking"
    account = client.get("/api/payments/account").json()["account"]
    assert account["status"] == "connected"
    assert account["provider"] == "simulator"
    assert account["key_hint"] == "7781"
    assert account["webhook_url"] == (
        f"http://web.test/api/payments/hooks/{DEMO_TENANT_ID}/{account['id']}"
    )
    assert KEY not in answer.text and KEY not in client.get("/api/payments/account").text
    # Stored sealed: the keys are not in the row, and a sealed value moved to another row
    # does not open.
    row = owner_sql("select id, sealed_keys from payment_accounts where id = $1",
                    UUID(account["id"]))[0]
    assert KEY.encode() not in bytes(row["sealed_keys"])
    assert payment_keys.unseal(DEMO_TENANT_ID, row["id"], row["sealed_keys"]) == {
        "secret_key": KEY
    }
    with pytest.raises(payment_keys.KeysUnreadable):
        payment_keys.unseal(DEMO_TENANT_ID, uuid4(), row["sealed_keys"])
    with pytest.raises(payment_keys.KeysUnreadable):
        payment_keys.unseal(uuid4(), row["id"], row["sealed_keys"])


def test_wrong_keys_say_so_in_one_word(client):
    connect(client, "not-a-key-at-all")
    account = client.get("/api/payments/account").json()["account"]
    assert (account["status"], account["problem"]) == ("failed", "bad_keys")
    # A failed account takes no payment links: the stand-in, as before.
    tenant_id, payment_id = pay_link(client)
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["stand_in"] is True


def test_a_provider_that_is_down_is_tried_again_then_marked_unavailable(client):
    connect(client, "sim_down_1234")
    account = client.get("/api/payments/account").json()["account"]
    # The first try failed and the job waits to try again; the account is still checking.
    assert account["status"] == "checking"
    job = owner_sql(
        "select status, attempts from jobs where kind = 'payments.check_account' "
        "and payload->>'account_id' = $1", account["id"],
    )[0]
    assert (job["status"], job["attempts"]) == ("queued", 1)
    service = client.app.state.payments
    client.portal.call(service.check_gave_up, DEMO_TENANT_ID, {"account_id": account["id"]})
    account = client.get("/api/payments/account").json()["account"]
    assert (account["status"], account["problem"]) == ("failed", "unavailable")


def test_what_the_api_refuses(client):
    assert connect(client, provider="nobody").json()["detail"] == {"code": "unknown_provider"}
    missing = client.post(
        "/api/payments/account", json={"provider": "simulator", "keys": {"secret_key": " "}}
    )
    assert (missing.status_code, missing.json()["detail"]) == (422, {"code": "missing_field"})
    assert connect(client, "sim_" + "x" * 600).status_code == 422
    assert client.get("/api/payments/account").json()["account"] is None


def test_only_owners_and_admins_and_only_signed_in(client_factory, monkeypatch):
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    for call in (
        lambda: agent.get("/api/payments/providers"),
        lambda: agent.get("/api/payments/account"),
        lambda: connect(agent),
        lambda: agent.delete("/api/payments/account"),
    ):
        assert call().status_code == 403
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    stranger = client_factory()
    assert stranger.get("/api/payments/account").status_code == 401
    assert connect(stranger).status_code == 401


def test_a_payment_goes_through_the_provider_and_only_its_answer_marks_it_paid(client):
    connect(client)
    tenant_id, payment_id = pay_link(client)
    details = client.get(f"/api/pay/{tenant_id}/{payment_id}").json()
    assert (details["stand_in"], details["preparing"], details["unavailable"]) == (
        False, False, False
    )
    assert details["provider"] == "simulator"
    ref = re.search(r"\?sim=(\S+)$", details["checkout_url"]).group(1)
    assert details["checkout_url"].startswith(f"http://web.test/pay/{tenant_id}/{payment_id}")
    # The stand-in's button cannot pay a provider's payment.
    assert client.post(f"/api/pay/{tenant_id}/{payment_id}/complete").status_code == 409

    paid = client.post(f"/sim/gateway/{ref}/pay").json()
    assert paid == {"webhook_status": 200, "webhook": {"status": "accepted"}}
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["status"] == "paid"
    assert last_message(client)["body"].startswith("Received QAR 1,850.")
    assert ahmed(client)["balance"] == 0


def test_a_webhook_is_believed_once_and_only_with_the_shops_keys(client):
    connect(client)
    tenant_id, payment_id = pay_link(client)
    account_id = client.get("/api/payments/account").json()["account"]["id"]
    ref = owner_sql("select provider_ref from payment_requests where id = $1",
                    UUID(payment_id))[0]["provider_ref"]
    url = f"/api/payments/hooks/{tenant_id}/{account_id}"
    body = f'{{"event_id": "evt_1", "ref": "{ref}"}}'.encode()

    # Signed with other keys, or for another shop's address: refused, nothing written.
    forged = client.post(url, content=body, headers={SIGNATURE: sign("sim_other_key", body)})
    assert forged.status_code == 401
    elsewhere = client.post(
        f"/api/payments/hooks/{uuid4()}/{account_id}", content=body,
        headers={SIGNATURE: sign(KEY, body)},
    )
    assert elsewhere.status_code == 401
    assert owner_sql("select count(*) as n from payment_events")[0]["n"] == 0

    # The provider has not taken the money yet: the webhook is recorded, the payment waits.
    good = client.post(url, content=body, headers={SIGNATURE: sign(KEY, body)})
    assert good.json() == {"status": "accepted"}
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["status"] == "pending"
    again = client.post(url, content=body, headers={SIGNATURE: sign(KEY, body)})
    assert again.json() == {"status": "duplicate"}
    # About no payment of ours: recorded, nothing done.
    other = b'{"event_id": "evt_2", "ref": "simpay_unknown"}'
    assert client.post(url, content=other, headers={SIGNATURE: sign(KEY, other)}).json() == {
        "status": "ignored"
    }


def test_a_payment_for_another_amount_is_not_marked_paid(client):
    connect(client)
    tenant_id, payment_id = pay_link(client)
    ref = client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["checkout_url"].split("=")[1]
    client.post(f"/sim/gateway/{ref}/pay", json={"amount": 100})
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["status"] == "pending"
    row = owner_sql("select gateway_status from payment_requests where id = $1",
                    UUID(payment_id))[0]
    assert row["gateway_status"] == "amount_mismatch"
    assert ahmed(client)["balance"] == 185000


def test_disconnecting_wipes_the_keys_and_new_links_go_back_to_the_stand_in(client):
    connect(client)
    tenant_id, sent_before = pay_link(client)
    assert client.delete("/api/payments/account").json() == {"disconnected": True}
    assert client.get("/api/payments/account").json()["account"] is None
    assert owner_sql(
        "select count(*) as n from payment_accounts where sealed_keys is not null"
    )[0]["n"] == 0
    # A link sent on the old account can no longer be confirmed by ALYR, and says so.
    old = client.get(f"/api/pay/{tenant_id}/{sent_before}").json()
    assert (old["unavailable"], old["preparing"]) == (True, False)
    _, sent_after = pay_link(client)
    assert client.get(f"/api/pay/{tenant_id}/{sent_after}").json()["stand_in"] is True


def test_connecting_again_replaces_the_old_account(client):
    connect(client)
    first = client.get("/api/payments/account").json()["account"]["id"]
    connect(client, "sim_second_key_0042")
    account = client.get("/api/payments/account").json()["account"]
    assert account["id"] != first and account["key_hint"] == "0042"
    rows = owner_sql("select status, sealed_keys from payment_accounts where id = $1",
                     UUID(first))
    assert rows[0]["status"] == "disconnected" and rows[0]["sealed_keys"] is None


def test_production_offers_no_provider_until_a_real_one_exists():
    assert registry(Settings(env="production")) == {}
    assert "simulator" in registry(Settings(env="local"))


def test_production_without_a_sealing_key_refuses_to_seal(monkeypatch):
    from alyr.config import get_settings

    monkeypatch.setenv("ALYR_ENV", "production")
    monkeypatch.setenv("ALYR_PAYMENT_KEYS_KEY", "")
    get_settings.cache_clear()
    try:
        assert payment_keys.ready() is False
        with pytest.raises(payment_keys.KeysKeyMissing):
            payment_keys.seal(DEMO_TENANT_ID, uuid4(), {"secret_key": KEY})
        monkeypatch.setenv("ALYR_PAYMENT_KEYS_KEY", "c2hvcnQ=")  # "short": not 32 bytes
        get_settings.cache_clear()
        assert payment_keys.ready() is False
    finally:
        get_settings.cache_clear()


def test_an_order_paid_at_the_provider_is_settled_and_its_stock_sold(client):
    from test_orders import customer, place, product

    connect(client)
    cable = product(client, "Cable 2.5 mm")
    order = place(client, customer(client)["id"], [(cable, 2)], "link").json()
    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", order["pay_url"]).groups()
    details = client.get(f"/api/pay/{tenant_id}/{payment_id}").json()
    assert details["order_number"] == order["number"]
    ref = details["checkout_url"].split("?sim=")[1]
    client.post(f"/sim/gateway/{ref}/pay")
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["status"] == "paid"
    assert owner_sql("select payment from orders where tenant_id = $1 and number = $2",
                     DEMO_TENANT_ID, order["number"])[0]["payment"] == "paid"
    assert last_message(client)["body"] == (
        f"We received QAR 450 for order {order['number']}. Thank you."
    )


def test_keys_that_no_longer_open_turn_the_account_to_connect_again(client):
    connect(client)
    account_id = UUID(client.get("/api/payments/account").json()["account"]["id"])
    # As if the sealing key had changed: the stored value no longer opens.
    owner_sql("update payment_accounts set sealed_keys = $2 where id = $1",
              account_id, payment_keys.VERSION + bytes(40))
    tenant_id, payment_id = pay_link(client)
    account = client.get("/api/payments/account").json()["account"]
    assert (account["status"], account["problem"]) == ("failed", "keys_unreadable")
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["unavailable"] is True
    # The next link is the stand-in again.
    _, after = pay_link(client)
    assert client.get(f"/api/pay/{tenant_id}/{after}").json()["stand_in"] is True
