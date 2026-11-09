"""A check-up, through the real path (spec 065): HTTP in and out, real PostgreSQL, the jobs worker.

The sample connector's three stages, the finding upsert by fingerprint and what happens to a
finding that stops being true, the budgets, the limits and a run that fails keeping its log.
"""

import asyncio
from dataclasses import replace
from uuid import UUID

import pytest

from alyr.config import get_settings
from alyr.db import Database
from alyr.modules.discovery import connectors, engine, rules
from alyr.modules.discovery.connectors import ConnectorError
from discovery_support import by_rule, discovery_shop, findings, run_check_up, turn_on_sample
from test_consent import owner_sql

STAGE_0_RULES = {
    "listing_missing": 1, "listing_unclaimed": 1, "hours_missing": 1, "hours_conflict": 1,
    "phone_conflict": 1, "name_conflict": 1, "category_missing": 1, "photos_few": 1,
    "website_location_missing": 1, "whatsapp_link_missing": 2, "review_unanswered": 1,
    "rating_low": 1,
}


@pytest.fixture
def shop(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, roles=("owner", "agent"))
    turn_on_sample(shop)
    return shop


def counts(client) -> dict:
    return client.get("/api/discovery/findings").json()["counts"]


def finding_of(client, rule_id: str, status: str = "open") -> dict:
    [found] = by_rule(findings(client, status))[rule_id][:1]
    return found


# ── the sample, stage by stage ──────────────────────────────────────────────────────────


def test_turning_the_sample_on_gives_a_shop_with_no_places_the_five_fictional_branches(shop):
    places = shop.owner.get("/api/discovery/locations").json()["items"]
    assert [p["area"] for p in places] == [
        "West Bay", "Al Wakra", "Lusail", "Al Sadd", "Industrial Area"]
    assert [p["is_primary"] for p in places] == [True, False, False, False, False]
    assert all(p["name"].startswith("Nuqta Car Care") and p["name_ar"] for p in places)


def test_the_first_run_fires_every_one_of_the_twelve_rules_with_evidence(shop):
    run = run_check_up(shop.owner)
    found = by_rule(findings(shop.owner))
    assert {rule: len(items) for rule, items in found.items()} == STAGE_0_RULES
    assert set(found) == {r.id for r in rules.RULES}
    for items in found.values():
        for item in items:
            assert item["evidence"], item["rule_id"]
            for line in item["evidence"]:
                assert line["label"] and line["value"] and line["where"] and line["seen_at"]
                assert "(sample data)" in line["where"]
    assert run["status"] == "done" and 0 < run["score"] < 100
    assert run["score_parts"]["ai"] == {"value": None, "measured": False, "weight": 10}
    assert all(run["score_parts"][p]["measured"] for p in ("presence", "reviews", "website",
                                                             "whatsapp"))


def test_a_run_has_a_log_with_one_row_per_step_in_order(shop):
    run = run_check_up(shop.owner)
    assert [s["tool"] for s in run["steps"]] == [
        "connector.snapshot", "rules.presence", "rules.reviews", "rules.website",
        "rules.whatsapp", "findings.save", "reviews.save", "proposals.build", "proposals.verify",
        "score.compute"]
    assert [s["seq"] for s in run["steps"]] == list(range(1, 11))
    assert all(s["ok"] and s["summary"].endswith(".") for s in run["steps"])
    assert run["steps_used"] == 10 and run["step_budget"] == 60
    assert run["steps"][0]["summary"] == "Got 5 places from the sample business."
    assert run["steps"][5]["summary"] == "Saved the list: 13 new, 0 still there, 0 closed."


def test_three_runs_show_the_score_moving_and_findings_closing_until_nothing_is_left(shop):
    owner = shop.owner
    scores, open_counts = [], []
    for stage in range(4):
        run = run_check_up(owner)
        scores.append(run["score"])
        open_counts.append(counts(owner)["open"])
        overview = owner.get("/api/discovery/overview").json()
        assert overview["score"] == run["score"]
        if stage:
            assert overview["delta"] == {
                "score_change": scores[-1] - scores[-2],
                "since_run_id": overview["delta"]["since_run_id"]}
    assert open_counts == [13, 8, 4, 0]
    assert scores == sorted(set(scores)) and scores[-1] == 100
    # a fifth run changes nothing: the sample stays at its last stage
    assert run_check_up(owner)["score"] == 100
    assert counts(owner)["open"] == 0 and counts(owner)["gone"] == 13


