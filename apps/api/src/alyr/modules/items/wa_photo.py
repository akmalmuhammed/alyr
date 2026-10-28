"""A photo from a staff number becomes a draft item (D-039, ALY-106).

Staff send a photo with a caption ("Mixed grill 35", or "شاورما دجاج 12"). The photo goes
through the same pipeline as one uploaded in the workspace (`core/images.py`, `core/media.py`:
type checked by content, location and camera data removed, three sizes), a draft item is
made with it as its cover, and the name and price are read from the caption when it has
them. A draft is never for sale: an owner or manager puts it on sale by tapping the button
in the reply, or in the workspace. A draft made by someone who is not a manager is shown to
the managers.

The download from the channel is slow outside work, so it is a job (`catalog.photo_draft`),
never part of the inbound request. If the download keeps failing the staff member is told
to send the photo again.

Captions: the Latin words are the item's English name, the Arabic words its Arabic name,
and a number (with or without QAR or «ريال») is the price. A caption in one language gives
the item that one name; an Arabic-only caption is kept as both names, as the workspace does.
"""

import logging
import re
from dataclasses import dataclass
from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, OutboundMessage
from alyr.config import Settings
from alyr.core.images import PhotoRefused
from alyr.core.media import MediaService
from alyr.core.normalise import fmt_qar, has_arabic, western_digits
from alyr.core.outbound import Outbound
from alyr.core.team import Actor
from alyr.db import Database
from alyr.modules.items import alerts, drafts, service
from alyr.modules.items import clock as shop_clock
from alyr.modules.items.commands import dirhams
from alyr.modules.items.wa_staff import _log, _plain, _undoable, actor_of
from alyr.modules.items.wa_text import lang_of, say, shown

log = logging.getLogger("alyr.catalog.photo")

MAX_NAME = 120
_CURRENCY = {"qar", "qr", "riyal", "riyals", "ريال", "ر.ق", "رق", "ريالات"}
_NOISE = {"|", "/", "-", "–", "—", ":", ",", "،", "؛", "•"}
_NUMBER = re.compile(r"\d+(?:[.,]\d{1,2})?")


@dataclass(frozen=True)
class Caption:
    name: str = ""
    name_ar: str = ""
    price: int | None = None  # dirhams


def parse_caption(caption: str) -> Caption:
    """Read a photo's caption: the English name, the Arabic name and the price, each only
    if it is there."""
    words = western_digits(caption or "").split()
    price = None
    # The price is a number beside QAR (or «ريال»), or else the caption's last word.
    for index, word in enumerate(words):
        if not _NUMBER.fullmatch(word):
            continue
        beside = (index > 0 and words[index - 1].lower() in _CURRENCY) or (
            index + 1 < len(words) and words[index + 1].lower() in _CURRENCY
        )
        last = index == len(words) - 1 or all(w.lower() in _CURRENCY for w in words[index + 1:])
        if beside or last:
            amount = dirhams(word)
            if amount is not None and amount <= 100_000_000:
                price = amount
                words = words[:index] + words[index + 1:]
            break
    words = [w for w in words if w.lower() not in _CURRENCY and w not in _NOISE]
    arabic = [w for w in words if has_arabic(w)]
    latin = [w for w in words if not has_arabic(w)]
    name, name_ar = " ".join(latin)[:MAX_NAME], " ".join(arabic)[:MAX_NAME]
    return Caption(name or name_ar, name_ar, price)


def _missing(lang: str, name: str, price: int | None) -> str:
    if not name and price is None:
        return say("missing_name_and_price", lang)
    return say("missing_name" if not name else "missing_price", lang)


async def _is_manager(conn: asyncpg.Connection, contact: asyncpg.Record) -> bool:
    return bool(await conn.fetchval(
        "select catalog_manager from contacts where id = $1", contact["id"]
    ))


