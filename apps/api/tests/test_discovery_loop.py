"""Discovery 2.0, the loop (agent D): at most three open asks, "Change it", the life of a change
after the tap (sent, under review, live, and the platform's two exits), the check about 20 hours
after it was applied, the Sunday card's three quick replies with one confirmation and one result,
the approve-unedited rate, and the health overlay's guard on a confirmed fact.

Real PostgreSQL, HTTP in and out, the simulator for WhatsApp; the jobs run in the API's own process.
Every business, person and number here is made up.
"""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from alyr.modules.discovery import apply, loop, proposals
from alyr.modules.discovery import asks as asks_module
from alyr.modules.discovery import proposal_words as pw
from alyr.modules.discovery.connectors import sample
from discovery_proposals_support import (
    BASE,
    OWNER_PHONE,
    activity,
    approve,
    asks,
    asks_shop,
    branch_manager,
    find,
    get,
    messages_to,
    midday,
    only_one_waits,
    place_id,
    prepared_shop,
    send_asks,
    tap,
)
from discovery_support import discovery_shop, run_check_up
from test_consent import owner_sql

SADD = "Nuqta Car Care - Al Sadd"
WEEK = {"sat": ["07:00", "22:00"], "sun": ["07:00", "22:00"], "mon": ["07:00", "22:00"],
        "tue": ["07:00", "22:00"], "wed": ["07:00", "22:00"], "thu": ["07:00", "22:00"],
        "fri": ["13:00", "22:00"]}


@pytest.fixture
def shop(client_factory, monkeypatch):
    return prepared_shop(client_factory, monkeypatch)


def call(shop, fn):
    return shop.owner.portal.call(fn)


def in_shop(shop, work):
    async def go():
        async with shop.owner.app.state.db.tenant(shop.tenant_id) as conn:
            return await work(conn)
    return call(shop, go)


def open_asks(client, lang="en") -> dict:
    answer = client.get(f"{BASE}/asks", params={"lang": lang})
    assert answer.status_code == 200, answer.text
    return answer.json()


def row(shop, proposal_id) -> dict:
    found = dict(owner_sql("select * from discovery_proposals where id = $1",
                           UUID(proposal_id))[0])
    for key in ("change", "life_history", "receipt"):
        if isinstance(found[key], str):
            found[key] = json.loads(found[key])
    return found


def check_changes(shop, now):
    return call(shop, lambda: apply.check_changes(shop.owner.app.state.db, shop.tenant_id, now))


def change(client, p, after, *, expect=200, **more):
    answer = client.post(f"{BASE}/proposals/{p['id']}/change",
                         json={"change_hash": p["change_hash"], "after": after, **more})
    assert answer.status_code == expect, (answer.status_code, answer.text)
    return answer.json()


def facts_of(client, area):
    items = client.get(f"{BASE}/facts", params={"location_id": place_id(client, area)}).json()
    return {f["key"]: f for f in items["items"]}


# ── 1. at most three open asks; the rest are "Also noticed" ─────────────────────────────


def test_six_changes_are_three_open_asks_and_three_also_noticed_worst_then_oldest(shop):
    # P2: six changes, not ten: the sample's four website changes are owner steps (fix #4).
    # Six still fill the three open asks and leave three waiting their turn.
    block = open_asks(shop.owner)
    assert block["cap"] == 3
    assert len(block["open_asks"]) == 3 and len(block["also_noticed"]) == 3
    assert all(i["kind"] == "proposal" and i["queue"] == "open" for i in block["open_asks"])
    rank = {"high": 0, "medium": 1, "low": 2}
    opened = [i["proposal"] for i in block["open_asks"]]
    noticed = [i["proposal"] for i in block["also_noticed"]]
    # the worst first: nothing waiting is worse than what is open
    assert max(rank[p["severity"]] for p in opened) <= min(rank[p["severity"]] for p in noticed)
    keys = [(rank[p["severity"]], p["proposed_at"]) for p in noticed]
    assert keys == sorted(keys)
    # an open ask has its 14 days; an "Also noticed" one has not started them
    assert all(p["expires_at"] and p["opened_at"] for p in opened)
    assert all(p["expires_at"] is None and p["queue"] == "also_noticed" for p in noticed)
    # the same block is on the overview
    assert [i["proposal"]["id"] for i in shop.owner.get(f"{BASE}/overview").json()["asks"][
        "open_asks"]] == [p["id"] for p in opened]
    assert owner_sql("select count(*) as n from discovery_proposals where tenant_id = $1 "
                     "and opened_at is not null", shop.tenant_id)[0]["n"] == 3


