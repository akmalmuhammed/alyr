begin;

-- The raw counter remains a service-only implementation detail. Household
-- members receive one deliberately narrow projection through this function;
-- no object identifiers, filenames, global capacity, reservations, or plan
-- controls cross the tenant boundary.
create or replace function public.read_household_storage_usage(
  p_household_id uuid
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
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_used_bytes bigint;
  v_allowance_bytes bigint;
begin
  if v_actor is null then
    return;
  end if;

  -- A missing/deleted household and an absent/revoked membership deliberately
  -- produce the same empty result. The Edge boundary maps both to the same
  -- 403 response so this reader is not a household-existence oracle.
  perform 1
  from public.households household
  join public.memberships membership
    on membership.household_id = household.id
   and membership.user_id = v_actor
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

revoke all on function public.read_household_storage_usage(uuid)
  from public, anon, authenticated, supabase_auth_admin, service_role;
grant execute on function public.read_household_storage_usage(uuid)
  to authenticated;

-- Reassert the table boundary in the same migration that adds the reader.
-- The security-definer function above is the sole authenticated projection.
revoke all on table public.household_storage_usage
  from public, anon, authenticated, supabase_auth_admin;
grant select on table public.household_storage_usage to service_role;

comment on function public.read_household_storage_usage(uuid) is
  'Active-member-only retained-byte and allowance projection; unauthorized and missing households both return no rows.';

commit;
