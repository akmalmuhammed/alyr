"""Discovery on a real business, recorded by hand (D-169, spec 065 "As built: a real business").

ALYR staff record what a remote audit saw (a place, a day, the listing's facts, the site's, each
review as a rating, a date and whether it was answered, the social links) and run the check-up; the
same twelve rules, the same score and the same screens read it. These tests hold the promises:

* what staff did not record is "not measured", never "nothing there";
* a review is stored as a rating, a date and whether it was answered: never its words or its author;
* the rows are append-only, and the date of the evidence is the day it was seen;
* "I did this" is confirmed only by a later observation; re-reading the old one reopens nothing;
* no proposal, no approval, no ask, no schedule and no owner-run check-up exists for this source;
* every staff write is audited and opens exactly one business, and no shop reads another's rows.
"""

import asyncio
import json
import re
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.modules.discovery import observations, rules, scoring
from alyr.modules.discovery import words as w
from alyr.modules.discovery.connectors import ConnectorError, ManualConnector, RunContext
from alyr.modules.discovery.connectors.manual import day_start
from alyr.seed import DEMO_TENANT_ID
from discovery_support import by_rule, discovery_shop, findings, location, turn_on_sample
from test_consent import owner_sql
from test_sign_in import sign_in

STAFF = "ops-discovery@alyr.example"
TODAY = datetime.now(UTC).date()


def shop_days(day: str) -> int:
    """Days since a day, on the shop's own calendar (Doha), which is what the screens say."""
    from zoneinfo import ZoneInfo

    return (datetime.now(ZoneInfo("Asia/Qatar")).date() - datetime.fromisoformat(day).date()).days


def iso(days_ago: int) -> str:
    return (TODAY - timedelta(days=days_ago)).isoformat()


def seen(**more) -> dict:
    """What a remote audit of a salon with no hours, no category and three photos found: the
    listing unclaimed, the website with no WhatsApp link, six reviews of which three low ones are
    unanswered, none answered."""
    base = {
        "observed_on": iso(2),
        "where": "Google Maps public page; the contact page of the site",
        "listing": {
            "found": True, "claimed": False, "name": "Rose Salon", "phone": "+974 5555 0199",
            "hours": {}, "categories": [], "photo_count": 3, "rating": 5.0, "review_count": 40,
        },
        "website": {
            "url": "https://rose.example", "reachable": True, "lists_location": True,
            "has_location_page": True, "whatsapp_link": "",
        },
        "reviews": [{"rating": r, "posted_on": iso(10 + n), "replied": False}
                    for n, r in enumerate((5, 5, 4, 2, 2, 1))],
        "social": {"instagram": {"url": "https://instagram.com/rose", "linked_from_site": False}},
    }
    return base | more


PLACE = {"name": "Rose Salon", "area": "Al Sadd", "website_url": "https://rose.example",
         "whatsapp_e164": "+97455550199", "is_primary": True}


def make_staff(client_factory):
    """A member of ALYR staff, signed in for real (the demo-open staff is off in these tests)."""
    client = client_factory()  # the demo shop exists once the app is built
    owner_sql("insert into users (email, name) values ($1, 'Fatima Staff') on conflict do nothing",
              STAFF)
    owner_sql("insert into memberships (tenant_id, user_id, role) "
              "select $1, id, 'owner' from users where email = $2 on conflict do nothing",
              DEMO_TENANT_ID, STAFF)
    owner_sql("insert into platform_admins (email, name) values ($1, 'Fatima Staff') "
              "on conflict do nothing", STAFF)
    owner_sql("delete from staff_known where email = $1", STAFF)
    owner_sql("delete from login_codes where email = $1", STAFF)
    sign_in(client, STAFF)
    return client


def business(client_factory, monkeypatch, *, roles=("owner",), demo=False) -> SimpleNamespace:
    """A real business (not a demo shop) with Discovery switched on, its owner signed in, and the
    path of its back-office door."""
    shop = discovery_shop(client_factory, monkeypatch, demo=demo, roles=roles)
    return SimpleNamespace(shop=shop, owner=shop.owner, id=shop.tenant_id,
                           base=f"/api/admin/businesses/{shop.tenant_id}/discovery")


@pytest.fixture
def biz(client_factory, monkeypatch):
    return business(client_factory, monkeypatch, roles=("owner", "agent"))


@pytest.fixture
def staff(client_factory, biz):
    """Signed in last: building another app clears the settings a session is read with, so a
    client signed in before the next one is built is signed out (the tests' own quirk)."""
    return make_staff(client_factory)


def start(staff, biz) -> dict:
    """The first things staff do: the place, then the source."""
    placed = staff.put(f"{biz.base}/places", json={"items": [PLACE]})
    assert placed.status_code == 200, placed.text
    on = staff.put(f"{biz.base}/source", json={"on": True})
    assert on.status_code == 200, on.text
    assert on.json()["source"] == "manual"
    return on.json()["places"][0]


