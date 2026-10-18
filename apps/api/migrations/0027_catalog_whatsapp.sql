-- The Catalog on WhatsApp (ALY-106, decision D-039).
--
-- 1. A low-stock number per item (the shop-wide number stays the default).
-- 2. Which of the shop's registered staff numbers are managers: they get the stock and
--    refund alerts, and may put a draft made from a photo on sale.
-- 3. The stock log and the price history say when a change came by WhatsApp.
-- 4. What a staff member changed by message, so it can be undone once, and the question
--    (which of several items did they mean) waiting for their answer.
-- 5. "Tell me when it is back": a customer's request, closed after the one message.
-- 6. Owner alerts already sent, so an item alerts once a day and not more.
--
-- Nothing here is visible to an owner or a customer by itself: the staff commands, item
-- messages and alerts only run for a shop whose `catalog` module is on, and it is off for
-- every shop until go-live.

alter table items
    add column low_stock_at integer check (low_stock_at between 0 and 100000);

alter table contacts
    add column catalog_manager boolean not null default false;
alter table contacts add constraint contacts_catalog_manager_staff
    check (not catalog_manager or role = 'staff');

-- '' for a change made in the workspace or by the system, 'whatsapp' for a staff message.
alter table stock_movements add column via text not null default '';
alter table item_price_history add column via text not null default '';

-- ---------------------------------------------------------------- undo and questions

-- Every change a staff member made by message. `before` and `after` hold only the fields
-- the change touched. Undoing marks the row; a change is undone once.
create table staff_changes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    item_id uuid references items(id) on delete set null,
    action text not null check (action in ('sold_out', 'back', 'stock', 'price', 'draft')),
    before jsonb not null default '{}',
    after jsonb not null default '{}',
    created_at timestamptz not null default clock_timestamp(),
    undone_at timestamptz
);
create index staff_changes_recent on staff_changes (tenant_id, contact_id, created_at desc);

-- One open question per staff member: "which one did you mean?". A new command replaces it.
create table staff_pending (
    contact_id uuid primary key references contacts(id) on delete cascade,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    kind text not null check (kind in ('choose')),
    payload jsonb not null,
    created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- back in stock

-- A customer asked to be told once when an item is back. It waits, then it is `sent` (the
-- one message went), or closed unsent: `cancelled` (the customer said stop), `expired`
-- (nothing for 60 days), `not_sent` (the outbound layer refused it; `reason` says why).
create table stock_watches (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    status text not null default 'waiting'
        check (status in ('waiting', 'sent', 'cancelled', 'expired', 'not_sent')),
    reason text not null default '',
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '60 days',
    closed_at timestamptz
);
-- A customer who asks twice for the same item is on the list once.
create unique index stock_watches_one_waiting
    on stock_watches (contact_id, item_id) where status = 'waiting';
create index stock_watches_item on stock_watches (tenant_id, item_id) where status = 'waiting';

-- ------------------------------------------------------------------- owner alerts

-- One row per item, kind and shop day: the key is what limits an item to one low-stock
-- and one sold-out alert a day. `day` is the date on the shop's own wall clock.
create table stock_alerts (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    item_id uuid not null references items(id) on delete cascade,
    kind text not null check (kind in ('low', 'sold_out')),
    day date not null,
    sent_at timestamptz not null default now(),
    primary key (item_id, kind, day)
);

-- ------------------------------------------------------------ row-level security

do $$
declare t text;
begin
    foreach t in array array['staff_changes', 'staff_pending', 'stock_watches', 'stock_alerts']
    loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;

grant select, insert, update on staff_changes, stock_watches to alyr_app;
grant select, insert, update, delete on staff_pending to alyr_app;
grant select, insert on stock_alerts to alyr_app;
