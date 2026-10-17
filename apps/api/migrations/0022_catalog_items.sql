-- The Catalog's foundation (ALY-102, decision D-039): items with variants and options,
-- availability rules, a stock log, price history and holds.
--
-- Safe on a database that already has shops and orders. The old `products` table is
-- renamed to `items`, not copied: every product keeps its ID, and every order line
-- still points at it. Existing products become live items on the "switch" rule, so a shop
-- behaves exactly as before (its `available` flag is still the switch), and each gets
-- one default variant, which is where its stock will live once the shop counts it.
--
-- Nothing here is visible to an owner or a customer by itself: no module is registered
-- and no screen reads these tables until the Catalog's later packages (D-039).

-- ---------------------------------------------------------------- the item

alter table products rename to items;
alter table items rename constraint products_pkey to items_pkey;
alter table items rename constraint products_tenant_id_fkey to items_tenant_id_fkey;
alter table items rename constraint products_price_check to items_price_check;

alter table items
    -- Only a live item is sold. An item with orders is archived, never deleted.
    add column status text not null default 'live'
        check (status in ('draft', 'live', 'hidden', 'archived')),
    add column description text not null default '',
    add column description_ar text not null default '',
    add column unit text not null default 'piece'
        check (unit in ('piece', 'kg', 'box', 'pack', 'portion', 'hour')),
    -- How many units one pack holds, and the least a customer may order.
    add column pack_size integer check (pack_size > 0),
    add column min_order integer not null default 1 check (min_order >= 1),
    add column tags text[] not null default '{}',
    -- How availability is decided: always (made to order), switch (staff flip `available`),
    -- count (a number in stock per variant) or daily_limit (a number per day, per variant).
    -- A schedule, in `item_schedules`, can be added to any of them.
    add column stock_rule text not null default 'switch'
        check (stock_rule in ('always', 'switch', 'count', 'daily_limit')),
    add column sale_price bigint check (sale_price > 0),
    add column sale_starts_at timestamptz,
    add column sale_ends_at timestamptz,
    -- Where the cover photo goes (the photo pipeline, ALY-103, owns what this points at).
    add column photo_id uuid,
    add column updated_at timestamptz not null default now();
create index items_status on items (tenant_id, status);

-- The order and names of a shop's categories. Items name their category in text, as
-- before; a category with no row here still works and sorts last.
create table item_categories (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null,
    name_ar text not null default '',
    sort integer not null default 0,
    unique (tenant_id, name)
);

-- ------------------------------------------------------------ variants (stock lives here)

-- Every item has at least one variant. An item without sizes or colours has exactly one,
-- `is_default`, with no name. Stock, a price difference and a photo belong to a variant.
create table item_variants (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    item_id uuid not null references items(id) on delete cascade,
    name text not null default '',
    name_ar text not null default '',
    is_default boolean not null default false,
    -- Added to the item's price (dirhams, may be negative).
    price_delta bigint not null default 0,
    -- The number in stock for the "count" rule. Only `stock_movements` change it, in one
    -- statement with the log row, so it always equals the sum of the log.
    on_hand integer not null default 0
        constraint item_variants_on_hand_nonneg check (on_hand >= 0),
    -- How many may be sold per shop day, for the "daily_limit" rule.
    daily_limit integer check (daily_limit >= 0),
    active boolean not null default true,
    sort integer not null default 0,
    photo_id uuid,
    created_at timestamptz not null default now(),
    unique (item_id, name)
);
create unique index item_variants_one_default on item_variants (item_id) where is_default;
create index item_variants_item on item_variants (tenant_id, item_id);

-- A product added any other way (a seed, an import, old code) still gets its variant.
create function items_add_default_variant() returns trigger
language plpgsql as $$
begin
    insert into item_variants (tenant_id, item_id, is_default)
    values (new.tenant_id, new.id, true);
    return new;
end $$;
create trigger items_default_variant after insert on items
    for each row execute function items_add_default_variant();

-- ------------------------------------------------------------------- options

-- Choices a customer makes on one item, for restaurants: a required group (size) or
-- priced extras (cheese).
create table item_option_groups (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    item_id uuid not null references items(id) on delete cascade,
    name text not null,
    name_ar text not null default '',
    required boolean not null default false,
    max_choices integer not null default 1 check (max_choices >= 1),
    sort integer not null default 0
);
create index item_option_groups_item on item_option_groups (tenant_id, item_id);

create table item_options (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    group_id uuid not null references item_option_groups(id) on delete cascade,
    name text not null,
    name_ar text not null default '',
    price_delta bigint not null default 0 check (price_delta >= 0),
    active boolean not null default true,
    sort integer not null default 0
);
create index item_options_group on item_options (tenant_id, group_id);

-- ---------------------------------------------------------------- availability

