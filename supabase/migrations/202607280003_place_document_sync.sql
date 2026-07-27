begin;

-- Place documents share the already-reviewed Evidence blob lifecycle while
-- retaining an explicit Place parent. Existing asset Evidence remains
-- asset-scoped; exactly one parent is required for every metadata row.
alter table public.evidence
  alter column asset_id drop not null;

alter table public.evidence
  add column place_id uuid;

alter table public.evidence
  add constraint evidence_exactly_one_parent
  check (num_nonnulls(asset_id, place_id) = 1)
  not valid;

alter table public.evidence
  validate constraint evidence_exactly_one_parent;

alter table public.evidence
  add constraint evidence_place_parent
  foreign key (household_id, place_id)
  references public.places(household_id, id);

create index evidence_household_place
  on public.evidence(household_id, place_id)
  where place_id is not null and deleted_at is null;

comment on column public.evidence.place_id is
  'Non-null only for Place Documents. Asset Evidence continues to use asset_id.';

create or replace function public.apply_place_document_sync_operation(
  p_operation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_command_record jsonb := coalesce(p_operation->'command', '{}'::jsonb);
  v_id uuid := coalesce(
    nullif(p_operation->>'operationId', ''),
    nullif(p_operation->>'id', '')
  )::uuid;
  v_household uuid := coalesce(
    nullif(p_operation->>'householdId', ''),
    nullif(v_command_record->>'householdId', '')
  )::uuid;
  v_entity_id uuid := coalesce(
    nullif(v_command_record->>'aggregateId', ''),
    nullif(p_operation->>'entityId', '')
  )::uuid;
  v_entity_type text := coalesce(
    nullif(split_part(v_command_record->>'type', '.', 1), ''),
    nullif(p_operation->>'entityType', '')
  );
  v_command text := coalesce(
    nullif(v_command_record->>'type', ''),
    nullif(p_operation->>'command', '')
  );
  v_base_version integer := coalesce(
    nullif(v_command_record->>'observedVersion', '')::integer,
    nullif(p_operation->>'baseVersion', '')::integer,
    0
  );
  v_payload jsonb := coalesce(
    v_command_record->'payload',
    p_operation->'payload',
    '{}'::jsonb
  );
  v_idempotency_key text := coalesce(
    nullif(v_command_record->>'idempotencyKey', ''),
    v_id::text
  );
  v_device_id uuid := case
    when coalesce(
      v_command_record->>'deviceId',
      p_operation->>'deviceId',
      ''
    ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then coalesce(
      v_command_record->>'deviceId',
      p_operation->>'deviceId'
    )::uuid
    else null
  end;
  v_client_created_at timestamptz := coalesce(
    nullif(v_command_record->>'occurredAt', '')::timestamptz,
    nullif(p_operation->>'createdAt', '')::timestamptz,
    now()
  );
  v_result jsonb;
  v_request_hash text;
  v_existing_request_hash text;
  v_entity_version integer;
  v_document_version_number integer;
  v_cursor bigint;
  v_blob public.blob_objects;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce((p_operation->>'operationVersion')::integer, 1) <> 1
     or coalesce((v_command_record->>'commandVersion')::integer, 1) <> 1 then
    raise exception 'UNSUPPORTED_CONTRACT_VERSION' using errcode = 'P0001';
  end if;

  if v_command not in (
    'place-document.create',
    'place-document.version.add'
  ) then
    raise exception 'UNSUPPORTED_COMMAND' using errcode = 'P0001';
  end if;

  if v_entity_type <> 'place-document' then
    raise exception 'ENTITY_TYPE_MISMATCH' using errcode = 'P0001';
  end if;

  if nullif(p_operation->>'householdId', '') is not null
     and nullif(v_command_record->>'householdId', '') is not null
     and p_operation->>'householdId' <> v_command_record->>'householdId' then
    raise exception 'HOUSEHOLD_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  if nullif(p_operation->>'entityType', '') is not null
     and p_operation->>'entityType' <> 'place-document' then
    raise exception 'ENTITY_TYPE_MISMATCH' using errcode = 'P0001';
  end if;

  if v_device_id is null then
    raise exception 'INVALID_DEVICE_ID' using errcode = 'P0001';
  end if;

  if not public.can_edit_household(v_household) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  if octet_length(p_operation::text) > 1048576
     or length(v_idempotency_key) < 1
     or length(v_idempotency_key) > 128 then
    raise exception 'INVALID_OPERATION_SIZE' using errcode = 'P0001';
  end if;

  -- Serialize exact retries before consulting the operation ledger. This is
  -- the same caller-stable idempotency boundary as every existing command.
  perform pg_advisory_xact_lock(
    hashtextextended(v_household::text || ':' || v_idempotency_key, 0)
  );

  v_request_hash := encode(
    digest(
      jsonb_build_object(
        'actorId', v_actor,
        'householdId', v_household,
        'deviceId', v_device_id,
        'entityType', v_entity_type,
        'entityId', v_entity_id,
        'baseVersion', v_base_version,
        'command', v_command,
        'payload', v_payload
      )::text,
      'sha256'
    ),
    'hex'
  );

  select result, request_hash
  into v_result, v_existing_request_hash
  from public.sync_operations
  where household_id = v_household
    and (id = v_id or idempotency_key = v_idempotency_key)
  limit 1;

  if found then
    if v_existing_request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_result || jsonb_build_object('idempotent', true);
  end if;

  if v_command = 'place-document.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    if coalesce(v_payload->>'placeId', '')
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'kind', '') not in (
         'paper', 'artifact', 'media', 'record', 'note', 'link'
       )
       or coalesce(v_payload->>'relation', '') not in (
         'ownership', 'identity', 'service', 'provenance', 'condition',
         'insurance', 'valuation', 'legal', 'access', 'context', 'other'
       )
       or char_length(trim(coalesce(v_payload->>'title', '')))
         not between 1 and 180
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    perform 1
    from public.places
    where id = (v_payload->>'placeId')::uuid
      and household_id = v_household
      and deleted_at is null;

    if not found then
      raise exception 'PLACE_UNAVAILABLE' using errcode = 'P0001';
    end if;

    insert into public.evidence(
      id, household_id, asset_id, place_id, kind, relation, title,
      storage_state, created_by
    )
    values (
      v_entity_id,
      v_household,
      null,
      (v_payload->>'placeId')::uuid,
      v_payload->>'kind',
      v_payload->>'relation',
      trim(v_payload->>'title'),
      'queued',
      v_actor
    );

    v_entity_version := 1;
    v_document_version_number := 0;
  else
    if coalesce(v_payload->>'placeDocumentId', '')
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_payload->>'blobObjectId', '')
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or char_length(coalesce(v_payload->>'fileName', ''))
         not between 1 and 255
       or position('/' in coalesce(v_payload->>'fileName', '')) > 0
       or position(chr(92) in coalesce(v_payload->>'fileName', '')) > 0
       or char_length(coalesce(v_payload->>'mimeType', ''))
         not between 1 and 160
       or coalesce(v_payload->>'byteSize', '') !~ '^[0-9]+$'
       or (v_payload->>'byteSize')::numeric not between 1 and 10485760
       or coalesce(v_payload->>'checksumSha256', '')
         !~ '^[a-f0-9]{64}$'
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    perform 1
    from public.evidence
    where id = (v_payload->>'placeDocumentId')::uuid
      and household_id = v_household
      and place_id is not null
      and asset_id is null
      and deleted_at is null
    for update;

    if not found then
      raise exception 'PLACE_DOCUMENT_NOT_FOUND' using errcode = 'P0001';
    end if;

    select coalesce(max(version_number), 0)
    into v_document_version_number
    from public.evidence_versions
    where evidence_id = (v_payload->>'placeDocumentId')::uuid
      and household_id = v_household;

    if v_base_version <> v_document_version_number then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    select *
    into v_blob
    from public.blob_objects
    where id = (v_payload->>'blobObjectId')::uuid
      and household_id = v_household
      and status = 'stored'
      and expected_evidence_id =
        (v_payload->>'placeDocumentId')::uuid
      and expected_evidence_version_id = v_entity_id
      and deleted_at is null;

    if not found then
      raise exception 'BLOB_NOT_READY' using errcode = 'P0001';
    end if;

    if v_payload->>'checksumSha256' is distinct from v_blob.checksum_sha256
       or (v_payload->>'byteSize')::bigint is distinct from v_blob.byte_size
       or v_payload->>'mimeType' is distinct from v_blob.mime_type then
      raise exception 'BLOB_METADATA_CONFLICT' using errcode = 'P0001';
    end if;

    v_document_version_number := v_document_version_number + 1;

    insert into public.evidence_versions(
      id, household_id, evidence_id, blob_object_id, version_number,
      file_name, mime_type, byte_size, checksum_sha256, created_by
    )
    values (
      v_entity_id,
      v_household,
      (v_payload->>'placeDocumentId')::uuid,
      v_blob.id,
      v_document_version_number,
      v_payload->>'fileName',
      v_blob.mime_type,
      v_blob.byte_size,
      v_blob.checksum_sha256,
      v_actor
    );

    update public.evidence
    set
      storage_state = 'cloud-acknowledged',
      version = version + 1,
      updated_at = now()
    where id = (v_payload->>'placeDocumentId')::uuid
      and household_id = v_household
      and place_id is not null
      and deleted_at is null
    returning version into v_entity_version;
  end if;

  v_result := jsonb_build_object(
    'operationId', v_id,
    'entityId', v_entity_id,
    'entityVersion', v_entity_version,
    'status', 'applied',
    'idempotent', false
  );

  if v_command = 'place-document.version.add' then
    v_result := v_result || jsonb_build_object(
      'placeDocumentId', v_payload->>'placeDocumentId',
      'documentVersionNumber', v_document_version_number
    );
  end if;

  insert into public.sync_operations(
    id, household_id, idempotency_key, request_hash, actor_id, device_id,
    entity_type, entity_id, base_version, command, payload, client_created_at,
    status, result
  )
  values (
    v_id,
    v_household,
    v_idempotency_key,
    v_request_hash,
    v_actor,
    v_device_id,
    'place-document',
    v_entity_id,
    v_base_version,
    v_command,
    v_payload,
    v_client_created_at,
    'applied',
    v_result
  )
  returning cursor into v_cursor;

  v_result := v_result || jsonb_build_object('cursor', v_cursor);

  update public.sync_operations
  set result = v_result
  where id = v_id;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id, metadata
  )
  values (
    v_household,
    v_actor,
    'sync.' || v_command,
    'place-document',
    v_entity_id,
    jsonb_build_object(
      'operationId', v_id,
      'version', v_entity_version,
      'documentVersionNumber', v_document_version_number
    )
  );

  return v_result;
