"""A shop's product photos end to end (D-039, ALY-103): upload, store, share, count, remove.
Covers plan scenarios 23 to 26, on local disk and real PostgreSQL. R2 is never reached."""

import asyncio
import hashlib
import io
import re
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest
from PIL import Image

from alyr.core import media
from alyr.core.images import FORBIDDEN_CHUNKS, PhotoRefused, riff_chunks
from alyr.core.storage import IMMUTABLE, LocalStore, StoreUnavailable
from alyr.db import Database
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID, OWNER_EMAIL
from conftest import APP_DSN
from photo_files import CAMERA, drawing, encode, located, photo, png_header_only, with_jpeg_comment
from test_consent import owner_sql
from test_sign_in import other_shop_with_owner, sign_in

ARABIC = re.compile(r"[؀-ۿ]")
ADMIN = "/api/admin"


def upload(client, data, content_type="image/jpeg"):
    return client.post("/api/media/photos", content=data, headers={"content-type": content_type})


def folder(client) -> Path:
    return Path(client.app.state.media.store.root)


def stored(client) -> list[str]:
    return sorted(p.relative_to(folder(client)).as_posix() for p in folder(client).rglob("*.webp"))


def rows(sql, *args):
    return owner_sql(sql, *args)


def on_shop(client, fn, *args, tenant=DEMO_TENANT_ID):
    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            return await fn(conn, *args)

    return client.portal.call(go)


def drain(client):
    client.portal.call(client.app.state.jobs.drain)


def make_due():
    rows("update jobs set run_at = now() where kind = 'media.sync' and status = 'queued'")


class Switchable(LocalStore):
    """Local disk that can be switched off, to play the photo store being down."""

    def __init__(self, root):
        super().__init__(root)
        self.down = False

    async def put(self, key, data, **kwargs):
        if self.down:
            raise StoreUnavailable("the store is down")
        await super().put(key, data, **kwargs)

    async def delete(self, key):
        if self.down:
            raise StoreUnavailable("the store is down")
        await super().delete(key)


@pytest.fixture(autouse=True)
def no_photos_yet():
    """The test database is shared by the whole run, so every test here starts with no
    photos and leaves none (or any photo job) behind."""

    def clear():
        for table in ("media_ops", "media_links", "media_assets", "media_usage"):
            owner_sql(f"delete from {table}")
        owner_sql("delete from jobs where kind = 'media.sync'")

    clear()
    yield
    clear()


@pytest.fixture
def slow_retries(monkeypatch):
    """A failed write waits an hour before its next try, so a test decides when it runs."""
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "3600")


@pytest.fixture
def switch(client_factory, slow_retries):
    client = client_factory()
    store = Switchable(client.app.state.media.store.root)
    client.app.state.media.store = store
    return client, store


# ── scenario 23: huge, corrupt, the wrong type, or a location in it ──


def test_a_photo_is_stored_in_three_sizes_in_the_shops_own_folder(client):
    data = photo(3000, 2000)
    answer = upload(client, data)
    assert answer.status_code == 201
    shown = answer.json()["photo"]
    assert (answer.json()["duplicate"], shown["state"]) == (False, "ready")

    # Named by the hash of what was uploaded, inside this shop's folder.
    prefix = f"shops/{DEMO_TENANT_ID}/{hashlib.sha256(data).hexdigest()}"
    assert stored(client) == [f"{prefix}-{size}.webp" for size in (1600, 320, 800)]
    assert shown["urls"] == {
        "thumb": f"/api/media/file/{prefix}-320.webp",
        "medium": f"/api/media/file/{prefix}-800.webp",
        "large": f"/api/media/file/{prefix}-1600.webp",
    }
    assert re.findall(r" (\d+)w", shown["srcset"]) == ["320", "800", "1600"]
    assert shown["width"] == 1600 and shown["height"] in (1066, 1067)

    served = client.get(shown["urls"]["medium"])
    assert served.status_code == 200 and served.headers["content-type"] == "image/webp"
    assert served.headers["cache-control"] == IMMUTABLE
    assert served.headers["x-content-type-options"] == "nosniff"
    assert Image.open(io.BytesIO(served.content)).size[0] == 800


def test_what_is_stored_has_no_location_or_camera_in_it(client):
    answer = upload(client, located(1200, 900))
    assert answer.status_code == 201
    assert stored(client)
    for name in stored(client):
        data = (folder(client) / name).read_bytes()
        again = Image.open(io.BytesIO(data))
        assert dict(again.getexif()) == {} and dict(again.getexif().get_ifd(0x8825)) == {}
        assert not FORBIDDEN_CHUNKS & set(riff_chunks(data))
        assert CAMERA.encode() not in data


