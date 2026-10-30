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
from alyr.config import get_settings
from alyr.core import paddle
from alyr.core.normalise import fmt_qar

AVAILABILITY = ("self_serve", "with_alyr", "hidden")
PRICE_MODES = ("automatic", "prepared")
PERIODS = (1, 3, 6, 12)
KINDS = ("monthly", "one_time")
APPLIES = re.compile(
    r"^(each_business|each_client|manual|extra_product|product:[a-z_]+|module:[a-z_]+)$"
)
# The price of each product a business uses beyond its first (D-035): the founder's
# combination pricing, QAR 449 for the first product and QAR 150 for each one added.
EXTRA_PRODUCT = "extra_product"
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
        if not presets.can_self_serve(preset) and availability == "self_serve":
            availability = "with_alyr"
        out[preset.key] = {
            "availability": availability,
            "price_mode": row["price_mode"] if row else "prepared",
            "can_self_serve": presets.can_self_serve(preset),
        }
    return out


def way_for(preset: presets.Preset, availability: str) -> str:
    """The onboarding path a new business of this type follows: the way of its own screens
    when the type is self-serve and they are built (D-063), else it is set up with ALYR."""
    if availability == "self_serve" and presets.can_self_serve(preset):
        return presets.self_serve_way(preset) or "assisted"
    return "assisted"


