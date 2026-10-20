"""A payment link on an invoice made by hand (ALY-141, spec 016): the link, the QR code on the
paper and the button on the hosted page are one request; the customer paying it pays the invoice
and gets a receipt, once; and where a link cannot work the paper says nothing about paying online.

The QR code's matrix is proved here to be exactly what the engine drew on the page; that the
matrix scans is proved by the web side's decode test (`qrDocument.test.mjs`, jsQR), and the browser
check reads the real page back as a picture.
"""

import re
from uuid import UUID, uuid4

import pytest

from alyr.core import links, qr
from alyr.modules.documents import paylink, service
from alyr.modules.documents.render import render
from documents_sales_support import customer, documents, sales_shop
from pdf_support import page_text
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    s = sales_shop(client_factory, monkeypatch)
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'payments') "
              "on conflict do nothing", s.tenant_id)
    return s


def invoice(shop, who=None, price=50000, **more):
    who = who or customer(shop, "Ahmed Al Thani")
    answer = shop.owner.post(
        "/api/documents", headers={"Idempotency-Key": f"inv-{uuid4().hex}"},
        json={"kind": "invoice", "issue": True, "contact_id": who.id,
              "customer": {"name": who.name, "phone": who.phone},
              "lines": [{"description": "AC repair", "quantity": "1", "unit": "service",
                         "unit_price_minor": price}], **more})
    assert answer.status_code == 201, answer.text
    return answer.json()["document"], who


def request_of(doc_id):
    rows = owner_sql("select id, tenant_id, amount, status, contact_id, provider from "
                     "payment_requests where document_id = $1", UUID(doc_id))
    return rows[0] if rows else None


def pay(shop, request):
    return shop.owner.post(f"/api/pay/{request['tenant_id']}/{request['id']}/complete")


def token_of(shop, doc):
    url = shop.owner.post(f"/api/documents/{doc['id']}/link").json()["url"]
    return re.search(r"t=([\w.-]+)", url).group(1)


# ── the link ──────────────────────────────────────────────────────────────────────────────


def test_an_invoice_for_a_customer_gets_a_payment_link_for_what_is_owed(shop):
    doc, who = invoice(shop, price=50000)
    request = request_of(doc["id"])
    assert request["amount"] == 50000 and request["status"] == "pending"
    assert str(request["contact_id"]) == who.id
    got = shop.owner.get(f"/api/documents/{doc['id']}").json()["document"]
    assert got["payment_link"]["status"] == "pending" and got["payment_link"]["amount_minor"] == 50000
    assert got["payment_link"]["url"].endswith(f"/pay/{shop.tenant_id}/{request['id']}")
    # one request per document, whatever asks again
    assert owner_sql("select count(*) as n from payment_requests where document_id = $1",
                     UUID(doc["id"]))[0]["n"] == 1


def test_the_qr_on_the_paper_is_exactly_the_link_and_the_page_says_what_it_is(shop, monkeypatch):
    seen = {}
    original = service.render_pdf

    async def spy(doc):
        seen["doc"] = doc
        return await original(doc)

    monkeypatch.setattr(service, "render_pdf", spy)
    doc, _ = invoice(shop, price=50000)
    drawn = seen["doc"]
    url = request_url(doc)
    assert drawn.pay_url == url
    pdf = shop.owner.get(f"/api/documents/{doc['id']}/pdf").content
    text = page_text(pdf)
    assert "Scan to pay online" in text and "500.00" in text
    # Draw it again with a trace and read the dark modules back from the squares drawn.
    trace: list = []
    render(drawn, trace)
    rows = qr.encode(url)
    n = len(rows)
    side = 22.0
    step = side / n
    # A run of dark modules is one square, one module high and a hair (the trace rounds to 0.1).
    # A long run can be wider than any fixed width, so the height is what tells it from a rule.
    squares = [c for c in trace if c[0] == "fill" and c[5] == "#15171a"
               and abs(c[4] - round(step + 0.02, 1)) < 1e-6 and c[3] <= side]
    x0 = min(c[1] for c in squares)
    y0 = min(c[2] for c in squares)
    read = [[False] * n for _ in range(n)]
    for _, x, y, w, _h, _colour in squares:
        r, c0, length = round((y - y0) / step), round((x - x0) / step), round(w / step)
        for c in range(c0, c0 + length):
            read[r][c] = True
    assert read == rows


