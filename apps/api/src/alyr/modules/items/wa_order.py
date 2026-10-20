"""Ordering in the chat by a code, a link, a SKU or a name (ALY-136, D-039).

The model: the shop shares its inventory page. The customer browses it, picks, and gives the
chat an identifier. The chat finds the item in THIS shop (an identifier is only ever looked up
inside the shop the chat belongs to), answers with the item as a card, and asks the customer to
CONFIRM. Confirmed items go into a DRAFT ORDER with a live total. "Place order" then uses the
ordinary order path (`modules/orders/service.py`: the stock is taken in one step, a pay link or
the credit account, the confirmation message), so nothing about stock is done twice.

What starts it (`codes.py` reads the message): a pasted item link, a pasted category link, an
item code (`214`, `#214`, `code 214`, «رقم ٢١٤»; several with quantities in one message), a SKU
typed exactly, or a name. A SKU-shaped word is looked up as a SKU only: if there is none the
customer is told so, and it is never matched against names (the «OUD-12» hazard).

Rules this module keeps:

* Several items in one message are ONE question and ONE Confirm.
* Price and stock are read again when the customer confirms and when they place the order, and
  any change is said, never hidden. A line that can no longer be ordered is taken off, said so.
* Nothing is guessed: a size that is not clear is asked; a name that fits several items is a list
  to choose from; a code that matches nothing is "not found", with a way to search by name or
  talk to a person.
* Unreadable messages (a voice message, a picture) go to a person with a polite reply.
* Abuse: too many codes that match nothing in a short time hand the sender to a person; a draft
  and a shop's drafts are capped (`chat_cart.py`).
* Nothing here runs for a shop whose Catalog is off, or for a number registered as staff.
"""

from dataclasses import dataclass, field
from uuid import UUID

import asyncpg

from alyr.channels.base import MAX_LIST_ROWS, Choice, InboundMessage, OutboundMessage
from alyr.core import team
from alyr.core.media import MediaService
from alyr.core.normalise import has_arabic
from alyr.core.outbound import Outbound
from alyr.modules.items import (
    availability,
    cart,
    chat_cart,
    codes,
    discount_text,
    discounts,
    features,
    match,
    service,
    wa_card,
    wa_coupon,
)
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import groups as price_groups
from alyr.modules.items.cart import CartLine
from alyr.modules.items.wa_text import say, shown
from alyr.modules.orders import service as orders
from alyr.modules.orders import totals
from alyr.modules.orders.chat import order_link

OK, CHANGE, VARIANT, PICK = "ok:", "chg:", "var:", "pick:"
PLACE, ACCOUNT, CLEAR, FIND, PERSON = "cart_place", "cart_acct", "cart_clear", "find_name", "person"
OWN_IDS = {PLACE, ACCOUNT, CLEAR, FIND, PERSON}
OWN_PREFIXES = (OK, CHANGE, VARIANT, PICK)
MAX_CARDS = 3
MAX_PROBLEMS = 5

# What a short typed message can mean when a question or a draft is waiting.
_CONFIRM = {w for p in (
    "confirm", "yes", "ok", "okay", "y", "yep", "sure", "تأكيد", "نعم", "تمام", "أكد", "موافق",
    "اي", "أيوه",
) for w in match.tokens(p)}
_CHANGE = {w for p in (
    "change", "no", "nope", "cancel", "wrong", "تغيير", "غير", "لا", "إلغاء",
) for w in match.tokens(p)}
_PLACE = {" ".join(match.tokens(p)) for p in (
    "place order", "place my order", "checkout", "check out", "send order", "submit order",
    "اتمام الطلب", "إتمام الطلب", "اكمل الطلب", "أكمل الطلب", "ارسل الطلب", "أرسل الطلب",
)}
_CART = {" ".join(match.tokens(p)) for p in (
    "cart", "my cart", "basket", "my basket", "my order", "show order", "show cart",
    "سلتي", "السلة", "سلة", "طلبي", "عرض الطلب",
)}
_SAME = {" ".join(match.tokens(p)) for p in (
    "same as last time", "same again", "same as before", "same order", "repeat order",
    "repeat my order", "reorder", "order again", "the usual",
    "نفس الطلب", "نفس الطلب السابق", "كالمعتاد", "اعادة الطلب", "إعادة الطلب", "كالمرة السابقة",
)}
_PERSON = {w for p in (
    "human", "person", "agent", "staff", "representative", "operator",
    "موظف", "شخص", "إنسان", "مندوب", "بشري",
) for w in match.tokens(p)}
# Kinds of message the chat cannot read: a person looks at them.
_UNREADABLE = {"audio", "voice", "video", "document", "image", "sticker", "location", "contacts"}


def _lang(contact: asyncpg.Record, message: InboundMessage | None = None) -> str:
    return "ar" if contact["lang"] == "ar" or (message and has_arabic(message.text)) else "en"


money = wa_card.money


@dataclass
class Want:
    """An item the customer asked for, before it is checked."""

    item_id: UUID
    quantity: int = 1
    variant_id: UUID | None = None
    hint: str = ""


