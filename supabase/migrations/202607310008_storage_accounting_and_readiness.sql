begin;

-- A provider-signed PUT can outlive the 15-minute application intent. Persist
-- the provider's actual authorization expiry before its URL is disclosed so
-- deletion and cleanup cannot remove a key that can still be recreated.
alter table public.blob_objects
  add column provider_delete_not_before timestamptz;

-- Before this column existed, a URL could have been signed moments after the
-- latest row mutation. Supabase upload URLs live for at most two hours, so a
-- migration-time two-hour window plus settlement/clock margin conservatively
-- protects every recent authorization across the migration boundary.
update public.blob_objects
set provider_delete_not_before =
  clock_timestamp() + interval '2 hours 15 minutes'
where updated_at > now() - interval '2 hours 15 minutes';

create index blob_objects_upload_authorization_expiry
  on public.blob_objects(provider_delete_not_before, household_id)
  where provider_delete_not_before is not null;

-- One retained-byte budget covers both Evidence and generated export objects.
-- Earlier migrations bounded each class independently, which could admit twice
-- the declared household allowance and let export bytes bypass the provider-wide
-- ceiling. Counters make admission constant-time while a periodic summary still
-- recomputes source-of-truth bytes to surface drift.
create table public.household_storage_usage (
  household_id uuid primary key
    references public.households(id) on delete cascade,
  retained_bytes bigint not null default 0
    check (retained_bytes >= 0),
  updated_at timestamptz not null default now()
);

alter table public.household_storage_usage enable row level security;
alter table public.household_storage_usage force row level security;
revoke all on table public.household_storage_usage
  from public, anon, authenticated, supabase_auth_admin;
grant select on table public.household_storage_usage to service_role;

-- Account deletion removes household rows before provider object deletion can
-- be acknowledged. This global-only hold preserves those physical bytes until
-- the durable retry job is deleted after every provider confirms removal.
create table public.account_deletion_storage_holds (
  account_id uuid primary key
    references public.account_deletion_jobs(account_id)
      on delete cascade deferrable initially deferred,
  retained_bytes bigint not null check (retained_bytes >= 0),
  created_at timestamptz not null default now()
);

create table public.account_deletion_storage_households (
  household_id uuid primary key,
  account_id uuid not null
    references public.account_deletion_storage_holds(account_id)
      on delete cascade
);

create table public.account_deletion_storage_objects (
  provider text not null check (provider in ('blob', 'export')),
  object_key text not null,
  account_id uuid not null
    references public.account_deletion_storage_holds(account_id)
      on delete cascade,
  byte_size bigint not null check (byte_size > 0),
  primary key (provider, object_key)
);

alter table public.account_deletion_storage_holds enable row level security;
alter table public.account_deletion_storage_holds force row level security;
alter table public.account_deletion_storage_households enable row level security;
alter table public.account_deletion_storage_households force row level security;
alter table public.account_deletion_storage_objects enable row level security;
alter table public.account_deletion_storage_objects force row level security;
revoke all on table public.account_deletion_storage_holds
  from public, anon, authenticated, supabase_auth_admin, service_role;
revoke all on table public.account_deletion_storage_households
  from public, anon, authenticated, supabase_auth_admin, service_role;
revoke all on table public.account_deletion_storage_objects
  from public, anon, authenticated, supabase_auth_admin, service_role;

-- Old jobs do not contain byte sizes, so silently guessing a backfill would
-- weaken exact accounting. Resolve any pending provider cleanup before apply.
do $$
begin
  if exists (
    select 1
    from public.account_deletion_jobs job
    where cardinality(job.object_keys) > 0
       or cardinality(job.export_object_keys) > 0
  ) then
    raise exception 'ACCOUNT_DELETION_HOLD_BACKFILL_REQUIRED'
      using errcode = 'P0001';
  end if;
end
$$;

alter table public.launch_enrollment_controls
  add column retained_storage_bytes bigint not null default 0
    check (retained_storage_bytes >= 0);

with retained as (
  select source.household_id, sum(source.byte_size)::bigint as retained_bytes
  from (
    select blob.household_id, blob.byte_size
    from public.blob_objects blob
    where blob.deleted_at is null
    union all
    select cleanup.household_id, cleanup.byte_size
    from public.blob_object_cleanup_queue cleanup
    union all
    select snapshot.household_id, snapshot.byte_size
    from public.export_snapshots snapshot
    where snapshot.object_key is not null
    union all
    select cleanup.household_id, cleanup.byte_size
    from public.export_object_cleanup_queue cleanup
  ) source
  group by source.household_id
)
insert into public.household_storage_usage(
  household_id,
  retained_bytes,
  updated_at
)
select household.id, coalesce(retained.retained_bytes, 0), now()
from public.households household
left join retained on retained.household_id = household.id
on conflict (household_id) do update
set retained_bytes = excluded.retained_bytes,
    updated_at = excluded.updated_at;

update public.launch_enrollment_controls controls
set retained_storage_bytes =
  coalesce(
    (select sum(usage.retained_bytes) from public.household_storage_usage usage),
    0
  ) +
  coalesce(
    (
      select sum(hold.retained_bytes)
      from public.account_deletion_storage_holds hold
    ),
    0
  ),
updated_at = now()
where controls.id = 1;

-- Replace the O(total objects) quota scans in the upload RPC. The row trigger
-- below performs the final atomic household/global admission against counters;
-- this function retains all parent, identity, expiry, and actor validation.
create or replace function public.create_blob_upload_intent(
  p_id uuid,
  p_household_id uuid,
  p_evidence_id uuid,
  p_evidence_version_id uuid,
  p_object_key text,
  p_checksum_sha256 text,
  p_byte_size bigint,
  p_mime_type text
)
returns public.blob_objects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blob public.blob_objects;
  v_blob_exists boolean := false;
  v_controls public.launch_enrollment_controls;
