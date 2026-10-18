"""The Catalog's demo shops (ALY-110): one fictional shop for every type of business that has a
Catalog, made by one command (`python -m alyr.seed_catalog_demos`), safe to run again, and
refusing to run where it should not.

The shops are written into the test database once for the whole module, at a fixed moment,
and read from many sides: what each has (items in two languages with drawn tiles, a fortnight
of orders and cancellations, sold-out items, a customer in each price group), that the stock
adds up the way the live engine's does (`stock.mismatches()`, orders against the log, holds
against orders), that the live engine can carry on from the state the history leaves
(ordering, cancelling and expiring a hold in a demo shop), and the guards (a database that is
not local, an address that belongs to a real shop, another shop's rows).
"""

import asyncio
import dataclasses
import io
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from PIL import Image

from alyr import presets, seed_catalog_demos
from alyr.config import Settings, get_settings
from alyr.core import images, links
from alyr.core.media import MediaService
from alyr.core.storage import LocalStore
from alyr.db import Database
from alyr.demo import tiles
from alyr.demo.build import Refused
from alyr.demo.model import Shop
from alyr.demo.shops import BY_KEY, SHOPS, bakery
from alyr.modules.items import stock
from alyr.modules.items.service import count_active
from alyr.modules.ledger import service as ledger
from alyr.modules.orders import holds as order_holds
from alyr.modules.orders import service as orders
from alyr.seed import DEMO_TENANT_ID
from conftest import APP_DSN, OWNER_DSN
from test_consent import owner_sql

NOW = datetime(2026, 10, 15, 10, 30, tzinfo=UTC)  # a Thursday, half past one in Doha
WEB = "http://web.test"
ARABIC = re.compile(r"[؀-ۿ]")
ORDER_SHOPS = [s for s in SHOPS if s.orders_a_day]
HELD: dict[str, int] = {}  # orders still holding stock when the shop was made


def run(coro):
    return asyncio.run(coro)


async def make(shops, now=NOW, folder: Path | None = None) -> dict:
    owner, app = Database(OWNER_DSN), Database(APP_DSN)
    await owner.connect()
    await app.connect()
    try:
        media = MediaService(app, LocalStore(folder), get_settings())
        media.item_counter = count_active
        return {
            shop.key: await seed_catalog_demos.reset_shop(owner, app, media, shop, now, WEB)
            for shop in shops
        }
    finally:
        await owner.close()
        await app.close()


def purge(tenant_ids) -> None:
    """Take the demo shops out of the shared test database, whole: other tests count shops."""

    async def go():
        owner = Database(OWNER_DSN)
        await owner.connect()
        try:
            from alyr.demo import build

            for tenant_id in tenant_ids:
                async with owner.tenant(tenant_id) as conn:
                    await build.wipe(conn, tenant_id)
            async with owner.unscoped() as conn:
                await conn.execute("delete from channel_numbers where tenant_id = any($1)", tenant_ids)
                await conn.execute("delete from tenants where id = any($1)", tenant_ids)
        finally:
            await owner.close()

    run(go())


@pytest.fixture(scope="module")
def shops(tmp_path_factory):
    """All the demo shops, made once. `HELD` is read before any request can sweep a hold."""
    made = run(make(SHOPS, folder=tmp_path_factory.mktemp("tiles")))
    for shop in SHOPS:
        [row] = owner_sql(
            "select count(distinct order_id) as n from stock_holds where tenant_id = $1 "
            "and status = 'held'", shop.tenant_id,
        )
        HELD[shop.key] = row["n"]
        ROWS[shop.key] = row_counts(shop)
    yield made
    purge([s.tenant_id for s in SHOPS])


# What a shop holds, table by table: compared after a second making of it.
COUNTED = ("items", "item_variants", "orders", "order_items", "stock_movements", "stock_holds",
           "contacts", "messages", "activity", "media_assets", "media_links", "ledger_entries",
           "payment_requests", "tenant_modules", "price_groups", "item_group_prices", "bookings",
           "jobs")
