begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'sync-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'sync-outsider@example.test',
    '',
    now(),
    now(),
    now()
  );

insert into public.households (id, name, created_by)
values (
  '21000000-0000-4000-8000-000000000001',
  'Sync retention test household',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.memberships (id, household_id, user_id, role)
values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'owner'
);

create temporary table sync_test_runtime (
  name text primary key,
  payload jsonb not null
) on commit drop;
grant select, insert, update, delete
  on pg_temp.sync_test_runtime
  to authenticated, service_role;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    insert into pg_temp.sync_test_runtime(name, payload)
    values (
      'registration',
      public.register_sync_device(
        '21000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000001',
        'Owner Android',
        'android'
      )
    )
  $$,
  'an authenticated household member can register one Sync device'
);

select results_eq(
  $$
    select
      payload->>'reseedRequired',
      (payload->>'acknowledgedCursor')::bigint
    from pg_temp.sync_test_runtime
    where name = 'registration'
  $$,
  $$ values ('false'::text, 0::bigint) $$,
  'the first household device starts at an active zero checkpoint'
);

select results_eq(
  $$
    select count(*)
    from public.devices
    where household_id = '21000000-0000-4000-8000-000000000001'
      and id = '61000000-0000-4000-8000-000000000001'
      and user_id = '11000000-0000-4000-8000-000000000001'
      and platform = 'android'
  $$,
  array[1::bigint],
  'device registration is bound to the caller and household'
);

reset role;
select results_eq(
  $$
    select status, acknowledged_cursor, last_delivered_cursor
    from public.sync_device_checkpoints
    where household_id = '21000000-0000-4000-8000-000000000001'
      and device_id = '61000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('active'::text, 0::bigint, 0::bigint) $$,
  'the registered device has one active monotonic checkpoint'
);
set local role authenticated;

select lives_ok(
  $$
    insert into pg_temp.sync_test_runtime(name, payload)
    values (
      'operation',
      public.apply_sync_operation(
        '{
          "operationVersion": 1,
          "operationId": "51000000-0000-4000-8000-000000000001",
          "householdId": "21000000-0000-4000-8000-000000000001",
          "command": {
            "commandVersion": 1,
            "commandId": "51000000-0000-4000-8000-000000000001",
            "idempotencyKey": "sync-retention-asset-create-1",
            "householdId": "21000000-0000-4000-8000-000000000001",
            "actorMemberId": "31000000-0000-4000-8000-000000000001",
            "deviceId": "61000000-0000-4000-8000-000000000001",
            "type": "asset.create",
            "aggregateId": "71000000-0000-4000-8000-000000000001",
            "observedVersion": 0,
            "occurredAt": "2026-07-31T04:00:00.000Z",
            "payload": {
              "name": "Sync test watch",
              "categoryId": "lifestyle.watch",
              "categoryPath": ["lifestyle", "watch"]
            }
          }
        }'::jsonb
      )
    )
  $$,
  'a registered active device can append an authoritative operation'
);

reset role;
select results_eq(
  $$
    select
      state.head_cursor =
        (runtime.payload->>'cursor')::bigint,
      state.operation_count
    from public.sync_household_state state
    join pg_temp.sync_test_runtime runtime
      on runtime.name = 'operation'
    where state.household_id = '21000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, 1::bigint) $$,
  'the operation atomically advances household head and capacity count'
);
set local role authenticated;

select lives_ok(
  $$
    insert into pg_temp.sync_test_runtime(name, payload)
    select
      'incremental-page',
      public.pull_sync_page(
        '21000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000001',
        (
          select (payload->>'generation')::uuid
          from pg_temp.sync_test_runtime
          where name = 'registration'
        ),
        0,
        250
      )
  $$,
  'the device can pull a bounded page against the current generation'
);

select results_eq(
  $$
    select
      payload->>'mode',
      jsonb_array_length(payload->'operations'),
      (payload->>'nextCursor')::bigint = (
        select (operation.payload->>'cursor')::bigint
        from pg_temp.sync_test_runtime operation
        where operation.name = 'operation'
      ),
      (payload->>'hasMore')::boolean
    from pg_temp.sync_test_runtime
    where name = 'incremental-page'
  $$,
  $$ values ('incremental'::text, 1, true, false) $$,
  'incremental pull returns exactly the captured operation and cursor'
);

