"""The Catalog's demo shops (ALY-110): one fictional shop for every type of business that has a
Catalog, ready to show an owner. Run it with one command against whatever database the
environment points at:

    uv run python -m alyr.seed_catalog_demos                  # make or reset all seven
    uv run python -m alyr.seed_catalog_demos --only bakery    # one of them
    uv run python -m alyr.seed_catalog_demos --list           # what it would make, nothing written
    uv run python -m alyr.seed_catalog_demos --repair-only    # only fix old cancelled credit orders

(On the founder's laptop: `scripts/demo.sh shops`.)

Each shop has 15 to 30 items in English and Arabic with drawn tiles for photos, the Catalog
switched on for itself (and nowhere else), and two weeks of orders, cancellations, deliveries,
counts and sold-out items, or of bookings for the salon. The wholesaler has a customer in each
price group. Everything is invented; nothing in it can reach a phone.

Safe to run again and again: each shop is emptied and written fresh, the same way every time
for the same moment. It will not run against anything that is not clearly a local database
(`ALYR_ENV=local` and a local host) unless `--allow-non-local` is given, it only ever touches
the demo shops' own rows (their ids and addresses are fixed here), it refuses if one of those
addresses belongs to a shop that is not a demo, and it never deletes any other shop.

Photos are drawn at run time (`demo/tiles.py`) and kept on this machine's disk through the
same photo pipeline an upload uses, never on R2, whatever the settings say.
"""

import argparse
import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

from alyr.config import Settings, get_settings
from alyr.core import links
from alyr.core.media import MediaService
from alyr.core.storage import LocalStore
from alyr.db import Database
from alyr.demo import build, history
from alyr.demo.build import Refused
from alyr.demo.model import Shop
from alyr.demo.shops import BY_KEY, SHOPS
from alyr.modules.items.service import count_active
from alyr.modules.ledger import service as ledger
from alyr.seed import DEMO_TENANT_ID
from alyr.seed_bookings import SAMPLES
from alyr.seed_qirfa import QIRFA_TENANT_ID

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres", "host.docker.internal"}
SEED = 2026
# Every demo shop on the platform, old and new: the only shops a repair may touch.
DEMO_TENANTS = (
    DEMO_TENANT_ID, QIRFA_TENANT_ID, *(s.tenant_id for s in SAMPLES.values()),
    *(s.tenant_id for s in SHOPS),
)


def check_target(settings: Settings, allow_non_local: bool = False) -> None:
    """Refuse to run against a database that is not clearly a local one. The two ways of
    being sure are the environment (`ALYR_ENV=local`) and where both database addresses are."""
    if allow_non_local:
        return
    problems = []
    if settings.env != "local":
        problems.append(f"ALYR_ENV is “{settings.env}”, not “local”")
    for label, dsn in (("the app database", settings.database_url),
                       ("the migration database", settings.migration_url)):
        host = urlparse(dsn).hostname
        if host not in LOCAL_HOSTS:
            problems.append(f"{label} is on “{host}”, which is not this machine")
    if problems:
        raise Refused(
            "This is not clearly a local database, so the demo shops were not made: "
            + "; ".join(problems) + ". Point the environment at a local database, or pass "
            "--allow-non-local if you really mean it."
        )


def history_start(now: datetime) -> datetime:
    """The start of the first day of the history, on the shops' own clock."""
    return history.local(now.astimezone(build.TZ).date() - timedelta(days=history.DAYS - 1), 0)


async def reset_shop(
    owner: Database, app: Database, media: MediaService, shop: Shop, now: datetime,
    web_url: str, seed: int = SEED,
) -> tuple[dict, str]:
    """Empty one demo shop and write it again. The services that make items and orders rely
    on row-level security to see only one shop, so they run as the app role; the owner role
    only does what the app role may not (empty the shop, move the catalogue's dates into the
    past), and always names the shop. The photos are stored in transactions of their own, so
    the work goes in steps: wipe, draw and store the tiles, build, date, write the history.
    Returns what it made, in counts, and one customer's own order link (empty when the shop
    takes no orders)."""
    async with owner.unscoped() as conn:
        await build.ensure_tenant(conn, shop, now)
    async with owner.tenant(shop.tenant_id) as conn:
        await build.wipe(conn, shop.tenant_id)
    assets = await build.upload_tiles(media, shop)
    start = history_start(now)
    rng = random.Random(f"{seed}:{shop.key}")
    async with app.tenant(shop.tenant_id) as conn:
        made = await build.start(conn, shop, now, start)
        await build.add_customers(made, rng, start)
        await build.add_items(made, media, assets)
    async with owner.tenant(shop.tenant_id) as conn:
        await build.back_date(conn, shop.tenant_id, start - timedelta(days=1))
    async with app.tenant(shop.tenant_id) as conn:
        made.conn = conn
        counts = await history.run(made, rng, web_url)
    async with owner.tenant(shop.tenant_id) as conn:
        # The photo store's own jobs finished while the tiles were stored; what is left is
        # only the hold-expiry job of the one order still waiting for its payment.
        await conn.execute(
            "delete from jobs where tenant_id = $1 and kind = 'media.sync'", shop.tenant_id
        )
    counts = {"items": len(made.items), "customers": len(made.people), "tiles": len(assets),
              **counts}
    link = ""
    if shop.orders_a_day and made.people:
        link = links.order_url(web_url, shop.slug, shop.tenant_id, made.people[0].id)
    return counts, link


