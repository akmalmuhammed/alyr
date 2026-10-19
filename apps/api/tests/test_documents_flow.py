"""The life of a document through the API: a draft, its issue, its PDF, a credit note
(ALY-138, spec 010). Who may do what, the retried request, the module that is off, the
language rule, the rule for a shop with no registration number, and one shop never seeing
another's.

The numbering, the database's refusals, the layouts and the money have their own files
(`test_documents_numbering.py`, `test_documents_immutability.py`, `test_documents_render.py`,
`test_documents_money.py`, `test_documents_hash.py`)."""

import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest

from documents_support import (
    CUSTOMER,
    LINES,
    LINES_TOTAL,
    SELLER,
    as_app,
    configured_shop,
    draft_body,
    issue,
    issued,
    make_draft,
    make_shop,
    sign_in_all,
)
from pdf_support import page_text
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


def counts(shop) -> tuple[int, int, int]:
    """(documents, lines, series counters) of this shop: a preview must not move any."""
    docs = owner_sql("select count(*) as n from documents where tenant_id = $1", shop.tenant_id)
    lines = owner_sql("select count(*) as n from document_lines where tenant_id = $1",
                      shop.tenant_id)
    last = owner_sql("select coalesce(sum(last_number), 0) as n from document_series "
                     "where tenant_id = $1", shop.tenant_id)
    return docs[0]["n"], lines[0]["n"], last[0]["n"]


# ── the plain path ────────────────────────────────────────────────────────────────────────


