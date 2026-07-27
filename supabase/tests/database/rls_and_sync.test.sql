begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

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
  id, household_id, name, kind, tenure, address_text, region_label,
  latitude, longitude,
  location_source, location_precision, horizontal_accuracy_m,
  location_observed_at, location_confirmed_at, created_by
)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Private home',
  'property',
  'owned',
  'Original address',
  'Original region',
  25.300000,
  51.500000,
  'device_gps',
  'exact',
  5,
  '2026-07-25T11:00:00.000Z',
  '2026-07-25T11:01:00.000Z',
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

select lives_ok(
  $$
    select public.complete_household_onboarding(
      '20000000-0000-4000-8000-000000000001'
    )
  $$,
  'owner can durably complete household onboarding'
);

select results_eq(
  'select event_name from public.audit_events order by event_name',
  $$ values
    ('household.onboarding_completed'::text),
    ('test.private-event'::text)
  $$,
  'owner sees the complete household audit trail after onboarding'
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

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000020',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000020',
          'idempotencyKey', 'place-document-create-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'place-document.create',
          'aggregateId', '81000000-0000-4000-8000-000000000001',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T11:20:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'kind', 'paper',
            'relation', 'ownership',
            'title', 'Title deed'
          )
        )
      )
    )
  $$,
  'Place document metadata syncs before its stored version is attached'
);

select results_eq(
  $$
    select count(*)
    from public.evidence
    where id = '81000000-0000-4000-8000-000000000001'
      and household_id = '20000000-0000-4000-8000-000000000001'
      and place_id = '40000000-0000-4000-8000-000000000001'
      and asset_id is null
      and title = 'Title deed'
      and storage_state = 'queued'
      and version = 1
  $$,
  array[1::bigint],
  'Place document has exactly one Place parent and no Asset parent'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000020',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000020',
          'idempotencyKey', 'place-document-create-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'place-document.create',
          'aggregateId', '81000000-0000-4000-8000-000000000001',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T11:20:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'kind', 'paper',
            'relation', 'ownership',
            'title', 'Title deed'
          )
        )
      )
    )
  $$,
  'Place document creation is idempotent after a lost acknowledgement'
);

select results_eq(
  $$
    select count(*)
    from public.sync_operations
    where idempotency_key = 'place-document-create-test-1'
  $$,
  array[1::bigint],
  'Place document retry leaves one authoritative operation'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000021',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000021',
          'idempotencyKey', 'place-document-version-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'place-document.version.add',
          'aggregateId', '90000000-0000-4000-8000-000000000001',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T11:21:00.000Z',
          'payload', jsonb_build_object(
            'placeDocumentId', '81000000-0000-4000-8000-000000000001',
            'blobObjectId', '80000000-0000-4000-8000-000000000001',
            'fileName', 'title-deed.txt',
            'mimeType', 'text/plain',
            'byteSize', 1,
            'checksumSha256',
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          )
        )
      )
    )
  $$,
  'Place document commits only after the bound BlobObject is stored'
);

select results_eq(
  $$
    select count(*)
    from public.evidence_versions ev
    join public.evidence e
      on e.household_id = ev.household_id
     and e.id = ev.evidence_id
    where ev.id = '90000000-0000-4000-8000-000000000001'
      and ev.evidence_id = '81000000-0000-4000-8000-000000000001'
      and ev.blob_object_id = '80000000-0000-4000-8000-000000000001'
      and ev.version_number = 1
      and ev.checksum_sha256 =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      and e.storage_state = 'cloud-acknowledged'
      and e.version = 2
  $$,
  array[1::bigint],
  'Place document version is immutable, checksum-bound, and acknowledged'
);

select throws_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000022',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000022',
          'idempotencyKey', 'place-document-legacy-command-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'evidence.version.add',
          'aggregateId', '90000000-0000-4000-8000-000000000002',
          'observedVersion', 1,
          'occurredAt', '2026-07-25T11:22:00.000Z',
          'payload', jsonb_build_object(
            'evidenceId', '81000000-0000-4000-8000-000000000001'
          )
        )
      )
    )
  $$,
  'P0001',
  'PLACE_DOCUMENT_COMMAND_REQUIRED',
  'Place documents cannot bypass their explicit command family'
);

