-- Templates made in the back office (ALY-148, decision D-039 "As built (feature engine)").
--
-- A template is a kind of business as a configuration of the Catalog: which features start on,
-- what the section is called, how the order page lays out, how a new item runs out, the starter
-- categories and the starter custom fields. The ten built-in types and the plain one live in
-- code (`shop_templates.py`); a template ALYR's staff make for a new kind of client lives here,
-- with the same shape, so there is one mechanism and the founder can serve a new kind of client
-- without a release.
--
-- Why one global table and not one per shop: a template belongs to ALYR, not to a shop; it is
-- shared by every shop that uses it and a shop never writes it. Everyone may read it (a shop's
-- own session has to, to know what its template says), and only a signed-in member of ALYR's
-- staff may write it (`is_back_office()`, the same rule as the price list). It is never deleted:
-- a template a shop uses must stay readable, so one is archived and no longer offered.
--
-- `features` is {key: {"enabled": bool, "config": {...}}}; `categories` is [{"name", "name_ar"}];
-- `fields` is the starter custom fields as `shop_templates.FieldSeed` has them. The code checks
-- every value on the way in; the table checks only what is cheap.

create table business_templates (
    key text primary key check (key ~ '^[a-z][a-z0-9-]{2,39}$'),
    name text not null check (name <> '' and char_length(name) <= 60),
    name_ar text not null default '' check (char_length(name_ar) <= 60),
    note text not null default '' check (char_length(note) <= 300),
    note_ar text not null default '' check (char_length(note_ar) <= 300),
    -- The built-in business type it stands on: it decides the onboarding way and the prices.
    based_on text not null default '' check (char_length(based_on) <= 30),
    -- A shop's owner may switch to it from Features (the back office always may).
    offered boolean not null default false,
    section text not null check (section <> '' and char_length(section) <= 40),
    section_ar text not null default '' check (char_length(section_ar) <= 40),
    sub text not null default '' check (char_length(sub) <= 200),
    sub_ar text not null default '' check (char_length(sub_ar) <= 200),
    layout_style text not null default 'grid' check (layout_style in ('menu', 'grid', 'list', 'table')),
    rule text not null default 'switch' check (rule in ('always', 'switch', 'count', 'daily_limit')),
    unit text not null default 'piece'
        check (unit in ('piece', 'kg', 'box', 'pack', 'portion', 'hour')),
    low_stock_at integer not null default 5 check (low_stock_at between 0 and 100000),
    sold_out text not null default 'grey' check (sold_out in ('grey', 'hide')),
    -- A new item is ordered for a date: this many days ahead, before this time ("18:00").
    lead_days integer check (lead_days between 0 and 60),
    lead_cutoff text not null default '' check (lead_cutoff ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or lead_cutoff = ''),
    focus text[] not null default '{}',
    features jsonb not null default '{}',
    categories jsonb not null default '[]',
    fields jsonb not null default '[]',
    archived_at timestamptz,
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table business_templates enable row level security;
alter table business_templates force row level security;
create policy business_templates_read on business_templates for select using (true);
create policy business_templates_back_office on business_templates for all
    using (is_back_office()) with check (is_back_office());
grant select, insert, update on business_templates to alyr_app;

-- The back office changes the business type of one business (it decides the onboarding way and
-- what the price list offers, so an owner cannot). The same guard as the other back-office
-- functions: the caller must have declared themselves ALYR staff.
create function admin_set_business_type(p_tenant uuid, p_type text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    update tenants set business_type = p_type where id = p_tenant;
    return found;
end $$;
revoke all on function admin_set_business_type(uuid, text) from public;
grant execute on function admin_set_business_type(uuid, text) to alyr_app;

-- How many businesses use each template, for the back office's list. It reads across shops, so
-- like the other cross-shop reads it is a function that checks the caller is ALYR staff.
create function admin_template_usage() returns table (template_key text, shops bigint)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select s.template_key, count(*) from shop_settings s where s.template_key <> ''
    group by s.template_key;
end $$;
revoke all on function admin_template_usage() from public;
grant execute on function admin_template_usage() to alyr_app;