@dataclass
class Row:
    """A line that can be ordered, as it will be shown."""

    item_id: UUID
    variant_id: UUID | None
    quantity: int
    unit_price: int
    entry: service.Loaded
    variant: dict | None

    def name(self, lang: str) -> str:
        label = shown(self.entry.item, lang)
        if self.variant is not None and (self.variant["name"] or self.variant["name_ar"]):
            label += f" ({shown(self.variant, lang)})"
        return label

    @property
    def total(self) -> int:
        return self.unit_price * self.quantity


@dataclass
class Context:
    conn: asyncpg.Connection
    tenant_id: UUID
    contact: asyncpg.Record
    lang: str
    web_url: str
    media: MediaService
    orders_on: bool
    clock: shop_clock.ShopClock
    shop: str
    slug: str
    group_id: UUID | None
    outbound: Outbound | None = None

    @property
    def me(self) -> UUID:
        return self.contact["id"]

    def reply(self, body: str, *choices: Choice) -> OutboundMessage:
        if choices:
            return OutboundMessage(
                to=self.me, kind="buttons", body=wa_card.clip(body, wa_card.MAX_BODY),
                choices=tuple(choices), lang=self.lang,
            )
        return OutboundMessage(to=self.me, body=body, lang=self.lang)

    def say(self, code: str, **details: object) -> str:
        details.setdefault("shop", self.shop)
        return say(code, self.lang, **details)


async def _context(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, lang: str, web_url: str,
    media: MediaService, orders_on: bool, outbound: Outbound | None = None,
) -> Context:
    shop = await conn.fetchrow("select name, name_ar, slug from tenants where id = $1", tenant_id)
    name = shop["name_ar"] if lang == "ar" and shop["name_ar"] else shop["name"]
    group = await price_groups.group_of(conn, contact["id"])
    return Context(
        conn, tenant_id, contact, lang, web_url, media, orders_on, await shop_clock.load(conn),
        name, shop["slug"] or "", price_groups.pricing_id(group), outbound,
    )


# ── the way in ───────────────────────────────────────────────────────────────────────


async def maybe_handle(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, message: InboundMessage,
    web_url: str, media: MediaService, outbound: Outbound, orders_on: bool,
) -> list[OutboundMessage] | None:
    """Answer a customer's message when it is about ordering by code, link or SKU, or answers
    one of our questions about an order; otherwise None and the item-name and menu code, then
    the other modules, take it."""
    if contact["role"] == "staff":
        return None
    lang = _lang(contact, message)
    reply = message.reply_id
    if lang == "ar" and contact["lang"] != "ar" and not reply:
        # Written in Arabic once: the buttons and notices that follow are Arabic too (the
        # ledger's and the bookings' chats do the same).
        await conn.execute("update contacts set lang = 'ar' where id = $1", contact["id"])
    if reply:
        if reply not in OWN_IDS and not reply.startswith(OWN_PREFIXES):
            return None
        ctx = await _context(conn, tenant_id, contact, lang, web_url, media, orders_on, outbound)
        return await _answer(ctx, reply)
    if orders_on and message.kind == "text" and message.text.strip():
        ask = wa_coupon.parse(message.text)
        if ask is not None and (await features.load(conn)).on("discounts"):
            ctx = await _context(
                conn, tenant_id, contact, lang, web_url, media, orders_on, outbound
            )
            return await _coupon(ctx, ask)
    parsed = codes.parse(message.text) if message.text.strip() else codes.Parsed()
    if parsed.is_order:
        ctx = await _context(conn, tenant_id, contact, lang, web_url, media, orders_on, outbound)
        return await _from_refs(ctx, parsed)
    if message.kind in _UNREADABLE:
        ctx = await _context(conn, tenant_id, contact, lang, web_url, media, orders_on, outbound)
        return await _hand_to_person(ctx, "unreadable", ctx.say("person_unreadable"))
    if message.kind != "text" or not message.text.strip():
        return None
    ctx = await _context(conn, tenant_id, contact, lang, web_url, media, orders_on, outbound)
    return await _typed(ctx, message.text, parsed)


async def _typed(
    ctx: Context, raw: str, parsed: codes.Parsed
) -> list[OutboundMessage] | None:
    """A message with no code or link in it: a short answer to a question we asked, a word for
    the draft, "same as last time", a request for a person, or a SKU made of plain words."""
    words = match.tokens(raw)
    said = " ".join(words)
    cart_ = await chat_cart.get(ctx.conn, ctx.me)
    if cart_ is not None and cart_.pending is not None and 0 < len(words) <= 3:
        if words[0] in _CONFIRM:
            return await _confirm(ctx, cart_, cart_.pending["id"])
        if words[0] in _CHANGE:
            return await _change(ctx, cart_, cart_.pending["id"])
    if said in _PLACE and cart_ is not None and cart_.lines:
        return await _place(ctx, cart_, "link")
    if said in _CART and cart_ is not None and cart_.lines:
        return [await _draft(ctx, cart_)]
    runs = {" ".join(words[i:i + n]) for n in (2, 3, 4) for i in range(len(words))}
    if len(words) <= 6 and (said in _SAME or runs & _SAME):
        return await _same_as_last_time(ctx)
    if 0 < len(words) <= 8 and set(words) & _PERSON:
        return await _hand_to_person(ctx, "asked", ctx.say("person"))
    # A SKU of plain words ("OUD", "KT 12 A"): exact, over the whole message only.
    if parsed.plain and not parsed.refs and len(parsed.plain) <= 40:
        found = await _by_sku(ctx.conn, [parsed.plain, codes.clean(raw).strip(codes._TRAILING)])
        if found:
            wants = [Want(item_id, 1, variant_id) for item_id, variant_id in found.values()]
            return await _offer(ctx, wants, [])
    return None


