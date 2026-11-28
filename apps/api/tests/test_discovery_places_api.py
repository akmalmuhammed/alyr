"""Each place's Google place ID and the Places live read in a check-up (Discovery 2.0, workstream
F), through the real path: HTTP in, real PostgreSQL, the jobs worker.

The setup field (`GET/PUT /api/discovery/google-place`) is for the owner and an admin only and
sees only its own shop's places; it takes a Google Maps link or a place ID and keeps only the ID.
A check-up reads the listing of a place with a place ID, logs it as its own step with its cost,
and its evidence is labelled `google`. Any real outbound call fails the test."""

import json
import socket
from dataclasses import replace
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.modules.discovery import connectors
from alyr.modules.discovery.connectors import Listing, SampleConnector, places
from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql

FIXTURES = Path(__file__).parent / "fixtures" / "places"
PID = "ChIJN1t_tDeuEmsRUsoyG83frY4"
LINK = f"https://www.google.com/maps/search/?api=1&query=Test&query_place_id={PID}"
BASE = "/api/discovery/google-place"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    real_getaddrinfo = socket.getaddrinfo

    def refuse(host=None, *args, **kwargs):
        # The test database is on this machine ("localhost" in CI): looking it up is not an
        # outbound call. Every other name is refused.
        if host in ("localhost", "127.0.0.1", "::1"):
            return real_getaddrinfo(host, *args, **kwargs)
        raise AssertionError("a real outbound call was made")

    async def refuse_async(*args, **kwargs):
        raise AssertionError("a real outbound call was made")

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    monkeypatch.setenv("ALYR_DISCOVERY_PLACES", "on")
    monkeypatch.setenv("ALYR_PLACES_KEY", "test-key-not-real")


def place_ids(shop) -> dict:
    return {r["area"] or r["name"]: r for r in owner_sql(
        "select id, name, area, place_ref from discovery_locations where tenant_id = $1",
        shop.tenant_id)}


def a_real_shop(client_factory, monkeypatch, roles=("owner",)):
    """A shop with Discovery on and one place (no sample): what a real business has."""
    shop = discovery_shop(client_factory, monkeypatch, roles=roles, demo=False)
    answer = shop.owner.put("/api/discovery/locations", json={"items": [
        {"name": "Test Bakery", "area": "Al Sadd", "is_primary": True}]})
    assert answer.status_code == 200, answer.text
    shop.place = answer.json()["items"][0]["id"]
    return shop


# ── the setup field ────────────────────────────────────────────────────────────────────────


def test_the_owner_pastes_a_maps_link_and_only_the_place_id_is_kept(client_factory, monkeypatch):
    shop = a_real_shop(client_factory, monkeypatch)
    view = shop.owner.get(BASE).json()
    assert view["on"] is True
    assert [(p["id"], p["place_id"]) for p in view["places"]] == [(shop.place, None)]
    answer = shop.owner.put(f"{BASE}/{shop.place}", json={"link": LINK})
    assert answer.status_code == 200, answer.text
    assert answer.json()["places"][0]["place_id"] == PID
    assert place_ids(shop)["Al Sadd"]["place_ref"] == PID
    # cleared with an empty field
    assert shop.owner.put(f"{BASE}/{shop.place}", json={"link": ""}).json()["places"][0][
        "place_id"] is None
    assert place_ids(shop)["Al Sadd"]["place_ref"] is None


@pytest.mark.parametrize("link,code", [
    ("https://maps.app.goo.gl/AbCdEf123456", "place_link_short"),
    ("Test Bakery", "place_link_bad"),
    ("https://maps.google.com/?cid=1234567890123456789", "place_link_bad"),
])
def test_a_link_without_a_place_id_is_refused_in_both_languages(client_factory, monkeypatch,
                                                                link, code):
    shop = a_real_shop(client_factory, monkeypatch)
    answer = shop.owner.put(f"{BASE}/{shop.place}", json={"link": link})
    assert answer.status_code == 422
    assert answer.json()["code"] == code and answer.json()["detail"] and answer.json()["message_ar"]
    assert place_ids(shop)["Al Sadd"]["place_ref"] is None


def test_the_places_list_takes_a_link_too_and_a_list_without_the_field_keeps_it(
        client_factory, monkeypatch):
    shop = a_real_shop(client_factory, monkeypatch)
    items = shop.owner.get("/api/discovery/locations").json()["items"]
    item = {"id": items[0]["id"], "name": "Test Bakery", "area": "Al Sadd", "is_primary": True}
    assert shop.owner.put("/api/discovery/locations",
                          json={"items": [item | {"place_ref": LINK}]}).status_code == 200
    assert place_ids(shop)["Al Sadd"]["place_ref"] == PID
    # the back office's editor sends no place_ref: the owner's place ID stays
    assert shop.owner.put("/api/discovery/locations",
                          json={"items": [item | {"name": "Renamed"}]}).status_code == 200
    assert place_ids(shop)["Al Sadd"]["place_ref"] == PID
    bad = shop.owner.put("/api/discovery/locations", json={"items": [item | {"place_ref": "x"}]})
    assert (bad.status_code, bad.json()["code"]) == (422, "place_link_bad")