def record(staff, biz, place: dict, observation: dict | None = None) -> dict:
    answer = staff.post(f"{biz.base}/places/{place['id']}/observations", json=observation or seen())
    assert answer.status_code == 200, answer.text
    return answer.json()


def run(staff, biz) -> dict:
    started = staff.post(f"{biz.base}/run")
    assert started.status_code == 200, started.text
    done = biz.owner.get(f"/api/discovery/runs/{started.json()['id']}").json()
    assert done["status"] == "done", done
    return done


# ── the connector and the rules, on plain data ─────────────────────────────────────────────


def observation(place: UUID, **more) -> observations.Observation:
    data = observations.clean(seen() | more, TODAY)
    return observations.Observation(
        uuid4(), place, TODAY - timedelta(days=2), datetime.now(UTC), "Fatima Staff",
        data["where"], data["listing"], data["website"], data["reviews"], data["social"],
    )


def snapshot_of(*pairs):
    """`pairs` of (Location, Observation or None): the snapshot the manual connector makes."""
    locations = [loc for loc, _ in pairs]
    seen_ = {loc.id: obs for loc, obs in pairs if obs is not None}
    ctx = RunContext(now=datetime.now(UTC), observations=seen_)
    return locations, asyncio.run(ManualConnector().snapshot(locations, ctx))


def outcomes(locations, snapshot):
    ctx = rules.Context(snapshot, locations, {}, now=snapshot.taken_at)
    return {(o.rule_id, o.location_id): o.state for o in rules.evaluate(ctx)}


def test_the_same_twelve_rules_score_what_staff_recorded():
    here = location("Rose Salon", "Al Sadd")
    locations, snapshot = snapshot_of((here, observation(here.id)))
    states = outcomes(locations, snapshot)
    assert {r for (r, _), s in states.items() if s == rules.FAIL} == {
        "listing_unclaimed", "hours_missing", "category_missing", "photos_few",
        "whatsapp_link_missing", "review_unanswered"}
    # looked at and fine
    assert states[("listing_missing", here.id)] == rules.PASS
    assert states[("website_location_missing", here.id)] == rules.PASS
    assert states[("rating_low", here.id)] == rules.PASS
    # not recorded, so not measured: the website's hours and phone, and a second listing to compare
    for rule in ("hours_conflict", "phone_conflict"):
        assert states[(rule, here.id)] == rules.NOT_MEASURED
    assert states[("name_conflict", None)] == rules.NOT_MEASURED
    assert len({r for r, _ in states}) == 12
    total, parts = scoring.score(rules.evaluate(
        rules.Context(snapshot, locations, {}, now=snapshot.taken_at)))
    assert total is not None and parts["ai"]["measured"] is False


def test_what_was_not_recorded_is_not_measured_and_never_nothing():
    here = location()
    only_site = observation(here.id, listing=None, reviews=None, social=None)
    locations, snapshot = snapshot_of((here, only_site))
    states = outcomes(locations, snapshot)
    # no listing facts at all: not even "is there a listing" is answered
    for rule in ("listing_missing", "listing_unclaimed", "hours_missing", "category_missing",
                 "photos_few", "rating_low", "hours_conflict", "phone_conflict"):
        assert states[(rule, here.id)] == rules.NOT_MEASURED, rule
    assert states[("review_unanswered", here.id)] == rules.NOT_MEASURED
    assert states[("whatsapp_link_missing", here.id)] == rules.FAIL  # the site was recorded
    assert snapshot.places[0].listing.found is None and snapshot.places[0].reviews is None


def test_a_listing_that_was_looked_for_and_not_found_fires_only_listing_missing():
    here = location()
    nothing = observation(here.id, listing={"found": False}, reviews=None)
    states = outcomes(*snapshot_of((here, nothing)))
    assert states[("listing_missing", here.id)] == rules.FAIL
    assert states[("hours_missing", here.id)] == rules.NOT_MEASURED
    assert states[("listing_unclaimed", here.id)] == rules.NOT_MEASURED


def test_a_place_with_no_observation_is_left_out_and_says_nothing():
    one, two = location("Rose Salon"), location("Rose Salon - Lusail", "Lusail")
    locations, snapshot = snapshot_of((one, observation(one.id)), (two, None))
    assert [p.location_id for p in snapshot.places] == [one.id]
    states = outcomes(locations, snapshot)
    assert all(s == rules.NOT_MEASURED for (r, loc), s in states.items() if loc == two.id)


def test_nothing_recorded_at_all_is_a_plain_refusal_in_both_languages():
    here = location()
    with pytest.raises(ConnectorError) as error:
        snapshot_of((here, None))
    assert error.value.code == "nothing_recorded" and error.value.en and error.value.ar


def test_the_day_is_the_day_it_was_seen_and_a_review_has_neither_words_nor_author():
    here = location()
    obs = observation(here.id)
    _, snapshot = snapshot_of((here, obs))
    assert snapshot.taken_at == day_start(obs.observed_on) == snapshot.places[0].observed_at
    assert snapshot.places[0].recorded_at == obs.recorded_at
    for review in snapshot.places[0].reviews:
        assert review.author_name == "" and review.body == "" and review.reply_text == ""
    assert len({r.source_ref for r in snapshot.places[0].reviews}) == 6  # one stable ref each


