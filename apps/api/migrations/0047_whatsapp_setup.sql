-- How each business gets onto WhatsApp (ALY-217, decision D-050; spec 019).
--
-- The owner chooses a way on their go-live list (`onboarding_steps.choice` of the
-- `whatsapp` step, migration 0046): a new number, moving the number they already use in the
-- WhatsApp Business app (Meta's coexistence), or a WhatsApp Business Platform account they
-- already have with another provider. Each way needs a few things ready before ALYR and Meta
-- can connect it; this table keeps what the owner has ready and where ALYR is with it.
-- Connected is never stored here: it is the business's Meta row in `channel_numbers`.
-- The number is the business's own WhatsApp number, never a customer's.

create table whatsapp_setup (
    tenant_id uuid primary key
        default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- The number to connect, in international form: the new one, or the one being moved.
    phone text not null default '' check (phone ~ '^(\+[1-9][0-9]{7,14})?$'),
    -- The name customers see on a new number; Meta checks it against the business.
    display_name text not null default '' check (length(display_name) <= 80),
    -- What the owner has ready, by key (`core/whatsapp_setup.py`).
    ready text[] not null default '{}',
    -- Where ALYR is: nothing yet, connecting with the owner, or it failed (and why).
    state text not null default '' check (state in ('', 'connecting', 'failed')),
    note text not null default '' check (length(note) <= 500),
    updated_at timestamptz not null default now(),
    updated_by text not null default ''
);

alter table whatsapp_setup enable row level security;
alter table whatsapp_setup force row level security;
create policy tenant_isolation on whatsapp_setup
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update on whatsapp_setup to alyr_app;

-- Changes to it go on the onboarding record too.
alter table onboarding_events drop constraint onboarding_events_event_check;
alter table onboarding_events add constraint onboarding_events_event_check check (event in (
    'done', 'undone', 'owner', 'blocked', 'unblocked', 'choice', 'ready', 'live', 'whatsapp'
));

-- The board shows each business's WhatsApp setup beside its steps.
drop function admin_onboarding();
create function admin_onboarding()
returns table (
    id uuid, name text, slug text, client_id uuid, business_type text,
    onboarding_way text, created_at timestamptz, onboarded_at timestamptz,
    ready_at timestamptz, live_at timestamptz, steps jsonb, last_event_at timestamptz,
    helped bigint, whatsapp jsonb
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
            ) from whatsapp_setup w where w.tenant_id = t.id)
    from tenants t
    order by t.created_at desc;
end $$;
revoke all on function admin_onboarding() from public;
grant execute on function admin_onboarding() to alyr_app;
