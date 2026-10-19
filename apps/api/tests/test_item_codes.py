"""Item codes (ALY-136, D-039): every item has a short number of its own, set by the database.

101, 102, 103... per shop in the order its items were made; never changed, never used again,
the same for two items made at the same moment (proved with the second one waiting on the
first's row), none for an example until the owner keeps it. The code is not the SKU. The
order page, the list, the export and the search carry it; a file never changes it.
"""

import asyncio
import io
import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import asyncpg
import pytest

from alyr.modules.items import service as items_service
from alyr.modules.items import xlsx
from concurrency import LockWatch, hold_open, warm
from conftest import OWNER_DSN
from test_catalog_import import by_name, do_import, head, new_shop, table
from test_consent import owner_sql
from test_items import STORE, fresh, mk
from test_onboarding import new_business


def codes_of(client) -> list[int]:
    found = client.get("/api/items", params={"limit": 500, "archived": True}).json()["items"]
    return sorted(i["code"] for i in found if i["code"] is not None)


# ── the numbers ───────────────────────────────────────────────────────────────────────


def test_the_demo_shop_has_codes_from_101_in_the_order_its_items_were_made(client):
    listed = client.get("/api/items", params={"limit": 500}).json()["items"]
    by_made = sorted(listed, key=lambda i: i["code"])
    assert [i["code"] for i in by_made] == list(range(101, 101 + len(listed)))
    assert by_made[0]["name"] == "Cable 1.5 mm, 100 m roll"  # the seed's first item


def test_a_new_item_gets_the_next_number_and_it_is_not_the_sku(client):
    new_shop(client)
    first = mk(client, name="Oud Royal", name_ar="عود", sku="OUD-12")
    second = mk(client, name="Musk", name_ar="مسك")
    assert (first["code"], second["code"]) == (101, 102)
    assert first["sku"] == "OUD-12" and second["sku"] == ""  # the SKU stays the owner's own
    # Every way an item is read carries it.
    assert fresh(client, first)["code"] == 101


def test_the_order_page_rows_carry_the_code(client):
    item = mk(client, name="Oud Royal", name_ar="عود", sku="OUD-12")
    row = next(i for i in client.get(STORE).json()["items"] if i["id"] == item["id"])
    assert row["code"] == item["code"]
    one = client.get(f"{STORE}/items/{item['id']}").json()["item"]
    assert one["code"] == item["code"]


def test_a_draft_keeps_its_number_and_an_archived_items_number_is_not_given_again(client):
    new_shop(client)
    draft = mk(client, name="Draft", name_ar="مسودة", status="draft")
    gone = mk(client, name="Gone", name_ar="ذهب")
    assert (draft["code"], gone["code"]) == (101, 102)
    assert client.delete(f"/api/items/{gone['id']}").status_code == 200
    after = mk(client, name="After", name_ar="بعد")
    assert after["code"] == 103


def test_a_number_is_never_used_again_even_when_the_item_is_removed_for_good(client):
    new_shop(client)
    top = mk(client, name="Top", name_ar="أعلى")
    owner_sql("delete from items where id = $1", UUID(top["id"]))
    assert mk(client, name="Next", name_ar="تالي")["code"] == top["code"] + 1


def test_a_code_cannot_be_changed_by_the_api_or_by_anyone(client):
    new_shop(client)
    item = mk(client, name="Fixed", name_ar="ثابت")
    client.put(f"/api/items/{item['id']}", json={"name": "Fixed 2", "code": 999})
    assert fresh(client, item)["code"] == item["code"]
    with pytest.raises(asyncpg.CheckViolationError):
        owner_sql("update items set code = 999 where id = $1", UUID(item["id"]))
    with pytest.raises(asyncpg.CheckViolationError):
        owner_sql("update items set code = null where id = $1", UUID(item["id"]))


def test_two_shops_number_their_items_separately(client):
    here = mk(client, name="Here", name_ar="هنا")  # the demo shop
    assert here["code"] > 101
    new_shop(client)
    there = mk(client, name="There", name_ar="هناك")
    assert there["code"] == 101
    assert codes_of(client) == [101]


def test_an_example_has_no_code_until_the_owner_keeps_it(client):
    new_business(client, kind="shop")
    samples = client.get("/api/items", params={"filter": "sample", "limit": 50}).json()["items"]
    assert samples and all(i["code"] is None and i["sample"] for i in samples)
    kept = client.post(f"/api/items/{samples[0]['id']}/adopt")
    assert kept.status_code == 200, kept.text
    assert fresh(client, samples[0])["code"] == 101
    assert mk(client, name="Mine", name_ar="لي")["code"] == 102


