"""The authorization server's work (spec 067, ALY-288): the sign-in request, the grant, the code,
the access and refresh tokens, and how they end.

What is kept is only hashes of random values (`tokens.py`). A token names a grant; it never says
who the person is or what they may do. On every call the grant, the person's membership of the
business and the business's switches are read again (`access.py`), so ending any of them ends the
token at once.

Refusals are computed and returned after the transaction that counted them has committed: raising
inside it would undo the count (a replayed code, a rotated refresh token used twice) and the next
attempt would meet an unchanged world.
"""

import base64
import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlencode, urlsplit
from uuid import UUID

import asyncpg

from alyr.config import Settings
from alyr.core.team import Actor
from alyr.db import Database
from alyr.modules.mcp import audit, scopes, shop, tokens
from alyr.modules.mcp.clients import Client

REQUEST_MINUTES = 15
CODE_SECONDS = 120
ACCESS_SECONDS = 30 * 60
REFRESH_DAYS = 30
GRANT_DAYS = 90
MAX_LIVE_GRANTS = 10
VERIFIER = re.compile(r"[A-Za-z0-9\-._~]{43,128}")
CHALLENGE = re.compile(r"[A-Za-z0-9\-_]{43}")


class OAuthError(Exception):
    """A refusal in the words of RFC 6749. `description` is safe to show."""

    def __init__(self, code: str, description: str = "", status: int = 400) -> None:
        super().__init__(description or code)
        self.code, self.description, self.status = code, description, status


class ConsentError(Exception):
    """The consent step cannot finish; `code` says why and the page says it in words."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def issuer(settings: Settings) -> str:
    return settings.mcp_public_url.rstrip("/")


def resource(settings: Settings) -> str:
    """The canonical address of the MCP endpoint: the audience of every token."""
    return issuer(settings) + "/mcp"


def redirect_to(redirect_uri: str, settings: Settings, **params) -> str:
    """The client's redirect with the answer in its query, and always `iss` (RFC 9207)."""
    parts = urlsplit(redirect_uri)
    query = urlencode({k: v for k, v in {**params, "iss": issuer(settings)}.items() if v})
    joined = f"{parts.query}&{query}" if parts.query else query
    return parts._replace(query=joined).geturl()


# ── The sign-in request ────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class AuthRequest:
    id: UUID
    client_id: str
    redirect_uri: str
    code_challenge: str
    state: str | None
    scopes: list[str]
    resource: str
    lang: str
    email: str | None
    user_id: UUID | None
    verified: bool
    address_hash: str


def check_authorize(
    params: dict, client: Client, settings: Settings
) -> tuple[str, str, str | None, list[str]]:
    """Validate an authorization request against a client. Returns (redirect_uri, challenge,
    state, scopes). Raises `OAuthError` for what is wrong with the request itself; a bad client or
    redirect is never redirected to (the caller shows a page)."""
    from alyr.modules.mcp import clients

    redirect_uri = params.get("redirect_uri") or ""
    if not redirect_uri and len(client.redirect_uris) == 1:
        redirect_uri = client.redirect_uris[0]
    if not clients.redirect_matches(client.redirect_uris, redirect_uri):
        raise OAuthError("invalid_redirect_uri", "this address was not registered by the app")
    if params.get("response_type") != "code":
        raise OAuthError("unsupported_response_type", "response_type must be code")
    challenge = params.get("code_challenge") or ""
    if not CHALLENGE.fullmatch(challenge):
        raise OAuthError("invalid_request", "a PKCE code_challenge is required")
    if params.get("code_challenge_method") != "S256":
        raise OAuthError("invalid_request", "code_challenge_method must be S256")
    asked = params.get("resource")
    if asked and asked.rstrip("/") != resource(settings):
        raise OAuthError("invalid_target", "this resource is not served here")
    state = params.get("state")
    if state is not None and len(state) > 1000:
        raise OAuthError("invalid_request", "state is too long")
    return redirect_uri, challenge, state, scopes.parse(params.get("scope"))


