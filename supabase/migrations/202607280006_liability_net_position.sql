begin;

-- Liabilities are first-class household records. Balances remain immutable
-- dated assertions in the existing value ledger so ALYR can calculate an
-- honest per-currency recorded net position without replacing history.
create table public.liabilities (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  kind text not null check (
    kind in (
      'mortgage',
      'vehicle-loan',
      'personal-loan',
      'credit-card',
      'education-loan',
      'installment',
      'tax',
      'business',
      'family-debt',
      'other'
    )
  ),
  lifecycle text not null default 'active'
    check (lifecycle in ('active', 'archived')),
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id),
  check (
    (lifecycle = 'active' and archived_at is null)
    or (lifecycle = 'archived' and archived_at is not null)
  )
);

create index liabilities_household_lifecycle
  on public.liabilities(household_id, lifecycle, updated_at desc)
  where deleted_at is null;

-- A dated "none recorded" review is distinct from a zero-valued debt. One
-- versioned review per household expires after exactly 90 days.
create table public.liability_reviews (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  status text not null default 'none-confirmed'
    check (status = 'none-confirmed'),
  reviewed_at date not null,
  expires_at date not null,
  version integer not null default 1 check (version > 0),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidated_at timestamptz,
  deleted_at timestamptz,
  unique (household_id),
  unique (household_id, id),
  check (expires_at = reviewed_at + 90)
);

alter table public.asset_value_assertions
  add column if not exists liability_id uuid;

alter table public.asset_value_assertions
  drop constraint if exists asset_value_assertions_value_subject_check,
  add constraint asset_value_assertions_value_subject_check
    check (num_nonnulls(asset_id, place_id, liability_id) = 1),
  drop constraint if exists
    asset_value_assertions_household_id_liability_id_fkey,
  add constraint asset_value_assertions_household_id_liability_id_fkey
    foreign key (household_id, liability_id)
    references public.liabilities(household_id, id) on delete cascade;

create index if not exists
  asset_value_assertions_household_liability_as_of
  on public.asset_value_assertions(
    household_id,
    liability_id,
    as_of desc,
    updated_at desc,
    id
  )
  where liability_id is not null and deleted_at is null;

alter table public.liabilities enable row level security;
alter table public.liabilities force row level security;
alter table public.liability_reviews enable row level security;
alter table public.liability_reviews force row level security;

create policy liabilities_read on public.liabilities
for select using (public.can_admin_household(household_id));

create policy liability_reviews_read on public.liability_reviews
for select using (public.can_admin_household(household_id));

-- The shared value and operation ledgers also carry Liability data. Replace
-- their broad member-read policies so an editor/viewer cannot infer names,
-- balances, counts or review activity through an adjacent table.
drop policy if exists asset_value_assertions_read
  on public.asset_value_assertions;
create policy asset_value_assertions_read
on public.asset_value_assertions
for select using (
  public.is_household_member(household_id)
  and (
    liability_id is null
    or public.can_admin_household(household_id)
  )
);

drop policy if exists sync_operations_read
  on public.sync_operations;
create policy sync_operations_read
on public.sync_operations
for select using (
  public.is_household_member(household_id)
  and (
    public.can_admin_household(household_id)
    or not (
      command like 'liability.%'
      or command = 'liability-review.set'
      or (
        entity_type = 'value'
        and payload ? 'liabilityId'
      )
    )
  )
);

revoke all on table public.liabilities
  from public, anon, authenticated;
revoke all on table public.liability_reviews
  from public, anon, authenticated;
grant select on table public.liabilities, public.liability_reviews
  to authenticated;

