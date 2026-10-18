"""The one message after an import (ALY-108, on top of the alerts of ALY-106): an import's stock
numbers queue none of the owner's own low-stock and sold-out alerts, and when it is applied the
managers are told once how many of its items are low or sold out: in their language, not at
night, only inside their 24-hour window (there is no template for it), and an item counted in it
is not told again that day. The helpers are in test_catalog_alerts.py and test_catalog_import.py."""

from datetime import datetime
from uuid import UUID

import pytest

from alyr.modules.items import alerts, import_alert
from alyr.seed import OWNER_PHONE, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    catalog_module_on,
    window_closed,
)
from test_catalog_alerts import QATAR, midday, open_window, sell, told  # noqa: F401
from test_catalog_import import apply_import, by_name, do_import, preview_of, table, xlsx_of
from test_consent import owner_sql
from test_items import on_shop

KEYS = ["name", "name_ar", "price", "stock"]


class ImportAlertAt:
    """An `ImportAlert` for the demo shop whose clock a test holds still."""

    def __init__(self, client, now: datetime):
        self.handler = import_alert.ImportAlert(
            client.app.state.db, client.app.state.outbound, lambda: now
        )

    async def check(self, conn, import_id):
        return await self.handler.check(conn, import_id)


def shelf(client):
    """Three counted items on sale with plenty of stock: nothing is low, nothing is said."""
    do_import(client, table(
        KEYS,
        ["Alert Dates", "تمر", 10, 20],
        ["Alert Figs", "تين", 12, 20],
        ["Alert Rice", "أرز", 9, 50],
    ))


def recount(client, **numbers):
    """An import that counts the named items (by name) at those numbers. Returns the answer."""
    shown = preview_of(client, xlsx_of(table(
        ["name", "stock"], *[[n.replace("_", " "), v] for n, v in numbers.items()]
    )), on_duplicate="update")
    done = apply_import(client, shown)
    assert done.status_code == 200, done.text
    return done.json()


def alert_jobs() -> int:
    return owner_sql("select count(*) from jobs where kind = 'catalog.stock_alert'")[0][0]


def summary_jobs() -> int:
    return owner_sql("select count(*) from jobs where kind = 'catalog.import_alert'")[0][0]


def stock_alerts_today() -> int:
    """The alerts recorded for this file's items (other tests leave their own rows)."""
    return owner_sql(
        "select count(*) from stock_alerts a join items i on i.id = a.item_id "
        "where i.name like 'Alert %'"
    )[0][0]


@pytest.fixture(autouse=True)
def tidy():
    yield
    owner_sql("delete from jobs where kind in ('catalog.stock_alert', 'catalog.import_alert')")


def test_an_import_that_leaves_items_low_or_sold_out_tells_the_manager_once(client):
    open_window()
    shelf(client)
    assert told(client) == []
    before = alert_jobs()
    recount(client, Alert_Dates=3, Alert_Figs=0, Alert_Rice=40)   # low, sold out, fine
    [message] = told(client)
    assert message["kind"] == "text"
    assert message["body"] == "After your import, 2 items are low or sold out."
    assert alert_jobs() == before          # none of the items queued an alert of its own


def test_one_item_says_item_and_an_arabic_manager_is_told_in_arabic(client):
    owner_sql("update contacts set lang = 'ar' where phone = $1", OWNER_PHONE)
    open_window()
    shelf(client)
    recount(client, Alert_Figs=1)
    [message] = told(client)
    assert message["body"] == "بعد الاستيراد، عدد الأصناف قليلة المخزون أو النافدة: 1."
    owner_sql("update contacts set lang = 'en' where phone = $1", OWNER_PHONE)
    recount(client, Alert_Rice=2)
    assert told(client)[-1]["body"] == "After your import, 1 item is low or sold out."


def test_the_items_it_counted_are_not_told_again_that_day(client):
    open_window()
    shelf(client)
    recount(client, Alert_Dates=6)             # 6 is above the shop's 5: nothing to say
    assert told(client) == []
    recount(client, Alert_Dates=5)
    assert len(told(client)) == 1
    dates = by_name(client, "Alert Dates")
    sell(client, dates, 1)                      # 4 left: this item has been said today
    assert len(told(client)) == 1
    assert stock_alerts_today() == 1


def test_nothing_is_said_when_nothing_is_low(client):
    open_window()
    shelf(client)
    recount(client, Alert_Dates=30, Alert_Figs=19)
    assert told(client) == []
    assert stock_alerts_today() == 0


def test_outside_the_managers_window_nothing_is_sent_and_nothing_is_recorded(client):
    window_closed(OWNER_PHONE)
    shelf(client)
    recount(client, Alert_Dates=3)
    assert told(client) == []                   # not even a refused message in the inbox
    assert stock_alerts_today() == 0            # so a later sale may still alert on its own
    sell(client, by_name(client, "Alert Dates"), 1)
    assert [m["payload"].get("template") for m in told(client)] == ["stock_low"]


def test_at_night_it_waits_for_the_morning_and_says_so_once(client, monkeypatch):
    open_window()
    shelf(client)
    night = datetime(2026, 10, 20, 23, 30, tzinfo=QATAR)
    monkeypatch.setattr(alerts, "utc_now", lambda: night)
    done = recount(client, Alert_Dates=3, Alert_Figs=0)
    assert told(client) == []
    [job] = owner_sql(
        "select run_at from jobs where kind = 'catalog.import_alert' and status = 'queued'"
    )
    assert job["run_at"].astimezone(QATAR) == datetime(2026, 10, 21, 7, 0, tzinfo=QATAR)
    morning = datetime(2026, 10, 21, 7, 30, tzinfo=QATAR)
    import_id = UUID(done["id"])
    assert on_shop(client, ImportAlertAt(client, morning).check, import_id) == 1
    assert [m["body"] for m in told(client)] == ["After your import, 2 items are low or sold out."]


def test_an_import_undone_before_the_morning_says_nothing(client, monkeypatch):
    open_window()
    shelf(client)
    night = datetime(2026, 10, 20, 23, 30, tzinfo=QATAR)
    monkeypatch.setattr(alerts, "utc_now", lambda: night)
    done = recount(client, Alert_Dates=3)
    assert client.post("/api/items/import/undo").status_code == 200
    morning = datetime(2026, 10, 21, 7, 30, tzinfo=QATAR)
    import_id = UUID(done["id"])
    assert on_shop(client, ImportAlertAt(client, morning).check, import_id) is None
    assert told(client) == []


def test_an_import_with_no_stock_numbers_queues_no_summary(client):
    open_window()
    before = summary_jobs()
    do_import(client, table(["name", "name_ar", "price"], ["Alert Plain", "عادي", 10]))
    assert summary_jobs() == before
    assert told(client) == []


def test_only_the_managers_are_told(client):
    open_window()
    open_window(STAFF_PHONE)
    shelf(client)
    recount(client, Alert_Dates=3)
    assert len(told(client)) == 1
    assert told(client, STAFF_PHONE) == []      # a counter staff member who is not a manager
