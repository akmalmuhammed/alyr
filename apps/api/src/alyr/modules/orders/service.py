"""Order link: a customer orders from a shop's page and pays by link or on account.

An order is only placed once its cart has been checked against the catalog (is each item
for sale now, is there enough, is it still the price the customer saw) and the stock has
been taken in one step (`modules/items/stock.py`), so the last item sells once. A pay-link
order holds its stock for the shop's hold time; see `holds.py`.

Every function takes a tenant-scoped connection.
"""

from datetime import date, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg

from alyr.core import identity, jobs, team, templates
from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.core.outbound import Outbound
from alyr.core.team import Actor
from alyr.modules.documents import sales as documents_sales
from alyr.modules.items import (
    alerts,
    availability,
    cart,
    clock,
    costs,
    delivery,
    delivery_text,
    demand,
    discount_text,
    discounts,
    features,
    fields,
    qty,
    stock,
    text,
)
from alyr.modules.items import groups as price_groups
from alyr.modules.items import holds as stock_holds
from alyr.modules.items.cart import CartLine
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.service import MAX_QUANTITY
from alyr.modules.items.service import load as load_items
from alyr.modules.ledger import service as ledger
from alyr.modules.orders import pay_ways, totals

STATUSES = ("new", "confirmed", "ready", "done", "cancelled")
# The job that gives back the stock of an order nobody paid for.
EXPIRE_JOB = "stock_hold_expiry"
# How many unpaid pay-link orders may hold stock for one customer at a time.
MAX_UNPAID_HOLDS = 3


def track_url(web_url: str, tenant_id: UUID, order_id: UUID) -> str:
    """The customer's own page for one order. Like a payment link, it carries the shop's
    ID because the customer is not signed in, and the order's ID, which cannot be guessed."""
    return f"{web_url}/t/{tenant_id}/{order_id}"


def _track_line(url: str, arabic: bool) -> str:
    return f"تتبّع طلبك: {url}" if arabic else f"Track your order: {url}"


