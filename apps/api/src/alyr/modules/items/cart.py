"""The checkout's questions: can each line of this cart be ordered, as asked, at this price?

`check` looks at every line and says what is wrong with each, so a customer whose last
item has just sold keeps the rest of the cart and is told exactly what is left. It changes
nothing: placing the order (`modules/orders/service.py`) checks the cart again, then takes
the stock in one step, and it is that step, not this look, that stops the last item
selling twice.

For every line, in this order: is the item for sale at all, does its schedule allow an
order (and for the date asked), which size or colour, which choices, is the quantity
allowed, is there enough, and is the price still what the customer saw.
"""

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

import asyncpg

from alyr.core.normalise import fmt_qar
from alyr.modules.items import availability, text
from alyr.modules.items import service as items
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.stock import Take

# What can be fixed by looking for something else, so alternatives are worth offering.
OFFER_ALTERNATIVES = ("unavailable", "sold_out", "not_enough", "not_now", "closed")
SCHEDULE_CODES = ("not_now", "closed", "after_cutoff", "not_that_day", "past")
MAX_ALTERNATIVES = 3


@dataclass(frozen=True)
class CartLine:
    item_id: UUID
    quantity: int
    variant_id: UUID | None = None
    option_ids: tuple[UUID, ...] = ()
    # The price of one the customer was shown (variant and choices included, dirhams).
    expected_price: int | None = None


@dataclass
class Checked:
    """The verdict on one cart line. When `ok`, everything an order needs is here."""

    index: int
    line: CartLine
    ok: bool = True
    code: str = ""
    # What the sentence for `code` is built from, with real dates and times.
    words: dict = field(default_factory=dict)
    # The same, safe to send as JSON.
    data: dict = field(default_factory=dict)
    entry: items.Loaded | None = None
    variant: dict | None = None
    options: list[dict] = field(default_factory=list)
    unit_price: int = 0
    day: date | None = None
    fulfil_on: date | None = None
    take: Take | None = None


def _label(entry: items.Loaded, variant: dict | None) -> tuple[str, str]:
    """The item and its variant as one name, in English and in Arabic."""
    item = entry.item
    en, ar = item["name"], item["name_ar"] or item["name"]
    if variant is not None and variant["name"]:
        en += f" ({variant['name']})"
        ar += f" ({variant['name_ar'] or variant['name']})"
    return en, ar


def _problem(
    c: Checked, code: str, entry: items.Loaded | None, variant: dict | None = None, **more
) -> Checked:
    c.ok, c.code = False, code
    if entry is not None:
        c.words["name"], c.words["name_ar"] = _label(entry, variant)
    for key, value in more.items():
        c.words[key] = value
        c.data[key] = value.isoformat() if hasattr(value, "isoformat") else value
    return c


async def check(
    conn: asyncpg.Connection, clock: ShopClock, lines: list[CartLine],
    for_date: date | None = None,
) -> list[Checked]:
    """Look at every line of a cart. Nothing is changed."""
    wanted = list({line.item_id for line in lines})
    found = {
        e.item["id"]: e
        for e in await items.load(conn, clock, "i.id = any($1)", (wanted,))
    }
    asked: dict[tuple[UUID, date | None], int] = {}
    return [
        _check_line(n, line, found.get(line.item_id), clock, for_date, asked)
        for n, line in enumerate(lines)
    ]


def _check_line(
    n: int, line: CartLine, entry: items.Loaded | None, clock: ShopClock,
    for_date: date | None, asked: dict,
) -> Checked:
    c = Checked(n, line, entry=entry)
    if entry is None:
        return _problem(c, "unavailable", None)
    item = entry.item
    if not 1 <= line.quantity <= items.MAX_QUANTITY:
        return _problem(c, "bad_quantity", entry)
    state = entry.state(clock, for_date)
    if state.reason in ("hidden", "off"):
        return _problem(c, "unavailable", entry)
    if state.reason in SCHEDULE_CODES:
        return _problem(
            c, state.reason, entry, next_at=state.next_at, next_date=state.next_date,
            for_date=for_date,
        )

    variants = entry.active_variants
    if line.variant_id is not None:
        variant = next((v for v in variants if v["id"] == line.variant_id), None)
        if variant is None:
            return _problem(c, "variant_unavailable", entry)
    elif len(variants) == 1:
        variant = variants[0]
    else:
        return _problem(c, "variant_required", entry)
    c.variant = variant

    chosen = _choices(c, entry, line)
    if chosen is None:
        return c  # _choices wrote the problem
    c.options = chosen

    if line.quantity < item["min_order"]:
        return _problem(c, "below_minimum", entry, variant, minimum=item["min_order"])

    c.fulfil_on = state.for_date if state.dated else None
    day = state.day
    if item["stock_rule"] in availability.STOCKED:
        key = (variant["id"], day)
        have = availability.variant_left(item, variant, entry.deltas, day) - asked.get(key, 0)
        if have < line.quantity:
            code = "sold_out" if have <= 0 else "not_enough"
            return _problem(
                c, code, entry, variant, left=max(have, 0), max_quantity=max(have, 0),
                requested=line.quantity,
            )
        asked[key] = asked.get(key, 0) + line.quantity
        c.take = Take(
            variant["id"], line.quantity,
            day if item["stock_rule"] == "daily_limit" else None, variant["daily_limit"],
        )
        c.day = day

    c.unit_price = availability.variant_price(item, variant, clock.now) + sum(
        o["price_delta"] for o in chosen
    )
    if line.expected_price is not None and line.expected_price != c.unit_price:
        return _problem(
            c, "price_changed", entry, variant, old=fmt_qar(line.expected_price),
            new=fmt_qar(c.unit_price), old_price=line.expected_price, new_price=c.unit_price,
        )
    return c


