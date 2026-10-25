-- Delivery and pickup (ALY-150 part 2, decision D-039 "As built (pricing pack)",
-- specs/014-pricing-pack/spec.md).
--
-- A shop that has switched on "Delivery and pickup" says whether customers may collect an order,
-- may have it delivered, and where it delivers and for how much: zones (a name in both languages,
-- a fee, a free-over amount, a minimum order, optionally which days and a daily cut-off) and an
-- optional flat fee for the whole shop. There are no maps, no distances and no driver dispatch:
-- the customer chooses a zone and writes the address in words.
--
-- Nothing here changes an existing shop. The feature is off for every shop until it is switched
-- on; an order made before this has `fulfilment` null and `delivery_fee` 0, and still adds up.
-- Money is whole minor units (dirhams) in bigint, as everywhere in ALYR.

create table delivery_settings (
    tenant_id uuid primary key default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    pickup_enabled boolean not null default true,
    delivery_enabled boolean not null default false,
    -- One fee for the whole shop: the delivery fee when there are no zones, "Other areas" when
    -- there are. Null: no flat fee.
    flat_fee bigint check (flat_fee >= 0),
    flat_free_over bigint check (flat_free_over > 0),
    flat_min_order bigint not null default 0 check (flat_min_order >= 0),
    updated_at timestamptz not null default now(),
    check (pickup_enabled or delivery_enabled)
);

create table delivery_zones (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null check (btrim(name) <> '' and char_length(name) <= 60),
    name_ar text not null check (btrim(name_ar) <> '' and char_length(name_ar) <= 60),
    fee bigint not null check (fee >= 0),
    -- Delivery is free once the goods, after discounts, reach this amount (null: never free).
    free_over bigint check (free_over > 0),
    min_order bigint not null default 0 check (min_order >= 0),
    -- An order placed after this time of day is delivered from the next day (null: no cut-off).
    cutoff time,
    -- The days it delivers on, Sunday as 0 (empty: every day).
    days smallint[] not null default '{}' check (days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
    sort integer not null default 0,
    -- A zone taken away is archived, never deleted: orders keep its name as it was.
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index delivery_zones_shop on delivery_zones (tenant_id, archived_at, sort);

-- How an order reaches its customer, as it was when the order was placed. The zone's name is
-- copied so renaming or archiving a zone never rewrites an order.
alter table orders
    add column fulfilment text check (fulfilment in ('pickup', 'delivery')),
    add column delivery_zone_id uuid references delivery_zones(id) on delete set null,
    add column delivery_zone_name text not null default '',
    add column delivery_zone_name_ar text not null default '',
    add column delivery_address text not null default '' check (char_length(delivery_address) <= 300),
    add column delivery_note text not null default '' check (char_length(delivery_note) <= 200),
    add column delivery_on date,
    add column delivery_fee bigint not null default 0 check (delivery_fee >= 0);
create index orders_fulfilment on orders (tenant_id, fulfilment, created_at desc)
    where fulfilment is not null;

-- total = goods - discounts + delivery fee, kept honest by the database (0040 had no fee yet).
alter table orders drop constraint orders_total_adds_up;
alter table orders add constraint orders_total_adds_up
    check (subtotal is null or total = subtotal - discount_total + delivery_fee);
alter table orders add constraint orders_delivery_shape
    check (fulfilment = 'delivery' or (delivery_fee = 0 and delivery_address = ''));

do $$
declare t text;
begin
    foreach t in array array['delivery_settings', 'delivery_zones'] loop
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
