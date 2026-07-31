begin;

create extension if not exists pgtap with schema extensions;

select plan(57);

select is(
  (select signup_mode from public.launch_enrollment_controls where id = 1),
  'closed_pilot',
  'launch enrollment remains closed-pilot by default'
);
select is(
  (select max_registered_users from public.launch_enrollment_controls where id = 1),
  20,
  'default registered-user ceiling preserves the 20-account pilot'
);
select is(
  (select max_households from public.launch_enrollment_controls where id = 1),
  20,
  'default household ceiling preserves the 20-household pilot'
);
select is(
  (select max_attachment_bytes from public.launch_enrollment_controls where id = 1),
  10485760::bigint,
  'default attachment ceiling remains 10 MiB'
);
select is(
  (select household_storage_limit_bytes from public.launch_enrollment_controls where id = 1),
  41943040::bigint,
  'default household storage ceiling remains 40 MiB'
);
select is(
  (select global_storage_limit_bytes from public.launch_enrollment_controls where id = 1),
  838860800::bigint,
  'default free-pilot global storage ceiling is 800 MiB'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.launch_enrollment_controls',
    'SELECT'
  ),
  'anonymous callers cannot inspect launch controls'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.launch_enrollment_controls',
    'SELECT'
  ),
  'authenticated callers cannot inspect launch controls'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.launch_signup_reservations',
    'SELECT'
  ),
  'anonymous callers cannot inspect signup reservations'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.launch_enrollment_keys',
    'SELECT'
  ),
  'anonymous callers cannot inspect HMAC key material'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.issue_public_email_signup_grant(text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke email signup preflight directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.issue_public_email_signup_grant(text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated callers cannot invoke email signup preflight directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.issue_public_email_signup_grant(text,text,uuid)',
    'EXECUTE'
  ),
  'service role can invoke email signup preflight'
);
select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.heldat_before_user_created(jsonb)',
    'EXECUTE'
  ),
  'Auth service can invoke the enrollment hook'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.heldat_before_user_created(jsonb)',
    'EXECUTE'
  ),
  'general service calls cannot invoke the Auth hook'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.configure_launch_enrollment(uuid,bigint,text,integer,integer,integer,integer,bigint,bigint,bigint,integer,integer,integer,integer,integer,integer,integer)',
    'EXECUTE'
  ),
  'anonymous callers cannot mutate launch controls'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.configure_launch_enrollment(uuid,bigint,text,integer,integer,integer,integer,bigint,bigint,bigint,integer,integer,integer,integer,integer,integer,integer)',
    'EXECUTE'
  ),
  'service role can run the operator control mutation'
);

