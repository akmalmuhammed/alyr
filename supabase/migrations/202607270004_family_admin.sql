begin;

alter table public.invites
  add column if not exists version integer not null default 1
  check (version > 0);

create table if not exists public.household_access_operations (
  operation_id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_kind text not null check (
    operation_kind in (
      'membership.role_changed',
      'membership.revoked',
      'invite.cancelled',
      'ownership.transferred'
    )
  ),
  target_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.household_access_operations enable row level security;
alter table public.household_access_operations force row level security;

-- There is one active owner at most. The administration functions below
-- preserve one owner at all times from every caller's transactional view.
create unique index if not exists one_active_owner_per_household
  on public.memberships(household_id)
  where role = 'owner'
    and status = 'active'
    and deleted_at is null;

create or replace function public.household_access_snapshot(
  p_household_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_current public.memberships;
  v_household public.households;
  v_members jsonb;
  v_invites jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_current
  from public.memberships
  where household_id = p_household_id
    and user_id = v_actor
    and status = 'active'
    and deleted_at is null;

  if not found then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  select * into v_household
  from public.households
  where id = p_household_id and deleted_at is null;

  if not found then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'membershipId', m.id,
        'householdId', m.household_id,
        'accountId', m.user_id,
        'displayName', coalesce(
          nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
          nullif(trim(u.raw_user_meta_data->>'name'), ''),
          split_part(coalesce(u.email, 'Household member'), '@', 1)
        ),
        'email', case
          when v_current.role = 'owner' or m.user_id = v_actor
          then u.email
          else null
        end,
        'role', m.role,
        'status', m.status,
        'version', m.version,
        'joinedAt', m.created_at,
        'isCurrentUser', m.user_id = v_actor
      )
      order by
        case when m.role = 'owner' then 0 else 1 end,
        m.created_at,
        m.id
    ),
    '[]'::jsonb
  )
  into v_members
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.household_id = p_household_id
    and m.status = 'active'
    and m.deleted_at is null;

  if v_current.role = 'owner' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'inviteId', i.id,
          'householdId', i.household_id,
          'role', i.role,
          'status', 'pending',
          'version', i.version,
          'createdAt', i.created_at,
          'expiresAt', i.expires_at
        )
        order by i.created_at desc, i.id
      ),
      '[]'::jsonb
    )
    into v_invites
    from public.invites i
    where i.household_id = p_household_id
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now();
  end if;

  return jsonb_build_object(
    'householdId', v_household.id,
    'householdName', v_household.name,
    'householdVersion', v_household.version,
    'currentMembershipId', v_current.id,
    'currentAccountId', v_actor,
    'currentRole', v_current.role,
    'members', v_members,
    'pendingInvites', v_invites,
    'refreshedAt', now()
  );
end
$$;

