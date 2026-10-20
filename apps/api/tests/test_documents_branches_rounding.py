"""Branches with their own numbering, and cash rounding as its own line (ALY-138, added to the
issue on 19 Oct 2026).

A shop with more than one place gives each its own series of numbers (the prefix of INV for
the main place, INVLUS for the branch whose code is LUS) and, if it wants, its own address and
phone on the paper. A shop that rounds its cash totals (to the nearest 5 dirhams, say) shows
the difference as a line of its own, "Rounding", never inside a price.
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest

from documents_support import (
    as_app,
    configured_shop,
    issue,
    issued,
    make_draft,
    refused_by_database,
)
from pdf_support import has_letters, page_text
from test_consent import owner_sql

LUSAIL = {"name": "Lusail", "name_ar": "لوسيل", "code": "lus", "phone": "+974 5555 0300",
          "address": "Marina Promenade, Lusail", "address_ar": "ممشى المارينا، لوسيل"}


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


def numbers(shop, kind=None, branch=None) -> list[str]:
    rows = owner_sql(
        "select number from documents where tenant_id = $1 and number is not null "
        "and ($2::text is null or kind = $2) and ($3::text is null or branch_key = $3) "
        "order by issued_at, seq", shop.tenant_id, kind, branch)
    return [r["number"] for r in rows]


# ── branches ──────────────────────────────────────────────────────────────────────────────


def test_the_shop_itself_is_the_main_branch(shop):
    listed = shop.owner.get("/api/documents/branches").json()["branches"]
    assert [(b["branch_key"], b["code"], b["active"]) for b in listed] == [("main", "", True)]
    assert issued(shop.owner)["branch"] == "main"


def test_a_branch_has_its_own_numbers_beside_the_mains(shop):
    added = shop.owner.put("/api/documents/branches/lusail", json=LUSAIL)
    assert added.status_code == 200, added.text
    assert added.json()["branch"]["code"] == "LUS"  # capitals, whatever was sent
    series = {(s["kind"], s["series_key"]): s["prefix"]
              for s in shop.owner.get("/api/documents/series").json()["series"]}
    assert series[("invoice", "main")] == "INV" and series[("invoice", "lusail")] == "INVLUS"
    assert series[("receipt", "lusail")] == "RCLUS"

    issued(shop.owner, "invoice")
    issued(shop.owner, "invoice", branch="lusail")
    issued(shop.owner, "invoice", branch="lusail")
    issued(shop.owner, "invoice")
    issued(shop.owner, "receipt", branch="lusail")
    assert numbers(shop, "invoice", "main") == ["INV-0001", "INV-0002"]
    assert numbers(shop, "invoice", "lusail") == ["INVLUS-0001", "INVLUS-0002"]
    assert numbers(shop, "receipt", "lusail") == ["RCLUS-0001"]
    # Each series is gapless and unique in the shop's whole set of numbers.
    every = numbers(shop)
    assert len(every) == len(set(every))


def test_a_branchs_own_address_and_phone_replace_the_shops_on_its_paper(shop):
    shop.owner.put("/api/documents/branches/lusail", json=LUSAIL)
    main = issued(shop.owner, "receipt")
    lusail = issued(shop.owner, "receipt", branch="lusail")
    assert main["seller"]["address"] == "Old Airport Road, Doha"
    assert "branch" not in main["seller"]
    assert lusail["seller"]["address"] == "Marina Promenade, Lusail"
    assert lusail["seller"]["phone"] == "+974 5555 0300"
    assert lusail["seller"]["branch"] == {"key": "lusail", "name": "Lusail", "name_ar": "لوسيل"}
    assert lusail["seller"]["name"] == "Qirfa Bakery"  # the shop's name, the same
    text = page_text(shop.owner.get(f"/api/documents/{lusail['id']}/pdf").content)
    assert has_letters(text, "الفرع لوسيل")  # the Arabic page names it in Arabic
    english = issued(shop.owner, "receipt", branch="lusail", audience="business", languages="en")
    plain = page_text(shop.owner.get(f"/api/documents/{english['id']}/pdf").content)
    assert "Branch" in plain and "Lusail" in plain and "+974 5555 0300" in plain
    assert "Marina Promenade, Lusail" in plain
    assert "Branch" not in page_text(shop.owner.get(f"/api/documents/{main['id']}/pdf").content)
    # Changing the branch later does not change a paper already issued.
    shop.owner.put("/api/documents/branches/lusail", json={"phone": "+974 5555 0999"})
    again = shop.owner.get(f"/api/documents/{lusail['id']}").json()["document"]
    assert again["seller"]["phone"] == "+974 5555 0300"


def test_a_branch_must_exist_and_be_switched_on_for_a_new_draft(shop):
    unknown = shop.owner.post("/api/documents", json={"kind": "receipt", "branch": "nowhere"})
    assert (unknown.status_code, unknown.json()["code"]) == (422, "branch_unknown")
    shop.owner.put("/api/documents/branches/lusail", json=LUSAIL)
    draft = make_draft(shop.owner, branch="lusail")
    off = shop.owner.put("/api/documents/branches/lusail", json={"active": False})
    assert off.json()["branch"]["active"] is False
    refused = shop.owner.post("/api/documents", json={"kind": "receipt", "branch": "lusail"})
    assert refused.json()["code"] == "branch_unknown"
    # The draft that was made before cannot be issued from a branch that is off ...
    assert issue(shop.owner, draft["id"]).json()["code"] == "branch_unknown"
    # ... and switching it on again puts everything back.
    shop.owner.put("/api/documents/branches/lusail", json={"active": True})
    assert issue(shop.owner, draft["id"]).json()["document"]["number"] == "RCLUS-0001"


def test_a_credit_note_is_still_issued_from_a_branch_that_has_been_switched_off(shop):
    shop.owner.put("/api/documents/branches/lusail", json=LUSAIL)
    invoice = issued(shop.owner, "invoice", branch="lusail")
    shop.owner.put("/api/documents/branches/lusail", json={"active": False})
    credit = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note",
                             json={"reason": "The branch was closed"})
    assert credit.status_code == 201, credit.text
    assert credit.json()["document"]["number"] == "CNLUS-0001"
    assert credit.json()["document"]["branch"] == "lusail"


def test_branch_codes_are_checked_and_chosen_once(shop):
    for bad in ("", "toolong", "a-b", "x" * 5):
        answer = shop.owner.put("/api/documents/branches/shop2", json={**LUSAIL, "code": bad})
        assert answer.status_code in (422,), bad
    assert shop.owner.put("/api/documents/branches/lusail", json=LUSAIL).status_code == 200
    clash = shop.owner.put("/api/documents/branches/other", json={**LUSAIL, "code": "LUS"})
    assert (clash.status_code, clash.json()["code"]) == (409, "code_taken")
    changed = shop.owner.put("/api/documents/branches/lusail", json={"code": "ZZZ"})
    assert changed.status_code == 422
    # The main branch is the shop: no code, never off.
    assert shop.owner.put("/api/documents/branches/main", json={"active": False}).status_code == 422
    assert shop.owner.put("/api/documents/branches/main", json={"code": "MAIN"}).status_code == 422
    assert shop.owner.put("/api/documents/branches/BAD KEY", json=LUSAIL).status_code in (404, 422)


def test_only_owners_and_admins_set_up_branches_and_it_is_on_the_record(shop):
    assert shop.agent.put("/api/documents/branches/lusail", json=LUSAIL).status_code == 403
    assert shop.admin.put("/api/documents/branches/lusail", json=LUSAIL).status_code == 200
    rows = owner_sql("select action, actor_name from activity where tenant_id = $1 "
                     "and action like 'branch_%'", shop.tenant_id)
    assert [(r["action"], r["actor_name"]) for r in rows] == [("branch_added", "Admin")]


def test_two_branches_issue_at_the_same_moment_without_waiting_for_each_other(shop):
    shop.owner.put("/api/documents/branches/lusail", json=LUSAIL)
    drafts = [(make_draft(shop.owner, branch=b)["id"], b)
              for b in ("main", "lusail") for _ in range(6)]
    start = threading.Barrier(len(drafts))

    def go(item):
        draft_id, _ = item
        start.wait()
        return issue(shop.owner, draft_id, key=f"branch-{uuid4().hex}").status_code

    with ThreadPoolExecutor(len(drafts)) as pool:
        assert list(pool.map(go, drafts)) == [200] * 12
    assert sorted(numbers(shop, "receipt", "main")) == [f"RC-{i:04d}" for i in range(1, 7)]
    assert sorted(numbers(shop, "receipt", "lusail")) == [f"RCLUS-{i:04d}" for i in range(1, 7)]


def test_branches_are_private_to_their_shop(client_factory, monkeypatch):
    a = configured_shop(client_factory, monkeypatch)
    b = configured_shop(client_factory, monkeypatch)
    a.owner.put("/api/documents/branches/lusail", json=LUSAIL)
    assert [x["branch_key"] for x in b.owner.get("/api/documents/branches").json()["branches"]] \
        == ["main"]
    assert b.owner.post("/api/documents", json={"kind": "receipt", "branch": "lusail"}
                        ).json()["code"] == "branch_unknown"
    # The same code can be used by another shop.
    assert b.owner.put("/api/documents/branches/lusail", json=LUSAIL).status_code == 200

    async def see(conn):
        return await conn.fetchval("select count(*) from document_branches")

    assert as_app(b.tenant_id, see) == 2


def test_a_document_is_issued_only_from_its_own_branchs_series(shop):
    shop.owner.put("/api/documents/branches/lusail", json=LUSAIL)
    doc = issued(shop.owner, "receipt", branch="lusail")
    # A hand-written statement cannot move a draft to another series.
    draft = make_draft(shop.owner, "receipt", branch="lusail")
    error = refused_by_database(
        shop.tenant_id, "update documents set series_key = 'main' where id = $1::uuid",
        draft["id"])
    assert error is not None  # the series of a document is its branch's
    assert doc["number"].startswith("RCLUS-")


# ── cash rounding ─────────────────────────────────────────────────────────────────────────

ROUND_LINE = [{"description": "Cake", "description_ar": "كعكة", "quantity": "1",
               "unit_price_minor": 12702}]


def draft_with_total(shop, total: int, kind="receipt", **more):
    line = [{**ROUND_LINE[0], "unit_price_minor": total}]
    pay = [{"method": "cash", "amount_minor": more.pop("paid", total)}] if kind == "receipt" else []
    answer = shop.owner.post("/api/documents", json={
        "kind": kind, "customer": {"name": "Hamad"}, "lines": line, "payments": pay, **more})
    return answer


def test_cash_rounding_is_off_until_the_shop_turns_it_on_and_takes_certain_steps(shop):
    assert shop.owner.get("/api/documents/settings").json()["settings"]["cash_rounding_minor"] == 0
    draft = draft_with_total(shop, 12703).json()["document"]
    assert draft["totals"]["rounding_minor"] == 0 and draft["totals"]["total_minor"] == 12703
    for bad in (1, 3, 7, 20, 101, -5):
        answer = shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": bad})
        assert answer.status_code == 422, bad
    for good in (5, 10, 25, 50, 100, 0):
        assert shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": good}
                              ).status_code == 200
    assert shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": 5.0}
                          ).status_code == 422


@pytest.mark.parametrize("step,total,rounding", [
    (5, 12700, 0), (5, 12701, -1), (5, 12702, -2), (5, 12703, 2), (5, 12704, 1),
    (10, 12705, 5), (10, 12704, -4), (25, 12712, -12), (25, 12713, 12), (50, 12725, 25),
    (100, 12750, 50), (100, 12749, -49),
])
def test_the_difference_is_its_own_line_and_halves_go_up(shop, step, total, rounding):
    shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": step})
    body = draft_with_total(shop, total, kind="invoice").json()["document"]
    assert body["totals"]["rounding_minor"] == rounding
    assert body["totals"]["total_minor"] == total + rounding
    assert body["totals"]["gross_minor"] == total  # the lines are untouched
    assert body["lines"][0]["line_total_minor"] == total


def test_a_receipt_is_paid_at_the_rounded_total_and_says_rounding_on_its_page(shop):
    shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": 5})
    wrong = draft_with_total(shop, 12702, paid=12702)  # the exact amount: more than the total
    assert (wrong.status_code, wrong.json()["code"]) == (422, "overpaid")
    right = draft_with_total(shop, 12702, paid=12700).json()["document"]
    assert (right["totals"]["rounding_minor"], right["totals"]["total_minor"]) == (-2, 12700)
    done = issue(shop.owner, right["id"]).json()["document"]
    text = page_text(shop.owner.get(f"/api/documents/{done['id']}/pdf").content)
    assert "-0.02" in text and has_letters(text, "تقريب") and "127.00" in text
    # Up as well as down: a "+" sign.
    up = draft_with_total(shop, 12703, paid=12705).json()["document"]
    done = issue(shop.owner, up["id"]).json()["document"]
    assert "+0.02" in page_text(shop.owner.get(f"/api/documents/{done['id']}/pdf").content)


def test_only_the_kinds_paid_in_cash_are_rounded(shop):
    shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": 5})
    for kind, rounds in (("receipt", True), ("invoice", True), ("deposit_receipt", True),
                         ("quote", False), ("delivery_note", False), ("statement", False),
                         ("proforma", False)):
        answer = draft_with_total(shop, 12702, kind=kind, **({"paid": 12700} if kind == "receipt"
                                                           else {}))
        assert answer.status_code == 201, (kind, answer.text)
        assert (answer.json()["document"]["totals"]["rounding_minor"] == -2) == rounds, kind


def test_the_database_keeps_the_sum_with_the_rounding_in_it(shop):
    draft = draft_with_total(shop, 12700, kind="invoice").json()["document"]
    error = refused_by_database(
        shop.tenant_id, "update documents set rounding_minor = 3 where id = $1::uuid", draft["id"])
    assert error is not None and "check" in type(error).__name__.lower()
    error = refused_by_database(
        shop.tenant_id, "update documents set rounding_minor = 2000, total_minor = total_minor + "
        "2000 where id = $1::uuid", draft["id"])
    assert error is not None  # a rounding is a few units, never more than 1,000


def test_credit_notes_add_up_to_a_document_that_was_rounded(shop):
    shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": 5})
    invoice = draft_with_total(shop, 12703, kind="invoice").json()["document"]  # +2: 12705
    invoice = issue(shop.owner, invoice["id"]).json()["document"]
    assert invoice["totals"]["total_minor"] == 12705
    # The whole, in one: the credit note carries the same rounding and the invoice is void.
    full = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note", json={"reason": "Cancelled"})
    assert full.json()["document"]["totals"]["rounding_minor"] == 2
    assert full.json()["document"]["totals"]["total_minor"] == 12705
    assert shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]["status"] == "void"

    # In two parts: the first has no rounding, the second brings it with it.
    second = draft_with_total(shop, 12703, kind="invoice").json()["document"]
    second = issue(shop.owner, second["id"]).json()["document"]
    first = shop.owner.post(f"/api/documents/{second['id']}/credit-note", json={
        "reason": "Part returned", "lines": [{"description": "Part", "quantity": "1",
                                                "unit_price_minor": 5000}]}).json()["document"]
    assert (first["totals"]["rounding_minor"], first["totals"]["total_minor"]) == (0, 5000)
    assert shop.owner.get(f"/api/documents/{second['id']}").json()["document"]["status"] == "issued"
    last = shop.owner.post(f"/api/documents/{second['id']}/credit-note", json={
        "reason": "The rest", "lines": [{"description": "The rest", "quantity": "1",
                                          "unit_price_minor": 7703}]}).json()["document"]
    assert (last["totals"]["rounding_minor"], last["totals"]["total_minor"]) == (2, 7705)
    assert shop.owner.get(f"/api/documents/{second['id']}").json()["document"]["status"] == "void"
    # And never more than there was.
    third = draft_with_total(shop, 12703, kind="invoice").json()["document"]
    third = issue(shop.owner, third["id"]).json()["document"]
    over = shop.owner.post(f"/api/documents/{third['id']}/credit-note", json={
        "reason": "Too much", "lines": [{"description": "x", "quantity": "1",
                                          "unit_price_minor": 12706}]})
    assert over.status_code == 409 and over.json()["code"] == "credit_too_big"


def test_rounding_is_part_of_what_the_hash_covers(shop):
    shop.owner.put("/api/documents/settings", json={"cash_rounding_minor": 5})
    doc = issue(shop.owner, draft_with_total(shop, 12703, kind="invoice").json()["document"]["id"]
                ).json()["document"]
    assert shop.owner.get(f"/api/documents/{doc['id']}/verify").json()["ok"] is True
    assert doc["totals"]["rounding_minor"] == 2
