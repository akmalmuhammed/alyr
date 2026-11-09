"""Discovery Phase 2, facts (spec 066, D-166): what the owner confirmed is the only source of a
proposal's "after". Validation in words, the defaults a place brings, who may confirm what, and a
confirmation making the proposal appear at once.
"""

import json
from uuid import UUID

import pytest

from alyr.modules.discovery import facts as facts_module
from alyr.modules.discovery.connectors.sample import PHONES, STANDARD, WHATSAPP, facts_for
from discovery_proposals_support import (
    BASE,
    activity,
    find,
    place_id,
    prepared_shop,
    proposals,
)
from discovery_support import by_rule, findings
from test_consent import owner_sql

WEEK = {d: ["07:00", "22:00"] for d in ("sat", "sun", "mon", "tue", "wed", "thu")} | {
    "fri": ["13:00", "22:00"]}


@pytest.fixture
def shop(client_factory, monkeypatch):
    return prepared_shop(client_factory, monkeypatch)


def by_key(client) -> dict:
    items = client.get(f"{BASE}/facts").json()["items"]
    return {(f["location_id"], f["key"]): f for f in items}


def put(client, area: str, key: str, value):
    return client.put(f"{BASE}/facts", json={
        "location_id": place_id(client, area), "key": key, "value": value})


