"""Switch Discovery on for one shop on a developer's machine, with the fictional sample business
turned on (spec 065). For the demo shop, and for the screens' author:

    uv run python -m alyr.discovery_demo                 # the demo shop (Al Noor Electricals)
    uv run python -m alyr.discovery_demo --tenant <id>   # another local shop
    uv run python -m alyr.discovery_demo --off           # switch it off again; nothing is deleted

It switches the `discovery` module on and turns the `sample` connection on, which gives the shop
the five fictional branches if it has no places yet and writes what the fictional owner has
confirmed about each (opening hours, phone, category, name and WhatsApp number: spec 066), never
over a fact someone typed. That is all a proposal needs: run a check-up (from the workspace or
`POST /api/discovery/runs`), and Al Sadd's missing hours become a proposal to approve, in the
workspace or, on a linked staff number, on WhatsApp (`PROPOSALS`). The demo never runs a check-up
itself, sends nothing and touches no seed. Approving changes the made-up listing inside ALYR, not
anything on Google, and a later check-up shows the score going up. It works only with
`ALYR_ENV=local`: on a real database the back office switches the module (`/ops`, a business's
modules) and the owner turns the connection on in the workspace.
"""

import argparse
import asyncio
from uuid import UUID

from alyr.config import get_settings
from alyr.core.actions import Caller
from alyr.db import Database
from alyr.modules.discovery import KEY, actions
from alyr.seed import DEMO_TENANT_ID


async def switch(database_url: str, tenant_id: UUID, on: bool = True) -> None:
    db = Database(database_url)
    await db.connect()
    try:
        async with db.tenant(tenant_id) as conn:
            await conn.execute(
                "insert into tenant_modules (module_key, enabled, enabled_at, enabled_by) "
                "values ($1, $2, now(), 'discovery_demo') "
                "on conflict (tenant_id, module_key) do update set enabled = excluded.enabled, "
                "enabled_at = now(), enabled_by = excluded.enabled_by",
                KEY, on,
            )
            if on:
                caller = Caller(None, "Discovery demo", "owner", "system")
                await actions.set_connection(conn, caller, {"kind": "sample", "on": True})
    finally:
        await db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Switch Discovery on for one local shop.")
    parser.add_argument("--tenant", type=UUID, default=DEMO_TENANT_ID)
    parser.add_argument("--off", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    if settings.env != "local":
        raise SystemExit("This works only with ALYR_ENV=local. In production use the back office.")
    asyncio.run(switch(settings.database_url, args.tenant, not args.off))
    print(f"Discovery is {'off' if args.off else 'on, with the sample business'} for {args.tenant}")


if __name__ == "__main__":
    main()
