"""Gapless numbering (ALY-138, spec 010): one counter per shop, kind and series, taken under a
row lock inside the issuing transaction.

The promise, in the order the tests keep it:
* numbers run 1, 2, 3 for each kind in each shop, with the prefix and year the shop chose;
* a failed issue gives its number back (it rolls back with everything else);
* many issues at the same moment never share a number and never leave a hole;
* and that last one is proved to be about the lock: with the lock taken out the same scenario
  breaks, so the test would catch anyone who removed it. (The database's unique index still
  stops a duplicate from being stored: the breakage shows as failed requests, not as two
  documents with one number.)
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from alyr.modules.documents import numbering, service
from concurrency import LockWatch, hold_open
from documents_support import (
    as_app,
    configured_shop,
    issue,
    issued,
    make_draft,
    refused_by_database,
)
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


def numbers(shop, kind=None) -> list[str]:
    rows = owner_sql(
        "select number from documents where tenant_id = $1 and number is not null "
        "and ($2::text is null or kind = $2) order by issued_at, seq", shop.tenant_id, kind,
    )
    return [r["number"] for r in rows]


def counter(shop, kind="receipt") -> int:
    return owner_sql("select last_number from document_series where tenant_id = $1 and kind = $2",
                     shop.tenant_id, kind)[0]["last_number"]


def at(year, month=6, day=1, hour=9):
    return lambda: datetime(year, month, day, hour, tzinfo=UTC)


# ── the order of things ───────────────────────────────────────────────────────────────────


def test_numbers_run_one_two_three_for_each_kind_on_its_own_counter(shop):
    for _ in range(3):
        issued(shop.owner, "receipt")
    for _ in range(2):
        issued(shop.owner, "invoice")
    issued(shop.owner, "quote")
    assert numbers(shop, "receipt") == ["RC-0001", "RC-0002", "RC-0003"]
    assert numbers(shop, "invoice") == ["INV-0001", "INV-0002"]
    assert numbers(shop, "quote") == ["QT-0001"]
    # The position in the series is stored beside the text, and it has no holes.
    seqs = [r["seq"] for r in owner_sql(
        "select seq from documents where tenant_id = $1 and kind = 'receipt' order by seq",
        shop.tenant_id)]
    assert seqs == [1, 2, 3]


def test_every_shop_counts_from_one_on_its_own(client_factory, monkeypatch):
    first = configured_shop(client_factory, monkeypatch)
    second = configured_shop(client_factory, monkeypatch)
    issued(first.owner)
    issued(first.owner)
    issued(second.owner)
    assert numbers(first) == ["RC-0001", "RC-0002"]
    assert numbers(second) == ["RC-0001"]


def test_a_draft_has_no_number_and_throwing_one_away_leaves_no_hole(shop):
    draft = make_draft(shop.owner)
    assert draft["number"] is None and counter(shop) == 0
    assert shop.owner.delete(f"/api/documents/{draft['id']}").status_code == 200
    assert issued(shop.owner)["number"] == "RC-0001"


def test_the_prefix_and_the_padding_are_the_shops_to_choose(shop):
    issued(shop.owner)
    answer = shop.owner.put("/api/documents/series/receipt/main", json={"prefix": "SALE", "pad": 6})
    assert answer.status_code == 200, answer.text
    assert answer.json()["series"]["prefix"] == "SALE"
    # The counter carries on; only the way it is written changed.
    assert issued(shop.owner)["number"] == "SALE-000002"
    # A prefix is capital letters and digits, and belongs to one series.
    refused = shop.owner.put("/api/documents/series/invoice/main", json={"prefix": "SALE"})
    assert (refused.status_code, refused.json()["code"]) == (409, "prefix_taken")
    bad = shop.owner.put("/api/documents/series/invoice/main", json={"prefix": "sale-1"})
    assert (bad.status_code, bad.json()["code"]) == (422, "prefix_invalid")
    assert shop.owner.put("/api/documents/series/receipt/nope", json={"pad": 3}).status_code == 404


def test_a_series_that_restarts_each_year_says_the_year_and_starts_again(shop, monkeypatch):
    shop.owner.put("/api/documents/series/invoice/main", json={"yearly_reset": True})
    monkeypatch.setattr(service, "_clock", at(2026, 6, 1))
    assert issued(shop.owner, "invoice")["number"] == "INV-2026-0001"
    assert issued(shop.owner, "invoice")["number"] == "INV-2026-0002"
    # A minute after midnight on New Year's Day in Doha (UTC+3) is still 31 December in UTC.
    monkeypatch.setattr(service, "_clock", lambda: datetime(2026, 12, 31, 21, 1, tzinfo=UTC))
    assert issued(shop.owner, "invoice")["number"] == "INV-2027-0001"
    assert issued(shop.owner, "invoice")["number"] == "INV-2027-0002"
    # The year only moves forward: an earlier date is refused, not numbered.
    monkeypatch.setattr(service, "_clock", at(2026, 6, 1))
    draft = make_draft(shop.owner, "invoice")
    answer = issue(shop.owner, draft["id"])
    assert (answer.status_code, answer.json()["code"]) == (409, "series_year_behind")
    assert numbers(shop, "invoice") == ["INV-2026-0001", "INV-2026-0002", "INV-2027-0001",
                                        "INV-2027-0002"]


def test_numbers_and_times_run_in_the_same_order(shop, monkeypatch):
    for hour in (9, 10, 11):
        monkeypatch.setattr(service, "_clock", at(2026, 6, 1, hour))
        issued(shop.owner)
    rows = owner_sql("select number, issued_at from documents where tenant_id = $1 order by seq",
                     shop.tenant_id)
    assert [r["issued_at"] for r in rows] == sorted(r["issued_at"] for r in rows)


# ── a failed issue gives its number back ──────────────────────────────────────────────────


def test_when_drawing_the_pdf_fails_the_number_goes_back(shop, monkeypatch):
    draft = make_draft(shop.owner)
    real = service.render_pdf

    async def broken(doc):
        raise RuntimeError("the PDF could not be drawn")

    monkeypatch.setattr(service, "render_pdf", broken)
    with pytest.raises(RuntimeError):
        issue(shop.owner, draft["id"])
    # Nothing was issued and nothing was counted.
    assert counter(shop) == 0 and numbers(shop) == []
    assert shop.owner.get(f"/api/documents/{draft['id']}").json()["document"]["status"] == "draft"
    monkeypatch.setattr(service, "render_pdf", real)
    assert issue(shop.owner, draft["id"]).json()["document"]["number"] == "RC-0001"


def test_when_a_step_after_the_number_fails_everything_rolls_back(shop, monkeypatch):
    """The last thing issuing does is write the activity record. If that fails the number, the
    PDF and the status all go back: the transaction is one piece."""
    draft = make_draft(shop.owner)
    real = service.team.record

    async def fail_on_issue(conn, subject, subject_id, action, *args, **kwargs):
        if action == "issued":
            raise RuntimeError("the record could not be written")
        return await real(conn, subject, subject_id, action, *args, **kwargs)

    monkeypatch.setattr(service.team, "record", fail_on_issue)
    with pytest.raises(RuntimeError):
        issue(shop.owner, draft["id"])
    monkeypatch.undo()
    assert counter(shop) == 0
    files = owner_sql("select count(*) as n from document_files where tenant_id = $1",
                      shop.tenant_id)[0]["n"]
    assert files == 0
    assert issue(shop.owner, draft["id"]).json()["document"]["number"] == "RC-0001"


def test_a_document_that_cannot_be_issued_never_takes_a_number(shop):
    draft = make_draft(shop.owner, "invoice", customer={})  # an invoice needs a customer
    answer = issue(shop.owner, draft["id"])
    assert (answer.status_code, answer.json()["code"]) == (422, "customer_needed")
    assert counter(shop, "invoice") == 0


# ── many at the same moment ───────────────────────────────────────────────────────────────


def parallel_issue(shop, count: int):
    """Make `count` drafts, then issue them all at the same moment. Returns the results:
    (status code, number) for those that answered, and the exceptions of those that crashed."""
    drafts = [make_draft(shop.owner)["id"] for _ in range(count)]
    start = threading.Barrier(count)

    def go(draft_id):
        start.wait()
        try:
            answer = issue(shop.owner, draft_id, key=f"parallel-{uuid4().hex}")
            body = answer.json()
            return answer.status_code, (body.get("document") or {}).get("number")
        except Exception as error:  # noqa: BLE001 - a crashed request is part of the result
            return "crashed", error

    with ThreadPoolExecutor(count) as pool:
        return list(pool.map(go, drafts))


def expected(count: int) -> list[str]:
    return [f"RC-{i:04d}" for i in range(1, count + 1)]


def test_twenty_issues_at_once_get_twenty_numbers_with_no_duplicate_and_no_gap(shop, monkeypatch):
    hold_open(monkeypatch, numbering, "allocate", 0.04)  # whoever has the number keeps it a moment
    with LockWatch("document_series") as watch:
        results = parallel_issue(shop, 20)
    assert [code for code, _ in results] == [200] * 20
    assert watch.blocked >= 1, f"the requests never met at the counter: {watch}"
    got = sorted(number for _, number in results)
    assert got == expected(20)
    assert numbers(shop) == expected(20)
    assert counter(shop) == 20


def test_some_failing_while_others_issue_still_leaves_no_gap(shop, monkeypatch):
    """A third of the requests fail after they hold a number. Their numbers go back, and the
    ones that succeed are numbered one after the other, with nothing missing."""
    hold_open(monkeypatch, numbering, "allocate", 0.03)
    real = service.render_pdf
    calls = {"n": 0}
    lock = threading.Lock()

    async def sometimes_broken(doc):
        with lock:
            calls["n"] += 1
            mine = calls["n"]
        if mine % 3 == 0:
            raise RuntimeError("drawing failed")
        return await real(doc)

    monkeypatch.setattr(service, "render_pdf", sometimes_broken)
    with LockWatch("document_series") as watch:
        results = parallel_issue(shop, 15)
    crashed = [r for r in results if r[0] == "crashed"]
    done = sorted(number for code, number in results if code == 200)
    assert len(crashed) == 5 and len(done) == 10, results
    assert done == expected(10), f"holes or repeats: {done}"
    assert numbers(shop) == expected(10) and counter(shop) == 10
    assert watch.blocked >= 1, str(watch)


def test_the_same_scenario_breaks_when_the_row_lock_is_taken_out(shop, monkeypatch):
    """Proof that the two tests above are about the lock. The statement that takes the number
    is the same except that it no longer locks the counter's row; the same requests now read
    the same counter, write the same number, and the database's unique index refuses the second
    document. The result is no longer twenty clean numbers."""
    unlocked = numbering.LOCK_SERIES.replace(" for update", "")
    assert unlocked != numbering.LOCK_SERIES
    monkeypatch.setattr(numbering, "LOCK_SERIES", unlocked)
    hold_open(monkeypatch, numbering, "allocate", 0.04)
    results = parallel_issue(shop, 12)
    ok = [number for code, number in results if code == 200]
    assert len(ok) < 12 or sorted(ok) != expected(12), (
        f"nothing went wrong without the lock, so the test above proves nothing: {results}")
    # Whatever was stored, the database never holds two documents with one number.
    stored = numbers(shop)
    assert len(stored) == len(set(stored))


# ── the counter cannot be moved by hand ───────────────────────────────────────────────────


def test_the_application_cannot_wind_the_counter_back_or_skip_ahead(shop):
    issued(shop.owner)
    issued(shop.owner)
    wind_back = refused_by_database(
        shop.tenant_id, "update document_series set last_number = 0 where kind = 'receipt'")
    skip = refused_by_database(
        shop.tenant_id, "update document_series set last_number = last_number + 2 "
        "where kind = 'receipt'")
    assert "count up by one" in str(wind_back) and "count up by one" in str(skip)
    assert counter(shop) == 2
    # Writing the prefix is allowed; the counter is untouched.
    assert refused_by_database(
        shop.tenant_id, "update document_series set prefix = 'RX' where kind = 'receipt'") is None
    # And a series cannot be turned into another kind's.
    changed = refused_by_database(
        shop.tenant_id, "update document_series set kind = 'invoice' where kind = 'receipt'")
    assert changed is not None


def test_a_document_cannot_be_issued_with_a_number_the_counter_did_not_give(shop):
    """Even a hand-written UPDATE that numbers a draft is refused: the number has to be the
    counter's current value, and the counter only moves when something is issued."""
    draft = make_draft(shop.owner)

    async def work(conn):
        try:
            async with conn.transaction():
                await conn.execute(
                    "insert into document_files (document_id, content, sha256, bytes) "
                    "values ($1, 'x'::bytea, repeat('a', 64), 1)", UUID(draft["id"]))
                await conn.execute(
                    "update documents set status = 'issued', series_key = 'main', "
                    "number = 'RC-0099', seq = 99, issued_at = now(), issue_date = current_date, "
                    "hash_version = 1, content_hash = repeat('b', 64), pdf_sha256 = repeat('a', 64), "
                    "seller = '{}'::jsonb where id = $1", UUID(draft["id"]))
        except Exception as error:  # noqa: BLE001
            return error

    error = as_app(shop.tenant_id, work)
    assert error is not None and "not taken from its series" in str(error)
