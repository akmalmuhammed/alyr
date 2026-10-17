"""What the Catalog's workspace screens stand on (ALY-104, D-039): photos linked to items
(ALY-103's follow-up), drafts made from photos, the list with its search and filters, bulk
actions with a preview and one undo, who may change what, and the Catalog module that stays
off for every shop until go-live. Plan scenarios 14 (Arabic search), 16 (undo), 18 (two
people at once), 19 (a count that differs), 23 to 26 (photos) and 29 (one shop cannot see
another's) are covered here from the screens' side. Everything runs on local disk."""

import re
from uuid import UUID

import pytest

from alyr import catalog, presets
from alyr.modules.items import bulk, listing, text
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID, OWNER_EMAIL
from photo_files import photo
from test_consent import owner_sql
from test_items import fresh, mk, on_hand, on_shop
from test_media import Switchable, drain, make_due, upload
from test_sign_in import other_shop_with_owner, sign_in

ARABIC = re.compile(r"[؀-ۿ]")


@pytest.fixture(autouse=True)
def nothing_left_over():
    """The test database is shared by the whole run: start and finish with no photos and no
    bulk change, whatever an earlier test did."""

    def clear():
        for table in ("media_ops", "media_links", "media_assets", "media_usage",
                      "item_bulk_changes"):
            owner_sql(f"delete from {table}")
        owner_sql("delete from jobs where kind = 'media.sync'")

    clear()
    yield
    clear()


def stored_photo(client, seed: int = 1) -> str:
    answer = upload(client, photo(640, 480, seed))
    assert answer.status_code in (200, 201), answer.text
    return answer.json()["photo"]["id"]


def put_photo(client, item: dict, asset: str, **more):
    return client.post(f"/api/items/{item['id']}/photos", json={"asset_id": asset, **more})


def listed(client, **query) -> dict:
    answer = client.get("/api/items", params=query)
    assert answer.status_code == 200, answer.text
    return answer.json()


def names(client, **query) -> list[str]:
    return [i["name"] for i in listed(client, **query)["items"]]


def activity(client, item: dict) -> list[dict]:
    return client.get(f"/api/items/{item['id']}/activity").json()["activity"]


# ── photos on items ──────────────────────────────────────


def test_an_item_shows_its_photos_in_order_with_three_sizes_and_a_state(client):
    item = mk(client, name="Shawarma")
    assert (item["photos"], item["cover"]["state"], item["photo_id"]) == ([], "missing", None)

    first, second = stored_photo(client, 1), stored_photo(client, 2)
    assert put_photo(client, item, first).status_code == 200
    answer = put_photo(client, item, second).json()
    assert [p["id"] for p in answer["photos"]] == [first, second]
    assert answer["cover"]["id"] == first

    shown = fresh(client, item)
    assert [p["position"] for p in shown["photos"]] == [0, 1]
    cover = shown["cover"]
    assert cover["state"] == "ready" and set(cover["urls"]) == {"thumb", "medium", "large"}
    assert cover["urls"]["thumb"].startswith("/api/media/file/shops/")
    assert shown["photo_id"] == first and cover["srcset"]
    # The files really are served, to anyone with the address (they are public by design).
    assert client.get(cover["urls"]["thumb"]).headers["content-type"] == "image/webp"
    # The list carries them too, so the screen needs no second request.
    row = next(i for i in listed(client)["items"] if i["id"] == item["id"])
    assert row["cover"]["state"] == "ready" and len(row["photos"]) == 2


def test_attaching_twice_changes_nothing_and_removing_keeps_the_photo_in_the_library(client):
    item = mk(client)
    asset = stored_photo(client)
    assert len(put_photo(client, item, asset).json()["photos"]) == 1
    assert len(put_photo(client, item, asset).json()["photos"]) == 1
    removed = client.delete(f"/api/items/{item['id']}/photos/{asset}").json()
    assert (removed["photos"], removed["cover"]["state"]) == ([], "missing")
    library = client.get("/api/media/photos").json()
    assert [p["id"] for p in library["photos"]] == [asset] and library["photos"][0]["links"] == 0
    # It can go back on, or onto another item.
    other = mk(client, name="Falafel")
    assert put_photo(client, other, asset).status_code == 200
    # Removing one that is not there is quiet.
    assert client.delete(f"/api/items/{item['id']}/photos/{asset}").json()["photos"] == []


def test_an_item_holds_eight_photos_and_the_ninth_is_refused_in_both_languages(client):
    item = mk(client)
    for n in range(1, 9):
        assert put_photo(client, item, stored_photo(client, n)).status_code == 200
    ninth = put_photo(client, item, stored_photo(client, 9))
    assert ninth.status_code == 409
    body = ninth.json()
    assert body["code"] == "photo_owner_full" and body["limit"] == 8
    assert "8 photos" in body["detail"] and ARABIC.search(body["message_ar"])
    assert len(fresh(client, item)["photos"]) == 8  # nothing was lost


