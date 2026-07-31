begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select has_function(
  'public',
  'create_export_snapshot',
  array['uuid', 'jsonb', 'text', 'text'],
  'versioned export creation requires request idempotency'
);

select hasnt_function(
  'public',
  'create_export_snapshot',
  array['uuid', 'jsonb'],
  'the legacy non-idempotent export function is removed'
);

select results_eq(
  $$
    select public::text || ':' || file_size_limit::text
    from storage.buckets
    where id = 'exports'
  $$,
  array['false:5242880'::text],
  'the export bucket is private and capped at five MiB'
);

select results_eq(
  $$
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%exports%'
        or coalesce(with_check, '') ilike '%exports%'
      )
  $$,
  array[0::bigint],
  'authenticated clients receive no direct export-bucket policy'
);

select results_eq(
  $$
    select concat_ws(
      ':',
      has_table_privilege(
        'service_role',
        'public.export_snapshots',
        'select'
      ),
      has_table_privilege(
        'service_role',
        'public.export_snapshots',
        'update'
      ),
      has_table_privilege(
        'service_role',
        'public.export_snapshots',
        'insert'
      ),
      has_table_privilege(
        'service_role',
        'public.export_snapshots',
        'delete'
      )
    )
  $$,
  array['t:t:f:f'::text],
  'the renderer can read and acknowledge snapshots but not create or delete them'
);

select results_eq(
  $$
    select concat_ws(
      ':',
      has_table_privilege(
        'service_role',
        'public.audit_events',
        'insert'
      ),
      has_table_privilege(
        'service_role',
        'public.audit_events',
        'update'
      ),
      has_table_privilege(
        'service_role',
        'public.audit_events',
        'delete'
      )
    )
  $$,
  array['t:f:f'::text],
  'the renderer can append an audit receipt but not rewrite the audit log'
);

select has_function(
  'public',
  'claim_export_snapshot',
  array['uuid', 'text', 'uuid'],
  'the renderer uses an atomic token claim'
);

select has_function(
  'public',
  'read_export_manifest_source',
  array['uuid', 'text', 'uuid'],
  'manifest domain rows come from one database statement'
);

select has_function(
  'public',
  'complete_export_snapshot',
  array[
    'uuid', 'text', 'uuid', 'text', 'text',
    'text', 'bigint', 'text', 'timestamp with time zone'
  ],
  'export completion is quota-checked atomically'
);

select results_eq(
  $$
    select concat_ws(':', provolatile, prosecdef)
    from pg_proc
    where oid = 'public.read_export_manifest_source(uuid,text,uuid)'::regprocedure
  $$,
  array['s:f'::text],
  'the RLS-scoped manifest function is stable and security-invoker'
);

select results_eq(
  $$
    select concat_ws(
      ':',
      has_function_privilege(
        'service_role',
        'public.claim_export_snapshot(uuid,text,uuid)',
        'execute'
      ),
      has_function_privilege(
        'authenticated',
        'public.claim_export_snapshot(uuid,text,uuid)',
        'execute'
      ),
      has_function_privilege(
        'service_role',
        'public.complete_export_snapshot(uuid,text,uuid,text,text,text,bigint,text,timestamp with time zone)',
        'execute'
      ),
      has_function_privilege(
        'authenticated',
        'public.complete_export_snapshot(uuid,text,uuid,text,text,text,bigint,text,timestamp with time zone)',
        'execute'
      )
    )
  $$,
  array['t:f:t:f'::text],
  'claim and completion RPCs are service-only'
);

select results_eq(
  $$
    select concat_ws(
      ':',
      schedule,
      command like '%alyr_export_maintenance_url%',
      command like '%alyr_export_maintenance_token%'
    )
    from cron.job
    where jobname = 'alyr-export-retention-daily'
  $$,
  array['17 2 * * *:t:t'::text],
  'daily retention reads its endpoint and token only from Vault'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'export-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'export-viewer@example.test',
    '',
    now(),
    now(),
    now()
  );

insert into public.households (id, name, created_by)
values (
  '72000000-0000-4000-8000-000000000001',
  'Export test household',
  '71000000-0000-4000-8000-000000000001'
);

insert into public.memberships (
  id,
  household_id,
  user_id,
  role
)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    'viewer'
  );

insert into public.places (
  id,
  household_id,
  name,
  kind,
  tenure,
  created_by
)
values (
  '74000000-0000-4000-8000-000000000010',
  '72000000-0000-4000-8000-000000000001',
  'Exported owned property',
  'property',
  'owned',
  '71000000-0000-4000-8000-000000000001'
);

insert into public.asset_value_assertions (
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
  '76000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  null,
  '74000000-0000-4000-8000-000000000010',
  275000000,
  'QAR',
  '2026-07-25',
  'user-entered',
  '71000000-0000-4000-8000-000000000001'
);

