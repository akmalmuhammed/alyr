-- Cost price and margin (ALY-150 part 3, decision D-039 "As built (pricing pack)",
-- specs/014-pricing-pack/spec.md).
--
-- A shop that has switched on "Cost price and margin" can say what an item (and each size or
-- colour of it) costs it. The owner and the admins see the cost and the margin it leaves; agents
-- and customers never do.
--
-- That promise is kept by where the cost lives: NOT in `items`, `item_variants` or `order_items`,
-- whose rows are read, copied and listed in a hundred places for staff and customers alike, but in
-- tables of its own that only the cost module and the owner-only routes read. A new reader of an
-- item can therefore never show a cost by accident.
--
-- Nothing here changes an existing shop: the feature is off until switched on, and these tables
-- are empty. Money is whole minor units (dirhams) in bigint, as everywhere in ALYR.

-- What an item costs now: one row for the item (variant_id null) and, if a size or colour costs
-- something else, one for it. A size with no row of its own costs what the item costs.
create table item_costs (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    item_id uuid not null references items(id) on delete cascade,
    variant_id uuid references item_variants(id) on delete cascade,
    cost bigint not null check (cost >= 0 and cost <= 100000000),
    updated_by text not null default '',
    updated_at timestamptz not null default now()
);
create unique index item_costs_one on item_costs
    (tenant_id, item_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Every cost an item has had, with who changed it. Added and read, never changed. A null cost is
-- "no cost kept any more".
create table item_cost_history (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    item_id uuid not null references items(id) on delete cascade,
    variant_id uuid references item_variants(id) on delete set null,
    variant_name text not null default '',
    cost bigint check (cost >= 0),
    changed_by_name text not null default '',
    reason text not null default '',
    created_at timestamptz not null default now()
);
create index item_cost_history_item on item_cost_history (tenant_id, item_id, created_at);

-- What one unit cost when the order was placed, so the margin of an order stays right when the
-- cost changes later. A line with no row had no cost kept for it then.
create table order_item_costs (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    order_item_id uuid primary key references order_items(id) on delete cascade,
    unit_cost bigint not null check (unit_cost >= 0)
);
create index order_item_costs_shop on order_item_costs (tenant_id);

do $$
declare t text;
begin
    foreach t in array array['item_costs', 'item_cost_history', 'order_item_costs'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;
grant select, insert, update, delete on item_costs, order_item_costs to alyr_app;
-- The history can be read and added to, never edited (a removed item takes it with it).
grant select, insert on item_cost_history to alyr_app;