async def begin(
    db: Database, client: Client, redirect_uri: str, challenge: str, state: str | None,
    asked: list[str], settings: Settings, lang: str, address: str,
) -> tuple[str, str]:
    """Store a request. Returns (the secret the page carries, the browser's cookie value)."""
    secret, binder = tokens.new(tokens.REQUEST), tokens.new(tokens.BINDER)
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("delete from mcp_auth_requests where expires_at < now()")
        await conn.execute(
            "insert into mcp_auth_requests (secret_hash, binder_hash, app_id, redirect_uri, "
            "code_challenge, state, scopes, resource, lang, address_hash, expires_at) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, "
            "now() + make_interval(mins => $11))",
            tokens.digest(secret), tokens.digest(binder), client.client_id, redirect_uri,
            challenge, state, asked, resource(settings), lang, tokens.digest(address),
            REQUEST_MINUTES,
        )
    return secret, binder


async def load(db: Database, secret: str, binder: str) -> AuthRequest | None:
    """The live request for a secret, only for the browser that began it."""
    if not secret or not binder:
        return None
    async with db.unscoped() as conn:
        row = await conn.fetchrow(
            "select * from mcp_auth_requests where secret_hash = $1 and expires_at > now() "
            "and used_at is null",
            tokens.digest(secret),
        )
    if row is None or not tokens.same(row["binder_hash"], tokens.digest(binder)):
        return None
    return AuthRequest(
        row["id"], row["app_id"], row["redirect_uri"], row["code_challenge"], row["state"],
        list(row["scopes"]), row["resource"], row["lang"], row["email"], row["user_id"],
        row["verified_at"] is not None, row["address_hash"],
    )


async def set_email(db: Database, request_id: UUID, email: str) -> None:
    async with db.unscoped() as conn:
        await conn.execute(
            "update mcp_auth_requests set email = $2, user_id = null, verified_at = null "
            "where id = $1", request_id, email,
        )


async def mark_verified(db: Database, request_id: UUID, email: str) -> UUID | None:
    """The code was right: remember who. Returns the person's ID."""
    async with db.unscoped() as conn:
        user_id = await conn.fetchval("select id from users where email = $1", email)
        if user_id is None:
            return None
        await conn.execute(
            "update mcp_auth_requests set user_id = $2, verified_at = now() where id = $1",
            request_id, user_id,
        )
        return user_id


@dataclass(frozen=True)
class Business:
    id: UUID
    name: str
    name_ar: str | None
    role: str


async def businesses_of(db: Database, user_id: UUID) -> list[Business]:
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.user_id', $1, true)", str(user_id))
        rows = await conn.fetch(
            "select m.tenant_id, m.role, t.name, t.name_ar from memberships m "
            "join tenants t on t.id = m.tenant_id where m.user_id = $1 order by m.created_at",
            user_id,
        )
    return [Business(r["tenant_id"], r["name"], r["name_ar"], r["role"]) for r in rows]


async def opt_in_state(db: Database, tenant_id: UUID) -> tuple[bool, bool]:
    """(switched on, paused) for a business, for what the consent page shows."""
    async with db.tenant(tenant_id, readonly=True) as conn:
        state = await shop.current(conn)
    return state["enabled"], state["paused"]


# ── Consent: the grant and its code ────────────────────────────────────────────────────────────


