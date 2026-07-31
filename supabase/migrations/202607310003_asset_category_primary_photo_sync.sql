-- Make Asset category changes and primary-photo selections authoritative
-- cross-device fields. Both commands use the Asset record version, the shared
-- sync-operation idempotency ledger and the existing household editor policy.

alter table public.assets
  add column if not exists primary_photo_evidence_id uuid;

comment on column public.assets.primary_photo_evidence_id is
  'Selected byte-verified media Evidence for this Asset. Command validation enforces household and Asset ownership.';

create index if not exists assets_primary_photo_evidence_idx
  on public.assets(household_id, primary_photo_evidence_id)
  where primary_photo_evidence_id is not null
    and deleted_at is null;

create or replace function public.apply_asset_metadata_sync_operation(
  p_operation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_command_record jsonb := coalesce(
    p_operation->'command',
    '{}'::jsonb
  );
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
  v_category_id text;
  v_category_path text[];
  v_primary_photo_evidence_id uuid;
  v_result jsonb;
  v_request_hash text;
  v_existing_request_hash text;
  v_version integer;
  v_cursor bigint;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce((p_operation->>'operationVersion')::integer, 1) <> 1
     or coalesce(
       (v_command_record->>'commandVersion')::integer,
       1
     ) <> 1
  then
    raise exception 'UNSUPPORTED_CONTRACT_VERSION'
      using errcode = 'P0001';
  end if;

  if nullif(p_operation->>'householdId', '') is not null
     and nullif(v_command_record->>'householdId', '') is not null
     and p_operation->>'householdId'
       <> v_command_record->>'householdId'
  then
    raise exception 'HOUSEHOLD_SCOPE_MISMATCH'
      using errcode = 'P0001';
  end if;

  if v_command not in (
       'asset.category.set',
       'asset.primary-photo.set'
     )
  then
    raise exception 'UNSUPPORTED_COMMAND' using errcode = 'P0001';
  end if;

  if v_entity_type <> 'asset' then
    raise exception 'ENTITY_TYPE_MISMATCH' using errcode = 'P0001';
  end if;

  if nullif(p_operation->>'entityType', '') is not null
     and nullif(v_command_record->>'type', '') is not null
     and p_operation->>'entityType'
       <> split_part(v_command_record->>'type', '.', 1)
  then
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
     or length(v_idempotency_key) > 128
  then
    raise exception 'INVALID_OPERATION_SIZE' using errcode = 'P0001';
  end if;

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

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_household::text || ':' || v_idempotency_key,
      0
    )
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

  if jsonb_typeof(v_payload) <> 'object' or v_base_version < 1 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  if v_command = 'asset.category.set' then
    v_category_id := trim(coalesce(v_payload->>'categoryId', ''));
    if char_length(v_category_id) not between 1 and 180
       or v_category_id ~ '[[:cntrl:]]'
       or jsonb_typeof(v_payload->'categoryPath') is distinct from 'array'
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    if jsonb_array_length(v_payload->'categoryPath') not between 1 and 12
       or exists (
         select 1
         from jsonb_array_elements(v_payload->'categoryPath') as segment(value)
         where jsonb_typeof(segment.value) <> 'string'
       )
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    select array_agg(segment.value order by segment.ordinality)
    into v_category_path
    from jsonb_array_elements_text(v_payload->'categoryPath')
      with ordinality as segment(value, ordinality);

    if v_category_path is distinct from string_to_array(v_category_id, '.')
       or exists (
         select 1
         from unnest(v_category_path) as segment(value)
         where char_length(trim(segment.value)) not between 1 and 80
           or segment.value <> trim(segment.value)
           or segment.value ~ '[[:cntrl:]]'
       )
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    update public.assets
    set
      category_id = v_category_id,
      category_path = v_category_path,
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    -- Pull readers receive the canonical category path even if future clients
    -- add non-authoritative payload hints.
    v_payload := jsonb_build_object(
      'categoryId', v_category_id,
      'categoryPath', to_jsonb(v_category_path)
    );
  else
    if coalesce(v_payload->>'evidenceId', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
    v_primary_photo_evidence_id :=
      (v_payload->>'evidenceId')::uuid;

    perform 1
    from public.evidence
    where id = v_primary_photo_evidence_id
      and household_id = v_household
      and asset_id = v_entity_id
      and kind = 'media'
      and storage_state = 'cloud-acknowledged'
      and deleted_at is null
    for update;

    if not found then
      raise exception 'PRIMARY_PHOTO_EVIDENCE_UNAVAILABLE'
        using errcode = 'P0001';
    end if;

    perform 1
    from public.evidence_versions evidence_version
    join public.blob_objects blob
      on blob.id = evidence_version.blob_object_id
      and blob.household_id = evidence_version.household_id
      and blob.status = 'stored'
      and blob.deleted_at is null
    where evidence_version.household_id = v_household
      and evidence_version.evidence_id = v_primary_photo_evidence_id
    limit 1;

    if not found then
      raise exception 'PRIMARY_PHOTO_EVIDENCE_NOT_READY'
        using errcode = 'P0001';
    end if;

    update public.assets
    set
      primary_photo_evidence_id = v_primary_photo_evidence_id,
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    v_payload := jsonb_build_object(
      'evidenceId', v_primary_photo_evidence_id
    );
  end if;

  v_result := jsonb_build_object(
    'operationId', v_id,
    'entityId', v_entity_id,
    'entityVersion', v_version,
    'status', 'applied',
    'idempotent', false
  );

  insert into public.sync_operations(
    id,
    household_id,
    idempotency_key,
    request_hash,
    actor_id,
    device_id,
    entity_type,
    entity_id,
    base_version,
    command,
    payload,
    client_created_at,
    status,
    result
  )
  values (
    v_id,
    v_household,
    v_idempotency_key,
    v_request_hash,
    v_actor,
    v_device_id,
    v_entity_type,
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
    household_id,
    actor_id,
    event_name,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_household,
    v_actor,
    'sync.' || v_command,
    'asset',
    v_entity_id,
    jsonb_build_object(
      'operationId', v_id,
      'version', v_version,
      'field', case
        when v_command = 'asset.category.set' then 'category'
        else 'primary-photo'
      end
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

revoke all on function public.apply_asset_metadata_sync_operation(jsonb)
  from public, anon, authenticated;

-- Retain every dispatcher branch introduced by preceding migrations and route
-- only the two versioned Asset metadata commands to the new internal handler.
create or replace function public.apply_sync_operation(p_operation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_command_record jsonb := coalesce(
    p_operation->'command',
    '{}'::jsonb
  );
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
  v_entity_id uuid := coalesce(
    nullif(v_command_record->>'aggregateId', ''),
    nullif(p_operation->>'entityId', '')
  )::uuid;
begin
  if v_command in (
    'asset.category.set',
    'asset.primary-photo.set'
  ) then
    return public.apply_asset_metadata_sync_operation(p_operation);
  end if;

  if v_command in (
    'liability.create',
    'liability.update',
    'liability.archive',
    'liability.restore',
    'liability.delete',
    'liability-review.set'
  ) then
    return public.apply_liability_sync_operation(p_operation);
  end if;

  if v_command in ('value.create', 'value.update')
     and v_payload ? 'liabilityId'
  then
    return public.apply_liability_sync_operation(p_operation);
  end if;

  if v_command = 'value.delete'
     and exists (
       select 1
       from public.asset_value_assertions
       where id = v_entity_id
         and household_id = v_household
         and liability_id is not null
         and asset_id is null
         and place_id is null
         and deleted_at is null
     )
  then
    return public.apply_liability_sync_operation(p_operation);
  end if;

  if v_command in (
    'place-document.create',
    'place-document.version.add'
  ) then
    return public.apply_place_document_sync_operation(p_operation);
  end if;

  if v_command in ('value.create', 'value.update')
     and v_payload ? 'placeId'
  then
    return public.apply_property_value_sync_operation(p_operation);
  end if;

  if v_command = 'value.delete'
     and public.can_edit_household(v_household)
     and exists (
       select 1
       from public.asset_value_assertions
       where id = v_entity_id
         and household_id = v_household
         and place_id is not null
         and asset_id is null
         and liability_id is null
         and deleted_at is null
     )
  then
    return public.apply_property_value_sync_operation(p_operation);
  end if;

  if v_command in (
       'evidence.version.create',
       'evidence.version.add'
     )
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
    raise exception 'PLACE_DOCUMENT_COMMAND_REQUIRED'
      using errcode = 'P0001';
  end if;

  return public.apply_sync_operation_core(p_operation);
end
$$;

revoke all on function public.apply_sync_operation(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_sync_operation(jsonb)
  to authenticated;
