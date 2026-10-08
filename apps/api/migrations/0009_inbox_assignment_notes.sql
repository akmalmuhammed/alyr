-- Inbox, second part (ALY-28): who is handling a conversation, notes only staff can
-- see, and replies the shop sends often.

alter table contacts
    add column assigned_to uuid references users(id) on delete set null;

-- Notes live in their own table, not in `messages`, so no code path can ever send one
-- to the customer or show it on a customer-facing page.
create table inbox_notes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    body text not null,
    author_id uuid references users(id) on delete set null,
    author_name text not null,
    created_at timestamptz not null default clock_timestamp()
);
create index inbox_notes_contact on inbox_notes (tenant_id, contact_id, created_at);

create table saved_replies (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    title text not null,
    body text not null,
    created_at timestamptz not null default now()
);

do $$
declare t text;
begin
    foreach t in array array['inbox_notes', 'saved_replies'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;
-- Notes can be added and read, not edited or removed: they are a record of what staff
-- knew and when.
grant select, insert on inbox_notes to alyr_app;
grant select, insert, update, delete on saved_replies to alyr_app;
