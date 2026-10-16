-- The workspace shell and ALYR's back office (ALY-18, decision D-027).
--
-- A shop's products are switched on per module in tenant_modules (one row per module,
-- created in 0001). This adds when and by whom, the shop's requests for help with
-- setup, the list of ALYR's own staff, and a few narrow functions through which the
-- back office works across shops without the app role ever bypassing row-level
-- security.

alter table tenant_modules
    add column enabled_at timestamptz not null default now(),
    add column enabled_by text not null default '';

-- "Ask ALYR": a shop asks us to do a setup step for them. Tenant-owned.
create table setup_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    product_key text not null,
    step_key text not null default '',
    note text not null default '',
    requested_by text not null default '',
    status text not null default 'open' check (status in ('open', 'done')),
    created_at timestamptz not null default now(),
    done_at timestamptz
);
create index setup_requests_open on setup_requests (tenant_id, status, created_at);
alter table setup_requests enable row level security;
alter table setup_requests force row level security;
create policy tenant_isolation on setup_requests
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update on setup_requests to alyr_app;

-- ALYR's own staff, who may use the back office. Global: these people belong to ALYR,
-- not to a shop. The app can read the list but not change it.
create table platform_admins (
    email text primary key check (email = lower(email)),
    created_at timestamptz not null default now()
);
grant select on platform_admins to alyr_app;

-- Back-office functions. They run as the owner role so they can see across shops, and
-- each refuses to run unless the API has declared, inside the same transaction, that
-- it verified the caller is ALYR staff. The app role can call nothing else that
-- crosses shops.
create function assert_platform_admin() returns void
language plpgsql as $$
begin
    if coalesce(current_setting('app.platform_admin', true), '') <> 'on' then
        raise exception 'back office only' using errcode = '42501';
    end if;
end $$;

create function admin_create_business(
    p_name text, p_name_ar text, p_slug text, p_owner_email text, p_owner_name text,
    p_modules text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_tenant uuid;
    v_user uuid;
    v_module text;
begin
    perform assert_platform_admin();
    insert into tenants (name, name_ar, slug) values (p_name, p_name_ar, p_slug)
        returning id into v_tenant;
    insert into users (email, name) values (lower(p_owner_email), p_owner_name)
        on conflict (email) do update set email = excluded.email
        returning id into v_user;
    insert into memberships (tenant_id, user_id, role) values (v_tenant, v_user, 'owner');
    foreach v_module in array coalesce(p_modules, '{}') loop
        insert into tenant_modules (tenant_id, module_key, enabled_by)
            values (v_tenant, v_module, 'ALYR back office');
    end loop;
    return v_tenant;
end $$;

create function admin_businesses()
returns table (
    id uuid, name text, slug text, created_at timestamptz, modules text[],
    members bigint, open_requests bigint, whatsapp_connected boolean
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
           exists (select 1 from channel_numbers c where c.tenant_id = t.id and c.channel = 'meta')
    from tenants t
    order by t.created_at desc;
end $$;

create function admin_setup_requests(p_status text)
returns table (
    id uuid, tenant_id uuid, business text, product_key text, step_key text, note text,
    requested_by text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select r.id, r.tenant_id, t.name, r.product_key, r.step_key, r.note, r.requested_by,
           r.status, r.created_at
    from setup_requests r join tenants t on t.id = r.tenant_id
    where p_status = 'all' or r.status = p_status
    order by r.created_at;
end $$;

create function admin_resolve_setup_request(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    update setup_requests set status = 'done', done_at = now()
        where id = p_id and status = 'open';
    return found;
end $$;

revoke all on function admin_create_business(text, text, text, text, text, text[]) from public;
revoke all on function admin_businesses() from public;
revoke all on function admin_setup_requests(text) from public;
revoke all on function admin_resolve_setup_request(uuid) from public;
grant execute on function assert_platform_admin() to alyr_app;
grant execute on function admin_create_business(text, text, text, text, text, text[]) to alyr_app;
grant execute on function admin_businesses() to alyr_app;
grant execute on function admin_setup_requests(text) to alyr_app;
grant execute on function admin_resolve_setup_request(uuid) to alyr_app;
