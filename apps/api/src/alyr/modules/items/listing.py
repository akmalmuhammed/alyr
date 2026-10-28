"""The Catalog list the workspace shows: search, the owner's filters, the counts on the
filter chips, and a page at a time (D-039, ALY-104).

Searching folds Arabic spellings (`text.fold`), so a customer-style «ارز» finds «أرز».
The filters are the ones an owner reaches for:

* `draft`: started from a photo or a form and not yet put on sale;
* `sold_out`: on sale, but switched off or with none left;
* `low_stock`: counted in stock, with a size at or below the shop's low-stock number;
* `stocked`: counted in stock or limited per day (what the Stock tab lists);
* `archived`: no longer sold, kept for its history;
* `sample`: an example the shop's type started it with (`samples.py`). A sample is in no
  other filter, so the drafts waiting for a name and a price are the owner's own.

Every function takes a tenant-scoped connection.
"""

import asyncpg

from alyr.modules.items import fields, service, text
from alyr.modules.items.clock import ShopClock

FILTERS = ("draft", "sold_out", "low_stock", "stocked", "archived", "sample")
DEFAULT_LOW_STOCK = 5


def is_sold_out(view: dict) -> bool:
    return view["status"] == "live" and view["availability"]["reason"] in ("off", "sold_out")


def low_at_for(view: dict, shop_low: int) -> int:
    """The number at which this item counts as low: its own, if the owner set one, else the
    shop's."""
    own = view.get("low_stock_at")
    return shop_low if own is None else own


def is_low(view: dict, low_at: int) -> bool:
    """Counted in stock, and at least one size is at or below the low-stock number but not
    gone (an item with nothing left is sold out, not low). `low_at` is the shop's number;
    an item's own number, when it has one, wins."""
    if view["status"] not in ("live", "hidden") or view["stock_rule"] != "count":
        return False
    limit = low_at_for(view, low_at)
    return any(0 < v["on_hand"] <= limit for v in view["variants"] if v["active"])


def is_stocked(view: dict) -> bool:
    return view["status"] != "archived" and view["stock_rule"] in ("count", "daily_limit")


def kinds_of(view: dict, low_at: int) -> set[str]:
    if view["sample"]:
        return {"sample"}
    found = set()
    if view["status"] == "draft":
        found.add("draft")
    if view["status"] == "archived":
        found.add("archived")
    if is_sold_out(view):
        found.add("sold_out")
    if is_low(view, low_at):
        found.add("low_stock")
    if is_stocked(view):
        found.add("stocked")
    return found


def _haystack(view: dict) -> list[str]:
    parts = [
        view["name"], view["name_ar"], view["sku"], str(view["code"] or ""), view["category"],
        " ".join(view["tags"]),
    ]
    for variant in view["variants"]:
        parts += [variant["name"], variant["name_ar"], variant["sku"]]
    return parts


async def low_stock_at(conn: asyncpg.Connection) -> int:
    value = await conn.fetchval("select low_stock_at from shop_settings")
    return DEFAULT_LOW_STOCK if value is None else value


def tally(views: list[dict], low_at: int) -> dict:
    """How many items each filter chip holds, over the whole catalog. `all` leaves out the
    archived, as the list does."""
    chips = {"all": 0, **{name: 0 for name in FILTERS}}
    for view in views:
        if view["status"] != "archived":
            chips["all"] += 1
        for kind in kinds_of(view, low_at):
            chips[kind] += 1
    return chips


async def read(conn: asyncpg.Connection, clock: ShopClock) -> tuple[list[dict], int]:
    """Every item as the list sees it, and the shop's low-stock number."""
    entries = await service.load(conn, clock)
    return [service.view(e, clock) for e in entries], await low_stock_at(conn)


async def counts(conn: asyncpg.Connection, clock: ShopClock) -> dict:
    """The numbers on the filter chips. The home cards (sold out now, low stock) and the
    weekly report read these, so a number on the home screen is the number of rows in the
    list it opens."""
    views, low_at = await read(conn, clock)
    return tally(views, low_at)


def lowest_left(view: dict, low_at: int) -> int:
    """For an item that `is_low`: the least left of any of its sizes that is low."""
    limit = low_at_for(view, low_at)
    return min(v["on_hand"] for v in view["variants"] if v["active"] and 0 < v["on_hand"] <= limit)


async def low_items(conn: asyncpg.Connection, clock: ShopClock) -> list[dict]:
    """The items the Low stock filter holds, the lowest first, each with `left`."""
    views, low_at = await read(conn, clock)
    low = [
        {"name": v["name"], "name_ar": v["name_ar"], "left": lowest_left(v, low_at),
         # (only for something sold in fractions: a stored report keeps its old shape)
         **({"unit": v["unit"], "show_unit": True} if v["quantity"]["show_unit"] else {})}
        for v in views if is_low(v, low_at)
    ]
    return sorted(low, key=lambda row: (row["left"], row["name"]))


async def page(
    conn: asyncpg.Connection, clock: ShopClock, *, status: str | None = None, q: str = "",
    category: str | None = None, only: str | None = None, include_archived: bool = False,
    limit: int | None = None, offset: int = 0,
) -> dict:
    """Items for the list: `items` (views, in menu order), `total` after the filters, and
    `counts` for the chips (over the whole catalog, whatever is filtered now)."""
    views, low_at = await read(conn, clock)
    chips = tally(views, low_at)

    shown = views
    if status:
        shown = [v for v in shown if v["status"] == status]
    elif only == "archived":
        shown = [v for v in shown if v["status"] == "archived"]
    elif not include_archived:
        shown = [v for v in shown if v["status"] != "archived"]
    if only and only != "archived":
        shown = [v for v in shown if only in kinds_of(v, low_at)]
    if category is not None:
        shown = [v for v in shown if v["category"] == category]
    words = text.search_words(q)
    if words:
        # What the owner's searchable fields hold is searched too (ALY-148).
        defs = [f for f in await fields.rows(conn, False) if f["searchable"]]
        shown = [
            v for v in shown
            if text.matches(
                words, *_haystack(v), *fields.search_text(defs, v["custom"], v["variants"])
            )
        ]
    total = len(shown)
    if limit is not None:
        shown = shown[offset: offset + limit]
    return {"items": shown, "total": total, "counts": chips, "low_stock_at": low_at}