ROWS: dict[str, dict[str, int]] = {}


def row_counts(shop: Shop) -> dict[str, int]:
    return {t: owner_sql(f"select count(*) as n from {t} where tenant_id = $1",
                         shop.tenant_id)[0]["n"] for t in COUNTED}


def scalar(sql: str, *args):
    return owner_sql(sql, *args)[0]["n"]


def in_shop(shop: Shop, work):
    """Run `work(conn)` as the app role, inside the shop (so row-level security applies)."""

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(shop.tenant_id) as conn:
                return await work(conn)
        finally:
            await db.close()

    return run(go())


# ── what the shops are ────────────────────────────────────────────────────────────────────


def test_there_is_a_demo_shop_for_every_type_with_a_catalog_and_none_for_the_rest():
    with_catalog = {p.key for p in presets.PRESETS if p.catalog is not None}
    # Salon, spa, clinic and home services share one shape (products sold beside the
    # services, optional); the salon is the demo of that family.
    assert {s.kind for s in SHOPS} == with_catalog - {"spa", "clinic", "home"}
    assert "travel" not in {s.kind for s in SHOPS} and presets.PRESET_BY_KEY["travel"].catalog is None
    assert {s.key for s in SHOPS} == set(BY_KEY) and len(BY_KEY) == len(SHOPS) == 7
    assert len({s.tenant_id for s in SHOPS}) == len({s.slug for s in SHOPS}) == 7
    assert all(s.slug.startswith("demo-") and s.owner[0].endswith(".example") for s in SHOPS)
    assert all(s.agent[0].endswith(".example") for s in SHOPS)


def test_every_shops_words_are_in_both_languages_and_consistent():
    for shop in SHOPS:
        names = [p.name for p in shop.products]
        assert len(names) == len(set(names)), shop.key
        assert len({p.key for p in shop.products}) == len(shop.products), shop.key
        skus = [p.sku for p in shop.products if p.sku] + [
            s.sku for p in shop.products for s in p.sizes if s.sku
        ]
        assert len(skus) == len(set(skus)), shop.key
        assert 15 <= len(shop.products) <= 30, (shop.key, len(shop.products))
        setup = presets.PRESET_BY_KEY[shop.kind].catalog
        categories = {n for n, _ in setup.categories} | {n for n, _ in shop.extra_categories}
        assert {p.category for p in shop.products} <= categories, shop.key
        for p in shop.products:
            assert ARABIC.search(p.name_ar) and not ARABIC.search(p.name), p.key
            assert bool(p.desc) == bool(p.desc_ar), p.key  # a description comes in both or neither
            if p.desc_ar:
                assert ARABIC.search(p.desc_ar), p.key
            assert p.motif in tiles.MOTIFS, p.key
            for g, _ in p.groups:
                assert g in {k for k, _, _ in shop.groups}, (shop.key, p.key)
        for c in shop.customers:
            assert bool(ARABIC.search(c.name)) == (c.lang == "ar"), c.name
            assert c.group in {"", *(k for k, _, _ in shop.groups)}


def test_the_tiles_are_drawn_the_same_every_time_small_and_accepted_by_the_photo_pipeline():
    first = tiles.tile("demo-bakery:cinnamon-roll:", "loaf", 36)
    assert first == tiles.tile("demo-bakery:cinnamon-roll:", "loaf", 36)  # no randomness
    assert first != tiles.tile("demo-bakery:cardamom-bun:", "loaf", 36)  # one item's own
    for motif in tiles.MOTIFS:
        data = tiles.tile(f"probe:{motif}", motif, 200)
        picture = Image.open(io.BytesIO(data))
        assert picture.format == "PNG" and picture.size == (800, 800)
        assert len(data) < 120_000, motif  # drawn at run time, never kept in the repository
        sizes = images.process(data, 40_000_000)  # the real pipeline: checked, redrawn, WebP
        assert [v.long_side for v in sizes] == [320, 800]


