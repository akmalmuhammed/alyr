begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'household-retry@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'household-transferee@example.test',
    '',
    now(),
    now(),
    now()
  );

insert into public.pilot_enrollments (
  user_id, enabled, max_households, note
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    true,
    3,
    'Multi-household idempotency test'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    true,
    0,
    'Ownership-transfer recipient'
  );

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

create temporary table first_household as
select (
  public.create_household(
    'Rahman household',
    '92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001'
  )
).*;

select results_eq(
  $$ select id from first_household $$,
  $$
    select (
      public.create_household(
        'Rahman household',
        '92000000-0000-4000-8000-000000000001',
        '93000000-0000-4000-8000-000000000001'
      )
    ).id
  $$,
  'the same operation replays its committed household receipt'
);

select results_eq(
  $$ select id from first_household $$,
  $$
    select (
      public.create_household(
        'Recovered draft name',
        '92000000-0000-4000-8000-000000000002',
        '93000000-0000-4000-8000-000000000001'
      )
    ).id
  $$,
  'a new operation recovers only its explicit household UUID'
);

select results_eq(
  $$
    select count(*)
    from public.households
    where created_by = '91000000-0000-4000-8000-000000000001'
  $$,
  array[1::bigint],
  'same-household replay creates no duplicate'
);

select throws_ok(
  $$
    select public.create_household(
      'Different request',
      '92000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'one operation identity cannot be reused with another name'
);

select lives_ok(
  $$
    select public.complete_household_onboarding(
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'the recovered household completes onboarding normally'
);

select results_eq(
  $$
    select onboarding_completed_at is not null
    from public.households
    where id = '93000000-0000-4000-8000-000000000001'
  $$,
  array[true],
  'onboarding completion is stored on the household'
);

create temporary table second_household as
select (
  public.create_household(
    'Second household',
    '92000000-0000-4000-8000-000000000010',
    '93000000-0000-4000-8000-000000000002'
  )
).*;

select results_eq(
  $$ select id from second_household $$,
  $$ values ('93000000-0000-4000-8000-000000000002'::uuid) $$,
  'an enrollment with max_households greater than one creates a second UUID'
);

select results_eq(
  $$
    select onboarding_completed_at is null
    from public.households
    where id = '93000000-0000-4000-8000-000000000002'
  $$,
  array[true],
  'the second household does not inherit the first household onboarding state'
);

select results_eq(
  $$ select id from first_household $$,
  $$
    select (
      public.create_household(
        'Return to first',
        '92000000-0000-4000-8000-000000000003',
        '93000000-0000-4000-8000-000000000001'
      )
    ).id
  $$,
  'cross-operation recovery selects the requested first household, not the active second'
);

reset role;
select results_eq(
  $$
    select
      raw_app_meta_data->>'active_household_id',
      (raw_app_meta_data->>'onboarding_complete')::boolean
    from auth.users
    where id = '91000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '93000000-0000-4000-8000-000000000001'::text,
      true
    )
  $$,
  'provider routing is rebuilt from the requested household onboarding state'
);
set local role authenticated;

select lives_ok(
  $$
    select public.create_household(
      'Alias 4',
      '92000000-0000-4000-8000-000000000004',
      '93000000-0000-4000-8000-000000000001'
    );
    select public.create_household(
      'Alias 5',
      '92000000-0000-4000-8000-000000000005',
      '93000000-0000-4000-8000-000000000001'
    );
    select public.create_household(
      'Alias 6',
      '92000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000001'
    );
    select public.create_household(
      'Alias 7',
      '92000000-0000-4000-8000-000000000007',
      '93000000-0000-4000-8000-000000000001'
    );
    select public.create_household(
      'Alias 8',
      '92000000-0000-4000-8000-000000000008',
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'the bounded receipt ledger accepts eight actor-household operations'
);

select throws_ok(
  $$
    select public.create_household(
      'Alias 9',
      '92000000-0000-4000-8000-000000000009',
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'HOUSEHOLD_OPERATION_LIMIT',
  'a ninth current receipt is throttled'
);

reset role;
update public.household_creation_operations
set created_at = now() - interval '31 days'
where operation_id = '92000000-0000-4000-8000-000000000002';
set local role authenticated;

select lives_ok(
  $$
    select public.create_household(
      'Alias after retention',
      '92000000-0000-4000-8000-000000000009',
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'retention cleanup opens one bounded receipt slot'
);

reset role;
select results_eq(
  $$
    select count(*)
    from public.household_creation_operations
    where user_id = '91000000-0000-4000-8000-000000000001'
      and household_id = '93000000-0000-4000-8000-000000000001'
  $$,
  array[8::bigint],
  'cleanup and insertion retain exactly eight actor-household receipts'
);

select results_eq(
  $$
    select count(*)
    from public.household_creation_operations
    where operation_id = '92000000-0000-4000-8000-000000000002'
  $$,
  array[0::bigint],
  'the expired receipt is removed'
);

insert into public.memberships (
  id, household_id, user_id, role
)
values (
  '94000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  'editor'
);
set local role authenticated;

select lives_ok(
  $$
    select public.transfer_household_ownership(
      '93000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000002',
      1,
      1,
      '95000000-0000-4000-8000-000000000001'
    )
  $$,
  'ownership transfers through the reviewed owner operation'
);

select throws_ok(
  $$
    select public.create_household(
      'Former owner retry',
      '92000000-0000-4000-8000-000000000011',
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'HOUSEHOLD_RECOVERY_DENIED',
  'the former owner cannot recover the transferred household'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000002';
select throws_ok(
  $$
    select public.create_household(
      'New owner retry',
      '92000000-0000-4000-8000-000000000012',
      '93000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'HOUSEHOLD_RECOVERY_DENIED',
  'the transferee cannot claim a creation receipt they did not originate'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select lives_ok(
  $$
    select public.create_household(
      'Third household',
      '92000000-0000-4000-8000-000000000020',
      '93000000-0000-4000-8000-000000000003'
    )
  $$,
  'a fresh UUID creates the third specifically requested household'
);

select results_eq(
  $$
    select count(*)
    from public.households
    where created_by = '91000000-0000-4000-8000-000000000001'
  $$,
  array[3::bigint],
  'multi-household creation remains bounded by the enrollment quota'
);

select throws_ok(
  $$
    select public.create_household(
      'Fourth household',
      '92000000-0000-4000-8000-000000000021',
      '93000000-0000-4000-8000-000000000004'
    )
  $$,
  'P0001',
  'PILOT_HOUSEHOLD_LIMIT',
  'a fourth UUID is rejected at the enrolled quota'
);

reset role;
select results_eq(
  $$
    select count(*)
    from public.audit_events
    where event_name = 'household.created'
      and actor_id = '91000000-0000-4000-8000-000000000001'
  $$,
  array[3::bigint],
  'receipt replay and cleanup do not duplicate creation audit events'
);

select * from finish();
rollback;