def test_photos_can_be_reordered_and_any_photo_can_become_the_cover(client):
    item = mk(client)
    a, b, c = (stored_photo(client, n) for n in (1, 2, 3))
    for asset in (a, b, c):
        put_photo(client, item, asset)

    moved = client.put(f"/api/items/{item['id']}/photos", json={"order": [c, a, b]}).json()
    assert [p["id"] for p in moved["photos"]] == [c, a, b] and moved["cover"]["id"] == c
    covered = client.post(f"/api/items/{item['id']}/photos/{b}/cover").json()
    assert [p["id"] for p in covered["photos"]] == [b, c, a]

    # A screen that was out of date (a photo was added meanwhile) is told so, and loses none.
    stale = client.put(f"/api/items/{item['id']}/photos", json={"order": [a, b]})
    assert stale.status_code == 409 and stale.json()["code"] == "photos_changed"
    assert ARABIC.search(stale.json()["message_ar"])
    doubled = client.put(f"/api/items/{item['id']}/photos", json={"order": [a, a, b]})
    assert doubled.status_code == 409
    assert [p["id"] for p in fresh(client, item)["photos"]] == [b, c, a]

    # Removing the cover promotes the next photo, with no gap in the order.
    left = client.delete(f"/api/items/{item['id']}/photos/{b}").json()
    assert [p["id"] for p in left["photos"]] == [c, a]
    assert [p["position"] for p in left["photos"]] == [0, 1]
    # A photo that is not on the item cannot be made its cover.
    assert client.post(f"/api/items/{item['id']}/photos/{b}/cover").status_code == 404


def test_a_variant_can_have_one_photo_of_its_own(client):
    item = mk(client, name="Abaya", variants=[{"name": "Black"}, {"name": "Navy"}])
    black, navy = (v["id"] for v in item["variants"])
    one, two = stored_photo(client, 1), stored_photo(client, 2)
    assert put_photo(client, item, one, variant_id=black).status_code == 200
    shown = fresh(client, item)
    by_name = {v["name"]: v for v in shown["variants"]}
    assert by_name["Black"]["photo"]["state"] == "ready" and by_name["Black"]["photo_id"] == one
    assert by_name["Navy"]["photo"]["state"] == "missing" and shown["photos"] == []
    # A new photo for the same variant replaces the old one.
    put_photo(client, item, two, variant_id=black)
    assert {v["name"]: v["photo_id"] for v in fresh(client, item)["variants"]}["Black"] == two
    assert client.get(f"/api/items/{item['id']}/photos", params={"variant_id": black}).json()[
        "cover"]["id"] == two
    # A variant of some other item is not this item's.
    stranger = mk(client, name="Scarf", variants=[{"name": "Red"}])
    foreign = stranger["variants"][0]["id"]
    assert put_photo(client, item, one, variant_id=foreign).status_code == 404
    gone = client.delete(f"/api/items/{item['id']}/photos/{two}", params={"variant_id": black})
    assert gone.json()["photos"] == [] and gone.json()["cover"]["state"] == "missing"
    assert navy  # untouched


def test_a_photo_still_being_stored_is_pending_and_the_item_works_meanwhile(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "3600")
    client = client_factory()
    store = Switchable(client.app.state.media.store.root)
    client.app.state.media.store = store
    item = mk(client, name="Shawarma")

    store.down = True
    waiting = upload(client, photo(800, 600, 4))
    assert waiting.status_code == 202
    asset = waiting.json()["photo"]["id"]
    put_photo(client, item, asset)
    shown = fresh(client, item)
    # The screen draws a placeholder: no address to a file that is not there yet.
    assert shown["photos"][0]["state"] == "pending" and shown["photos"][0]["urls"] is None
    assert shown["cover"]["state"] == "pending" and shown["cover"]["urls"] is None
    assert client.put(f"/api/items/{item['id']}", json={"price": 1500}).status_code == 200
    off = client.post(f"/api/items/{item['id']}/switch", json={"available": False})
    assert off.status_code == 200

    store.down = False
    make_due()
    drain(client)
    assert fresh(client, item)["cover"]["state"] == "ready"


def test_a_photo_is_always_in_a_state_a_screen_can_draw(client):
    item = mk(client)
    put_photo(client, item, stored_photo(client))
    shown = fresh(client, item)
    states = {p["state"] for p in shown["photos"]} | {shown["cover"]["state"]}
    assert states <= {"ready", "pending", "failed", "missing"}


# ── the item limit and drafts made from photos ───────────


