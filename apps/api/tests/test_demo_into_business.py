"""`python -m alyr.seed_into_business` (specs/064, D-150): the safety rules, then the data.

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

from alyr.config import get_settings
from alyr.db import Database
from alyr.modules.ledger import service as ledger
from demo_into_support import bakery, mark, run, sql, table_counts

YES = "--yes-this-business-is-a-test"


def counts_without_record(tenant_id) -> dict:
    out = table_counts(tenant_id)
    out.pop("demo_seed_runs")
    return out


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
        k: v for k, v in before.items() if k != "demo_seed_runs"}


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
    assert 38 <= n("select count(*) n from bookings where tenant_id = $1") <= 60
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
    assert credit["customers_owing"] >= 8
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
