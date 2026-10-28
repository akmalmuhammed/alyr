-- Attaching a business's Meta number from the back office (ALY-166; spec 023).
--
-- Until now a Meta row in `channel_numbers` came only from the seed scripts. ALYR staff
-- attach the number a business has on ALYR's own WhatsApp account (a new number, D-050)
-- after Meta has confirmed it. The app role still cannot write `channel_numbers`: the
-- two functions below do, for platform staff only, and the back office writes the audit
-- entry in the same transaction (action `whatsapp.attached` / `whatsapp.detached`), so
-- the history of who attached what stays in the append-only `platform_audit`.

alter table channel_numbers
    add column display_phone text not null default '',
    add column attached_at timestamptz,
    add column attached_by text not null default '';

-- Attach: one Meta number per business for now (detach first to change it), and a Meta
-- number belongs to one business only.
create function admin_attach_whatsapp_number(
    p_tenant uuid, p_number_id text, p_waba_id text, p_display_phone text, p_by text
) returns void
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    if p_number_id !~ '^[0-9]{5,20}$' then
        raise exception 'a number ID is digits only' using errcode = '22023';
    end if;
    if not exists (select 1 from tenants where id = p_tenant) then
        raise exception 'no such business' using errcode = 'P0002';
    end if;
    if exists (select 1 from channel_numbers where number_id = p_number_id) then
        raise exception 'that number is already attached to a business' using errcode = '23505';
    end if;
    if exists (select 1 from channel_numbers where tenant_id = p_tenant and channel = 'meta') then
        raise exception 'this business already has a WhatsApp number; detach it first'
            using errcode = '23505';
    end if;
    insert into channel_numbers
        (number_id, tenant_id, channel, waba_id, display_phone, attached_at, attached_by)
    values (p_number_id, p_tenant, 'meta', nullif(p_waba_id, ''), p_display_phone, now(), p_by);
end $$;
revoke all on function admin_attach_whatsapp_number(uuid, text, text, text, text) from public;
grant execute on function admin_attach_whatsapp_number(uuid, text, text, text, text) to alyr_app;

-- Detach: only a Meta row, never the private test line. Returns the number that was removed.
create function admin_detach_whatsapp_number(p_tenant uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
    v_number text;
begin
    perform assert_platform_admin();
    delete from channel_numbers where tenant_id = p_tenant and channel = 'meta'
        returning number_id into v_number;
    return v_number;
end $$;
revoke all on function admin_detach_whatsapp_number(uuid) from public;
grant execute on function admin_detach_whatsapp_number(uuid) to alyr_app;

-- The onboarding board also shows which number a business has attached.
drop function admin_onboarding();
create function admin_onboarding()
returns table (
    id uuid, name text, slug text, client_id uuid, business_type text,
    onboarding_way text, created_at timestamptz, onboarded_at timestamptz,
    ready_at timestamptz, live_at timestamptz, steps jsonb, last_event_at timestamptz,
    helped bigint, whatsapp jsonb, number jsonb
)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select t.id, t.name, t.slug, t.client_id, t.business_type, t.onboarding_way,
           t.created_at, t.onboarded_at, t.ready_at, t.live_at,
           coalesce((
               select jsonb_agg(jsonb_build_object(
                   'key', s.step_key, 'owner', s.owner, 'blocker', s.blocker,
                   'choice', s.choice, 'done_at', s.done_at, 'checked_at', s.checked_at,
                   'updated_at', s.updated_at
               ) order by s.step_key)
               from onboarding_steps s where s.tenant_id = t.id
           ), '[]'::jsonb),
           (select max(e.at) from onboarding_events e where e.tenant_id = t.id),
           (select count(*) from onboarding_events e where e.tenant_id = t.id and e.by_alyr),
           (select jsonb_build_object(
                'phone', w.phone, 'display_name', w.display_name, 'ready', w.ready,
                'state', w.state, 'note', w.note, 'updated_at', w.updated_at
            ) from whatsapp_setup w where w.tenant_id = t.id),
           (select jsonb_build_object(
                'number_id', c.number_id, 'waba_id', c.waba_id,
                'display_phone', c.display_phone, 'attached_at', c.attached_at,
                'attached_by', c.attached_by
            ) from channel_numbers c where c.tenant_id = t.id and c.channel = 'meta' limit 1)
    from tenants t
    order by t.created_at desc;
end $$;
revoke all on function admin_onboarding() from public;
grant execute on function admin_onboarding() to alyr_app;
