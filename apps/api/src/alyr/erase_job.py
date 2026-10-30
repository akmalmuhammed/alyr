"""The daily job that erases stopped clients' data (spec 042, D-116).

    python -m alyr.erase_job                  today's run: a report, and the erasure itself only
                                              when ALYR_ERASE_STOPPED_CLIENTS is true
    python -m alyr.erase_job --dry-run        a report only, whatever the switch says
    python -m alyr.erase_job hold <client id> <why>   stop this client being erased until released
    python -m alyr.erase_job release <client id>
    python -m alyr.erase_job status           the latest receipts, holds and photo-store progress

It connects as the database owner (ALYR_MIGRATION_URL), because the application's role cannot
delete a business. In production it is the Cloud Run job `alyr-erase`, run daily by Cloud
Scheduler under the `alyr-migrate` account (infra/gcp/erase.sh); nothing that is always on holds
the owner's address. The report it prints is JSON with IDs, dates and counts: never a name, a
number or a message, so it is safe in the job's log.
"""

import argparse
import asyncio
import json
import sys
from uuid import UUID

from alyr.config import get_settings
from alyr.core import erase
from alyr.db import Database


async def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="alyr.erase_job")
    parser.add_argument("--dry-run", action="store_true", help="report only, whatever the switch")
    parser.add_argument("--client", type=UUID, help="look at this client only")
    commands = parser.add_subparsers(dest="command")
    held = commands.add_parser("hold", help="stop a client being erased until released")
    held.add_argument("client_id", type=UUID)
    held.add_argument("reason", nargs="+")
    freed = commands.add_parser("release", help="let a held client be erased when due")
    freed.add_argument("client_id", type=UUID)
    commands.add_parser("status", help="the latest receipts, holds and photo-store progress")
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.migration_url)
    await db.connect()
    try:
        if args.command == "hold":
            ok = await erase.hold(db, args.client_id, " ".join(args.reason))
            print(json.dumps({"held": ok}))
            return 0 if ok else 1
        if args.command == "release":
            ok = await erase.release(db, args.client_id)
            print(json.dumps({"released": ok}))
            return 0 if ok else 1
        if args.command == "status":
            print(json.dumps(
                await erase.status(db, days=erase.after_days(settings)), default=str))
            return 0
        apply = settings.erase_stopped_clients and not args.dry_run
        report = await erase.run(
            db, apply=apply, settings=settings, only=[args.client] if args.client else None
        )
        report["switch"] = "on" if settings.erase_stopped_clients else "off"
        print(json.dumps(report, default=str))
        return 1 if report["failed"] else 0
    finally:
        await db.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