exception
  when unique_violation then
    select result, request_hash
    into v_result, v_existing_request_hash
    from public.sync_operations
    where household_id = v_household
      and (id = v_id or idempotency_key = v_idempotency_key)
    limit 1;

    if found then
      if v_existing_request_hash <> v_request_hash then
        raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
      end if;
      return v_result || jsonb_build_object('idempotent', true);
    end if;
    raise;
end
$$;

-- Keep one public sync RPC. The original implementation becomes an internal
-- core, while this dispatcher owns the new command family and prevents Place
-- documents from being written through the legacy asset-Evidence command.
alter function public.apply_sync_operation(jsonb)
  rename to apply_sync_operation_core;

revoke all on function public.apply_sync_operation_core(jsonb)
  from public, anon, authenticated;

create or replace function public.apply_sync_operation(p_operation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_command_record jsonb := coalesce(p_operation->'command', '{}'::jsonb);
  v_command text := coalesce(
    nullif(v_command_record->>'type', ''),
    nullif(p_operation->>'command', '')
  );
  v_payload jsonb := coalesce(
    v_command_record->'payload',
    p_operation->'payload',
    '{}'::jsonb
  );
  v_household uuid := coalesce(
    nullif(p_operation->>'householdId', ''),
    nullif(v_command_record->>'householdId', '')
  )::uuid;
begin
  if v_command in (
    'place-document.create',
    'place-document.version.add'
  ) then
    return public.apply_place_document_sync_operation(p_operation);
  end if;

  if v_command in ('evidence.version.create', 'evidence.version.add')
     and public.can_edit_household(v_household)
     and exists (
       select 1
       from public.evidence
       where id = nullif(v_payload->>'evidenceId', '')::uuid
         and household_id = v_household
         and place_id is not null
         and asset_id is null
         and deleted_at is null
     )
  then
    raise exception 'PLACE_DOCUMENT_COMMAND_REQUIRED' using errcode = 'P0001';
  end if;

  return public.apply_sync_operation_core(p_operation);
end
$$;

revoke all on function public.apply_place_document_sync_operation(jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_sync_operation(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_sync_operation(jsonb)
  to authenticated;

commit;