def test_a_draft_is_made_edited_issued_and_read_back(shop):
    draft = make_draft(shop.owner)
    assert (draft["status"], draft["number"], draft["content_hash"]) == ("draft", None, None)
    assert draft["totals"]["total_minor"] == LINES_TOTAL
    assert draft["customer"]["name"] == CUSTOMER["name"]
    assert [line["quantity"] for line in draft["lines"]] == ["12.000", "2.000"]

    smaller = draft_body("receipt", lines=LINES[:1],
                         payments=[{"method": "cash", "amount_minor": 4200}])
    edited = shop.owner.put(f"/api/documents/{draft['id']}", json=smaller).json()["document"]
    assert [line["line_total_minor"] for line in edited["lines"]] == [4200]
    assert edited["totals"]["total_minor"] == 4200

    answer = issue(shop.owner, draft["id"], key="issue-key-0001")
    assert answer.status_code == 200, answer.text
    doc = answer.json()["document"]
    assert doc["status"] == "issued" and doc["number"] == "RC-0001"
    assert doc["seller"]["name"] == "Qirfa Bakery" and doc["seller"]["registered"] is True
    assert len(doc["content_hash"]) == 64 and doc["pdf"]["bytes"] > 1000
    assert doc["issued_by"] == "Owner" and doc["retention"]["years"] == 10
    assert doc["retention"]["confirmed"] is False

    pdf = shop.owner.get(f"/api/documents/{draft['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["cache-control"] == "private, no-store"
    assert "RC-0001" in page_text(pdf.content)


def test_an_issued_document_cannot_be_edited_or_discarded_through_the_api(shop):
    doc = issued(shop.owner)
    edit = shop.owner.put(f"/api/documents/{doc['id']}", json=draft_body("receipt"))
    assert (edit.status_code, edit.json()["code"]) == (409, "not_a_draft")
    assert "credit note" in edit.json()["detail"] and edit.json()["message_ar"]
    discard = shop.owner.delete(f"/api/documents/{doc['id']}")
    assert (discard.status_code, discard.json()["code"]) == (409, "not_a_draft")
    again = issue(shop.owner, doc["id"])
    assert (again.status_code, again.json()["code"]) == (409, "already_issued")


def test_the_list_filters_and_finds(shop):
    receipt = issued(shop.owner, "receipt")
    issued(shop.owner, "quote")
    make_draft(shop.owner, "invoice", customer={"name": "Hamad Al-Thani"})
    everything = shop.owner.get("/api/documents").json()
    assert everything["total"] == 3
    assert [d["kind"] for d in shop.owner.get("/api/documents?kind=quote").json()["documents"]] == [
        "quote"]
    assert shop.owner.get("/api/documents?status=draft").json()["total"] == 1
    assert shop.owner.get(f"/api/documents?q={receipt['number']}").json()["total"] == 1
    assert shop.owner.get("/api/documents?q=hamad").json()["total"] == 1
    assert shop.owner.get("/api/documents?q=فاطمة").json()["total"] == 2  # the two with her name_ar


def test_where_a_document_came_from_is_kept(shop):
    doc = issued(shop.owner, "receipt", source="order", source_ref="1001")
    assert (doc["source"], doc["source_ref"]) == ("order", "1001")


def test_the_activity_record_says_who_did_what(shop):
    draft = make_draft(shop.owner)
    issue(shop.owner, draft["id"])
    actions = shop.owner.get(f"/api/documents/{draft['id']}/activity").json()["activity"]
    assert [(a["action"], a["actor"]) for a in actions] == [
        ("draft_created", "Owner"), ("issued", "Owner")]
    assert actions[1]["detail"]["number"] == "RC-0001"


# ── who may do what ───────────────────────────────────────────────────────────────────────


def test_an_agent_makes_drafts_but_may_not_issue_until_the_owner_allows_it(shop):
    draft = make_draft(shop.agent)
    refused = issue(shop.agent, draft["id"])
    assert (refused.status_code, refused.json()["code"]) == (403, "cannot_issue")
    assert shop.owner.get(f"/api/documents/{draft['id']}").json()["document"]["status"] == "draft"

    assert shop.agent.put("/api/documents/settings", json={"agents_may_issue": True}
                          ).status_code == 403
    assert shop.owner.put("/api/documents/settings", json={"agents_may_issue": True}
                          ).status_code == 200
    done = issue(shop.agent, draft["id"])
    assert done.status_code == 200 and done.json()["document"]["issued_by"] == "Agent"
    # ... but only their own drafts.
    owners = make_draft(shop.owner)
    assert issue(shop.agent, owners["id"]).status_code == 403


def test_an_agent_sees_and_changes_only_what_they_made(shop):
    mine, theirs = make_draft(shop.agent), make_draft(shop.owner)
    listed = shop.agent.get("/api/documents").json()
    assert [d["id"] for d in listed["documents"]] == [mine["id"]]
    assert shop.agent.get(f"/api/documents/{theirs['id']}").status_code == 403
    assert shop.agent.put(f"/api/documents/{theirs['id']}", json=draft_body()).status_code == 403
    assert shop.agent.delete(f"/api/documents/{theirs['id']}").status_code == 403
    assert shop.agent.put(f"/api/documents/{mine['id']}", json=draft_body()).status_code == 200
    # The owner and an admin see everything.
    assert shop.owner.get("/api/documents").json()["total"] == 2
    assert shop.admin.get("/api/documents").json()["total"] == 2


def test_settings_numbering_credit_notes_and_checks_are_for_owners_and_admins(shop):
    invoice = issued(shop.owner, "invoice")
    for call in (
        lambda c: c.get("/api/documents/settings"),
        lambda c: c.put("/api/documents/settings", json={"layout": "a5"}),
        lambda c: c.put("/api/documents/settings/logo", content=b"x"),
        lambda c: c.get("/api/documents/series"),
        lambda c: c.put("/api/documents/series/receipt/main", json={"prefix": "ZZ"}),
        lambda c: c.post(f"/api/documents/{invoice['id']}/credit-note", json={"reason": "Not allowed"}),
        lambda c: c.get(f"/api/documents/{invoice['id']}/verify"),
        lambda c: c.get(f"/api/documents/{invoice['id']}/activity"),
    ):
        answer = call(shop.agent)
        assert answer.status_code == 403, answer.text
        assert answer.json()["code"] == "not_allowed" and answer.json()["message_ar"]
    # An admin may do all of it.
    assert shop.admin.put("/api/documents/settings", json={"layout": "a5"}).status_code == 200
    assert shop.admin.post(f"/api/documents/{invoice['id']}/credit-note",
                           json={"reason": "Order cancelled"}).status_code == 201
    meta = shop.agent.get("/api/documents/meta").json()
    assert meta["access"] == {"role": "agent", "can_manage": False, "can_issue": False,
                              "can_draft": True, "can_credit": False}


def test_the_agents_own_issued_document_and_pdf_are_theirs_to_read(shop):
    shop.owner.put("/api/documents/settings", json={"agents_may_issue": True})
    mine = issued(shop.agent)
    assert shop.agent.get(f"/api/documents/{mine['id']}/pdf").status_code == 200
    other = issued(shop.owner)
    assert shop.agent.get(f"/api/documents/{other['id']}/pdf").status_code == 403


# ── the module is off by default ──────────────────────────────────────────────────────────


def test_a_shop_without_documents_gets_nothing(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    off = sign_in_all(client_factory, make_shop(documents=False))
    for method, path in (
        ("get", "/api/documents"), ("get", "/api/documents/meta"),
        ("get", "/api/documents/settings"), ("get", "/api/documents/series"),
        ("post", "/api/documents"), ("post", "/api/documents/preview"),
        ("get", f"/api/documents/{uuid4()}"), ("get", f"/api/documents/{uuid4()}/pdf"),
    ):
        answer = getattr(off.owner, method)(path, **({"json": {}} if method == "post" else {}))
        assert answer.status_code == 403, (path, answer.status_code)
        assert "documents is not switched on" in answer.json()["detail"]
    assert owner_sql("select count(*) as n from documents where tenant_id = $1",
                     off.tenant_id)[0]["n"] == 0


def test_documents_is_in_no_product_and_no_starting_setup():
    from alyr import catalog, presets

    assert "documents" in catalog.MODULE_BY_KEY
    assert all("documents" not in p.modules for p in catalog.PRODUCTS)
    for preset in presets.PRESETS:
        assert "documents" not in (*preset.modules, *preset.with_catalog), preset.key
    module = catalog.MODULE_BY_KEY["documents"]
    assert (module.screens, module.steps, module.cards) == ((), (), ())


def test_no_new_shop_gets_documents_whatever_its_type(client_factory):
    """Not by onboarding, not by the starting setup of any business type, not by the back
    office's own way of making a business: the module row exists only where somebody wrote
    one."""
    from alyr import presets
    from test_onboarding import new_business

    for kind in [p.key for p in presets.PRESETS]:
        client = client_factory()
        _, slug, _ = new_business(client, kind=kind)
        tenant = owner_sql("select id from tenants where slug = $1", slug)[0]["id"]
        modules = {r["module_key"] for r in owner_sql(
            "select module_key from tenant_modules where tenant_id = $1", tenant)}
        assert "documents" not in modules, kind
        assert "documents" not in client.get("/api/workspace").json()["modules"], kind
        assert client.get("/api/documents/meta").status_code == 403, kind


def test_the_back_office_can_switch_documents_on_and_off_for_one_shop(client_factory, monkeypatch):
    """The one way a shop gets the module before the screens exist: ALYR's staff switch it on.
    Nothing is deleted when it goes off again."""
    office = client_factory()  # the open demo on a laptop is ALYR's back office
    shop = sign_in_all(client_factory, make_shop(documents=False))
    assert shop.owner.get("/api/documents/meta").status_code == 403
    on = office.post(f"/api/admin/businesses/{shop.tenant_id}/modules/documents",
                     json={"enabled": True})
    assert on.status_code == 200, on.text
    assert shop.owner.put("/api/documents/settings", json=SELLER).status_code == 200
    doc = issued(shop.owner)
    off = office.post(f"/api/admin/businesses/{shop.tenant_id}/modules/documents",
                      json={"enabled": False})
    assert off.status_code == 200
    assert shop.owner.get(f"/api/documents/{doc['id']}").status_code == 403
    assert owner_sql("select count(*) as n from documents where id = $1",
                     UUID(doc["id"]))[0]["n"] == 1


# ── retried requests ──────────────────────────────────────────────────────────────────────


def test_a_retried_issue_with_the_same_key_gives_back_the_same_document(shop):
    draft = make_draft(shop.owner)
    first = issue(shop.owner, draft["id"], key="retry-key-0001")
    second = issue(shop.owner, draft["id"], key="retry-key-0001")
    assert (first.status_code, first.json()["replayed"]) == (200, False)
    assert (second.status_code, second.json()["replayed"]) == (200, True)
    assert first.json()["document"] == second.json()["document"]
    assert owner_sql("select last_number as n from document_series where tenant_id = $1 "
                     "and kind = 'receipt'", shop.tenant_id)[0]["n"] == 1


def test_a_key_that_was_used_for_another_document_is_refused(shop):
    one, two = make_draft(shop.owner), make_draft(shop.owner)
    assert issue(shop.owner, one["id"], key="shared-key-0001").status_code == 200
    answer = issue(shop.owner, two["id"], key="shared-key-0001")
    assert (answer.status_code, answer.json()["code"]) == (409, "key_reused")
    assert shop.owner.get(f"/api/documents/{two['id']}").json()["document"]["status"] == "draft"


def test_a_key_must_look_like_a_key(shop):
    draft = make_draft(shop.owner)
    for key in ("short", "has space in it 123", "x" * 81):
        answer = issue(shop.owner, draft["id"], key=key)
        assert (answer.status_code, answer.json()["code"]) == (400, "key_invalid"), key


def test_making_and_issuing_in_one_request_needs_a_key_and_is_retry_safe(shop):
    body = {**draft_body("receipt"), "issue": True}
    missing = shop.owner.post("/api/documents", json=body)
    assert (missing.status_code, missing.json()["code"]) == (400, "key_needed")
    headers = {"Idempotency-Key": "counter-sale-0001"}
    first = shop.owner.post("/api/documents", json=body, headers=headers)
    again = shop.owner.post("/api/documents", json=body, headers=headers)
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["document"]["id"] == again.json()["document"]["id"]
    assert first.json()["document"]["number"] == "RC-0001"
    assert counts(shop)[0] == 1


def test_six_identical_requests_at_the_same_moment_make_one_document(shop):
    body = {**draft_body("receipt"), "issue": True}
    headers = {"Idempotency-Key": "same-moment-0001"}
    start = threading.Barrier(6)

    def go(_):
        start.wait()
        return shop.owner.post("/api/documents", json=body, headers=headers)

    with ThreadPoolExecutor(6) as pool:
        answers = list(pool.map(go, range(6)))
    assert sorted(a.status_code for a in answers) == [200] * 5 + [201]
    assert len({a.json()["document"]["id"] for a in answers}) == 1
    assert counts(shop)[0] == 1
    assert owner_sql("select last_number as n from document_series where tenant_id = $1 "
                     "and kind = 'receipt'", shop.tenant_id)[0]["n"] == 1


# ── kinds and what they need ──────────────────────────────────────────────────────────────


def test_each_kind_asks_for_what_it_is(shop):
    def issue_body(**body):
        return issue(shop.owner, shop.owner.post("/api/documents", json=body).json()["document"]["id"])

    # An invoice needs a customer.
    refused = issue_body(kind="invoice", lines=LINES)
    assert refused.json()["code"] == "customer_needed"
    # A receipt is for money that has been paid in full.
    unpaid = issue_body(kind="receipt", lines=LINES, customer=CUSTOMER)
    assert unpaid.json()["code"] == "payment_needed"
    # A quote records no payment.
    paid_quote = issue_body(kind="quote", lines=LINES, customer=CUSTOMER,
                            payments=[{"method": "cash", "amount_minor": 100}])
    assert paid_quote.json()["code"] == "no_payments_here"
    # A deposit receipt needs the amount received.
    no_deposit = issue_body(kind="deposit_receipt", lines=LINES, customer=CUSTOMER)
    assert no_deposit.json()["code"] == "deposit_needed"
    # Nothing to issue.
    empty = issue_body(kind="invoice", customer=CUSTOMER)
    assert empty.json()["code"] == "no_lines"
    # A delivery note may carry no prices.
    free = [{"description": "Boxes", "quantity": "3", "unit_price_minor": 0}]
    note = issue_body(kind="delivery_note", lines=free, customer=CUSTOMER)
    assert note.status_code == 200 and note.json()["document"]["number"] == "DN-0001"
    # A receipt to a walk-in needs no name.
    walk_in = issue_body(kind="receipt", lines=LINES,
                         payments=[{"method": "card", "amount_minor": LINES_TOTAL}])
    assert walk_in.status_code == 200
    # Nothing but a credit note starts a credit note.
    cn = shop.owner.post("/api/documents", json={**draft_body("receipt"), "kind": "credit_note"})
    assert cn.status_code == 422  # not one of the kinds a draft can be


def test_a_draft_may_be_incomplete_but_never_wrong(shop):
    empty = shop.owner.post("/api/documents", json={"kind": "invoice"})
    assert empty.status_code == 201 and empty.json()["document"]["totals"]["total_minor"] == 0
    for bad in (
        {"lines": [{"description": "x", "quantity": "1", "unit_price_minor": 100,
                    "discount_minor": 101}]},
        {"lines": [{"quantity": "1", "unit_price_minor": 100}]},
        {"lines": [{"description": "x", "quantity": "0", "unit_price_minor": 100}]},
        {"lines": [{"description": "x", "quantity": "1.0005", "unit_price_minor": 100}]},
        {"lines": [{"description": "x", "quantity": "1", "unit_price_minor": 100}],
         "payments": [{"method": "cash", "amount_minor": 101}]},
        {"currency": "XXX"},
    ):
        answer = shop.owner.post("/api/documents", json={"kind": "invoice", **bad})
        assert answer.status_code in (400, 422), (bad, answer.text)


# ── credit notes ──────────────────────────────────────────────────────────────────────────


def credit(client, doc, **body):
    return client.post(f"/api/documents/{doc['id']}/credit-note", json={"reason": "Cancelled", **body})


def test_a_credit_note_cancels_an_invoice_in_full_and_the_invoice_stays(shop):
    invoice = issued(shop.owner, "invoice")
    answer = credit(shop.owner, invoice, reason="The customer cancelled the order")
    assert answer.status_code == 201, answer.text
    note = answer.json()["document"]
    assert note["kind"] == "credit_note" and note["number"] == "CN-0001"
    # (by the time the answer is read, the credit note has covered the invoice and voided it)
    assert note["related"] == {"id": invoice["id"], "kind": "invoice", "number": invoice["number"],
                               "status": "void"}
    assert note["totals"]["total_minor"] == invoice["totals"]["total_minor"]
    assert note["reason"] == "The customer cancelled the order"

    after = shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]
    assert after["status"] == "void" and after["voided_by"]["number"] == "CN-0001"
    assert [c["number"] for c in after["credit_notes"]] == ["CN-0001"]
    # The invoice is not deleted, not renumbered, and its PDF is as it was.
    assert after["number"] == invoice["number"] and after["content_hash"] == invoice["content_hash"]
    assert shop.owner.get(f"/api/documents/{invoice['id']}/pdf").status_code == 200
    assert "CN-0001" in page_text(shop.owner.get(f"/api/documents/{note['id']}/pdf").content)
    # It cannot be cancelled twice.
    again = credit(shop.owner, invoice)
    assert (again.status_code, again.json()["code"]) == (409, "already_void")
    # The record shows who.
    actions = [a["action"] for a in shop.owner.get(
        f"/api/documents/{invoice['id']}/activity").json()["activity"]]
    assert actions == ["draft_created", "issued", "voided"]


def test_a_credit_note_can_cover_part_and_the_invoice_is_void_when_all_is_covered(shop):
    invoice = issued(shop.owner, "invoice")  # QAR 127.00
    part = credit(shop.owner, invoice, reason="Cake returned", lines=[
        {"description": "Large date cake", "quantity": "2", "unit_price_minor": 4000}])
    assert part.status_code == 201
    assert part.json()["document"]["totals"]["total_minor"] == 8000
    assert shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]["status"] == "issued"
    # Whole-document credit after a part is refused: say which lines.
    whole = credit(shop.owner, invoice)
    assert whole.json()["code"] == "credit_needs_lines"
    rest = credit(shop.owner, invoice, reason="The rest", lines=[
        {"description": "Everything else", "quantity": "1", "unit_price_minor": 4700}])
    assert rest.status_code == 201 and rest.json()["document"]["number"] == "CN-0002"
    assert shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]["status"] == "void"


