"""What the customer's order page reads (ALY-112, D-039; `specs/005-order-page-v2/spec.md`).

`GET /api/store/{slug}` and its companions return the shop's items as a customer should
see them: in the owner's category order, with the customer's own prices, a photo, plain
words for when each can be ordered, and only as much of the stock as is safe to tell.

* **Stock is not published.** "Only 3 left" is shown when it is true and small (at or below
  the shop's low-stock number); above that the page only knows the item is in stock. The
  exact count would tell a competitor the shop's stock, and the checkout says what is left
  at the moment it matters.
* **A page at a time.** A shop may have a thousand items; the first screen carries the
  first page and the page asks for more. A search or a category chip asks the API, which
  folds Arabic spellings the same way the workspace does.
* **Sold-out items** are listed (greyed) or left out, as the shop chose. Items outside their
  hours are always listed with the time they come back: the customer should know.

Every function takes a tenant-scoped connection.
"""

from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.core.media import MediaService
from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.modules.items import (
    availability,
    features,
    fields,
    listing,
    notes,
    photos,
    qty,
    schedule,
    text,
)
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import groups as price_groups
from alyr.modules.items import service as items
from alyr.modules.items.clock import ShopClock
from alyr.modules.orders import pay_ways, service

DEFAULT_PAGE = 48
MAX_PAGE = 200
SOLD_OUT_REASONS = ("off", "sold_out")


async def settings(conn: asyncpg.Connection, feats: features.Features | None = None) -> dict:
    row = await conn.fetchrow(
        "select wholesale_layout, whatsapp_number, whatsapp_mode, low_stock_at from shop_settings"
    )
    feats = feats or await features.load(conn)
    return {
        # How a sold-out item looks is the shop's "Sold-out items" feature (ALY-148).
        "sold_out_display": feats.sold_out_mode,
        "tags": feats.on("tags"),
        # The owner's own fields customers may see (a feature, ALY-148).
        "fields": [f for f in await fields.rows(conn, False) if f["shown_to_customers"]]
        if feats.on("custom_fields") else [],
        "wholesale_layout": row["wholesale_layout"] if row else False,
        # The customer's "Order on WhatsApp" is a feature (ALY-148): with it off the page is
        # told there is no number to send to.
        "whatsapp_number": (
            (row["whatsapp_number"] if row else "") if feats.on("order_on_whatsapp") else ""
        ),
        "whatsapp_mode": row["whatsapp_mode"] if row else "link",
        "low_stock_at": row["low_stock_at"] if row else listing.DEFAULT_LOW_STOCK,
    }


def _small(count: "qty.Qty | None", low_at: "qty.Qty") -> "qty.Qty | None":
    """A count worth telling the customer: more than none, no more than the low-stock number."""
    return count if count is not None and 0 < count <= low_at else None


def _list_price(
    item: dict, variant: dict, now: datetime, from_group: bool, normal: int, price: int
) -> int | None:
    """What to show crossed out beside a size's price: the usual price during a sale, or the
    normal price when the customer's group pays less."""
    if from_group:
        return normal if normal > price else None
    if availability.sale_active(item, now):
        return item["price"] + variant["price_delta"]
    return None


def _photo(shown: dict) -> dict:
    """A photo as the order page draws it: its box, the file for the list (320 px) and every
    size for `srcset`. Anything not ready is just its state, and the page draws a tile."""
    if shown["state"] != "ready":
        return {"state": shown["state"], "w": None, "h": None, "src": "", "srcset": ""}
    return {
        "state": "ready", "w": shown["width"], "h": shown["height"],
        "src": shown["urls"]["thumb"], "srcset": shown["srcset"],
        # The 800 px file: what a link's preview shows.
        "medium": shown["urls"]["medium"],
    }