create or replace function public.change_household_member_role(
  p_household_id uuid,
  p_membership_id uuid,
  p_expected_version integer,
  p_role public.household_role,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.memberships;
  v_hash text;
  v_existing public.household_access_operations;
  v_response jsonb;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_role not in ('editor'::public.household_role, 'viewer'::public.household_role)
    or p_expected_version < 1
  then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  v_hash := encode(digest(
    jsonb_build_object(
      'householdId', p_household_id,
      'membershipId', p_membership_id,
      'expectedVersion', p_expected_version,
      'role', p_role
    )::text,
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_household_id::text || ':' || p_operation_id::text, 0));

  select * into v_existing
  from public.household_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing.actor_id <> v_actor
      or v_existing.household_id <> p_household_id
      or v_existing.operation_kind <> 'membership.role_changed'
      or v_existing.request_hash <> v_hash
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_existing.response;
  end if;

  perform 1 from public.households
  where id = p_household_id and deleted_at is null
  for update;
  if not found then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1
  from public.memberships
  where household_id = p_household_id
    and user_id = v_actor
    and role = 'owner'
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  select * into v_target
  from public.memberships
  where id = p_membership_id
    and household_id = p_household_id
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target.user_id = v_actor or v_target.role = 'owner' then
    raise exception 'OWNER_ROLE_PROTECTED' using errcode = 'P0001';
  end if;
  if v_target.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if v_target.role <> p_role then
    update public.memberships
    set role = p_role, version = version + 1, updated_at = now()
    where id = p_membership_id
    returning * into v_target;

    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('active_household_role', v_target.role::text)
    where id = v_target.user_id
      and raw_app_meta_data->>'active_household_id' = p_household_id::text
      and raw_app_meta_data->>'active_membership_id' = v_target.id::text;

    insert into public.audit_events(
      household_id, actor_id, event_name, entity_type, entity_id, metadata
    )
    values (
      p_household_id, v_actor, 'membership.role_changed', 'membership',
      v_target.id, jsonb_build_object('role', v_target.role, 'version', v_target.version)
    );
  end if;

  v_response := jsonb_build_object(
    'operationId', p_operation_id,
    'kind', 'membership.role_changed',
    'membershipId', v_target.id,
    'membershipVersion', v_target.version,
    'role', v_target.role
  );
  insert into public.household_access_operations(
    operation_id, household_id, actor_id, operation_kind, target_id,
    request_hash, response
  )
  values (
    p_operation_id, p_household_id, v_actor, 'membership.role_changed',
    v_target.id, v_hash, v_response
  );
  return v_response;
end
$$;

create or replace function public.revoke_household_member(
  p_household_id uuid,
  p_membership_id uuid,
  p_expected_version integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.memberships;
  v_hash text;
  v_existing public.household_access_operations;
  v_response jsonb;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_expected_version < 1 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  v_hash := encode(digest(
    jsonb_build_object(
      'householdId', p_household_id,
      'membershipId', p_membership_id,
      'expectedVersion', p_expected_version
    )::text,
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_household_id::text || ':' || p_operation_id::text, 0));

  select * into v_existing
  from public.household_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing.actor_id <> v_actor
      or v_existing.household_id <> p_household_id
      or v_existing.operation_kind <> 'membership.revoked'
      or v_existing.request_hash <> v_hash
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_existing.response;
  end if;

  perform 1 from public.households
  where id = p_household_id and deleted_at is null
  for update;
  if not found then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1
  from public.memberships
  where household_id = p_household_id
    and user_id = v_actor
    and role = 'owner'
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  select * into v_target
  from public.memberships
  where id = p_membership_id
    and household_id = p_household_id
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target.user_id = v_actor then
    raise exception 'SELF_REVOCATION_FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_target.role = 'owner' then
    raise exception 'OWNER_ROLE_PROTECTED' using errcode = 'P0001';
  end if;
  if v_target.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.memberships
  set
    status = 'revoked',
    version = version + 1,
    updated_at = now(),
    deleted_at = now()
  where id = p_membership_id
  returning * into v_target;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    - 'active_household_id'
    - 'active_membership_id'
    - 'active_household_role'
    - 'onboarding_complete'
  where id = v_target.user_id
    and raw_app_meta_data->>'active_household_id' = p_household_id::text;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id, metadata
  )
  values (
    p_household_id, v_actor, 'membership.revoked', 'membership',
    v_target.id, jsonb_build_object('version', v_target.version)
  );

  v_response := jsonb_build_object(
    'operationId', p_operation_id,
    'kind', 'membership.revoked',
    'membershipId', v_target.id,
    'membershipVersion', v_target.version,
    'status', v_target.status
  );
  insert into public.household_access_operations(
    operation_id, household_id, actor_id, operation_kind, target_id,
    request_hash, response
  )
  values (
    p_operation_id, p_household_id, v_actor, 'membership.revoked',
    v_target.id, v_hash, v_response
  );
  return v_response;
end
$$;

create or replace function public.cancel_household_invite(
  p_household_id uuid,
  p_invite_id uuid,
  p_expected_version integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invite public.invites;
  v_hash text;
  v_existing public.household_access_operations;
  v_response jsonb;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_expected_version < 1 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  v_hash := encode(digest(
    jsonb_build_object(
      'householdId', p_household_id,
      'inviteId', p_invite_id,
      'expectedVersion', p_expected_version
    )::text,
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_household_id::text || ':' || p_operation_id::text, 0));

  select * into v_existing
  from public.household_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing.actor_id <> v_actor
      or v_existing.household_id <> p_household_id
      or v_existing.operation_kind <> 'invite.cancelled'
      or v_existing.request_hash <> v_hash
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_existing.response;
  end if;

  perform 1 from public.households
  where id = p_household_id and deleted_at is null
  for update;
  if not found then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1
  from public.memberships
  where household_id = p_household_id
    and user_id = v_actor
    and role = 'owner'
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.invites
  where id = p_invite_id and household_id = p_household_id
  for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_invite.accepted_at is not null or v_invite.revoked_at is not null then
    raise exception 'INVITE_NOT_PENDING' using errcode = 'P0001';
  end if;
  if v_invite.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.invites
  set revoked_at = now(), version = version + 1
  where id = p_invite_id
  returning * into v_invite;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id, metadata
  )
  values (
    p_household_id, v_actor, 'invite.cancelled', 'invite',
    v_invite.id, jsonb_build_object('version', v_invite.version)
  );

  v_response := jsonb_build_object(
    'operationId', p_operation_id,
    'kind', 'invite.cancelled',
    'inviteId', v_invite.id,
    'inviteVersion', v_invite.version,
    'status', 'cancelled'
  );
  insert into public.household_access_operations(
    operation_id, household_id, actor_id, operation_kind, target_id,
    request_hash, response
  )
  values (
    p_operation_id, p_household_id, v_actor, 'invite.cancelled',
    v_invite.id, v_hash, v_response
  );
  return v_response;
end
$$;

create or replace function public.transfer_household_ownership(
  p_household_id uuid,
  p_target_membership_id uuid,
  p_expected_owner_version integer,
  p_expected_target_version integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner public.memberships;
  v_target public.memberships;
  v_hash text;
  v_existing public.household_access_operations;
  v_response jsonb;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_expected_owner_version < 1 or p_expected_target_version < 1 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  v_hash := encode(digest(
    jsonb_build_object(
      'householdId', p_household_id,
      'targetMembershipId', p_target_membership_id,
      'expectedOwnerVersion', p_expected_owner_version,
      'expectedTargetVersion', p_expected_target_version,
      'sourceBecomes', 'editor'
    )::text,
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_household_id::text || ':' || p_operation_id::text, 0));

  select * into v_existing
  from public.household_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing.actor_id <> v_actor
      or v_existing.household_id <> p_household_id
      or v_existing.operation_kind <> 'ownership.transferred'
      or v_existing.request_hash <> v_hash
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_existing.response;
  end if;

  perform 1 from public.households
  where id = p_household_id and deleted_at is null
  for update;
  if not found then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_owner
  from public.memberships
  where household_id = p_household_id
    and user_id = v_actor
    and role = 'owner'
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if v_owner.version <> p_expected_owner_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  select * into v_target
  from public.memberships
  where id = p_target_membership_id
    and household_id = p_household_id
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target.user_id = v_actor or v_target.role = 'owner' then
    raise exception 'INVALID_OWNERSHIP_TARGET' using errcode = 'P0001';
  end if;
  if v_target.version <> p_expected_target_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  -- The unique active-owner index remains valid after each statement. Other
  -- transactions see either the old pair or the committed new pair.
  update public.memberships
  set role = 'editor', version = version + 1, updated_at = now()
  where id = v_owner.id
  returning * into v_owner;

  update public.memberships
  set role = 'owner', version = version + 1, updated_at = now()
  where id = v_target.id
  returning * into v_target;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('active_household_role', 'editor')
  where id = v_owner.user_id
    and raw_app_meta_data->>'active_household_id' = p_household_id::text
    and raw_app_meta_data->>'active_membership_id' = v_owner.id::text;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('active_household_role', 'owner')
  where id = v_target.user_id
    and raw_app_meta_data->>'active_household_id' = p_household_id::text
    and raw_app_meta_data->>'active_membership_id' = v_target.id::text;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id, metadata
  )
  values (
    p_household_id, v_actor, 'ownership.transferred', 'membership',
    v_target.id, jsonb_build_object(
      'previousOwnerMembershipId', v_owner.id,
      'newOwnerMembershipId', v_target.id,
      'previousOwnerVersion', v_owner.version,
      'newOwnerVersion', v_target.version
    )
  );

  v_response := jsonb_build_object(
    'operationId', p_operation_id,
    'kind', 'ownership.transferred',
    'previousOwnerMembershipId', v_owner.id,
    'previousOwnerVersion', v_owner.version,
    'previousOwnerRole', v_owner.role,
    'newOwnerMembershipId', v_target.id,
    'newOwnerVersion', v_target.version,
    'newOwnerRole', v_target.role
  );
  insert into public.household_access_operations(
    operation_id, household_id, actor_id, operation_kind, target_id,
    request_hash, response
  )
  values (
    p_operation_id, p_household_id, v_actor, 'ownership.transferred',
    v_target.id, v_hash, v_response
  );
  return v_response;
end
$$;

revoke all on table public.household_access_operations
  from public, anon, authenticated;
revoke execute on function public.household_access_snapshot(uuid)
  from public, anon;
revoke execute on function public.change_household_member_role(
  uuid, uuid, integer, public.household_role, uuid
) from public, anon;
revoke execute on function public.revoke_household_member(
  uuid, uuid, integer, uuid
) from public, anon;
revoke execute on function public.cancel_household_invite(
  uuid, uuid, integer, uuid
) from public, anon;
revoke execute on function public.transfer_household_ownership(
  uuid, uuid, integer, integer, uuid
) from public, anon;

grant execute on function public.household_access_snapshot(uuid)
  to authenticated;
grant execute on function public.change_household_member_role(
  uuid, uuid, integer, public.household_role, uuid
) to authenticated;
grant execute on function public.revoke_household_member(
  uuid, uuid, integer, uuid
) to authenticated;
grant execute on function public.cancel_household_invite(
  uuid, uuid, integer, uuid
) to authenticated;
grant execute on function public.transfer_household_ownership(
  uuid, uuid, integer, integer, uuid
) to authenticated;

commit;
