"""Discovery Phase 2, who may do what (spec 066, D-166): one test for each cell of the role table,
for owner, admin, a branch manager (own place and another place), a staff-role member with no place,
the check-up itself (the engine), the agent door, a caller with no login, and a channel that is not
the workspace or WhatsApp. The guarantee: the engine and the agent door can never approve, and a
branch manager acts on their own place only.
"""

from uuid import UUID

import pytest

from alyr.core import actions
from alyr.core.actions import ENGINE, Caller
from alyr.modules.discovery.errors import DiscoveryError
from discovery_proposals_support import (
    BASE,
    activity,
    add_member,
    approve,
    branch_manager,
    find,
    get,
    place_id,
    prepared_shop,
    proposals,
    user_id,
)
from discovery_support import by_rule, findings
from test_consent import owner_sql
from test_sign_in import sign_in


@pytest.fixture
def shop(client_factory, monkeypatch):
    s = prepared_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    s.manager, s.manager_id = branch_manager(client_factory, s, "Al Sadd")
    return s


def run_action(shop, caller: Caller, key: str, **args):
    async def go():
        async with shop.owner.app.state.db.tenant(shop.tenant_id) as conn:
            return await actions.run(conn, caller, key, **args)

    return shop.owner.portal.call(go)


def owner_of(shop) -> UUID:
    return owner_sql("select id from users where email = $1", shop.emails["owner"])[0]["id"]


def the_person(shop, channel: str, role: str = "owner") -> Caller:
    return Caller(owner_of(shop), "Huda", role, channel)


# ── reading ─────────────────────────────────────────────────────────────────────────────


def test_owner_and_admin_see_every_places_proposals_a_branch_manager_only_their_own(shop):
    assert len(proposals(shop.owner)) == len(proposals(shop.admin)) == 10
    mine = proposals(shop.manager)
    assert mine and {p["location"]["name"] for p in mine} == {"Nuqta Car Care - Al Sadd"}
    answer = shop.manager.get(f"{BASE}/proposals", params={"status": "all"}).json()
    assert answer["waiting"] == len(mine) and answer["counts"]["proposed"] == len(mine)
    other = find(shop.owner, "category_missing", "Al Wakra")
    seen = shop.manager.get(f"{BASE}/proposals/{other['id']}")
    assert seen.status_code == 404 and seen.json()["code"] == "not_found"
    assert get(shop.manager, find(shop.owner, "hours_missing", "Al Sadd")["id"])["status"]
    # asking for another place by id gives nothing, not an error that tells it exists
    assert proposals(shop.manager, "all", location_id=place_id(shop.owner, "Al Wakra")) == []


def test_a_staff_role_member_with_no_place_sees_an_empty_list_and_nothing_else(shop):
    assert proposals(shop.agent) == []
    answer = shop.agent.get(f"{BASE}/proposals").json()
    assert answer == {"items": [], "counts": {s: 0 for s in (
        "proposed", "approved", "declined", "expired", "applied", "failed", "undone")},
        "waiting": 0}
    p = find(shop.owner, "category_missing", "Al Wakra")
    assert shop.agent.get(f"{BASE}/proposals/{p['id']}").status_code == 404
    assert shop.agent.get(f"{BASE}/facts").json() == {"items": []}
    assert shop.agent.get(f"{BASE}/overview").json()["proposals"] is None


def test_the_overview_for_a_branch_manager_counts_their_place_only(shop):
    block = shop.manager.get(f"{BASE}/overview").json()["proposals"]
    assert block["waiting"] == len(proposals(shop.manager, "live"))
    assert block["next"]["location"]["name"].endswith("Al Sadd")


def test_facts_are_read_for_the_places_a_caller_manages(shop):
    owner_places = {f["location_id"] for f in shop.owner.get(f"{BASE}/facts").json()["items"]}
    assert len(owner_places) == 5
    mine = {f["location_id"] for f in shop.manager.get(f"{BASE}/facts").json()["items"]}
    assert mine == {place_id(shop.owner, "Al Sadd")}
    lusail = place_id(shop.owner, "Lusail")
    other = shop.manager.get(f"{BASE}/facts", params={"location_id": lusail})
    assert other.status_code == 404


# ── confirming a fact ───────────────────────────────────────────────────────────────────


def test_who_may_confirm_a_fact(shop):
    phone = {"phone": "+97455550166"}
    body = lambda area: {"location_id": place_id(shop.owner, area), "key": "phone",  # noqa: E731
                         "value": phone}
    assert shop.owner.put(f"{BASE}/facts", json=body("Lusail")).status_code == 200
    assert shop.admin.put(f"{BASE}/facts", json=body("Lusail")).status_code == 200
    assert shop.manager.put(f"{BASE}/facts", json=body("Al Sadd")).status_code == 200
    other = shop.manager.put(f"{BASE}/facts", json=body("Lusail"))
    assert (other.status_code, other.json()["code"]) == (404, "not_found")
    none = shop.agent.put(f"{BASE}/facts", json=body("Al Sadd"))
    assert (none.status_code, none.json()["code"]) == (403, "forbidden")


