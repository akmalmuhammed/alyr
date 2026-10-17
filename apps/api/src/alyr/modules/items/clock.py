"""The shop's own time: its local clock, and where its day begins.

An item's schedule reads the shop's wall clock, and a daily limit starts again when the
shop's day begins, which a bakery may set to 4 am so that a night shift's sales belong to
the day before. Every function that depends on the time takes a `ShopClock`, so a test
can hold it still.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import asyncpg

_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


@dataclass(frozen=True)
class ShopClock:
    now: datetime  # aware, any zone
    tz: ZoneInfo
    day_starts: time = time(0)

    @property
    def local(self) -> datetime:
        return self.now.astimezone(self.tz)

    @property
    def today(self) -> date:
        """The calendar date on the shop's wall."""
        return self.local.date()

    @property
    def shop_day(self) -> date:
        """The day sales count towards: the calendar day, moved back until the shop's
        day begins (at 4 am, 2 am on Tuesday still belongs to Monday)."""
        started = timedelta(hours=self.day_starts.hour, minutes=self.day_starts.minute)
        return (self.local - started).date()


async def load(conn: asyncpg.Connection, now: datetime | None = None) -> ShopClock:
    """The current shop's clock. `conn` must be tenant-scoped."""
    zone = await conn.fetchval(f"select timezone from tenants where id = {_TENANT}")
    starts = await conn.fetchval("select day_starts from shop_settings")
    return ShopClock(now or datetime.now(UTC), ZoneInfo(zone or "Asia/Qatar"), starts or time(0))


async def hold_minutes(conn: asyncpg.Connection) -> int:
    return await conn.fetchval("select hold_minutes from shop_settings") or 30
