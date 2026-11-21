"""Discovery: what each check found at each place (ALY-333, spec 065 "Checks per place"). A check-up
keeps its outcomes with the run, and `GET /api/discovery/checks` answers them as rules and places,
so a screen can tell passing from not measured. Real PostgreSQL, HTTP in and out."""

import json
from uuid import UUID

import pytest

from alyr.modules.discovery import rules, scoring
from discovery_support import discovery_shop, findings, run_check_up, turn_on_sample
from test_consent import owner_sql

STATES = {"pass", "fail", "not_measured"}


@pytest.fixture
def shop(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    return shop


def checks(client, **query) -> dict:
    answer = client.get("/api/discovery/checks", params=query)
    assert answer.status_code == 200, answer.text
    return answer.json()


def rows(answer: dict) -> list[dict]:
    """Every row of the answer: each place, and the whole business when it has checks."""
    return answer["places"] + ([answer["business"]] if answer["business"] else [])


def test_before_a_check_up_nothing_is_measured_and_the_rules_are_still_named(shop):
    answer = checks(shop.owner, lang="en")
    assert (answer["measured"], answer["run_id"], answer["finished_at"]) == (False, None, None)
    assert answer["places"] == [] and answer["business"] is None
    assert [r["id"] for r in answer["rules"]] == [r.id for r in rules.RULES]
    assert all(r["label"] and r["part"] in rules.PARTS for r in answer["rules"])


def test_after_a_check_up_every_place_has_a_state_for_every_rule_that_looked_at_it(shop):
    run = run_check_up(shop.owner)
    answer = checks(shop.owner, lang="en")
    assert answer["measured"] is True and answer["run_id"] == run["id"] and answer["finished_at"]
    places = shop.owner.get("/api/discovery/locations").json()["items"]
    assert [p["id"] for p in answer["places"]] == [p["id"] for p in places], "in their order"
    known = {r.id for r in rules.RULES}
    seen = set()
    for row in rows(answer):
        assert set(row["checks"]) <= known and set(row["checks"].values()) <= STATES
        states = list(row["checks"].values())
        assert (row["passed"], row["failed"], row["not_measured"]) == (
            states.count("pass"), states.count("fail"), states.count("not_measured"))
        assert row["fixed"] == [], "a first check-up has nothing before it"
        seen |= set(row["checks"])
    assert seen == known, "every rule looked somewhere"
    # a rule is about places or about the whole business, never both
    in_places = set().union(*(set(p["checks"]) for p in answer["places"]))
    assert answer["business"] and not (set(answer["business"]["checks"]) & in_places)


def test_the_fails_are_exactly_the_open_findings_and_the_score_is_made_of_these_checks(shop):
    run = run_check_up(shop.owner)
    answer = checks(shop.owner)
    failed = {(p["id"], rule) for p in answer["places"]
              for rule, s in p["checks"].items() if s == "fail"}
    failed |= {(None, rule) for rule, s in answer["business"]["checks"].items() if s == "fail"}
    found = {((f["location"] or {}).get("id"), f["rule_id"]) for f in findings(shop.owner)}
    assert failed == found and failed
    # the same outcomes, scored again, give the run's score: with the Answers check off (the
    # default), nothing else went into it
    kept = json.loads(owner_sql("select checks::text as checks from discovery_runs where id = $1",
                                UUID(run["id"]))[0]["checks"])
    outcomes = [rules.Outcome(c["rule"], UUID(c["location"]) if c["location"] else None, c["state"])
                for c in kept]
    assert scoring.score(outcomes)[0] == run["score"]


def test_a_second_check_up_names_what_failed_before_and_passes_now(shop):
    run_check_up(shop.owner)
    first = checks(shop.owner)
    run_check_up(shop.owner)  # the sample's next stage: some problems are fixed
    second = checks(shop.owner)
    was = {(p["id"], rule): s for p in first["places"] for rule, s in p["checks"].items()}
    fixed = {(p["id"], rule) for p in second["places"] for rule in p["fixed"]}
    assert fixed, "the sample fixes something at its second stage"
    for place in second["places"]:
        for rule, state in place["checks"].items():
            expected = state == "pass" and was.get((place["id"], rule)) == "fail"
            assert ((place["id"], rule) in fixed) == expected, (place["name"], rule)


def test_a_check_up_from_before_the_column_is_not_measured_and_never_guessed(shop):
    run = run_check_up(shop.owner)
    owner_sql("update discovery_runs set checks = null where id = $1", UUID(run["id"]))
    answer = checks(shop.owner)
    assert answer["measured"] is False and answer["places"] == [] and answer["business"] is None
    assert answer["run_id"] == run["id"], "it still says which check-up it looked at"
    # and anything in the column the API does not know is left out, not shown
    unknown = [{"rule": "made_up", "location": None, "state": "pass"},
               {"rule": "rating_low", "location": None, "state": "excellent"}]
    owner_sql("update discovery_runs set checks = $2::text::jsonb where id = $1",
              UUID(run["id"]), json.dumps(unknown))
    assert checks(shop.owner)["measured"] is False


def test_labels_come_in_the_readers_language(shop):
    run_check_up(shop.owner)
    en, ar = checks(shop.owner, lang="en"), checks(shop.owner, lang="ar")
    assert [r["id"] for r in en["rules"]] == [r["id"] for r in ar["rules"]]
    assert all(a["label"] != b["label"] for a, b in zip(en["rules"], ar["rules"], strict=True))
    assert [p["checks"] for p in en["places"]] == [p["checks"] for p in ar["places"]]
    assert shop.owner.get("/api/discovery/checks", params={"lang": "fr"}).status_code == 422


def test_every_role_may_read_it_and_it_is_not_on_the_activity_record(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    turn_on_sample(shop)
    run_check_up(shop.owner)
    count = "select count(*) from activity where tenant_id = $1"
    before = owner_sql(count, shop.tenant_id)[0]["count"]
    answers = [checks(getattr(shop, role)) for role in ("owner", "admin", "agent")]
    assert answers[0] == answers[1] == answers[2]
    after = owner_sql(count, shop.tenant_id)[0]["count"]
    assert after == before, "a read leaves no record"


def test_with_the_module_off_it_answers_404_and_signing_in_is_required(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, module=False)
    answer = shop.owner.get("/api/discovery/checks")
    assert (answer.status_code, answer.json()["code"]) == (404, "module_off")
    assert client_factory().get("/api/discovery/checks").status_code == 401


def test_another_shop_sees_only_its_own_checks(client_factory, monkeypatch):
    a = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(a)
    run_check_up(a.owner)
    mine = checks(a.owner)
    b = discovery_shop(client_factory, monkeypatch)
    nothing = checks(b.owner)
    assert (nothing["measured"], nothing["run_id"], nothing["places"]) == (False, None, [])
    turn_on_sample(b)
    run_check_up(b.owner)
    theirs = checks(b.owner)
    assert theirs["run_id"] != mine["run_id"]
    assert not ({p["id"] for p in theirs["places"]} & {p["id"] for p in mine["places"]})
    assert checks(a.owner) == mine, "B's check-up changed nothing of A's"
