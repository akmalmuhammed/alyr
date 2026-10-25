"""The onboarding funnel in the back office (ALY-169, spec 025): where businesses stop, how long
steps take, and how many needed ALYR's hand, read from the record the engine already keeps.
The database is shared by the whole run, so each test compares with the funnel it saw first."""

import pytest

from alyr.seed import AGENT_EMAIL
from test_consent import owner_sql
from test_onboarding import new_business
from test_pricing import ADMIN
from test_readiness import check
from test_sign_in import sign_in


@pytest.fixture
def office(client_factory):
    return client_factory()


def funnel(office):
    answer = office.get(f"{ADMIN}/onboarding/funnel")
    assert answer.status_code == 200, answer.text
    return answer.json()


def step_of(state, key):
    return next((s for s in state["steps"] if s["key"] == key), {"reached": 0})


def test_a_new_business_counts_as_started_and_its_steps_as_reached(client, office):
    before = funnel(office)
    new_business(client)
    check(client)
    after = funnel(office)
    assert after["started"] == before["started"] + 1
    # A salon starts with its services and hours in place: those steps were reached at once.
    assert step_of(after, "content")["reached"] == step_of(before, "content")["reached"] + 1
    # It is not live, and what it still lacks shows as where businesses are stuck.
    stuck = {s["key"]: s["count"] for s in after["stuck_on"]}
    assert stuck["whatsapp"] >= 1 and stuck["test"] >= 1
    assert after["live"] == before["live"]


def test_a_business_alyr_helped_is_counted_apart(client, office):
    before = funnel(office)
    tenant, _, _ = new_business(client)
    check(client)
    assert funnel(office)["helped"] == before["helped"]
    # A person from ALYR writes what is holding a step up.
    held = office.patch(
        f"{ADMIN}/businesses/{tenant}/steps/whatsapp", json={"blocker": "Waiting for Meta"})
    assert held.status_code == 200, held.text
    assert funnel(office)["helped"] == before["helped"] + 1


def test_a_business_that_went_quiet_is_counted_and_the_time_to_a_step_is_in_hours(client, office):
    before = funnel(office)
    tenant, _, _ = new_business(client)
    check(client)
    owner_sql("update tenants set created_at = now() - interval '10 days' where id = $1", tenant)
    owner_sql("update onboarding_events set at = now() - interval '9 days' where tenant_id = $1",
              tenant)
    after = funnel(office)
    assert after["quiet"] == before["quiet"] + 1
    content = step_of(after, "content")
    assert content["median_hours"] is not None and content["median_hours"] >= 0


def test_only_staff_see_the_funnel(client_factory):
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    assert agent.get(f"{ADMIN}/onboarding/funnel").status_code == 403
