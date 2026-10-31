"""Loading the story into one business: set it up, then write its ten weeks (spec 063).

The order matters and is the order a real business would have lived it:

1. the business's private test line, so every made-up customer sits on a line that goes
   nowhere (a reply typed at a demo cannot reach a phone);
2. what the showcase needs switched on, said in words afterwards;
3. the team, the price groups, the menu, the services and hours, delivery and the coupon;
4. the customers, the menu's items with their photos;
5. the ten weeks themselves (`story.py`), then the documents (`docs.py`), the chats
   (`chats.py`), the bookings (`bookings.py`) and the credit accounts (`credit.py`).

The product's own services write the menu, the groups, the features, the delivery and discount
rules and the documents. The orders, stock movements, messages and the diary are written in bulk
with the moments of the past, by the same statements the demo shops use (`demo/history.py`):
the engine's services stamp "now" on what they write, and ten weeks cannot be lived through
them one order at a time.
"""

import random
from datetime import timedelta
from uuid import UUID

from alyr import capabilities
from alyr.core import consent
from alyr.core.team import Actor
from alyr.demo import build, tiles
from alyr.demo.model import Customer, Shop
from alyr.modules.items import delivery, discounts, features, groups, service
from alyr.modules.items.clock import ShopClock
from alyr.presets_catalog import setup_for
from alyr.seed_into_business import persona
from alyr.seed_into_business.context import Refused, Run
from alyr.seed_into_business.story import ZONES, Story

DAYS = 70
MODULES = ("inbox", "orders", "payments", "bookings", "catalog", "documents", "ledger")
# Features the story shows. The bakery's template already has most; the pricing pack's two
# (delivery fees and discounts) are off until switched on.
FEATURES = (
    "rule_count", "rule_daily_limit", "schedule", "pickup_date", "variants", "options",
    "price_groups", "pack_rules", "tags", "show_sku", "low_stock_alerts", "sold_out_alerts",
    "discounts", "delivery_fees",
)


def address_of(run: Run, key: str) -> str:
    """A team member's sign-in address: a domain no mail can reach, so no code is deliverable."""
    return f"{key}.{run.tenant.slug}@demo.example"


# ── 1. the private line ───────────────────────────────────────────────────────────────────


async def private_line(run: Run) -> None:
    """Every made-up customer talks to the business on a line that goes nowhere. If the business
    already has a private test line (every sign-up gets one) that one is used; otherwise one is
    made, and `--remove` takes it away again."""
    async with run.owner.unscoped() as conn:
        found = await conn.fetchval(
            "select number_id from channel_numbers where tenant_id = $1 and "
            "channel = 'simulator' order by number_id limit 1", run.id,
        )
        if found is None:
            found = f"sim-demo-{str(run.id)[:8]}"
            await conn.execute(
                "insert into channel_numbers (number_id, tenant_id, channel) values ($1, $2, "
                "'simulator') on conflict (number_id) do nothing", found, run.id,
            )
            run.created_numbers.append(found)
    run.sim_number = found


# ── 2 and 3. the shop's setup ─────────────────────────────────────────────────────────────


async def switch_on(run: Run, conn, actor: Actor) -> None:
    before = {r["module_key"]: r["enabled"] for r in await conn.fetch(
        "select module_key, enabled from tenant_modules")}
    for key in MODULES:
        if before.get(key):
            continue
        await conn.execute(
            "insert into tenant_modules (module_key, enabled, enabled_at, enabled_by) "
            "values ($1, true, $2, 'demo data') on conflict (tenant_id, module_key) "
            "do update set enabled = true, enabled_at = excluded.enabled_at",
            key, run.since,
        )
        run.say(f"switched on the {key} module")
    for key in FEATURES:
        cap = capabilities.BY_KEY.get(key)
        if cap is None or not cap.built:
            continue
        done = await features.set_feature(conn, actor, key, enabled=True, by="owner")
        if done:
            run.say(f"switched on the {key} feature")


async def add_team(run: Run, conn, history_start) -> None:
    for member in persona.TEAM:
        email = address_of(run, member.key)
        user_id = await conn.fetchval(
            "insert into users (email, name, name_ar) values ($1, $2, $3) "
            "on conflict (email) do update set name = excluded.name, name_ar = excluded.name_ar "
            "returning id", email, member.name, member.name_ar,
        )
        run.created_users.append(email)
        await conn.execute(
            "insert into memberships (user_id, role, created_at) values ($1, $2, $3)",
            user_id, member.role, history_start - timedelta(days=1),
        )
        run.staff[member.key] = user_id
        run.emails[member.key] = email
        run.names[email] = member.name
        run.names_ar[email] = member.name_ar


async def add_groups(run: Run, conn, made: build.Made, actor: Actor) -> None:
    default = await groups.default_group(conn)
    made.group_ids[""] = default["id"]
    made.group_names[default["id"]] = (default["name"], default["name_ar"])
    for key, name, name_ar in persona.GROUPS:
        existing = await conn.fetchrow(
            "select id from price_groups where name = $1 and archived_at is null", name)
        group = await groups.create_group(conn, name, name_ar, actor) if existing is None else None
        gid = UUID(group["id"]) if group else existing["id"]
        made.group_ids[key] = gid
        made.group_names[gid] = (name, name_ar)