def test_a_credit_note_needs_a_reason_and_something_to_cancel(shop):
    invoice = issued(shop.owner, "invoice")
    assert credit(shop.owner, invoice, reason="no").status_code == 422
    draft = make_draft(shop.owner, "invoice")
    assert credit(shop.owner, draft).json()["code"] == "cannot_credit"
    quote = issued(shop.owner, "quote")
    assert credit(shop.owner, quote).json()["code"] == "cannot_credit"
    receipt = issued(shop.owner, "receipt")
    assert credit(shop.owner, receipt, reason="Refunded in cash").status_code == 201
    note = issued(shop.owner, "invoice")
    cn = credit(shop.owner, note).json()["document"]
    assert credit(shop.owner, cn).json()["code"] == "cannot_credit"  # not a credit note of a credit note


def test_a_retried_credit_note_with_the_same_key_is_one_credit_note(shop):
    invoice = issued(shop.owner, "invoice")
    headers = {"Idempotency-Key": "credit-key-0001"}
    body = {"reason": "Cancelled by the customer"}
    first = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note", json=body, headers=headers)
    second = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note", json=body, headers=headers)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["document"]["id"] == second.json()["document"]["id"]
    assert owner_sql("select count(*) as n from documents where tenant_id = $1 "
                     "and kind = 'credit_note'", shop.tenant_id)[0]["n"] == 1