@pytest.mark.parametrize("flag,key", [("", "k"), ("on", "")])
def test_the_field_says_off_without_both_settings(client_factory, monkeypatch, flag, key):
    monkeypatch.setenv("ALYR_DISCOVERY_PLACES", flag)
    monkeypatch.setenv("ALYR_PLACES_KEY", key)
    shop = a_real_shop(client_factory, monkeypatch)
    assert shop.owner.get(BASE).json()["on"] is False


def test_the_sample_shop_never_has_the_live_read_and_its_refs_are_not_place_ids(
        client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    view = shop.owner.get(BASE).json()
    assert view["on"] is False
    assert view["places"] and all(p["place_id"] is None for p in view["places"])


def test_only_the_owner_and_an_admin_see_or_set_it(client_factory, monkeypatch):
    shop = a_real_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    assert shop.admin.get(BASE).status_code == 200
    assert shop.admin.put(f"{BASE}/{shop.place}", json={"link": PID}).status_code == 200
    for answer in (shop.agent.get(BASE),
                   shop.agent.put(f"{BASE}/{shop.place}", json={"link": ""})):
        assert answer.status_code == 403 and answer.json()["code"] == "forbidden"
    assert place_ids(shop)["Al Sadd"]["place_ref"] == PID  # the agent changed nothing
    assert client_factory().get(BASE).status_code == 401


def test_another_shop_cannot_read_or_set_a_shops_place_id(client_factory, monkeypatch):
    a = a_real_shop(client_factory, monkeypatch)
    a.owner.put(f"{BASE}/{a.place}", json={"link": PID})
    b = discovery_shop(client_factory, monkeypatch, roles=("owner", "admin"), demo=False)
    for client in (b.owner, b.admin):
        assert client.get(BASE).json()["places"] == []
        answer = client.put(f"{BASE}/{a.place}", json={"link": ""})
        assert (answer.status_code, answer.json()["code"]) == (404, "not_found")
    assert place_ids(a)["Al Sadd"]["place_ref"] == PID
    assert b.owner.put(f"{BASE}/{uuid4()}", json={"link": PID}).status_code == 404


def test_with_the_module_off_the_field_is_not_there(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, module=False)
    answer = shop.owner.get(BASE)
    assert (answer.status_code, answer.json()["code"]) == (404, "module_off")


# ── a check-up ─────────────────────────────────────────────────────────────────────────────

AREA = "Al Sadd"


class NoListingForOnePlace(SampleConnector):
    """The sample, saying nothing about one place's listing (as a source that did not look)."""

    async def snapshot(self, locations, ctx):
        snapshot = await super().snapshot(locations, ctx)
        target = next(loc.id for loc in locations if loc.area == AREA)
        return replace(snapshot, places=[
            replace(p, listing=Listing(found=None)) if p.location_id == target else p
            for p in snapshot.places])


def test_a_run_reads_the_live_listing_logs_its_step_and_cost_and_labels_its_evidence(
        client_factory, monkeypatch):
    seen: list[httpx.Request] = []
    body = json.loads((FIXTURES / "details_bare.json").read_text(encoding="utf-8"))

    async def handle(request):
        seen.append(request)
        return httpx.Response(200, json=body)

    monkeypatch.setattr(places, "transport", httpx.MockTransport(handle))
    monkeypatch.setattr(connectors, "get", lambda kind: NoListingForOnePlace())
    # the real registry never adds an extra to the sample: the run stands in for a real source
    monkeypatch.setattr(connectors, "extras_for",
                        lambda kind, locations: (places.PlacesConnector(),))
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    target = place_ids(shop)[AREA]["id"]
    owner_sql("update discovery_locations set place_ref = $2 where id = $1", target, PID)

    run = run_check_up(shop.owner)
    assert run["status"] == "done"
    assert len(seen) == 1 and seen[0].url.path == f"/v1/places/{PID}"
    step = next(s for s in run["steps"] if s["tool"] == "connector.places")
    assert step["ok"] and step["summary"] == "Got 1 Google listing live from Google Maps."
    cost = owner_sql("select cost_units from discovery_run_steps where run_id = $1 "
                     "and tool = 'connector.places'", UUID(run["id"]))
    assert [r["cost_units"] for r in cost] == [1]
    rows = owner_sql("select cost_units from discovery_runs where id = $1", UUID(run["id"]))
    assert rows[0]["cost_units"] >= 1

    rows = owner_sql(
        "select f.evidence, f.observed from discovery_findings f join discovery_locations l "
        "on l.id = f.location_id where f.tenant_id = $1 and f.rule_id = 'hours_missing' "
        "and l.id = $2", shop.tenant_id, target)
    assert len(rows) == 1
    evidence = rows[0]["evidence"]
    evidence = json.loads(evidence) if isinstance(evidence, str) else evidence
    assert evidence and all(e["source"] == "google" for e in evidence if e["where"] == "listing")
    observed = rows[0]["observed"]
    assert (json.loads(observed) if isinstance(observed, str) else observed) in ({}, None)
    # only the place ID is kept on the place
    assert place_ids(shop)[AREA]["place_ref"] == PID