async def _answer(ctx: Context, reply: str) -> list[OutboundMessage] | None:
    """A tap on one of our buttons or list rows."""
    cart_ = await chat_cart.get(ctx.conn, ctx.me)
    if reply == FIND:
        return [ctx.reply(ctx.say("search_by_name", example=await _example(ctx)))]
    if reply == PERSON:
        return await _hand_to_person(ctx, "asked", ctx.say("person"))
    if reply == CLEAR:
        await chat_cart.clear(ctx.conn, ctx.me)
        return [ctx.reply(ctx.say("draft_cleared"))]
    if reply in (PLACE, ACCOUNT):
        if cart_ is None or not cart_.lines:
            return [ctx.reply(ctx.say("draft_empty"))]
        return await _place(ctx, cart_, "account" if reply == ACCOUNT else "link")
    if reply.startswith(PICK):
        try:
            item_id = UUID(reply.removeprefix(PICK))
        except ValueError:
            return None
        return await _offer(ctx, [Want(item_id)], [])
    kind = OK if reply.startswith(OK) else CHANGE if reply.startswith(CHANGE) else VARIANT
    rest = reply.removeprefix(kind)
    if cart_ is None or cart_.pending is None or not rest.startswith(cart_.pending["id"]):
        return [ctx.reply(ctx.say("question_expired"))]
    if kind == OK:
        return await _confirm(ctx, cart_, rest)
    if kind == CHANGE:
        return await _change(ctx, cart_, rest)
    return await _chose_variant(ctx, cart_, rest)


async def _example(ctx: Context) -> str:
    """A real item's name, for "send the name of the item, for example"."""
    row = await ctx.conn.fetchrow(
        "select name, name_ar from items where status = 'live' and not is_sample "
        "order by sort, name limit 1"
    )
    return shown(dict(row), ctx.lang) if row else say("help_example", ctx.lang)


# ── finding what the customer meant ──────────────────────────────────────────────────


@dataclass
class Found:
    wants: list[Want] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    other_shop: bool = False
    categories: list[str] = field(default_factory=list)
    # Two readings of one number (a code of one item and a SKU of another): the customer picks.
    ambiguous: list[UUID] = field(default_factory=list)


_AR_DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹"
_WESTERN = "01234567890123456789"


async def _by_sku(
    conn: asyncpg.Connection, pieces: list[str]
) -> dict[str, tuple[UUID, UUID | None]]:
    """Items (and their sizes) whose SKU is exactly one of `pieces`, ignoring case. The key is
    the SKU in lower case. Only live items."""
    wanted = [p for p in dict.fromkeys(pieces) if p]
    if not wanted:
        return {}
    rows = await conn.fetch(
        "select lower(i.sku) as sku, i.id as item_id, null::uuid as variant_id from items i "
        "where i.status = 'live' and not i.is_sample and i.sku <> '' "
        "and translate(lower(i.sku), $2, $3) = any($1) "
        "union all select lower(v.sku), v.item_id, v.id from item_variants v "
        "join items i on i.id = v.item_id "
        "where i.status = 'live' and not i.is_sample and v.active and v.sku <> '' "
        "and translate(lower(v.sku), $2, $3) = any($1)",
        wanted, _AR_DIGITS, _WESTERN,
    )
    return {codes.clean(r["sku"]): (r["item_id"], r["variant_id"]) for r in rows}


async def _find(ctx: Context, parsed: codes.Parsed) -> Found:
    found = Found()
    numbers = [int(r.value) for r in parsed.refs if r.kind == "code"]
    by_code: dict[int, UUID] = {}
    if numbers:
        rows = await ctx.conn.fetch(
            "select code, id from items where code = any($1) and status = 'live'", numbers
        )
        by_code = {r["code"]: r["id"] for r in rows}
    sku_pieces = [r.value for r in parsed.refs if r.kind == "sku"]
    sku_pieces += [r.value for r in parsed.refs if r.kind == "code"]
    by_sku = await _by_sku(ctx.conn, sku_pieces)
    for ref in parsed.refs:
        if ref.kind == "code":
            item_id = by_code.get(int(ref.value))
            sku_hit = by_sku.get(ref.value)
            if item_id is not None and sku_hit is not None and sku_hit[0] != item_id:
                found.ambiguous += [item_id, sku_hit[0]]
            elif item_id is not None:
                found.wants.append(Want(item_id, ref.quantity, None, ref.hint))
            elif sku_hit is not None:
                found.wants.append(Want(sku_hit[0], ref.quantity, sku_hit[1], ref.hint))
            else:
                found.missing.append(say("not_found_what_code", ctx.lang, number=ref.value))
        elif ref.kind == "sku":
            hit = by_sku.get(ref.value)
            if hit is not None:
                found.wants.append(Want(hit[0], ref.quantity, hit[1]))
            else:
                found.missing.append(say("not_found_what_sku", ctx.lang, sku=ref.value.upper()))
        elif ref.kind in ("item", "category"):
            if ref.slug and ref.slug != ctx.slug.lower():
                found.other_shop = True
            elif ref.kind == "item":
                if await ctx.conn.fetchval(
                    "select true from items where id = $1 and status = 'live' and not is_sample",
                    UUID(ref.value),
                ):
                    found.wants.append(Want(UUID(ref.value), ref.quantity))
                else:
                    found.missing.append(say("not_found_what_link", ctx.lang))
            else:
                found.categories.append(ref.value)
    return found


