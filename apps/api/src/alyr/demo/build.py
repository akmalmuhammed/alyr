"""Making one demo shop (ALY-110): empty it, give it its settings, staff, customers, groups
and items, through the same services the workspace uses.

Everything here runs in a transaction scoped to the one demo shop (`Database.tenant`), on the
owner role, because a reset has to remove rows the app role may only add (the stock log, the
record of activity). Every delete names the shop's own id as well, so a mistake cannot reach
another shop even where the database lets the owner see every row.

The history that makes the shop look lived in is `history.py`; this file makes the shop and
its catalogue.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr import shop_templates
from alyr.core import consent
from alyr.core.media import MediaService
from alyr.core.team import Actor
from alyr.demo import tiles
from alyr.demo.model import Customer, Product, Shop
from alyr.modules.items import groups, photos, service, template
from alyr.modules.items.clock import ShopClock
from alyr.presets import PRESET_BY_KEY
from alyr.presets_catalog import CatalogSetup, setup_for

TZ = ZoneInfo("Asia/Qatar")
SIMULATOR = "simulator"
# Tables that belong to the shop's place on the platform and survive a reset: the numbers
# the shop is reached on. Everything else with a `tenant_id` is the shop's own data.
KEEP = {"channel_numbers"}
_NAME = re.compile(r"[a-z_0-9]+")


class Refused(Exception):
    """The demo will not touch this database or this shop. The message says why."""


# ── the shop's place on the platform ──────────────────────────────────────────────────────


async def ensure_tenant(conn: asyncpg.Connection, shop: Shop, now: datetime) -> None:
    """The business row, its client and its private test line (global tables, owner role).
    Refuses when the id or the address already belongs to a shop that is not this demo."""
    taken = await conn.fetch(
        "select id, slug, name from tenants where id = $1 or slug = $2", shop.tenant_id, shop.slug
    )
    for row in taken:
        if row["id"] != shop.tenant_id:
            raise Refused(
                f"the address “{shop.slug}” already belongs to the shop “{row['name']}”, "
                "which is not a demo shop. Nothing was changed."
            )
        if row["slug"] not in (None, shop.slug):
            raise Refused(
                f"the id of the demo shop {shop.slug} is already used by “{row['name']}” "
                f"({row['slug']}). Nothing was changed."
            )
    started = now - timedelta(days=30)
    await conn.execute(
        "insert into tenants (id, name, name_ar, slug, business_type, area, onboarding_way, "
        "onboarding_step, onboarded_at, created_at) "
        "values ($1, $2, $3, $4, $5, $6, 'assisted', 'golive', $7, $7) "
        "on conflict (id) do update set name = $2, name_ar = $3, slug = $4, business_type = $5, "
        "area = $6, onboarded_at = $7",
        shop.tenant_id, shop.name, shop.name_ar, shop.slug, shop.kind, shop.area, started,
    )
    await conn.execute(
        "insert into channel_numbers (number_id, tenant_id, channel) values ($1, $2, $3) "
        "on conflict (number_id) do nothing",
        simulator_number(shop), shop.tenant_id, SIMULATOR,
    )
    if not await conn.fetchval("select client_id from tenants where id = $1", shop.tenant_id):
        client_id = await conn.fetchval(
            "insert into clients (name, contact_name, contact_email, access_from, access_note) "
            "values ($1, $2, $3, now(), 'Demo shop') returning id", shop.name, shop.owner[1], shop.owner[0],
        )
        await conn.execute(
            "update tenants set client_id = $2 where id = $1", shop.tenant_id, client_id
        )


def simulator_number(shop: Shop) -> str:
    """The private test line of a demo shop. Nothing sent to it leaves this machine."""
    return f"sim-{shop.slug}"


async def wipe(conn: asyncpg.Connection, tenant_id: UUID) -> int:
    """Delete every row the shop owns, in an order the foreign keys allow. `conn` is scoped
    to the shop. Returns how many tables it emptied of something."""
    tables = await _tables_to_empty(conn)
    emptied = 0
    for table in tables:
        done = await conn.execute(f'delete from "{table}" where tenant_id = $1', tenant_id)
        emptied += done != "DELETE 0"
    return emptied


async def _tables_to_empty(conn: asyncpg.Connection) -> list[str]:
    """The tables with a `tenant_id`, children before the tables they point at."""
    names = [
        r["table_name"] for r in await conn.fetch(
            "select c.table_name from information_schema.columns c "
            "join information_schema.tables t on t.table_schema = c.table_schema "
            "and t.table_name = c.table_name and t.table_type = 'BASE TABLE' "
            "where c.table_schema = 'public' and c.column_name = 'tenant_id'"
        )
    ]
    names = [n for n in names if n not in KEEP and _NAME.fullmatch(n)]
    edges = await conn.fetch(
        "select conrelid::regclass::text as child, confrelid::regclass::text as parent "
        "from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace"
    )
    parents: dict[str, set[str]] = {n: set() for n in names}
    for e in edges:
        if e["child"] in parents and e["parent"] in parents and e["child"] != e["parent"]:
            parents[e["child"]].add(e["parent"])
    ordered: list[str] = []
    left = dict(parents)
    while left:
        # A table can go once nothing left still points at it: take the ones no remaining
        # table has as a parent.
        pointed_at = {p for kids in left.values() for p in kids}
        ready = sorted(n for n in left if n not in pointed_at)
        if not ready:
            raise Refused(f"the tables refer to each other in a circle: {sorted(left)}")
        for n in ready:
            ordered.append(n)
            del left[n]
    return ordered


# ── the shop's own setup ──────────────────────────────────────────────────────────────────


@dataclass
class Made:
    """What the build leaves for the history to use."""

    conn: asyncpg.Connection
    shop: Shop
    now: datetime
    setup: CatalogSetup
    clock: ShopClock
    users: dict = field(default_factory=dict)  # email -> user id
    owner: Actor | None = None
    agent: Actor | None = None
    group_ids: dict = field(default_factory=dict)  # group key -> id; "" is the default group
    group_names: dict = field(default_factory=dict)  # id -> (name, Arabic name)
    people: list = field(default_factory=list)  # Person
    items: dict = field(default_factory=dict)  # product key -> Item
    owner_contact: UUID | None = None
    staff_contact: UUID | None = None
    services: list = field(default_factory=list)  # appointment businesses: what is booked
    hours: list = field(default_factory=list)  # (weekday, opens, closes), Sunday is 0


@dataclass
class Person:
    id: UUID
    customer: Customer
    index: int
    first_seen: datetime
    group_id: UUID | None
    staff: str  # email of whoever looks after their chat


@dataclass
class Item:
    product: Product
    id: UUID
    variants: list  # [{id, name, name_ar, price_delta, sku, daily_limit, on_hand, is_default}]
    groups: list  # option groups as the engine reads them
    rule: str
    available: bool = True


def staff_phone(shop: Shop, n: int) -> str:
    return f"974559{_digit(shop)}900{n}"


def customer_phone(shop: Shop, index: int) -> str:
    return f"974559{_digit(shop)}{index + 1:04d}"


def _digit(shop: Shop) -> int:
    return _SHOP_DIGIT[shop.key]


_SHOP_DIGIT = {
    "restaurant": 1, "bakery": 2, "grocery": 3, "fashion": 4, "shop": 5, "wholesale": 6,
    "salon": 7,
}


async def start(conn: asyncpg.Connection, shop: Shop, now: datetime, history_start: datetime) -> Made:
    """Modules, settings, categories, groups, the team and their phones."""
    preset = PRESET_BY_KEY[shop.kind]
    setup = setup_for(shop.kind)
    tpl = shop_templates.builtin_for(shop.kind)
    await conn.execute(
        "insert into tenant_modules (module_key, enabled_at, enabled_by) "
        "select unnest($1::text[]), $2::timestamptz, 'demo setup'",
        list(preset.modules_for(True)), history_start - timedelta(days=2),
    )
    clock = ShopClock(now, TZ)
    # The type's starting values, its categories, and no sample items: these are real items.
    await template.apply(conn, tpl, clock, samples_too=False)
    await conn.execute(
        "update shop_settings set whatsapp_number = $1, day_starts = $2::text::time, "
        "weekly_report = true, whatsapp_mode = 'chat'",
        shop.whatsapp, shop.day_starts,
    )
    categories = [{"name": n, "name_ar": a} for n, a in (*setup.categories, *shop.extra_categories)]
    await service.save_categories(conn, categories)
    clock = ShopClock(now, TZ, await conn.fetchval("select day_starts from shop_settings"))

    made = Made(conn, shop, now, setup, clock)
    for email, name, name_ar in (shop.owner, shop.agent):
        user_id = await conn.fetchval(
            "insert into users (email, name, name_ar) values ($1, $2, $3) "
            "on conflict (email) do update set name = excluded.name, "
            "name_ar = excluded.name_ar returning id",
            email, name, name_ar,
        )
        made.users[email] = user_id
    for (email, _name, _), role in ((shop.owner, "owner"), (shop.agent, "agent")):
        await conn.execute(
            "insert into memberships (user_id, role, created_at) values ($1, $2, $3)",
            made.users[email], role, history_start - timedelta(days=2),
        )
    made.owner = Actor(made.users[shop.owner[0]], shop.owner[1])
    made.agent = Actor(made.users[shop.agent[0]], shop.agent[1])

    # An appointment business starts with its type's services and opening hours (D-031).
    for sort, s in enumerate(preset.services):
        service_id = await conn.fetchval(
            "insert into services (name, name_ar, duration_minutes, price, sort) "
            "values ($1, $2, $3, $4, $5) returning id",
            s.name, s.name_ar, s.minutes, s.price, sort,
        )
        made.services.append({"id": service_id, "name": s.name, "minutes": s.minutes})
    for weekday, opens, closes in preset.hours:
        await conn.execute(
            "insert into business_hours (weekday, opens, closes) "
            "values ($1, $2::text::time, $3::text::time)", weekday, opens, closes,
        )
        made.hours.append((weekday, opens, closes))

    # Price groups: the default one is the normal price; the shop adds its own.
    default = await groups.default_group(conn)
    made.group_ids[""] = default["id"]
    made.group_names[default["id"]] = (default["name"], default["name_ar"])
    for key, name, name_ar in shop.groups:
        group = await groups.create_group(conn, name, name_ar)
        made.group_ids[key] = UUID(group["id"])
        made.group_names[UUID(group["id"])] = (name, name_ar)

    # The owner's own WhatsApp (gets the Sunday report, may put drafts on sale) and the
    # counter's, both registered as staff numbers so the WhatsApp commands know them.
    made.owner_contact = await conn.fetchval(
        "insert into contacts (phone, name, role, number_id, weekly_report, lang, "
        "catalog_manager, created_at) values ($1, $2, 'staff', $3, true, 'ar', true, $4) "
        "returning id",
        staff_phone(shop, 1), f"{shop.owner[1]} (owner)", simulator_number(shop),
        history_start - timedelta(days=2),
    )
    await consent.record(conn, made.owner_contact, "service", "granted", "weekly_report_setting")
    made.staff_contact = await conn.fetchval(
        "insert into contacts (phone, name, role, number_id, created_at) "
        "values ($1, $2, 'staff', $3, $4) returning id",
        staff_phone(shop, 2), f"{shop.agent[1]} (counter)", simulator_number(shop),
        history_start - timedelta(days=2),
    )
    return made


async def add_customers(made: Made, rng, history_start: datetime) -> None:
    """The shop's customers, in the groups their kind of business belongs to."""
    conn, shop = made.conn, made.shop
    emails = [shop.owner[0], shop.agent[0]]
    for index, customer in enumerate(shop.customers):
        if customer.kind == "new":
            seen = history_start + timedelta(days=rng.randint(7, 12), hours=rng.randint(10, 20))
        elif customer.kind == "occasional":
            seen = history_start - timedelta(days=rng.randint(3, 40))
        else:
            seen = history_start - timedelta(days=rng.randint(20, 90))
        group_id = made.group_ids.get(customer.group) if customer.group else None
        staff = rng.choice(emails)
        contact_id = await conn.fetchval(
            "insert into contacts (phone, name, lang, credit_limit, number_id, created_at, "
            "assigned_to, price_group_id) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
            customer_phone(shop, index), customer.name, customer.lang, customer.credit,
            simulator_number(shop), seen, made.users[staff], group_id,
        )
        # They wrote to the shop first, which is what allows the shop to answer.
        await consent.record(conn, contact_id, "service", "granted", "customer_initiated")
        made.people.append(Person(contact_id, customer, index, seen, group_id, staff))


