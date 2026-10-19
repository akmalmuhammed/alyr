"""Payments the shop took itself and wrote down (ALY-139): cash, a bank transfer, a cheque or a
card terminal, for an order, a booking, an invoice or a customer's balance. Each earns the right
receipt; each is on the record with who wrote it and when; a retried request changes nothing;
and who may do it is the owner, an admin, and an agent only if the shop says so.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest

from documents_sales_support import (
    activity,
    customer,
    documents,
    item,
    numbers,
    placed,
    sales_shop,
)
from documents_support import as_app, issued, refused_by_database
from test_consent import owner_sql


def fetch(shop, doc_id):
    found = shop.owner.get(f"/api/documents/{doc_id}")
    assert found.status_code == 200, found.text
    return found.json()["document"]


def record(client, subject, subject_id, *, method="cash", key=None, **more):
    return client.post(
        "/api/documents/payments",
        json={"subject": subject, "id": str(subject_id), "method": method, **more},
        headers={"Idempotency-Key": key or f"pay-{uuid4().hex}"},
    )


def service_and_booking(shop, who, *, price=5000, status="booked"):
    service = owner_sql(
        "insert into services (tenant_id, name, name_ar, duration_minutes, price) "
        "values ($1, 'Haircut', 'قص شعر', 30, $2) returning id", shop.tenant_id, price)[0]["id"]
    start = datetime.now(UTC) + timedelta(days=3)
    booking = owner_sql(
        "insert into bookings (tenant_id, number, contact_id, service_id, service_name, starts_at, "
        "ends_at, status) values ($1, 101, $2, $3, 'Haircut', $4, $5, $6) returning id",
        shop.tenant_id, UUID(who.id), service, start, start + timedelta(minutes=30), status,
    )[0]["id"]
    return service, booking


def owed(shop, who, amount=50_000):
    owner_sql("insert into ledger_entries (tenant_id, contact_id, kind, amount, note, created_by) "
              "values ($1, $2, 'sale', $3, 'Cables', 'seed')", shop.tenant_id, UUID(who.id), amount)


def balance(shop, who):
    rows = owner_sql("select kind, amount from ledger_entries where tenant_id = $1 and contact_id = $2",
                     shop.tenant_id, UUID(who.id))
    return sum(r["amount"] * (1 if r["kind"] == "sale" else -1) for r in rows)


# ------------------------------------------------------------ an order paid in cash


def test_an_order_paid_in_cash_is_settled_and_gets_its_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    order = placed(shop, who)
    done = record(shop.owner, "order", order["order_id"], reference="till 4")
    assert done.status_code == 201, done.text
    body = done.json()

    assert body["replayed"] is False and body["receipt_error"] is None
    payment = body["payment"]
    assert (payment["subject"], payment["amount_minor"], payment["method"], payment["reference"]) == (
        "order", 4200, "cash", "till 4")
    assert payment["recorded_by"] == "Owner" and payment["recorded_at"]
    receipt = body["document"]
    assert (receipt["kind"], receipt["number"], receipt["issued_by"]) == ("receipt", "RC-0001", "Owner")
    assert receipt["payments"] == [{"method": "cash", "amount_minor": 4200, "reference": "till 4"}]
    assert payment["receipt_document_id"] == receipt["id"]

    order_row = owner_sql("select payment, status from orders where id = $1", UUID(order["order_id"]))[0]
    assert order_row["payment"] == "paid"
    # The pay link nobody needs now says so, and cannot be paid again.
    tenant_id, payment_id = order["pay_url"].split("/pay/")[1].split("/")
    page = shop.owner.get(f"/api/pay/{tenant_id}/{payment_id}").json()
    assert page["status"] == "paid"
    assert [a["detail"]["method"] for a in activity(shop, "order", order["order_id"], "paid")] == ["cash"]


@pytest.mark.parametrize("method, word", [("bank_transfer", "bank_transfer"), ("cheque", "cheque"),
                                          ("card_terminal", "card")])
def test_each_way_of_paying_is_named_on_the_receipt(client_factory, monkeypatch, method, word):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    done = record(shop.owner, "order", order["order_id"], method=method, reference="REF-77")
    assert done.status_code == 201, done.text
    assert done.json()["document"]["payments"] == [
        {"method": word, "amount_minor": 4200, "reference": "REF-77"}]
    assert done.json()["payment"]["method"] == method


def test_a_retried_request_returns_the_same_payment_and_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    first = record(shop.owner, "order", order["order_id"], key="pay-the-bread-1")
    again = record(shop.owner, "order", order["order_id"], key="pay-the-bread-1")
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["replayed"] is True
    assert again.json()["payment"]["id"] == first.json()["payment"]["id"]
    assert again.json()["document"]["number"] == first.json()["document"]["number"] == "RC-0001"
    assert owner_sql("select count(*) as n from manual_payments where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 1
    assert len(documents(shop)) == 1


def test_six_identical_requests_at_the_same_moment_make_one_payment_and_one_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    with ThreadPoolExecutor(6) as pool:
        answers = list(pool.map(lambda _: record(shop.owner, "order", order["order_id"], key="same-key-at-once"),
                                range(6)))
    assert sorted(a.status_code for a in answers) == [200] * 5 + [201]
    assert len({a.json()["payment"]["id"] for a in answers}) == 1
    assert len(documents(shop)) == 1
    assert owner_sql("select count(*) as n from manual_payments where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 1


def test_a_different_key_for_an_order_already_paid_is_refused(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    record(shop.owner, "order", order["order_id"])
    second = record(shop.owner, "order", order["order_id"])
    assert second.status_code == 409 and second.json()["code"] == "already_paid"
    assert len(documents(shop)) == 1


def test_a_key_cannot_be_reused_for_something_else(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    one = placed(shop, customer(shop))
    two = placed(shop, customer(shop, "Salem"))
    record(shop.owner, "order", one["order_id"], key="one-key-for-one")
    stolen = record(shop.owner, "order", two["order_id"], key="one-key-for-one")
    assert stolen.status_code == 409 and stolen.json()["code"] == "key_reused"


def test_a_payment_needs_a_key(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    bare = shop.owner.post("/api/documents/payments", json={
        "subject": "order", "id": order["order_id"], "method": "cash"})
    assert bare.status_code == 400 and bare.json()["code"] == "key_needed"
    short = record(shop.owner, "order", order["order_id"], key="x")
    assert short.status_code == 400 and short.json()["code"] == "key_invalid"


def test_an_order_is_paid_in_full_or_not_at_all(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    part = record(shop.owner, "order", order["order_id"], amount_minor=100)
    assert part.status_code == 422 and part.json()["code"] == "amount_must_match"
    assert part.json()["message_ar"]
    assert documents(shop) == []


def test_a_cancelled_order_and_a_credit_order_cannot_be_paid_this_way(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    gone = placed(shop, who)
    shop.owner.post(f"/api/orders/{gone['order_id']}/status", json={"status": "cancelled"})
    refused = record(shop.owner, "order", gone["order_id"])
    assert (refused.status_code, refused.json()["code"]) == (409, "order_cancelled")
    credit = placed(shop, who, payment="account")
    refused = record(shop.owner, "order", credit["order_id"])
    assert (refused.status_code, refused.json()["code"]) == (409, "order_on_account")


def test_an_order_of_another_shop_is_not_found(client_factory, monkeypatch):
    mine = sales_shop(client_factory, monkeypatch)
    theirs = sales_shop(client_factory, monkeypatch)
    order = placed(theirs, customer(theirs))
    answer = record(mine.owner, "order", order["order_id"])
    assert (answer.status_code, answer.json()["code"]) == (404, "source_not_found")
    assert owner_sql("select payment from orders where id = $1", UUID(order["order_id"]))[0]["payment"] == "unpaid"


# ------------------------------------------------------------ cash rounding


def test_cash_is_rounded_as_the_shop_says_and_other_ways_are_not(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, cash_rounding_minor=5)
    bread = item(shop, price=351)
    cash = placed(shop, customer(shop), [(bread, 3)])         # 10.53: cash is 10.55
    card = placed(shop, customer(shop, "Salem"), [(bread, 3)])

    wrong = record(shop.owner, "order", cash["order_id"], amount_minor=1053)
    assert (wrong.status_code, wrong.json()["code"]) == (422, "amount_must_match")
    done = record(shop.owner, "order", cash["order_id"])
    assert done.status_code == 201, done.text
    receipt = done.json()["document"]
    assert (receipt["totals"]["rounding_minor"], receipt["totals"]["total_minor"]) == (2, 1055)
    assert done.json()["payment"]["amount_minor"] == 1055

    swiped = record(shop.owner, "order", card["order_id"], method="card_terminal")
    assert swiped.json()["document"]["totals"] == {
        **swiped.json()["document"]["totals"], "rounding_minor": 0, "total_minor": 1053}

    # Cancelling the rounded receipt credits all of it, rounding included.
    shop.owner.post(f"/api/orders/{cash['order_id']}/status", json={"status": "cancelled"})
    note = documents(shop, kind="credit_note")[0]
    assert note["total_minor"] == 1055 and documents(shop, id=UUID(receipt["id"]))[0]["status"] == "void"


# ------------------------------------------------------------ a booking: deposit, then the rest


def test_a_part_payment_on_a_booking_is_a_deposit_receipt_and_the_rest_a_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    _, booking = service_and_booking(shop, who, price=5000)

    deposit = record(shop.owner, "booking", booking, amount_minor=2000, method="card_terminal")
    assert deposit.status_code == 201, deposit.text
    dr = deposit.json()["document"]
    assert (dr["kind"], dr["number"]) == ("deposit_receipt", "DR-0001")
    assert (dr["totals"]["total_minor"], dr["totals"]["paid_minor"], dr["totals"]["balance_minor"]) == (
        5000, 2000, 3000)
    assert dr["lines"][0]["description"] == "Haircut" and dr["lines"][0]["description_ar"] == "قص شعر"
    assert dr["notes"]["en"] == "Booking 101."

    rest = record(shop.owner, "booking", booking, method="cash", reference="drawer 2")
    assert rest.status_code == 201, rest.text
    final = rest.json()["document"]
    assert (final["kind"], final["number"]) == ("receipt", "RC-0001")
    assert final["totals"]["paid_minor"] == final["totals"]["total_minor"] == 5000
    assert [(p["method"], p["amount_minor"]) for p in final["payments"]] == [("card", 2000), ("cash", 3000)]

    again = record(shop.owner, "booking", booking)
    assert (again.status_code, again.json()["code"]) == (409, "already_paid")
    assert [a["detail"]["method"] for a in activity(shop, "booking", booking, "paid")] == [
        "card_terminal", "cash"]


def test_more_than_is_owed_on_a_booking_is_refused(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    _, booking = service_and_booking(shop, customer(shop), price=5000)
    answer = record(shop.owner, "booking", booking, amount_minor=6000)
    assert (answer.status_code, answer.json()["code"]) == (422, "amount_exceeds")


def test_a_service_with_no_price_is_paid_what_the_staff_say(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    _, booking = service_and_booking(shop, customer(shop), price=0)
    unsaid = record(shop.owner, "booking", booking)
    assert (unsaid.status_code, unsaid.json()["code"]) == (422, "amount_needed")
    done = record(shop.owner, "booking", booking, amount_minor=1800)
    assert done.json()["document"]["kind"] == "receipt" and done.json()["document"]["totals"]["total_minor"] == 1800


def test_a_cancelled_booking_cannot_be_paid(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    _, booking = service_and_booking(shop, customer(shop), status="cancelled")
    answer = record(shop.owner, "booking", booking)
    assert (answer.status_code, answer.json()["code"]) == (409, "booking_cancelled")


def test_an_invoice_can_be_asked_for_on_a_booking_with_what_is_paid_so_far(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    _, booking = service_and_booking(shop, customer(shop), price=5000)
    record(shop.owner, "booking", booking, amount_minor=2000)
    asked = shop.owner.post(f"/api/documents/from/booking/{booking}", json={"kind": "invoice"})
    assert asked.status_code == 201, asked.text
    doc = asked.json()["document"]
    assert (doc["kind"], doc["totals"]["total_minor"], doc["totals"]["paid_minor"]) == ("invoice", 5000, 2000)
    again = shop.owner.post(f"/api/documents/from/booking/{booking}", json={"kind": "invoice"})
    assert again.status_code == 200 and again.json()["replayed"] is True


def test_the_deposit_switch_decides_whether_a_part_payment_makes_a_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, auto_deposit_receipt=False)
    _, booking = service_and_booking(shop, customer(shop), price=5000)
    done = record(shop.owner, "booking", booking, amount_minor=2000)
    assert done.status_code == 201 and done.json()["document"] is None
    assert documents(shop) == []
    payment_id = done.json()["payment"]["id"]
    later = shop.owner.post(f"/api/documents/payments/{payment_id}/receipt")
    assert later.status_code == 200, later.text
    assert later.json()["document"]["kind"] == "deposit_receipt"
    assert later.json()["payment"]["receipt_document_id"] == later.json()["document"]["id"]
    assert shop.owner.post(f"/api/documents/payments/{payment_id}/receipt").json()["document"]["number"] == "DR-0001"
    assert len(documents(shop)) == 1


# ------------------------------------------------------------ an invoice


def test_a_standalone_invoice_is_paid_down_by_receipts_that_point_at_it(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    invoice = issued(shop.owner, "invoice")          # QAR 127.00, unpaid
    first = record(shop.owner, "invoice", invoice["id"], amount_minor=5000, method="bank_transfer",
                   reference="TRX-1")
    assert first.status_code == 201, first.text
    receipt = first.json()["document"]
    assert receipt["kind"] == "receipt" and receipt["totals"]["total_minor"] == 5000
    assert receipt["lines"][0]["description"] == f"Payment against invoice {invoice['number']}"
    stored = documents(shop, id=UUID(receipt["id"]))[0]
    assert str(stored["related_document_id"]) == invoice["id"]

    over = record(shop.owner, "invoice", invoice["id"], amount_minor=9000)
    assert (over.status_code, over.json()["code"]) == (422, "amount_exceeds")
    rest = record(shop.owner, "invoice", invoice["id"])
    assert rest.json()["payment"]["amount_minor"] == 12_700 - 5000
    assert record(shop.owner, "invoice", invoice["id"]).json()["code"] == "already_paid"
    assert len(documents(shop, kind="receipt")) == 2


def test_paying_an_invoice_from_a_credit_sale_pays_down_the_customers_account(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    placed(shop, who, payment="account")                   # QAR 42.00 on account, invoice INV-0001
    [invoice] = documents(shop, kind="invoice")
    assert balance(shop, who) == 4200
    done = record(shop.owner, "invoice", invoice["id"], amount_minor=1200, reference="cheque 88",
                  method="cheque")
    assert done.status_code == 201, done.text
    assert balance(shop, who) == 3000
    assert numbers(shop, "receipt") == ["RC-0001"]         # one receipt: the ledger made none of its own


def test_a_cancelled_or_unissued_invoice_cannot_be_paid(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    invoice = issued(shop.owner, "invoice")
    shop.owner.post(f"/api/documents/{invoice['id']}/cancel", json={"reason": "Wrong customer"})
    answer = record(shop.owner, "invoice", invoice["id"])
    assert (answer.status_code, answer.json()["code"]) == (409, "invoice_not_payable")
    receipt = issued(shop.owner, "receipt")
    assert record(shop.owner, "invoice", receipt["id"]).json()["code"] == "invoice_not_payable"


# ------------------------------------------------------------ a customer's balance


def test_a_payment_on_a_customers_balance_reaches_the_ledger_and_the_receipt_says_what_is_left(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    owed(shop, who)
    done = record(shop.owner, "credit", who.id, amount_minor=20_000, reference="slip 9")
    assert done.status_code == 201, done.text
    receipt = done.json()["document"]
    assert receipt["source"] == "ledger_payment"
    assert receipt["notes"]["en"] == "Remaining balance on your account: QAR 300.00."
    assert receipt["payments"] == [{"method": "cash", "amount_minor": 20_000, "reference": "slip 9"}]
    assert balance(shop, who) == 30_000
    assert [a["action"] for a in activity(shop, "account", who.id)] == ["paid"]
    # The ledger made no second receipt of its own.
    assert len(documents(shop)) == 1


def test_a_customer_pays_off_the_whole_balance_by_leaving_the_amount_out(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    owed(shop, who, 12_345)
    done = record(shop.owner, "credit", who.id)
    assert done.json()["payment"]["amount_minor"] == 12_345 and balance(shop, who) == 0
    assert done.json()["document"]["notes"] == {
        "en": "Nothing is owed on your account.", "ar": "لا يوجد مبلغ مستحق على حسابك."}
    nothing = record(shop.owner, "credit", who.id)
    assert (nothing.status_code, nothing.json()["code"]) == (409, "nothing_owed")


def test_more_than_the_balance_is_refused(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    owed(shop, who, 5000)
    answer = record(shop.owner, "credit", who.id, amount_minor=5001)
    assert (answer.status_code, answer.json()["code"]) == (422, "amount_exceeds")
    assert balance(shop, who) == 5000


# ------------------------------------------------------------ who may do it


def test_an_agent_cannot_record_a_payment_unless_the_shop_allows_it(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    refused = record(shop.agent, "order", order["order_id"])
    assert (refused.status_code, refused.json()["code"]) == (403, "payment_not_allowed")
    assert owner_sql("select payment from orders where id = $1", UUID(order["order_id"]))[0]["payment"] == "unpaid"

    shop.owner.put("/api/documents/settings", json={"agents_may_record_payments": True})
    done = record(shop.agent, "order", order["order_id"])
    assert done.status_code == 201, done.text
    assert done.json()["document"]["issued_by"] == "Agent"
    assert done.json()["payment"]["recorded_by"] == "Agent"
    # The agent still cannot cancel the receipt or change the settings.
    assert shop.agent.post(f"/api/documents/{done.json()['document']['id']}/cancel",
                           json={"reason": "Oops"}).status_code == 403


def test_an_admin_can_record_a_payment(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    assert record(shop.admin, "order", order["order_id"]).status_code == 201


def test_nobody_signed_out_can_record_a_payment(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    signed_out = client_factory()
    answer = record(signed_out, "order", order["order_id"])
    assert answer.status_code == 401


def test_a_shop_without_the_module_cannot_record_a_payment(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, documents=False)
    order = placed(shop, customer(shop))
    assert record(shop.owner, "order", order["order_id"]).status_code == 403


# ------------------------------------------------------------ the receipt switches


def test_the_caller_can_ask_for_no_receipt_and_the_payment_is_still_recorded(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    order = placed(shop, customer(shop))
    done = record(shop.owner, "order", order["order_id"], receipt=False)
    assert done.status_code == 201 and done.json()["document"] is None
    assert documents(shop) == []
    assert owner_sql("select payment from orders where id = $1", UUID(order["order_id"]))[0]["payment"] == "paid"


def test_with_automatic_receipts_off_a_payment_waits_for_its_receipt(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, auto_receipt_on_payment=False)
    order = placed(shop, customer(shop))
    done = record(shop.owner, "order", order["order_id"])
    assert done.json()["document"] is None
    forced = record(shop.owner, "order", placed(shop, customer(shop, "Salem"))["order_id"], receipt=True)
    assert forced.json()["document"]["number"] == "RC-0001"


def test_a_shop_with_no_cr_number_still_gets_receipts_for_payments(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, cr=False)
    order = placed(shop, customer(shop))
    done = record(shop.owner, "order", order["order_id"])
    assert done.json()["document"]["kind"] == "receipt"


# ------------------------------------------------------------ the record itself


def test_a_recorded_payment_can_never_be_changed_or_deleted(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    done = record(shop.owner, "order", placed(shop, customer(shop))["order_id"])
    payment_id = UUID(done.json()["payment"]["id"])
    for sql in ("update manual_payments set amount_minor = 1 where id = $1",
                "update manual_payments set recorded_by = 'someone else' where id = $1",
                "update manual_payments set receipt_document_id = null where id = $1",
                "delete from manual_payments where id = $1"):
        with pytest.raises(asyncpg.PostgresError) as caught:      # even the table's owner
            owner_sql(sql, payment_id)
        assert "recorded payment" in str(caught.value), sql
        assert refused_by_database(shop.tenant_id, sql, payment_id) is not None, sql   # the app


def test_one_shop_cannot_see_another_shops_payments_or_deliveries(client_factory, monkeypatch):
    mine = sales_shop(client_factory, monkeypatch)
    theirs = sales_shop(client_factory, monkeypatch)
    record(theirs.owner, "order", placed(theirs, customer(theirs))["order_id"])
    for table in ("manual_payments", "document_deliveries"):
        seen = as_app(mine.tenant_id, lambda conn, t=table: conn.fetchval(f"select count(*) from {t}"))
        assert seen == 0, table
    seen = as_app(theirs.tenant_id, lambda conn: conn.fetchval("select count(*) from manual_payments"))
    assert seen == 1