reset role;
select results_eq(
  $$
    select
      checkpoint.last_delivered_cursor =
        (runtime.payload->>'cursor')::bigint,
      checkpoint.pull_count
    from public.sync_device_checkpoints checkpoint
    join pg_temp.sync_test_runtime runtime
      on runtime.name = 'operation'
    where checkpoint.household_id = '21000000-0000-4000-8000-000000000001'
      and checkpoint.device_id = '61000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, 1::bigint) $$,
  'pull delivery advances only the delivered cursor'
);
set local role authenticated;

select lives_ok(
  $$
    select public.acknowledge_sync_checkpoint(
      '21000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      (
        select (payload->>'generation')::uuid
        from pg_temp.sync_test_runtime
        where name = 'registration'
      ),
      (
        select (payload->>'cursor')::bigint
        from pg_temp.sync_test_runtime
        where name = 'operation'
      )
    )
  $$,
  'the device can acknowledge only its delivered cursor'
);

reset role;
select results_eq(
  $$
    select
      checkpoint.acknowledged_cursor =
        (runtime.payload->>'cursor')::bigint,
      checkpoint.last_delivered_cursor =
        (runtime.payload->>'cursor')::bigint
    from public.sync_device_checkpoints checkpoint
    join pg_temp.sync_test_runtime runtime
      on runtime.name = 'operation'
    where checkpoint.household_id = '21000000-0000-4000-8000-000000000001'
      and checkpoint.device_id = '61000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, true) $$,
  'acknowledgement remains monotonic and never exceeds delivery'
);
set local role authenticated;

select throws_ok(
  $$
    select public.acknowledge_sync_checkpoint(
      '21000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      (
        select (payload->>'generation')::uuid
        from pg_temp.sync_test_runtime
        where name = 'registration'
      ),
      (
        select (payload->>'cursor')::bigint + 1
        from pg_temp.sync_test_runtime
        where name = 'operation'
      )
    )
  $$,
  'P0001',
  'INVALID_CURSOR_ACKNOWLEDGEMENT',
  'a client cannot acknowledge an undelivered future cursor'
);

select lives_ok(
  $$
    insert into pg_temp.sync_test_runtime(name, payload)
    values (
      'bootstrap',
      public.begin_sync_reseed(
        '21000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000001',
        interval '1 hour'
      )
    )
  $$,
  'a canonical bootstrap is materialized at one locked head cursor'
);

select results_eq(
  $$
    select
      (payload->>'anchorCursor')::bigint = (
        select (operation.payload->>'cursor')::bigint
        from pg_temp.sync_test_runtime operation
        where operation.name = 'operation'
      ),
      (payload->>'itemCount')::integer,
      (payload->>'requiresLocalReplace')::boolean
    from pg_temp.sync_test_runtime
    where name = 'bootstrap'
  $$,
  $$ values (true, 2, true) $$,
  'the bootstrap contains the canonical household and Asset records'
);

reset role;
select ok(
  not exists (
    select 1
    from public.sync_bootstrap_items
    where session_id = (
      select (payload->>'sessionId')::uuid
      from pg_temp.sync_test_runtime
      where name = 'bootstrap'
    )
      and body::text like '%object_key%'
  ),
  'bootstrap items never expose provider object keys'
);
set local role authenticated;

select lives_ok(
  $$
    insert into pg_temp.sync_test_runtime(name, payload)
    select
      'bootstrap-page',
      public.pull_sync_bootstrap_page(
        (payload->>'sessionId')::uuid,
        0,
        250
      )
    from pg_temp.sync_test_runtime
    where name = 'bootstrap'
  $$,
  'the replacement snapshot can be pulled as a bounded ordered page'
);

select results_eq(
  $$
    select
      jsonb_array_length(payload->'items'),
      (payload->>'nextSequence')::integer,
      (payload->>'hasMore')::boolean
    from pg_temp.sync_test_runtime
    where name = 'bootstrap-page'
  $$,
  $$ values (2, 2, false) $$,
  'the complete bootstrap page reaches the materialized item count'
);

select results_eq(
  $$
    select public.pull_sync_bootstrap_page(
      (
        select (payload->>'sessionId')::uuid
        from pg_temp.sync_test_runtime
        where name = 'bootstrap'
      ),
      0,
      250
    )
  $$,
  $$
    select payload
    from pg_temp.sync_test_runtime
    where name = 'bootstrap-page'
  $$,
  'an exact bootstrap page retry returns byte-equivalent JSON'
);

