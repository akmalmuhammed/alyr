"""Photos that come with an import, in a zip matched to rows by file name (ALY-108): matched
in the preview, added after the import by a background job, named when one cannot be used,
taken off again by the undo, and a zip that is refused when it is too big, too many, damaged,
protected or built to unpack to far more than it says."""

import io
import zipfile
from uuid import UUID

from photo_files import photo
from test_catalog_import import (
    BASIC,
    OCTET,
    apply_import,
    by_name,
    codes,
    do_import,
    entry_for,
    head,
    new_shop,
    preview_of,
    table,
    xlsx_of,
)
from test_consent import owner_sql
from test_media import drain

PHOTO_KEYS = [*BASIC, "photo"]


def zip_photos(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return out.getvalue()


def add_zip(client, shown: dict, data: bytes, name: str = "photos.zip"):
    return client.put(f"/api/items/import/{shown['id']}/photos", params={"filename": name},
                      content=data, headers=OCTET)


def item_photo_ids(client, item: dict) -> list[str]:
    return [p["id"] for p in client.get(f"/api/items/{item['id']}").json()["photos"]]


def library(shop: dict) -> int:
    return owner_sql("select count(*) as n from media_assets where tenant_id = $1",
                     shop["tenant"])[0]["n"]


def the_import(client, import_id: str) -> dict:
    return client.get(f"/api/items/import/{import_id}").json()


def test_photos_in_a_zip_are_matched_to_rows_by_file_name_and_added_after_the_import(client):
    shop = new_shop(client)
    rows = table(
        PHOTO_KEYS,
        ["Shawarma", "شاورما", "Wraps", 14, "shawarma.jpg, shawarma-2.png"],     # row 2: two
        ["Falafel", "فلافل", "Wraps", 9, "FALAFEL"],                       # row 3: no extension
        ["Hummus", "حمص", "Starters", 7, "hummus.webp"],                          # row 4
        ["Tea", "شاي", "Drinks", 3, None],                                        # row 5: by name
        ["Cake", "كيك", "Sweets", 20, "cake.heic"],                        # row 6: not usable
        ["Pie", "فطيرة", "Sweets", 18, "pie.jpg"],                                # row 7: not there
        ["Soup", "شوربة", "Starters", 8, "https://example.test/soup.jpg"],        # row 8: a link
    )
    shown = preview_of(client, xlsx_of(rows))
    assert codes(entry_for(shown, 2)) == ["photo_needs_zip"] and shown["summary"]["zip"] == {}
    zipped = zip_photos({
        "shawarma.jpg": photo(640, 480, 1), "shawarma-2.png": photo(300, 300, 2, "PNG"),
        "falafel.jpg": photo(400, 400, 3), "hummus.webp": photo(500, 400, 4, "WEBP"),
        "Tea.jpg": photo(320, 240, 5), "unused.jpg": photo(100, 100, 6),
        "notes.txt": b"hello", "cake.heic": b"\x00\x00\x00\x18ftypheic",
        "__MACOSX/._shawarma.jpg": b"junk", "album/nested.jpg": photo(120, 90, 7),
    })
    added = add_zip(client, shown, zipped)
    assert added.status_code == 200, added.text
    shown = added.json()
    assert shown["zip"]["name"] == "photos.zip"
    zip_summary = shown["summary"]["zip"]
    assert zip_summary["entries"] == 9 and zip_summary["used"] == 5
    assert sorted(zip_summary["unused"]) == ["album/nested.jpg", "unused.jpg"]
    assert sorted(zip_summary["unusable"]) == ["cake.heic", "notes.txt"]
    assert [entry_for(shown, 2)["photos"], entry_for(shown, 3)["photos"],
            entry_for(shown, 4)["photos"], entry_for(shown, 5)["photos"]] == [2, 1, 1, 1]
    assert "photo_by_name" in codes(entry_for(shown, 5), "info")
    assert "photo_bad_type" in codes(entry_for(shown, 6), "warning")
    assert "photo_missing" in codes(entry_for(shown, 7), "warning")
    assert "photo_url" in codes(entry_for(shown, 8), "warning")
    assert shown["summary"]["photos"] == 5
    assert library(shop) == 0   # nothing is stored until the import is applied

    done = apply_import(client, shown)
    assert done.status_code == 200, done.text
    assert done.json()["photos"]["total"] == 5
    finished = the_import(client, shown["id"])
    assert finished["photos"] == {"state": "done", "total": 5, "done": 5, "failed": []}
    assert len(item_photo_ids(client, by_name(client, "Shawarma"))) == 2
    for name in ("Falafel", "Hummus", "Tea"):
        item = client.get(f"/api/items/{by_name(client, name)['id']}").json()
        assert [p["state"] for p in item["photos"]] == ["ready"]
        assert item["cover"]["state"] == "ready"
    assert item_photo_ids(client, by_name(client, "Cake")) == []
    assert library(shop) == 5
    # The zip is not kept once its photos are in.
    row = owner_sql("select zip is null as gone from item_imports where id = $1",
                    UUID(shown["id"]))[0]
    assert row["gone"] is True
    # The first photo named is the cover.
    first = client.get(f"/api/items/{by_name(client, 'Shawarma')['id']}").json()["photos"]
    assert first[0]["width"] == 640 and first[1]["width"] == 300


def test_a_photo_that_cannot_be_used_is_named_with_the_reason_and_the_rest_are_added(client):
    new_shop(client)
    rows = table(PHOTO_KEYS,
                 ["Tea", "شاي", "D", 3, "tea.jpg"], ["Cake", "كيك", "S", 9, "cake.jpg"],
                 ["Pie", "فطيرة", "S", 8, "pie.jpg"])
    shown = preview_of(client, xlsx_of(rows))
    shown = add_zip(client, shown, zip_photos({
        "tea.jpg": photo(200, 200, 1),
        "cake.jpg": b"this is not a picture at all",
        "pie.jpg": b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
    })).json()
    assert apply_import(client, shown).status_code == 200
    finished = the_import(client, shown["id"])["photos"]
    assert (finished["state"], finished["total"], finished["done"]) == ("done", 3, 1)
    assert sorted(f["file"] for f in finished["failed"]) == ["cake.jpg", "pie.jpg"]
    assert all(f["message"] and f["message_ar"] and f["code"] for f in finished["failed"])
    assert len(item_photo_ids(client, by_name(client, "Tea"))) == 1
    assert item_photo_ids(client, by_name(client, "Cake")) == []   # the item is still there
    assert by_name(client, "Pie")["status"] == "live"


def test_an_item_gets_at_most_eight_photos_and_the_row_says_so(client):
    new_shop(client)
    names = ", ".join(f"p{n}.jpg" for n in range(10))
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Tea", "شاي", "D", 3, names])))
    shown = add_zip(client, shown, zip_photos({f"p{n}.jpg": photo(90, 90, n + 1) for n in range(10)}
                                              )).json()
    entry = shown["items"][0]
    assert entry["photos"] == 8 and "photo_too_many" in codes(entry, "warning")
    assert apply_import(client, shown).status_code == 200
    assert len(item_photo_ids(client, by_name(client, "Tea"))) == 8


def test_two_files_with_one_name_in_different_folders_are_not_guessed_between(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Tea", "شاي", "D", 3, "tea.jpg"])))
    shown = add_zip(client, shown, zip_photos({
        "a/tea.jpg": photo(90, 90, 1), "b/tea.jpg": photo(90, 90, 2)})).json()
    assert "photo_ambiguous" in codes(shown["items"][0], "warning")
    assert shown["items"][0]["photos"] == 0


def test_a_zip_can_be_replaced_or_taken_away_before_the_import(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Tea", "شاي", "D", 3, "tea.jpg"])))
    assert "photo_needs_zip" in codes(shown["items"][0], "warning")
    shown = add_zip(client, shown, zip_photos({"tea.jpg": photo(90, 90, 1)})).json()
    assert shown["items"][0]["photos"] == 1 and "photo_needs_zip" not in codes(shown["items"][0])
    shown = add_zip(client, shown, zip_photos({"other.jpg": photo(90, 90, 2)})).json()
    assert shown["items"][0]["photos"] == 0 and "photo_missing" in codes(shown["items"][0])
    removed = client.delete(f"/api/items/import/{shown['id']}/photos").json()
    assert removed["zip"] is None and "photo_needs_zip" in codes(removed["items"][0])


def test_the_import_with_a_zip_is_refused_if_the_zip_changed_since_the_preview(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Tea", "شاي", "D", 3, "tea.jpg"])))
    with_zip = add_zip(client, shown, zip_photos({"tea.jpg": photo(90, 90, 1)})).json()
    stale = apply_import(client, shown)       # the preview from before the zip
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "changed_since_preview"
    assert apply_import(client, with_zip).status_code == 200


def test_an_unusable_zip_is_refused_and_the_preview_keeps_what_it_had(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CATALOG_IMPORT_MAX_ZIP_BYTES", "100000")
    client = client_factory()
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Tea", "شاي", "D", 3, "tea.jpg"])))
    good = add_zip(client, shown, zip_photos({"tea.jpg": photo(90, 90, 1)})).json()

    bomb = zip_of_one("tea.jpg", b"0" * (60 * 1024 * 1024))
    many = zip_photos({f"p{n}.jpg": b"x" for n in range(601)})
    big = zip_photos({"pad.jpg": b"z" * 200_000})
    for data, code, status in (
        (b"definitely not a zip", "not_a_zip", 422),
        (bomb, "zip_too_large", 422),
        (many, "zip_too_many", 422),
        (big, "file_too_large", 413),
    ):
        answer = add_zip(client, good, data)
        assert answer.status_code == status, (code, answer.text)
        detail = answer.json()["detail"]
        assert detail["code"] == code and detail["message"] and detail["message_ar"]
    # A protected zip.
    protected = bytearray(zip_photos({"tea.jpg": photo(50, 50, 1)}))
    for marker, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        protected[protected.find(marker) + offset] |= 0x1
    answer = add_zip(client, good, bytes(protected))
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "zip_protected"
    # Through all of that the preview kept its zip.
    assert the_import(client, good["id"])["items"][0]["photos"] == 1


def zip_of_one(name: str, data: bytes) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(name, data)
    return out.getvalue()


def test_undo_takes_the_photos_an_import_added_off_items_that_already_existed(client):
    shop = new_shop(client)
    do_import(client, table(BASIC, ["Tea", "شاي", "D", 3], ["Cake", "كيك", "S", 9]))
    tea, cake = by_name(client, "Tea"), by_name(client, "Cake")
    rows = [head("id", "photo"), [tea["id"], "tea.jpg"]]
    shown = preview_of(client, xlsx_of(rows))
    shown = add_zip(client, shown, zip_photos({"tea.jpg": photo(120, 90, 1)})).json()
    assert apply_import(client, shown).status_code == 200
    assert len(item_photo_ids(client, tea)) == 1
    undone = client.post("/api/items/import/undo").json()
    assert undone["restored"] == 1 and undone["left"] == []
    assert item_photo_ids(client, tea) == []
    assert library(shop) == 1      # the photo stays in the shop's library
    assert item_photo_ids(client, cake) == []


def test_undo_of_an_import_that_made_the_items_takes_their_photos_off_and_removes_them(client):
    shop = new_shop(client)
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Tea", "شاي", "D", 3, "tea.jpg"])))
    shown = add_zip(client, shown, zip_photos({"tea.jpg": photo(120, 90, 1)})).json()
    apply_import(client, shown)
    assert owner_sql("select count(*) as n from media_links where tenant_id = $1",
                     shop["tenant"])[0]["n"] == 1
    undone = client.post("/api/items/import/undo").json()
    assert undone["removed"] + undone["archived"] == 1
    assert owner_sql("select count(*) as n from media_links where tenant_id = $1",
                     shop["tenant"])[0]["n"] == 0


def test_photos_wait_for_the_worker_and_an_undo_before_they_arrive_cancels_them(
        client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    shop = new_shop(client)
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Tea", "شاي", "D", 3, "tea.jpg"])))
    shown = add_zip(client, shown, zip_photos({"tea.jpg": photo(120, 90, 1)})).json()
    applied = apply_import(client, shown).json()
    assert applied["photos"]["state"] == "queued"
    assert the_import(client, shown["id"])["photos"]["state"] == "queued"
    assert client.post("/api/items/import/undo").status_code == 200
    drain(client)    # the worker comes by after the undo
    assert library(shop) == 0
    assert the_import(client, shown["id"])["status"] == "undone"

    # And left alone, the worker adds them.
    shown = preview_of(client, xlsx_of(table(PHOTO_KEYS, ["Cake", "كيك", "S", 9, "cake.jpg"])))
    shown = add_zip(client, shown, zip_photos({"cake.jpg": photo(120, 90, 2)})).json()
    apply_import(client, shown)
    drain(client)
    assert the_import(client, shown["id"])["photos"]["state"] == "done"
    assert len(item_photo_ids(client, by_name(client, "Cake"))) == 1


def test_when_the_shops_photo_limit_is_reached_the_items_still_come_in(
        client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CATALOG_MAX_PHOTOS", "2")
    client = client_factory()
    new_shop(client)
    rows = table(PHOTO_KEYS, *[[f"Item {n}", f"صنف {n}", "x", 5, f"p{n}.jpg"] for n in range(4)])
    shown = preview_of(client, xlsx_of(rows))
    shown = add_zip(client, shown, zip_photos({f"p{n}.jpg": photo(90, 90, n + 1)
                                               for n in range(4)})).json()
    assert apply_import(client, shown).status_code == 200
    finished = the_import(client, shown["id"])["photos"]
    assert (finished["total"], finished["done"], len(finished["failed"])) == (4, 2, 2)
    assert {f["code"] for f in finished["failed"]} == {"photo_limit_reached"}
    assert len(client.get("/api/items", params={"limit": 50}).json()["items"]) == 4
