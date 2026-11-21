-- A business made in the back office gets a private test line, as one made at /start does
-- (`signup_create_business`, migration 0015): a simulator number the owner's test customer writes
-- to, so "Try it" works and the readiness check "You tried it as a customer" can go green
-- before any WhatsApp number is connected. Until now only /start made one, so a business created
-- from /ops had none and its owner could not test. Messages on it never leave ALYR.
--
-- The same function, the same arguments, the same grants: the one added statement is the
-- `channel_numbers` row. `create or replace` keeps the grants and the revoke from 0015. Businesses
-- made in the back office before this are not changed.
create or replace function admin_create_business(
    p_name text, p_name_ar text, p_slug text, p_owner_email text, p_owner_name text,
    p_modules text[], p_client uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_client uuid := p_client;
    v_tenant uuid;
    v_user uuid;
    v_module text;
begin
    perform assert_platform_admin();
    if v_client is null then
        insert into clients (name, contact_name, contact_email)
            values (p_name, p_owner_name, lower(p_owner_email))
            returning id into v_client;
    elsif not exists (select 1 from clients where id = v_client) then
        raise exception 'no such client' using errcode = '23503';
    end if;
    insert into tenants (name, name_ar, slug, client_id) values (p_name, p_name_ar, p_slug, v_client)
        returning id into v_tenant;
    insert into users (email, name) values (lower(p_owner_email), p_owner_name)
        on conflict (email) do update set email = excluded.email
        returning id into v_user;
    insert into memberships (tenant_id, user_id, role) values (v_tenant, v_user, 'owner');
    foreach v_module in array coalesce(p_modules, '{}') loop
        insert into tenant_modules (tenant_id, module_key, enabled_by)
            values (v_tenant, v_module, 'ALYR back office');
    end loop;
    insert into channel_numbers (number_id, tenant_id, channel)
        values ('sim-' || p_slug, v_tenant, 'simulator');
    return v_tenant;
end $$;
