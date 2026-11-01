-- ALY-259, decision D-141, spec 043: days off. A shop closes for Eid, a holiday or a closure, and
-- a person or chair is away for some days; nobody can book those days. A closure is a range of
-- the shop's own calendar days (so it means the same whatever machine reads it, as the opening
-- hours do), for the whole shop or for one resource. It never cancels a booking: the ones
-- already inside it stay booked until the shop moves or cancels them.

create table booking_closures (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- One person's or chair's time off; null closes the whole shop.
    resource_id uuid references booking_resources(id) on delete cascade,
    first_day date not null,
    last_day date not null,
    -- Shown to customers on a whole-shop closure ("Eid al-Fitr"); optional, in both languages.
    reason text not null default '',
    reason_ar text not null default '',
    created_at timestamptz not null default now(),
    check (last_day >= first_day),
    check (last_day - first_day < 366)
);
-- The engine asks, for one day, whether a closure covers it; the screen lists the ones to come.
create index booking_closures_days on booking_closures (tenant_id, last_day, first_day);
create index booking_closures_resource on booking_closures (tenant_id, resource_id);

alter table booking_closures enable row level security;
alter table booking_closures force row level security;
create policy tenant_isolation on booking_closures
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- A closure is made and removed, never edited (a wrong one is removed and made again); delete is
-- also what the demo shops' reset uses.
grant select, insert, delete on booking_closures to alyr_app;