# ── Arabic, always, for a consumer ────────────────────────────────────────────────────────


def test_arabic_cannot_be_switched_off_for_consumer_documents(shop):
    for languages in ("en",):
        answer = shop.owner.put("/api/documents/settings", json={"languages": languages})
        assert answer.status_code == 422, answer.text
        assert answer.json()["code"] == "arabic_required"
        assert "Arabic" in answer.json()["detail"] and answer.json()["message_ar"]
    # Arabic first, English first, Arabic only are all fine.
    for languages in ("ar_en", "en_ar", "ar"):
        assert shop.owner.put("/api/documents/settings", json={"languages": languages}
                              ).status_code == 200
    # A single document cannot go round it either.
    english = shop.owner.post("/api/documents", json=draft_body("receipt", languages="en"))
    assert (english.status_code, english.json()["code"]) == (422, "arabic_required")
    # Nor can the shop make its default audience a consumer while it is English only.
    shop.owner.put("/api/documents/settings", json={"default_audience": "business"})
    assert shop.owner.put("/api/documents/settings", json={"languages": "en"}).status_code == 200
    back = shop.owner.put("/api/documents/settings", json={"default_audience": "consumer"})
    assert back.status_code == 422 and back.json()["code"] == "arabic_required"


def test_a_business_document_may_be_in_english_only_and_says_nothing_in_arabic(shop):
    shop.owner.put("/api/documents/settings", json={"default_audience": "business"})
    doc = issued(shop.owner, "invoice", audience="business", languages="en")
    text = page_text(shop.owner.get(f"/api/documents/{doc['id']}/pdf").content)
    assert "INV-0001" in text and "Invoice" in text
    assert not any("؀" <= ch <= "ۿ" for ch in text), "no Arabic was asked for"
    # The same shop can still issue a consumer document with Arabic on it.
    consumer = issued(shop.owner, "receipt", audience="consumer", languages="ar_en")
    assert any("؀" <= ch <= "ۿ" for ch in page_text(
        shop.owner.get(f"/api/documents/{consumer['id']}/pdf").content))


