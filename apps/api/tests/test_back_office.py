"""The internal tool, phase 1 (D-033): the audit log, Today, staff, and short-lived
back-office sign-ins."""

import asyncio

import asyncpg
import pytest

from alyr.db import Database
from alyr.seed import AHMED_PHONE, ALYR_STAFF_EMAIL, DEMO_TENANT_ID, OWNER_EMAIL
from conftest import APP_DSN
from test_consent import owner_sql, say
from test_onboarding import new_business
from test_pricing import ADMIN, client_of, open_quote, pricing_restored  # noqa: F401
from test_sign_in import sign_in


@pytest.fixture
def office(client_factory):
    return client_factory()


def today(office):
    answer = office.get(f"{ADMIN}/today")
    assert answer.status_code == 200, answer.text
    return answer.json()


def test_every_back_office_change_is_in_the_audit_log(client, office):
    _, _, name = new_business(client)
    detail = client_of(office, name)
    quote = open_quote(detail)
    office.post(f"{ADMIN}/quotes/{quote['id']}/publish")
    office.put(f"{ADMIN}/pricing/promise", json={"en": "A promise", "ar": "وعد"})

    entries = office.get(f"{ADMIN}/audit", params={"client_id": detail["id"]}).json()["entries"]
    assert [e["action"] for e in entries] == ["quote.publish"]
    assert entries[0]["staff_email"] == "local demo" and entries[0]["subject_id"] == quote["id"]
    everything = [e["action"] for e in office.get(f"{ADMIN}/audit").json()["entries"]]
    assert everything[:2] == ["promise.saved", "quote.publish"]


def test_the_audit_log_cannot_be_changed_or_written_around_the_back_office():
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        owner_sql("update platform_audit set action = 'nothing'")
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        owner_sql("delete from platform_audit")

    async def forge():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                await conn.execute(
                    "insert into platform_audit (staff_email, action, subject_type) "
                    "values ('x@x', 'forged', 'nothing')"
                )
        finally:
            await db.close()

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        asyncio.run(forge())


def test_today_lists_new_clients_to_price_and_can_set_them_aside(client, office):
    _, _, name = new_business(client)
    client_id = client_of(office, name)["id"]
    mine = [i for i in today(office)["items"] if i["client_id"] == client_id]
    assert [i["kind"] for i in mine] == ["price"]
    key = mine[0]["key"]

    assert office.post(f"{ADMIN}/today/snooze", json={"key": key, "days": 2}).status_code == 200
    seen = today(office)
    assert key not in [i["key"] for i in seen["items"]]
    assert key in [i["key"] for i in seen["later"]]
    office.post(f"{ADMIN}/today/unsnooze", json={"key": key})
    assert key in [i["key"] for i in today(office)["items"]]


def test_today_flags_a_price_left_unanswered(client, office):
    _, _, name = new_business(client)
    detail = client_of(office, name)
    quote = open_quote(detail)
    office.post(f"{ADMIN}/quotes/{quote['id']}/publish")
    assert not [i for i in today(office)["items"] if i["client_id"] == detail["id"]]
    owner_sql(
        "update quotes set published_at = now() - interval '3 days' where id = $1::uuid",
        quote["id"],
    )
    mine = [i for i in today(office)["items"] if i["client_id"] == detail["id"]]
    assert [i["kind"] for i in mine] == ["answer"]
    assert "3 days" in mine[0]["detail"]


def test_today_shows_failures_as_counts_never_what_customers_wrote(client, office):
    say(client, AHMED_PHONE, "hello")
    owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status) "
        "select $1, id, 'out', 'text', 'A private reply about money', 'failed' "
        "from contacts where tenant_id = $1 limit 1",
        DEMO_TENANT_ID,
    )
    failing = [i for i in today(office)["items"] if i["kind"] == "delivery"]
    assert failing and failing[0]["urgent"] is True
    assert "1 failed messages" in failing[0]["detail"]
    assert "private reply" not in str(today(office))


def test_staff_can_be_added_and_removed_but_never_the_last_one(office):
    added = office.post(f"{ADMIN}/staff", json={"email": "Sara@ALYR.example", "name": "Sara"})
    assert added.status_code == 200, added.text
    assert "sara@alyr.example" in [s["email"] for s in added.json()["staff"]]
    assert office.delete(f"{ADMIN}/staff/sara@alyr.example").status_code == 200
    assert office.post(f"{ADMIN}/staff", json={"email": "not-an-email"}).status_code == 422

    owner_sql("delete from platform_admins where email <> $1", ALYR_STAFF_EMAIL)
    refused = office.delete(f"{ADMIN}/staff/{ALYR_STAFF_EMAIL}")
    assert refused.status_code == 422 and "last" in refused.json()["detail"]


def test_back_office_sign_ins_last_twelve_hours(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    staff = client_factory()
    sign_in(staff, ALYR_STAFF_EMAIL)
    assert staff.get(f"{ADMIN}/today").status_code == 200
    assert staff.delete(f"{ADMIN}/staff/{ALYR_STAFF_EMAIL}").status_code == 422  # not yourself

    owner_sql(
        "update sessions set created_at = now() - interval '13 hours' "
        "where user_id = (select id from users where email = $1)",
        ALYR_STAFF_EMAIL,
    )
    stale = staff.get(f"{ADMIN}/today")
    assert stale.status_code == 401 and "12 hours" in stale.json()["detail"]
    # The same sign-in still works for the person's own workspace.
    assert staff.get("/api/workspace").status_code == 200
    sign_in(staff, ALYR_STAFF_EMAIL)
    assert staff.get(f"{ADMIN}/today").status_code == 200


def test_an_owner_never_reaches_today_staff_or_the_audit_log(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner = client_factory()
    sign_in(owner, OWNER_EMAIL)
    for path in ("today", "audit", "staff"):
        assert owner.get(f"{ADMIN}/{path}").status_code == 403
    snooze = owner.post(f"{ADMIN}/today/snooze", json={"key": "price:x", "days": 1})
    assert snooze.status_code == 403
