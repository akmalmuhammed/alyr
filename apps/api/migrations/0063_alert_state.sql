-- Alert rules (ALY-121, spec 034, D-073). A platform table that holds no customer data: which
-- alerts are firing, so one problem sends one message, not one every minute. Whether the worker
-- is alive is `worker_heartbeats` (ALY-63) and the uptime checks on /health/worker, not this.

-- One row per alert rule. `firing` is whether the problem is there now; `since` when it began;
-- `last_sent_at` when we last told a person (a reminder goes out every two hours while it lasts).
create table alert_state (
    key text primary key,
    firing boolean not null default false,
    since timestamptz,
    last_sent_at timestamptz,
    detail text not null default ''
);

grant select, insert, update on alert_state to alyr_app;

-- The quiet-webhook rule asks when the last customer message was queued, once a minute. Jobs are
-- never deleted, so without this it would read the whole table each time.
create index jobs_kind_created on jobs (kind, created_at);
