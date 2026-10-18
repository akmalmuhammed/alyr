"""The back office's usage view (ALY-109, D-039): per shop, items, photos, gigabytes stored and
uploads this month, the months before it for the trend, and the total against R2's free 10 GB
with its 80% alert. Read only: no prices and no billing (D-032; charging by usage waits for the
founder). Only ALYR staff reach it.
"""

from datetime import date
from uuid import uuid4

import pytest

from alyr.core.media import months_back
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID, OWNER_EMAIL
from catalog_wa import catalog_module_on  # noqa: F401  (the autouse fixture is used by name)
from photo_files import photo
from test_consent import owner_sql
from test_items import mk
from test_media import ADMIN, upload
from test_sign_in import other_shop_with_owner, sign_in

HISTORY = f"{ADMIN}/media/usage/history"


def this_month() -> date:
    found = owner_sql("select date_trunc('month', now() at time zone 'Asia/Qatar')::date as d")
    return found[0]["d"]


def meter(tenant, month, **figures):
    columns = {"uploads": 0, "duplicates": 0, "refused": 0, "photos": 0, "bytes_stored": 0,
               "peak_bytes_stored": 0, "active_items": 0, **figures}
    owner_sql(
        "insert into media_usage (tenant_id, month, uploads, duplicates, refused, photos, "
        "bytes_stored, peak_bytes_stored, active_items) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9) "
        "on conflict (tenant_id, month) do update set uploads = excluded.uploads, "
        "photos = excluded.photos, bytes_stored = excluded.bytes_stored, "
        "peak_bytes_stored = excluded.peak_bytes_stored, active_items = excluded.active_items",
        tenant, month, *columns.values(),
    )


@pytest.fixture
def two_shops(client_factory):
    other = other_shop_with_owner(f"owner-{uuid4().hex[:8]}@other.example")
    client = client_factory()
    return client, other


def test_it_lists_every_shop_newest_month_first_with_the_months_before_for_the_trend(two_shops):
    client, other = two_shops
    now = this_month()
    for n in range(3):
        mk(client, name=f"Item {n}", name_ar=f"صنف {n}")
    assert upload(client, photo(1200, 800, seed=1)).status_code == 201
    assert upload(client, photo(1200, 800, seed=2)).status_code == 201
    last, before = months_back(now, 1), months_back(now, 2)
    meter(DEMO_TENANT_ID, last, uploads=7, photos=5, bytes_stored=5_000_000,
          peak_bytes_stored=6_000_000, active_items=9)
    meter(other, last, uploads=4, photos=3, bytes_stored=2_000_000, peak_bytes_stored=2_000_000,
          active_items=2)
    meter(DEMO_TENANT_ID, before, uploads=2, photos=2, bytes_stored=1_000_000,
          peak_bytes_stored=1_000_000, active_items=4)

    body = client.get(f"{HISTORY}?months=3").json()
    months = body["months"]
    assert [m["month"] for m in months] == [d.strftime("%Y-%m") for d in (now, last, before)]
    assert [m["current"] for m in months] == [True, False, False]

    mine = {s["tenant_id"]: s for s in months[0]["shops"]}[str(DEMO_TENANT_ID)]
    assert mine["business"] == "Al Noor Electricals"
    # The demo shop's twelve items and the three added here.
    assert (mine["photos"], mine["uploads"], mine["active_items"]) == (2, 2, 15)
    assert mine["gb"] > 0 and mine["peak_gb"] >= mine["gb"]
    # A shop with nothing stored still has its row, with zeros.
    quiet = {s["tenant_id"]: s for s in months[0]["shops"]}[str(other)]
    assert (quiet["photos"], quiet["gb"], quiet["uploads"]) == (0, 0, 0)

    # The months before are what was recorded for them, for every shop.
    earlier = {s["tenant_id"]: s for s in months[1]["shops"]}
    mine_before = earlier[str(DEMO_TENANT_ID)]
    assert (mine_before["photos"], mine_before["gb"]) == (5, 0.005)
    assert earlier[str(other)]["uploads"] == 4 and earlier[str(other)]["active_items"] == 2

    # The totals are the sums over the shops.
    assert months[1]["totals"] == {
        "shops": len(months[1]["shops"]), "photos": 8, "gb": 0.007, "uploads": 11,
        "active_items": 11,
    }
    assert months[2]["totals"]["photos"] == 2 and months[2]["totals"]["uploads"] == 2
    assert months[0]["totals"]["photos"] == 2
    assert body["storage"] == "local"


def test_the_total_is_set_against_the_free_ten_gigabytes_with_the_eighty_percent_alert(
    client_factory, monkeypatch
):
    client = client_factory()
    upload(client, photo(1200, 800, seed=3))
    total = int(owner_sql("select media_total_bytes() as n")[0]["n"])
    assert total > 0
    alert = client.get(HISTORY).json()["alert"]
    assert alert["level"] == "ok" and alert["free_gb"] == 10.0 and alert["at_percent"] == 80
    assert alert["used_gb"] == round(total / 1e9, 6)
    # Sized so the photos are 90% of the free tier, then exactly all of it.
    monkeypatch.setenv("ALYR_MEDIA_FREE_BYTES", str(int(total / 0.9)))
    warn = client_factory().get(HISTORY).json()["alert"]
    assert warn["level"] == "warn" and 89 < warn["percent"] < 91
    monkeypatch.setenv("ALYR_MEDIA_FREE_BYTES", str(total))
    assert client_factory().get(HISTORY).json()["alert"]["level"] == "over"


def test_the_months_asked_for_are_bounded_and_nothing_can_be_changed_here(client):
    assert len(client.get(f"{HISTORY}?months=1").json()["months"]) == 1
    assert len(client.get(f"{HISTORY}?months=24").json()["months"]) == 24
    assert len(client.get(HISTORY).json()["months"]) == 6  # the default
    assert client.get(f"{HISTORY}?months=0").status_code == 422
    assert client.get(f"{HISTORY}?months=25").status_code == 422
    for write in (client.post, client.put, client.delete, client.patch):
        assert write(HISTORY).status_code == 405
    # Nothing in it prices anything: it is meters, never money.
    month = client.get(HISTORY).json()["months"][0]
    assert set(month) == {"month", "current", "shops", "totals"}
    assert set(month["totals"]) == {"shops", "photos", "gb", "uploads", "active_items"}
    assert all(set(shop) == {
        "tenant_id", "business", "photos", "gb", "bytes", "peak_gb", "uploads", "duplicates",
        "refused", "active_items", "photos_limit",
    } for shop in month["shops"])


def test_the_usage_data_refuses_anyone_who_is_not_alyr_staff(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    # Signed out.
    assert client_factory().get(HISTORY).status_code == 401
    # A shop's owner and a shop's agent: staff of a business, not of ALYR.
    owner = client_factory()
    sign_in(owner, OWNER_EMAIL)
    assert owner.get(HISTORY).status_code == 403
    assert owner.get(f"{ADMIN}/media/usage").status_code == 403
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    assert agent.get(HISTORY).status_code == 403
