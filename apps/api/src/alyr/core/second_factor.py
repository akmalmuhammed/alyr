"""A second factor for ALYR's own staff: an authenticator app and recovery codes (ALY-125, D-136).

The back office's first factor is a code in the mailbox. Whoever reads that mailbox can sign in,
so the second factor is something the mailbox does not hold: a six-digit code that an
authenticator app on the person's phone makes from a secret only they and ALYR hold (RFC 6238:
HMAC-SHA1, 30-second steps, six digits, which every authenticator app speaks).

Rules, each with the test that holds it (`tests/test_staff_second_factor.py`):

- **A code works once.** The newest 30-second step a code was accepted for is kept; a code for
  that step or an older one is refused, so a code seen over a shoulder or in a log is dead.
- **A little clock drift is allowed, no more.** The step before and the step after count
  (about 30 seconds either way); two steps off does not.
- **Wrong codes are counted and stop the account.** Five wrong in ten minutes, or twenty in a
  day, and every code (the right one too) is refused until the oldest wrong one ages out.
  Counted behind an advisory lock for the account, so parallel guesses cannot all pass.
- **The secret is sealed.** AES-256-GCM under a key derived (HKDF) from ALYR_LINK_SECRET, with the
  email bound in, so a copy of the table opens nothing and a sealed secret moved to another row
  does not open. Rotating ALYR_LINK_SECRET makes every secret unreadable: the people enrol again
  with a recovery code or through the break-glass (docs/runbooks/staff-sign-in.md).
- **Recovery codes are shown once.** Ten, twelve characters from 32 (60 bits), stored only as an
  HMAC under another derived key. Each works once. Making new ones ends the old ones.
- **Changing the factor needs the factor.** Replacing it, making new recovery codes and turning
  it off all need a current code or a recovery code, even from a session that has passed it.
  While the second factor is required it cannot be turned off at all.
- **A new secret does nothing until its first right code.** An abandoned replacement leaves
  the working factor as it was.
- **Passing the factor gives the session a new cookie.** The old cookie value stops working, so
  a cookie planted in the browser before the factor is worth nothing after it.
"""

import base64
import hashlib
import hmac
import os
import re
import secrets
import struct
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import HTTPException, Request

from alyr.config import get_settings
from alyr.core import links, ratelimit
from alyr.db import Database

STEP_SECONDS = 30
DRIFT_STEPS = 1
DIGITS = 6
SECRET_BYTES = 20
RECOVERY_COUNT = 10
RECOVERY_LENGTH = 12
# No 0, 1, I or O: nothing to mistake when it is copied by hand.
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ISSUER = "ALYR"
BUCKET = "staff-factor"
SHORT = ratelimit.Limit(5, ratelimit.TEN_MINUTES)
DAILY = ratelimit.Limit(20, ratelimit.DAY)
ENROLMENT_WINDOW_MINUTES = 30
VERSION = b"\x01"

WRONG = "that code is wrong, or has already been used"


class FactorError(Exception):
    """The request cannot be carried out; the message is safe to show."""


class FactorLocked(FactorError):
    def __init__(self, retry_after: int) -> None:
        super().__init__("too many wrong codes; the authenticator is paused for now")
        self.retry_after = retry_after


class EnrolmentClosed(FactorError):
    """The second factor is required and this person has none: only the break-glass opens it."""


class Required(FactorError):
    """What was asked cannot be done while the second factor is required."""


class NotEnrolled(FactorError):
    pass


def now() -> float:
    """Seconds since the epoch. The tests replace this to move the clock."""
    return time.time()


# ── keys ──────────────────────────────────────────────────────────────────────────────────────


def _key(purpose: bytes) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=b"alyr-staff-factor-v1:" + purpose
    ).derive(links.secret())


def seal(email: str, secret: bytes) -> str:
    nonce = os.urandom(12)
    box = AESGCM(_key(b"seal")).encrypt(nonce, secret, b"alyr-staff-factor-v1:" + email.encode())
    return base64.b64encode(VERSION + nonce + box).decode()


