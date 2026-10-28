-- ALY-27, decision D-072, spec 033: chairs and people with their own hours, deposits by the
-- shop's own rule, staff bookings, and the review request. Builds on 0055 (D-069).

-- ── Resources: a person or a place, with its own working hours ──────────────────────────
-- A person is named in messages ("with Reem"); a place is not spoken to ("Chair 2").
alter table booking_resources
    add column kind text not null default 'person' check (kind in ('person', 'place'));

-- A resource's own hours. A resource with no row here works the shop's opening hours; one
-- with some works only those (a weekday with no row is its day off). weekday as in
-- business_hours: 0 is Sunday.
create table resource_hours (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    resource_id uuid not null references booking_resources(id) on delete cascade,
    weekday integer not null check (weekday between 0 and 6),
    opens time not null,
    closes time not null,
    check (closes > opens)
);
create index resource_hours_day on resource_hours (tenant_id, resource_id, weekday);

-- ── Deposits ─────────────────────────────────────────────────────────────────────────────
-- Per service: none, a fixed amount in dirhams, or a percentage of the price.
alter table services
    add column deposit_kind text not null default 'none'
        check (deposit_kind in ('none', 'fixed', 'percent')),
    add column deposit_value integer not null default 0,
    add constraint services_deposit_value check (
        (deposit_kind = 'none' and deposit_value = 0)
        or (deposit_kind = 'fixed' and deposit_value between 1 and 10000000)
        or (deposit_kind = 'percent' and deposit_value between 1 and 100));

-- On the booking: the amount asked (worked out once, when it was made), where it stands, the
-- rule it was made under (shown to the customer before paying; a later change of rule does
-- not change it), and until when an unpaid one holds the time.
--   none        no deposit
--   due         the link is sent and the time is held until hold_until
--   paid        paid; counts against the final bill
--   expired     not paid in time, or the booking was cancelled before it was paid
--   kept        kept by the shop's rule (a no-show, a late cancel)
--   refund_due  the shop owes it back and refunds it from its own account (ALYR moves no money)
--   refunded    the shop says it has refunded it
alter table bookings
    add column deposit bigint not null default 0 check (deposit >= 0),
    add column deposit_state text not null default 'none' check (deposit_state in
        ('none', 'due', 'paid', 'expired', 'kept', 'refund_due', 'refunded')),
    add column deposit_terms jsonb not null default '{}',
    add column hold_until timestamptz,
    -- Made by staff for a customer standing in the shop (no message is sent).
    add column walk_in boolean not null default false,
    add constraint bookings_deposit_shape check ((deposit = 0) = (deposit_state = 'none')),
    add constraint bookings_hold_shape check (hold_until is null or deposit_state = 'due');
create index bookings_held on bookings (tenant_id, hold_until) where deposit_state = 'due';

-- A pay link for a booking's deposit. One waiting link per booking at most.
alter table payment_requests
    add column booking_id uuid references bookings(id) on delete cascade;
create unique index payment_requests_one_per_booking on payment_requests (booking_id)
    where booking_id is not null and status = 'pending';

-- The shop's own rule for a paid deposit, and the review request (off until the owner turns
-- it on and gives the link).
alter table shop_settings
    add column deposit_no_show text not null default 'keep'
        check (deposit_no_show in ('keep', 'refund')),
    add column deposit_late_cancel text not null default 'keep'
        check (deposit_late_cancel in ('keep', 'refund')),
    add column deposit_cancel_hours integer not null default 24
        check (deposit_cancel_hours between 0 and 168),
    add column review_requests boolean not null default false,
    add column review_link text not null default ''
        check (review_link = '' or (review_link ~ '^https://' and length(review_link) <= 500));

-- ── The review request ───────────────────────────────────────────────────────────────────
-- One row per request sent (or refused by the outbound layer), never changed: at most one
-- per customer every 30 days is decided from these rows, under a per-customer lock.
create table review_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    subject text not null check (subject in ('booking', 'order')),
    subject_id uuid not null,
    message_id uuid,
    -- Why the outbound layer did not send it (opted_out, no_consent), or null.
    blocked text,
    sent_at timestamptz not null default now()
);
create index review_requests_contact on review_requests (tenant_id, contact_id, sent_at);

do $$
declare t text;
begin
    foreach t in array array['resource_hours', 'review_requests'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;
grant select, insert, delete on resource_hours to alyr_app;
-- Append-only: the app adds and reads; the demo shops' reset removes them with the contact.
grant select, insert on review_requests to alyr_app;
