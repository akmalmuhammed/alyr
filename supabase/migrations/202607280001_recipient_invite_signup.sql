begin;

-- An account created only to join an existing household is enrolled in the
-- pilot but receives no authority to create a separate household.
alter table public.pilot_enrollments
  drop constraint if exists pilot_enrollments_max_households_check;
alter table public.pilot_enrollments
  add constraint pilot_enrollments_max_households_check
  check (max_households between 0 and 3);

alter table public.pilot_signup_approvals
  drop constraint if exists pilot_signup_approvals_max_households_check;
alter table public.pilot_signup_approvals
  add constraint pilot_signup_approvals_max_households_check
  check (max_households between 0 and 3);

-- This private reservation binds a household bearer invitation to one email
-- before identity creation. Only hashes are retained and no client role can
-- inspect names, counts, email hashes, or signup grants through this table.
create table public.household_invite_signup_reservations (
  invite_id uuid primary key
    references public.invites(id) on delete cascade,
  approval_id uuid not null unique
    references public.pilot_signup_approvals(id) on delete cascade,
  email_hash text not null
    check (email_hash ~ '^[0-9a-f]{64}$'),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > reserved_at)
);

alter table public.household_invite_signup_reservations
  enable row level security;
alter table public.household_invite_signup_reservations
  force row level security;
revoke all on table public.household_invite_signup_reservations
  from public, anon, authenticated;

