"""How a business gets onto WhatsApp (ALY-217, D-050): the way it chooses, what each way
needs ready, and where ALYR is with connecting it, as the owner and the back office see it."""

import pytest

from alyr.config import get_settings
from alyr.core import whatsapp_setup
from alyr.seed import AGENT_EMAIL
from test_onboarding import BASE, new_business
from test_pricing import ADMIN
from test_readiness import connect_whatsapp, events, line, on_board
from test_sign_in import sign_in


@pytest.fixture
def office(client_factory):
    return client_factory()


def setup(client, **body):
    return client.patch(f"{BASE}/whatsapp", json=body)


def wa(state):
    return line(state, "whatsapp")


def open_ways(monkeypatch, ways):
    monkeypatch.setenv("ALYR_WHATSAPP_WAYS_OPEN", ways)
    get_settings.cache_clear()


MOVE_TICKS = ["app_version", "phone_at_hand", "limits", "portfolio", "meta_card"]


def test_choosing_a_way_lists_what_it_needs_and_the_step_stays_the_owners(client):
    new_business(client)
    state = setup(client, way="move_number").json()
    step = wa(state)
    assert step["status"] == "todo" and step["setup"]["status"] == "preparing"
    assert [n["key"] for n in step["setup"]["needs"]] == ["number", *MOVE_TICKS]
    assert all(n["label"]["ar"] for n in step["setup"]["needs"])
    assert not any(n["done"] for n in step["setup"]["needs"])

    # Half ready is still the owner's to do.
    step = wa(setup(client, phone="5555 0101", ready=["app_version", "limits"]).json())
    assert step["setup"]["phone"] == "+97455550101"
    assert step["status"] == "todo"
    assert {n["key"] for n in step["setup"]["needs"] if n["done"]} == {
        "number", "app_version", "limits",
    }


def test_with_everything_ready_it_waits_on_meta_until_alyr_can_connect_that_way(
    client, monkeypatch
):
    tenant, slug, _ = new_business(client)
    setup(client, way="move_number")
    step = wa(setup(client, phone="+974 5555 0102", ready=MOVE_TICKS).json())
    assert (step["status"], step["setup"]["status"]) == ("waiting", "waiting_on_meta")
    assert step["setup"]["open"] is False

    # Once Meta approves ALYR for that way, it waits on ALYR instead.
    open_ways(monkeypatch, "move_number,new_number")
    step = wa(client.get(f"{BASE}/readiness").json())
    assert (step["status"], step["setup"]["status"]) == ("waiting", "queued")

    connect_whatsapp(tenant, slug)
    step = wa(client.get(f"{BASE}/readiness").json())
    assert (step["status"], step["setup"]["status"]) == ("done", "connected")


def test_a_new_number_needs_the_name_customers_see(client):
    new_business(client)
    setup(client, way="new_number")
    step = wa(setup(client, phone="+97433330000", ready=["portfolio", "meta_card"]).json())
    assert step["setup"]["status"] == "preparing"
    step = wa(setup(client, display_name="  Barbers of Al Sadd ").json())
    assert step["setup"]["display_name"] == "Barbers of Al Sadd"
    assert step["setup"]["status"] == "waiting_on_meta"


def test_switching_ways_keeps_what_was_ticked_for_the_other(client):
    new_business(client)
    setup(client, way="own_account", phone="+97455550103", ready=["admin", "provider"])
    step = wa(setup(client, way="new_number", ready=["portfolio"]).json())
    assert {n["key"] for n in step["setup"]["needs"] if n["done"]} == {"number", "portfolio"}
    step = wa(setup(client, way="own_account").json())
    assert {n["key"] for n in step["setup"]["needs"] if n["done"]} == {
        "number", "admin", "provider",
    }


def test_wrong_numbers_and_ticks_are_refused_in_plain_words(client):
    new_business(client)
    answer = setup(client, phone="+97455550101")
    assert answer.status_code == 422 and "choose" in answer.json()["detail"]
    setup(client, way="move_number")
    for phone in ("12", "+974 5555 01a1", "0097"):
        assert setup(client, phone=phone).status_code == 422, phone
    assert setup(client, phone="00974 5555 0104").json()  # 00 is the same as +
    assert setup(client, ready=["admin"]).status_code == 422  # not this way's
    assert setup(client, way="whatsapp_web").status_code == 422
    # ALYR's shared number is not offered: no routing reaches one business from it yet.
    assert "alyr_number" in whatsapp_setup.NEEDS


def test_alyr_fills_it_in_says_where_it_is_and_the_owner_sees_why_it_failed(
    client, office, monkeypatch
):
    open_ways(monkeypatch, "new_number")
    tenant, _, _ = new_business(client)
    setup(client, way="new_number")
    answer = office.patch(
        f"{ADMIN}/businesses/{tenant}/whatsapp",
        json={"phone": "+97433331111", "display_name": "Barbers", "ready": ["portfolio",
              "meta_card"]},
    )
    assert answer.status_code == 200, answer.text
    assert wa(answer.json())["setup"]["status"] == "queued"
    assert on_board(office, tenant)["whatsapp"]["status"] == "queued"

    office.patch(f"{ADMIN}/businesses/{tenant}/whatsapp", json={"state": "connecting"})
    assert wa(client.get(f"{BASE}/readiness").json())["setup"]["status"] == "connecting"

    # A failure must say why: the owner reads it.
    assert office.patch(
        f"{ADMIN}/businesses/{tenant}/whatsapp", json={"state": "failed"}
    ).status_code == 422
    office.patch(
        f"{ADMIN}/businesses/{tenant}/whatsapp",
        json={"state": "failed", "note": "Meta refused the display name; it must match the CR"},
    )
    step = wa(client.get(f"{BASE}/readiness").json())
    assert (step["status"], step["setup"]["status"]) == ("todo", "failed")
    assert step["setup"]["note"].startswith("Meta refused")
    row = on_board(office, tenant)["whatsapp"]
    assert (row["status"], row["phone"]) == ("failed", "+97433331111")

    # Every change is on the record, the number itself never.
    record = [e for e in events(tenant, "whatsapp") if e[1] == "whatsapp"]
    assert len(record) == 3 and all(by_alyr for _, _, by_alyr in record)
    audit = office.get(f"{ADMIN}/audit").json()["entries"][0]
    assert audit["action"] == "onboarding.whatsapp" and audit["detail"]["state"] == "failed"
    assert "+97433331111" not in str(office.get(f"{ADMIN}/audit").json())


def test_only_the_owner_sets_it_up_and_only_alyr_says_where_it_is(client, client_factory):
    new_business(client)
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    assert agent.patch(f"{BASE}/whatsapp", json={"way": "new_number"}).status_code == 403
    # The owner's route has no state to set.
    setup(client, way="new_number", state="connecting")
    assert wa(client.get(f"{BASE}/readiness").json())["setup"]["status"] == "preparing"


def test_one_business_never_sees_anothers_setup(client, client_factory):
    first, _, _ = new_business(client)
    setup(client, way="move_number", phone="+97455550199")
    other = client_factory()
    new_business(other)
    step = wa(other.get(f"{BASE}/readiness").json())
    assert step["setup"]["phone"] == "" and step["setup"]["way"] == ""
