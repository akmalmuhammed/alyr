"""Delivery and pickup (ALY-150 part 2, D-039 "As built (pricing pack)",
`specs/014-pricing-pack/spec.md`).

A shop that has switched on "Delivery and pickup" says whether customers may **collect** their
order, may have it **delivered**, and where it delivers and for how much:

* **Zones**: a name in both languages, a fee, an amount above which delivery is free, a minimum
  order, and optionally which days it delivers on and a daily cut-off (an order placed after the
  cut-off is delivered from the next day). No maps, no distances, no driver dispatch: the customer
  chooses a zone from a list and writes the address in words.
* **A flat fee**: one fee for the whole shop. With no zones it is the delivery fee; with zones it
  is "Other areas".

At checkout the customer chooses pickup or delivery; for delivery a zone (unless there is only the
flat fee), the address as text and, if they like, a note. The fee is its own line, kept on the
order with the zone's name as it was (`orders.delivery_*`), and added after the discounts: it is
not discounted. A zone's free-over amount and minimum order are judged on the goods **after**
discounts (what the customer actually pays for the goods). The day it will be delivered is the
first delivery day that is not before the day the items are ready, honouring the cut-off.

Every function takes a tenant-scoped connection.
"""

import re
from dataclasses import dataclass
from datetime import date, time, timedelta
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.normalise import fmt_qar
from alyr.core.team import Actor
from alyr.modules.items import changes, delivery_text, schedule
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.service import BilingualError
from alyr.modules.orders import totals

MAX_ZONES = 30
MAX_MONEY = 100_000_000
MAX_ADDRESS = 300
MAX_NOTE = 200
LOOK_AHEAD = 14  # days
PICKUP, DELIVERY = "pickup", "delivery"
MODES = (PICKUP, DELIVERY)


class DeliveryError(BilingualError):
    """A setting that cannot be saved, or a choice at checkout that cannot be served. `code` is
    stable; the message is safe to show, in both languages."""


def _fail(code: str, en: str, ar: str) -> DeliveryError:
    return DeliveryError(code, en, ar)


def refusal(code: str, details: dict | None = None) -> DeliveryError:
    """A checkout refusal in both languages (`delivery_text.MESSAGES`)."""
    error = _fail(
        code, delivery_text.say(code, "en", details), delivery_text.say(code, "ar", details)
    )
    error.details = details or {}  # type: ignore[attr-defined]
    return error


# ── the shop's settings and zones ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class Zone:
    id: UUID | None  # None: the flat fee ("other areas")
    name: str
    name_ar: str
    fee: int
    free_over: int | None = None
    min_order: int = 0
    cutoff: time | None = None
    days: tuple[int, ...] = ()  # Sunday is 0; empty is every day
    active: bool = True
    sort: int = 0

    def view(self) -> dict:
        return {"id": str(self.id) if self.id else None, "name": self.name,
                "name_ar": self.name_ar}


@dataclass(frozen=True)
class Settings:
    pickup: bool
    delivery: bool
    flat_fee: int | None
    flat_free_over: int | None
    flat_min_order: int


def _zone(row: asyncpg.Record) -> Zone:
    return Zone(
        row["id"], row["name"], row["name_ar"], row["fee"], row["free_over"], row["min_order"],
        row["cutoff"], tuple(row["days"]), row["archived_at"] is None, row["sort"],
    )


async def load_settings(conn: asyncpg.Connection) -> Settings:
    row = await conn.fetchrow("select * from delivery_settings")
    if row is None:
        return Settings(True, False, None, None, 0)
    return Settings(
        row["pickup_enabled"], row["delivery_enabled"], row["flat_fee"], row["flat_free_over"],
        row["flat_min_order"],
    )


async def load_zones(conn: asyncpg.Connection, archived: bool = False) -> list[Zone]:
    rows = await conn.fetch(
        "select * from delivery_zones " + ("" if archived else "where archived_at is null ")
        + "order by sort, created_at, id"
    )
    return [_zone(r) for r in rows]


