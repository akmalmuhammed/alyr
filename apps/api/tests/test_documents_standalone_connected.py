"""Standalone mode and connected mode in one shop (ALY-141 with ALY-142).

A business that only invoices ("ALYR Invoices") can still keep its till: it hands the numbering of
a kind of document (receipts, say) to the other system, which sends its sales to ALYR. The two
features must not step on each other:

* what ALYR still numbers (its invoices) is made by hand, by the form or by a staff message, and
  carries a payment link and the QR code on the paper;
* what the other system numbers is refused at every door of ALYR's own, whoever asks (the form,
  the staff command), and is delivered as it came: no payment link, no QR code, no claim on the
  paper that ALYR will take the money for it;
* the payment a customer makes by the link is told to the shop's own system like any other.
"""

import re
from uuid import UUID, uuid4

import pytest

from connect_support import Receiver
from documents_support import LINES, LINES_TOTAL
from pdf_support import page_text
from test_consent import owner_sql
from test_documents_standalone_wa import OWNER, Shop, buttons
from test_onboarding import new_business

BASE = "/api/connect-setup"
SCAN = "Scan to pay online"


@pytest.fixture
def both(client_factory, monkeypatch):
    """An invoices-only shop (made through onboarding) that has accepted the connection terms,
    has a key and a machine that speaks with it, and a staff number."""
    monkeypatch.setenv("ALYR_INVOICES_FOR_NEW_SHOPS", "true")
    monkeypatch.setenv("ALYR_WEBHOOK_ALLOW_LOCAL", "true")      # a receiver on this machine
    client = client_factory()
    _, slug, _ = new_business(client, kind="invoices")
    assert client.put("/api/documents/settings", json={"commercial_registration": "77889"}
                      ).status_code == 200
    assert client.post("/api/staff-numbers", json={
        "name": "Salem (owner)", "phone": OWNER, "lang": "en"}).status_code == 200
    assert client.post(f"{BASE}/terms/accept").status_code == 200, "terms"
    made = client.post(f"{BASE}/keys", json={
        "name": "Till 1", "scopes": ["sales:write", "documents:read", "webhooks"]})
    assert made.status_code == 201, made.text
    machine = client_factory()
    shop = Shop(client, slug)
    shop.machine, shop.secret = machine, made.json()["secret"]
    return shop


def hand_over(shop, **kinds):
    done = shop.client.put(f"{BASE}/authority", json={"changes": kinds})
    assert done.status_code == 200, done.text


def till_sale(shop, kind, number, sale_id=None):
    body = {
        "external_sale_id": sale_id or f"POS-{uuid4().hex[:8]}", "kind": kind,
        "external_document_number": number,
        "customer": {"phone": "+974 5555 0199", "name": "Fatima Al-Kuwari"},
        "lines": [dict(line) for line in LINES], "totals": {"total_minor": LINES_TOTAL},
    }
    body["payment"] = ({"method": "cash", "amount_minor": LINES_TOTAL} if kind == "receipt"
                       else "unpaid")
    return shop.machine.post("/api/connect/sales", json=body, headers={
        "Authorization": f"Bearer {shop.secret}", "Idempotency-Key": f"idem-{uuid4().hex}"})


def hand_made(shop, kind, contact_id, key=None):
    return shop.client.post(
        "/api/documents", headers={"Idempotency-Key": key or f"hm-{uuid4().hex}"},
        json={"kind": kind, "issue": True, "contact_id": contact_id,
              "customer": {"name": "Ahmed Al Thani", "phone": "55512345"},
              "payments": ([{"method": "cash", "amount_minor": 50000}] if kind == "receipt" else []),
              "lines": [{"description": "AC repair", "quantity": "1", "unit": "service",
                         "unit_price_minor": 50000}]})


def pay_rows(doc_id):
    return owner_sql("select id, tenant_id, amount, status from payment_requests "
                     "where document_id = $1", UUID(doc_id))