# ── from a message to a question ─────────────────────────────────────────────────────


async def _from_refs(ctx: Context, parsed: codes.Parsed) -> list[OutboundMessage]:
    """A message that names items by code, link or SKU."""
    cart_ = await chat_cart.open_for(ctx.conn, ctx.me)
    if cart_ is None:
        # The shop has as many drafts waiting as it will hold: a person takes it from here.
        return await _hand_to_person(ctx, "busy", ctx.say("person"))
    if chat_cart.limited(cart_):
        return await _hand_to_person(ctx, "too_many_misses", ctx.say("too_many_misses"))
    found = await _find(ctx, parsed)
    replies: list[OutboundMessage] = []
    if found.other_shop and not (found.wants or found.categories or found.missing):
        return [ctx.reply(ctx.say("not_found_other_shop"))]
    if found.other_shop:
        replies.append(ctx.reply(ctx.say("not_found_other_shop")))
    if parsed.dropped:
        replies.append(ctx.reply(ctx.say("cut_short", n=codes.MAX_REFS)))
    for name in found.categories:
        replies.extend(await _category(ctx, name))
    if found.ambiguous:
        replies.append(await _which(ctx, found.ambiguous))
    missing = found.missing
    if missing:
        chat_cart.note_misses(cart_, len(missing))
        await chat_cart.save(ctx.conn, cart_)
        if chat_cart.limited(cart_):
            return await _hand_to_person(ctx, "too_many_misses", ctx.say("too_many_misses"))
    offered = await _offer(ctx, found.wants, missing, replies)
    return offered


async def _category(ctx: Context, name: str) -> list[OutboundMessage]:
    """A pasted category link: the items in it that can be ordered now, to pick from."""
    entries = await service.load(
        ctx.conn, ctx.clock, "i.status = 'live' and not i.is_sample and lower(i.category) = $1",
        (name.lower(),),
    )
    live = [e for e in entries if e.state(ctx.clock).orderable]
    slug = ctx.slug
    link = order_link(ctx.web_url, slug, ctx.me, ctx.tenant_id) if slug else ""
    if not live:
        return [ctx.reply(ctx.say("category_empty", category=name, link=link))]
    rows = tuple(
        Choice(
            f"{PICK}{e.item['id']}", wa_card.clip(shown(e.item, ctx.lang), 24),
            money(ctx.lang, availability.item_price(e.item, ctx.clock.now)),
        )
        for e in live[:MAX_LIST_ROWS]
    )
    body = ctx.say("category_head", category=entries[0].item["category"] or name, link=link)
    return [OutboundMessage(to=ctx.me, kind="list", body=body, choices=rows, lang=ctx.lang)]


async def _which(ctx: Context, item_ids: list[UUID]) -> OutboundMessage:
    wanted = list(dict.fromkeys(item_ids))
    entries = await service.load(
        ctx.conn, ctx.clock, "i.status = 'live' and i.id = any($1)", (wanted,)
    )
    rows = tuple(
        Choice(
            f"{PICK}{e.item['id']}", wa_card.clip(shown(e.item, ctx.lang), 24),
            money(ctx.lang, availability.item_price(e.item, ctx.clock.now)),
        )
        for e in entries[:MAX_LIST_ROWS]
    )
    return OutboundMessage(
        to=ctx.me, kind="list", body=say("several_match", ctx.lang), choices=rows, lang=ctx.lang
    )


async def offer(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, lang: str,
    wants: list[Want], web_url: str, media: MediaService, orders_on: bool,
) -> list[OutboundMessage]:
    """Put items the customer chose (by name, from the menu, from a list) to them as a question
    with Confirm and Change. The way the name search and the menu join this flow."""
    ctx = await _context(conn, tenant_id, contact, lang, web_url, media, orders_on)
    return await _offer(ctx, wants, [])


