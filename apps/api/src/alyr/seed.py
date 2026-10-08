"""The demo shop: Al Noor Electricals, a fictional electrical wholesaler.

Run with: uv run python -m alyr.seed
"""

import asyncio
import random
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.channels.simulator import SIMULATOR_NUMBER_ID
from alyr.config import get_settings
from alyr.core import consent
from alyr.db import Database
from alyr.modules.ledger import service

DEMO_TENANT_ID = UUID("0a1f0000-0000-4000-8000-00000000a1f0")
STAFF_PHONE = "97455500100"
AHMED_PHONE = "97455500001"

# All names are invented.
CUSTOMERS = [
    "Ahmed Al-Kuwari", "Bilal Contracting", "Doha Star Fit-Out", "Faisal Al-Marri",
    "Gulf Line MEP", "Hamad Al-Sulaiti", "Ibrahim Electricals", "Jassim Trading",
    "Khalid Al-Naimi", "Lusail Interiors", "Mansoor Hardware", "Nasser Al-Hajri",
    "Omar Maintenance", "Pearl Site Services", "Qasim Workshop", "Rashid Al-Mohannadi",
    "Salwa Road Lighting", "Tariq AC Services", "Umm Salal Builders", "Wakra Cables",
    "Yousef Al-Emadi", "Zubair Joinery", "Al Rayyan Projects", "Barwa Cooling",
    "Corniche Decor",
]


USERNAME_ONLY = "Corniche Decor"
DEMO_SLUG = "al-noor"

# (name, Arabic name, category, price in dirhams). Invented catalogue and prices.
PRODUCTS = [
    ("Cable 1.5 mm, 100 m roll", "كيبل 1.5 مم، لفة 100 م", "Cables", 14_500),
    ("Cable 2.5 mm, 100 m roll", "كيبل 2.5 مم، لفة 100 م", "Cables", 22_500),
    ("Cable 4 mm, 100 m roll", "كيبل 4 مم، لفة 100 م", "Cables", 36_000),
    ("Flexible conduit 20 mm, 50 m", "خرطوم مرن 20 مم، 50 م", "Cables", 8_500),
    ("Breaker 16 A single pole", "قاطع 16 أمبير", "Breakers", 1_800),
    ("Breaker 32 A single pole", "قاطع 32 أمبير", "Breakers", 2_400),
    ("Breaker 63 A three pole", "قاطع 63 أمبير ثلاثي", "Breakers", 9_500),
    ("Distribution board 12 way", "لوحة توزيع 12 خط", "Breakers", 18_500),
    ("LED panel 60 x 60, 40 W", "لوحة ليد 60×60، 40 واط", "Lighting", 4_500),
    ("LED flood light 100 W", "كشاف ليد 100 واط", "Lighting", 7_500),
    ("Socket 13 A double", "مقبس 13 أمبير مزدوج", "Fittings", 1_600),
    ("Switch 1 gang", "مفتاح إنارة مفرد", "Fittings", 900),
]


def demo_user_id(index: int) -> str:
    """A made-up WhatsApp user ID in Meta's format: country code, dot, digits."""
    return f"QA.{90000000000000000000 + index}"


# Fictional staff of the demo shop. The .example domain can never receive real email.
OWNER_EMAIL = "fatima@alnoor.example"
AGENT_EMAIL = "yusuf@alnoor.example"
TEAM = [
    (OWNER_EMAIL, "Fatima Al-Noor", "owner"),
    (AGENT_EMAIL, "Yusuf Rahman", "agent"),
]


async def ensure_demo_tenant(
    owner_dsn: str, meta_number_id: str = "", meta_waba_id: str = ""
) -> None:
    """Create the tenant row and its numbers. Needs the owner role: the app role cannot
    write to the global tables."""
    conn = await asyncpg.connect(owner_dsn)
    try:
        await conn.execute(
            "insert into tenants (id, name, name_ar, slug) values ($1, $2, $3, $4) "
            "on conflict (id) do update set slug = $4",
            DEMO_TENANT_ID, "Al Noor Electricals", "النور للكهربائيات", DEMO_SLUG,
        )
        numbers = [(SIMULATOR_NUMBER_ID, "simulator")]
        if meta_number_id:
            numbers.append((meta_number_id, "meta"))
        for number_id, channel in numbers:
            await conn.execute(
                "insert into channel_numbers (number_id, tenant_id, channel, waba_id) "
                "values ($1, $2, $3, $4) on conflict (number_id) do update set waba_id = $4",
                number_id, DEMO_TENANT_ID, channel,
                (meta_waba_id or None) if channel == "meta" else None,
            )
    finally:
        await conn.close()


