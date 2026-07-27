begin;

alter table public.export_snapshots
  add column if not exists idempotency_key text,
  add column if not exists request_hash text,
  add column if not exists processing_token uuid,
  add column if not exists processing_started_at timestamptz,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists byte_size bigint,
  add column if not exists checksum_sha256 text,
  add column if not exists completed_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_message text;

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS. Keeping every constraint
-- behind a catalog guard makes this migration safe to re-apply to a restored
-- pilot database while still failing closed on malformed rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_idempotency_key_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_idempotency_key_valid check (
        idempotency_key is null
        or idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_request_hash_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_request_hash_valid check (
        request_hash is null
        or request_hash ~ '^[a-f0-9]{64}$'
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_file_name_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_file_name_valid check (
        file_name is null
        or file_name ~ '^[A-Za-z0-9._-]{1,160}$'
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_mime_type_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_mime_type_valid check (
        mime_type is null
        or mime_type in ('application/json', 'application/pdf')
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_byte_size_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_byte_size_valid check (
        byte_size is null
        or byte_size between 1 and 5242880
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_checksum_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_checksum_valid check (
        checksum_sha256 is null
        or checksum_sha256 ~ '^[a-f0-9]{64}$'
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_error_code_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_error_code_valid check (
        error_code is null
        or error_code in (
          'NOT_FOUND',
          'QUOTA_EXCEEDED',
          'STORAGE_UNAVAILABLE'
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_processing_claim_valid'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_processing_claim_valid check (
        (
          status = 'processing'
          and processing_token is not null
          and processing_started_at is not null
        )
        or (
          status <> 'processing'
          and processing_token is null
          and processing_started_at is null
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_ready_complete'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_ready_complete check (
        status <> 'ready'
        or (
          object_key is not null
          and file_name is not null
          and mime_type is not null
          and byte_size is not null
          and checksum_sha256 is not null
          and expires_at is not null
          and completed_at is not null
          and error_code is null
          and error_message is null
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.export_snapshots'::regclass
      and conname = 'export_snapshots_failure_described'
  ) then
    alter table public.export_snapshots
      add constraint export_snapshots_failure_described check (
        status <> 'failed'
        or (
          error_code is not null
          and error_message is not null
          and completed_at is not null
        )
      );
  end if;
end
$$;

create unique index if not exists export_snapshots_idempotency
  on public.export_snapshots(
    household_id,
    requested_by,
    idempotency_key
  )
  where idempotency_key is not null;

create index if not exists export_snapshots_household_retention
  on public.export_snapshots(household_id, expires_at)
  where object_key is not null;

-- A stale worker may resume after another worker atomically takes its claim.
-- Its token blocks finalization; if deleting its immutable object then fails,
-- this service-only ledger preserves the pointer until a later cleanup pass.
create table if not exists public.export_object_cleanup_queue (
  object_key text primary key,
  household_id uuid not null
    references public.households(id) on delete cascade,
  snapshot_id uuid not null,
  file_name text not null check (
    file_name ~ '^[A-Za-z0-9._-]{1,160}$'
  ),
  mime_type text not null check (
    mime_type in ('application/json', 'application/pdf')
  ),
  byte_size bigint not null check (
    byte_size between 1 and 5242880
  ),
  checksum_sha256 text not null check (
    checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz
);

alter table public.export_object_cleanup_queue enable row level security;
revoke all on table public.export_object_cleanup_queue
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.export_object_cleanup_queue to service_role;

create index if not exists export_cleanup_queue_household
  on public.export_object_cleanup_queue(household_id, created_at);

-- The Edge renderer uses the service role only to acknowledge bytes it has
-- already written and to append the corresponding audit receipt. It receives
-- no direct permission to create or delete domain export rows.
grant select, update on table public.export_snapshots to service_role;
grant insert on table public.audit_events to service_role;

revoke execute on function public.create_export_snapshot(uuid, jsonb)
  from public, anon, authenticated;
drop function if exists public.create_export_snapshot(uuid, jsonb);

create or replace function public.create_export_snapshot(
  p_household_id uuid,
  p_scope jsonb,
  p_idempotency_key text,
  p_request_hash text
)
returns public.export_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot public.export_snapshots;
  v_scope_key_count integer;
  v_retained_bytes bigint;
  v_active_count bigint;
  v_recent_count bigint;
begin
  if not public.can_edit_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  if p_scope is null
     or jsonb_typeof(p_scope) <> 'object'
  then
    raise exception 'EXPORT_REQUEST_INVALID' using errcode = '22023';
  end if;

  select count(*) into v_scope_key_count
  from jsonb_object_keys(p_scope);

  if v_scope_key_count <> 3
     or not (p_scope ?& array['format', 'assetIds', 'redacted'])
     or coalesce(p_scope->>'format', '') not in ('pdf', 'json-manifest')
     or coalesce(jsonb_typeof(p_scope->'assetIds'), '') <> 'array'
     or coalesce(jsonb_typeof(p_scope->'redacted'), '') <> 'boolean'
     or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9._:-]{16,128}$'
     or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'EXPORT_REQUEST_INVALID' using errcode = '22023';
  end if;

  if jsonb_array_length(p_scope->'assetIds') > 500
     or exists (
       select 1
       from jsonb_array_elements(p_scope->'assetIds') as entry(value)
       where jsonb_typeof(entry.value) <> 'string'
          or trim(both '"' from entry.value::text) !~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-8][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
     )
     or (
       select count(*) <> count(distinct lower(value))
       from jsonb_array_elements_text(p_scope->'assetIds') as entry(value)
     )
  then
    raise exception 'EXPORT_REQUEST_INVALID' using errcode = '22023';
  end if;

  -- Serialize export admission per household. Exact idempotent retries are
  -- returned before rate/quota checks and therefore never consume allowance.
  perform pg_advisory_xact_lock(
    hashtextextended('alyr-export:' || p_household_id::text, 0)
  );

  select *
  into v_snapshot
  from public.export_snapshots
  where household_id = p_household_id
    and requested_by = auth.uid()
    and idempotency_key = p_idempotency_key;

  if found then
    if v_snapshot.request_hash <> p_request_hash
       or v_snapshot.scope <> p_scope
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_snapshot;
  end if;

  select
    coalesce(sum(byte_size) filter (where object_key is not null), 0),
    count(*) filter (
      where status in ('queued', 'processing')
         or object_key is not null
    ),
    count(*) filter (
      where created_at >= now() - interval '10 minutes'
    )
  into v_retained_bytes, v_active_count, v_recent_count
  from public.export_snapshots
  where household_id = p_household_id;

  select
    v_retained_bytes + coalesce(sum(byte_size), 0),
    v_active_count + count(*)
  into v_retained_bytes, v_active_count
  from public.export_object_cleanup_queue
  where household_id = p_household_id;

  if v_retained_bytes >= 41943040 or v_active_count >= 24 then
    raise exception 'EXPORT_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  if v_recent_count >= 6 then
    raise exception 'EXPORT_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.export_snapshots(
    household_id,
    requested_by,
    scope,
    idempotency_key,
    request_hash
  )
  values (
    p_household_id,
    auth.uid(),
    p_scope,
    p_idempotency_key,
    p_request_hash
  )
  returning * into v_snapshot;

  insert into public.audit_events(
    household_id,
    actor_id,
    event_name,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_household_id,
    auth.uid(),
    'export.queued',
    'export',
    v_snapshot.id,
    jsonb_build_object(
      'format', p_scope->>'format',
      'redacted', (p_scope->>'redacted')::boolean,
      'assetCount', jsonb_array_length(p_scope->'assetIds')
    )
  );

  return v_snapshot;
end
$$;

revoke all on function public.create_export_snapshot(
  uuid,
  jsonb,
  text,
  text
) from public, anon;
grant execute on function public.create_export_snapshot(
  uuid,
  jsonb,
  text,
  text
) to authenticated;

-- A conditional claim is the only transition into processing. Concurrent
-- same-key requests all receive the same row, but only the caller whose token
-- is written may render or acknowledge the artifact.
create or replace function public.claim_export_snapshot(
  p_snapshot_id uuid,
  p_request_hash text,
  p_claim_token uuid
)
returns public.export_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot public.export_snapshots;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  update public.export_snapshots
  set
    status = 'processing',
    processing_token = p_claim_token,
    processing_started_at = now(),
    completed_at = null,
    error_code = null,
    error_message = null,
    updated_at = now()
  where id = p_snapshot_id
    and request_hash = p_request_hash
    and object_key is null
    and (
      status = 'queued'
      or status = 'failed'
      or (
        status = 'processing'
        and processing_started_at < now() - interval '5 minutes'
      )
    )
  returning * into v_snapshot;

  if found then
    return v_snapshot;
  end if;

  select *
  into v_snapshot
  from public.export_snapshots
  where id = p_snapshot_id;

  if not found then
    raise exception 'EXPORT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_snapshot.request_hash <> p_request_hash then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  return v_snapshot;
end
$$;

revoke all on function public.claim_export_snapshot(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_export_snapshot(uuid, text, uuid)
  to service_role;

-- All domain rows for one export are read by one SQL statement. A STABLE SQL
-- function uses the caller's RLS identity and one PostgreSQL statement
-- snapshot, so the manifest never mixes records from different revisions.
create or replace function public.read_export_manifest_source(
  p_snapshot_id uuid,
  p_request_hash text,
  p_claim_token uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with snapshot as (
    select
      export_snapshot.household_id,
      export_snapshot.scope
    from public.export_snapshots export_snapshot
    where export_snapshot.id = p_snapshot_id
      and export_snapshot.requested_by = auth.uid()
      and export_snapshot.request_hash = p_request_hash
      and export_snapshot.status = 'processing'
      and export_snapshot.processing_token = p_claim_token
      and public.can_edit_household(export_snapshot.household_id)
  ),
  household_record as (
    select
      household.id,
      household.name,
      household.version,
      household.created_at,
      household.updated_at
    from public.households household
    join snapshot on snapshot.household_id = household.id
    where household.deleted_at is null
  ),
  selected_assets as (
    select
      asset.id,
      asset.name,
      asset.category_id,
      asset.category_path,
      asset.description,
      asset.importance,
      asset.lifecycle,
      asset.profile,
      asset.version,
      asset.created_at,
      asset.updated_at
    from public.assets asset
    join snapshot on snapshot.household_id = asset.household_id
    where asset.deleted_at is null
      and (
        jsonb_array_length(snapshot.scope->'assetIds') = 0
        or exists (
          select 1
          from jsonb_array_elements_text(
            snapshot.scope->'assetIds'
          ) as requested(asset_id)
          where requested.asset_id::uuid = asset.id
        )
      )
  ),
  selected_values as (
    select
      value_assertion.id,
      value_assertion.asset_id,
      value_assertion.amount_minor,
      value_assertion.currency,
      value_assertion.as_of,
      value_assertion.source,
      value_assertion.version,
      value_assertion.created_at,
      value_assertion.updated_at
    from public.asset_value_assertions value_assertion
    join snapshot on snapshot.household_id = value_assertion.household_id
    join selected_assets asset on asset.id = value_assertion.asset_id
    where value_assertion.deleted_at is null
  ),
  selected_locations as (
    select
      location_revision.id,
      location_revision.asset_id,
      location_revision.place_id,
      location_revision.space_id,
      location_revision.status,
      location_revision.location_detail,
      location_revision.source,
      location_revision.revision,
      location_revision.valid_from,
      location_revision.valid_to,
      location_revision.created_at
    from public.asset_location_revisions location_revision
    join snapshot on snapshot.household_id = location_revision.household_id
    join selected_assets asset on asset.id = location_revision.asset_id
  ),
  selected_evidence as (
    select
      evidence_record.id,
      evidence_record.asset_id,
      evidence_record.kind,
      evidence_record.relation,
      evidence_record.title,
      evidence_record.review_status,
      evidence_record.storage_state,
      evidence_record.version,
      evidence_record.created_at,
      evidence_record.updated_at
    from public.evidence evidence_record
    join snapshot on snapshot.household_id = evidence_record.household_id
    join selected_assets asset on asset.id = evidence_record.asset_id
    where evidence_record.deleted_at is null
  ),
  selected_evidence_versions as (
    select
      evidence_version.id,
      evidence_version.evidence_id,
      evidence_version.blob_object_id,
      evidence_version.version_number,
      evidence_version.file_name,
      evidence_version.mime_type,
      evidence_version.byte_size,
      evidence_version.checksum_sha256,
      evidence_version.created_at
    from public.evidence_versions evidence_version
    join snapshot on snapshot.household_id = evidence_version.household_id
    join selected_evidence evidence_record
      on evidence_record.id = evidence_version.evidence_id
  ),
  selected_blobs as (
    select
      blob.id,
      blob.expected_evidence_id,
      blob.expected_evidence_version_id,
      blob.checksum_sha256,
      blob.byte_size,
      blob.mime_type,
      blob.status,
      blob.created_at,
      blob.updated_at
    from public.blob_objects blob
    join snapshot on snapshot.household_id = blob.household_id
    where blob.deleted_at is null
      and exists (
        select 1
        from selected_evidence_versions evidence_version
        where evidence_version.blob_object_id = blob.id
      )
  ),
  household_places as (
    select
      place.id,
      place.name,
      place.kind,
      place.tenure,
      place.address_text,
      place.region_label,
      place.latitude,
      place.longitude,
      place.location_source,
      place.location_precision,
      place.horizontal_accuracy_m,
      place.location_observed_at,
      place.location_confirmed_at,
      place.version,
      place.created_at,
      place.updated_at
    from public.places place
    join snapshot on snapshot.household_id = place.household_id
    where place.deleted_at is null
  ),
  household_spaces as (
    select
      space.id,
      space.place_id,
      space.parent_space_id,
      space.name,
      space.kind,
      space.ordinal,
      space.version,
      space.created_at,
      space.updated_at
    from public.spaces space
    join snapshot on snapshot.household_id = space.household_id
    where space.deleted_at is null
  )
  select jsonb_build_object(
    'snapshotFound', exists(select 1 from snapshot),
    'readAt', transaction_timestamp(),
    'requestedAssetCount', coalesce(
      (
        select jsonb_array_length(snapshot.scope->'assetIds')
        from snapshot
      ),
      0
    ),
    'household', (
      select to_jsonb(household_record)
      from household_record
    ),
    'assets', coalesce(
      (
        select jsonb_agg(to_jsonb(asset) order by asset.id)
        from selected_assets asset
      ),
      '[]'::jsonb
    ),
    'values', coalesce(
      (
        select jsonb_agg(to_jsonb(value_assertion) order by value_assertion.id)
        from selected_values value_assertion
      ),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (
        select jsonb_agg(to_jsonb(location_revision) order by location_revision.id)
        from selected_locations location_revision
      ),
      '[]'::jsonb
    ),
    'evidence', coalesce(
      (
        select jsonb_agg(to_jsonb(evidence_record) order by evidence_record.id)
        from selected_evidence evidence_record
      ),
      '[]'::jsonb
    ),
    'evidenceVersions', coalesce(
      (
        select jsonb_agg(to_jsonb(evidence_version) order by evidence_version.id)
        from selected_evidence_versions evidence_version
      ),
      '[]'::jsonb
    ),
    'blobs', coalesce(
      (
        select jsonb_agg(to_jsonb(blob) order by blob.id)
        from selected_blobs blob
      ),
      '[]'::jsonb
    ),
    'places', coalesce(
      (
        select jsonb_agg(to_jsonb(place) order by place.id)
        from household_places place
      ),
      '[]'::jsonb
    ),
    'spaces', coalesce(
      (
        select jsonb_agg(to_jsonb(space) order by space.id)
        from household_spaces space
      ),
      '[]'::jsonb
    )
  )
$$;

revoke all on function public.read_export_manifest_source(uuid, text, uuid)
  from public, anon;
grant execute on function public.read_export_manifest_source(uuid, text, uuid)
  to authenticated;

-- Finalization locks the household before charging retained bytes. The
-- physical quota includes every object pointer, including an expired/failed
-- artifact whose Storage deletion is still pending.
create or replace function public.complete_export_snapshot(
  p_snapshot_id uuid,
  p_request_hash text,
  p_claim_token uuid,
  p_object_key text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_checksum_sha256 text,
  p_expires_at timestamptz
)
returns public.export_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot public.export_snapshots;
  v_retained_bytes bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  select *
  into v_snapshot
  from public.export_snapshots
  where id = p_snapshot_id
  for update;

  if not found
     or v_snapshot.request_hash <> p_request_hash
     or v_snapshot.status <> 'processing'
     or v_snapshot.processing_token <> p_claim_token
  then
    raise exception 'EXPORT_CLAIM_LOST' using errcode = 'P0001';
  end if;

  if p_file_name !~ '^[A-Za-z0-9._-]{1,160}$'
     or p_mime_type not in ('application/json', 'application/pdf')
     or p_byte_size not between 1 and 5242880
     or p_checksum_sha256 !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now()
     or p_expires_at > now() + interval '8 days'
     or (
       v_snapshot.scope->>'format' = 'pdf'
       and (
         p_mime_type <> 'application/pdf'
         or right(p_file_name, 4) <> '.pdf'
       )
     )
     or (
       v_snapshot.scope->>'format' = 'json-manifest'
       and (
         p_mime_type <> 'application/json'
         or right(p_file_name, 5) <> '.json'
       )
     )
     or p_object_key <> concat(
       v_snapshot.household_id::text,
       '/',
       v_snapshot.id::text,
       '/',
       p_claim_token::text,
       '/',
       p_file_name
     )
  then
    raise exception 'EXPORT_ACK_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('alyr-export:' || v_snapshot.household_id::text, 0)
  );

  select coalesce(sum(byte_size), 0)
  into v_retained_bytes
  from public.export_snapshots
  where household_id = v_snapshot.household_id
    and id <> v_snapshot.id
    and object_key is not null;

  select v_retained_bytes + coalesce(sum(byte_size), 0)
  into v_retained_bytes
  from public.export_object_cleanup_queue
  where household_id = v_snapshot.household_id;

  if v_retained_bytes + p_byte_size > 41943040 then
    raise exception 'EXPORT_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.export_snapshots
  set
    status = 'ready',
    processing_token = null,
    processing_started_at = null,
    object_key = p_object_key,
    file_name = p_file_name,
    mime_type = p_mime_type,
    byte_size = p_byte_size,
    checksum_sha256 = p_checksum_sha256,
    expires_at = p_expires_at,
    completed_at = now(),
    error_code = null,
    error_message = null,
    updated_at = now()
  where id = p_snapshot_id
  returning * into v_snapshot;

  insert into public.audit_events(
    household_id,
    actor_id,
    event_name,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_snapshot.household_id,
    v_snapshot.requested_by,
    'export.ready',
    'export',
    v_snapshot.id,
    jsonb_build_object(
      'format', v_snapshot.scope->>'format',
      'redacted', (v_snapshot.scope->>'redacted')::boolean,
      'assetCount', jsonb_array_length(v_snapshot.scope->'assetIds'),
      'byteSize', v_snapshot.byte_size
    )
  );

  return v_snapshot;
end
$$;

revoke all on function public.complete_export_snapshot(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_export_snapshot(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  timestamptz
) to service_role;

insert into storage.buckets(
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'exports',
  'exports',
  false,
  5242880,
  array['application/json', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Export bytes are served only through the authenticated Edge route after
-- export_snapshots RLS authorizes the caller. No authenticated Storage policy
-- is created for this bucket.

-- Daily bounded retention. The job is inert until both Vault entries exist:
--   alyr_export_maintenance_url
--     = https://PROJECT.supabase.co/functions/v1/api/maintenance/exports
--   alyr_export_maintenance_token
--     = the same 32+ character value deployed as the Edge secret
--       ALYR_EXPORT_MAINTENANCE_TOKEN
-- Keeping the URL and token in Vault avoids embedding provider coordinates or
-- credentials in a migration. Each invocation processes at most 100 pointers;
-- failed Storage deletions retain their pointer for the next daily attempt.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_existing_job_id bigint;
begin
  select jobid
  into v_existing_job_id
  from cron.job
  where jobname = 'alyr-export-retention-daily';

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  perform cron.schedule(
    'alyr-export-retention-daily',
    '17 2 * * *',
    $maintenance$
      select net.http_post(
        url := maintenance_url.decrypted_secret,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'X-ALYR-Maintenance-Token',
          maintenance_token.decrypted_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
      from vault.decrypted_secrets maintenance_url
      cross join vault.decrypted_secrets maintenance_token
      where maintenance_url.name = 'alyr_export_maintenance_url'
        and maintenance_token.name = 'alyr_export_maintenance_token';
    $maintenance$
  );
end
$$;

alter table public.account_deletion_jobs
  add column if not exists export_object_keys text[] not null default '{}';

-- Preserve the previously reviewed deletion transaction as the inner
-- operation. The wrapper snapshots export-bucket keys before household
-- cascades remove export_snapshots, then stores those keys in the same
-- service-only retry marker used for Evidence objects.
do $$
begin
  if to_regprocedure(
    'public.delete_account_domain_data_without_export_objects(uuid,jsonb)'
  ) is null then
    alter function public.delete_account_domain_data(uuid, jsonb)
      rename to delete_account_domain_data_without_export_objects;
  end if;
end
$$;

revoke all on function public.delete_account_domain_data_without_export_objects(
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
  v_export_object_keys text[];
  v_receipt jsonb;
begin
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

  select coalesce(
    array_agg(export_object.object_key order by export_object.object_key),
    '{}'
  )
  into v_export_object_keys
  from (
    select snapshot.object_key
    from public.export_snapshots snapshot
    where snapshot.household_id = any(v_owned_household_ids)
      and snapshot.object_key is not null
    union
    select cleanup_object.object_key
    from public.export_object_cleanup_queue cleanup_object
    where cleanup_object.household_id = any(v_owned_household_ids)
  ) export_object;

  v_receipt := public.delete_account_domain_data_without_export_objects(
    p_user_id,
    p_expected_memberships
  );

  update public.account_deletion_jobs
  set export_object_keys = case
    when cardinality(v_export_object_keys) > 0
      then v_export_object_keys
    else export_object_keys
  end
  where account_id = p_user_id;

  return v_receipt;
end
$$;

revoke all on function public.delete_account_domain_data(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.delete_account_domain_data(uuid, jsonb)
  to service_role;

commit;
