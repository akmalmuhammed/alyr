-- A business's WhatsApp line: what ALYR knows about the Meta number attached to it, and the
-- trail of what happened to it (ALY-166, spec 060, D-145).
--
-- `channel_numbers` says which number belongs to which business and the app role cannot write
-- it. This is the rest: the last check ALYR ran against the number (Meta's answer, whether the
-- webhook reaches us, whether a message has come in), the last test message ALYR sent through
-- it, and one append-only row for every event in the line's life. Both tables are the
-- business's own, with forced row-level security, and are deleted with it (core/erase_rules.py).
--
-- The events are what ALYR staff read when a shop says "WhatsApp stopped working": attached,
-- checked, tested, and from the next stages the template and health events. They hold states and
-- counts, never a customer's name, number or message.

create table whatsapp_line_events (
    id bigint generated always as identity primary key,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    number_id text not null,
    at timestamptz not null default clock_timestamp(),
    -- attached, detached, checked, test_sent (more arrive with the next stages)
    kind text not null,
    -- true: it worked; false: it did not; null: the event has no pass or fail
    ok boolean,
    -- Who did it: a staff member's name, or "ALYR" when Meta's webhook or a job did.
    actor text not null default '',
    detail jsonb not null default '{}'
);
create index whatsapp_line_events_shop on whatsapp_line_events (tenant_id, at desc, id desc);

-- One row per attached Meta number: the latest check and the latest test.
create table whatsapp_line_state (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    number_id text not null,
    checked_at timestamptz,
    -- true: every check that could be made passed; false: one failed; null: never checked
    check_ok boolean,
    -- [{"key": "number", "ok": true, "note": "CONNECTED"}, ...]; ok null means "not known yet"
    checks jsonb not null default '[]',
    -- The last test message, in `messages`; its delivery status is read from there.
    test_message_id uuid,
    test_at timestamptz,
    test_by text not null default '',
    primary key (tenant_id, number_id)
);

do $$
declare t text;
begin
    foreach t in array array['whatsapp_line_events', 'whatsapp_line_state'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;
-- The trail is only ever added to; the state is replaced by the next check.
grant select, insert on whatsapp_line_events to alyr_app;
grant usage on sequence whatsapp_line_events_id_seq to alyr_app;
grant select, insert, update, delete on whatsapp_line_state to alyr_app;

-- Every business with a Meta number, for the back office's WhatsApp screen: the number, the
-- last check and test, and when a customer's message last arrived on it. Counts and states
-- only. Staff-only, like the other admin_* functions.
create function admin_whatsapp_lines()
returns table (
    tenant_id uuid, name text, slug text, client_id uuid, number_id text, waba_id text,
    display_phone text, attached_at timestamptz, attached_by text,
    checked_at timestamptz, check_ok boolean, checks jsonb,
    test_message_id uuid, test_at timestamptz, test_by text,
    test_status text, test_error text, last_inbound_at timestamptz, staff_numbers bigint
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
             where k.tenant_id = t.id and k.number_id = c.number_id and k.role = 'staff')
    from channel_numbers c
    join tenants t on t.id = c.tenant_id
    left join whatsapp_line_state s on s.tenant_id = c.tenant_id and s.number_id = c.number_id
    left join messages m on m.id = s.test_message_id and m.tenant_id = c.tenant_id
    where c.channel = 'meta'
    order by t.name;
end $$;
revoke all on function admin_whatsapp_lines() from public;
grant execute on function admin_whatsapp_lines() to alyr_app;