-- When an item can be ordered. Rows without dates are the usual week; a row with dates
-- (Ramadan, a holiday) replaces the usual week on those days. `lead_days` and `cutoff`
-- make it an item ordered for a date ("order before 6 pm for tomorrow"): the order must
-- be placed `lead_days` before that date, and before `cutoff` on that earlier day.
-- Without them it is an item ordered now, during `opens` to `closes`.
create table item_schedules (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    item_id uuid not null references items(id) on delete cascade,
    -- 0 is Sunday, as in business_hours.
    weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
    opens time,
    closes time,
    lead_days integer not null default 0 check (lead_days between 0 and 60),
    cutoff time,
    valid_from date,
    valid_to date,
    -- True: the item cannot be ordered on the days this row covers.
    closed boolean not null default false,
    check (cardinality(weekdays) > 0 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
    check (opens is null or closes is null or closes > opens),
    check (valid_from is null or valid_to is null or valid_to >= valid_from)
);
create index item_schedules_item on item_schedules (tenant_id, item_id);

-- What a daily-limit variant has sold or been given on one shop day: the sum of that
-- day's stock movements. Sold counts down; received, wasted or adjusted change it.
create table variant_day_stock (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    variant_id uuid not null references item_variants(id) on delete cascade,
    day date not null,
    delta integer not null default 0,
    primary key (variant_id, day)
);

-- -------------------------------------------------------------- history and stock

-- Every price an item has had, with who changed it. Added and read, never changed.
create table item_price_history (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    item_id uuid not null references items(id) on delete cascade,
    price bigint not null,
    sale_price bigint,
    sale_ends_at timestamptz,
    changed_by uuid references users(id) on delete set null,
    changed_by_name text not null default '',
    reason text not null default '',
    created_at timestamptz not null default clock_timestamp()
);
create index item_price_history_item on item_price_history (tenant_id, item_id, created_at);

-- The stock log. Every change is a row with who, when and why, and the number shown is
-- the total. Rows are added and read, never changed or removed. A row with a `day`
-- belongs to that shop day's allowance (daily-limit variants); one without belongs to the
-- running stock (count variants).
create table stock_movements (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    variant_id uuid not null references item_variants(id) on delete cascade,
    kind text not null check (kind in (
        'opening', 'received', 'sold', 'cancelled_restocked', 'wasted', 'counted', 'adjusted')),
    delta integer not null,
    -- The number after this change: on hand, or what is left of the day's allowance.
    balance_after integer not null,
    day date,
    reason text not null default '',
    -- The order a sale or a restock belongs to. No foreign key: the log outlives it.
    order_id uuid,
    actor_id uuid references users(id) on delete set null,
    actor_name text not null,
    created_at timestamptz not null default clock_timestamp(),
    check (delta <> 0 or kind = 'counted')
);
create index stock_movements_variant on stock_movements (tenant_id, variant_id, created_at);
create index stock_movements_order on stock_movements (tenant_id, order_id);

-- ----------------------------------------------------------------------- holds

-- Stock taken for one order line. A line paid on the spot, or put on a credit account, is
-- "committed" at once. A pay-link order is "held" for the shop's hold time (30 minutes
-- unless the shop changes it); unpaid, the hold is released and the order is cancelled.
create table stock_holds (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    order_id uuid not null references orders(id) on delete cascade,
    order_item_id uuid not null references order_items(id) on delete cascade,
    variant_id uuid not null references item_variants(id) on delete cascade,
    quantity integer not null check (quantity > 0),
    -- The day of a daily-limit allowance the units were taken from.
    day date,
    status text not null default 'held' check (status in ('held', 'committed', 'released')),
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    released_at timestamptz,
    released_reason text not null default ''
);
create index stock_holds_order on stock_holds (tenant_id, order_id);
create index stock_holds_due on stock_holds (expires_at) where status = 'held';

-- -------------------------------------------------- orders keep a copy as ordered

alter table order_items rename column product_id to item_id;
-- Order history must outlive any change to the catalog, so an item that has been
-- ordered cannot be deleted (it is archived). The link used to be set to null instead.
alter table order_items drop constraint order_items_product_id_fkey;
alter table order_items add constraint order_items_item_id_fkey
    foreign key (item_id) references items(id) on delete restrict;

alter table order_items
    add column variant_id uuid references item_variants(id) on delete set null,
    add column variant_name text not null default '',
    add column variant_name_ar text not null default '',
    add column name_ar text not null default '',
    -- [{"group", "group_ar", "name", "name_ar", "price_delta"}], as the customer chose.
    add column options jsonb not null default '[]',
    -- The date a made-to-order line was ordered for.
    add column fulfil_on date;

alter table orders add column fulfil_on date;

-- A payment link stops working when its hold ran out or its order was cancelled.
alter table payment_requests drop constraint payment_requests_status_check;
alter table payment_requests add constraint payment_requests_status_check
    check (status in ('pending', 'paid', 'expired'));

-- Changes to an item are on the record with who made them (D-028).
alter table activity drop constraint activity_subject_check;
alter table activity add constraint activity_subject_check
    check (subject in ('conversation', 'order', 'booking', 'account', 'item'));

-- Per shop: how long an unpaid pay-link order holds its stock, and when its day begins
-- (a bakery's day may start at 4 am), which is when daily limits start again.
alter table shop_settings
    add column hold_minutes integer not null default 30
        check (hold_minutes between 5 and 1440),
    add column day_starts time not null default '00:00';

-- ---------------------------------------------- bring the existing shops across

-- The migration owner normally bypasses row-level security. Where it does not (a hosted
-- database whose admin is not a superuser), forced security would hide every row from
-- these statements, so it is lifted for the length of this transaction.
alter table items no force row level security;
alter table order_items no force row level security;

insert into item_variants (tenant_id, item_id, is_default)
select tenant_id, id, true from items;

insert into item_price_history (tenant_id, item_id, price, changed_by_name, reason)
select tenant_id, id, price, 'ALYR', 'Price before the catalog' from items;

update order_items o set name_ar = i.name_ar from items i where i.id = o.item_id;

alter table items force row level security;
alter table order_items force row level security;

-- ------------------------------------------------------------ row-level security

do $$
declare t text;
begin
    foreach t in array array[
        'item_categories', 'item_variants', 'item_option_groups', 'item_options',
        'item_schedules', 'variant_day_stock', 'item_price_history', 'stock_movements',
        'stock_holds'
    ] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;

grant select, insert, update, delete on
    item_categories, item_variants, item_option_groups, item_options, item_schedules
    to alyr_app;
grant select, insert, update on variant_day_stock, stock_holds to alyr_app;
-- The price history and the stock log can be read and added to, never edited.
grant select, insert on item_price_history, stock_movements to alyr_app;