begin
  if not public.can_edit_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  -- Serialize only callers creating/retrying this immutable Blob ID. Existing
  -- cleanup obtains the Blob row before the global accounting trigger, so the
  -- upload path must never hold the global lock while waiting for that row.
  perform pg_advisory_xact_lock(
    hashtextextended('heldat.blob-intent:' || p_id::text, 0)
  );
  select *
  into v_controls
  from public.launch_enrollment_controls
  where id = 1;
  if not found then
    raise exception 'STORAGE_CONTROL_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Existing-row paths lock child -> household gate. Account deletion uses the
  -- same order before locking the parent row, avoiding a renewal/deletion cycle.
  select *
  into v_blob
  from public.blob_objects
  where id = p_id
  for update;
  v_blob_exists := found;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'heldat.storage.household:' || p_household_id::text,
      0
    )
  );

  perform 1
  from public.households
  where id = p_household_id
    and deleted_at is null
  for key share;
  if not found then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_object_key is distinct from concat(
    p_household_id::text,
    '/',
    p_id::text,
    '/',
    p_evidence_version_id::text
  ) then
    raise exception 'INVALID_OBJECT_KEY' using errcode = 'P0001';
  end if;
  if p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_CHECKSUM' using errcode = 'P0001';
  end if;
  if p_byte_size < 1 or p_byte_size > v_controls.max_attachment_bytes then
    raise exception 'INVALID_FILE_SIZE' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_mime_type, '')) not between 1 and 160 then
    raise exception 'INVALID_MIME_TYPE' using errcode = 'P0001';
  end if;

  perform 1
  from public.evidence parent
  where parent.id = p_evidence_id
    and parent.household_id = p_household_id
    and parent.deleted_at is null
    and (
      (
        parent.asset_id is not null
        and parent.place_id is null
        and exists (
          select 1
          from public.assets asset
          where asset.id = parent.asset_id
            and asset.household_id = parent.household_id
            and asset.deleted_at is null
        )
      )
      or
      (
        parent.place_id is not null
        and parent.asset_id is null
        and exists (
          select 1
          from public.places place
          where place.id = parent.place_id
            and place.household_id = parent.household_id
            and place.deleted_at is null
        )
      )
    )
  for key share;
  if not found then
    raise exception 'EVIDENCE_PARENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.evidence_versions version
    where version.id = p_evidence_version_id
  ) then
    raise exception 'UPLOAD_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  if v_blob_exists then
    if v_blob.household_id is distinct from p_household_id
       or v_blob.expected_evidence_id is distinct from p_evidence_id
       or v_blob.expected_evidence_version_id
            is distinct from p_evidence_version_id
       or v_blob.object_key is distinct from p_object_key
       or v_blob.checksum_sha256 is distinct from p_checksum_sha256
       or v_blob.byte_size is distinct from p_byte_size
       or v_blob.mime_type is distinct from p_mime_type
       or v_blob.created_by is distinct from auth.uid() then
      raise exception 'UPLOAD_INTENT_CONFLICT' using errcode = 'P0001';
    end if;
    if v_blob.deleted_at is not null
       or v_blob.status = 'needs-attention'
       or v_blob.intent_expires_at is null
       or v_blob.intent_expires_at <= now() then
      raise exception 'UPLOAD_INTENT_EXPIRED' using errcode = 'P0001';
    end if;
    if v_blob.status <> 'upload-intent' then
      raise exception 'UPLOAD_ALREADY_COMPLETED' using errcode = 'P0001';
    end if;

    update public.blob_objects
    set intent_expires_at = now() + interval '15 minutes',
        updated_at = now()
    where id = p_id
    returning * into v_blob;
    return v_blob;
  end if;

  insert into public.blob_objects(
    id,
    household_id,
    expected_evidence_id,
    expected_evidence_version_id,
    object_key,
    checksum_sha256,
    byte_size,
    mime_type,
    status,
    intent_expires_at,
    created_by
  )
  values (
    p_id,
    p_household_id,
    p_evidence_id,
    p_evidence_version_id,
    p_object_key,
    p_checksum_sha256,
    p_byte_size,
    p_mime_type,
    'upload-intent',
    now() + interval '15 minutes',
    auth.uid()
  )
  returning * into v_blob;
  return v_blob;
end
$$;

-- Record the provider's real signed-PUT lifetime before the API returns the
-- secret URL to the caller. Failure leaves the URL undisclosed and therefore
-- unusable outside the trusted Edge process.
create or replace function public.record_blob_upload_authorization(
  p_blob_id uuid,
  p_expires_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blob public.blob_objects;
  v_recorded_expiry timestamptz;
begin
  if p_blob_id is null
     or p_expires_at is null
     or p_expires_at <= clock_timestamp()
     or p_expires_at > clock_timestamp() + interval '2 hours 15 minutes' then
    raise exception 'UPLOAD_AUTHORIZATION_EXPIRY_INVALID'
      using errcode = 'P0001';
  end if;

  select *
  into v_blob
  from public.blob_objects blob
  where blob.id = p_blob_id
  for update;
  if not found
     or v_blob.created_by is distinct from auth.uid()
     or v_blob.status <> 'upload-intent'
     or v_blob.deleted_at is not null
     or v_blob.intent_expires_at is null
     or v_blob.intent_expires_at <= now() then
    raise exception 'UPLOAD_AUTHORIZATION_INTENT_UNAVAILABLE'
      using errcode = '40001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'heldat.storage.household:' || v_blob.household_id::text,
      0
    )
  );
  update public.blob_objects
  set provider_delete_not_before = greatest(
        coalesce(
          provider_delete_not_before,
          p_expires_at + interval '15 minutes'
        ),
        p_expires_at + interval '15 minutes'
      ),
      updated_at = now()
  where id = p_blob_id
  returning provider_delete_not_before into v_recorded_expiry;
  return v_recorded_expiry;
end
$$;

revoke all on function public.record_blob_upload_authorization(uuid, timestamptz)
  from public, anon, authenticated, supabase_auth_admin, service_role;
grant execute on function public.record_blob_upload_authorization(uuid, timestamptz)
  to authenticated;

-- Completion follows the same child -> household gate -> parent lock order as
-- renewal and account deletion. The provider deletion horizon is deliberately
-- absent from the UPDATE list: a completed upload remains protected until the
-- already-disclosed signed PUT and its settlement margin expire.
create or replace function public.mark_blob_stored(
  p_id uuid,
  p_checksum_sha256 text,
  p_byte_size bigint,
  p_verified_actor_id uuid
)
returns public.blob_objects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blob public.blob_objects;
begin
  select *
  into v_blob
  from public.blob_objects blob
  where blob.id = p_id
    and blob.deleted_at is null
  for update;

  if not found or v_blob.created_by <> p_verified_actor_id then
    raise exception 'UPLOAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'heldat.storage.household:' || v_blob.household_id::text,
      0
    )
  );

  perform 1
  from public.households household
  where household.id = v_blob.household_id
    and household.deleted_at is null
  for key share;
  if not found then
    raise exception 'UPLOAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_blob.checksum_sha256 <> p_checksum_sha256 then
    raise exception 'UPLOAD_CHECKSUM_MISMATCH' using errcode = 'P0001';
  end if;

  if v_blob.byte_size <> p_byte_size then
    raise exception 'UPLOAD_SIZE_MISMATCH' using errcode = 'P0001';
  end if;

  if v_blob.status = 'stored' then
    return v_blob;
  end if;

  if v_blob.status <> 'upload-intent' then
    raise exception 'UPLOAD_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  if v_blob.intent_expires_at is null
     or v_blob.intent_expires_at <= now() then
    raise exception 'UPLOAD_INTENT_EXPIRED' using errcode = 'P0001';
  end if;

  update public.blob_objects
  set
    status = 'stored',
    intent_expires_at = null,
    updated_at = now()
  where id = p_id
  returning * into v_blob;

  return v_blob;
