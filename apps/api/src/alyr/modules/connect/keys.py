"""API keys: how another system proves it speaks for a shop (ALY-142, spec 015).

A key authenticates a **machine**, never a person. It can send sales, read documents and manage
webhooks for its own shop, depending on its scopes, and nothing else: it cannot open the
workspace, reach another module or another shop. Row-level security stays on: the shop is set
from the key, as a session sets it from a cookie.

What a key looks like: `alyr_k1_<prefix>_<secret>`. The prefix is eight random characters and is
not secret: it is how the shop tells its keys apart in the list, and how ALYR finds the row. The
secret is 256 bits from `secrets`. The key is shown **once**, when it is made. ALYR stores the
SHA-256 of the secret (a 256-bit random value needs no slow hash; the sign-in codes and session
cookies are kept the same way) and compares in constant time, and does the same work whether or
not the prefix exists, so timing says nothing.

Scopes: `sales:write` (send sales, credit notes), `documents:read` (look up a sale or a document,
fetch its PDF), `webhooks` (manage webhook addresses). A key with none of what a call needs gets
403 `scope_missing`.

**Rate limit.** Every key has a limit of requests a minute (120 to start, 1 to 1,000), counted in
the key's own row with one atomic update: a window of a minute, a count. Over the limit the call
is refused with 429 and `Retry-After` (the seconds to the next window). A refused call still
counts, so hammering a closed door does not open it. Fixed windows allow up to twice the limit
across a boundary; for a till that is fine, and it needs no Redis.

**Audit.** Making, replacing and revoking a key, and every management action a key performs
(webhooks), are on the activity record with who, and a key's last use is on its row.
"""

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.team import Actor
from alyr.db import Database
from alyr.modules.connect import terms
from alyr.modules.connect.words import ConnectError
from alyr.modules.documents import settings

SCOPES = ("sales:write", "documents:read", "webhooks")
MAX_ACTIVE = 10
DEFAULT_RATE = 120
KEY_FORMAT = re.compile(r"alyr_k1_([a-z0-9]{8})_([A-Za-z0-9_-]{43})")
# A known prefix with a wrong secret and an unknown prefix take the same path: this stands in for
# the stored hash of a key that does not exist.
_NOBODY = hashlib.sha256(b"no such key").hexdigest()


@dataclass(frozen=True)
class ApiKey:
    """A key that has been proved. Everything a request needs to act for the shop."""

    id: UUID
    tenant_id: UUID
    name: str
    prefix: str
    scopes: tuple[str, ...]
    rate_limit: int
    remaining: int
    reset_seconds: int

    def actor(self) -> Actor:
        """Who the activity record names: the key, never a person."""
        return Actor(None, f"API key {self.name}", via="api")

    def has(self, scope: str) -> bool:
        return scope in self.scopes


