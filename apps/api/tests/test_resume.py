"""Bring back an owner who stopped partway through setting up (ALY-171, D-068, spec 032)."""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import links, mail, resume
from test_consent import owner_sql
from test_onboarding import BASE, accepted_terms, new_business, signup_token

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)


@pytest.fixture(autouse=True)
def addresses_restored():
    """Owners here get an address that could be real, so the reminders go to them. Put them
    back after, so no other test's business is ever a candidate."""
    yield
    owner_sql(
        "update users set email = id::text || '@shop.example' "
        "where email like '%@shop-test.com'"
    )


@pytest.fixture
def sent(monkeypatch):
    """Mail on, and a list of what was sent (the sign-in codes left out)."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    letters: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" not in body["subject"]:
            letters.append(body)
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return letters


def owner(client, *, hours_ago=25, kind="salon"):
    """A new business whose owner stopped `hours_ago` hours ago, with an address that could be
    real. Answers the tenant, its slug and the address."""
    tenant, slug, _ = new_business(client, kind=kind)
    address = f"owner-{uuid4().hex[:8]}@shop-test.com"
    owner_sql(
        "update users set email = $1 where id = "
        "(select user_id from memberships where tenant_id = $2 and role = 'owner' limit 1)",
        address, tenant,
    )
    owner_sql(
        "update tenants set onboarding_touched_at = now() - make_interval(hours => $2) "
        "where id = $1", tenant, hours_ago,
    )
    return tenant, slug, address


def run(client, now):
    async def go():
        return await resume.send_due(client.app.state.db, now)

    return client.portal.call(go)


def to(letters, address):
    return [m for m in letters if m["to"] == [address]]


def reminders(tenant):
    return owner_sql(
        "select number, step, lang, returned_at from onboarding_reminders where tenant_id = $1 "
        "order by number", tenant,
    )


# ------------------------------------------------------------------------- the first one

def test_nothing_is_sent_before_24_hours(client, sent):
    _, _, address = owner(client, hours_ago=23)
    run(client, datetime.now(UTC))
    assert to(sent, address) == []


def test_the_first_reminder_goes_after_24_hours_with_the_next_step_and_a_link(client, sent):
    tenant, slug, address = owner(client)
    assert run(client, datetime.now(UTC)) >= 1
    [letter] = to(sent, address)
    assert letter["subject"] == "Your ALYR setup is waiting: next, add your services"
    assert "Continue your setup: http://web.test/start" in letter["text"]
    assert f"/start/stop?b={slug}&t=" in letter["text"]
    assert "Hello Hamad," in letter["text"]
    # The links carry no address and no name: nothing personal in a URL.
    assert all("@" not in line for line in letter["text"].split("\n") if "http" in line)
    [row] = reminders(tenant)
    assert (row["number"], row["step"], row["lang"], row["returned_at"]) == (
        1, "services", "en", None,
    )
    # Asking again does not send it twice.
    run(client, datetime.now(UTC))
    assert len(to(sent, address)) == 1


def test_the_step_named_is_the_one_the_owner_is_on(client, sent):
    tenant, _, address = owner(client, kind="bakery")
    # A bakery that follows the order path is named by its own first step.
    owner_sql("update tenants set onboarding_step = 'handover' where id = $1", tenant)
    run(client, datetime.now(UTC))
    [letter] = to(sent, address)
    assert "set pickup, delivery and how customers pay" in letter["subject"]


# ------------------------------------------------------------------ the second, then none

def test_a_second_after_three_days_and_then_none(client, sent):
    tenant, _, address = owner(client)
    t0 = datetime.now(UTC)
    run(client, t0)
    # Too soon for the second: three days from when the owner was last there.
    run(client, t0 + 30 * HOUR)
    assert len(to(sent, address)) == 1
    run(client, t0 + 3 * DAY + HOUR)
    assert len(to(sent, address)) == 2
    # And then never again.
    run(client, t0 + 30 * DAY)
    run(client, t0 + 90 * DAY)
    assert len(to(sent, address)) == 2
    assert [r["number"] for r in reminders(tenant)] == [1, 2]


def test_an_owner_who_moves_on_is_not_reminded_a_day_later(client, sent):
    tenant, _, address = owner(client)
    t0 = datetime.now(UTC)
    run(client, t0)
    # They come back and move on a step: the clock starts again from there.
    assert client.patch(f"{BASE}/state", json={"step": "hours"}).status_code == 200
    run(client, t0 + 2 * DAY)
    assert len(to(sent, address)) == 1
    # They are recorded as having come back (the first time they opened setup after the email).
    assert client.get(f"{BASE}/state").status_code == 200
    assert reminders(tenant)[0]["returned_at"] is not None


# ----------------------------------------------------------------------- who is not asked

def test_never_once_setup_is_finished_or_the_business_is_live(client, client_factory, sent):
    _, _, finished = owner(client)
    assert client.post(f"{BASE}/finish").status_code == 200
    second = client_factory()
    live_tenant, _, live = owner(second)
    owner_sql("update tenants set live_at = now() where id = $1", live_tenant)
    run(client, datetime.now(UTC) + 30 * DAY)
    assert to(sent, finished) == [] and to(sent, live) == []


def test_never_to_an_example_address_or_when_mail_is_not_set_up(client, monkeypatch, sent):
    tenant, _, _ = owner(client)
    owner_sql("update users set email = 'a@shop.example' where id = "
              "(select user_id from memberships where tenant_id = $1 and role = 'owner' limit 1)",
              tenant)
    run(client, datetime.now(UTC))
    assert reminders(tenant) == []
    # With no mail provider at all, nothing is recorded either: the reminder is still due.
    other, _, _ = owner(client)
    monkeypatch.delenv("ALYR_EMAIL_API_KEY")
    get_settings.cache_clear()
    run(client, datetime.now(UTC))
    assert reminders(other) == []


# ---------------------------------------------------------------------------- the language

def test_the_reminder_is_in_the_language_the_owner_reads(client, sent):
    tenant, _, address = owner(client)
    assert client.patch(f"{BASE}/state", json={"lang": "ar"}).status_code == 200
    owner_sql("update tenants set onboarding_touched_at = now() - interval '25 hours' "
              "where id = $1", tenant)
    run(client, datetime.now(UTC))
    [letter] = to(sent, address)
    assert letter["subject"] == "إعداد ALYR بانتظارك: الخطوة التالية، تضيف خدماتك"
    assert 'dir="rtl"' in letter["html"] and "أكمل إعدادك" in letter["text"]
    assert reminders(tenant)[0]["lang"] == "ar"


def test_a_sign_up_in_arabic_is_remembered(client):
    email = f"ar-{uuid4().hex[:6]}@shop.example"
    body = {"signup_token": signup_token(client, email), "owner_name": "A", "name": "Arabic shop",
            "type": "salon", "lang": "ar", "accepted_terms": accepted_terms(client)}
    created = client.post(f"{BASE}/business", json=body)
    assert created.status_code == 200, created.text
    row = owner_sql("select owner_lang from tenants where id = $1", created.json()["created"])
    assert row[0]["owner_lang"] == "ar"
    assert client.patch(f"{BASE}/state", json={"lang": "fr"}).status_code == 422


# -------------------------------------------------------------------------- switching off

def stop_link(letter):
    line = next(x for x in letter["text"].split("\n") if "/start/stop?" in x)
    query = line.split("/start/stop?")[1]
    slug = query.split("b=")[1].split("&")[0]
    return slug, query.split("t=")[1].strip()


def test_the_owner_switches_the_reminders_off_from_the_link(client, sent):
    tenant, slug, address = owner(client)
    t0 = datetime.now(UTC)
    run(client, t0)
    link_slug, token = stop_link(to(sent, address)[0])
    assert link_slug == slug
    stopped = client.post(f"{BASE}/resume/stop", json={"slug": slug, "token": token})
    assert stopped.status_code == 200 and stopped.json() == {"stopped": True}
    assert owner_sql("select resume_reminders from tenants where id = $1", tenant)[0][
        "resume_reminders"
    ] is False
    run(client, t0 + 30 * DAY)
    assert len(to(sent, address)) == 1


def test_the_stop_link_does_nothing_else_and_belongs_to_one_business(client, sent):
    tenant, slug, address = owner(client)
    run(client, datetime.now(UTC))
    _, token = stop_link(to(sent, address)[0])
    other_tenant, other_slug, _ = new_business(client)
    # Another business's address, a mangled token, a customer's order link: none of them stops it.
    assert client.post(f"{BASE}/resume/stop", json={"slug": other_slug, "token": token}
                       ).status_code == 400
    assert client.post(f"{BASE}/resume/stop", json={"slug": slug, "token": token[:-4] + "AAAA"}
                       ).status_code == 400
    assert client.post(f"{BASE}/resume/stop", json={"slug": "no-such", "token": token}
                       ).status_code == 400
    order_token = links.mint(UUID(tenant), UUID(tenant), purpose=links.ORDER)
    assert client.post(f"{BASE}/resume/stop", json={"slug": slug, "token": order_token}
                       ).status_code == 400
    assert owner_sql("select resume_reminders from tenants where id = $1", tenant)[0][
        "resume_reminders"
    ] is True
    # The owner can also switch them off themselves (the client is now the other business's).
    assert client.patch(f"{BASE}/state", json={"resume_reminders": False}).status_code == 200
    assert owner_sql("select resume_reminders from tenants where id = $1", other_tenant)[0][
        "resume_reminders"
    ] is False


# ------------------------------------------------------------------------- the back office

def test_the_funnel_counts_the_reminders_and_the_owners_who_came_back(client, client_factory, sent):
    office = client_factory()
    before = office.get("/api/admin/onboarding/funnel").json()["reminders"]
    owner(client)
    run(client, datetime.now(UTC))
    client.get(f"{BASE}/state")
    after = office.get("/api/admin/onboarding/funnel").json()["reminders"]
    assert after["sent"] == before["sent"] + 1
    assert after["businesses"] == before["businesses"] + 1
    assert after["returned"] == before["returned"] + 1