def test_the_manual_source_can_write_nothing():
    connector = ManualConnector()
    assert connector.writes == frozenset() and connector.undoable == frozenset()
    assert rules.writable("hours_missing", connector.writes) == ()
    # not even the rules whose Phase 1 kind is "ALYR can change this after you approve"
    assert any(rule.kind == "agent" for rule in rules.RULES)
    assert all(rules.effective_kind(rule, connector.writes, connector.by_hand) != "agent"
               for rule in rules.RULES)


# ── what staff may type ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("field", ["body", "text", "author_name", "reviewer", "reply_text",
                                   "language", "author"])
def test_a_review_with_words_or_a_name_is_refused_before_it_is_stored(field):
    bad = seen(reviews=[{"rating": 2, "posted_on": iso(9), "replied": False, field: "Maryam K."}])
    with pytest.raises(observations.ObservationError) as error:
        observations.clean(bad, TODAY)
    assert field in str(error.value)


@pytest.mark.parametrize("change", [
    {"observed_on": (TODAY + timedelta(days=2)).isoformat()},  # a day that has not happened
    {"observed_on": "last Tuesday"},
    {"observed_on": (TODAY - timedelta(days=400)).isoformat()},
    {"reviews": [{"rating": 6, "posted_on": iso(9), "replied": False}]},
    {"reviews": [{"rating": 3, "posted_on": iso(9)}]},  # whether it was answered is required
    {"reviews": [{"rating": 3, "posted_on": iso(0), "replied": False}], "observed_on": iso(5)},
    {"reviews": [{"rating": 5, "posted_on": iso(9), "replied": False}] * 41,
     "listing": {"found": True, "review_count": 40}},  # more listed than the listing counts
    {"listing": {"name": "Rose"}},  # says nothing about whether a listing was found
    {"listing": {"found": True, "hours": {"sat": ["07:00", "22:00"]}}},  # not seven days
    {"listing": {"found": True, "rating": 7}},
    {"listing": {"found": True, "photo_count": -1}},
    {"listing": {"found": True, "whatsapp_link": "https://wa.me/97455550199"}},  # no such field
    {"website": {"url": "ftp://rose.example"}},
    {"social": {"myspace": {"url": "https://x.example"}}},
    {"surprise": 1},
    {"listing": None, "website": None, "reviews": None, "social": None},
])
def test_a_slip_in_what_staff_typed_is_refused_with_a_plain_sentence(change):
    with pytest.raises(observations.ObservationError) as error:
        observations.clean(seen() | change, TODAY)
    assert str(error.value) and "Traceback" not in str(error.value)


def test_hours_closed_every_day_are_no_hours_and_a_closed_day_is_kept():
    days = ("sat", "sun", "mon", "tue", "wed", "thu")
    week = {d: ["07:00", "22:00"] for d in days} | {"fri": None}
    kept = observations.clean(seen(listing={"found": True, "hours": week}), TODAY)
    assert kept["listing"]["hours"]["fri"] is None and kept["listing"]["hours"]["sat"][0] == "07:00"
    shut = observations.clean(seen(listing={"found": True, "hours": dict.fromkeys(week)}), TODAY)
    assert shut["listing"]["hours"] == {}


def test_only_what_is_known_is_kept_and_text_is_one_trimmed_line():
    kept = observations.clean(seen(where="  the   public page "), TODAY)
    assert kept["where"] == "the public page"
    with pytest.raises(observations.ObservationError):
        observations.clean(seen(where="two\nlines"), TODAY)
    assert set(kept["reviews"][0]) == {"rating", "posted_on", "replied"}


# ── the back office's door ─────────────────────────────────────────────────────────────────


def test_staff_record_a_place_and_the_check_up_scores_it_with_the_dates_it_was_seen(
        staff, biz):
    place = start(staff, biz)
    saved = record(staff, biz, place)
    assert saved["observation"]["observed_on"] == iso(2)
    assert saved["observation"]["recorded_by"] == "Fatima Staff"
    assert saved["history"][0]["recorded"] == ["listing", "website", "reviews", "social"]
    done = run(staff, biz)
    assert done["score"] is not None and done["connector"] == "manual"
    open_ = by_rule(findings(biz.owner))
    assert set(open_) == {"listing_unclaimed", "hours_missing", "category_missing", "photos_few",
                          "whatsapp_link_missing", "review_unanswered"}
    # the evidence is dated by the day it was seen, not the day the check-up ran
    for items in open_.values():
        for item in items:
            assert all(e["seen_at"].startswith(iso(2)) for e in item["evidence"]), item
    assert owner_sql("select count(*) from discovery_locations where tenant_id = $1",
                     biz.id)[0]["count"] == 1  # nothing of the sample: no five branches
    overview = biz.owner.get("/api/discovery/overview").json()
    assert overview["has_connection"] and overview["score"] == done["score"]
    assert biz.owner.get("/api/discovery/connection").json()["kind"] == "manual"