def test_a_finding_keeps_its_fingerprint_and_is_updated_never_repeated(shop):
    run_check_up(shop.owner)
    before = {f["rule_id"] + (f["location"] or {"id": ""})["id"]: f
              for f in findings(shop.owner)}
    run_check_up(shop.owner)
    after = findings(shop.owner)
    # stage 1 closed five; the other eight are the same rows with a later "last seen"
    assert len(after) == 8
    for f in after:
        old = before[f["rule_id"] + (f["location"] or {"id": ""})["id"]]
        assert f["id"] == old["id"] and f["first_seen_at"] == old["first_seen_at"]
        assert f["last_seen_at"] > old["last_seen_at"]
    rows = owner_sql("select fingerprint, count(*) from discovery_findings where tenant_id = $1 "
                     "group by fingerprint having count(*) > 1", shop.tenant_id)
    assert rows == []


def test_a_rule_that_stops_being_true_sets_gone_and_the_run_that_saw_it(shop):
    run_check_up(shop.owner)
    hours = finding_of(shop.owner, "hours_missing")
    second = run_check_up(shop.owner)
    gone = shop.owner.get(f"/api/discovery/findings/{hours['id']}").json()
    assert gone["status"] == "gone"
    [row] = owner_sql("select resolved_run_id, last_run_id from discovery_findings where id = $1",
                      UUID(hours["id"]))
    assert str(row["resolved_run_id"]) == second["id"] == str(row["last_run_id"])
    assert "hours_missing" not in by_rule(findings(shop.owner))
    assert hours["id"] in {f["id"] for f in findings(shop.owner, "gone")}


def test_owner_done_becomes_verified_when_the_next_run_no_longer_finds_it(shop):
    run_check_up(shop.owner)
    hours = finding_of(shop.owner, "hours_missing")
    marked = shop.owner.post(f"/api/discovery/findings/{hours['id']}/status",
                             json={"status": "owner_done"})
    assert marked.status_code == 200 and marked.json()["status"] == "owner_done"
    run_check_up(shop.owner)
    assert shop.owner.get(f"/api/discovery/findings/{hours['id']}").json()["status"] == "verified"
    assert counts(shop.owner)["verified"] == 1


def test_owner_done_goes_back_to_open_if_the_next_run_still_finds_it(shop):
    run_check_up(shop.owner)
    rating = finding_of(shop.owner, "rating_low")
    shop.owner.post(f"/api/discovery/findings/{rating['id']}/status", json={"status": "owner_done"})
    run_check_up(shop.owner)  # stage 1: Al Sadd's rating is the same
    again = shop.owner.get(f"/api/discovery/findings/{rating['id']}").json()
    assert again["status"] == "open"
    run_check_up(shop.owner)
    run_check_up(shop.owner)  # stage 3: the rating is up
    assert shop.owner.get(f"/api/discovery/findings/{rating['id']}").json()["status"] == "gone"


def test_a_skipped_finding_stays_skipped_while_true_and_goes_when_it_stops(shop):
    run_check_up(shop.owner)
    photos = finding_of(shop.owner, "photos_few")
    shop.owner.post(f"/api/discovery/findings/{photos['id']}/status", json={"status": "skipped"})
    run_check_up(shop.owner)  # stage 1: Al Wakra still has three photos
    assert shop.owner.get(f"/api/discovery/findings/{photos['id']}").json()["status"] == "skipped"
    run_check_up(shop.owner)  # stage 2: fourteen photos
    assert shop.owner.get(f"/api/discovery/findings/{photos['id']}").json()["status"] == "gone"


