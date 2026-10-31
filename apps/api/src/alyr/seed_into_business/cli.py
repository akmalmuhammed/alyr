"""`python -m alyr.seed_into_business`: fill ONE existing business with ten weeks of a made-up,
believable small business, so a client in a meeting sees a real-looking workspace (spec 063,
decision D-150, docs/runbooks/demo-data.md).

    python -m alyr.seed_into_business --owner-email akmal@alyr.qa \\
        --yes-this-business-is-a-test --dry-run
    python -m alyr.seed_into_business --owner-email akmal@alyr.qa --yes-this-business-is-a-test
    python -m alyr.seed_into_business --owner-email akmal@alyr.qa --yes-this-business-is-a-test --replace
    python -m alyr.seed_into_business --owner-email akmal@alyr.qa --yes-this-business-is-a-test --remove

The rules it holds itself to, each with a test:

* It does nothing unless the caller types `--yes-this-business-is-a-test` AND ALYR staff have
  marked the business as a test business in the back office (`tenants.demo_data_allowed`).
* `--dry-run` rehearses the whole load in a transaction that is rolled back, so what it prints
  is what a real run would leave, and nothing is written.
* It writes inside that business's rows only, as the product's own database role, so row-level
  security holds. The database owner is used only for what that role may not do (moving the
  dates of rows the load itself just made, removing what it made) and always names the business.
* It never sends: no WhatsApp message, no email, no webhook, and no queued job that would. The
  made-up customers sit on the business's private test line, which goes nowhere.
* A business with activity of its own is refused unless `--replace` is given; then a copy of
  everything is taken first, and only the rows of the previous load are removed. A row the
  business had before the load is never altered except by name in `manifest.RESTORABLE`, and
  `--remove` puts those back.
* Run twice, it does not double: a second run says the business is loaded already.
"""

import argparse
import asyncio
import contextlib
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import asyncpg

from alyr import db as dbmod
from alyr.config import Settings, get_settings
from alyr.core import export
from alyr.core.media import MediaService
from alyr.core.storage import LocalStore, Store
from alyr.db import Database
from alyr.modules.items.service import count_active
from alyr.seed_into_business import loader, manifest, summary
from alyr.seed_into_business.context import Refused, Run, Target

SEED = 2026
# Activity that is the business's own: rows about customers who are not the owner's test line.
# (table, the column that names the customer)
ACTIVITY = (
    ("orders", "contact_id"), ("bookings", "contact_id"), ("messages", "contact_id"),
    ("ledger_entries", "contact_id"), ("payment_requests", "contact_id"),
    ("manual_payments", "contact_id"), ("documents", "contact_id"),
)
YES = "--yes-this-business-is-a-test"


class NullStore:
    """A photo store that has nothing: the copy taken before `--replace` then says how many
    photos it could not include, as the product's download does when the store is down."""

    name = "none"

    async def get(self, key: str) -> bytes | None:
        return None


class Rehearsal(Database):
    """The whole load on one connection inside one transaction that is rolled back: the dry run.
    Every `tenant()` and `unscoped()` of the load becomes a savepoint on that connection. The
    product's own role is what writes the story, so row-level security holds in the rehearsal
    exactly as in a real run: the connection becomes that role (`set role`) for as long as a
    block of the load that is the product's is open, and is the owner again outside it."""

    def __init__(self, conn: asyncpg.Connection, shared: dict, role: str | None) -> None:
        super().__init__("")
        self._conn, self._shared, self._role = conn, shared, role

    async def connect(self) -> None:
        return None

    async def close(self) -> None:
        return None

    @contextlib.asynccontextmanager
    async def _connection(self):
        shared, conn = self._shared, self._conn
        if shared["depth"] and shared["role"] != self._role:
            raise RuntimeError("the rehearsal cannot mix the owner and the product's role")
        if shared["depth"] == 0 and self._role:
            try:
                await conn.execute(f'set role "{self._role}"')
            except asyncpg.InsufficientPrivilegeError:
                # PostgreSQL 16: whoever created a role may let themselves act as it.
                await conn.execute(f'grant "{self._role}" to current_user with set true')
                await conn.execute(f'set role "{self._role}"')
        shared["depth"] += 1
        shared["role"] = self._role
        try:
            yield conn
        finally:
            shared["depth"] -= 1
            if shared["depth"] == 0 and self._role:
                await conn.execute("reset role")


