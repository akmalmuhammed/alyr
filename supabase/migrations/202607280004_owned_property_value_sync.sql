-- Extend the dated value-assertion ledger to explicitly support one owned
-- Property Place as a subject. Asset and Place subjects remain mutually
-- exclusive, and all writes still pass through a versioned/idempotent sync
-- RPC rather than direct table grants.

alter table public.asset_value_assertions
  alter column asset_id drop not null,
  add column if not exists place_id uuid;

alter table public.asset_value_assertions
  drop constraint if exists asset_value_assertions_value_subject_check,
  add constraint asset_value_assertions_value_subject_check
    check (num_nonnulls(asset_id, place_id) = 1),
  drop constraint if exists
    asset_value_assertions_household_id_place_id_fkey,
  add constraint asset_value_assertions_household_id_place_id_fkey
    foreign key (household_id, place_id)
    references public.places(household_id, id) on delete cascade;

create index if not exists
  asset_value_assertions_household_place_as_of
  on public.asset_value_assertions(household_id, place_id, as_of desc)
  where place_id is not null and deleted_at is null;

create or replace function public.apply_property_value_sync_operation(
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
  v_place_id uuid;
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

  if v_entity_type <> 'value'
     or v_command not in (
       'value.create',
       'value.update',
       'value.delete'
     )
  then
    raise exception 'UNSUPPORTED_COMMAND' using errcode = 'P0001';
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

  if v_command in ('value.create', 'value.update') then
    if
      jsonb_typeof(v_payload) <> 'object'
      or not (v_payload ? 'placeId')
      or (v_payload ? 'assetId')
      or (v_payload->>'placeId')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (v_payload->>'amountMinor') is null
      or (v_payload->>'amountMinor') !~ '^[0-9]+$'
      or (v_payload->>'amountMinor')::numeric
        > 9007199254740991
      or (v_payload->>'currency') is null
      or (v_payload->>'currency') !~ '^[A-Z]{3}$'
      or (v_payload->>'asOf') is null
      or (v_payload->>'asOf')
        !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (v_payload->>'asOf')::date > current_date
      or coalesce(
        v_payload->>'source',
        'user-entered'
      ) <> 'user-entered'
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    v_place_id := (v_payload->>'placeId')::uuid;
    perform 1
    from public.places
    where id = v_place_id
      and household_id = v_household
      and kind in ('home', 'property')
      and tenure = 'owned'
      and deleted_at is null;

    if not found then
      raise exception 'PROPERTY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  if v_command = 'value.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.asset_value_assertions(
      id,
      household_id,
      asset_id,
      place_id,
      amount_minor,
      currency,
      as_of,
      source,
      created_by
    )
    values (
      v_entity_id,
      v_household,
      null,
      v_place_id,
      (v_payload->>'amountMinor')::bigint,
      upper(v_payload->>'currency'),
      (v_payload->>'asOf')::date,
      coalesce(v_payload->>'source', 'user-entered'),
      v_actor
    );
    v_version := 1;

  elsif v_command = 'value.update' then
    update public.asset_value_assertions
    set
      amount_minor = (v_payload->>'amountMinor')::bigint,
      currency = upper(v_payload->>'currency'),
      as_of = (v_payload->>'asOf')::date,
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and asset_id is null
      and place_id = v_place_id
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  else
    update public.asset_value_assertions
    set
      version = version + 1,
      updated_at = now(),
      deleted_at = now()
    where id = v_entity_id
      and household_id = v_household
      and asset_id is null
      and place_id is not null
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;
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
    'value',
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
    'value',
    v_entity_id,
    jsonb_build_object(
      'operationId',
      v_id,
      'version',
      v_version,
      'subjectKind',
      'place'
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

revoke all on function public.apply_property_value_sync_operation(jsonb)
  from public, anon, authenticated;

-- Migration 202607280003 established one public dispatcher and moved the
-- original command implementation to `apply_sync_operation_core`. Extend that
-- dispatcher rather than bypassing it so every client keeps one reviewed RPC.
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