def flat_zone(settings: Settings, has_zones: bool) -> Zone | None:
    """The flat fee as a zone of its own: the whole delivery when there are no zones, "Other
    areas" when there are."""
    if settings.flat_fee is None:
        return None
    en, ar = ("Other areas", "مناطق أخرى") if has_zones else ("Delivery", "التوصيل")
    return Zone(None, en, ar, settings.flat_fee, settings.flat_free_over, settings.flat_min_order)


async def choices(conn: asyncpg.Connection) -> list[Zone]:
    """Where this shop delivers to, in the order a customer sees: its zones, then "Other areas"
    when there is a flat fee. Empty when the shop does not deliver."""
    settings = await load_settings(conn)
    if not settings.delivery:
        return []
    zones = [z for z in await load_zones(conn) if z.active]
    flat = flat_zone(settings, bool(zones))
    return zones + ([flat] if flat is not None else [])


# ── a customer's choice ─────────────────────────────────────────────────────────────────


def next_day(zone: Zone, clock: ShopClock, earliest: date | None) -> date | None:
    """The day a delivery to `zone` can be made: the first delivery day on or after the day the
    goods are ready, and after today if today's cut-off has passed."""
    start = max(earliest or clock.today, clock.today)
    now = clock.local
    for offset in range(LOOK_AHEAD + 1):
        day = start + timedelta(days=offset)
        if zone.days and schedule.weekday(day) not in zone.days:
            continue
        if day == clock.today and zone.cutoff is not None and now.time() > zone.cutoff:
            continue
        return day
    return None


@dataclass
class Choice:
    """How the order reaches the customer, priced."""

    mode: str  # "pickup" | "delivery"
    zone: Zone | None = None
    address: str = ""
    note: str = ""
    fee: int = 0
    free: bool = False
    deliver_on: date | None = None

    def view(self, clock: ShopClock | None = None) -> dict:
        out: dict = {"mode": self.mode, "fee": self.fee, "fee_text": fmt_qar(self.fee)}
        if self.mode == DELIVERY and self.zone is not None:
            out |= {
                "zone": self.zone.view(), "free": self.free, "address": self.address,
                "note": self.note,
                "deliver_on": self.deliver_on.isoformat() if self.deliver_on else None,
            }
            if clock is not None and self.deliver_on is not None:
                out["deliver_on_text"] = delivery_text.day_text(self.deliver_on, clock.today, "en")
                out["deliver_on_text_ar"] = delivery_text.day_text(
                    self.deliver_on, clock.today, "ar"
                )
        return out


def _clean(value: str | None, limit: int) -> str:
    return " ".join((value or "").split())[:limit]


async def price(
    conn: asyncpg.Connection, clock: ShopClock, request: dict | None, goods: int,
    earliest: date | None = None, strict: bool = True,
) -> Choice:
    """Check a customer's choice and price it. `goods` is the goods after discounts; `earliest`
    the day the items are ready (a made-to-order item's date). `strict` also needs the address
    (an order); the review before it does not. Raises `DeliveryError`."""
    settings = await load_settings(conn)
    request = request or {}
    mode = request.get("mode")
    if mode not in MODES:
        if settings.pickup and not settings.delivery:
            mode = PICKUP
        elif settings.delivery and not settings.pickup:
            mode = DELIVERY
        else:
            raise refusal("fulfilment_required")
    if mode == PICKUP:
        if not settings.pickup:
            raise refusal("pickup_off")
        return Choice(PICKUP)
    if not settings.delivery:
        raise refusal("delivery_off")
    where = await choices(conn)
    zone_id = request.get("zone_id")
    zone = None
    if zone_id:
        zone = next((z for z in where if z.id is not None and str(z.id) == str(zone_id)), None)
        if zone is None:
            raise refusal("zone_unknown")
    else:
        # No zone named: the flat fee, when that is all there is or "Other areas" is offered.
        zone = next((z for z in where if z.id is None), None)
        if zone is None:
            raise refusal("zone_required")
    address = _clean(request.get("address"), MAX_ADDRESS)
    if strict and len(address) < 3:
        raise refusal("address_required")
    if goods < zone.min_order:
        raise refusal("delivery_minimum", {
            "zone": {"name": zone.name, "name_ar": zone.name_ar}, "minimum": zone.min_order,
        })
    day = next_day(zone, clock, earliest)
    if day is None:
        raise refusal("delivery_no_day", {"zone": {"name": zone.name, "name_ar": zone.name_ar}})
    fee = totals.delivery_fee(zone.fee, zone.free_over, goods)
    return Choice(
        DELIVERY, zone, address, _clean(request.get("note"), MAX_NOTE), fee,
        fee == 0 and zone.fee > 0, day,
    )


