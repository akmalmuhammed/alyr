"""Discovery Phase 2, the sweep, the weekly check-up and what follows a check-up (spec 066, D-166).

The sweep is one loop in the worker, once an hour, a shop at a time, only for shops with the module
on. The weekly check-up is off by default; on, it starts one when the last finished is over seven
days old, at the first sweep after 06:00 on the shop's clock, never two and never while one is
queued.
"""

from datetime import timedelta
from uuid import UUID

import pytest

from alyr.modules.discovery import asks as asks_module
from alyr.modules.discovery import engine, sweep
from discovery_proposals_support import (
    BASE,
    asks,
    asks_shop,
    midday,
    prepared_shop,
    proposals,
)
from discovery_support import discovery_shop
from test_consent import owner_sql


def sweep_at(shop, now=None):
    """The sweep of this shop only (the suite's other shops are left alone)."""
    client = shop.owner
    return client.portal.call(
        lambda: sweep.sweep_shop(client.app.state.db, shop.tenant_id, None, now))


def runs(shop) -> list[dict]:
    return [dict(r) for r in owner_sql(
        "select trigger, status from discovery_runs where tenant_id = $1 order by created_at",
        shop.tenant_id)]


@pytest.fixture
def shop(client_factory, monkeypatch):
    return prepared_shop(client_factory, monkeypatch, run=False)


def test_the_weekly_check_up_is_off_by_default(shop):
    assert shop.owner.get(f"{BASE}/settings").json()["weekly_run"] is False
    assert sweep_at(shop, midday())["scheduled"] == 0 and runs(shop) == []


def test_switched_on_it_starts_one_check_up_after_six_in_the_morning_and_never_two(shop):
    shop.owner.put(f"{BASE}/settings", json={"weekly_run": True})
    assert sweep_at(shop, midday().replace(hour=2, minute=30))["scheduled"] == 0  # 05:30
    assert runs(shop) == []
    assert sweep_at(shop, midday().replace(hour=3, minute=5))["scheduled"] == 1  # 06:05
    assert [(r["trigger"], r["status"]) for r in runs(shop)] == [("schedule", "done")]
    # it ran (jobs run in the API's process here) and prepared changes
    assert len(proposals(shop.owner, "live")) == 10
    # the last finished one is under a week old: nothing starts
    assert sweep_at(shop, midday())["scheduled"] == 0 and len(runs(shop)) == 1
    owner_sql("update discovery_runs set finished_at = now() - interval '8 days' "
              "where tenant_id = $1", shop.tenant_id)
    assert sweep_at(shop, midday())["scheduled"] == 1 and len(runs(shop)) == 2


def test_it_does_not_start_one_while_one_is_queued_or_running(shop):
    shop.owner.put(f"{BASE}/settings", json={"weekly_run": True})
    owner_sql("insert into discovery_runs (tenant_id, connector_kind, status, trigger) "
              "values ($1, 'sample', 'queued', 'manual')", shop.tenant_id)
    assert sweep_at(shop, midday())["scheduled"] == 0
    assert [r["trigger"] for r in runs(shop)] == ["manual"]


def test_it_starts_nothing_without_a_connection_and_needs_no_run_gap(client_factory, monkeypatch):
    off = discovery_shop(client_factory, monkeypatch)  # on, but no connector turned on
    off.owner.put(f"{BASE}/settings", json={"weekly_run": True})
    assert sweep_at(off, midday())["scheduled"] == 0 and runs(off) == []


def test_a_shop_with_discovery_off_is_left_alone(client_factory, monkeypatch):
    off = discovery_shop(client_factory, monkeypatch, module=False)
    owner_sql("insert into discovery_settings (tenant_id, weekly_run) values ($1, true)",
              off.tenant_id)
    assert sweep_at(off, midday()) == {"expired": 0, "requeued": 0, "scheduled": 0, "asked": 0}
    assert runs(off) == []


def test_the_sweep_asks_through_the_function_it_is_given_and_a_failure_there_changes_no_expiry(
        client_factory, monkeypatch):
    shop = prepared_shop(client_factory, monkeypatch)
    owner_sql("update discovery_proposals set proposed_at = now() - interval '15 days', "
              "expires_at = now() - interval '1 day' where id = (select id from "
              "discovery_proposals where tenant_id = $1 limit 1)", shop.tenant_id)
    calls = []

    async def asking(conn, now):
        calls.append(now)
        raise RuntimeError("asking broke")

    client = shop.owner
    client.portal.call(lambda: sweep.sweep_all(client.app.state.db, asking, midday()))
    assert len(calls) >= 1
    expired = [p for p in proposals(shop.owner, "all") if p["status"] == "expired"]
    assert len(expired) == 1  # the housekeeping was kept; only the asking failed


def test_a_finished_check_up_asks_whoever_should_be_asked(client_factory, monkeypatch):
    shop = asks_shop(client_factory, monkeypatch)
    client = shop.owner
    after = sweep.after_run(client.app.state.db, client.app.state.discovery_asks, midday)
    assert asks(shop) == []
    client.portal.call(lambda: after(shop.tenant_id))
    client.portal.call(client.app.state.jobs.drain)
    assert len(asks(shop)) == 1


def test_the_check_up_job_is_wired_to_ask_when_it_has_finished_and_the_apply_job_is_registered(
        shop):
    handlers = shop.owner.app.state.jobs._handlers
    assert engine.JOB in handlers and "discovery.apply" in handlers
    assert handlers[engine.JOB].__self__._after is not None
    assert engine.JOB in shop.owner.app.state.jobs._background
    # the apply job is not background work: the owner is waiting for it
    assert "discovery.apply" not in shop.owner.app.state.jobs._background
    assert "discovery.apply" in shop.owner.app.state.jobs._on_dead


def test_a_check_up_that_fails_never_asks(shop):
    called = []

    async def never(tenant_id):
        called.append(tenant_id)

    client = shop.owner
    owner_sql("delete from discovery_locations where tenant_id = $1", shop.tenant_id)
    run = owner_sql("insert into discovery_runs (tenant_id, connector_kind, status) values "
                    "($1, 'sample', 'queued') returning id", shop.tenant_id)[0]["id"]
    client.portal.call(lambda: engine.execute(client.app.state.db, shop.tenant_id, UUID(str(run)),
                                              None, never))
    assert called == []
    assert owner_sql("select status from discovery_runs where id = $1", run)[0]["status"] == (
        "failed")


def test_the_ask_function_has_the_signature_the_sweep_calls(shop):
    assert asks_module.Sender.__call__.__code__.co_varnames[:3] == ("self", "conn", "now")
    assert timedelta(hours=24) == asks_module.OPEN_FOR