-- This internal handler owns Liability masters, dated Liability balances and
-- the explicit no-liabilities review. It mirrors the same actor binding,
-- advisory-lock idempotency and observed-version semantics as every existing
-- sync command. Only the public dispatcher is executable by clients.
create or replace function public.apply_liability_sync_operation(
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
  v_liability_id uuid;
  v_liability_name text;
  v_liability_kind text;
  v_reviewed_at date;
  v_expires_at date;
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
       'liability.create',
       'liability.update',
       'liability.archive',
       'liability.restore',
       'liability.delete',
       'liability-review.set',
       'value.create',
       'value.update',
       'value.delete'
     )
  then
    raise exception 'UNSUPPORTED_COMMAND' using errcode = 'P0001';
  end if;

  if (
       v_command like 'liability.%'
       and v_entity_type <> 'liability'
     )
     or (
       v_command = 'liability-review.set'
       and v_entity_type <> 'liability-review'
     )
     or (
       v_command like 'value.%'
       and v_entity_type <> 'value'
     )
  then
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

  if not public.can_admin_household(v_household) then
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

  if v_command in ('liability.create', 'liability.update') then
    if jsonb_typeof(v_payload) <> 'object'
       or (
         v_command = 'liability.create'
         and (
           not (v_payload ?& array['name', 'kind'])
           or char_length(trim(coalesce(v_payload->>'name', '')))
             not between 1 and 120
           or coalesce(v_payload->>'kind', '') not in (
             'mortgage',
             'vehicle-loan',
             'personal-loan',
             'credit-card',
             'education-loan',
             'installment',
             'tax',
             'business',
             'family-debt',
             'other'
           )
         )
       )
       or (
         v_command = 'liability.update'
         and (
           not (v_payload ?| array['name', 'kind'])
           or (
             v_payload ? 'name'
             and char_length(trim(coalesce(v_payload->>'name', '')))
               not between 1 and 120
           )
           or (
             v_payload ? 'kind'
             and coalesce(v_payload->>'kind', '') not in (
               'mortgage',
               'vehicle-loan',
               'personal-loan',
               'credit-card',
               'education-loan',
               'installment',
               'tax',
               'business',
               'family-debt',
               'other'
             )
           )
         )
       )
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
  end if;

  if v_command in ('liability.archive', 'liability.restore') then
    if jsonb_typeof(v_payload) <> 'object'
       or v_payload->>'lifecycle' <> (case
         when v_command = 'liability.archive' then 'archived'
         else 'active'
       end)
       or (
         v_command = 'liability.archive'
         and (
           nullif(v_payload->>'archivedAt', '') is null
           or jsonb_typeof(v_payload->'archivedAt') <> 'string'
         )
       )
       or (
         v_command = 'liability.restore'
         and (
           not (v_payload ? 'archivedAt')
           or v_payload->'archivedAt' <> 'null'::jsonb
         )
       )
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
  end if;

  if v_command = 'liability-review.set' then
    if jsonb_typeof(v_payload) <> 'object'
       or v_payload->>'status' <> 'none-confirmed'
       or coalesce(v_payload->>'reviewedAt', '')
         !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce(v_payload->>'expiresAt', '')
         !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    v_reviewed_at := (v_payload->>'reviewedAt')::date;
    v_expires_at := (v_payload->>'expiresAt')::date;
    if v_reviewed_at > current_date
       or v_expires_at <> v_reviewed_at + 90
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.liabilities
      where household_id = v_household
        and lifecycle = 'active'
        and deleted_at is null
    ) then
      raise exception 'LIABILITY_REVIEW_CONFLICT'
        using errcode = 'P0001';
    end if;
  end if;

  if v_command in ('value.create', 'value.update') then
    if jsonb_typeof(v_payload) <> 'object'
       or not (v_payload ? 'liabilityId')
       or v_payload ?| array['assetId', 'placeId']
       or (v_payload->>'liabilityId')
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

    v_liability_id := (v_payload->>'liabilityId')::uuid;
    perform 1
    from public.liabilities
    where id = v_liability_id
      and household_id = v_household
      and lifecycle = 'active'
      and deleted_at is null;

    if not found then
      raise exception 'LIABILITY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  if v_command = 'liability.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.liabilities(
      id,
      household_id,
      name,
      kind,
      lifecycle,
      archived_at,
      created_by
    )
    values (
      v_entity_id,
      v_household,
      trim(v_payload->>'name'),
      v_payload->>'kind',
      'active',
      null,
      v_actor
    )
    returning version, name, kind
      into v_version, v_liability_name, v_liability_kind;

  elsif v_command = 'liability.update' then
    update public.liabilities
    set
      name = case
        when v_payload ? 'name' then trim(v_payload->>'name')
        else name
      end,
      kind = case
        when v_payload ? 'kind' then v_payload->>'kind'
        else kind
      end,
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version, name, kind
      into v_version, v_liability_name, v_liability_kind;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    -- Sync readers always receive a complete Liability projection even when
    -- an API-compatible client sent a partial update.
    v_payload := jsonb_build_object(
      'name', v_liability_name,
      'kind', v_liability_kind
    );

  elsif v_command = 'liability.archive' then
    update public.liabilities
    set
      lifecycle = 'archived',
      archived_at = (v_payload->>'archivedAt')::timestamptz,
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

  elsif v_command = 'liability.restore' then
    update public.liabilities
    set
      lifecycle = 'active',
      archived_at = null,
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

  elsif v_command = 'liability.delete' then
    update public.liabilities
    set
      version = version + 1,
      updated_at = now(),
      deleted_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    -- One Liability tombstone removes its derived balance history from active
    -- reads without physically erasing the versioned ledger.
    update public.asset_value_assertions
    set
      version = version + 1,
      updated_at = now(),
      deleted_at = now()
    where household_id = v_household
      and liability_id = v_entity_id
      and deleted_at is null;

  elsif v_command = 'liability-review.set' then
    if v_base_version = 0 then
      if exists (
        select 1
        from public.liability_reviews
        where household_id = v_household
          and deleted_at is null
      ) then
        raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
      end if;

      insert into public.liability_reviews(
        id,
        household_id,
        status,
        reviewed_at,
        expires_at,
        reviewed_by
      )
      values (
        v_entity_id,
        v_household,
        'none-confirmed',
        v_reviewed_at,
        v_expires_at,
        v_actor
      )
      returning version into v_version;
    else
      update public.liability_reviews
      set
        status = 'none-confirmed',
        reviewed_at = v_reviewed_at,
        expires_at = v_expires_at,
        reviewed_by = v_actor,
        invalidated_at = null,
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
    end if;

  elsif v_command = 'value.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.asset_value_assertions(
      id,
      household_id,
      asset_id,
      place_id,
      liability_id,
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
      null,
      v_liability_id,
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
      and place_id is null
      and liability_id = v_liability_id
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
      and place_id is null
      and liability_id is not null
      and version = v_base_version
      and deleted_at is null
    returning version, liability_id into v_version, v_liability_id;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  -- A no-Liability review is a point-in-time assertion. Any later mutation to
  -- a Liability master or its dated balance ledger invalidates that assertion,
  -- while retaining the same review identity/version for a future explicit
  -- re-confirmation.
  if v_command <> 'liability-review.set' then
    update public.liability_reviews
    set
      invalidated_at = coalesce(invalidated_at, now()),
      updated_at = now()
    where household_id = v_household
      and deleted_at is null;
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
    v_entity_type,
    v_entity_id,
    jsonb_build_object(
      'operationId',
      v_id,
      'version',
      v_version,
      'subjectKind',
      case
        when v_entity_type = 'value' then 'liability'
        else v_entity_type
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

revoke all on function public.apply_liability_sync_operation(jsonb)
  from public, anon, authenticated;

-- Extend the existing public dispatcher while retaining all prior Place
-- document, owned-Property and original Asset command routes.
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

create or replace function public.pull_sync_operations(
  p_household_id uuid,
  p_after_cursor bigint default 0,
  p_limit integer default 250
)
returns table(
  cursor bigint,
  operation_id uuid,
  entity_type text,
  entity_id uuid,
  command text,
  payload jsonb,
  result jsonb,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    operation.cursor,
    operation.id,
    operation.entity_type,
    operation.entity_id,
    operation.command,
    operation.payload,
    operation.result,
    operation.received_at
  from public.sync_operations operation
  where public.is_household_member(p_household_id)
    and operation.household_id = p_household_id
    and operation.cursor > greatest(p_after_cursor, 0)
    and (
      public.can_admin_household(p_household_id)
      or not (
        operation.command like 'liability.%'
        or operation.command = 'liability-review.set'
        or (
          operation.entity_type = 'value'
          and operation.payload ? 'liabilityId'
        )
      )
    )
  order by operation.cursor
  limit least(greatest(p_limit, 1), 500)
$$;

revoke all on function public.pull_sync_operations(uuid, bigint, integer)
  from public, anon;
grant execute on function public.pull_sync_operations(uuid, bigint, integer)
  to authenticated;

-- The Edge transport needs a safe high-water mark when a non-owner has only
-- hidden Liability operations after their cursor. Compute changes and the
-- scanned cursor in one database snapshot: clients advance without receiving
-- a synthetic record, hidden count, entity ID or payload.
create or replace function public.pull_sync_batch(
  p_household_id uuid,
  p_after_cursor bigint default 0,
  p_limit integer default 250
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with eligible as (
    select
      operation.cursor,
      operation.id as operation_id,
      operation.entity_type,
      operation.entity_id,
      operation.command,
      operation.payload,
      operation.result,
      operation.received_at,
      (
        public.can_admin_household(p_household_id)
        or not (
          operation.command like 'liability.%'
          or operation.command = 'liability-review.set'
          or (
            operation.entity_type = 'value'
            and operation.payload ? 'liabilityId'
          )
        )
      ) as visible
    from public.sync_operations operation
    where public.is_household_member(p_household_id)
      and operation.household_id = p_household_id
      and operation.cursor > greatest(p_after_cursor, 0)
  ),
  visible_page as (
    select
      eligible.cursor,
      eligible.operation_id,
      eligible.entity_type,
      eligible.entity_id,
      eligible.command,
      eligible.payload,
      eligible.result,
      eligible.received_at
    from eligible
    where eligible.visible
    order by eligible.cursor
    limit least(greatest(p_limit, 1), 500)
  )
  select jsonb_build_object(
    'operations',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(operation)
          order by operation.cursor
        )
        from visible_page operation
      ),
      '[]'::jsonb
    ),
    'nextCursor',
    case
      when (
        select count(*)
        from visible_page
      ) = least(greatest(p_limit, 1), 500)
      then coalesce(
        (select max(operation.cursor) from visible_page operation),
        greatest(p_after_cursor, 0)
      )
      else coalesce(
        (select max(operation.cursor) from eligible operation),
        greatest(p_after_cursor, 0)
      )
    end
  )
