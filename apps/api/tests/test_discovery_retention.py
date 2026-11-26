"""Google's text is kept at most 30 days (Discovery 2.0; research R2 section 8, R6 section 3.1).

No Google source writes to the database yet, so the sample business stands in for one: the tests
mark `sample` as a Google source (`base.GOOGLE_SOURCES`), run its check-up, decide some of its
proposals, and sweep with a clock moved forward. What is Google's (review text and names, values
read on the listing, the "before" of a closed proposal, what a finding compared) is removed after
30 days; place IDs, the owner's confirmed facts and ALYR's own work (the "after", the hash, the
receipt, who decided) stay.
"""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from alyr.modules.discovery import retention, sweep
from alyr.modules.discovery.connectors import base, sample
from discovery_proposals_support import BASE, approve, get, prepared_shop, proposals
from test_consent import owner_sql


@pytest.fixture
def google_sample(monkeypatch):
    """The sample read as if it were Google's, with its Business Profile connected (so its review
    replies are measured and proposed, as a connected profile's would be)."""
    monkeypatch.setattr(base, "GOOGLE_SOURCES", base.GOOGLE_SOURCES | {"sample"})
    monkeypatch.setattr(sample, "BUSINESS_PROFILE", True)


@pytest.fixture
def shop(client_factory, monkeypatch, google_sample):
    return prepared_shop(client_factory, monkeypatch)


def sweep_at(shop, now: datetime) -> dict:
    client = shop.owner
    return client.portal.call(
        lambda: sweep.sweep_shop(client.app.state.db, shop.tenant_id, None, now))


def expire_at(shop, now: datetime) -> dict:
    """The retention step alone, with the clock at `now` (the sweep would also expire proposals
    past their 14 days, which is not what these tests look at)."""
    client = shop.owner

    async def run():
        async with client.app.state.db.tenant(shop.tenant_id) as conn:
            return await retention.expire_google_text(conn, now)

    return client.portal.call(run)


def reviews(shop) -> list[dict]:
    return [dict(r) for r in owner_sql(
        "select source_ref, rating, posted_at, replied, author_name, body, reply_text "
        "from discovery_reviews where tenant_id = $1 order by source_ref", shop.tenant_id)]


def _decoded(row, *columns: str) -> dict:
    out = dict(row)
    for column in columns:
        if isinstance(out[column], str):
            out[column] = json.loads(out[column])
    return out


def findings(shop) -> list[dict]:
    return [_decoded(r, "evidence", "observed") for r in owner_sql(
        "select id, rule_id, evidence, observed from discovery_findings where tenant_id = $1 "
        "order by fingerprint", shop.tenant_id)]


def proposal_rows(shop) -> dict[str, dict]:
    return {str(r["id"]): _decoded(r, "change", "receipt") for r in owner_sql(
        "select id, status, change, change_hash, receipt, decided_name, decided_at "
        "from discovery_proposals where tenant_id = $1", shop.tenant_id)}


def kept_for_good(shop) -> tuple:
    return (
        [dict(r) for r in owner_sql(
            "select id, place_ref, name, name_ar from discovery_locations where tenant_id = $1 "
            "order by position", shop.tenant_id)],
        [dict(r) for r in owner_sql(
            "select location_id, key, value, source from discovery_facts where tenant_id = $1 "
            "order by location_id, key", shop.tenant_id)],
    )


def decide_some(shop) -> tuple[str, str, str]:
    """Approve one proposal (it is applied in this process), decline one, leave one waiting."""
    live = proposals(shop.owner, "live")
    assert len(live) >= 3
    approve(shop.owner, live[0])
    answer = shop.owner.post(f"{BASE}/proposals/{live[1]['id']}/decline", json={})
    assert answer.status_code == 200, answer.text
    return live[0]["id"], live[1]["id"], live[2]["id"]


def test_nothing_is_removed_before_thirty_days(shop):
    decide_some(shop)
    before = (reviews(shop), findings(shop), proposal_rows(shop), kept_for_good(shop))
    assert any(r["body"] for r in before[0]), "the sample's reviews have text to remove"
    assert sum(expire_at(shop, datetime.now(UTC) + timedelta(days=29)).values()) == 0
    assert (reviews(shop), findings(shop), proposal_rows(shop), kept_for_good(shop)) == before


