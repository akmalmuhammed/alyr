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
    engine stores evidence (keys and plain values, worded when read). The check-up may already have
    made one of them (`season_due:*` from 27 Nov to 18 Dec, three weeks before National Day): that
    one is overwritten, never inserted twice."""
    stored = set()
    for outcome in every_outcome():
        if outcome.state != "fail" or outcome.rule_id in stored:
            continue
        rule = firstparty.RULE_BY_ID[outcome.rule_id]
        evidence = [{"label": e.label, "value": e.value, "where": e.where,
                     "seen_at": "2026-11-26T06:00:00+00:00"} for e in outcome.evidence]
        owner_sql(
            "insert into discovery_findings (tenant_id, fingerprint, rule_id, kind, severity, "
            "evidence, first_run_id, last_run_id) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7) "
            "on conflict (tenant_id, fingerprint) do update set evidence = excluded.evidence, "
            "status = 'open', last_run_id = excluded.last_run_id",
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


def test_a_check_up_makes_one_season_finding_however_many_seasons_are_due(shop):
    """Agent C3: `season_due` answers one outcome for the whole business, with one piece of
    evidence per season due, so one check-up (or two) never makes `season_due:*` twice."""
    from datetime import date

    from firstparty_support import context, facts

    two = (firstparty.Season("national_day", date(2026, 12, 18), 21, fixed=True),
           firstparty.Season("ramadan", date(2026, 12, 20), 28))
    got = firstparty.RULE_BY_ID["season_due"].check(
        context(fp=facts(today=date(2026, 12, 1), seasons=two)))
    assert [(o.fingerprint, o.state, len(o.evidence)) for o in got] == [("season_due:*", "fail", 2)]
    run_check_up(shop.owner)
    run_check_up(shop.owner)
    rows = owner_sql("select count(*) as n from discovery_findings where tenant_id = $1 "
                     "and fingerprint = 'season_due:*'", shop.tenant_id)
    assert rows[0]["n"] <= 1


@pytest.mark.parametrize(("today", "state", "seasons"), [
    ("2026-11-26", "pass", []),  # the day before National Day's three weeks
    ("2026-11-27", "fail", ["national_day"]),
    ("2026-12-10", "fail", ["national_day"]),
    ("2026-12-20", "pass", []),  # after it, and before Ramadan's four weeks
    ("2027-01-11", "fail", ["ramadan"]),
])
def test_the_real_calendar_on_fixed_days_gives_one_outcome(today, state, seasons):
    """Agent C3: the day comes from the run (`FirstPartyFacts.today`), never the wall clock, and
    each day gives one `season_due:*` outcome at most, whichever seasons are due."""
    from datetime import date

    from firstparty_support import REAL_SEASONS, context, facts

    got = firstparty.RULE_BY_ID["season_due"].check(
        context(fp=facts(today=date.fromisoformat(today), seasons=REAL_SEASONS)))
    assert len(got) == 1 and got[0].fingerprint == "season_due:*"
    assert got[0].state == state
    assert [e.value.split(":")[1] for e in got[0].evidence] == seasons


def test_no_first_party_rule_gives_a_fingerprint_twice_in_one_run():
    """`_save_findings` inserts one finding per failing outcome: two outcomes with one fingerprint
    in a run would be refused by the database. Every first-party rule answers once per place (or
    once for the business), with one place or two, and with every season due at once."""
    from datetime import date

    from firstparty_support import CLOSED_FRIDAY, context, facts
    from test_discovery_firstparty import at, nuqta

    every = tuple(firstparty.Season(s.key, date(2026, 12, 1), 30) for s in firstparty.SEASONS)
    for places in ((nuqta(),), (nuqta(), nuqta())):
        ctx = context(*(at(p) for p in places),
                      fp=facts(today=date(2026, 11, 30), seasons=every))
        for rule in firstparty.FIRSTPARTY_RULES:
            prints = [o.fingerprint for o in rule.check(ctx)]
            assert len(prints) == len(set(prints)), (rule.id, prints)
            assert len(prints) == (1 if rule.id == "season_due" else len(places)), rule.id
    assert CLOSED_FRIDAY  # the places above are closed on Friday (`at`)
