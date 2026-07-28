begin;

-- A household can commit after the mobile request has lost its response.
-- Keep a server-side receipt keyed by the device-persisted operation UUID so
-- every retry returns the original household instead of consuming pilot
-- capacity again.
create table public.household_creation_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_name text not null
    check (char_length(request_name) between 1 and 120),
  household_id uuid not null
    references public.households(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index household_creation_operations_user_created
  on public.household_creation_operations(user_id, created_at desc);

alter table public.household_creation_operations enable row level security;
alter table public.household_creation_operations force row level security;

revoke all on table public.household_creation_operations
  from anon, authenticated;
revoke execute on function public.create_household(text)
  from anon, authenticated;
drop function public.create_household(text);

create function public.create_household(
  p_name text,
  p_operation_id uuid
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
  v_incomplete_households integer;
  v_pilot_households integer;
  v_onboarding_complete boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_operation_id is null then
    raise exception 'INVALID_OPERATION_ID' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'INVALID_HOUSEHOLD_NAME' using errcode = 'P0001';
  end if;

  -- Serialize receipt recovery, per-enrollment quota, and the global pilot
  -- capacity check in the same transaction.
  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.enrollment'));

  select * into v_receipt
  from public.household_creation_operations
  where operation_id = p_operation_id
  for update;

  if found then
    if v_receipt.user_id is distinct from v_user_id
      or v_receipt.request_name is distinct from v_name
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select h.* into v_household
    from public.households h
    where h.id = v_receipt.household_id
      and h.created_by = v_user_id
      and h.deleted_at is null
    for update;

    if not found then
      raise exception 'IDEMPOTENCY_RECEIPT_INVALID' using errcode = 'P0001';
    end if;

    select m.* into v_membership
    from public.memberships m
    where m.household_id = v_household.id
      and m.user_id = v_user_id
      and m.role = 'owner'::public.household_role
      and m.status = 'active'
      and m.deleted_at is null
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
          coalesce(
            (raw_app_meta_data ->> 'onboarding_complete')::boolean,
            false
          )
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

  select coalesce(
    (raw_app_meta_data ->> 'onboarding_complete')::boolean,
    false
  )
  into v_onboarding_complete
  from auth.users
  where id = v_user_id
  for update;

  -- If an older client lost the committed response before it persisted its
  -- operation UUID, a new UUID still recovers the caller's one unfinished
  -- owner household. It does not create a second household or consume another
  -- global pilot slot.
  select count(*) into v_incomplete_households
  from public.households h
  join public.memberships m
    on m.household_id = h.id
   and m.user_id = v_user_id
   and m.role = 'owner'::public.household_role
   and m.status = 'active'
   and m.deleted_at is null
  where h.created_by = v_user_id
    and h.deleted_at is null
    and not v_onboarding_complete;

  if v_incomplete_households > 1 then
    raise exception 'HOUSEHOLD_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  if v_incomplete_households = 1 then
    select h.* into v_household
    from public.households h
    where h.created_by = v_user_id
      and h.deleted_at is null
    for update;

    select m.* into v_membership
    from public.memberships m
    where m.household_id = v_household.id
      and m.user_id = v_user_id
      and m.role = 'owner'::public.household_role
      and m.status = 'active'
      and m.deleted_at is null
    for update;

    if not found then
      raise exception 'HOUSEHOLD_STATE_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.household_creation_operations(
      operation_id, user_id, request_name, household_id
    )
    values (
      p_operation_id, v_user_id, v_name, v_household.id
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
  values (v_name, v_user_id)
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

grant execute on function public.create_household(text, uuid)
  to authenticated;

commit;
