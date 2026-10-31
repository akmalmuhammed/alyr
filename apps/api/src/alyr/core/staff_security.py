"""Hardening the sign-in of ALYR's own staff (ALY-125, D-135).

The back office reads every client's data and its only door is an emailed six-digit code, so the
account behind it gets more than an ordinary sign-in:

- **A daily cap on wrong codes.** An ordinary account may be guessed at five times per code, five
  codes an hour (`core/auth.py`, `core/ratelimit.py`). For a member of ALYR staff the wrong codes
  of any code, of the last 24 hours, are counted together: at `WRONG_CODES_PER_DAY` the account
  refuses every code, the right one too, until the oldest wrong code is a day old. The person is
  emailed and ALYR's alert channels hear of it.
- **A note of every sign-in, and an email when it is from somewhere new.** A sign-in of a staff
  member writes `staff.sign_in` to the audit log (the back office's Audit screen) with the
  device and the address; a device or an address this person has not signed in from before also
  sends them an email.

Nothing here decides who is staff: `platform_admins` does, as before. Nothing here refuses a
sign-in that has a right code, except the cap above.
"""

import hashlib
import logging
import re
from datetime import UTC, datetime, timedelta

from fastapi import Request

from alyr.core import mail, ratelimit
from alyr.db import Database

log = logging.getLogger("alyr.staff_security")

WRONG_BUCKET = "staff-wrong-code"
WRONG_CODES_PER_DAY = 10
WINDOW_SECONDS = ratelimit.DAY


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# ── the cap on wrong codes ────────────────────────────────────────────────────────────────────


async def is_staff(conn, email: str) -> bool:
    return bool(await conn.fetchval("select true from platform_admins where email = $1", email))


async def take_turn(conn, email: str) -> None:
    """Make this account's guesses take turns, so that two parallel wrong codes cannot both see
    nine and both be let through. Held until the transaction ends."""
    await conn.execute(
        "select pg_advisory_xact_lock(hashtext($1))", f"{WRONG_BUCKET}:{email}"
    )


async def count_wrong(conn, email: str) -> int:
    return await ratelimit.count_on(conn, WRONG_BUCKET, email, WINDOW_SECONDS)


async def is_locked(conn, email: str) -> bool:
    return await count_wrong(conn, email) >= WRONG_CODES_PER_DAY


async def clear_wrong(conn, email: str) -> int:
    """Forget the account's wrong codes. For the break-glass script only."""
    return await ratelimit.forget_on(conn, WRONG_BUCKET, email)


async def record_wrong(conn, email: str) -> int:
    """Count one wrong code; returns how many the account has had in the last day."""
    await ratelimit.record_on(conn, WRONG_BUCKET, email)
    return await count_wrong(conn, email)


async def lifts_at(conn, email: str) -> datetime:
    """When the cap stops refusing: when the oldest of the wrong codes that keep the account at
    the cap is a day old."""
    when = await conn.fetchval(
        "select at from rate_hits where bucket = $1 and key = $2 "
        "and at > now() - make_interval(secs => $3) order by at desc offset $4 limit 1",
        WRONG_BUCKET, _digest(email), float(WINDOW_SECONDS), WRONG_CODES_PER_DAY - 1,
    )
    return (when or datetime.now(UTC)) + timedelta(seconds=WINDOW_SECONDS)


async def announce_lock(db: Database, email: str, wrong: int) -> None:
    """The account just reached the cap: write it down, tell the person, tell ALYR. Never
    raises; a mail provider that is down must not turn a refusal into an error page."""
    async with db.unscoped() as conn:
        until = await lifts_at(conn, email)
        name = await conn.fetchval("select name from users where email = $1", email) or ""
    await _audit(
        db, email, name, "staff.locked",
        {"wrong_codes": wrong, "window_hours": 24, "lifts_at": until.isoformat()},
    )
    await _email(email, mail.staff_locked_message(name, email, wrong, until))
    # An alert leaves ALYR (ntfy, email): counts only, never the address (alerts.py). Imported
    # here because alerts pulls in the whole message path, which itself imports this module.
    from alyr.core import alerts

    await alerts.notify(
        "A back-office account is locked",
        f"{wrong} wrong sign-in codes in 24 hours on an ALYR staff account. Sign-in for it "
        "is paused until the oldest is a day old. Nobody has signed in.",
        urgent=True, tag="lock",
    )