def public_row(
    entry: items.Loaded, state: availability.State, clock: ShopClock, group_id: UUID | None,
    low_at: int, shown_fields: list[dict] | None = None,
) -> dict:
    """One item as the order page lists it."""
    i = entry.item
    base = service._row(entry, state, clock, group_id)
    sold_out = state.reason in SOLD_OUT_REASONS
    named = [v for v in entry.active_variants if not v["is_default"]]
    row = {
        "id": base["id"], "name": i["name"], "name_ar": i["name_ar"], "sku": i["sku"],
        # The item's short number (ALY-136): what a customer sends in the chat.
        "code": i["code"],
        "category": i["category"], "description": i["description"],
        "description_ar": i["description_ar"], "unit": i["unit"], "pack_size": i["pack_size"],
        "min_order": i["min_order"], "tags": list(i["tags"]),
        # How much can be ordered at a time (ALY-149): sold by weight or volume, the step, the
        # smallest order and the quick quantities of a fractional item.
        "quantity": qty.rules(i["unit"], i["pack_size"], i["min_order"]),
        # `price` is what this customer pays for the item (spec 003); an item with sizes shows
        # the dearest and the cheapest of them, both written out (`price_min`, `price_max`).
        "price": base["price"], "price_text": base["price_text"],
        "price_min": base["price"], "price_max": None, "list_price": base["list_price"],
        "price_source": base["price_source"],
        "orderable": state.orderable, "sold_out": sold_out, "reason": state.reason,
        "note": notes.note(entry, state, clock),
        # Only a small count is told, and "none left" is the same as sold out.
        "left": _small(state.left, low_at) if state.orderable else (
            0 if state.reason == "sold_out" else None
        ),
        # "Only 3 left today" for a daily limit, "only 3 left" for a count.
        "daily": i["stock_rule"] == "daily_limit",
        "needs_choice": len(named) > 1 or any(g["required"] for g in entry.groups),
        "option_groups": [
            {
                "id": g["id"], "name": g["name"], "name_ar": g["name_ar"],
                "required": g["required"], "max_choices": g["max_choices"],
                "options": [
                    {key: o[key] for key in ("id", "name", "name_ar", "price_delta",
                                             "price_delta_text")}
                    for o in g["options"]
                ],
            }
            for g in base.get("option_groups", [])
        ],
        "variants": [],
        # The owner's own fields customers may see, for the item (ALY-148).
        "fields": fields.shown_to_customers(
            [f for f in shown_fields or [] if f["applies_to"] == "item"], i["custom"]),
    }
    if "normal_price" in base:
        row["normal_price"], row["normal_price_text"] = (
            base["normal_price"], base["normal_price_text"]
        )
    if "next_at" in base:  # when it can be ordered again, for an item outside its hours
        row["next_at"], row["next_date"] = base["next_at"], base["next_date"]
    if state.dated and state.orderable:
        row["order_for_dates"] = notes.dates_for(
            schedule.orderable_dates(entry.windows, clock.local), clock.today
        )
    # A sale or a group price is shown beside the price it replaces.
    if named:
        prices = []
        for v in named:
            price, from_group = availability.group_variant_price(
                i, v, clock.now, entry.group_prices, group_id
            )
            normal = availability.variant_price(i, v, clock.now)
            left = availability.variant_left(i, v, entry.deltas, state.day)
            prices.append(price)
            shown = {
                "id": str(v["id"]), "name": v["name"], "name_ar": v["name_ar"], "sku": v["sku"],
                "price": price, "price_text": fmt_qar(price),
                "price_source": "group" if from_group else "normal",
                "list_price": _list_price(i, v, clock.now, from_group, normal, price),
                "left": _small(left, low_at) if left else (0 if left == 0 else None),
                "sold_out": left is not None and left <= 0,
                "fields": fields.shown_to_customers(
                    [f for f in shown_fields or [] if f["applies_to"] == "variant"], None,
                    v["custom"]),
            }
            if from_group:
                shown["normal_price"], shown["normal_price_text"] = normal, fmt_qar(normal)
            row["variants"].append(shown)
        lowest, highest = min(prices), max(prices)
        row["price_min"] = lowest
        # Two ends of a range are two prices, both written out; never "from".
        row["price_max"] = highest if highest != lowest else None
    return row


def _sort_key(order: dict[str, int]):
    def key(entry: items.Loaded):
        i = entry.item
        return (order.get(i["category"], 10**6), i["sort"], i["name"].lower(), i["created_at"])
    return key


