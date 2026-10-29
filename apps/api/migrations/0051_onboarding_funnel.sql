-- The onboarding funnel for the back office (ALY-169; spec 025): where businesses stop, how
-- long each step takes, how many needed ALYR's hand. It reads only the append-only record the
-- onboarding engine already keeps (`onboarding_events`, migration 0046): step names, times and
-- whether ALYR or the client made the change. No customer data, nothing new stored.
--
-- Only businesses the readiness check has looked at are counted (they have onboarding steps),
-- so the demo shops and shops made before the engine do not skew it.

-- Like `admin_onboarding()` (migration 0046), the function reads every business's record as the
-- table owner. It adds no policy to the onboarding tables: a policy that let staff see all
-- businesses would also show every business's rows to the queries that rely on the tenant policy
-- to pick their own, in a back-office connection scoped to one business.

create function admin_onboarding_funnel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_steps jsonb;
    v_out jsonb;
begin
    perform assert_platform_admin();
    -- Per step: how many businesses reached it, and the typical time from sign-up (hours),
    -- from the first time the check saw it pass.
    select coalesce(jsonb_agg(jsonb_build_object(
               'key', f.step_key,
               'reached', f.reached,
               'median_hours', round(f.median_hours::numeric, 1)
           ) order by f.median_hours nulls last, f.step_key), '[]'::jsonb)
      into v_steps
      from (
          select d.step_key, count(*) as reached,
                 percentile_cont(0.5) within group (
                     order by extract(epoch from (d.first_at - t.created_at)) / 3600
                 ) as median_hours
            from (
                select e.tenant_id, e.step_key, min(e.at) as first_at
                  from onboarding_events e
                 where e.event = 'done' and e.step_key <> ''
                 group by e.tenant_id, e.step_key
            ) d
            join tenants t on t.id = d.tenant_id
           group by d.step_key
      ) f;

    select jsonb_build_object(
        'started', count(*),
        'ready', count(*) filter (where t.ready_at is not null),
        'live', count(*) filter (where t.live_at is not null),
        'median_hours_to_ready', round((percentile_cont(0.5) within group (
            order by extract(epoch from (t.ready_at - t.created_at)) / 3600
        ) filter (where t.ready_at is not null))::numeric, 1),
        'median_hours_to_live', round((percentile_cont(0.5) within group (
            order by extract(epoch from (t.live_at - t.created_at)) / 3600
        ) filter (where t.live_at is not null))::numeric, 1),
        -- Needed ALYR's hand at least once (a person from ALYR changed something).
        'helped', count(*) filter (where exists (
            select 1 from onboarding_events e where e.tenant_id = t.id and e.by_alyr)),
        'helped_live', count(*) filter (where t.live_at is not null and exists (
            select 1 from onboarding_events e where e.tenant_id = t.id and e.by_alyr)),
        -- Not live and nothing moved for a week: where people give up.
        'quiet', count(*) filter (where t.live_at is null
            and coalesce((select max(e.at) from onboarding_events e where e.tenant_id = t.id),
                         t.created_at) < now() - interval '7 days')
    ) into v_out
    from tenants t
    where exists (select 1 from onboarding_steps s where s.tenant_id = t.id);

    -- Where the businesses that are not live stand: the first step each still lacks.
    return v_out || jsonb_build_object('steps', v_steps, 'stuck_on', coalesce((
        select jsonb_object_agg(k, n) from (
            select s.step_key as k, count(*) as n
              from onboarding_steps s
              join tenants t on t.id = s.tenant_id
             where t.live_at is null and s.done_at is null
             group by s.step_key
        ) q), '{}'::jsonb));
end $$;
revoke all on function admin_onboarding_funnel() from public;
grant execute on function admin_onboarding_funnel() to alyr_app;
