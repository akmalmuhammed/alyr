-- Sign-up through a sales link (ALY-216, D-105, spec 041).
--
-- `signup_create_business` as migration 0015 left it, with one new argument: the sales link the
-- owner arrived by. Without it nothing changes. With it the business is made for the lead's
-- own client instead of a new one, and only if the database itself finds that:
--   * the link is unused, not revoked and has not run out (it is locked, so two owners cannot
--     use one link at the same moment);
--   * the client has no business yet;
--   * the email the one-time sign-up token proved is the email ALYR recorded for the client.
-- The link is marked used in the same transaction as the business, and the lines of the quote
-- that were written before the business existed (priced per business, with none to point at)
-- are attached to it.

drop function signup_create_business(text, text, text, text, text, text, text, text, text, text[]);

create function signup_create_business(
    p_token_hash text, p_owner_name text, p_name text, p_name_ar text, p_slug text,
    p_business_type text, p_area text, p_way text, p_first_step text, p_modules text[],
    p_sales_link uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_email text;
    v_client uuid;
    v_tenant uuid;
    v_user uuid;
    v_module text;
begin
    select email into v_email from signup_tokens
        where token_hash = p_token_hash and not used and expires_at > now()
        for update;
    if v_email is null then
        raise exception 'sign-up token is not valid' using errcode = '42501';
    end if;
    update signup_tokens set used = true where token_hash = p_token_hash;

    if p_sales_link is null then
        insert into clients (name, contact_name, contact_email)
            values (p_name, p_owner_name, v_email)
            returning id into v_client;
    else
        select client_id into v_client from sales_links
            where id = p_sales_link and revoked_at is null and claimed_at is null
              and expires_at > now()
            for update;
        if v_client is null
           or not exists (select 1 from clients c
                          where c.id = v_client and lower(c.contact_email) = v_email)
           or exists (select 1 from tenants t where t.client_id = v_client) then
            raise exception 'sales link is not valid' using errcode = '42501';
        end if;
    end if;

    insert into tenants (name, name_ar, slug, business_type, area, onboarding_way,
                         onboarding_step, onboarded_at, client_id)
        values (p_name, p_name_ar, p_slug, p_business_type, p_area, p_way, p_first_step,
                null, v_client)
        returning id into v_tenant;
    insert into users (email, name) values (v_email, p_owner_name)
        on conflict (email) do update set email = excluded.email
        returning id into v_user;
    insert into memberships (tenant_id, user_id, role) values (v_tenant, v_user, 'owner');
    foreach v_module in array coalesce(p_modules, '{}') loop
        insert into tenant_modules (tenant_id, module_key, enabled_by)
            values (v_tenant, v_module, 'Sign-up');
    end loop;
    -- A private test line, so the owner can try the business as a customer before
    -- any WhatsApp number is connected. Messages on it never leave ALYR.
    insert into channel_numbers (number_id, tenant_id, channel)
        values ('sim-' || p_slug, v_tenant, 'simulator');

    if p_sales_link is not null then
        update sales_links set claimed_at = now(), claimed_tenant = v_tenant
            where id = p_sales_link;
        -- The quote was drafted for a business that did not exist: its lines that the price
        -- list charges per business now belong to this one.
        update quote_lines set business_id = v_tenant
            where business_id is null
              and quote_id in (select id from quotes
                               where client_id = v_client and status in ('draft', 'published'))
              and item_key in (select key from price_items where applies <> 'each_client');
    end if;
    return v_tenant;
end $$;
revoke all on function signup_create_business(text, text, text, text, text, text, text, text, text, text[], uuid) from public;
grant execute on function signup_create_business(text, text, text, text, text, text, text, text, text, text[], uuid) to alyr_app;
