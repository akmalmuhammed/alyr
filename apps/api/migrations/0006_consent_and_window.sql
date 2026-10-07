-- Meta's rules, enforced in the outbound layer (decision D-020):
--   * free-form messages only inside 24 hours of the customer's last message
--   * business-started messages (templates) only to customers who agreed
--   * a customer who says stop is not messaged again until they say start

alter table contacts
    add column last_inbound_at timestamptz,
    add column consent_service text not null default 'unknown'
        check (consent_service in ('unknown', 'granted', 'revoked')),
    add column consent_marketing text not null default 'unknown'
        check (consent_marketing in ('unknown', 'granted', 'revoked'));

-- The record of how and when each customer agreed or withdrew. Append-only: the app
-- may add rows and read them, never change or remove them.
create table consents (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    purpose text not null check (purpose in ('service', 'marketing')),
    status text not null check (status in ('granted', 'revoked')),
    source text not null,
    wording text not null default '',
    created_at timestamptz not null default clock_timestamp()
);
create index consents_contact on consents (tenant_id, contact_id, created_at);

alter table consents enable row level security;
alter table consents force row level security;
create policy tenant_isolation on consents
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert on consents to alyr_app;

-- A message the outbound layer refused to send is kept, marked blocked, with the reason.
alter table messages drop constraint messages_status_check;
alter table messages add constraint messages_status_check
    check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'blocked'));
