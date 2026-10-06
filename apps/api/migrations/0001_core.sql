-- Core tables. Every tenant-owned table gets tenant_id, a default that reads the
-- request's tenant, and a forced Row-Level Security policy. The application connects
-- as alyr_app, which owns nothing and cannot bypass RLS.

create table tenants (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    name_ar text not null default '',
    created_at timestamptz not null default now()
);

-- Looked up before the tenant is known, so it is global and read-only to the app.
create table channel_numbers (
    number_id text primary key,
    tenant_id uuid not null references tenants(id),
    channel text not null check (channel in ('meta', 'simulator'))
);

create table tenant_modules (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    module_key text not null,
    enabled boolean not null default true,
    config jsonb not null default '{}',
    primary key (tenant_id, module_key)
);

create table contacts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    phone text not null,
    name text not null,
    role text not null default 'customer' check (role in ('customer', 'staff')),
    lang text not null default 'en' check (lang in ('en', 'ar')),
    credit_limit bigint not null default 0,
    -- Which of the shop's numbers this contact talks to. Replies and reminders use it.
    number_id text,
    created_at timestamptz not null default now(),
    unique (tenant_id, phone)
);

-- Amounts are dirhams (1 QAR = 100). Sales and payments are positive; adjustments are signed.
create table ledger_entries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id),
    kind text not null check (kind in ('sale', 'payment', 'adjustment')),
    amount bigint not null check (kind = 'adjustment' or amount > 0),
    note text not null default '',
    created_by text not null default '',
    created_at timestamptz not null default now()
);
create index ledger_entries_contact on ledger_entries (tenant_id, contact_id, created_at);

-- A request for payment. Alyr stores the reference and status only; the gateway holds the money.
create table payment_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id),
    amount bigint not null check (amount > 0),
    status text not null default 'pending' check (status in ('pending', 'paid')),
    provider text not null default 'standin',
    created_at timestamptz not null default now(),
    paid_at timestamptz
);

create table messages (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    phone text not null,
    direction text not null check (direction in ('in', 'out')),
    kind text not null,
    body text not null default '',
    payload jsonb not null default '{}',
    -- clock_timestamp, not now(): a message and its reply share one transaction and
    -- must still sort in the order they happened.
    created_at timestamptz not null default clock_timestamp()
);
create index messages_phone on messages (tenant_id, phone, created_at);

create table processed_messages (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    message_id text not null,
    created_at timestamptz not null default now(),
    primary key (tenant_id, message_id)
);

do $$
declare t text;
begin
    foreach t in array array[
        'tenant_modules', 'contacts', 'ledger_entries', 'payment_requests',
        'messages', 'processed_messages'
    ] loop
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

grant usage on schema public to alyr_app;
grant select on tenants, channel_numbers to alyr_app;
