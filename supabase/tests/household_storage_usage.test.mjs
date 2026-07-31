import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607310009_household_storage_usage_reader.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = await readFile(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);
const controls = await readFile(
  new URL("../functions/_shared/requestControls.ts", import.meta.url),
  "utf8",
);
const openapi = await readFile(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);
const contractApi = await readFile(
  new URL("../../packages/contracts/src/api.ts", import.meta.url),
  "utf8",
);
const ports = await readFile(
  new URL("../../packages/contracts/src/ports.ts", import.meta.url),
  "utf8",
);
const generatedApi = await readFile(
  new URL("../../packages/contracts/src/generated/api.ts", import.meta.url),
  "utf8",
);

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("the database reader is an active-member-only narrow projection", () => {
  assert.match(
    migration,
    /create or replace function public\.read_household_storage_usage\(\s*p_household_id uuid\s*\)[\s\S]*returns table\(\s*household_id uuid,\s*used_bytes bigint,\s*allowance_bytes bigint,\s*measured_at timestamptz\s*\)/u,
  );
  assert.match(migration, /security definer/u);
  assert.match(migration, /stable/u);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/u);
  assert.match(
    migration,
    /membership\.user_id = v_actor[\s\S]*membership\.status = 'active'[\s\S]*membership\.deleted_at is null[\s\S]*household\.deleted_at is null/u,
  );
  assert.match(migration, /if not found then\s*return;/u);
  assert.match(migration, /STORAGE_CONTROL_UNAVAILABLE/u);
  assert.match(
    migration,
    /revoke all on function public\.read_household_storage_usage\(uuid\)[\s\S]*from public, anon, authenticated, supabase_auth_admin, service_role[\s\S]*grant execute on function public\.read_household_storage_usage\(uuid\)[\s\S]*to authenticated/u,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.read_household_storage_usage\(uuid\)[\s\S]{0,80}to (?:anon|service_role)/u,
  );
});

test("the raw counter remains service-only", () => {
  assert.match(
    migration,
    /revoke all on table public\.household_storage_usage[\s\S]*from public, anon, authenticated, supabase_auth_admin/u,
  );
  assert.match(
    migration,
    /grant select on table public\.household_storage_usage to service_role/u,
  );
  assert.doesNotMatch(
    migration,
    /grant select on table public\.household_storage_usage to (?:anon|authenticated)/u,
  );
});

test("the authenticated GET is bounded, strictly validated, and privacy uniform", () => {
  const handler = section(
    api,
    "async function handleHouseholdStorageUsage(",
    "async function handleHouseholdAccessSnapshot(",
  );
  assert.match(handler, /queryEntries\.length === 1/u);
  assert.match(handler, /queryEntries\[0\]\?\.\[0\] === "householdId"/u);
  assert.match(handler, /url\.search\.length > 64/u);
  assert.match(handler, /uuidPattern\.test\(rawHouseholdId\)/u);
  assert.match(handler, /"read_household_storage_usage"/u);
  assert.match(handler, /data\.length === 0/u);
  assert.match(handler, /householdStorageAuthorizationDenied\(\)/u);
  assert.match(handler, /data\.length !== 1/u);
  assert.match(handler, /parseHouseholdStorageRpcRow\(data\[0\], householdId\)/u);
  assert.match(handler, /"Cache-Control": "no-store"/u);
  assert.match(
    handler,
    /householdId: usage\.household_id,\s*source: "server-confirmed",\s*usedBytes: usage\.used_bytes,\s*allowanceBytes: usage\.allowance_bytes,\s*measuredAt: usage\.measured_at/u,
  );
  for (const forbidden of [
    /fileName/u,
    /objectKey/u,
    /globalUsage/u,
    /reservation/u,
    /planId/u,
  ]) {
    assert.doesNotMatch(handler, forbidden);
  }
  assert.match(
    api,
    /function householdStorageAuthorizationDenied\(\)[\s\S]*"AUTHORIZATION_DENIED"[\s\S]*"You no longer have access to this household\."[\s\S]*403/u,
  );
  assert.match(
    api,
    /const context = await authenticate\(request\)[\s\S]*path === "\/household-storage"[\s\S]*handleHouseholdStorageUsage\(request, context\)/u,
  );
});

test("household storage has explicit user and shared-network rate limits", () => {
  assert.match(
    controls,
    /path === "\/household-storage"[\s\S]{0,180}routeGroup: "household\.storage\.read"[\s\S]{0,80}limit: 60[\s\S]{0,80}windowSeconds: 60/u,
  );
  assert.match(
    controls,
    /path === "\/household-storage"[\s\S]{0,220}routeGroup: "network\.authenticated\.household\.storage\.read"[\s\S]{0,80}limit: 600[\s\S]{0,80}windowSeconds: 60/u,
  );
});

test("OpenAPI and shared contracts expose exactly the audited response", () => {
  const openapiPath = section(
    openapi,
    "  /household-storage:",
    "  /household-access/member-role:",
  );
  for (const status of ["200", "400", "401", "403", "429", "503"]) {
    assert.match(openapiPath, new RegExp(`        "${status}":`, "u"));
  }
  assert.match(openapiPath, /operationId: getHouseholdStorageUsage/u);
  assert.match(openapiPath, /name: householdId[\s\S]*format: uuid/u);
  assert.match(openapiPath, /const: no-store/u);
  assert.match(
    openapiPath,
    /\$ref: "#\/components\/schemas\/HouseholdStorageUsageResponse"/u,
  );

  const schema = section(
    openapi,
    "    HouseholdStorageUsageResponse:",
    "    ExportCreateRequest:",
  );
  assert.match(schema, /additionalProperties: false/u);
  assert.match(
    schema,
    /required:\s*\[householdId, source, usedBytes, allowanceBytes, measuredAt\]/u,
  );
  for (const field of [
    "householdId",
    "source",
    "usedBytes",
    "allowanceBytes",
    "measuredAt",
  ]) {
    assert.match(schema, new RegExp(`        ${field}:`, "u"));
  }
  for (const forbidden of [
    "fileName",
    "objectKey",
    "globalUsage",
    "reservation",
    "plan",
  ]) {
    assert.doesNotMatch(schema, new RegExp(forbidden, "iu"));
  }

  assert.match(
    contractApi,
    /export interface HouseholdStorageUsageResponse \{\s*readonly householdId: HouseholdId;\s*readonly source: "server-confirmed";\s*readonly usedBytes: number;\s*readonly allowanceBytes: number;\s*readonly measuredAt: IsoDateTime;\s*\}/u,
  );
  assert.match(
    ports,
    /export interface HouseholdStorageUsagePort \{\s*getUsage\(\s*householdId: HouseholdId,\s*context\?: ProviderRequestContext,\s*\): Promise<Result<HouseholdStorageUsageResponse>>;\s*\}/u,
  );
  assert.match(generatedApi, /"\/household-storage":/u);
  assert.match(generatedApi, /getHouseholdStorageUsage:/u);
  assert.match(generatedApi, /HouseholdStorageUsageResponse:/u);
});