# ── what each shop has ────────────────────────────────────────────────────────────────────


def test_each_shop_has_its_items_in_two_languages_with_a_tile_and_the_catalog_on(shops):
    for shop in SHOPS:
        made = shops[shop.key][0]
        assert made["items"] == len(shop.products) and 15 <= made["items"] <= 30
        assert scalar("select count(*) as n from items where tenant_id = $1 and name_ar = ''",
                      shop.tenant_id) == 0
        with_photo = scalar(
            "select count(distinct i.id) as n from items i join media_links l on l.owner_id = i.id "
            "and l.owner_kind = 'item' where i.tenant_id = $1 and i.status = 'live'",
            shop.tenant_id,
        )
        live = scalar("select count(*) as n from items where tenant_id = $1 and status = 'live'",
                      shop.tenant_id)
        assert with_photo == live and live >= 14, shop.key  # every item on sale has its tile
        drafts = scalar("select count(*) as n from items where tenant_id = $1 and status = 'draft'",
                        shop.tenant_id)
        assert drafts >= 1 and scalar(
            "select count(*) as n from items where tenant_id = $1 and is_sample", shop.tenant_id
        ) == 0  # real items, not the type's samples
        modules = {r["module_key"] for r in owner_sql(
            "select module_key from tenant_modules where tenant_id = $1 and enabled",
            shop.tenant_id)}
        assert modules == set(presets.PRESET_BY_KEY[shop.kind].modules_for(True))
        assert "catalog" in modules
        assert scalar("select count(*) as n from item_categories where tenant_id = $1",
                      shop.tenant_id) >= 3


def test_the_catalog_is_on_for_the_demo_shops_only_and_stays_off_for_everyone_else(shops):
    assert get_settings().catalog_for_new_shops is False  # new shops still start without it
    assert scalar("select count(*) as n from tenant_modules where tenant_id = $1 "
                  "and module_key = 'catalog'", DEMO_TENANT_ID) == 0
    assert not any("catalog" in presets.PRESET_BY_KEY[s.kind].modules for s in SHOPS)


def test_each_shop_has_about_a_fortnight_of_activity_with_cancellations(shops):
    for shop in ORDER_SHOPS:
        counts = shops[shop.key][0]
        assert counts["orders"] >= 40, shop.key
        [row] = owner_sql(
            "select min(created_at) as first, max(created_at) as last, "
            "count(*) filter (where status = 'cancelled') as cancelled, "
            "count(distinct created_at::date) as days from orders where tenant_id = $1",
            shop.tenant_id,
        )
        assert row["last"] - row["first"] >= timedelta(days=10), shop.key
        assert row["last"] <= NOW and row["days"] >= 10, shop.key
        assert row["cancelled"] >= 1, shop.key
        # The newest orders are still being looked after; the oldest are finished.
        statuses = {r["status"] for r in owner_sql(
            "select distinct status from orders where tenant_id = $1", shop.tenant_id)}
        assert {"done", "cancelled"} <= statuses and statuses & {"new", "confirmed", "ready"}
        # A shop's order numbers rise with time, as in a real one.
        assert scalar(
            "select count(*) as n from orders o where o.tenant_id = $1 and exists (select 1 "
            "from orders p where p.tenant_id = o.tenant_id and p.number < o.number "
            "and p.created_at > o.created_at)", shop.tenant_id) == 0


def test_the_salon_has_a_fortnight_of_bookings_and_sells_products_at_its_counter(shops):
    salon = BY_KEY["salon"]
    assert shops["salon"][0]["bookings"] >= 80 and shops["salon"][0]["orders"] == 0
    statuses = {r["status"] for r in owner_sql(
        "select distinct status from bookings where tenant_id = $1", salon.tenant_id)}
    assert statuses == {"completed", "no_show", "cancelled", "booked"}
    assert scalar("select count(*) as n from services where tenant_id = $1", salon.tenant_id) >= 3
    assert scalar("select count(*) as n from stock_movements where tenant_id = $1 "
                  "and reason = 'Sold at the counter'", salon.tenant_id) >= 20


