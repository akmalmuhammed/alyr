-- A shop's own WhatsApp account, connected by the shop through Embedded Signup (ALY-39, spec 063,
-- D-148, D-149).
--
-- Numbers on ALYR's own WhatsApp account are attached by staff (migration 0053) and sent with ALYR's one
-- system-user token. A shop that connects its own account gets a token of its own from Meta, which ALYR
-- must keep to send, read templates and read health for that shop. It is sealed (AES-256-GCM under
-- `ALYR_CHANNEL_KEYS_KEY`, in Secret Manager) before it reaches this table: the column holds ciphertext,
-- never a token (`core/channel_keys.py`).
--
-- The shop's owner, not ALYR staff, causes the attach, so a function the app role may call does what
-- `admin_attach_whatsapp_number` does for staff, and only when its caller has just proved the
-- connection: it needs the sealed credentials already stored for this very number in this very
-- transaction scope, and a setting only the sign-up code sets. The app role still cannot write
-- `channel_numbers` itself.

create table channel_credentials (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    number_id text not null,
    waba_id text not null,
    -- The shop's own access token (and the PIN the number was registered with), sealed.
    sealed bytea not null,
    -- The last four characters of the token, to tell two apart. Never enough to use.
    hint text not null default '',
    -- When Meta says the token ends, if it says.
    expires_at timestamptz,
    kind text not null default 'embedded_signup',
    created_at timestamptz not null default now(),
    created_by text not null default '',
    primary key (tenant_id, number_id)
);

alter table channel_credentials enable row level security;
alter table channel_credentials force row level security;
create policy tenant_isolation on channel_credentials
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on channel_credentials to alyr_app;

-- Which token to send for a number or an account: the channel asks before every call, with no business
-- in hand (a webhook, a job). Answers the newest credentials for that number ID or account ID. The
-- sealed value is useless without the key, which never reaches the database.
create function channel_credential_for(p_ident text)
returns table (tenant_id uuid, number_id text, waba_id text, sealed bytea, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
    select c.tenant_id, c.number_id, c.waba_id, c.sealed, c.expires_at
    from channel_credentials c
    join channel_numbers n on n.tenant_id = c.tenant_id and n.number_id = c.number_id
    where c.number_id = p_ident or c.waba_id = p_ident
    order by c.created_at desc
    limit 1
$$;
revoke all on function channel_credential_for(text) from public;
grant execute on function channel_credential_for(text) to alyr_app;

-- Attach a number the shop's owner has just connected. Called by the sign-up code in the shop's own
-- scope, after Meta has confirmed the number with the shop's own token and the credentials are stored.
create function signup_attach_whatsapp_number(
    p_number_id text, p_waba_id text, p_display_phone text, p_by text
) returns void
language plpgsql security definer set search_path = public as $$
declare
    v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
begin
    if v_tenant is null or coalesce(current_setting('app.whatsapp_signup', true), '') <> 'on' then
        raise exception 'only the sign-up code may attach a number this way'
            using errcode = '42501';
    end if;
    if p_number_id !~ '^[0-9]{5,20}$' or p_waba_id !~ '^[0-9]{5,20}$' then
        raise exception 'a number ID and an account ID are digits only' using errcode = '22023';
    end if;
    if not exists (select 1 from channel_credentials
                   where tenant_id = v_tenant and number_id = p_number_id and waba_id = p_waba_id) then
        raise exception 'no credentials are stored for that number' using errcode = '42501';
    end if;
    if exists (select 1 from channel_numbers where number_id = p_number_id) then
        raise exception 'that number is already attached to a business' using errcode = '23505';
    end if;
    if exists (select 1 from channel_numbers where tenant_id = v_tenant and channel = 'meta') then
        raise exception 'this business already has a WhatsApp number; detach it first'
            using errcode = '23505';
    end if;
    insert into channel_numbers
        (number_id, tenant_id, channel, waba_id, display_phone, attached_at, attached_by)
    values (p_number_id, v_tenant, 'meta', p_waba_id, p_display_phone, now(), p_by);
end $$;
revoke all on function signup_attach_whatsapp_number(text, text, text, text) from public;
grant execute on function signup_attach_whatsapp_number(text, text, text, text) to alyr_app;

-- The back office's list of lines also says whose token a line is sent with, and when it ends.
drop function admin_whatsapp_lines();
create function admin_whatsapp_lines()
returns table (
    tenant_id uuid, name text, slug text, client_id uuid, number_id text, waba_id text,
    display_phone text, attached_at timestamptz, attached_by text,
    checked_at timestamptz, check_ok boolean, checks jsonb,
    test_message_id uuid, test_at timestamptz, test_by text,
    test_status text, test_error text, last_inbound_at timestamptz, staff_numbers bigint,
    quality_rating text, number_status text, name_status text, name_decision text,
    name_reason text, messaging_limit text, throughput text, health text, account jsonb,
    severity text, reasons jsonb, polled_at timestamptz, event_at timestamptz,
    credential text, credential_expires_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select t.id, t.name, t.slug, t.client_id, c.number_id, c.waba_id, c.display_phone,
           c.attached_at, c.attached_by,
           s.checked_at, s.check_ok, coalesce(s.checks, '[]'::jsonb),
           s.test_message_id, s.test_at, coalesce(s.test_by, ''),
           m.status, m.error,
           (select max(k.last_inbound_at) from contacts k
             where k.tenant_id = t.id and k.number_id = c.number_id),
           (select count(*) from contacts k
             where k.tenant_id = t.id and k.number_id = c.number_id and k.role = 'staff'),
           coalesce(h.quality_rating, ''), coalesce(h.number_status, ''),
           coalesce(h.name_status, ''), coalesce(h.name_decision, ''), coalesce(h.name_reason, ''),
           coalesce(h.messaging_limit, ''), coalesce(h.throughput, ''), coalesce(h.health, ''),
           coalesce(h.account, '{}'::jsonb), coalesce(h.severity, 'unknown'),
           coalesce(h.reasons, '[]'::jsonb), h.polled_at, h.event_at,
           case when cr.number_id is null then 'shared' else 'own' end, cr.expires_at
    from channel_numbers c
    join tenants t on t.id = c.tenant_id
    left join whatsapp_line_state s on s.tenant_id = c.tenant_id and s.number_id = c.number_id
    left join messages m on m.id = s.test_message_id and m.tenant_id = c.tenant_id
    left join whatsapp_line_health h on h.tenant_id = c.tenant_id and h.number_id = c.number_id
    left join channel_credentials cr on cr.tenant_id = c.tenant_id and cr.number_id = c.number_id
    where c.channel = 'meta'
    order by t.name;
end $$;
revoke all on function admin_whatsapp_lines() from public;
grant execute on function admin_whatsapp_lines() to alyr_app;
