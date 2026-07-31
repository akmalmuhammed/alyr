begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.household_storage_usage'::regclass
  ),
  'household storage counters have forced RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.household_storage_usage',
    'SELECT'
  ),
  'authenticated callers cannot inspect household byte counters'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.household_storage_usage',
    'SELECT'
  ),
  'service maintenance can inspect household byte counters'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.household_storage_usage'::regclass
      and confrelid = 'public.households'::regclass
      and confdeltype = 'c'
  ),
  'counter rows cascade with their household'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.read_backend_readiness_summary()',
    'EXECUTE'
  ),
  'service maintenance can read aggregate readiness signals'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.read_backend_readiness_summary()',
    'EXECUTE'
  ),
  'authenticated callers cannot read backend readiness signals'
);
select ok(
  position(
    'from public.blob_objects' in
    pg_get_functiondef(
      'public.delete_account_domain_data(uuid,jsonb)'::regprocedure
    )
  ) < position(
    'heldat.storage.household:' in
    pg_get_functiondef(
      'public.delete_account_domain_data(uuid,jsonb)'::regprocedure
    )
  ) and position(
    'heldat.storage.household:' in
    pg_get_functiondef(
      'public.delete_account_domain_data(uuid,jsonb)'::regprocedure
    )
  ) < position(
    'from public.households' in
    pg_get_functiondef(
      'public.delete_account_domain_data(uuid,jsonb)'::regprocedure
    )
  ) and regexp_count(
    pg_get_functiondef(
      'public.delete_account_domain_data(uuid,jsonb)'::regprocedure
    ),
    'from public.blob_objects'
  ) >= 2,
  'account deletion drains child rows, gates the household, then locks the parent'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'storage-one@example.test',
    '', now(), now(), now()
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'storage-two@example.test',
    '', now(), now(), now()
  );

insert into public.households(id, name, created_by)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'Storage accounting one',
    'b1000000-0000-4000-8000-000000000001'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'Storage accounting two',
    'b1000000-0000-4000-8000-000000000002'
  );

insert into public.memberships(id, household_id, user_id, role)
values
  (
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'owner'
  );

insert into public.assets(id, household_id, name, category_id, created_by)
values
  (
    'b4000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'Storage fixture one',
    'other',
    'b1000000-0000-4000-8000-000000000001'
  ),
  (
    'b4000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'Storage fixture two',
    'other',
    'b1000000-0000-4000-8000-000000000002'
  );

insert into public.evidence(
  id, household_id, asset_id, kind, relation, title, storage_state, created_by
)
values
  (
    'b5000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001',
    'media', 'identity', 'Storage evidence one', 'queued',
    'b1000000-0000-4000-8000-000000000001'
  ),
  (
    'b5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b4000000-0000-4000-8000-000000000002',
    'media', 'identity', 'Storage evidence two', 'queued',
    'b1000000-0000-4000-8000-000000000002'
  );

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select * from public.create_blob_upload_intent(
      'b6000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'b5000000-0000-4000-8000-000000000001',
      'b7000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001/b6000000-0000-4000-8000-000000000001/b7000000-0000-4000-8000-000000000001',
      repeat('1', 64),
      10485760,
      'image/jpeg'
    )
  $$,
  'Evidence upload admission creates one retained-byte reservation'
);
select lives_ok(
  $$
    select public.record_blob_upload_authorization(
      'b6000000-0000-4000-8000-000000000001',
      now() + interval '1 hour'
    )
  $$,
  'the disclosed provider authorization expiry is durably recorded'
);
select ok(
  (
    select provider_delete_not_before > now()
    from public.blob_objects
    where id = 'b6000000-0000-4000-8000-000000000001'
  ),
  'the retained Blob carries its live provider authorization window'
);

reset role;

