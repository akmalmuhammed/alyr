-- Self-serve onboarding (ALY-76, decision D-031).
--
-- A new owner proves their email with a code, then creates their business in one step.
-- The app role still cannot write `tenants`: it creates a business only through
-- `signup_create_business`, which spends a single-use sign-up token the API issued
-- after checking the code.

alter table tenants
    add column business_type text not null default '',
    add column area text not null default '',
    -- Where the owner is in the onboarding flow; empty once finished.
    add column onboarding_step text not null default '',
    add column onboarded_at timestamptz,
    -- Booking reminders two hours before the visit. On by default.
    add column booking_reminders boolean not null default true;

-- Every business that exists today was set up by hand, so it counts as onboarded.
update tenants set onboarded_at = created_at;

-- A verified email that may create one business. Global: it belongs to a person
-- before any business exists. Only a hash of the token is stored.
create table signup_tokens (
    token_hash text primary key,
    email text not null check (email = lower(email)),
    expires_at timestamptz not null,
    used boolean not null default false,
    created_at timestamptz not null default now()
);
grant select, insert, update, delete on signup_tokens to alyr_app;

create function signup_create_business(
    p_token_hash text, p_owner_name text, p_name text, p_name_ar text, p_slug text,
    p_business_type text, p_area text, p_first_step text, p_modules text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_email text;
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

    insert into tenants (name, name_ar, slug, business_type, area, onboarding_step, onboarded_at)
        values (p_name, p_name_ar, p_slug, p_business_type, p_area, p_first_step, null)
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
    return v_tenant;
end $$;

revoke all on function signup_create_business(text, text, text, text, text, text, text, text, text[]) from public;
grant execute on function signup_create_business(text, text, text, text, text, text, text, text, text[]) to alyr_app;

-- A business may change a few of its own details, and only its own: the row is the one
-- named by the transaction's tenant, never one the caller passes in. The app role still
-- cannot write `tenants` directly. Null leaves a field unchanged.
create function update_own_business(
    p_name text, p_name_ar text, p_area text, p_step text, p_reminders boolean,
    p_finished boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
    v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
begin
    if v_tenant is null then
        raise exception 'no business in scope' using errcode = '42501';
    end if;
    update tenants set
        name = coalesce(nullif(p_name, ''), name),
        name_ar = coalesce(p_name_ar, name_ar),
        area = coalesce(p_area, area),
        onboarding_step = coalesce(p_step, onboarding_step),
        booking_reminders = coalesce(p_reminders, booking_reminders),
        onboarded_at = case when p_finished then coalesce(onboarded_at, now()) else onboarded_at end
    where id = v_tenant;
end $$;

revoke all on function update_own_business(text, text, text, text, boolean, boolean) from public;
grant execute on function update_own_business(text, text, text, text, boolean, boolean) to alyr_app;
