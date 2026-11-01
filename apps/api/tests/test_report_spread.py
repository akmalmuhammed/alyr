"""The Sunday report keeps its hour unless the spread is switched on (D-132), and the worker keeps
places for customers while background work runs."""

from datetime import date, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from alyr.config import get_settings
from alyr.core.jobs import JobRunner
from alyr.modules import report
from alyr.seed import DEMO_TENANT_ID
from test_consent import owner_sql


def test_a_shops_share_of_the_spread_is_fixed_by_its_id_and_evenly_mixed():
    ids = [uuid4() for _ in range(2000)]
    shares = [report.spread_minutes(i, 30) for i in ids]
    assert all(0 <= s < 30 for s in shares)
    assert [report.spread_minutes(i, 30) for i in ids] == shares  # the same every time
    counts = [shares.count(m) for m in range(30)]
    assert min(counts) > 30 and max(counts) < 110  # about 67 each; none empty, none crowded
    assert report.spread_minutes(ids[0], 0) == 0


def queued_report_time(client, monkeypatch, spread: int):
    monkeypatch.setenv("ALYR_REPORT_SPREAD_MINUTES", str(spread))
    get_settings.cache_clear()
    owner_sql("delete from jobs where kind = 'weekly_report' and tenant_id = $1", DEMO_TENANT_ID)
    week = date(2026, 11, 1)

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await report.schedule(conn, week, "Asia/Qatar")

    client.portal.call(go)
    row = owner_sql("select run_at from jobs where kind = 'weekly_report' and tenant_id = $1",
                    DEMO_TENANT_ID)[0]
    return row["run_at"].astimezone(ZoneInfo("Asia/Qatar"))


def test_with_no_spread_every_shop_is_at_nine_exactly(client, monkeypatch):
    at = queued_report_time(client, monkeypatch, 0)
    assert (at.hour, at.minute, at.second) == (9, 0, 0) and at.date() == date(2026, 11, 8)


def test_with_a_spread_the_report_goes_between_nine_and_the_end_of_it(client, monkeypatch):
    at = queued_report_time(client, monkeypatch, 40)
    nine = at.replace(hour=9, minute=0, second=0, microsecond=0)
    assert timedelta(0) <= at - nine < timedelta(minutes=40)
    assert (at - nine) == timedelta(minutes=report.spread_minutes(DEMO_TENANT_ID, 40))
    assert isinstance(DEMO_TENANT_ID, UUID)


def test_background_work_never_holds_more_than_half_the_places():
    for places, expected in ((1, 1), (2, 1), (3, 1), (4, 2), (5, 2), (10, 5)):
        runner = JobRunner(None, concurrency=places)
        assert runner.background_places == expected
