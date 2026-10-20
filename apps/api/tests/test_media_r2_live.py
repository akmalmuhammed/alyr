"""Opt-in smoke test against the real Cloudflare R2 bucket (ALY-103). Skipped unless asked.

It writes one small object under `_check/`, reads it back through the S3 interface and
through the public media address, and deletes it. It never touches a shop's folder, and it
cleans up after itself even if a check fails. Run it from `apps/api`, where `.env` holds the
five R2 settings:

    ALYR_TEST_R2_LIVE=1 uv run pytest tests/test_media_r2_live.py -v -s

or, where Windows blocks the database driver:

    ALYR_DOCKER_FLAGS="-e ALYR_TEST_R2_LIVE=1" scripts/api-in-docker.sh \
        uv run pytest tests/test_media_r2_live.py -v -s

Nothing it prints is secret: the keys are never shown.
"""

import asyncio
import io
import os
from uuid import uuid4

import httpx
import pytest
from PIL import Image

from alyr.config import Settings
from alyr.core.storage import IMMUTABLE, NO_CACHE, S3Store, make_store

pytestmark = pytest.mark.skipif(
    os.environ.get("ALYR_TEST_R2_LIVE") != "1",
    reason="live R2 smoke test: set ALYR_TEST_R2_LIVE=1 (it uses the real bucket)",
)


def live_store() -> S3Store:
    store = make_store(Settings())  # reads apps/api/.env, as the app does
    assert isinstance(store, S3Store), (
        "the R2 settings are incomplete: set ALYR_R2_ACCOUNT_ID, ALYR_R2_ACCESS_KEY_ID and "
        "ALYR_R2_SECRET_ACCESS_KEY (and ALYR_R2_BUCKET, ALYR_MEDIA_BASE_URL) in apps/api/.env"
    )
    return store


def test_r2_write_read_through_the_media_address_and_delete():
    async def scenario():
        store = live_store()
        key = f"_check/smoke-{uuid4().hex}.txt"
        body = f"alyr r2 smoke test {uuid4().hex}".encode()
        try:
            await store.put(key, body, content_type="text/plain", cache_control=NO_CACHE)
            assert await store.get(key) == body  # through the S3 interface

            async with httpx.AsyncClient(timeout=20) as http:  # through the public address
                public = await http.get(store.url(key), headers={"cache-control": "no-cache"})
            assert public.status_code == 200, (
                f"{store.url(key)} answered {public.status_code}: is the custom domain on?"
            )
            assert public.content == body
            assert public.headers["content-type"].startswith("text/plain")
        finally:
            await store.delete(key)
        assert await store.get(key) is None  # gone
        await store.delete(key)  # deleting what is already gone is fine

    asyncio.run(scenario())


def test_the_media_address_keeps_the_long_cache_header_photos_are_stored_with():
    """Photos are named by their content, so they are stored with a one-year `immutable`
    cache header. If Cloudflare's own cache settings overwrite it, this says so."""

    async def scenario():
        store = live_store()
        key = f"_check/smoke-{uuid4().hex}.webp"
        picture = io.BytesIO()
        Image.new("RGB", (8, 8), (200, 80, 40)).save(picture, "WEBP")
        try:
            await store.put(key, picture.getvalue(), content_type="image/webp")
            async with httpx.AsyncClient(timeout=20) as http:
                public = await http.get(store.url(key))
            assert public.status_code == 200
            assert public.headers["content-type"] == "image/webp"
            cache = public.headers.get("cache-control", "")
            assert "immutable" in cache and "max-age=31536000" in cache, (
                f"the media address sends cache-control {cache!r}, not {IMMUTABLE!r}"
            )
        finally:
            await store.delete(key)

    asyncio.run(scenario())