# ── a note of every sign-in ───────────────────────────────────────────────────────────────────


def describe_device(user_agent: str) -> str:
    """"Chrome on Windows": enough for a person to recognise their own browser. Never the whole
    string, which can hold anything a client chooses to send."""
    ua = user_agent or ""
    browser = next(
        (name for pattern, name in (
            (r"Edg/", "Edge"), (r"OPR/|Opera", "Opera"), (r"Firefox/", "Firefox"),
            (r"Chrome/|CriOS/", "Chrome"), (r"Safari/", "Safari"),
            (r"node|undici|curl", "a script"),
        ) if re.search(pattern, ua)),
        "a browser",
    )
    system = next(
        (name for pattern, name in (
            (r"iPhone|iPad", "iOS"), (r"Android", "Android"), (r"Windows", "Windows"),
            (r"Macintosh|Mac OS", "macOS"), (r"Linux|X11", "Linux"),
        ) if re.search(pattern, ua)),
        "",
    )
    return f"{browser} on {system}" if system else browser


async def _remember(conn, email: str, kind: str, value: str) -> bool:
    """Note that this person signed in from this device or address; True if it is the first
    time."""
    inserted = await conn.fetchval(
        "insert into staff_known (email, kind, value) values ($1, $2, $3) "
        "on conflict (email, kind, value) do update set last_seen = now() "
        "returning (xmax = 0)",
        email, kind, value,
    )
    return bool(inserted)


async def _audit(db: Database, email: str, name: str, action: str, detail: dict) -> None:
    async with db.unscoped() as conn, conn.transaction():
        # The audit log takes a row only from a connection that has declared the back office
        # (migration 0016); this is the same declaration the back office's own routes make.
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        await conn.execute(
            "insert into platform_audit (staff_email, staff_name, action, subject_type, "
            "subject_id, detail) values ($1, $2, $3, 'staff', $1, $4)",
            email, name, action, detail,
        )


async def _email(to: str, message: tuple[str, str, str]) -> str:
    """Send one of the staff emails. Returns "sent", or why not."""
    if not mail.configured():
        return "mail_not_configured"
    if not mail.deliverable(to):
        return "not_deliverable"
    subject, text, html = message
    try:
        await mail.send(to, subject, text, html)
    except Exception as error:  # noqa: BLE001
        log.error("a staff security email could not be sent: %s", type(error).__name__)
        return "send_failed"
    return "sent"


async def record_sign_in(db: Database, request: Request, email: str) -> dict | None:
    """Called after a correct code. For a member of staff: remember the device and the address,
    write `staff.sign_in` to the audit log and, when either is new, email them. Returns what it
    recorded (for the tests), or None for anyone who is not staff. Never raises: a note that
    cannot be written must not stop a person who has proved who they are."""
    try:
        async with db.unscoped() as conn:
            if not await is_staff(conn, email):
                return None
            name = await conn.fetchval("select name from users where email = $1", email) or ""
        address = ratelimit.client_address(request)
        shown = "unknown" if address in (ratelimit.UNVOUCHED, "unknown") else address
        agent = request.headers.get("user-agent", "")[:300]
        device = describe_device(agent)
        async with db.unscoped() as conn, conn.transaction():
            new_device = await _remember(conn, email, "device", _digest(agent))
            new_address = await _remember(conn, email, "address", _digest(address))
        emailed = "not_needed"
        if new_device or new_address:
            emailed = await _email(email, mail.staff_sign_in_message(
                name, datetime.now(UTC), device, shown, new_device, new_address,
            ))
        detail = {
            "device": device, "address": shown, "new_device": new_device,
            "new_address": new_address, "email": emailed,
        }
        await _audit(db, email, name, "staff.sign_in", detail)
        return detail
    except Exception:  # noqa: BLE001
        log.exception("the sign-in of a member of staff could not be recorded")
        return None
