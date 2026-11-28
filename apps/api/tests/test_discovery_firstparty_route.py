"""`GET /api/discovery/first-party` (Discovery 2.0, agent C3; api-gaps #1 and U2-15): what ALYR's
records say, for the This week bars and the "Your own data" group. Counts only for every role and
never money; owner and admin see the pages, the number and the names, staff the counts alone; one
business never sees another's. Real PostgreSQL, HTTP in and out."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from discovery_proposals_support import prepared_shop, proposals
from discovery_support import discovery_shop
from test_consent import owner_sql

BASE = "/api/discovery/first-party"
DOHA = ZoneInfo("Asia/Qatar")
ARABIC = range(0x0600, 0x0700)
MONEY = ("total", "amount", "price", "money", "revenue", "qar", "paid", "balance")
WEEKDAYS = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")


def keys_of(value) -> set[str]:
    """Every key anywhere in a JSON answer."""
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys_of(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys_of(v)}
    return set()


def with_orders(tenant_id, days_ago=(7, 14)) -> list[datetime]:
    """Orders switched on, one order at 10:10 (Doha) on each of the given days back, and one
    cancelled order that must not count. Answers the times counted."""
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'orders') "
              "on conflict (tenant_id, module_key) do update set enabled = true", tenant_id)
    contact = owner_sql(
        "insert into contacts (tenant_id, phone, name, wa_user_id) values ($1, '+97450000011', "
        "'C', '97450000011') returning id", tenant_id)[0]["id"]
    today = datetime.now(UTC).astimezone(DOHA).date()
    times = [datetime.combine(today - timedelta(days=n), datetime.min.time(), DOHA)
             .replace(hour=10, minute=10) for n in days_ago]
    number = int(owner_sql("select coalesce(max(number), 0) as n from orders where tenant_id = $1",
                           tenant_id)[0]["n"])
    for i, when in enumerate([*times, times[0]]):
        owner_sql(
            "insert into orders (tenant_id, contact_id, number, total, status, created_at) "
            "values ($1, $2, $3, 4321, $4, $5)",
            tenant_id, contact, number + i + 1, "cancelled" if i == len(times) else "new", when)
    return times


@pytest.fixture
def shop(client_factory, monkeypatch):
    s = prepared_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    s.slug = f"nuqta-{uuid4().hex[:8]}"
    owner_sql("update tenants set slug = $2 where id = $1", s.tenant_id, s.slug)
    with_orders(s.tenant_id)
    return s


def facts(client, **query) -> dict:
    answer = client.get(BASE, params=query)
    assert answer.status_code == 200, answer.text
    return answer.json()


def test_owner_and_admin_see_every_fact_with_where_it_came_from_and_when(shop):
    for client in (shop.owner, shop.admin):
        got = facts(client, lang="en")
        assert got["counts_only"] is False
        assert got["window"]["weeks"] == 4
        start = datetime.fromisoformat(got["window"]["from"]).date()
        assert (datetime.fromisoformat(got["window"]["to"]).date() - start).days == 27
        activity = got["activity"]
        assert activity["orders"] is True
        assert len(activity["days"]) == 28
        assert [d["date"] for d in activity["days"]] == sorted(d["date"] for d in activity["days"])
        assert sum(d["orders"] for d in activity["days"]) == 2  # the cancelled one is left out
        assert all(d["weekday"] in WEEKDAYS for d in activity["days"])
        assert set(activity["hours"]) <= set(WEEKDAYS)
        assert sum(cell["orders"][10] for cell in activity["hours"].values()) == 2
        assert all(len(cell["orders"]) == 24 for cell in activity["hours"].values())
        assert got["links"]["order"].endswith(f"/s/{shop.slug}")
        assert got["links"]["booking"] is None  # bookings are off
        assert got["names"]["en"]
        for fact in (activity, got["links"], got["names"]):
            assert fact["source"] and fact["source_label"] and fact["read_at"] == got["read_at"]
        if got["whatsapp"] is not None:
            assert got["whatsapp"]["number"].startswith("+") and got["whatsapp"]["source_label"]


def test_staff_see_the_counts_alone(shop):
    got = facts(shop.agent, lang="en")
    assert got["counts_only"] is True
    assert (got["links"], got["whatsapp"], got["names"]) == (None, None, None)
    assert sum(d["orders"] for d in got["activity"]["days"]) == 2


def test_no_role_gets_a_figure_of_money(shop):
    for client in (shop.owner, shop.admin, shop.agent):
        got = facts(client)
        assert not {k for k in keys_of(got) if any(m in k.lower() for m in MONEY)}
        assert "4321" not in str(got)  # the orders' total


def test_the_sources_are_worded_in_arabic(shop):
    got = facts(shop.owner, lang="ar")
    for fact in (got["activity"], got["links"], got["names"]):
        assert any(ord(ch) in ARABIC for ch in fact["source_label"]), fact["source_label"]


def test_one_business_never_sees_another(shop, client_factory, monkeypatch):
    other = discovery_shop(client_factory, monkeypatch, roles=("owner",))
    mine, theirs = facts(shop.owner), facts(other.owner)
    assert theirs["activity"] is None  # orders and bookings are off there: nothing is counted
    assert theirs["names"]["en"] != mine["names"]["en"] or theirs["links"] != mine["links"]
    hours = next(p for p in proposals(shop.owner) if p["type"] == "set_hours")
    # A proposal of another business is not found, never shown.
    answer = other.owner.get(BASE, params={"proposal_id": hours["id"]})
    assert answer.status_code == 404, answer.text


def test_a_proposal_gives_the_last_four_of_the_weekday_it_changes(shop):
    hours = next(p for p in proposals(shop.owner) if p["type"] == "set_hours")
    got = facts(shop.owner, proposal_id=hours["id"])
    focus = got["focus"]
    assert focus["proposal_id"] == hours["id"]
    assert focus["day"] in WEEKDAYS
    assert len(focus["weeks"]) == 4
    for week in focus["weeks"]:
        day = datetime.fromisoformat(week["date"]).date()
        assert WEEKDAYS[(day.weekday() + 1) % 7] == focus["day"]
        assert week["orders"] is not None and week["bookings"] is None  # bookings are off


def test_staff_who_do_not_manage_the_place_do_not_get_its_proposal(shop):
    hours = next(p for p in proposals(shop.owner) if p["type"] == "set_hours")
    answer = shop.agent.get(BASE, params={"proposal_id": hours["id"]})
    assert answer.status_code == 404, answer.text


def test_a_shop_without_discovery_gets_nothing(client_factory, monkeypatch):
    off = discovery_shop(client_factory, monkeypatch, module=False)
    assert off.owner.get(BASE).status_code == 404
