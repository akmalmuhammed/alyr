begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at
)
values
  (
    '12000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'invite-owner@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '12000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'invite-recipient@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '12000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reserved-other@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '12000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'active-member@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.households (id, name, created_by)
values (
  '22000000-0000-4000-8000-000000000001',
  'Invitation review household',
  '12000000-0000-4000-8000-000000000001'
);

insert into public.memberships (
  id, household_id, user_id, role
)
values
  (
    '32000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '32000000-0000-4000-8000-000000000004',
    '22000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000004',
    'viewer'
  );

insert into public.invites (
  id, household_id, code_hash, role, expires_at, created_by
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    encode(extensions.digest('REVIEW-VALID', 'sha256'), 'hex'),
    'viewer',
    now() + interval '7 days',
    '12000000-0000-4000-8000-000000000001'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000001',
    encode(extensions.digest('REVIEW-SELF', 'sha256'), 'hex'),
    'editor',
    now() + interval '7 days',
    '12000000-0000-4000-8000-000000000002'
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    encode(extensions.digest('REVIEW-EXPIRED', 'sha256'), 'hex'),
    'viewer',
    now() - interval '1 minute',
    '12000000-0000-4000-8000-000000000001'
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    '22000000-0000-4000-8000-000000000001',
    encode(extensions.digest('REVIEW-RESERVED', 'sha256'), 'hex'),
    'editor',
    now() + interval '7 days',
    '12000000-0000-4000-8000-000000000001'
  ),
  (
    '72000000-0000-4000-8000-000000000005',
    '22000000-0000-4000-8000-000000000001',
    encode(extensions.digest('REVIEW-ACTIVE', 'sha256'), 'hex'),
    'viewer',
    now() + interval '7 days',
    '12000000-0000-4000-8000-000000000001'
  );

insert into public.pilot_signup_approvals (
  id, email_hash, access_code_hash, max_households
)
values (
  '82000000-0000-4000-8000-000000000001',
  encode(
    extensions.digest('reserved-other@example.test', 'sha256'),
    'hex'
  ),
  encode(extensions.digest('RESERVED-ACCESS', 'sha256'), 'hex'),
  0
);

insert into public.household_invite_signup_reservations (
  invite_id, approval_id, email_hash, expires_at
)
values (
  '72000000-0000-4000-8000-000000000004',
  '82000000-0000-4000-8000-000000000001',
  encode(
    extensions.digest('reserved-other@example.test', 'sha256'),
    'hex'
  ),
  now() + interval '30 minutes'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.preview_household_invite(text)',
    'EXECUTE'
  ),
  'authenticated recipients may review a bearer they possess'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.preview_household_invite(text)',
    'EXECUTE'
  ),
  'anonymous clients cannot review household metadata'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000002';

select results_eq(
  $$
    select household_name, role::text
    from public.preview_household_invite(' review-valid ')
  $$,
  $$
    values ('Invitation review household'::text, 'viewer'::text)
  $$,
  'a valid recipient sees only the household name and assigned role'
);

reset role;

select results_eq(
  $$
    select count(*)
    from public.memberships
    where user_id = '12000000-0000-4000-8000-000000000002'
  $$,
  array[0::bigint],
  'review does not create membership'
);

select results_eq(
  $$
    select accepted_at is null
    from public.invites
    where id = '72000000-0000-4000-8000-000000000001'
  $$,
  array[true],
  'review does not consume the one-time invitation'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000002';

select throws_ok(
  $$ select public.preview_household_invite('UNKNOWN-CODE') $$,
  'P0001',
  'INVITE_INVALID_OR_EXPIRED',
  'an unknown bearer reveals no household metadata'
);

select throws_ok(
  $$ select public.preview_household_invite('REVIEW-SELF') $$,
  'P0001',
  'INVITE_INVALID_OR_EXPIRED',
  'an invitation creator cannot review their own invitation as a recipient'
);

select throws_ok(
  $$ select public.preview_household_invite('REVIEW-EXPIRED') $$,
  'P0001',
  'INVITE_INVALID_OR_EXPIRED',
  'an expired bearer reveals no household metadata'
);

select throws_ok(
  $$ select public.preview_household_invite('REVIEW-RESERVED') $$,
  'P0001',
  'INVITE_INVALID_OR_EXPIRED',
  'an email-bound bearer reveals nothing to a different account'
);

set local request.jwt.claim.sub = '12000000-0000-4000-8000-000000000004';

select throws_ok(
  $$ select public.preview_household_invite('REVIEW-ACTIVE') $$,
  'P0001',
  'ALREADY_ACTIVE_MEMBER',
  'an existing active member is not offered duplicate membership'
);

select * from finish();

rollback;
