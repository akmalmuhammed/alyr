import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

const projectUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

if (!projectUrl || !serviceRoleKey || !publicKey) {
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PUBLISHABLE_KEY."
  );
}

const apiBaseUrl = `${projectUrl.replace(/\/+$/u, "")}/functions/v1/api`;
const localDbContainer =
  process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_alyr-local";
const service = createClient(projectUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const ownerEmail = `export-owner-${randomUUID()}@example.test`;
const viewerEmail = `export-viewer-${randomUUID()}@example.test`;
const password = `ALYR-${randomUUID()}-Local!`;
let ownerId = null;
let viewerId = null;
let householdId = null;
const exportObjectKeys = [];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

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
      statement
    ],
    {
      encoding: "utf8",
      windowsHide: true
    }
  ).trim();
}

async function expectNoError(operation, label) {
  const result = await operation;
  assert.equal(result.error, null, `${label}: ${result.error?.message}`);
  return result.data;
}

async function accessToken(email) {
  const client = createClient(projectUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });
  assert.equal(error, null, error?.message);
  assert.ok(data.session?.access_token);
  return data.session.access_token;
}

async function api(path, token, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
  const contentType = response.headers.get("Content-Type") ?? "";
  const payload = !path.endsWith("/download") &&
      contentType.includes("application/json")
    ? await response.json()
    : new Uint8Array(await response.arrayBuffer());
  return { response, payload };
}

async function createExport(token, input) {
  return api("/exports", token, {
    method: "POST",
    body: JSON.stringify({
      apiVersion: 1,
      householdId,
      assetIds: [],
      ...input
    })
  });
}

