"""Builders for the erasure tests (spec 042): a client whose cancellation took effect some days
ago, with businesses that hold a little of everything, all made up.

Every name, number and address here is fictional. The needles (`Needles`) are the strings the
tests search the whole database for after the erasure: if one is still there, outside the records
ALYR keeps on purpose, the erasure left a person behind.
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from uuid import UUID, uuid4

from alyr.config import Settings
from alyr.core import erase
from alyr.core import erase_rules as rules
from alyr.db import Database
from conftest import OWNER_DSN
from test_consent import owner_sql

TERMS_VERSION = "(select id from terms_versions where kind = 'privacy' limit 1)"


@dataclass
class Needles:
    """What would give a person away, if it were found after the erasure."""

    business_name: str
    owner_email: str
    owner_name: str
    staff_email: str
    customer_name: str
    customer_phone: str
    message: str
    note: str
    contact_email: str
    contact_phone: str
    contact_name: str
    cancel_note: str

    def pattern(self, *, leave: tuple[str, ...] = ()) -> str:
        """One case-insensitive regular expression for all of them, except the named ones."""
        return "|".join(re.escape(v) for k, v in vars(self).items() if k not in leave)


@dataclass
class Stopped:
    client_id: UUID
    tag: str
    businesses: list[UUID] = field(default_factory=list)
    needles: Needles | None = None
    owner_id: UUID | None = None
    staff_id: UUID | None = None


def phone() -> str:
    return f"9745{uuid4().int % 10_000_000:07d}"


def stopped_client(days_ago: int = 70, *, businesses: int = 1, fill: bool = True) -> Stopped:
    """A client whose cancellation took effect `days_ago` days ago (Qatar's calendar), with its
    businesses, each filled with a little of everything when `fill` is true."""
    tag = uuid4().hex[:8]
    needles = Needles(
        business_name=f"Zq Bakery {tag}", owner_email=f"mona-{tag}@zq-owner.example",
        owner_name=f"Mona Zq {tag}", staff_email=f"sami-{tag}@zq-staff.example",
        customer_name=f"Mariam Needle {tag}", customer_phone=phone(),
        message=f"Do you deliver to Al Waab {tag}", note=f"Lives in villa 12 {tag}",
        contact_email=f"layla-{tag}@zorbo-co.example",
        contact_phone=f"+97455{uuid4().int % 1_000_000:06d}", contact_name=f"Layla Zorbo {tag}",
        cancel_note=f"Layla phoned on 3 Nov {tag}",
    )
    client_id = owner_sql(
        "insert into clients (name, contact_name, contact_email, contact_phone, note, access_note, "
        "cancel_requested_at, cancels_on, cancel_note, billing_state) "
        "values ($1, $2, $3, $4, 'Prefers calls after five', 'Opened for a pilot', "
        "now() - make_interval(days => $5 + 7), (now() at time zone 'Asia/Qatar')::date - $5, "
        "$6, 'cancelled') returning id",
        f"Zorbo Holdings {tag}", needles.contact_name, needles.contact_email,
        needles.contact_phone, days_ago, needles.cancel_note,
    )[0]["id"]
    world = Stopped(client_id, tag, needles=needles)
    for i in range(businesses):
        world.businesses.append(business(world, i))
    if fill:
        for i, tenant in enumerate(world.businesses):
            populate(world, tenant, first=i == 0)
    return world


def business(world: Stopped, i: int) -> UUID:
    return owner_sql(
        "insert into tenants (name, name_ar, slug, business_type, client_id, live_at, "
        "created_at) values ($1, $2, $3, 'bakery', $4, now() - interval '120 days', "
        "now() - interval '300 days') returning id",
        world.needles.business_name + (f" {i}" if i else ""), f"مخبز {world.tag}",
        f"zq-{world.tag}-{i}", world.client_id,
    )[0]["id"]


def populate(world: Stopped, tenant: UUID, *, first: bool) -> None:
    """A little of nearly everything a business holds. The first business of a client also
    gives the client its records: a quote it accepted, payments, a card checkout."""
    n = world.needles

    def sql(text: str, *args):
        return owner_sql(text, tenant, *args)

    def owner_row(text: str, *args):
        return sql(text, *args)[0]["id"]

    # People are not in a business's tables: they are made with their own arguments.
    owner = owner_sql(
        "insert into users (email, name, name_ar) values ($1, $2, 'منى') returning id",
        n.owner_email if first else f"o2-{uuid4().hex[:8]}@zq-owner.example", n.owner_name,
    )[0]["id"]
    staff = owner_sql(
        "insert into users (email, name) values ($1, 'Sami') returning id",
        n.staff_email if first else f"s2-{uuid4().hex[:8]}@zq-staff.example",
    )[0]["id"]
    for user, role in ((owner, "owner"), (staff, "agent")):
        owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)",
                  tenant, user, role)
        owner_sql("insert into sessions (token_hash, user_id, tenant_id, expires_at) "
                  "values ($1, $2, $3, now() + interval '1 day')", uuid4().hex, user, tenant)
    owner_sql("update users set last_tenant_id = $2 where id = $1", owner, tenant)
    owner_sql("insert into staff_link_codes (tenant_id, user_id, code_hash, expires_at) "
              "values ($1, $2, $3, now() + interval '1 hour')", tenant, owner, uuid4().hex)
    if first:
        world.owner_id, world.staff_id = owner, staff
        # Pending sign-in codes and sign-up links for the owner.
        owner_sql("insert into login_codes (email, code_hash, expires_at) "
                  "values ($1, 'x', now() + interval '1 hour')", n.owner_email)
        owner_sql("insert into signup_tokens (token_hash, email, expires_at) "
                  "values ($1, $2, now() + interval '1 hour')", uuid4().hex, n.owner_email)

    # Customers and their conversations.
    customer = owner_row(
        "insert into contacts (tenant_id, phone, name, email, consent_service) "
        "values ($1, $2, $3, 'mariam@customer.example', 'granted') returning id",
        n.customer_phone if first else phone(), n.customer_name,
    )
    message = owner_row(
        "insert into messages (tenant_id, contact_id, direction, kind, body) "
        "values ($1, $2, 'in', 'text', $3) returning id", customer, n.message,
    )
    sql("insert into message_media (tenant_id, message_id, content_type, data) "
        "values ($1, $2, 'image/png', 'x'::bytea)", message)
    sql("insert into inbox_notes (tenant_id, contact_id, body, author_name) "
        "values ($1, $2, $3, 'Sami')", customer, n.note)
    sql("insert into consents (tenant_id, contact_id, purpose, status, source) "
        "values ($1, $2, 'service', 'granted', 'first_message')", customer)
    sql("insert into chat_carts (tenant_id, contact_id, expires_at) "
        "values ($1, $2, now() + interval '1 day')", customer)
    sql("insert into saved_replies (tenant_id, title, body) values ($1, 'Hours', 'We open at 7')")
    sql("insert into activity (tenant_id, subject, subject_id, action, actor_name) "
        "values ($1, 'conversation', $2, 'note_added', 'Sami')", customer)
    sql("insert into jobs (tenant_id, kind, payload, status) values ($1, 'inbound', $2, 'done')",
        json.dumps({"from_number": n.customer_phone, "text": n.message}))
    sql("insert into processed_messages (tenant_id, message_id) values ($1, $2)",
        f"wamid.{uuid4().hex}")

    # Orders, bookings and money.
    order = owner_row(
        "insert into orders (tenant_id, contact_id, number, status, total, delivery_address) "
        "values ($1, $2, $3, 'done', 4500, 'Al Waab, villa 12') returning id",
        customer, uuid4().int % 900_000 + 100_000,
    )
    sql("insert into order_items (tenant_id, order_id, name, price, quantity) "
        "values ($1, $2, 'Date cake', 4500, 1)", order)
    sql("insert into payment_requests (tenant_id, contact_id, amount) values ($1, $2, 4500)",
        customer)
    sql("insert into ledger_accounts (tenant_id, contact_id) values ($1, $2)", customer)
    sql("insert into ledger_entries (tenant_id, contact_id, kind, amount) "
        "values ($1, $2, 'sale', 4500)", customer)
    service = owner_row(
        "insert into services (tenant_id, name, duration_minutes) values ($1, 'Fitting', 30) "
        "returning id")
    sql("insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
        "starts_at, ends_at, status) values ($1, $2, $3, $4, 'Fitting', now() - interval '90 days',"
        " now() - interval '90 days' + interval '30 minutes', 'completed')",
        uuid4().int % 900_000 + 100_000, customer, service)
    sql("insert into business_hours (tenant_id, weekday, opens, closes) "
        "values ($1, 1, '08:00', '17:00')")

    # The catalog and a photo's record.
    item = owner_row("insert into items (tenant_id, name, price) values ($1, 'Date cake', 4500) "
                     "returning id")
    sql("insert into item_categories (tenant_id, name) values ($1, 'Cakes')")
    # A new item has its default variant (a trigger makes it).
    variant_id = owner_sql("select id from item_variants where item_id = $1", item)[0]["id"]
    sql("insert into stock_movements (tenant_id, variant_id, kind, delta, balance_after, "
        "actor_name) values ($1, $2, 'received', 5, 5, 'Sami')", variant_id)
    sql("insert into stock_watches (tenant_id, contact_id, item_id) values ($1, $2, $3)",
        customer, item)
    asset = owner_row(
        "insert into media_assets (tenant_id, source_sha256, width, height, variants, bytes_total)"
        " values ($1, $2, 10, 10, '[]'::jsonb, 1) returning id", uuid4().hex + uuid4().hex)
    sql("insert into media_links (tenant_id, asset_id, owner_kind, owner_id) "
        "values ($1, $2, 'item', $3)", asset, item)

    # Connected systems and set-up.
    sql("insert into api_keys (tenant_id, name, prefix, secret_hash, scopes) "
        "values ($1, 'Till', $2, $3, '{sales:write}')", uuid4().hex[:8], uuid4().hex + uuid4().hex)
    endpoint = owner_row(
        "insert into webhook_endpoints (tenant_id, name, url, events, secret) values ($1, 'Books', "
        "'https://books.example/hook', '{document.issued}', $2) returning id",
        "whsec_" + "ab" * 16)
    sql("insert into webhook_deliveries (tenant_id, endpoint_id, event, payload) "
        "values ($1, $2, 'document.issued', '{}'::jsonb)", endpoint)
    sql("insert into onboarding_steps (tenant_id, step_key) values ($1, 'products')")
    sql("insert into onboarding_events (tenant_id, step_key, event) "
        "values ($1, 'products', 'done')")
    sql("insert into whatsapp_setup (tenant_id) values ($1)")
    sql("insert into channel_numbers (number_id, tenant_id, channel) values ($2, $1, 'meta')",
        uuid4().hex[:15])
    sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'orders')")
    sql("insert into weekly_reports (tenant_id, week_start, sections) "
        "values ($1, current_date, '[]'::jsonb)")
    sql(f"insert into terms_acceptances (tenant_id, version_id, user_id, accepted_by, ip, "
        f"user_agent) values ($1, {TERMS_VERSION}, $2, $3, '203.0.113.9', 'FakeBrowser/1.0')",
        owner, n.owner_name)

    if first:
        world_records(world, tenant, owner)


def world_records(world: Stopped, tenant: UUID, owner: UUID) -> None:
    """ALYR's own records about the client, which the erasure keeps."""
    # A quote is drafted with its lines, then accepted; once accepted it is locked.
    quote = owner_sql(
        "insert into quotes (client_id, number) values ($1, 1) returning id", world.client_id,
    )[0]["id"]
    owner_sql("insert into quote_lines (quote_id, business_id, name, kind, unit_price) "
              "values ($1, $2, 'Chat', 'monthly', 44900)", quote, tenant)
    owner_sql("update quotes set status = 'accepted', accepted_at = now() - interval '200 days', "
              "accepted_by = $2, accepted_by_name = $3 where id = $1",
              quote, owner, world.needles.owner_name)
    owner_sql("insert into client_payments (client_id, quote_id, amount, method, received_on) "
              "values ($1, $2, 144900, 'bank_transfer', current_date - 150)",
              world.client_id, quote)
    owner_sql("insert into card_checkouts (client_id, business_id, status, subscription_ref, "
              "subscription_status, created_by) values ($1, $2, 'paid', $3, 'canceled', $4)",
              world.client_id, tenant, f"sub_{uuid4().hex}", world.needles.owner_email)
    owner_sql("insert into billing_notices (client_id, kind, due_on) "
              "values ($1, 'cancel_scheduled', current_date - 70)", world.client_id)
    owner_sql("insert into platform_audit (staff_email, staff_name, action, subject_type, "
              "subject_id, client_id, business_id) values ('founder@alyr.example', 'Founder', "
              "'client.cancel', 'client', $1, $2, $3)", str(world.client_id), world.client_id,
              tenant)


# ── looking ─────────────────────────────────────────────────────────────────────────────

TENANT_TABLES = "select table_name from information_schema.columns where table_schema = 'public' " \
                "and column_name = 'tenant_id' order by 1"


def counts_for(tenant: UUID) -> dict[str, int]:
    """Rows of the business, by table, for every table that has a tenant_id (zeros left out)."""
    out = {}
    for row in owner_sql(TENANT_TABLES):
        table = row["table_name"]
        n = owner_sql(f'select count(*) as n from "{table}" where tenant_id = $1', tenant)[0]["n"]
        if n:
            out[table] = n
    out["tenants"] = owner_sql("select count(*) as n from tenants where id = $1", tenant)[0]["n"]
    return {t: n for t, n in out.items() if n}


def remaining(tenant: UUID) -> dict[str, int]:
    """Rows the erasure was meant to delete that are still there (the records kept on purpose,
    such as the terms the owner accepted, are not counted)."""
    return {t: n for t, n in counts_for(tenant).items() if rules.RULES[t].kind == rules.DELETE}


def everything_else(excluding: list[UUID]) -> dict[str, int]:
    """Rows of every business that is not in `excluding`, by table: what an erasure must not
    change."""
    out = {}
    for row in owner_sql(TENANT_TABLES):
        table = row["table_name"]
        n = owner_sql(f'select count(*) as n from "{table}" where tenant_id <> all($1::uuid[])',
                      excluding)[0]["n"]
        out[table] = n
    return out


# ── running ─────────────────────────────────────────────────────────────────────────────


def with_owner_db(work, dsn: str = OWNER_DSN):
    async def go():
        db = Database(dsn)
        await db.connect()
        try:
            return await work(db)
        finally:
            await db.close()

    return asyncio.run(go())


def run_erase(world: Stopped | list[Stopped] | None = None, *, apply: bool = True, on=None,
              dsn: str = OWNER_DSN, **settings) -> dict:
    worlds = [world] if isinstance(world, Stopped) else (world or [])
    only = [w.client_id for w in worlds] or None
    return with_owner_db(
        lambda db: erase.run(
            db, apply=apply, on=on, only=only,
            settings=Settings(**({"erase_max_per_run": 50} | settings)),
        ),
        dsn,
    )
