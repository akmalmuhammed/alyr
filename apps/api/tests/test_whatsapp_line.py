"""A business's WhatsApp line after its number is attached (ALY-166, specs/060-whatsapp-line):
the check against Meta, the test message through the outbound layer, the trail, and the staff-only
screen. Meta is the fake in `fake_meta.py`; nothing reaches the network."""

import asyncio
import json
import uuid

import pytest

from alyr.config import get_settings
from alyr.core import whatsapp_line
from alyr.db import Database
from conftest import APP_DSN
from fake_meta import FakeMeta
from test_consent import owner_sql
from test_onboarding import new_business

WABA = "104100200300400"


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def meta(monkeypatch):
    return FakeMeta().install(monkeypatch)


def number_id():
    return str(uuid.uuid4().int)[:15]


def at(tenant, tail=""):
    return f"/api/admin/businesses/{tenant}/whatsapp/{tail}".rstrip("/")


def attach(office, meta, tenant, waba=WABA, **number):
    nid = number_id()
    meta.add_number(nid, waba, **number)
    answer = office.post(at(tenant, "number"), json={"number_id": nid, "waba_id": waba})
    assert answer.status_code == 200, answer.text
    return nid


def staff_on(tenant, nid, phone="97455550188", name="Hamad", lang="en", minutes_ago=5,
             role="staff"):
    rows = owner_sql(
        "insert into contacts (tenant_id, phone, name, role, lang, number_id, last_inbound_at) "
        "values ($1, $2, $3, $4, $5, $6, now() - make_interval(mins => $7)) returning id",
        tenant, phone, name, role, lang, nid, minutes_ago,
    )
    return str(rows[0]["id"])


def trail(tenant):
    return [(r["kind"], r["ok"], r["actor"]) for r in owner_sql(
        "select kind, ok, actor from whatsapp_line_events where tenant_id = $1 order by id",
        tenant)]


def audit(tenant, action):
    return owner_sql(
        "select staff_email, detail from platform_audit where business_id = $1 and action = $2",
        tenant, action)


def the_line(office, tenant):
    answer = office.get(at(tenant, "line"))
    assert answer.status_code == 200, answer.text
    return answer.json()


def check(office, tenant):
    answer = office.post(at(tenant, "line/check"))
    assert answer.status_code == 200, answer.text
    return answer.json()


def by_key(result):
    return {c["key"]: c for c in result["checks"]}


# ── the check ──────────────────────────────────────────────────────────────────────────────


def test_a_healthy_line_passes_every_check_it_can_and_is_saved(client, office, meta):
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    meta.calls.clear()

    result = check(office, tenant)
    checks = by_key(result)
    assert result["ok"] is True
    assert checks["number"]["ok"] and checks["number"]["value"] == "CONNECTED"
    assert checks["account"]["ok"] and checks["webhook"]["ok"]
    # Nobody has written to the line and nothing has gone out yet: not a failure, not known.
    assert checks["inbound"]["ok"] is None and checks["outbound"]["ok"] is None
    # Meta was asked only to read: the number, the account's numbers, the webhook subscription.
    assert [(m, p) for m, p, _, _ in meta.calls] == [
        ("GET", nid), ("GET", f"{WABA}/phone_numbers"), ("GET", f"{WABA}/subscribed_apps")]
    # The saved check is what the screen reads, and it is on the trail and the audit log.
    line = the_line(office, tenant)["line"]
    assert line["state"] == "waiting" and line["checked_at"]
    assert trail(tenant)[-1][:2] == ("checked", True)
    assert audit(tenant, "whatsapp.checked")[0]["staff_email"]


def test_a_number_meta_does_not_show_as_connected_fails_the_check(client, office, meta):
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    meta.numbers[nid]["status"] = "FLAGGED"
    result = check(office, tenant)
    assert result["ok"] is False and by_key(result)["number"]["value"] == "FLAGGED"
    assert the_line(office, tenant)["line"]["state"] == "problem"
    assert trail(tenant)[-1][:2] == ("checked", False)