def test_each_shop_has_a_few_items_sold_out_and_a_few_nearly_gone(shops):
    """As the engine itself reads the shop a few minutes after it was made: the items the data
    says are sold out are sold out (a count at nothing, a day's limit used up, a switch off),
    a few more are nearly gone, and the rest are not."""
    from alyr.modules.items import availability, clock, service

    for shop in SHOPS:
        async def look(conn):
            shop_clock = await clock.load(conn, NOW + timedelta(minutes=5))
            low_at = await conn.fetchval("select low_stock_at from shop_settings")
            entries = await service.load(conn, shop_clock, "i.status = 'live'")
            gone, few = [], []
            for e in entries:
                state = e.state(shop_clock)
                if state.reason in ("sold_out", "off"):
                    gone.append(e.item["name"])
                    continue
                # Nearly gone: the item, or one of its sizes or colours, is at or under the
                # shop's low-stock number.
                left = [availability.variant_left(e.item, v, e.deltas, state.day)
                        for v in e.active_variants]
                if any(n is not None and 0 < n <= low_at for n in left):
                    few.append(e.item["name"])
            return gone, few

        gone, few = in_shop(shop, look)
        flagged = {p.name for p in shop.products if p.state == "sold_out"}
        assert flagged and flagged <= set(gone), (shop.key, flagged, gone)
        assert len(gone) <= 4, (shop.key, gone)  # a few, not the whole shop
        assert few, (shop.key, few)  # and a few nearly gone


def test_the_wholesaler_has_a_customer_in_each_price_group_and_the_groups_set_prices(shops):
    shop = BY_KEY["wholesale"]
    groups = {r["name"]: r["id"] for r in owner_sql(
        "select id, name from price_groups where tenant_id = $1 and archived_at is null",
        shop.tenant_id)}
    assert set(groups) == {"Retail", "Café & restaurant", "Hotel & catering"}
    for name, group_id in groups.items():
        assert scalar("select count(*) as n from contacts where tenant_id = $1 "
                      "and role = 'customer' and (price_group_id = $2 or ($3 and price_group_id is null))",
                      shop.tenant_id, group_id, name == "Retail") >= 1, name
    assert scalar("select count(*) as n from item_group_prices where tenant_id = $1",
                  shop.tenant_id) >= 30
    # An order is charged its customer's group price and keeps the group's name.
    for name, group_id in groups.items():
        assert scalar("select count(*) as n from orders where tenant_id = $1 and price_group_id = $2",
                      shop.tenant_id, group_id) >= 1, name
    cafe = groups["Café & restaurant"]
    [line] = owner_sql(
        "select oi.price, oi.item_id, i.price as normal from order_items oi join orders o on o.id = "
        "oi.order_id join items i on i.id = oi.item_id where o.tenant_id = $1 and o.price_group_id = $2 "
        "and i.sku = 'WAT-5X24' limit 1", shop.tenant_id, cafe,
    )
    assert line["price"] == 1300 and line["normal"] == 1400  # QAR 13 for cafés, QAR 14 to the rest


def test_the_shops_are_made_of_fictional_things_that_cannot_reach_a_phone(shops):
    for shop in SHOPS:
        assert [r["channel"] for r in owner_sql(
            "select channel from channel_numbers where tenant_id = $1", shop.tenant_id)
        ] == ["simulator"]
        emails = [r["email"] for r in owner_sql(
            "select u.email from memberships m join users u on u.id = m.user_id "
            "where m.tenant_id = $1", shop.tenant_id)]
        assert sorted(emails) == sorted([shop.owner[0], shop.agent[0]])
        # The only job a demo shop holds is the end of one order's thirty minutes, and it only
        # ever speaks to a simulator number.
        kinds = {r["kind"] for r in owner_sql("select distinct kind from jobs where tenant_id = $1",
                                              shop.tenant_id)}
        assert kinds <= {"stock_hold_expiry"}, (shop.key, kinds)
        phones = [r["phone"] for r in owner_sql(
            "select phone from contacts where tenant_id = $1", shop.tenant_id)]
        assert all(re.fullmatch(r"974559\d{5}", p) for p in phones), shop.key
        assert all(r["number_id"] == f"sim-{shop.slug}" for r in owner_sql(
            "select number_id from contacts where tenant_id = $1", shop.tenant_id))