class OrderError(Exception):
    """The order cannot be placed as asked. `code` tells the caller why; `lines` says what
    is wrong with each line of the cart when the cart is the problem."""

    def __init__(
        self, code: str, message: str, message_ar: str = "", lines: list[dict] | None = None,
        extra: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message_ar = message_ar or message
        self.lines = lines
        # More for the screen to act on: the priced cart when the total moved, the code that
        # failed (ALY-150). Sent beside `lines`.
        self.extra = extra


def _plain(code: str, **details) -> OrderError:
    """A refusal that is not about one item, worded in both languages (`items/text.py`)."""
    return OrderError(code, text.say(code, "en", details), text.say(code, "ar", details))


def _row(
    entry, state: availability.State, shop_clock: ShopClock, group_id: UUID | None = None
) -> dict:
    """An item as the order page lists it. `id`, `name`, `name_ar`, `category`, `price` and
    `price_text` are what the first order page read; the rest is for the page that follows.
    `group_id` is the customer's price group (None: the default group, the normal price):
    `price` is what that customer pays, `price_source` says whether the group set it, and
    for a group price `normal_price` is what the default group pays."""
    i = entry.item
    now = shop_clock.now
    price, from_group = availability.group_item_price(i, now, entry.group_prices, group_id)
    normal = availability.item_price(i, now)
    row = {
        "id": str(i["id"]), "name": i["name"], "name_ar": i["name_ar"], "sku": i["sku"],
        "code": i["code"],
        "category": i["category"], "price": price, "price_text": fmt_qar(price),
        "price_source": "group" if from_group else "normal",
        "available": i["available"], "status": i["status"], "stock_rule": i["stock_rule"],
        "description": i["description"], "description_ar": i["description_ar"],
        "unit": i["unit"], "pack_size": i["pack_size"], "min_order": i["min_order"],
        "tags": list(i["tags"]),
        # The price to show crossed out: the usual price while a sale is on, or the normal
        # price when the customer's group pays less.
        "list_price": (normal if normal > price else None) if from_group else (
            i["price"] if availability.sale_active(i, now) else None
        ),
        "left": state.left, "orderable": state.orderable, "reason": state.reason,
    }
    if from_group:
        row["normal_price"], row["normal_price_text"] = normal, fmt_qar(normal)
    named = [v for v in entry.active_variants if not v["is_default"]]
    if named:
        row["variants"] = []
        for v in named:
            v_price, v_group = availability.group_variant_price(
                i, v, now, entry.group_prices, group_id
            )
            shown = {
                "id": str(v["id"]), "name": v["name"], "name_ar": v["name_ar"], "sku": v["sku"],
                "price": v_price, "price_text": fmt_qar(v_price),
                "price_source": "group" if v_group else "normal",
                "left": availability.variant_left(i, v, entry.deltas, state.day),
            }
            if v_group:
                normal_v = availability.variant_price(i, v, now)
                shown["normal_price"], shown["normal_price_text"] = normal_v, fmt_qar(normal_v)
            row["variants"].append(shown)
    if entry.groups:
        row["option_groups"] = [
            {
                "id": str(g["id"]), "name": g["name"], "name_ar": g["name_ar"],
                "required": g["required"], "max_choices": g["max_choices"],
                "options": [
                    {"id": str(o["id"]), "name": o["name"], "name_ar": o["name_ar"],
                     "price_delta": o["price_delta"],
                     "price_delta_text": fmt_qar(o["price_delta"])}
                    for o in g["options"] if o["active"]
                ],
            }
            for g in entry.groups
        ]
    if state.dated:
        row["order_for_date"] = {
            "earliest": state.next_date.isoformat() if state.next_date else None
        }
    if not state.orderable and state.reason not in ("hidden", "off"):
        row["next_at"] = state.next_at.isoformat() if state.next_at else None
        row["next_date"] = state.next_date.isoformat() if state.next_date else None
    return row


async def list_products(conn: asyncpg.Connection, only_available: bool = False) -> list[dict]:
    """The shop's items. For the workspace, every item that is not archived (the Catalog's
    sample items are left out: they belong to the Catalog's own screens); for the order
    page (`only_available`), the live ones that can be ordered now."""
    shop_clock = await clock.load(conn)
    entries = await load_items(
        conn, shop_clock,
        "i.status = 'live'" if only_available else "i.status <> 'archived' and not i.is_sample",
    )
    rows = []
    for entry in entries:
        state = entry.state(shop_clock)
        if only_available and not state.orderable:
            continue
        rows.append(_row(entry, state, shop_clock))
    return rows


async def storefront(conn: asyncpg.Connection, contact_id: UUID | None = None) -> dict:
    """What the order page shows: items that can be ordered now, and the live items that
    cannot, with why and when they can (sold out, outside their hours, cut-off passed), so
    the page can show them greyed or leave them out. An item staff switched off is not on
    the menu at all. Prices are the customer's own: their price group's where it set one,
    else the normal price; `group` says which group that is. Without a customer the page
    shows the default group's prices."""
    shop_clock = await clock.load(conn)
    group = await price_groups.group_of(conn, contact_id)
    group_id = price_groups.pricing_id(group)
    entries = await load_items(conn, shop_clock, "i.status = 'live'")
    orderable, unavailable = [], []
    for entry in entries:
        state = entry.state(shop_clock)
        if state.reason == "off":
            continue
        (orderable if state.orderable else unavailable).append(
            _row(entry, state, shop_clock, group_id)
        )
    return {"products": orderable, "unavailable": unavailable, "group": price_groups.public(group)}


async def can_use_account(conn: asyncpg.Connection, contact_id: UUID) -> bool:
    """Only customers the shop has given a credit limit may put an order on account."""
    limit = await conn.fetchval("select credit_limit from contacts where id = $1", contact_id)
    return bool(limit and limit > 0)


def _shown(c: cart.Checked) -> bool:
    item = c.entry.item
    return qty.shown(item["unit"], item["pack_size"], item["min_order"])


def _name(c: cart.Checked, arabic: bool) -> str:
    """A line's item with its size or colour and chosen options, as the customer reads it."""
    item = c.entry.item
    parts = []
    if c.variant is not None and c.variant["name"]:
        parts.append(c.variant["name_ar"] if arabic and c.variant["name_ar"] else c.variant["name"])
    parts += [o["name_ar"] if arabic and o["name_ar"] else o["name"] for o in c.options]
    name = item["name_ar"] if arabic and item["name_ar"] else item["name"]
    return f"{name} ({', '.join(parts)})" if parts else name


async def _refusal(
    conn: asyncpg.Connection, shop_clock: ShopClock, checked: list[cart.Checked]
) -> OrderError:
    """The error for a cart with something wrong, naming every line."""
    lines = await cart.report(conn, shop_clock, checked)
    bad = next((c for c in checked if not c.ok), None)
    if bad is None:
        return OrderError(
            "cart_changed", text.say("cart_changed", "en", {}),
            text.say("cart_changed", "ar", {}), lines,
        )
    return OrderError(
        bad.code, cart.message(bad, shop_clock, "en"), cart.message(bad, shop_clock, "ar"), lines
    )


def _pricing_of(
    quote: discounts.Quote, choice: delivery.Choice | None, feats: features.Features,
    shop_clock: ShopClock,
) -> dict:
    """The `pricing` an order's answer carries: what came off and how it reaches the customer.
    Nothing while the shop uses neither feature, so such a shop's answers read as ever."""
    if not (feats.on("discounts") or feats.on("delivery_fees")):
        return {}
    pricing = discounts.view(quote, shop_clock.tz.key)
    pricing["total"] = quote.goods + (choice.fee if choice is not None else 0)
    if feats.on("delivery_fees") and choice is not None:
        pricing["delivery"] = choice.view(shop_clock)
    return {"pricing": pricing}


def _delivery_line(choice: delivery.Choice, arabic: bool, shop_clock: ShopClock) -> str:
    """How the order reaches the customer, as a line of the confirmation message."""
    lang = "ar" if arabic else "en"
    if choice.mode == delivery.PICKUP:
        return "استلام من المتجر" if arabic else "Pickup from the shop"
    zone = choice.zone
    name = zone.name_ar if arabic and zone.name_ar else zone.name
    money = fmt_qar_ar if arabic else fmt_qar
    fee = ("مجاني" if arabic else "free") if choice.fee == 0 else money(choice.fee)
    word = "التوصيل" if arabic else "Delivery"
    to = "إلى" if arabic else "to"
    head = f"{word}: {fee}" if zone.id is None else f"{word} {to} {name}: {fee}"
    when = delivery_text.day_text(choice.deliver_on, shop_clock.today, lang)
    where = f"\n{choice.address}" if choice.address else ""
    return f"{head}{where}\n{'موعد التوصيل' if arabic else 'Delivery'}: {when}"


def _price_lines(checked: list[cart.Checked]) -> list[totals.Line]:
    """The lines that can be ordered, as the pricing sees them."""
    return [
        totals.Line(
            c.index, c.entry.item["id"], c.entry.item["category"] or "", c.unit_price,
            c.line.quantity,
        )
        for c in checked if c.ok
    ]


def _feature_off(key: str) -> OrderError:
    error = features.refuse(key)
    return OrderError("feature_off", str(error), error.message_ar)


async def price_cart(
    conn: asyncpg.Connection, checked: list[cart.Checked], shop_clock: ShopClock,
    feats: features.Features, codes: list[str] | None, contact_id: UUID | None,
    group_id: UUID | None,
) -> discounts.Quote:
    """The cart's goods priced against the shop's discounts: what comes off, line by line.
    With the feature off, the goods as they are; a code is then refused (it cannot be used)."""
    lines = _price_lines(checked)
    if not feats.on("discounts"):
        if discounts.typed(codes):
            raise _feature_off("discounts")
        return discounts.plain_quote(lines)
    if len(discounts.typed(codes)) > discounts.MAX_CODES:
        many = {"max": discounts.MAX_CODES}
        raise OrderError(
            "coupon_too_many", discount_text.say("coupon_too_many", "en", many),
            discount_text.say("coupon_too_many", "ar", many),
        )
    return await discounts.quote(
        conn, lines, codes, contact_id=contact_id, group_id=group_id, now=shop_clock.now
    )


def _ready_on(checked: list[cart.Checked]) -> date | None:
    """The day the goods are ready: the latest day a made-to-order item is for."""
    dates = [c.fulfil_on for c in checked if c.ok and c.fulfil_on]
    return max(dates) if dates else None


def _delivery_words(error: delivery.DeliveryError) -> dict:
    return {"code": error.code, "message": str(error), "message_ar": error.message_ar}


async def price_fulfilment(
    conn: asyncpg.Connection, shop_clock: ShopClock, feats: features.Features,
    fulfilment: dict | None, goods: int, checked: list[cart.Checked], strict: bool,
) -> delivery.Choice | None:
    """How the order reaches the customer, priced. None while the shop does not use delivery
    (a choice is then refused: it cannot be made). Raises `delivery.DeliveryError`."""
    if not feats.on("delivery_fees"):
        if fulfilment:
            raise _feature_off("delivery_fees")
        return None
    return await delivery.price(
        conn, shop_clock, fulfilment, goods, _ready_on(checked), strict=strict
    )


async def check_cart(
    conn: asyncpg.Connection, lines: list[CartLine], for_date: date | None = None,
    now: datetime | None = None, contact_id: UUID | None = None,
    coupons: list[str] | None = None, fulfilment: dict | None = None,
) -> dict:
    """Look at a cart without placing it: each line's verdict and the total of those that
    can be ordered. The order page asks this before it asks for payment. With a customer,
    the prices are their price group's; `group` in the answer says which group that is. With
    the shop's discounts on, `pricing` says what comes off and why, and how each code the
    customer typed fared (`coupons`); `total` is then what they would pay."""
    shop_clock = await clock.load(conn, now)
    feats = await features.load(conn)
    group = await price_groups.group_of(conn, contact_id)
    checked = await cart.check(conn, shop_clock, lines, for_date, price_groups.pricing_id(group))
    if contact_id is not None:
        # A customer who tries a sold-out item is demand the report counts (spec 007).
        await demand.record(conn, contact_id, demand.from_checked(checked), "order_page", now)
    quote = await price_cart(
        conn, checked, shop_clock, feats, coupons, contact_id, price_groups.pricing_id(group)
    )
    choice, problem = None, None
    try:
        choice = await price_fulfilment(
            conn, shop_clock, feats, fulfilment, quote.goods, checked, strict=False
        )
    except delivery.DeliveryError as error:
        if error.code == "feature_off":
            raise
        problem = _delivery_words(error)
    fee = choice.fee if choice is not None else 0
    report = await cart.report(conn, shop_clock, checked)
    out = {
        "ok": all(c.ok for c in checked) and problem is None,
        "lines": report,
        "total": quote.goods + fee, "total_text": fmt_qar(quote.goods + fee),
        "group": price_groups.public(group),
    }
    if feats.on("discounts"):
        for line in report:
            if line["ok"]:
                off = quote.line_discounts.get(line["index"], 0)
                line["discount"] = off
                line["line_total_after"] = line["line_total"] - off
    if feats.on("discounts") or feats.on("delivery_fees"):
        pricing = discounts.view(quote, shop_clock.tz.key)
        pricing["total"] = quote.goods + fee
        if feats.on("delivery_fees"):
            pricing["delivery"] = (
                choice.view(shop_clock) if choice is not None else {"problem": problem}
            )
            if choice is not None and problem is None:
                pricing["delivery"]["problem"] = None
        out["pricing"] = pricing
    return out


async def create_order(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact_id: UUID,
    lines: list[CartLine] | list[tuple[UUID, int]],
    payment: str,
    web_url: str,
    outbound: Outbound,
    for_date: date | None = None,
    now: datetime | None = None,
    left_out: list[str] | None = None,
    table: str = "",
    coupons: list[str] | None = None,
    expected_total: int | None = None,
    fulfilment: dict | None = None,
) -> dict:
    """Place an order. Prices always come from the database, never from the caller; a
    line may say what price the customer was shown, and if that is no longer the price the
    order is refused and the new price shown. `for_date` is the day a made-to-order item
    is wanted. `left_out` names items a repeat order had to leave behind. `table` is the
    table the order is for, from the link on its QR code; staff see it on the order.
    `coupons` are the codes the customer typed; automatic discounts need no code. The total is
    worked out here, from the database, by the same function that priced the cart for the
    page (`totals`); `expected_total` is what the customer was shown, and if it is not what the
    order now comes to, the order is refused with the new figures (`total_changed`)."""
    contact = await conn.fetchrow(
        "select id, lang, credit_limit, assigned_to, price_group_id, wa_user_id from contacts "
        "where id = $1", contact_id
    )
    if contact is None:
        raise _plain("unknown_customer")
    if not lines:
        raise _plain("empty")
    lines = [
        line if isinstance(line, CartLine) else CartLine(*line) for line in lines
    ]
    for line in lines:
        # (a fraction is judged against the item's unit and step by the cart check below)
        if not 0 < line.quantity <= MAX_QUANTITY:
            raise OrderError("bad_quantity", "Quantity must be between 1 and 999.")

    shop_clock = await clock.load(conn, now)
    # The customer's price group decides every price on the order. The order keeps its
    # name, below, so renaming or removing the group never rewrites it.
    group = await price_groups.effective(conn, contact["price_group_id"])
    group_id = price_groups.pricing_id(group)
    checked = await cart.check(conn, shop_clock, lines, for_date, group_id)
    if not all(c.ok for c in checked):
        raise await _refusal(conn, shop_clock, checked)
    # A line is its price times its quantity, rounded half up to a dirham, once per line; the
    # order is the sum of its lines (qty.line_total, which the pricing engine uses too).
    feats = await features.load(conn)
    quote = await price_cart(conn, checked, shop_clock, feats, coupons, contact_id, group_id)
    for entered in quote.coupons:
        if not entered.ok:
            en, ar = discounts.problem_words(entered.problem, entered.code, shop_clock.tz.key)
            raise OrderError(
                entered.problem.code, en, ar,
                extra={"coupon": entered.code, "pricing": discounts.view(quote, shop_clock.tz.key)},
            )
    try:
        choice = await price_fulfilment(
            conn, shop_clock, feats, fulfilment, quote.goods, checked, strict=True
        )
    except delivery.DeliveryError as error:
        if error.code == "feature_off":
            raise
        raise OrderError(
            error.code, str(error), error.message_ar, extra={"pricing": discounts.view(
                quote, shop_clock.tz.key)},
        ) from error
    fee = choice.fee if choice is not None else 0
    total = quote.goods + fee
    if expected_total is not None and expected_total != total:
        pricing = discounts.view(quote, shop_clock.tz.key)
        pricing["total"] = total
        if choice is not None:
            pricing["delivery"] = choice.view(shop_clock)
        raise OrderError(
            "total_changed",
            discount_text.say("total_changed", "en", {"total": total}),
            discount_text.say("total_changed", "ar", {"total": total}),
            extra={"pricing": pricing, "total": total},
        )

    # A shop with no online account yet takes its money when the customer collects (ALY-170,
    # spec 024): the page and the chat still ask for "link", and it means "pay on collection".
    ways = await pay_ways.get(conn)
    # The owner's own test order moves no money, whatever the page offered (ALY-168).
    if payment == "link" and (not ways["online"] or identity.is_test_user(contact["wa_user_id"])):
        payment = "later"
    if payment == "account":
        if not contact["credit_limit"] > 0:
            raise _plain("no_account")
        balance = (await ledger.aged(conn, contact_id)).balance
        if balance + total > contact["credit_limit"]:
            raise _plain("over_limit", limit_amount=contact["credit_limit"])
    elif payment not in ("link", "later"):
        raise _plain("bad_payment")

    # Take the stock before anything else is written, in one step per line. Another order
    # for the same last item may have got there first; then nothing is taken, and the
    # cart comes back with what is left.
    order_id = uuid4()
    takes = [c.take for c in checked if c.take is not None]
    if takes and payment == "link":
        # An order link is a capability, so one person must not be able to hold everything
        # a shop has by ordering again and again without paying.
        waiting = await conn.fetchval(
            "select count(distinct h.order_id) from stock_holds h "
            "join orders o on o.id = h.order_id "
            "where o.contact_id = $1 and h.status = 'held'",
            contact_id,
        )
        if waiting >= MAX_UNPAID_HOLDS:
            details = {"n": waiting}
            raise OrderError(
                "too_many_holds", text.say("too_many_holds", "en", details),
                text.say("too_many_holds", "ar", details),
            )
    if takes and await stock.reserve(conn, takes, order_id, team.CUSTOMER):
        raise await _refusal(
            conn, shop_clock, await cart.check(conn, shop_clock, lines, for_date, group_id)
        )

    # One order number at a time per shop, so numbers never repeat.
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"orders:{tenant_id}")
    number = await conn.fetchval("select coalesce(max(number), 1000) + 1 from orders")
    dates = [c.fulfil_on for c in checked if c.fulfil_on]
    # Whoever is looking after this customer's chat looks after the order too.
    await conn.execute(
        "insert into orders (id, contact_id, number, total, payment, assigned_to, fulfil_on, "
        "price_group_id, price_group_name, price_group_name_ar, table_label, subtotal, "
        "discount_total, fulfilment, delivery_zone_id, delivery_zone_name, "
        "delivery_zone_name_ar, delivery_address, delivery_note, delivery_on, delivery_fee) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, "
        "$18, $19, $20, $21)",
        order_id, contact_id, number, total, "on_account" if payment == "account" else "unpaid",
        contact["assigned_to"], max(dates) if dates else None,
        group["id"], group["name"], group["name_ar"], table[:20],
        quote.subtotal, quote.discount_total,
        choice.mode if choice is not None else None,
        choice.zone.id if choice is not None and choice.zone is not None else None,
        choice.zone.name if choice is not None and choice.zone is not None else "",
        choice.zone.name_ar if choice is not None and choice.zone is not None else "",
        choice.address if choice is not None else "", choice.note if choice is not None else "",
        choice.deliver_on if choice is not None else None, fee,
    )
    await team.record(
        conn, "order", order_id, "placed", team.CUSTOMER, contact_id,
        {"number": number, "total": fmt_qar(total), "payment": payment,
         "table": table[:20] or None},
    )
    # A pay-link order holds its stock until it is paid or the hold runs out.
    minutes = await clock.hold_minutes(conn)
    held_until = (
        shop_clock.now + timedelta(minutes=minutes) if payment == "link" and takes else None
    )
    # The owner's own fields the customer could see are copied onto each line as they were, so
    # the order never changes when a field is renamed or archived (ALY-148).
    shown = [
        f for f in await fields.rows(conn, False) if f["shown_to_customers"]
    ] if feats.on("custom_fields") else []
    for c in checked:
        item, variant = c.entry.item, c.variant
        snapshot = [
            {k: v for k, v in x.items() if k != "searchable"}
            for x in fields.shown_to_customers(shown, item["custom"], variant["custom"])
        ]
        order_item_id = await conn.fetchval(
            "insert into order_items (order_id, item_id, name, name_ar, price, quantity, "
            "variant_id, variant_name, variant_name_ar, options, fulfil_on, sku, custom, "
            "discount, unit, unit_shown) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) "
            "returning id",
            order_id, item["id"], item["name"], item["name_ar"], c.unit_price, c.line.quantity,
            variant["id"], variant["name"], variant["name_ar"], c.options, c.fulfil_on,
            # The size's own code, else the item's: what the shop reads on its order.
            variant["sku"] or item["sku"], snapshot, quote.line_discounts.get(c.index, 0),
            # The unit it was ordered in, kept with the line, and whether it is written beside the
            # quantity (only for an item sold in fractions).
            item["unit"], _shown(c),
        )
        if feats.on("cost_margin"):
            # What one unit costs now, kept beside the line: the order's margin stays right
            # whatever the cost or the price does later. Nothing of it is sent to anyone.
            await costs.snapshot(conn, order_item_id, item["id"], variant["id"])
        if c.take is not None:
            await stock_holds.create(
                conn, order_id, order_item_id, c.take.variant_id, c.take.quantity, c.take.day,
                held_until,
            )
    if held_until is not None:
        await jobs.enqueue(conn, EXPIRE_JOB, {"order_id": str(order_id)}, held_until)
    # Use the discounts last, in this same transaction: a limited code is a conditional update,
    # so two orders for its last use cannot both take it, and a refusal here rolls the whole
    # order back (stock included).
    if quote.applied:
        try:
            await discounts.claim(conn, order_id, contact_id, quote.applied, shop_clock.now)
        except discounts.DiscountError as error:
            raise OrderError(
                error.code, str(error), error.message_ar,
                extra={"coupon": getattr(error, "coupon", None)},
            ) from error

    arabic = contact["lang"] == "ar"
    def _amount(c: cart.Checked) -> str:
        # "3", or "0.5 kg" for something sold in fractions.
        return qty.label(c.line.quantity, c.entry.item["unit"], _shown(c), "ar" if arabic else "en")

    summary = "\n".join(
        f"{_amount(c)} x {_name(c, arabic)}  "
        f"{fmt_qar(qty.line_total(c.unit_price, c.line.quantity))}"
        for c in checked
    )
    for a in quote.applied:
        label = a.rule.code or (a.rule.name_ar if arabic and a.rule.name_ar else a.rule.name)
        word = "خصم" if arabic else "Discount"
        summary += f"\n{word}{f' ({label})' if label else ''}: -{fmt_qar(a.amount)}"
    if choice is not None:
        summary += "\n" + _delivery_line(choice, arabic, shop_clock)
    # A template blank cannot hold a line break, so the items go on one line there.
    items = ", ".join(f"{_amount(c)} x {_name(c, arabic)}" for c in checked)
    pay_url = None
    if payment == "account":
        await ledger.add_entry(
            conn, contact_id, "sale", total, note=f"Order #{number}", created_by="Order link",
            order_id=order_id,
        )
        # An invoice for the credit sale, for a shop that has Documents on (ALY-139).
        await documents_sales.credit_sale(conn, order_id)
        balance = (await ledger.aged(conn, contact_id)).balance
        closing = (
            f"تم تسجيله على حسابك. رصيدك الآن {fmt_qar(balance)}." if arabic
            else f"Put on your account. Your balance is now {fmt_qar(balance)}."
        )
    elif payment == "later":
        # Nothing to pay now: the order is the shop's to prepare, and staff mark it paid when
        # the money arrives. Its stock is already committed, so no hold runs out.
        how = pay_ways.say(ways["ways"], contact["lang"])
        delivering = choice is not None and choice.mode == "delivery"
        if arabic:
            closing = f"الدفع {how} عند الاستلام."
        else:
            closing = f"Pay by {how} " + ("on delivery." if delivering else "when you collect.")
    else:
        pay_url = await conn.fetchval(
            "insert into payment_requests (contact_id, amount, order_id) values ($1, $2, $3) "
            "returning id",
            contact_id, total, order_id,
        )
        pay_url = f"{web_url}/pay/{tenant_id}/{pay_url}"
        closing = f"للدفع: {pay_url}" if arabic else f"Pay here: {pay_url}"
        if held_until is not None:
            closing += (
                f"\nنحجز لك الأصناف لمدة {minutes} دقيقة." if arabic
                else f"\nWe are holding your items for {minutes} minutes."
            )

    head = f"تم استلام الطلب رقم {number}." if arabic else f"Order #{number} received."
    total_line = f"الإجمالي: {fmt_qar(total)}" if arabic else f"Total: {fmt_qar(total)}"
    track = _track_line(track_url(web_url, tenant_id, order_id), arabic)
    skipped = ""
    if left_out:
        names = "، ".join(left_out) if arabic else ", ".join(left_out)
        skipped = (
            f"\nلم نضف لعدم توفره الآن: {names}" if arabic
            else f"\nNot included, because it is not available now: {names}"
        )
    # The tracking link goes in the module's own wording. An approved template cannot
    # change, so a notice sent after the 24-hour window arrives without it.
    await outbound.send(conn, templates.notice(
        contact_id,
        {"account": "order_received_account", "later": "order_received_later"}.get(
            payment, "order_received_pay"),
        contact["lang"], f"{head}\n{summary}\n{total_line}\n{closing}{skipped}\n{track}",
        number, items, fmt_qar(total),
        fmt_qar(balance) if payment == "account" else closing if payment == "later" else pay_url,
    ))
    return {
        "order_id": str(order_id), "number": number, "total": total,
        "total_text": fmt_qar(total), "payment": payment, "pay_url": pay_url,
        "pay_ways": ways["ways"] if payment == "later" else [],
        "track_url": track_url(web_url, tenant_id, order_id),
        "fulfil_on": max(dates).isoformat() if dates else None,
        "hold_expires_at": held_until.isoformat() if held_until else None,
        # The group whose prices the order was charged.
        "price_group": price_groups.public(group),
        "table": table[:20],
        **_pricing_of(quote, choice, feats, shop_clock),
    }