# ── finding the business and holding the rules ────────────────────────────────────────────


async def find(owner: Database, owner_email: str | None, tenant_id: str | None) -> Target:
    async with owner.unscoped() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "select t.*, (select u.email from memberships m join users u on u.id = m.user_id "
                "where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1) "
                "as owner_email, (select m.user_id from memberships m where m.tenant_id = t.id "
                "and m.role = 'owner' order by m.created_at limit 1) as owner_user "
                "from tenants t where t.id = $1", UUID(tenant_id))
        else:
            rows = await conn.fetch(
                "select t.*, u.email as owner_email, u.id as owner_user from tenants t "
                "join memberships m on m.tenant_id = t.id and m.role = 'owner' "
                "join users u on u.id = m.user_id where lower(u.email) = lower($1)",
                owner_email)
    if not rows:
        raise Refused("no such business: nobody is the owner of a business with that address "
                      "(or no business has that id). Nothing was changed.")
    if len(rows) > 1:
        ids = ", ".join(f"{r['name']} {r['id']}" for r in rows)
        raise Refused(f"that address owns more than one business ({ids}). Name one with "
                      "--tenant-id. Nothing was changed.")
    r = rows[0]
    return Target(r["id"], r["name"], r["name_ar"], r["slug"] or str(r["id"])[:8],
                  r["timezone"], r["business_type"], r["demo_data_allowed"],
                  r["owner_email"] or "", r["owner_user"])


def require_test_business(target: Target, *, needs_mark: bool) -> None:
    if needs_mark and not target.demo_data_allowed:
        raise Refused(
            f"“{target.name}” has not been marked as a test business, so it was left alone. "
            "ALYR staff mark it in the back office (the switch “Test business: demo data may "
            "be loaded” on its page), or run the SQL step in docs/runbooks/demo-data.md.")


async def active_run(conn: asyncpg.Connection, tenant_id: UUID):
    return await conn.fetchrow(
        "select * from demo_seed_runs where tenant_id = $1 and status = 'active'", tenant_id)


async def activity_outside(conn: asyncpg.Connection, tenant_id: UUID, manifest_: dict) -> dict:
    """The business's own activity: rows about its customers (not its owner's test line) that no
    load made. Counts per table, only those above zero."""
    inserted = manifest_.get("inserted", {}) if manifest_ else {}
    found: dict[str, int] = {}
    for table, column in ACTIVITY:
        n = await conn.fetchval(
            f'select count(*) from "{table}" t where t.tenant_id = $1 and not exists '
            f'(select 1 from contacts c where c.id = t."{column}" and c.wa_user_id like \'TEST.%\')',
            tenant_id)
        n -= len(inserted.get(table, []))
        if n > 0:
            found[table] = n
    n = await conn.fetchval(
        "select count(*) from contacts where tenant_id = $1 and role = 'customer' and "
        "coalesce(wa_user_id, '') not like 'TEST.%'", tenant_id)
    n -= len(inserted.get("contacts", []))
    if n > 0:
        found["customers"] = n
    return found


async def starts_after(conn: asyncpg.Connection, tenant_id: UUID) -> tuple[int, int]:
    """Where the story's order and booking numbers begin, so they cannot meet the business's."""
    order = await conn.fetchval("select max(number) from orders where tenant_id = $1", tenant_id)
    booking = await conn.fetchval("select max(number) from bookings where tenant_id = $1",
                                  tenant_id)
    return max(order or 0, 1000) + 1, max(booking or 0, 100) + 1


# ── the modes ─────────────────────────────────────────────────────────────────────────────


