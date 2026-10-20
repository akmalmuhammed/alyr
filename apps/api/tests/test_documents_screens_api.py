"""What the Documents screens read from the API (ALY-146, spec 014): the list with search,
filters, totals and a cursor; the home-screen numbers that equal the lists they open; the
detail's additions; a copy of the PDF on another page size; the preview with settings that are
not saved yet; the settings' recent changes and the next number of each series; a link to
copy; the customer and Catalog lookups; and the pointers from Orders and Credit accounts.

Every test makes its own shop (and so its own numbering): documents cannot be deleted, so
nothing is shared. Everything goes through the real path (PostgreSQL, the HTTP API, the job
queue and the simulator)."""

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from documents_sales_support import (
    customer,
    documents,
    pay_by_link,
    placed,
    sales_shop,
)
from documents_support import (
    CUSTOMER,
    LINES_TOTAL,
    configured_shop,
    draft_body,
    issued,
    make_draft,
)
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


def listed(client, query: str = "") -> dict:
    answer = client.get(f"/api/documents?{query}")
    assert answer.status_code == 200, answer.text
    return answer.json()


def numbers_of(client, query: str = "") -> list[str | None]:
    return [d["number"] for d in listed(client, query)["documents"]]


def payment(shop, doc_id: str, amount: int, method: str = "cash"):
    return shop.owner.post(
        "/api/documents/payments", headers={"Idempotency-Key": f"pay-{uuid4().hex}"},
        json={"subject": "invoice", "id": doc_id, "amount_minor": amount, "method": method})


# ── the list: order, cursor, totals ───────────────────────────────────────────────────────


def test_the_list_is_newest_first_and_pages_by_a_cursor_without_gaps_or_repeats(shop):
    made = [issued(shop.owner, "receipt")["number"] for _ in range(7)]
    first = listed(shop.owner, "limit=3")
    assert [d["number"] for d in first["documents"]] == made[::-1][:3]
    assert first["has_more"] is True and first["total"] == 7 and first["next_cursor"]
    seen = [d["number"] for d in first["documents"]]
    cursor = first["next_cursor"]
    while cursor:
        page = listed(shop.owner, f"limit=3&cursor={cursor}")
        assert "totals" not in page            # worked out once, with the first page
        seen += [d["number"] for d in page["documents"]]
        cursor = page["next_cursor"]
    assert seen == made[::-1]                  # every one, newest first, none twice


def test_a_draft_sorts_by_when_it_was_made_among_the_issued(shop):
    old = issued(shop.owner, "receipt")
    draft = make_draft(shop.owner, "quote")
    new = issued(shop.owner, "receipt")
    assert [d["id"] for d in listed(shop.owner)["documents"]] == [new["id"], draft["id"], old["id"]]


def test_a_bad_cursor_or_filter_is_refused_in_words(shop):
    bad = shop.owner.get("/api/documents?cursor=nonsense")
    assert bad.status_code == 422 and bad.json()["code"] == "cursor_invalid"
    assert bad.json()["message_ar"]
    reversed_dates = shop.owner.get("/api/documents?date_from=2026-10-20&date_to=2026-10-01")
    assert reversed_dates.json()["code"] == "date_range_invalid"
    assert shop.owner.get("/api/documents?delivery=lost").status_code == 422
    assert shop.owner.get("/api/documents?payment=owing").json()["code"] == "filter_invalid"


def test_the_totals_add_up_only_what_can_honestly_be_added(shop):
    issued(shop.owner, "receipt")
    issued(shop.owner, "receipt")
    invoice = issued(shop.owner, "invoice")
    issued(shop.owner, "quote")                      # a quote is not a sale
    make_draft(shop.owner, "receipt")                # nor is a draft
    totals = listed(shop.owner)["totals"]
    assert totals["count"] == 5
    [qar] = totals["money"]
    assert (qar["currency"], qar["exponent"]) == ("QAR", 2)
    assert qar["total_minor"] == 3 * LINES_TOTAL     # two receipts and the invoice
    assert qar["owing_minor"] == LINES_TOTAL         # what the invoice still owes
    assert qar["credited_minor"] == 0
    cancel = shop.owner.post(f"/api/documents/{invoice['id']}/cancel", json={"reason": "wrong customer"})
    assert cancel.status_code == 201
    after = listed(shop.owner)["totals"]["money"][0]
    # The cancelled invoice is no longer counted as billed nor as owed; its credit note shows.
    assert after["total_minor"] == 2 * LINES_TOTAL
    assert after["owing_minor"] == 0 and after["credited_minor"] == LINES_TOTAL
    only_quotes = listed(shop.owner, "kind=quote")["totals"]
    assert only_quotes["count"] == 1 and only_quotes["money"] == []


# ── search ────────────────────────────────────────────────────────────────────────────────


