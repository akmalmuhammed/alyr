"""Check packs through the real path (Discovery 2.0): `GET /api/discovery/packs`, `GET` and `PUT
/api/discovery/pack` (owner and admin only, tenant-isolated, on the activity record), a check-up
that runs the business's pack and keeps which one, "N of M checks match" on the overview with what
was not measured left out, the first-party facts handed to the rules once per check-up, and a new
vertical added as data only."""

import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest

from alyr.modules.discovery import engine, packs, proposals, rules
from discovery_proposals_support import activity
from discovery_support import by_rule, discovery_shop, findings, run_check_up, turn_on_sample
from test_consent import owner_sql

BASE = "/api/discovery"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "packs" / "mobile_services.json"


@pytest.fixture
def shop(client_factory, monkeypatch):
    s = discovery_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    turn_on_sample(s)
    return s


def set_type(shop, business_type: str) -> None:
    owner_sql("update tenants set business_type = $2 where id = $1", shop.tenant_id, business_type)


def put_pack(client, family, trade=None):
    return client.put(f"{BASE}/pack", json={"family": family, "trade": trade})


def last_run(shop) -> dict:
    row = owner_sql("select checks, pack from discovery_runs where tenant_id = $1 "
                    "and status = 'done' order by created_at desc limit 1", shop.tenant_id)[0]
    return {"checks": json.loads(row["checks"]),
            "pack": json.loads(row["pack"]) if row["pack"] else None}


# ── the list ────────────────────────────────────────────────────────────────────────────


def test_every_role_reads_the_packs_with_titles_in_both_languages_trades_and_counts(shop):
    for client in (shop.owner, shop.admin, shop.agent):
        answer = client.get(f"{BASE}/packs", params={"lang": "ar"})
        assert answer.status_code == 200, answer.text
    items = {p["id"]: p for p in answer.json()["items"]}
    assert list(items) == ["core", "food", "appointments", "home_services", "retail",
                           "stays_schools", "online_only", "health", "online_seller"]
    core = items["core"]
    assert core["kind"] == "core" and core["checks"] == core["total_checks"] == 12
    assert core["title"] == core["title_ar"] and core["title_en"]
    food = items["food"]
    assert food["total_checks"] == 12 and food["checks"] == 0
    assert {t["key"] for t in food["trades"]} == {"restaurant", "cafe", "bakery"}
    assert all(t["title_en"] and t["title_ar"] and t["title"] == t["title_ar"]
               for t in food["trades"])
    clinic = next(t for t in items["appointments"]["trades"] if t["key"] == "clinic")
    assert clinic["overlays"] == ["health"]
    assert items["health"]["never_edit"] == ["services", "offers"]
    assert items["online_seller"]["skip"] == ["website_location_missing"]
    assert items["health"]["total_checks"] is None


def test_the_packs_answer_404_with_the_module_off(client_factory, monkeypatch):
    off = discovery_shop(client_factory, monkeypatch, module=False)
    for answer in (off.owner.get(f"{BASE}/packs"), off.owner.get(f"{BASE}/pack"),
                   put_pack(off.owner, "food")):
        assert (answer.status_code, answer.json()["code"]) == (404, "module_off")


# ── this business's pack ────────────────────────────────────────────────────────────────


def test_a_business_starts_with_the_pack_of_its_type_and_no_type_means_the_core(shop):
    set_type(shop, "salon")
    answer = shop.owner.get(f"{BASE}/pack").json()
    assert (answer["family"], answer["trade"], answer["chosen"]) == ("appointments", "salon", False)
    assert answer["business_type"] == "salon" and answer["checks"] == 12
    assert [p["id"] for p in answer["packs"]] == ["core", "appointments"]
    set_type(shop, "clinic")
    clinic = shop.admin.get(f"{BASE}/pack").json()
    assert clinic["overlays"] == ["health"] and clinic["never_edit"] == ["offers", "services"]
    set_type(shop, "")
    nothing = shop.owner.get(f"{BASE}/pack").json()
    assert (nothing["family"], nothing["trade"]) == (None, None)
    assert [p["id"] for p in nothing["packs"]] == ["core"]


