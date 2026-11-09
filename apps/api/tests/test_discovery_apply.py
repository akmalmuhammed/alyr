"""Discovery Phase 2, applying and undoing (spec 066, D-166): an approved change is applied through
the connector write interface (the sample's: the made-up listing inside ALYR), checked first against
the live value, idempotent, undoable inside a week, verified by the next check-up, and the
google_business_profile connector is an interface only.

Real PostgreSQL, HTTP in and out, the jobs run in the API's own process.
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest

from alyr.modules.discovery import apply, connectors
from alyr.modules.discovery.connectors import (
    AVAILABLE,
    Change,
    ConnectorError,
    SampleConnector,
    WritableConnector,
    WriteError,
)
from discovery_proposals_support import (
    BASE,
    activity,
    approve,
    find,
    get,
    place_id,
    prepared_shop,
    proposals,
)
from discovery_support import by_rule, findings, run_check_up
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return prepared_shop(client_factory, monkeypatch)


def state(shop):
    return [dict(r) for r in owner_sql(
        "select * from discovery_sample_state where tenant_id = $1 order by field", shop.tenant_id)]


def finding_status(client, rule_id: str, area: str | None = None) -> str:
    rows = [f for f in findings(client, "all") if f["rule_id"] == rule_id
            and (area is None or (f["location"] and f["location"]["name"].endswith(area)))]
    assert len(rows) == 1, rows
    return rows[0]["status"]


def score(client) -> int:
    return client.get(f"{BASE}/runs/latest").json()["score"]


# ── the sample's writes, end to end ─────────────────────────────────────────────────────


def test_an_approved_change_is_applied_and_the_next_check_up_confirms_it(shop):
    p = find(shop.owner, "whatsapp_link_missing", "Al Sadd")
    before = score(shop.owner)
    approve(shop.owner, p)
    done = get(shop.owner, p["id"])
    assert done["status"] == "applied" and done["verification"] == "pending"
    assert done["can"]["undo"] is True
    assert datetime.fromisoformat(done["undo_until"]) - datetime.fromisoformat(
        done["applied_at"]) == timedelta(days=7)
    [override] = state(shop)
    assert (override["field"], override["target"], override["proposal_id"]) == (
        "whatsapp_link", "website", UUID(p["id"]))
    assert json.loads(override["value"])["url"] == "https://wa.me/97455550150"
    # Applied, not fixed: the finding waits for a check-up to measure it
    assert finding_status(shop.owner, "whatsapp_link_missing", "Al Sadd") == "owner_done"

    run_check_up(shop.owner)  # the sample is at stage 1: the script alone would not fix this link
    assert finding_status(shop.owner, "whatsapp_link_missing", "Al Sadd") == "verified"
    confirmed = get(shop.owner, p["id"])
    assert confirmed["verification"] == "confirmed" and confirmed["status"] == "applied"
    assert [h["event"] for h in confirmed["history"]] == [
        "propose", "approve", "apply", "verify"]
    assert confirmed["history"][-1]["text"] == "A check-up confirmed it."
    assert score(shop.owner) > before
    [verify] = activity(shop, "proposal.verify", p["id"])
    assert verify["actor_name"] == "ALYR" and json.loads(verify["detail"]) == {
        "result": "confirmed"}


def test_the_score_is_higher_than_a_shop_at_the_same_stage_with_no_approval(
        client_factory, monkeypatch):
    with_it = prepared_shop(client_factory, monkeypatch)
    without = prepared_shop(client_factory, monkeypatch)
    approve(with_it.owner, find(with_it.owner, "whatsapp_link_missing", "Al Sadd"))
    approve(with_it.owner, find(with_it.owner, "name_conflict", "Al Wakra"))
    for client in (with_it.owner, without.owner):
        assert score(client) == 74  # the same first check-up
        run_check_up(client)
    # Both at stage 1; the script fixes the same things in each; the approvals add two more.
    assert (score(without.owner), score(with_it.owner)) == (84, 86)
    assert finding_status(without.owner, "whatsapp_link_missing", "Al Sadd") == "open"
    assert finding_status(with_it.owner, "whatsapp_link_missing", "Al Sadd") == "verified"
    assert finding_status(with_it.owner, "name_conflict") == "verified"


def test_the_hours_of_the_spec_demo_are_applied_and_the_finding_closes(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    approve(shop.owner, p)
    [override] = state(shop)
    assert override["field"] == "hours" and json.loads(override["value"])["fri"] == [
        "13:00", "22:00"]
    run_check_up(shop.owner)
    assert finding_status(shop.owner, "hours_missing") == "verified"
    assert get(shop.owner, p["id"])["verification"] == "confirmed"


def test_a_review_reply_is_written_to_the_review_and_taken_back_with_it(shop):
    p = [x for x in proposals(shop.owner, "live") if x["rule_id"] == "review_unanswered"][0]
    ref = json.loads(owner_sql(
        "select change from discovery_proposals where id = $1", UUID(p["id"]))[0]["change"])
    approve(shop.owner, p)
    review = owner_sql("select replied, reply_text from discovery_reviews where tenant_id = $1 "
                       "and source_ref = (select subject_ref from discovery_proposals "
                       "where id = $2)", shop.tenant_id, UUID(p["id"]))[0]
    assert review["replied"] is True and review["reply_text"] == ref["after"]["reply"]
    undone = shop.owner.post(f"{BASE}/proposals/{p['id']}/undo")
    assert undone.status_code == 200 and undone.json()["status"] == "undone"
    review = owner_sql("select replied, reply_text from discovery_reviews where tenant_id = $1 "
                       "and source_ref = (select subject_ref from discovery_proposals "
                       "where id = $2)", shop.tenant_id, UUID(p["id"]))[0]
    assert (review["replied"], review["reply_text"]) == (False, "")


# ── undo ────────────────────────────────────────────────────────────────────────────────


def test_undo_puts_the_old_value_back_and_the_next_check_up_finds_the_problem_again(shop):
    p = find(shop.owner, "whatsapp_link_missing", "Al Sadd")
    approve(shop.owner, p)
    answer = shop.owner.post(f"{BASE}/proposals/{p['id']}/undo")
    assert answer.status_code == 200
    body = answer.json()
    assert (body["status"], body["already"], body["undone"]["by"]) == ("undone", False, "Owner")
    assert body["undone"]["channel"] == "portal" and body["can"]["undo"] is False
    assert state(shop) == []
    assert finding_status(shop.owner, "whatsapp_link_missing", "Al Sadd") == "open"
    again = shop.owner.post(f"{BASE}/proposals/{p['id']}/undo")
    assert again.status_code == 200 and again.json()["already"] is True
    assert len(activity(shop, "proposal.undo", p["id"])) == 1
    run_check_up(shop.owner)
    assert finding_status(shop.owner, "whatsapp_link_missing", "Al Sadd") == "open"
    # not asked again at once: the undone change is in its 14-day cool-off
    assert [x for x in proposals(shop.owner, "live") if x["change_hash"] == p["change_hash"]] == []


def test_undo_is_refused_past_the_window_and_when_it_changed_again(shop):
    p = find(shop.owner, "whatsapp_link_missing", "Al Sadd")
    q = find(shop.owner, "name_conflict", "Al Wakra")
    approve(shop.owner, p)
    approve(shop.owner, q)
    owner_sql("update discovery_proposals set undo_until = now() - interval '1 day' "
              "where id = $1", UUID(p["id"]))
    late = shop.owner.post(f"{BASE}/proposals/{p['id']}/undo")
    assert late.status_code == 409 and late.json()["code"] == "undo_window_over"
    # a second change to the same value by someone else: undoing would erase it
    owner_sql("update discovery_sample_state set value = $2 where tenant_id = $1 "
              "and field = 'name'", shop.tenant_id, '{"name": "Someone else"}')
    stale = shop.owner.post(f"{BASE}/proposals/{q['id']}/undo")
    assert stale.status_code == 409 and stale.json()["code"] == "undo_not_possible"
    assert get(shop.owner, q["id"])["status"] == "applied"
    assert any(json.loads(s["value"]) == {"name": "Someone else"} for s in state(shop))


def test_only_an_applied_change_can_be_undone(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    nothing = shop.owner.post(f"{BASE}/proposals/{p['id']}/undo")
    assert nothing.status_code == 409 and nothing.json()["code"] == "proposal_not_applied"


# ── the live value is checked first ─────────────────────────────────────────────────────


def test_a_changed_before_fails_as_stale_and_nothing_is_written(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    owner_sql("insert into discovery_sample_state (tenant_id, location_id, target, field, value) "
              "values ($1, $2, 'listing', 'hours', $3)", shop.tenant_id,
              UUID(place_id(shop.owner, "Al Sadd")),
              '{"mon": ["08:00", "09:00"], "sat": null, "sun": null, "tue": null, "wed": null, '
              '"thu": null, "fri": null}')
    before = state(shop)
    approve(shop.owner, p)
    failed = get(shop.owner, p["id"])
    assert failed["status"] == "failed" and failed["failure"] == {
        "code": "stale_before",
        "message": "The listing changed since this was proposed. Nothing was changed. "
                   "The next check-up proposes it again."}
    assert failed["can"] == {"approve": True, "decline": True, "undo": False}  # try again
    assert state(shop) == before  # no override was written
    [entry] = activity(shop, "proposal.fail", p["id"])
    assert (entry["actor_name"], json.loads(entry["detail"])["code"]) == ("ALYR", "stale_before")
    assert shop.owner.get(f"{BASE}/overview").json()["proposals"]["failed"] == 1
    # The same in Arabic, in words
    assert get(shop.owner, p["id"], "ar")["failure"]["message"].startswith("تغيّر الملف التجاري")


def test_a_failed_change_may_be_tried_three_times_in_all(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    owner_sql("insert into discovery_sample_state (tenant_id, location_id, target, field, value) "
              "values ($1, $2, 'listing', 'hours', $3)", shop.tenant_id,
              UUID(place_id(shop.owner, "Al Sadd")),
              '{"mon": ["08:00", "09:00"], "sat": null, "sun": null, "tue": null, "wed": null, '
              '"thu": null, "fri": null}')
    for attempt in (1, 2, 3):
        approve(shop.owner, p)
        assert get(shop.owner, p["id"])["status"] == "failed"
        assert owner_sql("select apply_attempts from discovery_proposals where id = $1",
                         UUID(p["id"]))[0]["apply_attempts"] == attempt
    assert get(shop.owner, p["id"])["can"]["approve"] is False
    refused = shop.owner.post(f"{BASE}/proposals/{p['id']}/approve",
                              json={"change_hash": p["change_hash"]})
    assert refused.status_code == 409 and refused.json()["code"] == "retry_limit"
    assert shop.owner.post(f"{BASE}/proposals/{p['id']}/decline").json()["status"] == "declined"


def test_a_change_that_is_already_true_is_recorded_and_written_by_nothing(shop):
    p = find(shop.owner, "whatsapp_link_missing", "Al Sadd")
    owner_sql("insert into discovery_sample_state (tenant_id, location_id, target, field, value) "
              "values ($1, $2, 'website', 'whatsapp_link', $3)", shop.tenant_id,
              UUID(place_id(shop.owner, "Al Sadd")), '{"url": "https://wa.me/97455550150"}')
    approve(shop.owner, p)
    done = get(shop.owner, p["id"])
    assert done["status"] == "applied" and done["can"]["undo"] is False and done["undo_until"] is None
    receipt = owner_sql("select receipt from discovery_proposals where id = $1", UUID(p["id"]))
    assert json.loads(receipt[0]["receipt"])["ref"] == "already_true"
    [row] = state(shop)
    assert row["proposal_id"] is None  # not written again by anything


def test_an_apply_job_delivered_twice_applies_once(shop):
    p = find(shop.owner, "category_missing", "Al Wakra")
    approve(shop.owner, p)

    async def again():
        return await apply.apply_one(shop.owner.app.state.db, shop.tenant_id, UUID(p["id"]))

    assert shop.owner.portal.call(again) == "skipped"
    assert len(activity(shop, "proposal.apply", p["id"])) == 1 and len(state(shop)) == 1


def test_an_approved_change_that_was_never_started_is_put_back_on_the_queue(shop):
    p = find(shop.owner, "category_missing", "Al Wakra")
    owner_sql("update discovery_proposals set status = 'approved', decided_by = $2, "
              "decided_name = 'Owner', decided_channel = 'portal', "
              "decided_at = now() - interval '30 minutes' where id = $1", UUID(p["id"]),
              owner_sql("select id from users where email = $1", shop.emails["owner"])[0]["id"])
    from alyr.modules.discovery import sweep

    assert shop.owner.portal.call(lambda: sweep.sweep_all(shop.owner.app.state.db))["requeued"] == 1
    shop.owner.get(f"{BASE}/overview")  # any request drains the jobs it finds
    shop.owner.portal.call(shop.owner.app.state.jobs.drain)
    assert get(shop.owner, p["id"])["status"] == "applied"


# ── a source that is unavailable ────────────────────────────────────────────────────────


def test_an_unavailable_source_is_tried_again_and_then_the_change_has_failed(
        client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")
    shop = prepared_shop(client_factory, monkeypatch)
    calls = []

    async def down(self, change, ctx):
        calls.append(ctx.idempotency_key)
        raise WriteError("unavailable", "The source could not be reached.", "تعذّر الوصول.")

    monkeypatch.setattr(SampleConnector, "apply", down)
    p = find(shop.owner, "category_missing", "Al Wakra")
    approve(shop.owner, p)
    failed = get(shop.owner, p["id"])
    assert failed["status"] == "failed" and failed["failure"]["code"] == "apply_gave_up"
    assert failed["failure"]["message"] == (
        "The change could not be applied after several tries. Nothing was changed. "
        "You can try again.")
    assert len(calls) == 3 and set(calls) == {p["id"]}  # the proposal's id is the idempotency key
    assert state(shop) == []


def test_an_unavailable_source_that_comes_back_applies_on_the_second_try(
        client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")
    shop = prepared_shop(client_factory, monkeypatch)
    real = SampleConnector.apply
    calls = []

    async def flaky(self, change, ctx):
        calls.append(1)
        if len(calls) == 1:
            raise WriteError("unavailable", "The source could not be reached.", "تعذّر.")
        return await real(self, change, ctx)

    monkeypatch.setattr(SampleConnector, "apply", flaky)
    p = find(shop.owner, "category_missing", "Al Wakra")
    approve(shop.owner, p)
    assert get(shop.owner, p["id"])["status"] == "applied" and len(calls) == 2
    assert len(state(shop)) == 1 and len(activity(shop, "proposal.apply", p["id"])) == 1


@pytest.mark.parametrize("code, sentence", [
    ("not_permitted", "This account is not allowed to make that change."),
    ("refused", "The source refused the change."),
])
def test_a_source_that_refuses_fails_the_change_at_once_with_its_words(
        client_factory, monkeypatch, code, sentence):
    shop = prepared_shop(client_factory, monkeypatch)

    async def no(self, change, ctx):
        raise WriteError(code, "no", "لا")

    monkeypatch.setattr(SampleConnector, "apply", no)
    p = find(shop.owner, "category_missing", "Al Wakra")
    approve(shop.owner, p)
    failed = get(shop.owner, p["id"])
    assert failed["failure"]["code"] == code
    assert failed["failure"]["message"] == f"{sentence} Nothing was changed."
    assert owner_sql("select apply_attempts from discovery_proposals where id = $1",
                     UUID(p["id"]))[0]["apply_attempts"] == 1


def test_a_connection_that_was_switched_off_fails_the_change_as_connector_off(shop):
    p = find(shop.owner, "category_missing", "Al Wakra")
    owner_sql("update discovery_connections set status = 'off' where tenant_id = $1",
              shop.tenant_id)
    approve(shop.owner, p)
    assert get(shop.owner, p["id"])["failure"]["code"] == "connector_off"


def test_a_check_up_that_does_not_confirm_an_applied_change_says_so_and_waits_14_days(shop):
    p = find(shop.owner, "whatsapp_link_missing", "Al Sadd")
    approve(shop.owner, p)
    owner_sql("delete from discovery_sample_state where tenant_id = $1", shop.tenant_id)
    run_check_up(shop.owner)
    again = get(shop.owner, p["id"])
    assert again["verification"] == "not_confirmed"
    assert again["history"][-1]["text"] == "Applied, but the next check-up still found it."
    assert finding_status(shop.owner, "whatsapp_link_missing", "Al Sadd") == "open"
    assert [x for x in proposals(shop.owner, "live") if x["change_hash"] == p["change_hash"]] == []


def test_a_place_with_an_approved_change_in_flight_cannot_be_removed(shop):
    p = find(shop.owner, "category_missing", "Al Wakra")
    owner_sql("update discovery_proposals set status = 'approved', decided_by = $2, "
              "decided_name = 'Owner', decided_channel = 'portal', decided_at = now() "
              "where id = $1", UUID(p["id"]),
              owner_sql("select id from users where email = $1", shop.emails["owner"])[0]["id"])
    places = shop.owner.get(f"{BASE}/locations").json()["items"]
    kept = [x for x in places if not x["name"].endswith("Al Wakra")]
    refused = shop.owner.put(f"{BASE}/locations", json={"items": kept})
    assert refused.status_code == 409 and refused.json()["code"] == "proposal_in_flight"
    # taking a place off with nothing in flight takes its proposals and facts with it
    owner_sql("update discovery_proposals set status = 'declined', decided_at = now() "
              "where id = $1", UUID(p["id"]))
    owner_sql("update discovery_runs set status = 'done' where tenant_id = $1 "
              "and status in ('queued', 'running')", shop.tenant_id)
    removed = shop.owner.put(f"{BASE}/locations", json={"items": kept})
    assert removed.status_code == 200
    assert owner_sql("select count(*) as n from discovery_proposals where tenant_id = $1 "
                     "and location_id = $2", shop.tenant_id,
                     UUID(place_id_of(places, "Al Wakra")))[0]["n"] == 0


def place_id_of(places: list[dict], area: str) -> str:
    return next(x["id"] for x in places if x["name"].endswith(area))


# ── google_business_profile: an interface, not built ────────────────────────────────────


def test_google_business_profile_is_an_interface_and_nothing_stands_in_for_it(
        client_factory, monkeypatch):
    assert isinstance(SampleConnector(), WritableConnector)
    assert ("listing", "hours") in SampleConnector.writes
    assert "gbp" not in AVAILABLE and AVAILABLE == ("sample",)
    with pytest.raises(ConnectorError) as refused:
        connectors.get("gbp")
    assert refused.value.code == "connector_unavailable"
    folder = Path(connectors.__file__).parent
    assert sorted(p.name for p in folder.glob("*.py")) == ["__init__.py", "base.py", "sample.py"]
    shop = prepared_shop(client_factory, monkeypatch, run=False)
    answer = shop.owner.put(f"{BASE}/connection", json={"kind": "gbp", "on": True})
    assert answer.status_code == 422 and answer.json()["code"] == "bad_connector"
    # Nothing in the module names a settings key, a token, a Google host or a client library.
    for path in (Path(apply.__file__).parent).rglob("*.py"):
        text = path.read_text(encoding="utf-8").lower()
        for banned in ("googleapis", "oauth", "client_secret", "access_token", "refresh_token"):
            assert banned not in text, (path.name, banned)


def test_the_write_interface_is_plain_data(shop):
    from alyr.modules.discovery.connectors import Location, Receipt

    place = Location(UUID(int=1), "P")
    change = Change("set_phone", "listing", "phone", place, "", {"phone": "x"}, {"phone": "y"})
    assert (change.type, change.target, change.field, change.subject_ref) == (
        "set_phone", "listing", "phone", "")
    receipt = Receipt("ref", datetime.now(UTC), None)  # None: this write cannot be undone
    assert receipt.undo_until is None
    assert not WriteError("refused", "x", "y").retryable
    assert WriteError("unavailable", "x", "y").retryable
    assert by_rule  # the helpers import