select is(
  (
    select retained_bytes
    from public.household_storage_usage
    where household_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  10485760::bigint,
  'household counter includes the Evidence reservation'
);
select is(
  (select retained_storage_bytes from public.launch_enrollment_controls where id = 1),
  10485760::bigint,
  'global counter includes the Evidence reservation'
);

insert into public.export_snapshots(
  id, household_id, requested_by, scope, status,
  object_key, file_name, mime_type, byte_size, checksum_sha256,
  expires_at, completed_at
)
values (
  'b8000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  '{}'::jsonb,
  'ready',
  'b2000000-0000-4000-8000-000000000001/export/fixture.json',
  'fixture.json',
  'application/json',
  5242880,
  repeat('2', 64),
  now() + interval '1 day',
  now()
);

select is(
  (
    select retained_bytes
    from public.household_storage_usage
    where household_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  15728640::bigint,
  'one household counter combines Evidence and export bytes'
);
select is(
  (select retained_storage_bytes from public.launch_enrollment_controls where id = 1),
  15728640::bigint,
  'the global counter combines Evidence and export bytes'
);

update public.launch_enrollment_controls
set household_storage_limit_bytes = 15728640,
    global_storage_limit_bytes = 15728640
where id = 1;

select throws_ok(
  $$
    insert into public.export_snapshots(
      id, household_id, requested_by, scope, status,
      object_key, file_name, mime_type, byte_size, checksum_sha256,
      expires_at, completed_at
    ) values (
      'b8000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      '{}'::jsonb, 'ready',
      'b2000000-0000-4000-8000-000000000001/export/over.json',
      'over.json', 'application/json', 1, repeat('3', 64),
      now() + interval '1 day', now()
    )
  $$,
  'P0001',
  'HOUSEHOLD_STORAGE_LIMIT',
  'export bytes cannot bypass the shared household allowance'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    select * from public.create_blob_upload_intent(
      'b6000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000002',
      'b5000000-0000-4000-8000-000000000002',
      'b7000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000002/b6000000-0000-4000-8000-000000000002/b7000000-0000-4000-8000-000000000002',
      repeat('4', 64), 1, 'image/jpeg'
    )
  $$,
  'P0001',
  'GLOBAL_STORAGE_LIMIT',
  'Evidence bytes cannot bypass the shared global allowance'
);

reset role;

-- A live provider authorization outranks the shorter application intent. Keep
-- one protected expired row beside one eligible row so the batch must skip,
-- rather than merely finding no work.
update public.launch_enrollment_controls
set household_storage_limit_bytes = 20971520,
    global_storage_limit_bytes = 20971520
where id = 1;

insert into public.blob_objects(
  id, household_id, expected_evidence_id, expected_evidence_version_id,
  object_key, checksum_sha256, byte_size, mime_type, status,
  intent_expires_at, provider_delete_not_before, created_by
)
values
  (
    'b6000000-0000-4000-8000-000000000010',
    'b2000000-0000-4000-8000-000000000002',
    'b5000000-0000-4000-8000-000000000002',
    'b7000000-0000-4000-8000-000000000010',
    'b2000000-0000-4000-8000-000000000002/b6000000-0000-4000-8000-000000000010/b7000000-0000-4000-8000-000000000010',
    repeat('a', 64), 1, 'image/jpeg', 'upload-intent',
    now() - interval '15 minutes', now() + interval '1 hour',
    'b1000000-0000-4000-8000-000000000002'
  ),
  (
    'b6000000-0000-4000-8000-000000000011',
    'b2000000-0000-4000-8000-000000000002',
    'b5000000-0000-4000-8000-000000000002',
    'b7000000-0000-4000-8000-000000000011',
    'b2000000-0000-4000-8000-000000000002/b6000000-0000-4000-8000-000000000011/b7000000-0000-4000-8000-000000000011',
    repeat('b', 64), 1, 'image/jpeg', 'upload-intent',
    now() - interval '15 minutes', now() - interval '1 minute',
    'b1000000-0000-4000-8000-000000000002'
  ),
  (
    'b6000000-0000-4000-8000-000000000012',
    'b2000000-0000-4000-8000-000000000002',
    'b5000000-0000-4000-8000-000000000002',
    'b7000000-0000-4000-8000-000000000012',
    'b2000000-0000-4000-8000-000000000002/b6000000-0000-4000-8000-000000000012/b7000000-0000-4000-8000-000000000012',
    repeat('c', 64), 1, 'image/jpeg', 'upload-intent',
    now() + interval '15 minutes', now() + interval '1 hour',
    'b1000000-0000-4000-8000-000000000002'
  );

insert into public.blob_objects(
  id, household_id, expected_evidence_id, expected_evidence_version_id,
  object_key, checksum_sha256, byte_size, mime_type, status,
  intent_expires_at, provider_delete_not_before, created_by, deleted_at
)
values (
  'b6000000-0000-4000-8000-000000000013',
  'b2000000-0000-4000-8000-000000000002',
  'b5000000-0000-4000-8000-000000000002',
  'b7000000-0000-4000-8000-000000000013',
  'b2000000-0000-4000-8000-000000000002/b6000000-0000-4000-8000-000000000013/b7000000-0000-4000-8000-000000000013',
  repeat('d', 64), 1, 'image/jpeg', 'needs-attention',
  null, now() - interval '1 minute',
  'b1000000-0000-4000-8000-000000000002', now()
);
insert into public.blob_object_cleanup_queue(
  blob_object_id, household_id, object_key, reason,
  byte_size, checksum_sha256, mime_type
)
values (
  'b6000000-0000-4000-8000-000000000013',
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000002/b6000000-0000-4000-8000-000000000013/b7000000-0000-4000-8000-000000000013',
  'expired-intent', 1, repeat('d', 64), 'image/jpeg'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.enqueue_blob_object_cleanup(100, interval '24 hours'),
  1,
  'cleanup skips an expired intent with a live provider lease while enqueueing an unrelated eligible intent'
);

reset role;

select ok(
  (
    select blob.deleted_at is null
      and not exists (
        select 1
        from public.blob_object_cleanup_queue cleanup
        where cleanup.blob_object_id = blob.id
      )
    from public.blob_objects blob
    where blob.id = 'b6000000-0000-4000-8000-000000000010'
  ),
  'the protected expired intent keeps its active provider pointer'
);
select ok(
  exists (
    select 1
    from public.blob_object_cleanup_queue cleanup
    where cleanup.blob_object_id = 'b6000000-0000-4000-8000-000000000011'
  ),
  'the unrelated expired intent receives a durable cleanup pointer'
);

update public.blob_objects
set provider_delete_not_before = now() + interval '1 hour'
where id = 'b6000000-0000-4000-8000-000000000011';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select results_eq(
  $$
    select claimed.blob_object_id::text
    from public.claim_blob_object_cleanup(25, interval '5 minutes') claimed
    order by claimed.blob_object_id
  $$,
  array['b6000000-0000-4000-8000-000000000013'::text],
  'a queued object with a live provider lease is unclaimable while an unrelated queue row is claimed'
);

select lives_ok(
  $$
    select public.mark_blob_stored(
      'b6000000-0000-4000-8000-000000000012',
      repeat('c', 64),
      1,
      'b1000000-0000-4000-8000-000000000002'
    )
  $$,
  'upload completion succeeds while its provider deletion horizon is live'
);

reset role;

select is(
  (
    select provider_delete_not_before
    from public.blob_objects
    where id = 'b6000000-0000-4000-8000-000000000012'
  ),
  now() + interval '1 hour',
  'mark_blob_stored retains the provider deletion horizon'
);

update public.blob_objects
set provider_delete_not_before = now() - interval '1 minute'
where id in (
  'b6000000-0000-4000-8000-000000000010',
  'b6000000-0000-4000-8000-000000000011',
  'b6000000-0000-4000-8000-000000000012',
  'b6000000-0000-4000-8000-000000000013'
);
delete from public.blob_object_cleanup_queue
where blob_object_id in (
  'b6000000-0000-4000-8000-000000000011',
  'b6000000-0000-4000-8000-000000000013'
);
delete from public.blob_objects
where id in (
  'b6000000-0000-4000-8000-000000000010',
  'b6000000-0000-4000-8000-000000000011',
  'b6000000-0000-4000-8000-000000000012',
  'b6000000-0000-4000-8000-000000000013'
);
update public.launch_enrollment_controls
set household_storage_limit_bytes = 15728640,
    global_storage_limit_bytes = 15728640
where id = 1;

select throws_ok(
  $$
    update public.blob_objects
    set object_key = object_key || '/changed'
    where id = 'b6000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'STORAGE_ACCOUNTING_KEY_IMMUTABLE',
  'a retained Evidence object key is immutable'
);

select throws_ok(
  $$
    insert into public.export_object_cleanup_queue(
      object_key, household_id, snapshot_id, file_name,
      mime_type, byte_size, checksum_sha256
    ) values (
      'b2000000-0000-4000-8000-000000000001/export/fixture.json',
      'b2000000-0000-4000-8000-000000000001',
      'b8000000-0000-4000-8000-000000000001',
      'fixture.json', 'application/json', 5242880, repeat('2', 64)
    )
  $$,
  'P0001',
  'STORAGE_POINTER_DOUBLE_COUNT',
  'an export cannot be represented by active and cleanup pointers together'
);

update public.blob_objects
set intent_expires_at = now() - interval '1 minute',
    provider_delete_not_before = now() - interval '1 minute'
where id = 'b6000000-0000-4000-8000-000000000001';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.enqueue_blob_object_cleanup(1, interval '24 hours'),
  1,
  'expired Evidence reservation moves into cleanup'
);
select is(
  (
    public.read_backend_readiness_summary()
      #>> '{storage,counterRetainedBytes}'
  )::bigint,
  15728640::bigint,
  'active-to-cleanup handoff preserves the global retained-byte count'
);
select is(
  (
    select retained_bytes
    from public.household_storage_usage
    where household_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  15728640::bigint,
  'active-to-cleanup handoff preserves the household retained-byte count'
);

select is(
  (public.read_backend_readiness_summary() #>> '{storage,counterMatchesSource}')::boolean,
  true,
  'readiness recomputation agrees with retained-byte counters'
);
select is(
  (public.read_backend_readiness_summary() #>> '{storage,counterRetainedBytes}')::bigint,
  15728640::bigint,
  'readiness reports the combined retained-byte total'
);
select ok(
  (public.read_backend_readiness_summary() #> '{storage}') ? 'householdsAt85Percent',
  'readiness exposes the 85-percent saturation signal'
);
select ok(
  not (public.read_backend_readiness_summary()::text ~
    'storage-one@example|fixture\\.json|b2000000-0000-4000-8000-000000000001'),
  'readiness emits no email, filename, or household identifier'
);

reset role;

select throws_ok(
  $$
    update public.launch_enrollment_controls
    set global_storage_limit_bytes = 15728639
    where id = 1
  $$,
  'P0001',
  'GLOBAL_STORAGE_LIMIT_BELOW_USAGE',
  'operator cannot configure a global ceiling below retained bytes'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'api_rate_limit_buckets_expiry'
  ),
  'rate-limit retention has an expiry index'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'export_snapshots_global_expiry'
  ),
  'global export retention has an expiry index'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'sync_household_state_compaction_due'
  ),
  'fair sync maintenance has a due-order index'
);

select lives_ok(
  $$
    insert into public.export_object_cleanup_queue(
      object_key, household_id, snapshot_id, file_name,
      mime_type, byte_size, checksum_sha256
    ) values (
      'b2000000-0000-4000-8000-000000000001/export/untracked.json',
      'b2000000-0000-4000-8000-000000000001',
      'b8000000-0000-4000-8000-000000000099',
      'untracked.json', 'application/json', 1, repeat('9', 64)
    )
  $$,
  'a failed provider deletion can always persist its cleanup pointer'
);
select is(
  (
    public.read_backend_readiness_summary()
      #>> '{storage,counterRetainedBytes}'
  )::bigint,
  15728641::bigint,
  'cleanup overflow remains visible in exact global accounting'
);
select is(
  (
    public.read_backend_readiness_summary()
      #>> '{storage,globalOverLimit}'
  )::boolean,
  true,
  'readiness explicitly signals cleanup-driven global overflow'
);

update public.blob_objects
set provider_delete_not_before = now() + interval '1 hour'
where id = 'b6000000-0000-4000-8000-000000000001';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select throws_ok(
  $$
    select public.delete_account_domain_data(
      'b1000000-0000-4000-8000-000000000001',
      '[{
        "membershipId":"b3000000-0000-4000-8000-000000000001",
        "householdId":"b2000000-0000-4000-8000-000000000001",
        "role":"owner",
        "status":"active"
      }]'::jsonb
    )
  $$,
  '40001',
  'STORAGE_UPLOAD_AUTHORIZATION_ACTIVE',
  'account deletion waits while a disclosed signed PUT can recreate the object'
);

