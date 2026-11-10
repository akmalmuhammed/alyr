-- The connector's stock changes and their undo (specs/067-mcp-connector, ALY-291, D-171).
--
-- A change an owner's app makes to what is in stock (sold out, back, a count) is small and
-- reversible. Each is one row here, with what it was before and what it is now, so that "undo"
-- can put it back, and only while the thing has not been changed again since. It is the same idea
-- as `staff_changes` (0027), which belongs to a staff member's phone number; a person signed in
-- through the connector has no contact row, so this one belongs to the person.
--
-- The stock itself is changed by the Catalog's own code (modules/items/service.py), so its log
-- and the activity record say who did it and that it came through the connector. This table only
-- remembers how to reverse it.

create table mcp_stock_changes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null
        default nullif(current_setting('app.tenant_id', true), '')::uuid references tenants (id),
    -- Who made it. The name is kept as it was, in case the person leaves the team.
    user_id uuid references users (id) on delete set null,
    user_name text not null default '',
    item_id uuid not null references items (id) on delete cascade,
    action text not null check (action in ('sold_out', 'back', 'stock')),
    before jsonb not null default '{}',
    after jsonb not null default '{}',
    created_at timestamptz not null default now(),
    undone_at timestamptz,
    undone_by text
);
create index mcp_stock_changes_recent on mcp_stock_changes (tenant_id, created_at desc);
create index mcp_stock_changes_item on mcp_stock_changes (tenant_id, item_id);

alter table mcp_stock_changes enable row level security;
alter table mcp_stock_changes force row level security;
create policy tenant_isolation on mcp_stock_changes
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert, update on mcp_stock_changes to alyr_app;