def test_the_owner_and_an_admin_set_the_pack_and_it_is_on_the_activity_record(shop):
    set_type(shop, "salon")
    answer = put_pack(shop.owner, "food", "bakery")
    assert answer.status_code == 200, answer.text
    assert (answer.json()["family"], answer.json()["trade"], answer.json()["chosen"]) == (
        "food", "bakery", True)
    assert shop.admin.get(f"{BASE}/pack").json()["trade"] == "bakery"
    again = put_pack(shop.owner, "food", "bakery")  # the same: nothing new on the record
    assert again.status_code == 200
    assert put_pack(shop.admin, "retail", None).json()["family"] == "retail"
    acts = activity(shop, "pack.set")
    assert [a["channel"] for a in acts] == ["portal", "portal"]
    assert json.loads(acts[0]["detail"]) == {
        "family": "food", "trade": "bakery", "from_family": "appointments",
        "from_trade": "salon", "set_aside": 0}
    assert json.loads(acts[1]["detail"])["trade"] == ""


def test_the_agent_role_cannot_read_or_set_the_pack(shop):
    for answer in (shop.agent.get(f"{BASE}/pack"), put_pack(shop.agent, "food", "bakery")):
        assert (answer.status_code, answer.json()["code"]) == (403, "forbidden")
    assert shop.owner.get(f"{BASE}/pack").json()["chosen"] is False


def test_only_a_family_and_a_trade_from_the_list_are_accepted(shop):
    for family, trade, code in (("bakeries", None, "bad_family"), ("health", None, "bad_family"),
                                ("core", None, "bad_family"), ("food", "clinic", "bad_trade"),
                                ("food", "no such trade", "bad_trade")):
        answer = put_pack(shop.owner, family, trade)
        assert (answer.status_code, answer.json()["code"]) == (422, code), (family, trade)
        assert answer.json()["message_ar"]
    too_long = shop.owner.put(f"{BASE}/pack", json={"family": "f" * 41})
    assert too_long.status_code == 422
    extra = shop.owner.put(f"{BASE}/pack", json={"family": "food", "overlays": ["health"]})
    assert extra.status_code == 422  # overlays come with the trade, never on their own
    assert shop.owner.get(f"{BASE}/pack").json()["chosen"] is False


def test_one_business_s_pack_is_its_own(client_factory, monkeypatch, shop):
    other = discovery_shop(client_factory, monkeypatch, roles=("owner",))
    owner_sql("update tenants set business_type = 'restaurant' where id = $1", other.tenant_id)
    assert put_pack(shop.owner, "online_only", "online_seller").status_code == 200
    seen = other.owner.get(f"{BASE}/pack").json()
    assert (seen["family"], seen["trade"], seen["chosen"]) == ("food", "restaurant", False)
    assert owner_sql("select count(*) as n from discovery_settings where tenant_id = $1 "
                     "and pack_family is not null", other.tenant_id)[0]["n"] == 0
    assert activity(other, "pack.set") == []


# ── a check-up runs the business's pack ─────────────────────────────────────────────────


def test_a_check_up_keeps_its_pack_and_the_overview_says_n_of_m_checks_match(shop):
    set_type(shop, "bakery")
    run_check_up(shop.owner)
    kept = last_run(shop)
    assert kept["pack"] == {"family": "food", "trade": "bakery", "overlays": [],
                            "packs": ["core", "food"]}
    assert {e["pack"] for e in kept["checks"]} == {"core"}
    checks = shop.agent.get(f"{BASE}/overview").json()["checks"]
    states = [e["state"] for e in kept["checks"]]
    assert checks["matched"] == states.count("pass")
    assert checks["measured"] == states.count("pass") + states.count("fail")
    assert checks["not_measured"] == states.count("not_measured")
    assert checks["total"] == len(states) == checks["measured"] + checks["not_measured"]
    assert (checks["family"], checks["trade"]) == ("food", "bakery")
    assert [(p["id"], p["kind"]) for p in checks["by_pack"]] == [("core", "core"),
                                                                ("food", "family")]
    core = checks["by_pack"][0]
    assert {k: core[k] for k in ("matched", "measured", "total", "not_measured")} == {
        k: checks[k] for k in ("matched", "measured", "total", "not_measured")}
    assert checks["by_pack"][1] | {"id": None, "kind": None} == {
        "id": None, "kind": None, "matched": 0, "measured": 0, "total": 0, "not_measured": 0}