def test_a_shop_at_its_item_limit_is_told_plainly_and_loses_nothing(client, monkeypatch):
    have = listed(client)["counts"]["all"]
    monkeypatch.setattr(client.app.state.media.settings, "catalog_max_items", have)
    refused = client.post("/api/items", json={"name": "One more", "price": 100})
    assert refused.status_code == 409
    body = refused.json()
    assert body["code"] == "item_limit_reached" and "Nothing has been deleted" in body["detail"]
    assert ARABIC.search(body["message_ar"])
    assert listed(client)["counts"]["all"] == have


def test_drafts_are_made_from_photos_once_each(client):
    assets = [stored_photo(client, n) for n in (1, 2, 3)]
    made = client.post("/api/items/drafts", json={"photo_ids": assets}).json()
    assert [d["cover"]["id"] for d in made["created"]] == assets
    assert made["skipped"] == [] and made["stopped"] is None
    draft = made["created"][0]
    assert (draft["status"], draft["name"], draft["price"], draft["photos"][0]["id"]) == (
        "draft", "", 0, assets[0])
    assert draft["availability"]["orderable"] is False

    # Sending it again makes no second draft.
    again = client.post("/api/items/drafts", json={"photo_ids": [assets[0], assets[1]]}).json()
    assert again["created"] == []
    assert [s["reason"] for s in again["skipped"]] == ["already_on_item"] * 2
    assert again["skipped"][0]["item_id"] == draft["id"]
    # A photo that is not the shop's is left out without stopping the rest.
    mixed = client.post("/api/items/drafts", json={
        "photo_ids": ["00000000-0000-4000-8000-000000000000", stored_photo(client, 4)]
    }).json()
    assert [s["reason"] for s in mixed["skipped"]] == ["not_found"] and len(mixed["created"]) == 1
    assert listed(client, filter="draft")["counts"]["draft"] == 4

    # The activity record says who made it.
    assert activity(client, draft)[0]["action"] == "created"


def test_a_draft_goes_live_only_with_a_name_a_price_and_the_arabic_name(client):
    draft = client.post("/api/items/drafts", json={"photo_ids": [stored_photo(client)]}).json()[
        "created"][0]
    live = client.post(f"/api/items/{draft['id']}/status", json={"status": "live"})
    assert live.status_code == 422 and live.json()["detail"]["code"] == "name_needed"
    named = client.put(f"/api/items/{draft['id']}", json={"name": "Falafel plate"})
    assert named.status_code == 200
    live = client.post(f"/api/items/{draft['id']}/status", json={"status": "live"})
    assert live.json()["detail"]["code"] == "bad_price"
    client.put(f"/api/items/{draft['id']}", json={"price": 900})
    live = client.post(f"/api/items/{draft['id']}/status", json={"status": "live"})
    assert live.json()["detail"]["code"] == "arabic_needed"
    saved = client.put(
        f"/api/items/{draft['id']}", json={"name_ar": "طبق فلافل", "status": "live"}
    )
    assert saved.status_code == 200 and saved.json()["item"]["availability"]["orderable"]
    # Its first price is remembered once the price exists, and not before.
    history = client.get(f"/api/items/{draft['id']}/price-history").json()["history"]
    assert [(h["price"], h["reason"]) for h in history] == [(900, "First price")]


def test_the_database_will_not_hold_a_priced_at_nothing_item_that_is_for_sale(client):
    draft = client.post("/api/items/drafts", json={"photo_ids": [stored_photo(client)]}).json()[
        "created"][0]
    with pytest.raises(Exception, match="items_price_set"):
        owner_sql("update items set status = 'live' where id = $1", UUID(draft["id"]))


def test_drafts_never_reach_the_order_page(client):
    client.post("/api/items/drafts", json={"photo_ids": [stored_photo(client)]})
    page = client.get("/api/store/al-noor").json()
    assert all(p["name"] for p in page["products"])


def test_the_item_limit_ends_a_batch_of_drafts_and_keeps_what_was_made(client, monkeypatch):
    assets = [stored_photo(client, n) for n in (1, 2, 3)]
    have = listed(client)["counts"]["all"]
    monkeypatch.setattr(client.app.state.media.settings, "catalog_max_items", have + 1)
    made = client.post("/api/items/drafts", json={"photo_ids": assets}).json()
    assert len(made["created"]) == 1
    assert made["stopped"]["code"] == "item_limit_reached"
    assert ARABIC.search(made["stopped"]["message_ar"])
    assert listed(client)["counts"]["all"] == have + 1


# ── the list: search, filters, counts, pages ─────────────


