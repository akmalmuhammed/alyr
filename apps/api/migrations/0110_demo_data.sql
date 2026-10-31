-- Demo data in an existing business (spec 063, decision D-150).
--
-- Two things, and nothing else:
--
-- 1. `tenants.demo_data_allowed`: a business may be loaded with made-up demo data only when
--    ALYR staff have said so. It is false for every business, and the app role cannot write
--    `tenants`: it is set by the back-office function below (which writes the audit entry in
--    the same call from the route) or by the documented SQL step in docs/runbooks/demo-data.md.
--    The command `python -m alyr.seed_into_business` refuses a business where it is false.
--
-- 2. `demo_seed_runs`: what one load wrote, so that a later `--remove` deletes exactly that and
--    nothing else. `manifest` holds, per table, the primary keys of the rows the load added
--    ("inserted") and the earlier image of the few rows of the business's own that the load
--    had to change ("restore"). The load itself never sends anything (the command has no
--    channel); the table is the business's own and is deleted with it.

alter table tenants
    add column demo_data_allowed boolean not null default false,
    add column demo_data_allowed_at timestamptz,
    add column demo_data_allowed_by text not null default '';

create function admin_set_demo_data_allowed(p_tenant uuid, p_allowed boolean, p_by text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    update tenants
       set demo_data_allowed = p_allowed,
           demo_data_allowed_at = case when p_allowed then now() else null end,
           demo_data_allowed_by = case when p_allowed then coalesce(p_by, '') else '' end
     where id = p_tenant;
    return found;
end $$;
revoke all on function admin_set_demo_data_allowed(uuid, boolean, text) from public;
grant execute on function admin_set_demo_data_allowed(uuid, boolean, text) to alyr_app;

create table demo_seed_runs (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    created_at timestamptz not null default now(),
    -- active: its rows are in the business; removed: they were taken out again
    status text not null default 'active' check (status in ('active', 'removed')),
    removed_at timestamptz,
    -- the moment the story ends ("today" when it was loaded) and the seed it was drawn from
    story_end timestamptz not null,
    seed text not null default '',
    -- who ran it, as the command was told
    run_by text not null default '',
    -- {"inserted": {table: [[pk, ...], ...]}, "restore": {table: [{"pk": [...], "row": {...}}]}}
    manifest jsonb not null default '{}',
    -- counts per area, as the command printed them
    counts jsonb not null default '{}'
);
create index demo_seed_runs_shop on demo_seed_runs (tenant_id, created_at desc);
create unique index demo_seed_runs_one_active on demo_seed_runs (tenant_id) where status = 'active';

alter table demo_seed_runs enable row level security;
alter table demo_seed_runs force row level security;
create policy tenant_isolation on demo_seed_runs
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- The app role reads it (the back office shows whether a business holds demo data); only the
-- command, running as the database owner, writes it.
grant select on demo_seed_runs to alyr_app;

-- The back office lists every business; now with whether demo data may be loaded and whether it is
-- loaded. Same security as before: platform staff only, owner-run, granted to the app role.
drop function admin_businesses();
create function admin_businesses()
returns table (
    id uuid, name text, slug text, created_at timestamptz, modules text[],
    members bigint, open_requests bigint, whatsapp_connected boolean,
    client_id uuid, business_type text, area text, onboarding_way text,
    onboarding_step text, onboarded_at timestamptz,
    demo_data_allowed boolean, demo_data_loaded boolean
)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select t.id, t.name, t.slug, t.created_at,
           coalesce((select array_agg(m.module_key order by m.module_key) from tenant_modules m
                     where m.tenant_id = t.id and m.enabled), '{}'),
           (select count(*) from memberships ms where ms.tenant_id = t.id),
           (select count(*) from setup_requests r where r.tenant_id = t.id and r.status = 'open'),
           exists (select 1 from channel_numbers c where c.tenant_id = t.id and c.channel = 'meta'),
           t.client_id, t.business_type, t.area, t.onboarding_way, t.onboarding_step,
           t.onboarded_at,
           t.demo_data_allowed,
           exists (select 1 from demo_seed_runs d where d.tenant_id = t.id and d.status = 'active')
    from tenants t
    order by t.created_at desc;
end $$;
revoke all on function admin_businesses() from public;
grant execute on function admin_businesses() to alyr_app;
