"""What happens to every table when a stopped client's data is erased (spec 042, D-116).

This file is the keep-list, and it is only data. The privacy notice says: "60 days after it stops,
we delete its data, except what the law requires us to keep, such as our invoices to it." What
the law requires ALYR to keep is the lawyer's question (ALY-51); until it is answered this is
ALYR's best reading, and every rule marked `lawyer=True` is a place the answer may change. To
change one, edit its line here (and the decision's table in D-116); no other code knows.

A rule is one of:

- `DELETE`: the rows that belong to the business go (`by` names the column that says which).
  Most tables. The business's owner could download all of it as one ZIP for 30 days after it
  stopped (D-081, `core/export.py`), receipts and photos included.
- `SCRUB`: the rows stay and the listed columns are blanked.
- `KEEP`: the rows stay as they are.
- `PEOPLE`: people who belonged only to the erased businesses; `core/erase.py` handles them.
- `GLOBAL`: not about any one business or client (machinery, price lists, staff).

`tests/test_erase.py` reads the database's own tables and foreign keys and fails when a table is
missing from `RULES`, when a rule contradicts the schema, or when a kept table points at a table
that is deleted. A new table therefore cannot be added without deciding here.
"""

from dataclasses import dataclass

DELETE, SCRUB, KEEP, PEOPLE, GLOBAL = "delete", "scrub", "keep", "people", "global"


@dataclass(frozen=True)
class Rule:
    kind: str
    reason: str
    # The column that names the business (DELETE, and KEEP or SCRUB rows that point at one).
    by: str = ""
    # SCRUB: (column, the value written), the value as SQL.
    scrub: tuple[tuple[str, str], ...] = ()
    # True where the lawyer's answer (ALY-51) may change what is kept.
    lawyer: bool = False


def _delete(reason: str, *tables: str, lawyer: bool = False) -> dict[str, Rule]:
    return {table: Rule(DELETE, reason, by="tenant_id", lawyer=lawyer) for table in tables}