async def repeat_last_order(
    conn: asyncpg.Connection, tenant_id: UUID, contact_id: UUID, payment: str, web_url: str,
    outbound: Outbound, now: datetime | None = None,
) -> dict:
    """"Same as last time": order again what the customer's last order held. Anything that
    can no longer be ordered is left out and named; the rest is ordered, at today's prices
    (and any price that changed is listed)."""
    last = await conn.fetchrow(
        "select id from orders where contact_id = $1 and status <> 'cancelled' "
        "order by created_at desc, number desc limit 1",
        contact_id,
    )
    if last is None:
        raise OrderError(
            "no_previous_order", text.say("no_previous_order", "en", {}),
            text.say("no_previous_order", "ar", {}),
        )
    rows = await conn.fetch(
        "select item_id, variant_id, quantity, price, options, name, name_ar from order_items "
        "where order_id = $1 and item_id is not null order by name",
        last["id"],
    )
    lines = [
        CartLine(
            r["item_id"], r["quantity"], r["variant_id"],
            tuple(UUID(o["id"]) for o in r["options"] if "id" in o),
        )
        for r in rows
    ]
    shop_clock = await clock.load(conn, now)
    group = await price_groups.group_of(conn, contact_id)
    checked = await cart.check(conn, shop_clock, lines, None, price_groups.pricing_id(group))
    ordered = [c for c in checked if c.ok]
    # What the customer wanted again and the shop could not give is demand the report counts.
    # (When nothing is left the order is refused and this is rolled back; the route notes it.)
    await demand.record(conn, contact_id, demand.from_checked(checked), "order_page", now)
    left_out = [
        {
            "name": r["name"], "name_ar": r["name_ar"], "code": c.code,
            "message": cart.message(c, shop_clock, "en"),
            "message_ar": cart.message(c, shop_clock, "ar"),
        }
        for r, c in zip(rows, checked, strict=True) if not c.ok
    ]
    if not ordered:
        raise OrderError(
            "nothing_available", text.say("nothing_available", "en", {}),
            text.say("nothing_available", "ar", {}), await cart.report(conn, shop_clock, checked),
        )
    lang = await conn.fetchval("select lang from contacts where id = $1", contact_id)
    placed = await create_order(
        conn, tenant_id, contact_id, [c.line for c in ordered], payment, web_url, outbound,
        now=now,
        left_out=[(x["name_ar"] or x["name"]) if lang == "ar" else x["name"] for x in left_out],
    )
    placed["left_out"] = left_out
    placed["price_changes"] = [
        {"name": r["name"], "was": r["price"], "was_text": fmt_qar(r["price"]),
         "now": c.unit_price, "now_text": fmt_qar(c.unit_price)}
        for r, c in zip(rows, checked, strict=True) if c.ok and c.unit_price != r["price"]
    ]
    return placed


