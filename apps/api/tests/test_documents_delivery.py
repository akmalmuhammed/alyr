"""Getting a document to the customer (ALY-139): WhatsApp as a PDF inside the 24-hour window and
through an approved template outside it, email with the PDF attached, the shop's switches,
resending, and the state of every attempt, so an owner can see "not delivered".

No message leaves the machine: WhatsApp is a recording stand-in for the channel (the real
Meta payloads are checked as data at the end) and the email provider is a mock transport.
"""

import asyncio
import base64
import hashlib
import json
from uuid import UUID, uuid4

import asyncpg
import httpx
import pytest

from alyr.channels import meta
from alyr.channels.base import Address, OutboundMessage
from alyr.core import mail, templates
from alyr.modules.documents import delivery
from documents_sales_support import (
    customer,
    deliveries,
    document_messages,
    documents,
    messages,
    pay_by_link,
    placed,
    run_in_app,
    sales_shop,
)
from documents_support import refused_by_database
from test_consent import owner_sql

RECEIPT_EN = "Receipt RC-0001 from Qirfa Bakery: QAR 42.00. Thank you."


class Channel:
    """Stands in for WhatsApp: records every send and upload, and fails when told to."""

    name = "simulator"

    def __init__(self, fail: int = 0, always: bool = False) -> None:
        self.sent: list[OutboundMessage] = []
        self.uploads: list[tuple[str, bytes]] = []
        self.fail, self.always = fail, always

    async def send(self, from_number_id: str, message: OutboundMessage, address: Address):
        # Only documents fail, so the order's other notices do not use up the failures.
        if message.filename and (self.always or self.fail > 0):
            self.fail -= 1
            raise RuntimeError("the channel is down")
        self.sent.append(message)
        return f"wamid.{len(self.sent)}"

    async def upload_media(self, from_number_id: str, data: bytes, content_type: str) -> str:
        self.uploads.append((content_type, data))
        return f"media-{len(self.uploads)}"

    async def download_media(self, media_id: str, max_bytes: int):
        raise LookupError(media_id)


def documents_sent(channel: Channel) -> list[OutboundMessage]:
    """What the channel was given that carried a document (not the order's other notices)."""
    return [m for m in channel.sent if m.filename]


@pytest.fixture
def setup(client_factory, monkeypatch):
    """A selling shop whose channel is the recorder, and a way to make it: retries wait no
    time at all, so a failing send is tried every time it will be tried."""
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")

    def make(**settings):
        shop = sales_shop(client_factory, monkeypatch, **settings)
        channel = Channel()
        shop.owner.app.state.outbound.channels["simulator"] = channel
        return shop, channel

    return make


