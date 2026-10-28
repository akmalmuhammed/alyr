"""Terms and the privacy notice, accepted at sign-up and again when a new version is published
(ALY-167, D-067, spec 031)."""

from uuid import uuid4

import asyncpg
import pytest

from alyr.seed import AGENT_EMAIL
from test_consent import owner_sql
from test_onboarding import BASE, accepted_terms, new_business, signup_token
from test_sign_in import sign_in

ADMIN = "/api/admin"


@pytest.fixture(autouse=True)
def versions_restored():
    """The list of versions is ALYR's own and shared by the whole run: take away whatever a
    test published (versions called `test-...`) and the acceptances of them."""
    yield
    owner_sql(
        "delete from terms_acceptances where version_id in "
        "(select id from terms_versions where version like 'test-%')"
    )
    owner_sql("delete from terms_versions where version like 'test-%'")


@pytest.fixture
def office(client_factory):
    """The back office. On a local machine the unsigned demo user counts as ALYR staff."""
    return client_factory()


def publish(office, kind="agreement", version=None, **over):
    body = {
        "kind": kind, "version": version or f"test-{uuid4().hex[:6]}",
        "title": "Customer agreement", "title_ar": "اتفاقية العميل",
        "url": "/agreement", "url_ar": "/ar/agreement",
        "changes": "Payment terms are clearer.", "changes_ar": "شروط الدفع أوضح.",
    }
    return office.post(f"{ADMIN}/terms", json={**body, **over})


def mine(client):
    return client.get(f"{BASE}/terms").json()


# ----------------------------------------------------------------------------- the list

def test_a_new_owner_is_shown_the_privacy_notice_as_it_is_published(client):
    shown = client.get(f"{BASE}/terms/current").json()["current"]
    assert [(t["kind"], t["url"], t["url_ar"]) for t in shown] == [
        ("privacy", "/privacy", "/ar/privacy")
    ]
    assert shown[0]["version"] == "2026-10-28" and shown[0]["accepted_at"] is None


# ---------------------------------------------------------------------- at sign-up

def test_a_new_owner_cannot_create_a_business_without_accepting(client):
    before = owner_sql("select count(*)::int as n from tenants")[0]["n"]
    body = {"signup_token": signup_token(client, f"nt-{uuid4().hex[:6]}@shop.example"),
            "owner_name": "A", "name": "No terms", "type": "salon"}
    refused = client.post(f"{BASE}/business", json=body)
    assert refused.status_code == 422 and "accept the terms" in refused.json()["detail"]
    # Ticking a version that is not the current one does not count either.
    stale = client.post(f"{BASE}/business", json={**body, "accepted_terms": [str(uuid4())]})
    assert stale.status_code == 422
    assert owner_sql("select count(*)::int as n from tenants")[0]["n"] == before
    # The token was not spent by the refusals: accepting now creates the business.
    ok = client.post(f"{BASE}/business", json={**body, "accepted_terms": accepted_terms(client)})
    assert ok.status_code == 200, ok.text


def test_what_the_owner_accepted_is_recorded_with_who_when_and_where(client):
    tenant, _, _ = new_business(client)
    rows = owner_sql(
        "select a.accepted_by, a.user_id, a.accepted_at, a.ip, a.user_agent, v.kind, v.version "
        "from terms_acceptances a join terms_versions v on v.id = a.version_id "
        "where a.tenant_id = $1", tenant,
    )
    assert len(rows) == 1
    row = rows[0]
    assert (row["kind"], row["version"], row["accepted_by"]) == ("privacy", "2026-10-28", "Hamad")
    assert row["user_id"] is not None and row["accepted_at"] is not None
    assert row["ip"] and row["user_agent"]
    assert mine(client)["pending"] == []


# ---------------------------------------------------------------- the go-live check

def checks(client):
    return {c["key"]: c["status"] for c in client.get(f"{BASE}/readiness").json()["checks"]}


def test_the_go_live_list_has_a_terms_line_that_is_done_after_sign_up(client):
    new_business(client)
    assert checks(client)["terms"] == "done"
    line = next(c for c in client.get(f"{BASE}/readiness").json()["checks"] if c["key"] == "terms")
    assert line["label"]["en"] == "You accepted the terms and the privacy notice"
    assert line["label"]["ar"]


# ------------------------------------------------------------------- a new version