def test_a_customer_of_each_language_reads_their_own_order_page(shops, client):
    for shop in ORDER_SHOPS:
        for lang in ("en", "ar"):
            [who] = owner_sql(
                "select id from contacts where tenant_id = $1 and role = 'customer' and lang = $2 "
                "order by created_at, id limit 1", shop.tenant_id, lang,
            )
            link = links.mint(shop.tenant_id, who["id"])
            page = client.get(f"/api/store/{shop.slug}", headers={"X-Order-Link": link})
            assert page.status_code == 200, (shop.key, page.text)
            body = page.json()
            assert body["customer"]["lang"] == lang
            assert len(body["items"]) >= 14 and body["shop"]["catalog"]
            first = next(i for i in body["items"] if i["cover"]["state"] == "ready")
            assert first["cover"]["srcset"] and ARABIC.search(first["name_ar"])


# ── the shelf adds up, and the live engine can carry on from it ───────────────────────────


def check_shop(shop: Shop) -> None:
    async def look(conn):
        assert await stock.mismatches(conn) == [], shop.key
    in_shop(shop, look)
    assert scalar("select count(*) as n from item_variants where tenant_id = $1 and on_hand < 0",
                  shop.tenant_id) == 0
    for v in owner_sql(
        "select v.on_hand, "
        " coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id "
        "           where oi.variant_id = v.id and o.status <> 'cancelled'), 0)::int as live, "
        " coalesce((select sum(m.delta) from stock_movements m where m.variant_id = v.id "
        "  and m.kind in ('opening', 'received', 'wasted', 'counted', 'adjusted')), 0)::int as added, "
        " coalesce((select -sum(m.delta) from stock_movements m where m.variant_id = v.id "
        "  and m.kind in ('sold', 'cancelled_restocked')), 0)::int as taken, "
        " i.stock_rule from item_variants v join items i on i.id = v.item_id "
        "where v.tenant_id = $1 and i.stock_rule in ('count', 'daily_limit')", shop.tenant_id,
    ):
        assert v["live"] == v["taken"], (shop.key, dict(v))  # what is sold is what was taken
        if v["stock_rule"] == "count":
            assert v["live"] <= v["added"] and v["on_hand"] == v["added"] - v["live"], dict(v)
    assert scalar(
        "select count(*) as n from stock_holds h join orders o on o.id = h.order_id where "
        "h.tenant_id = $1 and ((o.status = 'cancelled' and h.status <> 'released') or "
        "(o.status <> 'cancelled' and h.status = 'released'))", shop.tenant_id) == 0
    assert scalar(
        "select count(*) as n from orders o where o.tenant_id = $1 and o.total <> "
        "(select sum(price * quantity) from order_items where order_id = o.id)", shop.tenant_id) == 0


def test_every_shops_stock_adds_up_to_its_log_and_matches_its_orders(shops):
    for shop in SHOPS:
        check_shop(shop)


def test_the_orders_still_holding_stock_end_the_way_the_engine_ends_them(shops, client):
    """An order made in the last half hour holds its stock; thirty minutes on, the worker's
    sweep (the live code) cancels it, gives the stock back once and tells nobody but a
    simulator. (The fixture saw them before any request could run that sweep.)"""
    assert sum(HELD.values()) >= 1
    for shop in ORDER_SHOPS:
        client.portal.call(
            order_holds.expire_shop, client.app.state.db, client.app.state.outbound, shop.tenant_id
        )
        assert scalar("select count(*) as n from stock_holds where tenant_id = $1 and status = 'held'",
                      shop.tenant_id) == 0, shop.key
        check_shop(shop)


