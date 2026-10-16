-- Who is handling what (D-028): one person responsible for every order, booking and
-- credit account, a record of what each person did, and why a conversation was closed.

-- One person responsible. Conversations already have one (contacts.assigned_to, 0009).
alter table orders add column assigned_to uuid references users(id) on delete set null;
alter table bookings add column assigned_to uuid references users(id) on delete set null;
-- Who follows up a customer's credit account.
alter table ledger_accounts add column assigned_to uuid references users(id) on delete set null;

-- The person behind a staff reply, so reply times belong to someone even if they rename
-- themselves. `sent_by` keeps the name shown in the thread.
alter table messages add column sent_by_user uuid references users(id) on delete set null;

-- A shop's own preferences. `tenants` is shared and read-only to the app, so settings a
-- shop can change live in a table row-level security protects.
create table shop_settings (
    tenant_id uuid primary key default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- Staff replies signed with the sender's first name.
    sign_replies boolean not null default false
);

-- What happened, by whom. Rows are added and read, never changed or removed: this is
-- the record a manager trusts when two people remember it differently.
create table activity (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    subject text not null check (subject in ('conversation', 'order', 'booking', 'account')),
    subject_id uuid not null,
    -- The customer it concerns, so one customer's whole history can be read at once.
    contact_id uuid references contacts(id) on delete cascade,
    action text not null,
    detail jsonb not null default '{}',
    -- Null when the customer or the assistant did it; `actor_name` says which.
    actor_id uuid references users(id) on delete set null,
    actor_name text not null,
    created_at timestamptz not null default clock_timestamp()
);
create index activity_subject on activity (tenant_id, subject, subject_id, created_at);
create index activity_contact on activity (tenant_id, contact_id, created_at);
create index activity_actor on activity (tenant_id, actor_id, created_at);

do $$
declare t text;
begin
    foreach t in array array['activity', 'shop_settings'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;
grant select, insert on activity to alyr_app;
grant select, insert, update, delete on shop_settings to alyr_app;
