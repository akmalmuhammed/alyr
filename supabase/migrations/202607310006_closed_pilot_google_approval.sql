begin;

-- A Google identity proves control of its verified email address. Reuse the
-- existing email-hash pilot approval rather than opening the public Google
-- launch mode or storing a second copy of the address.
alter function public.heldat_before_user_created(jsonb)
  rename to heldat_before_user_created_launch_v1;

revoke execute on function public.heldat_before_user_created_launch_v1(jsonb)
  from public, anon, authenticated, service_role, supabase_auth_admin;

create or replace function public.heldat_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(event #>> '{user,email}', '')));
  v_provider text := lower(trim(coalesce(
    event #>> '{user,app_metadata,provider}',
    ''
  )));
  v_google_pilot_approved boolean := false;
begin
  if v_provider = 'google'
    and coalesce(event #> '{user,app_metadata,providers}', '[]'::jsonb)
      @> '["google"]'::jsonb
    and char_length(v_email) between 3 and 254
    and v_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and coalesce(event #>> '{user,id}', '')
      ~ '^[0-9a-fA-F-]{36}$'
  then
    select exists (
      select 1
      from public.pilot_signup_approvals as approval
      where approval.email_hash =
          encode(extensions.digest(v_email, 'sha256'), 'hex')
        and approval.enabled
        and approval.claimed_at is null
        and (approval.expires_at is null or approval.expires_at > now())
    )
    into v_google_pilot_approved;

    if v_google_pilot_approved then
      return '{}'::jsonb;
    end if;
  end if;

  return public.heldat_before_user_created_launch_v1(event);
exception
  when others then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 503,
        'message', 'Heldat enrollment is temporarily unavailable.'
      )
    );
end
$$;

revoke execute on function public.heldat_before_user_created(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.heldat_before_user_created(jsonb)
  to supabase_auth_admin;

-- Mark only the database row that passed the reviewed, provider-controlled
-- Google metadata checks. The marker exists inside the insert transaction so
-- the legacy after-insert admission trigger can distinguish this approved
-- identity from an unrestricted public Google signup.
create or replace function public.mark_closed_pilot_google_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_provider text := lower(coalesce(
    coalesce(new.raw_app_meta_data, '{}'::jsonb) ->> 'provider',
    ''
  ));
  v_approval_id uuid;
begin
  if v_provider <> 'google'
    or not (
      coalesce(new.raw_app_meta_data, '{}'::jsonb) -> 'providers'
        @> '["google"]'::jsonb
    )
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.signup'));

  select approval.id
  into v_approval_id
  from public.pilot_signup_approvals as approval
  where approval.email_hash =
      encode(extensions.digest(v_email, 'sha256'), 'hex')
    and approval.enabled
    and approval.claimed_at is null
    and (approval.expires_at is null or approval.expires_at > now())
  for update;

  if not found then
    return new;
  end if;

  new.raw_app_meta_data :=
    coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'heldat_operator_provisioned', true,
        'heldat_google_pilot_approval_id', v_approval_id::text
      );
  return new;
end
$$;

revoke execute on function public.mark_closed_pilot_google_signup()
  from public, anon, authenticated, service_role, supabase_auth_admin;

drop trigger if exists heldat_mark_closed_pilot_google_signup
  on auth.users;
create trigger heldat_mark_closed_pilot_google_signup
before insert on auth.users
for each row execute function public.mark_closed_pilot_google_signup();

-- The existing alyr_consume_pilot_signup_grant trigger runs first by name and
-- returns immediately for the transaction-only operator marker. This trigger
-- then binds the approval to the new identity, enrolls it, and removes both
-- internal markers before the transaction becomes visible.
create or replace function public.consume_closed_pilot_google_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_approval_id_text text :=
    coalesce(new.raw_app_meta_data, '{}'::jsonb)
      ->> 'heldat_google_pilot_approval_id';
  v_operator_marker boolean :=
    coalesce(new.raw_app_meta_data, '{}'::jsonb)
      -> 'heldat_operator_provisioned' = 'true'::jsonb;
  v_approval public.pilot_signup_approvals;
begin
  if not v_operator_marker or v_approval_id_text is null then
    return new;
  end if;
  if v_approval_id_text !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'PILOT_SIGNUP_GRANT_REQUIRED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.signup'));

  select approval.*
  into v_approval
  from public.pilot_signup_approvals as approval
  where approval.id = v_approval_id_text::uuid
    and approval.email_hash =
      encode(extensions.digest(v_email, 'sha256'), 'hex')
    and approval.enabled
    and approval.claimed_at is null
    and (approval.expires_at is null or approval.expires_at > now())
  for update;

  if not found then
    raise exception 'PILOT_SIGNUP_GRANT_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.pilot_enrollments (
    user_id,
    enabled,
    max_households,
    approved_at,
    expires_at,
    note
  )
  values (
    new.id,
    true,
    v_approval.max_households,
    v_approval.approved_at,
    v_approval.expires_at,
    'Created from a verified Google closed-pilot approval.'
  )
  on conflict (user_id) do nothing;

  update public.pilot_signup_approvals
  set
    claimed_by = new.id,
    claimed_at = now(),
    pending_grant_hash = null,
    pending_grant_expires_at = null
  where id = v_approval.id;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
      - array[
          'heldat_operator_provisioned',
          'heldat_google_pilot_approval_id'
        ]
  where id = new.id;

  return new;
end
$$;

revoke execute on function public.consume_closed_pilot_google_signup()
  from public, anon, authenticated, service_role, supabase_auth_admin;

drop trigger if exists heldat_consume_closed_pilot_google_signup
  on auth.users;
create trigger heldat_consume_closed_pilot_google_signup
after insert on auth.users
for each row execute function public.consume_closed_pilot_google_signup();

comment on function public.heldat_before_user_created(jsonb) is
  'Fail-closed Auth hook supporting hashed-email closed-pilot Google approval.';
comment on function public.mark_closed_pilot_google_signup() is
  'Transaction-local marker for an active hashed-email Google pilot approval.';
comment on function public.consume_closed_pilot_google_signup() is
  'Atomically claims a Google pilot approval and creates pilot enrollment.';

commit;