def test_the_log_says_it_was_recorded_by_staff_and_which_day_not_that_it_was_got(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place)
    done = run(staff, biz)
    first = biz.owner.get(f"/api/discovery/runs/{done['id']}").json()["steps"][0]["summary"]
    assert first.startswith("Took 1 place as recorded by ALYR staff, seen on ")
    assert "Got " not in first and "old" not in first


def test_an_old_observation_is_called_old_in_the_log(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place, seen(observed_on=iso(20), reviews=None))
    done = run(staff, biz)
    first = biz.owner.get(f"/api/discovery/runs/{done['id']}").json()["steps"][0]["summary"]
    assert "20 days old" in first


def test_a_place_nobody_recorded_is_named_in_the_log(staff, biz):
    place = start(staff, biz)
    two = staff.put(f"{biz.base}/places", json={"items": [
        {"id": place["id"]} | PLACE, {"name": "Rose Salon - Lusail", "area": "Lusail"}]})
    assert two.status_code == 200, two.text
    record(staff, biz, place)
    done = run(staff, biz)
    first = biz.owner.get(f"/api/discovery/runs/{done['id']}").json()["steps"][0]["summary"]
    assert "Nothing is recorded yet for 1 place." in first


def test_no_review_text_and_no_reviewer_name_is_ever_stored(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place)
    run(staff, biz)
    rows = owner_sql("select source, author_name, body, reply_text, replied from "
                     "discovery_reviews where tenant_id = $1", biz.id)
    assert len(rows) == 6 and {r["source"] for r in rows} == {"manual"}
    assert all(r["author_name"] == "" and r["body"] == "" and r["reply_text"] == "" for r in rows)
    stored = json.loads(owner_sql(
        "select reviews from discovery_observations where tenant_id = $1", biz.id)[0]["reviews"])
    assert all(set(r) == {"rating", "posted_on", "replied"} for r in stored)
    shown = biz.owner.get("/api/discovery/reviews").json()
    assert shown["summary"]["count"] == 6
    assert all(i["author_name"] == "" and i["body"] == "" for i in shown["items"])
    # a review that comes through the door with words is refused, and nothing is stored
    answer = staff.post(f"{biz.base}/places/{place['id']}/observations", json=seen(
        reviews=[{"rating": 1, "posted_on": iso(9), "replied": False, "body": "Rude staff"}]))
    assert answer.status_code == 422 and "body" in answer.json()["detail"]["message"]
    assert owner_sql("select count(*) from discovery_observations where tenant_id = $1",
                     biz.id)[0]["count"] == 1


def test_a_later_round_replaces_the_reviews_of_the_earlier_one(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place)
    run(staff, biz)
    record(staff, biz, place, seen(reviews=[{"rating": 5, "posted_on": iso(40), "replied": True}]))
    run(staff, biz)
    rows = owner_sql("select rating, replied from discovery_reviews where tenant_id = $1", biz.id)
    assert [(r["rating"], r["replied"]) for r in rows] == [(5, True)]
    # not checked this time: no reviews are kept, and the rule says nothing
    record(staff, biz, place, seen(reviews=None))
    run(staff, biz)
    assert owner_sql("select count(*) from discovery_reviews where tenant_id = $1",
                     biz.id)[0]["count"] == 0


