"""Telling the shop's managers about their stock and their money (D-039, ALY-106).

* **Low stock and sold out.** When a sale (or a count) takes a counted item down to its
  low-stock number, or to nothing, a job (`catalog.stock_alert`, queued by `events.py`)
  tells the managers. An item alerts at most once a day for each of the two (low, then sold
  out), the day being the shop's own, and not at night: an alert that falls between
  22:00 and 07:00 on the shop's clock waits for the morning and is looked at again then,
  so an item that was refilled overnight says nothing.
* **A refund is due.** When staff cancel an order the customer already paid for, or a
  payment arrives for an order whose payment link had expired, the managers are told which
  order, how much, and that the refund is theirs to make: ALYR never holds the shop's money.
* **A draft is waiting.** Someone who is not a manager sent a photo for a new item.

The managers are the staff numbers the owner marked as such (`staff.managers`). Inside a
number's 24-hour window the message is ordinary text; outside it, a template (`templates.py`).

Every function that takes a connection needs a tenant-scoped one.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime, time, timedelta
from uuid import UUID

import asyncpg

from alyr.core import templates
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import events, listing, service, staff, template
from alyr.modules.items.availability import STOCKED
from alyr.modules.items.wa_text import say, shown

log = logging.getLogger("alyr.catalog.alerts")

QUIET_FROM = time(22, 0)
QUIET_TO = time(7, 0)


def utc_now() -> datetime:
    """The moment the alerts judge by. A function of its own so a test can hold it still."""
    return datetime.now(UTC)


def in_quiet_hours(local: datetime) -> bool:
    """Is it night on the shop's clock? `local` is a time on that clock."""
    now = local.time()
    return now >= QUIET_FROM or now < QUIET_TO


def morning_after(local: datetime) -> datetime:
    """The next 07:00 on the shop's clock, as an aware time."""
    morning = local.replace(
        hour=QUIET_TO.hour, minute=QUIET_TO.minute, second=0, microsecond=0
    )
    return morning if morning > local else morning + timedelta(days=1)


async def _shop(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(
        "select name, name_ar from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    return {"name": row["name"], "name_ar": row["name_ar"] or row["name"]}


async def _tell(
    conn: asyncpg.Connection, outbound: Outbound, template: str,
    build: Callable[[str, dict], tuple[str, tuple]], skip: UUID | None = None,
) -> int:
    """Send each manager the message `build(lang, shop)` makes for their language: the
    text used inside their window, and the template's values. Returns how many were told."""
    shop = await _shop(conn)
    told = 0
    for manager in await staff.managers(conn):
        if manager["id"] == skip:
            continue
        lang = manager["lang"]
        body, params = build(lang, shop)
        await outbound.send(conn, templates.notice(manager["id"], template, lang, body, *params))
        told += 1
    return told


# ── refunds and drafts ───────────────────────────────────────────────────────────────


async def refund_due(
    conn: asyncpg.Connection, outbound: Outbound, number: int | str, amount: str,
    late: bool = False,
) -> int:
    """Tell the managers a refund is theirs to make. `late` is a payment that reached an
    order after its payment link expired."""
    code = "alert_refund_late" if late else "alert_refund"

    def build(lang: str, shop: dict) -> tuple[str, tuple]:
        title = shop["name_ar"] if lang == "ar" else shop["name"]
        body = say(code, lang, number=number, amount=amount)
        params = (title, amount, number) if late else (title, number, amount)
        return body, params

    return await _tell(conn, outbound, "refund_due_late" if late else "refund_due", build)


async def draft_added(
    conn: asyncpg.Connection, outbound: Outbound, sender: asyncpg.Record, name: str,
    price: str,
) -> int:
    """A staff member who is not a manager sent a photo for a new item."""

    def build(lang: str, shop: dict) -> tuple[str, tuple]:
        title = shop["name_ar"] if lang == "ar" else shop["name"]
        summary = say("draft_summary", lang, name=name, price=price)
        return (
            say("alert_draft", lang, who=sender["name"], summary=summary),
            (title, sender["name"], summary),
        )

    return await _tell(conn, outbound, "draft_added", build, skip=sender["id"])


# ── low stock and sold out ───────────────────────────────────────────────────────────


def _low_variants(view: dict, limit: int) -> list[dict]:
    return [v for v in view["variants"] if v["active"] and v["left"] and 0 < v["left"] <= limit]


def _left_text(view: dict, low: list[dict], lang: str) -> str:
    """"3", or "Black M: 2, Black L: 1" for an item with sizes."""
    if len(view["variants"]) == 1 or all(not v["name"] and not v["name_ar"] for v in low):
        return str(min(v["left"] for v in low))
    return ", ".join(
        say("alert_left_each", lang, variant=shown(v, lang), n=v["left"]) for v in low
    )


async def state(
    conn: asyncpg.Connection, clock: shop_clock.ShopClock, item_id: UUID
) -> tuple[str, dict, list[dict]] | None:
    """Is this item low or sold out right now? ("low" or "sold_out", the item's view, and the
    sizes that are low), or None when it is not on sale, not counted, or not short."""
    entry = await service.get(conn, clock, item_id)
    if entry is None or entry.item["status"] != "live":
        return None
    if entry.item["stock_rule"] not in STOCKED:
        return None
    view = service.view(entry, clock)
    limit = view["low_stock_at"]
    if limit is None:
        limit = await listing.low_stock_at(conn)
    if view["availability"]["reason"] == "sold_out":
        return "sold_out", view, []
    if low := _low_variants(view, limit):
        return "low", view, low
    return None


class StockAlerts:
    """Job handler for `catalog.stock_alert`. `now` is for tests to hold the clock still."""

    def __init__(
        self, db: Database, outbound: Outbound, now: Callable[[], datetime] | None = None
    ) -> None:
        self._db, self._outbound = db, outbound
        self._now = now or (lambda: utc_now())

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        async with self._db.tenant(tenant_id) as conn:
            await self.check(conn, UUID(payload["item_id"]))

    async def check(self, conn: asyncpg.Connection, item_id: UUID) -> str | None:
        """Look at one item as it is now and tell the managers if it is low or sold out
        and they have not been told today. Returns what was sent ("low", "sold_out"), or
        None."""
        clock = await shop_clock.load(conn, self._now())
        found = await state(conn, clock, item_id)
        if found is None:
            return None  # not on sale, not counted, filled again since, or never was low
        kind, view, low = found
        if not await template.alert_on(conn, "sold_out" if kind == "sold_out" else "low_stock"):
            return None  # the owner switched this alert off (the type's starting values)
        if in_quiet_hours(clock.local):
            # Not at night. Look again in the morning; if it is still true, say so then.
            await events.queue(conn, events.STOCK_ALERT, item_id, morning_after(clock.local))
            return None
        if not await staff.managers(conn):
            return None
        fresh = await conn.fetchval(
            "insert into stock_alerts (item_id, kind, day) values ($1, $2, $3) "
            "on conflict do nothing returning true",
            item_id, kind, clock.today,
        )
        if not fresh:
            return None  # this item has already alerted today

        def build(lang: str, shop: dict) -> tuple[str, tuple]:
            title = shop["name_ar"] if lang == "ar" else shop["name"]
            name = shown(view, lang)
            if kind == "sold_out":
                return say("alert_sold_out", lang, name=name), (title, name)
            left = _left_text(view, low, lang)
            return say("alert_low", lang, name=name, left=left), (title, name, left)

        await _tell(
            conn, self._outbound, "stock_sold_out" if kind == "sold_out" else "stock_low", build
        )
        return kind
