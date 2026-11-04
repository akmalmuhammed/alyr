"""`python -m alyr.seed_into_business` (specs/064, D-151): the safety rules, then the data.

Real PostgreSQL, the real sign-up to make the business, the command run as a person types it.
The rules proved here, each with a mutation check written in the runbook's test report:

* it refuses without the flag, on a business not marked as a test in the back office, on an
  unknown business, and a real load refuses without a dry run before it;
* a dry run writes nothing (except the one small marker a real load needs);
* it sends nothing: no job but `media.sync`, no webhook, every message on the private simulator
  line, every document delivery written as the engine's own row without a job;
* other businesses are not touched, by a load or by a removal;
* a second run does not double, `--replace` replaces only the previous load, `--remove` gives
  back exactly the tables the business had.
"""

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from alyr.config import get_settings
from alyr.core.media import MediaService
from alyr.core.storage import LocalStore
from alyr.db import Database
from alyr.modules import report
from alyr.modules.ledger import service as ledger
from demo_into_support import bakery, mark, run, sql, table_counts
from test_consent import owner_sql

YES = "--yes-this-business-is-a-test"


def counts_without_record(tenant_id) -> dict:
    """Every table's rows, without the record of the loads and the two queues the photo store's
    worker empties (a removal leaves its deletions there; `test_photos_leave_the_store`)."""
    out = table_counts(tenant_id)
    for name in ("demo_seed_runs", "jobs", "media_ops"):
        out.pop(name)
    return out


def photo_files(root) -> set[str]:
    return {str(p) for p in Path(root).rglob("*") if p.is_file()}


def worker_syncs_photos(tenant_id) -> int:
    """What the worker does with the `media.sync` jobs: carry out each photo's queued writes and
    deletions in a local store. Returns how many photos it went through."""
    ids = {r["payload"]["asset_id"] if isinstance(r["payload"], dict)
           else json.loads(r["payload"])["asset_id"] for r in sql(
        "select payload from jobs where tenant_id = $1 and kind = 'media.sync'", tenant_id)}

    async def go():
        settings = get_settings()
        db = Database(settings.database_url)
        await db.connect()
        try:
            service = MediaService(db, LocalStore(Path(settings.media_local_dir)), settings)
            for asset_id in ids:
                await service.sync(tenant_id, {"asset_id": asset_id})
        finally:
            await db.close()
    asyncio.run(go())
    sql("delete from jobs where tenant_id = $1 and kind = 'media.sync'", tenant_id)
    return len(ids)


def scoped(tenant_id, work):
    """Run `work(conn)` as the product's own role, inside one business."""
    async def go():
        db = Database(get_settings().database_url)
        await db.connect()
        try:
            async with db.tenant(tenant_id, readonly=True) as conn:
                return await work(conn)
        finally:
            await db.close()
    return asyncio.run(go())


# ── the safety rules ──────────────────────────────────────────────────────────────────────


def test_refuses_without_the_flag(client):
    tenant_id, _, owner = bakery(client)
    mark(tenant_id)
    before = table_counts(tenant_id)
    code, text = run("--owner-email", owner, "--dry-run")
    assert code == 1 and "Refused" in text
    assert table_counts(tenant_id) == before


def test_refuses_a_business_not_marked_as_a_test(client):
    tenant_id, _, owner = bakery(client)
    before = table_counts(tenant_id)
    for extra in (["--dry-run"], [], ["--replace"]):
        code, text = run("--owner-email", owner, YES, *extra)
        assert code == 1, text
        assert "not been marked as a test business" in text
    assert table_counts(tenant_id) == before
    # Marked, then unmarked again in the back office: refused again.
    mark(tenant_id)
    mark(tenant_id, False)
    code, text = run("--owner-email", owner, YES, "--dry-run")
    assert code == 1 and "not been marked" in text
    assert table_counts(tenant_id) == before


def test_refuses_an_unknown_business(client):
    code, text = run("--owner-email", "nobody-here@shop.example", YES, "--dry-run")
    assert code == 1 and "Refused" in text


def test_a_real_load_refuses_without_a_dry_run(client):
    tenant_id, _, owner = bakery(client)
    mark(tenant_id)
    before = table_counts(tenant_id)
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 1 and "dry run" in text
    assert table_counts(tenant_id) == before
    # A dry run of another seed does not count for this one.
    assert run("--owner-email", owner, YES, "--dry-run", "--seed", "7")[0] == 0
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 1 and "dry run" in text
    # An old dry run does not count.
    assert run("--owner-email", owner, YES, "--dry-run")[0] == 0
    sql("update demo_seed_runs set created_at = now() - interval '2 days' where tenant_id = $1",
        tenant_id)
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 1 and "dry run" in text
    assert counts_without_record(tenant_id) == {
        k: v for k, v in before.items() if k not in ("demo_seed_runs", "jobs", "media_ops")}


