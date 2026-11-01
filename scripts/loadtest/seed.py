"""Seed a load-test database with N fictional shops (docs/runbooks/capacity.md).

Runs inside the API image on the stack's network (scripts/loadtest/stack.sh). Shops, their owners
and their items are made through the product's own code (sign-up, the item service), so they
have everything a real shop has: modules, features, price group, item codes, sessions. Their
history (customers, messages, orders, finished jobs) is written in bulk with SQL, as the
database owner, in the amounts a shop has after `--days` days of a busy shop:

    150 chats a day, 4 messages in each, 20 orders a day
(Documents are issued through the API afterwards: `load.py docs-seed`.)

Only fictional data: .example addresses and made-up numbers. Writes /state/world.json, which
load.py reads (who the shops are, a session for each owner, customers and items to use).
"""

import argparse
import asyncio
import json
import os
import random
import time
from uuid import UUID

import asyncpg

from alyr.config import get_settings
from alyr.core import onboarding, terms
from alyr.core.team import Actor
from alyr.db import Database
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import service as items

# (type, share of shops, categories). Order businesses first: they are most of the first fifty.
TYPES = [
    ("bakery", 22, ["Bread", "Cakes", "Pastries", "Drinks"]),
    ("restaurant", 16, ["Starters", "Mains", "Grill", "Desserts", "Drinks"]),
    ("grocery", 16, ["Fruit", "Dairy", "Pantry", "Frozen", "Cleaning"]),
    ("shop", 10, ["Phones", "Cases", "Chargers", "Audio"]),
    ("fashion", 6, ["Abayas", "Scarves", "Kids", "Accessories"]),
    ("salon", 30, ["Hair", "Nails", "Skin"]),
]
AREAS = ["Al Sadd", "West Bay", "Lusail", "Al Wakrah", "Msheireb", "The Pearl"]


def pick_types(count: int) -> list[tuple[str, list[str]]]:
    """Types in the proportions above, stable for a given count."""
    total = sum(weight for _, weight, _ in TYPES)
    out: list[tuple[str, list[str]]] = []
    for key, weight, categories in TYPES:
        out += [(key, categories)] * round(count * weight / total)
    while len(out) < count:
        out.append((TYPES[0][0], TYPES[0][2]))
    return out[:count]


def item_data(n: int, categories: list[str], rng: random.Random) -> dict:
    category = categories[n % len(categories)]
    data = {
        "name": f"{category} item {n}", "name_ar": f"صنف {n}", "category": category,
        "description": f"A fictional {category.lower()} product number {n}, made fresh.",
        "description_ar": f"منتج خيالي رقم {n}.",
        "price": rng.choice([500, 900, 1200, 1800, 2500, 3500, 4500, 8900]),
        "status": "live", "stock_rule": "switch", "available": True,
    }
    if n % 10 == 0:  # a tenth are counted in stock
        data |= {"stock_rule": "count", "opening_stock": 500}
    if n % 5 == 0:  # a fifth have sizes
        data["variants"] = [
            {"name": "Small", "name_ar": "صغير", "price_delta": 0},
            {"name": "Large", "name_ar": "كبير", "price_delta": 500},
        ]
    return data


async def make_shop(db: Database, owner_dsn: str, index: int, type_key: str,
                    categories: list[str], item_count: int, accepted: list[UUID],
                    rng: random.Random) -> dict:
    name = f"Load Shop {index:03d}"
    signup = await onboarding.issue_signup_token(db, f"owner{index:03d}@loadtest.example")
    tenant_id, session = await onboarding.create_business(
        db, signup, f"Owner {index:03d}", name, f"متجر {index:03d}", type_key,
        rng.choice(AREAS), accepted_terms=accepted, lang="en",
    )
    number_id = f"sim-lt-{index:03d}"
    owner = await asyncpg.connect(owner_dsn)
    try:
        slug = await owner.fetchval("select slug from tenants where id = $1", tenant_id)
        await owner.execute(
            "insert into channel_numbers (number_id, tenant_id, channel) "
            "values ($1, $2, 'simulator') on conflict do nothing", number_id, tenant_id,
        )
    finally:
        await owner.close()
    async with db.tenant(tenant_id) as conn:
        clock = await shop_clock.load(conn)
        for n in range(1, item_count + 1):
            await items.create_item(conn, item_data(n, categories, rng),
                                    Actor(None, "Seed"), clock)
    return {"index": index, "tenant_id": str(tenant_id), "slug": slug, "type": type_key,
            "number_id": number_id, "token": session, "categories": categories}


