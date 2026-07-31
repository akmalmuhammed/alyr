begin;

-- Enforce the closed-pilot policy before Auth writes a new identity. The
-- existing after-insert trigger still consumes the one-use grant and creates
-- the pilot enrollment atomically. This hook closes the direct Auth signup
-- path that could previously omit ALYR's signup-channel metadata.
create or replace function public.heldat_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(event #>> '{user,email}', '')));
  v_channel text := coalesce(
    event #>> '{user,user_metadata,alyr_signup_channel}',
    ''
  );
  v_grant text := coalesce(
    event #>> '{user,user_metadata,pilot_signup_grant}',
    ''
  );
  v_operator_provisioned boolean := coalesce(
    (event #>> '{user,app_metadata,heldat_operator_provisioned}')::boolean,
    false
  );
  v_is_valid boolean := false;
begin
  -- Admin-created identities used for operations and integration fixtures can
  -- opt in through app_metadata. Public Auth clients cannot set app_metadata.
  if v_operator_provisioned then
    return '{}'::jsonb;
  end if;

  if char_length(v_email) between 3 and 254
    and position('@' in v_email) > 1
    and v_channel = 'mobile-pilot-v1'
    and v_grant ~ '^[0-9a-f]{64}$'
  then
    select exists (
      select 1
      from public.pilot_signup_approvals as approval
      where approval.email_hash =
          encode(extensions.digest(v_email, 'sha256'), 'hex')
        and approval.pending_grant_hash =
          encode(extensions.digest(v_grant, 'sha256'), 'hex')
        and approval.pending_grant_expires_at > now()
        and approval.enabled
        and approval.claimed_at is null
        and (approval.expires_at is null or approval.expires_at > now())
    )
    into v_is_valid;
  end if;

  if not v_is_valid then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'A valid Heldat enrollment approval is required.'
      )
    );
  end if;

  return '{}'::jsonb;
exception
  when invalid_text_representation then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'A valid Heldat enrollment approval is required.'
      )
    );
end
$$;

grant usage on schema public to supabase_auth_admin;
grant select (
  email_hash,
  pending_grant_hash,
  pending_grant_expires_at,
  enabled,
  claimed_at,
  expires_at
) on table public.pilot_signup_approvals to supabase_auth_admin;

drop policy if exists pilot_signup_approvals_auth_hook_select
  on public.pilot_signup_approvals;
create policy pilot_signup_approvals_auth_hook_select
on public.pilot_signup_approvals
for select
to supabase_auth_admin
using (true);

revoke execute on function public.heldat_before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function public.heldat_before_user_created(jsonb)
  to supabase_auth_admin;

-- A privacy-safe, service-only fixed-window limiter. Scope values are hashed by
-- the Edge Function before reaching Postgres, so IP addresses and bearer
-- identifiers are never retained in this table.
create table public.api_rate_limit_buckets (
  scope_hash text not null
    check (scope_hash ~ '^[0-9a-f]{64}$'),
  route_group text not null
    check (route_group ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  window_seconds integer not null
    check (window_seconds between 1 and 86400),
  window_started_at timestamptz not null,
  request_count integer not null
    check (request_count >= 1),
  expires_at timestamptz not null,
  primary key (scope_hash, route_group, window_seconds),
  check (expires_at > window_started_at)
);

alter table public.api_rate_limit_buckets enable row level security;
alter table public.api_rate_limit_buckets force row level security;
revoke all on table public.api_rate_limit_buckets
  from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_scope_hash text,
  p_route_group text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_expires_at timestamptz;
  v_bucket public.api_rate_limit_buckets;
begin
  if p_scope_hash !~ '^[0-9a-f]{64}$'
    or p_route_group !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_limit not between 1 and 100000
    or p_window_seconds not between 1 and 86400
  then
    raise exception 'RATE_LIMIT_ARGUMENT_INVALID' using errcode = 'P0001';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds)
      * p_window_seconds
  );
  v_expires_at := v_window_started_at
    + make_interval(secs => p_window_seconds * 2);

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_scope_hash || ':' || p_route_group || ':' || p_window_seconds::text,
      0
    )
  );

  select bucket.*
  into v_bucket
  from public.api_rate_limit_buckets as bucket
  where bucket.scope_hash = p_scope_hash
    and bucket.route_group = p_route_group
    and bucket.window_seconds = p_window_seconds
  for update;

  if not found or v_bucket.window_started_at <> v_window_started_at then
    insert into public.api_rate_limit_buckets (
      scope_hash,
      route_group,
      window_seconds,
      window_started_at,
      request_count,
      expires_at
    )
    values (
      p_scope_hash,
      p_route_group,
      p_window_seconds,
      v_window_started_at,
      1,
      v_expires_at
    )
    on conflict (scope_hash, route_group, window_seconds)
    do update set
      window_started_at = excluded.window_started_at,
      request_count = 1,
      expires_at = excluded.expires_at;

    return query select true, greatest(p_limit - 1, 0), 0;
    return;
  end if;

  if v_bucket.request_count >= p_limit then
    return query
    select
      false,
      0,
      greatest(
        ceil(extract(epoch from (
          v_bucket.window_started_at
            + make_interval(secs => p_window_seconds)
            - v_now
        )))::integer,
        1
      );
    return;
  end if;

  update public.api_rate_limit_buckets
  set
    request_count = request_count + 1,
    expires_at = v_expires_at
  where scope_hash = p_scope_hash
    and route_group = p_route_group
    and window_seconds = p_window_seconds;

  return query
  select true, greatest(p_limit - v_bucket.request_count - 1, 0), 0;
end
$$;

revoke execute on function public.consume_api_rate_limit(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(
  text,
  text,
  integer,
  integer
) to service_role;

create or replace function public.purge_expired_api_rate_limit_buckets(
  p_batch_size integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_batch_size not between 1 and 50000 then
    raise exception 'RATE_LIMIT_PURGE_ARGUMENT_INVALID' using errcode = 'P0001';
  end if;

  with expired as (
    select ctid
    from public.api_rate_limit_buckets
    where expires_at < now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.api_rate_limit_buckets as bucket
  using expired
  where bucket.ctid = expired.ctid;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

revoke execute on function public.purge_expired_api_rate_limit_buckets(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_api_rate_limit_buckets(integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'heldat-rate-limit-retention'
    order by jobid
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'heldat-rate-limit-retention',
      '17 * * * *',
      $job$select public.purge_expired_api_rate_limit_buckets(10000);$job$
    );
  end if;
end
$$;

-- Explicitly close PostgreSQL's default PUBLIC execution grant on the latest
-- household-creation overload.
revoke execute on function public.create_household(text, uuid, uuid)
  from public, anon;
grant execute on function public.create_household(text, uuid, uuid)
  to authenticated;

commit;
