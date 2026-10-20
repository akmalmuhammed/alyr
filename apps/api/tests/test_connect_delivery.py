"""Consent and delivery for a sale another system reports (ALY-142, spec 015).

The customer may never have written to this shop on WhatsApp, and WhatsApp wants an opt-in before
a business starts a conversation. The shop asserts it has the customer's permission (it accepted
the terms), and ALYR records that as a `service` consent with the source `connected_sale`, the
shop's words and the key. A customer who said stop is never messaged, whatever a shop asserts.
The three document templates are written and not approved by Meta: outside the 24-hour window
a send says "not delivered: template not approved" at once and falls back to email or the
hosted link. Nothing here reaches Meta or Resend: WhatsApp is a recording stand-in and email a
mock transport.
"""

import json

import httpx
import pytest

from alyr.core import mail
from connect_support import connected_shop, rows, sale_body
from documents_sales_support import customer, deliveries, document_messages
from documents_support import LINES_TOTAL
from test_documents_delivery import Channel, documents_sent

PHONE = "97455550199"  # sale_body's customer, as the shop's contacts store it


@pytest.fixture
def setup(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")

    def make(**settings):
        shop = connected_shop(client_factory, monkeypatch, **settings)
        channel = Channel()
        for client in (shop.machine, shop.owner):
            client.app.state.outbound.channels["simulator"] = channel
        return shop, channel

    return make


@pytest.fixture
def email(monkeypatch):
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    sent: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" not in body["subject"]:
            sent.append(body)
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return sent


def consents(shop, phone=PHONE):
    return rows("select c.purpose, c.status, c.source, c.wording from consents c "
                "join contacts k on k.id = c.contact_id where k.tenant_id = $1 and k.phone = $2 "
                "order by c.created_at", shop.tenant_id, phone)


def standing(shop, phone=PHONE) -> str:
    return rows("select consent_service from contacts where tenant_id = $1 and phone = $2",
                shop.tenant_id, phone)[0]["consent_service"]


# ── inside the window ────────────────────────────────────────────────────────────────────


def test_a_customer_who_wrote_recently_gets_the_pdf_with_a_caption(setup):
    shop, channel = setup()
    customer(shop.shop, "Fatima", phone=PHONE, window=True)
    sold = shop.sale(sale_body("D-1", send=True))
    [message] = documents_sent(channel)
    assert message.kind == "document" and message.filename == "RC-0001.pdf"
    assert "Receipt RC-0001 from Qirfa Bakery" in message.body
    assert sold["delivery"]["asked"] is True
    state = shop.machine.get("/api/connect/sales/D-1", headers=shop.headers()).json()
    assert state["delivery"]["state"] == "sent"


def test_the_language_hint_sets_the_words_for_a_new_customer(setup):
    shop, channel = setup()
    shop.sale(sale_body("D-2", send=True, language="ar"))
    [sent] = documents_sent(channel)
    assert "إيصال" in sent.body or "RC-0001" in sent.body
    assert sent.lang == "ar"


# ── consent ──────────────────────────────────────────────────────────────────────────────


def test_a_customer_who_never_wrote_is_asked_for_through_the_shops_assertion(setup):
    shop, channel = setup()
    assert consents(shop) == []
    sold = shop.sale(sale_body("D-3", send=True))
    assert sold["customer"]["created"] is True and sold["consent"] == "granted"
    [row] = consents(shop)
    assert (row["purpose"], row["status"], row["source"]) == ("service", "granted",
                                                              "connected_sale")
    assert "permission to send them their receipts" in row["wording"]
    assert shop.key["prefix"] in row["wording"] and "terms v1" in row["wording"]
    assert shop.secret not in row["wording"]
    assert standing(shop) == "granted"
    # Outside any window the document goes as the approved template, with the PDF as its header.
    [message] = documents_sent(channel)
    assert message.kind == "template" and message.template_name == "document_receipt"
    # Marketing is a different purpose and is never granted this way.
    assert rows("select consent_marketing from contacts where tenant_id = $1 and phone = $2",
                shop.tenant_id, PHONE)[0]["consent_marketing"] == "unknown"


def test_the_assertion_is_recorded_once_and_only_when_a_message_is_asked_for(setup):
    shop, channel = setup()
    shop.sale(sale_body("D-4", send=False))
    assert consents(shop) == [] and standing(shop) == "unknown" and documents_sent(channel) == []
    shop.sale(sale_body("D-5", send=True))
    shop.sale(sale_body("D-6", send=True))
    assert len(consents(shop)) == 1  # the second sale finds the customer already agreed


def test_the_shops_settings_decide_when_the_sale_does_not(setup):
    shop, channel = setup()
    shop.sale(sale_body("D-7"))  # follows the shop's settings: automatic, WhatsApp on
    assert len(documents_sent(channel)) == 1
    manual, channel2 = setup(send_mode="manual")
    manual.sale(sale_body("D-8"))
    assert documents_sent(channel2) == [] and consents(manual) == []
    manual.sale(sale_body("D-9", send=True))  # the other system asking overrides it
    assert len(documents_sent(channel2)) == 1


@pytest.mark.parametrize("window", [True, False])
def test_a_customer_who_said_stop_is_never_messaged_whatever_the_shop_asserts(setup, window):
    shop, channel = setup()
    customer(shop.shop, "Fatima", phone=PHONE, window=window, consent="revoked")
    sold = shop.sale(sale_body("D-10", send=True))
    assert sold["consent"] == "revoked"
    assert documents_sent(channel) == []
    assert consents(shop) == []  # no new "granted" row: the stop stands
    assert standing(shop) == "revoked"
    [attempt] = deliveries(shop.shop, sold["document"]["id"])
    assert attempt["state"] == "blocked" and attempt["reason"] == "opted_out"
    state = shop.machine.get("/api/connect/sales/D-10", headers=shop.headers()).json()
    assert state["delivery"]["state"] == "not_delivered"
    # The document is still the shop's: it exists, and the shop can hand it over in person.
    assert sold["document"]["number"] == "RC-0001"


def test_stop_said_after_the_first_sale_stops_the_next(setup):
    shop, channel = setup()
    shop.sale(sale_body("D-11", send=True))
    assert len(documents_sent(channel)) == 1
    customer_row = rows("select id from contacts where tenant_id = $1 and phone = $2",
                        shop.tenant_id, PHONE)[0]["id"]
    from alyr.core import consent as consent_module
    from documents_sales_support import run_in_app

    async def stop(conn):
        await consent_module.record(conn, customer_row, "service", "revoked", "customer_message",
                                    "stop")

    run_in_app(shop.owner, shop.tenant_id, stop)
    shop.sale(sale_body("D-12", send=True))
    assert len(documents_sent(channel)) == 1


# ── the templates are not approved ───────────────────────────────────────────────────────


def test_outside_the_window_without_an_approved_template_it_says_so_and_nothing_is_sent(
        setup, monkeypatch):
    monkeypatch.setenv("ALYR_DOCUMENT_TEMPLATES_APPROVED", "false")
    shop, channel = setup()
    sold = shop.sale(sale_body("D-20", send=True))
    assert documents_sent(channel) == []  # not even tried at Meta
    [attempt] = deliveries(shop.shop, sold["document"]["id"])
    assert attempt["channel"] == "whatsapp"
    assert attempt["state"] == "blocked" and attempt["reason"] == "template_not_approved"
    state = shop.machine.get("/api/connect/sales/D-20", headers=shop.headers()).json()
    assert state["delivery"]["state"] == "not_delivered"
    assert state["document"]["hosted_url"]  # the link is there for the shop to pass on
    assert document_messages(customer(shop.shop, "other")) == []


def test_inside_the_window_a_pdf_still_goes_whether_or_not_the_templates_are_approved(
        setup, monkeypatch):
    monkeypatch.setenv("ALYR_DOCUMENT_TEMPLATES_APPROVED", "false")
    shop, channel = setup()
    customer(shop.shop, "Fatima", phone=PHONE, window=True)
    shop.sale(sale_body("D-21", send=True))
    [message] = documents_sent(channel)
    assert message.kind == "document"


def test_it_falls_back_to_email_when_the_customer_has_an_address(setup, monkeypatch, email):
    monkeypatch.setenv("ALYR_DOCUMENT_TEMPLATES_APPROVED", "false")
    shop, channel = setup()
    body = sale_body("D-22", send=True, customer={
        "phone": "+974 5555 0199", "name": "Fatima", "email": "fatima@customer-mail.com"})
    sold = shop.sale(body)
    attempts = deliveries(shop.shop, sold["document"]["id"])
    assert {(a["channel"], a["state"]) for a in attempts} >= {("email", "sent")}
    whatsapp = next(a for a in attempts if a["channel"] == "whatsapp")
    assert whatsapp["reason"] in ("template_not_approved", "")  # email went in parallel
    [mailed] = email
    assert mailed["to"] == ["fatima@customer-mail.com"]
    assert mailed["attachments"][0]["filename"] == "RC-0001.pdf"
    assert documents_sent(channel) == []


def test_a_sale_asked_twice_is_sent_once(setup):
    shop, channel = setup()
    customer(shop.shop, "Fatima", phone=PHONE, window=True)
    body = sale_body("D-23", send=True)
    shop.post_sale(body, "idem-send-0001")
    shop.post_sale(body, "idem-send-0001")
    shop.post_sale(body, "idem-send-0002")
    assert len(documents_sent(channel)) == 1


def test_the_receipt_is_for_the_amount_the_till_printed(setup):
    shop, channel = setup()
    customer(shop.shop, "Fatima", phone=PHONE, window=True)
    shop.sale(sale_body("D-24", send=True))
    [message] = documents_sent(channel)
    assert f"QAR {LINES_TOTAL / 100:.2f}" in message.body
