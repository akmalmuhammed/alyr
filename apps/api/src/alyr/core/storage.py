"""Where product photos are kept (D-039, ALY-103): one small interface, two backends.

- `S3Store` talks to Cloudflare R2 through its S3-compatible API, with requests signed
  by hand (AWS Signature Version 4, region "auto", path-style) so no heavy SDK is needed.
  Nothing here is R2-only: any S3-compatible store works by changing the settings (D-011).
- `LocalStore` keeps files on disk. It is the backend for development and for every
  test, and what the app falls back to when R2 is not configured.

Objects are named by their content, so a name never points at different bytes and can be
cached for a year. Only two key shapes are ever accepted, which keeps a bad key from
reaching either backend.
"""

import asyncio
import hashlib
import hmac
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol
from urllib.parse import parse_qsl, quote
from uuid import uuid4

import httpx

log = logging.getLogger("alyr.storage")

# Content-addressed names never change meaning, so browsers and Cloudflare may keep them.
IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"

# shops/<shop id>/<sha-256 of the uploaded file>-<long side in pixels>.webp
PHOTO_KEY = re.compile(
    r"shops/(?P<tenant>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    r"/(?P<digest>[0-9a-f]{64})-(?P<size>[0-9]{1,5})\.webp"
)
# Objects the live smoke test writes and deletes. Never photos.
CHECK_KEY = re.compile(r"_check/[A-Za-z0-9_.-]{1,80}")


def valid_key(key: str) -> bool:
    return bool(PHOTO_KEY.fullmatch(key) or CHECK_KEY.fullmatch(key))


class StoreError(Exception):
    """The store refused the request (wrong credentials, wrong bucket). Retrying the same
    request will not help until someone fixes the settings."""


class StoreUnavailable(StoreError):
    """The store did not answer, or answered that it is busy. Try again later."""


class Store(Protocol):
    name: str

    async def put(
        self, key: str, data: bytes, *, content_type: str, cache_control: str = IMMUTABLE
    ) -> None: ...

    async def get(self, key: str) -> bytes | None: ...

    async def delete(self, key: str) -> None: ...

    def url(self, key: str) -> str:
        """Where a browser fetches this object."""


# ── local disk ────────────────────────────────────────────


class LocalStore:
    """Files under one folder. A file appears all at once or not at all."""

    name = "local"

    def __init__(self, root: Path, url_prefix: str = "/api/media/file") -> None:
        self.root = Path(root)
        self.url_prefix = url_prefix.rstrip("/")

    def _path(self, key: str) -> Path:
        if not valid_key(key):
            raise ValueError("not a storable key")
        return self.root / key

    async def put(
        self, key: str, data: bytes, *, content_type: str, cache_control: str = IMMUTABLE
    ) -> None:
        # Type and caching are not kept: the route that serves the file knows them.
        await asyncio.to_thread(self._write, self._path(key), data)

    @staticmethod
    def _write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_name(f".{path.name}.{uuid4().hex}.part")
        try:
            part.write_bytes(data)
            os.replace(part, path)
        finally:
            part.unlink(missing_ok=True)

    async def get(self, key: str) -> bytes | None:
        path = self._path(key)

        def read() -> bytes | None:
            try:
                return path.read_bytes()
            except FileNotFoundError:
                return None

        return await asyncio.to_thread(read)

    async def delete(self, key: str) -> None:
        path = self._path(key)
        await asyncio.to_thread(lambda: path.unlink(missing_ok=True))

    def url(self, key: str) -> str:
        return f"{self.url_prefix}/{key}"


# ── Cloudflare R2, and any other S3-compatible store ──────

_SAFE = "-_.~"


def sign_v4(
    *, method: str, host: str, path: str, query: str = "", headers: dict[str, str],
    payload_hash: str, access_key_id: str, secret_access_key: str, region: str,
    now: datetime, service: str = "s3",
) -> dict[str, str]:
    """AWS Signature Version 4, the header form, as S3 and R2 expect it.

    `path` is the request path exactly as it goes on the wire (already percent-encoded
    once, which is the only encoding S3 uses). Returns the headers to add to the request:
    `x-amz-date`, `x-amz-content-sha256` and `authorization`. Every header in `headers`
    is signed, so it must be sent unchanged.
    """
    stamp = now.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    day = stamp[:8]
    signed = {k.lower(): " ".join(v.split()) for k, v in headers.items()}
    signed["host"] = host
    signed["x-amz-date"] = stamp
    signed["x-amz-content-sha256"] = payload_hash
    names = sorted(signed)
    canonical_query = "&".join(
        f"{quote(k, safe=_SAFE)}={quote(v, safe=_SAFE)}"
        for k, v in sorted(parse_qsl(query, keep_blank_values=True))
    )
    canonical = "\n".join([
        method, path, canonical_query,
        "".join(f"{n}:{signed[n]}\n" for n in names),
        ";".join(names), payload_hash,
    ])
    scope = f"{day}/{region}/{service}/aws4_request"
    to_sign = "\n".join([
        "AWS4-HMAC-SHA256", stamp, scope, hashlib.sha256(canonical.encode()).hexdigest()
    ])

    def mac(key: bytes, text: str) -> bytes:
        return hmac.new(key, text.encode(), hashlib.sha256).digest()

    key = mac(("AWS4" + secret_access_key).encode(), day)
    for part in (region, service, "aws4_request"):
        key = mac(key, part)
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    return {
        "x-amz-date": stamp,
        "x-amz-content-sha256": payload_hash,
        "authorization": (
            f"AWS4-HMAC-SHA256 Credential={access_key_id}/{scope},"
            f"SignedHeaders={';'.join(names)},Signature={signature}"
        ),
    }