$$;

revoke all on function public.pull_sync_batch(uuid, bigint, integer)
  from public, anon;
grant execute on function public.pull_sync_batch(uuid, bigint, integer)
  to authenticated;

-- Full-household Recovery exports include active/archived Liability masters,
-- all non-deleted dated balance history and the latest explicit review.
-- Asset-selective exports deliberately return none of those household-wide
-- financial records.
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
  ),
  household_liabilities as (
    select
      liability.id,
      liability.name,
      liability.kind,
      liability.lifecycle,
      liability.archived_at,
      liability.version,
      liability.created_at,
      liability.updated_at
    from public.liabilities liability
    join snapshot on snapshot.household_id = liability.household_id
    where liability.deleted_at is null
      and jsonb_array_length(snapshot.scope->'assetIds') = 0
  ),
  household_liability_reviews as (
    select
      review.id,
      review.status,
      review.reviewed_at,
      review.expires_at,
      review.invalidated_at,
      review.version,
      review.created_at,
      review.updated_at
    from public.liability_reviews review
    join snapshot on snapshot.household_id = review.household_id
    where review.deleted_at is null
      and jsonb_array_length(snapshot.scope->'assetIds') = 0
  ),
  selected_values as (
    select
      value_assertion.id,
      value_assertion.asset_id,
      value_assertion.place_id,
      value_assertion.liability_id,
      case
        when value_assertion.asset_id is not null then 'asset'
        when value_assertion.place_id is not null then 'place'
        else 'liability'
      end as subject_kind,
      value_assertion.amount_minor,
      value_assertion.currency,
      value_assertion.as_of,
      value_assertion.source,
      value_assertion.version,
      value_assertion.created_at,
      value_assertion.updated_at
    from public.asset_value_assertions value_assertion
    join snapshot on snapshot.household_id = value_assertion.household_id
    left join selected_assets asset
      on asset.id = value_assertion.asset_id
    left join household_places place
      on place.id = value_assertion.place_id
    left join household_liabilities liability
      on liability.id = value_assertion.liability_id
    where value_assertion.deleted_at is null
      and (
        (
          value_assertion.asset_id is not null
          and value_assertion.place_id is null
          and value_assertion.liability_id is null
          and asset.id is not null
        )
        or (
          value_assertion.asset_id is null
          and value_assertion.place_id is not null
          and value_assertion.liability_id is null
          and place.id is not null
        )
        or (
          value_assertion.asset_id is null
          and value_assertion.place_id is null
          and value_assertion.liability_id is not null
          and liability.id is not null
        )
      )
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
      evidence_record.place_id,
      case
        when evidence_record.asset_id is not null then 'asset'
        else 'place'
      end as subject_kind,
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
    left join selected_assets asset
      on asset.id = evidence_record.asset_id
    left join household_places place
      on place.id = evidence_record.place_id
    where evidence_record.deleted_at is null
      and (
        (
          evidence_record.asset_id is not null
          and evidence_record.place_id is null
          and asset.id is not null
        )
        or (
          evidence_record.asset_id is null
          and evidence_record.place_id is not null
          and place.id is not null
        )
      )
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
    'liabilities', coalesce(
      (
        select jsonb_agg(to_jsonb(liability) order by liability.id)
        from household_liabilities liability
      ),
      '[]'::jsonb
    ),
    'liabilityReviews', coalesce(
      (
        select jsonb_agg(to_jsonb(review) order by review.id)
        from household_liability_reviews review
      ),
      '[]'::jsonb
    ),
    'values', coalesce(
      (
        select jsonb_agg(
          to_jsonb(value_assertion)
          order by value_assertion.as_of, value_assertion.id
        )
        from selected_values value_assertion
      ),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (
        select jsonb_agg(
          to_jsonb(location_revision)
          order by location_revision.id
        )
        from selected_locations location_revision
      ),
      '[]'::jsonb
    ),
    'evidence', coalesce(
      (
        select jsonb_agg(
          to_jsonb(evidence_record)
          order by evidence_record.id
        )
        from selected_evidence evidence_record
      ),
      '[]'::jsonb
    ),
    'evidenceVersions', coalesce(
      (
        select jsonb_agg(
          to_jsonb(evidence_version)
          order by evidence_version.id
        )
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

commit;