def test_search_finds_a_number_a_name_in_either_language_a_phone_and_an_amount(shop):
    first = issued(shop.owner, "receipt", customer={
        "name": "Fatima Al-Kuwari", "name_ar": "فاطمة الكواري", "phone": "+974 5555 0199"})
    second = issued(shop.owner, "receipt", customer={
        "name": "Eman Saleh", "name_ar": "إيمان صالح", "phone": "+974 6600 4411",
        "company": "Saleh Trading"})
    by = lambda q: sorted(numbers_of(shop.owner, f"q={q}"))   # noqa: E731
    both = sorted([first["number"], second["number"]])
    assert by(first["number"]) == [first["number"]]
    assert by("0002") == [second["number"]]                     # part of a number
    assert by("fatima") == [first["number"]]                    # case does not matter
    assert by("الكواري") == [first["number"]]
    assert by("ايمان") == [second["number"]]                    # the alef is folded: إ = ا
    assert by("saleh%20trading") == [second["number"]]          # the company
    assert by("55550199") == [first["number"]]                  # the digits of a phone
    assert by("%2B974%206600") == [second["number"]]            # with the plus and a space
    assert by("127") == both                                     # the total, QAR 127.00
    assert by("127.00") == both and by("١٢٧") == both
    assert by("127.5") == []
    assert by("nobody") == []


def test_search_treats_what_is_typed_as_text_never_as_a_pattern(shop):
    issued(shop.owner, "receipt")
    for q in ("%25", "_", "%27%3B--", "%5C"):
        assert listed(shop.owner, f"q={q}")["total"] == 0, q


# ── filters ───────────────────────────────────────────────────────────────────────────────


def test_each_filter_keeps_exactly_what_it_names(shop):
    receipt = issued(shop.owner, "receipt")
    unpaid = issued(shop.owner, "invoice")
    part = issued(shop.owner, "invoice")
    paid = issued(shop.owner, "invoice")
    # Payments are recorded by hand against the invoices; each earns a receipt of its own. The
    # invoice paper never changes, so what it has been paid is read from the record.
    part_receipt = payment(shop, part["id"], 1000).json()["document"]["id"]
    paid_receipt = payment(shop, paid["id"], LINES_TOTAL).json()["document"]["id"]
    quote = make_draft(shop.owner, "quote")
    gone = issued(shop.owner, "invoice")
    assert shop.owner.post(f"/api/documents/{gone['id']}/cancel",
                           json={"reason": "duplicate"}).status_code == 201

    def ids(query):
        return sorted(d["id"] for d in listed(shop.owner, query)["documents"])

    assert ids("kind=quote") == [quote["id"]]
    assert ids("status=draft") == [quote["id"]]
    assert ids("status=cancelled") == [gone["id"]]
    assert ids("status=void") == [gone["id"]]
    assert gone["id"] not in ids("status=issued")
    # Paid, part paid and unpaid mean something only on an issued paper that takes payment:
    # the cancelled invoice owes nothing, the draft is no debt, a quote is not paid or unpaid.
    assert ids("payment=unpaid") == sorted([unpaid["id"]])
    assert ids("payment=part") == [part["id"]]
    assert ids("payment=paid") == sorted([receipt["id"], paid["id"], part_receipt, paid_receipt])
    shown = {d["id"]: d for d in listed(shop.owner, "kind=invoice")["documents"]}
    assert (shown[part["id"]]["paid_minor"], shown[part["id"]]["balance_minor"]) == (
        1000, LINES_TOTAL - 1000)
    assert shown[paid["id"]]["balance_minor"] == 0 and shown[gone["id"]]["balance_minor"] == 0
    detail = shop.owner.get(f"/api/documents/{part['id']}").json()["document"]
    assert detail["totals"]["paid_minor"] == 0                     # the paper, as issued
    assert (detail["now"]["paid_minor"], detail["now"]["balance_minor"]) == (
        1000, LINES_TOTAL - 1000)
    assert [p["amount_minor"] for p in detail["recorded_payments"]] == [1000]
    assert ids("payment=unpaid,part") == sorted([unpaid["id"], part["id"]])
    assert ids("kind=invoice&payment=unpaid,part") == sorted([unpaid["id"], part["id"]])
    assert ids("kind=receipt&payment=unpaid") == []


def test_the_date_range_and_the_branch_filter(shop):
    first = issued(shop.owner, "receipt")
    assert shop.owner.put("/api/documents/branches/lus", json={
        "code": "LUS", "name": "Lusail"}).status_code == 200
    lusail = issued(shop.owner, "receipt", branch="lus")
    today = datetime.now(UTC).date()
    tomorrow, yesterday = today + timedelta(days=1), today - timedelta(days=1)

    def n(query):
        return listed(shop.owner, query)["total"]

    assert n(f"date_from={yesterday}&date_to={tomorrow}") == 2
    assert n(f"date_from={tomorrow + timedelta(days=1)}") == 0
    assert n(f"date_to={yesterday - timedelta(days=1)}") == 0
    assert n("branch=lus") == 1 and numbers_of(shop.owner, "branch=lus") == [lusail["number"]]
    assert numbers_of(shop.owner, "branch=main") == [first["number"]]
    assert n("branch=nowhere") == 0


# ── an agent sees only their own ──────────────────────────────────────────────────────────


def test_an_agent_sees_and_counts_only_the_papers_they_made_and_no_owed_cards(shop):
    issued(shop.owner, "invoice")
    mine = make_draft(shop.agent, "quote")
    seen = listed(shop.agent)
    assert [d["id"] for d in seen["documents"]] == [mine["id"]]
    assert seen["total"] == 1
    assert listed(shop.agent, "show=unpaid_invoices")["total"] == 0
    assert listed(shop.owner, "show=unpaid_invoices")["total"] == 1
    cards = {c["key"] for c in shop.agent.get("/api/workspace/home").json()["cards"]}
    assert "unpaid_invoices" not in cards and "documents_not_delivered" not in cards
    owner_cards = {c["key"]: c for c in shop.owner.get("/api/workspace/home").json()["cards"]}
    assert owner_cards["unpaid_invoices"]["value"] == 1
    assert "documents" not in shop.agent.get("/api/agent").json() or \
        shop.agent.get("/api/agent").json()["documents"] is None


