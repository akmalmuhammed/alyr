"""How long the working copies are kept (go-live checklist item 19, ALY-119, D-075, specs/038).
Real PostgreSQL; the purge is the one the worker runs once a day."""

import json

from alyr.core import retention
from alyr.seed import DEMO_TENANT_ID
from test_consent import owner_sql


def a_job(tenant, status, days_ago, note):
    return owner_sql(
        "insert into jobs (tenant_id, kind, payload, status, created_at, finished_at) values "
        "($1, 'inbound', $2, $3, now() - make_interval(days => $4), "
        "case when $3 in ('done', 'failed') then now() - make_interval(days => $4) end) "
        "returning id",
        tenant, json.dumps({"from_number": "97455512345", "text": note}), status, days_ago,
    )[0]["id"]


def a_handled_message(tenant, days_ago):
    wamid = f"wamid.retention-{tenant}-{days_ago}"
    owner_sql(
        "insert into processed_messages (tenant_id, message_id, created_at) "
        "values ($1, $2, now() - make_interval(days => $3))", tenant, wamid, days_ago,
    )
    return wamid


def still_there(job_ids):
    rows = owner_sql("select id from jobs where id = any($1::uuid[])", job_ids)
    return {r["id"] for r in rows}


def test_finished_jobs_and_handled_message_ids_go_when_their_time_is_up(client):
    other = owner_sql("insert into tenants (name) values ('Other shop') returning id")[0]["id"]
    gone = [
        a_job(DEMO_TENANT_ID, "done", 31, "Hello, I am Mariam"),
        a_job(DEMO_TENANT_ID, "failed", 91, "Do you deliver to Al Waab?"),
        a_job(other, "done", 40, "Every business, not only the one in front of us"),
    ]
    kept = [
        a_job(DEMO_TENANT_ID, "done", 29, "Still in its 30 days"),
        a_job(DEMO_TENANT_ID, "failed", 89, "Can still be sent round again"),
        a_job(DEMO_TENANT_ID, "queued", 200, "Waiting: never purged"),
        a_job(DEMO_TENANT_ID, "running", 200, "Running: never purged"),
    ]
    old_id = a_handled_message(DEMO_TENANT_ID, 31)
    new_id = a_handled_message(DEMO_TENANT_ID, 2)

    purged = client.portal.call(retention.purge, client.app.state.db)

    assert still_there(gone + kept) == set(kept)
    assert purged["jobs"] >= len(gone) and purged["seen"] >= 1
    handled = {r["message_id"] for r in owner_sql(
        "select message_id from processed_messages where message_id = any($1::text[])",
        [old_id, new_id],
    )}
    assert handled == {new_id}
    # A second pass finds nothing more to do.
    assert client.portal.call(retention.purge, client.app.state.db) == {"jobs": 0, "seen": 0}


def test_a_parked_job_can_be_seen_and_sent_again_until_it_goes(client):
    kept = a_job(DEMO_TENANT_ID, "failed", 60, "Not sent, still on the list")
    listed = client.get("/api/jobs/failed").json()["jobs"]
    assert str(kept) in {j["id"] for j in listed}
    client.portal.call(retention.purge, client.app.state.db)
    assert still_there([kept]) == {kept}
