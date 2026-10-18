"""The Catalog by WhatsApp, for the shop's registered staff numbers (D-039, ALY-106).

    sold out shawarma     back shawarma     stock abaya black M 5     price shawarma 12

in English or Arabic. ALYR says back what it understood and offers Undo. If a name fits
several items it asks which one, with numbers, and never guesses (`match.py`). Everything
goes through the same service functions the workspace uses, so the stock log, the price
history and the activity record say who made the change (the staff member's name) and that
it came by WhatsApp.

This runs only for a number the owner registered as staff (`staff.py`), and only in a shop
whose `catalog` module is on. Anyone else's message never gets here: it is answered like
any customer's, so nothing they send reveals that these commands exist.

A message that is not a Catalog command returns None and is left to the other modules
(staff also record credit sales and payments by message).

The handler runs inside the inbound transaction. It does no slow outside work: a photo is
queued as a job (`wa_photo.py`).
"""

import re
from datetime import date, timedelta
from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core import jobs
from alyr.core.normalise import fmt_qar, has_arabic, western_digits
from alyr.core.team import Actor
from alyr.modules.items import availability, commands, events, match, service, stock
from alyr.modules.items import clock as shop_clock
from alyr.modules.items.wa_text import say, shown

PENDING_FOR = timedelta(minutes=15)
STOCKED = availability.STOCKED
MAX_PRICE = 100_000_000


def actor_of(contact: asyncpg.Record) -> Actor:
    """A staff number has no sign-in: it is its owner-given name, and it came by WhatsApp."""
    return Actor(None, contact["name"], "whatsapp")


def _language(contact: asyncpg.Record, message: InboundMessage) -> str:
    """The language to answer in: the one the staff member wrote in. A photo's caption is an
    item's name, not a sentence, so it counts only when it has no Latin letters at all."""
    if contact["lang"] == "ar":
        return "ar"
    if message.kind == "image":
        latin = re.search("[A-Za-z]", message.text)
        return "ar" if has_arabic(message.text) and not latin else "en"
    return "ar" if has_arabic(message.text) else "en"


def _plain(contact: asyncpg.Record, body: str, lang: str) -> OutboundMessage:
    return OutboundMessage(to=contact["id"], body=body, lang=lang)


def _undoable(contact: asyncpg.Record, body: str, lang: str, change: UUID) -> OutboundMessage:
    return OutboundMessage(
        to=contact["id"], kind="buttons", body=body, lang=lang,
        choices=(Choice(f"undo:{change}", say("undo_button", lang)),),
    )


async def _log(
    conn: asyncpg.Connection, contact: asyncpg.Record, action: str, item_id: UUID,
    before: dict, after: dict,
) -> UUID:
    return await conn.fetchval(
        "insert into staff_changes (contact_id, item_id, action, before, after) "
        "values ($1, $2, $3, $4, $5) returning id",
        contact["id"], item_id, action, before, after,
    )


# ── entry point ──────────────────────────────────────────────────────────────────────


async def maybe_handle(
    conn: asyncpg.Connection, contact: asyncpg.Record, message: InboundMessage,
) -> list[OutboundMessage] | None:
    """Answer if this staff message is a Catalog command, a photo, or the answer to a
    question asked before; otherwise None."""
    lang = _language(contact, message)
    reply = message.reply_id
    if message.kind == "image" and message.media_id:
        await jobs.enqueue(conn, events.PHOTO_DRAFT, {
            "contact_id": str(contact["id"]), "channel": message.channel,
            "media_id": message.media_id, "mime_type": message.mime_type,
            "caption": message.text, "message_id": message.message_id, "lang": lang,
        })
        return []
    if reply.startswith("undo:"):
        return await undo(conn, contact, lang, reply.removeprefix("undo:"))
    if reply.startswith("on_sale:"):
        from alyr.modules.items import wa_photo  # the photo flow owns putting a draft on sale
        return await wa_photo.put_on_sale(conn, contact, lang, reply.removeprefix("on_sale:"))
    if reply.startswith("pick:"):
        return await _pick(conn, contact, lang, reply.removeprefix("pick:"))
    if reply or message.kind not in ("text", "interactive"):
        return None
    asked = western_digits(message.text).strip().rstrip(".)").strip()
    if asked.isdigit() and await _has_question(conn, contact):
        return await _pick(conn, contact, lang, asked)
    command = commands.parse(message.text)
    if command is None:
        return None
    # A new command replaces any question that was waiting.
    await conn.execute("delete from staff_pending where contact_id = $1", contact["id"])
    if command.verb == "help":
        return [_plain(contact, say("help", lang), lang)]
    if command.verb == "undo":
        return await undo(conn, contact, lang, None)
    return await _run(conn, contact, lang, command)


