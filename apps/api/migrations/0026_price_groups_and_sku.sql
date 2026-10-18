-- Customer price groups (wholesale) and SKU (ALY-127, decision D-039, release 1).
--
-- 1. A shop has price groups (Retail, Wholesale, Staff...), one of them its default. A
--    customer (a contact) is in one group, or in none, which means the default. An item or
--    one of its sizes and colours can have a price for a group; a group with no price for
--    an item pays the item's normal price. Group prices keep a history like the normal
--    price does.
-- 2. An order keeps a copy of the group's name it was charged under; the price charged is
--    the line's own price, as before, so later changes never rewrite an old order.
-- 3. An item and a size or colour may have a SKU: a code the owner picks, blank when not
--    used, never repeated within a shop.
--
-- Nothing here is visible by itself: the screens that use it are inside the Catalog, which
-- is off for every shop until go-live.

-- ------------------------------------------------------------------ price groups

create table price_groups (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- Both names are always filled: a group named in one language uses it for both.
    name text not null check (btrim(name) <> ''),
    name_ar text not null check (btrim(name_ar) <> ''),
    -- The group a customer with none of their own pays by. Exactly one per shop. Its prices
    -- are the items' normal prices, so it has no price rows of its own.
    is_default boolean not null default false,
    sort integer not null default 0,
    -- A group taken away is archived, not deleted: its prices and their history stay.
    archived_at timestamptz,
    created_at timestamptz not null default now()
);
create unique index price_groups_one_default on price_groups (tenant_id) where is_default;
create unique index price_groups_name on price_groups (tenant_id, lower(name))
    where archived_at is null;

alter table contacts add column price_group_id uuid references price_groups(id)
    on delete set null;
create index contacts_price_group on contacts (tenant_id, price_group_id)
    where price_group_id is not null;

-- The price of one item (variant_id null) or of one size or colour, for one group. An item's
-- row is what a size without a row of its own pays, plus the size's price difference.
create table item_group_prices (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    group_id uuid not null references price_groups(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    variant_id uuid references item_variants(id) on delete cascade,
    price bigint not null check (price > 0),
    updated_at timestamptz not null default now()
);
create unique index item_group_prices_item on item_group_prices (group_id, item_id)
    where variant_id is null;
create unique index item_group_prices_variant on item_group_prices (group_id, variant_id)
    where variant_id is not null;
create index item_group_prices_by_item on item_group_prices (tenant_id, item_id);

-- Every group price an item has had, and its removal (price null), with who. Added and read,
-- never changed.
create table item_group_price_history (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    group_id uuid not null references price_groups(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    variant_id uuid references item_variants(id) on delete cascade,
    price bigint,
    changed_by uuid references users(id) on delete set null,
    changed_by_name text not null default '',
    reason text not null default '',
    created_at timestamptz not null default clock_timestamp()
);
create index item_group_price_history_item on item_group_price_history (tenant_id, item_id, created_at);

-- ------------------------------------------------ the order keeps what it was charged

-- The group's name as it was when the order was placed. The id only helps to find the
-- group again; it is cleared if the group is ever removed, the names stay.
alter table orders
    add column price_group_id uuid references price_groups(id) on delete set null,
    add column price_group_name text not null default '',
    add column price_group_name_ar text not null default '';
-- The SKU as it was when the order was placed (the size's own, else the item's).
alter table order_items add column sku text not null default '';

-- ------------------------------------------------------------------------------ SKU

alter table items add column sku text not null default ''
    check (sku = btrim(sku) and char_length(sku) <= 40);
alter table item_variants add column sku text not null default ''
    check (sku = btrim(sku) and char_length(sku) <= 40);
-- Blank is not a code, so any number of items may have none. The same code is refused
-- whatever its case. (An item's code against a size's code, in the other table, is checked
-- by the app under a lock.)
create unique index items_sku on items (tenant_id, lower(sku)) where sku <> '';
create unique index item_variants_sku on item_variants (tenant_id, lower(sku)) where sku <> '';

-- ------------------------------------------------ every shop has its default group

-- The migration owner normally bypasses row-level security. Where it does not (a hosted
-- database whose admin is not a superuser), forced security would hide every row from this
-- statement, so it is lifted for the length of this transaction.
alter table price_groups no force row level security;

insert into price_groups (tenant_id, name, name_ar, is_default)
select id, 'Retail', 'التجزئة', true from tenants;

alter table price_groups force row level security;

-- ------------------------------------------------------------ row-level security

do $$
declare t text;
begin
    foreach t in array array['price_groups', 'item_group_prices', 'item_group_price_history']
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

-- A group is renamed and archived, never deleted by the app's routes (the demo shop's reset
-- is the one thing that deletes them, with the rest of its data). Prices are replaced as a
-- set. The history can be read and added to, never edited.
grant select, insert, update, delete on price_groups to alyr_app;
grant select, insert, update, delete on item_group_prices to alyr_app;
grant select, insert on item_group_price_history to alyr_app;
