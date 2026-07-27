begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at
)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'owner-family@example.test', '',
    now(), '{"full_name":"Amina Owner"}'::jsonb,
    '{
      "active_household_id":"21000000-0000-4000-8000-000000000001",
      "active_membership_id":"31000000-0000-4000-8000-000000000001",
      "active_household_role":"owner",
      "onboarding_complete":true
    }'::jsonb,
    now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'editor-family@example.test', '',
    now(), '{"full_name":"Omar Editor"}'::jsonb,
    '{
      "active_household_id":"21000000-0000-4000-8000-000000000001",
      "active_membership_id":"31000000-0000-4000-8000-000000000002",
      "active_household_role":"editor",
      "onboarding_complete":true
    }'::jsonb,
    now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'viewer-family@example.test', '',
    now(), '{"full_name":"Leila Viewer"}'::jsonb,
    '{
      "active_household_id":"21000000-0000-4000-8000-000000000001",
      "active_membership_id":"31000000-0000-4000-8000-000000000003",
      "active_household_role":"viewer",
      "onboarding_complete":true
    }'::jsonb,
    now(), now()
  );

insert into public.households (id, name, created_by)
values (
  '21000000-0000-4000-8000-000000000001',
  'Family administration household',
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

insert into public.invites (
  id, household_id, code_hash, role, expires_at, created_by
)
values (
  '71000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'viewer',
  now() + interval '7 days',
  '11000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select is(
  jsonb_array_length(
    public.household_access_snapshot(
      '21000000-0000-4000-8000-000000000001'
    )->'members'
  ),
  3,
  'owner refresh receives the complete active roster'
);

select is(
  jsonb_array_length(
    public.household_access_snapshot(
      '21000000-0000-4000-8000-000000000001'
    )->'pendingInvites'
  ),
  1,
  'owner refresh receives pending invitation metadata'
);

select ok(
  public.household_access_snapshot(
    '21000000-0000-4000-8000-000000000001'
  )::text like '%editor-family@example.test%',
  'owner can distinguish active household accounts'
);

select lives_ok(
  $$
    select public.change_household_member_role(
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      1,
      'viewer',
      '91000000-0000-4000-8000-000000000001'
    )
  $$,
  'owner changes a non-owner role with an observed version'
);

select results_eq(
  $$
    select role::text, version
    from public.memberships
    where id = '31000000-0000-4000-8000-000000000002'
  $$,
  $$ values ('viewer'::text, 2) $$,
  'role change advances the authoritative membership version'
);

select lives_ok(
  $$
    select public.change_household_member_role(
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      1,
      'viewer',
      '91000000-0000-4000-8000-000000000001'
    )
  $$,
  'an exact retry returns its acknowledged receipt'
);

reset role;

select results_eq(
  $$
    select count(*)
    from public.household_access_operations
    where operation_id = '91000000-0000-4000-8000-000000000001'
  $$,
  array[1::bigint],
  'an exact retry creates one durable operation'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.change_household_member_role(
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      2,
      'editor',
      '91000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'reusing an operation identity for different intent fails closed'
);

select lives_ok(
  $$
    select public.cancel_household_invite(
      '21000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      1,
      '91000000-0000-4000-8000-000000000002'
    )
  $$,
  'owner cancels a still-pending invitation'
);

select results_eq(
  $$
    select version, revoked_at is not null
    from public.invites
    where id = '71000000-0000-4000-8000-000000000001'
  $$,
  $$ values (2, true) $$,
  'invitation cancellation is versioned and immediate'
);

select lives_ok(
  $$
    select public.revoke_household_member(
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000003',
      1,
      '91000000-0000-4000-8000-000000000003'
    )
  $$,
  'owner revokes another active member'
);

select results_eq(
  $$
    select status::text, version, deleted_at is not null
    from public.memberships
    where id = '31000000-0000-4000-8000-000000000003'
  $$,
  $$ values ('revoked'::text, 2, true) $$,
  'revoked membership is tombstoned and versioned'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000003';

select throws_ok(
  $$
    select public.household_access_snapshot(
      '21000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'revoked account receives no roster response'
);

select results_eq(
  'select count(*) from public.households',
  array[0::bigint],
  'revoked account sees no household names or counts through RLS'
);

select results_eq(
  'select count(*) from public.memberships',
  array[0::bigint],
  'revoked account sees no member names or counts through RLS'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.revoke_household_member(
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      1,
      '91000000-0000-4000-8000-000000000004'
    )
  $$,
  'P0001',
  'SELF_REVOCATION_FORBIDDEN',
  'owner cannot revoke their own final owner membership'
);

select lives_ok(
  $$
    select public.transfer_household_ownership(
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      1,
      2,
      '91000000-0000-4000-8000-000000000005'
    )
  $$,
  'owner transfers ownership atomically to an active member'
);

select results_eq(
  $$
    select count(*)
    from public.memberships
    where household_id = '21000000-0000-4000-8000-000000000001'
      and role = 'owner'
      and status = 'active'
      and deleted_at is null
  $$,
  array[1::bigint],
  'transfer preserves exactly one active owner'
);

select results_eq(
  $$
    select role::text, version
    from public.memberships
    where id = '31000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('editor'::text, 2) $$,
  'previous owner becomes a versioned editor'
);

select results_eq(
  $$
    select role::text, version
    from public.memberships
    where id = '31000000-0000-4000-8000-000000000002'
  $$,
  $$ values ('owner'::text, 3) $$,
  'selected member becomes the versioned owner'
);

reset role;

select results_eq(
  $$
    select raw_app_meta_data->>'active_household_role'
    from auth.users
    where id = '11000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('editor'::text) $$,
  'previous owner provider routing is downgraded atomically'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

select ok(
  not public.can_admin_household(
    '21000000-0000-4000-8000-000000000001'
  ),
  'previous owner loses administration immediately'
);

select throws_ok(
  $$
    select public.cancel_household_invite(
      '21000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      2,
      '91000000-0000-4000-8000-000000000006'
    )
  $$,
  'P0001',
  'PERMISSION_DENIED',
  'previous owner cannot administer after transfer'
);

set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000002';

select ok(
  public.can_admin_household(
    '21000000-0000-4000-8000-000000000001'
  ),
  'new owner gains administration immediately'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.household_access_operations',
    'SELECT'
  ),
  'clients cannot enumerate administration idempotency records'
);

select * from finish();

rollback;
