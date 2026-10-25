"""Attaching a business's Meta number from the back office (ALY-166, spec 023): Meta is asked
first, the row the inbound and outbound paths read is written, the go-live check follows,
and every attach and detach is in the audit log."""

import asyncio
import json
import uuid

import asyncpg
import httpx
import pytest

from alyr.channels import meta
from alyr.db import Database
from conftest import APP_DSN
from test_consent import owner_sql
from test_onboarding import new_business
from test_readiness import line, on_board


@pytest.fixture
def office(client_factory):
    return client_factory()


def number_id():
    return str(uuid.uuid4().int)[:15]


def meta_says(monkeypatch, status="CONNECTED", code=200, message=""):
    """Meta's answer to 'tell me about this number', for the one call attaching makes."""
    seen = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if code != 200:
            return httpx.Response(code, json={"error": {"message": message}})
        return httpx.Response(200, json={
            "id": request.url.path.rsplit("/", 1)[-1], "status": status,
            "display_phone_number": "+974 5555 0188", "verified_name": "Test Shop",
        })

    real = httpx.AsyncClient
    monkeypatch.setattr(
        meta.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handle), **kw)
    )
    return seen


def url(tenant):
    return f"/api/admin/businesses/{tenant}/whatsapp/number"


def meta_rows(tenant):
    return owner_sql(
        "select number_id, waba_id, display_phone, attached_by, attached_at "
        "from channel_numbers where tenant_id = $1 and channel = 'meta'", tenant,
    )


def audit(tenant, action):
    return owner_sql(
        "select detail from platform_audit where business_id = $1 and action = $2 order by id",
        tenant, action,
    )


def test_attaching_a_number_connects_whatsapp_and_is_audited(client, office, monkeypatch):
    tenant, _, _ = new_business(client)
    seen = meta_says(monkeypatch)
    nid = number_id()

    answer = office.post(url(tenant), json={"number_id": f" {nid} ", "waba_id": "123456789"})
    assert answer.status_code == 200, answer.text
    assert line(answer.json(), "whatsapp")["status"] == "done"
    assert seen[0].url.path.endswith(f"/{nid}") and "status" in seen[0].url.params["fields"]

    [row] = meta_rows(tenant)
    assert (row["number_id"], row["waba_id"], row["display_phone"]) == (
        nid, "123456789", "+974 5555 0188",
    )
    assert row["attached_by"] and row["attached_at"]
    # The board shows the number, and the owner's own list shows WhatsApp as done.
    assert on_board(office, tenant)["number"]["number_id"] == nid
    assert line(client.get("/api/onboarding/readiness").json(), "whatsapp")["status"] == "done"
    [entry] = audit(tenant, "whatsapp.attached")
    assert json.loads(entry["detail"])["number_id"] == nid
    # The private test line is still there.
    sims = owner_sql(
        "select 1 from channel_numbers where tenant_id = $1 and channel = 'simulator'", tenant
    )
    assert len(sims) == 1


def test_a_number_meta_does_not_show_as_connected_is_not_attached(client, office, monkeypatch):
    tenant, _, _ = new_business(client)
    meta_says(monkeypatch, status="PENDING")
    answer = office.post(url(tenant), json={"number_id": number_id()})
    assert answer.status_code == 422 and "PENDING" in answer.json()["detail"]
    assert meta_rows(tenant) == [] and audit(tenant, "whatsapp.attached") == []


def test_meta_refusing_the_number_id_says_why(client, office, monkeypatch):
    tenant, _, _ = new_business(client)
    meta_says(monkeypatch, code=400, message="Unsupported get request. Object does not exist")
    answer = office.post(url(tenant), json={"number_id": number_id()})
    assert answer.status_code == 422
    assert "Object does not exist" in answer.json()["detail"]
    assert meta_rows(tenant) == []


def test_ids_that_are_not_ids_never_reach_meta(client, office, monkeypatch):
    tenant, _, _ = new_business(client)
    seen = meta_says(monkeypatch)
    for body in ({"number_id": "../me"}, {"number_id": "12"}, {"number_id": number_id(),
                                                              "waba_id": "abc"}):
        assert office.post(url(tenant), json=body).status_code == 422
    assert seen == []


def test_a_number_belongs_to_one_business_and_a_business_has_one_number(
    client, client_factory, office, monkeypatch
):
    first, _, _ = new_business(client)
    other_client = client_factory()
    second, _, _ = new_business(other_client)
    meta_says(monkeypatch)
    nid = number_id()
    assert office.post(url(first), json={"number_id": nid}).status_code == 200

    taken = office.post(url(second), json={"number_id": nid})
    assert taken.status_code == 422 and "already attached" in taken.json()["detail"]
    again = office.post(url(first), json={"number_id": number_id()})
    assert again.status_code == 422 and "detach" in again.json()["detail"]
    assert meta_rows(second) == [] and len(meta_rows(first)) == 1


def test_detaching_takes_the_number_off_and_whatsapp_is_open_again(client, office, monkeypatch):
    tenant, _, _ = new_business(client)
    meta_says(monkeypatch)
    nid = number_id()
    office.post(url(tenant), json={"number_id": nid})

    state = office.delete(url(tenant))
    assert state.status_code == 200, state.text
    assert line(state.json(), "whatsapp")["status"] != "done"
    assert meta_rows(tenant) == []
    assert on_board(office, tenant)["number"] is None
    assert json.loads(audit(tenant, "whatsapp.detached")[0]["detail"]) == {"number_id": nid}
    assert len(owner_sql(
        "select 1 from channel_numbers where tenant_id = $1 and channel = 'simulator'", tenant
    )) == 1
    # Nothing left to take off.
    assert office.delete(url(tenant)).status_code == 404
    # The same number can be attached again, to this or another business.
    assert office.post(url(tenant), json={"number_id": nid}).status_code == 200


def test_only_alyr_staff_can_attach_or_detach(client, monkeypatch):
    tenant, _, _ = new_business(client)
    meta_says(monkeypatch)
    # The business's own owner is signed in on `client`, and is not staff.
    assert client.post(url(tenant), json={"number_id": number_id()}).status_code == 403
    assert client.delete(url(tenant)).status_code == 403

    async def straight():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await conn.execute(
                        "select admin_attach_whatsapp_number($1, $2, '', '', 'x')",
                        uuid.UUID(str(tenant)), number_id(),
                    )
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await conn.execute(
                        "insert into channel_numbers (number_id, tenant_id, channel) "
                        "values ($1, $2, 'meta')", number_id(), uuid.UUID(str(tenant)),
                    )
        finally:
            await db.close()

    asyncio.run(straight())
    assert meta_rows(tenant) == []