insert into public.evidence (
  id,
  household_id,
  asset_id,
  place_id,
  kind,
  relation,
  title,
  storage_state,
  version,
  created_by
)
values (
  '77000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  null,
  '74000000-0000-4000-8000-000000000010',
  'paper',
  'ownership',
  'Title deed',
  'cloud-acknowledged',
  2,
  '71000000-0000-4000-8000-000000000001'
);

insert into public.blob_objects (
  id,
  household_id,
  expected_evidence_id,
  expected_evidence_version_id,
  object_key,
  checksum_sha256,
  byte_size,
  mime_type,
  status,
  created_by
)
values (
  '78000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001/78000000-0000-4000-8000-000000000001/79000000-0000-4000-8000-000000000001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  4,
  'application/pdf',
  'stored',
  '71000000-0000-4000-8000-000000000001'
);

insert into public.evidence_versions (
  id,
  household_id,
  evidence_id,
  blob_object_id,
  version_number,
  file_name,
  mime_type,
  byte_size,
  checksum_sha256,
  created_by
)
values (
  '79000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001',
  1,
  'title-deed.pdf',
  'application/pdf',
  4,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '71000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{
        "format": "json-manifest",
        "assetIds": [],
        "redacted": false
      }'::jsonb,
      'export-idempotency-0001',
      repeat('a', 64)
    )
  $$,
  'an owner can create an idempotent export snapshot'
);

select results_eq(
  $$
    select count(*)
    from (
      select public.create_export_snapshot(
        '72000000-0000-4000-8000-000000000001',
        '{
          "format": "json-manifest",
          "assetIds": [],
          "redacted": false
        }'::jsonb,
        'export-idempotency-0001',
        repeat('a', 64)
      )
    ) retry
  $$,
  array[1::bigint],
  'an exact retry returns the existing snapshot'
);

select results_eq(
  'select count(*) from public.export_snapshots',
  array[1::bigint],
  'an exact retry does not create a duplicate export'
);

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{
        "format": "pdf",
        "assetIds": [],
        "redacted": false
      }'::jsonb,
      'export-idempotency-0001',
      repeat('b', 64)
    )
  $$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'an idempotency key cannot be reused for another export scope'
);

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{"format":"json-manifest","redacted":false}'::jsonb,
      'export-invalid-scope-01',
      repeat('c', 64)
    )
  $$,
  '22023',
  'EXPORT_REQUEST_INVALID',
  'the database rejects an incomplete export scope'
);

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{
        "format": "json-manifest",
        "assetIds": [],
        "redacted": false,
        "unexpected": true
      }'::jsonb,
      'export-invalid-extra-001',
      repeat('c', 64)
    )
  $$,
  '22023',
  'EXPORT_REQUEST_INVALID',
  'the database rejects additional scope keys'
);

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{
        "format": "json-manifest",
        "assetIds": [
          "74000000-0000-4000-8000-000000000001",
          "74000000-0000-4000-8000-000000000001"
        ],
        "redacted": false
      }'::jsonb,
      'export-invalid-dupe-0001',
      repeat('c', 64)
    )
  $$,
  '22023',
  'EXPORT_REQUEST_INVALID',
  'the database rejects duplicate asset UUIDs'
);

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{
        "format": "json-manifest",
        "assetIds": ["not-a-uuid"],
        "redacted": false
      }'::jsonb,
      'export-invalid-uuid-0001',
      repeat('c', 64)
    )
  $$,
  '22023',
  'EXPORT_REQUEST_INVALID',
  'the database rejects non-UUID asset selectors'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';

select results_eq(
  $$
    select processing_token::text
    from public.claim_export_snapshot(
      (
        select id
        from public.export_snapshots
        where idempotency_key = 'export-idempotency-0001'
      ),
      repeat('a', 64),
      '75000000-0000-4000-8000-000000000001'
    )
  $$,
  array['75000000-0000-4000-8000-000000000001'::text],
  'the first worker atomically claims the export'
);

select results_eq(
  $$
    select processing_token::text
    from public.claim_export_snapshot(
      (
        select id
        from public.export_snapshots
        where idempotency_key = 'export-idempotency-0001'
      ),
      repeat('a', 64),
      '75000000-0000-4000-8000-000000000002'
    )
  $$,
  array['75000000-0000-4000-8000-000000000001'::text],
  'a concurrent worker receives the row without replacing the live claim'
);

update public.export_snapshots
set processing_started_at = now() - interval '6 minutes'
where idempotency_key = 'export-idempotency-0001';

select results_eq(
  $$
    select processing_token::text
    from public.claim_export_snapshot(
      (
        select id
        from public.export_snapshots
        where idempotency_key = 'export-idempotency-0001'
      ),
      repeat('a', 64),
      '75000000-0000-4000-8000-000000000002'
    )
  $$,
  array['75000000-0000-4000-8000-000000000002'::text],
  'a worker may atomically take over a claim after five minutes'
);

