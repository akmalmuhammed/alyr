"""What the chat remembers about a customer who is ordering by message (ALY-136, D-039).

One row per customer (`chat_carts`): the DRAFT ORDER (the items they confirmed, each with the
price they were shown), the one PENDING question (what was understood and waits for Confirm or
Change, or a size still to choose), and how many codes they sent lately that matched nothing.
Everything expires: a pending question after half an hour, a draft after six hours without a
new message. A draft holds no stock; the stock is taken only when the order is placed
(`modules/orders/service.py`), so a forgotten draft costs the shop nothing.

Limits, so one sender cannot fill the table or make the chat search forever: a draft holds at
most `MAX_LINES` lines, a shop at most `MAX_OPEN` drafts at once, and a sender whose codes do
not match anything `MISS_LIMIT` times in `MISS_WINDOW` is handed to a person instead of
searched for.

Every function takes a tenant-scoped connection.
"""

import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.modules.items import qty

CART_LIFE = timedelta(hours=6)
PENDING_LIFE = timedelta(minutes=30)
MISS_WINDOW = timedelta(minutes=10)
MISS_LIMIT = 5
MAX_LINES = 30
MAX_OPEN = 500
MAX_QUANTITY = 999


@dataclass
class Cart:
    id: UUID
    contact_id: UUID
    lines: list[dict] = field(default_factory=list)
    pending: dict | None = None
    misses: int = 0
    misses_since: datetime | None = None
    expires_at: datetime | None = None
    # What else the draft remembers: the discount codes the customer typed (`coupons`) and, with
    # the delivery feature, how it is to reach them (ALY-150).
    extras: dict = field(default_factory=dict)

    @property
    def total(self) -> int:
        return sum(qty.line_total(line["price"], line["quantity"]) for line in self.lines)


def new_question_id() -> str:
    """Names a question, so a tap on an old button cannot answer a newer question."""
    return secrets.token_hex(4)


def _lines(stored: list[dict]) -> list[dict]:
    """The draft's lines as exact quantities: a fraction stored as JSON comes back as the decimal
    it was written as (0.1 is 0.1), never as a float's approximation."""
    return [{**line, "quantity": qty.parse(line["quantity"], allow_zero=True)} for line in stored]


def _pending(stored: dict | None) -> dict | None:
    """The pending question with exact quantities in the lines it holds and the sizes it still
    has to ask about."""
    if stored is None:
        return None
    return {
        **stored,
        "lines": _lines(stored.get("lines", [])),
        "ask": _lines(stored.get("ask", [])),
    }


def _cart(row: asyncpg.Record) -> Cart:
    return Cart(
        row["id"], row["contact_id"], _lines(row["lines"]), _pending(row["pending"]),
        row["misses"], row["misses_since"], row["expires_at"], dict(row["extras"] or {}),
    )


async def get(
    conn: asyncpg.Connection, contact_id: UUID, now: datetime | None = None
) -> Cart | None:
    """The customer's draft and question, or None when they have none (or it ran out)."""
    now = now or datetime.now(UTC)
    row = await conn.fetchrow("select * from chat_carts where contact_id = $1", contact_id)
    if row is None:
        return None
    if row["expires_at"] <= now:
        await conn.execute("delete from chat_carts where id = $1", row["id"])
        return None
    cart = _cart(row)
    if cart.pending is not None and (
        row["pending_expires_at"] is None or row["pending_expires_at"] <= now
    ):
        cart.pending = None
    return cart


async def open_for(
    conn: asyncpg.Connection, contact_id: UUID, now: datetime | None = None
) -> Cart | None:
    """The customer's cart, made if they have none. None when the shop already has `MAX_OPEN`
    drafts waiting: the caller says so and offers a person. Expired drafts are cleared first,
    so the cap counts only live ones."""
    now = now or datetime.now(UTC)
    have = await get(conn, contact_id, now)
    if have is not None:
        return have
    await conn.execute("delete from chat_carts where expires_at <= $1", now)
    if await conn.fetchval("select count(*) from chat_carts") >= MAX_OPEN:
        return None
    row = await conn.fetchrow(
        "insert into chat_carts (contact_id, expires_at) values ($1, $2) "
        "on conflict (tenant_id, contact_id) do update set updated_at = now() returning *",
        contact_id, now + CART_LIFE,
    )
    return _cart(row)


async def save(conn: asyncpg.Connection, cart: Cart, now: datetime | None = None) -> None:
    """Write the cart back and give it a new lease on life."""
    now = now or datetime.now(UTC)
    cart.expires_at = now + CART_LIFE
    await conn.execute(
        "update chat_carts set lines = $2, pending = $3, pending_expires_at = $4, misses = $5, "
        "misses_since = $6, expires_at = $7, extras = $8, updated_at = now() where id = $1",
        cart.id, cart.lines, cart.pending,
        now + PENDING_LIFE if cart.pending is not None else None,
        cart.misses, cart.misses_since, cart.expires_at, cart.extras,
    )


async def clear(conn: asyncpg.Connection, contact_id: UUID) -> None:
    """Forget the draft and the question (the order was placed, or the customer emptied it).
    The count of missed codes is kept by the row only while it matters, so it goes too."""
    await conn.execute("delete from chat_carts where contact_id = $1", contact_id)


def limited(cart: Cart, now: datetime | None = None) -> bool:
    """Has this sender sent too many codes that matched nothing, just now?"""
    now = now or datetime.now(UTC)
    return (
        cart.misses >= MISS_LIMIT and cart.misses_since is not None
        and now - cart.misses_since < MISS_WINDOW
    )


def note_misses(cart: Cart, count: int, now: datetime | None = None) -> None:
    """Count codes that matched nothing. A new window starts when the last has run out."""
    now = now or datetime.now(UTC)
    if cart.misses_since is None or now - cart.misses_since >= MISS_WINDOW:
        cart.misses, cart.misses_since = 0, now
    cart.misses += count


def coupons(cart: Cart) -> list[str]:
    """The discount codes the customer has typed into this draft, in order."""
    return list(cart.extras.get("coupons", []))


def add_coupon(cart: Cart, code: str, limit: int) -> bool:
    """Remember a code (once). False when the draft already carries `limit` codes."""
    have = coupons(cart)
    if code in have:
        return True
    if len(have) >= limit:
        return False
    cart.extras["coupons"] = [*have, code]
    return True


def drop_coupons(cart: Cart, codes: list[str]) -> None:
    kept = [c for c in coupons(cart) if c not in codes]
    if kept:
        cart.extras["coupons"] = kept
    else:
        cart.extras.pop("coupons", None)


def add_line(
    cart: Cart, item_id: UUID, variant_id: UUID | None, quantity: "qty.Qty", price: int
) -> bool:
    """Put a line in the draft, adding to the line for the same item and size. False when
    the draft is full."""
    for line in cart.lines:
        if line["item_id"] == str(item_id) and line["variant_id"] == (
            str(variant_id) if variant_id else None
        ):
            line["quantity"] = qty.norm(min(line["quantity"] + quantity, MAX_QUANTITY))
            line["price"] = price
            return True
    if len(cart.lines) >= MAX_LINES:
        return False
    cart.lines.append({
        "item_id": str(item_id), "variant_id": str(variant_id) if variant_id else None,
        "quantity": qty.norm(min(quantity, MAX_QUANTITY)), "price": price,
    })
    return True