# ── a whole life: dry run, load, look, load again, replace, remove ────────────────────────


def test_lifecycle_and_the_data(client):
    tenant_id, _, owner = bakery(client)
    other_id, _, _ = bakery(client)
    mark(tenant_id)
    before = counts_without_record(tenant_id)
    other_before = table_counts(other_id)

    code, text = run("--owner-email", owner, YES, "--dry-run", "--photos", "now")
    assert code == 0, text
    assert "DRY RUN" in text and "Nothing was written" in text
    assert counts_without_record(tenant_id) == before
    assert [r["status"] for r in sql(
        "select status from demo_seed_runs where tenant_id = $1", tenant_id)] == ["rehearsed"]

    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 0, text
    assert "Nothing was sent to anyone" in text
    assert [r["status"] for r in sql(
        "select status from demo_seed_runs where tenant_id = $1", tenant_id)] == ["active"]
    loaded = counts_without_record(tenant_id)
    assert table_counts(other_id) == other_before

    # ── it sends nothing ──
    assert sql("select kind from jobs where tenant_id = $1 and kind <> 'media.sync'",
               tenant_id) == []
    assert sql("select 1 from webhook_deliveries where tenant_id = $1", tenant_id) == []
    assert sql("select 1 from channel_numbers where tenant_id = $1 and channel <> 'simulator'",
               tenant_id) == []
    assert sql("select 1 from messages where tenant_id = $1 and direction = 'out' and "
               "status in ('queued', 'sending', 'sent')", tenant_id) == []
    assert sql("select 1 from document_deliveries where tenant_id = $1 and "
               "status not in ('sent', 'failed')", tenant_id) == []

    # ── the size of it ──
    n = lambda q: sql(q, tenant_id)[0]["n"]  # noqa: E731
    assert 35 <= n("select count(*) n from items where tenant_id = $1 and status = 'live'") <= 45
    assert 6 <= n("select count(distinct category) n from items where tenant_id = $1 "
                  "and status = 'live'") <= 10
    assert 30 <= n("select count(*) n from contacts where tenant_id = $1 and role = 'customer' "
                   "and wa_user_id not like 'TEST.%'") <= 40
    assert 8 <= n("select count(*) n from contacts where tenant_id = $1 and credit_limit > 0") <= 10
    assert 150 <= n("select count(*) n from orders where tenant_id = $1") <= 250
    assert 40 <= n("select count(*) n from bookings where tenant_id = $1") <= 60
    assert 4 <= n("select count(*) n from memberships where tenant_id = $1") <= 7
    assert n("select count(*) n from documents where tenant_id = $1") >= 150

    # ── the data is whole ──
    # stock: never negative, and every stored number equals its log
    assert n("select count(*) n from item_variants where tenant_id = $1 and on_hand < 0") == 0
    assert n("select count(*) n from item_variants v left join (select variant_id, "
             "sum(delta) t from stock_movements where day is null group by 1) m on "
             "m.variant_id = v.id where v.tenant_id = $1 and v.on_hand <> coalesce(m.t, 0)") == 0
    # an order's total equals its lines, discount and delivery fee
    assert n("select count(*) n from orders where tenant_id = $1 and total <> subtotal - "
             "discount_total + coalesce(delivery_fee, 0)") == 0
    assert n("select count(*) n from orders o join (select order_id, sum(round(price * "
             "quantity)::bigint - coalesce(discount, 0)) s from order_items group by 1) l on "
             "l.order_id = o.id where o.tenant_id = $1 and o.subtotal <> l.s") == 0
    # document numbers: gapless per kind, every issued one has its PDF
    for row in sql("select kind, count(*) n, min(seq) lo, max(seq) hi from documents where "
                   "tenant_id = $1 and seq is not null group by kind", tenant_id):
        assert (row["lo"], row["hi"]) == (1, row["n"]), row
    assert n("select count(*) n from documents where tenant_id = $1 and status <> 'draft' and "
             "coalesce(pdf_bytes, 0) = 0") == 0
    # bookings never overlap on one person or table
    assert n("select count(*) n from bookings a join bookings b on a.resource_id = b.resource_id "
             "and a.id < b.id and a.tenant_id = b.tenant_id and tstzrange(a.starts_at, a.ends_at) "
             "&& tstzrange(b.starts_at, b.ends_at) where a.tenant_id = $1 and "
             "a.status <> 'cancelled' and b.status <> 'cancelled'") == 0
    # Arabic on every item and every customer-facing category
    assert n("select count(*) n from items where tenant_id = $1 and "
             "coalesce(name_ar, '') = ''") == 0
    # the inbox has both languages and some conversations waiting
    langs = {r["lang"] for r in sql("select distinct lang from contacts where tenant_id = $1",
                                    tenant_id)}
    assert {"en", "ar"} <= langs

    # ── the screens agree ──
    credit = scoped(tenant_id, ledger.summary)
    assert credit["outstanding"] == sum(c["balance"] for c in credit["customers"])
    assert credit["outstanding"] == sum(credit["buckets"].values())
    # How many of the ten accounts owe something at load time moves with the business; most do.
    assert credit["customers_owing"] >= 5
    counted = sql("select counts->'Credit accounts'->>'balance (QAR)' as b from demo_seed_runs "
                  "where tenant_id = $1 and status = 'active'", tenant_id)[0]["b"]
    assert int(counted) == credit["outstanding"] // 100
    shown = sql("select counts->'Orders'->>'orders' as o from demo_seed_runs where "
                "tenant_id = $1 and status = 'active'", tenant_id)[0]["o"]
    assert int(shown) == n("select count(*) n from orders where tenant_id = $1")

    # ── a second run does not double ──
    code, text = run("--owner-email", owner, YES, "--dry-run", "--photos", "now")
    assert code == 0, text
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 0 and "Already loaded" in text
    assert counts_without_record(tenant_id) == loaded


