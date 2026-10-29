-- Resume a half-finished sign-up: one email 24 hours after the owner stopped, a second after
-- three days, then no more (ALY-171, D-068, spec 032).
--
-- The step an owner stopped on is already saved on the business, so `/start` reopens there; this
-- is what brings them back. A business is asked about only while its setup is unfinished (not
-- set up, not live), only if the owner has not switched it off, and only twice in all.

alter table tenants
    -- The language the owner reads, kept from the sign-up screen and every later switch, so the
    -- reminder is written in it.
    add column owner_lang text not null default 'en' check (owner_lang in ('en', 'ar')),
    -- Switched off from the link in every reminder; an owner who did so is never written to again.
    add column resume_reminders boolean not null default true,
    -- The last time the owner moved on in setup: a step reached, a detail changed. A reminder
    -- counts from here.
    add column onboarding_touched_at timestamptz not null default now();

-- The same function as 0014, and every change to the business in setup now counts as the owner
-- being there.
create or replace function update_own_business(
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
        onboarded_at = case when p_finished then coalesce(onboarded_at, now()) else onboarded_at end,
        onboarding_touched_at = now()
    where id = v_tenant;
end $$;

-- The owner's language and whether to remind them, for the business in scope. The app role still
-- cannot write `tenants`.
create function update_own_resume(p_lang text, p_reminders boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
    v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
begin
    if v_tenant is null then
        raise exception 'no business in scope' using errcode = '42501';
    end if;
    if p_lang is not null and p_lang not in ('en', 'ar') then
        raise exception 'unknown language';
    end if;
    update tenants set
        owner_lang = coalesce(p_lang, owner_lang),
        resume_reminders = coalesce(p_reminders, resume_reminders)
    where id = v_tenant;
end $$;
revoke all on function update_own_resume(text, boolean) from public;
grant execute on function update_own_resume(text, boolean) to alyr_app;

-- Switch the reminders off for a business named by a signed link from an email (the API reads
-- and checks the link first). Answers whether the business exists.
create function stop_resume_reminders(p_tenant uuid) returns boolean
language sql security definer set search_path = public as $$
    with stopped as (
        update tenants set resume_reminders = false where id = p_tenant returning 1
    )
    select exists (select 1 from stopped)
$$;
revoke all on function stop_resume_reminders(uuid) from public;
grant execute on function stop_resume_reminders(uuid) to alyr_app;

-- Every reminder that went, and whether the owner came back after it (the next time they opened
-- setup). The funnel in the back office counts them; nothing here holds an address or a name.
create table onboarding_reminders (
    id bigserial primary key,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    number smallint not null check (number in (1, 2)),
    step text not null default '',
    lang text not null default 'en',
    sent_at timestamptz not null default now(),
    returned_at timestamptz,
    unique (tenant_id, number)
);

alter table onboarding_reminders enable row level security;
alter table onboarding_reminders force row level security;
create policy tenant_isolation on onboarding_reminders
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert on onboarding_reminders to alyr_app;
grant update (returned_at) on onboarding_reminders to alyr_app;
grant usage on sequence onboarding_reminders_id_seq to alyr_app;

-- The businesses to write to now, read across every business as the table owner (the worker has
-- no business in scope): setup unfinished, reminders on, an owner with an email, and the time
-- since they were last there: 24 hours for the first, three days for the second (and a day since
-- the first), none after two. `p_now` is for the tests.
create function resume_candidates(p_now timestamptz default now())
returns table (
    tenant_id uuid, slug text, business_name text, owner_name text, owner_email text,
    lang text, step text, touched_at timestamptz, sent integer
)
language sql stable security definer set search_path = public as $$
    select t.id, t.slug, t.name, u.name, u.email, t.owner_lang, t.onboarding_step,
           t.onboarding_touched_at, r.sent
    from tenants t
    join lateral (
        select m.user_id from memberships m
        where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1
    ) o on true
    join users u on u.id = o.user_id
    join lateral (
        select count(*)::int as sent, max(x.sent_at) as last_sent
        from onboarding_reminders x where x.tenant_id = t.id
    ) r on true
    where t.onboarded_at is null and t.live_at is null and t.resume_reminders
      and t.onboarding_step <> '' and u.email <> ''
      and (
          (r.sent = 0 and t.onboarding_touched_at <= p_now - interval '24 hours')
          or (r.sent = 1 and t.onboarding_touched_at <= p_now - interval '3 days'
              and r.last_sent <= p_now - interval '24 hours')
      )
$$;
revoke all on function resume_candidates(timestamptz) from public;
grant execute on function resume_candidates(timestamptz) to alyr_app;

-- For the funnel: how many reminders went, to how many businesses, and how many of those came back.
create function admin_resume_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return (
        select jsonb_build_object(
            'sent', count(*),
            'businesses', count(distinct tenant_id),
            'returned', count(distinct tenant_id) filter (where returned_at is not null)
        ) from onboarding_reminders
    );
end $$;
revoke all on function admin_resume_stats() from public;
grant execute on function admin_resume_stats() to alyr_app;