# ── validation ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("key, value, code", [
    ("hours", {k: v for k, v in WEEK.items() if k != "fri"}, "bad_hours"),
    ("hours", WEEK | {"fri": ["22:00", "13:00"]}, "bad_hours"),  # close before open
    ("hours", WEEK | {"fri": ["13:00", "13:00"]}, "bad_hours"),
    ("hours", WEEK | {"fri": ["18:00", "02:00"]}, "bad_hours"),  # overnight: not in Phase 2
    ("hours", WEEK | {"fri": ["1pm", "10pm"]}, "bad_hours"),
    ("hours", WEEK | {"fri": ["24:00", "25:00"]}, "bad_hours"),
    ("hours", WEEK | {"fri": ["13:00"]}, "bad_hours"),
    ("hours", {d: None for d in WEEK}, "bad_hours"),
    ("hours", WEEK | {"someday": ["07:00", "08:00"]}, "bad_hours"),
    ("phone", {"phone": "55550112"}, "bad_phone"),
    ("phone", {"phone": "+974"}, "bad_phone"),
    ("phone", {"phone": "+9745555011222222"}, "bad_phone"),
    ("phone", {"phone": "+974 5555 abc"}, "bad_phone"),
    ("phone", {"number": "+97455550112"}, "bad_phone"),
    ("whatsapp", {"phone": "wa.me/97455550150"}, "bad_phone"),
    ("category", {"category": ""}, "bad_fact"),
    ("category", {"category": "x" * 81}, "bad_fact"),
    ("category", {"category": "Car\nwash"}, "bad_fact"),
    ("category", {"category": "Car wash", "extra": 1}, "bad_fact"),
    ("name", {"name": "   "}, "bad_fact"),
    ("name", {"name": "n" * 161}, "bad_fact"),
    ("colour", {"name": "x"}, "bad_fact"),
])
def test_a_value_that_is_not_valid_is_refused_in_words_and_nothing_is_stored(
        shop, key, value, code):
    before = owner_sql("select count(*) as n from discovery_facts where tenant_id = $1",
                       shop.tenant_id)[0]["n"]
    answer = put(shop.owner, "Al Sadd", key, value)
    assert answer.status_code == 422, answer.text
    body = answer.json()
    assert body["code"] == code and body["detail"] and body["message_ar"]
    assert owner_sql("select count(*) as n from discovery_facts where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == before


def test_a_valid_value_is_stored_in_its_one_plain_shape(shop):
    assert put(shop.owner, "Lusail", "phone", {"phone": "+974 5555 0199"}).json()["value"] == {
        "phone": "+97455550199"}
    assert put(shop.owner, "Lusail", "category", {"category": "  Car   wash "}).json()[
        "value"] == {"category": "Car wash"}
    assert put(shop.owner, "Lusail", "hours", WEEK | {"fri": None}).json()["value"]["fri"] is None


def test_a_confirmed_fact_names_who_confirmed_it_and_when(shop):
    answer = put(shop.owner, "Al Sadd", "category", {"category": "Car detailing service"})
    assert answer.status_code == 200
    fact = answer.json()
    assert fact["source"] == "owner" and fact["confirmed_by_name"] == "Owner"
    assert fact["confirmed_at"] and fact["default"] is False
    [entry] = activity(shop, "fact.set")
    assert (entry["actor_name"], entry["channel"], json.loads(entry["detail"])) == (
        "Owner", "portal", {"key": "category"})
    # it replaces, never doubles
    put(shop.owner, "Al Sadd", "category", {"category": "Car wash"})
    assert owner_sql("select count(*) as n from discovery_facts where tenant_id = $1 "
                     "and key = 'category' and location_id = $2", shop.tenant_id,
                     UUID(place_id(shop.owner, "Al Sadd")))[0]["n"] == 1


# ── what a place brings, and what the sample writes ─────────────────────────────────────


def test_the_sample_writes_the_fictional_owners_truth_for_each_branch(shop):
    rows = owner_sql("select f.key, f.source, f.confirmed_by, f.confirmed_name, l.place_ref "
                     "from discovery_facts f join discovery_locations l on l.id = f.location_id "
                     "where f.tenant_id = $1", shop.tenant_id)
    assert len(rows) == 25 and {r["source"] for r in rows} == {"sample"}
    assert all(r["confirmed_by"] is None and r["confirmed_name"] == "" for r in rows)
    sadd = {r["key"] for r in rows if r["place_ref"] == "sample:sadd"}
    assert sadd == {"hours", "phone", "category", "name", "whatsapp"}
    items = by_key(shop.owner)
    wakra = place_id(shop.owner, "Al Wakra")
    assert items[(wakra, "phone")]["value"] == {"phone": PHONES["wakra"]}
    assert items[(wakra, "name")]["value"] == {"name": "Nuqta Car Care - Wakra"}
    assert items[(wakra, "whatsapp")]["value"] == {"phone": WHATSAPP}
    assert items[(wakra, "hours")]["value"]["fri"] == ["13:00", "22:00"]
    assert all(f["default"] is False for f in items.values())
    # the script of the sample and its facts agree
    from alyr.modules.discovery.connectors import Location

    assert facts_for(Location(UUID(int=1), "x", place_ref="sample:sadd"), 0)["hours"] == {
        "sat": ["07:00", "22:00"], "sun": ["07:00", "22:00"], "mon": ["07:00", "22:00"],
        "tue": ["07:00", "22:00"], "wed": ["07:00", "22:00"], "thu": ["07:00", "22:00"],
        "fri": ["13:00", "22:00"]}
    assert STANDARD["fri"] == ("13:00", "22:00")


def test_the_name_and_the_whatsapp_number_default_to_what_the_place_was_typed_with(shop):
    owner_sql("delete from discovery_facts where tenant_id = $1 and key in ('name', 'whatsapp')",
              shop.tenant_id)
    items = shop.owner.get(f"{BASE}/facts").json()["items"]
    defaults = [f for f in items if f["default"]]
    assert {f["key"] for f in defaults} == {"name", "whatsapp"} and len(defaults) == 10
    sadd = place_id(shop.owner, "Al Sadd")
    name = next(f for f in defaults if f["location_id"] == sadd and f["key"] == "name")
    assert name["value"] == {"name": "Nuqta Car Care - Al Sadd"} and name["source"] == "places"
    assert name["confirmed_by_name"] is None and name["confirmed_at"] is None
    # the row, once there is one, wins
    put(shop.owner, "Al Sadd", "name", {"name": "Nuqta Car Care Sadd"})
    fresh = by_key(shop.owner)
    assert fresh[(sadd, "name")]["default"] is False
    assert fresh[(sadd, "name")]["value"] == {"name": "Nuqta Car Care Sadd"}


def test_turning_the_sample_on_again_never_writes_over_a_fact_someone_typed(shop):
    put(shop.owner, "Al Sadd", "phone", {"phone": "+97455550177"})
    shop.owner.put(f"{BASE}/connection", json={"kind": "sample", "on": False})
    back = shop.owner.put(f"{BASE}/connection", json={"kind": "sample", "on": True})
    assert back.status_code == 200
    facts = by_key(shop.owner)
    sadd = facts[(place_id(shop.owner, "Al Sadd"), "phone")]
    assert sadd["source"] == "owner" and sadd["value"] == {"phone": "+97455550177"}


def test_the_demo_script_writes_the_facts_for_the_five_branches(client_factory, monkeypatch):
    import asyncio

    from alyr import discovery_demo
    from conftest import APP_DSN

    shop = prepared_shop(client_factory, monkeypatch, run=False)
    owner_sql("delete from discovery_facts where tenant_id = $1", shop.tenant_id)
    owner_sql("update tenants set name = name where id = $1", shop.tenant_id)
    asyncio.run(discovery_demo.switch(APP_DSN, shop.tenant_id))
    assert owner_sql("select count(*) as n from discovery_facts where tenant_id = $1 "
                     "and source = 'sample'", shop.tenant_id)[0]["n"] == 25


# ── a confirmation makes the proposal appear ────────────────────────────────────────────


def test_a_proposal_waits_for_its_fact_and_appears_when_it_is_confirmed(shop):
    sadd = place_id(shop.owner, "Al Sadd")
    owner_sql("delete from discovery_facts where tenant_id = $1 and location_id = $2 "
              "and key = 'hours'", shop.tenant_id, UUID(sadd))
    owner_sql("delete from discovery_proposals where tenant_id = $1 and type = 'set_hours' "
              "and location_id = $2", shop.tenant_id, UUID(sadd))
    target = by_rule(findings(shop.owner))["hours_missing"][0]
    one = shop.owner.get(f"{BASE}/findings/{target['id']}").json()
    assert one["needs_fact"] == {"key": "hours", "location_id": sadd}
    assert one["can_propose"] is True and one["proposals"] == []
    refused = shop.owner.post(f"{BASE}/findings/{target['id']}/proposals")
    assert refused.status_code == 422
    assert (refused.json()["code"], refused.json()["key"], refused.json()["location_id"]) == (
        "needs_fact", "hours", sadd)
    # confirming the real hours: the proposal is there at once, with these hours
    answer = put(shop.owner, "Al Sadd", "hours", WEEK | {"fri": None})
    assert answer.status_code == 200
    made = find(shop.owner, "hours_missing", "Al Sadd", status="live")
    assert made["after"]["text"] == "Sat to Thu 07:00 to 22:00; Fri closed"
    one = shop.owner.get(f"{BASE}/findings/{target['id']}").json()
    assert one["needs_fact"] is None and [p["id"] for p in one["proposals"]] == [made["id"]]


def test_nothing_is_proposed_from_what_google_or_the_website_show(shop):
    """The "after" is always the confirmed fact: the website's hours at the Industrial Area differ
    from the listing's, and the proposal sets the website to the confirmed ones, not the reverse."""
    p = find(shop.owner, "hours_conflict", "Industrial Area")
    assert p["target"] == "website" and p["after"]["text"].endswith("Fri 13:00 to 22:00")
    put(shop.owner, "Industrial Area", "hours", WEEK | {"sat": ["08:00", "20:00"]})
    both = [x for x in proposals(shop.owner, "live") if x["rule_id"] == "hours_conflict"]
    assert sorted(x["target"] for x in both) == ["listing", "website"]
    assert all(x["after"]["text"].startswith("Sat 08:00 to 20:00; Sun to Thu 07:00") for x in both)
    assert facts_module.KEYS == ("hours", "phone", "category", "name", "whatsapp")