def test_observations_are_append_only_even_for_the_app_role(staff, biz):
    from conftest import APP_DSN

    place = start(staff, biz)
    record(staff, biz, place)

    async def tamper(sql):
        conn = await asyncpg.connect(APP_DSN)
        try:
            async with conn.transaction():
                await conn.execute("select set_config('app.tenant_id', $1, true)", str(biz.id))
                await conn.execute(sql)
        finally:
            await conn.close()

    for sql in ("update discovery_observations set recorded_by = 'Someone'",
                "delete from discovery_observations"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            asyncio.run(tamper(sql))
    # a correction is a new row, and the check-up reads the last thing staff recorded
    record(staff, biz, place, seen(observed_on=iso(1), listing={
        "found": True, "claimed": True, "hours": {}, "categories": ["Beauty salon"],
        "photo_count": 9}))
    assert owner_sql("select count(*) from discovery_observations where tenant_id = $1",
                     biz.id)[0]["count"] == 2
    run(staff, biz)
    assert "listing_unclaimed" not in by_rule(findings(biz.owner))


def test_i_did_this_is_confirmed_only_by_a_later_observation(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place)
    run(staff, biz)
    hours = by_rule(findings(biz.owner))["hours_missing"][0]
    marked = biz.owner.post(f"/api/discovery/findings/{hours['id']}/status",
                            json={"status": "owner_done"})
    assert marked.status_code == 200
    # the check-up that only reads the old observation reopens nothing and verifies nothing
    run(staff, biz)
    assert findings(biz.owner, "owner_done") and not findings(biz.owner, "verified")
    assert "hours_missing" not in by_rule(findings(biz.owner, "open"))
    # a new observation in which it is still not fixed reopens it
    record(staff, biz, place, seen(observed_on=iso(1)))
    run(staff, biz)
    assert "hours_missing" in by_rule(findings(biz.owner, "open"))
    biz.owner.post(f"/api/discovery/findings/{hours['id']}/status", json={"status": "owner_done"})
    # a new observation in which it is fixed verifies it
    week = {d: ["07:00", "22:00"] for d in ("sat", "sun", "mon", "tue", "wed", "thu", "fri")}
    fixed = seen(observed_on=iso(0))
    fixed["listing"] = fixed["listing"] | {"hours": week}
    record(staff, biz, place, fixed)
    run(staff, biz)
    assert "hours_missing" in by_rule(findings(biz.owner, "verified"))


def test_no_proposal_no_approval_no_ask_no_schedule_and_no_owner_run(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place)
    run(staff, biz)
    assert biz.owner.get("/api/discovery/proposals").json()["items"] == []
    for table in ("discovery_proposals", "discovery_asks"):
        assert owner_sql(f"select count(*) from {table} where tenant_id = $1", biz.id)[0][
            "count"] == 0
    assert {f["kind"] for f in findings(biz.owner)} == {"owner"}
    assert "hours_missing" in by_rule(findings(biz.owner))  # a rule whose Phase 1 kind is "agent"
    # the owner's own check-up button, from the workspace, is refused with words in both languages
    refused = biz.owner.post("/api/discovery/runs")
    assert refused.status_code == 409 and refused.json()["code"] == "manual_staff_runs"
    assert refused.json()["message_ar"]
    assert biz.shop.agent.post("/api/discovery/runs").status_code == 409
    # an owner cannot turn the source on or off, and a schedule starts nothing
    assert biz.owner.put("/api/discovery/connection",
                         json={"kind": "manual", "on": False}).status_code == 422
    owner_sql("insert into discovery_settings (tenant_id, weekly_run) values ($1, true) "
              "on conflict (tenant_id) do update set weekly_run = true", biz.id)
    from alyr.db import Database
    from alyr.modules.discovery import sweep

    async def sweep_it():
        from conftest import APP_DSN

        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(biz.id) as conn:
                return await sweep.schedule_if_due(conn, datetime.now(UTC) + timedelta(days=30))
        finally:
            await db.close()

    assert asyncio.run(sweep_it()) is False
    assert owner_sql("select count(*) from discovery_runs where trigger = 'schedule' and "
                     "tenant_id = $1", biz.id)[0]["count"] == 0


def test_staff_cannot_run_before_anything_is_recorded(staff, biz):
    start(staff, biz)
    refused = staff.post(f"{biz.base}/run")
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "nothing_recorded"


def test_the_sample_is_still_refused_for_this_real_business(staff, biz):
    start(staff, biz)
    refused = biz.owner.put("/api/discovery/connection", json={"kind": "sample", "on": True})
    assert (refused.status_code, refused.json()["code"]) == (409, "sample_not_allowed")
    assert biz.owner.get("/api/discovery/connection").json()["kind"] == "manual"


# ── audited, one business, and no one else ─────────────────────────────────────────────────


def audit_of(biz) -> list[dict]:
    return owner_sql("select action, subject_type, staff_email, staff_name, business_id, detail "
                     "from platform_audit where business_id = $1 order by id", biz.id)


def test_every_staff_write_is_on_the_audit_record_and_on_the_businesss_own(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place)
    run(staff, biz)
    entries = audit_of(biz)
    assert [e["action"] for e in entries] == [
        "discovery.places", "discovery.source_on", "discovery.observation", "discovery.run"]
    assert all(e["staff_email"] == STAFF and e["staff_name"] == "Fatima Staff"
               and e["subject_type"] == "business" for e in entries)
    seen_ = json.loads(entries[2]["detail"])
    assert seen_["observed_on"] == iso(2) and seen_["reviews"] == 6
    # the audit says what was recorded, never the values
    assert "Rose" not in str(entries) and "rating" not in str(entries)
    # reading is not a write
    before = len(audit_of(biz))
    assert staff.get(biz.base).status_code == 200
    assert len(audit_of(biz)) == before
    # and the business's own record says who, as ALYR
    rows = owner_sql("select action, actor_name from activity where tenant_id = $1 and "
                     "subject = 'discovery' order by created_at", biz.id)
    names = {r["actor_name"] for r in rows if r["action"].startswith(("observation", "run"))}
    assert names == {"Fatima Staff (ALYR)"}


def test_a_write_that_cannot_be_audited_is_not_kept(staff, biz, monkeypatch):
    place = start(staff, biz)

    async def broken(*args, **kwargs):
        raise RuntimeError("the audit log is down")

    monkeypatch.setattr("alyr.routes.admin_discovery.backoffice.audit", broken)
    with pytest.raises(RuntimeError):
        staff.post(f"{biz.base}/places/{place['id']}/observations", json=seen())
    assert owner_sql("select count(*) from discovery_observations where tenant_id = $1",
                     biz.id)[0]["count"] == 0


def test_every_route_refuses_anyone_who_is_not_alyr_staff(staff, biz):
    place = start(staff, biz)
    me = biz.owner  # the business's own owner, signed in
    calls = (
        ("get", biz.base, None),
        ("put", f"{biz.base}/places", {"items": [PLACE]}),
        ("put", f"{biz.base}/source", {"on": True}),
        ("post", f"{biz.base}/places/{place['id']}/observations", seen()),
        ("post", f"{biz.base}/run", None),
    )
    for method, path, body in calls:
        answer = getattr(me, method)(path, **({"json": body} if body is not None else {}))
        assert answer.status_code in (401, 403), (path, answer.status_code)
    assert owner_sql("select count(*) from discovery_observations where tenant_id = $1",
                     biz.id)[0]["count"] == 0


def test_a_business_with_discovery_off_or_unknown_is_refused(client_factory, monkeypatch):
    off = business(client_factory, monkeypatch)
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'discovery'",
              off.id)
    staff = make_staff(client_factory)
    refused = staff.get(off.base)
    assert refused.status_code == 409 and "not switched on" in refused.json()["detail"]
    ghost = f"/api/admin/businesses/{uuid4()}/discovery"
    assert staff.get(ghost).status_code == 404
    assert staff.put(f"{ghost}/source", json={"on": True}).status_code == 404