# ── the catalogue ─────────────────────────────────────────────────────────────────────────


def tile_key(shop: Shop, product: Product, size: str = "") -> str:
    return f"{shop.slug}:{product.key}:{size}"


async def upload_tiles(media: MediaService, shop: Shop) -> dict:
    """Draw and store a tile for every item that has a photo, and for each colour with its
    own. The real photo pipeline checks and stores each one. Returns {tile key: photo id}."""
    done: dict[str, UUID] = {}
    for p in shop.products:
        wanted = [("", p.motif)] if p.photo else []
        wanted += [(s.name, p.motif) for s in p.sizes if s.own_photo]
        for size, motif in wanted:
            key = tile_key(shop, p, size)
            data = tiles.tile(key, motif, shop.hue)
            uploaded = await media.upload(shop.tenant_id, data, by="Demo setup")
            photo = uploaded.photo
            await media.sync(shop.tenant_id, {"asset_id": photo["id"]})
            done[key] = UUID(photo["id"])
    return done


def rule_of(setup: CatalogSetup, p: Product) -> str:
    """How an item runs out: what it says, else what the shop's type starts with, except that
    an item with a number on the shelf is counted (the salon sells products it counts)."""
    if p.rule:
        return p.rule
    counted = bool(p.stock or any(s.stock for s in p.sizes))
    return "count" if counted and setup.rule in ("switch", "always") else setup.rule


