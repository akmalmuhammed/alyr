-- Job queue and outbox (decision D-010). A job is written in the same transaction as the
-- data it belongs to, so a message and the job that sends it exist together or not at all.

create table jobs (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    kind text not null,
    payload jsonb not null default '{}',
    status text not null default 'queued'
        check (status in ('queued', 'running', 'done', 'failed')),
    attempts integer not null default 0,
    max_attempts integer not null default 6,
    run_at timestamptz not null default now(),
    locked_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    finished_at timestamptz
);
create index jobs_due on jobs (run_at) where status = 'queued';

alter table jobs enable row level security;
alter table jobs force row level security;
-- A tenant sees its own jobs. The worker, which serves every tenant, declares itself with
-- a transaction-local setting while it claims work, then does the work inside the
-- job's own tenant like any other code.
create policy tenant_isolation on jobs
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
           or current_setting('app.worker', true) = 'on')
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
                or current_setting('app.worker', true) = 'on');
grant select, insert, update, delete on jobs to alyr_app;

-- Where each message is on its way: queued here, sent to the channel, then whatever
-- the channel reports back.
alter table messages
    add column status text not null default 'queued'
        check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
    add column wa_message_id text,
    add column error text;
update messages set status = case when direction = 'in' then 'received' else 'sent' end;
create index messages_wa_id on messages (tenant_id, wa_message_id) where wa_message_id is not null;
