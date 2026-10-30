-- ALY-258, decision D-069, spec 026: more than one customer at a time.
--
-- Until now the database refused any two overlapping bookings for a whole shop
-- (`bookings_no_overlap`, migration 0010), so a salon with two chairs, a clinic with two
-- doctors or a workshop with two technicians could take one customer at a time. A shop can
-- now list its resources (chairs, people, rooms) and the rule becomes: one customer at a
-- time per resource.
--
-- A shop that lists no resources is exactly as before: one lane, nothing changes for it.

create table booking_resources (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null check (length(btrim(name)) between 1 and 120),
    name_ar text not null default '' check (length(name_ar) <= 120),
    -- Switched off, not deleted: a booking points at it and history must keep its name. An
    -- inactive resource takes no new bookings; the ones it has stay.
    active boolean not null default true,
    sort integer not null default 0,
    created_at timestamptz not null default now()
);
create index booking_resources_shop on booking_resources (tenant_id, active, sort);

-- Which resources do a service. A service with no row here is done by every active
-- resource, so a new resource works for every service until the shop narrows it.
create table service_resources (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    service_id uuid not null references services(id) on delete cascade,
    resource_id uuid not null references booking_resources(id),
    primary key (service_id, resource_id)
);
create index service_resources_resource on service_resources (tenant_id, resource_id);

do $$
declare t text;
begin
    foreach t in array array['booking_resources', 'service_resources'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;
-- Delete is granted for the demo shop's reset; a resource a booking points at cannot be deleted
-- (the foreign key refuses), and the API never offers it: it is switched off instead.
grant select, insert, update, delete on booking_resources to alyr_app;
grant select, insert, delete on service_resources to alyr_app;

-- A booking says which resource it holds. Null is the shop's one lane (a shop with no
-- resources, and every booking made before this migration).
alter table bookings
    add column resource_id uuid references booking_resources(id);
create index bookings_resource on bookings (tenant_id, resource_id, starts_at)
    where status = 'booked';

-- The rule moves from the shop to the resource. `coalesce(resource_id, tenant_id)` is the
-- shop's one lane for a booking with no resource, so a shop without resources is held to
-- exactly the old rule. The name is kept: the code already answers its violation.
-- (This rebuilds the index under a short lock on `bookings`; it is a small table.)
alter table bookings drop constraint bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap exclude using gist
    (tenant_id with =, (coalesce(resource_id, tenant_id)) with =,
     tstzrange(starts_at, ends_at) with &&)
    where (status = 'booked');
