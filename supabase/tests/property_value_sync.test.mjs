import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607280004_owned_property_value_sync.sql",
    import.meta.url,
  ),
  "utf8",
);
const exportMigration = await readFile(
  new URL(
    "../migrations/202607280005_export_subjects.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = await readFile(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);
const exportHandler = await readFile(
  new URL("../functions/api/export.ts", import.meta.url),
  "utf8",
);
const contracts = await readFile(
  new URL("../../packages/contracts/src/sync.ts", import.meta.url),
  "utf8",
);
const provider = await readFile(
  new URL(
    "../../asset-continuity-native/src/state/WorkspaceProvider.tsx",
    import.meta.url,
  ),
  "utf8",
);
const foregroundSync = await readFile(
  new URL(
    "../../asset-continuity-native/src/data/foregroundSync.ts",
    import.meta.url,
  ),
  "utf8",
);

test("value assertions enforce exactly one household-scoped subject", () => {
  assert.match(
    migration,
    /alter column asset_id drop not null/,
  );
  assert.match(migration, /add column if not exists place_id uuid/);
  assert.match(
    migration,
    /check \(num_nonnulls\(asset_id, place_id\) = 1\)/,
  );
  assert.match(
    migration,
    /foreign key \(household_id, place_id\)[\s\S]*references public\.places\(household_id, id\) on delete cascade/,
  );
});

test("property values use a versioned and idempotent owned-Property RPC", () => {
  assert.match(
    migration,
    /create or replace function public\.apply_property_value_sync_operation/,
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /public\.can_edit_household\(v_household\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /VERSION_CONFLICT/);
  assert.match(
    migration,
    /kind in \('home', 'property'\)[\s\S]*tenure = 'owned'/,
  );
  assert.match(
    migration,
    /insert into public\.sync_operations[\s\S]*'value'/,
  );
  assert.match(
    migration,
    /revoke all on function public\.apply_property_value_sync_operation\(jsonb\)[\s\S]*from public, anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.apply_property_value_sync_operation\(jsonb\)/,
  );
  assert.match(
    migration,
    /grant execute on function public\.apply_sync_operation\(jsonb\)[\s\S]*to authenticated/,
  );
});

test("the API and native outbox route Place subjects without an Asset alias", () => {
  assert.match(
    migration,
    /create or replace function public\.apply_sync_operation[\s\S]*v_payload \? 'placeId'[\s\S]*apply_property_value_sync_operation/,
  );
  assert.match(
    api,
    /context\.client\.rpc\(\s*"apply_sync_operation"/,
  );
  assert.match(
    contracts,
    /export type ValueAssertionPayload[\s\S]*assetId[\s\S]*placeId/,
  );
  assert.match(
    provider,
    /const payload: ValueAssertionPayload[\s\S]*placeId: subject\.placeId/,
  );
  assert.doesNotMatch(
    provider,
    /current cloud value contract accepts item records only/,
  );
  assert.match(
    foregroundSync,
    /isOwnedPropertyPlace\(candidate\)/,
  );
  assert.doesNotMatch(
    foregroundSync,
    /portfolioValueSubject\(record\)\?\.kind === "place"[\s\S]{0,100}"on-device"/,
  );
});

test("cloud Recovery manifests preserve exact Asset or Place subjects", () => {
  assert.match(
    exportMigration,
    /value_assertion\.asset_id,\s*value_assertion\.place_id,[\s\S]*end as subject_kind/,
  );
  assert.match(
    exportMigration,
    /evidence_record\.asset_id,\s*evidence_record\.place_id,[\s\S]*end as subject_kind/,
  );
  assert.match(
    exportMigration,
    /value_assertion\.asset_id is not null[\s\S]*value_assertion\.place_id is null[\s\S]*or \([\s\S]*value_assertion\.asset_id is null[\s\S]*value_assertion\.place_id is not null/,
  );
  assert.match(
    exportMigration,
    /evidence_record\.asset_id is not null[\s\S]*evidence_record\.place_id is null[\s\S]*or \([\s\S]*evidence_record\.asset_id is null[\s\S]*evidence_record\.place_id is not null/,
  );
  assert.match(exportHandler, /function hasSelectedSubject\(/);
  assert.match(
    exportHandler,
    /record\.subject_kind === "asset"[\s\S]*record\.subject_kind === "place"/,
  );
  assert.match(
    exportHandler,
    /subject_kind: value\.subject_kind,[\s\S]*place_id: value\.place_id/,
  );
  assert.match(
    exportHandler,
    /subject_kind: item\.subject_kind,[\s\S]*place_id: item\.place_id/,
  );
});
