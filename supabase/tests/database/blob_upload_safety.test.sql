begin;

create extension if not exists pgtap with schema extensions;

select plan(59);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'upload-owner-one@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'upload-owner-two@example.test',
    '',
    now(),
    now(),
    now()
  );

insert into public.households (id, name, created_by)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'Upload safety household one',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'Upload safety household two',
    'a1000000-0000-4000-8000-000000000002'
  );

insert into public.memberships (id, household_id, user_id, role)
values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    'owner'
  );

insert into public.places (
  id, household_id, name, kind, tenure, created_by
)
values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'Documented property',
  'property',
  'owned',
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.assets (
  id, household_id, name, category_id, created_by
)
values
  (
    'a5000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'Household one asset',
    'other',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a5000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002',
    'Household two quota asset',
    'other',
    'a1000000-0000-4000-8000-000000000002'
  );

insert into public.evidence (
  id, household_id, asset_id, place_id, kind, relation, title,
  storage_state, created_by, deleted_at
)
values
  (
    'a6000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    null,
    'media',
    'identity',
    'Active Asset Evidence',
    'queued',
    'a1000000-0000-4000-8000-000000000001',
    null
  ),
  (
    'a6000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    null,
    'a4000000-0000-4000-8000-000000000001',
    'paper',
    'ownership',
    'Active Place Document',
    'queued',
    'a1000000-0000-4000-8000-000000000001',
    null
  ),
  (
    'a6000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000002',
    null,
    'media',
    'identity',
    'Household two Evidence',
    'queued',
    'a1000000-0000-4000-8000-000000000002',
    null
  ),
  (
    'a6000000-0000-4000-8000-000000000004',
    'a2000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    null,
    'paper',
    'other',
    'Deleted Evidence',
    'queued',
    'a1000000-0000-4000-8000-000000000001',
    now()
  );

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.blob_object_cleanup_queue'::regclass
  ),
  'blob cleanup pointers have forced RLS'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.blob_objects'::regclass
      and conname = 'blob_objects_expected_evidence_parent'
      and convalidated
  ),
  'BlobObjects have a validated household-and-Evidence parent constraint'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.blob_object_cleanup_queue',
    'SELECT'
  ),
  'authenticated clients cannot enumerate cleanup pointers'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.blob_object_cleanup_queue',
    'SELECT'
  ),
  'the service worker can read cleanup pointers'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.enqueue_blob_object_cleanup(integer,interval)',
    'EXECUTE'
  ),
  'authenticated clients cannot enqueue cleanup work'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_blob_object_cleanup(integer,interval)',
    'EXECUTE'
  ),
  'the service worker can enqueue cleanup work'
);

select ok(
  position(
    'heldat.blob-intent:'
    in lower(
      pg_get_functiondef(
        'public.create_blob_upload_intent(uuid,uuid,uuid,uuid,text,text,bigint,text)'::regprocedure
      )
    )
  ) < position(
    'from public.blob_objects'
    in lower(
      pg_get_functiondef(
        'public.create_blob_upload_intent(uuid,uuid,uuid,uuid,text,text,bigint,text)'::regprocedure
      )
    )
  ),
  'a Blob-scoped lock precedes the existing-row lock for retry safety'
);

select ok(
  position(
    'sum('
    in lower(
      pg_get_functiondef(
        'public.create_blob_upload_intent(uuid,uuid,uuid,uuid,text,text,bigint,text)'::regprocedure
      )
    )
  ) = 0
  and position(
    'blob_object_cleanup_queue'
    in pg_get_functiondef(
      'public.track_retained_storage_bytes()'::regprocedure
    )
  ) > 0,
  'constant-time accounting keeps cleanup bytes in the shared reservation quota'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000010',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000099',
      'a8100000-0000-4000-8000-000000000010',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000010/a8100000-0000-4000-8000-000000000010',
      repeat('1', 64),
      1,
      'text/plain'
    )
  $$,
  'P0001',
  'EVIDENCE_PARENT_NOT_FOUND',
  'a missing Evidence parent cannot reserve bytes'
);

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000011',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000003',
      'a8100000-0000-4000-8000-000000000011',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000011/a8100000-0000-4000-8000-000000000011',
      repeat('1', 64),
      1,
      'text/plain'
    )
  $$,
  'P0001',
  'EVIDENCE_PARENT_NOT_FOUND',
  'cross-household Evidence cannot reserve bytes'
);

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000012',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000004',
      'a8100000-0000-4000-8000-000000000012',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000012/a8100000-0000-4000-8000-000000000012',
      repeat('1', 64),
      1,
      'text/plain'
    )
  $$,
  'P0001',
  'EVIDENCE_PARENT_NOT_FOUND',
  'soft-deleted Evidence cannot reserve bytes'
);

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000002',
      'a8100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000001/a8100000-0000-4000-8000-000000000001',
      repeat('a', 64),
      1,
      'text/plain'
    )
  $$,
  'an active Place Document can reserve bytes'
);

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000002',
      'a8100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000001/a8100000-0000-4000-8000-000000000001',
      repeat('a', 64),
      1,
      'text/plain'
    )
  $$,
  'an exact active retry renews the same reservation'
);

