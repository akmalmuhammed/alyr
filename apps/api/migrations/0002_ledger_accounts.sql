-- Chasing state per customer: a promise to pay pauses reminders, and the last reminder
-- time stops a shop from messaging the same customer too often.

create table ledger_accounts (
    contact_id uuid primary key references contacts(id) on delete cascade,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    promised_until date,
    last_reminded_at timestamptz,
    reminder_count integer not null default 0
);

alter table ledger_accounts enable row level security;
alter table ledger_accounts force row level security;
create policy tenant_isolation on ledger_accounts
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on ledger_accounts to alyr_app;
