-- Pricing and onboarding under ALYR's control (ALY-78, decision D-032).
--
-- A client (the paying company) owns one or more businesses. ALYR keeps a price list,
-- drafts a quote for each client from it, edits the quote in the back office, and
-- publishes it; the owner sees it live as the last step of onboarding and accepts it.
-- An accepted quote can never change. Which business types may sign up on their own,
-- and whether their owners see a price straight away, are switches ALYR controls.
--
-- These tables are global (a client spans businesses; the price list belongs to ALYR).
-- Each has forced row-level security: an owner reads only their own client and its
-- published quotes, and only the back office (the API declares it checked the caller,
-- as in 0011) may write.

create function is_back_office() returns boolean
language sql stable as $$
    select coalesce(current_setting('app.platform_admin', true), '') = 'on'
$$;

create table clients (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    contact_name text not null default '',
    contact_email text not null default '',
    contact_phone text not null default '',
    note text not null default '',
    -- When this client's owner sees a price: null follows their business type.
    price_mode text check (price_mode in ('automatic', 'prepared')),
    created_at timestamptz not null default now()
);

alter table tenants
    add column client_id uuid references clients(id),
    -- The onboarding path the business started on, kept even if ALYR later changes
    -- the switch for its type: 'appointments' or 'assisted'.
    add column onboarding_way text not null default '';

-- The client of the business in scope, or null.
create function own_client() returns uuid
language sql stable as $$
    select client_id from tenants
    where id = nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Every business that exists today becomes its own client, with its first owner as
-- the contact.
do $$
declare
    t record;
    v_client uuid;
begin
    for t in select id, name, created_at from tenants where client_id is null loop
        insert into clients (name, contact_name, contact_email, created_at)
        select t.name, coalesce(o.name, ''), coalesce(o.email, ''), t.created_at
        from (select 1) one
        left join lateral (
            select u.name, u.email from memberships m join users u on u.id = m.user_id
            where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1
        ) o on true
        returning id into v_client;
        update tenants set client_id = v_client where id = t.id;
    end loop;
end $$;

-- What ALYR charges for. Prices are in dirhams (100 is QAR 1); a monthly item is
-- charged each month, a one-time item once. `applies` says when a quote drafted from
-- the list includes the item, and how many times:
--   each_business   once for every business of the client
--   each_client     once for the client
--   product:<key>   for every business with that product on
--   module:<key>    for every business with that module on
--   manual          only when ALYR adds it to a quote by hand
create table price_items (
    key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
    name text not null,
    name_ar text not null default '',
    kind text not null check (kind in ('monthly', 'one_time')),
    price integer not null check (price >= 0),
    applies text not null
        check (applies ~ '^(each_business|each_client|manual|product:[a-z_]+|module:[a-z_]+)$'),
    active boolean not null default true,
    sort integer not null default 0,
    updated_at timestamptz not null default now(),
    updated_by text not null default ''
);

-- Starting values, from the founder's field-sales price (QAR 449 a month per business)
-- and D-017 (setup and extra team members). ALYR edits them in the back office.
insert into price_items (key, name, name_ar, kind, price, applies, sort, updated_by) values
    ('chat', 'ALYR Chat', 'ALYR Chat', 'monthly', 44900, 'product:chat', 10, 'Starting values'),
    ('credit', 'Credit accounts', 'حسابات الآجل', 'monthly', 0, 'product:credit', 20,
     'Starting values'),
    ('setup', 'Setup: number connection, data and training', 'الإعداد: ربط الرقم والبيانات والتدريب',
     'one_time', 250000, 'each_business', 30, 'Starting values'),
    ('extra_member', 'Extra team member', 'عضو إضافي في الفريق', 'monthly', 4000, 'manual', 40,
     'Starting values');

-- Per type of business: may an owner sign up on their own ('self_serve'), is the
-- business created and then set up with ALYR ('with_alyr'), or is the type not
-- offered ('hidden')? And does the owner see a price straight away ('automatic') or
-- once ALYR has prepared it ('prepared')? A type with no row uses the code's default.
create table business_type_settings (
    key text primary key,
    availability text not null check (availability in ('self_serve', 'with_alyr', 'hidden')),
    price_mode text not null default 'prepared' check (price_mode in ('automatic', 'prepared')),
    updated_at timestamptz not null default now(),
    updated_by text not null default ''
);

-- ALYR-wide settings edited in the back office, such as the promise under the price.
create table platform_settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by text not null default ''
);
insert into platform_settings (key, value, updated_by) values (
    'promise',
    jsonb_build_object(
        'en', 'If no customer books through WhatsApp in your first 30 days, your first month is free.',
        'ar', 'إذا لم يحجز أي عميل عبر واتساب خلال أول 30 يوماً، يكون شهرك الأول مجاناً.'
    ),
    'Founder, 16 Oct 2026'
);

