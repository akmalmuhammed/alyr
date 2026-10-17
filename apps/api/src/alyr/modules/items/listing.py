"""The Catalog list the workspace shows: search, the owner's filters, the counts on the
filter chips, and a page at a time (D-039, ALY-104).

Searching folds Arabic spellings (`text.fold`), so a customer-style «ارز» finds «أرز».
The filters are the ones an owner reaches for:

* `draft`: started from a photo or a form and not yet put on sale;
* `sold_out`: on sale, but switched off or with none left;
* `low_stock`: counted in stock, with a size at or below the shop's low-stock number;
* `stocked`: counted in stock or limited per day (what the Stock tab lists);
* `archived`: no longer sold, kept for its history.

Every function takes a tenant-scoped connection.
"""

import asyncpg

from alyr.modules.items import service, text
from alyr.modules.items.clock import ShopClock

FILTERS = ("draft", "sold_out", "low_stock", "stocked", "archived")
DEFAULT_LOW_STOCK = 5


def is_sold_out(view: dict) -> bool:
    return view["status"] == "live" and view["availability"]["reason"] in ("off", "sold_out")


def is_low(view: dict, low_at: int) -> bool:
    """Counted in stock, and at least one size is at or below the low-stock number but not
    gone (an item with nothing left is sold out, not low)."""
    if view["status"] not in ("live", "hidden") or view["stock_rule"] != "count":
        return False
    return any(0 < v["on_hand"] <= low_at for v in view["variants"] if v["active"])


def is_stocked(view: dict) -> bool:
    return view["status"] != "archived" and view["stock_rule"] in ("count", "daily_limit")


def kinds_of(view: dict, low_at: int) -> set[str]:
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
    parts = [view["name"], view["name_ar"], view["category"], " ".join(view["tags"])]
    for variant in view["variants"]:
        parts += [variant["name"], variant["name_ar"]]
    return parts


async def low_stock_at(conn: asyncpg.Connection) -> int:
    value = await conn.fetchval("select low_stock_at from shop_settings")
    return DEFAULT_LOW_STOCK if value is None else value


async def page(
    conn: asyncpg.Connection, clock: ShopClock, *, status: str | None = None, q: str = "",
    category: str | None = None, only: str | None = None, include_archived: bool = False,
    limit: int | None = None, offset: int = 0,
) -> dict:
    """Items for the list: `items` (views, in menu order), `total` after the filters, and
    `counts` for the chips (over the whole catalog, whatever is filtered now)."""
    entries = await service.load(conn, clock)
    low_at = await low_stock_at(conn)
    views = [service.view(e, clock) for e in entries]
    counts = {"all": 0, **{name: 0 for name in FILTERS}}
    for view in views:
        kinds = kinds_of(view, low_at)
        if view["status"] != "archived":
            counts["all"] += 1
        for kind in kinds:
            counts[kind] += 1

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
        shown = [v for v in shown if text.matches(words, *_haystack(v))]
    total = len(shown)
    if limit is not None:
        shown = shown[offset: offset + limit]
    return {"items": shown, "total": total, "counts": counts, "low_stock_at": low_at}