# ── finding the item ─────────────────────────────────────────────────────────────────


async def _run(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, command: commands.Command
) -> list[OutboundMessage]:
    clock = await shop_clock.load(conn)
    example = say("help_example", lang)
    words = match.tokens(command.query)
    if not words:
        return [_plain(contact, say("no_name", lang, example=example), lang)]
    entries = await service.load(conn, clock, "i.status <> 'archived' and not i.is_sample")
    found = match.find(words, entries, with_variants=command.verb != "price")
    if found.one is None and not found.many:
        return [_plain(contact, say("none_found", lang, query=command.query), lang)]
    if found.one is not None:
        return await _apply(
            conn, contact, lang, clock, command.verb, command.number, found.one.item["id"],
            found.one.variant["id"] if found.one.variant else None,
        )
    if found.more:
        return [_plain(contact, say("choose_more", lang, query=command.query), lang)]
    return await _ask(conn, contact, lang, command, found.many)


async def _ask(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str,
    command: commands.Command, targets: list[match.Target],
) -> list[OutboundMessage]:
    """Several items fit. Ask which one, with numbers, and wait for the answer."""
    options = [
        {
            "item_id": str(t.item["id"]),
            "variant_id": str(t.variant["id"]) if t.variant else None,
            "label": match.label(t, lang), "price": fmt_qar(t.item["price"]),
        }
        for t in targets
    ]
    await conn.execute(
        "insert into staff_pending (contact_id, kind, payload) values ($1, 'choose', $2) "
        "on conflict (contact_id) do update set kind = excluded.kind, "
        "payload = excluded.payload, created_at = now()",
        contact["id"],
        {"verb": command.verb, "number": command.number, "options": options, "lang": lang},
    )
    lines = "\n".join(f"{n}. {o['label']} ({o['price']})" for n, o in enumerate(options, 1))
    choices = tuple(
        Choice(f"pick:{n}", _clip(o["label"], 24), o["price"]) for n, o in enumerate(options, 1)
    )
    return [OutboundMessage(
        to=contact["id"], kind="list", body=say("choose", lang, options=lines), lang=lang,
        choices=choices,
    )]


def _clip(text: str, size: int) -> str:
    return text if len(text) <= size else text[: size - 1] + "…"


async def _has_question(conn: asyncpg.Connection, contact: asyncpg.Record) -> bool:
    return bool(await conn.fetchval(
        "select true from staff_pending where contact_id = $1 "
        "and created_at > now() - $2::interval",
        contact["id"], PENDING_FOR,
    ))


async def _pick(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, chosen: str
) -> list[OutboundMessage]:
    row = await conn.fetchrow(
        "select payload from staff_pending where contact_id = $1 "
        "and created_at > now() - $2::interval",
        contact["id"], PENDING_FOR,
    )
    if row is None:
        await conn.execute("delete from staff_pending where contact_id = $1", contact["id"])
        return [_plain(contact, say("choose_expired", lang), lang)]
    payload = row["payload"]
    lang = payload.get("lang", lang)
    options = payload["options"]
    if not chosen.isdigit() or not 1 <= int(chosen) <= len(options):
        lines = "\n".join(
            f"{n}. {o['label']} ({o['price']})" for n, o in enumerate(options, 1)
        )
        return [_plain(contact, say("choose", lang, options=lines), lang)]
    await conn.execute("delete from staff_pending where contact_id = $1", contact["id"])
    option = options[int(chosen) - 1]
    clock = await shop_clock.load(conn)
    return await _apply(
        conn, contact, lang, clock, payload["verb"], payload["number"],
        UUID(option["item_id"]), UUID(option["variant_id"]) if option["variant_id"] else None,
    )


# ── doing it ─────────────────────────────────────────────────────────────────────────


def _refused(contact: asyncpg.Record, lang: str, name: str, error: Exception) -> list:
    """The service said no. Its message is English; Arabic readers get a general line."""
    why = str(error) if lang == "en" else "هذا التغيير غير مسموح. راجع الكتالوج."
    return [_plain(contact, say("cannot_change", lang, name=name, why=why), lang)]