end
$$;

-- Pre-lock a bounded candidate set, then acquire every affected household gate
-- in UUID order before any row trigger runs. This preserves batch throughput
-- without accumulating advisory locks in candidate-expiry order.
create or replace function public.enqueue_blob_object_cleanup(
  p_limit integer default 100,
  p_orphan_grace interval default interval '24 hours'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate_ids uuid[];
  v_upload_intent_ids uuid[];
  v_household_ids uuid[];
  v_household_id uuid;
  v_enqueued integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_CLEANUP_LIMIT' using errcode = 'P0001';
  end if;
  if p_orphan_grace is null
     or p_orphan_grace < interval '1 hour'
     or p_orphan_grace > interval '30 days' then
    raise exception 'INVALID_ORPHAN_GRACE' using errcode = 'P0001';
  end if;

  select
    coalesce(array_agg(candidate.id order by candidate.id), '{}'),
    coalesce(
      array_agg(candidate.id order by candidate.id)
        filter (where candidate.status = 'upload-intent'),
      '{}'
    ),
    coalesce(
      array_agg(distinct candidate.household_id order by candidate.household_id),
      '{}'
    )
  into v_candidate_ids, v_upload_intent_ids, v_household_ids
  from (
    -- Preserve oldest-first candidate selection, but acquire the actual Blob
    -- row locks in UUID order. Account deletion drains the same rows in UUID
    -- order, so a multi-row cleanup batch cannot invert its child lock order.
    with selected as materialized (
      select blob.id
      from public.blob_objects blob
      where blob.deleted_at is null
        and (
          blob.provider_delete_not_before is null
          or blob.provider_delete_not_before <= clock_timestamp()
        )
        and not exists (
          select 1
          from public.evidence_versions version
          where version.household_id = blob.household_id
            and version.blob_object_id = blob.id
        )
        and (
          (
            blob.status = 'upload-intent'
            and (
              blob.intent_expires_at is null
              or blob.intent_expires_at <= now()
            )
          )
          or (
            blob.status = 'stored'
            and blob.updated_at <= now() - p_orphan_grace
          )
        )
      order by
        case
          when blob.status = 'upload-intent'
            then coalesce(blob.intent_expires_at, blob.updated_at)
          else blob.updated_at
        end,
        blob.id
      limit p_limit
    )
    select blob.id, blob.household_id, blob.status
    from public.blob_objects blob
    join selected on selected.id = blob.id
    where blob.deleted_at is null
      and (
        blob.provider_delete_not_before is null
        or blob.provider_delete_not_before <= clock_timestamp()
      )
      and not exists (
        select 1
        from public.evidence_versions version
        where version.household_id = blob.household_id
          and version.blob_object_id = blob.id
      )
      and (
        (
          blob.status = 'upload-intent'
          and (
            blob.intent_expires_at is null
            or blob.intent_expires_at <= now()
          )
        )
        or (
          blob.status = 'stored'
          and blob.updated_at <= now() - p_orphan_grace
        )
      )
    order by blob.id
    for update of blob skip locked
  ) candidate;

  if cardinality(v_candidate_ids) = 0 then return 0; end if;

  foreach v_household_id in array v_household_ids
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'heldat.storage.household:' || v_household_id::text,
        0
      )
    );
  end loop;

  with marked as (
    update public.blob_objects blob
    set
      status = 'needs-attention',
      intent_expires_at = null,
      deleted_at = now(),
      updated_at = now()
    where blob.id = any(v_candidate_ids)
    returning
      blob.id,
      blob.household_id,
      blob.object_key,
      blob.byte_size,
      blob.checksum_sha256,
      blob.mime_type
  ),
  queued as (
    insert into public.blob_object_cleanup_queue(
      blob_object_id,
      household_id,
      object_key,
      reason,
      byte_size,
      checksum_sha256,
      mime_type
    )
    select
      marked.id,
      marked.household_id,
      marked.object_key,
      case
        when marked.id = any(v_upload_intent_ids) then 'expired-intent'
        else 'unattached-stored'
      end,
      marked.byte_size,
      marked.checksum_sha256,
      marked.mime_type
    from marked
    on conflict (blob_object_id) do update
    set
      available_at = least(
        public.blob_object_cleanup_queue.available_at,
        excluded.available_at
      ),
      updated_at = now()
    returning 1
  )
  select count(*)::integer into v_enqueued from queued;
  return v_enqueued;
end
$$;

