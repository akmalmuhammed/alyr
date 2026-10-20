"""Changes to the Catalog's settings are on the activity record with who made them (ALY-113
checklist item 6, D-039): whether agents may edit items, the low-stock number, how sold-out items
look, the alerts, staff numbers, price groups and categories.

Everything goes through the real routes as a signed-in owner or agent. The record is the existing
`activity` table (subject `catalog`); `GET /api/items/settings/activity` reads it for owners and
admins.
"""

from uuid import UUID

import pytest

from alyr.seed import AGENT_EMAIL, OWNER_EMAIL
from test_consent import owner_sql
from test_onboarding import new_business
from test_sign_in import sign_in

RECORD = "/api/items/settings/activity"


def record(client) -> list[dict]:
    answer = client.get(RECORD)
    assert answer.status_code == 200, answer.text
    return answer.json()["activity"]


def changes_of(line) -> dict:
    return {c["field"]: (c["from"], c["to"]) for c in line["detail"]["changes"]}


@pytest.fixture
def owner(client):
    """A new restaurant, signed in as its owner (Hamad)."""
    new_business(client, kind="restaurant")
    return client


def test_changing_a_setting_puts_who_and_what_on_the_record(owner):
    assert record(owner) == []
    saved = owner.put("/api/items/settings", json={"agents_edit_items": True, "low_stock_at": 9})
    assert saved.status_code == 200, saved.text
    [line] = record(owner)
    assert line["action"] == "settings"
    assert line["actor"]["name"] == "Hamad" and line["actor"]["id"] is not None
    assert changes_of(line) == {"agents_edit_items": (False, True), "low_stock_at": (3, 9)}
    assert line["at"]


def test_a_save_that_changes_nothing_writes_nothing(owner):
    owner.put("/api/items/settings", json={"low_stock_at": 9})
    assert len(record(owner)) == 1
    owner.put("/api/items/settings", json={"low_stock_at": 9})
    owner.put("/api/items/settings", json={})
    assert len(record(owner)) == 1
    owner.put("/api/items/settings", json={"low_stock_at": 4})
    newest, older = record(owner)
    assert changes_of(newest) == {"low_stock_at": (9, 4)}
    assert changes_of(older) == {"low_stock_at": (3, 9)}  # newest first


def test_a_refused_save_writes_nothing(owner):
    assert owner.put("/api/items/settings", json={"hold_minutes": 1}).status_code == 422
    assert record(owner) == []


def test_the_types_own_settings_are_on_the_record(owner):
    # A restaurant starts greyed out, "on or off", with the sold-out alert only.
    saved = owner.put(
        "/api/items/setup",
        json={"sold_out": "hide", "new_item_rule": "count", "alerts": {"low_stock": True}},
    )
    assert saved.status_code == 200, saved.text
    [line] = record(owner)
    assert line["action"] == "settings" and line["actor"]["name"] == "Hamad"
    assert changes_of(line) == {
        "sold_out_display": ("grey", "hide"), "new_item_rule": ("switch", "count"),
        "alert_low_stock": (False, True),
    }
    owner.put("/api/items/setup", json={"sold_out": "hide"})
    assert len(record(owner)) == 1  # the same again says nothing new


def test_the_categories_order_is_on_the_record(owner):
    names = [c["name"] for c in owner.get("/api/items/categories").json()["categories"]]
    assert len(names) >= 3
    before = names[:]
    again = [{"name": n, "name_ar": ""} for n in reversed(names)]
    assert owner.put("/api/items/categories", json=again).status_code == 200
    [line] = record(owner)
    assert line["detail"]["changes"][0]["field"] == "categories"
    assert [c["name"] for c in line["detail"]["changes"][0]["from"]] == before
    assert [c["name"] for c in line["detail"]["changes"][0]["to"]] == before[::-1]


def test_staff_numbers_added_changed_and_removed_are_on_the_record(owner):
    added = owner.post(
        "/api/staff-numbers",
        json={"name": "Salma", "phone": "974 5550 0042", "lang": "en", "manager": False},
    )
    assert added.status_code == 200, added.text
    contact = added.json()["id"]
    changed = owner.put(f"/api/staff-numbers/{contact}", json={"manager": True, "lang": "ar"})
    assert changed.status_code == 200
    owner.put(f"/api/staff-numbers/{contact}", json={"manager": True})  # nothing new
    assert owner.delete(f"/api/staff-numbers/{contact}").status_code == 200

    removed, edited, new = record(owner)
    assert (new["action"], new["detail"]["name"], new["detail"]["manager"]) == (
        "staff_added", "Salma", False,
    )
    assert edited["action"] == "staff_changed"
    assert changes_of(edited) == {"lang": ("en", "ar"), "manager": (False, True)}
    assert (removed["action"], removed["detail"]["name"]) == ("staff_removed", "Salma")
    assert {x["subject_id"] for x in (removed, edited, new)} == {contact}
    assert all(x["actor"]["name"] == "Hamad" for x in (removed, edited, new))
    # The person's phone number is not copied onto the record.
    rows = owner_sql("select detail::text as d from activity where subject = 'catalog'")
    assert rows and not any("5550" in r["d"] for r in rows)