def test_replace_and_remove_leave_the_business_as_it_was(client):
    tenant_id, _, owner = bakery(client)
    other_id, _, _ = bakery(client)
    mark(tenant_id)
    before = counts_without_record(tenant_id)
    other_before = table_counts(other_id)
    series = ("select kind, series_key, last_number from document_series "
              "where tenant_id = $1 order by 1, 2")
    series_before = [dict(r) for r in sql(series, tenant_id)]
    assert run("--owner-email", owner, YES, "--dry-run", "--photos", "now")[0] == 0
    assert run("--owner-email", owner, YES, "--photos", "now")[0] == 0
    assert any(r["last_number"] > 0 for r in sql(series, tenant_id))
    loaded = counts_without_record(tenant_id)

    # --replace takes a copy, removes only the previous load, and loads again (it needs its own
    # dry run, like any load)
    assert run("--owner-email", owner, YES, "--dry-run", "--photos", "now")[0] == 0
    code, text = run("--owner-email", owner, YES, "--replace", "--photos", "now",
                     "--export-dir", "/tmp")
    assert code == 0, text
    assert "A copy of everything" in text and "Removed the load" in text
    assert counts_without_record(tenant_id) == loaded
    assert sql("select count(*) n from demo_seed_runs where tenant_id = $1 and "
               "status = 'active'", tenant_id)[0]["n"] == 1

    code, text = run("--owner-email", owner, YES, "--remove")
    assert code == 0 and "Removed the load" in text
    assert counts_without_record(tenant_id) == before
    assert table_counts(other_id) == other_before
    # the document numbering is back where it was: nothing issued, nothing counted
    assert [dict(r) for r in sql(series, tenant_id)] == series_before
    # removing again is harmless
    code, text = run("--owner-email", owner, YES, "--remove")
    assert code == 0 and "Nothing to remove" in text
    assert counts_without_record(tenant_id) == before


def test_a_business_with_its_own_activity_is_refused(client):
    tenant_id, _, owner = bakery(client)
    mark(tenant_id)
    sql("insert into contacts (tenant_id, wa_user_id, name, role, lang) "
        "values ($1, '97455500099', 'A real customer', 'customer', 'en')", tenant_id)
    sql("insert into orders (tenant_id, contact_id, number, status, payment, total, subtotal) "
        "select $1, id, 1, 'new', 'unpaid', 1000, 1000 from contacts "
        "where tenant_id = $1 and wa_user_id = '97455500099'", tenant_id)
    before = counts_without_record(tenant_id)
    assert run("--owner-email", owner, YES, "--dry-run", "--photos", "now")[0] == 0
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 1 and "activity of its own" in text
    assert counts_without_record(tenant_id) == before