def test_a_refused_access_token_stops_the_check_with_a_plain_reason(client, office, meta):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.token_ok = False
    meta.calls.clear()
    result = check(office, tenant)
    assert result["ok"] is False
    number = by_key(result)["number"]
    assert number["ok"] is False and "access token" in number["error"]
    # One refusal is not repeated by every later question.
    assert len(meta.calls) == 1
    assert "account" not in by_key(result)


def test_a_number_that_is_not_on_the_account_and_a_missing_webhook_fail(
    client, office, meta, monkeypatch
):
    # ALYR's app ID is how "subscribed" is told from "subscribed to someone else's app".
    monkeypatch.setenv("ALYR_META_APP_ID", meta.app_id)
    get_settings.cache_clear()
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    meta.wabas[WABA]["numbers"].remove(nid)
    meta.wabas[WABA]["apps"].clear()
    checks = by_key(check(office, tenant))
    assert checks["account"]["ok"] is False and checks["account"]["value"] == "not_listed"
    assert checks["webhook"]["ok"] is False and checks["webhook"]["value"] == "not_subscribed"
    # Another app subscribed is also not ours.
    meta.wabas[WABA]["apps"].append("555")
    assert by_key(check(office, tenant))["webhook"]["value"] == "other_app"


def test_a_line_without_an_account_id_cannot_check_the_account_but_does_not_fail(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    nid = number_id()
    meta.add_number(nid)
    assert office.post(at(tenant, "number"), json={"number_id": nid}).status_code == 200
    result = check(office, tenant)
    checks = by_key(result)
    assert result["ok"] is True
    assert checks["account"]["ok"] is None and checks["account"]["value"] == "no_account_id"


def test_the_check_reads_our_own_records_for_a_message_that_arrived_and_one_that_went_out(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    person = staff_on(tenant, nid)
    assert by_key(check(office, tenant))["inbound"]["ok"] is True
    assert by_key(check(office, tenant))["outbound"]["ok"] is None
    owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status) "
        "values ($1, $2, 'out', 'text', 'x', 'delivered')", tenant, uuid.UUID(person))
    assert by_key(check(office, tenant))["outbound"]["ok"] is True
    assert the_line(office, tenant)["line"]["state"] == "working"


def test_nothing_secret_is_kept_on_the_line(client, office, meta):
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    staff_on(tenant, nid)
    check(office, tenant)
    stored = json.dumps([dict(r) for r in owner_sql(
        "select detail::text from whatsapp_line_events where tenant_id = $1", tenant)] + [dict(r)
        for r in owner_sql("select checks::text from whatsapp_line_state where tenant_id = $1",
                           tenant)])
    assert "Bearer" not in stored and "access_token" not in stored
    assert "97455550188" not in stored


# ── the test message ───────────────────────────────────────────────────────────────────────


def test_a_test_message_goes_out_through_the_outbound_layer_to_staff_who_wrote(
    client, office, meta
):
    tenant, _, name = new_business(client)
    nid = attach(office, meta, tenant)
    person = staff_on(tenant, nid, phone="97455550177", name="Hamad")
    seen = the_line(office, tenant)
    assert [(t["id"], t["window_open"]) for t in seen["testers"]] == [(person, True)]

    answer = office.post(at(tenant, "line/test"), json={"contact_id": person})
    assert answer.status_code == 200 and answer.json()["blocked"] is None
    [sent] = meta.sent
    assert sent["to"] == "97455550177" and sent["type"] == "text"
    assert name in sent["text"]["body"] and "ALYR line test" in sent["text"]["body"]
    # The message is on the person's thread, sent, and the screen reads its status from there.
    line = the_line(office, tenant)["line"]
    assert line["test"]["status"] == "sent" and line["test"]["ok"] is True
    assert trail(tenant)[-1][:2] == ("test_sent", True)
    assert audit(tenant, "whatsapp.test_sent")
    # The screen never shows the whole number.
    assert "97455550177" not in json.dumps(the_line(office, tenant))


def test_the_test_is_in_arabic_for_a_member_of_staff_who_writes_in_arabic(client, office, meta):
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    person = staff_on(tenant, nid, lang="ar")
    assert office.post(at(tenant, "line/test"), json={"contact_id": person}).status_code == 200
    body = meta.sent[0]["text"]["body"]
    assert body.startswith("‏") and "اختبار خط ALYR" in body
    assert whatsapp_line.message_for_test("Shop", "en").startswith("ALYR line test for Shop")