def _haystack(row: dict, category_ar: str) -> list[str]:
    parts = [
        row["name"], row["name_ar"], row["description"], row["description_ar"], row["sku"],
        str(row["code"] or ""), row["category"], category_ar, " ".join(row["tags"]),
    ]
    for variant in row["variants"]:
        parts += [variant["name"], variant["name_ar"], variant["sku"]]
        parts += _field_words(variant.get("fields", []))
    return parts + _field_words(row.get("fields", []))


def _field_words(shown: list[dict]) -> list[str]:
    """What the owner's searchable fields say, in both languages, for the customer's search."""
    return [x[k] for x in shown if x["searchable"] for k in ("text", "text_ar")]


async def _with_photos(
    conn: asyncpg.Connection, media: MediaService, rows: list[dict], full: bool
) -> None:
    """Put each row's photo on it: the cover for a list, every photo for one item's page."""
    if not rows:
        return
    ids = [UUID(r["id"]) for r in rows]
    by_item = await media.photos_for(conn, photos.ITEM, ids)
    variant_ids = [UUID(v["id"]) for r in rows for v in r["variants"]]
    by_variant = await media.photos_for(conn, photos.VARIANT, variant_ids) if variant_ids else {}
    for row in rows:
        shown = by_item[UUID(row["id"])]
        row["cover"] = _photo(shown[0]) if shown else _photo(dict(photos.MISSING))
        row["photo_count"] = sum(1 for p in shown if p["state"] == "ready")
        if full:
            row["photos"] = [_photo(p) for p in shown if p["state"] == "ready"]
        for variant in row["variants"]:
            mine = by_variant.get(UUID(variant["id"]), [])
            variant["photo"] = _photo(mine[0]) if mine else None


async def _visible(
    conn: asyncpg.Connection, clock: ShopClock, contact_id: UUID | None, only: UUID | None = None,
    feats: features.Features | None = None, group: dict | None = None,
) -> tuple[list[tuple[items.Loaded, availability.State]], dict, dict]:
    """The live items a customer may see, in menu order, with their states; the customer's
    price group; and the shop's order-page choices. A caller that has read the shop's
    features or the customer's group already passes them in."""
    shop = await settings(conn, feats)
    group = group or await price_groups.group_of(conn, contact_id)
    where, args = ("i.status = 'live'", ()) if only is None else (
        "i.status = 'live' and i.id = $1", (only,)
    )
    entries = await items.load(conn, clock, where, args)
    categories = await items.categories(conn)
    order = {c["name"]: n for n, c in enumerate(categories)}
    entries.sort(key=_sort_key(order))
    kept = []
    for entry in entries:
        state = entry.state(clock)
        # A switched-off item is "sold out" to the customer. Whether they see it is the
        # shop's choice; one outside its hours is always listed, with when it is back.
        if state.reason in SOLD_OUT_REASONS and shop["sold_out_display"] == "hide":
            continue
        kept.append((entry, state))
    return kept, {"group": group, "categories": categories}, shop