RULES: dict[str, Rule] = {
    # ── The business's own data: deleted ─────────────────────────────────────────────────────
    **_delete(
        "a customer of the business, what they said and what the business wrote about them",
        "contacts", "messages", "message_media", "inbox_notes", "consents", "contact_merges",
        "chat_carts", "saved_replies", "sold_out_asks", "stock_watches", "staff_changes",
        "staff_pending", "review_requests", "activity", "agent_snoozes",
    ),
    **_delete(
        "what the business sold, booked and was paid, and the keys it connected for its own "
        "payment account (sealed); its customers' payment references are the business's, "
        "not ALYR's",
        "orders", "order_items", "order_discounts", "order_item_costs", "payment_requests",
        "payment_events", "payment_accounts", "ledger_accounts", "ledger_entries", "bookings",
        "services", "booking_resources", "resource_hours", "service_resources", "business_hours",
        "booking_closures", "stock_holds",
    ),
    # The cost tables are among them. Cost prices are for owners and admins only (the
    # `cost_margin` feature, `modules/items/costs.py`); nothing here reads them, it deletes
    # the rows.
    **_delete(
        "the business's catalog, prices, stock and settings",
        "items", "item_variants", "item_categories", "item_code_counters", "item_cost_history",
        "item_costs", "item_group_price_history", "item_group_prices", "item_option_groups",
        "item_options", "item_price_history", "item_schedules", "price_groups", "discount_rules",
        "delivery_settings", "delivery_zones", "stock_alerts", "stock_movements",
        "variant_day_stock", "custom_fields", "shop_features", "shop_settings",
        "item_bulk_changes", "item_imports",
    ),
    **_delete(
        "the records of the business's photos; the files in the photo store are emptied by the "
        "worker from `erasure_files`",
        "media_assets", "media_links", "media_ops", "media_usage",
    ),
    **_delete(
        "the receipts, invoices and credit notes the business issued to ITS customers, with "
        "their PDFs and numbering, and the payments it recorded by hand. They are the "
        "business's records; the ZIP it could download for 30 days holds every PDF. Deleting "
        "them is deliberate, owner role only, through the door in migration 0083. ALYR's "
        "reading is that the law puts the duty to keep them on the business, not on ALYR",
        "documents", "document_lines", "document_files", "document_series", "document_settings",
        "document_branches", "document_authority", "document_deliveries", "manual_payments",
        lawyer=True,
    ),
    **_delete(
        "what the business connected to its own systems",
        "api_keys", "connect_sales", "sale_imports", "sale_import_templates",
        "webhook_endpoints", "webhook_deliveries",
    ),
    **_delete(
        "who could sign in to the business, and their open sign-ins",
        "memberships", "sessions", "staff_link_codes",
    ),
    **_delete(
        "the business's WhatsApp number and set-up, its switches, the funnel record of its own "
        "sign-up and its weekly reports",
        "channel_numbers", "whatsapp_setup", "tenant_modules", "onboarding_events",
        "onboarding_reminders", "onboarding_steps", "setup_requests", "weekly_reports",
    ),
    **_delete(
        "work queued or done for the business: copies of its customers' messages",
        "jobs", "processed_messages",
    ),
    # The business itself, last: every table above points at it.
    "tenants": Rule(
        DELETE, "the business's own row: its name, its address on the web, its settings",
        by="id",
    ),

    # ── ALYR's own records about the client ──────────────────────────────────────────────────
    "clients": Rule(
        SCRUB,
        "ALYR's customer record. The name stays: it is the addressee of ALYR's invoices and "
        "quotes to the client, and so do the dates of the cancellation. The people, ALYR's own "
        "notes about them and the note of how the client asked to cancel go",
        by="id", scrub=(
            ("contact_name", "''"), ("contact_email", "''"), ("contact_phone", "''"),
            ("note", "''"), ("access_note", "''"), ("cancel_note", "''"),
        ),
        lawyer=True,
    ),
    "quotes": Rule(
        KEEP,
        "ALYR's price offers to the client and the one it accepted, with who accepted it: the "
        "record of the contract and of what ALYR charged",
        by="client_id", lawyer=True,
    ),
    "quote_lines": Rule(KEEP, "the lines of those quotes", by="business_id", lawyer=True),
    "client_payments": Rule(
        KEEP,
        "what the client paid ALYR, when and how: ALYR's accounting records, which the law "
        "requires ALYR to keep for a period the lawyer sets",
        by="client_id", lawyer=True,
    ),
    "card_checkouts": Rule(
        SCRUB,
        "the client's card payments to ALYR through the payment provider (references and "
        "amounts, never a card number): ALYR's accounting records. Who started the checkout "
        "(a name or an email) goes",
        by="business_id", scrub=(("created_by", "''"),), lawyer=True,
    ),
    "billing_notices": Rule(
        KEEP, "which plan emails ALYR sent the client and when: dates and kinds only",
        by="client_id",
    ),
    "terms_acceptances": Rule(
        SCRUB,
        "proof that the owner accepted ALYR's terms and privacy notice: which version, when, and "
        "the name given. The address and browser they used go",
        by="tenant_id", scrub=(("ip", "''"), ("user_agent", "''")), lawyer=True,
    ),
    "platform_audit": Rule(
        KEEP,
        "ALYR staff's log of what they did; the database refuses to change or remove a row. It "
        "names the client and the business by ID, and what staff typed (how a client asked to "
        "cancel, an owner's email when the business was made)",
        lawyer=True,
    ),
    "erasure_receipts": Rule(KEEP, "ALYR's proof that this deletion happened: counts only"),
    "erasure_files": Rule(KEEP, "the photo store's half of that proof: counts only"),
    "erasing_businesses": Rule(
        KEEP, "the door through the guards: a row exists only inside the job's own transaction",
        by="business_id",
    ),

    # ── People who belonged only to the erased businesses ────────────────────────────────────
    "users": Rule(
        PEOPLE,
        "a person who belonged to no other business: deleted, or, when a record ALYR keeps "
        "points at them (a quote they accepted, the terms they accepted), made anonymous: no "
        "email, no name. ALYR's own staff are never touched",
    ),
    "login_codes": Rule(PEOPLE, "pending sign-in codes sent to those people's emails"),
    "signup_tokens": Rule(PEOPLE, "pending sign-up links sent to those people's emails"),

    # ── Not about any one business or client ─────────────────────────────────────────────────
    **{table: Rule(GLOBAL, reason) for table, reason in {
        "alert_state": "which alerts are firing: counts only",
        "business_templates": "the kinds of business ALYR's staff made; a shop only reads them",
        "business_type_settings": "ALYR's switches per kind of business",
        "platform_admins": "ALYR's own staff",
        "platform_settings": "ALYR's own settings",
        "price_items": "ALYR's price list",
        "rate_hits": "counts of requests by a hash of the address; they expire by themselves",
        "schema_migrations": "which migrations ran",
        "terms_versions": "the texts ALYR published; the same for every client",
        "today_snoozes": "items ALYR's staff set aside; they expire by themselves",
        "worker_heartbeats": "the worker's check-ins",
    }.items()},
}

# Records ALYR keeps that point at a person (a row in `users`) with no ON DELETE rule that lets
# the person go. Such a person is made anonymous instead of deleted. The test reads the
# database's foreign keys and fails when a kept table points at a person and is not named here.
USER_REFERENCES: tuple[tuple[str, str], ...] = (
    ("quotes", "accepted_by"),
    ("terms_acceptances", "user_id"),
)