def _item_data(made: Made, p: Product, sort: int) -> dict:
    setup = made.setup
    rule = rule_of(setup, p)
    status = {"draft": "draft", "hidden": "hidden"}.get(p.state, "live")
    data: dict = {
        "name": p.name, "name_ar": p.name_ar, "description": p.desc, "description_ar": p.desc_ar,
        "category": p.category, "price": p.price, "unit": p.unit, "stock_rule": rule,
        "status": status, "tags": list(p.tags), "min_order": p.min_order, "pack_size": p.pack,
        "sort": sort, "sku": p.sku, "low_stock_at": p.low_at,
    }
    if p.sale:
        data["sale_price"] = p.sale[0]
        data["sale_starts_at"] = made.now - timedelta(days=2)
        data["sale_ends_at"] = made.now + timedelta(days=p.sale[1])
    count, daily = rule == "count", rule == "daily_limit"
    if p.sizes:
        data["variants"] = []
        for s in p.sizes:
            v = {"name": s.name, "name_ar": s.name_ar, "price_delta": s.delta, "sku": s.sku}
            if count:
                v["opening_stock"] = s.stock
            if daily:
                v["daily_limit"] = s.stock
            data["variants"].append(v)
    else:
        if count and p.stock:
            data["opening_stock"] = p.stock
        if daily:
            data["daily_limit"] = p.daily if p.daily is not None else 10
    if p.choices:
        data["option_groups"] = [
            {"name": c.name, "name_ar": c.name_ar, "required": c.required,
             "max_choices": c.max_choices,
             "options": [{"name": n, "name_ar": a, "price_delta": d} for n, a, d in c.options]}
            for c in p.choices
        ]
    if p.lead:
        data["schedule"] = [
            {"weekdays": list(range(7)), "lead_days": p.lead[0], "cutoff": p.lead[1]}
        ]
    elif p.window:
        data["schedule"] = [
            {"weekdays": list(range(7)), "opens": p.window[0], "closes": p.window[1]}
        ]
    if p.groups:
        data["group_prices"] = [
            {"group_id": made.group_ids[key], "variant_id": None, "price": price}
            for key, price in p.groups
        ]
    return data


