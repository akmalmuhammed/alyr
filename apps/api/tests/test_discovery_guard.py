"""The fictional sample never reaches a real shop (D-169, first-client audit, 21 Nov 2026).

Discovery's Home used to offer one button, "Turn on Discovery", hard-coded to the sample, which
gives any shop five made-up branches ("Nuqta Car Care") with invented hours, phones and reviews.
Now the sample is offered only to a shop ALYR staff marked as a demo or test business in `/ops`
(`tenants.demo_data_allowed`, the flag the back office already sets, audited, and that a shop
cannot set for itself); a shop that is not marked is offered nothing and its refusal says why, in
both languages. Every door is covered: the route, the check-up's start and the queued run.
"""

import asyncio

from alyr.config import get_settings
from alyr.db import Database
from alyr.modules.discovery import engine
from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql

BASE = "/api/discovery"


def rows(sql, shop):
    return owner_sql(sql, shop.tenant_id)


def untouched(shop):
    """Nothing of the sample reached the shop: no connection, no place, no fact, no run."""
    for table in ("discovery_connections", "discovery_locations", "discovery_facts",
                  "discovery_runs"):
        assert rows(f"select count(*) from {table} where tenant_id = $1", shop)[0]["count"] == 0, (
            table)


def test_a_shop_that_is_not_marked_cannot_turn_the_sample_on(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, demo=False)
    refused = shop.owner.put(f"{BASE}/connection", json={"kind": "sample", "on": True})
    assert refused.status_code == 409
    body = refused.json()
    assert body["code"] == "sample_not_allowed"
    assert "demo" in body["detail"] and body["message_ar"]
    untouched(shop)
    # no run can start either: there is nothing to run
    assert shop.owner.post(f"{BASE}/runs").status_code == 409
    untouched(shop)


def test_the_refusal_is_the_same_for_an_admin_and_the_screens_words_are_not_a_403(
        client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch, demo=False, roles=("owner", "admin"))
    answer = shop.admin.put(f"{BASE}/connection", json={"kind": "sample", "on": True})
    # 409, not 403: the screen says "only the owner or an admin" for a 403, which would be false
    assert (answer.status_code, answer.json()["code"]) == (409, "sample_not_allowed")
    untouched(shop)


def test_a_real_shop_is_offered_no_source_and_a_demo_shop_the_sample(client_factory, monkeypatch):
    real = discovery_shop(client_factory, monkeypatch, demo=False)
    demo = discovery_shop(client_factory, monkeypatch)
    assert real.owner.get(f"{BASE}/connection").json() == {
        "kind": None, "status": None, "available": [], "demo": False, "connections": []}
    assert demo.owner.get(f"{BASE}/connection").json()["available"] == ["sample"]
    assert real.owner.get(f"{BASE}/overview").json()["demo"] is False
    assert demo.owner.get(f"{BASE}/overview").json()["demo"] is True


def test_a_marked_shop_still_turns_the_sample_on_and_runs_a_check_up(client_factory, monkeypatch):
    shop = discovery_shop(client_factory, monkeypatch)
    assert turn_on_sample(shop)["kind"] == "sample"
    assert run_check_up(shop.owner)["score"] is not None


def test_a_shop_cannot_mark_itself_as_a_demo(client_factory, monkeypatch):
    """The mark is ALYR staff's: the app role cannot write `tenants`, and the route that sets it is
    the back office's. A shop's own owner has no door to it."""
    shop = discovery_shop(client_factory, monkeypatch, demo=False)
    path = f"/api/admin/businesses/{shop.tenant_id}/demo-data"
    assert shop.owner.post(path, json={"allowed": True}).status_code in (401, 403, 404)
    assert rows("select demo_data_allowed from tenants where id = $1", shop)[0][
        "demo_data_allowed"] is False


def test_a_sample_left_on_a_shop_that_is_not_marked_never_runs(client_factory, monkeypatch):
    """A connection made before the guard, or after the mark came off: no check-up starts."""
    shop = discovery_shop(client_factory, monkeypatch, demo=False)
    owner_sql("insert into discovery_connections (tenant_id, kind, status) "
              "values ($1, 'sample', 'on')", shop.tenant_id)
    owner_sql("insert into discovery_locations (tenant_id, name, is_primary) "
              "values ($1, 'My shop', true)", shop.tenant_id)
    refused = shop.owner.post(f"{BASE}/runs")
    assert (refused.status_code, refused.json()["code"]) == (409, "sample_not_allowed")
    assert rows("select count(*) from discovery_runs where tenant_id = $1", shop)[0]["count"] == 0
    # it can always be turned off
    off = shop.owner.put(f"{BASE}/connection", json={"kind": "sample", "on": False})
    assert off.status_code == 200 and off.json()["kind"] is None


def test_a_queued_run_stops_if_the_mark_comes_off_before_it_runs(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    run = shop.owner.post(f"{BASE}/runs").json()
    assert run["status"] == "queued"
    owner_sql("update tenants set demo_data_allowed = false where id = $1", shop.tenant_id)

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
    done = shop.owner.get(f"{BASE}/runs/{run['id']}").json()
    assert done["status"] == "failed" and done["error_code"] == "sample_not_allowed"
    assert done["score"] is None and done["error"]
    # nothing was found about the made-up business
    assert rows("select count(*) from discovery_findings where tenant_id = $1", shop)[0][
        "count"] == 0
    assert rows("select count(*) from discovery_reviews where tenant_id = $1", shop)[0][
        "count"] == 0


def test_the_words_of_the_refusal_are_in_both_languages_and_say_no_ai():
    from alyr.modules.discovery.words import ERRORS

    en, ar = ERRORS["sample_not_allowed"]
    assert en and ar and "…" not in en + ar and "..." not in en
    for banned in ("AI", "smart", "intelligen", "assistant"):
        assert banned.lower() not in en.lower()
