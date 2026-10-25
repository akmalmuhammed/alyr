"""Pay before access (ALY-212, D-051): a new client's products stay locked until ALYR has
their payment for the setup fee and the first period of the price they accepted."""

from datetime import date, timedelta

import pytest

from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_pricing import ADMIN, client_of
from test_readiness import accept_price, line


@pytest.fixture
def office(client_factory):
    return client_factory()


def pay(office, client_id, amount, **body):
    return office.post(
        f"{ADMIN}/clients/{client_id}/payments",
        json={"amount": amount, "method": "bank_transfer", "reference": "TRF 1029",
              "received_on": date.today().isoformat()} | body,
    )


def payment(client):
    answer = client.get(f"{BASE}/payment")
    assert answer.status_code == 200, answer.text
    return answer.json()


def test_a_new_business_starts_locked_and_its_price_comes_first(client):
    new_business(client, paid=False)
    state = client.get(f"{BASE}/state").json()
    assert state["step"] == "plan" and state["steps"][0] == "plan"
    assert client.get("/api/workspace").json()["open"] is False
    # Every product's screens and API answer 402 until it is paid.
    for path in ("/api/services", "/api/bookings", "/api/hours"):
        assert client.get(path).status_code == 402, path
    # The setup itself, the price and the go-live list stay reachable.
    assert client.get(f"{BASE}/quote").status_code == 200
    assert client.get(f"{BASE}/readiness").status_code == 200
    due = payment(client)
    assert (due["status"], due["open"], due["due"]) == ("no_price", False, 0)


def test_paying_what_is_due_opens_every_product_once(client, office):
    tenant, _, name = new_business(client, paid=False)
    accept_price(client, office, name)
    due = payment(client)
    assert due["status"] == "unpaid" and due["due"] > 0
    assert due["due"] == owner_sql(
        "select sum(l.quantity * l.unit_price) from quote_lines l join quotes q on q.id = "
        "l.quote_id where q.status = 'accepted' and q.client_id = "
        "(select client_id from tenants where id = $1)", tenant,
    )[0][0]  # one month: setup plus the monthly lines, nothing taken off
    assert due["reference"].startswith("ALYR-")
    client_id = client_of(office, name)["id"]

    # Part of it does not open anything yet.
    part = pay(office, client_id, 1000).json()
    assert (part["open"], part["paid"], part["left"]) == (False, 1000, due["due"] - 1000)
    assert client.get("/api/services").status_code == 402
    assert line(client.get(f"{BASE}/readiness").json(), "paid")["status"] == "todo"

    rest = pay(office, client_id, due["due"] - 1000, method="cash", reference="").json()
    assert rest["open"] and rest["status"] == "open"
    assert client.get("/api/services").status_code == 200
    assert client.get("/api/workspace").json()["open"] is True
    assert line(client.get(f"{BASE}/readiness").json(), "paid")["status"] == "done"
    mine = payment(client)
    assert [p["amount"] for p in mine["payments"]] == [1000, due["due"] - 1000]

    audit = office.get(f"{ADMIN}/audit").json()["entries"]
    assert [e["action"] for e in audit[:2]] == ["client.payment", "client.payment"]
    assert audit[0]["detail"]["opened"] is True and audit[1]["detail"]["opened"] is False
    # More money later never closes it, and never opens it twice.
    assert pay(office, client_id, 500).json()["open"] is True
    assert office.get(f"{ADMIN}/audit").json()["entries"][0]["detail"]["opened"] is False


def test_nothing_is_recorded_before_a_price_is_accepted_or_in_the_future(client, office):
    _, _, name = new_business(client, paid=False)
    client_id = client_of(office, name)["id"]
    answer = pay(office, client_id, 1000)
    assert answer.status_code == 422 and "price" in answer.json()["detail"]
    accept_price(client, office, name)
    tomorrow = (date.today() + timedelta(days=2)).isoformat()
    assert pay(office, client_id, 1000, received_on=tomorrow).status_code == 422
    assert pay(office, client_id, 0).status_code == 422
    assert pay(office, client_id, 1000, method="card_number").status_code == 422
    assert pay(office, "00000000-0000-0000-0000-000000000000", 1000).status_code == 404


def test_alyr_can_open_it_without_a_payment_and_must_say_why(client, office):
    _, _, name = new_business(client, paid=False)
    client_id = client_of(office, name)["id"]
    assert office.post(f"{ADMIN}/clients/{client_id}/open", json={"reason": ""}).status_code == 422
    answer = office.post(
        f"{ADMIN}/clients/{client_id}/open", json={"reason": "Pilot, agreed 23 Oct"}
    )
    assert answer.status_code == 200 and answer.json()["open"] is True
    assert client.get("/api/services").status_code == 200
    assert office.get(f"{ADMIN}/audit").json()["entries"][0]["action"] == "client.opened"
    assert client_of(office, name)["access"]["open"] is True


def test_the_demo_shop_and_businesses_from_before_stay_open(client):
    # The suite's client is the seeded demo shop.
    assert client.get("/api/workspace").json()["open"] is True
    assert payment(client)["open"] is True


def test_an_owner_sees_only_their_own_clients_payments(client, client_factory, office):
    _, _, name = new_business(client, paid=False)
    accept_price(client, office, name)
    pay(office, client_of(office, name)["id"], 1234)
    other = client_factory()
    new_business(other, paid=False)
    assert payment(other)["payments"] == [] and payment(other)["paid"] == 0
    assert owner_sql("select count(*) from client_payments where amount = 1234")[0][0] >= 1