def test_a_new_version_asks_every_owner_once(client, client_factory, office):
    new_business(client)
    second = client_factory()
    new_business(second)

    published = publish(office)
    assert published.status_code == 200, published.text
    agreement = published.json()
    assert agreement["kind"] == "agreement"

    for owner in (client, second):
        state = mine(owner)
        assert [t["kind"] for t in state["pending"]] == ["agreement"]
        assert checks(owner)["terms"] == "todo"
    # A person who signs up now is asked for both.
    assert {t["kind"] for t in client.get(f"{BASE}/terms/current").json()["current"]} == {
        "agreement", "privacy",
    }

    accepted = client.post(f"{BASE}/terms/accept", json={"version_ids": [agreement["id"]]})
    assert accepted.status_code == 200 and accepted.json()["pending"] == []
    assert checks(client)["terms"] == "done"
    # The other owner has not accepted, so is still asked.
    assert [t["kind"] for t in mine(second)["pending"]] == ["agreement"]
    # Accepting again records nothing more.
    client.post(f"{BASE}/terms/accept", json={"version_ids": [agreement["id"]]})
    assert owner_sql(
        "select count(*)::int as n from terms_acceptances where version_id = $1::uuid",
        agreement["id"],
    )[0]["n"] == 1


def test_a_newer_version_of_the_same_kind_replaces_the_one_before(client, office):
    new_business(client)
    first = publish(office, version="test-a").json()
    second = publish(office, version="test-b").json()
    assert [t["id"] for t in mine(client)["pending"]] == [second["id"]]
    # Accepting the one that is no longer current is refused: read the new one.
    refused = client.post(f"{BASE}/terms/accept", json={"version_ids": [first["id"]]})
    assert refused.status_code == 409 and "changed" in refused.json()["detail"]


def test_only_the_owner_accepts_for_the_business(client, client_factory, office):
    publish(office)
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    pending = mine(agent)["pending"]
    refused = agent.post(f"{BASE}/terms/accept", json={"version_ids": [t["id"] for t in pending]})
    assert refused.status_code == 403


# --------------------------------------------------------------------- the back office

def test_only_alyr_staff_publish_a_version(client):
    new_business(client)
    refused = publish(client)
    assert refused.status_code == 403


def test_a_published_version_is_checked_and_never_changes(office):
    bad_url = publish(office, url="javascript:alert(1)")
    assert bad_url.status_code == 422
    protocol_relative = publish(office, url_ar="//evil.example/x")
    assert protocol_relative.status_code == 422
    assert publish(office, title_ar="").status_code == 422
    assert publish(office, kind="other").status_code == 422
    version = f"test-{uuid4().hex[:6]}"
    assert publish(office, version=version).status_code == 200
    twice = publish(office, version=version)
    assert twice.status_code == 422 and "new version" in twice.json()["detail"]
    listed = office.get(f"{ADMIN}/terms").json()["versions"]
    mine_ = next(v for v in listed if v["version"] == version)
    assert mine_["is_current"] is True and mine_["published_by"]


def test_the_record_is_append_only_for_the_application(client):
    """Neither a published version nor an acceptance can be changed or removed by the
    application's own database role, whatever the code does."""
    tenant, _, _ = new_business(client)

    async def attempts(conn):
        refused = 0
        for statement in (
            "update terms_versions set title = 'x'",
            "delete from terms_versions",
            "update terms_acceptances set accepted_by = 'x'",
            "delete from terms_acceptances",
        ):
            try:
                async with conn.transaction():
                    await conn.execute("select set_config('app.platform_admin', 'on', true)")
                    await conn.execute(statement)
            except asyncpg.InsufficientPrivilegeError:
                refused += 1
        return refused

    async def run():
        async with client.app.state.db.tenant(tenant) as conn:
            return await attempts(conn)

    assert client.portal.call(run) == 4


def test_the_back_office_reads_what_a_business_accepted(client, client_factory, office):
    tenant, _, _ = new_business(client)
    other, _, _ = new_business(client_factory())
    agreement = publish(office).json()
    client.post(f"{BASE}/terms/accept", json={"version_ids": [agreement["id"]]})
    record = office.get(f"{ADMIN}/businesses/{tenant}/terms").json()
    assert [(a["kind"], a["accepted_by"]) for a in record["accepted"]] == [
        ("agreement", "Hamad"), ("privacy", "Hamad"),
    ]
    assert record["pending"] == []
    waiting = office.get(f"{ADMIN}/businesses/{other}/terms").json()
    assert [t["kind"] for t in waiting["pending"]] == ["agreement"]