def test_staff_who_name_another_businesss_place_find_nothing(client_factory, monkeypatch):
    a = business(client_factory, monkeypatch)
    b = business(client_factory, monkeypatch)
    staff = make_staff(client_factory)
    place_a = staff.put(f"{a.base}/places", json={"items": [PLACE]}).json()["places"][0]
    staff.put(f"{b.base}/places", json={"items": [PLACE | {"name": "Other Salon"}]})
    # A's place through B's door: it is not B's
    answer = staff.post(f"{b.base}/places/{place_a['id']}/observations", json=seen())
    assert answer.status_code == 404
    assert owner_sql("select count(*) from discovery_observations where tenant_id = any($1)",
                     [a.id, b.id])[0]["count"] == 0
    # a place id of A, an edit of B's places that names it, is refused too
    sneaky = staff.put(f"{b.base}/places", json={"items": [{"id": place_a["id"]} | PLACE]})
    assert sneaky.status_code == 422 and sneaky.json()["detail"]["code"] == "unknown_place"


def test_no_business_reads_or_runs_on_another_businesss_observations(client_factory,
                                                                    monkeypatch):
    a = business(client_factory, monkeypatch)
    b = business(client_factory, monkeypatch)
    staff = make_staff(client_factory)
    for biz in (a, b):
        place = staff.put(f"{biz.base}/places", json={"items": [PLACE]}).json()["places"][0]
        staff.put(f"{biz.base}/source", json={"on": True})
        if biz is a:
            record(staff, a, place)
    # B has nothing recorded: it cannot run, and nothing of A's reaches it
    refused = staff.post(f"{b.base}/run")
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "nothing_recorded"
    run(staff, a)
    assert findings(b.owner) == [] and b.owner.get("/api/discovery/reviews").json()["items"] == []
    assert b.owner.get("/api/discovery/overview").json()["score"] is None
    # row-level security: B's connection sees none of A's rows
    from alyr.db import Database

    async def what_b_sees():
        from conftest import APP_DSN

        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(b.id) as conn:
                return await conn.fetchval("select count(*) from discovery_observations")
        finally:
            await db.close()

    assert asyncio.run(what_b_sees()) == 0
    assert staff.get(a.base).json()["places"][0]["observation"]["recorded_by"] == "Fatima Staff"
    assert staff.get(b.base).json()["places"][0]["observation"] is None


def test_the_overview_for_staff_carries_the_places_their_history_and_the_last_run(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place)
    record(staff, biz, place, seen(observed_on=iso(1)))
    run(staff, biz)
    view = staff.get(biz.base).json()
    assert view["source"] == "manual" and view["demo"] is False
    assert view["stale_after_days"] == 14 and "instagram" in view["social_platforms"]
    [only] = view["places"]
    assert only["observation"]["observed_on"] == iso(1)
    assert [h["observed_on"] for h in only["history"]] == [iso(1), iso(2)]
    assert "listing" not in only["history"][0]  # history names what was recorded, not the values
    assert view["last_run"]["status"] == "done"
    # the business's own screens still work on it: the matrix reads the run's checks
    checks = biz.owner.get("/api/discovery/checks").json()
    assert checks["measured"] is True and len(checks["rules"]) == 12