_STATUS_TEXT = {
    "confirmed": ("Order #{n} is confirmed.", "تم تأكيد الطلب رقم {n}."),
    "ready": ("Order #{n} is ready for collection.", "الطلب رقم {n} جاهز للاستلام."),
    "done": ("Order #{n} is complete. Thank you.", "تم إنجاز الطلب رقم {n}. شكراً لك."),
    "cancelled": ("Order #{n} has been cancelled.", "تم إلغاء الطلب رقم {n}."),
}


async def cancel_order(
    conn: asyncpg.Connection, order_id: UUID, outbound: Outbound,
    actor: Actor = team.ASSISTANT, restock: bool | None = None, reason: str = "",
    held_minutes: int | None = None, notify: bool = True,
) -> dict | None:
    """Cancel an order, and tell the customer (unless `notify` is off: the owner's own test
    order, cancelled when the test is over, tells nobody).

    Stock goes back when the order had not been made yet (new or confirmed): the customer
    changed their mind, or nobody paid in time. For an order already ready or done the
    stock stays sold unless `restock` says otherwise. An order that was paid is cancelled
    all the same, and the answer says a refund is due: the shop refunds it in its own
    payment account, because ALYR never holds money. An order that was put on the customer's
    credit account is taken off it again, in the same transaction: a reversal is written
    next to the sale and the customer is told their balance changed. `held_minutes` is set
    when the hold ran out, which changes what the customer is told.

    Every way an order is cancelled comes through here (the customer, staff, the hold
    sweep), and the order's row lock and the unique reversal in the ledger make sure the
    sale is taken off once.

    Returns None if there is no such order."""
    # A payment link nobody can use any more. First, in the order a payment arriving takes
    # its locks, so the two cannot wait on each other.
    await conn.execute(
        "update payment_requests set status = 'expired' "
        "where order_id = $1 and status = 'pending'",
        order_id,
    )
    row = await conn.fetchrow(
        "select number, status, payment, total, contact_id, is_test from orders "
        "where id = $1 for update",
        order_id,
    )
    if row is None:
        return None
    if row["status"] == "cancelled":
        return {"number": row["number"], "status": "cancelled", "already": True,
                "stock_returned": 0, "refund_due": False, "credit_reversed": 0,
                "credit_reversed_text": None}
    if restock is None:
        restock = row["status"] in ("new", "confirmed")
    await conn.execute("update orders set status = 'cancelled' where id = $1", order_id)
    # A discount code this order used goes back to its rule, once (ALY-150).
    coupon_uses = await discounts.give_back(conn, order_id)
    returned = 0
    if restock:
        returned = await stock_holds.release(
            conn, order_id, actor, reason or "Order cancelled"
        )
    # Money for a test order never moved, so none is due back.
    refund_due = row["payment"] == "paid" and not row["is_test"]
    # An order on the customer's credit account was a debt; cancelled, it is not.
    reversed_amount = 0
    if row["payment"] == "on_account":
        reversed_amount = await ledger.reverse_sale(
            conn, order_id, row["contact_id"], row["total"], row["number"], actor.name
        ) or 0
    # A receipt or invoice already issued for it is cancelled by a credit note, once, in this
    # same transaction, for a shop that has Documents on (ALY-139).
    await documents_sales.order_cancelled(conn, order_id, row["number"], actor)
    await team.claim(conn, "order", order_id, actor)
    await team.record(
        conn, "order", order_id, "cancelled", actor, row["contact_id"],
        {"number": row["number"], "reason": reason, "stock_returned": returned or None,
         "refund_due": fmt_qar(row["total"]) if refund_due else None,
         "credit_reversed": fmt_qar(reversed_amount) if reversed_amount else None,
         "coupon_uses_returned": coupon_uses or None},
    )
    if refund_due:
        await team.record(
            conn, "order", order_id, "refund_due", actor, row["contact_id"],
            {"number": row["number"], "amount": fmt_qar(row["total"])},
        )
        # Nobody else would know: the money is in the shop's own payment account, and
        # only the shop can send it back. Tell the owner and managers (ALY-106).
        await alerts.refund_due(conn, outbound, row["number"], fmt_qar(row["total"]))
    result = {
        "number": row["number"], "status": "cancelled", "already": False,
        "stock_returned": returned,
        "refund_due": refund_due,
        "refund_amount": row["total"] if refund_due else 0,
        "refund_text": fmt_qar(row["total"]) if refund_due else None,
        "credit_reversed": reversed_amount,
        "credit_reversed_text": fmt_qar(reversed_amount) if reversed_amount else None,
    }
    if not notify:
        return result
    lang = await conn.fetchval("select lang from contacts where id = $1", row["contact_id"])
    if held_minutes is not None:
        body = text.say("hold_expired", lang, {"number": row["number"], "minutes": held_minutes})
    else:
        english, arabic = _STATUS_TEXT["cancelled"]
        body = (arabic if lang == "ar" else english).format(n=row["number"])
    await outbound.send(conn, templates.notice(
        row["contact_id"], "order_cancelled", lang, body, row["number"],
    ))
    if reversed_amount:
        # The notice every ledger entry sends: plain inside the 24-hour window, the
        # approved `entry_recorded` template outside it.
        shop = await conn.fetchrow(
            "select name, name_ar from tenants "
            "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
        balance = (await ledger.aged(conn, row["contact_id"])).balance
        await outbound.send(conn, ledger.entry_message(
            row["contact_id"], lang, shop["name"], shop["name_ar"], "reversal", reversed_amount,
            balance, row["number"],
        ))
    return result


async def set_status(
    conn: asyncpg.Connection, order_id: UUID, status: str, outbound: Outbound,
    actor: Actor = team.ASSISTANT, web_url: str | None = None, restock: bool | None = None,
) -> bool:
    """Move an order along and tell the customer. Returns False if there is no such order.
    Whoever moves an order nobody has becomes responsible for it. A cancelled order cannot
    be moved on: its stock has gone back, so the customer orders again."""
    if status not in _STATUS_TEXT:
        raise OrderError("bad_status", "Unknown order status.")
    if status == "cancelled":
        return await cancel_order(conn, order_id, outbound, actor, restock) is not None
    row = await conn.fetchrow(
        "update orders set status = $2 where id = $1 and status is distinct from $2 "
        "and status <> 'cancelled' returning contact_id, number",
        order_id, status,
    )
    if row is None:
        current = await conn.fetchval("select status from orders where id = $1", order_id)
        if current == "cancelled":
            # Its stock has gone back, so it cannot be brought back; the customer orders again.
            raise OrderError(
                "cancelled", "A cancelled order cannot be moved on. Place a new order instead."
            )
        return current is not None
    await team.claim(conn, "order", order_id, actor)
    await team.record(
        conn, "order", order_id, status, actor, row["contact_id"], {"number": row["number"]}
    )
    lang = await conn.fetchval("select lang from contacts where id = $1", row["contact_id"])
    english, arabic = _STATUS_TEXT[status]
    body = (arabic if lang == "ar" else english).format(n=row["number"])
    if web_url:
        tenant_id = await conn.fetchval(
            "select nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
        body += "\n" + _track_line(track_url(web_url, tenant_id, order_id), lang == "ar")
    await outbound.send(conn, templates.notice(
        row["contact_id"], f"order_{status}", lang, body, row["number"],
    ))
    return True


async def list_orders(conn: asyncpg.Connection) -> list[dict]:
    orders = await conn.fetch(
        "select o.id, o.number, o.status, o.payment, o.total, o.created_at, o.fulfil_on, "
        "       o.table_label, o.subtotal, o.discount_total, o.fulfilment, o.delivery_fee, "
        "       o.delivery_zone_name, o.delivery_zone_name_ar, o.delivery_address, "
        "       o.delivery_note, o.delivery_on, o.is_test, "
        "       c.name as customer, o.assigned_to, u.name as assignee, "
        "       o.price_group_name, o.price_group_name_ar, coalesce(g.is_default, false) "
        "         as price_group_default "
        "from orders o join contacts c on c.id = o.contact_id "
        "left join price_groups g on g.id = o.price_group_id "
        "left join users u on u.id = o.assigned_to order by o.number desc"
    )
    items = await conn.fetch(
        "select order_id, name, price, quantity, variant_name, options, sku, custom, discount, "
        "       unit, unit_shown "
        "from order_items"
    )
    given: dict[UUID, list[dict]] = {}
    if any(o["discount_total"] for o in orders):
        for d in await conn.fetch("select * from order_discounts order by sort"):
            given.setdefault(d["order_id"], []).append(discounts.snapshot(d))
    by_order: dict[UUID, list[dict]] = {}
    for item in items:
        by_order.setdefault(item["order_id"], []).append(
            {"name": item["name"], "quantity": item["quantity"], "unit": item["unit"],
             "unit_shown": item["unit_shown"],
             "variant": item["variant_name"], "sku": item["sku"],
             "fields": item["custom"],
             "options": [o["name"] for o in item["options"]],
             "price": item["price"], "price_text": fmt_qar(item["price"]),
             "line_text": fmt_qar(qty.line_total(item["price"], item["quantity"])),
             **({"discount": item["discount"],
                 "discount_text": fmt_qar(item["discount"])} if item["discount"] else {})}
        )
    return [
        {
            "id": str(o["id"]), "number": o["number"], "status": o["status"],
            "payment": o["payment"], "total": o["total"], "total_text": fmt_qar(o["total"]),
            "customer": o["customer"], "created_at": o["created_at"].isoformat(),
            # The owner's own test order from the test line (ALY-168): marked in the list, and
            # never counted anywhere that adds orders up.
            "test": o["is_test"],
            # What the goods came to and what came off, only on an order that was given a
            # discount (ALY-150); an order without one reads exactly as it always did.
            **({"subtotal": o["subtotal"], "subtotal_text": fmt_qar(o["subtotal"]),
                "discount_total": o["discount_total"],
                "discount_total_text": fmt_qar(o["discount_total"]),
                "discounts": given.get(o["id"], [])} if o["discount_total"] else {}),
            # How it reaches the customer, only on an order made while Delivery was on.
            **({"fulfilment": delivery.snapshot(o)} if o["fulfilment"] else {}),
            "fulfil_on": o["fulfil_on"].isoformat() if o["fulfil_on"] else None,
            # The table it is for, from a QR code on a table ("" for none).
            "table": o["table_label"],
            "items": by_order.get(o["id"], []),
            # The group whose prices the order was charged, as it was named then. Orders
            # from before price groups have none.
            "price_group": {
                "name": o["price_group_name"], "name_ar": o["price_group_name_ar"],
                "is_default": o["price_group_default"],
            } if o["price_group_name"] else None,
            "assigned": {"id": str(o["assigned_to"]), "name": o["assignee"]}
            if o["assigned_to"] else None,
        }
        for o in orders
    ]


# What the customer sees on the tracking page, in the order it happens.
TRACK_STEPS = ("placed", "confirmed", "ready", "done")


async def tracking(conn: asyncpg.Connection, order_id: UUID) -> dict | None:
    """One order as its customer may see it: what they bought, where it has got to and
    when, who at the shop is looking after it, and how to pay if they have not.
    Nothing about other customers, and only the first name of the staff member."""
    order = await conn.fetchrow(
        "select o.id, o.number, o.status, o.payment, o.total, o.created_at, o.fulfil_on, "
        "       o.table_label, o.subtotal, o.discount_total, o.fulfilment, o.delivery_fee, "
        "       o.delivery_zone_name, o.delivery_zone_name_ar, o.delivery_address, "
        "       o.delivery_note, o.delivery_on, c.lang, "
        "       split_part(u.name, ' ', 1) as handler "
        "from orders o join contacts c on c.id = o.contact_id "
        "left join users u on u.id = o.assigned_to where o.id = $1",
        order_id,
    )
    if order is None:
        return None
    items = await conn.fetch(
        "select o.name, coalesce(nullif(o.name_ar, ''), p.name_ar, '') as name_ar, o.price, "
        "       o.quantity, o.unit, o.unit_shown, o.variant_name, o.variant_name_ar, o.options, "
        "       o.custom, o.discount "
        "from order_items o left join items p on p.id = o.item_id "
        "where o.order_id = $1 order by o.name",
        order_id,
    )
    events = await conn.fetch(
        "select action, min(created_at) as at from activity "
        "where subject = 'order' and subject_id = $1 group by action",
        order_id,
    )
    when = {e["action"]: e["at"] for e in events}
    when.setdefault("placed", order["created_at"])
    pending = await conn.fetchval(
        "select id from payment_requests where order_id = $1 and status = 'pending' "
        "order by created_at desc limit 1",
        order_id,
    )
    return {
        "number": order["number"], "status": order["status"], "payment": order["payment"],
        "total": order["total"], "total_text": fmt_qar(order["total"]), "lang": order["lang"],
        "handler": order["handler"] or None, "table": order["table_label"],
        "fulfil_on": order["fulfil_on"].isoformat() if order["fulfil_on"] else None,
        "items": [
            {"name": i["name"], "name_ar": i["name_ar"] or "", "quantity": i["quantity"],
             "unit": i["unit"], "unit_shown": i["unit_shown"],
             "variant": i["variant_name"], "variant_ar": i["variant_name_ar"],
             "options": [o["name"] for o in i["options"]],
             "options_ar": [o.get("name_ar") or o["name"] for o in i["options"]],
             "fields": i["custom"],
             "unit_price": i["price"],
             "line_total": qty.line_total(i["price"], i["quantity"]),
             "line_text": fmt_qar(qty.line_total(i["price"], i["quantity"])),
             **({"discount": i["discount"]} if i["discount"] else {})}
            for i in items
        ],
        **({
            "subtotal": order["subtotal"], "discount_total": order["discount_total"],
            "discounts": await discounts.for_order(conn, order_id),
        } if order["discount_total"] else {}),
        **({"fulfilment": delivery.snapshot(order)} if order["fulfilment"] else {}),
        "steps": [
            {"key": key, "at": when[key].isoformat() if key in when else None}
            for key in TRACK_STEPS
        ],
        "cancelled_at": when["cancelled"].isoformat() if "cancelled" in when else None,
        "paid_at": when["paid"].isoformat() if "paid" in when else None,
        "payment_id": str(pending) if pending and order["payment"] == "unpaid" else None,
    }
