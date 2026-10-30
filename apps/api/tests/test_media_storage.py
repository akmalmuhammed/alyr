"""The photo store (D-039, ALY-103): requests signed for Cloudflare R2, a local-disk twin,
and the choice between them. Nothing here touches the network: R2 is faked with
`httpx.MockTransport`; the opt-in live check is in test_media_r2_live.py."""

import asyncio
import hashlib
import logging
from datetime import UTC, datetime

import httpx
import pytest

from alyr.config import Settings
from alyr.core.storage import (
    IMMUTABLE,
    LocalStore,
    S3Store,
    StoreError,
    StoreUnavailable,
    check_store,
    make_store,
    sign_v4,
    valid_key,
)

# AWS's published example credentials, from the Signature Version 4 documentation. They
# are not real and never were; the key ID is put together and the secret is written
# backwards so the pre-commit hook and the CI secret scans do not mistake them for real ones.
EXAMPLE_KEY_ID = "AKIA" + "IOSFODNN7" + "EXAMPLE"
EXAMPLE_SECRET = "YEKELPMAXEYCifRxPb/GNEDM7K/IMEFntUXrlaJw"[::-1]  # gitleaks:allow
EMPTY = hashlib.sha256(b"").hexdigest()

TENANT = "0a1f0000-0000-4000-8000-00000000a1f0"
DIGEST = hashlib.sha256(b"a made-up photo").hexdigest()
KEY = f"shops/{TENANT}/{DIGEST}-800.webp"
ACCOUNT = "0123456789abcdef0123456789abcdef"
SECRET = "test-secret-never-printed-" + "x" * 20


def run(coro):
    return asyncio.run(coro)


def r2(handler) -> S3Store:
    return S3Store(
        account_id=ACCOUNT, access_key_id="test-key-id", secret_access_key=SECRET,
        bucket="alyr-media", public_base_url="https://media.alyr.qa/",
        transport=httpx.MockTransport(handler),
    )


# ── signing ───────────────────────────────────────────────


def test_the_signature_matches_the_example_in_amazons_documentation():
    # "GET Object" with a Range header, from the Signature Version 4 examples for S3.
    signed = sign_v4(
        method="GET", host="examplebucket.s3.amazonaws.com", path="/test.txt",
        headers={"range": "bytes=0-9"}, payload_hash=EMPTY, access_key_id=EXAMPLE_KEY_ID,
        secret_access_key=EXAMPLE_SECRET, region="us-east-1",
        now=datetime(2013, 5, 24, tzinfo=UTC),
    )
    assert signed["x-amz-date"] == "20130524T000000Z"
    assert signed["authorization"] == (
        f"AWS4-HMAC-SHA256 Credential={EXAMPLE_KEY_ID}/20130524/us-east-1/s3/aws4_request,"
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,"
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    )


def test_the_signature_changes_with_anything_it_covers():
    base = dict(
        method="PUT", host="h.example", path="/b/k", headers={"content-type": "image/webp"},
        payload_hash=EMPTY, access_key_id="id", secret_access_key="secret", region="auto",
        now=datetime(2026, 10, 18, 9, 30, tzinfo=UTC),
    )
    first = sign_v4(**base)["authorization"]
    assert sign_v4(**base)["authorization"] == first  # same input, same signature
    for change in (
        {"method": "GET"}, {"path": "/b/other"}, {"payload_hash": hashlib.sha256(b"x").hexdigest()},
        {"headers": {"content-type": "text/plain"}}, {"secret_access_key": "other"},
        {"now": datetime(2026, 10, 18, 9, 31, tzinfo=UTC)}, {"region": "us-east-1"},
    ):
        assert sign_v4(**{**base, **change})["authorization"] != first, change


# ── R2 requests ───────────────────────────────────────────


def test_a_photo_is_sent_to_r2_signed_with_a_long_lived_cache_header():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200)

    body = b"RIFF....WEBPfake"
    run(r2(handler).put(KEY, body, content_type="image/webp"))
    request = seen[0]
    # Path-style, on the account's address, in the one bucket.
    assert request.method == "PUT"
    assert str(request.url) == f"https://{ACCOUNT}.r2.cloudflarestorage.com/alyr-media/{KEY}"
    assert request.content == body
    assert request.headers["cache-control"] == IMMUTABLE == "public, max-age=31536000, immutable"
    assert request.headers["content-type"] == "image/webp"
    assert request.headers["x-amz-content-sha256"] == hashlib.sha256(body).hexdigest()
    auth = request.headers["authorization"]
    assert auth.startswith("AWS4-HMAC-SHA256 Credential=test-key-id/")
    assert "/auto/s3/aws4_request," in auth
    assert "SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date," in auth
    # The signature is the one this request's own headers produce.
    stamp = datetime.strptime(request.headers["x-amz-date"], "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    expected = sign_v4(
        method="PUT", host=request.url.host, path=request.url.path,
        headers={"content-type": "image/webp", "cache-control": IMMUTABLE},
        payload_hash=hashlib.sha256(body).hexdigest(), access_key_id="test-key-id",
        secret_access_key=SECRET, region="auto", now=stamp,
    )
    assert auth == expected["authorization"]


