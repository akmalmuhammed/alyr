"""The Catalog in a customer's chat (D-039, ALY-106).

* **An item.** A customer who types an item's name (or part of it, with a spelling mistake,
  in English or Arabic) gets the item's photo with its price and an Order button. When the
  photo is not stored yet (or the store cannot be read) the same message goes without it.
  If several items fit, the customer picks from a list.
* **The menu.** "menu" brings a list of what can be ordered now, with the link to the full
  order page.
* **Tell me when it is back.** An item that is sold out offers a button. The customer
  agrees once to a message from the shop (a consent record, like every other); when stock
  returns they are told once (`watches.py`).

Only items that are on sale are shown. A name is only an item when every word of what the
customer wrote (apart from small talk like "do you have") is part of that item's name, so
ordinary messages ("balance", "hello") are never taken for one. Nothing here is offered to
a shop whose `catalog` module is off.
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core import consent
from alyr.core.media import MediaService
from alyr.core.normalise import fmt_qar, has_arabic
from alyr.modules.items import availability, demand, match, photos, service, text, watches
from alyr.modules.items import clock as shop_clock
from alyr.modules.items.wa_text import say, shown
from alyr.modules.orders.chat import order_link

MAX_BODY = 1000
MENU_WORDS = {
    " ".join(match.tokens(w)) for w in (
        "menu", "catalog", "catalogue", "products", "price list", "pricelist",
        "قائمة", "القائمة", "قائمه", "منيو", "المنيو", "كتالوج", "الكتالوج", "المنتجات",
    )
}
# Said around an item's name, not part of it.
_SMALL_TALK = {
    word for w in (
        "do you have any is are there the a an please pls i we want need can could get show me "
        "what about how much price for of with your does it this that one some hi hello hey "
        "available stock in thanks thank you",
        "عندكم عندك هل يوجد ابي ابغي ابغى اريد كم سعر سعره سعرها بكم ايش وش لو سمحت من فضلك "
        "في عن على هذا هذي ممكن وين متوفر",
    ) for word in match.tokens(w)
}
# Words that start a "tell me when it is back" request.
_NOTIFY = {
    " ".join(match.tokens(p)) for p in (
        "notify me", "tell me", "let me know", "message me", "remind me", "alert me", "ping me",
        "بلغني", "بلغيني", "نبهني", "نبهيني", "خبرني", "اخبرني", "عرفني", "راسلني", "ذكرني",
        "ارسل لي",
    )
}
# A request to be told needs one of these too, so "tell me about the shawarma" is not one.
_NOTIFY_CUES = {
    word for w in (
        "when if once back available stock restock restocked again",
        "عند لما اذا يتوفر توفر يرجع رجع متوفر تتوفر",
    ) for word in match.tokens(w)
}
_NOTIFY_FILLER = {
    word for w in (
        "when if once it is its back again in stock available get restocked comes come "
        "عند لما اذا يتوفر توفر يرجع رجع مره اخري ثانيه مرة تتوفر",
    ) for word in match.tokens(w)
}
# What the customer's other messages mean in the chat; never taken for an item.
_RESERVED = {"pay", "balance", "order", "stop", "start", "cancel", "help", "ادفع", "رصيد", "طلب"}


def _arabic(contact: asyncpg.Record, message: InboundMessage) -> str:
    return "ar" if contact["lang"] == "ar" or has_arabic(message.text) else "en"


def _clip(value: str, size: int) -> str:
    return value if len(value) <= size else value[: size - 1] + "…"


def _contains(words: list[str], phrases: set[str]) -> str | None:
    """The phrase (as folded words) that the message contains, if any."""
    joined = " " + " ".join(words) + " "
    for phrase in sorted(phrases, key=len, reverse=True):
        if f" {phrase} " in joined:
            return phrase
    return None


def _without(words: list[str], phrase: list[str]) -> list[str]:
    """`words` with the first run of `phrase` taken out."""
    size = len(phrase)
    for start in range(len(words) - size + 1):
        if words[start: start + size] == phrase:
            return words[:start] + words[start + size:]
    return words


async def maybe_handle(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record,
    message: InboundMessage, web_url: str, media: MediaService, orders_on: bool,
) -> list[OutboundMessage] | None:
    """Answer if the message asks for the menu, names an item, or answers one of our
    questions about an item; otherwise None, and another module takes it."""
    lang = _arabic(contact, message)
    reply = message.reply_id
    if reply:
        kind, _, rest = reply.partition(":")
        if kind not in ("item", "notify", "notify_yes", "notify_no") or not rest:
            return None
        try:
            item_id = UUID(rest)
        except ValueError:
            return None
        if kind == "item":
            return await _card_for(conn, contact, lang, item_id, media, orders_on)
        if kind == "notify":
            return await _ask_to_notify(conn, tenant_id, contact, lang, item_id, web_url)
        if kind == "notify_yes":
            return await _agreed(conn, tenant_id, contact, lang, item_id, web_url)
        return await _declined(conn, contact, lang, item_id)
    if message.kind != "text" or not message.text.strip():
        return None
    words = match.tokens(message.text)
    bare = " ".join(w for w in words if w not in _SMALL_TALK)
    if " ".join(words) in MENU_WORDS or bare in MENU_WORDS:
        return await _menu(conn, tenant_id, contact, lang, web_url, orders_on)
    phrase = _contains(words, _NOTIFY)
    if phrase is not None and set(words) & _NOTIFY_CUES:
        asked = _without(words, phrase.split())
        return await _notify_by_name(
            conn, tenant_id, contact, lang,
            [w for w in asked if w not in _NOTIFY_FILLER and w not in _SMALL_TALK], web_url,
        )
    return await _by_name(conn, contact, lang, words, media, orders_on)


# ── what is for sale ─────────────────────────────────────────────────────────────────


async def _live(conn: asyncpg.Connection, clock: shop_clock.ShopClock) -> list[service.Loaded]:
    return await service.load(conn, clock, "i.status = 'live'")


async def _shop_name(conn: asyncpg.Connection, tenant_id: UUID, lang: str) -> str:
    row = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    return row["name_ar"] if lang == "ar" and row["name_ar"] else row["name"]


async def _by_name(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, words: list[str],
    media: MediaService, orders_on: bool,
) -> list[OutboundMessage] | None:
    words = [w for w in words if w not in _SMALL_TALK and not w.isdigit()]
    if not words or len(words) > 6 or set(words) & _RESERVED or not any(len(w) >= 3 for w in words):
        return None
    clock = await shop_clock.load(conn)
    found = match.find(words, await _live(conn, clock), with_variants=False)
    if found.one is not None:
        return [await _card(conn, contact, lang, clock, found.one.item["id"], media, orders_on)]
    if not found.many:
        return None
    rows = tuple(
        Choice(f"item:{t.item['id']}", _clip(shown(t.item, lang), 24), fmt_qar(t.item["price"]))
        for t in found.many
    )
    return [OutboundMessage(
        to=contact["id"], kind="list", body=say("several_match", lang), choices=rows, lang=lang,
    )]


async def _card_for(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, item_id: UUID,
    media: MediaService, orders_on: bool,
) -> list[OutboundMessage] | None:
    clock = await shop_clock.load(conn)
    if not await conn.fetchval("select true from items where id = $1 and status = 'live'", item_id):
        return None
    return [await _card(conn, contact, lang, clock, item_id, media, orders_on)]


async def _card(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, clock: shop_clock.ShopClock,
    item_id: UUID, media: MediaService, orders_on: bool,
) -> OutboundMessage:
    """One item as a message: photo, name, price, and what the customer can do."""
    entry = await service.get(conn, clock, item_id)
    view = service.view(entry, clock)
    state = entry.state(clock)
    await photos.add_to_views(conn, media, [view])
    item = entry.item
    name = shown(item, lang)
    lines = [f"*{name}*"]
    described = (item["description_ar"] if lang == "ar" else item["description"]) or (
        item["description"] or item["description_ar"]
    )
    if described:
        lines.append(_clip(described.strip(), 200))
    now = availability.item_price(item, clock.now)
    deltas = [v["price_delta"] for v in entry.active_variants]
    price = fmt_qar(now + min(deltas)) if deltas else fmt_qar(now)
    price = say("card_from", lang, price=price) if len(set(deltas)) > 1 else price
    if availability.sale_active(item, clock.now):
        price += " " + say("card_was", lang, was=fmt_qar(item["price"]))
    lines.append(price)
    named = [shown(v, lang) for v in entry.active_variants if v["name"] or v["name_ar"]]
    if named:
        lines.append(say("card_choices", lang, list=", ".join(named)))
    buttons: list[Choice] = []
    if state.orderable:
        if state.left is not None and 0 < state.left <= 5:
            lines.append(say("card_left", lang, n=state.left))
        if orders_on:
            buttons.append(Choice("order", say("button_order", lang)))
    elif state.reason in ("sold_out", "off"):
        lines.append(say("card_sold_out", lang))
        buttons.append(Choice(f"notify:{item_id}", say("button_notify", lang)))
        # They asked for something the shop cannot give: the weekly report counts it.
        await demand.record(conn, contact["id"], [item_id], "whatsapp", clock.now)
    else:
        when = state.next_at or state.next_date
        if when is not None:
            lines.append(say("card_when", lang, when=text.when_text(when, clock.today, lang)))
        else:
            lines.append(say("card_closed", lang))
        if orders_on:
            buttons.append(Choice("order", say("button_order", lang)))
    body = _clip("\n".join(lines), MAX_BODY)
    cover = view["cover"]
    jpeg = (
        await media.jpeg_for(conn, UUID(cover["id"])) if cover["state"] == "ready" else None
    )
    if buttons:
        return OutboundMessage(
            to=contact["id"], kind="buttons", body=body, choices=tuple(buttons), lang=lang,
            image=jpeg or b"", image_type="image/jpeg",
        )
    if jpeg:
        return OutboundMessage(
            to=contact["id"], kind="image", body=body, image=jpeg, image_type="image/jpeg",
            lang=lang,
        )
    return OutboundMessage(to=contact["id"], body=body, lang=lang)


async def _menu(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, lang: str, web_url: str,
    orders_on: bool,
) -> list[OutboundMessage] | None:
    clock = await shop_clock.load(conn)
    entries = [e for e in await _live(conn, clock) if e.state(clock).orderable]
    if not entries:
        return None  # nothing to show: the order page's link answers, as before
    shop = await _shop_name(conn, tenant_id, lang)
    slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
    link = order_link(web_url, slug, contact["id"], tenant_id) if orders_on and slug else ""
    shown_here = entries[:10]
    rows = tuple(
        Choice(
            f"item:{e.item['id']}", _clip(shown(e.item, lang), 24),
            fmt_qar(availability.item_price(e.item, clock.now)),
        )
        for e in shown_here
    )
    code = "menu_body" if len(entries) <= 10 else "menu_body_more"
    body = say(code, lang, shop=shop, link=link) if link else say("menu_pick", lang)
    return [OutboundMessage(to=contact["id"], kind="list", body=body, choices=rows, lang=lang)]


# ── tell me when it is back ──────────────────────────────────────────────────────────


async def _notify_by_name(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, lang: str,
    words: list[str], web_url: str,
) -> list[OutboundMessage]:
    clock = await shop_clock.load(conn)
    found = match.find(words, await _live(conn, clock), with_variants=False) if words else None
    if found is None or (found.one is None and not found.many):
        example = say("help_example", lang)
        return [OutboundMessage(
            to=contact["id"], body=say("notify_unknown", lang, example=example), lang=lang
        )]
    if found.one is not None:
        return await _ask_to_notify(
            conn, tenant_id, contact, lang, found.one.item["id"], web_url
        )
    rows = tuple(
        Choice(f"notify:{t.item['id']}", _clip(shown(t.item, lang), 24), fmt_qar(t.item["price"]))
        for t in found.many
    )
    return [OutboundMessage(
        to=contact["id"], kind="list", body=say("several_match", lang), choices=rows, lang=lang,
    )]


async def _ask_to_notify(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, lang: str,
    item_id: UUID, web_url: str,
) -> list[OutboundMessage]:
    clock = await shop_clock.load(conn)
    entry = await service.get(conn, clock, item_id)
    if entry is None or entry.item["status"] != "live":
        return [OutboundMessage(
            to=contact["id"], body=say("notify_unknown", lang, example=say("help_example", lang)),
            lang=lang,
        )]
    name = shown(entry.item, lang)
    if entry.state(clock).orderable:
        # Nothing to wait for. Say so and give the way to order it.
        slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
        link = order_link(web_url, slug, contact["id"], tenant_id)
        return [OutboundMessage(
            to=contact["id"], body=say("notify_in_stock", lang, name=name, link=link), lang=lang
        )]
    if entry.state(clock).reason in ("sold_out", "off"):
        await demand.record(conn, contact["id"], [item_id], "whatsapp", clock.now)
    if await watches.waiting_for(conn, contact["id"], item_id):
        return [OutboundMessage(
            to=contact["id"], body=say("notify_already", lang, name=name), lang=lang
        )]
    shop = await _shop_name(conn, tenant_id, lang)
    if await consent.current(conn, contact["id"], "service") == "revoked":
        # They said STOP and have not said START: nothing is sent until they do.
        return [OutboundMessage(
            to=contact["id"], body=say("notify_opted_out", lang, shop=shop), lang=lang
        )]
    if await consent.current(conn, contact["id"], "back_in_stock") == "granted":
        # They already agreed to be told when an item is back: one request is enough.
        await watches.add(conn, contact["id"], item_id)
        return [OutboundMessage(
            to=contact["id"], body=say("notify_done", lang, name=name), lang=lang
        )]
    return [OutboundMessage(
        to=contact["id"], kind="buttons", lang=lang,
        body=say("notify_ask", lang, name=name, shop=shop),
        choices=(
            Choice(f"notify_yes:{item_id}", say("button_yes", lang)),
            Choice(f"notify_no:{item_id}", say("button_no", lang)),
        ),
    )]


async def _agreed(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, lang: str,
    item_id: UUID, web_url: str,
) -> list[OutboundMessage]:
    """The customer tapped Yes. Their agreement is recorded with the words they were shown,
    then the request is made. This is the only place a request for an item that is still
    sold out is made for a customer who has not agreed before."""
    clock = await shop_clock.load(conn)
    entry = await service.get(conn, clock, item_id)
    if entry is None or entry.item["status"] != "live":
        return [OutboundMessage(
            to=contact["id"], body=say("notify_unknown", lang, example=say("help_example", lang)),
            lang=lang,
        )]
    name = shown(entry.item, lang)
    if entry.state(clock).orderable:
        slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
        return [OutboundMessage(
            to=contact["id"], lang=lang,
            body=say("notify_in_stock", lang, name=name,
                     link=order_link(web_url, slug, contact["id"], tenant_id)),
        )]
    shop = await _shop_name(conn, tenant_id, lang)
    if await consent.current(conn, contact["id"], "service") == "revoked":
        return [OutboundMessage(
            to=contact["id"], body=say("notify_opted_out", lang, shop=shop), lang=lang
        )]
    if await consent.current(conn, contact["id"], "back_in_stock") != "granted":
        # What they agreed to is exactly this: one message about this item. It is recorded
        # with the words they were shown, and it is not marketing consent.
        await consent.record(
            conn, contact["id"], "back_in_stock", "granted", "back_in_stock_request",
            say("notify_ask", lang, name=name, shop=shop),
        )
    added = await watches.add(conn, contact["id"], item_id)
    code = "notify_done" if added else "notify_already"
    return [OutboundMessage(to=contact["id"], body=say(code, lang, name=name), lang=lang)]


async def _declined(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, item_id: UUID
) -> list[OutboundMessage]:
    name = await conn.fetchrow("select name, name_ar from items where id = $1", item_id)
    return [OutboundMessage(
        to=contact["id"], lang=lang,
        body=say("notify_declined", lang, name=shown(dict(name), lang) if name else ""),
    )]
