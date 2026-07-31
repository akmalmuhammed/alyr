begin;

-- Append-only convergence for every migration ledger that already records the
-- legacy 009 reader. On a fresh linked rollout, 009 is recorded as superseded
-- without executing its SQL, then this migration creates the hardened reader.
-- Reapplying this body after a disposable 009 -> 010 local sequence is also
-- idempotent. The Edge API authenticates the request and binds the verified
-- user ID into this service-only function.
drop function if exists public.read_household_storage_usage(uuid);

create or replace function public.read_household_storage_usage(
  p_household_id uuid,
  p_actor_id uuid
)
returns table(
  household_id uuid,
  used_bytes bigint,
  allowance_bytes bigint,
  measured_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_used_bytes bigint;
  v_allowance_bytes bigint;
begin
  if p_actor_id is null then
    return;
  end if;

  -- A missing/deleted household and an absent/revoked membership deliberately
  -- produce the same empty result. The Edge boundary maps both to the same
  -- 403 response so this reader is not a household-existence oracle.
  perform 1
  from public.households household
  join public.memberships membership
    on membership.household_id = household.id
   and membership.user_id = p_actor_id
   and membership.status = 'active'
   and membership.deleted_at is null
  where household.id = p_household_id
    and household.deleted_at is null;

  if not found then
    return;
  end if;

  select controls.household_storage_limit_bytes
  into v_allowance_bytes
  from public.launch_enrollment_controls controls
  where controls.id = 1;

  if not found then
    raise exception 'STORAGE_CONTROL_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select coalesce(usage.retained_bytes, 0)
  into v_used_bytes
  from (values (1)) singleton(value)
  left join public.household_storage_usage usage
    on usage.household_id = p_household_id;

  return query
  select
    p_household_id,
    v_used_bytes,
    v_allowance_bytes,
    statement_timestamp();
end
$$;

revoke all on function public.read_household_storage_usage(uuid, uuid)
  from public, anon, authenticated, supabase_auth_admin, service_role;
grant execute on function public.read_household_storage_usage(uuid, uuid)
  to service_role;

-- Reassert the raw-table boundary in the hardening migration. The function is
-- the only projection used by Edge; direct access remains service-only.
revoke all on table public.household_storage_usage
  from public, anon, authenticated, supabase_auth_admin, service_role;
grant select on table public.household_storage_usage to service_role;

comment on function public.read_household_storage_usage(uuid, uuid) is
  'Edge-service-only active-member retained-byte and allowance projection; unauthorized and missing households both return no rows.';

-- Make privilege and signature convergence part of the transaction. A
-- successful ledger entry for 010 therefore proves the legacy callable is gone
-- and the replacement is not executable by client-facing roles.
do $$
declare
  v_reader regprocedure := to_regprocedure(
    'public.read_household_storage_usage(uuid,uuid)'
  );
begin
  if to_regprocedure('public.read_household_storage_usage(uuid)') is not null then
    raise exception 'LEGACY_HOUSEHOLD_STORAGE_READER_REMAINS'
      using errcode = 'P0001';
  end if;

  if v_reader is null then
    raise exception 'HARDENED_HOUSEHOLD_STORAGE_READER_MISSING'
      using errcode = 'P0001';
  end if;

  if has_function_privilege('anon', v_reader, 'execute')
     or has_function_privilege('authenticated', v_reader, 'execute')
     or has_function_privilege('supabase_auth_admin', v_reader, 'execute') then
    raise exception 'CLIENT_ROLE_CAN_EXECUTE_HOUSEHOLD_STORAGE_READER'
      using errcode = 'P0001';
  end if;

  if not has_function_privilege('service_role', v_reader, 'execute') then
    raise exception 'SERVICE_ROLE_CANNOT_EXECUTE_HOUSEHOLD_STORAGE_READER'
      using errcode = 'P0001';
  end if;
end
$$;

commit;