# One plain item to order in each shop: no sizes, choices, hours or pickup date to get wrong.
PLAIN = {
    "restaurant": "Hummus", "bakery": "Arabic bread, bag of 10", "grocery": "Tomatoes, 1 kg",
    "fashion": "Canvas beach bag", "shop": "Phone stand", "wholesale": "Tissue boxes, carton of 48",
}


@pytest.mark.parametrize("key", PLAIN)
def test_a_customer_can_order_and_staff_can_cancel_in_every_demo_shop(shops, client, key):
    """The live engine carries on from the state the history leaves: a customer with their own
    link orders over the real route, staff cancel through the real function, and the item is
    back where it was."""
    shop = BY_KEY[key]
    product = next(p for p in shop.products if p.name == PLAIN[key])
    [item] = owner_sql("select id from items where tenant_id = $1 and name = $2", shop.tenant_id,
                       product.name)
    [who] = owner_sql("select id from contacts where tenant_id = $1 and role = 'customer' "
                      "order by created_at, id limit 1", shop.tenant_id)
    shelf = "select coalesce(sum(on_hand), 0)::int as n from item_variants where item_id = $1"
    before = scalar(shelf, item["id"])
    numbers = scalar("select max(number) as n from orders where tenant_id = $1", shop.tenant_id)
    placed = client.post(f"/api/store/{shop.slug}/orders", json={
        "token": links.mint(shop.tenant_id, who["id"]), "payment": "link",
        "items": [{"product_id": str(item["id"]), "quantity": product.min_order}],
    })
    assert placed.status_code == 200, (key, placed.text)
    assert placed.json()["number"] == numbers + 1  # the next number after the history's
    order_id = UUID(placed.json()["order_id"])
    if product.stock:
        assert scalar(shelf, item["id"]) == before - product.min_order

    async def cancel():
        async with client.app.state.db.tenant(shop.tenant_id) as conn:
            return await orders.cancel_order(conn, order_id, client.app.state.outbound)

    result = client.portal.call(cancel)
    assert result["status"] == "cancelled" and not result["already"]
    assert scalar(shelf, item["id"]) == before  # it went and it came back
    check_shop(shop)


# ── a cancelled order on account: its sale and its reversal (ALY-128) ─────────────────────