-- A provider deletion claim is not issued until the signed PUT and a bounded
-- request-settlement grace have both elapsed. The timestamp is retained after
-- mark_blob_stored, so completed objects receive the same protection.
create or replace function public.claim_blob_object_cleanup(
  p_limit integer default 25,
  p_lease interval default interval '5 minutes'
)
returns table(
  blob_object_id uuid,
  household_id uuid,
  object_key text,
  byte_size bigint,
  checksum_sha256 text,
  mime_type text,
  reason text,
  claim_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_claim_token uuid := gen_random_uuid();
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_CLEANUP_LIMIT' using errcode = 'P0001';
  end if;
  if p_lease is null
     or p_lease < interval '1 minute'
     or p_lease > interval '1 hour' then
    raise exception 'INVALID_CLEANUP_LEASE' using errcode = 'P0001';
  end if;

  return query
  with candidates as materialized (
    select cleanup.blob_object_id
    from public.blob_object_cleanup_queue cleanup
    join public.blob_objects blob on blob.id = cleanup.blob_object_id
    where cleanup.available_at <= now()
      and (
        cleanup.claim_token is null
        or cleanup.claimed_at <= now() - p_lease
      )
      and (
        blob.provider_delete_not_before is null
        or blob.provider_delete_not_before <= clock_timestamp()
      )
    order by cleanup.available_at, cleanup.created_at, cleanup.blob_object_id
    limit p_limit
    for update of cleanup skip locked
  ),
  claimed as (
    update public.blob_object_cleanup_queue cleanup
    set
      claimed_at = now(),
      claim_token = v_claim_token,
      attempt_count = cleanup.attempt_count + 1,
      last_error_code = null,
      updated_at = now()
    from candidates
    where cleanup.blob_object_id = candidates.blob_object_id
    returning
      cleanup.blob_object_id as claimed_blob_object_id,
      cleanup.household_id as claimed_household_id,
      cleanup.object_key as claimed_object_key,
      cleanup.byte_size as claimed_byte_size,
      cleanup.checksum_sha256 as claimed_checksum_sha256,
      cleanup.mime_type as claimed_mime_type,
      cleanup.reason as claimed_reason,
      cleanup.claim_token as claimed_token_value,
      cleanup.attempt_count as claimed_attempt_count
  )
  select
    claimed.claimed_blob_object_id,
    claimed.claimed_household_id,
    claimed.claimed_object_key,
    claimed.claimed_byte_size,
    claimed.claimed_checksum_sha256,
    claimed.claimed_mime_type,
    claimed.claimed_reason,
    claimed.claimed_token_value,
    claimed.claimed_attempt_count
  from claimed;
end
$$;

-- Provider acknowledgement and account deletion both lock Blob -> cleanup.
-- Revalidating the claim only after both locks preserves stale-worker safety
-- while removing the cleanup -> Blob cycle from the earlier implementation.
create or replace function public.complete_blob_object_cleanup(
  p_blob_object_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blob public.blob_objects;
  v_cleanup public.blob_object_cleanup_queue;
begin
  select *
  into v_blob
  from public.blob_objects blob
  where blob.id = p_blob_object_id
  for update;

  if not found then
    return not exists (
      select 1
      from public.blob_object_cleanup_queue cleanup
      where cleanup.blob_object_id = p_blob_object_id
    );
  end if;

  select *
  into v_cleanup
  from public.blob_object_cleanup_queue cleanup
  where cleanup.blob_object_id = p_blob_object_id
  for update;

  if not found then
    return false;
  end if;

  if p_claim_token is null
     or v_cleanup.claim_token is distinct from p_claim_token then
    raise exception 'BLOB_CLEANUP_CLAIM_CONFLICT' using errcode = 'P0001';
  end if;

  if v_blob.household_id is distinct from v_cleanup.household_id
     or v_blob.status <> 'needs-attention'
     or v_blob.deleted_at is null then
    raise exception 'BLOB_CLEANUP_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.evidence_versions version
    where version.household_id = v_cleanup.household_id
      and version.blob_object_id = p_blob_object_id
  ) then
    raise exception 'BLOB_CLEANUP_REFERENCED' using errcode = 'P0001';
  end if;

  delete from public.blob_objects blob
  where blob.id = p_blob_object_id;

  if not found then
    raise exception 'BLOB_CLEANUP_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  return true;
end
$$;

create or replace function public.track_retained_storage_bytes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_bytes bigint := 0;
  v_new_bytes bigint := 0;
  v_household_id uuid;
  v_delta bigint;
  v_global_delta bigint;
  v_deletion_account_id uuid;
  v_transfer_provider text;
  v_transfer_object_key text;
  v_household_before bigint;
  v_household_after bigint;
  v_household_present boolean := false;
  v_usage_present boolean := false;
  v_new_is_blob_active boolean := false;
  v_capacity_admission boolean := true;
  v_controls public.launch_enrollment_controls;
begin
  if tg_table_name not in (
    'blob_objects',
    'blob_object_cleanup_queue',
    'export_snapshots',
    'export_object_cleanup_queue'
  ) then
    raise exception 'STORAGE_ACCOUNTING_TABLE_INVALID' using errcode = 'P0001';
  end if;

  -- Cleanup pointers describe bytes that already exist at the provider and
  -- must remain durable even when a household is at capacity. A failed export
  -- may likewise be the only pointer after provider deletion fails. These
  -- transitions are accounted exactly but do not represent new admission.
  v_capacity_admission := tg_table_name not in (
    'blob_object_cleanup_queue',
    'export_object_cleanup_queue'
  );
  if tg_op <> 'DELETE' and tg_table_name = 'export_snapshots' then
    if new.status = 'failed' then
      v_capacity_admission := false;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.household_id is distinct from new.household_id then
      raise exception 'STORAGE_ACCOUNTING_HOUSEHOLD_IMMUTABLE'
        using errcode = 'P0001';
    end if;
    if tg_table_name <> 'export_snapshots'
       and old.byte_size is distinct from new.byte_size then
      raise exception 'STORAGE_ACCOUNTING_BYTES_IMMUTABLE'
        using errcode = 'P0001';
    end if;
    if tg_table_name = 'export_snapshots'
       and old.byte_size is not null
       and new.byte_size is not null
       and old.byte_size is distinct from new.byte_size then
      raise exception 'STORAGE_ACCOUNTING_BYTES_IMMUTABLE'
        using errcode = 'P0001';
    end if;
    if tg_table_name in (
      'blob_objects',
      'blob_object_cleanup_queue',
      'export_object_cleanup_queue'
    ) and old.object_key is distinct from new.object_key then
      raise exception 'STORAGE_ACCOUNTING_KEY_IMMUTABLE'
        using errcode = 'P0001';
    end if;
    if tg_table_name = 'export_snapshots'
       and old.object_key is not null
       and new.object_key is not null
       and old.object_key is distinct from new.object_key then
      raise exception 'STORAGE_ACCOUNTING_KEY_IMMUTABLE'
        using errcode = 'P0001';
    end if;
  end if;

  -- A disclosed signed PUT can recreate a provider object even after deletion.
  -- Preserve its database pointer until that provider authorization expires.
  if tg_table_name = 'blob_objects' then
    if tg_op <> 'INSERT' then
      if old.provider_delete_not_before > clock_timestamp() then
        if tg_op = 'DELETE' then
          raise exception 'STORAGE_UPLOAD_AUTHORIZATION_ACTIVE'
            using errcode = '40001';
        elsif old.deleted_at is null and new.deleted_at is not null then
          raise exception 'STORAGE_UPLOAD_AUTHORIZATION_ACTIVE'
            using errcode = '40001';
        end if;
      end if;
    end if;
  elsif tg_table_name = 'blob_object_cleanup_queue' then
    if tg_op = 'DELETE' then
      if exists (
        select 1
        from public.blob_objects blob
        where blob.id = old.blob_object_id
          and blob.provider_delete_not_before > clock_timestamp()
      ) then
        raise exception 'STORAGE_UPLOAD_AUTHORIZATION_ACTIVE'
          using errcode = '40001';
      end if;
    end if;
  end if;

  if tg_op <> 'INSERT' then
    v_household_id := old.household_id;
    if tg_table_name = 'blob_objects' then
      if old.deleted_at is null then v_old_bytes := old.byte_size; end if;
    elsif tg_table_name = 'export_snapshots' then
      if old.object_key is not null then v_old_bytes := old.byte_size; end if;
    elsif tg_table_name in (
      'blob_object_cleanup_queue',
      'export_object_cleanup_queue'
    ) then
      v_old_bytes := old.byte_size;
    end if;
  end if;

  if tg_op <> 'DELETE' then
    v_household_id := new.household_id;
    if tg_table_name = 'blob_objects' then
      v_new_is_blob_active := new.deleted_at is null;
      if v_new_is_blob_active then v_new_bytes := new.byte_size; end if;
    elsif tg_table_name = 'export_snapshots' then
      if new.object_key is not null then v_new_bytes := new.byte_size; end if;
    elsif tg_table_name in (
      'blob_object_cleanup_queue',
      'export_object_cleanup_queue'
    ) then
      v_new_bytes := new.byte_size;
    end if;
  end if;

  v_delta := v_new_bytes - v_old_bytes;
  v_global_delta := v_delta;
  if v_delta = 0 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- FK checks happen after BEFORE INSERT triggers. Every retained-pointer
  -- mutation takes its household gate before global accounting; account
  -- deletion drains the same child rows before acquiring these gates.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'heldat.storage.household:' || v_household_id::text,
      0
    )
  );

  -- All retained-byte mutations share one lock order. The global row makes the
  -- provider-wide ceiling exact; the household row makes its local ceiling exact.
  perform pg_advisory_xact_lock(
    hashtextextended('heldat.storage.global-capacity', 0)
  );

  -- A committed object is represented by either its active pointer or its
  -- cleanup pointer, never both. Run these cross-table checks only after the
  -- same serialization lock used by both positive pointer transitions.
  if tg_op <> 'DELETE' then
    if tg_table_name = 'blob_objects' then
      if v_new_is_blob_active and exists (
        select 1
        from public.blob_object_cleanup_queue cleanup
        where cleanup.blob_object_id = new.id
      ) then
        raise exception 'STORAGE_POINTER_DOUBLE_COUNT' using errcode = 'P0001';
      end if;
    elsif tg_table_name = 'blob_object_cleanup_queue' then
      if not exists (
        select 1
        from public.blob_objects blob
        where blob.id = new.blob_object_id
          and blob.household_id = new.household_id
          and blob.deleted_at is not null
      ) then
        raise exception 'STORAGE_CLEANUP_SOURCE_ACTIVE' using errcode = 'P0001';
      end if;
    elsif tg_table_name = 'export_snapshots' then
      if new.object_key is not null and exists (
        select 1
        from public.export_object_cleanup_queue cleanup
        where cleanup.object_key = new.object_key
      ) then
        raise exception 'STORAGE_POINTER_DOUBLE_COUNT' using errcode = 'P0001';
      end if;
    elsif tg_table_name = 'export_object_cleanup_queue' then
      if exists (
        select 1
        from public.export_snapshots snapshot
        where snapshot.object_key = new.object_key
      ) then
        raise exception 'STORAGE_POINTER_DOUBLE_COUNT' using errcode = 'P0001';
      end if;
    end if;
  end if;

  select *
  into v_controls
  from public.launch_enrollment_controls controls
  where controls.id = 1
  for update;
  if not found then
    raise exception 'STORAGE_CONTROL_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.households where id = v_household_id
  ) into v_household_present;

  if v_delta > 0 then
    if not v_household_present then
      raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
    end if;
    insert into public.household_storage_usage(household_id)
    values (v_household_id)
    on conflict (household_id) do nothing;
  end if;

  select usage.retained_bytes
  into v_household_before
  from public.household_storage_usage usage
  where usage.household_id = v_household_id
  for update;
  v_usage_present := found;
  if not v_usage_present then
    -- During a household ON DELETE CASCADE, PostgreSQL may remove the usage
    -- row before deleting all retained-pointer children. The global counter
    -- must still be decremented; outside that cascade a missing row is drift.
    if v_delta > 0 or v_household_present then
      raise exception 'STORAGE_COUNTER_UNAVAILABLE' using errcode = 'P0001';
    end if;
    v_household_before := -v_delta;
  end if;

  v_household_after := v_household_before + v_delta;
  if v_household_after < 0
     or v_controls.retained_storage_bytes + v_global_delta < 0 then
    raise exception 'STORAGE_COUNTER_DRIFT' using errcode = 'P0001';
  end if;

  -- During the reviewed account-deletion transaction, child cascades move
  -- provider pointers into a private durable ledger. Household usage is still
  -- released, but global bytes stay charged until the retry job is deleted
  -- after provider acknowledgement.
  if v_delta < 0 then
    select deletion_household.account_id
    into v_deletion_account_id
    from public.account_deletion_storage_households deletion_household
    where deletion_household.household_id = v_household_id;
    if found then
      if auth.role() <> 'service_role' then
        raise exception 'ACCOUNT_DELETION_TRANSFER_DENIED'
          using errcode = 'P0001';
      end if;
      if tg_table_name in ('blob_objects', 'blob_object_cleanup_queue') then
        v_transfer_provider := 'blob';
      else
        v_transfer_provider := 'export';
      end if;
      v_transfer_object_key := old.object_key;

      insert into public.account_deletion_storage_objects(
        provider,
        object_key,
        account_id,
        byte_size
      ) values (
        v_transfer_provider,
        v_transfer_object_key,
        v_deletion_account_id,
        -v_delta
      );
      update public.account_deletion_storage_holds
      set retained_bytes = retained_bytes - v_delta
      where account_id = v_deletion_account_id;
      if not found then
        raise exception 'ACCOUNT_DELETION_HOLD_MISSING' using errcode = 'P0001';
      end if;
      v_global_delta := 0;
    end if;
  end if;
  if v_delta > 0
     and v_new_is_blob_active
     and new.byte_size > v_controls.max_attachment_bytes then
    raise exception 'INVALID_FILE_SIZE' using errcode = 'P0001';
  end if;
  if v_delta > 0
     and v_capacity_admission
     and v_household_after > v_controls.household_storage_limit_bytes then
    raise exception 'HOUSEHOLD_STORAGE_LIMIT' using errcode = 'P0001';
  end if;
  if v_delta > 0
     and v_capacity_admission
     and v_controls.retained_storage_bytes + v_global_delta
       > v_controls.global_storage_limit_bytes then
    raise exception 'GLOBAL_STORAGE_LIMIT' using errcode = 'P0001';
  end if;

  -- A parent DELETE can make the household invisible before PostgreSQL runs
  -- this child cascade, while its usage row is still waiting in another FK
  -- cascade. Updating that orphan-in-flight row would recheck its FK and fail.
  -- The row will be deleted by the same parent statement; each child pointer
  -- either decrements global bytes or transfers them to the deletion hold.
  if v_usage_present and v_household_present then
    update public.household_storage_usage
    set retained_bytes = v_household_after,
        updated_at = now()
    where household_id = v_household_id;
  end if;

  update public.launch_enrollment_controls
  set retained_storage_bytes = retained_storage_bytes + v_global_delta,
      updated_at = now()
  where id = 1;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke execute on function public.track_retained_storage_bytes()
  from public, anon, authenticated, supabase_auth_admin;

