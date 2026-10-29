-- The background worker checks in here (ALY-63). A worker that hangs or dies stops
-- checking in, and /health/worker turns red, so a missed reminder is noticed within
-- minutes instead of by a customer. One row per worker process; it belongs to ALYR,
-- not to a shop, so it has no tenant and no row-level security.

create table worker_heartbeats (
    worker text primary key,
    started_at timestamptz not null,
    beat_at timestamptz not null
);

grant select, insert, update, delete on worker_heartbeats to alyr_app;
