"""The way back in for ALYR's own staff when the normal door is shut (ALY-125, D-135).

A member of ALYR staff can be locked out by the cap on wrong codes (`core/staff_security.py`) or
by a lost authenticator (`core/second_factor.py`). This is the founder-run way through. It is a
command, not a screen, on purpose: a screen would be one more door for the person the lock is
there to keep out.

    python -m alyr.staff_breakglass status          akmal@alyr.qa
    python -m alyr.staff_breakglass clear-lock      akmal@alyr.qa "locked out by wrong codes"
    python -m alyr.staff_breakglass reset-factor    akmal@alyr.qa "lost phone, no recovery codes"
    python -m alyr.staff_breakglass open-enrolment  akmal@alyr.qa "enrol a new phone"
    python -m alyr.staff_breakglass ready

It runs as the database owner (ALYR_MIGRATION_URL), as a Cloud Run job started from the
founder's machine (`infra/gcp/staff-access.sh`, `docs/runbooks/staff-sign-in.md`). The
database owner is the one role the application cannot become, so nothing in the application,
and nobody who has stolen a staff sign-in code, can run it.

- **Reviewed.** It is in the repository, in a pull request, with tests
  (`tests/test_staff_breakglass.py`).
- **Logged.** Every change writes `staff.breakglass` to the audit log in the same transaction as
  the change, with the command and the reason. `status` changes nothing and writes nothing.
- **Narrow.** It knows only the commands below, only for an email on the staff list, and it
  asks for a reason of up to 80 characters (Google logs a job's arguments, so a reason is a
  reference, never a story or a name).
- **Silent about secrets.** It prints counts, times and flags. It never prints a code, a
  secret or a hash.
"""

import argparse
import asyncio
import getpass
import json
import sys
from datetime import UTC, datetime

import asyncpg

from alyr.config import get_settings
from alyr.core import ratelimit, second_factor, staff_security

MAX_REASON = 80
ACTOR = "break-glass"


class Refused(Exception):
    """The command cannot be carried out; the message is safe to print."""


def _clean(email: str) -> str:
    return email.strip().lower()


async def _require_staff(conn: asyncpg.Connection, email: str) -> None:
    if not await conn.fetchval("select true from platform_admins where email = $1", email):
        raise Refused("that address is not on the ALYR staff list")


async def status(conn: asyncpg.Connection, email: str) -> dict:
    """Where this account stands. Reads only."""
    await _require_staff(conn, email)
    wrong = await staff_security.count_wrong(conn, email)
    recent = await conn.fetch(
        "select at, action, detail from platform_audit where staff_email = $1 "
        "and action in ('staff.sign_in', 'staff.locked') order by id desc limit 5", email,
    )
    return {
        "email": email,
        "wrong_codes_in_24_hours": wrong,
        "cap": staff_security.WRONG_CODES_PER_DAY,
        "locked": wrong >= staff_security.WRONG_CODES_PER_DAY,
        "unused_codes": await conn.fetchval(
            "select count(*) from login_codes where email = $1 and not used "
            "and expires_at > now()", email),
        "known_devices": await conn.fetchval(
            "select count(*) from staff_known where email = $1 and kind = 'device'", email),
        "known_addresses": await conn.fetchval(
            "select count(*) from staff_known where email = $1 and kind = 'address'", email),
        "second_factor": await _factor(conn, email),
        "recent": [
            {"at": r["at"].isoformat(), "action": r["action"], "detail": _detail(r["detail"])}
            for r in recent
        ],
    }


async def _factor(conn: asyncpg.Connection, email: str) -> dict:
    row = await conn.fetchrow(
        "select confirmed_at, pending_sealed is not null as pending, enrol_open_until "
        "from staff_factors where email = $1", email,
    )
    return {
        "enrolled": bool(row and row["confirmed_at"]),
        "confirmed_at": row["confirmed_at"].isoformat() if row and row["confirmed_at"] else None,
        "setup_started": bool(row and row["pending"]),
        "recovery_codes_left": await conn.fetchval(
            "select count(*) from staff_recovery_codes where email = $1 and used_at is null",
            email),
        "enrolment_open_until": (
            row["enrol_open_until"].isoformat() if row and row["enrol_open_until"] else None
        ),
        "wrong_factor_codes_in_24_hours": await ratelimit.count_on(
            conn, second_factor.BUCKET, email, second_factor.DAILY.seconds
        ),
    }


def _detail(value) -> dict:
    return json.loads(value) if isinstance(value, str) else dict(value or {})


async def _audit(conn: asyncpg.Connection, email: str, command: str, reason: str,
                 detail: dict) -> None:
    await conn.execute("select set_config('app.platform_admin', 'on', true)")
    await conn.execute(
        "insert into platform_audit (staff_email, staff_name, action, subject_type, subject_id, "
        "detail) values ($1, 'break-glass script', 'staff.breakglass', 'staff', $2, $3)",
        ACTOR, email,
        json.dumps({"command": command, "reason": reason, "ran_as": getpass.getuser(),
                    "at": datetime.now(UTC).isoformat(), **detail}),
    )


