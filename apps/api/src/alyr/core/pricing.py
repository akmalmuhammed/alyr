"""What ALYR charges, and the price each client is offered (decision D-032).

ALYR keeps a price list. A quote for a client is drafted from it and from the client's
businesses, then edited in the back office and published; the owner sees it as the last
step of onboarding and accepts it. An accepted quote is locked by the database.

Per type of business ALYR also decides whether an owner may sign up on their own and
whether they see a price straight away or once ALYR has prepared it.

Amounts are in dirhams: 100 is QAR 1.
"""

import re
from dataclasses import dataclass
from uuid import UUID

import asyncpg

from alyr import catalog, presets
from alyr.core.normalise import fmt_qar

AVAILABILITY = ("self_serve", "with_alyr", "hidden")
PRICE_MODES = ("automatic", "prepared")
PERIODS = (1, 3, 6, 12)
KINDS = ("monthly", "one_time")
APPLIES = re.compile(r"^(each_business|each_client|manual|product:[a-z_]+|module:[a-z_]+)$")
ITEM_KEY = re.compile(r"^[a-z0-9_]{2,40}$")


class PricingError(Exception):
    """A change the price list or a quote cannot take; the message is safe to show."""


@dataclass(frozen=True)
class Business:
    id: UUID | None
    name: str
    modules: frozenset[str]


# ── switches per type of business ─────────────────────────


def _default_availability(preset: presets.Preset) -> str:
    return "self_serve" if preset.way == "appointments" else "with_alyr"


async def type_settings(conn: asyncpg.Connection) -> dict[str, dict]:
    """Every type of business with its switches. A type whose screens are not built yet
    is never self-serve, whatever is stored."""
    stored = {
        r["key"]: r
        for r in await conn.fetch(
            "select key, availability, price_mode from business_type_settings"
        )
    }
    out = {}
    for preset in presets.PRESETS:
        row = stored.get(preset.key)
        availability = row["availability"] if row else _default_availability(preset)
        if preset.way != "appointments" and availability == "self_serve":
            availability = "with_alyr"
        out[preset.key] = {
            "availability": availability,
            "price_mode": row["price_mode"] if row else "prepared",
            "can_self_serve": preset.way == "appointments",
        }
    return out


def way_for(preset: presets.Preset, availability: str) -> str:
    """The onboarding path a new business of this type follows."""
    if preset.way == "appointments" and availability == "self_serve":
        return "appointments"
    return "assisted"


async def save_type(
    conn: asyncpg.Connection, key: str, availability: str, price_mode: str, by: str
) -> None:
    preset = presets.PRESET_BY_KEY.get(key)
    if preset is None:
        raise PricingError("unknown type of business")
    if availability not in AVAILABILITY or price_mode not in PRICE_MODES:
        raise PricingError("unknown setting")
    if availability == "self_serve" and preset.way != "appointments":
        raise PricingError(
            f"{preset.name.en} has no self-serve screens yet; it can only be set up with ALYR"
        )
    await conn.execute(
        "insert into business_type_settings (key, availability, price_mode, updated_at, "
        "updated_by) values ($1, $2, $3, now(), $4) on conflict (key) do update set "
        "availability = $2, price_mode = $3, updated_at = now(), updated_by = $4",
        key, availability, price_mode, by,
    )


# ── the promise ───────────────────────────────────────────


async def promise(conn: asyncpg.Connection) -> dict:
    value = await conn.fetchval("select value from platform_settings where key = 'promise'")
    value = value or {}
    return {"en": value.get("en", ""), "ar": value.get("ar", "")}


async def save_promise(conn: asyncpg.Connection, en: str, ar: str, by: str) -> None:
    await conn.execute(
        "insert into platform_settings (key, value, updated_at, updated_by) "
        "values ('promise', $1, now(), $2) on conflict (key) do update set "
        "value = $1, updated_at = now(), updated_by = $2",
        {"en": en.strip(), "ar": ar.strip()}, by,
    )


# ── the price list ────────────────────────────────────────


def _item(row) -> dict:
    return {
        "key": row["key"], "name": row["name"], "name_ar": row["name_ar"],
        "kind": row["kind"], "price": row["price"], "price_text": fmt_qar(row["price"]),
        "applies": row["applies"], "active": row["active"], "sort": row["sort"],
        "updated_at": row["updated_at"].isoformat(), "updated_by": row["updated_by"],
    }