def test_the_engine_and_the_agent_door_cannot_confirm_a_fact(shop):
    args = {"location_id": UUID(place_id(shop.owner, "Lusail")), "fact_key": "phone",
            "value": {"phone": "+97455550166"}}
    with pytest.raises(actions.NotAllowed):
        run_action(shop, Caller(None, "ALYR", ENGINE, "system"), "discovery.set_fact", **args)
    with pytest.raises(DiscoveryError) as refused:
        run_action(shop, the_person(shop, "mcp"), "discovery.set_fact", **args)
    assert refused.value.code == "forbidden"


# ── preparing ───────────────────────────────────────────────────────────────────────────


def test_who_may_prepare_a_change(shop):
    wakra = by_rule(findings(shop.owner))["category_missing"][0]
    sadd = by_rule(findings(shop.owner))["whatsapp_link_missing"]
    sadd = next(f for f in sadd if f["location"]["name"].endswith("Al Sadd"))
    assert shop.owner.post(f"{BASE}/findings/{wakra['id']}/proposals").status_code == 200
    assert shop.admin.post(f"{BASE}/findings/{wakra['id']}/proposals").status_code == 200
    assert shop.manager.post(f"{BASE}/findings/{sadd['id']}/proposals").status_code == 200
    other = shop.manager.post(f"{BASE}/findings/{wakra['id']}/proposals")
    assert (other.status_code, other.json()["code"]) == (404, "not_found")
    none = shop.agent.post(f"{BASE}/findings/{sadd['id']}/proposals")
    assert (none.status_code, none.json()["code"]) == (403, "forbidden")


def test_the_engine_prepares_and_the_agent_door_prepares_as_agent_never_approving(shop):
    sadd = next(f for f in by_rule(findings(shop.owner))["whatsapp_link_missing"]
                if f["location"]["name"].endswith("Al Sadd"))
    owner_sql("delete from discovery_proposals where tenant_id = $1 and finding_id = $2",
              shop.tenant_id, UUID(sadd["id"]))
    made = run_action(shop, Caller(None, "ALYR", ENGINE, "system"), "discovery.prepare",
                      id=UUID(sadd["id"]))
    [row] = made["items"]
    assert row["proposer"] == "engine" and row["status"] == "proposed"
    assert owner_sql("select proposed_by from discovery_proposals where id = $1",
                     UUID(row["id"]))[0]["proposed_by"] is None
    # the agent door, acting for a person (any channel but the workspace and WhatsApp)
    owner_sql("delete from discovery_proposals where tenant_id = $1 and finding_id = $2",
              shop.tenant_id, UUID(sadd["id"]))
    door = run_action(shop, the_person(shop, "mcp"), "discovery.prepare", id=UUID(sadd["id"]))
    [row] = door["items"]
    assert row["proposer"] == "agent"
    assert owner_sql("select proposed_by from discovery_proposals where id = $1",
                     UUID(row["id"]))[0]["proposed_by"] == owner_of(shop)
    # ...and neither can approve what it prepared
    args = {"id": UUID(row["id"]), "change_hash": row["change_hash"]}
    with pytest.raises(actions.NotAllowed):
        run_action(shop, Caller(None, "ALYR", ENGINE, "system"), "discovery.approve_proposal",
                   **args)
    with pytest.raises(DiscoveryError) as refused:
        run_action(shop, the_person(shop, "mcp"), "discovery.approve_proposal", **args)
    assert refused.value.code == "forbidden"
    assert get(shop.owner, row["id"])["status"] == "proposed"


# ── approving, declining, undoing ───────────────────────────────────────────────────────


def test_who_may_approve(shop):
    sadd = find(shop.owner, "hours_missing", "Al Sadd")
    wakra = find(shop.owner, "category_missing", "Al Wakra")
    lusail = find(shop.owner, "name_conflict", "Al Wakra")
    industrial = find(shop.owner, "hours_conflict", "Industrial Area")
    body = lambda p: {"change_hash": p["change_hash"]}  # noqa: E731
    assert approve(shop.owner, wakra)["status"] == "approved"
    assert approve(shop.admin, lusail)["status"] == "approved"
    assert approve(shop.manager, sadd)["decided"]["by"] == "Reem"
    other = shop.manager.post(f"{BASE}/proposals/{industrial['id']}/approve", json=body(industrial))
    assert (other.status_code, other.json()["code"]) == (404, "not_found")
    none = shop.agent.post(f"{BASE}/proposals/{industrial['id']}/approve", json=body(industrial))
    assert (none.status_code, none.json()["code"]) == (403, "forbidden")
    assert get(shop.owner, industrial["id"])["status"] == "proposed"