async def reset_demo_data(db: Database) -> None:
    """Wipe the demo shop's data and load the starting state. Same result every time."""
    rng = random.Random(7)
    now = datetime.now(UTC)
    async with db.tenant(DEMO_TENANT_ID) as conn:
        await conn.execute("delete from sessions where tenant_id = $1", DEMO_TENANT_ID)
        await conn.execute(
            "delete from login_codes where email = any($1)", [email for email, _, _ in TEAM]
        )
        for table in ("memberships", "jobs", "messages", "processed_messages", "order_items",
                      "payment_requests", "orders", "products", "ledger_entries",
                      "ledger_accounts", "contacts", "tenant_modules"):
            await conn.execute(f"delete from {table}")
        await conn.execute(
            "insert into tenant_modules (module_key) values ('ledger'), ('orders')"
        )
        for email, name, role in TEAM:
            user_id = await conn.fetchval(
                "insert into users (email, name) values ($1, $2) "
                "on conflict (email) do update set name = excluded.name returning id",
                email, name,
            )
            await conn.execute(
                "insert into memberships (user_id, role) values ($1, $2)", user_id, role
            )
        for sort, (name, name_ar, category, price) in enumerate(PRODUCTS):
            await conn.execute(
                "insert into products (name, name_ar, category, price, sort) "
                "values ($1, $2, $3, $4, $5)",
                name, name_ar, category, price, sort,
            )
        await conn.execute(
            "insert into contacts (phone, name, role, number_id) "
            "values ($1, 'Yusuf (counter)', 'staff', $2)",
            STAFF_PHONE, SIMULATOR_NUMBER_ID,
        )
        for index, name in enumerate(CUSTOMERS):
            # One customer has a WhatsApp username and no visible phone number, so the
            # username-only path is exercised in every demo and test run.
            username_only = name == USERNAME_ONLY
            phone = None if username_only else f"974555{index + 1:05d}"
            contact_id = await conn.fetchval(
                "insert into contacts (phone, wa_user_id, username, name, credit_limit, number_id) "
                "values ($1, $2, $3, $4, $5, $6) returning id",
                phone, demo_user_id(index), "cornichedecor" if username_only else None, name,
                # Ahmed's limit is fixed so the over-limit warning can be shown on cue.
                500_000 if index == 0 else rng.choice([1_000_000, 2_000_000, 3_000_000]),
                SIMULATOR_NUMBER_ID,
            )
            # These are the shop's existing credit customers, who agreed to account
            # notices when the account was opened. Not agreement to marketing.
            await consent.record(conn, contact_id, "service", "granted", "merchant_record")
            if index == 0:
                # Ahmed is the customer the demo script follows: QAR 1,850 owed, 41 days old.
                await service.add_entry(conn, contact_id, "sale", 240_000, "Cables and breakers",
                                        "Yusuf (counter)", now - timedelta(days=41))
                await service.add_entry(conn, contact_id, "payment", 55_000, "Cash",
                                        "Yusuf (counter)", now - timedelta(days=20))
                continue
            for _ in range(rng.randint(1, 5)):
                await service.add_entry(
                    conn, contact_id, "sale", rng.randrange(15_000, 450_000, 500),
                    rng.choice(["Cables", "Breakers", "LED panels", "Conduit", "Switchgear"]),
                    "Yusuf (counter)", now - timedelta(days=rng.randint(2, 120)),
                )
            if rng.random() < 0.6:
                await service.add_entry(
                    conn, contact_id, "payment", rng.randrange(10_000, 200_000, 500),
                    "Bank transfer", "Yusuf (counter)", now - timedelta(days=rng.randint(1, 30)),
                )


async def main() -> None:
    settings = get_settings()
    await ensure_demo_tenant(
        settings.migration_url, settings.meta_phone_number_id, settings.meta_waba_id
    )
    db = Database(settings.database_url)
    await db.connect()
    try:
        await reset_demo_data(db)
    finally:
        await db.close()
    print("demo shop ready: Al Noor Electricals,", len(CUSTOMERS), "customers")


if __name__ == "__main__":
    asyncio.run(main())
