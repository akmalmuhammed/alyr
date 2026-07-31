begin;

-- Blob reservations must always point at an existing Evidence record in the
-- same household. Evidence represents both Asset Evidence and Place Documents.
alter table public.blob_objects
  add constraint blob_objects_expected_evidence_parent
  foreign key (household_id, expected_evidence_id)
  references public.evidence(household_id, id)
  not valid;

alter table public.blob_objects
  validate constraint blob_objects_expected_evidence_parent;

create index if not exists evidence_versions_household_blob
  on public.evidence_versions(household_id, blob_object_id)
  where blob_object_id is not null;

create index if not exists blob_objects_expired_intent_cleanup
  on public.blob_objects(intent_expires_at, id)
  where status = 'upload-intent' and deleted_at is null;

create index if not exists blob_objects_unattached_stored_cleanup
  on public.blob_objects(updated_at, id)
  where status = 'stored' and deleted_at is null;

-- Storage deletion is performed outside Postgres. This service-only pointer
-- ledger ensures quota is not released until the immutable object has been
-- deleted (or confirmed absent) and the worker acknowledges that result.
create table public.blob_object_cleanup_queue (
  blob_object_id uuid primary key,
  household_id uuid not null,
  object_key text not null unique,
  reason text not null check (
    reason in ('expired-intent', 'unattached-stored')
  ),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  checksum_sha256 text not null check (
    checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  mime_type text not null check (char_length(mime_type) between 1 and 160),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  last_error_code text check (
    last_error_code is null
    or last_error_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((claimed_at is null) = (claim_token is null)),
  foreign key (household_id, blob_object_id)
    references public.blob_objects(household_id, id) on delete cascade
);

alter table public.blob_object_cleanup_queue enable row level security;
alter table public.blob_object_cleanup_queue force row level security;

revoke all on table public.blob_object_cleanup_queue
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.blob_object_cleanup_queue to service_role;

create index blob_object_cleanup_queue_available
  on public.blob_object_cleanup_queue(
    available_at,
    claimed_at,
    created_at,
    blob_object_id
  );

-- Keep the public signature stable. Household row locking serializes every
-- reservation and renewal. A renewal is idempotent only while the original
-- intent is active, metadata-identical, actor-identical, and still inside the
-- quota after pending cleanup pointers are included.
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
  v_usage bigint;
begin
  if not public.can_edit_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  -- All quota-changing reservation paths take this lock before inspecting an
  -- existing BlobObject or calculating retained bytes.
  perform 1
  from public.households
  where id = p_household_id
    and deleted_at is null
  for update;

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

  if p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'INVALID_FILE_SIZE' using errcode = 'P0001';
  end if;

  if char_length(coalesce(p_mime_type, '')) not between 1 and 160 then
    raise exception 'INVALID_MIME_TYPE' using errcode = 'P0001';
  end if;

  -- Evidence is the parent for both Asset Evidence and Place Documents. The
  -- parent entity must still be active, preventing cross-household, deleted,
  -- or detached records from reserving cloud bytes.
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

  select *
  into v_blob
  from public.blob_objects
  where id = p_id
  for update;

  if found then
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

    select coalesce(sum(quota_entry.byte_size), 0)
    into v_usage
    from (
      select blob.byte_size
      from public.blob_objects blob
      where blob.household_id = p_household_id
        and blob.deleted_at is null
      union all
      select cleanup.byte_size
      from public.blob_object_cleanup_queue cleanup
      where cleanup.household_id = p_household_id
    ) quota_entry;

    -- The current active intent is already included in v_usage. Do not add its
    -- bytes a second time, but do reject renewal of a legacy over-quota state.
    if v_usage > 41943040 then
      raise exception 'HOUSEHOLD_STORAGE_LIMIT' using errcode = 'P0001';
    end if;

    update public.blob_objects
    set
      intent_expires_at = now() + interval '15 minutes',
      updated_at = now()
    where id = p_id
    returning * into v_blob;

    return v_blob;
  end if;

  select coalesce(sum(quota_entry.byte_size), 0)
  into v_usage
  from (
    select blob.byte_size
    from public.blob_objects blob
    where blob.household_id = p_household_id
      and blob.deleted_at is null
    union all
    select cleanup.byte_size
    from public.blob_object_cleanup_queue cleanup
    where cleanup.household_id = p_household_id
  ) quota_entry;

  if v_usage + p_byte_size > 41943040 then
    raise exception 'HOUSEHOLD_STORAGE_LIMIT' using errcode = 'P0001';
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

-- Verification takes the same household lock as reservation. An expired
-- intent is never promoted to stored after its bytes have stopped counting as
-- an active reservation.
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
  v_household_id uuid;
begin
  select blob.household_id
  into v_household_id
  from public.blob_objects blob
  where blob.id = p_id
    and blob.deleted_at is null;

  if not found then
    raise exception 'UPLOAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1
  from public.households
  where id = v_household_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'UPLOAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into v_blob
  from public.blob_objects
  where id = p_id
    and household_id = v_household_id
    and deleted_at is null
  for update;

  if not found or v_blob.created_by <> p_verified_actor_id then
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

-- Move at most p_limit expired reservations or unattached stored objects into
-- the pointer ledger. Stored objects receive a grace period so foreground sync
-- can attach a verified EvidenceVersion before cleanup begins.
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

  with candidates as materialized (
    select blob.id, blob.status as original_status
    from public.blob_objects blob
    where blob.deleted_at is null
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
    for update of blob skip locked
  ),
  marked as (
    update public.blob_objects blob
    set
      status = 'needs-attention',
      intent_expires_at = null,
      deleted_at = now(),
      updated_at = now()
    from candidates
    where blob.id = candidates.id
    returning
      blob.id,
      blob.household_id,
      blob.object_key,
      blob.byte_size,
      blob.checksum_sha256,
      blob.mime_type,
      candidates.original_status
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
        when marked.original_status = 'upload-intent' then 'expired-intent'
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
  select count(*)::integer
  into v_enqueued
  from queued;

  return v_enqueued;
end
$$;

-- Claiming is bounded and uses SKIP LOCKED so independent maintenance workers
-- cannot receive the same pointer. A stale claim becomes eligible after the
-- caller-supplied lease.
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
    where cleanup.available_at <= now()
      and (
        cleanup.claim_token is null
        or cleanup.claimed_at <= now() - p_lease
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

-- A worker calls this only after Storage deletion succeeds or returns a
-- provider-confirmed not-found response. Removing the BlobObject cascades its
-- queue pointer and releases the retained-byte quota atomically.
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
  v_cleanup public.blob_object_cleanup_queue;
begin
  select *
  into v_cleanup
  from public.blob_object_cleanup_queue cleanup
  where cleanup.blob_object_id = p_blob_object_id
  for update;

  if not found then
    return not exists (
      select 1
      from public.blob_objects blob
      where blob.id = p_blob_object_id
    );
  end if;

  if p_claim_token is null
     or v_cleanup.claim_token is distinct from p_claim_token then
    raise exception 'BLOB_CLEANUP_CLAIM_CONFLICT' using errcode = 'P0001';
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
  where blob.id = p_blob_object_id
    and blob.household_id = v_cleanup.household_id
    and blob.status = 'needs-attention'
    and blob.deleted_at is not null;

  if not found then
    raise exception 'BLOB_CLEANUP_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  return true;
end
$$;

-- Failed Storage deletions preserve the pointer and become retryable only
-- after a bounded delay. The original claim token prevents stale workers from
-- releasing a newer worker's claim.
create or replace function public.release_blob_object_cleanup(
  p_blob_object_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retry_delay interval default interval '5 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_claim_token is null then
    raise exception 'BLOB_CLEANUP_CLAIM_CONFLICT' using errcode = 'P0001';
  end if;

  if coalesce(p_error_code, '') !~ '^[A-Z0-9_]{1,64}$' then
    raise exception 'INVALID_CLEANUP_ERROR' using errcode = 'P0001';
  end if;

  if p_retry_delay is null
     or p_retry_delay < interval '1 second'
     or p_retry_delay > interval '24 hours' then
    raise exception 'INVALID_RETRY_DELAY' using errcode = 'P0001';
  end if;

  update public.blob_object_cleanup_queue cleanup
  set
    available_at = now() + p_retry_delay,
    claimed_at = null,
    claim_token = null,
    last_error_code = p_error_code,
    updated_at = now()
  where cleanup.blob_object_id = p_blob_object_id
    and cleanup.claim_token = p_claim_token;

  return found;
end
$$;

revoke all on function public.create_blob_upload_intent(
  uuid, uuid, uuid, uuid, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.create_blob_upload_intent(
  uuid, uuid, uuid, uuid, text, text, bigint, text
) to authenticated;

revoke all on function public.mark_blob_stored(uuid, text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_blob_stored(uuid, text, bigint, uuid)
  to service_role;

revoke all on function public.enqueue_blob_object_cleanup(integer, interval)
  from public, anon, authenticated;
revoke all on function public.claim_blob_object_cleanup(integer, interval)
  from public, anon, authenticated;
revoke all on function public.complete_blob_object_cleanup(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.release_blob_object_cleanup(
  uuid, uuid, text, interval
) from public, anon, authenticated;

grant execute on function public.enqueue_blob_object_cleanup(integer, interval)
  to service_role;
grant execute on function public.claim_blob_object_cleanup(integer, interval)
  to service_role;
grant execute on function public.complete_blob_object_cleanup(uuid, uuid)
  to service_role;
grant execute on function public.release_blob_object_cleanup(
  uuid, uuid, text, interval
) to service_role;

comment on table public.blob_object_cleanup_queue is
  'Service-only immutable object pointers awaiting verified Storage deletion.';

commit;