try {
  const owner = await expectNoError(
    service.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
      app_metadata: { heldat_operator_provisioned: true }
    }),
    "create owner"
  );
  ownerId = owner.user.id;
  const viewer = await expectNoError(
    service.auth.admin.createUser({
      email: viewerEmail,
      password,
      email_confirm: true,
      app_metadata: { heldat_operator_provisioned: true }
    }),
    "create viewer"
  );
  viewerId = viewer.user.id;

  operatorSql(
    `insert into public.pilot_enrollments (
       user_id, enabled, max_households, note
     ) values (
       ${sqlLiteral(ownerId)}::uuid,
       true,
       1,
       'Local export integration fixture'
     );`
  );

  const ownerToken = await accessToken(ownerEmail);
  const createdHousehold = await api("/households", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      apiVersion: 1,
      operationId: randomUUID(),
      householdId: randomUUID(),
      name: "ALYR export integration"
    })
  });
  assert.equal(
    createdHousehold.response.status,
    201,
    JSON.stringify(createdHousehold.payload)
  );
  householdId = createdHousehold.payload.household.id;

  const ownerMembershipId = operatorSql(
    `select id::text
     from public.memberships
     where household_id = ${sqlLiteral(householdId)}::uuid
       and user_id = ${sqlLiteral(ownerId)}::uuid
       and status = 'active'
     limit 1;`
  );
  assert.match(ownerMembershipId, /^[0-9a-f-]{36}$/iu);
  operatorSql(
    `insert into public.memberships (
       id, household_id, user_id, role, status
     ) values (
       ${sqlLiteral(randomUUID())}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       ${sqlLiteral(viewerId)}::uuid,
       'viewer',
       'active'
     );`
  );

  const placeId = randomUUID();
  const spaceId = randomUUID();
  const assetId = randomUUID();
  const liabilityId = randomUUID();
  const now = new Date().toISOString();
  operatorSql(
    `begin;
     insert into public.places (
       id, household_id, name, kind, tenure, address_text, region_label,
       latitude, longitude, location_source, location_precision,
       horizontal_accuracy_m, location_observed_at, location_confirmed_at,
       created_by
     ) values (
       ${sqlLiteral(placeId)}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       'Export test home',
       'home',
       'owned',
       '10 Private Test Street',
       'Doha',
       25.3,
       51.5,
       'device_gps',
       'exact',
       4,
       ${sqlLiteral(now)}::timestamptz,
       ${sqlLiteral(now)}::timestamptz,
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.spaces (
       id, household_id, place_id, name, kind, ordinal, created_by
     ) values (
       ${sqlLiteral(spaceId)}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       ${sqlLiteral(placeId)}::uuid,
       'Study',
       'room',
       0,
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.assets (
       id, household_id, name, category_id, category_path, description,
       importance, lifecycle, profile, created_by
     ) values (
       ${sqlLiteral(assetId)}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       'Integration watch',
       'collectibles.watches',
       array['collectibles', 'watches'],
       'Private free-text description',
       'important',
       'active',
       '{"serial":"PRIVATE-SERIAL"}'::jsonb,
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.asset_value_assertions (
       id, household_id, asset_id, amount_minor, currency, as_of, source,
       created_by
     ) values (
       ${sqlLiteral(randomUUID())}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       ${sqlLiteral(assetId)}::uuid,
       1250000,
       'QAR',
       '2026-07-27'::date,
       'user-entered',
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.liabilities (
       id, household_id, name, kind, lifecycle, archived_at, created_by
     ) values (
       ${sqlLiteral(liabilityId)}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       'Private home mortgage',
       'mortgage',
       'archived',
       ${sqlLiteral(now)}::timestamptz,
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.asset_value_assertions (
       id, household_id, liability_id, amount_minor, currency, as_of,
       source, created_by
     ) values (
       ${sqlLiteral(randomUUID())}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       ${sqlLiteral(liabilityId)}::uuid,
       925000,
       'QAR',
       current_date,
       'user-entered',
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.liability_reviews (
       id, household_id, status, reviewed_at, expires_at, reviewed_by
     ) values (
       ${sqlLiteral(randomUUID())}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       'none-confirmed',
       current_date,
       current_date + 90,
       ${sqlLiteral(ownerId)}::uuid
     );
     insert into public.asset_location_revisions (
       id, household_id, asset_id, place_id, space_id, status,
       location_detail, source, revision, proposed_by
     ) values (
       ${sqlLiteral(randomUUID())}::uuid,
       ${sqlLiteral(householdId)}::uuid,
       ${sqlLiteral(assetId)}::uuid,
       ${sqlLiteral(placeId)}::uuid,
       ${sqlLiteral(spaceId)}::uuid,
       'known',
       'Second drawer',
       'user',
       1,
       ${sqlLiteral(ownerId)}::uuid
     );
     commit;`
  );

  const idempotencyKey = randomUUID();
  const parallel = await Promise.all([
    createExport(ownerToken, {
      format: "json-manifest",
      redacted: false,
      idempotencyKey
    }),
    createExport(ownerToken, {
      format: "json-manifest",
      redacted: false,
      idempotencyKey
    })
  ]);
  for (const result of parallel) {
    assert.ok(
      result.response.status === 200 || result.response.status === 201,
      JSON.stringify(result.payload)
    );
  }
  assert.equal(
    parallel[0].payload.exportId,
    parallel[1].payload.exportId,
    "parallel same-key requests must converge on one snapshot"
  );
  assert.equal(
    parallel.filter((result) => result.response.status === 201).length,
    1,
    "exactly one parallel request may render the artifact"
  );
  const complete = parallel.find(
    (result) => result.payload.status === "ready"
  );
  assert.ok(complete, "the claimed renderer must finish the export");
  assert.equal(
    complete.response.status,
    201,
    JSON.stringify(complete.payload)
  );
  assert.equal(complete.payload.status, "ready");
  assert.equal(complete.payload.mimeType, "application/json");
  assert.match(complete.payload.checksumSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    Number(
      operatorSql(
        `select count(*)
         from public.export_snapshots
         where household_id = ${sqlLiteral(householdId)}::uuid
           and idempotency_key = ${sqlLiteral(idempotencyKey)};`
      )
    ),
    1
  );
  assert.equal(
    Number(
      operatorSql(
        `select count(*)
         from storage.objects
         where bucket_id = 'exports'
           and name like ${sqlLiteral(`${householdId}/%`)};`
      )
    ),
    1,
    "same-key concurrency must store one immutable object"
  );

  const retry = await createExport(ownerToken, {
    format: "json-manifest",
    redacted: false,
    idempotencyKey
  });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.exportId, complete.payload.exportId);

  const conflict = await createExport(ownerToken, {
    format: "pdf",
    redacted: false,
    idempotencyKey
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.payload.error.code, "IDEMPOTENCY_CONFLICT");

  const status = await api(
    `/exports/${complete.payload.exportId}`,
    ownerToken
  );
  assert.equal(status.response.status, 200);
  assert.deepEqual(status.payload, complete.payload);

  const download = await api(
    `/exports/${complete.payload.exportId}/download`,
    ownerToken,
    { headers: { Accept: "application/json" } }
  );
  assert.equal(download.response.status, 200);
  assert.equal(download.payload.byteLength, complete.payload.byteSize);
  assert.equal(sha256(download.payload), complete.payload.checksumSha256);
  const manifest = JSON.parse(
    new TextDecoder().decode(download.payload)
  );
  assert.equal(manifest.schema, "alyr.continuity-manifest");
  assert.equal(manifest.summary.assets, 1);
  assert.equal(manifest.summary.liabilities, 1);
  assert.equal(manifest.summary.liabilityReviews, 1);
  assert.equal(manifest.summary.valueAssertions, 2);
  assert.equal(manifest.records.assets[0].description, "Private free-text description");
  assert.equal(
    manifest.records.liabilities[0].name,
    "Private home mortgage"
  );
  assert.equal(
    manifest.records.liabilityReviews[0].status,
    "none-confirmed"
  );
  assert.equal(manifest.records.places[0].latitude, 25.3);
  assert.equal(
    Number(
      manifest.records.valueAssertions.find(
        (record) => record.subject_kind === "asset"
      ).amount_minor
    ),
    1250000
  );
  assert.equal(
    Number(
      manifest.records.valueAssertions.find(
        (record) => record.subject_kind === "liability"
      ).amount_minor
    ),
    925000
  );
  assert.equal(
    Object.hasOwn(manifest.records.blobs[0] ?? {}, "object_key"),
    false
  );

  const redacted = await createExport(ownerToken, {
    format: "json-manifest",
    redacted: true,
    idempotencyKey: randomUUID()
  });
  assert.equal(redacted.response.status, 201);
  const redactedDownload = await api(
    `/exports/${redacted.payload.exportId}/download`,
    ownerToken
  );
  const redactedManifest = JSON.parse(
    new TextDecoder().decode(redactedDownload.payload)
  );
  assert.equal(
    Object.hasOwn(redactedManifest.records.assets[0], "description"),
    false
  );
  assert.equal(
    Object.hasOwn(redactedManifest.records.places[0], "latitude"),
    false
  );
  assert.equal(
    Object.hasOwn(
      redactedManifest.records.valueAssertions.find(
        (record) => record.subject_kind === "asset"
      ),
      "amount_minor"
    ),
    false
  );
  assert.equal(
    redactedManifest.records.liabilities[0].name,
    "Liability"
  );
  assert.equal(
    Object.hasOwn(
      redactedManifest.records.valueAssertions.find(
        (record) => record.subject_kind === "liability"
      ),
      "amount_minor"
    ),
    false
  );

  const selective = await createExport(ownerToken, {
    format: "json-manifest",
    assetIds: [assetId],
    redacted: false,
    idempotencyKey: randomUUID()
  });
  assert.equal(selective.response.status, 201);
  const selectiveDownload = await api(
    `/exports/${selective.payload.exportId}/download`,
    ownerToken
  );
  const selectiveManifest = JSON.parse(
    new TextDecoder().decode(selectiveDownload.payload)
  );
  assert.equal(selectiveManifest.summary.assets, 1);
  assert.equal(selectiveManifest.summary.liabilities, 0);
  assert.equal(selectiveManifest.summary.liabilityReviews, 0);
  assert.deepEqual(selectiveManifest.records.liabilities, []);
  assert.deepEqual(selectiveManifest.records.liabilityReviews, []);
  assert.equal(
    selectiveManifest.records.valueAssertions.some(
      (record) =>
        record.subject_kind === "liability" ||
        Object.hasOwn(record, "liability_id")
    ),
    false
  );

  const pdf = await createExport(ownerToken, {
    format: "pdf",
    redacted: false,
    idempotencyKey: randomUUID()
  });
  assert.equal(pdf.response.status, 201);
  const pdfDownload = await api(
    `/exports/${pdf.payload.exportId}/download`,
    ownerToken,
    { headers: { Accept: "application/pdf" } }
  );
  const pdfAscii = new TextDecoder("latin1").decode(pdfDownload.payload);
  assert.ok(pdfAscii.startsWith("%PDF-1.7"));
  assert.match(pdfAscii, /heldat-manifest\.json/u);
  assert.match(pdfAscii, /startxref/u);
  assert.equal(sha256(pdfDownload.payload), pdf.payload.checksumSha256);
  if (process.env.ALYR_EXPORT_PDF_PATH) {
    await writeFile(
      process.env.ALYR_EXPORT_PDF_PATH,
      pdfDownload.payload
    );
  }

  const viewerToken = await accessToken(viewerEmail);
  const viewerCreate = await createExport(viewerToken, {
    format: "json-manifest",
    redacted: true,
    idempotencyKey: randomUUID()
  });
  assert.equal(viewerCreate.response.status, 403);
  const viewerDownload = await api(
    `/exports/${complete.payload.exportId}/download`,
    viewerToken
  );
  assert.equal(viewerDownload.response.status, 404);

  console.log(
    JSON.stringify({
      status: "pass",
      checks: 47,
      ownerMembershipId,
      formats: ["json-manifest", "pdf"],
      authorization: ["owner-ready", "viewer-denied"],
      integrity: "sha256-device-reverified"
    })
  );
} finally {
  if (householdId) {
    try {
      const snapshotObjectKeys = operatorSql(
        `select object_key
         from public.export_snapshots
         where household_id = ${sqlLiteral(householdId)}::uuid
           and object_key is not null
         order by object_key;`
      );
      exportObjectKeys.push(
        ...snapshotObjectKeys.split(/\r?\n/u).filter(Boolean)
      );
    } catch {
      // Preserve the primary integration-test result if teardown inspection
      // itself is interrupted.
    }
  }
  const uniqueObjectKeys = [...new Set(exportObjectKeys)];
  if (uniqueObjectKeys.length > 0) {
    await service.storage.from("exports").remove(uniqueObjectKeys);
  }
  if (householdId) {
    operatorSql(
      `delete from public.households
       where id = ${sqlLiteral(householdId)}::uuid;`
    );
  }
  if (viewerId) {
    await service.auth.admin.deleteUser(viewerId, false);
  }
  if (ownerId) {
    await service.auth.admin.deleteUser(ownerId, false);
  }
}
