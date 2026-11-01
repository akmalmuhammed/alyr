"""Switch the database roles' guard on and off (ALY-125 part 3, SEC-5, D-137).

    python -m alyr.db_roles status
    python -m alyr.db_roles enforce  "API and worker on their own logins, checked"
    python -m alyr.db_roles relax    "back office unreachable, undoing"

Until `enforce`, every guard (`is_back_office()`, `assert_platform_admin()`, the jobs policy)
reads only the session setting the application writes, as it always did (migration 0097 changes
nothing by itself). After it, each also asks which login made the connection: `alyr_admin`,
`alyr_worker` or the database's owner. The application role can then no longer open the back
office or every business's jobs by writing a setting.

It runs as the database owner (ALYR_MIGRATION_URL), as a Cloud Run job started from the founder's
machine (`infra/gcp/roles.sh`), because the application cannot be the owner. The same standards
as `staff_breakglass`: reviewed, logged (`platform_audit`, in the same transaction as the change),
a short list of commands, a reason of at most 80 characters, and nothing secret printed.

`enforce` refuses unless it can see that the switch will not take the product down: both roles
exist with a login and have a connection open right now (the API's admin pool and the worker),
so the services have been moved to their new logins and a new revision is running. `relax` is
always allowed and puts things back at once.
"""

import argparse
import asyncio
import getpass
import json
import sys
from datetime import UTC, datetime

import asyncpg

from alyr.config import get_settings
from alyr.migrate import PLATFORM_ROLES

MAX_REASON = 80
ACTOR = "database-roles"


class Refused(Exception):
    """The command cannot be carried out; the message is safe to print."""


async def status(conn: asyncpg.Connection) -> dict:
    roles = {}
    for role in ("alyr_app", *PLATFORM_ROLES):
        row = await conn.fetchrow(
            "select rolcanlogin, rolbypassrls, rolsuper, rolcreaterole from pg_roles "
            "where rolname = $1", role)
        roles[role] = None if row is None else {
            "can_log_in": row["rolcanlogin"], "bypasses_rls": row["rolbypassrls"],
            "superuser": row["rolsuper"], "can_create_roles": row["rolcreaterole"],
            "member_of_alyr_app": role != "alyr_app" and bool(await conn.fetchval(
                "select true from pg_auth_members m join pg_roles r on r.oid = m.roleid "
                "join pg_roles u on u.oid = m.member "
                "where r.rolname = 'alyr_app' and u.rolname = $1", role)),
        }
    open_now = {r["usename"]: r["n"] for r in await conn.fetch(
        "select usename, count(*) as n from pg_stat_activity "
        "where datname = current_database() and usename is not null group by usename")}
    guard = await conn.fetchrow("select enforced, changed_at from role_guard")
    return {
        "enforced": guard["enforced"], "changed_at": guard["changed_at"].isoformat(),
        "roles": roles,
        "connections_open_now": {k: open_now.get(k, 0) for k in ("alyr_app", *PLATFORM_ROLES)},
    }


async def _audit(conn: asyncpg.Connection, action: str, reason: str, detail: dict) -> None:
    await conn.execute("select set_config('app.platform_admin', 'on', true)")
    await conn.execute(
        "insert into platform_audit (staff_email, staff_name, action, subject_type, subject_id, "
        "detail) values ($1, 'database roles', $2, 'database', 'role_guard', $3)",
        ACTOR, action,
        json.dumps({"reason": reason, "ran_as": getpass.getuser(),
                    "at": datetime.now(UTC).isoformat(), **detail}),
    )


async def enforce(conn: asyncpg.Connection, reason: str) -> dict:
    seen = await status(conn)
    problems = []
    for role in PLATFORM_ROLES:
        info = seen["roles"][role]
        if info is None:
            problems.append(f"{role} does not exist (run the migration job with its address)")
        elif not info["can_log_in"]:
            problems.append(f"{role} cannot log in (it needs its address in the migration job)")
        elif seen["connections_open_now"][role] == 0:
            problems.append(f"nothing is signed in as {role}: move the "
                            f"{'API' if role == 'alyr_admin' else 'worker'} to it first")
        elif info["superuser"] or info["bypasses_rls"]:
            problems.append(f"{role} can bypass row-level security: it must not")
    if problems:
        raise Refused("not safe to enforce: " + "; ".join(problems))
    async with conn.transaction():
        await conn.execute("update role_guard set enforced = true, changed_at = now()")
        await _audit(conn, "database.roles_enforced", reason,
                     {"connections": seen["connections_open_now"]})
    return await status(conn)


async def relax(conn: asyncpg.Connection, reason: str) -> dict:
    async with conn.transaction():
        await conn.execute("update role_guard set enforced = false, changed_at = now()")
        await _audit(conn, "database.roles_relaxed", reason, {})
    return await status(conn)


COMMANDS = {"status": False, "enforce": True, "relax": True}  # command -> needs a reason


async def run(owner_dsn: str, command: str, reason: str = "") -> dict:
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
            return await status(conn)
        return await (enforce if command == "enforce" else relax)(conn, reason)
    finally:
        await conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("command", choices=sorted(COMMANDS))
    parser.add_argument("reason", nargs="*", help="a short reference; required to change anything")
    args = parser.parse_args(argv)
    try:
        answer = asyncio.run(run(get_settings().migration_url, args.command, " ".join(args.reason)))
    except Refused as error:
        print(f"refused: {error}", file=sys.stderr)
        return 2
    print(json.dumps(answer, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