def test_scenario_14_arabic_spellings_find_the_item(client):
    mk(client, name="Chicken shawarma", name_ar="شاورما دجاج", tags=["halal"])
    mk(client, name="Chicken rice", name_ar="أرز بالدجاج")
    mk(client, name="Arabic coffee", name_ar="قهوة عربية", category="Drinks")
    mk(client, name="Knafeh", name_ar="كنافة")
    mk(client, name="Mandarin juice", name_ar="عصير يوسفي ٦٠٠ مل")
    # Each pair is one word written two ways: the round ta and ha, the alef with and without
    # hamza, alef maqsura and ya, marks above the letters, Eastern and Western digits.
    found = {
        "قهوه": "Arabic coffee", "عربيه": "Arabic coffee", "قهوة": "Arabic coffee",
        "كنافه": "Knafeh", "ارز": "Chicken rice", "إرز": "Chicken rice",
        "أرز": "Chicken rice", "يوسفى": "Mandarin juice", "600": "Mandarin juice",
        "٦٠٠": "Mandarin juice", "شَاوَرْما": "Chicken shawarma", "شاور": "Chicken shawarma",
        "دجاج شاورما": "Chicken shawarma", "SHAWARMA": "Chicken shawarma",
        "halal": "Chicken shawarma", "drinks": "Arabic coffee", "مل عصير": "Mandarin juice",
    }
    for query, name in found.items():
        assert name in names(client, q=query), query
    assert names(client, q="ارز") == ["Chicken rice"]
    assert names(client, q="كنافه") == ["Knafeh"]
    assert names(client, q="pizza") == [] and names(client, q="دجاج وردة") == []
    # Both chicken dishes answer the word they share.
    assert sorted(names(client, q="دجاج")) == ["Chicken rice", "Chicken shawarma"]


def test_the_search_folds_what_people_mix_up():
    assert text.fold("أَحْمَد") == text.fold("احمد")
    assert text.fold("مدرسة") == text.fold("مدرسه") and text.fold("على") == text.fold("علي")
    assert text.fold("٣٠٠ ml") == "300 ml" and text.fold("ڪتاب".replace("ڪ", "ک")) == "كتاب"
    assert text.search_words("  شاورما ،  دجاج ") == ["شاورما", "دجاج"]
    assert text.matches([], "anything") and not text.matches(["x"], "")


def test_the_list_has_filters_with_counts_and_pages(client):
    base = listed(client)["counts"]["all"]
    mk(client, name="Hot", stock_rule="switch")
    sold = mk(client, name="Sold out thing")
    client.post(f"/api/items/{sold['id']}/switch", json={"available": False})
    few = mk(client, name="Few left", stock_rule="count", opening_stock=3)
    mk(client, name="Plenty", stock_rule="count", opening_stock=40)
    empty = mk(client, name="None left", stock_rule="count", opening_stock=2)
    client.post(f"/api/items/{empty['id']}/count", json={"counted": 0, "reason": "all gone"})
    client.post("/api/items/drafts", json={"photo_ids": [stored_photo(client)]})
    old = mk(client, name="Old")
    client.post(f"/api/items/{old['id']}/status", json={"status": "archived"})

    shown = listed(client)
    assert shown["counts"] == {
        "all": base + 6, "draft": 1, "sold_out": 2, "low_stock": 1, "stocked": 3,
        "archived": 1,
    }
    assert shown["low_stock_at"] == 5 and shown["total"] == base + 6
    assert "Old" not in names(client)
    assert names(client, filter="sold_out") == ["None left", "Sold out thing"]
    assert names(client, filter="low_stock") == ["Few left"]
    assert names(client, filter="stocked") == ["Few left", "None left", "Plenty"]
    assert names(client, filter="archived") == ["Old"]
    assert [i["status"] for i in listed(client, filter="draft")["items"]] == ["draft"]
    assert few["id"] in [i["id"] for i in listed(client, filter="low_stock")["items"]]

    # Low stock is the shop's own number.
    saved = client.put("/api/items/settings", json={"low_stock_at": 50})
    assert saved.json()["low_stock_at"] == 50
    assert sorted(names(client, filter="low_stock")) == ["Few left", "Plenty"]

    page = listed(client, limit=4, offset=2)
    assert len(page["items"]) == 4 and page["total"] == base + 6
    assert page["items"] == listed(client)["items"][2:6]
    assert listed(client, category="Drinks")["items"] == []


def test_two_people_counting_the_same_item_both_count(client):
    item = mk(client, name="Zaatar", stock_rule="count", opening_stock=10)
    vid = item["variants"][0]["id"]
    client.post(f"/api/items/{item['id']}/stock",
                json={"kind": "received", "quantity": 5, "variant_id": vid})
    client.post(f"/api/items/{item['id']}/stock",
                json={"kind": "wasted", "quantity": 2, "reason": "dropped", "variant_id": vid})
    assert on_hand(client, item) == 13