async def history(owner_dsn: str, shop: dict, days: int, contacts: int) -> None:
    """Customers, their messages, orders and finished jobs, as a shop has them after `days`."""
    tenant = UUID(shop["tenant_id"])
    chats_per_day, msgs_per_chat, orders_per_day = 150, 4, 20
    messages = days * chats_per_day * msgs_per_chat
    orders = days * orders_per_day
    conn = await asyncpg.connect(owner_dsn)
    try:
        async with conn.transaction():
            base = 97455000000 + shop["index"] * 100000
            await conn.execute(
                "insert into contacts (tenant_id, phone, name, lang, consent_service, number_id, "
                "                      last_inbound_at, created_at) "
                "select $1, ($2::bigint + g)::text, 'Customer ' || g, "
                "       case when g % 4 = 0 then 'ar' else 'en' end, 'granted', $3, "
                "       now() - random() * interval '3 days', now() - random() * make_interval(days => $4) "
                "from generate_series(1, $5) g",
                tenant, base, shop["number_id"], days, contacts,
            )
            # The owner's own WhatsApp number, which gets the Sunday report.
            await conn.execute(
                "insert into contacts (tenant_id, phone, name, role, lang, consent_service, "
                "                      number_id, weekly_report) "
                "values ($1, $2, 'Owner', 'staff', 'en', 'granted', $3, true)",
                tenant, str(base - 1), shop["number_id"],
            )
            await conn.execute(
                "insert into consents (tenant_id, contact_id, purpose, status, source) "
                "select $1, id, 'service', 'granted', 'whatsapp' from contacts "
                "where tenant_id = $1 and role = 'customer'", tenant,
            )
            await conn.execute(
                "insert into messages (tenant_id, direction, kind, body, contact_id, status, created_at) "
                "select $1, case when g % 2 = 0 then 'in' else 'out' end, 'text', "
                "       'fictional message ' || g || ' about an order or a question', c.id, "
                "       case when g % 2 = 0 then 'received' else 'delivered' end, "
                "       now() - random() * make_interval(days => $2) "
                "from (select id, row_number() over () rn from contacts where tenant_id = $1) c "
                "join generate_series(1, $3) g on g % $4 = c.rn % $4",
                tenant, days, messages, contacts,
            )
            # Most conversations have been read by the shop (nine in ten), as in a shop that works
            # its inbox; the rest wait for a first look. A customer's last message is the latest
            # one they sent.
            await conn.execute(
                "update contacts c set last_inbound_at = m.last_in, "
                "  inbox_read_at = case when abs(hashtext(c.id::text)) % 10 <> 0 "
                "                       then m.last_in + interval '1 second' end "
                "from (select contact_id, max(created_at) filter (where direction = 'in') as last_in "
                "      from messages where tenant_id = $1 group by contact_id) m "
                "where c.id = m.contact_id and c.tenant_id = $1 and c.role = 'customer' "
                "  and m.last_in is not null", tenant,
            )
            await conn.execute(
                "insert into orders (tenant_id, contact_id, number, status, payment, total, created_at) "
                "select $1, c.id, g, 'done', 'paid', 4000 + (g % 50) * 100, "
                "       now() - random() * make_interval(days => $2) "
                "from generate_series(1, $3) g "
                "join (select id, row_number() over () rn from contacts where tenant_id = $1) c "
                "  on c.rn = 1 + (g % $4)",
                tenant, days, orders, contacts,
            )
            await conn.execute(
                "with it as (select array_agg(id) ids, array_agg(name) names, array_agg(price) prices, "
                "                   count(*) n from items where tenant_id = $1 and status = 'live') "
                "insert into order_items (tenant_id, order_id, item_id, name, price, quantity) "
                "select $1, o.id, it.ids[1 + ((o.number * k) % it.n)], "
                "       it.names[1 + ((o.number * k) % it.n)], it.prices[1 + ((o.number * k) % it.n)], "
                "       1 + (o.number % 3) "
                "from orders o cross join generate_series(1, 2) k cross join it "
                "where o.tenant_id = $1", tenant,
            )
            # Finished work, as the queue holds it: a job to handle each message that came in
            # and one to send each reply, and the IDs of the messages already handled.
            await conn.execute(
                "insert into jobs (tenant_id, kind, payload, status, run_at, finished_at, created_at, attempts) "
                "select $1, case when g % 2 = 0 then 'inbound' else 'send' end, "
                "       jsonb_build_object('from_number', g::text, 'filler', repeat('x', 400)), "
                "       'done', t, t + interval '1 second', t, 1 "
                "from (select g, now() - random() * make_interval(days => $2) t "
                "      from generate_series(1, $3) g) s(g, t)", tenant, days, messages // 2,
            )
            await conn.execute(
                "insert into processed_messages (tenant_id, message_id, created_at) "
                "select $1, 'wamid.' || gen_random_uuid(), now() - random() * make_interval(days => $2) "
                "from generate_series(1, $3)", tenant, days, messages // 4,
            )
    finally:
        await conn.close()


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shops", type=int, default=50)
    ap.add_argument("--items", type=int, default=120, help="live items per shop")
    ap.add_argument("--days", type=int, default=30, help="days of history")
    ap.add_argument("--contacts", type=int, default=400, help="customers per shop")
    ap.add_argument("--docs-shops", type=int, default=15, help="shops with Documents switched on")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    settings = get_settings()
    rng = random.Random(args.seed)
    db = Database(settings.database_url)
    await db.connect()
    started = time.time()
    try:
        async with db.unscoped() as conn:
            accepted = [UUID(t["id"]) for t in await terms.current(conn)]
        shops = []
        for i, (type_key, categories) in enumerate(pick_types(args.shops), start=1):
            shop = await make_shop(db, settings.migration_url, i, type_key, categories,
                                   args.items, accepted, rng)
            await history(settings.migration_url, shop, args.days, args.contacts)
            shops.append(shop)
            if i % 10 == 0:
                print(f"{i} shops in {time.time() - started:.0f}s", flush=True)
    finally:
        await db.close()
    owner = await asyncpg.connect(settings.migration_url)
    try:
        for shop in shops:
            tenant = UUID(shop["tenant_id"])
            rows = await owner.fetch(
                "select id from contacts where tenant_id = $1 and role = 'customer' order by phone limit 200",
                tenant,
            )
            shop["contacts"] = [str(r["id"]) for r in rows]
            phones = await owner.fetch(
                "select phone from contacts where tenant_id = $1 and role = 'customer' order by phone limit 200",
                tenant,
            )
            shop["phones"] = [r["phone"] for r in phones]
            shop["items"] = [str(r["id"]) for r in await owner.fetch(
                "select id from items where tenant_id = $1 and status = 'live' order by code limit 60",
                tenant)]
            shop["modules"] = [r["module_key"] for r in await owner.fetch(
                "select module_key from tenant_modules where tenant_id = $1 and enabled", tenant)]
        # Documents on for the first N shops, whatever their type (a salon or a bakery both issue).
        for shop in shops[: args.docs_shops]:
            await owner.execute(
                "insert into tenant_modules (tenant_id, module_key) values ($1, 'documents') "
                "on conflict do nothing", UUID(shop["tenant_id"]))
            shop["modules"].append("documents")
        # What sign-up queued (welcome emails and the like) is not part of the load.
        await owner.execute(
            "update jobs set status = 'done', finished_at = now() where status = 'queued'")
        await owner.execute("analyze")
    finally:
        await owner.close()
    path = os.path.join(os.environ.get("LT_STATE", "/state"), "world.json")
    with open(path, "w") as out:
        json.dump({"shops": shops}, out)
    print(f"seeded {len(shops)} shops in {time.time() - started:.0f}s -> {path}")


if __name__ == "__main__":
    asyncio.run(main())
