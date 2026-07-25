begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'viewer@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'outsider@example.test',
    '',
    now(),
    now(),
    now()
  );

insert into public.households (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'RLS test household',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.memberships (id, household_id, user_id, role)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'viewer'
  );

insert into public.places (
  id, household_id, name, created_by
)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Private home',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.audit_events (
  household_id, actor_id, event_name, entity_type, entity_id
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'test.private-event',
  'place',
  '40000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select results_eq(
  'select count(*) from public.households',
  array[1::bigint],
  'owner sees only their household'
);

select results_eq(
  'select count(*) from public.places',
  array[1::bigint],
  'owner sees household places'
);

select ok(
  public.can_admin_household('20000000-0000-4000-8000-000000000001'),
  'owner has household administration capability'
);

select results_eq(
  'select count(*) from public.audit_events',
  array[1::bigint],
  'owner can inspect the household audit trail'
);

select throws_ok(
  $$
    select public.create_household('Unapproved second household')
  $$,
  'P0001',
  'PILOT_ENROLLMENT_REQUIRED',
  'closed-pilot household creation requires operator enrollment'
);

select lives_ok(
  $$
    select public.record_product_event(
      'household_created',
      '20000000-0000-4000-8000-000000000001',
      '{
        "schemaVersion": 1,
        "platform": "android",
        "appVersion": "0.1.0",
        "locale": "en",
        "occurredOffline": true,
        "creationMode": "personal"
      }'::jsonb
    )
  $$,
  'allow-listed analytics vocabulary is accepted'
);

select throws_ok(
  $$
    select public.record_product_event(
      'household_created',
      '20000000-0000-4000-8000-000000000001',
      '{
        "schemaVersion": 1,
        "platform": "android",
        "appVersion": "0.1.0",
        "locale": "en",
        "occurredOffline": true,
        "creationMode": "Pearl watch at 10 Private Street"
      }'::jsonb
    )
  $$,
  'P0001',
  'INVALID_ANALYTICS_PROPERTY_VALUE',
  'analytics rejects private free text in an allowed key'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.mark_blob_stored(uuid,text,bigint,uuid)',
    'EXECUTE'
  ),
  'clients cannot forge server checksum acknowledgement'
);

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      '80000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1,
      'text/plain'
    )
  $$,
  'owner can reserve a quota-counted upload intent'
);

set local role service_role;

select lives_ok(
  $$
    select public.mark_blob_stored(
      '80000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'trusted verification can mark a matching blob stored'
);

select lives_ok(
  $$
    select public.mark_blob_stored(
      '80000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'upload completion is idempotent after a lost acknowledgement'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'evidence',
      '20000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '{"size": 10485760, "mimetype": "text/plain"}'::jsonb
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'storage policy rejects bytes larger than the reserved intent'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      '{
        "operationVersion": 1,
        "operationId": "50000000-0000-4000-8000-000000000001",
        "householdId": "20000000-0000-4000-8000-000000000001",
        "command": {
          "commandVersion": 1,
          "commandId": "50000000-0000-4000-8000-000000000001",
          "idempotencyKey": "asset-create-test-1",
          "householdId": "20000000-0000-4000-8000-000000000001",
          "actorMemberId": "30000000-0000-4000-8000-000000000001",
          "deviceId": "60000000-0000-4000-8000-000000000001",
          "type": "asset.create",
          "aggregateId": "70000000-0000-4000-8000-000000000001",
          "observedVersion": 0,
          "occurredAt": "2026-07-25T12:00:00.000Z",
          "payload": {
            "name": "Test watch",
            "categoryId": "lifestyle.watch",
            "categoryPath": ["lifestyle", "watch"]
          }
        },
        "status": "queued",
        "attemptCount": 0,
        "nextAttemptAt": null,
        "lastErrorCode": null,
        "createdAt": "2026-07-25T12:00:00.000Z",
        "updatedAt": "2026-07-25T12:00:00.000Z"
      }'::jsonb
    )
  $$,
  'nested shared sync operation is accepted'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      '{
        "operationVersion": 1,
        "operationId": "50000000-0000-4000-8000-000000000001",
        "householdId": "20000000-0000-4000-8000-000000000001",
        "command": {
          "commandVersion": 1,
          "commandId": "50000000-0000-4000-8000-000000000001",
          "idempotencyKey": "asset-create-test-1",
          "householdId": "20000000-0000-4000-8000-000000000001",
          "actorMemberId": "30000000-0000-4000-8000-000000000001",
          "deviceId": "60000000-0000-4000-8000-000000000001",
          "type": "asset.create",
          "aggregateId": "70000000-0000-4000-8000-000000000001",
          "observedVersion": 0,
          "occurredAt": "2026-07-25T12:00:00.000Z",
          "payload": {
            "name": "Test watch",
            "categoryId": "lifestyle.watch",
            "categoryPath": ["lifestyle", "watch"]
          }
        },
        "status": "queued",
        "attemptCount": 0,
        "nextAttemptAt": null,
        "lastErrorCode": null,
        "createdAt": "2026-07-25T12:00:00.000Z",
        "updatedAt": "2026-07-25T12:00:00.000Z"
      }'::jsonb
    )
  $$,
  'retrying the same operation is idempotent'
);