# ── the numbers on the home screen are the lists they open ────────────────────────────────


def test_the_home_cards_count_exactly_the_rows_of_the_list_they_open(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    reachable = customer(shop, "Huda Al-Naimi")
    # Two customers the shop may not message: their documents are made and cannot be delivered.
    silent = customer(shop, "Salem", consent="unknown", window=False)
    stopped = customer(shop, "Noor", consent="revoked")
    placed(shop, reachable, payment="link")
    order = placed(shop, silent, payment="link")
    pay_by_link(shop, order)
    order = placed(shop, stopped, payment="link")
    pay_by_link(shop, order)
    for who in (reachable, silent):
        body = draft_body("invoice", contact_id=who.id)
        made = shop.owner.post("/api/documents", json={**body, "issue": True},
                               headers={"Idempotency-Key": f"inv-{uuid4().hex}"})
        assert made.status_code == 201, made.text
    part = shop.owner.post("/api/documents", json={**draft_body("invoice", contact_id=reachable.id), "issue": True},
                           headers={"Idempotency-Key": f"inv-{uuid4().hex}"}).json()["document"]
    assert payment(shop, part["id"], 500).status_code == 201

    cards = {c["key"]: c for c in shop.owner.get("/api/workspace/home").json()["cards"]}
    unpaid, undelivered = cards["unpaid_invoices"], cards["documents_not_delivered"]
    assert (unpaid["href"], undelivered["href"]) == (
        "/app/documents?show=unpaid_invoices", "/app/documents?show=not_delivered")
    assert unpaid["value"] == listed(shop.owner, "show=unpaid_invoices")["total"] == 3
    assert undelivered["value"] == listed(shop.owner, "show=not_delivered")["total"]
    assert undelivered["value"] >= 2                    # the receipts of the two who cannot be reached
    # The list the card opens is the same query as spelling the filters out.
    assert numbers_of(shop.owner, "show=unpaid_invoices") == numbers_of(
        shop.owner, "kind=invoice&status=issued&payment=unpaid,part")
    assert numbers_of(shop.owner, "show=not_delivered") == numbers_of(
        shop.owner, "status=issued&delivery=not_delivered")
    assert shop.owner.get("/api/documents/counts").json()["counts"] == {
        "unpaid_invoices": unpaid["value"], "not_delivered": undelivered["value"]}
    # The Agent dashboard says the same.
    block = shop.owner.get("/api/agent").json()["documents"]
    assert {c["key"]: c["value"] for c in block["cards"]} == {
        "unpaid_invoices": unpaid["value"], "documents_not_delivered": undelivered["value"]}


def test_the_delivery_filter_in_sql_says_what_the_delivery_summary_says(client_factory, monkeypatch):
    """The list filters by SQL and shows each row's state by `delivery.summary_of`; they must
    never disagree."""
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    silent = customer(shop, "Salem", consent="unknown", window=False)
    pay_by_link(shop, placed(shop, who))
    pay_by_link(shop, placed(shop, silent))
    issued(shop.owner, "quote")                       # never sent
    rows = listed(shop.owner)["documents"]
    states = {d["delivery"]["state"] for d in rows}
    assert {"none", "not_delivered"} <= states | {"sent", "delivered", "queued"}
    for state in ("none", "queued", "sent", "delivered", "not_delivered"):
        by_filter = sorted(d["id"] for d in listed(shop.owner, f"delivery={state}")["documents"])
        by_row = sorted(d["id"] for d in rows if d["delivery"]["state"] == state
                        and (state != "none" or d["status"] != "draft"))
        assert by_filter == by_row, state


def test_a_shop_without_the_module_has_no_section_no_cards_and_no_answers(client_factory, monkeypatch):
    shop = configured_shop(client_factory, monkeypatch, documents=False)
    nav = shop.owner.get("/api/workspace").json()["nav"]["products"]
    assert "documents" not in [s["key"] for s in nav]
    keys = {c["key"] for c in shop.owner.get("/api/workspace/home").json()["cards"]}
    assert not keys & {"unpaid_invoices", "documents_not_delivered"}
    assert shop.owner.get("/api/documents").status_code == 403
    assert shop.owner.get("/api/documents/counts").status_code == 403
    assert shop.owner.get("/api/documents/customers").status_code == 403
    assert shop.owner.get("/api/documents/catalog-lines").status_code == 403
    assert shop.owner.get("/api/agent").json()["documents"] is None


def test_a_shop_with_the_module_gets_its_section_in_the_navigation(shop):
    nav = shop.owner.get("/api/workspace").json()["nav"]["products"]
    [documents_screen] = [s for s in nav if s["key"] == "documents"]
    assert documents_screen["label"] == {"en": "Documents", "ar": "المستندات"}
    assert "documents" in [s["key"] for s in shop.agent.get("/api/workspace").json()["nav"]["products"]]


def test_one_shop_never_sees_another_shops_documents_in_the_list_or_the_counts(
        client_factory, monkeypatch):
    mine = configured_shop(client_factory, monkeypatch)
    theirs = configured_shop(client_factory, monkeypatch)
    issued(theirs.owner, "invoice", customer={"name": "Secret Customer"})
    assert listed(mine.owner)["total"] == 0
    assert listed(mine.owner, "q=secret")["total"] == 0
    assert listed(mine.owner, "show=unpaid_invoices")["total"] == 0
    assert mine.owner.get("/api/documents/counts").json()["counts"]["unpaid_invoices"] == 0
    assert listed(theirs.owner, "q=secret")["total"] == 1


# ── the detail ────────────────────────────────────────────────────────────────────────────


def test_an_invoice_lists_the_receipts_of_its_payments_and_a_receipt_points_back(shop):
    invoice = issued(shop.owner, "invoice")
    paid = payment(shop, invoice["id"], 1500)
    assert paid.status_code == 201, paid.text
    receipt_id = paid.json()["document"]["id"]
    detail = shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]
    assert [c["id"] for c in detail["children"]] == [receipt_id]
    assert detail["children"][0]["kind"] in ("receipt", "deposit_receipt")
    assert detail["totals"]["paid_minor"] == invoice["totals"]["paid_minor"]
    back = shop.owner.get(f"/api/documents/{receipt_id}").json()["document"]
    assert back["related"]["id"] == invoice["id"]


