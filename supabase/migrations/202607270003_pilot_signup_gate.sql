begin;

-- Closed-pilot invitations are approved for one email and claimed once. Only
-- hashes are retained: neither the email nor the operator-issued access code
-- is stored in this table.
create table public.pilot_signup_approvals (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null unique
    check (email_hash ~ '^[0-9a-f]{64}$'),
  access_code_hash text not null unique
    check (access_code_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  max_households integer not null default 1
    check (max_households between 1 and 3),
  approved_at timestamptz not null default now(),
  expires_at timestamptz,
  pending_grant_hash text
    check (
      pending_grant_hash is null
      or pending_grant_hash ~ '^[0-9a-f]{64}$'
    ),
  pending_grant_expires_at timestamptz,
  claimed_by uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  note text,
  check (
    (pending_grant_hash is null) =
    (pending_grant_expires_at is null)
  ),
  check (
    (claimed_by is null) =
    (claimed_at is null)
  )
);

alter table public.pilot_signup_approvals enable row level security;
alter table public.pilot_signup_approvals force row level security;
revoke all on table public.pilot_signup_approvals from public, anon, authenticated;

-- The public Edge route calls this function through a service-role client.
-- Invalid, expired, claimed and mismatched invitations share one error so the
-- route never reveals which email or credential exists.
create or replace function public.issue_pilot_signup_grant(
  p_email text,
  p_access_code text
)
returns table(enrollment_grant text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_access_code text := regexp_replace(
    upper(trim(coalesce(p_access_code, ''))),
    '[[:space:]-]+',
    '',
    'g'
  );
  v_approval public.pilot_signup_approvals;
  v_grant text;
  v_expires_at timestamptz := now() + interval '10 minutes';
begin
  if char_length(v_email) < 3
    or char_length(v_email) > 254
    or position('@' in v_email) <= 1
    or char_length(v_access_code) not between 16 and 64
    or v_access_code !~ '^[A-Z0-9]+$'
  then
    raise exception 'PILOT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.signup'));

  if (
    select count(*)
    from public.households
    where deleted_at is null
  ) >= 20 then
    raise exception 'PILOT_CAPACITY_REACHED' using errcode = 'P0001';
  end if;

  select approval.*
  into v_approval
  from public.pilot_signup_approvals as approval
  where approval.email_hash =
      encode(digest(v_email, 'sha256'), 'hex')
    and approval.access_code_hash =
      encode(digest(v_access_code, 'sha256'), 'hex')
    and approval.enabled
    and approval.claimed_at is null
    and (approval.expires_at is null or approval.expires_at > now())
  for update;

  if not found then
    raise exception 'PILOT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  v_grant := encode(gen_random_bytes(32), 'hex');
  update public.pilot_signup_approvals
  set
    pending_grant_hash = encode(digest(v_grant, 'sha256'), 'hex'),
    pending_grant_expires_at = v_expires_at
  where id = v_approval.id;

  return query select v_grant, v_expires_at;
end
$$;

revoke all on function public.issue_pilot_signup_grant(text, text)
  from public, anon, authenticated;
grant execute on function public.issue_pilot_signup_grant(text, text)
  to service_role;

-- A successful preflight is carried into Supabase sign-up as a one-use grant.
-- The trigger claims the approval and creates the existing owner enrollment in
-- the same transaction as auth.users. Direct operator-created users that do
-- not declare ALYR's mobile signup channel remain unaffected.
create or replace function public.consume_pilot_signup_grant()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_channel text :=
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
      ->> 'alyr_signup_channel';
  v_grant text :=
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
      ->> 'pilot_signup_grant';
  v_email text := lower(trim(coalesce(new.email, '')));
  v_approval public.pilot_signup_approvals;
begin
  if v_channel is distinct from 'mobile-pilot-v1' then
    return new;
  end if;

  if v_grant is null or v_grant !~ '^[0-9a-f]{64}$' then
    raise exception 'PILOT_SIGNUP_GRANT_REQUIRED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.signup'));

  select approval.*
  into v_approval
  from public.pilot_signup_approvals as approval
  where approval.email_hash =
      encode(digest(v_email, 'sha256'), 'hex')
    and approval.pending_grant_hash =
      encode(digest(v_grant, 'sha256'), 'hex')
    and approval.pending_grant_expires_at > now()
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
    'Created from a one-use pilot signup approval.'
  );

  update public.pilot_signup_approvals
  set
    claimed_by = new.id,
    claimed_at = now(),
    pending_grant_hash = null,
    pending_grant_expires_at = null
  where id = v_approval.id;

  -- The proof is single-use and is not retained as account profile metadata.
  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
      - array['alyr_signup_channel', 'pilot_signup_grant']
  where id = new.id;

  return new;
end
$$;

revoke all on function public.consume_pilot_signup_grant()
  from public, anon, authenticated;

create trigger alyr_consume_pilot_signup_grant
after insert on auth.users
for each row execute function public.consume_pilot_signup_grant();

commit;
