begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_table(
  'public',
  'liabilities',
  'Liabilities are first-class cloud records'
);

select has_table(
  'public',
  'liability_reviews',
  'No-liability confirmation is a dated cloud record'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_liability_sync_operation(jsonb)',
    'EXECUTE'
  ),
  'clients cannot bypass the reviewed sync dispatcher'
);

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
    'liability-owner@example.test',
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
    'liability-editor@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'liability-viewer@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'liability-outsider@example.test',
    '',
    now(),
    now(),
    now()
  );

insert into public.households (id, name, created_by)
values (
  '21000000-0000-4000-8000-000000000001',
  'Liability privacy household',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.memberships (
  id, household_id, user_id, role
)
values
  (
    '31000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002',
    'editor'
  ),
  (
    '31000000-0000-4000-8000-000000000003',
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000003',
    'viewer'
  );

insert into public.assets (
  id, household_id, name, category_id, category_path, created_by
)
values (
  '41000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Visible asset',
  'other',
  array['other'],
  '11000000-0000-4000-8000-000000000001'
);

insert into public.asset_value_assertions (
  id, household_id, asset_id, amount_minor, currency, as_of, created_by
)
values (
  '51000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  500000,
  'QAR',
  current_date,
  '11000000-0000-4000-8000-000000000001'
);

-- A harmless Asset operation proves the filtered sync cursor still advances
-- across hidden Liability entries for non-owner household members.
insert into public.sync_operations (
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
  '61000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'visible-asset-operation',
  repeat('a', 64),
  '11000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'asset',
  '41000000-0000-4000-8000-000000000001',
  1,
  'asset.update',
  '{"name":"Visible asset"}'::jsonb,
  now(),
  'applied',
  '{"entityVersion":2}'::jsonb
);

create function pg_temp.liability_operation(
  p_operation_id uuid,
  p_idempotency_key text,
  p_type text,
  p_aggregate_id uuid,
  p_observed_version integer,
  p_payload jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'operationVersion', 1,
    'operationId', p_operation_id,
    'householdId', '21000000-0000-4000-8000-000000000001',
    'command', jsonb_build_object(
      'commandVersion', 1,
      'commandId', p_operation_id,
      'idempotencyKey', p_idempotency_key,
      'householdId', '21000000-0000-4000-8000-000000000001',
      'actorMemberId', '31000000-0000-4000-8000-000000000001',
      'deviceId', '71000000-0000-4000-8000-000000000001',
      'type', p_type,
      'aggregateId', p_aggregate_id,
      'observedVersion', p_observed_version,
      'occurredAt', now(),
      'payload', p_payload
    )
  )
$$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.apply_sync_operation(
      pg_temp.liability_operation(
        '61000000-0000-4000-8000-000000000002',
        'liability-create-operation',
        'liability.create',
        '81000000-0000-4000-8000-000000000001',
        0,
        '{"name":"Home mortgage","kind":"mortgage"}'::jsonb
      )
    )
  $$,
  'owner creates a Liability through the public sync boundary'
);

select is(
  (
    public.apply_sync_operation(
      pg_temp.liability_operation(
        '61000000-0000-4000-8000-000000000002',
        'liability-create-operation',
        'liability.create',
        '81000000-0000-4000-8000-000000000001',
        0,
        '{"name":"Home mortgage","kind":"mortgage"}'::jsonb
      )
    )->>'idempotent'
  )::boolean,
  true,
  'exact Liability retries acknowledge without duplicating the master'
);

reset role;