def test_a_cancelled_order_on_account_has_its_sale_and_its_reversal_like_the_real_thing(
    shops, client
):
    shop = BY_KEY["wholesale"]
    seeded = owner_sql(
        "select o.id, o.number, o.total, o.contact_id from orders o where o.tenant_id = $1 and "
        "o.status = 'cancelled' and o.payment = 'on_account' order by o.number", shop.tenant_id)
    assert seeded, "the wholesaler should have at least one credit order that was cancelled"
    for o in seeded:
        entries = owner_sql(
            "select kind, amount, note, created_by, order_id from ledger_entries where tenant_id = $1 "
            "and order_id = $2 order by created_at, kind", shop.tenant_id, o["id"])
        assert sorted(e["kind"] for e in entries) == ["reversal", "sale"], o["number"]
        assert {e["amount"] for e in entries} == {o["total"]}
        assert next(e for e in entries if e["kind"] == "reversal")["note"] == f"Order #{o['number']} cancelled"

    # The same order, made and cancelled by the live code, leaves the same two rows.
    [who] = owner_sql("select id from contacts where tenant_id = $1 and credit_limit > 0 and "
                      "role = 'customer' order by created_at, id limit 1", shop.tenant_id)
    [item] = owner_sql("select id from items where tenant_id = $1 and sku = 'TIS-48'", shop.tenant_id)
    placed = client.post(f"/api/store/{shop.slug}/orders", json={
        "token": links.mint(shop.tenant_id, who["id"]), "payment": "account",
        "items": [{"product_id": str(item["id"]), "quantity": 5}],
    })
    assert placed.status_code == 200, placed.text
    order_id = UUID(placed.json()["order_id"])

    async def cancel():
        async with client.app.state.db.tenant(shop.tenant_id) as conn:
            return await orders.cancel_order(conn, order_id, client.app.state.outbound)

    assert client.portal.call(cancel)["credit_reversed"] > 0
    live = owner_sql("select kind, note from ledger_entries where tenant_id = $1 and order_id = $2 "
                     "order by kind", shop.tenant_id, order_id)
    assert [e["kind"] for e in live] == ["reversal", "sale"]
    seeded_shape = owner_sql("select kind, note from ledger_entries where tenant_id = $1 and "
                             "order_id = $2 order by kind", shop.tenant_id, seeded[0]["id"])
    shape = lambda rows: [(r["kind"], re.sub(r"\d+", "N", r["note"])) for r in rows]  # noqa: E731
    assert shape(live) == shape(seeded_shape)

    # No customer is owed money for a cancelled order: the account's balance is what it
    # bought and kept, less what it paid.
    async def balances(conn):
        return {c["id"]: (await ledger.aged(conn, c["id"])).balance
                for c in await conn.fetch("select id from contacts where role = 'customer'")}

    now_owed = in_shop(shop, balances)
    for contact_id, balance in now_owed.items():
        [kept] = owner_sql(
            "select coalesce(sum(case when kind = 'sale' and not exists (select 1 from ledger_entries r "
            "where r.order_id = e.order_id and r.kind = 'reversal') then amount "
            "when kind = 'payment' then -amount else 0 end), 0)::bigint as n "
            "from ledger_entries e where tenant_id = $1 and contact_id = $2", shop.tenant_id, contact_id)
        assert balance == kept["n"]


# ── the command: idempotent, careful, and honest about what it will not do ────────────────


def test_making_a_shop_again_gives_the_same_shop_and_leaves_nothing_behind(shops, tmp_path):
    """Every table holds what it held when the shop was first made (other tests in this file have
    since ordered in some shops), for the one shop made again, and the others are not touched."""
    shop, other = BY_KEY["bakery"], BY_KEY["grocery"]
    other_before = row_counts(other)
    again = run(make([shop], folder=tmp_path / "again"))[shop.key]
    assert again[0] == shops[shop.key][0]  # the same counts: the same fortnight
    assert row_counts(shop) == ROWS[shop.key]
    assert row_counts(other) == other_before
    assert scalar("select count(*) as n from tenants where slug = $1", shop.slug) == 1
    check_shop(shop)


def test_making_a_shop_never_touches_another_shops_rows(shops, tmp_path):
    """The demo reset deletes by the demo shop's own id; the Al Noor shop and another real-looking
    business keep every row."""
    from test_sign_in import other_shop_with_owner

    other = other_shop_with_owner("someone@other.example")
    owner_sql("insert into contacts (tenant_id, phone, name) values ($1, '97450000001', 'A real customer')",
              other)
    tables = ("contacts", "items", "orders", "messages", "activity", "jobs", "memberships")
    mine = {t: scalar(f"select count(*) as n from {t} where tenant_id = any($1)",
                      [DEMO_TENANT_ID, other]) for t in tables}
    run(make([BY_KEY["restaurant"], BY_KEY["wholesale"]], folder=tmp_path / "again"))
    assert {t: scalar(f"select count(*) as n from {t} where tenant_id = any($1)",
                      [DEMO_TENANT_ID, other]) for t in tables} == mine
    owner_sql("delete from contacts where tenant_id = $1", other)
    owner_sql("delete from memberships where tenant_id = $1", other)
    owner_sql("delete from tenant_modules where tenant_id = $1", other)
    owner_sql("delete from tenants where id = $1", other)