reset role;

select is(
  (
    select count(*)
    from public.blob_objects
    where id = 'a7100000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'an exact retry leaves one BlobObject'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000002',
      'a8100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000001/a8100000-0000-4000-8000-000000000001',
      repeat('b', 64),
      1,
      'text/plain'
    )
  $$,
  'P0001',
  'UPLOAD_INTENT_CONFLICT',
  'a retry cannot change immutable upload metadata'
);

reset role;

update public.blob_objects
set intent_expires_at = now() - interval '1 minute'
where id = 'a7100000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000002',
      'a8100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000001/a8100000-0000-4000-8000-000000000001',
      repeat('a', 64),
      1,
      'text/plain'
    )
  $$,
  'P0001',
  'UPLOAD_INTENT_EXPIRED',
  'an expired reservation is not reactivated'
);

reset role;

select ok(
  (
    select intent_expires_at <= now()
      and status = 'upload-intent'
      and deleted_at is null
    from public.blob_objects
    where id = 'a7100000-0000-4000-8000-000000000001'
  ),
  'a rejected expired retry does not mutate the reservation'
);

set local role service_role;

select throws_ok(
  $$
    select public.mark_blob_stored(
      'a7100000-0000-4000-8000-000000000001',
      repeat('a', 64),
      1,
      'a1000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'UPLOAD_INTENT_EXPIRED',
  'verification cannot promote an expired reservation'
);

select throws_ok(
  $$
    select public.enqueue_blob_object_cleanup(0, interval '24 hours')
  $$,
  'P0001',
  'INVALID_CLEANUP_LIMIT',
  'cleanup enqueue rejects an unbounded or empty batch'
);

select is(
  public.enqueue_blob_object_cleanup(1, interval '24 hours'),
  1::integer,
  'one expired reservation is enqueued by a bounded pass'
);

select is(
  (
    select reason
    from public.blob_object_cleanup_queue
    where blob_object_id = 'a7100000-0000-4000-8000-000000000001'
  ),
  'expired-intent'::text,
  'the cleanup pointer records the expired-intent reason'
);

select throws_ok(
  $$
    select * from public.claim_blob_object_cleanup(101, interval '5 minutes')
  $$,
  'P0001',
  'INVALID_CLEANUP_LIMIT',
  'cleanup claims are capped at one hundred pointers'
);

select is(
  (
    select count(*)
    from public.claim_blob_object_cleanup(1, interval '5 minutes')
  ),
  1::bigint,
  'a worker claims one cleanup pointer'
);

select ok(
  (
    select claim_token is not null
      and claimed_at is not null
      and attempt_count = 1
    from public.blob_object_cleanup_queue
    where blob_object_id = 'a7100000-0000-4000-8000-000000000001'
  ),
  'claim metadata prevents duplicate concurrent delivery'
);

select is(
  public.release_blob_object_cleanup(
    'a7100000-0000-4000-8000-000000000001',
    (
      select claim_token
      from public.blob_object_cleanup_queue
      where blob_object_id = 'a7100000-0000-4000-8000-000000000001'
    ),
    'STORAGE_RETRY',
    interval '1 hour'
  ),
  true,
  'a failed deletion preserves and delays the pointer'
);

select is(
  (
    select count(*)
    from public.claim_blob_object_cleanup(1, interval '5 minutes')
  ),
  0::bigint,
  'a delayed pointer is not immediately redelivered'
);

update public.blob_object_cleanup_queue
set available_at = now()
where blob_object_id = 'a7100000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)
    from public.claim_blob_object_cleanup(1, interval '5 minutes')
  ),
  1::bigint,
  'a released pointer becomes claimable when its delay elapses'
);