async def approve(
    db: Database, req: AuthRequest, client: Client, tenant_id: UUID, *, opted_in: bool,
    settings: Settings,
) -> str:
    """The person said yes. Makes the grant and its code and returns the redirect. Raises
    `ConsentError`: `not_member`, `opt_in_needed`, `owner_must_switch_on`, `paused`."""
    if req.user_id is None or not req.verified:
        raise ConsentError("not_verified")
    code = tokens.new(tokens.CODE)
    async with db.tenant(tenant_id) as conn:
        member = await conn.fetchrow(
            "select m.role, u.name from memberships m join users u on u.id = m.user_id "
            "where m.user_id = $1", req.user_id,
        )
        if member is None:
            raise ConsentError("not_member")
        actor = audit.actor_of(req.user_id, member["name"], client.name)
        state = await shop.current(conn)
        if state["paused"]:
            raise ConsentError("paused")
        if not state["enabled"]:
            if member["role"] != "owner":
                raise ConsentError("owner_must_switch_on")
            if not opted_in:
                raise ConsentError("opt_in_needed")
            await shop.opt_in(conn, member["role"], actor, "mcp")
        # The newest ten permissions of a person stay; the oldest ends.
        live = await conn.fetch(
            "select id from mcp_grants where user_id = $1 and revoked_at is null "
            "and expires_at > now() order by created_at desc", req.user_id,
        )
        for old in live[MAX_LIVE_GRANTS - 1:]:
            await _revoke(conn, old["id"], "replaced", actor, "mcp")
        grant_id = await conn.fetchval(
            "insert into mcp_grants (user_id, app_id, scopes, resource, place_hash, expires_at)"
            " values ($1, $2, $3, $4, $5, now() + make_interval(days => $6)) returning id",
            req.user_id, req.client_id, req.scopes, req.resource, req.address_hash, GRANT_DAYS,
        )
        await conn.execute(
            "insert into mcp_tokens (grant_id, kind, token_hash, expires_at, redirect_uri, "
            "code_challenge) values ($1, 'code', $2, now() + make_interval(secs => $3), $4, $5)",
            grant_id, tokens.digest(code), float(CODE_SECONDS), req.redirect_uri,
            req.code_challenge,
        )
        await audit.event(
            conn, grant_id, "grant_created", actor,
            {"client_id": client.client_id[:200], "client": client.name, "scopes": req.scopes},
        )
        # A person who has connected before, now from an address none of their earlier
        # permissions came from: a signal for the alert (counts only).
        if req.address_hash and await conn.fetchval(
            "select exists (select 1 from mcp_grants where user_id = $1 and id <> $2) "
            "and not exists (select 1 from mcp_grants where user_id = $1 and id <> $2 "
            "and place_hash = $3)", req.user_id, grant_id, req.address_hash,
        ):
            await conn.execute(
                "insert into mcp_signals (kind, shop) values ('new_place', $1)", tenant_id
            )
            await conn.execute(
                "delete from mcp_signals where at < now() - interval '2 days'"
            )
    async with db.unscoped() as conn:
        claimed = await conn.fetchval(
            "update mcp_auth_requests set used_at = now() where id = $1 and used_at is null "
            "returning id", req.id,
        )
    if claimed is None:
        # Another approval of the same request won; this one must not stand.
        async with db.tenant(tenant_id) as conn:
            await _revoke(conn, grant_id, "request_reused", actor, "mcp")
        raise ConsentError("not_verified")
    return redirect_to(req.redirect_uri, settings, code=code, state=req.state)


def deny(req: AuthRequest, settings: Settings) -> str:
    return redirect_to(
        req.redirect_uri, settings, error="access_denied", state=req.state,
        error_description="the person said no",
    )


# ── Tokens ─────────────────────────────────────────────────────────────────────────────────────


async def _revoke(
    conn: asyncpg.Connection, grant_id: UUID, why: str, actor: Actor, channel: str
) -> bool:
    done = await conn.fetchval(
        "update mcp_grants set revoked_at = now(), revoked_by = $2, revoked_why = $3 "
        "where id = $1 and revoked_at is null returning id",
        grant_id, actor.name[:120], why,
    )
    if done is not None:
        await audit.event(conn, grant_id, "grant_revoked", actor, {"why": why}, channel)
    return done is not None


async def _find(db: Database, value: str, kind: str | None = None):
    """The token row for a presented value, read before the business is known."""
    digest = tokens.digest(value)
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.mcp_token', $1, true)", digest)
        return await conn.fetchrow(
            "select tenant_id, grant_id, kind from mcp_tokens where token_hash = $1 "
            "and ($2::text is null or kind = $2)", digest, kind,
        )


async def _issue(conn: asyncpg.Connection, grant: asyncpg.Record) -> tuple[str, str]:
    """A new access token and a new refresh token for a grant."""
    access, refresh = tokens.new(tokens.ACCESS), tokens.new(tokens.REFRESH)
    await conn.execute(
        "insert into mcp_tokens (grant_id, kind, token_hash, expires_at) values "
        "($1, 'access', $2, least(now() + make_interval(secs => $3), $5)), "
        "($1, 'refresh', $4, least(now() + make_interval(days => $6), $5))",
        grant["id"], tokens.digest(access), float(ACCESS_SECONDS), tokens.digest(refresh),
        grant["expires_at"], REFRESH_DAYS,
    )
    await conn.execute(
        "delete from mcp_tokens where grant_id = $1 and expires_at < now() - interval '1 day'",
        grant["id"],
    )
    return access, refresh