def test_the_stock_tab_reads_the_log_across_every_item_with_who_and_why(client):
    a = mk(client, name="Coffee beans", stock_rule="count", opening_stock=6)
    b = mk(client, name="Tea", stock_rule="count", opening_stock=6)
    sign_in(client, AGENT_EMAIL)  # counting is the counter's job, not only the owner's
    received = client.post(f"/api/items/{a['id']}/stock",
                           json={"kind": "received", "quantity": 4, "reason": "Delivery"})
    assert received.status_code == 200
    counted = client.post(f"/api/items/{b['id']}/count", json={"counted": 7, "reason": "Miscount"})
    assert counted.json()["difference"] == 1
    # Counting differently without saying why is refused, and the number stays.
    refused = client.post(f"/api/items/{b['id']}/count", json={"counted": 1})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "reason_needed"
    log = client.get("/api/items/stock-log", params={"limit": 10}).json()["log"]
    assert [(r["item"], r["kind"]) for r in log[:2]] == [
        ("Tea", "counted"), ("Coffee beans", "received")]
    assert log[0]["actor"]["name"] == "Yusuf Rahman" and log[0]["reason"] == "Miscount"
    assert (log[0]["delta"], log[0]["balance_after"]) == (1, 7)
    assert log[1]["item_ar"] and log[1]["variant_id"]
    assert on_hand(client, a) == 10 and on_hand(client, b) == 7


# ── who may do what ──────────────────────────────────────


def test_an_agent_marks_availability_and_stock_but_cannot_edit_unless_allowed(client):
    item = mk(client, name="Shawarma", stock_rule="count", opening_stock=5)
    sign_in(client, AGENT_EMAIL)
    access = listed(client)["access"]
    assert access == {"role": "agent", "can_manage": False, "can_edit": False, "can_stock": True}

    flipped = client.post(f"/api/items/{item['id']}/switch", json={"available": False})
    assert flipped.status_code == 200
    assert client.post(f"/api/items/{item['id']}/stock",
                       json={"kind": "received", "quantity": 2}).status_code == 200
    assert client.post(f"/api/items/{item['id']}/count",
                       json={"counted": 7}).status_code == 200
    # Everything that edits is refused, and the API is what refuses it.
    assert client.post("/api/items", json={"name": "New", "price": 100}).status_code == 403
    assert client.put(f"/api/items/{item['id']}", json={"price": 100}).status_code == 403
    assert client.delete(f"/api/items/{item['id']}").status_code == 403
    hidden = client.post(f"/api/items/{item['id']}/status", json={"status": "hidden"})
    assert hidden.status_code == 403
    drafts = client.post("/api/items/drafts", json={"photo_ids": [str(DEMO_TENANT_ID)]})
    assert drafts.status_code == 403
    assert client.put("/api/items/settings", json={"low_stock_at": 9}).status_code == 403
    assert client.put("/api/items/categories", json=[{"name": "A"}]).status_code == 403
    assert upload(client, photo(300, 300, 5)).status_code == 403
    assert fresh(client, item)["price"] == 1200


def test_the_owner_can_let_agents_edit_items_and_photos(client):
    item = mk(client, name="Shawarma")
    assert client.put("/api/items/settings", json={"agents_edit_items": True}).json()[
        "agents_edit_items"] is True
    sign_in(client, AGENT_EMAIL)
    assert listed(client)["access"]["can_edit"] is True
    made = client.post("/api/items", json={"name": "Lemon mint", "price": 900})
    assert made.status_code == 200
    asset = stored_photo(client, 7)
    assert put_photo(client, made.json()["item"], asset).status_code == 200
    assert client.put(f"/api/items/{item['id']}", json={"price": 1300}).status_code == 200
    # The owner's own business stays the owner's.
    assert client.put("/api/items/settings", json={"agents_edit_items": False}).status_code == 403
    assert client.put("/api/items/categories", json=[{"name": "A"}]).status_code == 403
    assert client.get("/api/media/usage").status_code == 403
    # And it is on the record who did it.
    who = {a["actor"]["name"] for a in activity(client, made.json()["item"])}
    assert who == {"Yusuf Rahman"}


# ── bulk actions: preview, apply, one undo ───────────────


def bulk_body(action, items, **params):
    return {"action": action, "item_ids": [i["id"] for i in items], **params}


def preview(client, action, items, **params) -> dict:
    answer = client.post("/api/items/bulk/preview", json=bulk_body(action, items, **params))
    assert answer.status_code == 200, answer.text
    return answer.json()


def apply(client, action, items, plan, **params):
    return client.post("/api/items/bulk/apply", json={
        **bulk_body(action, items, **params), "preview": plan["hash"]})