def _choices(c: Checked, entry: items.Loaded, line: CartLine) -> list[dict] | None:
    """The options the customer picked, checked against the item's groups. None if one
    is wrong (the problem is written on `c`)."""
    by_option = {
        o["id"]: (g, o) for g in entry.groups for o in g["options"] if o["active"]
    }
    picked: dict[UUID, list[dict]] = {}
    for option_id in dict.fromkeys(line.option_ids):
        if option_id not in by_option:
            _problem(c, "option_invalid", entry, c.variant)
            return None
        group, option = by_option[option_id]
        picked.setdefault(group["id"], []).append(option)
    chosen = []
    for group in entry.groups:
        mine = picked.get(group["id"], [])
        if group["required"] and not mine:
            _problem(
                c, "option_required", entry, c.variant, group=group["name"],
                group_ar=group["name_ar"] or group["name"], group_id=str(group["id"]),
            )
            return None
        if len(mine) > group["max_choices"]:
            _problem(
                c, "option_too_many", entry, c.variant, group=group["name"],
                group_ar=group["name_ar"] or group["name"], group_id=str(group["id"]),
                max=group["max_choices"],
            )
            return None
        for option in mine:
            chosen.append({
                "id": str(option["id"]), "group_id": str(group["id"]), "group": group["name"],
                "group_ar": group["name_ar"], "name": option["name"],
                "name_ar": option["name_ar"], "price_delta": option["price_delta"],
            })
    return chosen


# ---------------------------------------------------------------- alternatives

async def alternatives(
    conn: asyncpg.Connection, clock: ShopClock, c: Checked
) -> list[dict]:
    """Things to offer instead of a line that cannot be ordered: other sizes or colours of
    the same item that are in stock, then other items of its category that can be ordered
    now. At most three."""
    if c.entry is None:
        return []
    item = c.entry.item
    out = []
    for v in c.entry.active_variants if c.code in ("sold_out", "not_enough") else []:
        if c.variant is not None and v["id"] == c.variant["id"]:
            continue
        left = availability.variant_left(item, v, c.entry.deltas, clock.shop_day)
        if left is None or left >= c.line.quantity:
            out.append({
                "item_id": str(item["id"]), "variant_id": str(v["id"]),
                "name": f"{item['name']} ({v['name']})" if v["name"] else item["name"],
                "name_ar": item["name_ar"], "price": availability.variant_price(item, v, clock.now),
            })
    if len(out) < MAX_ALTERNATIVES:
        same = await items.load(
            conn, clock, "i.category = $1 and i.id <> $2 and i.status = 'live'",
            (item["category"], item["id"]),
        )
        for other in same:
            if len(out) >= MAX_ALTERNATIVES:
                break
            plain = len(other.active_variants) == 1 and not any(
                g["required"] for g in other.groups
            )
            if plain and other.state(clock).orderable:
                out.append({
                    "item_id": str(other.item["id"]), "variant_id": None,
                    "name": other.item["name"], "name_ar": other.item["name_ar"],
                    "price": availability.item_price(other.item, clock.now),
                })
    for entry in out:
        entry["price_text"] = fmt_qar(entry["price"])
    return out[:MAX_ALTERNATIVES]


# ------------------------------------------------------------------- reporting

def message(c: Checked, clock: ShopClock, lang: str) -> str:
    return text.say(c.code, lang, c.words, clock.today)


async def report(
    conn: asyncpg.Connection, clock: ShopClock, checked: list[Checked]
) -> list[dict]:
    """Every line of the cart as a screen can show it: what is wrong with it, in words in
    both languages, with the details to act on (what is left, the new price, the next day
    it can be ordered for) and things to offer instead."""
    out = []
    for c in checked:
        line = {
            "index": c.index, "item_id": str(c.line.item_id), "quantity": c.line.quantity,
            "variant_id": str(c.line.variant_id) if c.line.variant_id else None,
            "ok": c.ok,
        }
        if c.ok:
            line |= {
                "unit_price": c.unit_price, "unit_price_text": fmt_qar(c.unit_price),
                "line_total": c.unit_price * c.line.quantity,
                "line_total_text": fmt_qar(c.unit_price * c.line.quantity),
                "fulfil_on": c.fulfil_on.isoformat() if c.fulfil_on else None,
            }
        else:
            line |= {
                "code": c.code, "message": message(c, clock, "en"),
                "message_ar": message(c, clock, "ar"), **c.data,
            }
            if c.code in OFFER_ALTERNATIVES:
                line["alternatives"] = await alternatives(conn, clock, c)
        out.append(line)
    return out