async def add_service_side(run: Run, conn, made: build.Made, actor: Actor) -> None:
    """Delivery with three zones and a coupon: the pricing pack's two screens."""
    zones = []
    for name, name_ar, fee in ZONES:
        z = await delivery.save_zone(conn, actor, {"name": name, "name_ar": name_ar,
                                                    "fee": fee * 100, "free_over": 15_000})
        zones.append((UUID(z["id"]), name, name_ar, fee * 100))
    await delivery.save_settings(conn, actor, {"pickup": True, "delivery": True})
    await discounts.save_rule(conn, actor, {
        "kind": "coupon", "code": "WELCOME10", "name": "Welcome: 10% off your first order",
        "name_ar": "خصم الترحيب: 10% على أول طلب", "value_type": "percent", "percent": 10,
        "scope": "order", "min_order": 6_000, "per_customer_limit": 1, "usage_limit": 200,
    }, run.now)
    made.zones = zones


async def add_replies(conn) -> None:
    for title, body in REPLIES:
        if not await conn.fetchval("select 1 from saved_replies where title = $1", title):
            await conn.execute(
                "insert into saved_replies (title, body) values ($1, $2)", title, body)


REPLIES = (
    ("Opening hours", "We are open Saturday to Thursday 6:30 am to 10 pm, and Friday from 1 pm "
                      "to 10 pm. See you soon!"),
    ("Cake orders", "Celebration cakes need two days' notice. Send the date, the size and the "
                    "message for the top and we will confirm the price."),
    ("Delivery", "We deliver to West Bay, Pearl, Al Sadd, Musheireb and Lusail. Delivery is "
                 "free over QAR 150."),
    ("Catering", "For groups of ten or more we send a quote the same day. Tell us the date, the "
                 "number of guests and the address."),
    ("أوقات العمل", "نعمل من السبت إلى الخميس من 6:30 صباحاً إلى 10 مساءً، والجمعة من 1 ظهراً "
                    "إلى 10 مساءً. بانتظاركم!"),
    ("طلبات الكيك", "كيك المناسبات يحتاج إلى يومين. أرسلوا التاريخ والحجم والكتابة المطلوبة "
                    "وسنؤكد السعر."),
    ("التوصيل", "نوصّل إلى الخليج الغربي واللؤلؤة والسد والمشيرب ولوسيل. التوصيل مجاني للطلبات "
                "فوق 150 ريالاً."),
)


# ── customers ─────────────────────────────────────────────────────────────────────────────


def customers() -> list[tuple[Customer, str]]:
    """Every customer with the habit of the account holders (empty for the rest)."""
    out = [(c, "") for c in persona.CONSUMERS]
    for name, lang, limit, habit, group in persona.ACCOUNTS:
        out.append((Customer(name, lang, "account", group, limit * 100), habit))
    return out


async def add_people(run: Run, conn, made: build.Made, rng: random.Random, history_start) -> dict:
    """The contacts, each first seen on the day they would have first written, on the business's
    private line, with a WhatsApp identity in the fictional range."""
    staff_cycle = ["faisal"] * 5 + ["noura"] * 2 + ["rashid"] * 2 + ["dina"] * 2
    profiles: dict = {}
    consumer = 0
    for index, (customer, habit) in enumerate(customers()):
        if customer.kind == "account":
            seen = history_start + timedelta(days=rng.randint(0, 9), hours=rng.randint(9, 15))
            staff = rng.choice(["dina", "rashid"])
            phone = persona.PHONE_BASE + 101 + len(profiles)
        else:
            consumer += 1
            phone = persona.PHONE_BASE + consumer
            if customer.kind == "new":
                seen = history_start + timedelta(days=rng.randint(55, 66), hours=rng.randint(8, 20))
            elif customer.kind == "occasional":
                seen = history_start + timedelta(days=rng.randint(4, 48), hours=rng.randint(8, 20))
            else:
                seen = history_start + timedelta(days=rng.randint(0, 18), hours=rng.randint(8, 20))
            staff = rng.choice(staff_cycle)
        group_id = made.group_ids.get(customer.group) if customer.group else None
        contact_id = await conn.fetchval(
            "insert into contacts (phone, wa_user_id, name, lang, credit_limit, number_id, "
            "created_at, assigned_to, price_group_id) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id",
            str(phone), f"QA.{99900000000000000 + phone}", customer.name, customer.lang,
            customer.credit, run.sim_number, seen, run.staff[staff], group_id,
        )
        await consent.record(conn, contact_id, "service", "granted", "customer_initiated")
        person = build.Person(contact_id, customer, index, seen, group_id, run.emails[staff])
        made.people.append(person)
        run.people[customer.name] = person
        if habit:
            profiles[contact_id] = habit
    return profiles


# ── the whole setup ───────────────────────────────────────────────────────────────────────