select throws_ok(
  $$
    select *
    from public.issue_public_email_signup_grant(
      'closed@example.test',
      repeat('1', 64),
      'd0000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'PUBLIC_SIGNUP_CLOSED',
  'public email signup fails closed before operator activation'
);
select throws_ok(
  $$
    select *
    from public.issue_public_email_signup_grant(
      'invalid-network@example.test',
      null,
      'd0000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  'PUBLIC_SIGNUP_REQUEST_INVALID',
  'missing network scope fails validation without reaching enrollment state'
);

create temporary table configured_controls on commit drop as
select *
from public.configure_launch_enrollment(
  'd1000000-0000-4000-8000-000000000001',
  1,
  'public_email',
  100000,
  100000,
  100,
  1,
  10485760,
  41943040,
  838860800,
  600,
  5,
  3600,
  5,
  3600,
  1,
  3600
);

select is(
  (select signup_mode from configured_controls),
  'public_email',
  'operator can activate email-only launch mode explicitly'
);
select is(
  (select config_version from configured_controls),
  2::bigint,
  'operator mutation advances the control version once'
);
select is(
  (
    select config_version
    from public.configure_launch_enrollment(
      'd1000000-0000-4000-8000-000000000001',
      1,
      'public_email',
      100000,
      100000,
      100,
      1,
      10485760,
      41943040,
      838860800,
      600,
      5,
      3600,
      5,
      3600,
      1,
      3600
    )
  ),
  2::bigint,
  'operator mutation replay returns its original snapshot'
);
select throws_ok(
  $$
    select *
    from public.configure_launch_enrollment(
      'd1000000-0000-4000-8000-000000000001',
      1,
      'public_email',
      99999,
      100000,
      100,
      1,
      10485760,
      41943040,
      838860800,
      600,
      5,
      3600,
      5,
      3600,
      1,
      3600
    )
  $$,
  'P0001',
  'LAUNCH_CONFIG_IDEMPOTENCY_CONFLICT',
  'operator operation UUID cannot be reused with different controls'
);
select throws_ok(
  $$
    select *
    from public.configure_launch_enrollment(
      'd1000000-0000-4000-8000-000000000002',
      1,
      'public_email',
      100000,
      100000,
      100,
      1,
      10485760,
      41943040,
      838860800,
      600,
      5,
      3600,
      5,
      3600,
      1,
      3600
    )
  $$,
  'P0001',
  'LAUNCH_CONFIG_VERSION_CONFLICT',
  'stale operator control versions fail closed'
);

create temporary table email_grant on commit drop as
select *
from public.issue_public_email_signup_grant(
  'launch-email@example.test',
  repeat('a', 64),
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select char_length(enrollment_grant) from email_grant),
  64,
  'email preflight returns a 256-bit hexadecimal grant'
);
select is(
  (select signup_channel from email_grant),
  'heldat-public-email-v1',
  'email preflight returns the versioned signup channel'
);
select ok(
  (select expires_at > now() from email_grant),
  'email preflight grant is short-lived and currently valid'
);
select is(
  (
    select enrollment_grant
    from public.issue_public_email_signup_grant(
      'launch-email@example.test',
      repeat('a', 64),
      'd2000000-0000-4000-8000-000000000001'
    )
  ),
  (select enrollment_grant from email_grant),
  'exact email preflight replay returns the same grant'
);
select is(
  (
    select count(*)::integer
    from public.launch_signup_reservations
    where idempotency_key =
      'd2000000-0000-4000-8000-000000000001'
  ),
  1,
  'email preflight replay does not reserve another capacity slot'
);
select isnt(
  (
    select email_hash
    from public.launch_signup_reservations
    where idempotency_key =
      'd2000000-0000-4000-8000-000000000001'
  ),
  encode(extensions.digest('launch-email@example.test', 'sha256'), 'hex'),
  'email address uses a keyed pseudonym rather than a reversible raw digest'
);
select isnt(
  (
    select network_scope_hash
    from public.launch_signup_reservations
    where idempotency_key =
      'd2000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  'Edge network digest is HMACed again before persistence'
);
select throws_ok(
  $$
    select *
    from public.issue_public_email_signup_grant(
      'different@example.test',
      repeat('a', 64),
      'd2000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'PUBLIC_SIGNUP_IDEMPOTENCY_CONFLICT',
  'email preflight idempotency key is bound to one request'
);
select throws_ok(
  $$
    select *
    from public.issue_public_email_signup_grant(
      'launch-email@example.test',
      repeat('a', 64),
      'd2000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  'PUBLIC_SIGNUP_ALREADY_PENDING',
  'one email cannot hoard concurrent launch capacity reservations'
);

select is(
  public.heldat_before_user_created(
    '{
      "metadata": {
        "name": "before-user-created",
        "ip_address": "203.0.113.10"
      },
      "user": {
        "id": "d3000000-0000-4000-8000-000000000001",
        "email": "direct@example.test",
        "app_metadata": {
          "provider": "email",
          "providers": ["email"]
        },
        "user_metadata": {}
      }
    }'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'direct email signup without a launch grant remains blocked'
);

create temporary table email_hook_event on commit drop as
select jsonb_build_object(
  'metadata',
  jsonb_build_object(
    'name', 'before-user-created',
    'ip_address', '203.0.113.10'
  ),
  'user',
  jsonb_build_object(
    'id', 'd3000000-0000-4000-8000-000000000001',
    'email', 'launch-email@example.test',
    'app_metadata',
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email')
    ),
    'user_metadata',
    jsonb_build_object(
      'alyr_signup_channel', 'heldat-public-email-v1',
      'public_signup_grant',
      (select enrollment_grant from email_grant)
    )
  )
) as event;

select is(
  public.heldat_before_user_created(
    (select event from email_hook_event)
  ),
  '{}'::jsonb,
  'capacity-checked public email event is accepted'
);
select is(
  public.heldat_before_user_created(
    (select event from email_hook_event)
  ),
  '{}'::jsonb,
  'same email Auth event is idempotent and does not consume another rate token'
);
select is(
  (
    select auth_user_id
    from public.launch_signup_reservations
    where idempotency_key =
      'd2000000-0000-4000-8000-000000000001'
  ),
  'd3000000-0000-4000-8000-000000000001'::uuid,
  'Auth hook binds the email reservation to the proposed user UUID'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at
)
select
  'd3000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'launch-email@example.test',
  '',
  now(),
  jsonb_build_object(
    'alyr_signup_channel', 'heldat-public-email-v1',
    'public_signup_grant', (select enrollment_grant from email_grant)
  ),
  '{"provider":"email","providers":["email"]}'::jsonb,
  now(),
  now();

select is(
  (
    select max_households
    from public.pilot_enrollments
    where user_id = 'd3000000-0000-4000-8000-000000000001'
  ),
  1,
  'email Auth insertion creates the configured account enrollment'
);
select ok(
  (
    select consumed_at is not null
    from public.launch_signup_reservations
    where idempotency_key =
      'd2000000-0000-4000-8000-000000000001'
  ),
  'email Auth insertion consumes its reservation'
);
select ok(
  (
    select not (
      raw_user_meta_data
        ?| array['alyr_signup_channel', 'public_signup_grant']
    )
    from auth.users
    where id = 'd3000000-0000-4000-8000-000000000001'
  ),
  'email bearer grant is removed from user metadata after consumption'
);

select is(
  public.heldat_before_user_created(
    '{
      "metadata": {
        "name": "before-user-created",
        "ip_address": "198.51.100.20"
      },
      "user": {
        "id": "d4000000-0000-4000-8000-000000000001",
        "email": "launch-google@example.test",
        "app_metadata": {
          "provider": "google",
          "providers": ["google"]
        },
        "user_metadata": {}
      }
    }'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'Google signup stays blocked in email-only launch mode'
);

create temporary table google_config on commit drop as
select *
from public.configure_launch_enrollment(
  'd1000000-0000-4000-8000-000000000003',
  2,
  'public_email_google',
  100000,
  100000,
  100,
  1,
  10485760,
  41943040,
  838860800,
  600,
  5,
  3600,
  5,
  3600,
  1,
  3600
);
select is(
  (select config_version from google_config),
  3::bigint,
  'operator explicitly enables Google launch enrollment'
);

create temporary table google_hook_event on commit drop as
select '{
  "metadata": {
    "name": "before-user-created",
    "ip_address": "198.51.100.20"
  },
  "user": {
    "id": "d4000000-0000-4000-8000-000000000001",
    "email": "launch-google@example.test",
    "app_metadata": {
      "provider": "google",
      "providers": ["google"]
    },
    "user_metadata": {}
  }
}'::jsonb as event;

select is(
  public.heldat_before_user_created(
    (select event from google_hook_event)
  ),
  '{}'::jsonb,
  'trusted Google provider event with metadata IP is accepted'
);
select is(
  public.heldat_before_user_created(
    (select event from google_hook_event)
  ),
  '{}'::jsonb,
  'same Google Auth event replays idempotently'
);
select isnt(
  (
    select network_scope_hash
    from public.launch_signup_reservations
    where auth_user_id =
      'd4000000-0000-4000-8000-000000000001'
  ),
  encode(extensions.digest('198.51.100.20', 'sha256'), 'hex'),
  'Google hook retains only a keyed IP pseudonym'
);
select is(
  public.heldat_before_user_created(
    '{
      "metadata": {
        "name": "before-user-created",
        "ip_address": "198.51.100.20"
      },
      "user": {
        "id": "d4000000-0000-4000-8000-000000000002",
        "email": "second-google@example.test",
        "app_metadata": {
          "provider": "google",
          "providers": ["google"]
        },
        "user_metadata": {}
      }
    }'::jsonb
  ) #>> '{error,http_code}',
  '429',
  'Google Auth events are privacy-safe rate limited by metadata IP'
);
select is(
  public.heldat_before_user_created(
    '{
      "metadata": {"name": "before-user-created"},
      "user": {
        "id": "d4000000-0000-4000-8000-000000000003",
        "email": "missing-ip@example.test",
        "app_metadata": {
          "provider": "google",
          "providers": ["google"]
        },
        "user_metadata": {}
      }
    }'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'Google signup fails closed when Auth metadata IP is absent'
);
select is(
  public.heldat_before_user_created(
    '{
      "metadata": {
        "name": "before-user-created",
        "ip_address": "192.0.2.40"
      },
      "user": {
        "id": "d4000000-0000-4000-8000-000000000004",
        "email": "spoof@example.test",
        "app_metadata": {
          "provider": "email",
          "providers": ["email"]
        },
        "user_metadata": {
          "provider": "google"
        }
      }
    }'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'editable user metadata cannot spoof the Google provider'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at
)
values (
  'd4000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'launch-google@example.test',
  '',
  now(),
  '{}'::jsonb,
  '{"provider":"google","providers":["google"]}'::jsonb,
  now(),
  now()
);

select is(
  (
    select max_households
    from public.pilot_enrollments
    where user_id = 'd4000000-0000-4000-8000-000000000001'
  ),
  1,
  'Google Auth insertion creates the configured account enrollment'
);
select ok(
  (
    select consumed_at is not null
    from public.launch_signup_reservations
    where auth_user_id =
      'd4000000-0000-4000-8000-000000000001'
  ),
  'Google Auth insertion consumes its reservation'
);

update public.launch_enrollment_controls
set
  max_registered_users = (
    select count(*)::integer from auth.users where deleted_at is null
  ),
  config_version = config_version + 1,
  updated_at = now()
where id = 1;
select throws_ok(
  $$
    select *
    from public.issue_public_email_signup_grant(
      'capacity@example.test',
      repeat('b', 64),
      'd2000000-0000-4000-8000-000000000003'
    )
  $$,
  'P0001',
  'PUBLIC_SIGNUP_CAPACITY_REACHED',
  'public email preflight reserves no slot after account capacity is full'
);

update public.launch_enrollment_controls
set
  max_registered_users = 100000,
  max_households = 1,
  config_version = config_version + 1,
  updated_at = now()
where id = 1;

insert into public.households (id, name, created_by)
values (
  'd5000000-0000-4000-8000-000000000001',
  'Existing launch household',
  'd4000000-0000-4000-8000-000000000001'
);
insert into public.memberships (id, household_id, user_id, role)
values (
  'd5100000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'owner'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub =
  'd3000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select public.create_household(
      'Capacity blocked',
      'd5200000-0000-4000-8000-000000000001',
      'd5300000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'PILOT_CAPACITY_REACHED',
  'household creation follows the operator-controlled global ceiling'
);
reset role;

update public.launch_enrollment_controls
set
  max_households = 100,
  max_attachment_bytes = 10,
  household_storage_limit_bytes = 10,
  global_storage_limit_bytes = 10,
  config_version = config_version + 1,
  updated_at = now()
where id = 1;

insert into public.households (id, name, created_by)
values (
  'd5000000-0000-4000-8000-000000000002',
  'Second launch household',
  'd3000000-0000-4000-8000-000000000001'
);
insert into public.memberships (id, household_id, user_id, role)
values (
  'd5100000-0000-4000-8000-000000000002',
  'd5000000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000001',
  'owner'
);
insert into public.assets (
  id, household_id, name, category_id, created_by
)
values
  (
    'd6000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    'Google household asset',
    'other',
    'd4000000-0000-4000-8000-000000000001'
  ),
  (
    'd6000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000002',
    'Email household asset',
    'other',
    'd3000000-0000-4000-8000-000000000001'
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
  created_by
)
values
  (
    'd6100000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    null,
    'media',
    'identity',
    'Google evidence',
    'queued',
    'd4000000-0000-4000-8000-000000000001'
  ),
  (
    'd6100000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000002',
    'd6000000-0000-4000-8000-000000000002',
    null,
    'media',
    'identity',
    'Email evidence',
    'queued',
    'd3000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub =
  'd4000000-0000-4000-8000-000000000001';
select is(
  (
    select status::text
    from public.create_blob_upload_intent(
      'd6200000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000001',
      'd6100000-0000-4000-8000-000000000001',
      'd6300000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000001/d6200000-0000-4000-8000-000000000001/d6300000-0000-4000-8000-000000000001',
      repeat('c', 64),
      6,
      'image/jpeg'
    )
  ),
  'upload-intent',
  'blob reservation succeeds below all configured storage ceilings'
);
select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'd6200000-0000-4000-8000-000000000002',
      'd5000000-0000-4000-8000-000000000001',
      'd6100000-0000-4000-8000-000000000001',
      'd6300000-0000-4000-8000-000000000002',
      'd5000000-0000-4000-8000-000000000001/d6200000-0000-4000-8000-000000000002/d6300000-0000-4000-8000-000000000002',
      repeat('d', 64),
      5,
      'image/jpeg'
    )
  $$,
  'P0001',
  'HOUSEHOLD_STORAGE_LIMIT',
  'blob reservation enforces the configured household byte ceiling'
);
reset role;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub =
  'd3000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select public.create_blob_upload_intent(
      'd6200000-0000-4000-8000-000000000003',
      'd5000000-0000-4000-8000-000000000002',
      'd6100000-0000-4000-8000-000000000002',
      'd6300000-0000-4000-8000-000000000003',
      'd5000000-0000-4000-8000-000000000002/d6200000-0000-4000-8000-000000000003/d6300000-0000-4000-8000-000000000003',
      repeat('e', 64),
      5,
      'image/jpeg'
    )
  $$,
  'P0001',
  'GLOBAL_STORAGE_LIMIT',
  'blob reservation enforces the configured provider-wide byte ceiling'
);
reset role;

insert into public.launch_signup_reservations (
  id,
  provider,
  idempotency_key,
  email_hash,
  network_scope_hash,
  grant_hash,
  control_version,
  created_at,
  expires_at
)
values (
  'd7000000-0000-4000-8000-000000000001',
  'email',
  'd7100000-0000-4000-8000-000000000001',
  repeat('1', 64),
  repeat('2', 64),
  repeat('3', 64),
  1,
  now() - interval '2 days',
  now() - interval '25 hours'
);
select is(
  public.purge_launch_signup_reservations(1),
  1,
  'retention purges one bounded batch of stale signup reservations'
);
select is(
  (
    select count(*)::integer
    from public.launch_signup_reservations
    where id = 'd7000000-0000-4000-8000-000000000001'
  ),
  0,
  'retention removes the selected stale reservation'
);

select * from finish();

rollback;