def test_after_thirty_days_google_text_goes_and_alyrs_own_work_stays(shop):
    applied, declined, waiting = decide_some(shop)
    before_reviews, before_findings = reviews(shop), findings(shop)
    before_proposals, kept = proposal_rows(shop), kept_for_good(shop)
    assert proposal_rows(shop)[applied]["status"] == "applied"

    done = expire_at(shop, datetime.now(UTC) + timedelta(days=31))
    assert done["reviews"] > 0 and done["findings"] > 0 and done["proposals"] == 2

    # Reviews: the stars, the day, whether it was answered and its id stay; the words go.
    after = reviews(shop)
    assert [(r["source_ref"], r["rating"], r["posted_at"], r["replied"]) for r in after] == [
        (r["source_ref"], r["rating"], r["posted_at"], r["replied"]) for r in before_reviews]
    assert all(r["author_name"] == r["body"] == r["reply_text"] == "" for r in after)

    # Evidence: what was read on the listing or in reviews is removed; ALYR's markers and the
    # owner's own website stay.
    for old, new in zip(before_findings, findings(shop), strict=True):
        assert new["observed"] == {}
        for was, now in zip(old["evidence"], new["evidence"], strict=True):
            if was["where"] in ("listing", "reviews") and not was["value"].startswith("~"):
                assert now["value"] == retention.REMOVED, (old["rule_id"], was)
            else:
                assert now == was
    assert any(e["value"] == retention.REMOVED for f in findings(shop) for e in f["evidence"])

    # Proposals: a closed one loses its "before" and keeps everything else; a waiting one is whole.
    rows = proposal_rows(shop)
    for pid in (applied, declined):
        old, new = before_proposals[pid], rows[pid]
        assert new["change"]["before"] == {"removed": True}
        assert new["change"]["after"] == old["change"]["after"]
        assert new["change"]["field"] == old["change"]["field"]
        assert (new["change_hash"], new["receipt"], new["decided_name"], new["decided_at"]) == (
            old["change_hash"], old["receipt"], old["decided_name"], old["decided_at"])
    assert rows[waiting] == before_proposals[waiting]

    # Place IDs and the owner's confirmed facts are kept for good.
    assert kept_for_good(shop) == kept

    # The screen says what happened to a removed "before", in both languages.
    assert get(shop.owner, applied)["before"]["text"] == "removed after 30 days (Google's terms)"
    assert get(shop.owner, applied, "ar")["before"]["text"] == "حُذف بعد 30 يومًا (وفق شروط Google)"
    shown = shop.owner.get(f"{BASE}/findings/{before_findings[0]['id']}").json()
    assert shown["status"]

    # A second pass finds nothing more to do.
    assert sum(expire_at(shop, datetime.now(UTC) + timedelta(days=32)).values()) == 0


def test_an_applied_change_keeps_its_before_while_it_can_still_be_undone(shop):
    applied, _, _ = decide_some(shop)
    owner_sql("update discovery_proposals set undo_until = now() + interval '40 days' "
              "where id = $1", UUID(applied))
    expire_at(shop, datetime.now(UTC) + timedelta(days=31))
    assert proposal_rows(shop)[applied]["change"]["before"] != {"removed": True}


def test_a_source_that_is_not_googles_is_left_alone(client_factory, monkeypatch):
    """The sample as it really is (not Google's): nothing is removed, however old."""
    shop = prepared_shop(client_factory, monkeypatch)
    before = (reviews(shop), findings(shop), proposal_rows(shop))
    assert sum(expire_at(shop, datetime.now(UTC) + timedelta(days=400)).values()) == 0
    assert (reviews(shop), findings(shop), proposal_rows(shop)) == before


def test_the_hourly_sweep_runs_it_and_says_how_much_it_removed(shop):
    assert sweep_at(shop, datetime.now(UTC) + timedelta(days=29))["removed"] == 0
    assert sweep_at(shop, datetime.now(UTC) + timedelta(days=31))["removed"] > 0
    assert all(r["body"] == "" for r in reviews(shop))


def test_text_is_removed_even_when_discovery_was_switched_off(shop):
    owner_sql("update tenant_modules set enabled = false where tenant_id = $1 and "
              "module_key = 'discovery'", shop.tenant_id)
    sweep_at(shop, datetime.now(UTC) + timedelta(days=31))
    assert all(r["body"] == "" for r in reviews(shop))


def test_the_database_still_refuses_any_other_edit_of_a_change(shop):
    """0170 opens the guard for one edit only: a closed proposal's "before" becoming removed."""
    applied, _, waiting = decide_some(shop)
    for pid, change in (
        (waiting, "jsonb_set(change, '{before}', '{\"removed\": true}'::jsonb)"),
        (applied, "jsonb_set(change, '{after}', '{\"phone\": \"+97455550000\"}'::jsonb)"),
        (applied, "jsonb_set(change, '{before}', '{\"phone\": \"x\"}'::jsonb)"),
    ):
        with pytest.raises(Exception, match="cannot be edited"):
            owner_sql(f"update discovery_proposals set change = {change} where id = $1",
                      UUID(pid))


def test_the_snapshot_says_whether_its_text_is_googles():
    now = datetime.now(UTC)
    assert base.Snapshot("places", now).from_google
    assert base.Snapshot("gbp", now).from_google
    assert not base.Snapshot("sample", now).from_google
    assert not base.Snapshot("manual", now).from_google
    assert retention.KEEP_FOR == timedelta(days=30)
