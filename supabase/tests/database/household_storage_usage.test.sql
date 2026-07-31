begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select ok(
  has_function_privilege(
    'authenticated',
    'public.read_household_storage_usage(uuid)',
    'EXECUTE'
  ),
  'authenticated members may invoke the narrow usage reader'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.read_household_storage_usage(uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the usage reader'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.read_household_storage_usage(uuid)',
    'EXECUTE'
  ),
  'service authority does not bypass the active-member reader'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.household_storage_usage',
    'SELECT'
  ),
  'authenticated callers cannot inspect raw counters'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.household_storage_usage',
    'SELECT'
  ),
  'service maintenance retains raw-counter access'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.read_household_storage_usage(uuid)'::regprocedure
  ),
  'the tenant projection is security definer'
);
select is(
  (
    select provolatile::text
    from pg_proc
    where oid = 'public.read_household_storage_usage(uuid)'::regprocedure
  ),
  's',
  'the read-only projection is stable'
);
select is(
  pg_get_function_result(
    'public.read_household_storage_usage(uuid)'::regprocedure
  ),
  'TABLE(household_id uuid, used_bytes bigint, allowance_bytes bigint, measured_at timestamp with time zone)',
  'the database projection contains only the four reviewed fields'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  ('d1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'usage-owner@example.test', '', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'usage-editor@example.test', '', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'usage-viewer@example.test', '', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'usage-outsider@example.test', '', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'usage-revoked@example.test', '', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'usage-deleted@example.test', '', now(), now(), now());

insert into public.households (id, name, created_by)
values
  ('d2000000-0000-4000-8000-000000000001', 'Usage household', 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 'Zero usage household', 'd1000000-0000-4000-8000-000000000004');

insert into public.memberships (
  id, household_id, user_id, role, status, deleted_at
)
values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'owner', 'active', null),
  ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'editor', 'active', null),
  ('d3000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'viewer', 'active', null),
  ('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004', 'owner', 'active', null),
  ('d3000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005', 'viewer', 'revoked', null),
  ('d3000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000006', 'viewer', 'active', now());

insert into public.household_storage_usage (
  household_id, retained_bytes, updated_at
)
values (
  'd2000000-0000-4000-8000-000000000001', 1234567, now()
)
on conflict (household_id) do update
set retained_bytes = excluded.retained_bytes,
    updated_at = excluded.updated_at;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select household_id::text, used_bytes
    from public.read_household_storage_usage(
      'd2000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('d2000000-0000-4000-8000-000000000001'::text, 1234567::bigint) $$,
  'an active owner receives the authoritative retained bytes'
);
select is(
  (
    select allowance_bytes
    from public.read_household_storage_usage(
      'd2000000-0000-4000-8000-000000000001'
    )
  ),
  41943040::bigint,
  'the reader returns the current household allowance'
);
select ok(
  (
    select measured_at between statement_timestamp() - interval '5 seconds'
      and statement_timestamp() + interval '5 seconds'
    from public.read_household_storage_usage(
      'd2000000-0000-4000-8000-000000000001'
    )
  ),
  'the server supplies a bounded measurement timestamp'
);

set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000002';
select is(
  (select used_bytes from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000001')),
  1234567::bigint,
  'an active editor receives the same tenant usage'
);

set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';
select is(
  (select used_bytes from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000001')),
  1234567::bigint,
  'an active viewer receives the same tenant usage'
);

set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select is(
  (select used_bytes from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000002')),
  0::bigint,
  'an authorized household without a counter row reports zero bytes'
);
select is(
  (select count(*) from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000001')),
  0::bigint,
  'a cross-household caller receives no identifying row'
);

set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000005';
select is(
  (select count(*) from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000001')),
  0::bigint,
  'a revoked member receives no identifying row'
);

set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000006';
select is(
  (select count(*) from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000001')),
  0::bigint,
  'a soft-deleted membership receives no identifying row'
);

set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000099')),
  0::bigint,
  'a nonexistent household is indistinguishable from denied access'
);

reset role;
update public.households
set deleted_at = now()
where id = 'd2000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select is(
  (select count(*) from public.read_household_storage_usage('d2000000-0000-4000-8000-000000000002')),
  0::bigint,
  'a soft-deleted household is indistinguishable from denied access'
);

select * from finish();
rollback;