async def items(conn: asyncpg.Connection, only_active: bool = False) -> list[dict]:
    rows = await conn.fetch(
        "select * from price_items where active or not $1 order by sort, key", only_active
    )
    return [_item(r) for r in rows]


def _check_applies(applies: str) -> None:
    if not APPLIES.match(applies):
        raise PricingError("unknown rule for when the item applies")
    kind, _, key = applies.partition(":")
    if kind == "product" and key not in catalog.PRODUCT_BY_KEY:
        raise PricingError(f"unknown product {key}")
    if kind == "module" and key not in catalog.MODULE_BY_KEY:
        raise PricingError(f"unknown module {key}")


async def save_item(
    conn: asyncpg.Connection, key: str, name: str, name_ar: str, kind: str, price: int,
    applies: str, active: bool, sort: int, by: str,
) -> dict:
    """Add an item to the price list or change one. Quotes already made keep their
    own copy of the price, so this never changes what a client was offered."""
    if not ITEM_KEY.match(key):
        raise PricingError("the key may use a-z, 0-9 and underscores")
    if kind not in KINDS:
        raise PricingError("an item is monthly or one-time")
    if price < 0:
        raise PricingError("a price cannot be negative; use a discount line on the quote")
    if not name.strip():
        raise PricingError("give the item a name")
    _check_applies(applies)
    row = await conn.fetchrow(
        "insert into price_items (key, name, name_ar, kind, price, applies, active, sort, "
        "updated_at, updated_by) values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9) "
        "on conflict (key) do update set name = $2, name_ar = $3, kind = $4, price = $5, "
        "applies = $6, active = $7, sort = $8, updated_at = now(), updated_by = $9 "
        "returning *",
        key, name.strip(), name_ar.strip(), kind, price, applies, active, sort, by,
    )
    return _item(row)


# ── drafting a quote ──────────────────────────────────────


def _applies_to(applies: str, modules: frozenset[str]) -> bool:
    if applies == "each_business":
        return True
    kind, _, key = applies.partition(":")
    if kind == "module":
        return key in modules
    if kind == "product":
        # The products the business is using, as the workspace counts them: ALYR Agent
        # always, and a salon with the inbox, bookings and payment links on uses ALYR
        # Bookings, not ALYR Chat as well.
        return key in catalog.products_for(modules)
    return False


def draft_lines(price_list: list[dict], businesses: list[Business]) -> list[dict]:
    """The lines a quote starts from: every active item whose rule matches, for each
    business in turn, then the items charged once per client."""
    active = [i for i in price_list if i["active"] and i["applies"] != "manual"]
    lines: list[dict] = []

    def line(item: dict, business_id: UUID | None) -> dict:
        return {
            "business_id": business_id, "item_key": item["key"], "name": item["name"],
            "name_ar": item["name_ar"], "kind": item["kind"], "quantity": 1,
            "unit_price": item["price"],
        }

    for business in businesses:
        for item in active:
            if item["applies"] != "each_client" and _applies_to(item["applies"], business.modules):
                lines.append(line(item, business.id))
    for item in active:
        if item["applies"] == "each_client":
            lines.append(line(item, None))
    for sort, entry in enumerate(lines):
        entry["sort"] = sort
    return lines


def totals(lines: list[dict], period_months: int, discount_pct: int) -> dict:
    monthly = sum(x["quantity"] * x["unit_price"] for x in lines if x["kind"] == "monthly")
    once = sum(x["quantity"] * x["unit_price"] for x in lines if x["kind"] == "one_time")
    monthly = max(monthly, 0)
    discount = round(monthly * discount_pct / 100)
    monthly_total = monthly - discount
    out = {
        "monthly_subtotal": monthly, "discount": discount, "monthly_total": monthly_total,
        "period_total": monthly_total * period_months, "one_time_total": max(once, 0),
    }
    return out | {f"{k}_text": fmt_qar(v) for k, v in out.items()}


# ── reading a quote ───────────────────────────────────────


