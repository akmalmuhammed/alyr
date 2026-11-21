"""A deposit is asked only where it can be paid (D-190).

In production no shop has its own payment account yet, and the stand-in payment page does not
exist there: its "Pay" button called a route that answers 404. A service with a deposit put the
time on hold for 30 minutes, sent a link that could not be paid, and gave the time back without
telling the owner. Now a service that asks a deposit the shop cannot take is not bookable by a
customer: the page says so, the API refuses before anything is held, sent or written, and the
owner's Services screen is told (`deposits_open`).

The rest of the suite runs as a developer machine, where the stand-in plays the provider.
`ALYR_STAND_IN_PAYMENTS=false` shows a developer machine what production gets, and the pay-page
tests also set `ALYR_ENV=production` itself once the app is built (the settings are read on every
request). Every test goes through the real routes and PostgreSQL."""

from uuid import UUID

import pytest

from alyr.config import get_settings
from alyr.modules.bookings import service
from order_links import booking_token
from pay_links import pay as pay_by_link
from pay_links import pay_page
from test_bookings import PAGE, service_id
from test_bookings_chairs_deposits import (
    book_as,
    booking_row,
    deposit_on,
    free,
    release,
    sent_to,
)
from test_consent import ahmed, owner_sql

SAID = service.DEPOSIT_UNAVAILABLE


@pytest.fixture
def production_like(client_factory, monkeypatch):
    """A shop with no payment account of its own and no stand-in: what production has today."""
    monkeypatch.setenv("ALYR_STAND_IN_PAYMENTS", "false")
    return client_factory()


@pytest.fixture
def link_secret(monkeypatch):
    """Production has no built-in link key: set one before the app is built, so a link made
    now still opens once the server answers as production."""
    monkeypatch.setenv("ALYR_LINK_SECRET", "test-secret-for-deposit-links-0123456789")


def as_production(monkeypatch) -> None:
    """From here on the server answers as production does (`ALYR_ENV=production`)."""
    monkeypatch.setenv("ALYR_ENV", "production")
    get_settings.cache_clear()


def pay_links_and_releases() -> tuple[int, int]:
    """How many deposit pay links and queued releases the database holds (the suite shares one
    database, so a test compares before and after rather than with zero)."""
    return (
        owner_sql("select count(*) as n from payment_requests "
                  "where booking_id is not null")[0]["n"],
        owner_sql("select count(*) as n from jobs where kind = 'booking_deposit_expiry' "
                  "and status = 'queued'")[0]["n"],
    )


def held_for(contact_id: str) -> int:
    return owner_sql("select count(*) as n from bookings where contact_id = $1",
                     UUID(contact_id))[0]["n"]


# ---------------------------------------------------------------- the customer's page and API

def test_a_service_with_a_deposit_cannot_be_booked_where_the_shop_cannot_take_it(production_like):
    client = production_like
    sid = service_id(client)
    deposit_on(client, sid, "fixed", 5_000)
    me = ahmed(client)
    start = free(client, sid)[0]
    before = held_for(me["id"])
    messages = len(sent_to(me["id"]))
    links_before = pay_links_and_releases()

    refused = book_as(client, me["id"], sid, start)
    assert refused.status_code == 409, refused.text
    detail = refused.json()["detail"]
    assert detail["code"] == "deposit_unavailable" and detail["message"] == SAID

    # Nothing was held, queued, sent or written: the time is still free, there is no pay link
    # and no release waiting, and the customer was not messaged.
    assert held_for(me["id"]) == before
    assert start in free(client, sid)
    assert pay_links_and_releases() == links_before
    assert len(sent_to(me["id"])) == messages


def test_the_booking_page_says_which_services_it_cannot_take_a_deposit_for(production_like):
    client = production_like
    sid = service_id(client)
    deposit_on(client, sid, "fixed", 5_000)
    page = client.get(PAGE, headers={"x-order-link": booking_token(ahmed(client)["id"])}).json()
    assert page["deposits_open"] is False
    asking = next(s for s in page["services"] if s["id"] == sid)
    assert (asking["deposit"], asking["deposit_open"]) == (5_000, False)
    others = [s for s in page["services"] if s["id"] != sid]
    assert others and all(s["deposit_open"] for s in others)


def test_a_service_without_a_deposit_is_booked_as_before(production_like):
    client = production_like
    me = ahmed(client)
    sid = service_id(client)
    deposit_on(client, sid, "none", 0)
    made = book_as(client, me["id"], sid, free(client, sid)[0])
    assert made.status_code == 200, made.text
    assert made.json()["deposit"] is None
    assert booking_row(made.json()["id"])["deposit_state"] == "none"


