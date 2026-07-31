begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into public.pilot_signup_approvals (
  id,
  email_hash,
  access_code_hash,
  enabled,
  max_households,
  pending_grant_hash,
  pending_grant_expires_at
)
values (
  '91000000-0000-4000-8000-000000000001',
  encode(extensions.digest('approved@example.test', 'sha256'), 'hex'),
  encode(extensions.digest('APPROVED-ACCESS-CODE-001', 'sha256'), 'hex'),
  true,
  1,
  encode(
    extensions.digest(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'sha256'
    ),
    'hex'
  ),
  now() + interval '10 minutes'
);

select is(
  public.heldat_before_user_created(
    '{
      "user": {
        "email": "direct@example.test",
        "app_metadata": {},
        "user_metadata": {}
      }
    }'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'direct signup without a grant is rejected before identity creation'
);

select is(
  public.heldat_before_user_created(
    '{
      "user": {
        "email": "approved@example.test",
        "app_metadata": {},
        "user_metadata": {
          "alyr_signup_channel": "mobile-pilot-v1",
          "pilot_signup_grant":
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      }
    }'::jsonb
  ),
  '{}'::jsonb,
  'matching email and one-use grant are accepted'
);

select is(
  public.heldat_before_user_created(
    '{
      "user": {
        "email": "approved@example.test",
        "app_metadata": {},
        "user_metadata": {
          "alyr_signup_channel": "wrong-channel",
          "pilot_signup_grant":
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      }
    }'::jsonb
  ) #>> '{error,http_code}',
  '403',
  'changing the signup channel cannot bypass the enrollment policy'
);

select is(
  public.heldat_before_user_created(
    '{
      "user": {
        "email": "operator@example.test",
        "app_metadata": {"heldat_operator_provisioned": true},
        "user_metadata": {}
      }
    }'::jsonb
  ),
  '{}'::jsonb,
  'explicit admin app_metadata supports operator-created fixtures'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.heldat_before_user_created(jsonb)',
    'EXECUTE'
  ),
  'Auth service role can invoke the before-user-created hook'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.heldat_before_user_created(jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the Auth hook'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.heldat_before_user_created(jsonb)',
    'EXECUTE'
  ),
  'authenticated callers cannot invoke the Auth hook'
);

select results_eq(
  $$
    select allowed, remaining, retry_after_seconds
    from public.consume_api_rate_limit(
      repeat('1', 64),
      'test.route',
      2,
      3600
    )
  $$,
  $$ values (true, 1, 0) $$,
  'first request consumes one token'
);

select results_eq(
  $$
    select allowed, remaining, retry_after_seconds
    from public.consume_api_rate_limit(
      repeat('1', 64),
      'test.route',
      2,
      3600
    )
  $$,
  $$ values (true, 0, 0) $$,
  'second request consumes the final token'
);

select results_eq(
  $$
    select allowed, remaining
    from public.consume_api_rate_limit(
      repeat('1', 64),
      'test.route',
      2,
      3600
    )
  $$,
  $$ values (false, 0) $$,
  'third request is rate limited'
);

select results_eq(
  $$
    select allowed
    from public.consume_api_rate_limit(
      repeat('2', 64),
      'test.route',
      2,
      3600
    )
  $$,
  $$ values (true) $$,
  'separate hashed scopes use separate buckets'
);

select throws_ok(
  $$
    select public.consume_api_rate_limit('raw-ip', 'test.route', 2, 60)
  $$,
  'P0001',
  'RATE_LIMIT_ARGUMENT_INVALID',
  'raw or malformed scope values are rejected'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.consume_api_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ),
  'anonymous callers cannot consume service rate-limit buckets directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_household(text,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the current household creation RPC'
);

select * from finish();

rollback;
