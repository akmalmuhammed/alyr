-- Discounts and coupon codes (ALY-150, decision D-039 "As built (pricing pack)",
-- specs/014-pricing-pack/spec.md).
--
-- A shop that has switched on "Discounts and coupon codes" keeps rules here: coupon codes a
-- customer types, and automatic discounts that need no code ("10% off orders over QAR 200",
-- "buy 3 get 1 free"). A rule gives a percentage, a fixed amount or free units; it applies to
-- the whole order or to chosen items and categories; it can have a minimum order, a total and a
-- per-customer limit, dates, a price group it is only for, and whether it combines with another.
--
-- Nothing here changes an existing shop. The feature is off for every shop until the founder
-- switches it on (`shop_features`, no row means the template's value, and every template says
-- off), an order with no discount has `discount_total = 0` and keeps `subtotal` null, and the
-- columns and tables below are only read when the feature is on.
--
-- Money is whole minor units (dirhams, 100 to the riyal) in bigint, as everywhere in ALYR; a
-- percentage is numeric (never a float), and the rounding rule is one: see the spec.

create table discount_rules (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- A coupon is typed by the customer; an automatic rule applies by itself.
    kind text not null check (kind in ('coupon', 'auto')),
    -- The code as the shop wrote it (capitals, Western digits), and the form it is matched in
    -- (Arabic spellings folded, dashes and spaces gone), unique among the shop's coupons.
    code text not null default '' check (char_length(code) <= 24),
    code_key text not null default '',
    -- What staff call it, and what the customer reads beside the discount (optional).
    name text not null default '' check (char_length(name) <= 60),
    name_ar text not null default '' check (char_length(name_ar) <= 60),
    value_type text not null check (value_type in ('percent', 'amount', 'free_units')),
    percent numeric(6,3) check (percent > 0 and percent <= 100),
    amount bigint check (amount > 0),
    -- "Buy N, get M free": every N + M units, M are free.
    buy_qty integer check (buy_qty >= 1 and buy_qty <= 99),
    get_qty integer check (get_qty >= 1 and get_qty <= 99),
    scope text not null default 'order' check (scope in ('order', 'selected')),
    item_ids uuid[] not null default '{}',
    categories text[] not null default '{}',
    -- Judged on the goods before any discount.
    min_order bigint not null default 0 check (min_order >= 0),
    usage_limit integer check (usage_limit >= 1),
    per_customer_limit integer check (per_customer_limit >= 1),
    starts_at timestamptz,
    ends_at timestamptz,
    stackable boolean not null default false,
    -- Only for the customers of one price group (null: everyone).
    group_id uuid references price_groups(id) on delete set null,
    status text not null default 'active' check (status in ('active', 'paused', 'ended')),
    -- How many orders hold this rule now (a cancelled order gives its use back). The database
    -- itself refuses to go over the limit, whatever the application does.
    uses integer not null default 0 check (uses >= 0),
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((kind = 'coupon') = (code <> '')),
    check ((kind = 'coupon') = (code_key <> '')),
    check (
        (value_type = 'percent' and percent is not null and amount is null and buy_qty is null)
        or (value_type = 'amount' and amount is not null and percent is null and buy_qty is null)
        or (value_type = 'free_units' and buy_qty is not null and get_qty is not null
            and percent is null and amount is null)
    ),
    check (scope = 'order' or cardinality(item_ids) + cardinality(categories) > 0),
    check (starts_at is null or ends_at is null or ends_at > starts_at),
    check (usage_limit is null or uses <= usage_limit)
);
create unique index discount_rules_code on discount_rules (tenant_id, code_key)
    where kind = 'coupon';
create index discount_rules_shop on discount_rules (tenant_id, status, kind);

-- What an order was given, as it was when the order was placed. Nothing here is read from the
-- rule afterwards, so editing or ending a rule never rewrites an order. `rule_id` only says
-- which rule it was (null once the rule is gone). `returned_at` is set when the order is
-- cancelled: the use goes back to the rule and the amount no longer counts as given.
create table order_discounts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    order_id uuid not null references orders(id) on delete cascade,
    rule_id uuid references discount_rules(id) on delete set null,
    kind text not null check (kind in ('coupon', 'auto')),
    code text not null default '',
    name text not null default '',
    name_ar text not null default '',
    -- The rule in words, English and Arabic, as the customer and the owner read it.
    rule_text text not null default '',
    rule_text_ar text not null default '',
    value_type text not null check (value_type in ('percent', 'amount', 'free_units')),
    percent numeric(6,3),
    amount bigint,
    buy_qty integer,
    get_qty integer,
    scope text not null default 'order',
    stackable boolean not null default false,
    -- What came off the order.
    amount_off bigint not null check (amount_off > 0),
    sort integer not null default 0,
    returned_at timestamptz,
    created_at timestamptz not null default now()
);
create index order_discounts_order on order_discounts (tenant_id, order_id);
create index order_discounts_rule on order_discounts (tenant_id, rule_id) where returned_at is null;

-- The goods before discounts, and what came off, kept on the order. `subtotal` is null on an
-- order with no discount (every order made before this): it then equals the total. Delivery
-- fees (the next migration) join the same sum.
alter table orders add column subtotal bigint check (subtotal is null or subtotal > 0);
alter table orders add column discount_total bigint not null default 0 check (discount_total >= 0);
alter table orders add constraint orders_total_adds_up
    check (subtotal is null or total = subtotal - discount_total);
-- What came off each line, so a screen can show it line by line.
alter table order_items add column discount bigint not null default 0 check (discount >= 0);

-- A customer who types a code in the chat: the draft remembers it (and, later, the delivery
-- choice). An object so a new thing in the draft needs no migration.
alter table chat_carts add column extras jsonb not null default '{}';

do $$
declare t text;
begin
    foreach t in array array['discount_rules', 'order_discounts'] loop
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
