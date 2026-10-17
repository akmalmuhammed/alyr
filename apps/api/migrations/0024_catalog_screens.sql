-- What the Catalog's workspace screens need (ALY-104, decision D-039).
--
-- 1. A draft made from a photo has no name and no price yet, so a price of zero is allowed
--    on a draft. Anything that is for sale still needs one (the new check below).
-- 2. Two shop settings: whether agents may edit items and photos (they always mark
--    availability and stock), and the number at which stock counts as low.
-- 3. The last bulk change, with each item as it was, so the owner can undo it once.

alter table items drop constraint items_price_check;
alter table items add constraint items_price_check check (price >= 0);
alter table items add constraint items_price_set
    check (price > 0 or status in ('draft', 'archived'));

alter table shop_settings
    add column agents_edit_items boolean not null default false,
    add column low_stock_at integer not null default 5
        check (low_stock_at between 0 and 100000);

-- One row per bulk action. `changes` is [{"id", "name", "name_ar", "before", "after"}],
-- where before and after hold only the fields the action touches. Undoing marks the row; only
-- the newest row that has not been undone can be undone, and an item edited since is left
-- as it is. Rows are added, and marked when undone, never removed.
create table item_bulk_changes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    action text not null
        check (action in ('sold_out', 'back', 'price_percent', 'move_category', 'archive')),
    -- What the owner chose: {"percent": 10, "category": "Mains"}.
    params jsonb not null default '{}',
    changes jsonb not null,
    skipped integer not null default 0,
    actor_id uuid references users(id) on delete set null,
    actor_name text not null,
    created_at timestamptz not null default clock_timestamp(),
    undone_at timestamptz,
    undone_by text
);
create index item_bulk_changes_recent on item_bulk_changes (tenant_id, created_at desc);

alter table item_bulk_changes enable row level security;
alter table item_bulk_changes force row level security;
create policy tenant_isolation on item_bulk_changes
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update on item_bulk_changes to alyr_app;
