"""The Agent says nothing about chats for a shop that has no inbox in ALYR (task I6, first
client's Insights audit). A shop that sells or books through ALYR but talks to its customers
somewhere else has messages in the database only by accident (a number once linked, a test),
and a card, a figure or a busiest-hours grid made of them would claim what the shop does not
do here. Each chat reading is gated by the `inbox` module; these tests fail the day one is not.
"""

import re
from datetime import timedelta

import pytest

from alyr.core.auth import Staff
from alyr.modules.agent import facts as agent_facts
from alyr.modules.agent import view
from alyr.modules.agent.insights import INSIGHTS, applies
from alyr.modules.agent.words import plain
from test_agent import NOW
from test_consent import owner_sql

_phones = iter(range(7_000_000, 8_000_000))


def shop(modules, name="Salon"):
    tenant = owner_sql("insert into tenants (name) values ($1) returning id", name)[0]["id"]
    for module in modules:
        owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, $2)",
                  tenant, module)
    return tenant


def customer_writes(tenant, n=60):
    """A real customer's `n` messages to the shop, spread over three hours of one day in the
    last 28 days, the last one unanswered."""
    n_phone = next(_phones)
    who = owner_sql(
        "insert into contacts (tenant_id, phone, name, role, wa_user_id) "
        "values ($1, $2, 'Customer', 'customer', $3) returning id",
        tenant, f"+974{n_phone}", f"{n_phone}",
    )[0]["id"]
    owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status, created_at) "
        "select $1, $2, 'in', 'text', 'hello', 'received', $3::timestamptz + g * interval "
        "'3 minutes' from generate_series(0, $4 - 1) g",
        tenant, who, NOW - timedelta(days=3), n,
    )
    return who


def read(client, tenant) -> agent_facts.Facts:
    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            modules = frozenset(
                r["module_key"] for r in await conn.fetch(
                    "select module_key from tenant_modules where enabled"
                )
            )
            staff = Staff(None, "", "", "owner", tenant)
            f = await agent_facts.gather(conn, staff, NOW)
            assert f.modules == modules
            return f

    return client.portal.call(go)


def test_without_the_inbox_a_shops_messages_are_not_read(client):
    tenant = shop(("ledger",))
    customer_writes(tenant)
    f = read(client, tenant)
    # No busiest-hours grid made of customers writing, no "customers who wrote", no waiting
    # chats and no record counted for the shop: it has no product that counts chats.
    assert f.hours_grid == {} and f.hours_total == 0
    assert f.waiting == [] and f.wrote == 0 and f.chats_by_day == {}
    assert f.has_records is False
    v = view.render(f, "en")
    assert v["lead"] == "ledger" and v["state"] == "empty"
    assert v["hours"] is None and v["week"] is None and v["team"] is None


def test_with_the_inbox_the_same_messages_are_read(client):
    tenant = shop(("inbox",))
    customer_writes(tenant)
    f = read(client, tenant)
    assert f.has_records is True and f.hours_total == 60 and f.wrote == 1
    assert view.render(f, "en")["lead"] == "inbox"


@pytest.mark.parametrize("modules", [("bookings",), ("orders",), ("bookings", "orders")])
def test_a_shops_own_products_decide_what_counts_as_a_record(client, modules):
    """Messages alone are not a record of a shop that has no inbox, and a record in a product
    the shop does not use is not one either."""
    tenant = shop(modules)
    customer_writes(tenant)
    assert read(client, tenant).has_records is False


def test_a_shop_with_no_product_that_counts_says_so_in_both_languages(client):
    tenant = shop(("discovery",))
    customer_writes(tenant)
    f = read(client, tenant)
    en, ar = view.render(f, "en"), view.render(f, "ar")
    said_en = plain(en["header"]["summary"][0]["text"])
    said_ar = plain(ar["header"]["summary"][0]["text"])
    assert said_en.startswith("Nothing to count here yet.")
    assert re.search(r"[؀-ۿ]", said_ar) and "يراسلك" not in said_ar
    assert "customers write" not in said_en
    assert en["kpis"] == [] and en["placeholders"] == [] and en["suggestions"] == []


def test_every_rule_that_reads_chats_needs_the_inbox():
    """A rule whose module list does not include the inbox must not be about chats: no key
    of a chat-reading rule may apply to a shop with orders and bookings but no inbox."""
    chats = {"waiting", "slow_answers", "lost_reason"}
    without = frozenset({"orders", "bookings", "ledger", "catalog", "payments", "documents"})
    for insight in INSIGHTS:
        if insight.key in chats:
            assert "inbox" in insight.module.split("|"), insight.key
            assert not applies(insight, without), insight.key