def test_a_document_made_from_an_order_names_the_order(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    order = placed(shop, who)
    pay_by_link(shop, order)
    [receipt] = documents(shop, kind="receipt")
    detail = shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]
    assert detail["source_info"] == {"kind": "order", "id": receipt["source_ref"],
                                     "number": order["number"]}
    manual = issued(shop.owner, "receipt")
    assert manual["source_info"] is None


# ── the PDF on another page size ──────────────────────────────────────────────────────────


def test_a_copy_on_another_page_size_changes_nothing_that_was_issued(shop):
    doc = issued(shop.owner, "receipt")
    stored = shop.owner.get(f"/api/documents/{doc['id']}/pdf")
    assert stored.status_code == 200
    assert hashlib.sha256(stored.content).hexdigest() == doc["pdf"]["sha256"]
    for layout in ("a5", "thermal80"):
        copy = shop.owner.get(f"/api/documents/{doc['id']}/pdf?layout={layout}")
        assert copy.status_code == 200, copy.text
        assert copy.content.startswith(b"%PDF") and copy.content != stored.content
        assert copy.headers["x-document-layout"] == layout
    same = shop.owner.get(f"/api/documents/{doc['id']}/pdf?layout=a4")
    assert same.content == stored.content and "x-document-layout" not in same.headers
    # The paper, its number, its hash and its stored PDF are as they were.
    again = shop.owner.get(f"/api/documents/{doc['id']}").json()["document"]
    assert (again["number"], again["layout"], again["content_hash"]) == (
        doc["number"], "a4", doc["content_hash"])
    assert hashlib.sha256(shop.owner.get(f"/api/documents/{doc['id']}/pdf").content).hexdigest() \
        == doc["pdf"]["sha256"]
    assert shop.owner.get(f"/api/documents/{doc['id']}/verify").json()["ok"] is True
    assert owner_sql("select count(*) as n from document_files where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 1
    assert shop.owner.get(f"/api/documents/{doc['id']}/pdf?layout=a3").status_code == 422


def test_a_draft_has_no_pdf_copy_and_download_asks_for_a_file(shop):
    draft = make_draft(shop.owner)
    assert shop.owner.get(f"/api/documents/{draft['id']}/pdf?layout=a5").status_code == 409
    doc = issued(shop.owner)
    got = shop.owner.get(f"/api/documents/{doc['id']}/pdf?download=true")
    assert got.headers["content-disposition"].startswith("attachment")


# ── the preview: no number, and settings that are not saved yet ───────────────────────────


def counters(shop) -> int:
    return owner_sql("select coalesce(sum(last_number), 0) as n from document_series "
                     "where tenant_id = $1", shop.tenant_id)[0]["n"]


def test_a_preview_takes_no_number_however_often_it_is_asked(shop):
    issued(shop.owner, "receipt")
    before = (counters(shop), listed(shop.owner)["total"])
    draft = make_draft(shop.owner, "invoice")
    for body in ({"kind": "receipt"}, {"draft_id": draft["id"]},
                 {"kind": "invoice", "layout": "thermal80"},
                 {"kind": "receipt", "settings": {"brand_color": "#8a1c2b"}}):
        assert shop.owner.post("/api/documents/preview", json=body).status_code == 200, body
    assert (counters(shop), listed(shop.owner)["total"] - 1) == (before[0], before[1])
    nxt = issued(shop.owner, "receipt")
    assert nxt["number"].endswith("0002")                 # the previews spent nothing


def test_settings_tried_in_the_preview_change_the_page_and_are_not_saved(shop):
    base = shop.owner.post("/api/documents/preview", json={"kind": "receipt"}).content
    trial = shop.owner.post("/api/documents/preview", json={
        "kind": "receipt", "settings": {"brand_color": "#8a1c2b", "show_sku": True,
                                        "header_en": "Welcome to Qirfa"}})
    assert trial.status_code == 200 and trial.content != base
    saved = shop.owner.get("/api/documents/settings").json()["settings"]
    assert (saved["brand_color"], saved["show_sku"], saved["header_en"]) == (None, False, "")
    again = shop.owner.post("/api/documents/preview", json={"kind": "receipt"}).content
    assert len(again) == len(base)                       # unchanged by the trial


def test_the_shops_own_note_for_a_kind_shows_in_the_sample_preview(shop):
    plain = shop.owner.post("/api/documents/preview", json={"kind": "receipt"}).content
    noted = shop.owner.post("/api/documents/preview", json={
        "kind": "receipt", "settings": {"notes": {"receipt": {
            "en": "No returns on cakes.", "ar": "لا إرجاع للكعك."}}}}).content
    assert noted != plain


def test_a_trial_goes_through_the_checks_saving_goes_through(shop):
    bad = shop.owner.post("/api/documents/preview", json={
        "kind": "receipt", "settings": {"brand_color": "pink"}})
    assert bad.status_code == 422 and bad.json()["code"] == "colour_invalid"
    pale = shop.owner.post("/api/documents/preview", json={
        "kind": "receipt", "settings": {"brand_color": "#f5f5f5"}})
    assert pale.json()["code"] == "colour_too_light"
    english = shop.owner.post("/api/documents/preview", json={
        "kind": "receipt", "settings": {"languages": "en"}})
    assert english.status_code == 422 and english.json()["code"] == "arabic_required"
    assert english.json()["message_ar"]
    business = shop.owner.post("/api/documents/preview", json={
        "kind": "receipt", "settings": {"languages": "en", "default_audience": "business"}})
    assert business.status_code == 200
    unknown = shop.owner.post("/api/documents/preview", json={
        "kind": "receipt", "settings": {"nonsense": 1}})
    assert unknown.status_code == 422


def test_only_an_owner_or_admin_may_try_settings_in_the_preview(shop):
    body = {"kind": "receipt", "settings": {"brand_color": "#8a1c2b"}}
    assert shop.agent.post("/api/documents/preview", json=body).status_code == 403
    assert shop.admin.post("/api/documents/preview", json=body).status_code == 200
    assert shop.agent.post("/api/documents/preview", json={"kind": "receipt"}).status_code == 200


# ── settings: recent changes and the next number ──────────────────────────────────────────


def test_changes_to_the_settings_are_listed_with_who_and_which_never_with_the_text(shop):
    shop.owner.put("/api/documents/settings", json={
        "bank_details": "IBAN QA00SECRETBANK123", "brand_color": "#8a1c2b", "show_sku": True})
    shop.admin.put("/api/documents/settings", json={"cash_rounding_minor": 25})
    shop.owner.put("/api/documents/series/receipt/main", json={"prefix": "REC", "pad": 5})
    shop.owner.put("/api/documents/branches/lus", json={"code": "LUS", "name": "Lusail"})
    changes = shop.owner.get("/api/documents/settings/activity")
    assert changes.status_code == 200
    rows = changes.json()["changes"]
    actions = [r["action"] for r in rows]
    assert actions[:3] == ["branch_added", "series_changed", "settings_changed"]
    assert actions.count("settings_changed") >= 2
    assert {r["actor"] for r in rows} >= {"Owner", "Admin"}
    text = changes.text
    assert "SECRETBANK" not in text                 # a bank detail is named, never copied
    fields = [c["field"] for r in rows for c in (r["detail"].get("changes") or [])]
    assert "bank_details" in fields and "cash_rounding_minor" in fields
    assert shop.agent.get("/api/documents/settings/activity").status_code == 403
    assert shop.admin.get("/api/documents/settings/activity").status_code == 200


def test_each_series_says_the_next_number_it_will_give(shop):
    def next_of(kind, key="main"):
        rows = shop.owner.get("/api/documents/series").json()["series"]
        return next(r["next_number"] for r in rows if r["kind"] == kind and r["series_key"] == key)

    assert next_of("receipt") == "RC-0001" and next_of("invoice") == "INV-0001"
    issued(shop.owner, "receipt")
    assert next_of("receipt") == "RC-0002"
    shop.owner.put("/api/documents/series/receipt/main", json={"pad": 6, "prefix": "REC"})
    assert next_of("receipt") == "REC-000002"
    shop.owner.put("/api/documents/series/receipt/main", json={"yearly_reset": True})
    year = datetime.now(UTC).year                     # (Doha is three hours ahead of UTC)
    assert next_of("receipt") in (f"REC-{year}-000001", f"REC-{year + 1}-000001")
    shop.owner.put("/api/documents/branches/lus", json={"code": "LUS", "name": "Lusail"})
    assert next_of("invoice", "lus") == "INVLUS-0001"
    # A reading, not a reservation: asking changes nothing.
    assert next_of("invoice") == "INV-0001" == next_of("invoice")
    assert issued(shop.owner, "invoice")["number"] == "INV-0001"


# ── what the form starts from and what each person may do ────────────────────────────────


def test_meta_tells_the_form_what_to_start_from_and_each_person_what_they_may_do(shop):
    owner = shop.owner.get("/api/documents/meta").json()
    assert owner["defaults"] == {
        "currency": "QAR", "tax_enabled": False, "tax_rate_bp": 0, "cash_rounding_minor": 0,
        "languages": "ar_en", "default_audience": "consumer", "layout": "a4", "show_sku": False,
        "has_registration": True, "show_alyr_mark": True}
    assert owner["access"] == {"role": "owner", "can_manage": True, "can_issue": True,
                               "can_draft": True, "can_credit": True, "can_record_payments": True}
    agent = shop.agent.get("/api/documents/meta").json()["access"]
    assert (agent["can_manage"], agent["can_issue"], agent["can_credit"],
            agent["can_record_payments"]) == (False, False, False, False)
    # The registration number's text and the bank details are the owner's alone.
    assert "commercial_registration" not in shop.agent.get("/api/documents/meta").text
    shop.owner.put("/api/documents/settings", json={
        "agents_may_issue": True, "agents_may_record_payments": True})
    allowed = shop.agent.get("/api/documents/meta").json()["access"]
    assert (allowed["can_issue"], allowed["can_record_payments"], allowed["can_manage"]) == (
        True, True, False)


def _png() -> bytes:
    import io

    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (120, 60), (138, 28, 43)).save(out, "PNG")
    return out.getvalue()


