"""An item as a message in a customer's chat: photo, name, price, code, and what they can do
(D-039, ALY-106; the buttons are ALY-136's).

One card for every way a customer reaches an item: a name, a code, a link, a SKU, or a pick from
the menu. The caller says which buttons an orderable card carries (Confirm and Change when an
order is being put together; none when the shop's chat takes no orders). A sold-out card always
carries "tell me when it is back"; the photo travels with it when one is stored.
"""

from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, OutboundMessage
from alyr.core.media import MediaService
from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.modules.items import availability, demand, features, photos, qty, service, text
from alyr.modules.items import clock as shop_clock
from alyr.modules.items.wa_text import say, shown

MAX_BODY = 1000


def clip(value: str, size: int) -> str:
    return value if len(value) <= size else value[: size - 1] + "…"


def money(lang: str, dirhams: int) -> str:
    """An amount as the customer's language writes it: «24 ر.ق» or "QAR 24"."""
    return fmt_qar_ar(dirhams) if lang == "ar" else fmt_qar(dirhams)


async def build(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, clock: shop_clock.ShopClock,
    item_id: UUID, media: MediaService, *, buttons: tuple[Choice, ...] = (),
    extra: tuple[str, ...] = (), unit_price: int | None = None, variant_label: str = "",
    entry: service.Loaded | None = None,
) -> OutboundMessage:
    """One item as a message. `buttons` go on it when it can be ordered now; `extra` lines
    (a quantity and a total, say) follow the price; `unit_price` replaces the item's own price
    line with what this customer pays for the chosen size."""
    entry = entry or await service.get(conn, clock, item_id)
    view = service.view(entry, clock)
    state = entry.state(clock)
    await photos.add_to_views(conn, media, [view])
    item = entry.item
    name = shown(item, lang)
    lines = [f"*{name}*" + (f" - {variant_label}" if variant_label else "")]
    described = (item["description_ar"] if lang == "ar" else item["description"]) or (
        item["description"] or item["description_ar"]
    )
    if described:
        lines.append(clip(described.strip(), 200))
    now = availability.item_price(item, clock.now)
    deltas = [v["price_delta"] for v in entry.active_variants]
    if unit_price is not None:
        price = money(lang, unit_price)
    else:
        price = money(lang, now + min(deltas)) if deltas else money(lang, now)
        price = say("card_from", lang, price=price) if len(set(deltas)) > 1 else price
        if availability.sale_active(item, clock.now):
            price += " " + say("card_was", lang, was=money(lang, item["price"]))
    lines.append(price)
    if item["code"] is not None and (await features.load(conn)).on("show_sku"):
        lines.append(say("card_code", lang, number=item["code"]))
    named = [shown(v, lang) for v in entry.active_variants if v["name"] or v["name_ar"]]
    if named and not variant_label:
        lines.append(say("card_choices", lang, list=", ".join(named)))
    lines.extend(extra)
    chosen: list[Choice] = []
    if state.orderable:
        if state.left is not None and 0 < state.left <= 5:
            show = qty.shown(item["unit"], item["pack_size"], item["min_order"])
            lines.append(say("card_left", lang, n=qty.label(state.left, item["unit"], show, lang)))
        chosen.extend(buttons)
    elif state.reason in ("sold_out", "off"):
        lines.append(say("card_sold_out", lang))
        if (await features.load(conn)).on("back_in_stock"):
            chosen.append(Choice(f"notify:{item_id}", say("button_notify", lang)))
        # They asked for something the shop cannot give: the weekly report counts it.
        await demand.record(conn, contact["id"], [item_id], "whatsapp", clock.now)
    else:
        when = state.next_at or state.next_date
        if when is not None:
            lines.append(say("card_when", lang, when=text.when_text(when, clock.today, lang)))
        else:
            lines.append(say("card_closed", lang))
    body = clip("\n".join(lines), MAX_BODY)
    cover = view["cover"]
    jpeg = (
        await media.jpeg_for(conn, UUID(cover["id"])) if cover["state"] == "ready" else None
    )
    if chosen:
        return OutboundMessage(
            to=contact["id"], kind="buttons", body=body, choices=tuple(chosen), lang=lang,
            image=jpeg or b"", image_type="image/jpeg",
        )
    if jpeg:
        return OutboundMessage(
            to=contact["id"], kind="image", body=body, image=jpeg, image_type="image/jpeg",
            lang=lang,
        )
    return OutboundMessage(to=contact["id"], body=body, lang=lang)
