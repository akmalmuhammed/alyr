"""Sign-in for workspace staff: a one-time code by email, then a session cookie.

No passwords exist, so none can leak or be reused. Codes and session tokens are stored
only as hashes. See docs/decisions.md D-022.
"""

import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass
from uuid import UUID

import asyncpg

from alyr.db import Database

log = logging.getLogger("alyr.auth")

COOKIE = "alyr_session"
SESSION_DAYS = 30
CODE_MINUTES = 10
MAX_GUESSES = 5
MAX_CODES_PER_HOUR = 5
ROLES = ("owner", "admin", "agent")


class AuthError(Exception):
    """Sign-in was refused; the message is safe to show."""


class TooManyCodes(AuthError):
    pass


@dataclass(frozen=True)
class Staff:
    """Who is making a workspace request. `user_id` is None in the open local demo."""

    user_id: UUID | None
    name: str
    email: str
    role: str
    tenant_id: UUID


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def clean_email(email: str) -> str:
    return email.strip().lower()


async def request_code(db: Database, email: str) -> str | None:
    """Create a code for a known person and return it for delivery. Returns None for an
    unknown email; the caller must answer the same either way, so nobody can use the
    form to learn who has an account."""
    email = clean_email(email)
    async with db.unscoped() as conn:
        known = await conn.fetchval("select true from users where email = $1", email)
        if not known:
            return None
        recent = await conn.fetchval(
            "select count(*) from login_codes "
            "where email = $1 and created_at > now() - interval '1 hour'",
            email,
        )
        if recent >= MAX_CODES_PER_HOUR:
            raise TooManyCodes("too many codes requested; try again in an hour")
        code = f"{secrets.randbelow(1_000_000):06d}"
        await conn.execute(
            "insert into login_codes (email, code_hash, expires_at) "
            f"values ($1, $2, now() + interval '{CODE_MINUTES} minutes')",
            email, _hash(f"{email}:{code}"),
        )
        await conn.execute("delete from login_codes where expires_at < now() - interval '1 day'")
    return code


async def verify_code(db: Database, email: str, code: str) -> str:
    """Exchange a correct code for a session token. Raises AuthError otherwise."""
    email = clean_email(email)
    refused = AuthError("that code is wrong or has expired")
    async with db.unscoped() as conn, conn.transaction():
        row = await conn.fetchrow(
            "select id, code_hash, attempts from login_codes "
            "where email = $1 and not used and expires_at > now() "
            "order by created_at desc limit 1 for update",
            email,
        )
        if row is None or row["attempts"] >= MAX_GUESSES:
            raise refused
        if not hmac.compare_digest(row["code_hash"], _hash(f"{email}:{code.strip()}")):
            # Counted outside this transaction's fate: the raise below must not undo it.
            wrong = row["id"]
        else:
            wrong = None
            await conn.execute("update login_codes set used = true where id = $1", row["id"])
            user_id = await conn.fetchval("select id from users where email = $1", email)
            await conn.execute("select set_config('app.user_id', $1, true)", str(user_id))
            tenant_id = await conn.fetchval(
                "select tenant_id from memberships where user_id = $1 order by created_at limit 1",
                user_id,
            )
            if tenant_id is None:
                raise AuthError("this account is not a member of any shop")
            token = secrets.token_urlsafe(32)
            await conn.execute(
                "insert into sessions (token_hash, user_id, tenant_id, expires_at) "
                f"values ($1, $2, $3, now() + interval '{SESSION_DAYS} days')",
                _hash(token), user_id, tenant_id,
            )
            return token
    async with db.unscoped() as conn:
        await conn.execute("update login_codes set attempts = attempts + 1 where id = $1", wrong)
    raise refused