async def page(
    conn: asyncpg.Connection, media: MediaService, contact_id: UUID | None = None, *,
    q: str = "", category: str | None = None, offset: int = 0, limit: int | None = None,
    now: datetime | None = None, feats: features.Features | None = None,
    group: dict | None = None,
) -> dict:
    """The order page's data: the shop's choices, its categories with counts, the customer's
    price group, and one page of items (all of them when `limit` is None)."""
    clock = await shop_clock.load(conn, now)
    kept, context, shop = await _visible(conn, clock, contact_id, feats=feats, group=group)
    group_id = price_groups.pricing_id(context["group"])
    low_at = shop["low_stock_at"]

    def made(entry: items.Loaded, state: availability.State) -> dict:
        row = public_row(entry, state, clock, group_id, low_at, shop["fields"])
        if not shop["tags"]:  # the shop switched tags off: customers neither see nor search them
            row["tags"] = []
        return row

    names_ar = {c["name"]: c["name_ar"] for c in context["categories"]}
    counts: dict[str, int] = {}
    for entry, _ in kept:
        counts[entry.item["category"]] = counts.get(entry.item["category"], 0) + 1
    shown = [{"name": name, "name_ar": names_ar.get(name, ""), "count": n}
             for name, n in counts.items()]

    if category is not None:
        kept = [(entry, state) for entry, state in kept if entry.item["category"] == category]
    words = text.search_words(q)
    if words:
        # A search reads every item's words, so every item's row is made.
        rows = [
            row for row in (made(entry, state) for entry, state in kept)
            if text.matches(words, *_haystack(row, names_ar.get(row["category"], "")))
        ]
        total = len(rows)
        if limit is not None:
            rows = rows[offset: offset + min(limit, MAX_PAGE)]
    else:
        # Only the page's rows are made (ALY-276): a shop of 200 items made 200 to send 48.
        total = len(kept)
        if limit is not None:
            kept = kept[offset: offset + min(limit, MAX_PAGE)]
        rows = [made(entry, state) for entry, state in kept]
    await _with_photos(conn, media, rows, full=False)
    return {
        "group": price_groups.public(context["group"]),
        "settings": {
            "sold_out_display": shop["sold_out_display"],
            "wholesale_layout": shop["wholesale_layout"],
            "whatsapp_number": shop["whatsapp_number"],
            "whatsapp_mode": shop["whatsapp_mode"],
            # How customers pay: online, or on collection by these ways (ALY-170).
            "pay": await pay_ways.get(conn),
        },
        "categories": shown,
        "items": rows,
        "total": total,
        "offset": offset,
    }


async def one(
    conn: asyncpg.Connection, media: MediaService, item_id: UUID, contact_id: UUID | None = None,
    now: datetime | None = None,
) -> dict | None:
    """One item with every photo, for its sheet and its share link. None if the customer
    may not see it (not live, or sold out and the shop leaves such items out)."""
    clock = await shop_clock.load(conn, now)
    kept, context, shop = await _visible(conn, clock, contact_id, only=item_id)
    if not kept:
        return None
    entry, state = kept[0]
    row = public_row(entry, state, clock, price_groups.pricing_id(context["group"]),
                     shop["low_stock_at"], shop["fields"])
    if not shop["tags"]:
        row["tags"] = []
    await _with_photos(conn, media, [row], full=True)
    return row


async def live(
    conn: asyncpg.Connection, ids: list[UUID], contact_id: UUID | None = None,
    now: datetime | None = None,
) -> dict:
    """The few things that change while a customer looks: can it be ordered, what is left,
    the price. `gone` names items that are no longer on the page at all."""
    clock = await shop_clock.load(conn, now)
    shop = await settings(conn)
    group = await price_groups.group_of(conn, contact_id)
    group_id = price_groups.pricing_id(group)
    entries = {
        e.item["id"]: e
        for e in await items.load(conn, clock, "i.status = 'live' and i.id = any($1)", (ids,))
    }
    rows, gone = [], []
    for item_id in ids:
        entry = entries.get(item_id)
        if entry is None:
            gone.append(str(item_id))
            continue
        state = entry.state(clock)
        if state.reason in SOLD_OUT_REASONS and shop["sold_out_display"] == "hide":
            gone.append(str(item_id))
            continue
        full = public_row(entry, state, clock, group_id, shop["low_stock_at"], shop["fields"])
        rows.append({
            key: full[key] for key in (
                "id", "orderable", "sold_out", "reason", "note", "left", "price", "price_min",
                "price_max", "list_price", "price_source",
            )
        } | {
            "variants": [
                {key: v[key] for key in ("id", "price", "list_price", "left", "sold_out")}
                for v in full["variants"]
            ],
            "order_for_dates": full.get("order_for_dates"),
        })
    return {"items": rows, "gone": gone, "group": price_groups.public(group),
            "sold_out_display": shop["sold_out_display"]}


def price_words(dirhams: int) -> dict:
    """A price in both languages, as the share preview and the page's text write it."""
    return {"en": fmt_qar(dirhams), "ar": fmt_qar_ar(dirhams)}