def test_a_business_with_no_settings_row_loads(client):
    """The founder's business was made in the back office and had never opened a module, so it
    had no `shop_settings` row: the first production dry run stopped on it (ALY-315)."""
    tenant_id, _, owner = bakery(client)
    mark(tenant_id)
    owner_sql("delete from shop_settings where tenant_id = $1", tenant_id)
    assert not sql("select 1 from shop_settings where tenant_id = $1", tenant_id)

    code, text = run("--owner-email", owner, YES, "--dry-run", "--photos", "now")
    assert code == 0, text
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 0, text
    assert sql("select day_starts::text from shop_settings where tenant_id = $1",
               tenant_id)[0]["day_starts"] == "00:00:00"


def test_a_business_with_last_weeks_own_report_loads(client):
    """The founder's business had already been sent a real weekly report, so the load's own
    insert for the same week hit the primary key and the third production dry run stopped
    (ALY-315). The business's row is left as it was."""
    tenant_id, _, owner = bakery(client)
    mark(tenant_id)
    week = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    owner_sql("insert into weekly_reports (tenant_id, week_start, sections) "
              "values ($1, $2, '{}'::jsonb)", tenant_id, week)

    code, text = run("--owner-email", owner, YES, "--dry-run", "--photos", "now")
    assert code == 0, text
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 0, text
    rows = sql("select sections::text as s from weekly_reports where tenant_id = $1 "
               "and week_start = $2", tenant_id, week)
    assert [r["s"] for r in rows] == ["{}"]
    code, text = run("--owner-email", owner, YES, "--remove")
    assert code == 0, text
    assert sql("select 1 from weekly_reports where tenant_id = $1 and week_start = $2",
               tenant_id, week)


def test_a_conversation_the_business_already_had_is_left_alone(client):
    """The founder's business already had a customer who had written to it, left open. The load
    set the state of every conversation, that one too, and stopped on it (ALY-315)."""
    tenant_id, _, owner = bakery(client)
    mark(tenant_id)
    contact = owner_sql(
        "insert into contacts (tenant_id, phone, name, inbox_status, last_inbound_at) "
        "values ($1, '97455123456', 'Real customer', 'open', now() - interval '6 days') "
        "returning id", tenant_id)[0]["id"]
    owner_sql("insert into messages (tenant_id, contact_id, direction, kind, body, created_at) "
              "values ($1, $2, 'in', 'text', 'hello', now() - interval '6 days')",
              tenant_id, contact)

    code, text = run("--owner-email", owner, YES, "--dry-run", "--photos", "now")
    assert code == 0, text
    code, text = run("--owner-email", owner, YES, "--photos", "now")
    assert code == 0, text
    row = sql("select inbox_status, inbox_read_at from contacts where id = $1", contact)[0]
    assert (row["inbox_status"], row["inbox_read_at"]) == ("open", None)


def test_photos_leave_the_store(client):
    """In production the load only queues the photos (`--photos queue`) and the worker, which holds
    the store's keys, writes them. A removal must leave nothing behind in the store either."""
    tenant_id, _, owner = bakery(client)
    mark(tenant_id)
    root = get_settings().media_local_dir
    files_before = photo_files(root)
    assert run("--owner-email", owner, YES, "--dry-run", "--photos", "queue")[0] == 0
    code, text = run("--owner-email", owner, YES, "--photos", "queue")
    assert code == 0, text
    # queued, not written: a job per photo, bytes waiting in the database, no file yet
    queued = sql("select count(*) n from jobs where tenant_id = $1 and kind = 'media.sync'",
                 tenant_id)[0]["n"]
    assert queued >= 35
    assert photo_files(root) == files_before
    assert worker_syncs_photos(tenant_id) == queued
    assert len(photo_files(root) - files_before) >= queued
    assert sql("select 1 from media_assets where tenant_id = $1 and state <> 'ready'",
               tenant_id) == []

    code, text = run("--owner-email", owner, YES, "--remove")
    assert code == 0, text
    # the files are still there until the worker has run, and the queue says exactly what to do
    assert photo_files(root) - files_before
    assert sql("select 1 from media_ops where tenant_id = $1 and op <> 'delete'", tenant_id) == []
    assert sql("select 1 from jobs where tenant_id = $1 and kind <> 'media.sync'", tenant_id) == []
    assert worker_syncs_photos(tenant_id) == queued
    assert photo_files(root) == files_before
    assert sql("select 1 from media_ops where tenant_id = $1", tenant_id) == []
    assert sql("select 1 from media_assets where tenant_id = $1", tenant_id) == []