select is(
  public.complete_blob_object_cleanup(
    'a7100000-0000-4000-8000-000000000001',
    (
      select claim_token
      from public.blob_object_cleanup_queue
      where blob_object_id = 'a7100000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'verified Storage deletion removes the BlobObject and pointer'
);

select is(
  public.complete_blob_object_cleanup(
    'a7100000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000001'
  ),
  true,
  'cleanup acknowledgement is idempotent after a lost response'
);

reset role;

select is(
  (
    select count(*)
    from public.blob_objects
    where id = 'a7100000-0000-4000-8000-000000000001'
  ) + (
    select count(*)
    from public.blob_object_cleanup_queue
    where blob_object_id = 'a7100000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'completed cleanup leaves no database pointer'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000001',
      'a8100000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000002/a8100000-0000-4000-8000-000000000002',
      repeat('c', 64),
      1,
      'text/plain'
    )
  $$,
  'an active Asset Evidence parent can reserve bytes'
);

set local role service_role;

select lives_ok(
  $$
    select public.mark_blob_stored(
      'a7100000-0000-4000-8000-000000000002',
      repeat('c', 64),
      1,
      'a1000000-0000-4000-8000-000000000001'
    )
  $$,
  'verification stores a matching active intent'
);

reset role;

update public.blob_objects
set updated_at = now() - interval '2 hours'
where id = 'a7100000-0000-4000-8000-000000000002';

set local role service_role;

select is(
  public.enqueue_blob_object_cleanup(1, interval '1 hour'),
  1::integer,
  'an unattached stored object is enqueued after its grace period'
);

select is(
  (
    select reason
    from public.blob_object_cleanup_queue
    where blob_object_id = 'a7100000-0000-4000-8000-000000000002'
  ),
  'unattached-stored'::text,
  'the cleanup pointer distinguishes a stored orphan'
);

select is(
  (
    select count(*)
    from public.claim_blob_object_cleanup(1, interval '5 minutes')
  ),
  1::bigint,
  'the stored orphan can be claimed'
);

select is(
  public.complete_blob_object_cleanup(
    'a7100000-0000-4000-8000-000000000002',
    (
      select claim_token
      from public.blob_object_cleanup_queue
      where blob_object_id = 'a7100000-0000-4000-8000-000000000002'
    )
  ),
  true,
  'the stored orphan is removed only after worker acknowledgement'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'a7100000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000001',
      'a8100000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000003/a8100000-0000-4000-8000-000000000003',
      repeat('d', 64),
      1,
      'text/plain'
    )
  $$,
  'a second Asset Evidence version can reserve bytes'
);

set local role service_role;

select lives_ok(
  $$
    select public.mark_blob_stored(
      'a7100000-0000-4000-8000-000000000003',
      repeat('d', 64),
      1,
      'a1000000-0000-4000-8000-000000000001'
    )
  $$,
  'the second Asset Evidence object is stored'
);

reset role;

insert into public.evidence_versions(
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
  'a8100000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000003',
  1,
  'retained.txt',
  'text/plain',
  1,
  repeat('d', 64),
  'a1000000-0000-4000-8000-000000000001'
);

update public.blob_objects
set updated_at = now() - interval '2 hours'
where id = 'a7100000-0000-4000-8000-000000000003';

set local role service_role;

select is(
  public.enqueue_blob_object_cleanup(1, interval '1 hour'),
  0::integer,
  'a stored object referenced by an EvidenceVersion is not enqueued'
);

reset role;

select is(
  (
    select status
    from public.blob_objects
    where id = 'a7100000-0000-4000-8000-000000000003'
  ),
  'stored'::public.blob_status,
  'referenced immutable bytes remain stored'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000001/b8100000-0000-4000-8000-000000000001',
      repeat('1', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'the first ten-MiB reservation succeeds'
);

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000002/b8100000-0000-4000-8000-000000000002',
      repeat('2', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'the second ten-MiB reservation succeeds'
);

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000003/b8100000-0000-4000-8000-000000000003',
      repeat('3', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'the third ten-MiB reservation succeeds'
);

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000004',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000004',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000004/b8100000-0000-4000-8000-000000000004',
      repeat('4', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'the fourth ten-MiB reservation reaches the household cap'
);

reset role;

select is(
  (
    select sum(byte_size)
    from public.blob_objects
    where household_id = 'a2000000-0000-4000-8000-000000000002'
      and deleted_at is null
  ),
  41943040::numeric,
  'four serialized reservations consume exactly forty MiB'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000006',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000006',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000006/b8100000-0000-4000-8000-000000000006',
      repeat('6', 64),
      1,
      'text/plain'
    )
  $$,
  'P0001',
  'HOUSEHOLD_STORAGE_LIMIT',
  'a concurrent-style reservation beyond the serialized cap is rejected'
);

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000001/b8100000-0000-4000-8000-000000000001',
      repeat('1', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'an exact retry at the cap does not double-count its own bytes'
);

reset role;

update public.blob_objects
set intent_expires_at = now() - interval '1 minute'
where id = 'b7100000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000001/b8100000-0000-4000-8000-000000000001',
      repeat('1', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'P0001',
  'UPLOAD_INTENT_EXPIRED',
  'an expired ten-MiB reservation cannot bypass quota by renewal'
);

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000005',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000005',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000005/b8100000-0000-4000-8000-000000000005',
      repeat('5', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'P0001',
  'HOUSEHOLD_STORAGE_LIMIT',
  'a fresh blob ID cannot reuse capacity before expired bytes are cleaned'
);

set local role service_role;

select is(
  public.enqueue_blob_object_cleanup(1, interval '24 hours'),
  1::integer,
  'the expired ten-MiB pointer enters cleanup'
);

select is(
  (
    select sum(byte_size)
    from public.blob_object_cleanup_queue
    where household_id = 'a2000000-0000-4000-8000-000000000002'
  ),
  10485760::numeric,
  'pending physical deletion retains ten MiB of quota'
);

reset role;

-- The accounting trigger makes legacy over-quota state unrepresentable.
select throws_ok(
  $$
    insert into public.blob_objects(
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
      'b7100000-0000-4000-8000-000000000009',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000009',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000009/b8100000-0000-4000-8000-000000000009',
      repeat('9', 64),
      1,
      'text/plain',
      'stored',
      'a1000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  'HOUSEHOLD_STORAGE_LIMIT',
  'direct writes cannot create a one-byte over-quota object'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000002/b8100000-0000-4000-8000-000000000002',
      repeat('2', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'an exact active retry at the cap does not consume retained bytes twice'
);

reset role;

set local role service_role;

select is(
  (
    select count(*)
    from public.claim_blob_object_cleanup(1, interval '5 minutes')
  ),
  1::bigint,
  'the expired quota pointer is claimed once'
);

select is(
  public.complete_blob_object_cleanup(
    'b7100000-0000-4000-8000-000000000001',
    (
      select claim_token
      from public.blob_object_cleanup_queue
      where blob_object_id = 'b7100000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'verified deletion releases retained quota'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000005',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000005',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000005/b8100000-0000-4000-8000-000000000005',
      repeat('5', 64),
      10485760,
      'application/pdf'
    )
  $$,
  'fresh capacity becomes available only after physical cleanup is acknowledged'
);

select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'b7100000-0000-4000-8000-000000000006',
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003',
      'b8100000-0000-4000-8000-000000000006',
      'a2000000-0000-4000-8000-000000000002/b7100000-0000-4000-8000-000000000006/b8100000-0000-4000-8000-000000000006',
      repeat('6', 64),
      1,
      'text/plain'
    )
  $$,
  'P0001',
  'HOUSEHOLD_STORAGE_LIMIT',
  'the household remains capped at forty MiB after cleanup'
);

reset role;

select is(
  (
    select sum(byte_size)
    from public.blob_objects
    where household_id = 'a2000000-0000-4000-8000-000000000002'
      and deleted_at is null
      and status = 'upload-intent'
      and intent_expires_at > now()
  ),
  41943040::numeric,
  'the active quota remains exactly forty MiB'
);

select is(
  (
    select count(*)
    from public.blob_object_cleanup_queue
    where household_id = 'a2000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'the completed quota cleanup leaves no pending pointer'
);

select * from finish();

rollback;