async def remove_active(owner: Database, tenant_id: UUID, say) -> bool:
    async with owner.tenant(tenant_id) as conn:
        run = await active_run(conn, tenant_id)
        if run is None:
            return False
        gone = await manifest.remove(conn, tenant_id, run["manifest"])
        for key, kind in (("channel_numbers", "numbers"), ("users", "users")):
            await remove_global(conn, tenant_id, run["manifest"].get(kind, []), key)
        await restore_name(conn, tenant_id, run["manifest"])
        await conn.execute(
            "delete from jobs where tenant_id = $1 and kind = 'media.sync' and "
            "payload->>'asset_id' = any($2::text[])", tenant_id,
            run["manifest"].get("inserted", {}).get("media_assets", []))
        await conn.execute(
            "update demo_seed_runs set status = 'removed', removed_at = now() where id = $1",
            run["id"])
    say(f"Removed the load of {run['created_at']:%d %b %Y %H:%M}: "
        f"{sum(gone.values())} rows in {len(gone)} tables.")
    return True


async def remove_global(conn, tenant_id: UUID, values: list, table: str) -> None:
    """The few things a load makes that are not the business's rows: its private line, and the
    team's sign-in accounts. Removed only if nothing else uses them."""
    if table == "channel_numbers":
        for number in values:
            await conn.execute(
                "delete from channel_numbers where number_id = $1 and tenant_id = $2",
                number, tenant_id)
    else:
        for email in values:
            await conn.execute(
                "delete from users u where u.email = $1 and not exists "
                "(select 1 from memberships m where m.user_id = u.id)", email)


async def restore_name(conn, tenant_id: UUID, manifest_: dict) -> None:
    before = manifest_.get("renamed")
    if before:
        await conn.execute("update tenants set name = $2, name_ar = $3 where id = $1",
                           tenant_id, before["name"], before["name_ar"])


async def take_copy(app: Database, target: Target, directory: Path, say) -> Path:
    """The copy taken before `--replace`: the same ZIP the workspace's “Download all data”
    gives, written to a file whose path is printed."""
    directory.mkdir(parents=True, exist_ok=True)
    at = datetime.now(UTC)
    path = directory / f"alyr-before-demo-{target.slug}-{at:%Y%m%d-%H%M%S}.zip"
    with path.open("wb") as handle:
        async for chunk in export.stream(app, NullStore(), target.id, "demo-data command", at):
            handle.write(chunk)
    say(f"A copy of everything in the business was written to {path} "
        f"({path.stat().st_size // 1024} KB; photos are not in it when the store is not here).")
    return path


async def do_load(owner: Database, app: Database, target: Target, args, settings: Settings,
                  say, *, rehearsal: bool) -> dict:
    store: Store = LocalStore(Path(settings.media_local_dir))
    media = MediaService(app, store, settings)
    media.item_counter = count_active
    async with owner.unscoped() as conn:
        now = await conn.fetchval("select clock_timestamp()")
    run = Run(target, owner, app, media, now, now, args.seed, settings.public_web_url.rstrip("/"),
              "now" if args.photos == "now" else "queue")
    async with owner.tenant(target.id) as conn:
        run.order_start, run.booking_start = await starts_after(conn, target.id)
    pks = await owner_tables(owner, target.id)
    async with owner.tenant(target.id) as conn:
        before = await manifest.take(conn, target.id, pks)
        existing = [r["id"] for r in await conn.fetch(
            "select id from items where tenant_id = $1 and status = 'live'", target.id)]
    try:
        counts = await loader.load(run)
        if args.hide_existing_items and existing:
            async with app.tenant(target.id) as conn:
                await conn.execute(
                    "update items set status = 'hidden' where id = any($1)", existing)
            say(f"Hid {len(existing)} item(s) the business had before (they come back with "
                "--remove).")
        if args.rename_business:
            renamed = await rename(owner, target, args.rename_business)
            run.renamed = renamed
        async with owner.tenant(target.id) as conn:
            after = await manifest.take(conn, target.id, pks)
            inserted, restore = manifest.diff(before, after)
    except BaseException:
        if not rehearsal:
            await rollback_by_diff(owner, target, pks, before, run, say)
        raise
    for change in run.changed:
        say("  switched on / changed: " + change)
    result = {"run": run, "counts": counts, "inserted": inserted, "restore": restore}
    async with owner.tenant(target.id) as conn:
        result["summary"] = await summary.collect(conn, target.id, now)
    return result


