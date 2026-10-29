-- Payment accounts and provider webhooks (ALY-17, specs/033-payment-adapters).
--
-- A shop connects a payment account in its own name (D-044: ALYR never holds money). Its
-- keys are sealed by the API (AES-256-GCM, core/payment_keys.py) before they reach this
-- table, and wiped when the account is disconnected or replaced.

create table payment_accounts (
    id uuid primary key,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    provider text not null,
    status text not null default 'checking'
        check (status in ('checking', 'connected', 'failed', 'disconnected')),
    -- What went wrong, in a word the screen turns into a sentence: bad_keys, unavailable,
    -- keys_unreadable.
    problem text not null default '',
    sealed_keys bytea,
    -- The last four characters of the first secret field, so the owner can tell keys apart.
    key_hint text not null default '',
    created_by text not null default '',
    created_at timestamptz not null default now(),
    checked_at timestamptz,
    connected_at timestamptz,
    disconnected_at timestamptz,
    -- Disconnected keys are gone, not kept.
    check (status <> 'disconnected' or sealed_keys is null)
);
-- One account in use per shop at a time.
create unique index payment_accounts_one_in_use on payment_accounts (tenant_id)
    where status in ('checking', 'connected');

-- Every provider webhook accepted, once. The provider's word for what happened is kept as
-- the record; the payment itself changes only after ALYR has asked the provider (sync job).
create table payment_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    account_id uuid not null references payment_accounts(id),
    event_id text not null,
    provider_ref text not null,
    payment_id uuid references payment_requests(id) on delete set null,
    received_at timestamptz not null default now(),
    unique (account_id, event_id)
);

alter table payment_requests
    add column account_id uuid references payment_accounts(id),
    add column provider_ref text,
    add column checkout_url text,
    -- The provider's last word on this payment when it is not simply paid: failed,
    -- amount_mismatch. Read by the back office's exceptions queue (ALY-158).
    add column gateway_status text not null default '';
create unique index payment_requests_provider_ref on payment_requests (account_id, provider_ref)
    where provider_ref is not null;

do $$
declare t text;
begin
    foreach t in array array['payment_accounts', 'payment_events'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
        execute format('grant select, insert, update, delete on %I to alyr_app', t);
    end loop;
end $$;