def test_the_saved_logo_and_stamp_can_be_shown_back_to_an_owner_and_to_nobody_else(shop):
    assert shop.owner.get("/api/documents/settings/logo").status_code == 404
    put = shop.owner.put("/api/documents/settings/logo", content=_png(),
                         headers={"content-type": "image/png"})
    assert put.status_code == 200, put.text
    got = shop.owner.get("/api/documents/settings/logo")
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert shop.owner.get("/api/documents/settings/stamp").status_code == 404
    assert shop.agent.get("/api/documents/settings/logo").status_code == 403
    assert shop.owner.get("/api/documents/settings/other").status_code == 422
    # The settings' activity is a route of its own, not a picture called "activity".
    assert shop.owner.get("/api/documents/settings/activity").status_code == 200
    shop.owner.delete("/api/documents/settings/logo")
    assert shop.owner.get("/api/documents/settings/logo").status_code == 404


def test_the_same_logo_is_drawn_on_the_preview_that_the_settings_screen_shows(shop):
    plain = shop.owner.post("/api/documents/preview?format=png&width=500", json={"kind": "receipt"})
    shop.owner.put("/api/documents/settings/logo", content=_png(), headers={"content-type": "image/png"})
    branded = shop.owner.post("/api/documents/preview?format=png&width=500", json={"kind": "receipt"})
    assert branded.content != plain.content