@pytest.fixture
def provider(monkeypatch):
    """Turn email on and capture every request to Resend."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    sent: list[dict] = []
    state = {"status": 200}

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        # Signing in the shop's staff emails a code too; only documents are recorded here.
        if "sign-in code" in body["subject"]:
            return httpx.Response(200, json={"id": "test-id"})
        sent.append(body)
        return httpx.Response(state["status"], json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return sent, state


def pdf_of(shop, doc_id) -> bytes:
    return bytes(owner_sql("select content from document_files where document_id = $1",
                           UUID(str(doc_id)))[0]["content"])


def pay(shop, who, **more):
    order = placed(shop, who, **more)
    assert pay_by_link(shop, order).status_code == 200
    return order


# ------------------------------------------------------------ WhatsApp, inside the window


def test_inside_the_window_the_receipt_arrives_as_a_pdf_with_a_short_caption(setup):
    shop, channel = setup()
    who = customer(shop)
    pay(shop, who)
    [receipt] = documents(shop)

    [sent] = [m for m in channel.sent if m.filename]
    assert sent.kind == "document" and sent.filename == "RC-0001.pdf"
    assert sent.body.startswith(RECEIPT_EN)
    assert "/d/" + shop.slug + "?t=" in sent.body and sent.body.endswith(" .")
    assert sent.media_id == "media-1"
    # What was uploaded is the stored PDF itself, byte for byte.
    assert channel.uploads == [("application/pdf", pdf_of(shop, receipt["id"]))]

    [message] = document_messages(who)
    assert (message["kind"], message["status"]) == ("document", "sent")
    assert message["payload"]["filename"] == "RC-0001.pdf" and message["payload"]["sent_as"] == "document"


def test_the_pdf_is_stored_once_and_the_message_points_at_it(setup):
    """Before, every send kept a second copy of the PDF beside its message, for good (ALY-276
    PERF-12): at 300 shops that filled the database's disk in about six weeks."""
    shop, channel = setup()
    who = customer(shop)
    pay(shop, who)
    [receipt] = documents(shop)
    [message] = document_messages(who)
    [kept] = owner_sql(
        "select data, document_id, content_type from message_media where message_id = $1",
        UUID(str(message["id"])))
    assert kept["data"] is None and str(kept["document_id"]) == str(receipt["id"])
    assert kept["content_type"] == "application/pdf"
    # A file that is no document's (a picture) is still kept beside its message, and a row
    # with both or neither is refused.
    with pytest.raises(asyncpg.CheckViolationError):
        owner_sql("update message_media set data = 'x' where message_id = $1",
                  UUID(str(message["id"])))
    # The channel was given the stored PDF itself.
    assert channel.uploads == [("application/pdf", pdf_of(shop, receipt["id"]))]


def test_an_arabic_customer_gets_an_arabic_caption(setup):
    shop, channel = setup()
    pay(shop, customer(shop, "هدى النعيمي", lang="ar"))
    [sent] = [m for m in channel.sent if m.filename]
    assert sent.body.startswith("‏إيصال رقم RC-0001 من مخبز قرفة بمبلغ 42.00 ر.ق. شكراً لك.")
    assert "\n‏يمكنك أيضاً فتحه عبر الإنترنت:\n" in sent.body
    assert "QAR" not in sent.body


def test_the_state_goes_from_queued_to_sent_to_delivered_as_the_channel_reports(setup):
    shop, channel = setup()
    who = customer(shop)
    pay(shop, who)
    [receipt] = documents(shop)
    assert [d["state"] for d in deliveries(shop, receipt["id"])] == ["sent"]
    assert shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]["delivery"]["state"] == "sent"

    wamid = next(m["wa_message_id"] for m in document_messages(who))

    def report(status):
        async def work(conn):
            return await shop.owner.app.state.outbound.record_status(conn, wamid, status)
        return run_in_app(shop.owner, shop.tenant_id, work)

    assert report("delivered") is True
    assert deliveries(shop, receipt["id"])[0]["state"] == "delivered"
    assert report("read") is True
    assert deliveries(shop, receipt["id"])[0]["state"] == "delivered"      # read is delivered
    listed = shop.owner.get("/api/documents").json()["documents"]
    assert listed[0]["delivery"]["state"] == "delivered"
    assert report("sent") is False                                         # never backwards
    assert deliveries(shop, receipt["id"])[0]["state"] == "delivered"


def test_a_failure_the_channel_reports_afterwards_is_shown_as_not_delivered(setup):
    shop, _ = setup()
    who = customer(shop)
    pay(shop, who)
    [receipt] = documents(shop)
    wamid = next(m["wa_message_id"] for m in document_messages(who))

    async def work(conn):
        return await shop.owner.app.state.outbound.record_status(
            conn, wamid, "failed", "Message undeliverable")

    run_in_app(shop.owner, shop.tenant_id, work)
    [d] = deliveries(shop, receipt["id"])
    assert (d["state"], d["reason"]) == ("failed", "Message undeliverable")
    assert shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]["delivery"]["state"] == "not_delivered"


# ------------------------------------------------------------ WhatsApp, outside the window