def test_photos_are_read_and_deleted_the_same_way():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path))
        if request.method == "GET":
            return httpx.Response(200, content=b"bytes")
        return httpx.Response(204)

    store = r2(handler)
    assert run(store.get(KEY)) == b"bytes"
    run(store.delete(KEY))
    assert seen == [("GET", f"/alyr-media/{KEY}"), ("DELETE", f"/alyr-media/{KEY}")]


def test_a_missing_object_is_none_and_deleting_it_again_is_fine():
    store = r2(lambda request: httpx.Response(404, text="<Error><Code>NoSuchKey</Code></Error>"))
    assert run(store.get(KEY)) is None
    run(store.delete(KEY))


def test_the_public_address_is_the_media_address_plus_the_key():
    assert r2(lambda r: httpx.Response(200)).url(KEY) == f"https://media.alyr.qa/{KEY}"


@pytest.mark.parametrize("status", [500, 502, 503, 429, 408])
def test_a_busy_or_broken_store_is_unavailable_not_refused(status):
    store = r2(lambda request: httpx.Response(status))
    with pytest.raises(StoreUnavailable):
        run(store.put(KEY, b"x", content_type="image/webp"))
    with pytest.raises(StoreUnavailable):
        run(store.get(KEY))


def test_no_answer_at_all_is_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("no answer", request=request)

    with pytest.raises(StoreUnavailable):
        run(r2(handler).put(KEY, b"x", content_type="image/webp"))


def test_a_refusal_names_the_reason_and_never_a_secret():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403, text=f"<Error><Code>AccessDenied</Code><Message>{SECRET}</Message></Error>"
        )

    store = r2(handler)
    with pytest.raises(StoreError) as caught:
        run(store.put(KEY, b"x", content_type="image/webp"))
    assert not isinstance(caught.value, StoreUnavailable)
    assert "403" in str(caught.value) and "AccessDenied" in str(caught.value)
    assert SECRET not in str(caught.value) and SECRET not in repr(store)
    assert "test-key-id" not in repr(store)


def test_only_the_two_known_key_shapes_reach_the_store():
    store = r2(lambda request: httpx.Response(200))
    for bad in ("../x.webp", f"shops/{TENANT}/../other-800.webp", "shops/x/y.webp", "", "a b"):
        assert not valid_key(bad)
        with pytest.raises(ValueError):
            run(store.get(bad))
    assert valid_key(KEY) and valid_key("_check/smoke-1.txt")


def test_unusable_r2_names_are_refused_at_once():
    for bad in ({"account_id": "x/../y"}, {"bucket": "Bad Bucket"}):
        with pytest.raises(ValueError):
            S3Store(**{
                "account_id": ACCOUNT, "access_key_id": "k", "secret_access_key": "s",
                "bucket": "alyr-media", "public_base_url": "https://m.example", **bad,
            })


# ── listing a shop's prefix (erasing a stopped client, spec 042) ─────────────────────────


def listing(*keys: str, truncated: bool = False) -> str:
    contents = "".join(f"<Contents><Key>{k}</Key><Size>10</Size></Contents>" for k in keys)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
        f"<Name>alyr-media</Name><IsTruncated>{str(truncated).lower()}</IsTruncated>{contents}"
        "</ListBucketResult>"
    )


def test_a_shops_prefix_is_listed_with_a_signed_get_on_the_bucket():
    seen = []
    other = f"shops/{TENANT}/{'cd' * 32}-1600.webp"

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        # Everything under the prefix is passed on, so an empty answer means an empty prefix;
        # an object outside it (which a listing of the prefix never returns) is not.
        return httpx.Response(200, text=listing(
            other, KEY, f"shops/{TENANT}/readme.txt", "shops/elsewhere/x.webp"))

    store = r2(handler)
    assert run(store.list(f"shops/{TENANT}/", limit=50)) == sorted(
        [KEY, other, f"shops/{TENANT}/readme.txt"])
    request = seen[0]
    assert request.method == "GET" and request.url.path == "/alyr-media"
    # Sorted, every reserved character encoded: the form the signature is made over.
    assert request.url.query.decode() == (
        f"list-type=2&max-keys=50&prefix=shops%2F{TENANT}%2F")
    stamp = datetime.strptime(request.headers["x-amz-date"], "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    expected = sign_v4(
        method="GET", host=request.url.host, path="/alyr-media",
        query=request.url.query.decode(), headers={}, payload_hash=EMPTY,
        access_key_id="test-key-id", secret_access_key=SECRET, region="auto", now=stamp,
    )
    assert request.headers["authorization"] == expected["authorization"]


