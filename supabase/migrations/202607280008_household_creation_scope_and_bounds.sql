begin;

-- Onboarding belongs to a household, not to an account-global routing flag.
-- The flag in auth metadata remains a cached view of the currently selected
-- household and is rebuilt from this column on every creation replay.
alter table public.households
  add column onboarding_completed_at timestamptz;

update public.households h
set onboarding_completed_at = coalesce(h.updated_at, now())
from auth.users u
where u.id = h.created_by
  and u.raw_app_meta_data->>'active_household_id' = h.id::text
  and coalesce(
    (u.raw_app_meta_data->>'onboarding_complete')::boolean,
    false
  );

drop index if exists household_creation_operations_user_created;
create index household_creation_operations_actor_household_created
  on public.household_creation_operations(
    user_id,
    household_id,
    created_at desc
  );

revoke execute on function public.create_household(text, uuid)
  from anon, authenticated;
drop function public.create_household(text, uuid);

create function public.create_household(
  p_name text,
  p_operation_id uuid,
  p_household_id uuid
)
returns public.households
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_name);
  v_household public.households;
  v_membership public.memberships;
  v_receipt public.household_creation_operations;
  v_enrollment public.pilot_enrollments;
  v_existing_households integer;
  v_pilot_households integer;
  v_receipt_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_operation_id is null or p_household_id is null then
    raise exception 'INVALID_OPERATION_ID' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'INVALID_HOUSEHOLD_NAME' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.enrollment'));

  -- Each actor/household retains at most eight current receipts. Expired
  -- receipts are removed before replay lookup; their household UUID still
  -- makes a later recovery deterministic.
  delete from public.household_creation_operations
  where user_id = v_user_id
    and created_at < now() - interval '30 days';

  select * into v_receipt
  from public.household_creation_operations
  where operation_id = p_operation_id
  for update;

  if found then
    if v_receipt.user_id is distinct from v_user_id
      or v_receipt.request_name is distinct from v_name
      or v_receipt.household_id is distinct from p_household_id
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select * into v_household
    from public.households
    where id = v_receipt.household_id
      and deleted_at is null
    for update;
    if not found then
      raise exception 'IDEMPOTENCY_RECEIPT_INVALID' using errcode = 'P0001';
    end if;

    select * into v_membership
    from public.memberships
    where household_id = v_household.id
      and user_id = v_user_id
      and role = 'owner'::public.household_role
      and status = 'active'
      and deleted_at is null
    for update;
    if not found then
      raise exception 'IDEMPOTENCY_RECEIPT_INVALID' using errcode = 'P0001';
    end if;

    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'active_household_id', v_household.id::text,
        'active_membership_id', v_membership.id::text,
        'active_household_role', v_membership.role::text,
        'onboarding_complete',
          v_household.onboarding_completed_at is not null
      )
    where id = v_user_id;

    return v_household;
  end if;

  select * into v_enrollment
  from public.pilot_enrollments
  where user_id = v_user_id
    and enabled
    and (expires_at is null or expires_at > now())
  for update;
  if not found then
    raise exception 'PILOT_ENROLLMENT_REQUIRED' using errcode = 'P0001';
  end if;

  -- A different operation UUID may recover only its explicitly supplied
  -- household UUID. No account-global onboarding flag or arbitrary
  -- created_by row participates in selection.
  select * into v_household
  from public.households
  where id = p_household_id
  for update;

  if found then
    if v_household.deleted_at is not null
      or v_household.created_by is distinct from v_user_id
    then
      raise exception 'HOUSEHOLD_RECOVERY_DENIED' using errcode = 'P0001';
    end if;

    select * into v_membership
    from public.memberships
    where household_id = p_household_id
      and user_id = v_user_id
      and role = 'owner'::public.household_role
      and status = 'active'
      and deleted_at is null
    for update;
    if not found then
      raise exception 'HOUSEHOLD_RECOVERY_DENIED' using errcode = 'P0001';
    end if;

    select count(*) into v_receipt_count
    from public.household_creation_operations
    where user_id = v_user_id
      and household_id = p_household_id;
    if v_receipt_count >= 8 then
      raise exception 'HOUSEHOLD_OPERATION_LIMIT' using errcode = 'P0001';
    end if;

    insert into public.household_creation_operations(
      operation_id, user_id, request_name, household_id
    )
    values (
      p_operation_id, v_user_id, v_name, p_household_id
    );

    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'active_household_id', v_household.id::text,
        'active_membership_id', v_membership.id::text,
        'active_household_role', v_membership.role::text,
        'onboarding_complete',
          v_household.onboarding_completed_at is not null
      )
    where id = v_user_id;

    return v_household;
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

  insert into public.households(id, name, created_by)
  values (p_household_id, v_name, v_user_id)
  returning * into v_household;

  insert into public.memberships(household_id, user_id, role)
  values (v_household.id, v_user_id, 'owner')
  returning * into v_membership;

  insert into public.household_creation_operations(
    operation_id, user_id, request_name, household_id
  )
  values (
    p_operation_id, v_user_id, v_name, v_household.id
  );

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

grant execute on function public.create_household(text, uuid, uuid)
  to authenticated;

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

  update public.households
  set onboarding_completed_at =
        coalesce(onboarding_completed_at, now()),
      updated_at = now()
  where id = p_household_id
    and deleted_at is null;

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

commit;