@pytest.mark.parametrize("lang, shop_name, amount", [
    ("en", "Qirfa Bakery", "QAR 42.00"), ("ar", "مخبز قرفة", "42.00 ر.ق")])
def test_outside_the_window_the_receipt_goes_through_the_approved_template(setup, lang, shop_name, amount):
    shop, channel = setup()
    who = customer(shop, "Huda", lang=lang, window=False)
    pay(shop, who)
    [receipt] = documents(shop)

    [sent] = [m for m in channel.sent if m.filename]
    assert sent.kind == "template" and sent.template_name == "document_receipt"
    assert sent.template_category == "utility" and sent.lang == lang
    number, shop_param, amount_param, url = sent.template_params
    assert (number, shop_param, amount_param) == ("RC-0001", shop_name, amount)
    assert url.startswith("http://web.test/d/" + shop.slug + "?t=")
    assert (sent.filename, sent.media_id) == ("RC-0001.pdf", "media-1")
    assert channel.uploads[0] == ("application/pdf", pdf_of(shop, receipt["id"]))
    [message] = document_messages(who)
    assert message["kind"] == "template" and message["status"] == "sent"
    assert message["body"] == templates.render("document_receipt", lang, list(sent.template_params))
    assert "sent_as" not in message["payload"]


def test_an_invoice_and_a_credit_note_have_templates_of_their_own(setup):
    shop, channel = setup()
    who = customer(shop, credit_limit=100_000, window=False)
    order = placed(shop, who, payment="account")
    shop.owner.post(f"/api/orders/{order['order_id']}/status", json={"status": "cancelled"})
    docs = [m for m in channel.sent if m.template_name.startswith("document_")]
    assert [m.template_name for m in docs] == ["document_invoice", "document_credit_note"]
    assert (docs[0].template_params[0], docs[1].template_params[0]) == ("INV-0001", "CN-0001")


def test_a_customer_who_has_not_agreed_gets_nothing_and_the_owner_can_see_why(setup):
    shop, channel = setup()
    who = customer(shop, window=False, consent="unknown")
    pay(shop, who)
    [receipt] = documents(shop)
    assert documents_sent(channel) == []
    [d] = deliveries(shop, receipt["id"])
    assert (d["state"], d["reason"]) == ("blocked", "no_consent")
    assert shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]["delivery"]["state"] == "not_delivered"
    [message] = [m for m in messages(who) if "document" in str(m["payload"])]
    assert (message["status"], message["error"]) == ("blocked", "no_consent")


def test_a_customer_who_said_stop_gets_no_document_even_inside_the_window(setup):
    shop, channel = setup()
    who = customer(shop, consent="revoked")
    pay(shop, who)
    [receipt] = documents(shop)
    assert documents_sent(channel) == []
    [d] = deliveries(shop, receipt["id"])
    assert (d["state"], d["reason"]) == ("blocked", "opted_out")
    # The receipt itself is still issued: it is the shop's record, whether or not it can be sent.
    assert receipt["status"] == "issued"


def test_a_plain_document_message_to_someone_who_said_stop_is_refused_by_the_outbound_layer(setup):
    """Not only the template path: a document message is refused too (the rule is in consent)."""
    from alyr.core import consent

    row = {"consent_service": "revoked", "consent_marketing": "unknown",
           "consent_back_in_stock": "unknown", "window_open": True}
    message = OutboundMessage(to=UUID(int=1), kind="document", body="x", document=b"%PDF",
                              filename="RC-0001.pdf")
    assert consent.refusal(row, message) == "opted_out"
    assert consent.refusal({**row, "consent_service": "granted"}, message) is None
    assert consent.refusal({**row, "consent_service": "granted", "window_open": False},
                           message) == "window_closed"


# ------------------------------------------------------------ failures and retries