def test_where_a_deposit_can_be_paid_nothing_changes(client):
    sid = service_id(client)
    deposit_on(client, sid, "fixed", 5_000)
    page = client.get(PAGE).json()
    assert page["deposits_open"] is True
    assert next(s for s in page["services"] if s["id"] == sid)["deposit_open"] is True
    made = book_as(client, ahmed(client)["id"], sid, free(client, sid)[0])
    assert made.status_code == 200 and made.json()["deposit"]["amount"] == 5_000


def test_the_chat_sends_a_booking_link_and_the_link_is_where_it_is_refused(production_like):
    """The chat does not book by itself: "book" sends a signed link to the page. The refusal
    is made where the booking is, so no way to it can hold a time for a deposit."""
    client = production_like
    sid = service_id(client)
    deposit_on(client, sid, "percent", 20)
    refused = book_as(client, ahmed(client)["id"], sid, free(client, sid)[0])
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "deposit_unavailable"


def test_a_staff_booking_for_a_service_with_a_deposit_is_still_written_down(production_like):
    """Staff write a visit down at the desk with no deposit (spec 043); that is not refused."""
    client = production_like
    sid = service_id(client)
    deposit_on(client, sid, "fixed", 5_000)
    made = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": free(client, sid)[0], "contact_id": ahmed(client)["id"]})
    assert made.status_code == 200, made.text
    assert booking_row(made.json()["id"])["deposit_state"] == "none"


# ---------------------------------------------------------------------------- the owner's screen

def test_the_owners_service_list_says_whether_a_deposit_can_be_paid(client_factory, monkeypatch):
    here = client_factory()
    assert here.get("/api/services").json()["deposits_open"] is True
    monkeypatch.setenv("ALYR_STAND_IN_PAYMENTS", "false")
    production = client_factory()
    answer = production.get("/api/services").json()
    assert answer["deposits_open"] is False and answer["services"]


# ------------------------------------------------------------------- the pay page and its route

def test_in_production_the_pay_page_of_an_old_link_has_no_pay_button(
    link_secret, client, monkeypatch,
):
    """A deposit link made before this change (a booking still holding its time): its page
    says it cannot be used, never "Pay", and the route behind the button does not answer."""
    sid = service_id(client)
    deposit_on(client, sid, "fixed", 5_000)
    made = book_as(client, ahmed(client)["id"], sid, free(client, sid)[0]).json()
    path = made["deposit"]["pay_path"]
    assert pay_page(client, path).json()["stand_in"] is True  # a developer machine

    as_production(monkeypatch)
    page = pay_page(client, path).json()
    assert page["status"] == "pending"
    assert (page["stand_in"], page["unavailable"], page["preparing"]) == (False, True, False)
    assert page["checkout_url"] is None
    assert pay_by_link(client, path).status_code == 404
    assert booking_row(made["id"])["deposit_state"] == "due"  # nothing was paid


def test_the_complete_route_needs_the_stand_in_even_on_a_developer_machine(client_factory,
                                                                          monkeypatch):
    client = client_factory()
    sid = service_id(client)
    deposit_on(client, sid, "fixed", 5_000)
    made = book_as(client, ahmed(client)["id"], sid, free(client, sid)[0]).json()
    monkeypatch.setenv("ALYR_STAND_IN_PAYMENTS", "false")
    get_settings.cache_clear()
    assert pay_by_link(client, made["deposit"]["pay_path"]).status_code == 404
    monkeypatch.setenv("ALYR_STAND_IN_PAYMENTS", "true")
    get_settings.cache_clear()
    assert pay_by_link(client, made["deposit"]["pay_path"]).status_code == 200


def test_a_hold_that_was_already_running_is_still_released_and_the_customer_told(
    link_secret, client, monkeypatch,
):
    """Nothing is silent for a booking made before this change: the time is given back at the
    end of its hold and the customer is told, as before."""
    sid = service_id(client)
    deposit_on(client, sid, "fixed", 5_000)
    me = ahmed(client)
    start = free(client, sid)[0]
    made = book_as(client, me["id"], sid, start).json()
    as_production(monkeypatch)
    owner_sql("update bookings set hold_until = now() - interval '1 minute' where id = $1",
              UUID(made["id"]))
    assert release(client) == 1
    assert booking_row(made["id"])["deposit_state"] == "expired"
    assert "was released because the deposit was not paid" in sent_to(me["id"])[-1]["body"]