def test_before_any_check_up_every_count_is_zero(shop):
    set_type(shop, "")
    checks = shop.owner.get(f"{BASE}/overview").json()["checks"]
    assert checks["run_id"] is None
    assert (checks["matched"], checks["measured"], checks["total"], checks["not_measured"]) == (
        0, 0, 0, 0)
    assert [p["id"] for p in checks["by_pack"]] == ["core"]


def test_an_online_seller_is_not_checked_for_an_address_and_its_old_finding_is_set_aside(shop):
    run_check_up(shop.owner)
    assert by_rule(findings(shop.owner)).get("website_location_missing")
    answer = put_pack(shop.owner, "online_only", "online_seller")
    assert answer.status_code == 200
    assert json.loads(activity(shop, "pack.set")[0]["detail"])["set_aside"] == 1
    assert "website_location_missing" not in by_rule(findings(shop.owner))
    assert by_rule(findings(shop.owner, "skipped"))["website_location_missing"]
    run = run_check_up(shop.owner)
    kept = last_run(shop)
    assert "website_location_missing" not in {e["rule"] for e in kept["checks"]}
    assert kept["pack"]["overlays"] == ["online_seller"]
    # the log keeps its four parts; the website part now checks nothing
    website = next(s for s in run["steps"] if s["tool"] == "rules.website")
    assert website["summary"] == "Checked the website: 0 passed, 0 found, 0 not measured."


def test_a_clinic_s_pack_takes_service_text_out_of_what_a_proposal_may_change(shop, monkeypatch):
    """No source writes service text today; the guard is proven by a source that would."""
    set_type(shop, "clinic")
    seen: list = []
    real = proposals.build_step

    async def watch(conn, run, kind, writes, now):
        seen.append(set(writes))
        return await real(conn, run, kind, writes, now)

    sample = engine.connectors.get("sample")
    wider = SimpleNamespace(
        snapshot=sample.snapshot, by_hand=False,
        writes=frozenset(sample.writes) | {("listing", "services"), ("website", "offers")})
    monkeypatch.setattr(proposals, "build_step", watch)
    monkeypatch.setattr(engine.connectors, "get", lambda kind: wider)
    run_check_up(shop.owner)
    assert seen and ("listing", "services") not in seen[0] and ("website", "offers") not in seen[0]
    assert set(sample.writes) <= seen[0]


# ── the first-party facts (workstream C plugs in here) ──────────────────────────────────


def first_party_rule(seen: list) -> rules.Rule:
    def check(ctx: rules.Context) -> list[rules.Outcome]:
        seen.append((ctx.first_party, ctx.pack))
        state = rules.NOT_MEASURED if ctx.first_party is None else rules.PASS
        return [rules.Outcome("fp_test", None, state)]

    return rules.Rule("fp_test", "ops", "owner", "medium", 1, check)


def with_first_party(monkeypatch, module) -> None:
    rule = module.FIRSTPARTY_RULES[0]
    every = rules.RULES + (rule,)
    monkeypatch.setattr(engine, "_firstparty", module)
    monkeypatch.setattr(engine, "FIRSTPARTY_RULES", (rule,))
    monkeypatch.setattr(engine, "ALL_RULES", every)
    monkeypatch.setattr(engine, "RULE_BY_ID", {r.id: r for r in every})
    monkeypatch.setattr(engine, "PACKS", packs.Registry.from_data(
        packs.PACKS, [r.id for r in every], [rule.id]))