def test_an_owner_approves_only_their_own_shops_proposal(client_factory, monkeypatch):
    mine = prepared_shop(client_factory, monkeypatch)
    theirs = prepared_shop(client_factory, monkeypatch)
    p = find(mine.owner, "hours_missing", "Al Sadd")
    answer = theirs.owner.post(f"{BASE}/proposals/{p['id']}/approve",
                               json={"change_hash": p["change_hash"]})
    assert answer.status_code == 404
    assert get(mine.owner, p["id"])["status"] == "proposed"


def test_a_branch_manager_declines_and_undoes_their_own_place_and_no_other(shop):
    mine = find(shop.owner, "whatsapp_link_missing", "Al Sadd")
    other = find(shop.owner, "category_missing", "Al Wakra")
    approve(shop.manager, mine)
    assert shop.manager.post(f"{BASE}/proposals/{mine['id']}/undo").json()["status"] == "undone"
    assert shop.manager.post(f"{BASE}/proposals/{other['id']}/decline").status_code == 404
    assert shop.manager.post(f"{BASE}/proposals/{other['id']}/undo").status_code == 404
    declined = shop.manager.post(
        f"{BASE}/proposals/{find(shop.owner, 'hours_missing', 'Al Sadd')['id']}/decline")
    assert declined.json()["status"] == "declined"
    assert shop.agent.post(f"{BASE}/proposals/{other['id']}/decline").status_code == 403
    assert shop.agent.post(f"{BASE}/proposals/{other['id']}/undo").status_code == 403