select throws_ok(
  $$
    insert into public.asset_value_assertions (
      id,
      household_id,
      asset_id,
      liability_id,
      amount_minor,
      currency,
      as_of,
      created_by
    )
    values (
      '51000000-0000-4000-8000-000000000099',
      '21000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000001',
      1,
      'QAR',
      current_date,
      '11000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  'new row for relation "asset_value_assertions" violates check constraint "asset_value_assertions_value_subject_check"',
  'a dated value cannot alias both an Asset and a Liability'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select lives_ok(
  format(
    $operation$
      select public.apply_sync_operation(
        pg_temp.liability_operation(
          '61000000-0000-4000-8000-000000000003',
          'liability-value-create-operation',
          'value.create',
          '51000000-0000-4000-8000-000000000002',
          0,
          %L::jsonb
        )
      )
    $operation$,
    jsonb_build_object(
      'liabilityId', '81000000-0000-4000-8000-000000000001',
      'amountMinor', 1250000,
      'currency', 'QAR',
      'asOf', to_char(current_date, 'YYYY-MM-DD'),
      'source', 'user-entered'
    )::text
  ),
  'owner records a dated Liability balance'
);

select throws_ok(
  format(
    $operation$
      select public.apply_sync_operation(
        pg_temp.liability_operation(
          '61000000-0000-4000-8000-000000000004',
          'liability-value-stale-operation',
          'value.update',
          '51000000-0000-4000-8000-000000000002',
          0,
          %L::jsonb
        )
      )
    $operation$,
    jsonb_build_object(
      'liabilityId', '81000000-0000-4000-8000-000000000001',
      'amountMinor', 1200000,
      'currency', 'QAR',
      'asOf', to_char(current_date, 'YYYY-MM-DD'),
      'source', 'user-entered'
    )::text
  ),
  'P0001',
  'VERSION_CONFLICT',
  'a stale Liability balance update requires visible conflict resolution'
);

select throws_ok(
  format(
    $operation$
      select public.apply_sync_operation(
        pg_temp.liability_operation(
          '61000000-0000-4000-8000-000000000005',
          'liability-review-active-conflict',
          'liability-review.set',
          '91000000-0000-4000-8000-000000000001',
          0,
          %L::jsonb
        )
      )
    $operation$,
    jsonb_build_object(
      'status', 'none-confirmed',
      'reviewedAt', to_char(current_date, 'YYYY-MM-DD'),
      'expiresAt', to_char(current_date + 90, 'YYYY-MM-DD')
    )::text
  ),
  'P0001',
  'LIABILITY_REVIEW_CONFLICT',
  'an active Liability cannot be silently represented as zero'
);

select lives_ok(
  format(
    $operation$
      select public.apply_sync_operation(
        pg_temp.liability_operation(
          '61000000-0000-4000-8000-000000000006',
          'liability-archive-operation',
          'liability.archive',
          '81000000-0000-4000-8000-000000000001',
          1,
          %L::jsonb
        )
      )
    $operation$,
    jsonb_build_object(
      'lifecycle', 'archived',
      'archivedAt', now()
    )::text
  ),
  'owner archives a Liability with observed-version protection'
);

select lives_ok(
  format(
    $operation$
      select public.apply_sync_operation(
        pg_temp.liability_operation(
          '61000000-0000-4000-8000-000000000007',
          'liability-review-create-operation',
          'liability-review.set',
          '91000000-0000-4000-8000-000000000001',
          0,
          %L::jsonb
        )
      )
    $operation$,
    jsonb_build_object(
      'status', 'none-confirmed',
      'reviewedAt', to_char(current_date, 'YYYY-MM-DD'),
      'expiresAt', to_char(current_date + 90, 'YYYY-MM-DD')
    )::text
  ),
  'owner records an explicit 90-day no-Liability review'
);

select throws_ok(
  format(
    $operation$
      select public.apply_sync_operation(
        pg_temp.liability_operation(
          '61000000-0000-4000-8000-000000000008',
          'liability-review-stale-operation',
          'liability-review.set',
          '91000000-0000-4000-8000-000000000001',
          0,
          %L::jsonb
        )
      )
    $operation$,
    jsonb_build_object(
      'status', 'none-confirmed',
      'reviewedAt', to_char(current_date, 'YYYY-MM-DD'),
      'expiresAt', to_char(current_date + 90, 'YYYY-MM-DD')
    )::text
  ),
  'P0001',
  'VERSION_CONFLICT',
  'a stale no-Liability review cannot overwrite its current version'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      pg_temp.liability_operation(
        '61000000-0000-4000-8000-000000000009',
        'liability-restore-operation',
        'liability.restore',
        '81000000-0000-4000-8000-000000000001',
        2,
        '{"lifecycle":"active","archivedAt":null}'::jsonb
      )
    )
  $$,
  'owner restores an archived Liability'
);

select results_eq(
  $$
    select invalidated_at is not null
    from public.liability_reviews
    where id = '91000000-0000-4000-8000-000000000001'
  $$,
  array[true],
  'later Liability activity invalidates the earlier no-Liability review'
);

select lives_ok(
  $$
    select public.apply_sync_operation(
      pg_temp.liability_operation(
        '61000000-0000-4000-8000-000000000010',
        'liability-delete-operation',
        'liability.delete',
        '81000000-0000-4000-8000-000000000001',
        3,
        '{"name":"Home mortgage","kind":"mortgage"}'::jsonb
      )
    )
  $$,
  'owner creates a versioned Liability tombstone'
);

select results_eq(
  $$
    select version
    from public.liabilities
    where id = '81000000-0000-4000-8000-000000000001'
      and deleted_at is not null
  $$,
  array[4],
  'Liability deletion preserves a version-four master tombstone'
);

select results_eq(
  $$
    select version
    from public.asset_value_assertions
    where id = '51000000-0000-4000-8000-000000000002'
      and deleted_at is not null
  $$,
  array[2],
  'Liability deletion preserves a versioned balance tombstone'
);

select lives_ok(
  format(
    $operation$
      select public.apply_sync_operation(
        pg_temp.liability_operation(
          '61000000-0000-4000-8000-000000000012',
          'liability-review-reconfirm-operation',
          'liability-review.set',
          '91000000-0000-4000-8000-000000000001',
          1,
          %L::jsonb
        )
      )
    $operation$,
    jsonb_build_object(
      'status', 'none-confirmed',
      'reviewedAt', to_char(current_date, 'YYYY-MM-DD'),
      'expiresAt', to_char(current_date + 90, 'YYYY-MM-DD')
    )::text
  ),
  'owner can explicitly re-confirm using the retained review identity'
);

select results_eq(
  $$
    select version, invalidated_at is null
    from public.liability_reviews
    where id = '91000000-0000-4000-8000-000000000001'
  $$,
  $$ values (2, true) $$,
  're-confirmation advances the review version and restores validity'
);

select results_eq(
  $$
    select count(*)
    from public.pull_sync_operations(
      '21000000-0000-4000-8000-000000000001',
      0,
      250
    )
    where command like 'liability.%'
       or command = 'liability-review.set'
       or payload ? 'liabilityId'
  $$,
  array[7::bigint],
  'owner receives the complete Liability sync history'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000002';

select results_eq(
  'select count(*) from public.liabilities',
  array[0::bigint],
  'editor sees no Liability metadata or count'
);

select results_eq(
  'select count(*) from public.liability_reviews',
  array[0::bigint],
  'editor sees no Liability review activity'
);

select results_eq(
  'select count(*) from public.asset_value_assertions',
  array[1::bigint],
  'editor sees ordinary Asset values but no Liability balance history'
);

select results_eq(
  'select count(*) from public.sync_operations',
  array[1::bigint],
  'editor direct reads reveal only the non-Liability operation'
);

select results_eq(
  $$
    with response as (
      select public.pull_sync_batch(
        '21000000-0000-4000-8000-000000000001',
        0,
        250
      ) as body
    )
    select
      jsonb_array_length(body->'operations'),
      (body->>'nextCursor')::bigint
        > (body->'operations'->0->>'cursor')::bigint
    from response
  $$,
  $$ values (1, true) $$,
  'editor sync omits Liability entries and advances past the hidden tail'
);

select throws_ok(
  $$
    select public.apply_sync_operation(
      pg_temp.liability_operation(
        '61000000-0000-4000-8000-000000000011',
        'editor-liability-create-operation',
        'liability.create',
        '81000000-0000-4000-8000-000000000002',
        0,
        '{"name":"Hidden debt","kind":"other"}'::jsonb
      )
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'editor cannot mutate the owner-only Liability register'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000003';

select results_eq(
  'select count(*) from public.liabilities',
  array[0::bigint],
  'viewer sees no Liability metadata or count'
);

select results_eq(
  'select count(*) from public.asset_value_assertions',
  array[1::bigint],
  'viewer sees ordinary Asset values but no Liability balances'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000004';

select results_eq(
  $$
    select count(*)
    from public.pull_sync_operations(
      '21000000-0000-4000-8000-000000000001',
      0,
      250
    )
  $$,
  array[0::bigint],
  'outsider receives no Liability records, names, amounts or counts'
);

select * from finish();

rollback;