# ── what the order page may know ────────────────────────────────────────────────────────


async def public(conn: asyncpg.Connection, clock: ShopClock) -> dict:
    """The options a customer is offered: pickup, delivery, and each zone with its fee, its free
    over amount, its minimum, the days it delivers and the cut-off, in words."""
    settings = await load_settings(conn)
    zones = []
    for z in await choices(conn):
        day = next_day(z, clock, None)
        zones.append({
            **z.view(), "fee": z.fee, "free_over": z.free_over, "min_order": z.min_order,
            "days": list(z.days),
            "days_text": delivery_text.days_text(z.days, "en"),
            "days_text_ar": delivery_text.days_text(z.days, "ar"),
            "cutoff": z.cutoff.strftime("%H:%M") if z.cutoff else None,
            "cutoff_text": delivery_text.cutoff_text(z.cutoff, "en"),
            "cutoff_text_ar": delivery_text.cutoff_text(z.cutoff, "ar"),
            "next_day": day.isoformat() if day else None,
            "next_day_text": delivery_text.day_text(day, clock.today, "en") if day else None,
            "next_day_text_ar": delivery_text.day_text(day, clock.today, "ar") if day else None,
        })
    return {"pickup": settings.pickup, "delivery": settings.delivery, "zones": zones}


# ── the owner's settings ────────────────────────────────────────────────────────────────


def _money(value, what_en: str, what_ar: str, *, none_ok: bool = True) -> int | None:
    if value is None or value == "":
        if none_ok:
            return None
        raise _fail("bad_amount", f"Say {what_en}.", f"اكتب {what_ar}.")
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_MONEY:
        raise _fail("bad_amount", f"{what_en.capitalize()} must be an amount of zero or more.",
                    f"يجب أن يكون {what_ar} مبلغاً صفراً أو أكثر.")
    return value


def _time(value) -> time | None:
    if value in (None, ""):
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, str) and re.match(r"^\d{1,2}:\d{2}(:\d{2})?$", value):
        hour, minute = (int(x) for x in value.split(":")[:2])
        if 0 <= hour < 24 and 0 <= minute < 60:
            return time(hour, minute)
    raise _fail("bad_cutoff", "Write the cut-off as a time, for example 14:00.",
                "اكتب وقت الإغلاق كوقت، مثل 14:00.")


def _days(value) -> list[int]:
    out = sorted({int(d) for d in (value or [])})
    if any(d < 0 or d > 6 for d in out):
        raise _fail("bad_days", "Choose days of the week.", "اختر أياماً من الأسبوع.")
    return [] if len(out) == 7 else out


def zone_view(z: Zone) -> dict:
    return {
        "id": str(z.id), "name": z.name, "name_ar": z.name_ar, "fee": z.fee,
        "fee_text": fmt_qar(z.fee), "free_over": z.free_over, "min_order": z.min_order,
        "cutoff": z.cutoff.strftime("%H:%M") if z.cutoff else None, "days": list(z.days),
        "days_text": delivery_text.days_text(z.days, "en"),
        "days_text_ar": delivery_text.days_text(z.days, "ar"), "active": z.active,
        "sort": z.sort,
    }


async def view(conn: asyncpg.Connection) -> dict:
    """The settings screen: the switches, the flat fee and every zone."""
    settings = await load_settings(conn)
    zones = await load_zones(conn, archived=True)
    return {
        "pickup": settings.pickup, "delivery": settings.delivery,
        "flat_fee": settings.flat_fee, "flat_free_over": settings.flat_free_over,
        "flat_min_order": settings.flat_min_order,
        "zones": [zone_view(z) for z in zones if z.active],
        "archived": [zone_view(z) for z in zones if not z.active],
        "limits": {"zones": MAX_ZONES},
    }


