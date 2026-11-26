"""The first-party findings as the API gives them (Discovery 2.0, workstream C): every piece of
evidence worded in the reader's language, and no `~fp_` marker, label key or place key ever reaching
the screen raw."""

import json

import pytest

from alyr.modules.discovery import firstparty
from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql
from test_discovery_firstparty import every_outcome

BASE = "/api/discovery"
RAW = ("~", "fp_", "alyr_")


@pytest.fixture
def shop(client_factory, monkeypatch):
    s = discovery_shop(client_factory, monkeypatch, roles=("owner",))
    turn_on_sample(s)
    return s


def store_first_party_findings(shop, run_id) -> set[str]:
    """One finding per first-party rule, with the evidence the rules really produce, stored as the
    engine stores evidence (keys and plain values, worded when read)."""
    stored = set()
    for outcome in every_outcome():
        if outcome.state != "fail" or outcome.rule_id in stored:
            continue
        rule = firstparty.RULE_BY_ID[outcome.rule_id]
        evidence = [{"label": e.label, "value": e.value, "where": e.where,
                     "seen_at": "2026-11-26T06:00:00+00:00"} for e in outcome.evidence]
        owner_sql(
            "insert into discovery_findings (tenant_id, fingerprint, rule_id, kind, severity, "
            "evidence, first_run_id, last_run_id) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)",
            shop.tenant_id, f"{rule.id}:*", rule.id, rule.kind, rule.severity,
            json.dumps(evidence), run_id)
        stored.add(rule.id)
    return stored


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_no_first_party_evidence_reaches_the_api_raw(shop, lang):
    run = run_check_up(shop.owner)
    stored = store_first_party_findings(shop, run["id"])
    assert stored == set(firstparty.RULE_BY_ID)
    answer = shop.owner.get(f"{BASE}/findings", params={"status": "open", "lang": lang})
    assert answer.status_code == 200, answer.text
    mine = [f for f in answer.json()["items"] if f["rule_id"] in stored]
    assert {f["rule_id"] for f in mine} == stored
    for finding in mine:
        assert finding["evidence"], finding["rule_id"]
        for item in finding["evidence"]:
            for key in ("label", "value", "where"):
                text = item[key]
                assert text and not text.startswith(RAW), (finding["rule_id"], key, text)
        if lang == "ar":
            assert any("؀" <= ch <= "ۿ" for ch in finding["evidence"][0]["label"])