def test_a_channel_that_fails_is_tried_again_and_the_document_arrives_once(setup):
    shop, channel = setup()
    channel.fail = 2
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    assert len([m for m in channel.sent if m.filename]) == 1        # failed twice, then delivered
    [d] = deliveries(shop, receipt["id"])
    assert d["state"] == "sent"
    [job] = owner_sql(
        "select j.attempts from jobs j join messages m on m.id::text = j.payload ->> 'message_id' "
        "where j.tenant_id = $1 and j.kind = 'send_message' and m.kind = 'document'", shop.tenant_id)
    assert job["attempts"] == 3


def test_a_channel_that_never_works_leaves_the_document_shown_as_not_delivered(setup):
    shop, channel = setup()
    channel.always = True
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    [d] = deliveries(shop, receipt["id"])
    assert (d["state"], d["reason"]) == ("failed", "could not be delivered")
    assert shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]["delivery"]["state"] == "not_delivered"
    # The owner presses send once the channel is back, and it goes.
    channel.always = False
    again = shop.owner.post(f"/api/documents/{receipt['id']}/send", json={"channels": ["whatsapp"]})
    assert again.status_code == 200, again.text
    assert [d["state"] for d in deliveries(shop, receipt["id"])] == ["sent", "failed"]
    assert shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]["delivery"]["state"] == "sent"


# ------------------------------------------------------------ nothing is sent twice by itself


def test_the_shops_automatic_settings_send_a_document_once_however_often_it_is_asked(setup):
    shop, channel = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    doc = shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]

    async def again(conn):
        from alyr.core import team
        from alyr.modules.documents import delivery as d
        return await d.queue_auto(conn, doc, receipt["contact_id"], send=None, actor=team.ASSISTANT)

    for _ in range(3):
        assert run_in_app(shop.owner, shop.tenant_id, again) == []
    assert len(documents_sent(channel)) == 1 and len(deliveries(shop, receipt["id"])) == 1


def test_the_database_allows_one_automatic_delivery_per_document_and_channel(setup):
    shop, _ = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    error = refused_by_database(
        shop.tenant_id,
        "insert into document_deliveries (document_id, channel, trigger, language) "
        "values ($1, 'whatsapp', 'auto', 'en')", receipt["id"])
    assert isinstance(error, asyncpg.UniqueViolationError)
    # A person pressing send is not an automatic send.
    assert refused_by_database(
        shop.tenant_id,
        "insert into document_deliveries (document_id, channel, trigger, language) "
        "values ($1, 'whatsapp', 'staff', 'en')", receipt["id"]) is None


# ------------------------------------------------------------ the shop's switches


def test_a_shop_that_sends_by_hand_sends_nothing_until_staff_press_send(setup):
    shop, channel = setup(send_mode="manual")
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    assert documents_sent(channel) == [] and deliveries(shop, receipt["id"]) == []
    listed = shop.owner.get("/api/documents").json()["documents"][0]
    assert listed["delivery"] == {"state": "none", "count": 0, "last": None}

    sent = shop.owner.post(f"/api/documents/{receipt['id']}/send", json={})
    assert sent.status_code == 200, sent.text
    [d] = sent.json()["deliveries"]
    assert (d["channel"], d["trigger"], d["to"]) == ("whatsapp", "staff", "customer")
    assert len(documents_sent(channel)) == 1


def test_whatsapp_can_be_switched_off_on_its_own(setup):
    shop, channel = setup(auto_send_whatsapp=False)
    pay(shop, customer(shop))
    assert documents_sent(channel) == []


def test_a_cancel_with_notify_sends_the_credit_note_even_when_the_shop_sends_by_hand(setup):
    shop, channel = setup(send_mode="manual")
    who = customer(shop)
    pay(shop, who)
    [receipt] = documents(shop)
    cancelled = shop.owner.post(f"/api/documents/{receipt['id']}/cancel",
                                json={"reason": "Customer changed their mind", "notify": True})
    assert cancelled.status_code == 201, cancelled.text
    assert cancelled.json()["document"]["status"] == "void"
    assert [m.body.split(" ")[0] for m in documents_sent(channel)][-1] == "Credit"
    assert "Credit note CN-0001 from Qirfa Bakery: QAR 42.00." in documents_sent(channel)[-1].body


