"""One message to the owner after an import: how many items are low or sold out (ALY-108).

An import's stock numbers are counts, and a count that takes an item down to its low-stock
number would, on any other path, queue that item's own alert (`alerts.py`). A stocktake file
would then send the owner one message for every item, so an import's moves queue none
(`stock.move(..., alerts=False)`). When the import has been applied a job, queued in the same
transaction, looks at the items it gave stock numbers and tells the managers once:
"After your import, 3 items are low or sold out."

It reuses the alerts' own rules and adds none of its own:

* who is told: the managers (`staff.managers`), in their language;
* not at night: between 22:00 and 07:00 on the shop's clock it looks again in the morning;
* an item alerts once a day: the items the message counted are written to `stock_alerts`
  like any alert, so a sale that afternoon does not say it again;
* no new template. The message is plain text and so goes only to a manager whose 24-hour
  window is open; for one whose window is closed nothing is sent and nothing is recorded
  (the Home cards and the Low stock filter show the same numbers).

An import that was undone before the job ran says nothing.

Every function that takes a connection needs a tenant-scoped one.
"""

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.core import jobs
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.items import alerts, events, staff
from alyr.modules.items import clock as shop_clock

JOB = "catalog.import_alert"

# The wording, English and Arabic (a draft until ALY-66). The Arabic reads the same for any
# number, so it needs no plural forms.
ONE = ("After your import, 1 item is low or sold out.",
       "بعد الاستيراد، عدد الأصناف قليلة المخزون أو النافدة: 1.")
MANY = ("After your import, {n} items are low or sold out.",
        "بعد الاستيراد، عدد الأصناف قليلة المخزون أو النافدة: {n}.")


def text(n: int, lang: str) -> str:
    en, ar = ONE if n == 1 else MANY
    return (ar if lang == "ar" else en).format(n=n)


class ImportAlert:
    """Job handler for `catalog.import_alert`. `now` is for tests to hold the clock still."""

    def __init__(
        self, db: Database, outbound: Outbound, now: Callable[[], datetime] | None = None
    ) -> None:
        self._db, self._outbound = db, outbound
        self._now = now or (lambda: alerts.utc_now())

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        async with self._db.tenant(tenant_id) as conn:
            await self.check(conn, UUID(payload["import_id"]))

    async def check(self, conn: asyncpg.Connection, import_id: UUID) -> int | None:
        """Tell the managers how many of the import's items are low or sold out. Returns how
        many managers were told, or None when nothing was said."""
        row = await conn.fetchrow(
            "select status, changes from item_imports where id = $1", import_id
        )
        if row is None or row["status"] != "applied":
            return None
        ids = [UUID(c["id"]) for c in row["changes"] or [] if c.get("stock")]
        # Most of a big file is not short, so look closely only at what could be: an item
        # counted in stock with a size at or below its low-stock number, or one that runs out
        # by a number each day (what is left of the day is worked out by `alerts.state`).
        ids = [r["id"] for r in await conn.fetch(
            "select i.id from items i where i.id = any($1::uuid[]) and i.status = 'live' "
            "and (i.stock_rule = 'daily_limit' or (i.stock_rule = 'count' and exists ("
            "  select 1 from item_variants v where v.item_id = i.id and v.active "
            "  and v.on_hand <= coalesce(i.low_stock_at, "
            "      (select low_stock_at from shop_settings limit 1), $2))))",
            ids, events.DEFAULT_LOW_STOCK,
        )]
        clock = await shop_clock.load(conn, self._now())
        short: list[tuple[UUID, str]] = []
        for item_id in ids:
            found = await alerts.state(conn, clock, item_id)
            if found is not None:
                short.append((item_id, found[0]))
        if not short:
            return None
        if alerts.in_quiet_hours(clock.local):
            # Not at night. Look again in the morning, when it may have been filled again.
            await jobs.enqueue(
                conn, JOB, {"import_id": str(import_id)}, alerts.morning_after(clock.local)
            )
            return None
        told = 0
        for manager in await staff.managers(conn):
            window = await conn.fetchval(
                "select coalesce(last_inbound_at > now() - interval '24 hours', false) "
                "from contacts where id = $1", manager["id"],
            )
            if not window:
                continue  # a template would be needed; there is none for this, so say nothing
            lang = manager["lang"]
            await self._outbound.send(conn, OutboundMessage(
                to=manager["id"], kind="text", body=text(len(short), lang),
                lang="ar" if lang == "ar" else "en",
            ))
            told += 1
        if not told:
            return None
        # These items have been said once today, like any alert.
        await conn.execute(
            "insert into stock_alerts (item_id, kind, day) "
            "select unnest($1::uuid[]), unnest($2::text[]), $3::date on conflict do nothing",
            [i for i, _ in short], [k for _, k in short], clock.today,
        )
        return told

