"""Nothing is paid first (ALY-242, D-053): a new client's workspace is open at sign-up. The
setup fee and the first period of the accepted price are asked at go-live, and the readiness
check `paid` stays open until ALYR has recorded them (or waived them)."""

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


def test_a_new_business_is_open_at_once_and_its_plan_comes_after_trying(client):
    new_business(client, paid=False)
    state = client.get(f"{BASE}/state").json()
    assert state["step"] == "services"
    assert state["steps"] == ["services", "hours", "try", "plan", "golive"]
    assert "open" not in client.get("/api/workspace").json()
    # Every product's screens and API answer, with nothing paid.
    for path in ("/api/services", "/api/bookings", "/api/hours"):
        assert client.get(path).status_code == 200, path
    assert client.get(f"{BASE}/quote").status_code == 200
    due = payment(client)
    assert (due["status"], due["due"]) == ("no_price", 0)
    # It is the go-live that waits for the payment, not the workspace.
    assert line(client.get(f"{BASE}/readiness").json(), "paid")["status"] == "todo"


def test_paying_what_is_due_settles_the_go_live_check(client, office):
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

    # Part of it does not settle anything yet.
    part = pay(office, client_id, 1000).json()
    assert (part["status"], part["paid"], part["left"]) == ("unpaid", 1000, due["due"] - 1000)
    assert line(client.get(f"{BASE}/readiness").json(), "paid")["status"] == "todo"

    rest = pay(office, client_id, due["due"] - 1000, method="cash", reference="").json()
    assert rest["status"] == "paid"
    assert line(client.get(f"{BASE}/readiness").json(), "paid")["status"] == "done"
    mine = payment(client)
    assert [p["amount"] for p in mine["payments"]] == [1000, due["due"] - 1000]

    audit = office.get(f"{ADMIN}/audit").json()["entries"]
    assert [e["action"] for e in audit[:2]] == ["client.payment", "client.payment"]
    assert audit[0]["detail"]["covered"] is True and audit[1]["detail"]["covered"] is False
    # More money later never unsettles it.
    assert pay(office, client_id, 500).json()["status"] == "paid"


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


def test_alyr_can_waive_the_payment_and_must_say_why(client, office):
    _, _, name = new_business(client, paid=False)
    client_id = client_of(office, name)["id"]
    assert office.post(f"{ADMIN}/clients/{client_id}/waive", json={"reason": ""}).status_code == 422
    answer = office.post(
        f"{ADMIN}/clients/{client_id}/waive", json={"reason": "Pilot, agreed 23 Oct"}
    )
    assert answer.status_code == 200 and answer.json()["status"] == "paid"
    assert answer.json()["waived"] is True
    assert line(client.get(f"{BASE}/readiness").json(), "paid")["status"] == "done"
    assert office.get(f"{ADMIN}/audit").json()["entries"][0]["action"] == "client.payment_waived"
    assert client_of(office, name)["access"]["waived"] is True


def test_the_demo_shop_and_businesses_from_before_owe_nothing(client):
    # The suite's client is the seeded demo shop.
    assert client.get("/api/services").status_code == 200
    assert payment(client)["status"] == "paid"


def test_an_owner_sees_only_their_own_clients_payments(client, client_factory, office):
    _, _, name = new_business(client, paid=False)
    accept_price(client, office, name)
    pay(office, client_of(office, name)["id"], 1234)
    other = client_factory()
    new_business(other, paid=False)
    assert payment(other)["payments"] == [] and payment(other)["paid"] == 0
    assert owner_sql("select count(*) from client_payments where amount = 1234")[0][0] >= 1