def _digest(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def present(row: asyncpg.Record) -> dict:
    def when(value):
        return value.isoformat() if value else None

    return {
        "id": str(row["id"]), "name": row["name"], "prefix": row["prefix"],
        "scopes": list(row["scopes"]), "rate_limit_per_minute": row["rate_limit_per_minute"],
        "created_by": row["created_by"], "created_at": when(row["created_at"]),
        "last_used_at": when(row["last_used_at"]), "revoked_at": when(row["revoked_at"]),
        "revoked_by": row["revoked_by"], "active": row["revoked_at"] is None,
    }


async def list_keys(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch("select * from api_keys order by created_at desc, id")
    return [present(r) for r in rows]


async def create(
    conn: asyncpg.Connection, actor: Actor, *, name: str, scopes: list[str],
    rate_limit: int | None = None,
) -> tuple[dict, str]:
    """Make a key. Returns its record and the key itself, which is shown this once. Needs the
    owner's acceptance of the connected sales terms (the permission to message customers)."""
    await terms.require(conn)
    name = " ".join((name or "").split())
    if not 1 <= len(name) <= 60:
        raise ConnectError("key_name_needed")
    chosen = list(dict.fromkeys(scopes or []))
    if not chosen or any(s not in SCOPES for s in chosen):
        raise ConnectError("scope_unknown")
    rate = DEFAULT_RATE if rate_limit is None else rate_limit
    if isinstance(rate, bool) or not 1 <= rate <= 1000:
        raise ConnectError("rate_limit_invalid")
    active = await conn.fetchval("select count(*) from api_keys where revoked_at is null")
    if active >= MAX_ACTIVE:
        raise ConnectError("too_many_keys", 409)
    secret = secrets.token_urlsafe(32)
    row = None
    for _ in range(5):  # a prefix clash across all shops is a 1-in-4-billion event; retry anyway
        prefix = secrets.token_hex(4)
        try:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "insert into api_keys (name, prefix, secret_hash, scopes, "
                    "rate_limit_per_minute, created_by, created_by_user) "
                    "values ($1, $2, $3, $4, $5, $6, $7) returning *",
                    name, prefix, _digest(secret), chosen, rate, actor.name, actor.id)
            break
        except asyncpg.UniqueViolationError:
            continue
    if row is None:
        raise ConnectError("key_invalid", 500)
    await team.record(conn, settings.SUBJECT, await settings.shop_id(conn), "api_key_created",
                      actor, None, {"key": row["prefix"], "name": name, "scopes": chosen,
                                    "rate_limit_per_minute": rate})
    return present(row), f"alyr_k1_{prefix}_{secret}"


async def revoke(conn: asyncpg.Connection, actor: Actor, key_id: UUID) -> dict:
    row = await conn.fetchrow(
        "update api_keys set revoked_at = coalesce(revoked_at, now()), "
        "revoked_by = coalesce(revoked_by, $2) where id = $1 returning *", key_id, actor.name)
    if row is None:
        raise ConnectError("key_not_found", 404)
    await team.record(conn, settings.SUBJECT, await settings.shop_id(conn), "api_key_revoked",
                      actor, None, {"key": row["prefix"], "name": row["name"]})
    return present(row)


async def authenticate(db: Database, header: str | None) -> ApiKey:
    """Prove a key from the `Authorization: Bearer ...` header, count the request against its
    limit and note its use. Raises `ConnectError`: 401 for a missing, malformed, unknown or
    wrong key (the same words for all, so nothing says which prefixes exist), 401
    `key_revoked` for a real key that was revoked, 429 over the limit."""
    scheme, _, token = (header or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ConnectError("key_missing", 401)
    found = KEY_FORMAT.fullmatch(token.strip())
    if found is None:
        # Not shaped like ours: still do the work of a real check, then say no.
        hmac.compare_digest(_NOBODY, _digest(token))
        raise ConnectError("key_invalid", 401)
    prefix, secret = found.groups()
    async with db.unscoped() as conn, conn.transaction():
        # The policy on `api_keys` lets this one row be read by its prefix before the shop is
        # known; the transaction-local setting ends with the transaction.
        await conn.execute("select set_config('app.api_key_prefix', $1, true)", prefix)
        row = await conn.fetchrow(
            "select id, tenant_id, name, scopes, rate_limit_per_minute, secret_hash, revoked_at "
            "from api_keys where prefix = $1", prefix)
    stored = row["secret_hash"] if row else _NOBODY
    proved = hmac.compare_digest(stored, _digest(secret))
    if row is None or not proved:
        raise ConnectError("key_invalid", 401)
    if row["revoked_at"] is not None:
        raise ConnectError("key_revoked", 401)
    async with db.tenant(row["tenant_id"]) as conn:
        counted = await conn.fetchrow(
            "update api_keys set "
            "window_count = case when window_start = date_trunc('minute', now()) "
            "                    then window_count + 1 else 1 end, "
            "window_start = date_trunc('minute', now()), "
            "last_used_at = case when last_used_at is null "
            "                    or last_used_at < now() - interval '1 minute' "
            "                    then now() else last_used_at end "
            "where id = $1 and revoked_at is null "
            "returning window_count, "
            "ceil(extract(epoch from (date_trunc('minute', now()) + interval '1 minute' - now())))"
            "::int as reset", row["id"])
    if counted is None:
        raise ConnectError("key_revoked", 401)
    limit = row["rate_limit_per_minute"]
    if counted["window_count"] > limit:
        raise ConnectError("rate_limited", 429, retry_after=max(1, counted["reset"]),
                           limit=limit)
    return ApiKey(
        id=row["id"], tenant_id=row["tenant_id"], name=row["name"], prefix=prefix,
        scopes=tuple(row["scopes"]), rate_limit=limit,
        remaining=max(0, limit - counted["window_count"]), reset_seconds=counted["reset"],
    )