async def save_settings(conn: asyncpg.Connection, actor: Actor, data: dict) -> dict:
    """Pickup and delivery on or off, and the flat fee. At least one of pickup and delivery stays
    on, and delivery on needs a zone or a flat fee to charge by."""
    before = await load_settings(conn)
    pickup = bool(data.get("pickup", before.pickup))
    delivery = bool(data.get("delivery", before.delivery))
    flat_fee = _money(data.get("flat_fee", before.flat_fee), "the flat fee", "الرسوم الثابتة")
    flat_free_over = _money(
        data.get("flat_free_over", before.flat_free_over), "the free-over amount",
        "حد التوصيل المجاني",
    )
    flat_min = _money(
        data.get("flat_min_order", before.flat_min_order), "the minimum order",
        "الحد الأدنى للطلب", none_ok=False,
    ) or 0
    if not pickup and not delivery:
        raise _fail("need_one", "Keep at least one of pickup and delivery on.",
                    "أبقِ الاستلام أو التوصيل مفعّلاً على الأقل.")
    zones = [z for z in await load_zones(conn) if z.active]
    if delivery and not zones and flat_fee is None:
        raise _fail("need_fee", "To deliver, add a zone or set a flat delivery fee.",
                    "للتوصيل، أضف منطقة أو حدد رسوم توصيل ثابتة.")
    await conn.execute(
        "insert into delivery_settings (pickup_enabled, delivery_enabled, flat_fee, "
        "flat_free_over, flat_min_order) values ($1, $2, $3, $4, $5) "
        "on conflict (tenant_id) do update set pickup_enabled = excluded.pickup_enabled, "
        "delivery_enabled = excluded.delivery_enabled, flat_fee = excluded.flat_fee, "
        "flat_free_over = excluded.flat_free_over, flat_min_order = excluded.flat_min_order, "
        "updated_at = now()",
        pickup, delivery, flat_fee, flat_free_over, flat_min,
    )
    after = Settings(pickup, delivery, flat_fee, flat_free_over, flat_min)
    delta = changes.differences(
        {k: getattr(before, k) for k in after.__dataclass_fields__},
        {k: getattr(after, k) for k in after.__dataclass_fields__},
    )
    if delta:
        await team.record(
            conn, changes.SUBJECT, await changes.shop_id(conn), "delivery_settings", actor, None,
            {"changes": delta},
        )
    return await view(conn)


async def _zone_fields(
    conn: asyncpg.Connection, data: dict, current: asyncpg.Record | None
) -> dict:
    def get(key, default=None):
        return data.get(key, current[key] if current is not None else default)

    name = _clean(get("name", ""), 60)
    name_ar = _clean(get("name_ar", ""), 60)
    if not name and not name_ar:
        raise _fail("name_needed", "Give the zone a name.", "أعطِ المنطقة اسماً.")
    return {
        "name": name or name_ar, "name_ar": name_ar or name,
        "fee": _money(get("fee"), "the fee", "الرسوم", none_ok=False),
        "free_over": _money(get("free_over"), "the free-over amount", "حد التوصيل المجاني"),
        "min_order": _money(get("min_order", 0), "the minimum order", "الحد الأدنى للطلب",
                            none_ok=False) or 0,
        "cutoff": _time(get("cutoff")),
        "days": _days(get("days", [])),
    }


