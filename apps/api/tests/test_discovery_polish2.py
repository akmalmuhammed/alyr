"""Discovery 2.0, polish from QA (agent P2): an ask that closed without a decision keeps when it
closed (Proof never draws a future date as "expired"), an undone "Change it" is not asked again at
once, and ALYR writes nothing to an owner's website (DECISIONS #8): a website difference is a step
the owner takes, with the exact text to put there.

Real PostgreSQL, HTTP in and out, the jobs run in the API's own process. Every business, person and
number here is made up.
"""

from datetime import UTC, datetime
from uuid import UUID

import pytest

from alyr.modules.discovery import sweep
from alyr.modules.discovery.connectors import sample
from discovery_proposals_support import BASE, approve, find, get, prepared_shop, proposals
from discovery_support import findings, run_check_up
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return prepared_shop(client_factory, monkeypatch)


def sweep_now(shop):
    client = shop.owner
    return client.portal.call(lambda: sweep.sweep_shop(client.app.state.db, shop.tenant_id))


def parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


# ── when an ask closed ──────────────────────────────────────────────────────────────────


def test_an_open_proposal_has_no_close_date(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    assert p["status"] == "proposed" and p["closed_at"] is None


def test_an_ask_that_ran_out_of_time_says_when_it_closed_and_it_is_not_in_the_future(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    owner_sql("update discovery_proposals set opened_at = now() - interval '15 days', "
              "proposed_at = now() - interval '15 days', expires_at = now() - interval '1 day' "
              "where id = $1", UUID(p["id"]))
    sweep_now(shop)
    closed = get(shop.owner, p["id"])
    assert (closed["status"], closed["expire_reason"]) == ("expired", "time")
    assert closed["closed_at"] is not None
    assert parse(closed["closed_at"]) <= datetime.now(UTC)
    # the receipt's date is when it closed, never the date it would have closed
    assert parse(closed["closed_at"]) > parse(closed["proposed_at"])


def test_an_ask_replaced_by_change_it_says_when_and_why_it_closed(shop):
    p = find(shop.owner, "name_conflict", "Al Wakra")
    other = next(o for o in p["edit"]["options"] if o != {"name": "Nuqta Car Care - Wakra"})
    answer = shop.owner.post(f"{BASE}/proposals/{p['id']}/change",
                             json={"change_hash": p["change_hash"], "after": other})
    assert answer.status_code == 200, answer.text
    first = get(shop.owner, p["id"])
    assert (first["status"], first["expire_reason"]) == ("expired", "edited")
    assert first["closed_at"] is not None and parse(first["closed_at"]) <= datetime.now(UTC)


def test_a_decided_proposal_has_no_close_date_of_its_own(shop):
    p = find(shop.owner, "hours_missing", "Al Sadd")
    done = approve(shop.owner, p)
    assert done["closed_at"] is None


# ── undo of an edited approval ──────────────────────────────────────────────────────────


def test_an_undone_change_it_is_not_asked_again_at_once_in_either_value(shop):
    p = find(shop.owner, "name_conflict", "Al Wakra")
    other = next(o for o in p["edit"]["options"] if o != {"name": "Nuqta Car Care - Wakra"})
    edited = shop.owner.post(f"{BASE}/proposals/{p['id']}/change",
                             json={"change_hash": p["change_hash"], "after": other}).json()
    applied = get(shop.owner, edited["id"])
    assert applied["status"] == "applied", applied["status"]
    undone = shop.owner.post(f"{BASE}/proposals/{edited['id']}/undo")
    assert undone.status_code == 200 and undone.json()["status"] == "undone"
    run_check_up(shop.owner)
    again = [x for x in proposals(shop.owner, "live")
             if x["change_hash"] in (p["change_hash"], edited["change_hash"])]
    # the same 14 days as Not now: neither the value shown nor the value approved is asked again
    assert again == []


# ── ALYR writes nothing to a website ────────────────────────────────────────────────────


def test_the_sample_writes_only_to_the_listing():
    assert sample.WRITES and all(target == "listing" for target, _field in sample.WRITES)
    assert all(target == "listing" for target, _field in sample.SampleConnector.undoable)


def test_no_proposal_ever_targets_a_website(shop):
    assert all(p["target"] != "website" for p in proposals(shop.owner, "all"))
    run_check_up(shop.owner)
    assert all(p["target"] != "website" for p in proposals(shop.owner, "all"))


def test_a_website_difference_is_a_step_the_owner_takes_with_the_exact_text(shop):
    items = [f for f in findings(shop.owner) if f["rule_id"] == "whatsapp_link_missing"
             and f["location"]["name"].endswith("Al Sadd")]
    assert len(items) == 1
    steps = items[0]["website_steps"]
    assert len(steps) == 1
    step = steps[0]
    assert step["field"] == "whatsapp_link" and step["where"] == "the website"
    assert step["after"]["text"] == "https://wa.me/97455550150"
    assert step["location"]["name"].endswith("Al Sadd")
    # in Arabic, the same exact text and the words for where
    ar = [f for f in findings(shop.owner, lang="ar") if f["id"] == items[0]["id"]][0]
    assert ar["website_steps"][0]["after"]["text"] == "https://wa.me/97455550150"


def test_a_finding_the_listing_can_fix_has_no_website_step(shop):
    items = [f for f in findings(shop.owner) if f["rule_id"] == "hours_missing"]
    assert items and all(f["website_steps"] == [] for f in items)


def test_the_overview_carries_the_website_steps_of_the_findings_it_shows(shop):
    overview = shop.owner.get(f"{BASE}/overview").json()
    shown = [f for f in [overview["next"], *overview["up_next"]] if f]
    assert all("website_steps" in f for f in shown)


# ── evidence that found nothing ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("lang, sentence", [
    ("en", "Your website has no WhatsApp link."),
    ("ar", "لا يوجد رابط واتساب في موقعك."),
])
def test_evidence_that_found_nothing_is_a_whole_sentence(shop, lang, sentence):
    items = [f for f in findings(shop.owner, lang=lang) if f["rule_id"] == "whatsapp_link_missing"
             and f["location"]["name"].endswith(("Al Sadd", "السد"))]
    assert items, "the sample has a missing WhatsApp link at Al Sadd"
    ev = [e for e in items[0]["evidence"] if e["sentence"]]
    assert [e["sentence"] for e in ev] == [sentence]


def test_evidence_that_found_something_has_no_sentence(shop):
    every = [e for f in findings(shop.owner) for e in f["evidence"]]
    assert every
    nothing = ("None", "Not found", "No", "Not listed", "Listed, with no page of its own")
    assert all(e["sentence"] == "" for e in every if e["value"] not in nothing)


# ── no source connected ─────────────────────────────────────────────────────────────────


def test_a_check_with_no_source_says_so_and_names_the_next_step(client_factory, monkeypatch):
    from discovery_support import discovery_shop

    shop = discovery_shop(client_factory, monkeypatch)
    answer = shop.owner.post(f"{BASE}/runs")
    assert answer.status_code in (400, 409, 422), answer.text
    body = answer.json()
    assert body["code"] == "no_connection"
    assert "Setup" in body["detail"] and "Turn on Discovery" not in body["detail"]
    assert "الإعداد" in body["message_ar"]