def _answer(access: str, refresh: str, grant: asyncpg.Record) -> dict:
    return {
        "access_token": access, "token_type": "Bearer", "expires_in": ACCESS_SECONDS,
        "refresh_token": refresh, "scope": " ".join(grant["scopes"]),
    }


def _pkce(verifier: str, challenge: str) -> bool:
    if not VERIFIER.fullmatch(verifier or ""):
        return False
    computed = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=")
    return tokens.same(computed.decode(), challenge)


async def exchange_code(
    db: Database, *, code: str, client_id: str, redirect_uri: str, verifier: str,
    asked_resource: str | None, settings: Settings,
) -> dict:
    """The authorization_code grant. Raises `OAuthError` (`invalid_grant` for everything about the
    code, the same words for each, so nothing says which part was wrong)."""
    bad = OAuthError("invalid_grant", "the code is not valid")
    if not tokens.looks_like(tokens.CODE, code or ""):
        raise bad
    row = await _find(db, code, "code")
    if row is None:
        raise bad
    outcome: OAuthError | None = None
    result: dict | None = None
    async with db.tenant(row["tenant_id"]) as conn:
        record = await conn.fetchrow(
            "select * from mcp_tokens where token_hash = $1 for update", tokens.digest(code)
        )
        grant = await conn.fetchrow(
            "select g.*, c.name as client_name from mcp_grants g join mcp_clients c "
            "on c.app_id = g.app_id where g.id = $1 for update", row["grant_id"],
        )
        member = await conn.fetchrow(
            "select u.name from memberships m join users u on u.id = m.user_id "
            "where m.user_id = $1", grant["user_id"],
        )
        actor = audit.actor_of(
            grant["user_id"], member["name"] if member else "", grant["client_name"]
        )
        if record["used_at"] is not None:
            # A code used twice: whoever holds what the first use made must not keep it.
            await _revoke(conn, grant["id"], "code_reused", actor, "mcp")
            outcome = bad
        else:
            await conn.execute("update mcp_tokens set used_at = now() where id = $1", record["id"])
            if (
                record["expires_at"] <= datetime.now(UTC) or grant["revoked_at"] is not None
                or grant["expires_at"] <= datetime.now(UTC) or member is None
                or grant["app_id"] != client_id or record["redirect_uri"] != redirect_uri
                or not _pkce(verifier, record["code_challenge"])
            ):
                outcome = bad
            elif asked_resource and asked_resource.rstrip("/") != grant["resource"]:
                outcome = OAuthError("invalid_target", "this resource is not served here")
            else:
                access, refresh = await _issue(conn, grant)
                result = _answer(access, refresh, grant)
    if outcome is not None:
        raise outcome
    return result  # type: ignore[return-value]


async def refresh(
    db: Database, *, refresh_token: str, client_id: str, asked_scope: str | None,
) -> dict:
    """The refresh_token grant, with rotation: the old token dies as the new one is made, and a
    token used a second time ends the whole grant (it was copied)."""
    bad = OAuthError("invalid_grant", "the refresh token is not valid")
    if not tokens.looks_like(tokens.REFRESH, refresh_token or ""):
        raise bad
    row = await _find(db, refresh_token, "refresh")
    if row is None:
        raise bad
    outcome: OAuthError | None = None
    result: dict | None = None
    async with db.tenant(row["tenant_id"]) as conn:
        record = await conn.fetchrow(
            "select * from mcp_tokens where token_hash = $1 for update",
            tokens.digest(refresh_token),
        )
        grant = await conn.fetchrow(
            "select g.*, c.name as client_name from mcp_grants g join mcp_clients c "
            "on c.app_id = g.app_id where g.id = $1 for update", row["grant_id"],
        )
        member = await conn.fetchrow(
            "select u.name from memberships m join users u on u.id = m.user_id "
            "where m.user_id = $1", grant["user_id"],
        )
        actor = audit.actor_of(
            grant["user_id"], member["name"] if member else "", grant["client_name"]
        )
        if grant["revoked_at"] is not None:
            outcome = bad
        elif record["used_at"] is not None:
            await _revoke(conn, grant["id"], "refresh_reused", actor, "mcp")
            outcome = bad
        elif member is None:
            await _revoke(conn, grant["id"], "person_removed", actor, "mcp")
            outcome = bad
        elif (
            record["expires_at"] <= datetime.now(UTC) or grant["expires_at"] <= datetime.now(UTC)
            or grant["app_id"] != client_id
        ):
            outcome = bad
        elif asked_scope and not set(asked_scope.split()) <= set(grant["scopes"]):
            outcome = OAuthError("invalid_scope", "more than was allowed")
        else:
            await conn.execute("update mcp_tokens set used_at = now() where id = $1", record["id"])
            access, new_refresh = await _issue(conn, grant)
            result = _answer(access, new_refresh, grant)
            if asked_scope:
                result["scope"] = " ".join(
                    s for s in scopes.ALL if s in set(asked_scope.split()) & set(grant["scopes"])
                )
    if outcome is not None:
        raise outcome
    return result  # type: ignore[return-value]


