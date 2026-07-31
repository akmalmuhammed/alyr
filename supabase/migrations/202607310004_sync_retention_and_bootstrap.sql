begin;

-- Sync operations are both the ordered change feed and the idempotency
-- acknowledgement ledger. This migration makes their lifecycle explicit:
-- active devices pin history with acknowledged checkpoints, inactive devices
-- are required to reseed from a bounded canonical snapshot, and only a
-- service-role maintenance worker may compact acknowledged history.

alter table public.devices
  add constraint devices_household_id_id_unique
  unique (household_id, id);

create table public.sync_household_state (
  household_id uuid primary key
    references public.households(id) on delete cascade,
  generation uuid not null default gen_random_uuid(),
  retained_after_cursor bigint not null default 0
    check (retained_after_cursor >= 0),
  head_cursor bigint not null default 0
    check (head_cursor >= retained_after_cursor),
  operation_count bigint not null default 0
    check (operation_count >= 0),
  operation_bytes bigint not null default 0
    check (operation_bytes >= 0),
  soft_operation_limit integer not null default 50000
    check (soft_operation_limit between 1000 and 500000),
  hard_operation_limit integer not null default 100000
    check (hard_operation_limit between 2000 and 1000000),
  soft_byte_limit bigint not null default 67108864
    check (soft_byte_limit between 1048576 and 1073741824),
  hard_byte_limit bigint not null default 134217728
    check (hard_byte_limit between 2097152 and 2147483648),
  capacity_warning_at timestamptz,
  total_operations_pruned bigint not null default 0
    check (total_operations_pruned >= 0),
  total_sync_audits_pruned bigint not null default 0
    check (total_sync_audits_pruned >= 0),
  total_devices_staled bigint not null default 0
    check (total_devices_staled >= 0),
  total_bootstraps_started bigint not null default 0
    check (total_bootstraps_started >= 0),
  total_reseeds_completed bigint not null default 0
    check (total_reseeds_completed >= 0),
  last_compacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (soft_operation_limit < hard_operation_limit),
  check (soft_byte_limit < hard_byte_limit)
);

create table public.sync_device_checkpoints (
  household_id uuid not null,
  device_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  status text not null default 'active'
    check (status in ('active', 'stale')),
  acknowledged_cursor bigint not null default 0
    check (acknowledged_cursor >= 0),
  last_delivered_cursor bigint not null default 0
    check (last_delivered_cursor >= acknowledged_cursor),
  reseed_required_at timestamptz,
  reseed_reason text
    check (
      reseed_reason is null
      or reseed_reason in (
        'cursor-expired',
        'generation-mismatch',
        'inactive-device',
        'operator-reset'
      )
    ),
  pull_count bigint not null default 0 check (pull_count >= 0),
  bootstrap_count bigint not null default 0 check (bootstrap_count >= 0),
  last_pull_at timestamptz,
  last_acknowledged_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, device_id),
  foreign key (household_id, device_id)
    references public.devices(household_id, id) on delete cascade,
  foreign key (household_id)
    references public.sync_household_state(household_id) on delete cascade,
  check (
    (status = 'active' and reseed_required_at is null and reseed_reason is null)
    or
    (status = 'stale' and reseed_required_at is not null and reseed_reason is not null)
  )
);

create index sync_device_checkpoints_retention
  on public.sync_device_checkpoints(
    household_id,
    status,
    last_seen_at,
    acknowledged_cursor
  );

create table public.sync_bootstrap_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.sync_household_state(household_id) on delete cascade,
  device_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  anchor_cursor bigint not null check (anchor_cursor >= 0),
  status text not null default 'open'
    check (status in ('open', 'completed', 'expired')),
  include_private_financial boolean not null default false,
  item_count integer not null default 0
    check (item_count between 0 and 100000),
  last_delivered_sequence integer not null default 0
    check (last_delivered_sequence >= 0),
  last_page_after_sequence integer,
  last_page_limit integer,
  last_read_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, device_id)
    references public.sync_device_checkpoints(household_id, device_id)
    on delete cascade,
  check (last_delivered_sequence <= item_count),
  check (
    (last_page_after_sequence is null and last_page_limit is null)
    or (
      last_page_after_sequence is not null
      and last_page_after_sequence >= 0
      and last_page_limit between 1 and 250
    )
  )
);

create unique index sync_bootstrap_one_open_per_device
  on public.sync_bootstrap_sessions(household_id, device_id)
  where status = 'open';

create index sync_bootstrap_sessions_expiry
  on public.sync_bootstrap_sessions(expires_at, id)
  where status in ('open', 'completed', 'expired');

create table public.sync_bootstrap_items (
  session_id uuid not null
    references public.sync_bootstrap_sessions(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  entity_type text not null,
  entity_id uuid not null,
  version integer not null check (version > 0),
  tombstoned boolean not null default false,
  body jsonb,
  changed_at timestamptz not null,
  primary key (session_id, sequence),
  unique (session_id, entity_type, entity_id)
);

create table public.sync_retention_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.households(id) on delete cascade,
  retained_after_cursor_before bigint not null,
  retained_after_cursor_after bigint not null,
  safe_cursor bigint not null,
  devices_marked_stale integer not null default 0,
  operations_pruned integer not null default 0,
  operation_bytes_pruned bigint not null default 0,
  sync_audits_pruned integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz not null default now()
);

create index sync_retention_runs_household_completed
  on public.sync_retention_runs(household_id, completed_at desc);

alter table public.sync_household_state enable row level security;
alter table public.sync_household_state force row level security;
alter table public.sync_device_checkpoints enable row level security;
alter table public.sync_device_checkpoints force row level security;
alter table public.sync_bootstrap_sessions enable row level security;
alter table public.sync_bootstrap_sessions force row level security;
alter table public.sync_bootstrap_items enable row level security;
alter table public.sync_bootstrap_items force row level security;
alter table public.sync_retention_runs enable row level security;
alter table public.sync_retention_runs force row level security;

revoke all on table public.sync_household_state
  from public, anon, authenticated;
revoke all on table public.sync_device_checkpoints
  from public, anon, authenticated;
revoke all on table public.sync_bootstrap_sessions
  from public, anon, authenticated;
revoke all on table public.sync_bootstrap_items
  from public, anon, authenticated;
revoke all on table public.sync_retention_runs
  from public, anon, authenticated;

grant select on table public.sync_household_state to service_role;
grant select on table public.sync_device_checkpoints to service_role;
grant select on table public.sync_bootstrap_sessions to service_role;
grant select on table public.sync_bootstrap_items to service_role;
grant select on table public.sync_retention_runs to service_role;