def test_a_closed_finding_that_comes_back_opens_again(shop, monkeypatch):
    mode = {"lose_hours": False}

    class Changing:
        kind = "sample"

        async def snapshot(self, locations, ctx):
            real = await connectors.SampleConnector().snapshot(locations, ctx)
            if not mode["lose_hours"]:
                return real
            places = [replace(p, listing=replace(p.listing, hours={})) if p.listing.found else p
                      for p in real.places]
            return replace(real, places=places)

    monkeypatch.setattr(connectors, "get", lambda kind: Changing())
    run_check_up(shop.owner)
    run_check_up(shop.owner)
    assert counts(shop.owner)["gone"] == 5
    mode["lose_hours"] = True
    third = run_check_up(shop.owner)
    # the hours vanished from every listing that has one: five places at stage 2, so five
    # findings, and the one that had been closed is open again, with no "resolved" left on it
    hours = by_rule(findings(shop.owner))["hours_missing"]
    assert len(hours) == 5
    [row] = owner_sql("select status, resolved_run_id, last_run_id from discovery_findings "
                      "where id = $1", UUID(hours[0]["id"]))
    assert row["status"] == "open" and row["resolved_run_id"] is None
    assert str(row["last_run_id"]) == third["id"]


def test_a_rule_that_cannot_be_measured_leaves_its_finding_alone(shop, monkeypatch):
    run_check_up(shop.owner)
    photos = finding_of(shop.owner, "photos_few")

    class Blind:
        kind = "sample"

        async def snapshot(self, locations, ctx):
            real = await connectors.SampleConnector().snapshot(locations, ctx)
            places = [replace(p, listing=replace(p.listing, photo_count=None))
                      for p in real.places]
            return replace(real, places=places)

    monkeypatch.setattr(connectors, "get", lambda kind: Blind())
    run_check_up(shop.owner)
    again = shop.owner.get(f"/api/discovery/findings/{photos['id']}").json()
    assert again["status"] == "open"  # not closed on missing data, not fired either


def test_reviews_are_saved_once_and_updated_when_a_reply_appears(shop):
    run_check_up(shop.owner)
    first = shop.owner.get("/api/discovery/reviews").json()
    assert first["summary"]["count"] == 14
    assert first["summary"]["unanswered"] == 8
    sadd = [r for r in first["items"] if r["location"]["name"].endswith("Al Sadd")]
    assert sum(1 for r in sadd if r["rating"] <= 3 and not r["replied"]) == 4
    run_check_up(shop.owner)
    second = shop.owner.get("/api/discovery/reviews").json()
    assert second["summary"]["count"] == 14
    assert second["summary"]["unanswered"] == 6
    rows = owner_sql("select source, count(*) from discovery_reviews where tenant_id = $1 "
                     "group by source", shop.tenant_id)
    assert [(r["source"], r["count"]) for r in rows] == [("sample", 14)]


# ── starting, limits and budgets ────────────────────────────────────────────────────────