def test_missing_arabic_is_a_warning_not_a_refusal(shop):
    english_only_lines = [{"description": "Bread", "quantity": "1", "unit_price_minor": 350}]
    draft = make_draft(shop.owner, "receipt", lines=english_only_lines,
                       payments=[{"method": "cash", "amount_minor": 350}])
    assert [w["code"] for w in draft["warnings"]] == ["line_missing_arabic"]
    assert draft["warnings"][0]["en"] and draft["warnings"][0]["ar"]
    assert issue(shop.owner, draft["id"]).status_code == 200


def test_a_consumer_document_that_leads_in_english_is_warned_about(shop):
    """The ministry's circular is reported to want Arabic as the main language (spec 010,
    open question for the lawyer). Allowed, and said."""
    english_first = make_draft(shop.owner, languages="en_ar")
    assert "arabic_not_main" in [w["code"] for w in english_first["warnings"]]
    assert make_draft(shop.owner, languages="ar_en")["warnings"] == []
    business = make_draft(shop.owner, "invoice", audience="business", languages="en_ar")
    assert "arabic_not_main" not in [w["code"] for w in business["warnings"]]


# ── a shop with no commercial registration number ────────────────────────────────────────


def test_a_shop_without_a_registration_number_issues_receipts_not_invoices(client_factory, monkeypatch):
    seller = {k: v for k, v in SELLER.items() if k != "commercial_registration"}
    shop = configured_shop(client_factory, monkeypatch, seller=seller)
    for kind in ("invoice", "proforma"):
        draft = make_draft(shop.owner, kind)
        answer = issue(shop.owner, draft["id"])
        assert (answer.status_code, answer.json()["code"]) == (422, "registration_needed")
        assert "receipt" in answer.json()["detail"] and answer.json()["message_ar"]
    receipt = issued(shop.owner, "receipt")
    assert receipt["seller"]["registered"] is False and receipt["kind"] == "receipt"
    text = page_text(shop.owner.get(f"/api/documents/{receipt['id']}/pdf").content)
    assert "Receipt" in text and "not a tax invoice" in text
    assert "Tax invoice" not in text
    # A delivery note and a quote are fine too; the page carries the same note.
    assert issued(shop.owner, "quote")["number"] == "QT-0001"
    # Once the number is added invoices work, and the note goes.
    shop.owner.put("/api/documents/settings", json={"commercial_registration": "100200"})
    invoice = issued(shop.owner, "invoice")
    assert invoice["seller"]["registered"] is True
    assert "not a tax invoice" not in page_text(
        shop.owner.get(f"/api/documents/{invoice['id']}/pdf").content)
    # The receipt issued before keeps what it said: nothing rewrites it.
    again = shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]
    assert again["seller"]["registered"] is False


