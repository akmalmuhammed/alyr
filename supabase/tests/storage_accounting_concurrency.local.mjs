import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_alyr-local";
if (!/^supabase_db_[A-Za-z0-9_.-]+$/u.test(container)) {
  throw new Error("SUPABASE_DB_CONTAINER must name a local Supabase DB container.");
}

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-qAt",
      ],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => {
      stdout += value;
    });
    child.stderr.on("data", (value) => {
      stderr += value;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

async function mustSucceed(label, sql) {
  const result = await psql(sql);
  assert.equal(
    result.code,
    0,
    `${label} failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

const fixture = Object.freeze({
  user: "d1000000-0000-4000-8000-000000000001",
  household: "d2000000-0000-4000-8000-000000000001",
  membership: "d3000000-0000-4000-8000-000000000001",
  asset: "d4000000-0000-4000-8000-000000000001",
  evidence: "d5000000-0000-4000-8000-000000000001",
  blob: "d6000000-0000-4000-8000-000000000001",
  secondBlob: "d6000000-0000-4000-8000-000000000002",
  version: "d7000000-0000-4000-8000-000000000001",
  secondVersion: "d7000000-0000-4000-8000-000000000002",
});

const cleanup = `
begin;
delete from public.account_deletion_jobs
where account_id = '${fixture.user}';
delete from public.households where id = '${fixture.household}';
delete from auth.users where id = '${fixture.user}';
commit;
`;

const setup = `
${cleanup}
begin;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '${fixture.user}',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'storage-concurrency@example.test', '',
  now(), now(), now()
);
insert into public.households(id, name, created_by)
values ('${fixture.household}', 'Storage concurrency fixture', '${fixture.user}');
insert into public.memberships(id, household_id, user_id, role)
values ('${fixture.membership}', '${fixture.household}', '${fixture.user}', 'owner');
insert into public.assets(id, household_id, name, category_id, created_by)
values ('${fixture.asset}', '${fixture.household}', 'Concurrency fixture', 'other', '${fixture.user}');
insert into public.evidence(
  id, household_id, asset_id, kind, relation, title, storage_state, created_by
) values (
  '${fixture.evidence}', '${fixture.household}', '${fixture.asset}',
  'media', 'identity', 'Concurrency evidence', 'queued', '${fixture.user}'
);
insert into public.blob_objects(
  id, household_id, expected_evidence_id, expected_evidence_version_id,
  object_key, checksum_sha256, byte_size, mime_type, status,
  intent_expires_at, created_by
) values (
  '${fixture.blob}', '${fixture.household}', '${fixture.evidence}',
  '${fixture.version}', '${fixture.household}/${fixture.blob}/${fixture.version}',
  repeat('a', 64), 1, 'image/jpeg', 'upload-intent',
  now() + interval '15 minutes', '${fixture.user}'
);
commit;
`;

function noDeadlock(label, result) {
  assert.doesNotMatch(
    `${result.stdout}\n${result.stderr}`,
    /deadlock detected|statement timeout/iu,
    `${label} encountered a lock-order regression.`,
  );
}

let checks = 0;
await mustSucceed("preflight fixture cleanup", cleanup);
const baselineResult = await mustSucceed(
  "capture retained-byte baseline",
  "select retained_storage_bytes from public.launch_enrollment_controls where id = 1;",
);
const retainedBytesBaseline = Number(baselineResult.stdout.trim());
assert.ok(
  Number.isSafeInteger(retainedBytesBaseline) && retainedBytesBaseline >= 0,
  `Invalid retained-byte baseline: ${baselineResult.stdout}`,
);
try {
  await mustSucceed("fixture setup for insert/cascade contention", setup);

  // This recreates the original production lock cycle: deletion holds the
  // household while a new child INSERT reaches its BEFORE trigger. The reviewed
  // household advisory must keep the INSERT away from the global accounting
  // lock until deletion finishes.
  const cascadeSession = psql(`
set deadlock_timeout = '200ms';
set statement_timeout = '8s';
begin;
select pg_advisory_xact_lock(
  hashtextextended('heldat.storage.household:${fixture.household}', 0)
);
select 1 from public.households
where id = '${fixture.household}' for update;
select pg_sleep(1);
delete from public.households where id = '${fixture.household}';
commit;
select 'cascade-ok';
`);
  const insertSession = psql(`
set deadlock_timeout = '200ms';
set statement_timeout = '8s';
select pg_sleep(0.2);
begin;
insert into public.blob_objects(
  id, household_id, expected_evidence_id, expected_evidence_version_id,
  object_key, checksum_sha256, byte_size, mime_type, status,
  intent_expires_at, created_by
) values (
  '${fixture.secondBlob}', '${fixture.household}', '${fixture.evidence}',
  '${fixture.secondVersion}',
  '${fixture.household}/${fixture.secondBlob}/${fixture.secondVersion}',
  repeat('b', 64), 1, 'image/jpeg', 'upload-intent',
  now() + interval '15 minutes', '${fixture.user}'
);
commit;
`);
  const [cascadeResult, insertResult] = await Promise.all([
    cascadeSession,
    insertSession,
  ]);
  noDeadlock("household cascade", cascadeResult);
  noDeadlock("concurrent child insert", insertResult);
  assert.equal(
    cascadeResult.code,
    0,
    `The household cascade did not finish.\n${cascadeResult.stderr}`,
  );
  assert.notEqual(insertResult.code, 0, "The orphan child INSERT unexpectedly committed.");
  assert.match(
    insertResult.stderr,
    /HOUSEHOLD_NOT_FOUND|foreign key constraint/iu,
    `The child INSERT failed for an unexpected reason.\n${insertResult.stderr}`,
  );
  checks += 4;

  const postCascade = await mustSucceed(
    "post-cascade accounting check",
    `select concat_ws(':',
      (select count(*) from public.households where id = '${fixture.household}'),
      (select count(*) from public.blob_objects where household_id = '${fixture.household}'),
      (select retained_storage_bytes from public.launch_enrollment_controls where id = 1)
    );`,
  );
  assert.equal(postCascade.stdout.trim(), `0:0:${retainedBytesBaseline}`);
  checks += 1;

  await mustSucceed("fixture setup for renewal/deletion contention", setup);
  const renewalSession = psql(`
set deadlock_timeout = '200ms';
set statement_timeout = '8s';
begin;
select id from public.blob_objects
where id = '${fixture.blob}' for update;
select pg_sleep(1);
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '${fixture.user}';
select id from public.create_blob_upload_intent(
  '${fixture.blob}', '${fixture.household}', '${fixture.evidence}',
  '${fixture.version}', '${fixture.household}/${fixture.blob}/${fixture.version}',
  repeat('a', 64), 1, 'image/jpeg'
);
commit;
select 'renewal-ok';
`);
  const deletionSession = psql(`
set deadlock_timeout = '200ms';
set statement_timeout = '8s';
select pg_sleep(0.2);
begin;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select public.delete_account_domain_data(
  '${fixture.user}',
  '[{"membershipId":"${fixture.membership}","householdId":"${fixture.household}","role":"owner","status":"active"}]'::jsonb
);
commit;
select 'deletion-ok';
`);
  const [renewalResult, deletionResult] = await Promise.all([
    renewalSession,
    deletionSession,
  ]);
  noDeadlock("upload renewal", renewalResult);
  noDeadlock("account deletion", deletionResult);
  assert.equal(
    renewalResult.code,
    0,
    `The upload renewal did not finish.\n${renewalResult.stderr}`,
  );
  assert.equal(
    deletionResult.code,
    0,
    `Account deletion did not finish.\n${deletionResult.stderr}`,
  );
  checks += 4;

  const postDeletion = await mustSucceed(
    "post-deletion hold check",
    `select concat_ws(':',
      (select count(*) from public.households where id = '${fixture.household}'),
      (select count(*) from public.account_deletion_jobs where account_id = '${fixture.user}'),
      (select retained_bytes from public.account_deletion_storage_holds where account_id = '${fixture.user}'),
      (select retained_storage_bytes from public.launch_enrollment_controls where id = 1)
    );`,
  );
  assert.equal(
    postDeletion.stdout.trim(),
    `0:1:1:${retainedBytesBaseline + 1}`,
  );
  checks += 1;

  await mustSucceed(
    "release deletion hold",
    `begin;
     set local role service_role;
     set local request.jwt.claim.role = 'service_role';
     select public.release_account_deletion_storage_hold('${fixture.user}');
     delete from public.account_deletion_jobs where account_id = '${fixture.user}';
     commit;`,
  );
  const released = await mustSucceed(
    "released accounting check",
    "select retained_storage_bytes from public.launch_enrollment_controls where id = 1;",
  );
  assert.equal(released.stdout.trim(), String(retainedBytesBaseline));
  checks += 1;
} finally {
  const result = await psql(cleanup);
  if (result.code !== 0) {
    process.stderr.write(`Local fixture cleanup failed:\n${result.stderr}`);
    process.exitCode = 1;
  }
}

console.log(`Storage accounting concurrency: ${checks}/11 checks PASS`);