def test_scenario_16_a_price_change_is_previewed_applied_and_undone(client):
    a = mk(client, name="A", price=1250)
    b = mk(client, name="B", price=999, sale_price=800)
    c = mk(client, name="C", price=2000)
    draft = client.post("/api/items/drafts", json={"photo_ids": [stored_photo(client)]}).json()[
        "created"][0]
    chosen = [a, b, c, draft]

    plan = preview(client, "price_percent", chosen, percent=10)
    assert [(ch["name"], ch["after"]["price"]) for ch in plan["changes"]] == [
        ("A", 1375), ("B", 1099), ("C", 2200)]
    assert plan["changes"][0]["before_text"] == "QAR 12.50"
    assert plan["changes"][0]["after_text"] == "QAR 13.75"
    assert plan["changes"][1]["after"]["sale_price"] == 880  # the sale keeps its distance
    assert [(s["id"], s["code"]) for s in plan["skipped"]] == [(draft["id"], "no_price")]
    assert plan["skipped"][0]["message"] and ARABIC.search(plan["skipped"][0]["message_ar"])
    # Looking changed nothing.
    assert fresh(client, a)["price"] == 1250 and client.get("/api/items/bulk/last").json() == {
        "last": None}

    done = apply(client, "price_percent", chosen, plan, percent=10).json()
    assert done["changed"] == 3 and len(done["skipped"]) == 1
    assert [fresh(client, i)["price"] for i in (a, b, c)] == [1375, 1099, 2200]
    assert fresh(client, b)["sale_price"] == 880
    # Every item's own record says what, and by whom; the price history says why.
    updated = next(r for r in activity(client, a) if r["action"] == "updated")
    assert updated["detail"]["price_to"] == "QAR 13.75" and updated["actor"]["name"]
    history = client.get(f"/api/items/{a['id']}/price-history").json()["history"]
    assert history[0]["reason"] == "Bulk change +10%"
    last = client.get("/api/items/bulk/last").json()["last"]
    assert (last["action"], last["changed"]) == ("price_percent", 3)
    assert last["params"] == {"percent": 10}

    undone = client.post("/api/items/bulk/undo").json()
    assert (undone["restored"], undone["left"]) == (3, [])
    assert [fresh(client, i)["price"] for i in (a, b, c)] == [1250, 999, 2000]
    assert fresh(client, b)["sale_price"] == 800
    # One undo, once.
    assert client.get("/api/items/bulk/last").json() == {"last": None}
    again = client.post("/api/items/bulk/undo")
    assert again.status_code == 404 and again.json()["detail"]["code"] == "nothing_to_undo"


def test_an_apply_must_carry_the_preview_it_saw(client):
    a, b = mk(client, name="A", price=1000), mk(client, name="B", price=2000)
    plan = preview(client, "price_percent", [a, b], percent=-10)
    # Someone changes B after the preview: the owner is shown the new result first.
    client.put(f"/api/items/{b['id']}", json={"price": 2500})
    stale = apply(client, "price_percent", [a, b], plan, percent=-10)
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "changed_since_preview"
    assert ARABIC.search(stale.json()["detail"]["message_ar"])
    assert [fresh(client, i)["price"] for i in (a, b)] == [1000, 2500]
    # Without a preview there is nothing to apply.
    assert client.post("/api/items/bulk/apply",
                       json=bulk_body("archive", [a])).status_code == 422
    # The percentage and the action are checked.
    bad = client.post("/api/items/bulk/preview", json=bulk_body("price_percent", [a], percent=0))
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "bad_percent"
    bad = client.post("/api/items/bulk/preview", json=bulk_body("price_percent", [a], percent=-95))
    assert bad.json()["detail"]["code"] == "bad_percent"
    assert client.post("/api/items/bulk/preview",
                       json={"action": "delete", "item_ids": [a["id"]]}).status_code == 422


def test_sold_out_back_category_and_archive_in_bulk_each_undo(client):
    shawarma = mk(client, name="Shawarma", category="Mains")
    falafel = mk(client, name="Falafel", category="Mains")
    always = mk(client, name="Catering", stock_rule="always")
    hidden = mk(client, name="Secret", status="hidden")
    group = [shawarma, falafel, always, hidden]

    plan = preview(client, "sold_out", group)
    assert [c["name"] for c in plan["changes"]] == ["Falafel", "Shawarma"]
    assert {s["name"]: s["code"] for s in plan["skipped"]} == {
        "Catering": "no_switch", "Secret": "not_on_sale"}
    apply(client, "sold_out", group, plan)
    reasons = [fresh(client, i)["availability"]["reason"] for i in (shawarma, falafel)]
    assert reasons == ["off", "off"]
    assert names(client, filter="sold_out") == ["Falafel", "Shawarma"]
    # Already sold out: the same action finds nothing to do.
    assert {s["code"] for s in preview(client, "sold_out", [shawarma])["skipped"]} == {"already"}
    client.post("/api/items/bulk/undo")
    assert all(fresh(client, i)["available"] for i in (shawarma, falafel))

    back = preview(client, "back", [shawarma])
    assert back["changes"] == [] and back["skipped"][0]["code"] == "already"

    plan = preview(client, "move_category", group, category="Specials")
    assert len(plan["changes"]) == 4
    apply(client, "move_category", group, plan, category="Specials")
    assert {fresh(client, i)["category"] for i in group} == {"Specials"}
    client.post("/api/items/bulk/undo")
    assert [fresh(client, i)["category"] for i in (shawarma, always)] == ["Mains", ""]
    # "No category" is a choice too.
    plan = preview(client, "move_category", [shawarma], category="  ")
    assert plan["changes"][0]["after"] == {"category": ""}

    plan = preview(client, "archive", [shawarma, falafel])
    apply(client, "archive", [shawarma, falafel], plan)
    assert names(client, filter="archived") == ["Falafel", "Shawarma"]
    undone = client.post("/api/items/bulk/undo").json()
    assert undone["restored"] == 2
    assert fresh(client, shawarma)["status"] == "live"