# ── a document keeps what it said ─────────────────────────────────────────────────────────


def test_changing_the_shop_or_the_customer_later_never_changes_a_document(shop):
    first = issued(shop.owner, "receipt")
    shop.owner.put("/api/documents/settings", json={
        "business_name": "Qirfa Bakery and Sweets", "address": "A new address",
        "layout": "thermal80", "brand_color": "#1d4f91", "footer_en": "A new footer"})
    second = issued(shop.owner, "receipt")
    before = shop.owner.get(f"/api/documents/{first['id']}").json()["document"]
    assert before["seller"]["name"] == "Qirfa Bakery" and before["layout"] == "a4"
    assert before["content_hash"] == first["content_hash"]
    assert second["seller"]["name"] == "Qirfa Bakery and Sweets" and second["layout"] == "thermal80"
    pdf = shop.owner.get(f"/api/documents/{first['id']}/pdf").content
    assert "Sweets" not in page_text(pdf) and "new footer" not in page_text(pdf)


def test_the_shops_terms_and_notes_for_a_kind_are_copied_onto_the_document(shop):
    shop.owner.put("/api/documents/settings", json={
        "terms": {"invoice": {"en": "Payment within 14 days.", "ar": "الدفع خلال 14 يومًا."}},
        "notes": {"receipt": {"en": "Thank you!", "ar": "شكرًا لكم!"}}})
    invoice = issued(shop.owner, "invoice")
    assert invoice["terms"] == {"en": "Payment within 14 days.", "ar": "الدفع خلال 14 يومًا."}
    shop.owner.put("/api/documents/settings", json={"terms": {}})
    assert shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]["terms"]["en"] \
        == "Payment within 14 days."
    receipt = issued(shop.owner, "receipt")
    assert receipt["notes"]["en"] == "Thank you!"
    own = issued(shop.owner, "receipt", notes={"en": "Special order", "ar": "طلب خاص"})
    assert own["notes"]["en"] == "Special order"