insert into public.sync_household_state(
  household_id,
  head_cursor,
  operation_count,
  operation_bytes
)
select
  household.id,
  coalesce(max(operation.cursor), 0),
  count(operation.cursor),
  coalesce(sum(pg_column_size(operation)), 0)
from public.households household
left join public.sync_operations operation
  on operation.household_id = household.id
group by household.id
on conflict (household_id) do nothing;

create or replace function public.ensure_sync_household_state(
  p_household_id uuid
)
returns public.sync_household_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.sync_household_state;
begin
  if p_household_id is null
     or not exists (
       select 1
       from public.households household
       where household.id = p_household_id
         and household.deleted_at is null
     ) then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.sync_household_state(household_id)
  values (p_household_id)
  on conflict (household_id) do nothing;

  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = p_household_id;

  return v_state;
end
$$;

revoke all on function public.ensure_sync_household_state(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.sync_operation_capacity_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.sync_household_state;
  v_row_bytes bigint := pg_column_size(new);
begin
  perform pg_advisory_xact_lock(
    hashtextextended('heldat-sync-boundary:' || new.household_id::text, 0)
  );

  perform public.ensure_sync_household_state(new.household_id);

  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = new.household_id
  for update;

  if v_state.operation_count + 1 > v_state.hard_operation_limit
     or v_state.operation_bytes + v_row_bytes > v_state.hard_byte_limit then
    raise exception 'SYNC_CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;

  return new;
end
$$;

create or replace function public.sync_operation_capacity_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.sync_household_state state
  set
    head_cursor = greatest(state.head_cursor, new.cursor),
    operation_count = state.operation_count + 1,
    operation_bytes = state.operation_bytes + pg_column_size(new),
    capacity_warning_at = case
      when state.operation_count + 1 >= state.soft_operation_limit
        or state.operation_bytes + pg_column_size(new) >= state.soft_byte_limit
      then coalesce(state.capacity_warning_at, now())
      else state.capacity_warning_at
    end,
    updated_at = now()
  where state.household_id = new.household_id;

  return new;
end
$$;

revoke all on function public.sync_operation_capacity_before_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_operation_capacity_after_insert()
  from public, anon, authenticated, service_role;

create trigger sync_operation_capacity_before_insert_trigger
before insert on public.sync_operations
for each row execute function public.sync_operation_capacity_before_insert();

create trigger sync_operation_capacity_after_insert_trigger
after insert on public.sync_operations
for each row execute function public.sync_operation_capacity_after_insert();

create or replace function public.ensure_sync_device(
  p_household_id uuid,
  p_device_id uuid,
  p_name text default null,
  p_platform text default null
)
returns public.sync_device_checkpoints
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_state public.sync_household_state;
  v_device_rows integer;
  v_checkpoint public.sync_device_checkpoints;
  v_name text := coalesce(nullif(trim(p_name), ''), 'Heldat sync client');
  v_platform text := coalesce(nullif(p_platform, ''), 'web');
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not public.is_household_member(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if p_device_id is null
     or char_length(v_name) not between 1 and 120
     or v_platform not in ('ios', 'android', 'web') then
    raise exception 'INVALID_DEVICE' using errcode = 'P0001';
  end if;

  v_state := public.ensure_sync_household_state(p_household_id);

  insert into public.devices(
    id,
    household_id,
    user_id,
    name,
    platform,
    last_seen_at
  )
  values (
    p_device_id,
    p_household_id,
    v_actor,
    v_name,
    v_platform,
    now()
  )
  on conflict (id) do update
  set
    name = case when p_name is null then public.devices.name else excluded.name end,
    platform = case
      when p_platform is null then public.devices.platform
      else excluded.platform
    end,
    last_seen_at = now(),
    updated_at = now()
  where public.devices.household_id = excluded.household_id
    and public.devices.user_id = excluded.user_id
    and public.devices.deleted_at is null;

  get diagnostics v_device_rows = row_count;
  if v_device_rows <> 1 then
    -- Do not reveal whether a caller-selected device ID belongs to another
    -- account or household.
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  insert into public.sync_device_checkpoints(
    household_id,
    device_id,
    user_id,
    generation,
    status,
    reseed_required_at,
    reseed_reason,
    last_seen_at
  )
  values (
    p_household_id,
    p_device_id,
    v_actor,
    v_state.generation,
    case when v_state.retained_after_cursor > 0 then 'stale' else 'active' end,
    case when v_state.retained_after_cursor > 0 then now() else null end,
    case
      when v_state.retained_after_cursor > 0 then 'cursor-expired'
      else null
    end,
    now()
  )
  on conflict (household_id, device_id) do update
  set
    status = case
      when public.sync_device_checkpoints.generation <> v_state.generation
        or public.sync_device_checkpoints.acknowledged_cursor
          < v_state.retained_after_cursor
      then 'stale'
      else public.sync_device_checkpoints.status
    end,
    reseed_required_at = case
      when public.sync_device_checkpoints.generation <> v_state.generation
        or public.sync_device_checkpoints.acknowledged_cursor
          < v_state.retained_after_cursor
      then coalesce(
        public.sync_device_checkpoints.reseed_required_at,
        now()
      )
      else public.sync_device_checkpoints.reseed_required_at
    end,
    reseed_reason = case
      when public.sync_device_checkpoints.generation <> v_state.generation
      then 'generation-mismatch'
      when public.sync_device_checkpoints.acknowledged_cursor
        < v_state.retained_after_cursor
      then 'cursor-expired'
      else public.sync_device_checkpoints.reseed_reason
    end,
    last_seen_at = now(),
    updated_at = now()
  where public.sync_device_checkpoints.user_id = v_actor
  returning * into v_checkpoint;

  if not found then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  return v_checkpoint;
end
$$;

revoke all on function public.ensure_sync_device(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.register_sync_device(
  p_household_id uuid,
  p_device_id uuid,
  p_name text,
  p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_checkpoint public.sync_device_checkpoints;
  v_state public.sync_household_state;
begin
  v_checkpoint := public.ensure_sync_device(
    p_household_id,
    p_device_id,
    p_name,
    p_platform
  );
  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = p_household_id;

  return jsonb_build_object(
    'householdId', p_household_id,
    'deviceId', p_device_id,
    'generation', v_state.generation,
    'acknowledgedCursor', v_checkpoint.acknowledged_cursor,
    'retainedAfterCursor', v_state.retained_after_cursor,
    'headCursor', v_state.head_cursor,
    'reseedRequired', v_checkpoint.reseed_required_at is not null,
    'reseedReason', v_checkpoint.reseed_reason
  );
end
$$;

revoke all on function public.register_sync_device(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.register_sync_device(uuid, uuid, text, text)
  to authenticated;

-- Keep the public mutation entry point stable while inserting one checkpoint
-- guard ahead of the already-reviewed command dispatcher. A device that was
-- removed from the retention quorum must finish a reseed before any durable
-- outbox retry can be applied after its idempotency rows have been compacted.
alter function public.apply_sync_operation(jsonb)
  rename to apply_sync_operation_dispatch_v202607310003;

revoke all on function public.apply_sync_operation_dispatch_v202607310003(jsonb)
  from public, anon, authenticated, service_role;

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
  v_household_text text := coalesce(
    nullif(p_operation->>'householdId', ''),
    nullif(v_command_record->>'householdId', '')
  );
  v_device_text text := coalesce(
    nullif(v_command_record->>'deviceId', ''),
    nullif(p_operation->>'deviceId', '')
  );
  v_checkpoint public.sync_device_checkpoints;
begin
  -- Preserve the established validation/error ordering for malformed legacy
  -- payloads. Valid UUIDs enter the retention protocol before dispatch.
  if coalesce(v_household_text, '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(v_device_text, '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    return public.apply_sync_operation_dispatch_v202607310003(p_operation);
  end if;

  v_checkpoint := public.ensure_sync_device(
    v_household_text::uuid,
    v_device_text::uuid,
    null,
    null
  );

  if v_checkpoint.reseed_required_at is not null then
    raise exception 'SYNC_RESEED_REQUIRED' using errcode = 'P0001';
  end if;

  return public.apply_sync_operation_dispatch_v202607310003(p_operation);
end
$$;

revoke all on function public.apply_sync_operation(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_sync_operation(jsonb)
  to authenticated;

create or replace function public.pull_sync_page(
  p_household_id uuid,
  p_device_id uuid,
  p_generation uuid default null,
  p_after_cursor bigint default 0,
  p_limit integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_checkpoint public.sync_device_checkpoints;
  v_state public.sync_household_state;
  v_limit integer;
  v_after bigint;
  v_next bigint;
  v_operations jsonb;
begin
  if p_after_cursor is null or p_after_cursor < 0 then
    raise exception 'INVALID_CURSOR' using errcode = 'P0001';
  end if;
  if p_limit is null then
    raise exception 'INVALID_PAGE_LIMIT' using errcode = 'P0001';
  end if;

  v_limit := least(greatest(p_limit, 1), 250);
  v_after := p_after_cursor;
  v_checkpoint := public.ensure_sync_device(
    p_household_id,
    p_device_id,
    null,
    null
  );

  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = p_household_id;

  if p_generation is not null and p_generation <> v_state.generation then
    update public.sync_device_checkpoints checkpoint
    set
      status = 'stale',
      reseed_required_at = coalesce(checkpoint.reseed_required_at, now()),
      reseed_reason = 'generation-mismatch',
      last_seen_at = now(),
      updated_at = now()
    where checkpoint.household_id = p_household_id
      and checkpoint.device_id = p_device_id;
    v_checkpoint.status := 'stale';
    v_checkpoint.reseed_required_at := now();
    v_checkpoint.reseed_reason := 'generation-mismatch';
  elsif v_after < v_state.retained_after_cursor then
    update public.sync_device_checkpoints checkpoint
    set
      status = 'stale',
      reseed_required_at = coalesce(checkpoint.reseed_required_at, now()),
      reseed_reason = 'cursor-expired',
      last_seen_at = now(),
      updated_at = now()
    where checkpoint.household_id = p_household_id
      and checkpoint.device_id = p_device_id;
    v_checkpoint.status := 'stale';
    v_checkpoint.reseed_required_at := now();
    v_checkpoint.reseed_reason := 'cursor-expired';
  end if;

  if v_checkpoint.reseed_required_at is not null then
    return jsonb_build_object(
      'mode', 'reseed-required',
      'reason', v_checkpoint.reseed_reason,
      'generation', v_state.generation,
      'retainedAfterCursor', v_state.retained_after_cursor,
      'headCursor', v_state.head_cursor,
      'operations', '[]'::jsonb,
      'nextCursor', v_after,
      'hasMore', false
    );
  end if;

  if v_after > v_state.head_cursor then
    raise exception 'INVALID_CURSOR' using errcode = 'P0001';
  end if;

  with scanned as materialized (
    select
      operation.cursor,
      operation.id as operation_id,
      operation.entity_type,
      operation.entity_id,
      operation.command,
      operation.payload,
      operation.result,
      operation.received_at
    from public.sync_operations operation
    where operation.household_id = p_household_id
      and operation.cursor > v_after
      and operation.cursor <= v_state.head_cursor
    order by operation.cursor, operation.id
    limit v_limit
  )
  select coalesce(max(scanned.cursor), v_after)
  into v_next
  from scanned;

  with scanned as materialized (
    select
      operation.cursor,
      operation.id as operation_id,
      operation.entity_type,
      operation.entity_id,
      operation.command,
      operation.payload,
      operation.result,
      operation.received_at
    from public.sync_operations operation
    where operation.household_id = p_household_id
      and operation.cursor > v_after
      and operation.cursor <= v_next
    order by operation.cursor, operation.id
  ),
  visible as (
    select *
    from scanned operation
    where public.can_admin_household(p_household_id)
      or not (
        operation.command like 'liability.%'
        or operation.command = 'liability-review.set'
        or (
          operation.entity_type = 'value'
          and operation.payload ? 'liabilityId'
        )
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cursor', operation.cursor,
        'operation_id', operation.operation_id,
        'entity_type', operation.entity_type,
        'entity_id', operation.entity_id,
        'command', operation.command,
        'payload', operation.payload,
        'result', operation.result,
        'received_at', operation.received_at
      )
      order by operation.cursor, operation.operation_id
    ),
    '[]'::jsonb
  )
  into v_operations
  from visible operation;

  update public.sync_device_checkpoints checkpoint
  set
    last_delivered_cursor = greatest(
      checkpoint.last_delivered_cursor,
      v_next
    ),
    pull_count = checkpoint.pull_count + 1,
    last_pull_at = now(),
    last_seen_at = now(),
    updated_at = now()
  where checkpoint.household_id = p_household_id
    and checkpoint.device_id = p_device_id;

  return jsonb_build_object(
    'mode', 'incremental',
    'reason', null,
    'generation', v_state.generation,
    'retainedAfterCursor', v_state.retained_after_cursor,
    'headCursor', v_state.head_cursor,
    'operations', v_operations,
    'nextCursor', v_next,
    'hasMore', v_next < v_state.head_cursor
  );
end
$$;

revoke all on function public.pull_sync_page(
  uuid, uuid, uuid, bigint, integer
) from public, anon;
grant execute on function public.pull_sync_page(
  uuid, uuid, uuid, bigint, integer
) to authenticated;

create or replace function public.acknowledge_sync_checkpoint(
  p_household_id uuid,
  p_device_id uuid,
  p_generation uuid,
  p_cursor bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_checkpoint public.sync_device_checkpoints;
  v_state public.sync_household_state;
begin
  if p_cursor is null or p_cursor < 0 or p_generation is null then
    raise exception 'INVALID_CURSOR' using errcode = 'P0001';
  end if;

  v_checkpoint := public.ensure_sync_device(
    p_household_id,
    p_device_id,
    null,
    null
  );
  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = p_household_id;

  if v_checkpoint.reseed_required_at is not null
     or p_generation <> v_state.generation
     or v_checkpoint.generation <> v_state.generation then
    raise exception 'SYNC_RESEED_REQUIRED' using errcode = 'P0001';
  end if;
  if p_cursor < v_checkpoint.acknowledged_cursor
     or p_cursor > v_checkpoint.last_delivered_cursor
     or p_cursor > v_state.head_cursor then
    raise exception 'INVALID_CURSOR_ACKNOWLEDGEMENT' using errcode = 'P0001';
  end if;

  update public.sync_device_checkpoints checkpoint
  set
    acknowledged_cursor = greatest(
      checkpoint.acknowledged_cursor,
      p_cursor
    ),
    last_acknowledged_at = now(),
    last_seen_at = now(),
    updated_at = now()
  where checkpoint.household_id = p_household_id
    and checkpoint.device_id = p_device_id
  returning * into v_checkpoint;

  return jsonb_build_object(
    'householdId', p_household_id,
    'deviceId', p_device_id,
    'generation', v_state.generation,
    'acknowledgedCursor', v_checkpoint.acknowledged_cursor
  );
end
$$;

revoke all on function public.acknowledge_sync_checkpoint(
  uuid, uuid, uuid, bigint
) from public, anon;
grant execute on function public.acknowledge_sync_checkpoint(
  uuid, uuid, uuid, bigint
) to authenticated;

create or replace function public.begin_sync_reseed(
  p_household_id uuid,
  p_device_id uuid,
  p_ttl interval default interval '6 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_state public.sync_household_state;
  v_session_id uuid := gen_random_uuid();
  v_include_private boolean;
  v_item_count integer;
  v_expires_at timestamptz;
begin
  if p_ttl is null
     or p_ttl < interval '15 minutes'
     or p_ttl > interval '24 hours' then
    raise exception 'INVALID_BOOTSTRAP_TTL' using errcode = 'P0001';
  end if;

  perform public.ensure_sync_device(
    p_household_id,
    p_device_id,
    null,
    null
  );
  v_include_private := public.can_admin_household(p_household_id);
  v_expires_at := now() + p_ttl;

  -- The same household boundary lock is acquired by every SyncOperation
  -- insert. Any mutation already in progress either commits before this
  -- snapshot or inserts its operation after the captured anchor.
  perform pg_advisory_xact_lock(
    hashtextextended('heldat-sync-boundary:' || p_household_id::text, 0)
  );

  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = p_household_id
  for update;

  update public.sync_bootstrap_sessions session
  set
    status = 'expired',
    updated_at = now()
  where session.household_id = p_household_id
    and session.status = 'open'
    and (
      session.expires_at <= now()
      or session.device_id = p_device_id
    );

  if (
    select count(*)
    from public.sync_bootstrap_sessions session
    where session.household_id = p_household_id
      and session.status = 'open'
      and session.expires_at > now()
  ) >= 5 then
    raise exception 'SYNC_BOOTSTRAP_CAPACITY_EXCEEDED'
      using errcode = 'P0001';
  end if;

  insert into public.sync_bootstrap_sessions(
    id,
    household_id,
    device_id,
    requested_by,
    generation,
    anchor_cursor,
    include_private_financial,
    expires_at
  )
  values (
    v_session_id,
    p_household_id,
    p_device_id,
    v_actor,
    v_state.generation,
    v_state.head_cursor,
    v_include_private,
    v_expires_at
  );

  with canonical_records as (
    select
      0 as entity_rank,
      'household'::text as entity_type,
      household.id as entity_id,
      household.version,
      jsonb_build_object(
        'record',
        to_jsonb(household) - 'created_by' - 'deleted_at'
      ) as body,
      household.updated_at as changed_at
    from public.households household
    where household.id = p_household_id
      and household.deleted_at is null

    union all

    select
      10,
      'place',
      place.id,
      place.version,
      jsonb_build_object(
        'record',
        to_jsonb(place) - 'created_by' - 'deleted_at'
      ),
      place.updated_at
    from public.places place
    where place.household_id = p_household_id
      and place.deleted_at is null

    union all

    select
      20,
      'space',
      space.id,
      space.version,
      jsonb_build_object(
        'record',
        to_jsonb(space) - 'created_by' - 'deleted_at'
      ),
      space.updated_at
    from public.spaces space
    where space.household_id = p_household_id
      and space.deleted_at is null

    union all

    select
      30,
      'asset',
      asset.id,
      asset.version,
      jsonb_build_object(
        'record',
        to_jsonb(asset) - 'created_by' - 'deleted_at'
      ),
      asset.updated_at
    from public.assets asset
    where asset.household_id = p_household_id
      and asset.deleted_at is null

    union all

    select
      40,
      'asset-location',
      location.id,
      location.revision,
      jsonb_build_object(
        'record',
        to_jsonb(location) - 'proposed_by'
      ),
      location.created_at
    from public.asset_location_revisions location
    where location.household_id = p_household_id

    union all

    select
      50,
      'value',
      value.id,
      value.version,
      jsonb_build_object(
        'record',
        to_jsonb(value) - 'created_by' - 'deleted_at'
      ),
      value.updated_at
    from public.asset_value_assertions value
    where value.household_id = p_household_id
      and value.deleted_at is null
      and (
        value.liability_id is null
        or v_include_private
      )

    union all

    select
      60,
      case
        when evidence.place_id is not null then 'place-document'
        else 'evidence'
      end,
      evidence.id,
      evidence.version,
      jsonb_build_object(
        'record',
        to_jsonb(evidence) - 'created_by' - 'deleted_at'
      ),
      evidence.updated_at
    from public.evidence evidence
    where evidence.household_id = p_household_id
      and evidence.deleted_at is null

    union all

    select
      70,
      case
        when evidence.place_id is not null then 'place-document-version'
        else 'evidence-version'
      end,
      version.id,
      version.version_number,
      jsonb_build_object(
        'record',
        to_jsonb(version) - 'created_by'
      ),
      version.created_at
    from public.evidence_versions version
    join public.evidence evidence
      on evidence.household_id = version.household_id
     and evidence.id = version.evidence_id
     and evidence.deleted_at is null
    where version.household_id = p_household_id

    union all

    select
      80,
      'blob-object',
      blob.id,
      1,
      jsonb_build_object(
        'record',
        jsonb_build_object(
          'id', blob.id,
          'household_id', blob.household_id,
          'expected_evidence_id', blob.expected_evidence_id,
          'expected_evidence_version_id',
            blob.expected_evidence_version_id,
          'checksum_sha256', blob.checksum_sha256,
          'byte_size', blob.byte_size,
          'mime_type', blob.mime_type,
          'status', blob.status,
          'created_at', blob.created_at,
          'updated_at', blob.updated_at
        )
      ),
      blob.updated_at
    from public.blob_objects blob
    where blob.household_id = p_household_id
      and blob.status = 'stored'
      and blob.deleted_at is null
      and exists (
        select 1
        from public.evidence_versions version
        where version.household_id = blob.household_id
          and version.blob_object_id = blob.id
      )

    union all

    select
      90,
      'liability',
      liability.id,
      liability.version,
      jsonb_build_object(
        'record',
        to_jsonb(liability) - 'created_by' - 'deleted_at'
      ),
      liability.updated_at
    from public.liabilities liability
    where liability.household_id = p_household_id
      and liability.deleted_at is null
      and v_include_private

    union all

    select
      100,
      'liability-review',
      review.id,
      review.version,
      jsonb_build_object(
        'record',
        to_jsonb(review) - 'reviewed_by' - 'deleted_at'
      ),
      review.updated_at
    from public.liability_reviews review
    where review.household_id = p_household_id
      and review.deleted_at is null
      and v_include_private
  ),
  ordered as (
    select
      row_number() over (
        order by record.entity_rank, record.entity_id
      )::integer as sequence,
      record.entity_type,
      record.entity_id,
      record.version,
      record.body,
      record.changed_at
    from canonical_records record
  )
  insert into public.sync_bootstrap_items(
    session_id,
    sequence,
    entity_type,
    entity_id,
    version,
    tombstoned,
    body,
    changed_at
  )
  select
    v_session_id,
    record.sequence,
    record.entity_type,
    record.entity_id,
    record.version,
    false,
    record.body,
    record.changed_at
  from ordered record
  order by record.sequence;

  get diagnostics v_item_count = row_count;

  if v_item_count > 100000 then
    raise exception 'SYNC_BOOTSTRAP_CAPACITY_EXCEEDED'
      using errcode = 'P0001';
  end if;

  update public.sync_bootstrap_sessions session
  set
    item_count = v_item_count,
    updated_at = now()
  where session.id = v_session_id;

  update public.sync_device_checkpoints checkpoint
  set
    bootstrap_count = checkpoint.bootstrap_count + 1,
    last_seen_at = now(),
    updated_at = now()
  where checkpoint.household_id = p_household_id
    and checkpoint.device_id = p_device_id;

  update public.sync_household_state state
  set
    total_bootstraps_started = state.total_bootstraps_started + 1,
    updated_at = now()
  where state.household_id = p_household_id;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'householdId', p_household_id,
    'deviceId', p_device_id,
    'generation', v_state.generation,
    'anchorCursor', v_state.head_cursor,
    'itemCount', v_item_count,
    'expiresAt', v_expires_at,
    'requiresLocalReplace', true
  );
end
$$;

revoke all on function public.begin_sync_reseed(uuid, uuid, interval)
  from public, anon;
grant execute on function public.begin_sync_reseed(uuid, uuid, interval)
  to authenticated;

create or replace function public.pull_sync_bootstrap_page(
  p_session_id uuid,
  p_after_sequence integer default 0,
  p_limit integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.sync_bootstrap_sessions;
  v_limit integer;
  v_next integer;
  v_items jsonb;
  v_exact_retry boolean;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_after_sequence is null
     or p_after_sequence < 0
     or p_limit is null then
    raise exception 'INVALID_BOOTSTRAP_CURSOR' using errcode = 'P0001';
  end if;
  v_limit := least(greatest(p_limit, 1), 250);

  select *
  into v_session
  from public.sync_bootstrap_sessions session
  where session.id = p_session_id
  for update;

  if not found
     or v_session.requested_by <> v_actor
     or not public.is_household_member(v_session.household_id)
     or not exists (
       select 1
       from public.devices device
       where device.household_id = v_session.household_id
         and device.id = v_session.device_id
         and device.user_id = v_actor
         and device.deleted_at is null
     ) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if v_session.expires_at <= now() or v_session.status = 'expired' then
    update public.sync_bootstrap_sessions
    set status = 'expired', updated_at = now()
    where id = p_session_id;
    raise exception 'SYNC_BOOTSTRAP_EXPIRED' using errcode = 'P0001';
  end if;
  if v_session.include_private_financial
     and not public.can_admin_household(v_session.household_id) then
    update public.sync_bootstrap_sessions
    set status = 'expired', updated_at = now()
    where id = p_session_id;
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  v_exact_retry := coalesce(
    v_session.last_page_after_sequence = p_after_sequence
      and v_session.last_page_limit = v_limit,
    false
  );

  if not v_exact_retry
     and p_after_sequence <> v_session.last_delivered_sequence then
    raise exception 'INVALID_BOOTSTRAP_CURSOR' using errcode = 'P0001';
  end if;

  select coalesce(max(item.sequence), p_after_sequence)
  into v_next
  from (
    select bootstrap_item.sequence
    from public.sync_bootstrap_items bootstrap_item
    where bootstrap_item.session_id = p_session_id
      and bootstrap_item.sequence > p_after_sequence
    order by bootstrap_item.sequence
    limit v_limit
  ) item;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sequence', item.sequence,
        'entityType', item.entity_type,
        'entityId', item.entity_id,
        'version', item.version,
        'tombstoned', item.tombstoned,
        'body', item.body,
        'changedAt', item.changed_at
      )
      order by item.sequence
    ),
    '[]'::jsonb
  )
  into v_items
  from public.sync_bootstrap_items item
  where item.session_id = p_session_id
    and item.sequence > p_after_sequence
    and item.sequence <= v_next;

  if not v_exact_retry then
    update public.sync_bootstrap_sessions session
    set
      last_delivered_sequence = v_next,
      last_page_after_sequence = p_after_sequence,
      last_page_limit = v_limit,
      last_read_at = now(),
      updated_at = now()
    where session.id = p_session_id;
  else
    update public.sync_bootstrap_sessions session
    set last_read_at = now(), updated_at = now()
    where session.id = p_session_id;
  end if;

  update public.sync_device_checkpoints checkpoint
  set last_seen_at = now(), updated_at = now()
  where checkpoint.household_id = v_session.household_id
    and checkpoint.device_id = v_session.device_id;

  return jsonb_build_object(
    'sessionId', p_session_id,
    'generation', v_session.generation,
    'anchorCursor', v_session.anchor_cursor,
    'items', v_items,
    'nextSequence', v_next,
    'hasMore', v_next < v_session.item_count,
    'itemCount', v_session.item_count
  );
end
$$;

revoke all on function public.pull_sync_bootstrap_page(uuid, integer, integer)
  from public, anon;
grant execute on function public.pull_sync_bootstrap_page(
  uuid, integer, integer
) to authenticated;

create or replace function public.complete_sync_reseed(
  p_session_id uuid,
  p_final_sequence integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.sync_bootstrap_sessions;
  v_state public.sync_household_state;
  v_checkpoint public.sync_device_checkpoints;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_session
  from public.sync_bootstrap_sessions session
  where session.id = p_session_id
  for update;

  if not found
     or v_session.requested_by <> v_actor
     or not public.is_household_member(v_session.household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  if v_session.status = 'completed' then
    return jsonb_build_object(
      'sessionId', v_session.id,
      'householdId', v_session.household_id,
      'deviceId', v_session.device_id,
      'generation', v_session.generation,
      'acknowledgedCursor', v_session.anchor_cursor,
      'idempotent', true
    );
  end if;
  if v_session.status <> 'open' or v_session.expires_at <= now() then
    update public.sync_bootstrap_sessions
    set status = 'expired', updated_at = now()
    where id = p_session_id;
    raise exception 'SYNC_BOOTSTRAP_EXPIRED' using errcode = 'P0001';
  end if;
  if v_session.include_private_financial
     and not public.can_admin_household(v_session.household_id) then
    update public.sync_bootstrap_sessions
    set status = 'expired', updated_at = now()
    where id = p_session_id;
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if p_final_sequence is null
     or p_final_sequence <> v_session.item_count
     or v_session.last_delivered_sequence <> v_session.item_count then
    raise exception 'SYNC_BOOTSTRAP_INCOMPLETE' using errcode = 'P0001';
  end if;

  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = v_session.household_id
  for update;

  if v_state.generation <> v_session.generation
     or v_session.anchor_cursor < v_state.retained_after_cursor then
    update public.sync_bootstrap_sessions
    set status = 'expired', updated_at = now()
    where id = p_session_id;
    raise exception 'SYNC_RESEED_RESTART_REQUIRED' using errcode = 'P0001';
  end if;

  update public.sync_device_checkpoints checkpoint
  set
    generation = v_session.generation,
    status = 'active',
    acknowledged_cursor = v_session.anchor_cursor,
    last_delivered_cursor = v_session.anchor_cursor,
    reseed_required_at = null,
    reseed_reason = null,
    last_acknowledged_at = now(),
    last_seen_at = now(),
    updated_at = now()
  where checkpoint.household_id = v_session.household_id
    and checkpoint.device_id = v_session.device_id
    and checkpoint.user_id = v_actor
  returning * into v_checkpoint;

  if not found then
    raise exception 'DEVICE_SCOPE_CONFLICT' using errcode = 'P0001';
  end if;

  update public.sync_bootstrap_sessions session
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where session.id = p_session_id;

  update public.sync_household_state state
  set
    total_reseeds_completed = state.total_reseeds_completed + 1,
    updated_at = now()
  where state.household_id = v_session.household_id;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'householdId', v_session.household_id,
    'deviceId', v_session.device_id,
    'generation', v_session.generation,
    'acknowledgedCursor', v_checkpoint.acknowledged_cursor,
    'idempotent', false
  );
end
$$;

revoke all on function public.complete_sync_reseed(uuid, integer)
  from public, anon;
grant execute on function public.complete_sync_reseed(uuid, integer)
  to authenticated;

create or replace function public.purge_expired_sync_bootstraps(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'INVALID_MAINTENANCE_LIMIT' using errcode = 'P0001';
  end if;

  with victims as (
    select session.id
    from public.sync_bootstrap_sessions session
    where session.expires_at < now()
    order by session.expires_at, session.id
    limit p_limit
    for update skip locked
  )
  delete from public.sync_bootstrap_sessions session
  using victims
  where session.id = victims.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

revoke all on function public.purge_expired_sync_bootstraps(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_sync_bootstraps(integer)
  to service_role;

create or replace function public.maintain_household_sync_retention(
  p_household_id uuid,
  p_operation_limit integer default 5000,
  p_audit_limit integer default 1000,
  p_offline_grace interval default interval '90 days',
  p_min_event_age interval default interval '30 days',
  p_idempotency_retention interval default interval '120 days',
  p_audit_retention interval default interval '365 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  v_state public.sync_household_state;
  v_retained_before bigint;
  v_safe_cursor bigint;
  v_active_checkpoint_cursor bigint;
  v_bootstrap_anchor bigint;
  v_devices_staled integer := 0;
  v_operations_pruned integer := 0;
  v_bytes_pruned bigint := 0;
  v_max_pruned_cursor bigint;
  v_audits_pruned integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if p_operation_limit is null
     or p_operation_limit < 1
     or p_operation_limit > 10000
     or p_audit_limit is null
     or p_audit_limit < 0
     or p_audit_limit > 5000 then
    raise exception 'INVALID_MAINTENANCE_LIMIT' using errcode = 'P0001';
  end if;
  if p_offline_grace is null
     or p_offline_grace < interval '7 days'
     or p_offline_grace > interval '365 days'
     or p_min_event_age is null
     or p_min_event_age < interval '7 days'
     or p_min_event_age > interval '365 days'
     or p_idempotency_retention is null
     or p_idempotency_retention < p_min_event_age
     or p_idempotency_retention > interval '730 days'
     or p_audit_retention is null
     or p_audit_retention < interval '90 days'
     or p_audit_retention > interval '1825 days' then
    raise exception 'INVALID_RETENTION_POLICY' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('heldat-sync-boundary:' || p_household_id::text, 0)
  );
  perform public.ensure_sync_household_state(p_household_id);

  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = p_household_id
  for update;
  v_retained_before := v_state.retained_after_cursor;

  update public.sync_bootstrap_sessions session
  set status = 'expired', updated_at = now()
  where session.household_id = p_household_id
    and session.status = 'open'
    and session.expires_at <= now();

  update public.sync_device_checkpoints checkpoint
  set
    status = 'stale',
    reseed_required_at = coalesce(checkpoint.reseed_required_at, now()),
    reseed_reason = 'inactive-device',
    updated_at = now()
  where checkpoint.household_id = p_household_id
    and checkpoint.status = 'active'
    and checkpoint.reseed_required_at is null
    and checkpoint.last_seen_at < now() - p_offline_grace;
  get diagnostics v_devices_staled = row_count;

  select min(checkpoint.acknowledged_cursor)
  into v_active_checkpoint_cursor
  from public.sync_device_checkpoints checkpoint
  where checkpoint.household_id = p_household_id
    and checkpoint.status = 'active'
    and checkpoint.reseed_required_at is null
    and checkpoint.last_seen_at >= now() - p_offline_grace;

  select min(session.anchor_cursor)
  into v_bootstrap_anchor
  from public.sync_bootstrap_sessions session
  where session.household_id = p_household_id
    and session.status = 'open'
    and session.expires_at > now();

  v_safe_cursor := least(
    coalesce(v_active_checkpoint_cursor, v_state.head_cursor),
    coalesce(v_bootstrap_anchor, v_state.head_cursor),
    v_state.head_cursor
  );

  with victims as materialized (
    select
      operation.cursor,
      pg_column_size(operation) as row_bytes
    from public.sync_operations operation
    where operation.household_id = p_household_id
      and operation.cursor <= v_safe_cursor
      and operation.received_at
        < now() - greatest(p_min_event_age, p_idempotency_retention)
    order by operation.cursor, operation.id
    limit p_operation_limit
  ),
  deleted as (
    delete from public.sync_operations operation
    using victims
    where operation.household_id = p_household_id
      and operation.cursor = victims.cursor
    returning victims.cursor, victims.row_bytes
  )
  select
    count(*)::integer,
    coalesce(sum(deleted.row_bytes), 0),
    max(deleted.cursor)
  into
    v_operations_pruned,
    v_bytes_pruned,
    v_max_pruned_cursor
  from deleted;

  if p_audit_limit > 0 then
    with victims as (
      select event.cursor
      from public.audit_events event
      where event.household_id = p_household_id
        and event.event_name like 'sync.%'
        and event.created_at < now() - p_audit_retention
        and not exists (
          select 1
          from public.sync_operations operation
          where operation.household_id = event.household_id
            and operation.id::text = event.metadata->>'operationId'
        )
      order by event.cursor
      limit p_audit_limit
      for update skip locked
    )
    delete from public.audit_events event
    using victims
    where event.cursor = victims.cursor;
    get diagnostics v_audits_pruned = row_count;
  end if;

  update public.sync_household_state state
  set
    retained_after_cursor = greatest(
      state.retained_after_cursor,
      coalesce(v_max_pruned_cursor, state.retained_after_cursor)
    ),
    operation_count = greatest(
      state.operation_count - v_operations_pruned,
      0
    ),
    operation_bytes = greatest(
      state.operation_bytes - v_bytes_pruned,
      0
    ),
    capacity_warning_at = case
      when state.operation_count - v_operations_pruned
          < state.soft_operation_limit
       and state.operation_bytes - v_bytes_pruned < state.soft_byte_limit
      then null
      else state.capacity_warning_at
    end,
    total_operations_pruned =
      state.total_operations_pruned + v_operations_pruned,
    total_sync_audits_pruned =
      state.total_sync_audits_pruned + v_audits_pruned,
    total_devices_staled =
      state.total_devices_staled + v_devices_staled,
    last_compacted_at = now(),
    updated_at = now()
  where state.household_id = p_household_id
  returning * into v_state;

  insert into public.sync_retention_runs(
    household_id,
    retained_after_cursor_before,
    retained_after_cursor_after,
    safe_cursor,
    devices_marked_stale,
    operations_pruned,
    operation_bytes_pruned,
    sync_audits_pruned,
    started_at
  )
  values (
    p_household_id,
    v_retained_before,
    v_state.retained_after_cursor,
    v_safe_cursor,
    v_devices_staled,
    v_operations_pruned,
    v_bytes_pruned,
    v_audits_pruned,
    v_started_at
  );

  return jsonb_build_object(
    'householdId', p_household_id,
    'generation', v_state.generation,
    'safeCursor', v_safe_cursor,
    'retainedAfterCursorBefore', v_retained_before,
    'retainedAfterCursorAfter', v_state.retained_after_cursor,
    'devicesMarkedStale', v_devices_staled,
    'operationsPruned', v_operations_pruned,
    'operationBytesPruned', v_bytes_pruned,
    'syncAuditsPruned', v_audits_pruned,
    'remainingOperationCount', v_state.operation_count,
    'remainingOperationBytes', v_state.operation_bytes
  );
end
$$;

revoke all on function public.maintain_household_sync_retention(
  uuid, integer, integer, interval, interval, interval, interval
) from public, anon, authenticated;
grant execute on function public.maintain_household_sync_retention(
  uuid, integer, integer, interval, interval, interval, interval
) to service_role;

create or replace function public.read_sync_capacity_page(
  p_after_household_id uuid default null,
  p_limit integer default 100
)
returns table(
  household_id uuid,
  generation uuid,
  retained_after_cursor bigint,
  head_cursor bigint,
  operation_count bigint,
  operation_bytes bigint,
  active_device_count bigint,
  stale_device_count bigint,
  reseed_required_count bigint,
  open_bootstrap_count bigint,
  minimum_active_acknowledged_cursor bigint,
  maximum_active_lag bigint,
  capacity_state text,
  capacity_warning_at timestamptz,
  last_compacted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'INVALID_PAGE_LIMIT' using errcode = 'P0001';
  end if;

  return query
  select
    state.household_id,
    state.generation,
    state.retained_after_cursor,
    state.head_cursor,
    state.operation_count,
    state.operation_bytes,
    (
      select count(*)
      from public.sync_device_checkpoints checkpoint
      where checkpoint.household_id = state.household_id
        and checkpoint.status = 'active'
        and checkpoint.reseed_required_at is null
    ) as active_device_count,
    (
      select count(*)
      from public.sync_device_checkpoints checkpoint
      where checkpoint.household_id = state.household_id
        and checkpoint.status = 'stale'
    ) as stale_device_count,
    (
      select count(*)
      from public.sync_device_checkpoints checkpoint
      where checkpoint.household_id = state.household_id
        and checkpoint.reseed_required_at is not null
    ) as reseed_required_count,
    (
      select count(*)
      from public.sync_bootstrap_sessions session
      where session.household_id = state.household_id
        and session.status = 'open'
        and session.expires_at > now()
    ) as open_bootstrap_count,
    coalesce(
      (
        select min(checkpoint.acknowledged_cursor)
        from public.sync_device_checkpoints checkpoint
        where checkpoint.household_id = state.household_id
          and checkpoint.status = 'active'
          and checkpoint.reseed_required_at is null
      ),
      state.head_cursor
    ) as minimum_active_acknowledged_cursor,
    greatest(
      state.head_cursor - coalesce(
        (
          select min(checkpoint.acknowledged_cursor)
          from public.sync_device_checkpoints checkpoint
          where checkpoint.household_id = state.household_id
            and checkpoint.status = 'active'
            and checkpoint.reseed_required_at is null
        ),
        state.head_cursor
      ),
      0
    ) as maximum_active_lag,
    case
      when state.operation_count >= state.hard_operation_limit
        or state.operation_bytes >= state.hard_byte_limit
      then 'blocked'
      when state.operation_count >= state.soft_operation_limit
        or state.operation_bytes >= state.soft_byte_limit
      then 'warning'
      else 'normal'
    end as capacity_state,
    state.capacity_warning_at,
    state.last_compacted_at
  from public.sync_household_state state
  where p_after_household_id is null
    or state.household_id > p_after_household_id
  order by state.household_id
  limit p_limit;
end
$$;

revoke all on function public.read_sync_capacity_page(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.read_sync_capacity_page(uuid, integer)
  to service_role;

-- Legacy pull consumers remain bounded and, after any compaction, fail closed
-- instead of materializing a partial household. The new transport should use
-- pull_sync_page with a device checkpoint and handle the explicit reseed mode.
create or replace function public.pull_sync_batch(
  p_household_id uuid,
  p_after_cursor bigint default 0,
  p_limit integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.sync_household_state;
  v_limit integer;
  v_after bigint := greatest(coalesce(p_after_cursor, 0), 0);
  v_next bigint;
  v_operations jsonb;
begin
  if not public.is_household_member(p_household_id) then
    return jsonb_build_object(
      'operations', '[]'::jsonb,
      'nextCursor', v_after,
      'hasMore', false
    );
  end if;
  if p_after_cursor is null or p_after_cursor < 0 or p_limit is null then
    raise exception 'INVALID_CURSOR' using errcode = 'P0001';
  end if;
  v_limit := least(greatest(p_limit, 1), 500);

  select *
  into v_state
  from public.sync_household_state state
  where state.household_id = p_household_id;
  if not found then
    v_state := public.ensure_sync_household_state(p_household_id);
  end if;

  if v_after < v_state.retained_after_cursor then
    raise exception 'SYNC_RESEED_REQUIRED' using errcode = 'P0001';
  end if;
  if v_after > v_state.head_cursor then
    raise exception 'INVALID_CURSOR' using errcode = 'P0001';
  end if;

  select coalesce(max(scanned.cursor), v_after)
  into v_next
  from (
    select operation.cursor
    from public.sync_operations operation
    where operation.household_id = p_household_id
      and operation.cursor > v_after
      and operation.cursor <= v_state.head_cursor
    order by operation.cursor, operation.id
    limit v_limit
  ) scanned;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cursor', operation.cursor,
        'operation_id', operation.id,
        'entity_type', operation.entity_type,
        'entity_id', operation.entity_id,
        'command', operation.command,
        'payload', operation.payload,
        'result', operation.result,
        'received_at', operation.received_at
      )
      order by operation.cursor, operation.id
    ),
    '[]'::jsonb
  )
  into v_operations
  from public.sync_operations operation
  where operation.household_id = p_household_id
    and operation.cursor > v_after
    and operation.cursor <= v_next
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
    );

  return jsonb_build_object(
    'operations', v_operations,
    'nextCursor', v_next,
    'hasMore', v_next < v_state.head_cursor,
    'generation', v_state.generation,
    'retainedAfterCursor', v_state.retained_after_cursor
  );
end
$$;

revoke all on function public.pull_sync_batch(uuid, bigint, integer)
  from public, anon;
grant execute on function public.pull_sync_batch(uuid, bigint, integer)
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch jsonb;
begin
  v_batch := public.pull_sync_batch(
    p_household_id,
    p_after_cursor,
    p_limit
  );

  return query
  select
    operation.cursor,
    operation.operation_id,
    operation.entity_type,
    operation.entity_id,
    operation.command,
    operation.payload,
    operation.result,
    operation.received_at
  from jsonb_to_recordset(v_batch->'operations') as operation(
    cursor bigint,
    operation_id uuid,
    entity_type text,
    entity_id uuid,
    command text,
    payload jsonb,
    result jsonb,
    received_at timestamptz
  )
  order by operation.cursor, operation.operation_id;
end
$$;

revoke all on function public.pull_sync_operations(uuid, bigint, integer)
  from public, anon;
grant execute on function public.pull_sync_operations(uuid, bigint, integer)
  to authenticated;

comment on table public.sync_device_checkpoints is
  'Server-authoritative, monotonic device acknowledgements that define the active sync-history retention quorum.';
comment on table public.sync_bootstrap_sessions is
  'Bounded, materialized canonical snapshots used to replace a stale local workspace before incremental sync resumes.';
comment on table public.sync_bootstrap_items is
  'Provider-neutral canonical records for one immutable sync bootstrap session; Storage object keys are deliberately excluded.';
comment on function public.maintain_household_sync_retention(
  uuid, integer, integer, interval, interval, interval, interval
) is
  'Service-only bounded compaction. It excludes stale devices, pins open bootstraps, and prunes idempotency rows only behind every active acknowledgement.';

commit;