def test_it_refuses_an_address_or_an_id_that_belongs_to_a_shop_that_is_not_a_demo(tmp_path):
    real = uuid4()
    owner_sql("insert into tenants (id, name, slug) values ($1, 'Real Bakery', 'demo-real')", real)
    try:
        for clash in (
            dataclasses.replace(bakery.SHOP, slug="demo-real", tenant_id=uuid4()),  # its address
            dataclasses.replace(bakery.SHOP, slug="demo-other", tenant_id=real),  # its id
        ):
            with pytest.raises(Refused) as why:
                run(make([clash], folder=tmp_path))
            assert "not a demo shop" in str(why.value) or "already used by" in str(why.value)
        [row] = owner_sql("select name, slug from tenants where id = $1", real)
        assert (row["name"], row["slug"]) == ("Real Bakery", "demo-real")  # untouched
        assert scalar("select count(*) as n from items where tenant_id = $1", real) == 0
    finally:
        owner_sql("delete from tenants where id = $1", real)
        owner_sql("delete from tenants where slug in ('demo-other')")


def test_it_will_not_run_where_the_database_is_not_clearly_local(monkeypatch, capsys):
    def settings(**more) -> Settings:
        return Settings(_env_file=None, **more)

    seed_catalog_demos.check_target(settings(env="local"))  # the laptop's database
    for bad, text in (
        (dict(env="production"), "ALYR_ENV"),
        (dict(env="local", database_url="postgresql://a:b@db.example.com/alyr"), "db.example.com"),
        (dict(env="local", migration_url="postgresql://a:b@10.1.2.3/alyr"), "10.1.2.3"),
        (dict(env="staging", database_url="postgresql://a:b@prod-db.azure.com/alyr"), "ALYR_ENV"),
    ):
        with pytest.raises(Refused) as why:
            seed_catalog_demos.check_target(settings(**bad))
        assert text in str(why.value) and "--allow-non-local" in str(why.value)
    seed_catalog_demos.check_target(settings(env="production"), allow_non_local=True)  # on purpose

    # And the command itself stops: nothing is written and it says why.
    before = scalar("select count(*) as n from tenants where slug like 'demo-%'")
    monkeypatch.setenv("ALYR_ENV", "production")
    get_settings.cache_clear()
    try:
        assert run(seed_catalog_demos.main(["--only", "bakery"])) == 1
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
    assert "not clearly a local database" in capsys.readouterr().out
    assert scalar("select count(*) as n from tenants where slug like 'demo-%'") == before


def test_the_command_lists_what_it_would_make_and_knows_its_shops(capsys):
    assert run(seed_catalog_demos.main(["--list"])) == 0
    said = capsys.readouterr().out
    assert all(s.name in said and s.owner[0] in said for s in SHOPS)
    assert run(seed_catalog_demos.main(["--only", "nonesuch"])) == 2
    assert "Unknown shop" in capsys.readouterr().out


def test_the_tiles_go_to_this_machines_disk_never_to_the_photo_cloud(shops, tmp_path_factory):
    """The command builds its own local store, whatever the R2 settings are, so a demo run can
    never write to Cloudflare."""
    source = Path(seed_catalog_demos.__file__).read_text(encoding="utf-8")
    assert "LocalStore(" in source and "make_store" not in source and "S3Store" not in source
    assert "r2_" not in source.lower().replace("r2 settings", "")


def test_the_page_a_customer_opens_from_the_printed_link_works(shops, client):
    shop = BY_KEY["restaurant"]
    [customer] = owner_sql("select id from contacts where tenant_id = $1 and role = 'customer' "
                           "order by created_at, id limit 1", shop.tenant_id)
    link = links.order_url(WEB, shop.slug, shop.tenant_id, customer["id"])
    token = link.split("?t=")[1]
    page = client.get(f"/api/store/{shop.slug}", headers={"X-Order-Link": token})
    assert page.status_code == 200
    who = page.json()["customer"]
    assert who["name"] == owner_sql("select name from contacts where id = $1", customer["id"])[0]["name"]
    assert who["has_last_order"] is True  # a regular, with a week of orders behind them
    # The salon takes bookings, not orders: it has no order page.
    assert client.get("/api/store/demo-salon").status_code == 404
