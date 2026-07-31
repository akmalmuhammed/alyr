import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const projectUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

if (!projectUrl || !serviceRoleKey || !publicKey) {
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PUBLISHABLE_KEY.",
  );
}

const apiBaseUrl = `${projectUrl.replace(/\/+$/u, "")}/functions/v1/api`;
const localDbContainer =
  process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_alyr-local";
const service = createClient(projectUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ownerEmail = `evidence-owner-${randomUUID()}@example.test`;
const password = `Heldat-${randomUUID()}-Local!`;
const bytes = new TextEncoder().encode(
  "Heldat immutable Evidence integration fixture.",
);
const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
const mimeType = "text/plain";
const fileName = "ownership-proof.txt";
let ownerId = null;
let householdId = null;
let objectKey = null;

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function operatorSql(statement) {
  return execFileSync(
    "docker",
    [
      "exec",
      localDbContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
      "-c",
      statement,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  ).trim();
}

async function expectNoError(operation, label) {
  const result = await operation;
  assert.equal(result.error, null, `${label}: ${result.error?.message}`);
  return result.data;
}

async function api(path, token, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

try {
  const owner = await expectNoError(
    service.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
      app_metadata: { heldat_operator_provisioned: true },
    }),
    "create owner",
  );
  ownerId = owner.user.id;
  operatorSql(
    `insert into public.pilot_enrollments (
       user_id, enabled, max_households, note
     ) values (
       ${sqlLiteral(ownerId)}::uuid,
       true,
       1,
       'Local Evidence integration fixture'
     );`,
  );

  const account = createClient(projectUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await expectNoError(
    account.auth.signInWithPassword({ email: ownerEmail, password }),
    "sign in owner",
  );
  const token = signedIn.session?.access_token;
  assert.ok(token);

  const householdRequestId = randomUUID();
  const createdHousehold = await api("/households", token, {
    apiVersion: 1,
    operationId: householdRequestId,
    householdId: randomUUID(),
    name: "Heldat Evidence integration",
  });
  assert.equal(
    createdHousehold.response.status,
    201,
    JSON.stringify(createdHousehold.payload),
  );
  householdId = createdHousehold.payload.household.id;

  const assetId = randomUUID();
  const evidenceId = randomUUID();
  const evidenceVersionId = randomUUID();
  const blobId = randomUUID();
  objectKey = `${householdId}/${blobId}/${evidenceVersionId}`;
  operatorSql(
    `begin;
     insert into public.assets (
       id, household_id, name, category_id, category_path, created_by
     ) values (
       ${sqlLiteral(assetId)}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       'Evidence integration Asset',
       'personal.documents',
       array['personal', 'documents'],
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.evidence (
       id, household_id, asset_id, kind, relation, title, storage_state,
       created_by
     ) values (
       ${sqlLiteral(evidenceId)}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       ${sqlLiteral(assetId)}::uuid,
       'paper',
       'ownership',
       'Ownership proof',
       'queued',
       ${sqlLiteral(ownerId)}::uuid
     );
     commit;`,
  );

  const descriptor = {
    apiVersion: 1,
    householdId,
    evidenceId,
    evidenceVersionId,
    blobId,
    fileName,
    mimeType,
    byteSize: bytes.byteLength,
    checksumSha256,
  };
  const intent = await api("/uploads/intents", token, descriptor);
  assert.equal(intent.response.status, 201, JSON.stringify(intent.payload));
  assert.equal(intent.payload.uploadId, blobId);
  assert.equal(intent.payload.blobObjectId, blobId);
  assert.equal(intent.payload.uploadTarget.provider, "supabase");
  assert.equal(intent.payload.uploadTarget.objectKey, objectKey);
  assert.equal(intent.payload.uploadTarget.method, "PUT");
  assert.equal(
    intent.payload.uploadTarget.expiresAt,
    intent.payload.expiresAt,
  );
  assert.equal(
    intent.payload.uploadTarget.requiredHeaders["content-type"],
    mimeType,
  );
  assert.equal(
    intent.payload.uploadTarget.requiredHeaders["x-upsert"],
    "false",
  );

  const uploaded = await fetch(intent.payload.uploadTarget.url, {
    method: intent.payload.uploadTarget.method,
    headers: intent.payload.uploadTarget.requiredHeaders,
    body: bytes,
  });
  assert.ok(
    uploaded.ok || uploaded.status === 409,
    `signed PUT failed: ${uploaded.status} ${await uploaded.text()}`,
  );

  const completed = await api(
    `/uploads/${encodeURIComponent(blobId)}/complete`,
    token,
    {
      apiVersion: 1,
      checksumSha256,
      byteSize: bytes.byteLength,
    },
  );
  assert.equal(
    completed.response.status,
    200,
    JSON.stringify(completed.payload),
  );
  assert.deepEqual(completed.payload.upload, {
    id: blobId,
    objectKey,
    status: "stored",
  });

  operatorSql(
    `begin;
     insert into public.evidence_versions (
       id, household_id, evidence_id, blob_object_id, version_number,
       file_name, mime_type, byte_size, checksum_sha256, created_by
     ) values (
       ${sqlLiteral(evidenceVersionId)}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       ${sqlLiteral(evidenceId)}::uuid,
       ${sqlLiteral(blobId)}::uuid,
       1,
       ${sqlLiteral(fileName)},
       ${sqlLiteral(mimeType)},
       ${bytes.byteLength},
       ${sqlLiteral(checksumSha256)},
       ${sqlLiteral(ownerId)}::uuid
     );
     update public.evidence
     set storage_state = 'cloud-acknowledged', review_status = 'reviewed'
     where id = ${sqlLiteral(evidenceId)}::uuid;
     commit;`,
  );

  const downloadIntent = await api(
    "/evidence/download",
    token,
    descriptor,
  );
  assert.equal(
    downloadIntent.response.status,
    200,
    JSON.stringify(downloadIntent.payload),
  );
  const target = downloadIntent.payload.downloadTarget;
  assert.equal(target.provider, "supabase");
  assert.equal(target.objectKey, objectKey);
  assert.equal(target.method, "GET");
  assert.deepEqual(target.requiredHeaders, {});

  const downloaded = await fetch(target.url, {
    method: target.method,
    headers: target.requiredHeaders,
  });
  assert.equal(downloaded.status, 200);
  const downloadedBytes = new Uint8Array(await downloaded.arrayBuffer());
  assert.equal(downloadedBytes.byteLength, bytes.byteLength);
  assert.equal(
    createHash("sha256").update(downloadedBytes).digest("hex"),
    checksumSha256,
  );
  assert.deepEqual(downloadedBytes, bytes);

  console.log(JSON.stringify({
    status: "pass",
    checks: 22,
    provider: target.provider,
    immutablePut: true,
    serverStreamVerified: true,
    directSignedGet: true,
    sha256DeviceReverified: true,
  }));
} finally {
  if (objectKey) {
    await service.storage.from("evidence").remove([objectKey]);
  }
  if (householdId) {
    try {
      operatorSql(
        `delete from public.households
         where id = ${sqlLiteral(householdId)}::uuid;`,
      );
    } catch {
      // Preserve the original assertion failure.
    }
  }
  if (ownerId) {
    try {
      operatorSql(
        `delete from public.pilot_enrollments
         where user_id = ${sqlLiteral(ownerId)}::uuid;`,
      );
    } catch {
      // Preserve the original assertion failure.
    }
    await service.auth.admin.deleteUser(ownerId);
  }
}
