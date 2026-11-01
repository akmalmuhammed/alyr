import time

from demo_into_support import bakery, mark, run, sql, table_counts


def test_smoke(client):
    tenant_id, slug, owner = bakery(client)
    mark(tenant_id)
    before = table_counts(tenant_id)
    started = time.time()
    code, text = run("--owner-email", owner, "--yes-this-business-is-a-test", "--dry-run",
                     "--photos", "now")
    print(text)
    print("DRY RUN SECONDS", time.time() - started)
    assert code == 0, text
    assert table_counts(tenant_id) == before
    started = time.time()
    code, text = run("--owner-email", owner, "--yes-this-business-is-a-test", "--photos", "now")
    print(text)
    print("REAL RUN SECONDS", time.time() - started)
    assert code == 0, text
    code, text = run("--owner-email", owner, "--yes-this-business-is-a-test", "--remove")
    print(text)
    assert code == 0, text
    after = table_counts(tenant_id)
    # The record of the load stays as history, marked removed; everything else is as it was.
    assert after.pop("demo_seed_runs") == before["demo_seed_runs"] + 1
    assert after == {k: v for k, v in before.items() if k != "demo_seed_runs"}
    status = sql("select status from demo_seed_runs where tenant_id = $1", tenant_id)
    assert [r["status"] for r in status] == ["removed"]