def test_bad_photos_are_refused_with_plain_words_in_both_languages_and_nothing_is_stored(
    client,
):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    whole = photo(1200, 900)
    cases = {
        # What the browser says about the file is wrong in every one of these.
        "svg": (svg, "image/png", "photo_markup", 415),
        "web page": (b"<html><body>hi</body></html>", "image/jpeg", "photo_markup", 415),
        "pdf": (b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "image/jpeg", "photo_type", 415),
        "gif": (b"GIF89a\x01\x00\x01\x00\x80\x00\x00" + b"\x00" * 20, "image/gif",
                "photo_type", 415),
        "hidden code": (
            with_jpeg_comment(photo(300, 200), b"<script>x</script>"), "image/jpeg",
            "photo_active", 415,
        ),
        "cut off": (whole[: len(whole) // 2], "image/jpeg", "photo_damaged", 422),
        "bomb": (png_header_only(60000, 60000), "image/png", "photo_pixels", 413),
        "nothing": (b"", "image/jpeg", "photo_empty", 422),
    }
    for name, (data, kind, code, status) in cases.items():
        answer = upload(client, data, kind)
        body = answer.json()
        assert (answer.status_code, body["code"]) == (status, code), name
        assert body["detail"] and not ARABIC.search(body["detail"]), name
        assert ARABIC.search(body["message_ar"]), name
    assert stored(client) == [] and rows("select 1 from media_assets") == []
    assert rows("select 1 from media_ops") == []
    # Every refusal was counted for the shop's meters.
    assert client.get("/api/media/usage").json()["uploads"]["refused"] == len(cases)


def test_a_photo_over_the_size_or_pixel_limit_is_refused_with_the_limit_named(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_MEDIA_MAX_UPLOAD_BYTES", "20000")
    monkeypatch.setenv("ALYR_MEDIA_MAX_PIXELS", "100000")
    client = client_factory()
    big = photo(1600, 1200, seed=4, quality=95)
    assert len(big) > 20_000

    declared = upload(client, big)  # the length is announced up front
    assert (declared.status_code, declared.json()["code"]) == (413, "photo_too_large")
    assert declared.json()["limit_bytes"] == 20_000
    assert "Choose a smaller photo" in declared.json()["detail"]
    chunks = [big[i:i + 4000] for i in range(0, len(big), 4000)]
    streamed = client.post(
        "/api/media/photos", content=iter(chunks), headers={"content-type": "image/jpeg"}
    )  # no announced length: stopped as it arrives
    assert (streamed.status_code, streamed.json()["code"]) == (413, "photo_too_large")

    small_file = photo(640, 480, seed=5, quality=40)
    assert len(small_file) < 20_000
    pixels = upload(client, small_file)  # 307,200 pixels against a limit of 100,000
    assert (pixels.status_code, pixels.json()["code"]) == (413, "photo_pixels")
    assert "megapixels" in pixels.json()["detail"]
    assert stored(client) == []


# ── scenario 24: a weak connection ────────────────────────


def test_a_cut_off_upload_saves_nothing_and_a_retry_stores_it_once(client):
    data = photo(2000, 1500)
    cut = upload(client, data[: len(data) // 3])
    assert cut.status_code == 422 and cut.json()["code"] == "photo_damaged"
    assert stored(client) == [] and rows("select 1 from media_assets") == []

    assert upload(client, data).status_code == 201
    # The phone never saw the answer, so it sends the photo again: same photo, no second copy.
    again = upload(client, data)
    assert (again.status_code, again.json()["duplicate"]) == (200, True)
    assert len(stored(client)) == 3 and len(rows("select 1 from media_assets")) == 1


def test_the_same_photo_twice_is_stored_once_and_counted_as_a_duplicate(client):
    data = photo(1000, 800)
    first = upload(client, data).json()["photo"]
    second = upload(client, data)
    assert second.status_code == 200 and second.json()["duplicate"] is True
    assert second.json()["photo"]["id"] == first["id"]
    assert len(stored(client)) == 3
    assert len(rows("select 1 from media_assets")) == 1
    mine = client.get("/api/media/usage").json()
    assert mine["uploads"] == {"month": 1, "duplicates": 1, "refused": 0}
    assert mine["photos"]["used"] == 1


# ── scenario 25: the photo store is unavailable ───────────


def test_when_the_store_is_down_uploads_wait_and_everything_else_keeps_working(switch):
    client, store = switch
    store.down = True
    answer = upload(client, photo(1200, 900))
    assert answer.status_code == 202
    waiting = answer.json()["photo"]
    # Not stored yet, so the page is told to draw a placeholder tile, never a broken image.
    assert (waiting["state"], waiting["urls"], waiting["srcset"]) == ("pending", None, "")
    assert stored(client) == []
    queued = rows("select op, key from media_ops order by seq")
    assert [r["op"] for r in queued] == ["put", "put", "put"]  # kept safe, in the database

    # Orders, the shop's page and the library carry on.
    assert client.get("/api/orders").status_code == 200
    assert client.get("/api/store/al-noor").status_code == 200
    library = client.get("/api/media/photos").json()
    assert [p["state"] for p in library["photos"]] == ["pending"]
    # A photo that is not ready is the placeholder state wherever an item asks for its cover.
    item = uuid4()
    on_shop(client, client.app.state.media.attach, UUID(waiting["id"]), "item", item)
    cover = on_shop(client, client.app.state.media.covers_for, "item", [item])[item]
    assert (cover["state"], cover["urls"]) == ("none", None)
    # The shop can see the photo is on its way, and cannot delete it mid-save.
    assert client.delete(f"/api/media/photos/{waiting['id']}").json()["code"] == "photo_busy"

    # The store comes back: the waiting writes happen without anyone uploading again.
    store.down = False
    make_due()
    drain(client)
    shown = client.get(f"/api/media/photos/{waiting['id']}").json()["photo"]
    assert shown["state"] == "ready" and shown["urls"]["thumb"]
    assert len(stored(client)) == 3
    assert rows("select 1 from media_ops") == []  # nothing left owing
    cover = on_shop(client, client.app.state.media.covers_for, "item", [item])[item]
    assert cover["state"] == "ready"


def test_a_photo_the_store_never_took_is_marked_and_a_new_upload_tries_again(switch):
    client, store = switch
    store.down = True
    data = photo(900, 600)
    asset = upload(client, data).json()["photo"]["id"]
    # The job has used up its attempts.
    rows("update jobs set attempts = max_attempts - 1, run_at = now() where kind = 'media.sync'")
    drain(client)
    assert client.get(f"/api/media/photos/{asset}").json()["photo"]["state"] == "failed"
    assert client.get("/api/jobs/failed").json()["jobs"][0]["kind"] == "media.sync"
    # Nothing was deleted: the writes are still queued, and the shop can send it again.
    store.down = False
    again = upload(client, data)
    assert again.json()["duplicate"] is True
    assert again.json()["photo"]["state"] == "ready" and again.json()["photo"]["id"] == asset
    assert len(stored(client)) == 3


def test_photos_are_written_by_the_background_worker_when_jobs_are_not_inline(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    answer = upload(client, photo(1000, 800))
    assert (answer.status_code, answer.json()["photo"]["state"]) == (202, "pending")
    assert stored(client) == []
    drain(client)  # what `python -m alyr.worker` does
    assert client.get("/api/media/photos").json()["photos"][0]["state"] == "ready"
    assert len(stored(client)) == 3


def test_deleting_and_re_uploading_the_same_photo_never_loses_its_files(switch):
    client, store = switch
    data = photo(1000, 700)
    first = upload(client, data).json()["photo"]["id"]
    store.down = True
    assert client.delete(f"/api/media/photos/{first}").status_code == 200  # deletes wait
    second = upload(client, data)  # the same picture, so the same file names
    assert second.status_code == 202 and second.json()["photo"]["id"] != first
    store.down = False
    make_due()
    drain(client)
    assert len(stored(client)) == 3  # the waiting deletes did not take the new photo's files
    assert client.get("/api/media/photos").json()["photos"][0]["state"] == "ready"


# ── scenario 26: the shop reaches its photo limit ─────────


def test_at_its_photo_limit_a_shop_gets_a_clear_message_and_nothing_is_deleted(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_CATALOG_MAX_PHOTOS", "2")
    client = client_factory()
    first, second = photo(1000, 800, seed=1), photo(1000, 800, seed=2)
    assert upload(client, first).status_code == 201
    assert upload(client, second).status_code == 201

    refused = upload(client, photo(1000, 800, seed=3))
    body = refused.json()
    assert (refused.status_code, body["code"], body["limit"]) == (409, "photo_limit_reached", 2)
    assert "limit of 2 photos" in body["detail"] and "Nothing has been deleted" in body["detail"]
    assert ARABIC.search(body["message_ar"]) and "(2)" in body["message_ar"]

    # Everything the shop had is still there and still served.
    library = client.get("/api/media/photos").json()
    assert library["total"] == 2 and {p["state"] for p in library["photos"]} == {"ready"}
    assert len(stored(client)) == 6
    for shown in library["photos"]:
        assert client.get(shown["urls"]["thumb"]).status_code == 200
    # Sending a photo it already has costs nothing, so the cap does not stop that.
    assert upload(client, first).json()["duplicate"] is True
    # Removing one makes room.
    assert client.delete(f"/api/media/photos/{library['photos'][0]['id']}").status_code == 200
    assert upload(client, photo(1000, 800, seed=3)).status_code == 201


def test_a_shop_at_its_item_limit_is_told_so_and_a_broken_counter_never_blocks_a_photo(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_CATALOG_MAX_ITEMS", "10")
    client = client_factory()
    service = client.app.state.media

    async def nine(conn):
        return 9

    async def ten(conn):
        return 10

    async def broken(conn):
        await conn.fetchval("select * from a_table_that_is_not_there")

    service.item_counter = nine
    on_shop(client, service.assert_can_add_item)  # room for one more
    service.item_counter = ten
    with pytest.raises(PhotoRefused) as caught:
        on_shop(client, service.assert_can_add_item)
    assert caught.value.code == "item_limit_reached"
    assert "limit of 10 items" in caught.value.en and "Nothing has been deleted" in caught.value.en
    assert ARABIC.search(caught.value.ar)

    service.item_counter = broken
    assert upload(client, photo(600, 400)).status_code == 201  # the failed count is skipped
    on_shop(client, service.assert_can_add_item)


def test_two_uploads_of_the_same_photo_at_once_store_it_once(client):
    service = client.app.state.media
    data = photo(1000, 800)

    async def both():
        return await asyncio.gather(
            service.upload(DEMO_TENANT_ID, data), service.upload(DEMO_TENANT_ID, data)
        )

    first, second = client.portal.call(both)
    assert sorted([first.duplicate, second.duplicate]) == [False, True]
    assert first.photo["id"] == second.photo["id"]
    assert len(rows("select 1 from media_assets")) == 1 and len(stored(client)) == 3


def test_two_different_photos_at_once_cannot_both_slip_under_the_limit(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_CATALOG_MAX_PHOTOS", "1")
    client = client_factory()
    service = client.app.state.media

    async def both():
        return await asyncio.gather(
            service.upload(DEMO_TENANT_ID, photo(1000, 800, seed=1)),
            service.upload(DEMO_TENANT_ID, photo(1000, 800, seed=2)),
            return_exceptions=True,
        )

    results = client.portal.call(both)
    refused = [r for r in results if isinstance(r, PhotoRefused)]
    assert len(refused) == 1 and refused[0].code == "photo_limit_reached"
    assert len(rows("select 1 from media_assets")) == 1 and len(stored(client)) == 3


# ── the meters ────────────────────────────────────────────


def test_the_meters_add_up(client):
    async def twelve(conn):
        return 12

    client.app.state.media.item_counter = twelve
    one, two = photo(1500, 1000, seed=1), photo(900, 900, seed=2)
    upload(client, one)
    upload(client, one)  # a duplicate
    upload(client, two)
    upload(client, b"<svg/>")  # refused

    on_disk = sum((folder(client) / name).stat().st_size for name in stored(client))
    mine = client.get("/api/media/usage").json()
    assert mine["photos"] == {"used": 2, "limit": 3000}
    assert mine["bytes"] == on_disk and mine["gb"] == round(on_disk / 1e9, 6)
    assert mine["items"] == {"used": 12, "limit": 1000}
    assert mine["uploads"] == {"month": 2, "duplicates": 1, "refused": 1}
    assert mine["storage"] == "local"
    month = mine["history"][0]
    assert month["month"] == mine["month"]
    assert (month["photos"], month["uploads"], month["active_items"]) == (2, 2, 12)
    assert month["gb"] == mine["gb"] and month["peak_gb"] >= month["gb"]

    # Deleting a photo lowers what is stored and keeps the month's counts and its peak.
    first = client.get("/api/media/photos").json()["photos"][-1]["id"]
    assert client.delete(f"/api/media/photos/{first}").status_code == 200
    after = client.get("/api/media/usage").json()
    assert after["photos"]["used"] == 1 and after["bytes"] < mine["bytes"]
    assert after["uploads"]["month"] == 2
    assert after["history"][0]["peak_gb"] == month["peak_gb"]
    assert after["history"][0]["photos"] == 1
    assert len(stored(client)) == 3  # the deleted photo's files are gone


def test_the_hourly_refresh_gives_every_shop_this_months_meters(client):
    other = other_shop_with_owner(f"owner-{uuid4().hex[:8]}@other.example")

    async def seven(conn):
        return 7

    client.app.state.media.item_counter = seven
    shops = client.portal.call(client.app.state.media.refresh_all)
    assert shops >= 2
    meters = {r["tenant_id"]: r for r in rows("select * from media_usage")}
    assert len(meters) == shops  # one row each, none of them uploaded anything
    assert meters[other]["active_items"] == 7 and meters[other]["photos"] == 0
    assert meters[other]["month"] == meters[DEMO_TENANT_ID]["month"]
    # Running it again changes nothing but the figures: still one row per shop.
    client.portal.call(client.app.state.media.refresh_all)
    assert len(rows("select * from media_usage")) == shops


def test_back_office_usage_lists_every_business_and_flags_the_free_tier(
    client_factory, monkeypatch
):
    other = other_shop_with_owner(f"owner-{uuid4().hex[:8]}@other.example")
    client = client_factory()
    upload(client, photo(1200, 800, seed=7))
    total = int(rows("select media_total_bytes() as n")[0]["n"])
    assert total > 0

    answer = client.get(f"{ADMIN}/media/usage")
    assert answer.status_code == 200
    body = answer.json()
    by_id = {s["tenant_id"]: s for s in body["shops"]}
    assert by_id[str(DEMO_TENANT_ID)]["business"] == "Al Noor Electricals"
    mine = by_id[str(DEMO_TENANT_ID)]
    assert mine["photos"] == 1 and mine["bytes"] == total
    assert by_id[str(other)]["photos"] == 0  # a shop with no photos still appears
    assert body["alert"]["level"] == "ok" and body["alert"]["at_percent"] == 80

    # Free tier sized so these photos are 90% of it: the 80% flag is raised.
    monkeypatch.setenv("ALYR_MEDIA_FREE_BYTES", str(int(total / 0.9)))
    warn = client_factory().get(f"{ADMIN}/media/usage").json()["alert"]
    assert warn["level"] == "warn" and 89 < warn["percent"] < 91
    monkeypatch.setenv("ALYR_MEDIA_FREE_BYTES", str(total))
    assert client_factory().get(f"{ADMIN}/media/usage").json()["alert"]["level"] == "over"
    # A month with nothing recorded is empty, not an error.
    assert client.get(f"{ADMIN}/media/usage?month=2020-01").status_code == 200
    assert client.get(f"{ADMIN}/media/usage?month=2020-13").status_code == 422


def test_the_alert_is_logged_once_when_the_line_is_crossed(client_factory, monkeypatch, caplog):
    # The line is 800 bytes, which any photo passes.
    monkeypatch.setenv("ALYR_MEDIA_FREE_BYTES", "1000")
    client = client_factory()
    with caplog.at_level("WARNING", logger="alyr.media"):
        for seed in (1, 2, 3):
            upload(client, photo(1000, 800, seed=seed))
    warned = [r for r in caplog.records if "free tier" in r.getMessage()]
    assert len(warned) == 1  # when it was crossed, not on every photo after


def test_the_line_is_the_alert_percent_of_the_free_bytes(client, caplog):
    service = client.app.state.media
    service.settings = service.settings.model_copy(
        update={"media_free_bytes": 1000, "media_alert_percent": 80}
    )
    with caplog.at_level("WARNING", logger="alyr.media"):
        service._watch(790, 5)  # below 800
        service._watch(900, 10)  # already past it before this photo
        assert not caplog.records
        service._watch(805, 10)  # this photo took it from 795 to 805
    assert len(caplog.records) == 1 and "80%" in caplog.records[0].getMessage()


# ── scenario 29: one shop and another's photos ────────────


@pytest.fixture
def two_shops(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    email = f"owner-{uuid4().hex[:8]}@other.example"
    other = other_shop_with_owner(email)
    a, b = client_factory(), client_factory()
    sign_in(a, OWNER_EMAIL)
    sign_in(b, email)
    return a, b, other


def test_one_shop_cannot_list_open_or_delete_anothers_photos(two_shops):
    a, b, _ = two_shops
    data = photo(900, 700)
    mine = upload(a, data).json()["photo"]
    assert b.get("/api/media/photos").json() == {"total": 0, "photos": []}
    assert b.get(f"/api/media/photos/{mine['id']}").status_code == 404
    assert b.delete(f"/api/media/photos/{mine['id']}").status_code == 404
    assert a.get(f"/api/media/photos/{mine['id']}").status_code == 200

    # The same file in the other shop is its own photo in its own folder.
    theirs = upload(b, data)
    assert (theirs.status_code, theirs.json()["duplicate"]) == (201, False)
    assert theirs.json()["photo"]["id"] != mine["id"]
    folders = {name.split("/")[1] for name in stored(a)}
    assert len(folders) == 2 and str(DEMO_TENANT_ID) in folders
    # Deleting theirs leaves ours alone.
    assert b.delete(f"/api/media/photos/{theirs.json()['photo']['id']}").status_code == 200
    assert a.get(mine["urls"]["thumb"]).status_code == 200
    assert a.get("/api/media/photos").json()["total"] == 1


def test_a_shop_cannot_attach_anothers_photo_to_its_own_item(two_shops):
    a, b, other = two_shops
    mine = UUID(upload(a, photo(800, 600)).json()["photo"]["id"])
    with pytest.raises(PhotoRefused) as caught:
        on_shop(b, b.app.state.media.attach, mine, "item", uuid4(), tenant=other)
    assert caught.value.code == "photo_not_found"


def tenant_rows(tenant, sql, *args):
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant) as conn:
                return await conn.fetch(sql, *args)
        finally:
            await db.close()

    return asyncio.run(go())


def test_the_database_itself_keeps_the_photo_tables_apart(client):
    other = other_shop_with_owner(f"owner-{uuid4().hex[:8]}@other.example")
    upload(client, photo(700, 500))
    mine = UUID(client.get("/api/media/photos").json()["photos"][0]["id"])
    on_shop(client, client.app.state.media.attach, mine, "item", uuid4())

    for table in ("media_assets", "media_links", "media_usage"):
        assert tenant_rows(other, f"select 1 from {table}") == [], table
        assert tenant_rows(DEMO_TENANT_ID, f"select 1 from {table}"), table
    # Writing as the other shop into this shop's rows is refused outright.
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        tenant_rows(
            other, "insert into media_assets (tenant_id, source_sha256, width, height, variants, "
            "bytes_total) values ($1, $2, 1, 1, '[]', 1)", DEMO_TENANT_ID, "a" * 64,
        )
    # A link in its own shop to a photo of ours does not exist for it.
    with pytest.raises(asyncpg.ForeignKeyViolationError):
        tenant_rows(
            other,
            "insert into media_links (asset_id, owner_kind, owner_id) values ($1, 'item', $2)",
            mine, uuid4(),
        )
    # And its queue of file writes can only name its own folder.
    with pytest.raises(asyncpg.CheckViolationError):
        tenant_rows(
            other, "insert into media_ops (asset_id, op, key) values ($1, 'delete', $2)",
            uuid4(), f"shops/{DEMO_TENANT_ID}/{'a' * 64}-320.webp",
        )


# ── who may do what ───────────────────────────────────────


def test_an_agent_can_look_at_photos_but_not_change_them(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner, OWNER_EMAIL)
    sign_in(agent, AGENT_EMAIL)
    shown = upload(owner, photo(700, 500)).json()["photo"]
    assert agent.get("/api/media/photos").status_code == 200
    assert agent.get(f"/api/media/photos/{shown['id']}").status_code == 200
    assert upload(agent, photo(700, 500, seed=2)).status_code == 403
    assert agent.delete(f"/api/media/photos/{shown['id']}").status_code == 403
    assert agent.get("/api/media/usage").status_code == 403


def test_without_signing_in_the_workspace_routes_refuse_but_a_photo_address_is_public(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, stranger = client_factory(), client_factory()
    sign_in(owner, OWNER_EMAIL)
    shown = upload(owner, photo(700, 500)).json()["photo"]
    assert stranger.get("/api/media/photos").status_code == 401
    assert upload(stranger, photo(700, 500)).status_code == 401
    assert stranger.get(shown["urls"]["thumb"]).status_code == 200  # shown to customers


def test_the_local_file_route_serves_photos_and_nothing_else(client):
    shown = upload(client, photo(700, 500)).json()["photo"]
    key = shown["urls"]["thumb"].removeprefix("/api/media/file/")
    assert client.get(f"/api/media/file/{key}").status_code == 200
    for bad in (
        "../../../etc/passwd", "shops/x/y.webp", "_check/anything.txt",
        f"shops/{uuid4()}/{'a' * 64}-320.webp",  # well formed, not stored
    ):
        assert client.get(f"/api/media/file/{bad}").status_code == 404, bad


# ── the listing policy: report and remove ─────────────────


def test_back_office_can_take_a_photo_down_and_the_shop_cannot_put_it_back(client):
    data = photo(1000, 800, seed=9)
    shown = upload(client, data).json()["photo"]
    item = uuid4()
    on_shop(client, client.app.state.media.attach, UUID(shown["id"]), "item", item)
    assert len(stored(client)) == 3

    # The report names the photo by its public address.
    medium_key = shown["urls"]["medium"].removeprefix("/api/media/file")
    gone = client.post(
        f"{ADMIN}/media/remove",
        json={"ref": "https://media.alyr.qa" + medium_key,
              "reason": "Counterfeit goods, reported by a customer"},
    )
    assert gone.status_code == 200, gone.text
    assert gone.json() == {"removed": True, "business": "Al Noor Electricals"}

    # Down everywhere at once: the library, the item, the files.
    assert client.get(f"/api/media/photos/{shown['id']}").status_code == 404
    assert client.get("/api/media/photos").json()["total"] == 0
    assert on_shop(client, client.app.state.media.photos_for, "item", [item])[item] == []
    assert stored(client) == []
    assert client.get(shown["urls"]["medium"]).status_code == 404
    assert client.get("/api/media/usage").json()["photos"]["used"] == 0
    # The row stays, marked, so the same file cannot come back.
    row = rows("select state, removed_reason, removed_by from media_assets")[0]
    assert row["state"] == "removed" and "Counterfeit" in row["removed_reason"]
    again = upload(client, data)
    assert (again.status_code, again.json()["code"]) == (409, "photo_removed")
    assert ARABIC.search(again.json()["message_ar"])
    # ...but another photo is fine, and a shop's cap does not count the removed one.
    assert upload(client, photo(1000, 800, seed=10)).status_code == 201

    # And it is on the record.
    entries = client.get(f"{ADMIN}/audit").json()["entries"]
    removal = next(e for e in entries if e["action"] == "photo.removed")
    assert removal["subject_id"] == shown["id"]
    assert removal["business_id"] == str(DEMO_TENANT_ID)
    assert removal["detail"]["reason"] == "Counterfeit goods, reported by a customer"
    assert removal["detail"]["sha256"] == hashlib.sha256(data).hexdigest()


def test_removing_what_does_not_exist_or_is_not_a_photo_address_is_refused(client):
    shown = upload(client, photo(700, 500)).json()["photo"]
    ref = shown["urls"]["thumb"]
    for body in (
        {"ref": "https://example.com/some/picture.png", "reason": "not ours"},
        {"ref": ref, "reason": "x"},  # a reason is required
    ):
        assert client.post(f"{ADMIN}/media/remove", json=body).status_code == 422
    missing = f"shops/{uuid4()}/{'b' * 64}-320.webp"
    assert client.post(f"{ADMIN}/media/remove", json={"ref": missing, "reason": "nobody's"}) \
        .status_code == 404
    def removals():  # the audit log keeps every test's entries, so compare before and after
        entries = client.get(f"{ADMIN}/audit").json()["entries"]
        return [e for e in entries if e["action"] == "photo.removed"]

    before = len(removals())
    ok = {"ref": ref, "reason": "listing policy"}
    assert client.post(f"{ADMIN}/media/remove", json=ok).status_code == 200
    assert client.post(f"{ADMIN}/media/remove", json=ok).status_code == 404  # already down
    assert len(removals()) == before + 1


def test_a_removal_waits_for_the_store_and_is_not_lost(switch):
    client, store = switch
    shown = upload(client, photo(900, 600)).json()["photo"]
    store.down = True
    removed = client.post(
        f"{ADMIN}/media/remove", json={"ref": shown["urls"]["thumb"], "reason": "policy"}
    )
    assert removed.status_code == 200
    assert len(stored(client)) == 3  # the store could not be reached yet
    assert client.get(f"/api/media/photos/{shown['id']}").status_code == 404  # but it is down
    store.down = False
    make_due()
    drain(client)
    assert stored(client) == []


def test_the_media_back_office_is_for_alyr_staff_only(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner = client_factory()
    sign_in(owner, OWNER_EMAIL)
    shown = upload(owner, photo(700, 500)).json()["photo"]
    assert owner.get(f"{ADMIN}/media/usage").status_code == 403
    body = {"ref": shown["urls"]["thumb"], "reason": "I want it gone"}
    assert owner.post(f"{ADMIN}/media/remove", json=body).status_code == 403
    assert owner.get(f"/api/media/photos/{shown['id']}").status_code == 200  # still there
    anyone = client_factory()
    assert anyone.get(f"{ADMIN}/media/usage").status_code == 401


# ── the interface the catalog uses ────────────────────────


def test_photos_attach_to_and_detach_from_whatever_the_catalog_owns(client):
    service = client.app.state.media
    ids = [UUID(upload(client, photo(600, 400, seed=s)).json()["photo"]["id"]) for s in (1, 2, 3)]
    item, other = uuid4(), uuid4()

    assert on_shop(client, service.attach, ids[0], "item", item) == 0
    assert on_shop(client, service.attach, ids[1], "item", item) == 1
    assert on_shop(client, service.attach, ids[1], "item", item) == 1  # again: no change
    on_shop(client, service.attach, ids[2], "item", other)
    on_shop(client, service.attach, ids[0], "variant", other)  # one photo, two owners

    found = on_shop(client, service.photos_for, "item", [item, other, uuid4()])
    assert [p["id"] for p in found[item]] == [str(ids[0]), str(ids[1])]  # cover first
    assert [p["id"] for p in found[other]] == [str(ids[2])]
    assert list(found.values())[2] == []
    covers = on_shop(client, service.covers_for, "item", [item, other])
    assert covers[item]["id"] == str(ids[0]) and covers[item]["urls"]["large"]
    library = {p["id"]: p["links"] for p in client.get("/api/media/photos").json()["photos"]}
    assert library == {str(ids[0]): 2, str(ids[1]): 1, str(ids[2]): 1}

    # Taking one off an item keeps it in the library; a missing link is simply False.
    assert on_shop(client, service.detach, ids[0], "item", item) is True
    assert on_shop(client, service.detach, ids[0], "item", item) is False
    assert [p["id"] for p in on_shop(client, service.photos_for, "item", [item])[item]] == [
        str(ids[1])
    ]
    assert client.get(f"/api/media/photos/{ids[0]}").status_code == 200

    # Deleting a photo takes it off every item.
    assert client.delete(f"/api/media/photos/{ids[1]}").status_code == 200
    assert on_shop(client, service.photos_for, "item", [item])[item] == []


def test_an_item_holds_at_most_eight_photos_and_unknown_photos_are_refused(client):
    service = client.app.state.media
    item = uuid4()
    ids = [
        UUID(upload(client, photo(400, 300, seed=s)).json()["photo"]["id"]) for s in range(1, 10)
    ]
    for photo_id in ids[:8]:
        on_shop(client, service.attach, photo_id, "item", item)
    with pytest.raises(PhotoRefused) as full:
        on_shop(client, service.attach, ids[8], "item", item)
    assert full.value.code == "photo_owner_full" and "8" in full.value.en
    with pytest.raises(PhotoRefused) as unknown:
        on_shop(client, service.attach, uuid4(), "item", item)
    assert unknown.value.code == "photo_not_found"
    with pytest.raises(ValueError):
        on_shop(client, service.attach, ids[0], "Bad Kind!", item)
    assert len(on_shop(client, service.photos_for, "item", [item])[item]) == 8


def test_a_shop_can_delete_its_photo_and_its_files_leave_the_store(client):
    data = photo(900, 600)
    shown = upload(client, data).json()["photo"]
    assert len(stored(client)) == 3
    assert client.delete(f"/api/media/photos/{shown['id']}").json() == {"deleted": True}
    assert stored(client) == [] and rows("select 1 from media_assets") == []
    assert rows("select 1 from media_ops") == []
    assert client.delete(f"/api/media/photos/{shown['id']}").status_code == 404
    # Deleting is not a policy removal: the shop may upload the same photo again.
    assert upload(client, data).status_code == 201


def test_the_photo_view_for_nothing_is_the_placeholder_state():
    assert media.NO_PHOTO["state"] == "none" and media.NO_PHOTO["urls"] is None
    assert media.parse_photo_ref("nonsense") is None
    key = f"shops/{DEMO_TENANT_ID}/{'c' * 64}-320.webp"
    assert media.parse_photo_ref(f"https://media.alyr.qa/{key}?v=1") == (DEMO_TENANT_ID, "c" * 64)
    sizes = [{"width": 320, "height": 240}, {"width": 800, "height": 600}]
    assert media.pick(sizes, 320) is sizes[0]
    assert media.pick(sizes, 321) is sizes[1]
    assert media.pick(sizes, 1600) is sizes[1]  # the biggest we have


def test_no_photo_is_ever_a_server_error(client):
    # Whatever the request, the answer is a refusal a person can read, never a 500.
    for data in (
        b"", b"\x00" * 1000, b"\xff\xd8\xff", photo(100, 100)[:50], b"RIFF\x00\x00\x00\x00WEBP"
    ):
        assert upload(client, data).status_code in (201, 413, 415, 422)
    assert client.get(f"/api/media/photos/{uuid4()}").status_code == 404
    assert client.get("/api/media/photos/not-a-uuid").status_code == 422


def test_png_webp_and_phone_multi_picture_uploads_work_too(client):
    kinds = (("PNG", "image/png", {}), ("WEBP", "image/webp", {}),
             ("MPO", "image/jpeg", {"save_all": True, "append_images": [drawing(200, 150)]}))
    for seed, (fmt, kind, options) in enumerate(kinds, start=11):
        data = encode(drawing(800, 600, seed=seed), fmt, **options)
        assert upload(client, data, kind).status_code == 201, fmt
