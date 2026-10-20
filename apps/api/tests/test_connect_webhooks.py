"""Events out: a shop's other system hears about its documents (ALY-142, spec 016).

Signed, retried with growing waits, logged with the last answer, switched off after sustained
failure with an alert to the owner, and never sent to an address ALYR must not reach (that is
`test_connect_ssrf.py`). The receiver is a small server on this machine; nothing reaches the
outside. `ALYR_WEBHOOK_ALLOW_LOCAL` lets the sender talk to it, and only on a machine that is
`ALYR_ENV=local`.
"""

import json
import time
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.channels.meta import DeliveryStatus
from alyr.core import mail
from connect_support import (
    Receiver,
    connected_shop,
    push_due_webhooks,
    rows,
    sale_body,
    verify_signature,
)
from documents_sales_support import activity, customer, documents
from documents_support import LINES_TOTAL
from test_consent import owner_sql
from test_documents_delivery import Channel


@pytest.fixture
def receiver():
    made = []

    def make(*args, **kwargs):
        r = Receiver(*args, **kwargs)
        made.append(r)
        return r

    yield make
    for r in made:
        r.stop()


@pytest.fixture
def shop(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_WEBHOOK_ALLOW_LOCAL", "true")
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")
    made = connected_shop(client_factory, monkeypatch)
    channel = Channel()
    for client in (made.machine, made.owner):
        client.app.state.outbound.channels["simulator"] = channel
    made.channel = channel
    return made


def register(shop, receiver, events=("document.issued",), **more) -> dict:
    done = shop.owner.post("/api/connect-setup/webhooks", json={
        "url": receiver.url, "events": list(events), **more})
    assert done.status_code == 201, done.text
    return done.json()


def log(shop, webhook_id: str) -> list[dict]:
    return shop.owner.get(f"/api/connect-setup/webhooks/{webhook_id}/deliveries").json()[
        "deliveries"]


# ── signing ──────────────────────────────────────────────────────────────────────────────


def test_an_event_is_signed_and_a_receiver_can_verify_it(shop, receiver):
    hook = receiver()
    made = register(shop, hook)
    assert made["secret"].startswith("whsec_")
    shop.sale(sale_body("W-1"))
    [request] = hook.requests
    assert verify_signature(made["secret"], request)
    assert request["headers"]["x-alyr-event"] == "document.issued"
    assert abs(int(request["headers"]["x-alyr-timestamp"]) - time.time()) < 30
    assert request["headers"]["content-type"] == "application/json"
    event = json.loads(request["body"])
    assert event["type"] == "document.issued" and event["id"] == request["headers"][
        "x-alyr-delivery"]
    assert event["data"]["number"] == "RC-0001" and event["data"]["total_minor"] == LINES_TOTAL
    assert event["data"]["source_ref"] == "W-1" and event["data"]["number_authority"] == "alyr"


def test_a_changed_body_or_another_secret_fails_verification(shop, receiver):
    hook = receiver()
    made = register(shop, hook)
    shop.sale(sale_body("W-2"))
    [request] = hook.requests
    assert verify_signature(made["secret"], request)
    assert not verify_signature("whsec_" + "x" * 43, request)
    assert not verify_signature(made["secret"], {**request, "body": request["body"] + b" "})
    older = {**request, "headers": {**request["headers"],
                                   "x-alyr-timestamp": str(int(time.time()) - 600)}}
    assert not verify_signature(made["secret"], older)  # the timestamp is part of what is signed


def test_an_event_carries_no_customer_name_phone_or_address(shop, receiver):
    hook = receiver()
    register(shop, hook, events=["document.issued", "document.delivered", "document.failed",
                                 "document.cancelled", "payment.recorded"])
    shop.sale(sale_body("W-3", send=True))
    for request in hook.requests:
        text = request["body"].decode()
        assert "Fatima" not in text and "5555" not in text and "فاطمة" not in text


def test_the_secret_is_shown_once_and_can_be_replaced(shop, receiver):
    hook = receiver()
    made = register(shop, hook)
    listed = shop.owner.get("/api/connect-setup/overview").json()["webhooks"][0]
    assert "secret" not in listed and made["secret"] not in json.dumps(listed)
    fresh = shop.owner.post(f"/api/connect-setup/webhooks/{made['webhook']['id']}/rotate-secret")
    assert fresh.status_code == 200 and fresh.json()["secret"] != made["secret"]
    shop.sale(sale_body("W-4"))
    [request] = hook.requests
    assert verify_signature(fresh.json()["secret"], request)
    assert not verify_signature(made["secret"], request)


# ── which events ─────────────────────────────────────────────────────────────────────────


def test_only_the_events_a_shop_asked_for_are_sent(shop, receiver):
    hook = receiver()
    register(shop, hook, events=["payment.recorded"])
    shop.sale(sale_body("W-5"))
    assert hook.requests == []


def test_a_document_issued_inside_alyr_is_announced_too(shop, receiver):
    hook = receiver()
    register(shop, hook)
    made = shop.owner.post("/api/documents", json={
        "kind": "receipt", "customer": {"name": "X"}, "lines": [
            {"description": "Bread", "quantity": "1", "unit_price_minor": 350}],
        "payments": [{"method": "cash", "amount_minor": 350}], "issue": True},
        headers={"Idempotency-Key": "native-issue-0001"})
    assert made.status_code == 201, made.text
    assert [e["data"]["number"] for e in hook.events()] == ["RC-0001"]


def test_cancelled_is_sent_when_credit_notes_cover_the_document(shop, receiver):
    hook = receiver()
    register(shop, hook, events=["document.cancelled"])
    sold = shop.sale(sale_body("W-6"))
    cancelled = shop.owner.post(f"/api/documents/{sold['document']['id']}/cancel",
                                json={"reason": "Customer changed their mind"})
    assert cancelled.status_code == 201
    [event] = hook.events()
    assert event["type"] == "document.cancelled"
    assert event["data"]["document_id"] == sold["document"]["id"]
    assert event["data"]["credit_note_number"] == "CN-0001"


def test_a_payment_recorded_by_hand_is_announced(shop, receiver):
    hook = receiver()
    register(shop, hook, events=["payment.recorded"])
    sold = shop.sale(sale_body("W-7", "invoice"))
    done = shop.owner.post("/api/documents/payments", headers={"Idempotency-Key": "pay-hook-0001"},
                           json={"subject": "invoice", "id": sold["document"]["id"],
                                 "method": "cash", "amount_minor": 5000})
    assert done.status_code == 201, done.text
    [event] = hook.events()
    assert event["type"] == "payment.recorded"
    assert (event["data"]["amount_minor"], event["data"]["method"]) == (5000, "cash")


def test_delivered_and_failed_are_announced_when_whatsapp_reports(shop, receiver):
    hook = receiver()
    register(shop, hook, events=["document.delivered", "document.failed"])
    customer(shop.shop, "Fatima", phone="97455550199", window=True)
    shop.sale(sale_body("W-8", send=True))
    assert hook.requests == []  # sent is not yet delivered
    [wa_id] = [r["wa_message_id"] for r in rows(
        "select wa_message_id from messages where tenant_id = $1 and wa_message_id is not null "
        "and kind = 'document'", shop.tenant_id)]
    number_id = f"sim-{shop.shop.slug}"
    inbound = shop.machine.app.state.inbound
    for status in ("delivered", "read"):
        shop.machine.portal.call(inbound.handle_status,
                                 DeliveryStatus(number_id, wa_id, status))
    delivered = hook.events()
    assert [e["type"] for e in delivered] == ["document.delivered"]  # "read" is not news again
    assert delivered[0]["data"]["number"] == "RC-0001" and delivered[0]["data"]["channel"] == (
        "whatsapp")
    # A message that fails is announced too.
    shop.sale(sale_body("W-9", send=True))
    [wa_id2] = [r["wa_message_id"] for r in rows(
        "select wa_message_id from messages where tenant_id = $1 and wa_message_id is not null "
        "and kind = 'document' and wa_message_id <> $2", shop.tenant_id, wa_id)]
    shop.machine.portal.call(inbound.handle_status, DeliveryStatus(
        number_id, wa_id2, "failed", "recipient not on WhatsApp"))
    failed = [e for e in hook.events() if e["type"] == "document.failed"]
    assert len(failed) == 1 and failed[0]["data"]["reason"] == "recipient not on WhatsApp"


def test_not_delivered_for_a_customer_who_said_stop_is_announced_with_the_reason(shop, receiver):
    hook = receiver()
    register(shop, hook, events=["document.failed"])
    customer(shop.shop, "Fatima", phone="97455550199", window=True, consent="revoked")
    shop.sale(sale_body("W-10", send=True))
    [event] = hook.events()
    assert event["data"]["reason"] == "opted_out" and event["data"]["channel"] == "whatsapp"


def test_not_delivered_for_an_unapproved_template_carries_the_hosted_link(
        client_factory, monkeypatch, receiver):
    monkeypatch.setenv("ALYR_DOCUMENT_TEMPLATES_APPROVED", "false")
    monkeypatch.setenv("ALYR_WEBHOOK_ALLOW_LOCAL", "true")
    shop = connected_shop(client_factory, monkeypatch)
    hook = receiver()
    register(shop, hook, events=["document.failed"])
    shop.sale(sale_body("W-11", send=True))
    [event] = hook.events()
    assert event["data"]["reason"] == "template_not_approved"
    assert event["data"]["hosted_url"].startswith("http")
    assert "/d/" in event["data"]["hosted_url"]


def test_a_test_event_reaches_the_receiver(shop, receiver):
    hook = receiver()
    made = register(shop, hook)
    done = shop.owner.post(f"/api/connect-setup/webhooks/{made['webhook']['id']}/test")
    assert done.status_code == 200
    [event] = hook.events()
    assert event["type"] == "webhook.test"
    assert verify_signature(made["secret"], hook.requests[0])


def test_an_event_that_rolled_back_is_never_sent(shop, receiver, monkeypatch):
    from alyr.modules.documents import delivery

    hook = receiver()
    register(shop, hook)

    async def boom(*args, **kwargs):
        raise RuntimeError("the sale fails after the document was made")

    monkeypatch.setattr(delivery, "queue_connected", boom)
    with pytest.raises(RuntimeError):
        shop.post_sale(sale_body("W-12"), "idem-roll-0001")
    assert hook.requests == [] and documents(shop.shop) == []


# ── retries and the log ──────────────────────────────────────────────────────────────────


def test_a_failing_receiver_is_tried_again_and_then_succeeds(shop, receiver):
    hook = receiver(statuses=[500, 503, 200])
    made = register(shop, hook)
    shop.sale(sale_body("W-20"))
    [row] = log(shop, made["webhook"]["id"])
    assert (row["status"], row["attempts"], row["response_status"]) == ("pending", 1, 500)
    assert row["next_attempt_at"]
    push_due_webhooks(shop)
    push_due_webhooks(shop)
    [row] = log(shop, made["webhook"]["id"])
    assert (row["status"], row["attempts"], row["response_status"]) == ("delivered", 3, 200)
    assert len(hook.requests) == 3
    # The same event every time, so the receiver can ignore a repeat; signed afresh each try.
    assert len({r["headers"]["x-alyr-delivery"] for r in hook.requests}) == 1
    assert all(verify_signature(made["secret"], r) for r in hook.requests)


def test_the_waits_grow_and_eight_failures_end_it(shop, receiver):
    hook = receiver(statuses=[500])
    made = register(shop, hook)
    shop.sale(sale_body("W-21"))
    waits = []
    for _ in range(8):
        pending = rows("select next_attempt_at - last_attempt_at as wait, status, attempts "
                       "from webhook_deliveries where tenant_id = $1", shop.tenant_id)[0]
        if pending["status"] != "pending":
            break
        waits.append(pending["wait"].total_seconds())
        push_due_webhooks(shop)
    assert waits == sorted(waits) and waits[0] <= 31 and waits[-1] >= 21599
    [row] = log(shop, made["webhook"]["id"])
    assert (row["status"], row["attempts"]) == ("failed", 8)
    assert len(hook.requests) == 8


def test_the_log_keeps_the_last_answer_and_never_more_than_a_snippet(shop, receiver):
    hook = receiver(statuses=[500], body=b"x" * 5000)
    made = register(shop, hook)
    shop.sale(sale_body("W-22"))
    [row] = log(shop, made["webhook"]["id"])
    assert row["response_status"] == 500
    assert row["response_snippet"] == "x" * 500
    assert "the receiver answered 500" in row["error"]


def test_a_redirect_is_a_failure_and_is_not_followed(shop, receiver):
    hook = receiver(statuses=[302])
    made = register(shop, hook)
    shop.sale(sale_body("W-23"))
    [row] = log(shop, made["webhook"]["id"])
    assert row["response_status"] == 302 and "redirect" in row["error"]
    assert len(hook.requests) == 1  # nothing went to the address it pointed at


def test_the_log_is_the_shops_own(client_factory, monkeypatch, receiver):
    monkeypatch.setenv("ALYR_WEBHOOK_ALLOW_LOCAL", "true")
    a = connected_shop(client_factory, monkeypatch)
    b = connected_shop(client_factory, monkeypatch)
    hook = receiver()
    made = register(a, hook)
    a.sale(sale_body("W-24"))
    assert b.owner.get(f"/api/connect-setup/webhooks/{made['webhook']['id']}/deliveries"
                       ).status_code == 404
    assert b.owner.delete(f"/api/connect-setup/webhooks/{made['webhook']['id']}"
                          ).status_code == 404


# ── sustained failure ────────────────────────────────────────────────────────────────────


@pytest.fixture
def email(monkeypatch):
    """Email on (before any app is built) and every request to the provider kept."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    sent: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" not in body["subject"]:
            sent.append(body)
        return httpx.Response(200, json={"id": "x"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return sent


def test_a_receiver_that_fails_for_a_day_is_switched_off_and_the_owner_is_told(
        email, shop, receiver):
    sent = email
    address = f"owner-{uuid4().hex[:8]}@shop-owner.com"
    owner_sql("update users set email = $2 where id in (select user_id from memberships "
              "where tenant_id = $1 and role = 'owner')", shop.tenant_id, address)
    hook = receiver(statuses=[500])
    made = register(shop, hook)
    webhook_id = UUID(made["webhook"]["id"])
    shop.sale(sale_body("W-30"))
    # It has been failing since yesterday and this is the tenth failure in a row.
    owner_sql("update webhook_endpoints set failing_since = now() - interval '25 hours', "
              "consecutive_failures = 9 where id = $1", webhook_id)
    push_due_webhooks(shop)
    endpoint = shop.owner.get("/api/connect-setup/overview").json()["webhooks"][0]
    assert endpoint["enabled"] is False
    assert endpoint["disabled_reason"] == "failing for more than a day"
    assert activity(shop.shop, "document", shop.tenant_id, "webhook_switched_off")
    [alert] = [m for m in sent if "webhook" in m["subject"]]
    assert alert["to"] == [address]  # the admin's example address is never emailed
    assert "ALYR has stopped sending" in alert["text"] and "أوقفت" in alert["text"]
    assert hook.url not in alert["text"] and "/hook" not in alert["text"]  # the host only
    # Nothing more is sent until a person switches it on.
    before = len(hook.requests)
    shop.sale(sale_body("W-31"))
    assert len(hook.requests) == before
    back = shop.owner.put(f"/api/connect-setup/webhooks/{webhook_id}", json={"enabled": True})
    assert back.json()["webhook"]["enabled"] is True
    assert back.json()["webhook"]["consecutive_failures"] == 0


def test_one_bad_evening_switches_nothing_off(shop, receiver):
    hook = receiver(statuses=[500])
    made = register(shop, hook)
    shop.sale(sale_body("W-32"))
    owner_sql("update webhook_endpoints set consecutive_failures = 40, "
              "failing_since = now() - interval '3 hours' where id = $1",
              UUID(made["webhook"]["id"]))
    push_due_webhooks(shop)
    assert shop.owner.get("/api/connect-setup/overview").json()["webhooks"][0]["enabled"] is True


def test_a_success_clears_the_count(shop, receiver):
    hook = receiver(statuses=[500, 200])
    made = register(shop, hook)
    shop.sale(sale_body("W-33"))
    assert rows("select consecutive_failures from webhook_endpoints where id = $1",
                UUID(made["webhook"]["id"]))[0]["consecutive_failures"] == 1
    push_due_webhooks(shop)
    [row] = rows("select consecutive_failures, failing_since from webhook_endpoints "
                 "where id = $1", UUID(made["webhook"]["id"]))
    assert row["consecutive_failures"] == 0 and row["failing_since"] is None


# ── managing them ────────────────────────────────────────────────────────────────────────


def test_a_removed_address_gets_nothing_and_its_log_stays(shop, receiver):
    hook = receiver()
    made = register(shop, hook)
    shop.sale(sale_body("W-40"))
    assert shop.owner.delete(f"/api/connect-setup/webhooks/{made['webhook']['id']}"
                             ).status_code == 200
    shop.sale(sale_body("W-41"))
    assert len(hook.requests) == 1
    assert shop.owner.get("/api/connect-setup/overview").json()["webhooks"] == []
    assert rows("select count(*) as n from webhook_deliveries where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 1


def test_only_owners_and_admins_manage_webhooks_and_a_shop_has_ten(shop, receiver):
    hook = receiver()
    body = {"url": hook.url, "events": ["document.issued"]}
    assert shop.shop.agent.post("/api/connect-setup/webhooks", json=body).status_code == 403
    for _ in range(10):
        assert shop.shop.admin.post("/api/connect-setup/webhooks", json=body).status_code == 201
    over = shop.owner.post("/api/connect-setup/webhooks", json=body)
    assert over.status_code == 409 and over.json()["code"] == "too_many_webhooks"


def test_the_events_must_be_known_ones(shop, receiver):
    hook = receiver()
    for events in ([], ["document.exploded"], ["document.issued", "nope"]):
        answer = shop.owner.post("/api/connect-setup/webhooks",
                                 json={"url": hook.url, "events": events})
        assert answer.status_code in (422, 400), events
