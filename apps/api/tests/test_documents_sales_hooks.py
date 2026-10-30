"""Receipts, invoices and credit notes made from ALYR's own sales (ALY-139).

The rules these prove: a document is made when the sale happens and only then; it is made
once however often or however fast the event fires; a shop without the module is untouched;
a document that cannot be made never takes the sale down with it; and a cancelled sale is
cancelled on paper by a credit note, once, linked, in the cancellation's own transaction.
"""

from uuid import UUID

import pytest

import pay_links
from alyr.core import team
from alyr.modules.documents import sales
from alyr.modules.documents import service as doc_service
from alyr.modules.ledger import service as ledger
from documents_sales_support import (
    activity,
    concurrently,
    customer,
    documents,
    item,
    numbers,
    pay_by_link,
    placed,
    run_in_app,
    sales_shop,
)
from test_consent import owner_sql


def fetch(shop, doc_id):
    found = shop.owner.get(f"/api/documents/{doc_id}")
    assert found.status_code == 200, found.text
    return found.json()["document"]


def cancel(shop, order):
    return shop.owner.post(f"/api/orders/{order['order_id']}/status", json={"status": "cancelled"})


# ------------------------------------------------------------ a paid order gets a receipt


def test_a_paid_order_gets_one_receipt_with_its_lines(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    bread = item(shop)
    order = placed(shop, who, [(bread, 12)])
    assert documents(shop) == []                       # nothing before it is paid

    assert pay_by_link(shop, order).json() == {"status": "paid"}
    [receipt] = documents(shop)
    assert (receipt["kind"], receipt["status"], receipt["number"]) == ("receipt", "issued", "RC-0001")
    assert (receipt["source"], receipt["source_ref"]) == ("order", order["order_id"])
    assert receipt["total_minor"] == receipt["paid_minor"] == 12 * 350
    assert str(receipt["contact_id"]) == who.id

    shown = fetch(shop, receipt["id"])
    assert [(x["description"], x["description_ar"], x["quantity"], x["unit_price_minor"])
            for x in shown["lines"]] == [("Fresh Arabic bread", "خبز عربي طازج", "12.000", 350)]
    assert shown["payments"] == [{"method": "link", "amount_minor": 4200, "reference": ""}]
    assert shown["customer"]["name"] == "Huda Al-Naimi"
    assert shown["customer"]["phone"] == f"+{who.phone}"
    assert shown["languages"] == "ar_en" and shown["audience"] == "consumer"
    assert shown["notes"]["en"] == f"Order {order['number']}."
    assert shown["notes"]["ar"] == f"الطلب رقم {order['number']}."
    assert shown["issued_by"] == "ALYR"
    assert shown["pdf"]["bytes"] > 10_000


def test_the_shops_standing_receipt_note_is_kept_beside_the_orders(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch,
                      notes={"receipt": {"en": "Thank you!", "ar": "شكراً لكم!"}})
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    [receipt] = documents(shop)
    assert fetch(shop, receipt["id"])["notes"] == {
        "en": f"Order {order['number']}. Thank you!", "ar": f"الطلب رقم {order['number']}. شكراً لكم!"}


def test_a_payment_reported_twice_issues_the_receipt_once(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    assert pay_by_link(shop, order).json() == {"status": "paid"}
    assert pay_by_link(shop, order).json() == {"status": "paid"}
    assert len(documents(shop, kind="receipt")) == 1
    assert numbers(shop, "receipt") == ["RC-0001"]


def test_the_hook_called_again_returns_the_same_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    order_id = UUID(order["order_id"])
    again = run_in_app(shop.owner, shop.tenant_id, lambda conn: sales.order_paid(conn, order_id))
    assert again.replayed is True and again.document["number"] == "RC-0001"
    assert len(documents(shop)) == 1


def test_two_payment_events_at_the_same_moment_issue_one_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    order_id = UUID(order["order_id"])
    # The order is marked paid, as the gateway's report does; then the event fires twice at once.
    owner_sql("update orders set payment = 'paid' where id = $1", order_id)
    results = concurrently(
        shop.owner, shop.tenant_id,
        *[lambda conn: sales.order_paid(conn, order_id) for _ in range(6)])
    assert not [r for r in results if isinstance(r, Exception)], results
    assert sorted(r.replayed for r in results) == [False] + [True] * 5
    assert len(documents(shop)) == 1
    assert numbers(shop, "receipt") == ["RC-0001"]


def test_several_orders_paid_together_take_the_numbers_in_order_with_no_gap(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    bread = item(shop)
    orders = [placed(shop, customer(shop, f"Customer {i}"), [(bread, i + 1)]) for i in range(5)]
    for o in orders:
        owner_sql("update orders set payment = 'paid' where id = $1", UUID(o["order_id"]))
    concurrently(shop.owner, shop.tenant_id, *[
        (lambda oid: lambda conn: sales.order_paid(conn, oid))(UUID(o["order_id"])) for o in orders])
    assert numbers(shop, "receipt") == [f"RC-000{i}" for i in range(1, 6)]


# ------------------------------------------------------------ the module is off


def test_a_shop_without_the_module_is_exactly_as_before(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, documents=False)
    who = customer(shop, credit_limit=100_000)
    order = placed(shop, who)
    assert pay_by_link(shop, order).json() == {"status": "paid"}
    on_account = placed(shop, who, payment="account")
    assert cancel(shop, on_account).status_code == 200

    assert owner_sql("select count(*) as n from documents where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 0
    assert owner_sql("select count(*) as n from document_deliveries where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 0
    assert owner_sql("select count(*) as n from document_settings where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 0
    assert owner_sql("select count(*) as n from activity where tenant_id = $1 "
                     "and (subject = 'document' or action like 'document%')",
                     shop.tenant_id)[0]["n"] == 0
    # The customer was told what they always were: no document, no template for one.
    sent = owner_sql("select kind, payload from messages where tenant_id = $1 and direction = 'out'",
                     shop.tenant_id)
    assert sent and all(m["kind"] != "document" for m in sent)
    assert not [m for m in sent if "document" in str(m["payload"])]
    assert shop.owner.get("/api/documents").status_code == 403
    assert shop.owner.post("/api/documents/payments", json={}).status_code == 403


def test_switching_the_module_off_stops_the_hooks(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    owner_sql("update tenant_modules set enabled = false where tenant_id = $1 and module_key = 'documents'",
              shop.tenant_id)
    pay_by_link(shop, placed(shop, customer(shop)))
    assert documents(shop) == []


# ------------------------------------------------------------ the shop's switches


def test_the_shop_can_switch_the_automatic_receipt_off_and_ask_for_one_later(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, auto_receipt_on_payment=False)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    assert documents(shop) == []

    asked = shop.owner.post(f"/api/documents/from/order/{order['order_id']}", json={"kind": "receipt"})
    assert asked.status_code == 201, asked.text
    assert asked.json()["document"]["number"] == "RC-0001"
    again = shop.owner.post(f"/api/documents/from/order/{order['order_id']}", json={"kind": "receipt"})
    assert again.status_code == 200 and again.json()["replayed"] is True
    assert len(documents(shop)) == 1


def test_the_settings_for_what_happens_on_their_own_are_saved_and_on_the_record(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    got = shop.owner.get("/api/documents/settings").json()["settings"]
    assert (got["auto_receipt_on_payment"], got["auto_invoice_credit_sales"],
            got["auto_deposit_receipt"], got["auto_send_whatsapp"], got["auto_send_email"],
            got["send_mode"], got["agents_may_record_payments"]) == (
        True, True, True, True, True, "automatic", False)
    saved = shop.owner.put("/api/documents/settings", json={
        "send_mode": "manual", "auto_send_email": False, "agents_may_record_payments": True})
    assert saved.status_code == 200, saved.text
    after = saved.json()["settings"]
    assert (after["send_mode"], after["auto_send_email"], after["agents_may_record_payments"]) == (
        "manual", False, True)
    changes = [a for a in activity(shop, "document", shop.tenant_id, "settings_changed")][-1]["detail"]
    assert {"field": "send_mode", "from": "automatic", "to": "manual"} in changes["changes"]
    assert shop.owner.put("/api/documents/settings", json={"send_mode": "sometimes"}).status_code == 422
    assert shop.agent.put("/api/documents/settings", json={"send_mode": "automatic"}).status_code == 403


# ------------------------------------------------------------ a credit sale gets an invoice


def test_an_order_on_a_customers_credit_account_gets_an_invoice(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    order = placed(shop, who, payment="account")
    [invoice] = documents(shop)
    assert (invoice["kind"], invoice["number"], invoice["status"]) == ("invoice", "INV-0001", "issued")
    assert invoice["total_minor"] == 4200 and invoice["paid_minor"] == 0
    assert (invoice["source"], invoice["source_ref"]) == ("order", order["order_id"])
    shown = fetch(shop, invoice["id"])
    assert shown["totals"]["balance_minor"] == 4200
    assert shown["customer"]["name"] == who.name
    # Paying later does not make a second invoice; the order was never "paid" by link.
    assert len(documents(shop)) == 1


def test_the_same_order_asked_for_as_an_invoice_returns_the_one_already_made(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop, credit_limit=100_000), payment="account")
    asked = shop.owner.post(f"/api/documents/from/order/{order['order_id']}", json={"kind": "invoice"})
    assert asked.status_code == 200 and asked.json()["replayed"] is True
    assert len(documents(shop)) == 1


def test_an_invoice_can_be_asked_for_on_any_order_even_a_paid_one(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    asked = shop.owner.post(f"/api/documents/from/order/{order['order_id']}", json={"kind": "invoice"})
    assert asked.status_code == 201, asked.text
    doc = asked.json()["document"]
    assert doc["kind"] == "invoice" and doc["totals"]["paid_minor"] == doc["totals"]["total_minor"] == 4200
    assert [d["kind"] for d in documents(shop)] == ["receipt", "invoice"]


def test_a_receipt_cannot_be_asked_for_on_an_unpaid_order(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    refused = shop.owner.post(f"/api/documents/from/order/{order['order_id']}", json={"kind": "receipt"})
    assert refused.status_code == 409 and refused.json()["code"] == "receipt_unpaid"


def test_the_invoice_hook_can_be_switched_off(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, auto_invoice_credit_sales=False)
    placed(shop, customer(shop, credit_limit=100_000), payment="account")
    assert documents(shop) == []


def test_a_shop_with_no_cr_number_keeps_its_credit_sale_and_says_why_it_has_no_invoice(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, cr=False)
    who = customer(shop, credit_limit=100_000)
    order = placed(shop, who, payment="account")        # the sale goes ahead
    assert documents(shop) == []
    [skipped] = activity(shop, "order", order["order_id"], "document_skipped")
    assert skipped["detail"] == {"kind": "invoice", "reason": "registration_needed"}
    # ...and a receipt, which needs no CR number, is still made when an order is paid.
    paid = placed(shop, customer(shop, "Salem"))
    pay_by_link(shop, paid)
    assert [d["kind"] for d in documents(shop)] == ["receipt"]


def test_a_document_that_cannot_be_drawn_never_stops_the_payment(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))

    async def broken(_doc):
        raise RuntimeError("the PDF engine is down")

    monkeypatch.setattr(doc_service, "render_pdf", broken)
    assert pay_by_link(shop, order).json() == {"status": "paid"}
    assert documents(shop) == []
    assert owner_sql("select payment from orders where id = $1", UUID(order["order_id"]))[0]["payment"] == "paid"
    [skipped] = activity(shop, "order", order["order_id"], "document_skipped")
    assert skipped["detail"]["reason"] == "error"

    monkeypatch.undo()
    # Nothing was spent: the first document that does get made is number one.
    asked = shop.owner.post(f"/api/documents/from/order/{order['order_id']}", json={"kind": "receipt"})
    assert asked.json()["document"]["number"] == "RC-0001"


def test_a_delivery_that_cannot_be_queued_leaves_the_payment_and_the_receipt_alone(client_factory, monkeypatch):
    from alyr.modules.documents import delivery

    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))

    async def broken(*_args, **_kwargs):
        raise RuntimeError("the queue is down")

    monkeypatch.setattr(delivery, "queue_auto", broken)
    assert pay_by_link(shop, order).json() == {"status": "paid"}
    [receipt] = documents(shop)
    assert receipt["status"] == "issued"
    assert owner_sql("select count(*) as n from document_deliveries where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 0


# ------------------------------------------------------------ a payment on a credit account


def owed(shop, who, amount=50_000):
    owner_sql("insert into ledger_entries (tenant_id, contact_id, kind, amount, note, created_by) "
              "values ($1, $2, 'sale', $3, 'Cables', 'seed')", shop.tenant_id, UUID(who.id), amount)


def test_a_payment_on_a_credit_account_gets_a_receipt_that_says_what_is_left(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    owed(shop, who)

    async def ask(conn):
        return await ledger.create_payment_request(
            conn, UUID(who.id), 20_000, "http://web.test")

    link = run_in_app(shop.owner, shop.tenant_id, ask)
    assert pay_links.pay(shop.owner, link).json() == {"status": "paid"}

    [receipt] = documents(shop)
    assert (receipt["kind"], receipt["source"], receipt["total_minor"]) == ("receipt", "ledger_payment", 20_000)
    shown = fetch(shop, receipt["id"])
    assert shown["lines"][0]["description"] == "Payment on account"
    assert shown["lines"][0]["description_ar"] == "دفعة على الحساب"
    assert shown["notes"]["en"] == "Remaining balance on your account: QAR 300.00."
    assert shown["notes"]["ar"] == "الرصيد المتبقي على حسابك: 300.00 ر.ق."
    assert shown["payments"][0]["method"] == "link"
    # Reported again: still one.
    pay_links.pay(shop.owner, link)
    assert len(documents(shop)) == 1


def test_a_payment_staff_wrote_in_the_chat_gets_a_receipt_once_per_entry(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    owed(shop, who)

    async def pay(conn):
        return await ledger.add_entry(conn, UUID(who.id), "payment", 10_000, created_by="Mona")

    entry = run_in_app(shop.owner, shop.tenant_id, pay)
    [receipt] = documents(shop)
    assert receipt["issued_by"] == "Mona" and receipt["source_ref"] == str(entry)

    async def again(conn):
        return await sales.credit_payment(conn, UUID(who.id), entry, 10_000, via_link=False)

    assert run_in_app(shop.owner, shop.tenant_id, again).replayed is True
    assert len(documents(shop)) == 1
    run_in_app(shop.owner, shop.tenant_id, pay)          # a second payment is a second receipt
    assert len(documents(shop)) == 2


def test_an_entry_written_with_its_own_date_makes_no_receipt(client_factory, monkeypatch):
    """History loaded for a demo shop is not a payment happening now."""
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    from datetime import UTC, datetime, timedelta

    async def history(conn):
        await ledger.add_entry(conn, UUID(who.id), "payment", 5000,
                               at=datetime.now(UTC) - timedelta(days=3))

    run_in_app(shop.owner, shop.tenant_id, history)
    assert documents(shop) == []


# ------------------------------------------------------------ cancelling


def test_cancelling_a_paid_order_gives_the_receipt_one_linked_credit_note(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    [receipt] = documents(shop)

    assert cancel(shop, order).status_code == 200
    receipt_now, note = documents(shop)
    assert (receipt_now["status"], note["kind"], note["number"]) == ("void", "credit_note", "CN-0001")
    assert note["related_document_id"] == receipt["id"] and note["total_minor"] == 4200
    assert note["source"] == "manual"
    shown = fetch(shop, note["id"])
    assert shown["related"]["number"] == "RC-0001" and shown["reason"] == f"Order {order['number']} cancelled"
    assert fetch(shop, receipt["id"])["voided_by"]["number"] == "CN-0001"


def test_a_second_cancel_adds_no_second_credit_note(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    cancel(shop, order)
    assert cancel(shop, order).status_code == 200
    assert numbers(shop, "credit_note") == ["CN-0001"]


def test_two_cancels_at_the_same_moment_make_one_credit_note(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    order_id = UUID(order["order_id"])
    from alyr.modules.orders import service as orders

    outbound = shop.owner.app.state.outbound
    results = concurrently(
        shop.owner, shop.tenant_id,
        *[lambda conn: orders.cancel_order(conn, order_id, outbound, team.CUSTOMER) for _ in range(4)])
    assert not [r for r in results if isinstance(r, Exception)], results
    assert sorted(bool(r["already"]) for r in results) == [False, True, True, True]
    assert numbers(shop, "credit_note") == ["CN-0001"]


def test_cancelling_a_credit_sale_cancels_its_invoice_and_takes_the_debt_off(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    order = placed(shop, who, payment="account")
    assert cancel(shop, order).status_code == 200
    invoice, note = documents(shop)
    assert (invoice["kind"], invoice["status"], note["kind"]) == ("invoice", "void", "credit_note")
    assert note["related_document_id"] == invoice["id"]
    reversed_ = owner_sql("select count(*) as n from ledger_entries where tenant_id = $1 and kind = 'reversal'",
                          shop.tenant_id)[0]["n"]
    assert reversed_ == 1


def test_cancelling_an_order_nobody_paid_makes_no_document(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    assert cancel(shop, order).status_code == 200
    assert documents(shop) == []


def test_the_credit_note_and_the_cancellation_are_one_transaction(client_factory, monkeypatch):
    """If anything after the credit note fails, the cancellation and the note go together."""
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)

    from alyr.modules.items import alerts

    async def explode(*_args, **_kwargs):
        raise RuntimeError("the refund alert failed")

    monkeypatch.setattr(alerts, "refund_due", explode)
    with pytest.raises(RuntimeError):
        cancel(shop, order)
    assert numbers(shop, "credit_note") == []
    assert [d["status"] for d in documents(shop)] == ["issued"]
    assert owner_sql("select status from orders where id = $1", UUID(order["order_id"]))[0]["status"] == "new"
    monkeypatch.undo()
    assert cancel(shop, order).status_code == 200
    assert numbers(shop, "credit_note") == ["CN-0001"]


def test_a_link_payment_is_never_rounded_even_when_the_shop_rounds_cash(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, cash_rounding_minor=5)
    bread = item(shop, price=351)              # QAR 3.51 x 3 = 10.53; cash would be 10.55
    order = placed(shop, customer(shop), [(bread, 3)])
    pay_by_link(shop, order)
    [receipt] = documents(shop)
    assert receipt["total_minor"] == receipt["paid_minor"] == 1053
    cancel(shop, order)
    assert [d["status"] for d in documents(shop)] == ["void", "issued"]


def test_the_credit_note_is_attributed_to_whoever_cancelled(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    cancel(shop, order)
    note = documents(shop, kind="credit_note")[0]
    assert note["issued_by"] == "Owner"


def test_the_activity_record_of_the_order_shows_the_receipt_and_the_credit_note(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    pay_by_link(shop, order)
    cancel(shop, order)
    [receipt, note] = documents(shop)
    assert [a["action"] for a in activity(shop, "document", receipt["id"])] == [
        "draft_created", "issued", "voided"]
    assert [a["action"] for a in activity(shop, "document", note["id"])] == ["issued", "credit_note_issued"]
