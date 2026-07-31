import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/202607310003_asset_category_primary_photo_sync.sql",
  import.meta.url,
);
const apiUrl = new URL("../functions/api/index.ts", import.meta.url);
const openApiUrl = new URL("../openapi.yaml", import.meta.url);

const [migration, api, openApi] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(apiUrl, "utf8"),
  readFile(openApiUrl, "utf8"),
]);

test("Asset category and primary-photo commands share the durable sync ledger", () => {
  assert.match(
    migration,
    /create or replace function public\.apply_asset_metadata_sync_operation/,
  );
  assert.match(migration, /'asset\.category\.set'/);
  assert.match(migration, /'asset\.primary-photo\.set'/);
  assert.match(migration, /public\.can_edit_household\(v_household\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /request_hash/);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /version = v_base_version/);
  assert.match(migration, /VERSION_CONFLICT/);
  assert.match(migration, /insert into public\.sync_operations/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.match(
    migration,
    /revoke all on function public\.apply_asset_metadata_sync_operation\(jsonb\)[\s\S]*from public, anon, authenticated/,
  );
});

test("primary photos are same-Asset verified media rather than arbitrary object references", () => {
  assert.match(
    migration,
    /add column if not exists primary_photo_evidence_id uuid/,
  );
  assert.match(
    migration,
    /asset_id = v_entity_id[\s\S]*kind = 'media'[\s\S]*storage_state = 'cloud-acknowledged'/,
  );
  assert.match(
    migration,
    /join public\.blob_objects blob[\s\S]*blob\.status = 'stored'/,
  );
  assert.match(migration, /PRIMARY_PHOTO_EVIDENCE_UNAVAILABLE/);
  assert.match(migration, /PRIMARY_PHOTO_EVIDENCE_NOT_READY/);
});

test("latest dispatcher and API preserve old routes while classifying Asset metadata conflicts", () => {
  assert.match(
    migration,
    /return public\.apply_asset_metadata_sync_operation\(p_operation\)/,
  );
  assert.match(
    migration,
    /return public\.apply_liability_sync_operation\(p_operation\)/,
  );
  assert.match(
    migration,
    /return public\.apply_place_document_sync_operation\(p_operation\)/,
  );
  assert.match(
    migration,
    /return public\.apply_property_value_sync_operation\(p_operation\)/,
  );
  assert.match(migration, /return public\.apply_sync_operation_core\(p_operation\)/);
  assert.match(
    api,
    /commandType === "asset\.category\.set"[\s\S]*commandType === "asset\.primary-photo\.set"[\s\S]*\? "metadata"/,
  );
  assert.match(openApi, /- asset\.category\.set/);
  assert.match(openApi, /- asset\.primary-photo\.set/);
  assert.match(openApi, /identifier, metadata, lifecycle/);
});