def unseal(email: str, sealed: str) -> bytes:
    raw = base64.b64decode(sealed)
    if raw[:1] != VERSION:
        raise FactorError("the stored secret cannot be read")
    try:
        return AESGCM(_key(b"seal")).decrypt(
            raw[1:13], raw[13:], b"alyr-staff-factor-v1:" + email.encode()
        )
    except InvalidTag as error:
        raise FactorError("the stored secret cannot be read") from error


def _recovery_hash(email: str, normalised: str) -> str:
    return hmac.new(_key(b"recovery"), f"{email}:{normalised}".encode(), hashlib.sha256).hexdigest()


# ── the codes ─────────────────────────────────────────────────────────────────────────────────


def code_at(secret: bytes, step: int) -> str:
    """The six digits for one 30-second step (RFC 4226 truncation of HMAC-SHA1)."""
    digest = hmac.new(secret, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 10 ** DIGITS:0{DIGITS}d}"


def step_of(at: float | None = None) -> int:
    return int((now() if at is None else at) // STEP_SECONDS)


def normalise(code: str) -> str:
    return re.sub(r"[\s-]", "", code or "").upper()


def match(secret: bytes, code: str, at: float | None = None) -> int | None:
    """The step this code belongs to within the allowed drift, or None. Every candidate step is
    compared, with no early exit, so the time taken tells nothing."""
    code = normalise(code)
    if len(code) != DIGITS or not code.isdigit():
        return None
    found = None
    centre = step_of(at)
    for step in range(centre - DRIFT_STEPS, centre + DRIFT_STEPS + 1):
        if hmac.compare_digest(code_at(secret, step), code):
            found = step
    return found


def new_secret() -> bytes:
    return os.urandom(SECRET_BYTES)


def secret_text(secret: bytes) -> str:
    return base64.b32encode(secret).decode().rstrip("=")


def setup_link(email: str, secret: bytes) -> str:
    label = quote(f"{ISSUER}:{email}", safe="")
    return (
        f"otpauth://totp/{label}?secret={secret_text(secret)}&issuer={ISSUER}"
        f"&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"
    )


def new_recovery_codes() -> list[str]:
    codes = []
    for _ in range(RECOVERY_COUNT):
        raw = "".join(secrets.choice(ALPHABET) for _ in range(RECOVERY_LENGTH))
        codes.append("-".join(raw[i:i + 4] for i in range(0, RECOVERY_LENGTH, 4)))
    return codes


# ── counting wrong codes ──────────────────────────────────────────────────────────────────────


async def _turn(conn, email: str) -> None:
    """Make this account's attempts take turns until the transaction ends."""
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"{BUCKET}:{email}")


async def _wait(conn, email: str, limit: ratelimit.Limit) -> int:
    """Seconds until the account has fewer than `limit.count` wrong codes in `limit.seconds`."""
    when = await conn.fetchval(
        "select at from rate_hits where bucket = $1 and key = $2 "
        "and at > now() - make_interval(secs => $3) order by at desc offset $4 limit 1",
        BUCKET, hashlib.sha256(email.encode()).hexdigest(), float(limit.seconds), limit.count - 1,
    )
    if when is None:
        return 0
    ends = when + timedelta(seconds=limit.seconds)
    return max(int((ends - datetime.now(UTC)).total_seconds()), 1)


async def _guard(conn, email: str) -> None:
    for limit in (SHORT, DAILY):
        if await ratelimit.count_on(conn, BUCKET, email, limit.seconds) >= limit.count:
            raise FactorLocked(await _wait(conn, email, limit))


async def _failed(conn, email: str) -> None:
    await ratelimit.record_on(conn, BUCKET, email)


# ── what the factor is ────────────────────────────────────────────────────────────────────────


async def status(db: Database, email: str) -> dict:
    async with db.unscoped() as conn:
        row = await conn.fetchrow(
            "select confirmed_at, pending_sealed is not null as pending, enrol_open_until "
            "from staff_factors where email = $1", email,
        )
        left = await conn.fetchval(
            "select count(*) from staff_recovery_codes where email = $1 and used_at is null",
            email,
        )
    confirmed = row["confirmed_at"] if row else None
    opened = row["enrol_open_until"] if row else None
    return {
        "enrolled": confirmed is not None,
        "confirmed_at": confirmed.isoformat() if confirmed else None,
        "recovery_codes_left": left if confirmed else 0,
        "enrolment_open": bool(opened and opened > datetime.now(UTC)),
        "required": get_settings().staff_2fa,
    }