def test_undo_leaves_an_item_someone_edited_since_and_says_which(client):
    a, b = mk(client, name="A", price=1000), mk(client, name="B", price=1000)
    plan = preview(client, "price_percent", [a, b], percent=20)
    apply(client, "price_percent", [a, b], plan, percent=20)
    client.put(f"/api/items/{b['id']}", json={"price": 3333})  # a colleague, after the change
    undone = client.post("/api/items/bulk/undo").json()
    assert undone["restored"] == 1
    assert [(x["name"], x["code"]) for x in undone["left"]] == [("B", "changed_since")]
    assert (fresh(client, a)["price"], fresh(client, b)["price"]) == (1000, 3333)


def test_a_newer_bulk_change_replaces_the_one_that_can_be_undone(client):
    a = mk(client, name="A", price=1000)
    first = preview(client, "price_percent", [a], percent=10)
    apply(client, "price_percent", [a], first, percent=10)
    second = preview(client, "move_category", [a], category="X")
    apply(client, "move_category", [a], second, category="X")
    assert client.get("/api/items/bulk/last").json()["last"]["action"] == "move_category"
    client.post("/api/items/bulk/undo")
    assert (fresh(client, a)["category"], fresh(client, a)["price"]) == ("", 1100)
    assert client.post("/api/items/bulk/undo").status_code == 404  # only the newest, only once


def test_bulk_changes_are_on_the_record_with_who_made_them(client):
    sign_in(client, OWNER_EMAIL)
    a = mk(client, name="A", price=1000)
    plan = preview(client, "archive", [a])
    apply(client, "archive", [a], plan)
    client.post("/api/items/bulk/undo")
    entries = activity(client, a)
    assert [e["actor"]["name"] for e in entries[:3]] == ["Fatima Al-Noor"] * 3
    assert [e["detail"].get("to") for e in entries[:2]] == ["live", "archived"]


def test_an_agent_can_mark_things_sold_out_in_bulk_but_not_change_prices(client):
    a, b = mk(client, name="A", price=1000), mk(client, name="B", price=1000)
    sign_in(client, AGENT_EMAIL)
    plan = preview(client, "sold_out", [a, b])
    assert apply(client, "sold_out", [a, b], plan).json()["changed"] == 2
    # Not prices, categories or archiving: the preview is refused too, so nothing is shown.
    for action, extra in (("price_percent", {"percent": 5}), ("archive", {}),
                          ("move_category", {"category": "Z"})):
        refused = client.post("/api/items/bulk/preview", json=bulk_body(action, [a], **extra))
        assert refused.status_code == 403, action
    assert client.post("/api/items/bulk/undo").json()["restored"] == 2
    # An owner's price change is not the agent's to undo.
    client.cookies.clear()
    sign_in(client, OWNER_EMAIL)
    plan = preview(client, "price_percent", [a], percent=5)
    apply(client, "price_percent", [a], plan, percent=5)
    client.cookies.clear()
    sign_in(client, AGENT_EMAIL)
    refused = client.post("/api/items/bulk/undo")
    assert refused.status_code == 403 and refused.json()["detail"]["code"] == "not_allowed"
    assert fresh(client, a)["price"] == 1050


def test_a_bulk_request_names_a_sensible_number_of_items(client):
    assert client.post("/api/items/bulk/preview",
                       json={"action": "archive", "item_ids": []}).status_code == 422
    too_many = [f"00000000-0000-4000-8000-{n:012d}" for n in range(bulk.MAX_ITEMS + 1)]
    assert client.post("/api/items/bulk/preview",
                       json={"action": "archive", "item_ids": too_many}).status_code == 422
    unknown = client.post("/api/items/bulk/preview", json={
        "action": "archive", "item_ids": ["00000000-0000-4000-8000-000000000001"]}).json()
    assert [s["code"] for s in unknown["skipped"]] == ["gone"] and unknown["changes"] == []


# ── one shop cannot see or touch another's ───────────────