def test_turning_the_source_on_while_a_check_up_runs_is_refused(client_factory, monkeypatch):
    # before the apps are built, so the run stays queued
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    biz = business(client_factory, monkeypatch, roles=("owner",))
    staff = make_staff(client_factory)
    place = start(staff, biz)
    record(staff, biz, place)
    started = staff.post(f"{biz.base}/run")
    assert started.json()["status"] == "queued"
    refused = staff.put(f"{biz.base}/source", json={"on": False})
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "run_in_progress"


def test_the_source_can_be_turned_off_and_the_places_stay(staff, biz):
    start(staff, biz)
    off = staff.put(f"{biz.base}/source", json={"on": False}).json()
    assert off["source"] is None and len(off["places"]) == 1
    assert biz.owner.get("/api/discovery/overview").json()["has_connection"] is False


# ── the migration (0126) ───────────────────────────────────────────────────────────────────


def a_shop() -> UUID:
    return owner_sql("insert into tenants (name) values ('Migration probe') returning id")[0]["id"]


def a_place(tenant: UUID) -> UUID:
    return owner_sql("insert into discovery_locations (tenant_id, name) values ($1, 'P') "
                     "returning id", tenant)[0]["id"]


def test_the_three_places_that_name_a_source_accept_manual_and_still_refuse_the_rest():
    tenant = a_shop()
    place = a_place(tenant)
    owner_sql("insert into discovery_connections (tenant_id, kind, status) "
              "values ($1, 'manual', 'on')", tenant)
    run = owner_sql("insert into discovery_runs (tenant_id, connector_kind, status) "
                    "values ($1, 'manual', 'done') returning id", tenant)[0]["id"]
    owner_sql("insert into discovery_reviews (tenant_id, location_id, source, source_ref, rating, "
              "posted_at, fetched_run_id) values ($1, $2, 'manual', 'x:1', 4, now(), $3)",
              tenant, place, run)
    # what was allowed before is still allowed, and nothing else is
    owner_sql("insert into discovery_connections (tenant_id, kind, status) "
              "values ($1, 'sample', 'off')", tenant)
    for sql in ("insert into discovery_connections (tenant_id, kind) values ($1, 'google')",
                "insert into discovery_runs (tenant_id, connector_kind) values ($1, 'google')"):
        with pytest.raises(asyncpg.CheckViolationError):
            owner_sql(sql, tenant)
    with pytest.raises(asyncpg.CheckViolationError):
        owner_sql("insert into discovery_reviews (tenant_id, location_id, source, source_ref, "
                  "rating, posted_at) values ($1, $2, 'yelp', 'y', 4, now())", tenant, place)


def test_a_hand_source_makes_no_proposal_so_proposals_still_name_no_manual_kind():
    tenant = a_shop()
    place = a_place(tenant)
    finding = owner_sql(
        "insert into discovery_runs (tenant_id, connector_kind, status) values ($1, 'manual', "
        "'done') returning id", tenant)[0]["id"]
    row = owner_sql(
        "insert into discovery_findings (tenant_id, fingerprint, rule_id, location_id, kind, "
        "severity, first_run_id, last_run_id) values ($1, 'f', 'hours_missing', $2, 'owner', "
        "'high', $3, $3) returning id", tenant, place, finding)[0]["id"]
    with pytest.raises(asyncpg.CheckViolationError):
        owner_sql(
            "insert into discovery_proposals (tenant_id, finding_id, location_id, type, target, "
            "connector_kind, change, change_hash, severity, expires_at) values ($1, $2, $3, "
            "'set_hours', 'listing', 'manual', '{}', $4, 'high', now() + interval '1 day')",
            tenant, row, place, "0" * 64)


def test_the_observations_table_says_what_the_module_says():
    tenant = a_shop()
    place = a_place(tenant)
    insert = ("insert into discovery_observations (tenant_id, location_id, observed_on, "
              "recorded_by, listing, reviews) values ($1, $2, $3, $4, $5, $6)")
    owner_sql(insert, tenant, place, TODAY, "Fatima", '{"found": true}', None)
    with pytest.raises(asyncpg.CheckViolationError):  # a day that has not happened
        owner_sql(insert, tenant, place, TODAY + timedelta(days=3), "Fatima", '{"found": true}',
                  None)
    with pytest.raises(asyncpg.CheckViolationError):  # nothing recorded at all
        owner_sql(insert, tenant, place, TODAY, "Fatima", None, None)
    with pytest.raises(asyncpg.CheckViolationError):  # nobody recorded it
        owner_sql(insert, tenant, place, TODAY, " ", '{"found": true}', None)
    with pytest.raises(asyncpg.CheckViolationError):  # reviews are a list
        owner_sql(insert, tenant, place, TODAY, "Fatima", '{"found": true}', '{"a": 1}')
    # a place that is removed takes what was recorded for it
    owner_sql("delete from discovery_locations where id = $1", place)
    assert owner_sql("select count(*) from discovery_observations where tenant_id = $1",
                     tenant)[0]["count"] == 0

# ── what the business reads about it (the words branch, D-169) ────────────────────────────
#
# Whose look it was and which day, in English and Arabic, and never that a check-up looks again; the
# sample's own words must stay exactly as they were.


