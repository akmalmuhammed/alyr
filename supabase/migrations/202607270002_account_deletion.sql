begin;

-- Auth identities may leave households that keep shared records. Preserve
-- those records while removing the deleted account as their attributed actor.
-- Tables owned exclusively by a sole-member household still disappear through
-- the household cascades in delete_account_domain_data.
alter table public.households
  alter column created_by drop not null,
  drop constraint households_created_by_fkey,
  add constraint households_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.places
  alter column created_by drop not null,
  drop constraint places_created_by_fkey,
  add constraint places_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.spaces
  alter column created_by drop not null,
  drop constraint spaces_created_by_fkey,
  add constraint spaces_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.assets
  alter column created_by drop not null,
  drop constraint assets_created_by_fkey,
  add constraint assets_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.asset_value_assertions
  alter column created_by drop not null,
  drop constraint asset_value_assertions_created_by_fkey,
  add constraint asset_value_assertions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.asset_location_revisions
  alter column proposed_by drop not null,
  drop constraint asset_location_revisions_proposed_by_fkey,
  add constraint asset_location_revisions_proposed_by_fkey
    foreign key (proposed_by) references auth.users(id) on delete set null;

alter table public.evidence
  alter column created_by drop not null,
  drop constraint evidence_created_by_fkey,
  add constraint evidence_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.blob_objects
  alter column created_by drop not null,
  drop constraint blob_objects_created_by_fkey,
  add constraint blob_objects_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.evidence_versions
  alter column created_by drop not null,
  drop constraint evidence_versions_created_by_fkey,
  add constraint evidence_versions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.invites
  alter column created_by drop not null,
  drop constraint invites_created_by_fkey,
  add constraint invites_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  drop constraint invites_accepted_by_fkey,
  add constraint invites_accepted_by_fkey
    foreign key (accepted_by) references auth.users(id) on delete set null;

alter table public.sync_operations
  alter column actor_id drop not null,
  drop constraint sync_operations_actor_id_fkey,
  add constraint sync_operations_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.audit_events
  drop constraint audit_events_actor_id_fkey,
  add constraint audit_events_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.export_snapshots
  alter column requested_by drop not null,
  drop constraint export_snapshots_requested_by_fkey,
  add constraint export_snapshots_requested_by_fkey
    foreign key (requested_by) references auth.users(id) on delete set null;

alter table public.product_events
  drop constraint product_events_actor_id_fkey,
  add constraint product_events_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

-- A service-only retry marker closes the narrow gap between transactional
-- domain removal and the auth-provider delete call. If that final provider
-- call is interrupted, the same re-authenticated account can safely resume.
create table public.account_deletion_jobs (
  account_id uuid primary key,
  deleted_household_ids uuid[] not null default '{}',
  departed_household_ids uuid[] not null default '{}',
  object_keys text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.account_deletion_jobs enable row level security;
alter table public.account_deletion_jobs force row level security;
revoke all on public.account_deletion_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.account_deletion_jobs
  to service_role;

create or replace function public.delete_account_domain_data(
  p_user_id uuid,
  p_expected_memberships jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_job public.account_deletion_jobs;
  v_actual_memberships jsonb;
  v_owned_household_ids uuid[];
  v_departed_household_ids uuid[];
  v_object_keys text[];
begin
  if p_user_id is null
     or p_expected_memberships is null
     or jsonb_typeof(p_expected_memberships) <> 'array' then
    raise exception 'INVALID_ACCOUNT_DELETION_REQUEST' using errcode = 'P0001';
  end if;

  -- Serialize retries for one account and lock the exact membership rows whose
  -- roles determine deletion consequences.
  perform pg_advisory_xact_lock(
    hashtextextended('account-deletion:' || p_user_id::text, 0)
  );

  select *
  into v_existing_job
  from public.account_deletion_jobs
  where account_id = p_user_id
  for update;

  if found then
    return jsonb_build_object(
      'accountId', v_existing_job.account_id,
      'deletedHouseholdIds', to_jsonb(v_existing_job.deleted_household_ids),
      'departedHouseholdIds', to_jsonb(v_existing_job.departed_household_ids),
      'deletedAt', v_existing_job.created_at
    );
  end if;

  perform 1
  from public.memberships
  where user_id = p_user_id
  order by id
  for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'membershipId', membership.id::text,
        'householdId', membership.household_id::text,
        'role', membership.role::text,
        'status', membership.status::text
      )
      order by membership.id::text
    ),
    '[]'::jsonb
  )
  into v_actual_memberships
  from public.memberships membership
  where membership.user_id = p_user_id;

  if v_actual_memberships is distinct from p_expected_memberships then
    raise exception 'ACCOUNT_STATE_CHANGED' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(membership.household_id order by membership.household_id), '{}')
  into v_owned_household_ids
  from public.memberships membership
  where membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.role = 'owner';

  if exists (
    select 1
    from public.memberships owner_membership
    join public.memberships other_membership
      on other_membership.household_id = owner_membership.household_id
     and other_membership.user_id <> p_user_id
     and other_membership.status = 'active'
     and other_membership.deleted_at is null
    where owner_membership.user_id = p_user_id
      and owner_membership.role = 'owner'
      and owner_membership.status = 'active'
      and owner_membership.deleted_at is null
  ) then
    raise exception 'OWNERSHIP_TRANSFER_REQUIRED' using errcode = 'P0001';
  end if;

  -- Lock owned households before snapshotting storage keys. A concurrent blob
  -- intent must finish before this point or wait for the household cascade.
  perform 1
  from public.households household
  where household.id = any(v_owned_household_ids)
  order by household.id
  for update;

  select coalesce(
    array_agg(blob.object_key order by blob.object_key),
    '{}'
  )
  into v_object_keys
  from public.blob_objects blob
  where blob.household_id = any(v_owned_household_ids)
    and blob.deleted_at is null;

  select coalesce(array_agg(membership.household_id order by membership.household_id), '{}')
  into v_departed_household_ids
  from public.memberships membership
  where membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.role <> 'owner';

  -- A sole-member owner explicitly loses the complete household. Editor and
  -- viewer departures keep household records for the remaining owner.
  delete from public.households household
  where household.id = any(v_owned_household_ids);

  delete from public.memberships membership
  where membership.user_id = p_user_id;

  insert into public.account_deletion_jobs(
    account_id,
    deleted_household_ids,
    departed_household_ids,
    object_keys
  )
  values (
    p_user_id,
    v_owned_household_ids,
    v_departed_household_ids,
    v_object_keys
  )
  returning * into v_existing_job;

  return jsonb_build_object(
    'accountId', p_user_id,
    'deletedHouseholdIds', to_jsonb(v_owned_household_ids),
    'departedHouseholdIds', to_jsonb(v_departed_household_ids),
    'deletedAt', v_existing_job.created_at
  );
end
$$;

revoke all on function public.delete_account_domain_data(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.delete_account_domain_data(uuid, jsonb)
  to service_role;

commit;