select throws_ok(
  $$
    select public.complete_export_snapshot(
      (
        select id
        from public.export_snapshots
        where idempotency_key = 'export-idempotency-0001'
      ),
      repeat('a', 64),
      '75000000-0000-4000-8000-000000000001',
      concat(
        '72000000-0000-4000-8000-000000000001/',
        (
          select id::text
          from public.export_snapshots
          where idempotency_key = 'export-idempotency-0001'
        ),
        '/75000000-0000-4000-8000-000000000001/alyr.json'
      ),
      'alyr.json',
      'application/json',
      1,
      repeat('e', 64),
      now() + interval '7 days'
    )
  $$,
  'P0001',
  'EXPORT_CLAIM_LOST',
  'the stale token can no longer finalize after takeover'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select concat_ws(
      ':',
      source->>'snapshotFound',
      jsonb_typeof(source->'readAt'),
      source->'household'->>'id'
    )
    from (
      select public.read_export_manifest_source(
        (
          select id
          from public.export_snapshots
          where idempotency_key = 'export-idempotency-0001'
        ),
        repeat('a', 64),
        '75000000-0000-4000-8000-000000000002'
      ) as source
    ) manifest
  $$,
  array[
    'true:string:72000000-0000-4000-8000-000000000001'::text
  ],
  'one RLS-scoped statement returns the manifest source and read watermark'
);

select results_eq(
  $$
    select concat_ws(
      ':',
      jsonb_array_length(source->'values'),
      source->'values'->0->>'subject_kind',
      coalesce(source->'values'->0->>'asset_id', 'null'),
      source->'values'->0->>'place_id',
      jsonb_array_length(source->'evidence'),
      source->'evidence'->0->>'subject_kind',
      coalesce(source->'evidence'->0->>'asset_id', 'null'),
      source->'evidence'->0->>'place_id',
      jsonb_array_length(source->'evidenceVersions'),
      jsonb_array_length(source->'blobs')
    )
    from (
      select public.read_export_manifest_source(
        (
          select id
          from public.export_snapshots
          where idempotency_key = 'export-idempotency-0001'
        ),
        repeat('a', 64),
        '75000000-0000-4000-8000-000000000002'
      ) as source
    ) manifest
  $$,
  array[
    '1:place:null:74000000-0000-4000-8000-000000000010:1:place:null:74000000-0000-4000-8000-000000000010:1:1'::text
  ],
  'Recovery manifest includes exact Place subjects and immutable document bytes'
);

reset role;

insert into public.export_snapshots(
  household_id,
  requested_by,
  idempotency_key,
  request_hash,
  scope
)
select
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'export-rate-fixture-' || lpad(sequence::text, 4, '0'),
  repeat('f', 64),
  '{"format":"json-manifest","assetIds":[],"redacted":false}'::jsonb
from generate_series(1, 5) as sequence;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{"format":"json-manifest","assetIds":[],"redacted":false}'::jsonb,
      'export-rate-limited-0001',
      repeat('1', 64)
    )
  $$,
  'P0001',
  'EXPORT_RATE_LIMITED',
  'a household is limited to six new exports per ten minutes'
);

reset role;

-- The manifest assertions above exercised the four-byte Evidence object. Free
-- that fixture before filling the independent export-retention quota exactly.
delete from public.evidence_versions
where id = '79000000-0000-4000-8000-000000000001';
delete from public.blob_objects
where id = '78000000-0000-4000-8000-000000000001';

insert into public.export_object_cleanup_queue(
  object_key,
  household_id,
  snapshot_id,
  file_name,
  mime_type,
  byte_size,
  checksum_sha256
)
select
  '72000000-0000-4000-8000-000000000001/quota/' || sequence,
  '72000000-0000-4000-8000-000000000001',
  (
    select id
    from public.export_snapshots
    where idempotency_key = 'export-idempotency-0001'
  ),
  'retained-' || sequence || '.json',
  'application/json',
  5242880,
  repeat('2', 64)
from generate_series(1, 8) as sequence;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{"format":"json-manifest","assetIds":[],"redacted":false}'::jsonb,
      'export-household-quota-1',
      repeat('3', 64)
    )
  $$,
  'P0001',
  'EXPORT_QUOTA_EXCEEDED',
  'retained cleanup pointers count toward the forty MiB household quota'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    select public.create_export_snapshot(
      '72000000-0000-4000-8000-000000000001',
      '{
        "format": "json-manifest",
        "assetIds": [],
        "redacted": true
      }'::jsonb,
      'export-viewer-denied-01',
      repeat('d', 64)
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'a viewer cannot create an export'
);

select results_eq(
  'select count(*) from public.export_snapshots',
  array[0::bigint],
  'a viewer cannot enumerate another member export'
);

select * from finish();

rollback;