def test_deciding_an_open_ask_opens_the_next_one(shop):
    first = open_asks(shop.owner)
    gone = first["open_asks"][0]["proposal"]
    answer = shop.owner.post(f"{BASE}/proposals/{gone['id']}/decline", json={"reason": "not_now"})
    assert answer.status_code == 200, answer.text
    assert answer.json()["decided"]["reason"] == "not_now"
    after = open_asks(shop.owner)
    assert len(after["open_asks"]) == 3 and len(after["also_noticed"]) == 2  # P2: six, fix #4
    assert after["open_asks"][-1]["proposal"]["id"] == first["also_noticed"][0]["proposal"]["id"]


def test_an_also_noticed_change_does_not_expire_while_it_waits_and_an_open_one_does(shop):
    block = open_asks(shop.owner)
    waiting = block["also_noticed"][0]["proposal"]["id"]
    opened = block["open_asks"][0]["proposal"]["id"]
    owner_sql("update discovery_proposals set proposed_at = now() - interval '20 days', "
              "expires_at = now() - interval '6 days' where id = any($1)",
              [UUID(waiting), UUID(opened)])
    from alyr.modules.discovery import sweep
    call(shop, lambda: sweep.sweep_shop(shop.owner.app.state.db, shop.tenant_id))
    assert row(shop, opened)["status"] == "expired"
    assert row(shop, waiting)["status"] == "proposed"
    # the expired ask made room: three are open again, and their 14 days start now
    assert len(open_asks(shop.owner)["open_asks"]) == 3


def test_a_seasonal_ask_counts_toward_the_three(shop, monkeypatch):
    from alyr.modules.discovery import words

    # C's `season_due` brings its own words; until it is merged, this test lends it some
    monkeypatch.setitem(words.RULE_WORDS, "season_due", words.RULE_WORDS["listing_unclaimed"])
    run = owner_sql("select id from discovery_runs where tenant_id = $1 limit 1",
                    shop.tenant_id)[0]["id"]
    owner_sql("insert into discovery_findings (tenant_id, fingerprint, rule_id, kind, severity, "
              "first_run_id, last_run_id) values ($1, 'season_due:test', 'season_due', 'owner', "
              "'high', $2, $2)", shop.tenant_id, run)
    block = open_asks(shop.owner)
    assert len(block["open_asks"]) == 3
    # the three already open stay open (each has its 14 days); the season's ask waits its turn
    seasons = [i for i in block["open_asks"] + block["also_noticed"] if i["kind"] == "season"]
    assert len(seasons) == 1 and seasons[0]["finding"]["rule_id"] == "season_due"
    # a decision opens no change in its place: the season's ask takes it
    first = block["open_asks"][0]["proposal"]
    shop.owner.post(f"{BASE}/proposals/{first['id']}/decline", json={"reason": "not_now"})
    assert owner_sql("select count(*) as n from discovery_proposals where tenant_id = $1 "
                     "and status = 'proposed' and opened_at is not null",
                     shop.tenant_id)[0]["n"] == 2
    after = open_asks(shop.owner)
    assert len(after["open_asks"]) == 3
    assert [i["kind"] for i in after["open_asks"]].count("season") == 1


def test_a_branch_manager_sees_the_open_asks_of_their_own_place_only(client_factory, monkeypatch):
    shop = prepared_shop(client_factory, monkeypatch)
    manager, _ = branch_manager(client_factory, shop, "Al Sadd")
    block = open_asks(manager)
    for item in block["open_asks"] + block["also_noticed"]:
        assert item["proposal"]["location"]["name"] == SADD


# ── 2. "Change it": approve an edited value ─────────────────────────────────────────────


