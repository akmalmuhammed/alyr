"""`first_party_facts` (Discovery 2.0, workstream C) read from PostgreSQL through the tenant's own
connection: counts only (no customer, no message), the last 4 full weeks in the shop's time zone,
test and cancelled records left out, and nothing of another shop.
"""

import asyncio
import json
from datetime import date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from alyr.db import Database
from alyr.modules.discovery import firstparty, rules
from conftest import APP_DSN
from discovery_support import listing, location, place
from firstparty_support import (
    CLOSED_FRIDAY,
    FRIDAY_BOOKINGS,
    FRIDAY_ORDERS,
    FRIDAYS,
    NOW,
    REAL_HOURS,
    context,
)
from test_consent import owner_sql

DOHA = ZoneInfo("Asia/Qatar")
WEB = "http://web.test"


def at_hour(day: date, hour: int, minute: int = 10) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=DOHA)


def new_tenant(*, modules=("orders", "bookings")) -> tuple:
    slug = f"nuqta-{uuid4().hex[:8]}"
    tenant = owner_sql(
        "insert into tenants (name, name_ar, slug) values "
        "('Nuqta Car Care', 'نقطة للعناية بالسيارات', $1) returning id", slug)[0]["id"]
    for module in modules:
        owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, $2)",
                  tenant, module)
    return tenant, slug


class Records:
    """Orders and bookings of one shop, made as the owner role (no RLS) so the test controls every
    timestamp."""

    def __init__(self, tenant):
        self.tenant, self.n = tenant, 0
        self.customer = self.contact("+97450000001", "97450000001")
        self.tester = self.contact("+97450000002", "TEST.owner")
        self.service = owner_sql(
            "insert into services (tenant_id, name, duration_minutes) values ($1, 'Wash', 30) "
            "returning id", tenant)[0]["id"]

    def contact(self, phone, wa):
        return owner_sql(
            "insert into contacts (tenant_id, phone, name, wa_user_id) values ($1, $2, 'C', $3) "
            "returning id", self.tenant, phone, wa)[0]["id"]

    def order(self, when: datetime, *, status="new", test=False):
        self.n += 1
        owner_sql(
            "insert into orders (tenant_id, contact_id, number, total, status, created_at) "
            "values ($1, $2, $3, 1500, $4, $5)",
            self.tenant, self.tester if test else self.customer, self.n, status, when)

    def booking(self, when: datetime, *, status="completed", test=False):
        self.n += 1
        owner_sql(
            "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
            "starts_at, ends_at, status, price) values ($1, $2, $3, $4, 'Wash', $5, $6, $7, 0)",
            self.tenant, self.n, self.tester if test else self.customer, self.service, when,
            when + timedelta(minutes=30), status)


def nuqta_records(tenant) -> Records:
    records = Records(tenant)
    for day, hours in zip(FRIDAYS, FRIDAY_ORDERS, strict=True):
        for hour, n in hours.items():
            for _ in range(n):
                records.order(at_hour(day, hour))
    for day, hours in zip(FRIDAYS, FRIDAY_BOOKINGS, strict=True):
        for hour, n in hours.items():
            for _ in range(n):
                records.booking(at_hour(day, hour))
    # None of these count: cancelled, the owner's own test, a week too old, and today.
    records.order(at_hour(FRIDAYS[0], 15, 40), status="cancelled")
    records.order(at_hour(FRIDAYS[1], 16, 40), test=True)
    records.booking(at_hour(FRIDAYS[1], 18, 40), status="cancelled")
    records.booking(at_hour(FRIDAYS[2], 21, 40), test=True)
    records.order(at_hour(FRIDAYS[0] - timedelta(days=7), 15))
    records.order(at_hour(date(2026, 11, 26), 8))
    # The first order the shop ever took with ALYR.
    records.order(at_hour(date(2026, 6, 1), 12))
    return records


def place_with_facts(tenant, *, whatsapp_fact: str | None = "+97455550150"):
    loc = owner_sql(
        "insert into discovery_locations (tenant_id, name, area, is_primary) values "
        "($1, 'Nuqta Car Care - West Bay', 'West Bay', true) returning id", tenant)[0]["id"]
    week = {d: list(v) if v else None for d, v in REAL_HOURS.items()}
    owner_sql(
        "insert into discovery_facts (tenant_id, location_id, key, value, source, "
        "confirmed_name) values ($1, $2, 'hours', $3::jsonb, 'owner', 'Owner')",
        tenant, loc, json.dumps(week))
    if whatsapp_fact:
        owner_sql(
            "insert into discovery_facts (tenant_id, location_id, key, value, source, "
            "confirmed_name) values ($1, $2, 'whatsapp', $3::jsonb, 'owner', 'Owner')",
            tenant, loc, json.dumps({"phone": whatsapp_fact}))
    return loc