async def rename(owner: Database, target: Target, name: str) -> dict:
    async with owner.unscoped() as conn:
        await conn.execute("update tenants set name = $2 where id = $1", target.id, name)
    return {"name": target.name, "name_ar": target.name_ar}


async def owner_tables(owner: Database, tenant_id: UUID) -> dict:
    async with owner.tenant(tenant_id) as conn:
        return await manifest.primary_keys(conn)


async def rollback_by_diff(owner, target: Target, pks, before, run: Run, say) -> None:
    """A load that failed halfway takes itself out again, by the same diff `--remove` uses."""
    try:
        async with owner.tenant(target.id) as conn:
            await loader.clean_queue(conn, run)
            after = await manifest.take(conn, target.id, pks)
            inserted, restore = manifest.diff(before, after, strict=False)
            await manifest.remove(conn, target.id,
                                  {"inserted": inserted, "restore": restore})
            await remove_global(conn, target.id, run.created_numbers, "channel_numbers")
            await remove_global(conn, target.id, run.created_users, "users")
        say("The load failed and was taken out again; the business is as it was.")
    except Exception as error:  # noqa: BLE001 - report both failures
        say(f"The load failed and could not be fully taken out again ({error}). "
            "Run --remove, or restore from the copy.")


async def record_run(owner: Database, target: Target, args, result: dict) -> UUID:
    run: Run = result["run"]
    body = {
        "inserted": result["inserted"], "restore": result["restore"],
        "numbers": run.created_numbers, "users": run.created_users,
    }
    if getattr(run, "renamed", None):
        body["renamed"] = run.renamed
    async with owner.tenant(target.id) as conn:
        return await conn.fetchval(
            "insert into demo_seed_runs (tenant_id, story_end, seed, run_by, manifest, counts) "
            "values ($1, $2, $3, $4, $5, $6) returning id",
            target.id, run.now, str(args.seed), args.run_by, body,
            {area: dict(rows) for area, rows in result["summary"].items()})


# ── the command ───────────────────────────────────────────────────────────────────────────


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m alyr.seed_into_business", description=(
            "Fill one existing business with ten weeks of a made-up bakery and catering "
            "business. Refuses unless the business is marked as a test business."))
    who = p.add_mutually_exclusive_group(required=True)
    who.add_argument("--owner-email", help="the sign-in email of the business's owner")
    who.add_argument("--tenant-id", help="the business's id")
    p.add_argument(YES, dest="yes", action="store_true",
                   help="required: you are loading made-up data into a test business")
    p.add_argument("--dry-run", action="store_true",
                   help="rehearse everything in a transaction that is rolled back; write nothing")
    p.add_argument("--replace", action="store_true",
                   help="take a copy of everything, remove the previous load, and load again")
    p.add_argument("--remove", action="store_true",
                   help="remove exactly what the last load made and leave the business as it was")
    p.add_argument("--hide-existing-items", action="store_true",
                   help="hide the items the business had before (restored by --remove)")
    p.add_argument("--rename-business", metavar="NAME",
                   help="also rename the business (off by default; restored by --remove)")
    p.add_argument("--export-dir", default="/tmp", help="where the copy for --replace is written")
    p.add_argument("--photos", choices=("queue", "now"), default="queue",
                   help="queue: the worker stores the photos (production); now: this machine "
                        "stores them on disk (development)")
    p.add_argument("--seed", type=int, default=SEED)
    p.add_argument("--run-by", default="", help="who ran it, for the record")
    return p