drop trigger if exists blob_objects_storage_accounting
  on public.blob_objects;
create trigger blob_objects_storage_accounting
before insert or update or delete on public.blob_objects
for each row execute function public.track_retained_storage_bytes();

drop trigger if exists blob_cleanup_storage_accounting
  on public.blob_object_cleanup_queue;
create trigger blob_cleanup_storage_accounting
before insert or update or delete on public.blob_object_cleanup_queue
for each row execute function public.track_retained_storage_bytes();

drop trigger if exists export_snapshots_storage_accounting
  on public.export_snapshots;
create trigger export_snapshots_storage_accounting
before insert or update or delete on public.export_snapshots
for each row execute function public.track_retained_storage_bytes();

drop trigger if exists export_cleanup_storage_accounting
  on public.export_object_cleanup_queue;
create trigger export_cleanup_storage_accounting
before insert or update or delete on public.export_object_cleanup_queue
for each row execute function public.track_retained_storage_bytes();

create or replace function public.track_account_deletion_storage_hold_bytes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_release_bytes bigint := 0;
  v_controls public.launch_enrollment_controls;
begin
  if tg_op = 'INSERT' then
    if new.retained_bytes <> 0 then
      raise exception 'ACCOUNT_DELETION_STORAGE_HOLD_MUST_START_EMPTY'
        using errcode = 'P0001';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.account_id is distinct from new.account_id
       or new.retained_bytes < old.retained_bytes then
      raise exception 'ACCOUNT_DELETION_STORAGE_HOLD_IMMUTABLE'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  v_release_bytes := old.retained_bytes;
  if v_release_bytes = 0 then return old; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('heldat.storage.global-capacity', 0)
  );
  select *
  into v_controls
  from public.launch_enrollment_controls controls
  where controls.id = 1
  for update;
  if not found then
    raise exception 'STORAGE_CONTROL_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_controls.retained_storage_bytes - v_release_bytes < 0 then
    raise exception 'STORAGE_COUNTER_DRIFT' using errcode = 'P0001';
  end if;
  update public.launch_enrollment_controls
  set retained_storage_bytes = retained_storage_bytes - v_release_bytes,
      updated_at = now()
  where id = 1;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke execute on function public.track_account_deletion_storage_hold_bytes()
  from public, anon, authenticated, supabase_auth_admin, service_role;