reset role;

select is(
  (
    select count(*)
    from public.households
    where id = 'b2000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'provider-lease rejection leaves the household intact'
);
select is(
  (
    select count(*)
    from public.memberships
    where id = 'b3000000-0000-4000-8000-000000000001'
      and status = 'active'
  ),
  1::bigint,
  'provider-lease rejection leaves the membership intact'
);
select is(
  (
    select count(*)
    from public.blob_objects
    where id = 'b6000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'provider-lease rejection leaves the Blob pointer intact'
);
select is(
  (
    select count(*)
    from public.account_deletion_jobs
    where account_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'provider-lease rejection creates no partial deletion job'
);

update public.blob_objects
set provider_delete_not_before = now() - interval '1 minute'
where id = 'b6000000-0000-4000-8000-000000000001';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select lives_ok(
  $$
    select public.delete_account_domain_data(
      'b1000000-0000-4000-8000-000000000001',
      '[{
        "membershipId":"b3000000-0000-4000-8000-000000000001",
        "householdId":"b2000000-0000-4000-8000-000000000001",
        "role":"owner",
        "status":"active"
      }]'::jsonb
    )
  $$,
  'account deletion cascades a household with retained Blob and export bytes'
);

reset role;

set constraints account_deletion_storage_holds_account_id_fkey immediate;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  (
    public.read_backend_readiness_summary()
      #>> '{storage,counterRetainedBytes}'
  )::bigint,
  15728641::bigint,
  'over-limit provider-pending bytes transfer without changing the global counter'
);
select is(
  (
    public.read_backend_readiness_summary()
      #>> '{storage,accountDeletionHoldBytes}'
  )::bigint,
  15728641::bigint,
  'the durable account deletion hold owns the over-limit transferred byte total'
);
select is(
  (
    public.read_backend_readiness_summary()
      #>> '{storage,accountDeletionHoldMatchesObjects}'
  )::boolean,
  true,
  'the deletion hold total exactly matches its durable provider-object ledger'
);

reset role;

select results_eq(
  $$
    select concat_ws(
      ':',
      cardinality(object_keys),
      cardinality(export_object_keys)
    )
    from public.account_deletion_jobs
    where account_id = 'b1000000-0000-4000-8000-000000000001'
  $$,
  array['1:2'::text],
  'the retry job preserves Blob-cleanup and both export provider pointers'
);
select is(
  (
    select count(*)
    from public.household_storage_usage
    where household_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'the household cascade removes its private usage row'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select lives_ok(
  $$
    select public.release_account_deletion_storage_hold(
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  'provider acknowledgement releases the byte hold before identity deletion'
);

reset role;

select is(
  (
    select count(*)
    from public.account_deletion_jobs
    where account_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the identity-deletion retry job remains after provider-byte release'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  (
    public.read_backend_readiness_summary()
      #>> '{storage,counterRetainedBytes}'
  )::bigint,
  0::bigint,
  'confirmed provider cleanup releases the global account-deletion hold'
);

reset role;

delete from public.account_deletion_jobs
where account_id = 'b1000000-0000-4000-8000-000000000001';

select * from finish();

rollback;
