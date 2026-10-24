-- Monitoring (ALY-121, spec 022). Two small tables that belong to the platform, not to a shop,
-- and hold no customer data: when each background process last checked in, and which alerts are
-- firing so one problem sends one message, not one every minute.

-- One row per process: "worker" (the job runner) and "webhook" (the last Meta call accepted).
create table heartbeats (
    name text primary key,
    beat_at timestamptz not null default now(),
    started_at timestamptz not null default now()
);

-- One row per alert rule. `firing` is whether the problem is there now; `since` when it began;
-- `last_sent_at` when we last told a person (a reminder goes out every two hours while it lasts).
create table alert_state (
    key text primary key,
    firing boolean not null default false,
    since timestamptz,
    last_sent_at timestamptz,
    detail text not null default ''
);

grant select, insert, update on heartbeats, alert_state to alyr_app;
-- The readiness check compares the migrations on disk with the ones applied.
grant select on schema_migrations to alyr_app;
