-- Order link (decision D-016): products on a shareable page, a cart, and an order that
-- is paid by link or put on the customer's credit account.

-- The public address of a shop's order page: /s/<slug>
alter table tenants add column slug text unique;

create table products (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null,
    name_ar text not null default '',
    category text not null default '',
    price bigint not null check (price > 0),
    available boolean not null default true,
    sort integer not null default 0,
    created_at timestamptz not null default now()
);

create table orders (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id),
    number integer not null,
    status text not null default 'new'
        check (status in ('new', 'confirmed', 'ready', 'done', 'cancelled')),
    payment text not null default 'unpaid' check (payment in ('unpaid', 'paid', 'on_account')),
    total bigint not null check (total > 0),
    created_at timestamptz not null default now(),
    unique (tenant_id, number)
);

-- Name and price are copied onto the line so an order never changes when a product does.
create table order_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    order_id uuid not null references orders(id) on delete cascade,
    product_id uuid references products(id) on delete set null,
    name text not null,
    price bigint not null,
    quantity integer not null check (quantity > 0)
);

alter table payment_requests add column order_id uuid references orders(id) on delete cascade;

do $$
declare t text;
begin
    foreach t in array array['products', 'orders', 'order_items'] loop
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
