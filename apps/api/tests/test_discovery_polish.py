"""Discovery 2.0 polish pass (agent P): the two small additive fields the v2 screens read.

* `GET /api/discovery/checks`: each rule says which pack brought it into the last check-up
  (`pack`, `core` before any check-up) and whether it reads ALYR's own records (`first_party`),
  so Checks can group Core / Your own data / the family pack from the API, not from a list kept
  in the screen.
* A proposal's side whose Google text was removed after 30 days (`retention.py`) carries
  `removed: true`, so a screen says "Removed after 30 days" in its own words and never draws an
  empty value.

Real PostgreSQL, HTTP in and out."""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from alyr.modules.discovery import engine, retention, rules
from alyr.modules.discovery.connectors import base, sample
from discovery_proposals_support import BASE, approve, get, prepared_shop, proposals
from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql


def checks(client, **query) -> dict:
    answer = client.get(f"{BASE}/checks", params=query)
    assert answer.status_code == 200, answer.text
    return answer.json()


def set_run_pack(shop, run_id: str, rule_id: str, pack: str) -> None:
    """Mark one rule of a kept check-up as brought by `pack` (as a family pack would)."""
    kept = json.loads(owner_sql(
        "select checks::text as checks from discovery_runs where id = $1",
        UUID(run_id))[0]["checks"])
    for entry in kept:
        if entry["rule"] == rule_id:
            entry["pack"] = pack
    owner_sql("update discovery_runs set checks = $2::text::jsonb where id = $1",
              UUID(run_id), json.dumps(kept))


# ── checks: pack and first-party marks ─────────────────────────────────────────────────


def test_before_a_check_up_every_rule_is_core_and_says_whether_it_is_first_party(
        client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    answer = checks(shop.owner, lang="en")
    own = {r.id for r in engine.FIRSTPARTY_RULES}
    assert [r["id"] for r in answer["rules"]] == [r.id for r in rules.RULES]
    for rule in answer["rules"]:
        assert rule["pack"] == "core"
        assert rule["first_party"] is (rule["id"] in own)


def test_after_a_check_up_each_rule_names_the_pack_that_brought_it(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    run = run_check_up(shop.owner)
    answer = checks(shop.owner)
    kept = json.loads(owner_sql(
        "select checks::text as checks from discovery_runs where id = $1",
        UUID(run["id"]))[0]["checks"])
    brought = {e["rule"]: e.get("pack") or "core" for e in kept}
    for rule in answer["rules"]:
        assert rule["pack"] == brought.get(rule["id"], "core")
    # a family pack's rule says so; the others stay as they were
    rule_id = answer["rules"][0]["id"]
    set_run_pack(shop, run["id"], rule_id, "food")
    again = {r["id"]: r for r in checks(shop.owner)["rules"]}
    assert again[rule_id]["pack"] == "food"
    assert all(r["pack"] == answer_rule["pack"]
               for answer_rule in answer["rules"] if answer_rule["id"] != rule_id
               for r in [again[answer_rule["id"]]])
    # the words are the reader's, the marks are not
    ar = {r["id"]: r for r in checks(shop.owner, lang="ar")["rules"]}
    assert {k: (v["pack"], v["first_party"]) for k, v in ar.items()} == {
        k: (v["pack"], v["first_party"]) for k, v in again.items()}


def test_owner_admin_and_staff_read_the_same_marks(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    turn_on_sample(shop)
    run = run_check_up(shop.owner)
    set_run_pack(shop, run["id"], rules.RULES[0].id, "appointments")
    seen = [checks(getattr(shop, role))["rules"] for role in ("owner", "admin", "agent")]
    assert seen[0] == seen[1] == seen[2]
    assert seen[2][0]["pack"] == "appointments"


def test_another_shop_never_sees_this_shops_packs(client_factory, monkeypatch):
    a = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(a)
    run = run_check_up(a.owner)
    set_run_pack(a, run["id"], rules.RULES[0].id, "food")
    b = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(b)
    assert all(r["pack"] == "core" for r in checks(b.owner)["rules"])
    run_check_up(b.owner)
    theirs = {r["id"]: r["pack"] for r in checks(b.owner)["rules"]}
    assert theirs[rules.RULES[0].id] != "food"
    assert {r["id"]: r["pack"] for r in checks(a.owner)["rules"]}[rules.RULES[0].id] == "food"


# ── a removed "before" ─────────────────────────────────────────────────────────────────


@pytest.fixture
def google_shop(client_factory, monkeypatch):
    """The sample read as if it were Google's (as `test_discovery_retention.py` does)."""
    monkeypatch.setattr(base, "GOOGLE_SOURCES", base.GOOGLE_SOURCES | {"sample"})
    monkeypatch.setattr(sample, "BUSINESS_PROFILE", True)
    return prepared_shop(client_factory, monkeypatch)


def expire_at(shop, now: datetime) -> dict:
    client = shop.owner

    async def go():
        async with client.app.state.db.tenant(shop.tenant_id) as conn:
            return await retention.expire_google_text(conn, now)

    return client.portal.call(go)


def test_a_removed_before_is_flagged_in_both_languages_and_the_after_is_whole(google_shop):
    shop = google_shop
    live = proposals(shop.owner, "live")
    approve(shop.owner, live[0])
    applied = live[0]["id"]
    waiting = live[1]["id"]
    whole = get(shop.owner, applied)
    assert "removed" not in whole["before"] and "removed" not in whole["after"]

    expire_at(shop, datetime.now(UTC) + timedelta(days=31))
    en, ar = get(shop.owner, applied), get(shop.owner, applied, "ar")
    assert en["before"] == {"text": "removed after 30 days (Google's terms)", "lines": [],
                            "removed": True}
    assert ar["before"]["removed"] is True and ar["before"]["text"]
    assert "removed" not in en["after"] and en["after"] == whole["after"]
    # the list says the same, and a proposal still waiting is untouched
    listed = {p["id"]: p for p in proposals(shop.owner, "all")}
    assert listed[applied]["before"]["removed"] is True
    assert "removed" not in listed[waiting]["before"]