async def save_type(
    conn: asyncpg.Connection, key: str, availability: str, price_mode: str, by: str
) -> None:
    preset = presets.PRESET_BY_KEY.get(key)
    if preset is None:
        raise PricingError("unknown type of business")
    if availability not in AVAILABILITY or price_mode not in PRICE_MODES:
        raise PricingError("unknown setting")
    if availability == "self_serve" and not presets.can_self_serve(preset):
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
        # In US cents, for a card payment through Paddle (D-074). None: the peg.
        "price_usd": row["price_usd"],
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
    applies: str, active: bool, sort: int, by: str, price_usd: int | None = None,
    set_usd: bool = False,
) -> dict:
    """Add an item to the price list or change one. Quotes already made keep their
    own copy of the price, so this never changes what a client was offered. The dollar
    price (`price_usd`, US cents, None for the peg) changes only when `set_usd`."""
    if not ITEM_KEY.match(key):
        raise PricingError("the key may use a-z, 0-9 and underscores")
    if kind not in KINDS:
        raise PricingError("an item is monthly or one-time")
    if price < 0:
        raise PricingError("a price cannot be negative; use a discount line on the quote")
    if not name.strip():
        raise PricingError("give the item a name")
    if price_usd is not None and price_usd < 0:
        raise PricingError("a dollar price cannot be negative")
    _check_applies(applies)
    row = await conn.fetchrow(
        "insert into price_items (key, name, name_ar, kind, price, applies, active, sort, "
        "updated_at, updated_by, price_usd) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, case when $10 then $11::integer end) "
        "on conflict (key) do update set name = $2, name_ar = $3, kind = $4, price = $5, "
        "applies = $6, active = $7, sort = $8, updated_at = now(), updated_by = $9, "
        "price_usd = case when $10 then $11::integer else price_items.price_usd end "
        "returning *",
        key, name.strip(), name_ar.strip(), kind, price, applies, active, sort, by,
        set_usd, price_usd,
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


def _paid_product(item: dict) -> bool:
    """An item priced per product a business can switch on (not one that is included)."""
    kind, _, key = item["applies"].partition(":")
    product = catalog.PRODUCT_BY_KEY.get(key) if kind == "product" else None
    return product is not None and product.status == "available"


def draft_lines(price_list: list[dict], businesses: list[Business]) -> list[dict]:
    """The lines a quote starts from: every active item whose rule matches, for each
    business in turn, then the items charged once per client.

    Combination pricing (D-035): a business pays its first product at that product's own
    price and each further product at the "each extra product" price. The first is the
    dearest, so adding a product never costs more than the extra price. Without an
    active extra-product item every product is charged at its own price."""
    active = [
        i for i in price_list
        if i["active"] and i["applies"] not in ("manual", EXTRA_PRODUCT)
    ]
    extra = next(
        (i for i in price_list if i["active"] and i["applies"] == EXTRA_PRODUCT), None
    )
    lines: list[dict] = []

    def line(item: dict, business_id: UUID | None) -> dict:
        return {
            "business_id": business_id, "item_key": item["key"], "name": item["name"],
            "name_ar": item["name_ar"], "kind": item["kind"], "quantity": 1,
            "unit_price": item["price"],
        }

    for business in businesses:
        matched = [
            i for i in active
            if i["applies"] != "each_client" and _applies_to(i["applies"], business.modules)
        ]
        products = [i for i in matched if _paid_product(i) and i["kind"] == "monthly"]
        first = max(products, key=lambda i: (i["price"], -i["sort"]), default=None)
        for item in matched:
            entry = line(item, business.id)
            if extra is not None and item in products and item is not first:
                entry |= {
                    "name": f"{item['name']}, added product",
                    "name_ar": f"{item['name_ar']}، منتج إضافي",
                    "unit_price": extra["price"],
                }
            lines.append(entry)
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


def usd_totals(
    lines: list[dict], price_list: list[dict], period_months: int, discount_pct: int
) -> dict:
    """What a quote costs by card through Paddle, in US cents (D-074): the setup once
    (`one_time`) and each period (`period`), worked as `totals` works the riyals. A line at its
    item's list price takes the item's dollar price; a product added at the "each extra
    product" price takes that item's; any other line (priced by hand, or an item without a
    dollar price) its riyal price at the peg, rounded up to the cent."""
    by_key = {i["key"]: i for i in price_list}
    extra = next((i for i in price_list if i["applies"] == EXTRA_PRODUCT), None)

    def unit(line: dict) -> int:
        item = by_key.get(line["item_key"] or "")
        if item and item["price_usd"] is not None and line["unit_price"] == item["price"]:
            return item["price_usd"]
        if (
            item and extra and extra["price_usd"] is not None and _paid_product(item)
            and line["unit_price"] == extra["price"]
        ):
            return extra["price_usd"]
        return paddle.usd_cents(line["unit_price"])

    monthly = max(sum(x["quantity"] * unit(x) for x in lines if x["kind"] == "monthly"), 0)
    once = max(sum(x["quantity"] * unit(x) for x in lines if x["kind"] == "one_time"), 0)
    monthly_total = monthly - round(monthly * discount_pct / 100)
    return {"one_time": once, "period": monthly_total * period_months}


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


def together(lines: list[dict], list_prices: dict[str, int]) -> dict | None:
    """What a client saves by using their products together (D-053): the monthly price of
    their lines against the same products bought one by one at their own list price. Only a
    line charged below its own list price counts, so the figure is a real price ALYR charges
    and never an invented one. None when nothing is discounted."""
    monthly = [x for x in lines if x["kind"] == "monthly" and x["quantity"] == 1]
    alone = sum(max(list_prices.get(x["item_key"], 0), x["unit_price"]) for x in monthly)
    price = sum(x["unit_price"] for x in monthly)
    if alone <= price:
        return None
    out = {"alone": alone, "price": price, "saving": alone - price,
           "saving_pct": round((alone - price) * 100 / alone)}
    return out | {f"{k}_text": fmt_qar(out[k]) for k in ("alone", "price", "saving")}


async def quote_view(conn: asyncpg.Connection, row, the_promise: dict | None = None) -> dict:
    lines = await _lines(conn, row["id"])
    list_prices = {
        r["key"]: r["price"]
        for r in await conn.fetch("select key, price from price_items where kind = 'monthly'")
    }
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
        "together": together(lines, list_prices),
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


def prospect_business(row) -> Business | None:
    """The business a lead will become, for drafting its first quote before it exists (ALY-216):
    named as the client is, with the modules its type is created with. None for a client that
    is not a lead."""
    plan = row["prospect"]
    preset = presets.PRESET_BY_KEY.get((plan or {}).get("type"))
    if preset is None:
        return None
    modules = preset.modules_for(get_settings().catalog_for_new_shops)
    return Business(None, row["name"], frozenset(modules))


def _client(row) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "contact_name": row["contact_name"],
        "contact_email": row["contact_email"], "contact_phone": row["contact_phone"],
        "note": row["note"], "price_mode": row["price_mode"],
        # A lead's plan (the type of business, the Arabic name, the area); null for the rest.
        "prospect": row["prospect"],
        "created_at": row["created_at"].isoformat(),
        # Where the plan stood at the last hourly check (ALY-218): '' before the first.
        "billing_state": row["billing_state"],
        "cancels_on": row["cancels_on"].isoformat() if row["cancels_on"] else None,
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
    ] or [x for x in (prospect_business(row),) if x])
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
    row = await conn.fetchrow("select * from clients where id = $1", client_id)
    if row is None:
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
        # A lead has no business yet: its first quote is drafted for the one it will become, so
        # the owner sees the lines sign-up would have drafted (ALY-216).
        lines = draft_lines(await items(conn, only_active=True), [
            Business(b["id"], b["name"], frozenset(b["modules"])) for b in businesses
        ] or [x for x in (prospect_business(row),) if x])
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