def test_registering_a_number_again_is_a_change_not_a_second_person(owner):
    body = {"name": "Salma", "phone": "974 5550 0043", "lang": "en", "manager": False}
    owner.post("/api/staff-numbers", json=body)
    owner.post("/api/staff-numbers", json=body)  # exactly the same: nothing to say
    owner.post("/api/staff-numbers", json={**body, "manager": True})
    again, first = record(owner)
    assert (first["action"], again["action"]) == ("staff_added", "staff_changed")
    assert changes_of(again) == {"manager": (False, True)}


def test_price_groups_added_renamed_and_removed_are_on_the_record(owner):
    group = owner.post("/api/price-groups", json={"name": "Hotels", "name_ar": "فنادق"})
    assert group.status_code == 200, group.text
    group_id = group.json()["group"]["id"]
    assert owner.put(
        f"/api/price-groups/{group_id}", json={"name": "Hotels and cafés", "name_ar": "فنادق"}
    ).status_code == 200
    owner.put(
        f"/api/price-groups/{group_id}", json={"name": "Hotels and cafés", "name_ar": "فنادق"}
    )
    assert owner.delete(f"/api/price-groups/{group_id}").status_code == 200

    removed, renamed, added = record(owner)
    assert (added["action"], added["detail"]["name"]) == ("group_added", "Hotels")
    assert (renamed["action"], renamed["detail"]["name"], renamed["detail"]["was"]) == (
        "group_renamed", "Hotels and cafés", "Hotels",
    )
    assert (removed["action"], removed["detail"]["name"]) == ("group_removed", "Hotels and cafés")
    assert {x["subject_id"] for x in (added, renamed, removed)} == {group_id}
    assert all(x["actor"]["name"] == "Hamad" for x in (added, renamed, removed))


def test_an_agent_cannot_change_settings_or_read_the_record(client):
    sign_in(client, AGENT_EMAIL)
    before = owner_sql("select count(*) as n from activity where subject = 'catalog'")[0]["n"]
    assert client.put("/api/items/settings", json={"agents_edit_items": True}).status_code == 403
    assert client.put("/api/items/setup", json={"sold_out": "hide"}).status_code == 403
    assert client.put("/api/items/categories", json=[]).status_code == 403
    assert client.post("/api/staff-numbers", json={"name": "X", "phone": "97455500099"}
                       ).status_code == 403
    assert client.post("/api/price-groups", json={"name": "X"}).status_code == 403
    assert client.get(RECORD).status_code == 403
    after = owner_sql("select count(*) as n from activity where subject = 'catalog'")[0]["n"]
    assert after == before  # a refused change leaves no line


def test_the_demo_owner_is_named_on_what_they_change(client):
    sign_in(client, OWNER_EMAIL)
    client.put("/api/items/settings", json={"low_stock_at": 11})
    try:
        newest = record(client)[0]
        assert newest["actor"]["name"] and changes_of(newest)["low_stock_at"][1] == 11
    finally:
        client.put("/api/items/settings", json={"low_stock_at": 5})


def test_one_shop_never_sees_another_shops_record(client, client_factory):
    new_business(client, kind="restaurant")
    client.put("/api/items/settings", json={"low_stock_at": 12})
    assert len(record(client)) == 1
    other = client_factory()
    new_business(other, kind="restaurant")
    assert record(other) == []
    other.put("/api/items/settings", json={"low_stock_at": 13})
    assert len(record(other)) == 1 and len(record(client)) == 1
    rows = owner_sql("select tenant_id from activity where subject = 'catalog'")
    assert len({r["tenant_id"] for r in rows if isinstance(r["tenant_id"], UUID)}) >= 2


def test_the_record_cannot_be_rewritten_by_the_app_role():
    import asyncio

    import asyncpg

    from conftest import APP_DSN

    tenant = str(owner_sql("select id from tenants limit 1")[0]["id"])

    async def attempt():
        conn = await asyncpg.connect(APP_DSN)
        try:
            async with conn.transaction():
                await conn.execute("select set_config('app.tenant_id', $1, true)", tenant)
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await conn.execute("update activity set actor_name = 'someone else'")
        finally:
            await conn.close()

    asyncio.run(attempt())