async def _attempt(conn, email: str, code: str) -> str | None:
    """Spend a code if it is right: "totp" or "recovery"; None if not (counted as wrong).
    The caller holds the account's turn and has run `_guard`."""
    row = await conn.fetchrow(
        "select secret_sealed from staff_factors where email = $1 and secret_sealed is not null "
        "for update", email,
    )
    if row is not None:
        step = match(unseal(email, row["secret_sealed"]), code)
        if step is not None:
            # Only a newer step than the last accepted one; two tries with one code, at the same
            # moment, spend it once.
            fresh = await conn.fetchval(
                "update staff_factors set last_step = $2, updated_at = now() "
                "where email = $1 and last_step < $2 returning true", email, step,
            )
            if fresh:
                return "totp"
        else:
            normalised = normalise(code)
            if len(normalised) == RECOVERY_LENGTH and all(c in ALPHABET for c in normalised):
                spent = await conn.fetchval(
                    "update staff_recovery_codes set used_at = now() "
                    "where email = $1 and code_hash = $2 and used_at is null returning true",
                    email, _recovery_hash(email, normalised),
                )
                if spent:
                    return "recovery"
    await _failed(conn, email)
    return None


async def _rotate(conn, token: str) -> str:
    """The same session under a new cookie value, marked as having passed the factor. The
    session keeps its start and its end, so passing the factor does not extend the back
    office's 12 hours."""
    from alyr.core import auth

    fresh = secrets.token_urlsafe(32)
    row = await conn.fetchrow(
        "delete from sessions where token_hash = $1 and expires_at > now() "
        "returning user_id, tenant_id, expires_at, created_at", auth.token_hash(token),
    )
    if row is None:
        raise FactorError("sign in again")
    await conn.execute(
        "insert into sessions (token_hash, user_id, tenant_id, expires_at, created_at, "
        "second_factor_at) values ($1, $2, $3, $4, $5, now())",
        auth.token_hash(fresh), row["user_id"], row["tenant_id"], row["expires_at"],
        row["created_at"],
    )
    return fresh


async def verify(db: Database, email: str, code: str, token: str) -> tuple[str, str]:
    """Prove the factor for this session: ("totp" or "recovery", the session's new cookie)."""
    async with db.unscoped() as conn:
        async with conn.transaction():
            await _turn(conn, email)
            await _guard(conn, email)
            if not await conn.fetchval(
                "select true from staff_factors where email = $1 and confirmed_at is not null",
                email,
            ):
                raise NotEnrolled("no authenticator is set up for this account")
            kind = await _attempt(conn, email, code)
            if kind is not None:
                return kind, await _rotate(conn, token)
        raise FactorError(WRONG)


async def begin(db: Database, email: str, current: str = "") -> tuple[bytes, bool]:
    """Start setting up an authenticator: a new secret, kept as pending. If one is already
    working this is a replacement and needs a current code. Returns (secret, replacing)."""
    enforced = get_settings().staff_2fa
    async with db.unscoped() as conn:
        async with conn.transaction():
            await _turn(conn, email)
            row = await conn.fetchrow(
                "select confirmed_at, enrol_open_until from staff_factors where email = $1 "
                "for update", email,
            )
            replacing = bool(row and row["confirmed_at"])
            if replacing:
                await _guard(conn, email)
                allowed = bool(current) and await _attempt(conn, email, current) is not None
            else:
                opened = row["enrol_open_until"] if row else None
                if enforced and not (opened and opened > datetime.now(UTC)):
                    raise EnrolmentClosed(
                        "enrolment is closed while the second factor is required"
                    )
                allowed = True
            if allowed:
                secret = new_secret()
                await conn.execute(
                    "insert into staff_factors (email, pending_sealed) values ($1, $2) "
                    "on conflict (email) do update set pending_sealed = $2, updated_at = now()",
                    email, seal(email, secret),
                )
                return secret, replacing
        raise FactorError(WRONG)