select throws_ok(
  $$
    select public.pull_sync_bootstrap_page(
      (
        select (payload->>'sessionId')::uuid
        from pg_temp.sync_test_runtime
        where name = 'bootstrap'
      ),
      1,
      250
    )
  $$,
  'P0001',
  'INVALID_BOOTSTRAP_CURSOR',
  'a bootstrap consumer cannot skip or invent a sequence'
);

select lives_ok(
  $$
    insert into pg_temp.sync_test_runtime(name, payload)
    select
      'bootstrap-complete',
      public.complete_sync_reseed(
        (payload->>'sessionId')::uuid,
        (payload->>'itemCount')::integer
      )
    from pg_temp.sync_test_runtime
    where name = 'bootstrap'
  $$,
  'fully delivered replacement data atomically completes the reseed'
);

reset role;
select results_eq(
  $$
    select
      session.status,
      checkpoint.status,
      checkpoint.acknowledged_cursor = session.anchor_cursor,
      checkpoint.reseed_required_at is null
    from public.sync_bootstrap_sessions session
    join public.sync_device_checkpoints checkpoint
      on checkpoint.household_id = session.household_id
     and checkpoint.device_id = session.device_id
    where session.id = (
      select (payload->>'sessionId')::uuid
      from pg_temp.sync_test_runtime
      where name = 'bootstrap'
    )
  $$,
  $$ values ('completed'::text, 'active'::text, true, true) $$,
  'completion reactivates the device exactly at the bootstrap anchor'
);
set local role authenticated;

select is(
  (
    public.complete_sync_reseed(
      (
        select (payload->>'sessionId')::uuid
        from pg_temp.sync_test_runtime
        where name = 'bootstrap'
      ),
      2
    )->>'idempotent'
  )::boolean,
  true,
  'repeating completed reseed acknowledgement is idempotent'
);

reset role;
update public.sync_operations
set received_at = now() - interval '10 days'
where household_id = '21000000-0000-4000-8000-000000000001';

set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';

select lives_ok(
  $$
    insert into pg_temp.sync_test_runtime(name, payload)
    values (
      'maintenance',
      public.maintain_household_sync_retention(
        '21000000-0000-4000-8000-000000000001',
        100,
        0,
        interval '90 days',
        interval '7 days',
        interval '7 days',
        interval '90 days'
      )
    )
  $$,
  'service maintenance prunes only acknowledged and sufficiently old history'
);

select results_eq(
  $$
    select
      (payload->>'operationsPruned')::integer,
      (payload->>'retainedAfterCursorAfter')::bigint = (
        select (operation.payload->>'cursor')::bigint
        from pg_temp.sync_test_runtime operation
        where operation.name = 'operation'
      )
    from pg_temp.sync_test_runtime
    where name = 'maintenance'
  $$,
  $$ values (1, true) $$,
  'maintenance reports one bounded operation prune at cursor one'
);

select results_eq(
  $$
    select
      state.retained_after_cursor =
        (runtime.payload->>'cursor')::bigint,
      state.operation_count
    from public.sync_household_state state
    join pg_temp.sync_test_runtime runtime
      on runtime.name = 'operation'
    where state.household_id = '21000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, 0::bigint) $$,
  'capacity state agrees with the compacted operation ledger'
);

select results_eq(
  $$
    select capacity_state, active_device_count, stale_device_count
    from public.read_sync_capacity_page(null, 100)
    where household_id = '21000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('normal'::text, 1::bigint, 0::bigint) $$,
  'service capacity telemetry is paginated and reflects active checkpoints'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select is(
  (
    public.register_sync_device(
      '21000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000002',
      'Late iPhone',
      'ios'
    )->>'reseedRequired'
  )::boolean,
  true,
  'a device registered after compaction must replace local state'
);

select is(
  public.pull_sync_page(
    '21000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    null,
    0,
    250
  )->>'mode',
  'reseed-required',
  'stale devices receive an explicit reseed mode rather than partial history'
);

select throws_ok(
  $$
    select public.pull_sync_batch(
      '21000000-0000-4000-8000-000000000001',
      0,
      250
    )
  $$,
  'P0001',
  'SYNC_RESEED_REQUIRED',
  'legacy pull consumers fail closed behind the retained cursor'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    select public.register_sync_device(
      '21000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000003',
      'Outsider device',
      'android'
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'an outsider cannot create a household checkpoint'
);

select throws_ok(
  'select count(*) from public.sync_household_state',
  '42501',
  'permission denied for table sync_household_state',
  'outsiders cannot query household sync capacity or counts'
);

select * from finish();

rollback;