class PhotoDrafts:
    """Job handler for `catalog.photo_draft`."""

    def __init__(
        self, db: Database, outbound: Outbound, media: MediaService, settings: Settings
    ) -> None:
        self._db, self._outbound, self._media, self._settings = db, outbound, media, settings

    async def _say(
        self, tenant_id: UUID, contact_id: UUID, body: str, lang: str
    ) -> None:
        async with self._db.tenant(tenant_id) as conn:
            await self._outbound.send(conn, OutboundMessage(to=contact_id, body=body, lang=lang))

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        contact_id, lang = UUID(payload["contact_id"]), lang_of(payload["lang"])
        async with self._db.tenant(tenant_id) as conn:
            contact = await conn.fetchrow(
                "select id, name, lang, role, catalog_manager from contacts where id = $1",
                contact_id,
            )
        if contact is None or contact["role"] != "staff":
            return  # the number was taken off the staff list since: nothing to do
        channel = self._outbound.channels[payload["channel"]]
        try:
            # Outside any transaction: this is a slow call to the channel.
            data, _ = await channel.download_media(
                payload["media_id"], self._settings.media_max_upload_bytes
            )
        except ValueError:  # larger than we take; trying again will not help
            await self._say(tenant_id, contact_id, say("photo_failed", lang), lang)
            return
        try:
            uploaded = await self._media.upload(tenant_id, data, by=contact["name"])
        except PhotoRefused as refusal:
            await self._say(
                tenant_id, contact_id, refusal.ar if lang == "ar" else refusal.en, lang
            )
            return
        asset_id = UUID(uploaded.photo["id"])
        async with self._db.tenant(tenant_id) as conn:
            for message in await self._make_draft(
                conn, contact, lang, asset_id, parse_caption(payload["caption"])
            ):
                await self._outbound.send(conn, message)

    async def _make_draft(
        self, conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, asset_id: UUID,
        caption: Caption,
    ) -> list[OutboundMessage]:
        clock = await shop_clock.load(conn)
        actor = actor_of(contact)
        made = await drafts.create(conn, self._media, [asset_id], actor, clock)
        if not made["created"]:
            if made["stopped"]:
                return [_plain(contact, say("photo_cap", lang), lang)]
            taken = made["skipped"][0] if made["skipped"] else None
            if taken and taken["reason"] == "already_on_item":
                entry = await service.get(conn, clock, UUID(taken["item_id"]))
                name = shown(entry.item, lang) if entry else ""
                return [_plain(contact, say("photo_already", lang, name=name), lang)]
            return [_plain(contact, say("photo_failed", lang), lang)]
        item = made["created"][0]
        item_id = UUID(item["id"])
        changes = {
            key: value for key, value in (
                ("name", caption.name), ("name_ar", caption.name_ar), ("price", caption.price)
            ) if value
        }
        if changes:
            await service.update_item(
                conn, item_id, changes, actor, clock, reason="Price from a photo's caption"
            )
        change = await _log(conn, contact, "draft", item_id, {}, {"created": True})
        name = caption.name_ar if lang == "ar" and caption.name_ar else caption.name
        if not name or caption.price is None:
            body = say("draft_incomplete", lang, missing=_missing(lang, name, caption.price))
            return [_undoable(contact, body, lang, change)]
        summary = say("draft_summary", lang, name=name, price=fmt_qar(caption.price))
        if await _is_manager(conn, contact):
            return [OutboundMessage(
                to=contact["id"], kind="buttons", lang=lang,
                body=say("draft_saved_ask", lang, summary=summary),
                choices=(
                    Choice(f"on_sale:{item_id}", say("put_on_sale", lang)),
                    Choice(f"undo:{change}", say("undo_button", lang)),
                ),
            )]
        await alerts.draft_added(
            conn, self._outbound, contact, name, fmt_qar(caption.price)
        )
        return [_undoable(contact, say("draft_saved", lang, summary=summary), lang, change)]

    async def gave_up(self, tenant_id: UUID, payload: dict) -> None:
        """The download failed every time: ask the staff member to send the photo again."""
        lang = lang_of(payload.get("lang", "en"))
        await self._say(tenant_id, UUID(payload["contact_id"]), say("photo_failed", lang), lang)


# ── from the staff reply ─────────────────────────────────────────────────────────────


async def put_on_sale(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, item_id: str
) -> list[OutboundMessage]:
    """A manager tapped "Put on sale" under a draft. Only managers may; the item needs a
    name, a price and (Qatar's consumer law) an Arabic name."""
    if not await _is_manager(conn, contact):
        return [_plain(contact, say("on_sale_owner_only", lang), lang)]
    try:
        wanted = UUID(item_id)
    except ValueError:
        return [_plain(contact, say("none_found", lang, query=""), lang)]
    clock = await shop_clock.load(conn)
    entry = await service.get(conn, clock, wanted)
    if entry is None:
        return [_plain(contact, say("none_found", lang, query=""), lang)]
    item = entry.item
    name = shown(item, lang)
    if item["status"] != "draft":
        return [_plain(contact, say("already_back", lang, name=name), lang)]
    if not (item["name"] or item["name_ar"]) or item["price"] <= 0:
        return [_plain(contact, say("on_sale_needs_details", lang, name=name), lang)]
    try:
        async with conn.transaction():
            await service.update_item(
                conn, wanted, {"status": "live"}, actor_of(contact), clock
            )
    except service.ItemError as error:
        if error.code == "arabic_needed":
            return [_plain(contact, say("on_sale_needs_arabic", lang, name=name), lang)]
        return [_plain(contact, say("cannot_change", lang, name=name, why=str(error)), lang)]
    change = await _log(conn, contact, "draft", wanted, {"status": "draft"}, {"status": "live"})
    body = say("on_sale_done", lang, name=name, price=fmt_qar(item["price"]))
    return [_undoable(contact, body, lang, change)]


async def take_back(
    conn: asyncpg.Connection, contact: asyncpg.Record, lang: str, clock, entry, before: dict,
    after: dict,
):
    """Undo a draft: remove the one a photo made, or take an item that was put on sale back
    to a draft. None if the item was changed since."""
    item = entry.item
    actor: Actor = actor_of(contact)
    if after.get("created"):
        if item["status"] != "draft":
            return None
        # The photo stays in the shop's library; only its link to this draft goes.
        await conn.execute(
            "delete from media_links where owner_kind = 'item' and owner_id = $1", item["id"]
        )
        await service.remove(conn, item["id"], actor)
        return say("undone_draft", lang)
    if item["status"] != after.get("status"):
        return None
    await service.update_item(conn, item["id"], {"status": before["status"]}, actor, clock)
    return say("undone_on_sale", lang, name=shown(item, lang))