async def _offer(
    ctx: Context, wants: list[Want], missing: list[str],
    replies: list[OutboundMessage] | None = None,
) -> list[OutboundMessage]:
    """The heart: sort what was asked into what can be ordered, what cannot and why, what needs
    a choice, and what was not found; say each; and keep the orderable part as the one pending
    question. `replies` are messages already decided, which go first."""
    replies = list(replies or [])
    if not wants:
        return replies + _not_found(ctx, missing, last=True) if missing else replies
    entries = {
        e.item["id"]: e
        for e in await service.load(
            ctx.conn, ctx.clock, "i.status = 'live' and not i.is_sample and i.id = any($1)",
            (list({w.item_id for w in wants}),),
        )
    }
    good: list[Want] = []
    ask: list[Want] = []
    cards = 0
    for want in wants:
        entry = entries.get(want.item_id)
        if entry is None:
            missing = [*missing, say("not_found_what_link", ctx.lang)]
            continue
        state = entry.state(ctx.clock)
        if not state.orderable:
            if cards < MAX_CARDS:
                cards += 1
                replies.append(await wa_card.build(
                    ctx.conn, ctx.contact, ctx.lang, ctx.clock, want.item_id, ctx.media,
                    entry=entry,
                ))
            continue
        if any(g["required"] for g in entry.groups):
            slug = ctx.slug
            link = order_link(
                ctx.web_url, slug, ctx.me, ctx.tenant_id, item=want.item_id
            ) if slug else ""
            replies.append(ctx.reply(ctx.say("needs_choices", name=shown(entry.item, ctx.lang),
                                             link=link)))
            continue
        variant = _pick_variant(entry, want)
        if variant is None:
            ask.append(want)
        else:
            good.append(Want(want.item_id, want.quantity, variant["id"]))
    if not ctx.orders_on:
        # The shop's chat takes no orders: the item is shown, and that is all.
        for want in [*good, *ask][:MAX_CARDS]:
            replies.append(await wa_card.build(
                ctx.conn, ctx.contact, ctx.lang, ctx.clock, want.item_id, ctx.media,
                entry=entries[want.item_id],
            ))
        return replies + (_not_found(ctx, missing, last=True) if missing else [])
    rows, problems = await _check(ctx, good)
    if problems:
        replies.append(ctx.reply("\n".join(problems[:MAX_PROBLEMS])))
    if missing:
        replies.extend(_not_found(ctx, missing, last=not (rows or ask)))
    if not rows and not ask:
        return replies
    cart_ = await chat_cart.open_for(ctx.conn, ctx.me)
    if cart_ is None:
        return replies + await _hand_to_person(ctx, "busy", ctx.say("person"))
    cart_.pending = {
        "id": chat_cart.new_question_id(),
        "lines": [_line(r) for r in rows],
        "ask": [{"item_id": str(w.item_id), "quantity": w.quantity} for w in ask],
    }
    replies.extend(await _next_question(ctx, cart_, entries))
    await chat_cart.save(ctx.conn, cart_)
    return replies


def _line(row: Row) -> dict:
    return {
        "item_id": str(row.item_id), "variant_id": str(row.variant_id) if row.variant_id else None,
        "quantity": row.quantity, "price": row.unit_price,
    }


def _pick_variant(entry: service.Loaded, want: Want) -> dict | None:
    """The size or colour a want is for, or None when it is not clear and must be asked.
    An item with one choice has it; a SKU of a size names it; words in brackets are matched
    against the sizes' names and must fit exactly one."""
    variants = entry.active_variants
    if want.variant_id is not None:
        return next((v for v in variants if v["id"] == want.variant_id), None)
    if len(variants) == 1:
        return variants[0]
    if not variants:
        return None
    if want.hint:
        found = match.find(match.tokens(want.hint), [entry])
        if found.one is not None and found.one.variant is not None:
            return found.one.variant
    return None


async def _check(ctx: Context, wants: list[Want]) -> tuple[list[Row], list[str]]:
    """Look at the wants as the checkout would: the rows that can be ordered with their prices,
    and a sentence for each that cannot."""
    if not wants:
        return [], []
    lines = [CartLine(w.item_id, w.quantity, w.variant_id) for w in wants]
    rows, problems = [], []
    for c in await cart.check(ctx.conn, ctx.clock, lines, None, ctx.group_id):
        if c.ok:
            rows.append(Row(
                c.line.item_id, c.variant["id"] if c.variant else None, c.line.quantity,
                c.unit_price, c.entry, c.variant,
            ))
        else:
            problems.append(cart.message(c, ctx.clock, ctx.lang))
    return rows, problems


def _not_found(ctx: Context, missing: list[str], last: bool) -> list[OutboundMessage]:
    what = ("، " if ctx.lang == "ar" else ", ").join(dict.fromkeys(missing))
    body = ctx.say("not_found", what=what)
    if last:
        return [ctx.reply(
            body, Choice(FIND, say("button_name", ctx.lang)),
            Choice(PERSON, say("button_person", ctx.lang)),
        )]
    return [ctx.reply(body)]


# ── the question: Confirm or Change ──────────────────────────────────────────────────


async def _next_question(
    ctx: Context, cart_: chat_cart.Cart, entries: dict | None = None
) -> list[OutboundMessage]:
    """Ask the first size still to choose, or put the whole order-to-be as one question."""
    pending = cart_.pending
    if pending["ask"]:
        first = pending["ask"][0]
        item_id = UUID(first["item_id"])
        entry = (entries or {}).get(item_id) or await service.get(ctx.conn, ctx.clock, item_id)
        # The customer sees the item first (photo, the sizes and what they cost), then chooses.
        shown_card = await wa_card.build(
            ctx.conn, ctx.contact, ctx.lang, ctx.clock, item_id, ctx.media, entry=entry
        )
        return [shown_card, await _ask_variant(ctx, pending["id"], entry)]
    rows, _ = await _check(ctx, [
        Want(UUID(line["item_id"]), line["quantity"],
             UUID(line["variant_id"]) if line["variant_id"] else None)
        for line in pending["lines"]
    ])
    pending["lines"] = [_line(r) for r in rows]
    if not rows:
        cart_.pending = None
        return []
    return [await _question(ctx, pending["id"], rows)]