-- A price offered to a client. Draft: only ALYR sees it. Published: the owner sees it
-- and may accept it. Accepted: agreed, and locked. Superseded: an accepted quote that
-- a newer accepted one replaced. Withdrawn: a draft or published quote ALYR dropped.
create table quotes (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id),
    number integer not null,
    status text not null default 'draft'
        check (status in ('draft', 'published', 'accepted', 'superseded', 'withdrawn')),
    -- How often the client pays, and a discount on the monthly items.
    period_months integer not null default 1 check (period_months in (1, 3, 6, 12)),
    discount_pct integer not null default 0 check (discount_pct between 0 and 100),
    show_promise boolean not null default true,
    note text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by text not null default '',
    published_at timestamptz,
    accepted_at timestamptz,
    accepted_by uuid references users(id),
    accepted_by_name text not null default '',
    unique (client_id, number)
);
-- A client has at most one quote being worked on or waiting for their answer.
create unique index quotes_one_open on quotes (client_id) where status in ('draft', 'published');

create table quote_lines (
    id uuid primary key default gen_random_uuid(),
    quote_id uuid not null references quotes(id),
    -- The business the line is for; null for a line that covers the whole client.
    business_id uuid references tenants(id),
    -- The price-list item it came from; null for a line ALYR wrote by hand.
    item_key text,
    name text not null,
    name_ar text not null default '',
    kind text not null check (kind in ('monthly', 'one_time')),
    quantity integer not null default 1 check (quantity between 1 and 1000),
    -- Negative for a discount line.
    unit_price integer not null check (unit_price between -100000000 and 100000000),
    sort integer not null default 0
);
create index quote_lines_quote on quote_lines (quote_id, sort);

-- What a client accepted never changes: not its lines, not its terms. The only change
-- an accepted quote allows is being superseded by a newer accepted one.
create function quotes_locked() returns trigger
language plpgsql as $$
begin
    if old.status = 'accepted' and new.status = 'superseded' then
        return new;
    end if;
    if old.status in ('accepted', 'superseded', 'withdrawn') then
        raise exception 'quote % is %, so it cannot change', old.number, old.status
            using errcode = '42501';
    end if;
    return new;
end $$;
create trigger quotes_locked before update on quotes
    for each row execute function quotes_locked();

create function quote_lines_locked() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_status text;
begin
    select status into v_status from quotes where id = coalesce(new.quote_id, old.quote_id);
    if v_status in ('accepted', 'superseded', 'withdrawn') then
        raise exception 'the lines of a % quote cannot change', v_status using errcode = '42501';
    end if;
    return coalesce(new, old);
end $$;
create trigger quote_lines_locked before insert or update or delete on quote_lines
    for each row execute function quote_lines_locked();

-- Row-level security. Owners read their own client and its quotes once published;
-- everything else, and every write, is the back office's.
alter table clients enable row level security;
alter table clients force row level security;
create policy clients_own on clients for select using (id = own_client());
create policy clients_back_office on clients for all
    using (is_back_office()) with check (is_back_office());

alter table price_items enable row level security;
alter table price_items force row level security;
create policy price_items_read on price_items for select using (true);
create policy price_items_back_office on price_items for all
    using (is_back_office()) with check (is_back_office());

alter table business_type_settings enable row level security;
alter table business_type_settings force row level security;
create policy business_types_read on business_type_settings for select using (true);
create policy business_types_back_office on business_type_settings for all
    using (is_back_office()) with check (is_back_office());

alter table platform_settings enable row level security;
alter table platform_settings force row level security;
create policy platform_settings_read on platform_settings for select using (true);
create policy platform_settings_back_office on platform_settings for all
    using (is_back_office()) with check (is_back_office());

alter table quotes enable row level security;
alter table quotes force row level security;
create policy quotes_own on quotes for select
    using (client_id = own_client() and status in ('published', 'accepted', 'superseded'));
create policy quotes_back_office on quotes for all
    using (is_back_office()) with check (is_back_office());

alter table quote_lines enable row level security;
alter table quote_lines force row level security;
create policy quote_lines_own on quote_lines for select
    using (exists (select 1 from quotes q where q.id = quote_id));
create policy quote_lines_back_office on quote_lines for all
    using (is_back_office()) with check (is_back_office());

grant select, insert, update on clients, price_items, business_type_settings,
    platform_settings, quotes to alyr_app;
grant select, insert, update, delete on quote_lines to alyr_app;