# ── the preview ───────────────────────────────────────────────────────────────────────────


def test_the_preview_takes_no_number_and_writes_nothing(shop):
    issued(shop.owner)
    before = counts(shop)
    for kind in ("receipt", "invoice", "quote", "delivery_note", "statement", "credit_note",
                 "deposit_receipt", "proforma"):
        for layout in ("a4", "a5", "thermal80"):
            answer = shop.owner.post("/api/documents/preview", json={"kind": kind, "layout": layout})
            assert answer.status_code == 200, (kind, layout, answer.text)
            assert answer.content.startswith(b"%PDF-")
            assert answer.headers["content-type"] == "application/pdf"
    draft = make_draft(shop.owner, "invoice")
    before = counts(shop)
    from_draft = shop.owner.post("/api/documents/preview", json={"draft_id": draft["id"]})
    inline = shop.owner.post("/api/documents/preview", json={"document": draft_body("quote")})
    assert from_draft.status_code == inline.status_code == 200
    assert counts(shop) == before  # no document, no line, no number moved
    text = page_text(from_draft.content)
    assert "Preview" in text and "RC-" not in text and "INV-" not in text
    # The next real number is still the next one.
    assert issued(shop.owner)["number"] == "RC-0002"


def test_the_preview_follows_the_requested_layout_and_language(shop):
    for layout, wide, tall in (("a4", 210, 297), ("a5", 148, 210)):
        answer = shop.owner.post("/api/documents/preview", json={"kind": "invoice", "layout": layout})
        from pdf_support import page_size_mm
        w, h = page_size_mm(answer.content)
        assert (round(w), round(h)) == (wide, tall)
    english = shop.owner.post("/api/documents/preview", json={"kind": "receipt", "languages": "en"})
    # (a preview of a consumer document still refuses to leave Arabic out)
    assert (english.status_code, english.json()["code"]) == (422, "arabic_required")
    shop.owner.put("/api/documents/settings", json={"default_audience": "business"})
    ok = shop.owner.post("/api/documents/preview", json={
        "document": draft_body("invoice", audience="business", languages="en")})
    assert ok.status_code == 200