async def add_items(made: Made, media: MediaService, assets: dict) -> None:
    """Create every item through the real service, put its tile on it, and read back what
    the history needs (the sizes' ids, the option ids)."""
    conn, shop = made.conn, made.shop
    for sort, p in enumerate(shop.products):
        data = _item_data(made, p, sort)
        # An item that needs a price group's price needs the group's row first (above).
        made_item = await service.create_item(conn, data, made.owner, made.clock)
        item_id = UUID(made_item["item"]["id"])
        entry = await service.get(conn, made.clock, item_id)
        variants = [dict(v) for v in entry.variants]
        by_name = {v["name"]: v for v in variants}
        if tile_key(shop, p) in assets:
            await photos.attach(conn, media, item_id, assets[tile_key(shop, p)], made.owner)
        for s in p.sizes:
            if s.own_photo and tile_key(shop, p, s.name) in assets:
                await photos.attach(
                    conn, media, item_id, assets[tile_key(shop, p, s.name)], made.owner,
                    variant_id=by_name[s.name]["id"],
                )
        made.items[p.key] = Item(
            p, item_id, variants, [dict(g) for g in entry.groups], entry.item["stock_rule"],
        )


async def back_date(conn: asyncpg.Connection, tenant_id: UUID, to: datetime) -> None:
    """Everything the build just wrote is stamped with this moment. Move it to `to`, keeping
    its order, so the shop's catalogue was made before its history begins. The stock log and
    the record of activity are only ever added to, so this runs on the owner role, and every
    statement names the shop. Call it between the build and the history."""
    anchor = await conn.fetchval(
        "select min(t) from (select min(created_at) as t from items where tenant_id = $1 "
        "union all select min(created_at) from price_groups where tenant_id = $1 "
        "union all select min(created_at) from activity where tenant_id = $1) x", tenant_id,
    )
    if anchor is None:
        return
    for table in ("items", "item_variants", "stock_movements", "item_price_history", "activity",
                  "price_groups", "item_group_price_history", "media_links"):
        await conn.execute(
            f'update "{table}" set created_at = created_at + ($1::timestamptz - $2::timestamptz) '
            "where tenant_id = $3", to, anchor, tenant_id,
        )
    await conn.execute(
        "update items set updated_at = created_at where tenant_id = $1", tenant_id
    )