async def _ask_variant(ctx: Context, qid: str, entry: service.Loaded) -> OutboundMessage:
    rows = []
    for v in entry.active_variants:
        left = availability.variant_left(entry.item, v, entry.deltas, ctx.clock.shop_day)
        if left is not None and left <= 0:
            continue
        price = availability.group_variant_price(
            entry.item, v, ctx.clock.now, entry.group_prices, ctx.group_id
        )[0]
        rows.append(Choice(
            f"{VARIANT}{qid}:{v['id']}", wa_card.clip(shown(v, ctx.lang) or "-", 24),
            money(ctx.lang, price),
        ))
    if len(rows) > MAX_LIST_ROWS:
        rows = rows[:MAX_LIST_ROWS]
    body = ctx.say("variant_ask", name=shown(entry.item, ctx.lang))
    return OutboundMessage(to=ctx.me, kind="list", body=body, choices=tuple(rows), lang=ctx.lang)


async def _question(ctx: Context, qid: str, rows: list[Row]) -> OutboundMessage:
    """What was understood, with Confirm and Change. One item is a card with its photo; several
    are one summary, so there is one question and one Confirm."""
    buttons = (
        Choice(f"{OK}{qid}", say("button_confirm", ctx.lang)),
        Choice(f"{CHANGE}{qid}", say("button_change", ctx.lang)),
    )
    if len(rows) == 1:
        row = rows[0]
        extra = []
        if row.quantity > 1:
            extra.append(ctx.say(
                "line_one", qty=row.quantity, price=money(ctx.lang, row.unit_price),
                total=money(ctx.lang, row.total),
            ))
        extra.append(ctx.say("check_ask"))
        return await wa_card.build(
            ctx.conn, ctx.contact, ctx.lang, ctx.clock, row.item_id, ctx.media, buttons=buttons,
            extra=tuple(extra), unit_price=row.unit_price, entry=row.entry,
            variant_label=shown(row.variant, ctx.lang)
            if row.variant is not None and (row.variant["name"] or row.variant["name_ar"]) else "",
        )
    lines = [ctx.say("check_head")]
    lines += [
        ctx.say("line_qty", qty=r.quantity, name=r.name(ctx.lang), price=money(ctx.lang, r.total))
        for r in rows
    ]
    lines.append(ctx.say("total", total=money(ctx.lang, sum(r.total for r in rows))))
    lines.append(ctx.say("check_ask_many"))
    return ctx.reply("\n".join(lines), *buttons)


async def _chose_variant(
    ctx: Context, cart_: chat_cart.Cart, rest: str
) -> list[OutboundMessage]:
    pending = cart_.pending
    try:
        variant_id = UUID(rest.split(":", 1)[1])
    except (IndexError, ValueError):
        return [ctx.reply(ctx.say("question_expired"))]
    if not pending["ask"]:
        return [ctx.reply(ctx.say("question_expired"))]
    first = pending["ask"].pop(0)
    entry = await service.get(ctx.conn, ctx.clock, UUID(first["item_id"]))
    if entry is None or not any(v["id"] == variant_id for v in entry.active_variants):
        return [ctx.reply(ctx.say("question_expired"))]
    rows, problems = await _check(ctx, [Want(entry.item["id"], first["quantity"], variant_id)])
    replies = [ctx.reply("\n".join(problems))] if problems else []
    pending["lines"] += [_line(r) for r in rows]
    replies += await _next_question(ctx, cart_)
    await chat_cart.save(ctx.conn, cart_)
    return replies


async def _change(ctx: Context, cart_: chat_cart.Cart, qid: str) -> list[OutboundMessage]:
    if cart_.pending is None or cart_.pending["id"] != qid:
        return [ctx.reply(ctx.say("question_expired"))]
    cart_.pending = None
    await chat_cart.save(ctx.conn, cart_)
    again = await ctx.conn.fetchval(
        "select true from orders where contact_id = $1 and status <> 'cancelled' limit 1", ctx.me
    )
    return [ctx.reply(ctx.say("change_ok_again" if again else "change_ok"))]


async def _confirm(ctx: Context, cart_: chat_cart.Cart, qid: str) -> list[OutboundMessage]:
    """The customer said yes. The prices and stock are read again first: a change is said and
    the question put again, never swallowed."""
    pending = cart_.pending
    if pending is None or pending["id"] != qid or pending["ask"]:
        return [ctx.reply(ctx.say("question_expired"))]
    rows, problems = await _check(ctx, [
        Want(UUID(line["item_id"]), line["quantity"],
             UUID(line["variant_id"]) if line["variant_id"] else None)
        for line in pending["lines"]
    ])
    notes = list(problems)
    before = {(line["item_id"], line["variant_id"]): line["price"] for line in pending["lines"]}
    moved = False
    for row in rows:
        was = before.get((str(row.item_id), str(row.variant_id) if row.variant_id else None))
        if was is not None and was != row.unit_price:
            moved = True
            notes.append(ctx.say(
                "price_changed_note", name=row.name(ctx.lang), old=money(ctx.lang, was),
                new=money(ctx.lang, row.unit_price),
            ))
    gone = len(rows) != len(pending["lines"])
    if not rows:
        cart_.pending = None
        await chat_cart.save(ctx.conn, cart_)
        return [ctx.reply("\n".join(notes))] if notes else [ctx.reply(ctx.say("question_expired"))]
    if moved or gone:
        # Something changed since the customer was asked: say so, and ask again.
        cart_.pending = {"id": chat_cart.new_question_id(), "lines": [_line(r) for r in rows],
                         "ask": []}
        await chat_cart.save(ctx.conn, cart_)
        notes.append(ctx.say("check_changed"))
        return [ctx.reply("\n".join(notes)), await _question(ctx, cart_.pending["id"], rows)]
    for row in rows:
        if not chat_cart.add_line(cart_, row.item_id, row.variant_id, row.quantity, row.unit_price):
            slug = ctx.slug
            link = order_link(ctx.web_url, slug, ctx.me, ctx.tenant_id) if slug else ""
            cart_.pending = None
            await chat_cart.save(ctx.conn, cart_)
            return [ctx.reply(ctx.say("draft_full", n=chat_cart.MAX_LINES, link=link))]
    cart_.pending = None
    await chat_cart.save(ctx.conn, cart_)
    return [await _draft(ctx, cart_, added=True)]