select throws_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000023',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000023',
          'idempotencyKey', 'place-document-stale-version-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'place-document.version.add',
          'aggregateId', '90000000-0000-4000-8000-000000000003',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T11:23:00.000Z',
          'payload', jsonb_build_object(
            'placeDocumentId', '81000000-0000-4000-8000-000000000001',
            'blobObjectId', '80000000-0000-4000-8000-000000000001',
            'fileName', 'title-deed.txt',
            'mimeType', 'text/plain',
            'byteSize', 1,
            'checksumSha256',
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          )
        )
      )
    )
  $$,
  'P0001',
  'VERSION_CONFLICT',
  'Place document rejects a stale immutable-version observation'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000030',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000030',
          'idempotencyKey', 'property-value-create-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'value.create',
          'aggregateId', '82000000-0000-4000-8000-000000000001',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T11:25:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'amountMinor', 275000000,
            'currency', 'QAR',
            'asOf', '2026-07-25',
            'source', 'user-entered'
          )
        )
      )
    )
  $$,
  'public dispatcher durably creates an owned-Property value assertion'
);

select results_eq(
  $$
    select count(*)
    from public.asset_value_assertions
    where id = '82000000-0000-4000-8000-000000000001'
      and household_id = '20000000-0000-4000-8000-000000000001'
      and asset_id is null
      and place_id = '40000000-0000-4000-8000-000000000001'
      and amount_minor = 275000000
      and currency = 'QAR'
      and as_of = '2026-07-25'::date
      and version = 1
      and deleted_at is null
  $$,
  array[1::bigint],
  'owned-Property value has exactly one Place subject and no Asset subject'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000030',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000030',
          'idempotencyKey', 'property-value-create-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'value.create',
          'aggregateId', '82000000-0000-4000-8000-000000000001',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T11:25:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'amountMinor', 275000000,
            'currency', 'QAR',
            'asOf', '2026-07-25',
            'source', 'user-entered'
          )
        )
      )
    )
  $$,
  'owned-Property value creation is idempotent after a lost acknowledgement'
);

select results_eq(
  $$
    select count(*)
    from public.sync_operations
    where idempotency_key = 'property-value-create-test-1'
  $$,
  array[1::bigint],
  'owned-Property value retry leaves one authoritative operation'
);

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
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000010',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000010',
          'idempotencyKey', 'place-metadata-update-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'place.update',
          'aggregateId', '40000000-0000-4000-8000-000000000001',
          'observedVersion', 1,
          'occurredAt', '2026-07-25T12:02:00.000Z',
          'payload', jsonb_build_object(
            'name', 'Family archive',
            'addressSummary', 'West Bay Lagoon, gate 3',
            'regionLabel', 'Doha'
          )
        )
      )
    )
  $$,
  'Place metadata update is accepted without location fields'
);

select results_eq(
  $$
    select count(*)
    from public.places
    where id = '40000000-0000-4000-8000-000000000001'
      and name = 'Family archive'
      and address_text = 'West Bay Lagoon, gate 3'
      and region_label = 'Doha'
      and latitude = 25.300000
      and longitude = 51.500000
      and location_source = 'device_gps'
      and location_precision = 'exact'
      and horizontal_accuracy_m = 5
      and version = 2
  $$,
  array[1::bigint],
  'Place metadata update preserves exact location provenance'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000015',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000015',
          'idempotencyKey', 'place-pin-update-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'place.update',
          'aggregateId', '40000000-0000-4000-8000-000000000001',
          'observedVersion', 2,
          'occurredAt', '2026-07-25T12:02:30.000Z',
          'payload', jsonb_build_object(
            'latitude', 25.310000,
            'longitude', 51.510000,
            'locationSource', 'user_pin',
            'locationPrecision', 'user_placed',
            'horizontalAccuracyM', null,
            'observedAt', '2026-07-25T12:02:20.000Z',
            'confirmedAt', '2026-07-25T12:02:30.000Z'
          )
        )
      )
    )
  $$,
  'Place pin update is accepted without metadata fields'
);

select results_eq(
  $$
    select count(*)
    from public.places
    where id = '40000000-0000-4000-8000-000000000001'
      and name = 'Family archive'
      and address_text = 'West Bay Lagoon, gate 3'
      and region_label = 'Doha'
      and latitude = 25.310000
      and longitude = 51.510000
      and location_source = 'user_pin'
      and location_precision = 'user_placed'
      and horizontal_accuracy_m is null
      and version = 3
  $$,
  array[1::bigint],
  'Place pin update preserves name and address metadata'
);