def test_the_preview_asks_for_exactly_one_thing_to_draw(shop):
    for body in ({}, {"kind": "receipt", "document": draft_body()}, {"draft_id": str(uuid4()),
                                                                     "kind": "invoice"}):
        answer = shop.owner.post("/api/documents/preview", json=body)
        assert answer.status_code == 422, body
    missing = shop.owner.post("/api/documents/preview", json={"draft_id": str(uuid4())})
    assert missing.status_code == 404


def test_an_agent_may_preview_their_own_draft_and_not_anothers(shop):
    mine, theirs = make_draft(shop.agent), make_draft(shop.owner)
    assert shop.agent.post("/api/documents/preview", json={"draft_id": mine["id"]}).status_code == 200
    assert shop.agent.post("/api/documents/preview", json={"draft_id": theirs["id"]}).status_code == 403
    assert shop.agent.post("/api/documents/preview", json={"kind": "receipt"}).status_code == 200


# ── one shop never sees another's ─────────────────────────────────────────────────────────


def test_one_shop_cannot_see_or_touch_anothers_documents(client_factory, monkeypatch):
    a = configured_shop(client_factory, monkeypatch)
    b = configured_shop(client_factory, monkeypatch)
    mine = issued(a.owner, "invoice")
    draft = make_draft(a.owner, "quote")
    for path in (f"/api/documents/{mine['id']}", f"/api/documents/{mine['id']}/pdf",
                 f"/api/documents/{mine['id']}/verify", f"/api/documents/{mine['id']}/activity"):
        assert b.owner.get(path).status_code == 404, path
    assert b.owner.put(f"/api/documents/{draft['id']}", json=draft_body("quote")).status_code == 404
    assert b.owner.delete(f"/api/documents/{draft['id']}").status_code == 404
    assert issue(b.owner, draft["id"]).status_code == 404
    assert b.owner.post(f"/api/documents/{mine['id']}/credit-note",
                        json={"reason": "Not yours"}).status_code == 404
    assert b.owner.post("/api/documents/preview", json={"draft_id": draft["id"]}).status_code == 404
    assert b.owner.get("/api/documents").json()["total"] == 0
    # Settings and numbering are per shop.
    assert b.owner.get("/api/documents/settings").json()["settings"]["business_name"] == "Qirfa Bakery"
    b.owner.put("/api/documents/settings", json={"business_name": "Shop B"})
    assert a.owner.get("/api/documents/settings").json()["settings"]["business_name"] == "Qirfa Bakery"
    assert issued(b.owner, "invoice")["number"] == "INV-0001"


def test_row_level_security_hides_every_documents_table_from_another_shop(client_factory, monkeypatch):
    a = configured_shop(client_factory, monkeypatch)
    b = configured_shop(client_factory, monkeypatch)
    mine = issued(a.owner, "invoice")

    async def see(conn):
        out = {}
        for table in ("documents", "document_lines", "document_files", "document_series",
                      "document_settings"):
            out[table] = await conn.fetchval(f"select count(*) from {table}")
        return out

    seen_by_b = as_app(b.tenant_id, see)
    seen_by_a = as_app(a.tenant_id, see)
    assert seen_by_a["documents"] == 1 and seen_by_a["document_lines"] == 2
    assert seen_by_a["document_files"] == 1
    # B has its own settings and series rows (made when it was configured), none of A's documents.
    assert seen_by_b["documents"] == seen_by_b["document_lines"] == seen_by_b["document_files"] == 0
    # B cannot even name A's document in a write.
    async def tamper(conn):
        return [
            await conn.execute("update documents set reason = 'x' where id = $1", UUID(mine["id"])),
            await conn.execute("delete from document_lines where document_id = $1",
                               UUID(mine["id"])),
        ]
    assert as_app(b.tenant_id, tamper) == ["UPDATE 0", "DELETE 0"]


def test_a_document_cannot_point_at_another_shops_document(client_factory, monkeypatch):
    a = configured_shop(client_factory, monkeypatch)
    b = configured_shop(client_factory, monkeypatch)
    invoice = issued(a.owner, "invoice")
    draft = make_draft(b.owner, "quote")

    async def point(conn):
        import asyncpg

        try:
            async with conn.transaction():
                await conn.execute("update documents set related_document_id = $2 where id = $1",
                                   UUID(draft["id"]), UUID(invoice["id"]))
        except asyncpg.ForeignKeyViolationError as error:
            return error

    assert as_app(b.tenant_id, point) is not None