def test_scenario_29_another_shop_sees_none_of_this_shops_photos_items_or_changes(client):
    mine = mk(client, name="Shawarma", price=1000)
    asset = stored_photo(client)
    put_photo(client, mine, asset)
    plan = preview(client, "price_percent", [mine], percent=10)
    apply(client, "price_percent", [mine], plan, percent=10)

    other = other_shop_with_owner("omar-isolation@other.example")
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')", other)
    client.cookies.clear()
    sign_in(client, "omar-isolation@other.example")
    assert listed(client)["items"] == [] and listed(client)["counts"]["all"] == 0
    assert client.get(f"/api/items/{mine['id']}").status_code == 404
    assert client.get(f"/api/items/{mine['id']}/photos").status_code == 404
    assert client.get(f"/api/items/{mine['id']}/activity").status_code == 404
    assert client.get(f"/api/items/{mine['id']}/stock-log").status_code == 404
    assert client.get("/api/items/bulk/last").json() == {"last": None}
    assert client.get("/api/items/stock-log").json() == {"log": []}
    assert client.get("/api/media/photos").json()["photos"] == []
    # Their own item cannot use this shop's photo, whatever its ID.
    theirs = mk(client, name="Their thing")
    stolen = put_photo(client, theirs, asset)
    assert stolen.status_code == 404 and stolen.json()["code"] == "photo_not_found"
    assert fresh(client, theirs)["photos"] == []
    # Nor can their bulk action reach this shop's item.
    reached = preview(client, "archive", [mine])
    assert reached["changes"] == [] and [s["code"] for s in reached["skipped"]] == ["gone"]
    assert client.post(f"/api/items/{mine['id']}/photos/{asset}/cover").status_code == 404
    assert client.put(f"/api/items/{mine['id']}", json={"price": 1}).status_code == 404
    # And this shop's data is as it was.
    client.cookies.clear()
    assert fresh(client, mine)["price"] == 1100


# ── the Catalog module: off until the go-live sweep ──────


def test_the_catalog_module_is_declared_and_off_for_every_product_and_every_setup():
    assert "catalog" in catalog.MODULE_BY_KEY
    assert all("catalog" not in product.modules for product in catalog.PRODUCTS)
    assert all("catalog" not in preset.modules for preset in presets.PRESETS)
    assert catalog.products_for({"catalog"}) == ["agent"]  # it makes no product "in use"


def test_no_shop_has_it_until_the_back_office_switches_it_on(client):
    state = client.get("/api/workspace").json()
    assert "catalog" not in state["modules"]
    assert "catalog" not in [s["key"] for s in state["nav"]["products"]]
    assert owner_sql(
        "select 1 from tenant_modules where module_key = 'catalog' and tenant_id = $1",
        DEMO_TENANT_ID,
    ) == []
    # Switching products on does not bring it in.
    for product in ("chat", "bookings", "accounts"):
        client.post(f"/api/workspace/products/{product}/enable")
    assert "catalog" not in client.get("/api/workspace").json()["modules"]

    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')",
              DEMO_TENANT_ID)
    state = client.get("/api/workspace").json()
    screen = next(s for s in state["nav"]["products"] if s["key"] == "catalog")
    assert screen["label"] == {"en": "Catalog", "ar": "الكتالوج"}
    # Switching it off hides it again and keeps every record.
    owner_sql("update tenant_modules set enabled = false where module_key = 'catalog'")
    nav = client.get("/api/workspace").json()["nav"]["products"]
    assert "catalog" not in [s["key"] for s in nav]


def test_the_catalog_api_answers_for_a_shop_with_the_catalog_module_and_no_orders(client):
    other = other_shop_with_owner("omar-api@other.example")
    client.cookies.clear()
    sign_in(client, "omar-api@other.example")
    assert client.get("/api/items").status_code == 403  # it has the ledger only
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')", other)
    assert client.get("/api/items").status_code == 200
    assert mk(client, name="Thing")["id"]


def test_the_workspace_pages_carry_no_coming_soon_words_for_the_catalog():
    # What an owner can read about the Catalog before go-live is nothing: the module's
    # names are its screen label only.
    module = catalog.MODULE_BY_KEY["catalog"]
    words = " ".join([module.name.en, module.name.ar, *[s.label.en + s.label.ar
                                                        for s in module.screens]]).lower()
    for banned in ("coming", "soon", "beta", "early access", "under development", "قريب"):
        assert banned not in words


def test_shop_settings_round_trip(client):
    saved = client.put("/api/items/settings", json={
        "agents_edit_items": True, "low_stock_at": 12, "hold_minutes": 45, "day_starts": "04:30"})
    assert saved.json() == {
        "hold_minutes": 45, "day_starts": "04:30", "agents_edit_items": True, "low_stock_at": 12}
    assert client.get("/api/items/settings").json() == saved.json()
    assert client.put("/api/items/settings", json={"low_stock_at": -1}).status_code == 422
    assert on_shop(client, listing.low_stock_at) == 12
