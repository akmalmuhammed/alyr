-- The Catalog's feature engine (ALY-148, decision D-039 "As built (feature engine)").
--
-- A business's setup is a configuration, not code: which features are on, what its section is
-- called and how its order page is laid out. This migration adds
--
--   1. `shop_features`: one row for each feature a shop has an opinion about (on or off, an
--      optional value such as "greyed" or "left out", who set it: the template or the owner).
--      Row-level security is forced like every shop table.
--   2. Four columns on `shop_settings`: the section's name in both languages and the order
--      page's layout style when the owner chose their own (empty means the template's), and
--      the template the shop uses when it is not simply the one for its business type.
--   3. A row for every feature of every existing shop, worked out from what the shop already
--      has, so that nothing about any existing shop behaves differently: every part of the
--      item form and the order page's four extras stay on (they always were), the two
--      alerts and the sold-out look are copied from the shop's settings, and a value that is not
--      the one its type starts with is marked as the owner's (an additive re-apply of a
--      template never overrides it).
--
-- The legacy columns `shop_settings.alert_low_stock`, `alert_sold_out` and `sold_out_display`
-- stay in the table and are no longer read. A shop with no row for a feature (a feature added
-- by a later version) gets its template's value, so adding a feature needs no migration.

create table shop_features (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
    enabled boolean not null,
    -- A value beside the switch: {"mode": "grey"} for the sold-out look.
    config jsonb not null default '{}',
    -- 'template': set by the business type's template, so a re-apply may change it.
    -- 'owner': chosen by the owner or ALYR's staff, so a re-apply never touches it.
    set_by text not null default 'template' check (set_by in ('template', 'owner')),
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tenant_id, key)
);

alter table shop_settings
    add column section_name text not null default '' check (char_length(section_name) <= 40),
    add column section_name_ar text not null default ''
        check (char_length(section_name_ar) <= 40),
    add column layout_style text not null default ''
        check (layout_style in ('', 'menu', 'grid', 'list', 'table')),
    add column template_key text not null default '' check (char_length(template_key) <= 60);

-- ------------------------------------------------------ bring every existing shop across

-- The migration owner normally bypasses row-level security. Where it does not (a hosted
-- database whose admin is not a superuser), forced security would hide the settings rows from
-- these statements, so it is lifted for the length of this transaction.
alter table shop_settings no force row level security;

insert into shop_features (tenant_id, key, enabled, config, set_by, updated_by)
select
    t.id, f.key,
    case f.key
        when 'low_stock_alerts' then coalesce(s.alert_low_stock, true)
        when 'sold_out_alerts' then coalesce(s.alert_sold_out, true)
        else true
    end,
    case when f.key = 'sold_out_display'
         then jsonb_build_object('mode', coalesce(s.sold_out_display, 'grey'))
         else '{}'::jsonb
    end,
    -- The owner's if the shop's value is not the one its type starts with.
    case
        when f.key = 'low_stock_alerts'
             and coalesce(s.alert_low_stock, true) <> d.low_stock_alert then 'owner'
        when f.key = 'sold_out_alerts'
             and coalesce(s.alert_sold_out, true) <> d.sold_out_alert then 'owner'
        when f.key = 'sold_out_display'
             and coalesce(s.sold_out_display, 'grey') <> d.display then 'owner'
        else 'template'
    end,
    'ALYR migration'
from tenants t
left join shop_settings s on s.tenant_id = t.id
join lateral (
    -- What each type starts with (presets_catalog.py): the two alerts and the sold-out look.
    -- The appointment businesses have the Catalog as an extra and start with no alerts; a
    -- type with no setup of its own (travel, a business made in the back office) starts with
    -- both alerts and greyed items.
    select * from (values
        ('restaurant', false, true, 'grey'),
        ('bakery', true, true, 'grey'),
        ('grocery', true, true, 'hide'),
        ('fashion', true, true, 'grey'),
        ('shop', true, true, 'grey'),
        ('wholesale', true, true, 'grey'),
        ('salon', false, false, 'grey'),
        ('spa', false, false, 'grey'),
        ('clinic', false, false, 'grey'),
        ('home', false, false, 'grey')
    ) as v(type, low_stock_alert, sold_out_alert, display)
    where v.type = t.business_type
    union all
    select 'generic', true, true, 'grey'
    where t.business_type not in
        ('restaurant', 'bakery', 'grocery', 'fashion', 'shop', 'wholesale', 'salon', 'spa',
         'clinic', 'home')
) d on true
cross join (values
    ('rule_switch'), ('rule_count'), ('rule_daily_limit'), ('schedule'), ('pickup_date'),
    ('variants'), ('options'), ('price_groups'), ('pack_rules'), ('quick_quantity'),
    ('same_as_last'), ('show_sku'), ('sold_out_display'), ('low_stock_alerts'),
    ('sold_out_alerts'), ('back_in_stock'), ('share_links'), ('table_qr'), ('tags'),
    ('custom_fields')
) as f(key)
on conflict do nothing;

alter table shop_settings force row level security;

-- ------------------------------------------------------------ row-level security

alter table shop_features enable row level security;
alter table shop_features force row level security;
create policy tenant_isolation on shop_features
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- A feature is switched on or off (updated); a row is removed only when a demo shop is reset
-- (the seeds clear every shop table the way they clear `shop_settings`).
grant select, insert, update, delete on shop_features to alyr_app;