async def _lines(conn: asyncpg.Connection, quote_id: UUID) -> list[dict]:
    rows = await conn.fetch(
        "select l.*, t.name as business, t.name_ar as business_ar from quote_lines l "
        "left join tenants t on t.id = l.business_id where l.quote_id = $1 "
        "order by l.sort, l.name",
        quote_id,
    )
    return [
        {
            "id": str(r["id"]), "business_id": str(r["business_id"]) if r["business_id"] else None,
            "business": r["business"] or "", "business_ar": r["business_ar"] or "",
            "item_key": r["item_key"], "name": r["name"], "name_ar": r["name_ar"],
            "kind": r["kind"], "quantity": r["quantity"], "unit_price": r["unit_price"],
            "unit_price_text": fmt_qar(r["unit_price"]),
            "amount": r["quantity"] * r["unit_price"],
            "amount_text": fmt_qar(r["quantity"] * r["unit_price"]),
        }
        for r in rows
    ]


async def quote_view(conn: asyncpg.Connection, row, the_promise: dict | None = None) -> dict:
    lines = await _lines(conn, row["id"])
    return {
        "id": str(row["id"]), "number": row["number"], "status": row["status"],
        "period_months": row["period_months"], "discount_pct": row["discount_pct"],
        "show_promise": row["show_promise"], "note": row["note"],
        "updated_at": row["updated_at"].isoformat(), "updated_by": row["updated_by"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "accepted_at": row["accepted_at"].isoformat() if row["accepted_at"] else None,
        "accepted_by": row["accepted_by_name"],
        "lines": lines,
        "totals": totals(lines, row["period_months"], row["discount_pct"]),
        "promise": the_promise if row["show_promise"] and the_promise else None,
    }


async def own_quote(conn: asyncpg.Connection) -> dict:
    """What the owner sees on the plan step: the quote waiting for their answer, else
    the one they accepted, else that ALYR is preparing their price. `conn` is scoped to
    their business; row-level security hides drafts and other clients."""
    row = await conn.fetchrow(
        "select * from quotes where status in ('published', 'accepted') "
        "order by (status = 'published') desc, number desc limit 1"
    )
    if row is None:
        return {"status": "preparing"}
    view = await quote_view(conn, row, await promise(conn))
    # What ALYR wrote about who changed it is for the back office only.
    view.pop("updated_by")
    return view


async def accept(conn: asyncpg.Connection, quote_id: UUID, user_id: UUID | None, name: str) -> bool:
    return await conn.fetchval(
        "select accept_own_quote($1, $2, $3)", quote_id, user_id, name
    )


async def create_first_quote(
    conn: asyncpg.Connection, business: Business, price_list: list[dict]
) -> None:
    """Draft a new client's first quote from the price list. `conn` is scoped to the
    business; the database publishes it at once if the client's price mode is automatic."""
    lines = draft_lines(price_list, [business])
    await conn.execute(
        "select create_own_quote($1::jsonb)",
        [
            {
                "for_business": x["business_id"] is not None, "item_key": x["item_key"],
                "name": x["name"], "name_ar": x["name_ar"], "kind": x["kind"],
                "quantity": x["quantity"], "unit_price": x["unit_price"], "sort": x["sort"],
            }
            for x in lines
        ],
    )


# ── the back office ───────────────────────────────────────
# Every function below needs a connection on which the API has declared the caller is
# ALYR staff (`app.platform_admin`); without it row-level security shows nothing.


def _client(row) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "contact_name": row["contact_name"],
        "contact_email": row["contact_email"], "contact_phone": row["contact_phone"],
        "note": row["note"], "price_mode": row["price_mode"],
        "created_at": row["created_at"].isoformat(),
    }