select results_eq(
  $$
    select count(*)
    from public.assets
    where id = '70000000-0000-4000-8000-000000000001'
  $$,
  array[1::bigint],
  'idempotent retry never duplicates an asset'
);

select throws_ok(
  $$
    select public.apply_sync_operation(
      '{
        "operationVersion": 1,
        "operationId": "50000000-0000-4000-8000-000000000002",
        "householdId": "20000000-0000-4000-8000-000000000001",
        "command": {
          "commandVersion": 1,
          "commandId": "50000000-0000-4000-8000-000000000002",
          "idempotencyKey": "asset-create-test-1",
          "householdId": "20000000-0000-4000-8000-000000000001",
          "actorMemberId": "30000000-0000-4000-8000-000000000001",
          "deviceId": "60000000-0000-4000-8000-000000000001",
          "type": "asset.create",
          "aggregateId": "70000000-0000-4000-8000-000000000002",
          "observedVersion": 0,
          "occurredAt": "2026-07-25T12:01:00.000Z",
          "payload": {
            "name": "Different watch",
            "categoryId": "lifestyle.watch"
          }
        },
        "status": "queued",
        "attemptCount": 0,
        "nextAttemptAt": null,
        "lastErrorCode": null,
        "createdAt": "2026-07-25T12:01:00.000Z",
        "updatedAt": "2026-07-25T12:01:00.000Z"
      }'::jsonb
    )
  $$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'one idempotency key cannot authorize different content'
);

select lives_ok(
  $$
    select public.create_export_snapshot(
      '20000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $$,
  'owner can queue a scoped export'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select ok(
  not public.can_edit_household('20000000-0000-4000-8000-000000000001'),
  'viewer cannot edit the household'
);

select results_eq(
  'select count(*) from public.audit_events',
  array[0::bigint],
  'viewer cannot read audit event names or counts'
);

select results_eq(
  'select count(*) from public.export_snapshots',
  array[0::bigint],
  'viewer cannot enumerate export metadata'
);

select throws_ok(
  $$
    select public.create_export_snapshot(
      '20000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'viewer cannot queue an export'
);

select throws_ok(
  $$
    select public.create_household_invite(
      '20000000-0000-4000-8000-000000000001',
      'viewer'
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'viewer cannot create invitations'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';

select results_eq(
  'select count(*) from public.households',
  array[0::bigint],
  'outsider sees no household row'
);

select results_eq(
  'select count(*) from public.places',
  array[0::bigint],
  'outsider sees no place names'
);

select results_eq(
  $$
    select count(*)
    from public.pull_sync_operations(
      '20000000-0000-4000-8000-000000000001',
      0,
      250
    )
  $$,
  array[0::bigint],
  'outsider receives no sync records or counts'
);

select throws_ok(
  'select count(*) from public.pilot_enrollments',
  '42501',
  'permission denied for table pilot_enrollments',
  'pilot enrollment records are not queryable by authenticated outsiders'
);

select * from finish();

rollback;