def test_starting_while_one_is_queued_returns_that_run_and_queues_one_job(
        client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    shop = discovery_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    turn_on_sample(shop)
    first = shop.owner.post("/api/discovery/runs")
    second = shop.admin.post("/api/discovery/runs")
    third = shop.agent.post("/api/discovery/runs")
    assert {r.status_code for r in (first, second, third)} == {202}
    assert first.json()["id"] == second.json()["id"] == third.json()["id"]
    assert first.json()["status"] == "queued"
    jobs = owner_sql("select count(*) from jobs where tenant_id = $1 and kind = 'discovery.run'",
                     shop.tenant_id)
    assert jobs[0]["count"] == 1
    # the worker's way in: the job claims and runs it
    async def drain():
        db = Database(get_settings().database_url)
        await db.connect()
        try:
            from alyr.core.jobs import JobRunner

            runner = JobRunner(db)
            runner.register(engine.JOB, engine.DiscoveryRuns(db).run, background=True)
            return await runner.drain()
        finally:
            await db.close()

    assert asyncio.run(drain()) >= 1
    done = shop.owner.get(f"/api/discovery/runs/{first.json()['id']}").json()
    assert done["status"] == "done" and done["score"] is not None


def test_the_job_is_background_work_so_a_customers_job_is_claimed_first(client):
    assert engine.JOB in client.app.state.jobs._background


def test_two_runs_at_the_same_moment_make_one(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    shop = discovery_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    turn_on_sample(shop)
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(3) as pool:
        answers = list(pool.map(lambda c: c.post("/api/discovery/runs").json()["id"],
                                (shop.owner, shop.admin, shop.agent)))
    assert len(set(answers)) == 1
    assert owner_sql("select count(*) from discovery_runs where tenant_id = $1",
                     shop.tenant_id)[0]["count"] == 1


def test_a_second_manual_run_inside_ten_minutes_is_refused_with_how_long_to_wait(
        client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, gap=600)
    turn_on_sample(shop)
    run_check_up(shop.owner)
    again = shop.owner.post("/api/discovery/runs")
    assert again.status_code == 429
    body = again.json()
    assert body["code"] == "run_too_soon" and body["message_ar"] and body["detail"]
    assert 1 <= body["retry_after"] <= 600
    assert again.headers["retry-after"] == str(body["retry_after"])
    owner_sql("update discovery_runs set created_at = created_at - interval '11 minutes' "
              "where tenant_id = $1", shop.tenant_id)
    assert shop.owner.post("/api/discovery/runs").status_code == 202


def test_the_default_gap_is_ten_minutes(monkeypatch):
    monkeypatch.delenv("ALYR_DISCOVERY_RUN_GAP_SECONDS", raising=False)
    get_settings.cache_clear()
    assert get_settings().discovery_run_gap_seconds == 600
    get_settings.cache_clear()


def test_a_run_with_no_connection_or_no_places_is_refused(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch)
    answer = shop.owner.post("/api/discovery/runs")
    assert (answer.status_code, answer.json()["code"]) == (409, "no_connection")
    turn_on_sample(shop)
    owner_sql("delete from discovery_locations where tenant_id = $1", shop.tenant_id)
    answer = shop.owner.post("/api/discovery/runs")
    assert (answer.status_code, answer.json()["code"]) == (409, "no_locations")


def test_a_run_over_its_step_budget_stops_and_says_so(shop, monkeypatch):
    monkeypatch.setattr(engine, "STEP_BUDGET", 3)
    run = run_check_up(shop.owner, expect="failed")
    assert run["error_code"] == "run_budget_exceeded"
    assert "limit" in run["error"]
    assert [s["tool"] for s in run["steps"]] == [
        "connector.snapshot", "rules.presence", "rules.reviews", "rules.website"]
    assert [s["ok"] for s in run["steps"]] == [True, True, True, False]
    assert counts(shop.owner)["open"] == 0  # nothing was saved


def test_a_run_over_its_cost_budget_stops_before_the_call_that_would_pass_it(shop, monkeypatch):
    class Costly:
        kind = "sample"

        async def snapshot(self, locations, ctx):
            ctx.spend(60)
            ctx.spend(60)  # 120 > 100
            raise AssertionError("not reached")

    monkeypatch.setattr(connectors, "get", lambda kind: Costly())
    run = run_check_up(shop.owner, expect="failed")
    assert run["error_code"] == "run_budget_exceeded"
    assert [(s["tool"], s["ok"]) for s in run["steps"]] == [("connector.snapshot", False)]


def test_a_run_that_spent_more_than_its_budget_is_failed_after_its_step_is_logged(
        shop, monkeypatch):
    class Overspends:
        kind = "sample"

        async def snapshot(self, locations, ctx):
            real = await connectors.SampleConnector().snapshot(locations, ctx)
            ctx.spent = 500  # a connector that bypassed `spend`
            return real

    monkeypatch.setattr(connectors, "get", lambda kind: Overspends())
    run = run_check_up(shop.owner, expect="failed")
    assert run["error_code"] == "run_budget_exceeded"
    assert run["steps"][0]["tool"] == "connector.snapshot" and run["steps"][0]["ok"]


def test_more_than_200_findings_in_one_run_stops_it(shop, monkeypatch):
    monkeypatch.setattr(engine, "MAX_FINDINGS", 5)
    run = run_check_up(shop.owner, expect="failed")
    assert run["error_code"] == "too_many_findings"
    assert run["steps"][-1]["ok"] is False
    assert findings(shop.owner) == []


def test_the_limits_are_the_ones_the_spec_says():
    assert (engine.STEP_BUDGET, engine.COST_BUDGET, engine.MAX_FINDINGS) == (60, 100, 200)


def test_a_failed_run_keeps_its_log_and_a_plain_sentence_and_the_next_run_can_start(
        shop, monkeypatch):
    class Down:
        kind = "sample"

        async def snapshot(self, locations, ctx):
            raise ConnectorError("source_down", "The source did not answer.", "لم يرد المصدر.")

    monkeypatch.setattr(connectors, "get", lambda kind: Down())
    run = run_check_up(shop.owner, expect="failed")
    assert run["status"] == "failed" and run["score"] is None and run["finished_at"]
    assert run["error_code"] == "source_down"
    [step] = run["steps"]
    assert (step["tool"], step["ok"]) == ("connector.snapshot", False)
    assert "Traceback" not in str(run) and "Error" not in run["error"]
    # the log is still there to read, and Arabic comes through ?lang=ar
    assert shop.owner.get(f"/api/discovery/runs/{run['id']}?lang=ar").json()["steps"]
    monkeypatch.undo()
    assert run_check_up(shop.owner)["status"] == "done"


def test_an_unexpected_error_fails_the_run_with_a_plain_sentence_not_a_stack(shop, monkeypatch):
    class Broken:
        kind = "sample"

        async def snapshot(self, locations, ctx):
            raise KeyError("boom")

    monkeypatch.setattr(connectors, "get", lambda kind: Broken())
    run = run_check_up(shop.owner, expect="failed")
    assert run["error_code"] == "run_failed"
    assert "boom" not in str(run) and "KeyError" not in str(run)


def test_a_run_that_lost_its_process_is_ended_by_the_next_start(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    stuck = shop.owner.post("/api/discovery/runs").json()
    owner_sql("update discovery_runs set status = 'running', "
              "created_at = now() - interval '1 hour' "
              "where id = $1", UUID(stuck["id"]))
    fresh = shop.owner.post("/api/discovery/runs")
    assert fresh.status_code == 202 and fresh.json()["id"] != stuck["id"]
    ended = shop.owner.get(f"/api/discovery/runs/{stuck['id']}").json()
    assert (ended["status"], ended["error_code"]) == ("failed", "run_interrupted")


def test_a_run_already_finished_is_not_run_twice_when_its_job_is_delivered_again(shop):
    run = run_check_up(shop.owner)

    async def again():
        db = Database(get_settings().database_url)
        await db.connect()
        try:
            await engine.execute(db, shop.tenant_id, UUID(run["id"]))
        finally:
            await db.close()

    asyncio.run(again())
    after = shop.owner.get(f"/api/discovery/runs/{run['id']}").json()
    assert after["steps_used"] == 10 and after["score"] == run["score"]


def test_the_run_records_who_started_it_and_the_activity_names_the_channel(shop):
    started = shop.agent.post("/api/discovery/runs").json()
    [row] = owner_sql("select created_by from discovery_runs where id = $1",
                      UUID(started["id"]))
    assert row["created_by"] is not None
    acts = owner_sql("select action, channel, actor_name, subject_id from activity "
                     "where tenant_id = $1 and subject = 'discovery' and action = 'run.start'",
                     shop.tenant_id)
    assert [(a["action"], a["channel"], a["actor_name"], str(a["subject_id"])) for a in acts] == [
        ("run.start", "portal", "Agent", started["id"])]
    # turning the connection on was recorded too, by the owner
    on = owner_sql("select actor_name from activity where tenant_id = $1 "
                   "and action = 'connection.on'", shop.tenant_id)
    assert [a["actor_name"] for a in on] == ["Owner"]
