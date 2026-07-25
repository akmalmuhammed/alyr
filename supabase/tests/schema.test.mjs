import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/202607250001_initial_schema.sql",
  import.meta.url,
);
const functionUrl = new URL("../functions/api/index.ts", import.meta.url);
const configUrl = new URL("../config.toml", import.meta.url);

const migration = await readFile(migrationUrl, "utf8");
const apiFunction = await readFile(functionUrl, "utf8");
const config = await readFile(configUrl, "utf8");

test("all tenant tables are covered by the RLS enablement list", () => {
  const tenantTables = [
    "households",
    "memberships",
    "devices",
    "places",
    "spaces",
    "assets",
    "asset_location_revisions",
    "evidence",
    "blob_objects",
    "evidence_versions",
    "invites",
    "sync_operations",
    "audit_events",
    "export_snapshots",
    "product_events",
  ];

  for (const table of tenantTables) {
    assert.match(
      migration,
      new RegExp(`['"]${table}['"]`),
      `${table} should appear in the RLS migration`,
    );
  }
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
});

test("sync writes are versioned, idempotent, and actor-bound", () => {
  assert.match(migration, /apply_sync_operation/);
  assert.match(migration, /VERSION_CONFLICT/);
  assert.match(migration, /LOCATION_CONFLICT/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /idempotent/);
  assert.match(migration, /client_created_at/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /octet_length\(p_operation::text\) > 1048576/);
  assert.match(migration, /length\(v_idempotency_key\) > 128/);
  assert.match(
    apiFunction,
    /earlier acknowledgements remain valid/i,
  );
});

test("analytics schema mirrors the event allow-list and rejects free text", () => {
  for (const requiredVocabulary of [
    "creationMode",
    "locationPrecision",
    "evidenceKind",
    "assetCountBand",
    "annualizedValueBand",
  ]) {
    assert.match(migration, new RegExp(`'${requiredVocabulary}'`));
  }
  assert.match(migration, /SENSITIVE_ANALYTICS_PROPERTY/);
  assert.match(migration, /INVALID_ANALYTICS_PROPERTY_VALUE/);
  assert.match(migration, /jsonb_typeof\(new\.properties\)/);
});

test("evidence storage is private, household-scoped, and size limited", () => {
  assert.match(migration, /insert into storage\.buckets/);
  assert.match(migration, /'evidence'/);
  assert.match(migration, /false,\s*10485760/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(migration, /can_edit_household/);
  assert.match(migration, /metadata->>'size'/);
  assert.match(migration, /blob\.status = 'stored'/);
  assert.match(migration, /for update/);
  assert.match(migration, /create_blob_upload_intent/);
  assert.match(migration, /mark_blob_stored/);
  assert.match(migration, /expected_evidence_id/);
  assert.match(migration, /expected_evidence_version_id/);
  assert.match(migration, /intent_expires_at > now\(\)/);
  assert.match(migration, /if v_blob\.status = 'stored' then/);
  assert.doesNotMatch(
    migration,
    /status in \('uploaded-pending-verification', 'stored'\)/,
  );
  assert.match(config, /schemas = \["public"\]/);
  assert.doesNotMatch(config, /schemas = \[[^\]]*"storage"/);
});

test("edge errors and request versions stay inside the shared contract", () => {
  assert.match(apiFunction, /function requireApiVersion/);
  assert.match(apiFunction, /UNSUPPORTED_CONTRACT_VERSION/);
  assert.match(apiFunction, /AUTHENTICATION_REQUIRED/);
  assert.match(apiFunction, /SESSION_EXPIRED/);
  assert.doesNotMatch(apiFunction, /"AUTH_REQUIRED"/);
  assert.doesNotMatch(apiFunction, /"SESSION_INVALID"/);
  assert.doesNotMatch(apiFunction, /"INVALID_SYNC_CURSOR"/);
});

test("the edge function confines service authority to verified completion", () => {
  assert.match(apiFunction, /SUPABASE_ANON_KEY/);
  assert.match(apiFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(apiFunction, /Authorization/);
  assert.match(apiFunction, /createSignedUploadUrl/);
  assert.match(apiFunction, /\.download\(blob\.object_key\)/);
  assert.match(apiFunction, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(apiFunction, /verificationClient\.rpc\(\s*"mark_blob_stored"/);
  assert.match(apiFunction, /create_blob_upload_intent/);
  assert.match(
    migration,
    /grant execute on function public\.mark_blob_stored\([^)]+\) to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.mark_blob_stored\([^)]+\) to authenticated/i,
  );
  assert.match(migration, /41943040/);
  assert.match(migration, /PILOT_CAPACITY_REACHED/);
});