create trigger account_deletion_storage_hold_accounting
before insert or update or delete on public.account_deletion_storage_holds
for each row execute function public.track_account_deletion_storage_hold_bytes();

-- Wrap the existing reviewed deletion transaction. A zero-byte hold and its
-- household map are created before cascade; each child trigger transfers its
-- exact provider pointer and bytes without changing the global counter. The
-- API's existing deletion of account_deletion_jobs cascades the completed hold
-- only after both providers acknowledge physical removal.
do $$
begin
  if to_regprocedure(
    'public.delete_account_domain_data_without_storage_hold(uuid,jsonb)'
  ) is null then
    alter function public.delete_account_domain_data(uuid, jsonb)
      rename to delete_account_domain_data_without_storage_hold;
  end if;
end
$$;

revoke all on function public.delete_account_domain_data_without_storage_hold(
  uuid,
  jsonb
) from public, anon, authenticated, service_role;

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
  v_owned_household_ids uuid[];
  v_household_id uuid;
  v_active_upload_authorization timestamptz;
  v_receipt jsonb;
begin
  if p_user_id is null
     or p_expected_memberships is null
     or jsonb_typeof(p_expected_memberships) <> 'array' then
    raise exception 'INVALID_ACCOUNT_DELETION_REQUEST' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('account-deletion:' || p_user_id::text, 0)
  );

  -- Exact retries retain the original hold and provider pointers.
  if exists (
    select 1
    from public.account_deletion_jobs job
    where job.account_id = p_user_id
  ) then
    return public.delete_account_domain_data_without_storage_hold(
      p_user_id,
      p_expected_memberships
    );
  end if;

  select coalesce(
    array_agg(membership.household_id order by membership.household_id),
    '{}'
  )
  into v_owned_household_ids
  from public.memberships membership
  where membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.role = 'owner'
    and membership.deleted_at is null;

  -- Drain existing child writers first. Every retained-pointer trigger then
  -- takes its household gate before the global accounting lock, so this order
  -- cannot invert with renewal, cleanup, or completion paths.
  perform 1 from public.blob_objects
  where household_id = any(v_owned_household_ids)
  order by id for update;
  perform 1 from public.blob_object_cleanup_queue
  where household_id = any(v_owned_household_ids)
  order by blob_object_id for update;
  perform 1 from public.export_snapshots
  where household_id = any(v_owned_household_ids)
  order by id for update;
  perform 1 from public.export_object_cleanup_queue
  where household_id = any(v_owned_household_ids)
  order by object_key for update;

  -- Gates are sorted for accounts owning multiple households.
  for v_household_id in
    select owned.household_id
    from unnest(v_owned_household_ids) as owned(household_id)
    order by owned.household_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'heldat.storage.household:' || v_household_id::text,
        0
      )
    );
  end loop;

  perform 1
  from public.households household
  where household.id = any(v_owned_household_ids)
  order by household.id
  for update;

  -- Catch retained inserts that committed before the household gates were
  -- acquired. Later inserts wait at their BEFORE trigger and cannot reach FK
  -- validation until this deletion transaction ends.
  perform 1 from public.blob_objects
  where household_id = any(v_owned_household_ids)
  order by id for update;
  perform 1 from public.blob_object_cleanup_queue
  where household_id = any(v_owned_household_ids)
  order by blob_object_id for update;
  perform 1 from public.export_snapshots
  where household_id = any(v_owned_household_ids)
  order by id for update;
  perform 1 from public.export_object_cleanup_queue
  where household_id = any(v_owned_household_ids)
  order by object_key for update;

  select max(blob.provider_delete_not_before)
  into v_active_upload_authorization
  from public.blob_objects blob
  where blob.household_id = any(v_owned_household_ids)
    and blob.provider_delete_not_before > clock_timestamp();
  if v_active_upload_authorization is not null then
    raise exception 'STORAGE_UPLOAD_AUTHORIZATION_ACTIVE'
      using errcode = '40001';
  end if;

  insert into public.account_deletion_storage_holds(
    account_id,
    retained_bytes
  ) values (
    p_user_id,
    0
  );
  insert into public.account_deletion_storage_households(
    household_id,
    account_id
  )
  select owned.household_id, p_user_id
  from unnest(v_owned_household_ids) as owned(household_id);

  v_receipt := public.delete_account_domain_data_without_storage_hold(
    p_user_id,
    p_expected_memberships
  );

  update public.account_deletion_jobs
  set object_keys = coalesce(
        (
          select array_agg(object.object_key order by object.object_key)
          from public.account_deletion_storage_objects object
          where object.account_id = p_user_id
            and object.provider = 'blob'
        ),
        '{}'
      ),
      export_object_keys = coalesce(
        (
          select array_agg(object.object_key order by object.object_key)
          from public.account_deletion_storage_objects object
          where object.account_id = p_user_id
            and object.provider = 'export'
        ),
        '{}'
      )
  where account_id = p_user_id;
  if not found then
    raise exception 'ACCOUNT_DELETION_JOB_MISSING' using errcode = 'P0001';
  end if;

  return v_receipt;