def test_a_cancel_without_notify_tells_nobody(setup):
    shop, channel = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    before = len(documents_sent(channel))
    shop.owner.post(f"/api/documents/{receipt['id']}/cancel", json={"reason": "Wrong order"})
    assert len(documents_sent(channel)) == before


def test_cancelling_the_order_sends_the_credit_note_to_the_customer(setup):
    shop, channel = setup()
    order = pay(shop, customer(shop))
    shop.owner.post(f"/api/orders/{order['order_id']}/status", json={"status": "cancelled"})
    bodies = [m.body for m in channel.sent if m.kind == "document"]
    assert len(bodies) == 2 and bodies[0].startswith("Receipt RC-0001") and bodies[1].startswith("Credit note CN-0001")


# ------------------------------------------------------------ resending


def test_staff_can_send_again_and_it_is_on_the_record(setup):
    shop, channel = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    again = shop.owner.post(f"/api/documents/{receipt['id']}/send", json={"channels": ["whatsapp"]})
    assert again.status_code == 200
    assert len(documents_sent(channel)) == 2
    trail = shop.owner.get(f"/api/documents/{receipt['id']}/activity").json()["activity"]
    resent = [a for a in trail if a["action"] == "resent"]
    assert resent and resent[0]["detail"]["to"] == "customer" and resent[0]["actor"] == "Owner"
    assert "phone" not in json.dumps(resent) and "5555" not in json.dumps(resent)


def test_a_second_press_while_the_first_is_waiting_is_not_a_second_send(setup):
    shop, channel = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    channel.always = True

    async def twice(conn):
        from types import SimpleNamespace
        staff = SimpleNamespace(role="owner", user_id=None, name="Owner")
        first = await delivery.send(conn, staff, UUID(str(receipt["id"])), channels=["whatsapp"])
        second = await delivery.send(conn, staff, UUID(str(receipt["id"])), channels=["whatsapp"])
        return first, second

    first, second = run_in_app(shop.owner, shop.tenant_id, twice)
    assert first[0]["id"] == second[0]["id"]


def test_staff_can_send_to_another_number_that_is_a_contact_who_agreed(setup):
    shop, channel = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    friend = customer(shop, "Salem", phone="97455551234")
    sent = shop.owner.post(f"/api/documents/{receipt['id']}/send",
                           json={"channels": ["whatsapp"], "phone": "+974 5555 1234"})
    assert sent.status_code == 200, sent.text
    assert sent.json()["deliveries"][0]["to"] == "97455551234"
    assert len(document_messages(friend)) == 1 and channel.sent[-1].to == UUID(friend.id)


def test_a_number_that_is_nobodys_contact_is_never_messaged(setup):
    shop, channel = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    before = len(channel.sent)
    sent = shop.owner.post(f"/api/documents/{receipt['id']}/send",
                           json={"channels": ["whatsapp"], "phone": "+974 5555 9876"})
    assert sent.status_code == 200
    d = sent.json()["deliveries"][0]
    assert (d["state"], d["reason"]) == ("blocked", "no_consent")
    assert len(channel.sent) == before


def test_a_bad_number_is_refused_with_words(setup):
    shop, _ = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    bad = shop.owner.post(f"/api/documents/{receipt['id']}/send", json={"phone": "12"})
    assert (bad.status_code, bad.json()["code"]) == (422, "phone_invalid") and bad.json()["message_ar"]


def test_an_agent_cannot_send_a_shops_documents(setup):
    shop, _ = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    assert shop.agent.post(f"/api/documents/{receipt['id']}/send", json={}).status_code == 403
    assert shop.agent.get(f"/api/documents/{receipt['id']}/deliveries").status_code == 403