def make_shop(run: Run, people: list[Customer]) -> Shop:
    owner = persona.TEAM[0]
    agent = next(m for m in persona.TEAM if m.key == persona.COUNTER_KEY)
    return Shop(
        key="bakery", slug=run.tenant.slug, tenant_id=run.id, name=run.tenant.name,
        name_ar=run.tenant.name_ar, kind="bakery", area=persona.AREA, hue=persona.HUE,
        whatsapp="", owner=(address_of(run, owner.key), owner.name, owner.name_ar),
        agent=(address_of(run, agent.key), agent.name, agent.name_ar),
        products=persona.PRODUCTS, customers=tuple(people), groups=persona.GROUPS,
        orders_a_day=3.4, lines=(1, 3), open_hours=(6, 22), day_starts="00:00",
    )


async def upload_tiles(run: Run, shop: Shop) -> dict:
    """Draw and store a tile for every item that has a photo. In the worker's hands ("queue")
    the file writes stay queued for the worker, which holds the photo store's keys; on a
    developer machine ("now") they are stored on local disk at once."""
    done: dict[str, UUID] = {}
    for p in shop.products:
        if not p.photo:
            continue
        data = tiles.tile(build.tile_key(shop, p), p.motif, shop.hue)
        uploaded = await run.media.upload(run.id, data, by="Demo data")
        photo = uploaded.photo
        if run.photos == "now":
            await run.media.sync(run.id, {"asset_id": photo["id"]})
        done[build.tile_key(shop, p)] = UUID(photo["id"])
    return done


async def back_date(run: Run, to) -> None:
    """The setup is stamped with the moment of the load. Move what the load itself made to just
    before the story begins, keeping its order. Only rows made since the load began move; the
    business's own rows keep their dates."""
    tables = ("items", "item_variants", "stock_movements", "item_price_history", "activity",
              "price_groups", "item_group_price_history", "media_links", "media_assets",
              "services", "booking_resources", "delivery_zones", "discount_rules",
              "saved_replies", "shop_features", "memberships")
    async with run.owner.tenant(run.id) as conn:
        anchor = await conn.fetchval(
            "select min(t) from (" + " union all ".join(
                f'select min(created_at) as t from "{t}" where tenant_id = $1 and created_at >= $2'
                for t in ("items", "price_groups", "activity")) + ") x", run.id, run.since,
        )
        if anchor is None:
            return
        for table in tables:
            await conn.execute(
                f'update "{table}" set created_at = created_at + ($1::timestamptz - $2::timestamptz) '
                "where tenant_id = $3 and created_at >= $4", to, anchor, run.id, run.since,
            )
        await conn.execute(
            "update items set updated_at = created_at where tenant_id = $1 and created_at < $2",
            run.id, run.since,
        )


async def setup(run: Run) -> tuple[build.Made, dict, random.Random]:
    """Everything before the ten weeks."""
    rng = random.Random(f"{run.seed}:{run.tenant.slug}")
    history_start = build_start(run)
    shop = make_shop(run, [c for c, _ in customers()])
    run.shop = shop
    run.assets = await upload_tiles(run, shop)
    owner_member = persona.TEAM[0]
    async with run.app.tenant(run.id) as conn:
        setup_data = setup_for("bakery")
        clock = ShopClock(run.now, build.TZ, await conn.fetchval(
            "select day_starts from shop_settings") if await conn.fetchval(
            "select 1 from shop_settings") else None)
        made = build.Made(conn, shop, run.now, setup_data, clock)
        made.zones = []
        await add_team(run, conn, history_start)
        made.users = {run.emails[k]: v for k, v in run.staff.items()}
        made.owner = Actor(run.staff[owner_member.key], owner_member.name)
        made.agent = Actor(run.staff[persona.COUNTER_KEY], "Faisal")
        await switch_on(run, conn, made.owner)
        if not await conn.fetchval("select 1 from shop_settings"):
            await conn.execute("insert into shop_settings default values")
        await service.save_categories(conn, [
            {"name": n, "name_ar": a} for n, a in persona.CATEGORIES])
        await add_groups(run, conn, made, made.owner)
        await add_service_side(run, conn, made, made.owner)
        await add_replies(conn)
        profiles = await add_people(run, conn, made, rng, history_start)
        await build.add_items(made, run.media, run.assets)
    await back_date(run, history_start - timedelta(days=1))
    return made, profiles, rng


def build_start(run: Run):
    return history_start_of(run.now)


def history_start_of(now):
    from alyr.demo import history
    return history.local(now.astimezone(build.TZ).date() - timedelta(days=DAYS - 1), 0)


def story_for(run: Run, made: build.Made, rng, profiles) -> Story:
    names = {run.emails[m.key]: m.name for m in persona.TEAM}
    story = Story(made, rng, run.web_url, days=DAYS, profiles=profiles, names=names,
                  zones=tuple(made.zones))
    run.story = story
    return story


def require(run: Run) -> None:
    if run.tenant.timezone != "Asia/Qatar":
        raise Refused(f"the business keeps Doha time and this one is on "
                      f"{run.tenant.timezone}; nothing was loaded")