-- Called only by the public Edge preflight through a service-role client.
-- Valid household invitations become email-bound, short-lived identity
-- grants. The invitation remains unconsumed until the verified account
-- accepts it through the authenticated endpoint.
create or replace function public.issue_household_invite_signup_grant(
  p_email text,
  p_invite_code text
)
returns table(enrollment_grant text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_email_hash text;
  v_invite public.invites;
  v_reservation public.household_invite_signup_reservations;
  v_approval public.pilot_signup_approvals;
  v_grant text;
  v_grant_expires_at timestamptz;
begin
  if char_length(v_email) < 3
    or char_length(v_email) > 254
    or position('@' in v_email) <= 1
    or char_length(v_code) not between 1 and 128
    or v_code ~ '[[:cntrl:]]'
  then
    raise exception 'HOUSEHOLD_INVITE_ACCESS_DENIED'
      using errcode = 'P0001';
  end if;

  v_email_hash := encode(digest(v_email, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(
    hashtext('alyr.household-invite.signup.' || v_code)
  );

  select invite.*
  into v_invite
  from public.invites as invite
  where invite.code_hash =
      encode(digest(v_code, 'sha256'), 'hex')
    and invite.accepted_at is null
    and invite.revoked_at is null
    and invite.expires_at > now()
    and invite.role in (
      'editor'::public.household_role,
      'viewer'::public.household_role
    )
  for update;

  if not found then
    raise exception 'HOUSEHOLD_INVITE_ACCESS_DENIED'
      using errcode = 'P0001';
  end if;

  select reservation.*
  into v_reservation
  from public.household_invite_signup_reservations as reservation
  where reservation.invite_id = v_invite.id
  for update;

  if found then
    if v_reservation.email_hash <> v_email_hash
      or v_reservation.expires_at <= now()
    then
      raise exception 'HOUSEHOLD_INVITE_ACCESS_DENIED'
        using errcode = 'P0001';
    end if;
    select approval.*
    into v_approval
    from public.pilot_signup_approvals as approval
    where approval.id = v_reservation.approval_id
      and approval.email_hash = v_email_hash
      and approval.enabled
      and approval.claimed_at is null
      and (approval.expires_at is null or approval.expires_at > now())
    for update;
    if not found then
      raise exception 'HOUSEHOLD_INVITE_ACCESS_DENIED'
        using errcode = 'P0001';
    end if;
  else
    select approval.*
    into v_approval
    from public.pilot_signup_approvals as approval
    where approval.email_hash = v_email_hash
      and approval.enabled
      and approval.claimed_at is null
      and (approval.expires_at is null or approval.expires_at > now())
    for update;

    if not found then
      insert into public.pilot_signup_approvals (
        email_hash,
        access_code_hash,
        enabled,
        max_households,
        approved_at,
        expires_at,
        note
      )
      values (
        v_email_hash,
        encode(digest(gen_random_bytes(32), 'sha256'), 'hex'),
        true,
        0,
        now(),
        v_invite.expires_at,
        'Created from an email-bound household invitation.'
      )
      returning * into v_approval;
    end if;

    insert into public.household_invite_signup_reservations (
      invite_id,
      approval_id,
      email_hash,
      expires_at
    )
    values (
      v_invite.id,
      v_approval.id,
      v_email_hash,
      v_invite.expires_at
    )
    returning * into v_reservation;
  end if;

  v_grant := encode(gen_random_bytes(32), 'hex');
  v_grant_expires_at := least(
    now() + interval '10 minutes',
    v_invite.expires_at
  );

  update public.pilot_signup_approvals
  set
    pending_grant_hash =
      encode(digest(v_grant, 'sha256'), 'hex'),
    pending_grant_expires_at = v_grant_expires_at
  where id = v_approval.id;

  return query select v_grant, v_grant_expires_at;
exception
  when unique_violation then
    raise exception 'HOUSEHOLD_INVITE_ACCESS_DENIED'
      using errcode = 'P0001';
end
$$;

revoke all on function public.issue_household_invite_signup_grant(text, text)
  from public, anon, authenticated;
grant execute on function public.issue_household_invite_signup_grant(text, text)
  to service_role;

-- Preserve the idempotent authenticated acceptance contract while enforcing
-- the email binding whenever a signed-out recipient reserved the invitation.
create or replace function public.accept_household_invite(p_code text)
returns public.memberships
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite public.invites;
  v_reservation public.household_invite_signup_reservations;
  v_membership public.memberships;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select lower(trim(email))
  into v_user_email
  from auth.users
  where id = v_user_id;
  if v_user_email is null then
    raise exception 'INVITE_INVALID_OR_EXPIRED'
      using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.invites
  where code_hash =
      encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    and revoked_at is null
  for update;
  if not found then
    raise exception 'INVITE_INVALID_OR_EXPIRED'
      using errcode = 'P0001';
  end if;
  if v_invite.role not in (
    'editor'::public.household_role,
    'viewer'::public.household_role
  ) then
    raise exception 'INVALID_INVITE_ROLE' using errcode = 'P0001';
  end if;

  if v_invite.accepted_at is not null then
    if v_invite.accepted_by is distinct from v_user_id then
      raise exception 'INVITE_INVALID_OR_EXPIRED'
        using errcode = 'P0001';
    end if;
    select * into v_membership
    from public.memberships
    where household_id = v_invite.household_id
      and user_id = v_user_id
      and status = 'active'
      and deleted_at is null
    for update;
    if not found or v_membership.role <> v_invite.role then
      raise exception 'MEMBERSHIP_STATE_INVALID'
        using errcode = 'P0001';
    end if;
  else
    if v_invite.expires_at <= now() then
      raise exception 'INVITE_INVALID_OR_EXPIRED'
        using errcode = 'P0001';
    end if;

    select reservation.*
    into v_reservation
    from public.household_invite_signup_reservations as reservation
    where reservation.invite_id = v_invite.id
    for update;
    if found and (
      v_reservation.expires_at <= now()
      or v_reservation.email_hash <>
        encode(digest(v_user_email, 'sha256'), 'hex')
    ) then
      raise exception 'INVITE_INVALID_OR_EXPIRED'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.memberships
      where household_id = v_invite.household_id
        and user_id = v_user_id
        and status = 'active'
        and deleted_at is null
    ) then
      raise exception 'ALREADY_ACTIVE_MEMBER'
        using errcode = 'P0001';
    end if;

    insert into public.memberships(household_id, user_id, role)
    values (v_invite.household_id, v_user_id, v_invite.role)
    on conflict (household_id, user_id)
    do update set
      role = excluded.role,
      status = 'active',
      deleted_at = null,
      version = public.memberships.version + 1,
      updated_at = now()
    returning * into v_membership;

    update public.invites
    set accepted_by = v_user_id, accepted_at = now()
    where id = v_invite.id;

    delete from public.household_invite_signup_reservations
    where invite_id = v_invite.id;

    insert into public.audit_events(
      household_id, actor_id, event_name, entity_type, entity_id
    )
    values (
      v_invite.household_id,
      v_user_id,
      'invite.accepted',
      'membership',
      v_membership.id
    );
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'active_household_id', v_membership.household_id::text,
      'active_membership_id', v_membership.id::text,
      'active_household_role', v_membership.role::text,
      'onboarding_complete', true
    )
  where id = v_user_id;

  return v_membership;
end
$$;

commit;