def test_a_cancelled_document_is_not_sent_again(setup):
    shop, _ = setup()
    pay(shop, customer(shop))
    [receipt] = documents(shop)
    shop.owner.post(f"/api/documents/{receipt['id']}/cancel", json={"reason": "Wrong order"})
    refused = shop.owner.post(f"/api/documents/{receipt['id']}/send", json={})
    assert (refused.status_code, refused.json()["code"]) == (409, "document_voided")


def test_a_draft_cannot_be_sent(setup):
    shop, _ = setup()
    draft = shop.owner.post("/api/documents", json={
        "kind": "invoice", "customer": {"name": "Salem"},
        "lines": [{"description": "Cake", "quantity": "1", "unit_price_minor": 1000}]}).json()["document"]
    refused = shop.owner.post(f"/api/documents/{draft['id']}/send", json={})
    assert (refused.status_code, refused.json()["code"]) == (409, "not_issued")


# ------------------------------------------------------------ email


def test_a_customer_with_an_email_on_file_gets_the_pdf_attached(setup, provider):
    sent, _ = provider
    shop, channel = setup()
    shop.owner.put("/api/documents/settings", json={"email": "orders@qirfa.qa"})
    pay(shop, customer(shop, email="huda@shop.qa"))
    [receipt] = documents(shop)

    [mail_sent] = sent
    assert mail_sent["to"] == ["huda@shop.qa"]
    assert mail_sent["subject"] == "Receipt RC-0001 from Qirfa Bakery"
    assert mail_sent["from"] == "Qirfa Bakery via ALYR <no-reply@alyr.qa>"
    assert mail_sent["reply_to"] == "orders@qirfa.qa"
    assert "Amount: QAR 42.00" in mail_sent["text"] and "/d/" + shop.slug + "?t=" in mail_sent["text"]
    assert "<html" in mail_sent["html"] and "QAR 42.00" in mail_sent["html"]
    [attachment] = mail_sent["attachments"]
    assert attachment["filename"] == "RC-0001.pdf"
    assert base64.b64decode(attachment["content"]) == pdf_of(shop, receipt["id"])
    states = {d["channel"]: d["state"] for d in deliveries(shop, receipt["id"])}
    assert states == {"whatsapp": "sent", "email": "sent"}


def test_the_email_is_in_the_customers_language(setup, provider):
    sent, _ = provider
    shop, _ = setup()
    pay(shop, customer(shop, "هدى", lang="ar", email="huda@shop.qa"))
    [message] = sent
    assert message["subject"] == "إيصال رقم RC-0001 من مخبز قرفة"
    assert 'lang="ar"' in message["html"] and 'dir="rtl"' in message["html"]
    assert "المبلغ: 42.00 ر.ق" in message["text"] and "QAR" not in message["text"]


def test_an_example_address_is_never_emailed(setup, provider):
    sent, _ = provider
    shop, _ = setup()
    for address in ("fatima@alnoor.example", "ops@shop.test", "x@y.invalid", "a@b.localhost"):
        pay(shop, customer(shop, email=address))
    assert sent == []
    assert {d["channel"] for r in documents(shop) for d in deliveries(shop, r["id"])} == {"whatsapp"}
    [receipt, *_] = documents(shop)
    typed = shop.owner.post(f"/api/documents/{receipt['id']}/send",
                            json={"channels": ["email"], "email": "someone@shop.example"})
    assert (typed.status_code, typed.json()["code"]) == (422, "email_invalid")
    assert sent == []