async def _apply(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, clock: shop_clock.ShopClock,
    verb: str, number: str | None, item_id: UUID, variant_id: UUID | None,
) -> list[OutboundMessage]:
    entry = await service.get(conn, clock, item_id)
    if entry is None:
        return [_plain(contact, say("none_found", lang, query=""), lang)]
    item = entry.item
    name = shown(item, lang)
    variant = next((v for v in entry.variants if v["id"] == variant_id), None)
    if verb in ("sold_out", "back"):
        if item["status"] != "live":
            status = say(f"status_{item['status']}", lang)
            return [_plain(contact, say("not_live", lang, name=name, status=status), lang)]
        if item["stock_rule"] == "always":
            return [_plain(contact, say("no_switch", lang, name=name), lang)]
    try:
        async with conn.transaction():  # a savepoint: a refusal leaves nothing half done
            if verb == "sold_out":
                return await _sold_out(conn, contact, lang, clock, entry, variant)
            if verb == "back":
                return await _back(conn, contact, lang, clock, entry, variant)
            if verb == "stock":
                return await _stock(conn, contact, lang, clock, entry, variant, number)
            return await _price(conn, contact, lang, clock, entry, number)
    except (service.ItemError, stock.StockError) as error:
        return _refused(contact, lang, name, error)


async def _sold_out(conn, contact, lang, clock, entry, variant) -> list[OutboundMessage]:
    item = entry.item
    name = shown(item, lang)
    actor = actor_of(contact)
    if variant is not None and item["stock_rule"] in STOCKED:
        label = f"{name} – {shown(variant, lang)}"
        left = availability.variant_left(item, variant, entry.deltas, clock.shop_day)
        if not left:
            return [_plain(contact, say("already_sold_out", lang, name=label), lang)]
        result = await service.record_stock(
            conn, clock, item["id"], "counted", 0, "Sold out, said on WhatsApp", actor,
            variant["id"],
        )
        change = await _log(conn, contact, "sold_out", item["id"], {}, {
            "variant_id": str(variant["id"]), "delta": result["difference"],
            "day": clock.shop_day.isoformat() if item["stock_rule"] == "daily_limit" else None,
        })
        return [_undoable(contact, say("sold_out_variant_done", lang, name=label), lang, change)]
    if not item["available"]:
        return [_plain(contact, say("already_sold_out", lang, name=name), lang)]
    await service.set_available(conn, item["id"], False, actor)
    change = await _log(conn, contact, "sold_out", item["id"], {"available": True},
                        {"available": False})
    return [_undoable(contact, say("sold_out_done", lang, name=name), lang, change)]


async def _back(conn, contact, lang, clock, entry, variant) -> list[OutboundMessage]:
    item = entry.item
    name = shown(item, lang)
    if variant is not None and item["stock_rule"] in STOCKED:
        label = f"{name} – {shown(variant, lang)}"
        return [_plain(contact, say("back_variant_needs_number", lang, name=label), lang)]
    counted = item["stock_rule"] in STOCKED
    empty = counted and entry.state(clock).left == 0
    if item["available"]:
        body = say("back_no_stock" if empty else "already_back", lang, name=name)
        return [_plain(contact, body, lang)]
    await service.set_available(conn, item["id"], True, actor_of(contact))
    change = await _log(conn, contact, "back", item["id"], {"available": False},
                        {"available": True})
    body = say("back_no_stock" if empty else "back_done", lang, name=name)
    return [_undoable(contact, body, lang, change)]


async def _stock(conn, contact, lang, clock, entry, variant, number) -> list[OutboundMessage]:
    item = entry.item
    name = shown(item, lang)
    if item["stock_rule"] not in STOCKED:
        return [_plain(contact, say("not_counted", lang, name=name), lang)]
    if number is None:
        return [_plain(contact, say("no_number_stock", lang, name=name), lang)]
    count = commands.whole_number(number)
    if count is None:
        return [_plain(contact, say("bad_stock_number", lang, name=name), lang)]
    if variant is None:
        active = [v for v in entry.variants if v["active"]]
        if len(active) > 1:
            # Which size or colour? Ask, with the number already chosen.
            targets = [match.Target(item, v) for v in active]
            if len(targets) > match.MAX_CHOICES:
                return [_plain(contact, say("choose_more", lang, query=name), lang)]
            return await _ask(
                conn, contact, lang, commands.Command("stock", name, number), targets
            )
        variant = active[0]
    label = name if not variant["name"] and not variant["name_ar"] else (
        f"{name} – {shown(variant, lang)}"
    )
    actor = actor_of(contact)
    result = await service.record_stock(
        conn, clock, item["id"], "counted", count, "Set on WhatsApp", actor, variant["id"]
    )
    if not result["difference"]:
        return [_plain(contact, say("stock_same", lang, name=label, n=count), lang)]
    day = clock.shop_day.isoformat() if item["stock_rule"] == "daily_limit" else None
    change = await _log(conn, contact, "stock", item["id"], {}, {
        "variant_id": str(variant["id"]), "delta": result["difference"], "day": day,
        "before": result["before"], "counted": count,
    })
    body = say("stock_done", lang, name=label, n=count, before=result["before"])
    return [_undoable(contact, body, lang, change)]