async def repair_cancelled_account_orders(owner: Database, tenant_ids=DEMO_TENANTS) -> int:
    """A demo shop made before ALY-128 may hold a credit sale for an order that was
    cancelled, so its customer still seems to owe it. Give each such sale its reversal, the
    way `cancel_order` would have, dated when the order was cancelled. Only the demo shops'
    own orders are looked at. Returns how many were repaired."""
    repaired = 0
    for tenant_id in tenant_ids:
        # The owner role is not held back by row-level security, so every statement here
        # names the shop itself.
        async with owner.tenant(tenant_id) as conn:
            orders = await conn.fetch(
                "select o.id, o.contact_id, o.total, o.number, o.created_at from orders o "
                "where o.tenant_id = $1 and o.status = 'cancelled' and o.payment = 'on_account' "
                "and not exists (select 1 from ledger_entries r where r.tenant_id = $1 "
                "and r.kind = 'reversal' and r.order_id = o.id)", tenant_id,
            )
            for o in orders:
                # An old sale was not tied to its order: find it by its note and amount.
                await conn.execute(
                    "update ledger_entries set order_id = $1 where tenant_id = $5 "
                    "and kind = 'sale' and order_id is null and contact_id = $2 "
                    "and note = $3 and amount = $4",
                    o["id"], o["contact_id"], f"Order #{o['number']}", o["total"], tenant_id,
                )
                at = await conn.fetchval(
                    "select max(created_at) from activity where tenant_id = $2 "
                    "and subject = 'order' and subject_id = $1 and action = 'cancelled'",
                    o["id"], tenant_id,
                ) or o["created_at"] + timedelta(hours=1)
                done = await ledger.reverse_sale(
                    conn, o["id"], o["contact_id"], o["total"], o["number"], "Demo repair", at=at
                )
                repaired += bool(done)
    return repaired


def describe(shop: Shop, web_url: str, counts: dict | None = None, link: str = "") -> list[str]:
    owner, agent = shop.owner[0], shop.agent[0]
    lines = [f"{shop.name} ({shop.name_ar}), {shop.kind}, {shop.area}",
             f"    sign in: {owner} (owner) or {agent} (agent); the code shows on the sign-in page",
             f"    workspace: {web_url}/app/catalog"]
    if shop.orders_a_day:
        lines.append(f"    order page, public: {web_url}/s/{shop.slug}")
    if link:
        lines.append(f"    order page as {shop.customers[0].name}: {link}")
    if counts:
        lines.append("    made: " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    return lines


async def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m alyr.seed_catalog_demos", description=(
        "Make or reset the Catalog's demo shops, one for every type of business."))
    parser.add_argument("--only", help="comma-separated keys: " + ", ".join(BY_KEY))
    parser.add_argument("--list", action="store_true", help="say what would be made, write nothing")
    parser.add_argument("--repair-only", action="store_true",
                        help="only give cancelled credit orders in the demo shops their reversal")
    parser.add_argument("--allow-non-local", action="store_true",
                        help="run against a database that is not clearly a local one")
    args = parser.parse_args(argv)
    settings = get_settings()
    keys = args.only.split(",") if args.only else list(BY_KEY)
    unknown = [k for k in keys if k not in BY_KEY]
    if unknown:
        print(f"Unknown shop: {', '.join(unknown)}. Choose from {', '.join(BY_KEY)}.")
        return 2
    shops = [BY_KEY[k] for k in keys]
    web_url = settings.public_web_url.rstrip("/")
    if args.list:
        for shop in shops:
            print("\n".join(describe(shop, web_url)))
        return 0
    try:
        check_target(settings, args.allow_non_local)
    except Refused as refusal:
        print(refusal)
        return 1

    owner = Database(settings.migration_url)
    app = Database(settings.database_url)
    await owner.connect()
    await app.connect()
    try:
        fixed = await repair_cancelled_account_orders(owner)
        if fixed:
            print(f"Repaired {fixed} cancelled credit order(s) that still had their sale.")
        if args.repair_only:
            return 0
        media = MediaService(app, LocalStore(Path(settings.media_local_dir)), settings)
        media.item_counter = count_active
        now = datetime.now(UTC)
        for shop in shops:
            try:
                counts, link = await reset_shop(owner, app, media, shop, now, web_url)
            except Refused as refusal:
                print(f"{shop.name}: {refusal}")
                return 1
            print("\n".join(describe(shop, web_url, counts, link)))
        print(
            f"\nPhotos are drawn tiles kept on this machine under {settings.media_local_dir}. "
            "Start the API with the R2 settings empty so it serves them "
            "(scripts/demo.sh up --local-photos). Nothing was sent to anyone."
        )
    finally:
        await owner.close()
        await app.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