async def clear_lock(conn: asyncpg.Connection, email: str, reason: str) -> dict:
    """Forget the wrong codes of the last day (sign-in codes and authenticator codes) and void
    every code not yet used, so a code an attacker already holds dies with the lock."""
    await _require_staff(conn, email)
    async with conn.transaction():
        cleared = await staff_security.clear_wrong(conn, email)
        factor_cleared = await ratelimit.forget_on(conn, second_factor.BUCKET, email)
        voided = await conn.fetchval(
            "with v as (update login_codes set used = true where email = $1 and not used "
            "returning 1) select count(*) from v", email)
        await _audit(conn, email, "clear-lock", reason,
                     {"wrong_codes_cleared": cleared, "codes_voided": voided,
                      "authenticator_wrong_codes_cleared": factor_cleared})
    return {"email": email, "wrong_codes_cleared": cleared, "codes_voided": voided,
            "authenticator_wrong_codes_cleared": factor_cleared}


async def reset_factor(conn: asyncpg.Connection, email: str, reason: str) -> dict:
    """Remove the authenticator and the recovery codes, forget its wrong codes, and sign the
    person out everywhere. For a lost phone with no recovery code. While the second factor is
    required the account then has no way in until `open-enrolment`."""
    await _require_staff(conn, email)
    async with conn.transaction():
        codes = await conn.fetchval(
            "with d as (delete from staff_recovery_codes where email = $1 returning 1) "
            "select count(*) from d", email)
        factor = await conn.fetchval(
            "with d as (delete from staff_factors where email = $1 returning 1) "
            "select count(*) from d", email)
        await ratelimit.forget_on(conn, second_factor.BUCKET, email)
        sessions = await conn.fetchval(
            "with d as (delete from sessions where user_id in "
            "(select id from users where email = $1) returning 1) select count(*) from d", email)
        await _audit(conn, email, "reset-factor", reason, {
            "factor_removed": bool(factor), "recovery_codes_removed": codes,
            "sessions_ended": sessions,
        })
    return {"email": email, "factor_removed": bool(factor), "recovery_codes_removed": codes,
            "sessions_ended": sessions}


async def open_enrolment(conn: asyncpg.Connection, email: str, reason: str) -> dict:
    """Let the person set up an authenticator for the next 30 minutes even while the second
    factor is required. Refused while they have a working one: replacing it needs a current
    code, and `reset-factor` is the way past a lost one."""
    await _require_staff(conn, email)
    async with conn.transaction():
        if await conn.fetchval(
            "select true from staff_factors where email = $1 and confirmed_at is not null", email
        ):
            raise Refused("this account has a working authenticator: replace it with a current "
                          "code, or run reset-factor first if the phone is lost")
        until = await conn.fetchval(
            "insert into staff_factors (email, enrol_open_until) "
            "values ($1, now() + make_interval(mins => $2)) "
            "on conflict (email) do update set enrol_open_until = excluded.enrol_open_until, "
            "updated_at = now() returning enrol_open_until",
            email, second_factor.ENROLMENT_WINDOW_MINUTES,
        )
        await _audit(conn, email, "open-enrolment", reason,
                     {"open_until": until.isoformat()})
    return {"email": email, "enrolment_open_until": until.isoformat()}


async def ready(conn: asyncpg.Connection) -> dict:
    """Whether the second factor can be required without locking anybody out: every member of
    ALYR staff has a working authenticator and at least one recovery code left. Refuses (and so
    fails the job) when not, which is what stops `infra/gcp/staff-access.sh require`."""
    rows = await conn.fetch(
        "select p.email, f.confirmed_at is not null as enrolled, "
        "(select count(*) from staff_recovery_codes c where c.email = p.email "
        "and c.used_at is null) as codes_left "
        "from platform_admins p left join staff_factors f on f.email = p.email order by p.email"
    )
    people = [
        {"email": r["email"], "enrolled": r["enrolled"], "recovery_codes_left": r["codes_left"]}
        for r in rows
    ]
    behind = [p["email"] for p in people if not p["enrolled"] or p["recovery_codes_left"] == 0]
    if behind:
        raise Refused(
            "not ready: " + ", ".join(behind) + " would be locked out. Each needs a working "
            "authenticator and at least one recovery code (Security in the console)"
        )
    return {"ready": True, "staff": people}


COMMANDS = {  # command -> needs a reason
    "status": False, "clear-lock": True, "reset-factor": True, "open-enrolment": True,
    "ready": False,
}


async def run(owner_dsn: str, command: str, email: str = "", reason: str = "") -> dict:
    email = _clean(email)
    reason = " ".join(reason.split())
    if command not in COMMANDS:
        raise Refused(f"unknown command; the commands are: {', '.join(COMMANDS)}")
    if COMMANDS[command] and not reason:
        raise Refused("a reason is needed: a short reference, not a story or a name")
    if len(reason) > MAX_REASON:
        raise Refused(f"the reason is {MAX_REASON} characters at most: Google logs the arguments")
    conn = await asyncpg.connect(owner_dsn)
    try:
        if command == "ready":
            return await ready(conn)
        if not email:
            raise Refused("an email address is needed")
        if command == "status":
            return await status(conn, email)
        change = {"clear-lock": clear_lock, "reset-factor": reset_factor,
                  "open-enrolment": open_enrolment}[command]
        return await change(conn, email, reason)
    finally:
        await conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("command", choices=sorted(COMMANDS))
    parser.add_argument("email", nargs="?", default="", help="not needed for `ready`")
    parser.add_argument("reason", nargs="*", help="a short reference; required to change anything")
    args = parser.parse_args(argv)
    try:
        answer = asyncio.run(
            run(get_settings().migration_url, args.command, args.email, " ".join(args.reason))
        )
    except Refused as error:
        print(f"refused: {error}", file=sys.stderr)
        return 2
    print(json.dumps(answer, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
