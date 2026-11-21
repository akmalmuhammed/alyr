"""The apps that may ask to connect (spec 067, "Endpoints"): how one is registered, how a client
ID that is an address is read, and how a redirect is matched.

Two ways in, both required by the apps' own documentation (Claude registers itself by Dynamic
Client Registration, RFC 7591; ChatGPT prefers a Client ID Metadata Document, an HTTPS address that
is the client's ID and serves its own description). Neither is trusted for anything but showing the
person who is asking and where they will be sent back to: the name an app gives itself is shown
beside the address it will return to, and the decision is the person's.

Public clients only. No client secret is ever issued, and a document that asks for one is refused.
"""

import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from alyr.config import get_settings
from alyr.db import Database
from alyr.modules.connect import ssrf
from alyr.modules.mcp import tokens

log = logging.getLogger("alyr.mcp")

MAX_REDIRECTS = 10
MAX_NAME = 80
MAX_DOCUMENT_BYTES = 16 * 1024
MAX_CLIENTS = 5000
UNUSED_DAYS = 7
CIMD_MIN_CACHE = timedelta(minutes=5)
CIMD_MAX_CACHE = timedelta(hours=24)
CIMD_DEFAULT_CACHE = timedelta(hours=1)
LOOPBACK = {"127.0.0.1", "localhost", "::1"}

# Tests answer for the outside; nothing else should (like `core/alerts.transport`).
transport = None  # an httpx transport, in tests


class ClientError(Exception):
    """A client or its redirect is refused. `code` is the OAuth error; `description` is safe to
    show and says nothing about what is behind it."""

    def __init__(self, code: str, description: str, status: int = 400) -> None:
        super().__init__(description)
        self.code, self.description, self.status = code, description, status


@dataclass(frozen=True)
class Client:
    client_id: str
    kind: str
    name: str
    redirect_uris: tuple[str, ...]
    client_uri: str | None = None

    @property
    def host(self) -> str:
        """The address to show beside the name: where the client's own document lives."""
        return (urlsplit(self.client_id).hostname or "") if self.kind == "cimd" else ""


def clean_name(value) -> str:
    text = "".join(c for c in str(value or "") if c.isprintable())
    text = " ".join(text.split())
    return text[:MAX_NAME]


def is_loopback(uri: str) -> bool:
    parts = urlsplit(uri)
    return parts.scheme == "http" and (parts.hostname or "") in LOOPBACK


def valid_redirect(uri) -> bool:
    """HTTPS, or a loopback address over http (RFC 8252): the only two the MCP authorization
    specification allows. No fragment, no user name, nothing that is not a plain address."""
    if not isinstance(uri, str) or not uri or len(uri) > 500:
        return False
    if any(c.isspace() or ord(c) < 32 for c in uri):
        return False
    try:
        parts = urlsplit(uri)
        parts.port  # noqa: B018  (raises on a bad port)
    except ValueError:
        return False
    if parts.fragment or parts.username is not None or parts.password is not None:
        return False
    if not parts.hostname:
        return False
    if parts.scheme == "https":
        return True
    return parts.scheme == "http" and parts.hostname in LOOPBACK


def redirect_matches(registered: list[str] | tuple[str, ...], presented: str) -> bool:
    """Exact match against what the client registered. The one exception is a loopback address,
    whose port a native app picks each time (RFC 8252, section 7.3): there the port is ignored and
    the scheme, host and path must still match."""
    if presented in registered:
        return True
    if not valid_redirect(presented) or not is_loopback(presented):
        return False
    wanted = urlsplit(presented)
    for item in registered:
        if not is_loopback(item):
            continue
        have = urlsplit(item)
        if (have.hostname, have.path, have.query) == (wanted.hostname, wanted.path, wanted.query):
            return True
    return False


def _row(record) -> Client:
    return Client(
        record["app_id"], record["kind"], record["name"], tuple(record["redirect_uris"]),
        record["client_uri"],
    )