async def confirm(db: Database, email: str, code: str, token: str) -> tuple[list[str], bool, str]:
    """Finish setting up: the first right code from the new secret makes it the working one,
    makes ten recovery codes (returned once) and gives the session its new cookie. Returns
    (recovery codes, whether it replaced a working factor, the new cookie)."""
    async with db.unscoped() as conn:
        async with conn.transaction():
            await _turn(conn, email)
            await _guard(conn, email)
            row = await conn.fetchrow(
                "select pending_sealed, confirmed_at from staff_factors where email = $1 "
                "for update", email,
            )
            if row is None or row["pending_sealed"] is None:
                raise NotEnrolled("start setting up the authenticator first")
            step = match(unseal(email, row["pending_sealed"]), code)
            if step is not None:
                codes = new_recovery_codes()
                await conn.execute(
                    "update staff_factors set secret_sealed = pending_sealed, "
                    "pending_sealed = null, confirmed_at = now(), last_step = $2, "
                    "enrol_open_until = null, updated_at = now() where email = $1",
                    email, step,
                )
                await _store_recovery(conn, email, codes)
                return codes, row["confirmed_at"] is not None, await _rotate(conn, token)
            await _failed(conn, email)
        raise FactorError(WRONG)


async def _store_recovery(conn, email: str, codes: list[str]) -> None:
    await conn.execute("delete from staff_recovery_codes where email = $1", email)
    await conn.executemany(
        "insert into staff_recovery_codes (email, code_hash) values ($1, $2)",
        [(email, _recovery_hash(email, normalise(c))) for c in codes],
    )


async def make_recovery_codes(db: Database, email: str, current: str) -> list[str]:
    """Ten new recovery codes; the old ones stop working. Needs a current code."""
    async with db.unscoped() as conn:
        async with conn.transaction():
            await _turn(conn, email)
            await _guard(conn, email)
            if await _attempt(conn, email, current) is not None:
                codes = new_recovery_codes()
                await _store_recovery(conn, email, codes)
                return codes
        raise FactorError(WRONG)


async def disable(db: Database, email: str, current: str) -> None:
    """Turn the factor off. Needs a current code, and is refused outright while the second
    factor is required: the account would be left with no way in."""
    if get_settings().staff_2fa:
        raise Required("the second factor is required; replace it instead of turning it off")
    async with db.unscoped() as conn:
        async with conn.transaction():
            await _turn(conn, email)
            await _guard(conn, email)
            if await _attempt(conn, email, current) is not None:
                await conn.execute("delete from staff_recovery_codes where email = $1", email)
                await conn.execute("delete from staff_factors where email = $1", email)
                return
        raise FactorError(WRONG)


# ── the check every back-office route makes ───────────────────────────────────────────────────


async def require(request: Request, email: str, token: str) -> None:
    """When the second factor is required, refuse a staff session that has not passed it, or
    that passed an earlier one (the factor was replaced or removed since). Does nothing while
    `ALYR_STAFF_2FA` is off."""
    if not get_settings().staff_2fa:
        return
    from alyr.core import auth

    async with request.app.state.db.unscoped() as conn:
        row = await conn.fetchrow(
            "select f.confirmed_at, f.enrol_open_until, s.second_factor_at "
            "from sessions s left join staff_factors f on f.email = $2 "
            "where s.token_hash = $1", auth.token_hash(token), email,
        )
    if row and row["confirmed_at"] and row["second_factor_at"] and (
        row["second_factor_at"] >= row["confirmed_at"]
    ):
        return
    enrolled = bool(row and row["confirmed_at"])
    opened = bool(row and row["enrol_open_until"] and row["enrol_open_until"] > datetime.now(UTC))
    raise HTTPException(status_code=403, detail={
        "code": "second_factor_required",
        "message": "a second factor is required for the back office",
        "enrolled": enrolled, "enrolment_open": opened,
    })