end
$$;

revoke all on function public.delete_account_domain_data(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.delete_account_domain_data(uuid, jsonb)
  to service_role;

-- Provider deletion and identity deletion are separate remote acknowledgements.
-- Release retained bytes after every provider confirms removal, while keeping
-- the retry job until the identity provider also confirms deletion. This makes
-- the release idempotent and prevents a failed final job-row cleanup from
-- permanently consuming the global byte budget.
create or replace function public.release_account_deletion_storage_hold(
  p_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released boolean;
begin
  if p_account_id is null then
    raise exception 'INVALID_ACCOUNT_DELETION_RELEASE' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('account-deletion:' || p_account_id::text, 0)
  );
  perform 1
  from public.account_deletion_jobs job
  where job.account_id = p_account_id
  for update;
  if not found then
    raise exception 'ACCOUNT_DELETION_JOB_MISSING' using errcode = 'P0001';
  end if;

  delete from public.account_deletion_storage_holds hold
  where hold.account_id = p_account_id;
  v_released := found;
  return v_released;
end
$$;

revoke all on function public.release_account_deletion_storage_hold(uuid)
  from public, anon, authenticated, supabase_auth_admin;
grant execute on function public.release_account_deletion_storage_hold(uuid)
  to service_role;

create or replace function public.protect_storage_capacity_configuration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max_household_bytes bigint;
begin
  select coalesce(max(usage.retained_bytes), 0)
  into v_max_household_bytes
  from public.household_storage_usage usage;

  if new.global_storage_limit_bytes < old.global_storage_limit_bytes
     and new.global_storage_limit_bytes < new.retained_storage_bytes then
    raise exception 'GLOBAL_STORAGE_LIMIT_BELOW_USAGE' using errcode = 'P0001';
  end if;
  if new.household_storage_limit_bytes < old.household_storage_limit_bytes
     and new.household_storage_limit_bytes < v_max_household_bytes then
    raise exception 'HOUSEHOLD_STORAGE_LIMIT_BELOW_USAGE'
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke execute on function public.protect_storage_capacity_configuration()
  from public, anon, authenticated, supabase_auth_admin;

drop trigger if exists launch_controls_storage_capacity_guard
  on public.launch_enrollment_controls;
create trigger launch_controls_storage_capacity_guard
before update of household_storage_limit_bytes, global_storage_limit_bytes
on public.launch_enrollment_controls
for each row execute function public.protect_storage_capacity_configuration();

-- Indexes match the global maintenance scans, retention jobs, and common
-- household authorization/history paths. Existing household-leading unique
-- indexes continue to serve the primary tenant-list queries.
create index if not exists api_rate_limit_buckets_expiry
  on public.api_rate_limit_buckets(expires_at);
create index if not exists launch_signup_reservations_pending_expiry
  on public.launch_signup_reservations(expires_at, id)
  where consumed_at is null;
create index if not exists memberships_user_active_household
  on public.memberships(user_id, household_id)
  where status = 'active' and deleted_at is null;
create index if not exists evidence_versions_household_evidence_created
  on public.evidence_versions(household_id, evidence_id, created_at, id);
create index if not exists invites_household_created
  on public.invites(household_id, created_at desc, id);
create index if not exists audit_events_household_cursor
  on public.audit_events(household_id, cursor);
create index if not exists export_snapshots_global_expiry
  on public.export_snapshots(expires_at, id)
  where object_key is not null;
create index if not exists export_cleanup_queue_global_created
  on public.export_object_cleanup_queue(created_at, object_key);
create index if not exists sync_household_state_compaction_due
  on public.sync_household_state(last_compacted_at asc nulls first, household_id);

-- A maintenance-token caller receives aggregate operating signals only: no
-- household identifiers, email hashes, object keys, filenames, or payloads.
create or replace function public.read_backend_readiness_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  with controls as (
    select *
    from public.launch_enrollment_controls
    where id = 1
  ),
  usage as (
    select
      count(*) filter (where retained_bytes > 0) as households_with_bytes,
      coalesce(max(retained_bytes), 0) as maximum_household_bytes,
      count(*) filter (
        where retained_bytes * 100 >=
          (select household_storage_limit_bytes * 50 from controls)
      ) as households_at_50_percent,
      count(*) filter (
        where retained_bytes * 100 >=
          (select household_storage_limit_bytes * 70 from controls)
      ) as households_at_70_percent,
      count(*) filter (
        where retained_bytes * 100 >=
          (select household_storage_limit_bytes * 85 from controls)
      ) as households_at_85_percent,
      count(*) filter (
        where retained_bytes >
          (select household_storage_limit_bytes from controls)
      ) as households_over_limit
    from public.household_storage_usage
  ),
  recomputed as (
    select coalesce(sum(source.byte_size), 0)::bigint as retained_bytes
    from (
      select blob.byte_size
      from public.blob_objects blob
      where blob.deleted_at is null
      union all
      select cleanup.byte_size
      from public.blob_object_cleanup_queue cleanup
      union all
      select snapshot.byte_size
      from public.export_snapshots snapshot
      where snapshot.object_key is not null
      union all
      select cleanup.byte_size
      from public.export_object_cleanup_queue cleanup
      union all
      select hold.retained_bytes as byte_size
      from public.account_deletion_storage_holds hold
    ) source
  ),
  deletion_holds as (
    select
      count(*) filter (where retained_bytes > 0) as pending_count,
      coalesce(sum(retained_bytes), 0)::bigint as retained_bytes,
      coalesce(
        (
          select sum(object.byte_size)
          from public.account_deletion_storage_objects object
        ),
        0
      )::bigint as object_bytes,
      case when min(created_at) is null then null else
        greatest(extract(epoch from now() - min(created_at))::bigint, 0)
      end as oldest_age_seconds
    from public.account_deletion_storage_holds
  ),
  blobs as (
    select
      count(*) filter (
        where status = 'upload-intent'
          and deleted_at is null
          and intent_expires_at > now()
      ) as active_intents,
      count(*) filter (
        where status = 'upload-intent'
          and deleted_at is null
          and (intent_expires_at is null or intent_expires_at <= now())
      ) as expired_intents
    from public.blob_objects
  ),
  blob_cleanup as (
    select
      count(*) as pending_count,
      coalesce(max(attempt_count), 0) as maximum_attempts,
      case when min(created_at) is null then null else
        greatest(extract(epoch from now() - min(created_at))::bigint, 0)
      end as oldest_age_seconds
    from public.blob_object_cleanup_queue
  ),
  export_cleanup as (
    select
      count(*) as pending_count,
      coalesce(max(attempt_count), 0) as maximum_attempts,
      case when min(created_at) is null then null else
        greatest(extract(epoch from now() - min(created_at))::bigint, 0)
      end as oldest_age_seconds
    from public.export_object_cleanup_queue
  ),
  sync as (
    select
      count(*) as household_count,
      count(*) filter (
        where operation_count >= hard_operation_limit
           or operation_bytes >= hard_byte_limit
      ) as blocked_households,
      count(*) filter (
        where not (
          operation_count >= hard_operation_limit
          or operation_bytes >= hard_byte_limit
        ) and (
          operation_count >= soft_operation_limit
          or operation_bytes >= soft_byte_limit
        )
      ) as warning_households,
      coalesce(sum(operation_count), 0) as operation_count,
      coalesce(sum(operation_bytes), 0) as operation_bytes,
      case when min(last_compacted_at) is null then null else
        greatest(extract(epoch from now() - min(last_compacted_at))::bigint, 0)
      end as oldest_compaction_age_seconds
    from public.sync_household_state
  ),
  rate_limits as (
    select
      count(*) filter (where expires_at > now()) as active_buckets,
      count(*) filter (where expires_at <= now()) as expired_buckets
    from public.api_rate_limit_buckets
  ),
  enrollment as (
    select count(*) as pending_signups
    from public.launch_signup_reservations
    where consumed_at is null and expires_at > now()
  ),
  population as (
    select
      (select count(*) from auth.users where deleted_at is null)
        as registered_users,
      (select count(*) from public.households where deleted_at is null)
        as households
  )
  select jsonb_build_object(
    'summaryVersion', 2,
    'observedAt', to_char(
      clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'enrollment', jsonb_build_object(
      'signupMode', controls.signup_mode,
      'registeredUsers', population.registered_users,
      'maximumRegisteredUsers', controls.max_registered_users,
      'households', population.households,
      'maximumHouseholds', controls.max_households,
      'pendingSignups', enrollment.pending_signups,
      'maximumPendingSignups', controls.max_pending_signups
    ),
    'storage', jsonb_build_object(
      'counterRetainedBytes', controls.retained_storage_bytes,
      'recomputedRetainedBytes', recomputed.retained_bytes,
      'counterMatchesSource',
        controls.retained_storage_bytes = recomputed.retained_bytes,
      'globalLimitBytes', controls.global_storage_limit_bytes,
      'globalOverLimit',
        controls.retained_storage_bytes > controls.global_storage_limit_bytes,
      'householdLimitBytes', controls.household_storage_limit_bytes,
      'maximumAttachmentBytes', controls.max_attachment_bytes,
      'householdsWithBytes', usage.households_with_bytes,
      'maximumHouseholdBytes', usage.maximum_household_bytes,
      'householdsAt50Percent', usage.households_at_50_percent,
      'householdsAt70Percent', usage.households_at_70_percent,
      'householdsAt85Percent', usage.households_at_85_percent,
      'householdsOverLimit', usage.households_over_limit,
      'accountDeletionHoldsPending', deletion_holds.pending_count,
      'accountDeletionHoldBytes', deletion_holds.retained_bytes,
      'accountDeletionObjectBytes', deletion_holds.object_bytes,
      'accountDeletionHoldMatchesObjects',
        deletion_holds.retained_bytes = deletion_holds.object_bytes,
      'accountDeletionHoldOldestAgeSeconds',
        deletion_holds.oldest_age_seconds,
      'activeUploadIntents', blobs.active_intents,
      'expiredUploadIntents', blobs.expired_intents,
      'blobCleanupPending', blob_cleanup.pending_count,
      'blobCleanupOldestAgeSeconds', blob_cleanup.oldest_age_seconds,
      'blobCleanupMaximumAttempts', blob_cleanup.maximum_attempts,
      'exportCleanupPending', export_cleanup.pending_count,
      'exportCleanupOldestAgeSeconds', export_cleanup.oldest_age_seconds,
      'exportCleanupMaximumAttempts', export_cleanup.maximum_attempts
    ),
    'sync', jsonb_build_object(
      'households', sync.household_count,
      'warningHouseholds', sync.warning_households,
      'blockedHouseholds', sync.blocked_households,
      'operationCount', sync.operation_count,
      'operationBytes', sync.operation_bytes,
      'oldestCompactionAgeSeconds', sync.oldest_compaction_age_seconds
    ),
    'rateLimits', jsonb_build_object(
      'activeBuckets', rate_limits.active_buckets,
      'expiredBuckets', rate_limits.expired_buckets
    )
  )
  into v_result
  from controls, usage, recomputed, deletion_holds, blobs, blob_cleanup,
       export_cleanup, sync, rate_limits, enrollment, population;

  if v_result is null then
    raise exception 'READINESS_CONTROL_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return v_result;
end
$$;

revoke all on function public.read_backend_readiness_summary()
  from public, anon, authenticated, supabase_auth_admin;
grant execute on function public.read_backend_readiness_summary()
  to service_role;

comment on table public.household_storage_usage is
  'Private constant-time retained-byte counters spanning Evidence and export objects.';
comment on function public.read_backend_readiness_summary() is
  'Service-only aggregate backend readiness signals without tenant identifiers or payloads.';

commit;
