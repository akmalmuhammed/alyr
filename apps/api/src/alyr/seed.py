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


async def ensure_demo_tenant(owner_dsn: str, meta_number_id: str = "") -> None:
    """Create the tenant row and its numbers. Needs the owner role: the app role cannot
    write to the global tables."""
    conn = await asyncpg.connect(owner_dsn)
    try:
        await conn.execute(
            "insert into tenants (id, name, name_ar) values ($1, $2, $3) "
            "on conflict (id) do nothing",
            DEMO_TENANT_ID, "Al Noor Electricals", "النور للكهربائيات",
        )
        numbers = [(SIMULATOR_NUMBER_ID, "simulator")]
        if meta_number_id:
            numbers.append((meta_number_id, "meta"))
        for number_id, channel in numbers:
            await conn.execute(
                "insert into channel_numbers (number_id, tenant_id, channel) values ($1, $2, $3) "
                "on conflict (number_id) do nothing",
                number_id, DEMO_TENANT_ID, channel,
            )
    finally:
        await conn.close()


async def reset_demo_data(db: Database) -> None:
    """Wipe the demo shop's data and load the starting state. Same result every time."""
    rng = random.Random(7)
    now = datetime.now(UTC)
    async with db.tenant(DEMO_TENANT_ID) as conn:
        for table in ("messages", "processed_messages", "payment_requests",
                      "ledger_entries", "ledger_accounts", "contacts", "tenant_modules"):
            await conn.execute(f"delete from {table}")
        await conn.execute("insert into tenant_modules (module_key) values ('ledger')")
        await conn.execute(
            "insert into contacts (phone, name, role, number_id) "
            "values ($1, 'Yusuf (counter)', 'staff', $2)",
            STAFF_PHONE, SIMULATOR_NUMBER_ID,
        )
        for index, name in enumerate(CUSTOMERS):
            phone = f"974555{index + 1:05d}"
            contact_id = await conn.fetchval(
                "insert into contacts (phone, name, credit_limit, number_id) "
                "values ($1, $2, $3, $4) returning id",
                phone, name,
                # Ahmed's limit is fixed so the over-limit warning can be shown on cue.
                500_000 if index == 0 else rng.choice([1_000_000, 2_000_000, 3_000_000]),
                SIMULATOR_NUMBER_ID,
            )
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
    await ensure_demo_tenant(settings.migration_url, settings.meta_phone_number_id)
    db = Database(settings.database_url)
    await db.connect()
    try:
        await reset_demo_data(db)
    finally:
        await db.close()
    print("demo shop ready: Al Noor Electricals,", len(CUSTOMERS), "customers")


if __name__ == "__main__":
    asyncio.run(main())