def test_change_it_approves_the_edited_hours_and_the_receipt_says_so(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    assert p["edit"] == {"kind": "hours", "step_minutes": 30}
    assert p["undo_window_days"] == 7
    friday = dict(WEEK, fri=["14:00", "22:30"])
    answer = change(shop.owner, p, friday)
    assert answer["id"] != p["id"] and answer["already"] is False
    done = get(shop.owner, answer["id"])
    assert done["edited_from"] == p["id"] and done["approved_as"] == "edited"
    assert done["status"] == "applied"  # the job ran in the API's own process
    assert done["after"]["lines"][-1] == {"day": "fri", "text": "14:00 to 22:30"}
    assert done["receipt"]["edited"] is True
    assert done["receipt"]["approved_text"] == "Approved with a changed value"
    assert done["receipt"]["undo"]["days"] == 7
    # the one the person was shown expired as edited, and nothing of it was applied
    first = get(shop.owner, p["id"])
    assert (first["status"], first["expire_reason"]) == ("expired", "edited")
    assert first["history"][-1]["text"] == (
        "Owner changed the proposed value before approving it. Nothing of this version was "
        "applied.")
    history = get(shop.owner, done["id"])["history"]
    assert "Owner changed the proposed value and approved it in the workspace." in [
        h["text"] for h in history]
    # the confirmed hours follow the edit, so the next check does not ask for the old ones
    assert facts_of(shop.owner, "Al Sadd")["hours"]["value"]["fri"] == ["14:00", "22:30"]
    assert [json.loads(a["detail"]) for a in activity(shop, "fact.set")][-1] == {
        "key": "hours", "from": "edited_approval"}
    [approved] = activity(shop, "proposal.approve", done["id"])
    assert json.loads(approved["detail"])["edited"] is True


def test_change_it_without_updating_the_fact_leaves_the_fact(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    before = facts_of(shop.owner, "Al Sadd")["hours"]["value"]
    change(shop.owner, p, dict(WEEK, fri=["14:00", "22:00"]), update_fact=False)
    assert facts_of(shop.owner, "Al Sadd")["hours"]["value"] == before


@pytest.mark.parametrize("fri", [["13:15", "22:00"], ["22:00", "13:00"], ["25:00", "26:00"]])
def test_hours_are_changed_in_30_minute_steps_and_make_sense(shop, fri):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    answer = change(shop.owner, p, dict(WEEK, fri=fri), expect=422)
    assert answer["code"] == "bad_edit_hours" and answer["message_ar"]
    assert get(shop.owner, p["id"])["status"] == "proposed"


def test_a_day_left_as_proposed_is_not_held_to_the_step(shop):
    """Only the days the person changed must be in 30-minute steps."""
    p = find(shop.owner, "hours_missing", "Al Sadd")
    done = change(shop.owner, p, dict(WEEK, sat=None))
    assert done["approved_as"] == "edited"


def test_the_value_as_proposed_is_an_ordinary_approval(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    done = change(shop.owner, p, WEEK)
    assert done["id"] == p["id"] and done["approved_as"] == "unedited"


def test_a_phone_is_changed_to_a_valid_number_only_and_not_to_what_it_shows(shop):
    # P2: the sample's phone change was on the website (fix #4); a new confirmed number makes the
    # listing differ, so a listing phone change is asked.
    put = shop.owner.put(f"{BASE}/facts", json={
        "location_id": place_id(shop.owner, "Al Wakra"), "key": "phone",
        "value": {"phone": "+97455550199"}})
    assert put.status_code == 200, put.text
    p = find(shop.owner, "phone_conflict", "Al Wakra", target="listing", status="live")
    assert p["edit"] == {"kind": "phone"}
    assert change(shop.owner, p, {"phone": "123"}, expect=422)["code"] == "bad_phone"
    assert change(shop.owner, p, {"phone": "+974 5555 0112"}, expect=422)["code"] == (
        "nothing_to_change")
    done = change(shop.owner, p, {"phone": "+974 5555 0177"})
    assert done["after"]["text"] == "+974 5555 0177" and done["approved_as"] == "edited"
    assert facts_of(shop.owner, "Al Wakra")["phone"]["value"] == {"phone": "+97455550177"}


def test_a_name_is_changed_only_to_a_value_the_owner_confirmed(shop):
    p = find(shop.owner, "name_conflict", "Al Wakra")
    assert p["edit"]["kind"] == "choice"
    options = p["edit"]["options"]
    assert {"name": "Nuqta Car Care - Wakra"} in options
    assert change(shop.owner, p, {"name": "Best Car Wash Doha"}, expect=422)["code"] == (
        "bad_edit_choice")
    other = next(o for o in options if o != {"name": "Nuqta Car Care - Wakra"})
    done = change(shop.owner, p, other)
    assert done["approved_as"] == "edited" and done["after"]["text"] == other["name"]


def test_a_link_and_a_review_reply_cannot_be_changed_only_approved(shop):
    # P2: the WhatsApp link is the owner's website step now (fix #4), so a reply stands for both
    for rule in ("review_unanswered",):
        p = [x for x in proposals_all(shop) if x["rule_id"] == rule][0]
        assert p["edit"] is None
        answer = change(shop.owner, p, {"url": "https://wa.me/97455550001"}, expect=409)
        assert answer["code"] == "not_editable"


def proposals_all(shop):
    return shop.owner.get(f"{BASE}/proposals", params={"status": "live"}).json()["items"]


def test_change_it_needs_the_hash_that_was_shown_and_a_second_submit_answers_the_first(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    edited = dict(WEEK, fri=["14:00", "22:00"])
    wrong = dict(p, change_hash="0" * 64)
    assert change(shop.owner, wrong, edited, expect=409)["code"] == "proposal_changed"
    first = change(shop.owner, p, edited)
    again = change(shop.owner, p, edited)
    assert again["id"] == first["id"] and again["already"] is True
    assert len(activity(shop, "proposal.approve", first["id"])) == 1


def test_change_it_is_refused_to_a_staff_member_with_no_place_and_another_branch(
    client_factory, monkeypatch
):
    shop = prepared_shop(client_factory, monkeypatch, roles=("owner", "agent"))
    p = find(shop.owner, "hours_missing", "Al Sadd")
    assert change(shop.agent, p, WEEK, expect=403)["code"] == "forbidden"
    manager, _ = branch_manager(client_factory, shop, "Al Wakra")
    assert change(manager, p, WEEK, expect=404)["code"] == "not_found"
    assert get(shop.owner, p["id"])["status"] == "proposed"


def test_change_it_on_another_shops_proposal_is_not_found(client_factory, monkeypatch):
    one = prepared_shop(client_factory, monkeypatch)
    two = prepared_shop(client_factory, monkeypatch)
    p = find(one.owner, "hours_missing", "Al Sadd")
    assert change(two.owner, p, WEEK, expect=404)["code"] == "not_found"


def test_the_agent_door_cannot_change_and_approve(shop):
    from alyr.core import actions
    from alyr.modules.discovery.errors import DiscoveryError

    p = find(shop.owner, "hours_missing", "Al Sadd")
    owner = owner_sql("select user_id from memberships where tenant_id = $1 and role = 'owner'",
                      shop.tenant_id)[0]["user_id"]
    caller = actions.Caller(owner, "Owner", "owner", "mcp")

    async def work(conn):
        try:
            await actions.run(conn, caller, "discovery.approve_edited", id=UUID(p["id"]),
                              change_hash=p["change_hash"], after=WEEK)
        except DiscoveryError as error:
            return error.code
        return "approved"

    assert in_shop(shop, work) == "forbidden"


# ── the approve-unedited rate ───────────────────────────────────────────────────────────


def test_the_approve_unedited_rate_per_business_and_overall(client_factory, monkeypatch):
    shop = prepared_shop(client_factory, monkeypatch, roles=("owner", "agent"))
    assert shop.owner.get(f"{BASE}/metrics").json()["approve_unedited_rate"] is None
    # P2: listing changes (the website ones are the owner's steps, fix #4)
    approve(shop.owner, find(shop.owner, "category_missing", "Al Wakra"))
    change(shop.owner, find(shop.owner, "hours_missing", "Al Sadd"),
           dict(WEEK, fri=["14:00", "22:00"]))
    other = find(shop.owner, "name_conflict", "Al Wakra")
    shop.owner.post(f"{BASE}/proposals/{other['id']}/decline", json={"reason": "not_now"})
    counts = shop.owner.get(f"{BASE}/metrics").json()
    assert (counts["unedited"], counts["edited"], counts["approved"], counts["not_now"]) == (
        1, 1, 2, 1)
    assert counts["approve_unedited_rate"] == 0.5
    assert shop.agent.get(f"{BASE}/metrics").status_code == 403
    overall = call(shop, lambda: loop.overall_metrics(shop.owner.app.state.db))
    assert overall["unedited"] >= 1 and overall["edited"] >= 1 and overall["businesses"] >= 1
    assert set(overall) >= {"approve_unedited_rate", "approved", "live", "rejected"}


# ── 3. the life of a change ─────────────────────────────────────────────────────────────


def applied_at(shop, proposal_id) -> datetime:
    return row(shop, proposal_id)["applied_at"]


def test_approved_sent_under_review_then_live_at_the_check_about_20_hours_later(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    approve(shop.owner, p)
    sent = get(shop.owner, p["id"])
    assert [s["state"] for s in sent["life_history"]] == ["approved", "sent"]
    assert sent["life"]["state"] == "sent" and sent["life"]["text"] == "Sent to the listing"
    at = applied_at(shop, p["id"])
    due = datetime.fromisoformat(sent["next_check_at"])
    assert timedelta(hours=1) <= due - at <= timedelta(hours=20)
    assert sent["receipt"]["next_check_at"] == sent["next_check_at"]
    assert sent["receipt"]["undo"] == {"days": 7, "until": sent["undo_until"]}
    # an hour later the listing is still reviewing it
    assert check_changes(shop, at + timedelta(hours=1))["pending_review"] == 1
    reviewing = get(shop.owner, p["id"])
    assert reviewing["life"]["text"] == "The listing is reviewing it"
    assert reviewing["verification"] == "pending"
    # the check at its time sees it: live, on the receipt
    assert check_changes(shop, due + timedelta(minutes=1))["live"] == 1
    live = get(shop.owner, p["id"])
    assert [s["state"] for s in live["life_history"]] == [
        "approved", "sent", "pending_review", "live"]
    assert live["verification"] == "confirmed" and live["verified_at"]
    assert live["receipt"]["verified"]["state"] == "live"
    assert live["next_check_at"] is None
    assert [h["event"] for h in live["history"]][-2:] == ["life", "verify"]
    assert live["history"][-1]["text"] == "A check saw the change on the listing."
    # nothing more happens to it at the next pass
    assert sum(check_changes(shop, due + timedelta(hours=2)).values()) == 0
    # and the life is told in Arabic too
    ar = get(shop.owner, p["id"], "ar")
    assert ar["life"]["text"] == "ظاهر: رآه الفحص في الملف التجاري"


def test_the_website_has_no_review_and_is_live_at_the_check(client_factory, monkeypatch):
    # P2: no connector writes a website (DECISIONS #8, fix #4); the life of a website change is
    # still code, so it is checked with a sample that may write the website's hours.
    monkeypatch.setattr(sample.SampleConnector, "writes", sample.WRITES | {("website", "hours")})
    monkeypatch.setattr(sample.SampleConnector, "undoable", sample.WRITES | {("website", "hours")})
    shop = prepared_shop(client_factory, monkeypatch)
    p = find(shop.owner, "hours_conflict", "Industrial Area")
    approve(shop.owner, p)
    at = applied_at(shop, p["id"])
    assert check_changes(shop, at + timedelta(hours=1))["pending_review"] == 0
    assert check_changes(shop, at + timedelta(hours=21))["live"] == 1
    assert [s["state"] for s in get(shop.owner, p["id"])["life_history"]] == [
        "approved", "sent", "live"]


def test_the_platform_does_not_accept_it(shop, monkeypatch):
    monkeypatch.setattr(sample, "OUTCOMES", {("listing", "hours"): "rejected"})
    p = find(shop.owner, "hours_missing", "Al Sadd")
    approve(shop.owner, p)
    at = applied_at(shop, p["id"])
    assert check_changes(shop, at + timedelta(hours=3))["rejected"] == 1
    done = get(shop.owner, p["id"])
    assert done["life"]["state"] == "rejected" and done["verification"] == "not_confirmed"
    assert done["life"]["text"] == "The listing did not accept it"
    assert done["history"][-1]["text"] == "The listing did not accept the change."
    # the listing shows the old value again, and the problem is open again now
    assert owner_sql("select count(*) as n from discovery_sample_state where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 0
    assert finding_of(shop, p)["status"] == "open"
    # and it is in the 14-day cool-off: the same change is not asked again at once
    run_check_up(shop.owner)
    assert not [x for x in proposals_all(shop) if x["rule_id"] == "hours_missing"
                and x["location"]["name"] == SADD]


def finding_of(shop, p):
    return shop.owner.get(f"{BASE}/findings/{p['finding_id']}").json()


def test_the_platform_changes_it_back_after_it_was_live(shop, monkeypatch):
    monkeypatch.setattr(sample, "OUTCOMES", {("listing", "hours"): "changed_back"})
    p = find(shop.owner, "hours_missing", "Al Sadd")
    approve(shop.owner, p)
    at = applied_at(shop, p["id"])
    assert check_changes(shop, at + timedelta(hours=21))["live"] == 1
    assert check_changes(shop, at + timedelta(hours=31))["changed_back"] == 1
    done = get(shop.owner, p["id"])
    assert [s["state"] for s in done["life_history"]][-2:] == ["live", "changed_back"]
    assert done["life"]["text"] == "The listing changed it back"
    assert done["verification"] == "not_confirmed"
    assert finding_of(shop, p)["status"] == "open"


def test_a_change_still_under_review_is_looked_at_again_in_a_few_hours(shop, monkeypatch):
    monkeypatch.setattr(sample, "REVIEW_DELAY", timedelta(hours=30))
    p = find(shop.owner, "hours_missing", "Al Sadd")
    approve(shop.owner, p)
    at = applied_at(shop, p["id"])
    check_changes(shop, at + timedelta(hours=21))
    again = row(shop, p["id"])
    assert again["life"] == "pending_review" and again["verification"] == "pending"
    assert again["verify_at"] > at + timedelta(hours=21)
    assert check_changes(shop, at + timedelta(hours=31))["live"] == 1


def test_the_check_up_also_makes_an_applied_change_live(shop):
    p = find(shop.owner, "name_conflict", "Al Wakra")  # P2: a listing change (fix #4)
    approve(shop.owner, p)
    run_check_up(shop.owner)
    done = get(shop.owner, p["id"])
    assert done["verification"] == "confirmed" and done["life"]["state"] == "live"
    assert done["next_check_at"] is None


def test_the_check_is_never_in_quiet_hours_and_stays_inside_the_window():
    doha = ZoneInfo("Asia/Qatar")
    for hour in range(24):
        at = datetime(2026, 11, 26, hour, 10, tzinfo=doha)
        due = apply.verify_time(at, doha)
        local = due.astimezone(doha)
        assert not (local.hour >= 22 or local.hour < 7), (hour, local)
        assert timedelta(hours=1) <= due - at <= timedelta(hours=20), (hour, due - at)
    # a tap at noon is checked at 08:00 the next morning, 20 hours later
    noon = datetime(2026, 11, 26, 12, 0, tzinfo=doha)
    assert apply.verify_time(noon, doha) == noon + timedelta(hours=20)


def test_the_sample_simulates_the_platforms_states_the_same_way_every_time():
    from alyr.modules.discovery.connectors import Change, Location, WriteContext
    from alyr.modules.discovery.connectors.base import Receipt

    place = Location(UUID(int=1), "A", "", "Doha", "ref", None, None, True, 0)
    sent = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)
    receipt = Receipt("r", sent, sent + timedelta(days=7))

    def state(target, field, hours, outcomes=None):
        old = sample.OUTCOMES
        sample.OUTCOMES = outcomes or {}
        try:
            ctx = WriteContext(now=sent + timedelta(hours=hours), idempotency_key="k")
            import asyncio
            return asyncio.run(sample.SampleConnector().edit_state(
                Change("set_hours", target, field, place, "", {}, {}), receipt, ctx))[0]
        finally:
            sample.OUTCOMES = old

    assert state("listing", "hours", 1) == "pending"
    assert state("listing", "hours", 3) == "live"
    assert state("website", "hours", 0) == "live"
    assert state("listing", "hours", 3, {("listing", "hours"): "rejected"}) == "rejected"
    assert state("listing", "hours", 20, {("listing", "hours"): "changed_back"}) == "live"
    assert state("listing", "hours", 31, {("listing", "hours"): "changed_back"}) == "changed_back"


# ── 4. the Sunday card on WhatsApp ──────────────────────────────────────────────────────


@pytest.fixture
def phone_shop(client_factory, monkeypatch):
    return asks_shop(client_factory, monkeypatch)


def to_owner(shop):
    return [m for m in messages_to(shop, OWNER_PHONE) if m["direction"] == "out"]


def test_the_card_has_exactly_three_quick_replies_approve_change_it_not_now(phone_shop):
    only_one_waits(phone_shop, "hours_missing", "Al Sadd")
    assert send_asks(phone_shop) == 1
    card = to_owner(phone_shop)[-1]
    choices = card["payload"]["choices"]
    assert [c["title"] for c in choices] == ["Approve", "Change it", "Not now"]
    assert [c["id"].rsplit(":", 1)[1] for c in choices] == ["approve", "change", "later"]


def test_only_an_open_ask_is_sent(phone_shop):
    send_asks(phone_shop)
    [ask] = asks(phone_shop)
    assert row(phone_shop, str(ask["proposal_id"]))["opened_at"] is not None


def test_change_it_sends_the_link_to_the_edit_and_keeps_the_ask_open(phone_shop, monkeypatch):
    monkeypatch.setenv("ALYR_WORKSPACE_URL", "https://app.example")
    from alyr.config import get_settings
    get_settings.cache_clear()
    try:
        p = only_one_waits(phone_shop, "hours_missing", "Al Sadd")
        send_asks(phone_shop)
        ask = asks(phone_shop)[0]
        reply = tap(phone_shop, OWNER_PHONE, ask["id"], "change")[-1]["body"]
        assert reply == (
            f"Change it in your workspace: https://app.example/app/discovery?view=proposals"
            f"&p={p['id']}&edit=1 . Nothing changes until you approve it there.")
        kept = asks(phone_shop)[0]
        assert (kept["status"], kept["answer"]) == ("queued", "change")
        assert get(phone_shop.owner, p["id"])["status"] == "proposed"
    finally:
        monkeypatch.delenv("ALYR_WORKSPACE_URL")
        get_settings.cache_clear()


def test_not_now_closes_it_for_14_days_and_frees_the_place(phone_shop):
    p = only_one_waits(phone_shop, "hours_missing", "Al Sadd")
    send_asks(phone_shop)
    ask = asks(phone_shop)[0]
    reply = tap(phone_shop, OWNER_PHONE, ask["id"], "later")[-1]["body"]
    back = pw.shop_date(datetime.now(UTC) + timedelta(days=14), "Asia/Qatar", "en")
    assert reply == (
        f"Okay. Nothing changes. ALYR asks again after {back}, only if it is still different.")
    done = get(phone_shop.owner, p["id"])
    assert (done["status"], done["decided"]["reason"], done["decided"]["channel"]) == (
        "declined", "not_now", "whatsapp")
    assert done["history"][-1]["text"] == (
        "Owner said not now from WhatsApp. It comes back after 14 days only if it is still "
        "different.")


def test_one_confirmation_and_one_result_per_ask(phone_shop):
    p = only_one_waits(phone_shop, "hours_missing", "Al Sadd")
    send_asks(phone_shop)
    ask = asks(phone_shop)[0]
    before = len(to_owner(phone_shop))
    replies = tap(phone_shop, OWNER_PHONE, ask["id"], "approve")
    assert replies[-1]["body"] == (
        f"Approved: Opening hours at {SADD}. ALYR sends it now, checks it again within a day "
        "and sends you the result here.")
    assert len(to_owner(phone_shop)) == before + 1  # the confirmation, nothing at apply
    assert get(phone_shop.owner, p["id"])["status"] == "applied"
    at = applied_at(phone_shop, p["id"])
    due = row(phone_shop, p["id"])["verify_at"]
    check_changes(phone_shop, due + timedelta(minutes=1))
    # the sweep's asks send the one result (the owner wrote within the day: the window is open)
    owner_sql("update contacts set last_inbound_at = now() where tenant_id = $1 and phone = $2",
              phone_shop.tenant_id, OWNER_PHONE)
    call(phone_shop, lambda: _send_results(phone_shop))
    results = to_owner(phone_shop)[before + 1:]
    result = [m for m in results if m["body"].startswith("Checked:")]
    assert len(result) == 1, [m["body"] for m in results]
    assert result[0]["body"].startswith(
        f"Checked: Opening hours at {SADD} now shows Sat to Thu 07:00 to 22:00")
    assert "on the listing. You can undo it in your workspace until " in result[0]["body"]
    assert asks(phone_shop)[0]["result_sent_at"] is not None
    # never a second result
    assert call(phone_shop, lambda: _send_results(phone_shop)) == 0
    assert at  # applied


def _send_results(shop):
    async def go():
        async with shop.owner.app.state.db.tenant(shop.tenant_id) as conn:
            return await asks_module.send_results(conn, shop.owner.app.state.outbound, midday())
    return go()


def test_no_result_at_night(phone_shop):
    p = only_one_waits(phone_shop, "hours_missing", "Al Sadd")
    send_asks(phone_shop)
    tap(phone_shop, OWNER_PHONE, asks(phone_shop)[0]["id"], "approve")
    due = row(phone_shop, p["id"])["verify_at"]
    check_changes(phone_shop, due + timedelta(minutes=1))
    night = midday().replace(hour=20)  # 23:00 in Doha

    async def go():
        async with phone_shop.owner.app.state.db.tenant(phone_shop.tenant_id) as conn:
            return await asks_module.send_results(conn, phone_shop.owner.app.state.outbound, night)

    assert call(phone_shop, go) == 0
    assert asks(phone_shop)[0]["result_sent_at"] is None


def test_a_rejection_is_the_result(phone_shop, monkeypatch):
    monkeypatch.setattr(sample, "OUTCOMES", {("listing", "hours"): "rejected"})
    p = only_one_waits(phone_shop, "hours_missing", "Al Sadd")
    send_asks(phone_shop)
    tap(phone_shop, OWNER_PHONE, asks(phone_shop)[0]["id"], "approve")
    check_changes(phone_shop, applied_at(phone_shop, p["id"]) + timedelta(hours=3))
    assert call(phone_shop, lambda: _send_results(phone_shop)) == 1
    assert to_owner(phone_shop)[-1]["body"] == (
        f"The listing did not accept the change to Opening hours at {SADD}. It shows what it "
        "showed before. The change is in your workspace.")


def test_the_card_in_arabic_has_the_three_buttons_in_arabic(client_factory, monkeypatch):
    shop = asks_shop(client_factory, monkeypatch, lang="ar")
    only_one_waits(shop, "hours_missing", "Al Sadd")
    send_asks(shop)
    card = to_owner(shop)[-1]
    assert [c["title"] for c in card["payload"]["choices"]] == ["موافقة", "تعديله", "ليس الآن"]


def test_the_template_outside_the_window_carries_the_same_three_and_is_held():
    from alyr.core import templates

    t = templates.CATALOGUE["discovery_ask"]
    assert t.buttons == ("Approve", "Change it", "Not now")
    assert t.buttons_ar == ("موافقة", "تعديله", "ليس الآن")
    assert t.held  # written, not submitted: the founder's Meta submission
    assert all(len(b) <= 20 for b in t.buttons + t.buttons_ar)


# ── 5. API fields for the screens ───────────────────────────────────────────────────────


def test_the_overview_says_when_alyr_checks_next_and_the_checks_matched_before(shop):
    shop.owner.put(f"{BASE}/settings", json={"weekly_run": True})
    run_check_up(shop.owner)
    over = shop.owner.get(f"{BASE}/overview").json()
    previous = over["checks"]["previous"]
    assert set(previous) == {"matched", "measured", "at"} and previous["matched"] >= 0
    next_at = datetime.fromisoformat(over["asks"]["next_check_at"])
    last = datetime.fromisoformat(shop.owner.get(f"{BASE}/runs/latest").json()["finished_at"])
    assert next_at - last >= timedelta(days=7) - timedelta(minutes=1)
    assert next_at.astimezone(ZoneInfo("Asia/Qatar")).hour >= 6


def test_with_the_weekly_check_off_there_is_no_next_check_time(shop):
    assert shop.owner.get(f"{BASE}/overview").json()["asks"]["next_check_at"] is None


def test_a_change_that_fixes_two_checks_says_so(shop):
    """Two open findings at one place whose proposals are the very same change: approving one
    fixes both checks."""
    p = find(shop.owner, "hours_missing", "Al Sadd")
    other = owner_sql(
        "insert into discovery_findings (tenant_id, fingerprint, rule_id, location_id, kind, "
        "severity, first_run_id, last_run_id, observed) select tenant_id, 'hours_conflict:x', "
        "'hours_conflict', location_id, kind, severity, first_run_id, last_run_id, observed "
        "from discovery_findings where id = $1 returning id", UUID(p["finding_id"]))[0]["id"]
    owner_sql(
        "insert into discovery_proposals (tenant_id, finding_id, location_id, type, target, "
        "connector_kind, change, change_hash, severity, expires_at) select tenant_id, $2, "
        "location_id, type, target, connector_kind, change, change_hash, severity, expires_at "
        "from discovery_proposals where id = $1", UUID(p["id"]), other)
    # the last check-up found both checks different at Al Sadd
    run = owner_sql("select id, checks from discovery_runs where tenant_id = $1 and status = "
                    "'done' order by created_at desc limit 1", shop.tenant_id)[0]
    checks = json.loads(run["checks"]) if isinstance(run["checks"], str) else run["checks"]
    sadd = place_id(shop.owner, "Al Sadd")
    for entry in checks:
        if entry["rule"] == "hours_conflict" and entry["location"] == sadd:
            entry["state"] = "fail"
    owner_sql("update discovery_runs set checks = $2 where id = $1", run["id"],
              json.dumps(checks))
    fixes = get(shop.owner, p["id"])["also_fixes"]
    assert fixes["checks"] == 2 and fixes["rules"] == ["hours_conflict"]
    assert fixes["to"] - fixes["from"] == 2 and fixes["of"] >= fixes["to"]


# ── 6. the health overlay's guard on a confirmed fact ───────────────────────────────────


def test_a_clinic_s_confirmed_fact_never_builds_a_proposal_on_service_text(
    client_factory, monkeypatch
):
    shop = prepared_shop(client_factory, monkeypatch)
    owner_sql("update tenants set business_type = 'clinic' where id = $1", shop.tenant_id)
    real = sample.SampleConnector()
    wider = SimpleNamespace(
        kind="sample", snapshot=real.snapshot,
        writes=frozenset(real.writes) | {("listing", "services"), ("website", "offers")})
    from alyr.modules.discovery import connectors
    monkeypatch.setattr(connectors, "get", lambda kind: wider)

    async def work(conn):
        return await proposals._active_connector(conn)

    kind, writes = in_shop(shop, work)
    assert kind == "sample"
    assert ("listing", "services") not in writes and ("listing", "hours") in writes
    # and the fact path still works, through the guarded writes
    answer = shop.owner.put(f"{BASE}/facts", json={
        "location_id": place_id(shop.owner, "Al Sadd"), "key": "phone",
        "value": {"phone": "+97455550150"}})
    assert answer.status_code == 200, answer.text


def test_a_shop_without_the_module_answers_module_off_on_the_loops_routes(
    client_factory, monkeypatch
):
    shop = discovery_shop(client_factory, monkeypatch, module=False)
    for method, path, body in (
        ("get", "/asks", None), ("get", "/metrics", None),
        ("post", f"/proposals/{UUID(int=5)}/change", {"change_hash": "a", "after": {}}),
    ):
        answer = getattr(shop.owner, method)(f"{BASE}{path}", **({"json": body} if body else {}))
        assert answer.status_code == 404 and answer.json()["code"] == "module_off"


def test_the_life_words_exist_for_every_state_in_both_languages():
    for state in proposals.LIFE_STATES:
        for lang in ("en", "ar"):
            assert pw.life_text(state, "listing", lang)
            assert pw.life_text(state, "website", lang)
