begin;

-- Keep account routing as one provider-controlled tuple. Every function below
-- updates membership identity, role, household and onboarding state in the
-- same database transaction as the membership change.
create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_household public.households;
  v_membership public.memberships;
  v_enrollment public.pilot_enrollments;
  v_existing_households integer;
  v_pilot_households integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'INVALID_HOUSEHOLD_NAME' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.enrollment'));
  select * into v_enrollment
  from public.pilot_enrollments
  where user_id = v_user_id
    and enabled
    and (expires_at is null or expires_at > now())
  for update;
  if not found then
    raise exception 'PILOT_ENROLLMENT_REQUIRED' using errcode = 'P0001';
  end if;

  select count(*) into v_existing_households
  from public.households
  where created_by = v_user_id and deleted_at is null;
  if v_existing_households >= v_enrollment.max_households then
    raise exception 'PILOT_HOUSEHOLD_LIMIT' using errcode = 'P0001';
  end if;

  select count(*) into v_pilot_households
  from public.households where deleted_at is null;
  if v_pilot_households >= 20 then
    raise exception 'PILOT_CAPACITY_REACHED' using errcode = 'P0001';
  end if;

  insert into public.households(name, created_by)
  values (trim(p_name), v_user_id)
  returning * into v_household;

  insert into public.memberships(household_id, user_id, role)
  values (v_household.id, v_user_id, 'owner')
  returning * into v_membership;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id
  )
  values (
    v_household.id, v_user_id, 'household.created', 'household', v_household.id
  );

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'active_household_id', v_household.id::text,
      'active_membership_id', v_membership.id::text,
      'active_household_role', v_membership.role::text,
      'onboarding_complete', false
    )
  where id = v_user_id;

  return v_household;
end
$$;

create or replace function public.complete_household_onboarding(
  p_household_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_membership
  from public.memberships
  where household_id = p_household_id
    and user_id = v_user_id
    and status = 'active'
    and deleted_at is null
  for update;

  if not found
    or v_membership.role <> 'owner'::public.household_role
    or not public.can_admin_household(p_household_id)
  then
    raise exception 'HOUSEHOLD_ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'active_household_id', p_household_id::text,
      'active_membership_id', v_membership.id::text,
      'active_household_role', v_membership.role::text,
      'onboarding_complete', true
    )
  where id = v_user_id;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id
  )
  values (
    p_household_id,
    v_user_id,
    'household.onboarding_completed',
    'household',
    p_household_id
  );
end
$$;

create or replace function public.create_household_invite(
  p_household_id uuid,
  p_role public.household_role default 'viewer',
  p_ttl interval default interval '7 days'
)
returns table(invite_id uuid, invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text;
  v_invite public.invites;
begin
  if not public.can_admin_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if p_role not in (
    'editor'::public.household_role,
    'viewer'::public.household_role
  ) then
    raise exception 'INVALID_INVITE_ROLE' using errcode = 'P0001';
  end if;
  if p_ttl <= interval '0 seconds' or p_ttl > interval '30 days' then
    raise exception 'INVALID_INVITE_TTL' using errcode = 'P0001';
  end if;

  v_code := upper(encode(gen_random_bytes(9), 'hex'));
  insert into public.invites(
    household_id, code_hash, role, expires_at, created_by
  )
  values (
    p_household_id,
    encode(digest(v_code, 'sha256'), 'hex'),
    p_role,
    now() + p_ttl,
    auth.uid()
  )
  returning * into v_invite;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id
  )
  values (
    p_household_id, auth.uid(), 'invite.created', 'invite', v_invite.id
  );

  return query select v_invite.id, v_code, v_invite.expires_at;
end
$$;

create or replace function public.accept_household_invite(p_code text)
returns public.memberships
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.invites;
  v_membership public.memberships;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.invites
  where code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    and revoked_at is null
  for update;
  if not found then
    raise exception 'INVITE_INVALID_OR_EXPIRED' using errcode = 'P0001';
  end if;
  if v_invite.role not in (
    'editor'::public.household_role,
    'viewer'::public.household_role
  ) then
    raise exception 'INVALID_INVITE_ROLE' using errcode = 'P0001';
  end if;

  -- A successful response can be lost after commit. The same account may
  -- safely submit the same code again to recover its membership and refresh
  -- provider metadata; every other account still sees a used invitation.
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by is distinct from v_user_id then
      raise exception 'INVITE_INVALID_OR_EXPIRED' using errcode = 'P0001';
    end if;
    select * into v_membership
    from public.memberships
    where household_id = v_invite.household_id
      and user_id = v_user_id
      and status = 'active'
      and deleted_at is null
    for update;
    if not found or v_membership.role <> v_invite.role then
      raise exception 'MEMBERSHIP_STATE_INVALID' using errcode = 'P0001';
    end if;
  else
    if v_invite.expires_at <= now() then
      raise exception 'INVITE_INVALID_OR_EXPIRED' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.memberships
      where household_id = v_invite.household_id
        and user_id = v_user_id
        and status = 'active'
        and deleted_at is null
    ) then
      raise exception 'ALREADY_ACTIVE_MEMBER' using errcode = 'P0001';
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