async def _businesses_of(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch("select * from admin_businesses()")


def _business(row, types: dict[str, dict]) -> dict:
    preset = presets.PRESET_BY_KEY.get(row["business_type"])
    way = row["onboarding_way"] or (preset.way if preset else "")
    return {
        "id": str(row["id"]), "name": row["name"], "slug": row["slug"],
        "type": row["business_type"],
        "type_name": preset.name.en if preset else "",
        "area": row["area"], "way": way, "modules": list(row["modules"]),
        # The products in use, counted as the workspace counts them.
        "products": [
            catalog.PRODUCT_BY_KEY[k].name.en for k in catalog.products_for(set(row["modules"]))
        ],
        "onboarding_step": row["onboarding_step"],
        "onboarded": row["onboarded_at"] is not None,
        "steps": list(presets.STEPS.get(way, ())),
        "whatsapp_connected": row["whatsapp_connected"],
        "open_requests": row["open_requests"], "members": row["members"],
        "created_at": row["created_at"].isoformat(),
        "price_mode": types.get(row["business_type"], {}).get("price_mode", "prepared"),
    }


async def clients(conn: asyncpg.Connection) -> list[dict]:
    """Every client with their businesses and where their price stands."""
    types = await type_settings(conn)
    businesses = await _businesses_of(conn)
    quotes = {
        r["client_id"]: r
        for r in await conn.fetch(
            "select distinct on (client_id) * from quotes where status <> 'withdrawn' "
            "order by client_id, (status in ('draft', 'published')) desc, number desc"
        )
    }
    out = []
    for row in await conn.fetch("select * from clients order by created_at desc"):
        mine = [_business(b, types) for b in businesses if b["client_id"] == row["id"]]
        quote = quotes.get(row["id"])
        summary = None
        if quote is not None:
            lines = await _lines(conn, quote["id"])
            summary = {
                "id": str(quote["id"]), "number": quote["number"], "status": quote["status"],
                "totals": totals(lines, quote["period_months"], quote["discount_pct"]),
            }
        out.append(_client(row) | {"businesses": mine, "quote": summary})
    return out


async def client(conn: asyncpg.Connection, client_id: UUID) -> dict:
    """One client: their details, businesses, every quote, and what a fresh draft from
    today's price list would contain."""
    row = await conn.fetchrow("select * from clients where id = $1", client_id)
    if row is None:
        raise PricingError("no such client")
    types = await type_settings(conn)
    businesses = [b for b in await _businesses_of(conn) if b["client_id"] == client_id]
    the_promise = await promise(conn)
    quotes = [
        await quote_view(conn, q, the_promise)
        for q in await conn.fetch(
            "select * from quotes where client_id = $1 order by number desc", client_id
        )
    ]
    price_list = await items(conn, only_active=True)
    fresh = draft_lines(price_list, [
        Business(b["id"], b["name"], frozenset(b["modules"])) for b in businesses
    ])
    names = {b["id"]: b["name"] for b in businesses}
    preview = [
        x | {"business_id": str(x["business_id"]) if x["business_id"] else None,
             "business": names.get(x["business_id"], "")}
        for x in fresh
    ]
    business_views = [_business(b, types) for b in businesses]
    mode = row["price_mode"] or (business_views[0]["price_mode"] if business_views else "prepared")
    return _client(row) | {
        "businesses": business_views, "quotes": quotes, "draft_preview": preview,
        "effective_price_mode": mode,
    }


async def save_client(
    conn: asyncpg.Connection, client_id: UUID, name: str, contact_name: str,
    contact_email: str, contact_phone: str, note: str, price_mode: str | None,
) -> None:
    if price_mode is not None and price_mode not in PRICE_MODES:
        raise PricingError("unknown price mode")
    if not name.strip():
        raise PricingError("give the client a name")
    done = await conn.execute(
        "update clients set name = $2, contact_name = $3, contact_email = $4, "
        "contact_phone = $5, note = $6, price_mode = $7 where id = $1",
        client_id, name.strip(), contact_name.strip(), contact_email.strip().lower(),
        contact_phone.strip(), note.strip(), price_mode,
    )
    if done == "UPDATE 0":
        raise PricingError("no such client")


async def new_quote(
    conn: asyncpg.Connection, client_id: UUID, start_from: str, by: str
) -> UUID:
    """A new draft for the client: from today's price list, or a copy of their latest
    quote. A client has one open quote at a time."""
    if not await conn.fetchval("select true from clients where id = $1", client_id):
        raise PricingError("no such client")
    if await conn.fetchval(
        "select true from quotes where client_id = $1 and status in ('draft', 'published')",
        client_id,
    ):
        raise PricingError("this client already has an open quote; edit it or withdraw it")
    number = await conn.fetchval(
        "select coalesce(max(number), 0) + 1 from quotes where client_id = $1", client_id
    )
    previous = await conn.fetchrow(
        "select * from quotes where client_id = $1 and status <> 'withdrawn' "
        "order by number desc limit 1", client_id,
    )
    if start_from == "copy" and previous is not None:
        terms = (previous["period_months"], previous["discount_pct"], previous["show_promise"],
                 previous["note"])
        lines = [
            {"business_id": UUID(x["business_id"]) if x["business_id"] else None,
             **{k: x[k] for k in ("item_key", "name", "name_ar", "kind", "quantity",
                                   "unit_price")}}
            for x in await _lines(conn, previous["id"])
        ]
    else:
        terms = (1, 0, True, "")
        businesses = [b for b in await _businesses_of(conn) if b["client_id"] == client_id]
        lines = draft_lines(await items(conn, only_active=True), [
            Business(b["id"], b["name"], frozenset(b["modules"])) for b in businesses
        ])
    quote_id = await conn.fetchval(
        "insert into quotes (client_id, number, period_months, discount_pct, show_promise, "
        "note, updated_by) values ($1, $2, $3, $4, $5, $6, $7) returning id",
        client_id, number, *terms, by,
    )
    await _write_lines(conn, quote_id, client_id, lines)
    return quote_id


async def _write_lines(
    conn: asyncpg.Connection, quote_id: UUID, client_id: UUID, lines: list[dict]
) -> None:
    own = {
        r["id"] for r in await conn.fetch("select id from tenants where client_id = $1", client_id)
    }
    for sort, x in enumerate(lines):
        business_id = x.get("business_id")
        if business_id is not None and business_id not in own:
            raise PricingError("a line is for a business that is not this client's")
        if x["kind"] not in KINDS:
            raise PricingError("a line is monthly or one-time")
        if not str(x["name"]).strip():
            raise PricingError("every line needs a name")
        await conn.execute(
            "insert into quote_lines (quote_id, business_id, item_key, name, name_ar, kind, "
            "quantity, unit_price, sort) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            quote_id, business_id, x.get("item_key"), str(x["name"]).strip(),
            str(x.get("name_ar") or "").strip(), x["kind"], x["quantity"], x["unit_price"], sort,
        )


async def _open_quote(conn: asyncpg.Connection, quote_id: UUID):
    row = await conn.fetchrow("select * from quotes where id = $1 for update", quote_id)
    if row is None:
        raise PricingError("no such quote")
    if row["status"] not in ("draft", "published"):
        raise PricingError(f"this quote is {row['status']}; make a new one to change the price")
    return row


async def save_quote(
    conn: asyncpg.Connection, quote_id: UUID, period_months: int, discount_pct: int,
    show_promise: bool, note: str, lines: list[dict], by: str,
) -> None:
    """Replace a draft or published quote's terms and lines. A published quote changes
    on the owner's screen as soon as this is saved."""
    row = await _open_quote(conn, quote_id)
    if period_months not in PERIODS:
        raise PricingError("the client pays every 1, 3, 6 or 12 months")
    if not 0 <= discount_pct <= 100:
        raise PricingError("the discount is between 0 and 100%")
    await conn.execute("delete from quote_lines where quote_id = $1", quote_id)
    await _write_lines(conn, quote_id, row["client_id"], lines)
    await conn.execute(
        "update quotes set period_months = $2, discount_pct = $3, show_promise = $4, "
        "note = $5, updated_at = now(), updated_by = $6 where id = $1",
        quote_id, period_months, discount_pct, show_promise, note.strip(), by,
    )


async def set_quote_status(conn: asyncpg.Connection, quote_id: UUID, action: str, by: str) -> str:
    """publish (the owner sees it), unpublish (back to a draft) or withdraw (drop it)."""
    row = await _open_quote(conn, quote_id)
    target = {"publish": "published", "unpublish": "draft", "withdraw": "withdrawn"}.get(action)
    if target is None:
        raise PricingError("unknown action")
    if target == "published" and not await conn.fetchval(
        "select true from quote_lines where quote_id = $1", quote_id
    ):
        raise PricingError("add at least one line before publishing")
    if row["status"] != target:
        await conn.execute(
            "update quotes set status = $2, updated_at = now(), updated_by = $3, "
            "published_at = case when $2 = 'published' then now() else published_at end "
            "where id = $1",
            quote_id, target, by,
        )
    return target