async def revoke_token(db: Database, value: str) -> None:
    """RFC 7009: end the grant a token belongs to. Says nothing about whether it was known."""
    if not value or len(value) > 200:
        return
    row = await _find(db, value)
    if row is None or row["kind"] == "code":
        return
    async with db.tenant(row["tenant_id"]) as conn:
        grant = await conn.fetchrow(
            "select g.*, c.name as client_name, u.name as user_name from mcp_grants g "
            "join mcp_clients c on c.app_id = g.app_id join users u on u.id = g.user_id "
            "where g.id = $1", row["grant_id"],
        )
        if grant is not None:
            actor = audit.actor_of(grant["user_id"], grant["user_name"], grant["client_name"])
            await _revoke(conn, grant["id"], "revoked_by_app", actor, "mcp")


# ── The workspace's side: see and end permissions ──────────────────────────────────────────────


def _when(value) -> str | None:
    return value.isoformat() if value else None


async def grants(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        "select g.id, g.scopes, g.created_at, g.expires_at, g.last_used_at, g.revoked_at, "
        "g.revoked_by, g.revoked_why, c.name as client, c.app_id, c.kind, u.name as person, "
        "u.id as person_id from mcp_grants g join mcp_clients c on c.app_id = g.app_id "
        "join users u on u.id = g.user_id order by g.created_at desc limit 200"
    )
    now = datetime.now(UTC)
    return [
        {
            "id": str(r["id"]), "client": r["client"], "client_kind": r["kind"],
            "person": r["person"], "person_id": str(r["person_id"]), "scopes": list(r["scopes"]),
            "created_at": _when(r["created_at"]), "expires_at": _when(r["expires_at"]),
            "last_used_at": _when(r["last_used_at"]), "revoked_at": _when(r["revoked_at"]),
            "revoked_by": r["revoked_by"], "revoked_why": r["revoked_why"],
            "live": r["revoked_at"] is None and r["expires_at"] > now,
        }
        for r in rows
    ]


async def revoke_grant(
    conn: asyncpg.Connection, role: str, actor: Actor, grant_id: UUID, channel: str = "portal"
) -> bool:
    """End one permission. An owner or an admin may end any; anyone else only their own."""
    row = await conn.fetchrow("select user_id from mcp_grants where id = $1", grant_id)
    if row is None:
        return False
    if role not in ("owner", "admin") and row["user_id"] != actor.id:
        raise shop.ShopError("not_allowed", "you can only end your own connections")
    return await _revoke(conn, grant_id, "ended_by_workspace", actor, channel)


async def revoke_all(
    conn: asyncpg.Connection, role: str, actor: Actor, channel: str = "portal"
) -> int:
    if role not in ("owner", "admin"):
        raise shop.ShopError("not_allowed", "only an owner or an admin can end every connection")
    live = await conn.fetch("select id from mcp_grants where revoked_at is null")
    count = 0
    for row in live:
        count += await _revoke(conn, row["id"], "all_ended_by_workspace", actor, channel)
    return count


async def calls(conn: asyncpg.Connection, limit: int = 100) -> list[dict]:
    """What the connected apps did, from the activity record (channel `mcp`), newest first."""
    rows = await conn.fetch(
        "select id, subject_id, action, detail, actor_name, created_at from activity "
        "where channel = 'mcp' order by created_at desc, id desc limit $1", limit,
    )
    return [
        {
            "id": str(r["id"]), "grant_id": str(r["subject_id"]), "action": r["action"],
            "person": r["actor_name"], "at": _when(r["created_at"]), "detail": r["detail"],
        }
        for r in rows
    ]
