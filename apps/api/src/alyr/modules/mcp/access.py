"""Who is calling, on every call (spec 067, "Tokens").

A token only names a permission (a grant). Everything else is read again for each call: that the
permission is neither ended nor out of date, that the person is still on the business's team and
in what role, and that the business still has the connector switched on and not paused. So
removing a person, changing their role, pausing, switching off or revoking takes effect on the
next call, and no answer is cached.

The refusal is a `McpAuthError` carrying the HTTP status and the `WWW-Authenticate` challenge the
authorization specification asks for.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from alyr.config import Settings
from alyr.core import ratelimit
from alyr.db import Database
from alyr.modules.mcp import oauth, shop, tokens

# Failed attempts to present a token, from one address. Calls with a good token are never counted
# against an address: the big apps call from shared addresses, so one address is many people.
BAD_TOKENS_PER_ADDRESS = ratelimit.Limit(120, ratelimit.TEN_MINUTES)


class McpAuthError(Exception):
    def __init__(
        self, status: int, error: str, description: str, scope: str | None = None
    ) -> None:
        super().__init__(description)
        self.status, self.error, self.description, self.scope = status, error, description, scope


@dataclass(frozen=True)
class Principal:
    """A call's authority: proven now, for this call only."""

    grant_id: UUID
    tenant_id: UUID
    user_id: UUID
    name: str
    role: str
    client_id: str
    client_name: str
    scopes: frozenset[str]


def challenge(settings: Settings, error: str | None = None, description: str | None = None,
              scope: str | None = None) -> str:
    """The `WWW-Authenticate` value: where to find the resource's metadata and, when there is
    one, what went wrong and the scope that would put it right."""
    url = f"{oauth.issuer(settings)}/.well-known/oauth-protected-resource/mcp"
    parts = [f'resource_metadata="{url}"']
    if error:
        parts.insert(0, f'error="{error}"')
    if description:
        parts.insert(1 if error else 0, f'error_description="{description}"')
    if scope:
        parts.append(f'scope="{scope}"')
    return "Bearer " + ", ".join(parts)


async def authenticate(db: Database, header: str | None, settings: Settings) -> Principal:
    """Prove the bearer token for one call. Raises `McpAuthError`."""
    scheme, _, presented = (header or "").partition(" ")
    presented = presented.strip()
    if scheme.lower() != "bearer" or not presented:
        raise McpAuthError(401, "invalid_token", "sign in to connect")
    invalid = McpAuthError(401, "invalid_token", "the access token is not valid")
    if not tokens.looks_like(tokens.ACCESS, presented):
        raise invalid
    digest = tokens.digest(presented)
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.mcp_token', $1, true)", digest)
        row = await conn.fetchrow(
            "select tenant_id, grant_id, expires_at from mcp_tokens "
            "where token_hash = $1 and kind = 'access'", digest,
        )
    if row is None or row["expires_at"] <= datetime.now(UTC):
        raise invalid
    async with db.tenant(row["tenant_id"]) as conn:
        grant = await conn.fetchrow(
            "select g.*, c.name as client_name from mcp_grants g join mcp_clients c "
            "on c.client_id = g.client_id where g.id = $1", row["grant_id"],
        )
        if (
            grant is None or grant["revoked_at"] is not None
            or grant["expires_at"] <= datetime.now(UTC)
        ):
            raise invalid
        # The audience: a token is good only at the address it was made for.
        if grant["resource"] != oauth.resource(settings):
            raise invalid
        member = await conn.fetchrow(
            "select m.role, u.name from memberships m join users u on u.id = m.user_id "
            "where m.user_id = $1", grant["user_id"],
        )
        if member is None:
            raise McpAuthError(401, "invalid_token", "this person is no longer on the team")
        if not await shop.answers(conn):
            raise McpAuthError(
                403, "access_denied", "the business has switched this connection off or paused it"
            )
        await conn.execute(
            "update mcp_grants set last_used_at = now() where id = $1 "
            "and (last_used_at is null or last_used_at < now() - interval '1 minute')",
            grant["id"],
        )
    return Principal(
        grant["id"], row["tenant_id"], grant["user_id"], member["name"], member["role"],
        grant["client_id"], grant["client_name"], frozenset(grant["scopes"]),
    )


async def count_bad(db: Database, address: str) -> None:
    """A failed attempt, counted against the address; refuses with 429 when there are too many."""
    try:
        await ratelimit.hit(db, "mcp-bad-token", address, BAD_TOKENS_PER_ADDRESS)
    except ratelimit.TooManyRequests as error:
        raise McpAuthError(429, "rate_limited", "too many failed attempts") from error
