"""A week of a shop's life (ALY-139's "done means"): orders paid by link and by hand, a booking
with a deposit, credit sales and their payments, cancellations and a refund, events that fire
twice, and a staff member cancelling a receipt: and at the end the full, exact set of numbered
documents, in both languages, gapless per kind, nothing issued twice and nothing sent twice.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from alyr.modules.documents import service as doc_service
from alyr.modules.ledger import service as ledger
from documents_sales_support import (
    customer,
    deliveries,
    document_messages,
    documents,
    item,
    numbers,
    pay_by_link,
    placed,
    run_in_app,
    sales_shop,
)
from pay_links import pay
from pdf_support import has_letters, page_text
from test_documents_manual_payments import record, service_and_booking

MONDAY = datetime(2026, 10, 12, 9, 30, tzinfo=UTC)


def cancel_order(shop, order):
    return shop.owner.post(f"/api/orders/{order['order_id']}/status", json={"status": "cancelled"})


def test_a_week_of_demo_activity_makes_exactly_the_right_documents(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    clock = {"now": MONDAY}
    monkeypatch.setattr(doc_service, "_clock", lambda: clock["now"])

    def day(n: int) -> None:
        clock["now"] = MONDAY + timedelta(days=n, hours=n % 3)

    huda = customer(shop, "Huda Al-Naimi")
    fahad = customer(shop, "فهد الكواري", lang="ar")
    noor = customer(shop, "نور المهندي", lang="ar", credit_limit=500_000)
    salem = customer(shop, "Salem Al-Thani")
    bread = item(shop, "Fresh Arabic bread", "خبز عربي طازج", 350)
    cake = item(shop, "Large date cake", "كعكة التمر الكبيرة", 4500)
    coffee = item(shop, "Arabic coffee 250 g", "قهوة عربية 250 غرام", 3200)

    # ── Monday: two paid by link, one on credit
    day(0)
    o1 = placed(shop, huda, [(bread, 12)])
    o2 = placed(shop, fahad, [(cake, 2), (coffee, 1)])
    o3 = placed(shop, noor, [(cake, 3)], payment="account")
    pay_by_link(shop, o1)
    pay_by_link(shop, o2)

    # ── Tuesday: cash across the counter, and a deposit on a booking
    day(1)
    o4 = placed(shop, salem, [(coffee, 2)])
    assert record(shop.owner, "order", o4["order_id"], reference="till 1").status_code == 201
    _, booking = service_and_booking(shop, huda, price=5000)
    assert record(shop.owner, "booking", booking, amount_minor=2000, method="card_terminal").status_code == 201

    # ── Wednesday: the rest of the booking, a payment on a credit account, a payment reported twice
    day(2)
    assert record(shop.owner, "booking", booking).status_code == 201

    async def ask(conn):
        return await ledger.create_payment_request(conn, UUID(noor.id), 10_000, "http://web.test")

    link = run_in_app(shop.owner, shop.tenant_id, ask)
    for _ in range(2):
        pay(shop.owner, link)

    # ── Thursday: a paid order cancelled, a credit order cancelled
    day(3)
    o5 = placed(shop, fahad, [(bread, 4)])
    pay_by_link(shop, o5)
    assert cancel_order(shop, o5).status_code == 200
    assert cancel_order(shop, o3).status_code == 200

    # ── Friday: another credit sale, part of it paid by cheque; a card terminal
    day(4)
    o6 = placed(shop, noor, [(cake, 1), (bread, 5)], payment="account")
    [invoice_two] = [d for d in documents(shop, kind="invoice") if d["source_ref"] == o6["order_id"]]
    assert record(shop.owner, "invoice", invoice_two["id"], amount_minor=2000, method="cheque",
                  reference="cheque 0042").status_code == 201
    o7 = placed(shop, salem, [(coffee, 1), (bread, 2)])
    assert record(shop.owner, "order", o7["order_id"], method="card_terminal").status_code == 201

    # ── Saturday: staff cancel a receipt and tell the customer; an invoice on request
    day(5)
    cash_receipt = next(d for d in documents(shop, kind="receipt") if d["source_ref"] == o4["order_id"])
    voided = shop.owner.post(f"/api/documents/{cash_receipt['id']}/cancel",
                             json={"reason": "Customer returned the coffee", "notify": True})
    assert voided.status_code == 201, voided.text
    asked = shop.owner.post(f"/api/documents/from/order/{o1['order_id']}", json={"kind": "invoice"})
    assert asked.status_code == 201, asked.text

    # ── Sunday: every event fires again; nothing new may appear
    day(6)
    before = [d["id"] for d in documents(shop)]
    pay_by_link(shop, o1)
    pay_by_link(shop, o5)
    cancel_order(shop, o5)
    cancel_order(shop, o3)
    record(shop.owner, "order", o4["order_id"], key="a-fresh-key-for-the-same-order")   # refused: already paid
    shop.owner.post(f"/api/documents/from/order/{o1['order_id']}", json={"kind": "invoice"})
    shop.owner.post(f"/api/documents/from/order/{o3['order_id']}", json={"kind": "invoice"})  # cancelled order: refused
    assert [d["id"] for d in documents(shop)] == before

    # ── the full set
    assert numbers(shop, "receipt") == [f"RC-{i:04d}" for i in range(1, 9)]
    assert numbers(shop, "deposit_receipt") == ["DR-0001"]
    assert numbers(shop, "invoice") == ["INV-0001", "INV-0002", "INV-0003"]
    assert numbers(shop, "credit_note") == ["CN-0001", "CN-0002", "CN-0003"]
    everything = documents(shop)
    assert len(everything) == 8 + 1 + 3 + 3
    assert len({d["number"] for d in everything}) == len(everything)            # no number twice
    assert len({d["issue_key"] for d in everything}) == len(everything)         # no key twice

    by_number = {d["number"]: d for d in everything}
    assert sorted(n for n, d in by_number.items() if d["status"] == "void") == [
        "INV-0001", "RC-0003", "RC-0006"]
    # What each credit note cancels.
    cancels = {d["number"]: next(x["number"] for x in everything if x["id"] == d["related_document_id"])
               for d in everything if d["kind"] == "credit_note"}
    assert cancels == {"CN-0001": "RC-0006", "CN-0002": "INV-0001", "CN-0003": "RC-0003"}

    # The money: what was collected, by receipts that are still standing.
    standing = sum(d["paid_minor"] for d in everything if d["kind"] in ("receipt", "deposit_receipt") and d["status"] == "issued")
    assert standing == (
        12 * 350                       # RC-0001  Huda, by link
        + 2 * 4500 + 3200              # RC-0002  Fahad, by link
        + 5000                         # RC-0004  the booking, in full (the deposit is DR-0001)
        + 10_000                       # RC-0005  Noor on her account
        + 2000                         # RC-0007  Noor, cheque on INV-0002
        + 3200 + 700                   # RC-0008  Salem, card terminal
    ) + 2000                           # DR-0001 still stands beside the final receipt

    # Both languages on every paper, and every paper checks out against its own hash.
    for d in everything:
        proof = shop.owner.get(f"/api/documents/{d['id']}/verify").json()
        assert proof["ok"] is True, d["number"]
        pdf = shop.owner.get(f"/api/documents/{d['id']}/pdf").content
        text = page_text(pdf)
        assert d["number"] in text, d["number"]
        arabic_title = {"receipt": "إيصال", "deposit_receipt": "إيصال عربون", "invoice": "فاتورة",
                        "credit_note": "إشعار دائن"}[d["kind"]]
        english_title = {"receipt": "Receipt", "deposit_receipt": "Deposit receipt", "invoice": "Invoice",
                         "credit_note": "Credit note"}[d["kind"]]
        assert has_letters(text, arabic_title), (d["number"], "no Arabic title")
        assert english_title in text, (d["number"], "no English title")
        assert d["languages"] == "ar_en"

    # Customers were told in their own language, each paper once.
    for who, expected in ((huda, ["RC-0001", "DR-0001", "RC-0004", "INV-0003"]),
                          (fahad, ["RC-0002", "RC-0006", "CN-0001"]),
                          (salem, ["RC-0003", "RC-0008", "CN-0003"]),
                          (noor, ["INV-0001", "RC-0005", "CN-0002", "INV-0002", "RC-0007"])):
        got = [m["payload"].get("filename", "").removesuffix(".pdf") for m in document_messages(who)]
        assert sorted(got) == sorted(expected), (who.name, got)
        for message in document_messages(who):
            assert message["body"].startswith("‏") == (who.lang == "ar"), (who.name, message["body"])
            assert ("QAR" in message["body"]) == (who.lang == "en"), (who.name, message["body"])
    # ...and the owner can see every one arrived at the channel.
    for d in everything:
        sent = deliveries(shop, d["id"])
        assert [x["state"] for x in sent] == ["sent"], (d["number"], sent)