def test_nobody_but_the_shops_own_staff_who_wrote_in_the_last_day_can_be_sent_a_test(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    customer = staff_on(tenant, nid, phone="97455550101", role="customer")
    stale = staff_on(tenant, nid, phone="97455550102", minutes_ago=60 * 25)
    elsewhere = staff_on(tenant, "someone-elses-line", phone="97455550103")
    for contact, why in ((customer, "staff"), (stale, "24 hours"), (elsewhere, "staff"),
                         (str(uuid.uuid4()), "staff")):
        answer = office.post(at(tenant, "line/test"), json={"contact_id": contact})
        assert answer.status_code == 422 and why in answer.json()["detail"], answer.text
    assert meta.sent == []
    assert owner_sql("select 1 from messages where tenant_id = $1 and direction = 'out'",
                     tenant) == []
    # Only the staff member appears in the list; a customer is never offered.
    assert {t["id"] for t in the_line(office, tenant)["testers"]} == {stale}


def test_a_test_that_meta_refuses_is_never_shown_as_a_pass(client, office, meta):
    tenant, _, _ = new_business(client)
    nid = attach(office, meta, tenant)
    person = staff_on(tenant, nid)
    meta.refuse[f"{nid}/messages"] = (400, 131047, "Re-engagement message")
    assert office.post(at(tenant, "line/test"), json={"contact_id": person}).status_code == 200
    # The job is retried and finally parked; until then the message is still queued, and the
    # screen does not call that a pass.
    line = the_line(office, tenant)["line"]
    assert line["test"]["ok"] is False
    # The retry would run in whichever test next starts an app; leave nothing queued behind.
    owner_sql("delete from jobs where tenant_id = $1", tenant)


# ── the trail, the list and who may see them ──────────────────────────────────────────────


def test_attach_check_and_detach_are_on_the_trail_in_order_and_detach_clears_the_state(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    check(office, tenant)
    assert office.delete(at(tenant, "number")).status_code == 200
    kinds = [t[0] for t in trail(tenant)]
    assert kinds == ["attached", "checked", "detached"]
    assert all(actor for _, _, actor in trail(tenant))
    assert owner_sql("select 1 from whatsapp_line_state where tenant_id = $1", tenant) == []
    after = the_line(office, tenant)
    assert after["line"] is None and after["events"] == []
    assert office.post(at(tenant, "line/check")).status_code == 404


def test_the_list_shows_every_line_with_its_state_and_counts(client, client_factory, office, meta):
    first, _, _ = new_business(client)
    other = client_factory()
    second, _, _ = new_business(other)
    attach(office, meta, first)
    attach(office, meta, second)
    check(office, first)
    answer = office.get("/api/admin/whatsapp/lines").json()
    states = {line["business_id"]: line["state"] for line in answer["lines"]}
    assert states[first] == "waiting" and states[second] == "unchecked"
    assert answer["counts"]["waiting"] >= 1 and answer["counts"]["unchecked"] >= 1
    assert set(answer["counts"]) == {"unchecked", "problem", "waiting", "working"}


def test_one_business_cannot_read_anothers_trail(client, client_factory, office, meta):
    first, _, _ = new_business(client)
    second, _, _ = new_business(client_factory())
    attach(office, meta, first)
    async def as_second():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(second) as conn:
                return await conn.fetchval("select count(*) from whatsapp_line_events")
        finally:
            await db.close()

    assert asyncio.run(as_second()) == 0


def test_only_alyr_staff_can_use_the_line_screens(client, meta):
    tenant, _, _ = new_business(client)
    # The business's own owner is signed in on `client`, and is not staff.
    assert client.get("/api/admin/whatsapp/lines").status_code == 403
    assert client.get(at(tenant, "line")).status_code == 403
    assert client.post(at(tenant, "line/check")).status_code == 403
    assert client.post(at(tenant, "line/test"), json={"contact_id": str(uuid.uuid4())}
                       ).status_code == 403
    assert meta.calls == []