def request_url(doc) -> str:
    request = request_of(doc["id"])
    return paylink.url(request["tenant_id"], request["id"])


def test_an_arabic_first_invoice_and_a_roll_carry_the_code_too(shop):
    shop.owner.put("/api/documents/settings", json={"languages": "ar_en", "layout": "thermal80"})
    doc, _ = invoice(shop)
    pdf = shop.owner.get(f"/api/documents/{doc['id']}/pdf").content
    assert "امسح" in page_text(pdf) or "Scan to pay" in page_text(pdf)
    on_a4 = shop.owner.get(f"/api/documents/{doc['id']}/pdf?layout=a4").content
    assert b"%PDF" in on_a4 and "Scan to pay" in page_text(on_a4)       # a copy keeps the code


def test_the_hosted_page_shows_a_pay_button_while_the_invoice_can_be_paid(shop):
    doc, _ = invoice(shop)
    token = token_of(shop, doc)
    page = shop.owner.get(f"/api/d/{shop.slug}", headers={"X-Order-Link": token}).json()["document"]
    assert page["pay"]["url"] == request_url(doc) and page["pay"]["amount_minor"] == 50000
    # the page still names nobody
    assert "Ahmed" not in str(page)


def test_the_pay_page_names_the_invoice_it_pays(shop):
    doc, _ = invoice(shop)
    request = request_of(doc["id"])
    shown = shop.owner.get(f"/api/pay/{request['tenant_id']}/{request['id']}").json()
    assert shown["document_number"] == doc["number"] and shown["document_kind"] == "invoice"
    assert shown["order_number"] is None and shown["amount"] == 50000


# ── the customer pays ─────────────────────────────────────────────────────────────────────


def test_paying_the_link_pays_the_invoice_and_makes_the_receipt_once(shop):
    doc, who = invoice(shop)
    request = request_of(doc["id"])
    assert pay(shop, request).json() == {"status": "paid"}
    assert pay(shop, request).json() == {"status": "paid"}              # the gateway reports twice
    got = shop.owner.get(f"/api/documents/{doc['id']}").json()["document"]
    assert got["now"] == {"paid_minor": 50000, "balance_minor": 0}
    [recorded] = got["recorded_payments"]
    assert recorded["method"] == "link" and recorded["amount_minor"] == 50000
    assert recorded["recorded_by"] == "Payment link"
    [child] = got["children"]
    assert child["kind"] == "receipt" and child["total_minor"] == 50000
    receipt = shop.owner.get(f"/api/documents/{child['id']}").json()["document"]
    assert receipt["payments"][0]["method"] == "link" and receipt["related"]["id"] == doc["id"]
    assert receipt["customer"]["name"] == who.name
    assert len([d for d in documents(shop) if d["kind"] == "receipt"]) == 1
    # the payment is on the record, the invoice is untouched, and the link is closed
    assert request_of(doc["id"])["status"] == "paid"
    assert got["payment_link"]["status"] == "paid" and got["number"] == doc["number"]
    token = token_of(shop, doc)
    page = shop.owner.get(f"/api/d/{shop.slug}", headers={"X-Order-Link": token}).json()["document"]
    assert page["pay"] is None


def test_a_payment_by_hand_changes_what_the_link_asks_for_and_a_full_one_closes_it(shop):
    doc, _ = invoice(shop, price=50000)
    partly = shop.owner.post("/api/documents/payments", headers={"Idempotency-Key": "hand-pay-001"},
                             json={"subject": "invoice", "id": doc["id"], "method": "cash",
                                   "amount_minor": 20000})
    assert partly.status_code == 201, partly.text
    request = request_of(doc["id"])
    assert request["amount"] == 30000 and request["status"] == "pending"
    assert pay(shop, request).status_code == 200
    got = shop.owner.get(f"/api/documents/{doc['id']}").json()["document"]
    assert got["now"]["balance_minor"] == 0
    assert sorted(p["amount_minor"] for p in got["recorded_payments"]) == [20000, 30000]
    # and when the rest is paid by hand, the link is closed and cannot take money
    second, _ = invoice(shop, price=10000)
    shop.owner.post("/api/documents/payments", headers={"Idempotency-Key": "hand-pay-002"},
                    json={"subject": "invoice", "id": second["id"], "method": "cash"})
    closed = request_of(second["id"])
    assert closed["status"] == "expired"
    assert pay(shop, closed).status_code == 409