def test_the_invoices_alyr_still_numbers_get_a_link_and_a_code_while_the_receipts_are_the_tills(both):
    shop = both
    who = shop.customer("Ahmed Al Thani", "97455512345")
    hand_over(shop, receipt="external")

    # ALYR's own invoice, made by hand: its number, its payment link, the QR code on the paper
    made = hand_made(shop, "invoice", who)
    assert made.status_code == 201, made.text
    doc = made.json()["document"]
    assert doc["number"] == "INV-0001"
    [request] = pay_rows(doc["id"])
    assert request["amount"] == 50000 and request["status"] == "pending"
    pdf = shop.client.get(f"/api/documents/{doc['id']}/pdf").content
    assert SCAN in page_text(pdf)

    # a receipt is the till's: refused by the form, in both languages, nothing numbered
    refused = hand_made(shop, "receipt", who)
    assert refused.status_code == 409 and refused.json()["code"] == "external_authority"
    assert refused.json()["message_ar"]
    assert shop.documents(kind="receipt") == []

    # the till's receipt arrives with its own number, and is not ALYR's to take money for
    answer = till_sale(shop, "receipt", "T-9001")
    assert answer.status_code in (200, 201), answer.text
    [receipt] = shop.documents(kind="receipt")
    assert receipt["number"] == "T-9001"
    assert pay_rows(str(receipt["id"])) == []

    # the owner's phone, too: an invoice by message is ALYR's, a receipt is refused
    [ask] = shop.talk(OWNER, "invoice Ahmed 300 for a filter")
    assert set(buttons(ask)) == {"yes", "edit", "no"}
    [done] = shop.talk(OWNER, reply_id=buttons(ask)["yes"])
    assert "INV-0002" in done["body"]
    [second] = shop.documents(number="INV-0002")
    assert pay_rows(str(second["id"]))                       # the message's invoice has its link
    reply = shop.talk(OWNER, "Ahmed paid 500 cash")
    assert [r for r in reply if buttons(r).get("yes")] == []  # no confirmation to say Yes to
    assert len(shop.documents(kind="receipt")) == 1           # only the till's
    # "only a receipt" is a document of a kind the till numbers: said at once, before any Yes
    [no] = shop.talk(OWNER, reply_id="doc:pick:2")
    assert "numbered by the shop's other system" in no["body"] and not no["payload"].get("choices")
    assert len(shop.documents(kind="receipt")) == 1


def test_a_document_the_other_system_numbered_carries_no_payment_link_or_code(both):
    shop = both
    who = shop.customer("Ahmed Al Thani", "97455512345")

    # ALYR numbers invoices to start with: the code is drawn and the link is open
    mine = hand_made(shop, "invoice", who).json()["document"]
    assert pay_rows(mine["id"]) and SCAN in page_text(
        shop.client.get(f"/api/documents/{mine['id']}/pdf").content)

    # then the invoices go to the till, which sends one with its number, unpaid, for a customer
    hand_over(shop, invoice="external")
    answer = till_sale(shop, "invoice", "POS-INV-77")
    assert answer.status_code in (200, 201), answer.text
    [theirs] = shop.documents(number="POS-INV-77")
    assert theirs["number"] == "POS-INV-77"
    assert pay_rows(str(theirs["id"])) == []                  # no link, owing or not
    pdf = shop.client.get(f"/api/documents/{theirs['id']}/pdf").content
    assert SCAN not in page_text(pdf)
    # the hosted page names no link either, and says whose number it is
    token = re.search(r"t=([\w.-]+)", shop.client.post(
        f"/api/documents/{theirs['id']}/link").json()["url"]).group(1)
    page = shop.client.get(f"/api/d/{shop.slug}", headers={"X-Order-Link": token}).json()["document"]
    assert page["pay"] is None and page["external"] is True

    # and ALYR's own invoice is as it was: still drawn with the code, its link still open
    assert SCAN in page_text(shop.client.get(f"/api/documents/{mine['id']}/pdf").content)
    assert pay_rows(mine["id"])[0]["status"] == "pending"
    # the form no longer makes an invoice of ALYR's own
    refused = hand_made(shop, "invoice", who)
    assert refused.status_code == 409 and refused.json()["code"] == "external_authority"
    # and the owner's phone is told the same at once, with nothing to confirm
    [told] = shop.talk(OWNER, "invoice Ahmed 300 for a filter")
    assert "numbered by the shop's other system" in told["body"]
    assert not told["payload"].get("choices")


def test_a_payment_by_the_link_is_told_to_the_shops_own_system(both):
    shop = both
    hook = Receiver()
    try:
        added = shop.client.post(f"{BASE}/webhooks", json={
            "url": hook.url, "events": ["payment.recorded"]})
        assert added.status_code == 201, added.text
        who = shop.customer("Ahmed Al Thani", "97455512345")
        doc = hand_made(shop, "invoice", who).json()["document"]
        [request] = pay_rows(doc["id"])
        done = shop.client.post(f"/api/pay/{request['tenant_id']}/{request['id']}/complete")
        assert done.status_code == 200, done.text
        paid = owner_sql("select method, amount_minor from manual_payments where subject_id = $1",
                         UUID(doc["id"]))
        assert [(p["method"], p["amount_minor"]) for p in paid] == [("link", 50000)]
        # queued in the paying transaction, once, with no customer in it
        queued = owner_sql("select event, payload from webhook_deliveries "
                           "where tenant_id = $1 and event = 'payment.recorded'",
                           UUID(str(shop.tenant())))
        assert len(queued) == 1
        assert "Ahmed" not in str(queued[0]["payload"])
        # the same report again changes nothing
        again = shop.client.post(f"/api/pay/{request['tenant_id']}/{request['id']}/complete")
        assert again.status_code in (200, 409)
        assert len(owner_sql("select 1 from webhook_deliveries where tenant_id = $1 "
                             "and event = 'payment.recorded'", UUID(str(shop.tenant())))) == 1
    finally:
        hook.stop()