# ── the draft order ──────────────────────────────────────────────────────────────────


# A code that cannot become good by adding to the order: it is forgotten once the customer has
# been told. One that only needs more in the order (the minimum, the right items) is kept.
_FINAL = {
    "coupon_unknown", "coupon_ended", "coupon_paused", "coupon_used_up", "coupon_used_by_you",
    "coupon_group", "coupon_not_started",
}


async def _quote(
    ctx: Context, cart_: chat_cart.Cart, rows: list[Row]
) -> discounts.Quote | None:
    """The draft priced against the shop's discounts; None while the feature is off."""
    if not rows or not (await features.load(ctx.conn)).on("discounts"):
        return None
    lines = [
        totals.Line(i, r.item_id, r.entry.item["category"] or "", r.unit_price, r.quantity)
        for i, r in enumerate(rows)
    ]
    return await discounts.quote(
        ctx.conn, lines, chat_cart.coupons(cart_), contact_id=ctx.me, group_id=ctx.group_id,
        now=ctx.clock.now,
    )


def _label(rule: totals.Rule, lang: str) -> str:
    name = rule.code or (rule.name_ar if lang == "ar" and rule.name_ar else rule.name)
    return f" ({name})" if name else ""


async def _coupon_notes(
    ctx: Context, cart_: chat_cart.Cart, quote: discounts.Quote
) -> list[str]:
    """What to tell the customer about the codes that did not apply, forgetting the ones that
    never will."""
    notes, forget = [], []
    for c in quote.coupons:
        if c.ok:
            continue
        reason = discount_text.say(
            c.problem.code, ctx.lang, {**c.problem.details, "code": c.code}, ctx.clock.tz.key
        )
        notes.append(ctx.say("coupon_note", coupon=c.code, reason=reason))
        if c.problem.code in _FINAL:
            forget.append(c.code)
    if forget:
        chat_cart.drop_coupons(cart_, forget)
        await chat_cart.save(ctx.conn, cart_)
    return notes


async def _coupon(ctx: Context, ask: wa_coupon.Ask) -> list[OutboundMessage]:
    """The customer sent a discount code. If the shop has it, it goes into the draft and the
    draft is shown with the discount; if not, they are told so."""
    rule = None
    for word in ask.candidates[:4]:
        shown_code, key = discounts.code_forms(word)
        row = await ctx.conn.fetchrow(
            "select * from discount_rules where kind = 'coupon' and code_key = $1", key
        )
        if row is not None:
            rule = (shown_code, row)
            break
    if rule is None:
        if not ask.candidates:
            return [ctx.reply(ctx.say("coupon_how"))]
        code = discounts.code_forms(ask.candidates[-1])[0]
        return [ctx.reply(discount_text.say("coupon_unknown", ctx.lang, {"code": code}))]
    cart_ = await chat_cart.open_for(ctx.conn, ctx.me)
    if cart_ is None:
        return await _hand_to_person(ctx, "busy", ctx.say("person"))
    code, row = rule
    if not chat_cart.add_coupon(cart_, code, discounts.MAX_CODES):
        return [ctx.reply(discount_text.say(
            "coupon_too_many", ctx.lang, {"max": discounts.MAX_CODES}
        ))]
    await chat_cart.save(ctx.conn, cart_)
    if cart_.lines:
        return [await _draft(ctx, cart_)]
    return [ctx.reply(ctx.say(
        "coupon_saved", coupon=code, text=discounts.rule_words(row, ctx.lang)
    ))]


async def _draft(
    ctx: Context, cart_: chat_cart.Cart, added: bool = False, notes: list[str] | None = None
) -> OutboundMessage:
    """The draft with a live total: prices as they are now, anything that can no longer be
    ordered said, and the buttons to place it."""
    rows, problems = await _check(ctx, [
        Want(UUID(line["item_id"]), line["quantity"],
             UUID(line["variant_id"]) if line["variant_id"] else None)
        for line in cart_.lines
    ])
    quote = await _quote(ctx, cart_, rows)
    lines = [*(notes or [])]
    if added:
        lines.append(ctx.say("draft_added"))
    lines.append(ctx.say("draft_head"))
    lines += [
        ctx.say("line_qty", qty=r.quantity, name=r.name(ctx.lang), price=money(ctx.lang, r.total))
        for r in rows
    ]
    lines += problems
    total = sum(r.total for r in rows)
    if quote is not None:
        total = quote.goods
        if quote.applied:
            lines.append(ctx.say("draft_items", total=money(ctx.lang, quote.subtotal)))
            lines += [
                ctx.say("draft_discount", label=_label(a.rule, ctx.lang),
                        amount=money(ctx.lang, a.amount))
                for a in quote.applied
            ]
        lines += await _coupon_notes(ctx, cart_, quote)
    lines.append(ctx.say("total", total=money(ctx.lang, total)))
    can_account = await orders.can_use_account(ctx.conn, ctx.me)
    lines.append(ctx.say("draft_more_account" if can_account else "draft_more"))
    buttons = [Choice(PLACE, say("button_place", ctx.lang))]
    if can_account:
        buttons.append(Choice(ACCOUNT, say("button_account", ctx.lang)))
    buttons.append(Choice(CLEAR, say("button_clear", ctx.lang)))
    return ctx.reply("\n".join(lines), *buttons)