select throws_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000011',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000011',
          'idempotencyKey', 'place-stale-update-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'place.update',
          'aggregateId', '40000000-0000-4000-8000-000000000001',
          'observedVersion', 1,
          'occurredAt', '2026-07-25T12:03:00.000Z',
          'payload', jsonb_build_object('name', 'Stale name')
        )
      )
    )
  $$,
  'P0001',
  'VERSION_CONFLICT',
  'Place metadata update rejects a stale observed version'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000012',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000012',
          'idempotencyKey', 'space-create-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'space.create',
          'aggregateId', '41000000-0000-4000-8000-000000000001',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T12:04:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'parentSpaceId', null,
            'name', 'Study',
            'kind', 'room',
            'ordinal', 0
          )
        )
      )
    )
  $$,
  'A new Place space starts at authoritative version one'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000013',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000013',
          'idempotencyKey', 'space-update-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'space.update',
          'aggregateId', '41000000-0000-4000-8000-000000000001',
          'observedVersion', 1,
          'occurredAt', '2026-07-25T12:05:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'parentSpaceId', null,
            'name', 'Family study',
            'kind', 'zone',
            'ordinal', 0
          )
        )
      )
    )
  $$,
  'A Place space edit advances its authoritative version'
);

select results_eq(
  $$
    select count(*)
    from public.spaces
    where id = '41000000-0000-4000-8000-000000000001'
      and place_id = '40000000-0000-4000-8000-000000000001'
      and name = 'Family study'
      and kind = 'zone'
      and parent_space_id is null
      and version = 2
  $$,
  array[1::bigint],
  'Space edit preserves identity and records authoritative version two'
);

select throws_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000014',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000014',
          'idempotencyKey', 'space-cycle-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000001',
          'deviceId', '60000000-0000-4000-8000-000000000001',
          'type', 'space.update',
          'aggregateId', '41000000-0000-4000-8000-000000000001',
          'observedVersion', 2,
          'occurredAt', '2026-07-25T12:06:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'parentSpaceId', '41000000-0000-4000-8000-000000000001',
            'name', 'Family study',
            'kind', 'zone',
            'ordinal', 0
          )
        )
      )
    )
  $$,
  'P0001',
  'INVALID_SPACE_HIERARCHY',
  'Space update rejects self-parenting before mutation'
);

select lives_ok(
  $$
    select public.create_export_snapshot(
      '20000000-0000-4000-8000-000000000001',
      '{
        "format": "json-manifest",
        "assetIds": [],
        "redacted": false
      }'::jsonb,
      'export-owner-test-0001',
      repeat('a', 64)
    )
  $$,
  'owner can queue a scoped export'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select ok(
  not public.can_edit_household('20000000-0000-4000-8000-000000000001'),
  'viewer cannot edit the household'
);

select throws_ok(
  $$
    select public.apply_sync_operation(
      jsonb_build_object(
        'operationVersion', 1,
        'operationId', '50000000-0000-4000-8000-000000000024',
        'householdId', '20000000-0000-4000-8000-000000000001',
        'command', jsonb_build_object(
          'commandVersion', 1,
          'commandId', '50000000-0000-4000-8000-000000000024',
          'idempotencyKey', 'place-document-viewer-test-1',
          'householdId', '20000000-0000-4000-8000-000000000001',
          'actorMemberId', '30000000-0000-4000-8000-000000000002',
          'deviceId', '60000000-0000-4000-8000-000000000002',
          'type', 'place-document.create',
          'aggregateId', '81000000-0000-4000-8000-000000000002',
          'observedVersion', 0,
          'occurredAt', '2026-07-25T11:24:00.000Z',
          'payload', jsonb_build_object(
            'placeId', '40000000-0000-4000-8000-000000000001',
            'kind', 'paper',
            'relation', 'legal',
            'title', 'Viewer attempt'
          )
        )
      )
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'viewer cannot create a Place document'
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
      '{
        "format": "json-manifest",
        "assetIds": [],
        "redacted": false
      }'::jsonb,
      'export-viewer-test-0001',
      repeat('b', 64)
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

select throws_ok(
  $$
    select public.complete_household_onboarding(
      '20000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'HOUSEHOLD_ADMIN_REQUIRED',
  'viewer cannot change provider-controlled onboarding metadata'
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
