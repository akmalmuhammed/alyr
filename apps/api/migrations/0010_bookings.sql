-- Bookings (ALY-27): a customer picks a service and a free time from a link in the chat.

-- Needed so the database itself can refuse two bookings that overlap.
create extension if not exists btree_gist;

-- Opening hours are wall-clock times, so the shop's time zone decides what they mean.
alter table tenants add column timezone text not null default 'Asia/Qatar';

create table services (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null,
    name_ar text not null default '',
    duration_minutes integer not null check (duration_minutes between 5 and 600),
    -- Dirhams (1 QAR = 100). Zero means the price is not shown.
    price bigint not null default 0 check (price >= 0),
    active boolean not null default true,
    sort integer not null default 0,
    created_at timestamptz not null default now()
);

-- When bookings can start and must end. Several rows per day allow a midday break.
-- weekday follows PostgreSQL: 0 is Sunday, 6 is Saturday.
create table business_hours (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    weekday integer not null check (weekday between 0 and 6),
    opens time not null,
    closes time not null,
    check (closes > opens)
);
create index business_hours_day on business_hours (tenant_id, weekday);

create table bookings (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    number integer not null,
    contact_id uuid not null references contacts(id),
    service_id uuid not null references services(id),
    -- Copied at booking time, so renaming a service does not rewrite history.
    service_name text not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null default 'booked'
        check (status in ('booked', 'completed', 'cancelled', 'no_show')),
    note text not null default '',
    reminded_at timestamptz,
    created_at timestamptz not null default now(),
    check (ends_at > starts_at),
    unique (tenant_id, number),
    -- One customer at a time per shop. Two people confirming the same slot in the same
    -- second cannot both succeed: the database refuses the second.
    constraint bookings_no_overlap exclude using gist
        (tenant_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'booked')
);
create index bookings_when on bookings (tenant_id, starts_at);
create index bookings_contact on bookings (tenant_id, contact_id, starts_at);

do $$
declare t text;
begin
    foreach t in array array['services', 'business_hours', 'bookings'] loop
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
