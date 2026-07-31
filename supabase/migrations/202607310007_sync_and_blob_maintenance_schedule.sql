begin;

-- Keep retention work bounded and fair across households. The service-only
-- worker always selects the least-recently compacted households first, so a
-- growing tenant set cannot starve households that sort later by UUID.
create or replace function public.maintain_due_sync_households(
  p_limit integer default 20,
  p_due_interval interval default interval '24 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_household_id uuid;
  v_expired_bootstraps integer := 0;
  v_processed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'INVALID_MAINTENANCE_LIMIT' using errcode = 'P0001';
  end if;
  if p_due_interval is null
     or p_due_interval < interval '15 minutes'
     or p_due_interval > interval '30 days' then
    raise exception 'INVALID_MAINTENANCE_INTERVAL' using errcode = 'P0001';
  end if;

  v_expired_bootstraps := public.purge_expired_sync_bootstraps(100);

  for v_household_id in
    select state.household_id
    from public.sync_household_state state
    where state.last_compacted_at is null
       or state.last_compacted_at <= now() - p_due_interval
    order by state.last_compacted_at asc nulls first, state.household_id
    limit p_limit
    for update skip locked
  loop
    v_results := v_results || jsonb_build_array(
      public.maintain_household_sync_retention(v_household_id)
    );
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object(
    'processedHouseholds', v_processed,
    'expiredBootstraps', v_expired_bootstraps,
    'results', v_results
  );
end
$$;

revoke all on function public.maintain_due_sync_households(integer, interval)
  from public, anon, authenticated;
grant execute on function public.maintain_due_sync_households(integer, interval)
  to service_role;

comment on function public.maintain_due_sync_households(integer, interval) is
  'Service-only fair scheduler for bounded sync compaction and expired bootstrap cleanup.';

-- Edge may reveal only the signup path and optimistic config version. Keep
-- the full quota/control row private and make the narrow reader service-only.
create or replace function public.read_launch_enrollment_mode()
returns table(signup_mode text, config_version bigint)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  return query
  select controls.signup_mode, controls.config_version
  from public.launch_enrollment_controls controls
  where controls.id = 1;
end
$$;

revoke all on function public.read_launch_enrollment_mode()
  from public, anon, authenticated, supabase_auth_admin;
grant execute on function public.read_launch_enrollment_mode()
  to service_role;

comment on function public.read_launch_enrollment_mode() is
  'Service-only narrow reader for the attested native signup-mode contract.';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The jobs reuse the maintenance URL/token already provisioned for export
-- retention. A future Heldat-named Vault entry takes precedence; until either
-- pair exists, each query is intentionally inert and exposes no secret in SQL.
do $$
declare
  v_existing_job_id bigint;
begin
  select jobid
  into v_existing_job_id
  from cron.job
  where jobname = 'heldat-sync-retention-quarter-hour';

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  perform cron.schedule(
    'heldat-sync-retention-quarter-hour',
    '3,18,33,48 * * * *',
    $maintenance$
      select net.http_post(
        url := regexp_replace(
          maintenance_url.decrypted_secret,
          '/maintenance/(exports|blobs|sync)$',
          '/maintenance/sync'
        ),
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'X-Heldat-Maintenance-Token',
          maintenance_token.decrypted_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
      from lateral (
        select secret.decrypted_secret
        from vault.decrypted_secrets secret
        where secret.name in (
          'heldat_maintenance_url',
          'alyr_export_maintenance_url'
        )
        order by case secret.name
          when 'heldat_maintenance_url' then 0
          else 1
        end
        limit 1
      ) maintenance_url
      cross join lateral (
        select secret.decrypted_secret
        from vault.decrypted_secrets secret
        where secret.name in (
          'heldat_maintenance_token',
          'alyr_export_maintenance_token'
        )
        order by case secret.name
          when 'heldat_maintenance_token' then 0
          else 1
        end
        limit 1
      ) maintenance_token;
    $maintenance$
  );
end
$$;

do $$
declare
  v_existing_job_id bigint;
begin
  select jobid
  into v_existing_job_id
  from cron.job
  where jobname = 'heldat-blob-maintenance-quarter-hour';

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  perform cron.schedule(
    'heldat-blob-maintenance-quarter-hour',
    '11,26,41,56 * * * *',
    $maintenance$
      select net.http_post(
        url := regexp_replace(
          maintenance_url.decrypted_secret,
          '/maintenance/(exports|blobs|sync)$',
          '/maintenance/blobs'
        ),
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'X-Heldat-Maintenance-Token',
          maintenance_token.decrypted_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
      from lateral (
        select secret.decrypted_secret
        from vault.decrypted_secrets secret
        where secret.name in (
          'heldat_maintenance_url',
          'alyr_export_maintenance_url'
        )
        order by case secret.name
          when 'heldat_maintenance_url' then 0
          else 1
        end
        limit 1
      ) maintenance_url
      cross join lateral (
        select secret.decrypted_secret
        from vault.decrypted_secrets secret
        where secret.name in (
          'heldat_maintenance_token',
          'alyr_export_maintenance_token'
        )
        order by case secret.name
          when 'heldat_maintenance_token' then 0
          else 1
        end
        limit 1
      ) maintenance_token;
    $maintenance$
  );
end
$$;

commit;
