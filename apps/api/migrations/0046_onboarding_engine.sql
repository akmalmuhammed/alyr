-- The onboarding engine (ALY-165, with the event record of ALY-169; decision D-049; spec 018).
--
-- One readiness check answers "is this business ready to go live?" for `/start`, the
-- workspace and the back office. Whether a check passes is always worked out from the
-- business's own data (`core/readiness.py`); what is stored here is what data cannot say:
--   * who owns each step: the client, or ALYR doing it for them (assisted onboarding);
--   * a blocker ALYR wrote on a step, and a choice the owner made (how WhatsApp is
--     connected, cash and transfer or online payments);
--   * the last state the check saw, so the back office lists every business without
--     opening each one;
--   * an append-only record of every change, for the onboarding funnel. No customer data.
-- And on the business itself: when it was first ready, and when it first went live.
-- Live starts the clock of the money-back promise (D-034), so it is kept, never moved.

create table onboarding_steps (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    step_key text not null check (step_key ~ '^[a-z_]{2,40}$'),
    owner text not null default 'client' check (owner in ('client', 'alyr')),
    blocker text not null default '' check (length(blocker) <= 500),
    choice text not null default '' check (choice ~ '^[a-z_]{0,40}$'),
    -- When the check last saw this step pass; null while it fails.
    done_at timestamptz,
    checked_at timestamptz,
    updated_at timestamptz not null default now(),
    updated_by text not null default '',
    primary key (tenant_id, step_key)
);

create table onboarding_events (
    id bigserial primary key,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    step_key text not null,
    event text not null check (event in (
        'done', 'undone', 'owner', 'blocked', 'unblocked', 'choice', 'ready', 'live'
    )),
    detail jsonb not null default '{}',
    actor text not null default '',
    -- A person from ALYR made this change, not the client.
    by_alyr boolean not null default false,
    at timestamptz not null default now()
);
create index onboarding_events_tenant on onboarding_events (tenant_id, at);

do $$
declare t text;
begin
    foreach t in array array['onboarding_steps', 'onboarding_events'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;

grant select, insert, update on onboarding_steps to alyr_app;
-- The record is append-only: the app may add to it, never change or remove.
grant select, insert on onboarding_events to alyr_app;
grant usage on sequence onboarding_events_id_seq to alyr_app;

alter table tenants
    add column ready_at timestamptz,
    add column live_at timestamptz;

-- A business that already has its WhatsApp number and finished onboarding is live, from
-- when it finished.
update tenants t set ready_at = t.onboarded_at, live_at = t.onboarded_at
where t.onboarded_at is not null
  and exists (select 1 from channel_numbers c where c.tenant_id = t.id and c.channel = 'meta');

-- The check records the first time the business in scope was ready, or went live. Only
-- ever the first time, and only for the business in scope: the app role still cannot
-- write `tenants`. Answers whether this call set it.
create function record_own_stage(p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
    v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
    v_set boolean;
begin
    if v_tenant is null then
        raise exception 'no business in scope' using errcode = '42501';
    end if;
    if p_stage = 'ready' then
        update tenants set ready_at = now() where id = v_tenant and ready_at is null;
    elsif p_stage = 'live' then
        update tenants set ready_at = coalesce(ready_at, now()), live_at = now()
            where id = v_tenant and live_at is null;
    else
        raise exception 'unknown stage %', p_stage;
    end if;
    get diagnostics v_set = row_count;
    return v_set;
end $$;
revoke all on function record_own_stage(text) from public;
grant execute on function record_own_stage(text) to alyr_app;

-- The back office's onboarding board: every business with its milestones and the last
-- state the check saw of each step. Counts and states only, never customer data.
create function admin_onboarding()
returns table (
    id uuid, name text, slug text, client_id uuid, business_type text,
    onboarding_way text, created_at timestamptz, onboarded_at timestamptz,
    ready_at timestamptz, live_at timestamptz, steps jsonb, last_event_at timestamptz,
    helped bigint
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
           (select count(*) from onboarding_events e where e.tenant_id = t.id and e.by_alyr)
    from tenants t
    order by t.created_at desc;
end $$;
revoke all on function admin_onboarding() from public;
grant execute on function admin_onboarding() to alyr_app;