def test_a_caller_with_no_login_or_a_channel_that_is_not_a_door_cannot_decide(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    args = {"id": UUID(p["id"]), "change_hash": p["change_hash"]}
    for caller in (Caller(None, "Nobody", "owner", "portal"),
                   Caller(None, "Nobody", "owner", "whatsapp"),
                   the_person(shop, "mcp"), the_person(shop, "system"), the_person(shop, "email")):
        for key, extra in (("discovery.approve_proposal", args),
                           ("discovery.decline_proposal", {"id": args["id"]}),
                           ("discovery.undo_proposal", {"id": args["id"]})):
            with pytest.raises(DiscoveryError) as refused:
                run_action(shop, caller, key, **extra)
            assert refused.value.code == "forbidden", (caller, key)
    assert get(shop.owner, p["id"])["status"] == "proposed"
    assert activity(shop, "proposal.approve") == [] and activity(shop, "proposal.decline") == []
    # a person at the workspace or on their linked WhatsApp number can
    assert run_action(shop, the_person(shop, "whatsapp"), "discovery.approve_proposal",
                      **args)["decided"]["channel"] == "whatsapp"


def test_the_database_will_not_hold_an_approved_proposal_without_a_door_and_a_name(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    import asyncpg

    for sql in ("update discovery_proposals set status = 'approved' where id = $1",
                "update discovery_proposals set status = 'approved', decided_at = now(), "
                "decided_channel = 'system', decided_name = 'x' where id = $1",
                "update discovery_proposals set status = 'approved', decided_at = now(), "
                "decided_channel = 'mcp', decided_name = 'x' where id = $1"):
        with pytest.raises(asyncpg.PostgresError):
            owner_sql(sql, UUID(p["id"]))


# ── managers ────────────────────────────────────────────────────────────────────────────


def test_who_may_link_a_branch_manager_and_to_whom(shop):
    place = place_id(shop.owner, "Lusail")
    member = user_id(shop, shop.emails["agent"])
    ok = shop.owner.put(f"{BASE}/locations/{place}/managers", json={"user_ids": [member]})
    assert ok.status_code == 200 and [m["user_id"] for m in ok.json()["items"]] == [member]
    assert shop.admin.put(f"{BASE}/locations/{place}/managers",
                          json={"user_ids": [member]}).status_code == 200
    for client in (shop.manager, shop.agent):
        refused = client.put(f"{BASE}/locations/{place}/managers", json={"user_ids": [member]})
        assert (refused.status_code, refused.json()["code"]) == (403, "forbidden")
    # only members of this shop with the staff role
    for bad in (user_id(shop, shop.emails["admin"]), user_id(shop, shop.emails["owner"]),
                str(UUID(int=7))):
        refused = shop.owner.put(f"{BASE}/locations/{place}/managers", json={"user_ids": [bad]})
        assert (refused.status_code, refused.json()["code"]) == (422, "bad_manager"), bad
    [entry, *_] = activity(shop, "managers.set")
    assert entry["actor_name"] == "Owner"
    # taking them off takes their reach with it, at once
    shop.owner.put(f"{BASE}/locations/{place}/managers", json={"user_ids": []})
    assert shop.agent.get(f"{BASE}/proposals").json()["items"] == []


def test_a_linked_member_gets_a_places_proposals_the_moment_they_are_linked(
        client_factory, shop):
    email = add_member(shop, "agent", name="Salma")
    newcomer = client_factory()
    sign_in(newcomer, email)
    assert proposals(newcomer) == []
    shop.owner.put(f"{BASE}/locations/{place_id(shop.owner, 'Lusail')}/managers",
                   json={"user_ids": [user_id(shop, email)]})
    assert proposals(newcomer) == []  # Lusail has no proposal
    shop.owner.put(f"{BASE}/locations/{place_id(shop.owner, 'Al Wakra')}/managers",
                   json={"user_ids": [user_id(shop, email)]})
    assert {p["location"]["name"][-8:] for p in proposals(newcomer)} == {"Al Wakra"}


# ── settings ────────────────────────────────────────────────────────────────────────────


def test_settings_are_for_owner_and_admin_and_the_cap_is_one_to_five(shop):
    first = shop.owner.get(f"{BASE}/settings").json()
    assert first["ask_cap_per_day"] == 3 and first["weekly_run"] is False
    assert first["template_ready"] is False and first["receivers"] == []
    assert shop.admin.put(f"{BASE}/settings", json={"ask_cap_per_day": 5,
                                                    "weekly_run": True}).status_code == 200
    now = shop.owner.get(f"{BASE}/settings").json()
    assert (now["ask_cap_per_day"], now["weekly_run"]) == (5, True)
    for bad in (0, 6, -1):
        refused = shop.owner.put(f"{BASE}/settings", json={"ask_cap_per_day": bad})
        assert (refused.status_code, refused.json()["code"]) == (422, "bad_setting"), bad
    for client in (shop.manager, shop.agent):
        assert client.get(f"{BASE}/settings").status_code == 403
        assert client.put(f"{BASE}/settings", json={"weekly_run": False}).status_code == 403
    assert shop.owner.put(f"{BASE}/settings", json={}).json()["ask_cap_per_day"] == 5
    assert activity(shop, "settings.set")


def test_receivers_must_be_the_shops_own_staff_numbers(shop):
    stranger = owner_sql("insert into contacts (tenant_id, phone, name, role) values "
                         "($1, '97455500055', 'A customer', 'customer') returning id",
                         shop.tenant_id)[0]["id"]
    refused = shop.owner.put(f"{BASE}/settings", json={"receivers": [str(stranger)]})
    assert (refused.status_code, refused.json()["code"]) == (422, "bad_setting")
    other_shop = owner_sql("insert into tenants (name) values ('Other') returning id")[0]["id"]
    foreign = owner_sql("insert into contacts (tenant_id, phone, name, role) values "
                        "($1, '97455500056', 'Their staff', 'staff') returning id",
                        other_shop)[0]["id"]
    refused = shop.owner.put(f"{BASE}/settings", json={"receivers": [str(foreign)]})
    assert refused.status_code == 422
    # settings never show another shop's numbers
    assert shop.owner.get(f"{BASE}/settings").json()["receivers"] == []


def test_a_person_turns_their_own_asks_on_and_off_whatever_their_role(shop):
    for who in ("owner", "admin", "agent"):
        caller = Caller(UUID(user_id(shop, shop.emails[who])), who.title(), who, "whatsapp")
        assert run_action(shop, caller, "discovery.set_my_asks", on=True)["linked"] is False
    # the engine has no number to switch
    with pytest.raises(actions.NotAllowed):
        run_action(shop, Caller(None, "ALYR", ENGINE, "system"), "discovery.set_my_asks", on=True)


def test_locations_say_who_manages_each_place_to_owner_and_admin_only(shop):
    sadd = place_id(shop.owner, "Al Sadd")
    for client in (shop.owner, shop.admin):
        items = {x["id"]: x for x in client.get(f"{BASE}/locations").json()["items"]}
        assert items[sadd]["managers"] == [{"user_id": shop.manager_id, "name": "Reem"}]
        assert items[place_id(shop.owner, "Lusail")]["managers"] == []
    for client in (shop.manager, shop.agent):
        assert all(x["managers"] == [] for x in client.get(f"{BASE}/locations").json()["items"])
    put = shop.owner.put(f"{BASE}/locations", json={"items": shop.owner.get(
        f"{BASE}/locations").json()["items"]})
    assert put.status_code == 200 and "managers" in put.json()["items"][0]