-- The owner's first quote, drafted by the API from the price list when the business is
-- created. Published at once if the client's price mode is automatic. Only a client's
-- first quote is made here; after that ALYR works on it in the back office.
create function create_own_quote(p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
    v_client uuid;
    v_type text;
    v_mode text;
    v_quote uuid;
begin
    select client_id, business_type into v_client, v_type from tenants where id = v_tenant;
    if v_client is null then
        raise exception 'no client in scope' using errcode = '42501';
    end if;
    if exists (select 1 from quotes where client_id = v_client) then
        return null;
    end if;
    select coalesce(c.price_mode, s.price_mode, 'prepared') into v_mode
    from clients c left join business_type_settings s on s.key = v_type
    where c.id = v_client;
    insert into quotes (client_id, number, status, published_at, updated_by)
    values (v_client, 1, case when v_mode = 'automatic' then 'published' else 'draft' end,
            case when v_mode = 'automatic' then now() end, 'Drafted at sign-up')
    returning id into v_quote;
    insert into quote_lines (quote_id, business_id, item_key, name, name_ar, kind, quantity,
                             unit_price, sort)
    select v_quote, case when l.for_business then v_tenant end, l.item_key, l.name,
           coalesce(l.name_ar, ''), l.kind, coalesce(l.quantity, 1), l.unit_price,
           coalesce(l.sort, 0)
    from jsonb_to_recordset(p_lines) as l(
        for_business boolean, item_key text, name text, name_ar text, kind text,
        quantity integer, unit_price integer, sort integer
    );
    return v_quote;
end $$;

-- The owner accepts the quote ALYR published for their client. Any earlier accepted
-- quote is superseded. Answers false if that quote is not waiting for their answer.
create function accept_own_quote(p_quote uuid, p_user uuid, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
    v_client uuid := own_client();
begin
    if v_client is null then
        raise exception 'no client in scope' using errcode = '42501';
    end if;
    if not exists (select 1 from quotes where id = p_quote and client_id = v_client
                   and status = 'published') then
        return false;
    end if;
    update quotes set status = 'superseded', updated_at = now()
        where client_id = v_client and status = 'accepted';
    update quotes set status = 'accepted', accepted_at = now(), accepted_by = p_user,
                      accepted_by_name = p_name, updated_at = now()
        where id = p_quote;
    return true;
end $$;

revoke all on function create_own_quote(jsonb) from public;
revoke all on function accept_own_quote(uuid, uuid, text) from public;
grant execute on function create_own_quote(jsonb) to alyr_app;
grant execute on function accept_own_quote(uuid, uuid, text) to alyr_app;

-- Sign-up now also creates the client and records the onboarding path.
drop function signup_create_business(text, text, text, text, text, text, text, text, text[]);
create function signup_create_business(
    p_token_hash text, p_owner_name text, p_name text, p_name_ar text, p_slug text,
    p_business_type text, p_area text, p_way text, p_first_step text, p_modules text[]
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

    insert into clients (name, contact_name, contact_email)
        values (p_name, p_owner_name, v_email)
        returning id into v_client;
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
    return v_tenant;
end $$;
revoke all on function signup_create_business(text, text, text, text, text, text, text, text, text, text[]) from public;
grant execute on function signup_create_business(text, text, text, text, text, text, text, text, text, text[]) to alyr_app;

-- The back office creates a business for a new client, or adds one to an existing
-- client.
drop function admin_create_business(text, text, text, text, text, text[]);
create function admin_create_business(
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
    return v_tenant;
end $$;
revoke all on function admin_create_business(text, text, text, text, text, text[], uuid) from public;
grant execute on function admin_create_business(text, text, text, text, text, text[], uuid) to alyr_app;

-- Move a business to another client, for an owner who signed up twice.
create function admin_set_business_client(p_tenant uuid, p_client uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    update tenants set client_id = p_client
        where id = p_tenant and exists (select 1 from clients where id = p_client);
    return found;
end $$;
revoke all on function admin_set_business_client(uuid, uuid) from public;
grant execute on function admin_set_business_client(uuid, uuid) to alyr_app;

-- Every business, now with its client and where it is in onboarding.
drop function admin_businesses();
create function admin_businesses()
returns table (
    id uuid, name text, slug text, created_at timestamptz, modules text[],
    members bigint, open_requests bigint, whatsapp_connected boolean,
    client_id uuid, business_type text, area text, onboarding_way text,
    onboarding_step text, onboarded_at timestamptz
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
           t.onboarded_at
    from tenants t
    order by t.created_at desc;
end $$;
revoke all on function admin_businesses() from public;
grant execute on function admin_businesses() to alyr_app;