# ── a link to copy ────────────────────────────────────────────────────────────────────────


def test_a_link_to_the_hosted_page_opens_it_and_making_it_is_on_the_record(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    doc = issued(shop.owner, "receipt")
    made = shop.owner.post(f"/api/documents/{doc['id']}/link")
    assert made.status_code == 200, made.text
    link = made.json()
    assert link["url"].startswith("http://web.test/d/") and "?t=" in link["url"]
    assert link["days"] == 90 and link["expires_at"].endswith("Z")
    token = link["url"].split("?t=")[1]
    page = shop.owner.get(f"/api/d/{shop.slug}", headers={"X-Order-Link": token})
    assert page.status_code == 200 and page.json()["document"]["number"] == doc["number"]
    rows = owner_sql("select action, actor_name from activity where tenant_id = $1 and subject_id = $2 "
                     "and action = 'link_created'", shop.tenant_id, UUID(doc["id"]))
    assert [r["actor_name"] for r in rows] == ["Owner"]
    draft = make_draft(shop.owner)
    assert shop.owner.post(f"/api/documents/{draft['id']}/link").status_code == 409


def test_an_agent_makes_a_link_only_for_their_own_paper_and_a_shop_with_no_address_cannot(shop):
    doc = issued(shop.owner, "receipt")
    assert shop.agent.post(f"/api/documents/{doc['id']}/link").status_code == 403
    answer = shop.owner.post(f"/api/documents/{doc['id']}/link")      # this test shop has no slug
    assert answer.status_code == 409 and answer.json()["code"] == "no_public_link"
    assert answer.json()["message_ar"]


# ── the customer picker and the Catalog lookup ────────────────────────────────────────────


def test_the_customer_picker_finds_by_name_or_by_the_digits_of_a_phone(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    huda = customer(shop, "Huda Al-Naimi", email="huda@mail.example")
    salem = customer(shop, "Salem Al-Mannai")
    found = shop.owner.get("/api/documents/customers?q=huda").json()["customers"]
    assert [c["id"] for c in found] == [huda.id]
    assert (found[0]["name"], found[0]["phone"], found[0]["email"]) == (
        "Huda Al-Naimi", huda.phone, "huda@mail.example")
    assert [c["id"] for c in shop.owner.get(
        f"/api/documents/customers?q={salem.phone[-6:]}").json()["customers"]] == [salem.id]
    assert {c["id"] for c in shop.owner.get("/api/documents/customers").json()["customers"]} >= {
        huda.id, salem.id}
    assert shop.owner.get("/api/documents/customers?q=zzzzzz").json()["customers"] == []
    assert shop.owner.get("/api/documents/customers?q=%25").json()["customers"] == []


def test_the_picker_never_offers_another_shops_customers_or_the_shops_staff(client_factory, monkeypatch):
    mine = sales_shop(client_factory, monkeypatch)
    theirs = sales_shop(client_factory, monkeypatch)
    customer(theirs, "Their Customer")
    owner_sql("insert into contacts (tenant_id, phone, name, role) values ($1, '97455500001', "
              "'Staff Person', 'staff')", mine.tenant_id)
    assert mine.owner.get("/api/documents/customers?q=customer").json()["customers"] == []
    assert mine.owner.get("/api/documents/customers?q=staff").json()["customers"] == []


def test_catalog_lines_come_priced_for_the_customers_group_and_found_by_name_code_or_sku(
        client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    made = shop.owner.post("/api/items", json={
        "name": "Fresh Arabic bread", "name_ar": "خبز عربي طازج", "price": 350,
        "status": "live", "sku": "BRD-01"})
    assert made.status_code == 200, made.text
    bread = made.json()["item"]
    code = bread["code"]
    retail, wholesale = customer(shop, "Retail Rana"), customer(shop, "Wholesale Wael")
    group = shop.owner.post("/api/price-groups", json={"name": "Wholesale", "name_ar": "الجملة"}).json()["group"]
    shop.owner.put(f"/api/price-groups/customers/{wholesale.id}", json={"group_id": group["id"]})
    shop.owner.put(f"/api/items/{bread['id']}/group-prices", json={
        "prices": [{"group_id": group["id"], "variant_id": None, "price": 280}], "reason": ""})

    def lines(q, contact=None):
        url = f"/api/documents/catalog-lines?q={q}" + (f"&contact_id={contact.id}" if contact else "")
        answer = shop.owner.get(url)
        assert answer.status_code == 200, answer.text
        return answer.json()["lines"]

    for q in ("bread", "خبز", "BRD-01", str(code)):
        [line] = lines(q)
        assert (line["description"], line["description_ar"]) == ("Fresh Arabic bread", "خبز عربي طازج")
        assert (line["sku"], line["code"], line["unit"]) == ("BRD-01", code, "piece")
        assert line["unit_price_minor"] == 350 and line["group_price"] is False
    [for_retail] = lines("bread", retail)
    assert for_retail["unit_price_minor"] == 350
    [for_wholesale] = lines("bread", wholesale)
    assert (for_wholesale["unit_price_minor"], for_wholesale["group_price"]) == (280, True)
    assert lines("nothing-like-this") == []


def test_catalog_lines_leave_out_samples_drafts_and_archived_items_and_split_sizes(
        client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    shirt = shop.owner.post("/api/items", json={
        "name": "Cotton shirt", "name_ar": "قميص قطن", "price": 5000, "status": "live",
        "variants": [{"name": "Small", "price_delta": 0}, {"name": "Large", "price_delta": 500}],
    })
    assert shirt.status_code == 200, shirt.text
    shop.owner.post("/api/items", json={"name": "Shirt draft", "price": 100, "status": "draft"})
    sized = shop.owner.get("/api/documents/catalog-lines?q=shirt").json()["lines"]
    assert sorted((line["description"], line["unit_price_minor"]) for line in sized) == [
        ("Cotton shirt (Large)", 5500), ("Cotton shirt (Small)", 5000)]


# ── the pointers from Orders and Credit accounts ──────────────────────────────────────────


def test_an_order_row_points_at_its_receipt_and_only_where_there_is_one(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop)
    paid, unpaid = placed(shop, who), placed(shop, who)
    pay_by_link(shop, paid)
    rows = {o["number"]: o for o in shop.owner.get("/api/orders").json()["orders"]}
    [receipt] = documents(shop, kind="receipt")
    assert rows[paid["number"]]["document"] == {
        "id": str(receipt["id"]), "kind": "receipt", "number": "RC-0001", "status": "issued"}
    assert "document" not in rows[unpaid["number"]]


def test_a_shop_without_documents_gets_the_orders_answer_it_always_got(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch, documents=False)
    who = customer(shop)
    pay_by_link(shop, placed(shop, who))
    [row] = shop.owner.get("/api/orders").json()["orders"]
    assert "document" not in row
    entries = shop.owner.get(f"/api/ledger/customers/{who.id}/entries").json()["entries"]
    assert all("document" not in e for e in entries)


def test_credit_account_rows_point_at_the_invoice_and_the_receipt_they_made(client_factory, monkeypatch):
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, credit_limit=100_000)
    order = placed(shop, who, payment="account")
    [invoice] = documents(shop, kind="invoice")
    paid = shop.owner.post(
        "/api/documents/payments", headers={"Idempotency-Key": f"pay-{uuid4().hex}"},
        json={"subject": "credit", "id": who.id, "amount_minor": 1000, "method": "cash"})
    assert paid.status_code == 201, paid.text
    entries = shop.owner.get(f"/api/ledger/customers/{who.id}/entries").json()["entries"]
    by_kind = {e["kind"]: e for e in entries}
    assert by_kind["sale"]["document"]["id"] == str(invoice["id"])
    assert by_kind["sale"]["document"]["kind"] == "invoice"
    assert by_kind["payment"]["document"]["kind"] == "receipt"
    assert by_kind["payment"]["document"]["number"].startswith("RC-")
    assert order["number"]


def test_the_customer_in_a_draft_is_filled_from_the_picker_and_kept_as_typed(shop):
    """What the draft form sends: a contact and what was typed beside it."""
    body = draft_body("quote", customer={**CUSTOMER, "company": "Saleh Trading",
                                         "registration_number": "55123", "tax_id": "T-9",
                                         "address": "West Bay", "address_ar": "الخليج الغربي"})
    made = shop.owner.post("/api/documents", json=body).json()["document"]
    assert made["customer"]["company"] == "Saleh Trading"
    assert made["customer"]["registration_number"] == "55123"
    assert made["customer"]["address_ar"] == "الخليج الغربي"


# ── the totals the draft form shows while it is typed are the engine's ─────────────────────

VECTORS = Path(__file__).resolve().parents[2] / "web/app/(product)/_workspace/documentsVectors.json"


def _vectors() -> list[dict]:
    """Lines and cash roundings worked out by the engine, from a fixed seed. The web's own test
    (`documents.test.mjs`) reads the same file and must reach the same numbers with its integer
    arithmetic: two languages, one rule."""
    from decimal import Decimal
    from random import Random

    from alyr.modules.documents import money

    rng = Random(20261020)
    rows = []
    for _ in range(400):
        milli = rng.choice([1000, 1000, 2000, 500, 1500, 250, 3333, rng.randint(1, 99999)])
        price = rng.choice([1, 5, 99, 350, 999, 4500, rng.randint(1, 500_000)])
        gross = money.gross_of(Decimal(milli) / Decimal(1000), price)
        discount = rng.choice([0, 0, rng.randint(0, gross)])
        rate = rng.choice([0, 0, 500, 1000, 1500, 2500])
        net, tax, total = money.line_amounts(Decimal(milli) / Decimal(1000), price, discount, rate)
        step = rng.choice([0, 5, 10, 25, 50, 100])
        rows.append({"milli": milli, "price": price, "discount": discount, "rate_bp": rate,
                     "gross": gross, "net": net, "tax": tax, "total": total, "step": step,
                     "rounding": money.round_to_step(total, step)})
    return rows


def test_the_web_vectors_are_the_engines_numbers():
    import json
    import os

    found = _vectors()
    if os.environ.get("ALYR_UPDATE_VECTORS") == "1":
        VECTORS.write_text(json.dumps(found, indent=0) + "\n", encoding="utf-8")
    assert json.loads(VECTORS.read_text(encoding="utf-8")) == found


# ── a page as a picture: how the screens show a document inside a page ─────────────────────


def png_size(data: bytes) -> tuple[int, int]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def test_a_page_of_an_issued_document_comes_as_a_picture_of_the_stored_pdf(shop):
    doc = issued(shop.owner, "receipt")
    got = shop.owner.get(f"/api/documents/{doc['id']}/pdf?format=png&width=600")
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.headers["x-page-count"] == "1"
    assert got.headers["cache-control"] == "private, no-store"
    width, height = png_size(got.content)
    assert width == 600 and 800 < height < 900                # A4 is 1 : 1.414
    a5 = shop.owner.get(f"/api/documents/{doc['id']}/pdf?format=png&layout=a5&width=600")
    assert a5.status_code == 200 and png_size(a5.content)[0] == 600
    assert a5.content != got.content                          # another page size, not the same picture
    roll = shop.owner.get(f"/api/documents/{doc['id']}/pdf?format=png&layout=thermal80&width=300")
    assert png_size(roll.content)[0] == 300
    # The picture is a reading: the issued paper, its hash and its stored PDF are as they were.
    stored = shop.owner.get(f"/api/documents/{doc['id']}/pdf").content
    assert hashlib.sha256(stored).hexdigest() == doc["pdf"]["sha256"]


def test_a_long_document_has_pages_and_a_page_it_lacks_is_refused_in_words(shop):
    many = [{"description": f"Item {n}", "description_ar": f"صنف {n}", "quantity": "1",
             "unit": "piece", "unit_price_minor": 100} for n in range(1, 70)]
    doc = issued(shop.owner, "receipt", lines=many,
                 payments=[{"method": "cash", "amount_minor": 69 * 100}])
    first = shop.owner.get(f"/api/documents/{doc['id']}/pdf?format=png")
    pages = int(first.headers["x-page-count"])
    assert pages >= 2
    last = shop.owner.get(f"/api/documents/{doc['id']}/pdf?format=png&page={pages}")
    assert last.status_code == 200 and last.content != first.content
    past = shop.owner.get(f"/api/documents/{doc['id']}/pdf?format=png&page={pages + 1}")
    assert past.status_code == 422 and past.json()["code"] == "page_unknown"
    assert past.json()["message_ar"]
    assert shop.owner.get(f"/api/documents/{doc['id']}/pdf?format=png&width=10").status_code == 422


def test_the_preview_can_be_a_picture_too_and_still_takes_no_number(shop):
    before = counters(shop)
    got = shop.owner.post("/api/documents/preview?format=png&width=500", json={
        "kind": "invoice", "settings": {"brand_color": "#8a1c2b"}})
    assert got.status_code == 200 and png_size(got.content)[0] == 500
    assert got.headers["x-page-count"] == "1"
    assert counters(shop) == before


def test_an_agent_cannot_see_a_picture_of_a_paper_they_may_not_open(shop):
    doc = issued(shop.owner, "receipt")
    assert shop.agent.get(f"/api/documents/{doc['id']}/pdf?format=png").status_code == 403