async def save_zone(
    conn: asyncpg.Connection, actor: Actor, data: dict, zone_id: UUID | None = None
) -> dict:
    current = None
    if zone_id is not None:
        current = await conn.fetchrow("select * from delivery_zones where id = $1", zone_id)
        if current is None:
            raise _fail("not_found", "That zone does not exist.", "هذه المنطقة غير موجودة.")
    elif await conn.fetchval(
        "select count(*) from delivery_zones where archived_at is null"
    ) >= MAX_ZONES:
        raise _fail("too_many", f"You can have up to {MAX_ZONES} zones.",
                    f"يمكنك امتلاك {MAX_ZONES} منطقة على الأكثر.")
    fields = await _zone_fields(conn, data, current)
    if current is None:
        row = await conn.fetchrow(
            "insert into delivery_zones (name, name_ar, fee, free_over, min_order, cutoff, days, "
            "sort) values ($1, $2, $3, $4, $5, $6, $7, "
            "coalesce((select max(sort) + 1 from delivery_zones), 0)) returning *",
            fields["name"], fields["name_ar"], fields["fee"], fields["free_over"],
            fields["min_order"], fields["cutoff"], fields["days"],
        )
        action = "delivery_zone_added"
    else:
        row = await conn.fetchrow(
            "update delivery_zones set name = $2, name_ar = $3, fee = $4, free_over = $5, "
            "min_order = $6, cutoff = $7, days = $8, updated_at = now() where id = $1 returning *",
            zone_id, fields["name"], fields["name_ar"], fields["fee"], fields["free_over"],
            fields["min_order"], fields["cutoff"], fields["days"],
        )
        action = "delivery_zone_changed"
    delta = changes.differences(
        {k: _plain(current[k]) for k in fields} if current is not None else {},
        {k: _plain(v) for k, v in fields.items()},
    )
    if current is None or delta:
        await team.record(
            conn, changes.SUBJECT, row["id"], action, actor, None,
            {"name": row["name"], "changes": delta or None},
        )
    return zone_view(_zone(row))


def _plain(value):
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return list(value) if isinstance(value, (list, tuple)) else value


async def archive_zone(
    conn: asyncpg.Connection, actor: Actor, zone_id: UUID, restore: bool = False
) -> dict | None:
    """A zone taken away is archived, never deleted: orders keep its name as it was. The shop
    cannot be left delivering with nowhere to deliver to."""
    row = await conn.fetchrow("select * from delivery_zones where id = $1 for update", zone_id)
    if row is None:
        return None
    if restore:
        if row["archived_at"] is not None:
            await conn.execute(
                "update delivery_zones set archived_at = null, updated_at = now() where id = $1",
                zone_id,
            )
    elif row["archived_at"] is None:
        settings = await load_settings(conn)
        others = await conn.fetchval(
            "select count(*) from delivery_zones where archived_at is null and id <> $1", zone_id
        )
        if settings.delivery and not others and settings.flat_fee is None:
            raise _fail(
                "last_zone",
                "This is the only place you deliver to. Add another zone or a flat fee first, "
                "or switch delivery off.",
                "هذه هي المنطقة الوحيدة التي توصّل إليها. أضف منطقة أخرى أو رسوماً ثابتة أولاً، "
                "أو أوقف التوصيل.",
            )
        await conn.execute(
            "update delivery_zones set archived_at = now(), updated_at = now() where id = $1",
            zone_id,
        )
    await team.record(
        conn, changes.SUBJECT, zone_id, "delivery_zone_restored" if restore else
        "delivery_zone_archived", actor, None, {"name": row["name"]},
    )
    updated = await conn.fetchrow("select * from delivery_zones where id = $1", zone_id)
    return zone_view(_zone(updated))


# ── on the order ────────────────────────────────────────────────────────────────────────


def snapshot(order: asyncpg.Record) -> dict | None:
    """How an order reached its customer, as it was when it was placed. None for an order made
    before the feature, or by a shop that does not use it."""
    if not order["fulfilment"]:
        return None
    out: dict = {"mode": order["fulfilment"], "fee": order["delivery_fee"],
                 "fee_text": fmt_qar(order["delivery_fee"])}
    if order["fulfilment"] == DELIVERY:
        out |= {
            "zone": order["delivery_zone_name"], "zone_ar": order["delivery_zone_name_ar"],
            "address": order["delivery_address"], "note": order["delivery_note"],
            "deliver_on": order["delivery_on"].isoformat() if order["delivery_on"] else None,
        }
    return out