def a_run(staff, biz, **more):
    place = start(staff, biz)
    record(staff, biz, place, seen(**more))
    return place, run(staff, biz)


def test_what_happens_next_never_says_a_check_up_looks_again_for_a_recorded_source(staff, biz):
    a_run(staff, biz)
    for lang in ("en", "ar"):
        items = findings(biz.owner, lang=lang)
        assert items
        for item in items:
            said = item["what_happens"]
            assert said and "…" not in said
            if lang == "en":
                assert not re.search(r"next check-up|check-up (looks|counts|measures)", said), said
                assert "records a new look" in said
            else:
                assert "الفحص التالي" not in said and "نظرة جديدة" in said
    # the two rules whose sentence says more than "mark it done"
    by = by_rule(findings(biz.owner))
    assert "Nothing is sent for you" in by["review_unanswered"][0]["what_happens"]


def test_the_sample_keeps_its_own_words(client_factory, monkeypatch):
    from discovery_support import discovery_shop, run_check_up

    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    run_check_up(shop.owner)
    said = {i["rule_id"]: i["what_happens"] for i in findings(shop.owner)}
    assert "the next check-up looks again" in said["hours_missing"].replace("\n", " ")
    assert "records a new look" not in " ".join(said.values())
    assert not any(e["day_only"] for i in findings(shop.owner) for e in i["evidence"])
    source = shop.owner.get("/api/discovery/overview").json()["source"]
    assert source == {"kind": "sample", "observed_on": None, "days_old": None, "old": False}


def test_the_evidence_says_whose_look_and_which_day_in_both_languages(staff, biz):
    a_run(staff, biz)
    day = w.date_text(iso(2), "en")
    day_ar = w.date_text(iso(2), "ar")
    for lang, expected in (("en", f"(recorded by ALYR on {day})"),
                           ("ar", f"(سجّلته ALYR بتاريخ {day_ar})")):
        items = findings(biz.owner, lang=lang)
        wheres = {e["where"] for i in items for e in i["evidence"]}
        assert wheres and all(expected in where for where in wheres), wheres
        # a recorded observation is a day, not a moment: no time of day is drawn
        assert all(e["day_only"] is True for i in items for e in i["evidence"])
    # the day is the day it was seen, in Western digits
    assert re.fullmatch(r"\d{1,2} [^\d\s]+ \d{4}", day_ar)
    assert w.date_text("2026-11-20T12:00:00+00:00", "ar") == "20 نوفمبر 2026"
    assert w.date_text("2026-11-03", "en") == "3 Nov 2026"


def test_the_overview_and_the_connection_say_which_day_and_when_it_is_old(staff, biz):
    place = start(staff, biz)
    record(staff, biz, place, seen(observed_on=iso(3)))
    run(staff, biz)
    for path in ("/api/discovery/overview", "/api/discovery/connection"):
        body = biz.owner.get(path).json()
        source = body["source"] if "source" in body else body
        assert (source["observed_on"], source["days_old"], source["old"]) == (
            iso(3), shop_days(iso(3)), False)
    record(staff, biz, place, seen(observed_on=iso(20), reviews=None))
    run(staff, biz)
    source = biz.owner.get("/api/discovery/overview").json()["source"]
    assert (source["kind"], source["observed_on"], source["days_old"], source["old"]) == (
        "manual", iso(20), shop_days(iso(20)), True)
    assert biz.owner.get("/api/discovery/connection").json()["old"] is True


def test_the_reviews_say_where_they_came_from(staff, biz):
    a_run(staff, biz)
    shown = biz.owner.get("/api/discovery/reviews").json()["items"]
    assert shown and {r["source"] for r in shown} == {"manual"}


def test_the_new_sentences_are_whole_in_both_languages_and_say_no_ai():
    sentences = [*w.HAND_WHAT_HAPPENS, *w.MANUAL_NOTE]
    for pair in w.HAND_WHAT_HAPPENS_BY_RULE.values():
        sentences.extend(pair)
    for key in ("connector.snapshot.manual", "connector.snapshot.manual.missing",
                "connector.snapshot.manual.old"):
        sentences.append(w.STEP_SUMMARIES[key])
    for key in ("manual_staff_runs", "nothing_recorded"):
        sentences.extend(w.ERRORS[key])
    for text in sentences:
        assert text.strip() and "…" not in text and "..." not in text
        banned = r"\b(AI|smart|intelligen\w*|assistant|learns?|predicts?|live|connected)\b"
        assert not re.search(banned, text, re.I), text
    for pair in (w.HAND_WHAT_HAPPENS, w.MANUAL_NOTE, *w.HAND_WHAT_HAPPENS_BY_RULE.values()):
        assert re.search("[؀-ۿ]", pair[1]) and not re.search("[٠-٩]", pair[1])
    # the sample's wording is untouched
    assert "the next check-up looks again" in w.RULE_WORDS["hours_missing"]["what_happens"][0]
