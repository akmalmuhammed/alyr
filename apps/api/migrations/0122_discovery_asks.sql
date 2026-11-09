-- ALY-324, decision D-166, spec 066: Discovery, Phase 2. The owner is asked on WhatsApp about one
-- proposal at a time. `discovery_asks` records that a message was sent to a person and what they
-- tapped; it never says whether a change is approved (that lives in discovery_proposals.status
-- only). One ask per proposal per person, ever.

create table discovery_asks (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    proposal_id uuid not null references discovery_proposals(id) on delete cascade,
    contact_id uuid not null references contacts(id) on delete cascade,
    user_id uuid references users(id) on delete set null,
    -- What the message showed: a button approves this and no other (the proposal's own hash).
    change_hash text not null check (change_hash ~ '^[0-9a-f]{64}$'),
    lang text not null default 'en' check (lang in ('en', 'ar')),
    sent_as text not null check (sent_as in ('buttons', 'template')),
    message_id uuid references messages(id) on delete set null,
    status text not null default 'queued' check (status in ('queued', 'answered', 'closed')),
    answer text check (answer in ('approve', 'later', 'details')),
    closed_reason text check (closed_reason is null or closed_reason ~ '^[a-z_]{1,60}$'),
    created_at timestamptz not null default now(),
    answered_at timestamptz,
    unique (tenant_id, proposal_id, contact_id)
);
create index discovery_asks_contact on discovery_asks (tenant_id, contact_id, created_at);

-- Which staff numbers receive asks. Set by an owner or admin in Discovery's settings (which
-- records service consent for the number, as the weekly report's setting does) and by the person's
-- own PROPOSALS OFF and PROPOSALS ON.
alter table contacts add column discovery_asks boolean not null default false;
alter table contacts add constraint contacts_discovery_asks_staff
    check (not discovery_asks or role = 'staff');

-- One row per shop, made on the first write: how many asks a person may get in a day, and whether
-- a check-up starts by itself once a week (off until an owner or admin switches it on).
create table discovery_settings (
    tenant_id uuid primary key default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    ask_cap_per_day integer not null default 3 check (ask_cap_per_day between 1 and 5),
    weekly_run boolean not null default false,
    updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
    foreach t in array array['discovery_asks', 'discovery_settings'] loop
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
