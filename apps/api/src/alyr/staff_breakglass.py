"""The way back in for ALYR's own staff when the normal door is shut (ALY-125, D-135).

A member of ALYR staff can be locked out by the cap on wrong codes (`core/staff_security.py`) or,
once D-136 is built, by a lost authenticator. This is the founder-run way through. It is a
command, not a screen, on purpose: a screen would be one more door for the person the lock is
there to keep out.

    python -m alyr.staff_breakglass status      akmal@alyr.qa
    python -m alyr.staff_breakglass clear-lock  akmal@alyr.qa "locked out by wrong codes"

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
from alyr.core import staff_security

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
        "recent": [
            {"at": r["at"].isoformat(), "action": r["action"], "detail": _detail(r["detail"])}
            for r in recent
        ],
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
    """Forget the wrong codes of the last day and void every code not yet used, so a code an
    attacker already holds dies with the lock."""
    await _require_staff(conn, email)
    async with conn.transaction():
        cleared = await staff_security.clear_wrong(conn, email)
        voided = await conn.fetchval(
            "with v as (update login_codes set used = true where email = $1 and not used "
            "returning 1) select count(*) from v", email)
        await _audit(conn, email, "clear-lock", reason,
                     {"wrong_codes_cleared": cleared, "codes_voided": voided})
    return {"email": email, "wrong_codes_cleared": cleared, "codes_voided": voided}


COMMANDS = {"status": False, "clear-lock": True}  # command -> needs a reason


async def run(owner_dsn: str, command: str, email: str, reason: str = "") -> dict:
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
        if command == "status":
            return await status(conn, email)
        return await clear_lock(conn, email, reason)
    finally:
        await conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("command", choices=sorted(COMMANDS))
    parser.add_argument("email")
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