async def _place(
    ctx: Context, cart_: chat_cart.Cart, payment: str
) -> list[OutboundMessage]:
    """Place the draft through the ordinary order path. Before that, the prices and stock are
    read again: if anything is different from what the customer last saw, they are told and the
    draft is shown again with the new total; only an unchanged draft is placed."""
    rows, problems = await _check(ctx, [
        Want(UUID(line["item_id"]), line["quantity"],
             UUID(line["variant_id"]) if line["variant_id"] else None)
        for line in cart_.lines
    ])
    before = {(line["item_id"], line["variant_id"]): line["price"] for line in cart_.lines}
    notes = [ctx.say("gone_note", reason=p) for p in problems]
    moved = False
    for row in rows:
        was = before.get((str(row.item_id), str(row.variant_id) if row.variant_id else None))
        if was is not None and was != row.unit_price:
            moved = True
            notes.append(ctx.say(
                "price_changed_note", name=row.name(ctx.lang), old=money(ctx.lang, was),
                new=money(ctx.lang, row.unit_price),
            ))
    if problems or moved:
        cart_.lines = [_line(r) for r in rows]
        await chat_cart.save(ctx.conn, cart_)
        if not rows:
            await chat_cart.clear(ctx.conn, ctx.me)
            return [ctx.reply("\n".join(notes)), ctx.reply(ctx.say("draft_empty"))]
        notes.append(ctx.say("check_changed"))
        return [await _draft(ctx, cart_, notes=notes)]
    quote = await _quote(ctx, cart_, rows)
    if quote is not None and any(not c.ok for c in quote.coupons):
        # A code the customer typed does not fit any more: say so and show what they would pay.
        return [await _draft(ctx, cart_, notes=[ctx.say("check_changed")])]
    try:
        async with ctx.conn.transaction():
            # The ordinary path: stock taken in one step, holds, the credit account, the pay
            # link, the confirmation message to the customer (it sends that itself).
            await orders.create_order(
                ctx.conn, ctx.tenant_id, ctx.me,
                [CartLine(r.item_id, r.quantity, r.variant_id, (), r.unit_price) for r in rows],
                payment, ctx.web_url, ctx.outbound,
                coupons=chat_cart.coupons(cart_) if quote is not None else None,
                expected_total=quote.goods if quote is not None else None,
            )
    except orders.OrderError as error:
        reason = error.message_ar if ctx.lang == "ar" else str(error)
        if error.code == "total_changed" or error.code.startswith("coupon_"):
            # The code or the total moved while the customer decided (the last use went to
            # someone else): forget a code that is gone, show the draft with the new total.
            gone = (error.extra or {}).get("coupon")
            if gone:
                chat_cart.drop_coupons(cart_, [gone])
                await chat_cart.save(ctx.conn, cart_)
            return [ctx.reply(reason), await _draft(ctx, cart_)]
        return [ctx.reply(reason)]
    await chat_cart.clear(ctx.conn, ctx.me)
    return []


async def _same_as_last_time(ctx: Context) -> list[OutboundMessage]:
    """Offer the customer's last order again, as one question. What can no longer be ordered
    is left out and named."""
    last = await ctx.conn.fetchval(
        "select id from orders where contact_id = $1 and status <> 'cancelled' "
        "order by created_at desc, number desc limit 1", ctx.me,
    )
    if last is None:
        return [ctx.reply(ctx.say("same_none"))]
    rows = await ctx.conn.fetch(
        "select item_id, variant_id, quantity, name, name_ar from order_items "
        "where order_id = $1 and item_id is not null order by name", last,
    )
    return await _offer(ctx, [Want(r["item_id"], r["quantity"], r["variant_id"]) for r in rows], [])


# ── people ───────────────────────────────────────────────────────────────────────────


async def _hand_to_person(ctx: Context, why: str, body: str) -> list[OutboundMessage]:
    """Say so politely, and write on the conversation's record that the customer needs a
    person. The conversation is already open in the team inbox: every message a customer sends
    opens it; this makes the reason plain."""
    recent = await ctx.conn.fetchval(
        "select true from activity where subject = 'conversation' and subject_id = $1 "
        "and action = 'asked_person' and created_at > now() - interval '10 minutes'", ctx.me,
    )
    if not recent:
        await team.record(
            ctx.conn, "conversation", ctx.me, "asked_person", team.CUSTOMER, ctx.me,
            {"why": why},
        )
    return [ctx.reply(body)]