def test_an_email_address_is_put_on_file_and_taken_off_again(setup, provider):
    sent, _ = provider
    shop, _ = setup()
    who = customer(shop)
    assert shop.owner.put(f"/api/documents/customers/{who.id}/email",
                          json={"email": "huda@alnoor.example"}).status_code == 422
    assert shop.owner.put(f"/api/documents/customers/{who.id}/email",
                          json={"email": "huda@shop.qa"}).json()["has_email"] is True
    pay(shop, who)
    assert len(sent) == 1
    assert shop.owner.put(f"/api/documents/customers/{who.id}/email", json={"email": None}).json()["has_email"] is False
    assert shop.agent.put(f"/api/documents/customers/{who.id}/email", json={"email": "a@b.qa"}).status_code == 403
    assert shop.owner.put(f"/api/documents/customers/{uuid4()}/email", json={"email": "a@b.qa"}).status_code == 404


def test_email_can_be_switched_off_for_the_shop(setup, provider):
    sent, _ = provider
    shop, _ = setup(auto_send_email=False)
    pay(shop, customer(shop, email="huda@shop.qa"))
    assert sent == []


def test_an_email_the_provider_refuses_is_tried_again_and_then_shown_as_not_delivered(setup, provider):
    sent, state = provider
    shop, _ = setup()
    state["status"] = 500
    pay(shop, customer(shop, email="huda@shop.qa"))
    [receipt] = documents(shop)
    assert len(sent) == 6                               # six tries, then the dead letter
    states = {d["channel"]: (d["state"], d["reason"]) for d in deliveries(shop, receipt["id"])}
    assert states["email"] == ("failed", "could not be delivered")
    assert states["whatsapp"][0] == "sent"
    assert shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]["delivery"]["state"] == "sent"
    # The provider comes back; the owner sends it again by email.
    state["status"] = 200
    sent.clear()
    again = shop.owner.post(f"/api/documents/{receipt['id']}/send", json={"channels": ["email"]})
    assert again.status_code == 200 and len(sent) == 1


def test_email_that_is_not_set_up_fails_at_once_and_says_so(setup, monkeypatch):
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "")
    shop, _ = setup()
    pay(shop, customer(shop, email="huda@shop.qa"))
    [receipt] = documents(shop)
    email = next(d for d in deliveries(shop, receipt["id"]) if d["channel"] == "email")
    assert (email["state"], email["reason"]) == ("failed", "email_not_set_up")


def test_a_delivery_job_run_twice_sends_one_email(setup, provider):
    sent, _ = provider
    shop, _ = setup()
    pay(shop, customer(shop, email="huda@shop.qa"))
    row = owner_sql("select id from document_deliveries where tenant_id = $1 and channel = 'email'",
                    shop.tenant_id)[0]
    sender = delivery.DocumentSender(shop.owner.app.state.db, shop.owner.app.state.outbound)
    shop.owner.portal.call(sender.run, shop.tenant_id, {"delivery_id": str(row["id"])})
    shop.owner.portal.call(sender.run, shop.tenant_id, {"delivery_id": str(row["id"])})
    assert len(sent) == 1


def test_the_email_text_and_html_say_the_same_things(setup, provider):
    from alyr.modules.documents import delivery_words as words

    args = ("receipt", "RC-0042", "Qirfa Bakery <&> Sons", "QAR 12.50", "https://x.test/d/q?t=a", "en")
    text, html = words.email_text(*args), words.email_html(*args)
    for needle in ("Receipt", "RC-0042", "QAR 12.50", "https://x.test/d/q?t=a"):
        assert needle in text and needle in html
    assert "&lt;&amp;&gt;" in html and "<&>" not in html              # a name cannot inject markup
    assert "http" not in html.replace("https://x.test/d/q?t=a", "")  # no pixel, no third-party request
    assert "<img" not in html


# ------------------------------------------------------------ the Meta payloads, as data


def test_the_document_message_payload_follows_metas_shape():
    message = OutboundMessage(to=UUID(int=1), kind="document", body="Receipt RC-0001",
                              media_id="1376223850470843", filename="RC-0001.pdf")
    payload = meta.to_graph_payload(message, Address(phone="97455550100"))
    assert payload == {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": "97455550100",
        "type": "document", "document": {
            "id": "1376223850470843", "filename": "RC-0001.pdf", "caption": "Receipt RC-0001"},
    }