async def register(db: Database, body: dict) -> dict:
    """RFC 7591: make a public client. Raises `ClientError("invalid_client_metadata" |
    "invalid_redirect_uri", ...)`."""
    if not isinstance(body, dict):
        raise ClientError("invalid_client_metadata", "send a JSON object")
    uris = body.get("redirect_uris")
    if (
        not isinstance(uris, list) or not uris or len(uris) > MAX_REDIRECTS
        or not all(valid_redirect(u) for u in uris)
    ):
        raise ClientError(
            "invalid_redirect_uri",
            "redirect_uris must list up to 10 https addresses (or loopback addresses)",
        )
    method = body.get("token_endpoint_auth_method", "none")
    if method != "none":
        raise ClientError(
            "invalid_client_metadata", "only public clients are supported: use none"
        )
    grants = body.get("grant_types", ["authorization_code"])
    if not isinstance(grants, list) or not set(grants) <= {"authorization_code", "refresh_token"}:
        raise ClientError(
            "invalid_client_metadata", "grant_types may be authorization_code and refresh_token"
        )
    responses = body.get("response_types", ["code"])
    if not isinstance(responses, list) or set(responses) != {"code"}:
        raise ClientError("invalid_client_metadata", "response_types must be code")
    name = clean_name(body.get("client_name")) or "An app"
    site = body.get("client_uri")
    site = site if isinstance(site, str) and valid_redirect(site) and site.startswith(
        "https://") else None
    unique = list(dict.fromkeys(uris))
    async with db.unscoped() as conn, conn.transaction():
        total = await conn.fetchval("select count(*) from mcp_clients")
        if total >= MAX_CLIENTS:
            await conn.execute(
                "delete from mcp_clients c where c.kind = 'dcr' "
                "and c.created_at < now() - make_interval(days => $1) "
                "and not exists (select 1 from mcp_grants g where g.app_id = c.app_id)",
                UNUSED_DAYS,
            )
            total = await conn.fetchval("select count(*) from mcp_clients")
            if total >= MAX_CLIENTS:
                raise ClientError(
                    "temporarily_unavailable", "too many apps are registered; try later", 503
                )
        client_id = tokens.new(tokens.CLIENT)
        await conn.execute(
            "insert into mcp_clients (app_id, kind, name, redirect_uris, client_uri, "
            "expires_at) values ($1, 'dcr', $2, $3, $4, now() + interval '3650 days')",
            client_id, name, unique, site,
        )
    return {
        "client_id": client_id,
        "client_id_issued_at": int(datetime.now(UTC).timestamp()),
        "client_name": name,
        "redirect_uris": unique,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    }


def _cache_for(headers: dict[str, str]) -> timedelta:
    match = re.search(r"max-age=(\d+)", headers.get("cache-control", ""))
    if not match:
        return CIMD_DEFAULT_CACHE
    return max(CIMD_MIN_CACHE, min(CIMD_MAX_CACHE, timedelta(seconds=int(match.group(1)))))


def _document_url_ok(client_id: str) -> bool:
    if not isinstance(client_id, str) or len(client_id) > 500 or not client_id.startswith("https://"):
        return False
    try:
        parts = urlsplit(client_id)
    except ValueError:
        return False
    if parts.query or parts.fragment or parts.username is not None or not parts.hostname:
        return False
    if parts.path in ("", "/") or any(seg in (".", "..") for seg in parts.path.split("/")):
        return False
    return True


async def _fetch_document(client_id: str) -> tuple[Client, timedelta]:
    settings = get_settings()
    allow_local = settings.env == "local" and settings.webhook_allow_local
    refused = ClientError("invalid_client", "the app's description could not be read")
    try:
        status, body, headers = await ssrf.get(
            client_id, max_bytes=MAX_DOCUMENT_BYTES, allow_local=allow_local,
            transport=transport,
        )
    except ssrf.Blocked as error:
        log.info("client metadata not read: %s", error.reason)
        raise refused from error
    if status != 200 or "json" not in headers.get("content-type", "").lower():
        raise refused
    try:
        document = json.loads(body)
    except ValueError as error:
        raise refused from error
    if not isinstance(document, dict) or document.get("client_id") != client_id:
        raise refused
    uris = document.get("redirect_uris")
    if (
        not isinstance(uris, list) or not uris or len(uris) > MAX_REDIRECTS
        or not all(valid_redirect(u) for u in uris)
    ):
        raise refused
    if document.get("token_endpoint_auth_method", "none") != "none":
        raise refused
    name = clean_name(document.get("client_name"))
    if not name:
        raise refused
    site = document.get("client_uri")
    site = site if isinstance(site, str) and _document_url_ok(site + "/x") else None
    client = Client(client_id, "cimd", name, tuple(dict.fromkeys(uris)), site)
    return client, _cache_for(headers)


async def lookup(db: Database, client_id: str) -> Client:
    """The client with this ID: a registered one, or the document at an address, read now and kept
    for as long as its own headers say (five minutes to a day). Raises `ClientError`."""
    if not isinstance(client_id, str) or not client_id or len(client_id) > 500:
        raise ClientError("invalid_client", "unknown app")
    async with db.unscoped() as conn:
        found = await conn.fetchrow(
            "select * from mcp_clients where app_id = $1 and expires_at > now()", client_id
        )
    if found is not None:
        return _row(found)
    if not client_id.startswith("https://"):
        raise ClientError("invalid_client", "unknown app")
    if not _document_url_ok(client_id):
        raise ClientError("invalid_client", "unknown app")
    client, keep = await _fetch_document(client_id)
    async with db.unscoped() as conn:
        await conn.execute(
            "insert into mcp_clients (app_id, kind, name, redirect_uris, client_uri, "
            "fetched_at, expires_at) values ($1, 'cimd', $2, $3, $4, now(), now() + $5) "
            "on conflict (app_id) do update set name = excluded.name, "
            "redirect_uris = excluded.redirect_uris, client_uri = excluded.client_uri, "
            "fetched_at = now(), expires_at = excluded.expires_at",
            client.client_id, client.name, list(client.redirect_uris), client.client_uri, keep,
        )
    return client