_CODE = re.compile(r"<Code>([A-Za-z0-9_.-]{1,60})</Code>")


class S3Store:
    """Path-style requests to `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`.

    A new connection per call: uploads are rare, and one long-lived client would be tied
    to the event loop that first used it.
    """

    name = "r2"

    def __init__(
        self, *, account_id: str, access_key_id: str, secret_access_key: str, bucket: str,
        public_base_url: str, region: str = "auto",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        # These go into a web address, so refuse anything but plain names.
        if not re.fullmatch(r"[A-Za-z0-9-]{4,64}", account_id):
            raise ValueError("the R2 account id looks wrong")
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
            raise ValueError("the R2 bucket name looks wrong")
        self.host = f"{account_id}.r2.cloudflarestorage.com"
        self.bucket = bucket
        self.region = region
        self.public_base_url = public_base_url.rstrip("/")
        self._key_id = access_key_id
        self._secret = secret_access_key
        self._transport = transport

    def __repr__(self) -> str:  # never show the keys
        return f"S3Store({self.host}/{self.bucket})"

    def url(self, key: str) -> str:
        return f"{self.public_base_url}/{key}"

    async def _request(
        self, method: str, key: str, *, body: bytes = b"", headers: dict[str, str] | None = None
    ) -> httpx.Response:
        if not valid_key(key):
            raise ValueError("not a storable key")
        path = quote(f"/{self.bucket}/{key}", safe="/")
        sent = dict(headers or {})
        sent.update(sign_v4(
            method=method, host=self.host, path=path, headers=sent,
            payload_hash=hashlib.sha256(body).hexdigest(),
            access_key_id=self._key_id, secret_access_key=self._secret,
            region=self.region, now=datetime.now(UTC),
        ))
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=httpx.Timeout(20.0, connect=5.0)
            ) as http:
                response = await http.request(
                    method, f"https://{self.host}{path}", content=body or None, headers=sent
                )
        except httpx.HTTPError as error:
            raise StoreUnavailable(f"{type(error).__name__} talking to the store") from error
        if response.status_code in (408, 429) or response.status_code >= 500:
            raise StoreUnavailable(f"the store answered {response.status_code}")
        return response

    @staticmethod
    def _refused(response: httpx.Response) -> StoreError:
        # The status and S3's short error code only: never headers, never the request.
        code = _CODE.search(response.text)
        return StoreError(
            f"the store refused the request ({response.status_code}"
            f"{', ' + code.group(1) if code else ''})"
        )

    async def put(
        self, key: str, data: bytes, *, content_type: str, cache_control: str = IMMUTABLE
    ) -> None:
        response = await self._request(
            "PUT", key, body=data,
            headers={"content-type": content_type, "cache-control": cache_control},
        )
        if response.status_code != 200:
            raise self._refused(response)

    async def get(self, key: str) -> bytes | None:
        response = await self._request("GET", key)
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise self._refused(response)
        return response.content

    async def delete(self, key: str) -> None:
        response = await self._request("DELETE", key)
        # Deleting what is already gone is not an error: deletes are retried.
        if response.status_code not in (200, 204, 404):
            raise self._refused(response)


def make_store(settings) -> Store:
    """R2 when it is fully configured, otherwise local disk. Never raises for a missing
    setting: a server that cannot reach R2 still starts and still serves orders."""
    keys = {
        "ALYR_R2_ACCOUNT_ID": settings.r2_account_id,
        "ALYR_R2_ACCESS_KEY_ID": settings.r2_access_key_id,
        "ALYR_R2_SECRET_ACCESS_KEY": settings.r2_secret_access_key,
    }
    if all(keys.values()):
        try:
            return S3Store(
                account_id=settings.r2_account_id,
                access_key_id=settings.r2_access_key_id,
                secret_access_key=settings.r2_secret_access_key,
                bucket=settings.r2_bucket, public_base_url=settings.media_base_url,
            )
        except ValueError as error:
            log.warning("photo storage: R2 settings unusable (%s); using local disk", error)
    elif any(keys.values()):
        missing = ", ".join(name for name, value in keys.items() if not value)
        log.warning("photo storage: R2 is half configured (missing %s); using local disk", missing)
    if settings.env != "local":
        log.warning("photo storage: local disk in a non-local environment; photos are lost "
                    "if this machine's disk is")
    return LocalStore(Path(settings.media_local_dir))


def check_store(settings, store: Store) -> None:
    """Called when the API and the worker start (ALY-63): outside a developer machine,
    photos on local disk stop the start, unless the server says on purpose that its disk is
    kept (`media_allow_local`). In a cloud container the disk is wiped on every restart and
    each copy of the API has its own, so photos would vanish or appear only sometimes."""
    if store.name == "local" and settings.env != "local" and not settings.media_allow_local:
        raise RuntimeError(
            "photo storage: R2 is not configured, and local disk is not allowed outside a "
            "developer machine. Set ALYR_R2_ACCOUNT_ID, ALYR_R2_ACCESS_KEY_ID and "
            "ALYR_R2_SECRET_ACCESS_KEY, or ALYR_MEDIA_ALLOW_LOCAL=true on a single server "
            "whose ALYR_MEDIA_LOCAL_DIR is a kept volume."
        )