async def main(argv: list[str]) -> int:
    args = parser().parse_args(argv)
    settings = get_settings()
    say = print
    if not args.yes:
        say(f"Refused: this command writes made-up customers, orders and documents into a "
            f"business. Add {YES} to say the business is a test, and try --dry-run first.")
        return 1
    owner, app = Database(settings.migration_url), Database(settings.database_url)
    await owner.connect()
    await app.connect()
    lock = None
    try:
        target = await find(owner, args.owner_email, args.tenant_id)
        require_test_business(target, needs_mark=not args.remove)
        say(f"Business: {target.name} ({target.slug}), owner {target.owner_email or '?'}")
        if args.dry_run:
            return await rehearse(settings, target, args, say)
        lock = await owner.pool.acquire()
        if not await lock.fetchval("select pg_try_advisory_lock(hashtext($1))",
                                   f"demo-seed:{target.id}"):
            raise Refused("another load or removal is running for this business. Wait for it.")
        return await act(owner, app, target, args, settings, say)
    except Refused as refusal:
        say(f"Refused: {refusal}")
        return 1
    finally:
        if lock is not None:
            await lock.execute("select pg_advisory_unlock_all()")
            await owner.pool.release(lock)
        await owner.close()
        await app.close()


async def act(owner, app, target, args, settings, say) -> int:
    async with owner.tenant(target.id) as conn:
        previous = await active_run(conn, target.id)
        outside = await activity_outside(conn, target.id, previous["manifest"] if previous else {})
    if args.remove:
        if not await remove_active(owner, target.id, say):
            say("Nothing to remove: no load is active in this business.")
        return 0
    if previous and not args.replace:
        say(f"Already loaded on {previous['created_at']:%d %b %Y %H:%M}: nothing was done. "
            "Use --replace to refresh the dates, or --remove to take it out.")
        return 0
    if outside and not args.replace:
        raise Refused(
            "the business already has activity of its own (" + ", ".join(
                f"{n} {t.replace('_', ' ')}" for t, n in outside.items()) + "), so nothing was "
            "loaded. If this is a test business that you want filled anyway, take a copy and "
            "add --replace; the business's own rows are never deleted.")
    if args.replace:
        await take_copy(app, target, Path(args.export_dir), say)
        await remove_active(owner, target.id, say)
    result = await do_load(owner, app, target, args, settings, say, rehearsal=False)
    run_id = await record_run(owner, target, args, result)
    say(f"\nLoaded (run {run_id}). Nothing was sent to anyone.\n")
    say(summary.table(result["summary"]))
    return 0


async def rehearse(settings, target, args, say) -> int:
    """The dry run: the real load, in a transaction that is always rolled back."""
    conn = await asyncpg.connect(settings.migration_url)
    await dbmod._init(conn)
    transaction = conn.transaction()
    await transaction.start()
    try:
        shared = {"depth": 0, "role": None}
        shim = Rehearsal(conn, shared, None)
        shim_app = Rehearsal(conn, shared, urlparse(settings.database_url).username)
        async with shim.tenant(target.id) as scoped:
            previous = await active_run(scoped, target.id)
            if previous:
                gone = await manifest.remove(scoped, target.id, previous["manifest"])
                say(f"(rehearsal) the previous load of {previous['created_at']:%d %b %Y} would "
                    f"be removed first: {sum(gone.values())} rows.")
        if args.remove:
            say("(rehearsal) --remove would take out exactly that and nothing else.")
            return 0
        result = await do_load(shim, shim_app, target, args, settings, say, rehearsal=True)
        say("\nDRY RUN: this is what a real run would leave. Nothing was written.\n")
        say(summary.table(result["summary"]))
        say("\nRows it would add, by table: " + ", ".join(
            f"{t} {len(v)}" for t, v in sorted(result["inserted"].items())))
        if result["restore"]:
            say("Rows of the business's own it would change (and --remove would put back): "
                + ", ".join(f"{t} {len(v)}" for t, v in sorted(result["restore"].items())))
        return 0
    finally:
        await transaction.rollback()
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