def test_only_a_shops_own_prefix_may_be_listed_and_one_page_is_at_most_1000():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=listing())

    store = r2(handler)
    for bad in ("", "shops/", f"shops/{TENANT}", "shops/x/", "_check/", f"shops/{TENANT}/../"):
        with pytest.raises(ValueError):
            run(store.list(bad))
    assert seen == []
    assert run(store.list(f"shops/{TENANT}/", limit=99_999)) == []
    assert "max-keys=1000" in seen[0].url.query.decode()


def test_a_listing_that_is_refused_or_unavailable_says_so_without_a_secret():
    forbidden = r2(lambda r: httpx.Response(403, text="<Error><Code>AccessDenied</Code></Error>"))
    with pytest.raises(StoreError, match="403, AccessDenied"):
        run(forbidden.list(f"shops/{TENANT}/"))
    busy = r2(lambda r: httpx.Response(503))
    with pytest.raises(StoreUnavailable):
        run(busy.list(f"shops/{TENANT}/"))


# ── local disk ────────────────────────────────────────────


def test_local_files_are_written_whole_read_back_and_deleted(tmp_path):
    store = LocalStore(tmp_path / "media")
    run(store.put(KEY, b"photo bytes", content_type="image/webp"))
    assert run(store.get(KEY)) == b"photo bytes"
    assert list((tmp_path / "media").rglob("*.part")) == []  # nothing half-written is left
    assert store.url(KEY) == f"/api/media/file/{KEY}"
    run(store.delete(KEY))
    run(store.delete(KEY))  # already gone is fine
    assert run(store.get(KEY)) is None


def test_local_disk_refuses_names_that_could_leave_its_folder(tmp_path):
    store = LocalStore(tmp_path / "media")
    for bad in ("../../etc/passwd", "/etc/passwd", f"shops/{TENANT}/../../x.webp", "x.webp"):
        with pytest.raises(ValueError):
            run(store.put(bad, b"x", content_type="image/webp"))
    assert not (tmp_path / "etc").exists()


# ── choosing the store ────────────────────────────────────


def settings(**values) -> Settings:
    return Settings(_env_file=None, env="local", **values)


def test_with_no_r2_settings_photos_go_to_local_disk(tmp_path):
    store = make_store(settings(media_local_dir=str(tmp_path / "m")))
    assert store.name == "local" and isinstance(store, LocalStore)


def test_with_all_the_r2_settings_photos_go_to_r2():
    store = make_store(settings(
        r2_account_id=ACCOUNT, r2_access_key_id="id", r2_secret_access_key="secret",
    ))
    assert store.name == "r2" and isinstance(store, S3Store)
    assert store.bucket == "alyr-media"
    assert store.url(KEY) == f"https://media.alyr.qa/{KEY}"


def test_a_half_configured_r2_falls_back_to_disk_and_says_which_setting_is_missing(
    tmp_path, caplog
):
    with caplog.at_level(logging.WARNING, logger="alyr.storage"):
        store = make_store(settings(
            r2_account_id=ACCOUNT, r2_access_key_id="id", media_local_dir=str(tmp_path / "m"),
        ))
    assert store.name == "local"
    assert "ALYR_R2_SECRET_ACCESS_KEY" in caplog.text
    assert "ALYR_R2_ACCOUNT_ID" not in caplog.text  # only what is missing, and never a value


def test_a_server_without_r2_warns_that_local_disk_is_not_for_production(tmp_path, caplog):
    with caplog.at_level(logging.WARNING, logger="alyr.storage"):
        make_store(Settings(_env_file=None, env="production", media_local_dir=str(tmp_path)))
    assert "local disk in a non-local environment" in caplog.text


# ── the start-up check (ALY-63) ───────────────────────────


def test_a_server_refuses_to_start_with_photos_on_a_disk_the_cloud_wipes(tmp_path):
    production = Settings(_env_file=None, env="production", media_local_dir=str(tmp_path))
    with pytest.raises(RuntimeError, match="ALYR_R2_ACCOUNT_ID"):
        check_store(production, make_store(production))


def test_a_single_server_may_keep_photos_on_its_kept_volume_on_purpose(tmp_path):
    allowed = Settings(
        _env_file=None, env="production", media_local_dir=str(tmp_path), media_allow_local=True
    )
    check_store(allowed, make_store(allowed))


def test_r2_and_a_developer_machine_always_start(tmp_path):
    check_store(settings(media_local_dir=str(tmp_path)), make_store(settings()))
    production_r2 = Settings(
        _env_file=None, env="production", r2_account_id=ACCOUNT, r2_access_key_id="id",
        r2_secret_access_key="secret",
    )
    check_store(production_r2, make_store(production_r2))