async def _price(conn, contact, lang, clock, entry, number) -> list[OutboundMessage]:
    item = entry.item
    name = shown(item, lang)
    if number is None:
        return [_plain(contact, say("no_number_price", lang, name=name), lang)]
    amount = commands.dirhams(number)
    if amount is None:
        return [_plain(contact, say("bad_price_number", lang, name=name), lang)]
    if amount > MAX_PRICE:
        return [_plain(contact, say("price_too_big", lang), lang)]
    if amount == item["price"]:
        return [_plain(contact, say("price_same", lang, name=name, price=fmt_qar(amount)), lang)]
    before = item["price"]
    await service.update_item(
        conn, item["id"], {"price": amount}, actor_of(contact), clock, reason="Set on WhatsApp"
    )
    change = await _log(conn, contact, "price", item["id"], {"price": before}, {"price": amount})
    body = say("price_done", lang, name=name, price=fmt_qar(amount), before=fmt_qar(before))
    return [_undoable(contact, body, lang, change)]


# ── undo ─────────────────────────────────────────────────────────────────────────────


async def undo(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, change_id: str | None
) -> list[OutboundMessage]:
    """Put back the change the Undo button belongs to, or, for the word "undo", the staff
    member's newest change. Each change is undone once, and only by the person who made
    it. A thing that was changed again since is left alone and named."""
    wanted = None
    if change_id:
        try:
            wanted = UUID(change_id)
        except ValueError:
            return [_plain(contact, say("undo_nothing", lang), lang)]
    row = await conn.fetchrow(
        "select * from staff_changes where contact_id = $1 "
        "and (($2::uuid is not null and id = $2) or ($2::uuid is null and undone_at is null)) "
        "order by created_at desc limit 1 for update",
        contact["id"], wanted,
    )
    if row is None:
        return [_plain(contact, say("undo_nothing", lang), lang)]
    if row["undone_at"] is not None:
        return [_plain(contact, say("undo_already", lang), lang)]
    clock = await shop_clock.load(conn)
    entry = await service.get(conn, clock, row["item_id"]) if row["item_id"] else None
    if entry is None:
        return [_plain(contact, say("undo_changed", lang, name=""), lang)]
    name = shown(entry.item, lang)
    try:
        async with conn.transaction():
            body = await _put_back(conn, contact, lang, clock, entry, row, name)
            if body is None:
                return [_plain(contact, say("undo_changed", lang, name=name), lang)]
            if isinstance(body, list):
                return body
    except (service.ItemError, stock.StockError) as error:
        return _refused(contact, lang, name, error)
    await conn.execute("update staff_changes set undone_at = now() where id = $1", row["id"])
    return [_plain(contact, body, lang)]


async def _put_back(conn, contact, lang, clock, entry, row, name):
    """Reverse one change. Returns the words to say, None when it cannot be reversed
    because the thing changed again, or a ready list of messages."""
    item, actor = entry.item, actor_of(contact)
    action, before, after = row["action"], row["before"], row["after"]
    if action in ("sold_out", "back") and "available" in after:
        if item["available"] != after["available"]:
            return None
        await service.set_available(conn, item["id"], before["available"], actor)
        return say("undone_switch_on" if before["available"] else "undone_switch_off",
                   lang, name=name)
    if action in ("sold_out", "stock"):  # a count, or one size set to nothing
        variant_id = UUID(after["variant_id"])
        day = date.fromisoformat(after["day"]) if after.get("day") else None
        balance = await stock.move(
            conn, variant_id, "adjusted", -after["delta"], actor,
            "Undo of a change made on WhatsApp", day,
        )
        if balance is None:
            have = await stock.left(conn, variant_id, day)
            return [_plain(contact, say("undo_short", lang, name=name, n=have), lang)]
        return say("undone_stock", lang, name=name, n=balance)
    if action == "price":
        if item["price"] != after["price"]:
            return None
        await service.update_item(
            conn, item["id"], {"price": before["price"]}, actor, clock,
            reason="Undo of a price set on WhatsApp",
        )
        return say("undone_price", lang, name=name, price=fmt_qar(before["price"]))
    if action == "draft":
        from alyr.modules.items import wa_photo
        return await wa_photo.take_back(conn, contact, lang, clock, entry, before, after)
    return None