# ── two at the same moment ────────────────────────────────────────────────────────────


def test_items_made_at_the_same_moment_never_share_a_number(client, monkeypatch):
    """Twelve items made at once: twelve different numbers in a row, and at least one create had
    to wait for another's counter row (the watcher saw it), so the test really was a race."""
    new_shop(client)
    warm(client)
    hold_open(monkeypatch, items_service, "_sync_variants", 0.12)
    start = threading.Barrier(12)

    def make(n):
        start.wait()
        response = client.post("/api/items", json={
            "name": f"Racer {n}", "name_ar": f"متسابق {n}", "price": 100, "status": "live",
        })
        assert response.status_code == 200, response.text
        return response.json()["item"]["code"]

    with LockWatch("insert into items") as watch, ThreadPoolExecutor(12) as pool:
        made = list(pool.map(make, range(12)))
    assert sorted(made) == list(range(101, 113))
    assert watch.blocked >= 1, str(watch)
    assert codes_of(client) == list(range(101, 113))


# ── reading them ──────────────────────────────────────────────────────────────────────


def test_the_list_finds_an_item_by_its_code(client):
    item = mk(client, name="Saffron", name_ar="زعفران")
    found = client.get("/api/items", params={"q": str(item["code"])}).json()["items"]
    assert [i["id"] for i in found] == [item["id"]]


def test_the_order_page_finds_an_item_by_its_code_too(client):
    item = mk(client, name="Saffron", name_ar="زعفران")
    page = client.get(STORE, params={"q": str(item["code"])}).json()
    assert [i["id"] for i in page["items"]] == [item["id"]]


def test_the_csv_export_carries_the_code_for_reading_and_an_import_never_changes_it(client):
    new_shop(client)
    item = mk(client, name="Cardamom", name_ar="هيل", price=500)
    exported = client.get("/api/items/export", params={"format": "csv"}).content.decode("utf-8-sig")
    header = exported.splitlines()[0].split(",")
    assert "Item code (ALYR)" in header
    # The file edited (a new price, a wrong code) and uploaded again.
    done = do_import(client, table(
        ["id", "code", "price"], [item["id"], 999, 7],
    ))
    assert done
    again = fresh(client, item)
    assert again["code"] == item["code"] and again["price"] == 700
    assert by_name(client, "Cardamom")["code"] == item["code"]
    assert head("code") == ["Item code (ALYR)"]


def test_the_xlsx_export_has_the_column_too(client):
    new_shop(client)
    item = mk(client, name="Cumin", name_ar="كمون")
    data = client.get("/api/items/export", params={"format": "xlsx"}).content
    rows = xlsx.read(io.BytesIO(data).getvalue()).rows
    column = rows[0].index("Item code (ALYR)")
    assert {int(r[column]) for r in rows[1:]} == {item["code"]}


def test_how_customers_order_has_two_values_and_a_shop_answers_itself_by_default(client):
    # The demo shop's number is the simulator's line: it is on "chat" explicitly.
    assert client.get("/api/items/settings").json()["whatsapp_mode"] == "chat"
    assert client.get(STORE).json()["settings"]["whatsapp_mode"] == "chat"
    # Any other shop, with or without a settings row yet, keeps its own number.
    new_shop(client)
    assert client.get("/api/items/settings").json()["whatsapp_mode"] == "link"
    resaved = client.put("/api/items/settings", json={"low_stock_at": 4})
    assert resaved.json()["whatsapp_mode"] == "link"
    saved = client.put("/api/items/settings", json={"whatsapp_mode": "chat"})
    assert saved.status_code == 200 and saved.json()["whatsapp_mode"] == "chat"
    # Another save that does not mention it leaves a stored value alone.
    kept = client.put("/api/items/settings", json={"low_stock_at": 6})
    assert kept.json()["whatsapp_mode"] == "chat"
    assert client.put("/api/items/settings", json={"whatsapp_mode": "both"}).status_code == 422
    assert client.put("/api/items/settings", json={"whatsapp_mode": "link"}).status_code == 200


def test_a_shop_made_in_onboarding_starts_on_link(client):
    new_business(client, kind="shop")
    assert client.get("/api/items/settings").json()["whatsapp_mode"] == "link"


def test_the_new_tables_are_isolated_per_shop(client):
    async def look():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetch(
                "select relname, relrowsecurity, relforcerowsecurity from pg_class "
                "where relname in ('item_code_counters', 'chat_carts')"
            )
        finally:
            await conn.close()

    rows = asyncio.run(look())
    assert {r["relname"] for r in rows} == {"item_code_counters", "chat_carts"}
    assert all(r["relrowsecurity"] and r["relforcerowsecurity"] for r in rows)