def test_the_first_party_facts_are_read_once_and_given_to_the_rules_with_the_pack(
        shop, monkeypatch):
    set_type(shop, "bakery")
    seen, calls = [], []
    facts = object()

    async def first_party_facts(conn, tenant_id, now):
        calls.append(tenant_id)
        return facts

    module = SimpleNamespace(FIRSTPARTY_RULES=(first_party_rule(seen),),
                             first_party_facts=first_party_facts)
    with_first_party(monkeypatch, module)
    run = run_check_up(shop.owner)
    assert [str(c) for c in calls] == [str(shop.tenant_id)]
    assert seen == [(facts, "food/bakery")]
    # its own part is logged after the four, and it is counted, but it is not in the score
    assert [s["tool"] for s in run["steps"]][1:6] == [
        "rules.presence", "rules.reviews", "rules.website", "rules.whatsapp", "rules.ops"]
    assert run["steps"][5]["summary"].startswith("Checked against the business's own records")
    assert "ops" not in run["score_parts"]
    entry = next(e for e in last_run(shop)["checks"] if e["rule"] == "fp_test")
    assert entry == {"rule": "fp_test", "location": None, "state": "pass", "pack": "core"}


def test_without_first_party_facts_their_rules_are_not_measured_and_the_check_up_goes_on(
        shop, monkeypatch):
    set_type(shop, "")
    seen = []

    async def broken(conn, tenant_id, now):
        raise RuntimeError("the records could not be read")

    module = SimpleNamespace(FIRSTPARTY_RULES=(first_party_rule(seen),),
                             first_party_facts=broken)
    with_first_party(monkeypatch, module)
    run_check_up(shop.owner)
    assert seen == [(None, "core")]
    entry = next(e for e in last_run(shop)["checks"] if e["rule"] == "fp_test")
    assert entry["state"] == "not_measured"
    before = shop.owner.get(f"{BASE}/overview").json()["checks"]
    assert before["not_measured"] == sum(
        e["state"] == "not_measured" for e in last_run(shop)["checks"])


def test_the_engine_works_with_no_first_party_module_installed():
    """Before workstream C merges, `firstparty` is missing: nothing is read and nothing breaks."""
    if engine._firstparty is not None:
        pytest.skip("the first-party checks are installed")
    assert engine.FIRSTPARTY_RULES == () and engine.ALL_RULES == rules.RULES


# ── a new vertical in a day ─────────────────────────────────────────────────────────────


def test_a_new_family_added_as_data_is_picked_and_run_with_no_code_change(shop, monkeypatch):
    new = json.loads(FIXTURE.read_text(encoding="utf-8"))
    monkeypatch.setattr(engine, "PACKS", packs.Registry.from_data(
        list(packs.PACKS) + [new], [r.id for r in engine.ALL_RULES],
        [r.id for r in engine.FIRSTPARTY_RULES]))
    listed = {p["id"]: p for p in shop.owner.get(f"{BASE}/packs").json()["items"]}
    assert listed["mobile_services"]["total_checks"] == 11
    assert put_pack(shop.owner, "mobile_services", "mobile_car_wash").status_code == 200
    run_check_up(shop.owner)
    kept = last_run(shop)
    assert kept["pack"]["family"] == "mobile_services"
    assert kept["pack"]["packs"] == ["core", "mobile_services"]
    assert "website_location_missing" not in {e["rule"] for e in kept["checks"]}
    checks = shop.owner.get(f"{BASE}/overview").json()["checks"]
    assert [p["id"] for p in checks["by_pack"]] == ["core", "mobile_services"]
    assert checks["total"] == len(kept["checks"])


def test_a_stored_family_that_is_no_longer_in_the_packs_falls_back_and_never_fails(shop):
    set_type(shop, "bakery")
    owner_sql("insert into discovery_settings (tenant_id, pack_family, pack_trade) "
              "values ($1, 'gone_family', 'x') on conflict (tenant_id) do update "
              "set pack_family = 'gone_family', pack_trade = 'x'", shop.tenant_id)
    answer = shop.owner.get(f"{BASE}/pack").json()
    assert (answer["family"], answer["trade"], answer["chosen"]) == ("food", "bakery", False)
    assert last_run_done(shop)


def last_run_done(shop) -> bool:
    return run_check_up(shop.owner)["status"] == "done"


def test_the_selection_key_is_what_the_context_holds():
    reg = engine.PACKS
    ctx = rules.Context(None, [], pack=reg.select("retail", "pharmacy").key)  # type: ignore[arg-type]
    assert ctx.pack == "retail/pharmacy" and ctx.first_party is None
    assert replace(ctx, first_party=1).first_party == 1