def test_cancelling_the_invoice_closes_its_link(shop):
    doc, _ = invoice(shop)
    request = request_of(doc["id"])
    cancelled = shop.owner.post(f"/api/documents/{doc['id']}/cancel", json={"reason": "Mistake"})
    assert cancelled.status_code == 201, cancelled.text
    assert request_of(doc["id"])["status"] == "expired"
    refused = pay(shop, request)
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "expired"
    token = token_of(shop, doc)
    page = shop.owner.get(f"/api/d/{shop.slug}", headers={"X-Order-Link": token}).json()["document"]
    assert page["pay"] is None and page["status"] == "void"
    assert [d for d in documents(shop) if d["kind"] == "receipt"] == []


def test_a_shop_that_does_not_make_receipts_for_payments_still_records_the_payment(shop):
    shop.owner.put("/api/documents/settings", json={"auto_receipt_on_payment": False})
    doc, _ = invoice(shop)
    assert pay(shop, request_of(doc["id"])).status_code == 200
    got = shop.owner.get(f"/api/documents/{doc['id']}").json()["document"]
    assert got["now"]["balance_minor"] == 0 and got["children"] == []
    [payment] = got["recorded_payments"]
    # the receipt can still be made afterwards, once
    made = shop.owner.post(f"/api/documents/payments/{payment['id']}/receipt")
    assert made.status_code == 200 and made.json()["document"]["kind"] == "receipt"


# ── where there is no link ────────────────────────────────────────────────────────────────


def test_no_link_without_the_payments_module(client_factory, monkeypatch):
    s = sales_shop(client_factory, monkeypatch)      # no payment links in this shop
    doc, _ = invoice(s)
    assert request_of(doc["id"]) is None
    got = s.owner.get(f"/api/documents/{doc['id']}").json()["document"]
    assert got["payment_link"] is None
    assert "Scan to pay" not in page_text(s.owner.get(f"/api/documents/{doc['id']}/pdf").content)


def test_on_a_real_server_without_a_provider_the_paper_says_nothing_of_paying_online(
    shop, monkeypatch,
):
    class Production:
        env = "production"

    monkeypatch.setattr(paylink, "get_settings", lambda: Production())
    doc, _ = invoice(shop)
    assert request_of(doc["id"]) is None
    assert "Scan to pay" not in page_text(shop.owner.get(f"/api/documents/{doc['id']}/pdf").content)


@pytest.mark.parametrize("what", ["receipt", "no_customer", "from_an_order", "settled"])
def test_only_an_invoice_made_by_hand_for_a_customer_with_something_owing_gets_one(shop, what):
    who = customer(shop, "Ahmed Al Thani")
    body = {"kind": "invoice", "issue": True, "contact_id": who.id, "customer": {"name": "Ahmed"},
            "lines": [{"description": "x", "quantity": "1", "unit": "service",
                       "unit_price_minor": 10000}]}
    if what == "receipt":
        body |= {"kind": "receipt", "payments": [{"method": "cash", "amount_minor": 10000}]}
    elif what == "no_customer":
        body["contact_id"] = None
    elif what == "from_an_order":
        body |= {"source": "order", "source_ref": str(uuid4())}
    elif what == "settled":
        body |= {"payments": [{"method": "cash", "amount_minor": 10000}]}
    answer = shop.owner.post("/api/documents", headers={"Idempotency-Key": f"k-{uuid4().hex}"},
                             json=body)
    assert answer.status_code == 201, answer.text
    assert request_of(answer.json()["document"]["id"]) is None


def test_one_shop_cannot_pay_or_read_another_shops_invoice_link(shop, client_factory, monkeypatch):
    doc, _ = invoice(shop)
    request = request_of(doc["id"])
    other = sales_shop(client_factory, monkeypatch)
    # the request is not in the other shop's scope: its tenant in the address finds nothing
    wrong = other.owner.get(f"/api/pay/{other.tenant_id}/{request['id']}")
    assert wrong.status_code == 404
    assert other.owner.post(f"/api/pay/{other.tenant_id}/{request['id']}/complete").status_code == 404
    assert request_of(doc["id"])["status"] == "pending"
    assert links  # (the link module is what signs the hosted page; imported for the reader)