def read(tenant, *, scope=None, now=NOW):
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(scope or tenant, readonly=True) as conn:
                return await firstparty.first_party_facts(conn, tenant, now, web_url=WEB)
        finally:
            await db.close()

    return asyncio.run(go())


def test_the_last_four_weeks_of_orders_and_bookings_counted_by_day_and_hour():
    tenant, slug = new_tenant()
    nuqta_records(tenant)
    other, _ = new_tenant()
    noise = Records(other)  # another shop's Friday must not show
    for day in FRIDAYS:
        noise.order(at_hour(day, 9))
        noise.booking(at_hour(day, 9))
    loc = place_with_facts(tenant)

    fp = read(tenant)
    assert fp is not None and fp.timezone == "Asia/Qatar"
    assert fp.today == date(2026, 11, 26)
    assert [d.day for d in fp.activity] == [
        date(2026, 10, 29) + timedelta(days=n) for n in range(28)]
    fridays = [d for d in fp.activity if d.weekday == "fri"]
    assert [d.day for d in fridays] == list(FRIDAYS)
    assert [dict(d.orders) for d in fridays] == list(FRIDAY_ORDERS)
    assert [dict(d.bookings) for d in fridays] == list(FRIDAY_BOOKINGS)
    assert sum(sum(d.orders.values()) for d in fp.activity) == 7
    assert sum(sum(d.bookings.values()) for d in fp.activity) == 11
    assert fp.measured_from == date(2026, 6, 1)
    assert fp.links == firstparty.OwnLinks(f"{WEB}/b/{slug}", f"{WEB}/s/{slug}",
                                           "https://wa.me/97455550150")
    assert (fp.whatsapp, fp.whatsapp_source) == ("+97455550150", "owner")
    assert (fp.name_en, fp.name_ar) == ("Nuqta Car Care", "نقطة للعناية بالسيارات")
    assert fp.confirmed_hours == {loc: REAL_HOURS}
    assert fp.seasons == firstparty.SEASONS


def test_the_facts_hold_counts_only():
    tenant, _ = new_tenant()
    nuqta_records(tenant)
    fp = read(tenant)
    text = repr(fp)
    assert "97450000001" not in text and "TEST." not in text and "Wash" not in text


def test_the_friday_case_end_to_end_from_the_database_to_the_finding():
    tenant, _ = new_tenant()
    nuqta_records(tenant)
    place_with_facts(tenant)
    fp = read(tenant)
    loc = location()
    got = firstparty.RULE_BY_ID["hours_vs_activity"].check(
        context((loc, place(loc, lst=listing(hours=CLOSED_FRIDAY))), fp=fp))
    assert len(got) == 1 and got[0].state == rules.FAIL
    per_date = [e.value for e in got[0].evidence if e.label == "fp_outside_listing"]
    assert per_date == ["~fp_act:2026-10-30:2:3", "~fp_act:2026-11-06:1:2",
                        "~fp_act:2026-11-13:3:4", "~fp_act:2026-11-20:1:2"]


def test_the_confirmed_number_falls_back_to_the_order_page_number_then_the_attached_one():
    tenant, _ = new_tenant()
    place_with_facts(tenant, whatsapp_fact=None)
    owner_sql("insert into channel_numbers (number_id, tenant_id, channel, display_phone) "
              "values ($1, $2, 'meta', '+974 5555 0160')", uuid4().hex[:12].translate(
                  str.maketrans("abcdef", "123456")), tenant)
    assert (read(tenant).whatsapp, read(tenant).whatsapp_source) == ("+97455550160", "meta")
    owner_sql("insert into shop_settings (tenant_id, whatsapp_number) values ($1, '97455550140')",
              tenant)
    fp = read(tenant)
    assert (fp.whatsapp, fp.whatsapp_source) == ("+97455550140", "shop_settings")
    assert fp.links.whatsapp == "https://wa.me/97455550140"


def test_a_shop_without_orders_or_bookings_has_no_activity_and_no_page_links():
    tenant, _ = new_tenant(modules=())
    fp = read(tenant)
    assert fp.activity is None and fp.measured_from is None
    assert fp.links == firstparty.OwnLinks(None, None, None)
    assert fp.whatsapp is None and fp.confirmed_hours == {}


def test_only_bookings_switched_on_counts_bookings_and_leaves_orders_unread():
    tenant, slug = new_tenant(modules=("bookings",))
    nuqta_records(tenant)
    fp = read(tenant)
    assert all(d.orders is None for d in fp.activity)
    assert sum(sum(d.bookings.values()) for d in fp.activity) == 11
    assert fp.links.order is None and fp.links.booking == f"{WEB}/b/{slug}"


def test_it_refuses_a_connection_scoped_to_another_shop():
    tenant, _ = new_tenant()
    other, _ = new_tenant()
    with pytest.raises(firstparty.FirstPartyError):
        read(tenant, scope=other)


def test_a_business_that_does_not_exist_has_no_facts():
    missing = uuid4()
    assert read(missing) is None
