"""The product line-up of 17 Oct 2026 (ALY-99, D-035): ALYR Chat, ALYR Bookings, ALYR
Agent, ALYR Accounts and ALYR Payroll. Rows stored under the old product keys keep
working once migration 0017 has run."""

import asyncio

import asyncpg

from alyr.migrate import MIGRATIONS
from conftest import APP_DSN, OWNER_DSN
from test_consent import owner_sql

LINE_UP = MIGRATIONS / "0017_product_line_up.sql"


def run_line_up(dsn: str = OWNER_DSN) -> None:
    """Run the migration again, as it ran on a database made before the line-up."""

    async def go():
        conn = await asyncpg.connect(dsn)
        try:
            async with conn.transaction():
                await conn.execute(LINE_UP.read_text(encoding="utf-8"))
        finally:
            await conn.close()

    asyncio.run(go())


def test_the_price_list_follows_the_new_product_keys():
    # The price list as 0015 left it.
    owner_sql("delete from price_items where key in ('bookings', 'agent')")
    owner_sql(
        "update price_items set name = 'Credit accounts', name_ar = 'حسابات الآجل', "
        "applies = 'product:credit' where key = 'credit'"
    )
    owner_sql(
        "insert into price_items (key, name, kind, price, applies) "
        "values ('statements', 'Printed statements', 'monthly', 1000, 'product:credit')"
    )
    try:
        run_line_up()
        items = {r["key"]: r for r in owner_sql("select * from price_items")}
        assert (items["credit"]["name"], items["credit"]["applies"]) == (
            "ALYR Accounts", "product:accounts",
        )
        # An item ALYR added for credit customers follows them too.
        assert items["statements"]["applies"] == "product:accounts"
        assert (items["bookings"]["price"], items["bookings"]["applies"]) == (
            44900, "product:bookings",
        )
        assert (items["agent"]["price"], items["agent"]["applies"]) == (0, "product:agent")
        # A price ALYR set is never overwritten by running it again.
        owner_sql("update price_items set price = 39900 where key = 'bookings'")
        run_line_up()
        price = owner_sql("select price from price_items where key = 'bookings'")[0]["price"]
        assert price == 39900
    finally:
        owner_sql("delete from price_items where key = 'statements'")
        owner_sql("update price_items set price = 44900 where key = 'bookings'")


def test_setup_requests_move_to_the_product_that_now_owns_the_step():
    salon = owner_sql("insert into tenants (name) values ('Old Salon') returning id")[0]["id"]
    owner_sql(
        "insert into tenant_modules (tenant_id, module_key) "
        "select $1, unnest(array['inbox', 'bookings', 'payments'])",
        salon,
    )
    owner_sql(
        "insert into setup_requests (tenant_id, product_key, step_key) values "
        "($1, 'credit', 'onboarding'), ($1, 'chat', 'services'), ($1, 'chat', 'hours'), "
        "($1, 'chat', 'provider'), ($1, 'chat', 'help')",
        salon,
    )
    restaurant = owner_sql("insert into tenants (name) values ('Old Grill') returning id")[0]["id"]
    owner_sql(
        "insert into tenant_modules (tenant_id, module_key) "
        "select $1, unnest(array['inbox', 'orders', 'payments'])",
        restaurant,
    )
    owner_sql(
        "insert into setup_requests (tenant_id, product_key, step_key) values "
        "($1, 'chat', 'onboarding'), ($2, 'chat', 'onboarding')",
        restaurant, salon,
    )
    run_line_up()

    def filed(tenant):
        return sorted(
            (r["step_key"], r["product_key"])
            for r in owner_sql(
                "select step_key, product_key from setup_requests where tenant_id = $1", tenant
            )
        )

    assert filed(salon) == [
        ("help", "chat"), ("hours", "bookings"), ("onboarding", "accounts"),
        ("onboarding", "bookings"), ("provider", "chat"), ("services", "bookings"),
    ]
    # A restaurant set up with ALYR stays under ALYR Chat.
    assert filed(restaurant) == [("onboarding", "chat")]


def test_the_migration_works_under_row_level_security():
    # Locally the owner role bypasses row-level security; a hosted owner role may not.
    # The migration steps through each business's own scope, so even the app role,
    # which never bypasses it, moves every business's rows.
    trader = owner_sql("insert into tenants (name) values ('Old Trader') returning id")[0]["id"]
    owner_sql(
        "insert into setup_requests (tenant_id, product_key, step_key) "
        "values ($1, 'credit', 'onboarding')",
        trader,
    )
    run_line_up(APP_DSN)
    assert owner_sql(
        "select product_key from setup_requests where tenant_id = $1", trader
    )[0]["product_key"] == "accounts"