def test_the_document_template_payload_carries_the_pdf_in_its_header():
    message = templates.notice(UUID(int=1), "document_receipt", "ar", "caption", "RC-0001", "مخبز قرفة",
                               "42.00 ر.ق", "https://x.test/d/q?t=a", filename="RC-0001.pdf")
    from dataclasses import replace
    payload = meta.to_graph_payload(replace(message, media_id="m-1"), Address(user_id="QA.123"))
    template = payload["template"]
    assert payload["type"] == "template" and template["name"] == "document_receipt"
    assert template["language"] == {"code": "ar"}
    assert template["components"][0] == {"type": "header", "parameters": [
        {"type": "document", "document": {"id": "m-1", "filename": "RC-0001.pdf"}}]}
    assert [p["text"] for p in template["components"][1]["parameters"]] == [
        "RC-0001", "مخبز قرفة", "42.00 ر.ق", "https://x.test/d/q?t=a"]


def test_an_image_header_template_is_unchanged():
    message = templates.notice(UUID(int=1), "weekly_report_card", "en", "x", *("a",) * 5)
    from dataclasses import replace
    payload = meta.to_graph_payload(replace(message, media_id="m-9"), Address(phone="1"))
    assert payload["template"]["components"][0] == {"type": "header", "parameters": [
        {"type": "image", "image": {"id": "m-9"}}]}


def test_a_pdf_is_uploaded_as_a_pdf(monkeypatch):
    seen = {}

    def handle(request: httpx.Request) -> httpx.Response:
        seen["url"], seen["body"] = str(request.url), request.content
        return httpx.Response(200, json={"id": "1234"})

    real = httpx.AsyncClient
    monkeypatch.setattr(meta.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handle), **kw))
    channel = meta.MetaChannel("token", "v21.0")
    media_id = asyncio.run(channel.upload_media("100200", b"%PDF-1.7 x", "application/pdf"))
    assert media_id == "1234" and seen["url"].endswith("/100200/media")
    assert b'name="type"' in seen["body"] and b"application/pdf" in seen["body"]
    assert b'filename="document.pdf"' in seen["body"]


def test_a_document_message_without_a_file_or_with_a_bad_name_is_refused():
    with pytest.raises(ValueError):
        OutboundMessage(to=UUID(int=1), kind="document", body="x")
    for name in ("../x.pdf", "a/b.pdf", "x.exe", "a\\b.pdf"):
        with pytest.raises(ValueError):
            OutboundMessage(to=UUID(int=1), kind="document", document=b"%PDF", filename=name)
    with pytest.raises(ValueError):
        OutboundMessage(to=UUID(int=1), kind="document", media_id="m", body="x" * 1025)
    with pytest.raises(ValueError):
        OutboundMessage(to=UUID(int=1), kind="document", document=b"%PDF")


def test_the_message_kept_beside_a_document_is_the_pdf_and_marked_as_one(setup):
    shop, _ = setup()
    who = customer(shop, window=False)
    pay(shop, who)
    [receipt] = documents(shop)
    # The message points at the document's own file, which it carries (ALY-276: kept once).
    stored = owner_sql(
        "select m.content_type, m.document_id, f.content from message_media m "
        "join messages g on g.id = m.message_id join document_files f on f.document_id = m.document_id "
        "where g.contact_id = $1", UUID(who.id))
    assert [(r["content_type"], str(r["document_id"]), hashlib.sha256(bytes(r["content"])).hexdigest())
            for r in stored] == [
        ("application/pdf", str(receipt["id"]),
         owner_sql("select pdf_sha256 from documents where id = $1",
                   receipt["id"])[0]["pdf_sha256"])]