async def resolve(db: Database, token: str) -> Staff | None:
    """Who a session cookie belongs to, or None if it is unknown, expired, or the person
    no longer works for that shop."""
    async with db.unscoped() as conn, conn.transaction():
        row = await conn.fetchrow(
            "select s.user_id, s.tenant_id, u.name, u.email from sessions s "
            "join users u on u.id = s.user_id "
            "where s.token_hash = $1 and s.expires_at > now()",
            _hash(token),
        )
        if row is None:
            return None
        await conn.execute("select set_config('app.user_id', $1, true)", str(row["user_id"]))
        role = await conn.fetchval(
            "select role from memberships where user_id = $1 and tenant_id = $2",
            row["user_id"], row["tenant_id"],
        )
    if role is None:
        return None
    return Staff(row["user_id"], row["name"], row["email"], role, row["tenant_id"])


async def sign_out(db: Database, token: str) -> None:
    async with db.unscoped() as conn:
        await conn.execute("delete from sessions where token_hash = $1", _hash(token))


# --- the shop's team; every function below takes a tenant-scoped connection ---


async def team(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        "select u.id, u.name, u.email, m.role, m.created_at from memberships m "
        "join users u on u.id = m.user_id "
        "where m.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid "
        "order by m.created_at"
    )
    return [
        {"id": str(r["id"]), "name": r["name"], "email": r["email"], "role": r["role"]}
        for r in rows
    ]


def _may_set(actor_role: str, role: str) -> None:
    if role not in ROLES:
        raise AuthError("role must be owner, admin or agent")
    if actor_role not in ("owner", "admin"):
        raise PermissionError("only an owner or admin can manage the team")
    if role == "owner" and actor_role != "owner":
        raise PermissionError("only an owner can make someone an owner")


async def add_member(
    conn: asyncpg.Connection, actor_role: str, email: str, name: str, role: str
) -> UUID:
    """Add a person to this shop, creating their account if the email is new."""
    _may_set(actor_role, role)
    email = clean_email(email)
    if "@" not in email or not name.strip():
        raise AuthError("give a name and a valid email")
    user_id = await conn.fetchval(
        "insert into users (email, name) values ($1, $2) "
        "on conflict (email) do update set email = excluded.email returning id",
        email, name.strip(),
    )
    added = await conn.fetchval(
        "insert into memberships (user_id, role) values ($1, $2) "
        "on conflict do nothing returning true",
        user_id, role,
    )
    if not added:
        raise AuthError("that person is already on the team")
    return user_id


async def _owners(conn: asyncpg.Connection) -> int:
    return await conn.fetchval(
        "select count(*) from memberships where role = 'owner' "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )


async def _role_of(conn: asyncpg.Connection, user_id: UUID) -> str:
    current = await conn.fetchval(
        "select role from memberships where user_id = $1 "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        user_id,
    )
    if current is None:
        raise LookupError("no such team member")
    return current


async def change_role(
    conn: asyncpg.Connection, actor_role: str, user_id: UUID, role: str
) -> None:
    _may_set(actor_role, role)
    current = await _role_of(conn, user_id)
    if current == "owner" and actor_role != "owner":
        raise PermissionError("only an owner can change an owner")
    if current == "owner" and role != "owner" and await _owners(conn) == 1:
        raise AuthError("a shop must keep at least one owner")
    await conn.execute(
        "update memberships set role = $2 where user_id = $1 "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        user_id, role,
    )


async def remove_member(conn: asyncpg.Connection, actor_role: str, user_id: UUID) -> None:
    """Remove a person from this shop. Their sessions for it stop working at once,
    because `resolve` checks membership on every request."""
    if actor_role not in ("owner", "admin"):
        raise PermissionError("only an owner or admin can manage the team")
    current = await _role_of(conn, user_id)
    if current == "owner" and actor_role != "owner":
        raise PermissionError("only an owner can remove an owner")
    if current == "owner" and await _owners(conn) == 1:
        raise AuthError("a shop must keep at least one owner")
    await conn.execute(
        "delete from memberships where user_id = $1 "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        user_id,
    )
    # Their conversations go back to nobody, so a colleague picks them up.
    await conn.execute("update contacts set assigned_to = null where assigned_to = $1", user_id)
