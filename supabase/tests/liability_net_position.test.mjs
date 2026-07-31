import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607280006_liability_net_position.sql",
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
const openApi = await readFile(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);
const generatedApi = await readFile(
  new URL(
    "../../packages/contracts/src/generated/api.ts",
    import.meta.url,
  ),
  "utf8",
);
const rootPackage = await readFile(
  new URL("../../package.json", import.meta.url),
  "utf8",
);

test("Liability masters and dated reviews are versioned soft-tombstone records", () => {
  assert.match(migration, /create table public\.liabilities \(/u);
  assert.match(migration, /create table public\.liability_reviews \(/u);
  assert.match(
    migration,
    /liabilities[\s\S]*version integer not null default 1[\s\S]*deleted_at timestamptz/u,
  );
  assert.match(
    migration,
    /liability_reviews[\s\S]*reviewed_at date not null[\s\S]*expires_at date not null[\s\S]*check \(expires_at = reviewed_at \+ 90\)/u,
  );
  assert.match(
    migration,
    /v_command = 'liability\.delete'[\s\S]*version = version \+ 1[\s\S]*deleted_at = now\(\)/u,
  );
  assert.doesNotMatch(
    migration,
    /delete from public\.liabilities/u,
  );
});

test("every value assertion has exactly one household-scoped subject", () => {
  assert.match(
    migration,
    /add column if not exists liability_id uuid/u,
  );
  assert.match(
    migration,
    /check \(num_nonnulls\(asset_id, place_id, liability_id\) = 1\)/u,
  );
  assert.match(
    migration,
    /foreign key \(household_id, liability_id\)[\s\S]*references public\.liabilities\(household_id, id\) on delete cascade/u,
  );
  assert.match(
    migration,
    /asset_value_assertions_household_liability_as_of/u,
  );
});

test("Liability writes are owner-only, idempotent, and stale-write protected", () => {
  assert.match(
    migration,
    /create or replace function public\.apply_liability_sync_operation/u,
  );
  assert.match(migration, /security definer/u);
  assert.match(
    migration,
    /if not public\.can_admin_household\(v_household\) then[\s\S]*PERMISSION_DENIED/u,
  );
  assert.match(migration, /pg_advisory_xact_lock/u);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/u);
  assert.match(migration, /VERSION_CONFLICT/u);
  assert.match(
    migration,
    /revoke all on function public\.apply_liability_sync_operation\(jsonb\)[\s\S]*from public, anon, authenticated/u,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.apply_liability_sync_operation\(jsonb\)/u,
  );
});

test("Liability privacy covers masters, reviews, balances, and the sync ledger", () => {
  assert.match(
    migration,
    /create policy liabilities_read[\s\S]*public\.can_admin_household\(household_id\)/u,
  );
  assert.match(
    migration,
    /create policy liability_reviews_read[\s\S]*public\.can_admin_household\(household_id\)/u,
  );
  assert.match(
    migration,
    /create policy asset_value_assertions_read[\s\S]*liability_id is null[\s\S]*public\.can_admin_household\(household_id\)/u,
  );
  assert.match(
    migration,
    /create policy sync_operations_read[\s\S]*command like 'liability\.%'.*command = 'liability-review\.set'[\s\S]*payload \? 'liabilityId'/su,
  );
  assert.match(
    migration,
    /create or replace function public\.pull_sync_operations[\s\S]*public\.can_admin_household\(p_household_id\)[\s\S]*operation\.payload \? 'liabilityId'/u,
  );
  assert.match(
    migration,
    /create or replace function public\.pull_sync_batch[\s\S]*'operations'[\s\S]*'nextCursor'[\s\S]*max\(operation\.cursor\) from eligible/u,
  );
  assert.match(
    api,
    /context\.client\.rpc\(\s*"pull_sync_batch"[\s\S]*batch\.nextCursor/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.liabilities[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant select on table public\.liabilities, public\.liability_reviews[\s\S]*to authenticated/u,
  );
});

test("Liability review never treats missing information as zero", () => {
  assert.match(
    migration,
    /v_payload->>'status' <> 'none-confirmed'/u,
  );
  assert.match(
    migration,
    /v_expires_at <> v_reviewed_at \+ 90/u,
  );
  assert.match(
    migration,
    /from public\.liabilities[\s\S]*lifecycle = 'active'[\s\S]*deleted_at is null[\s\S]*LIABILITY_REVIEW_CONFLICT/u,
  );
});

test("the dispatcher and Edge sync preserve Liability versions and tombstones", () => {
  assert.match(
    migration,
    /v_payload \? 'liabilityId'[\s\S]*apply_liability_sync_operation\(p_operation\)/u,
  );
  assert.match(
    migration,
    /v_command = 'value\.delete'[\s\S]*liability_id is not null[\s\S]*apply_liability_sync_operation\(p_operation\)/u,
  );
  assert.match(api, /liability: "liabilities"/u);
  assert.match(api, /"liability-review": "liability_reviews"/u);
  assert.match(
    api,
    /operation\.command === "value\.delete" \|\|[\s\S]*operation\.command === "liability\.delete"/u,
  );
  assert.match(api, /LIABILITY_REVIEW_CONFLICT/u);
});

test("full Recovery exports include Liability history while selective exports exclude it", () => {
  assert.match(
    migration,
    /household_liabilities as \([\s\S]*jsonb_array_length\(snapshot\.scope->'assetIds'\) = 0/u,
  );
  assert.match(
    migration,
    /household_liability_reviews as \([\s\S]*jsonb_array_length\(snapshot\.scope->'assetIds'\) = 0/u,
  );
  assert.match(
    migration,
    /value_assertion\.liability_id,[\s\S]*else 'liability'[\s\S]*liability\.id is not null/u,
  );
  assert.match(migration, /'liabilities', coalesce\(/u);
  assert.match(migration, /'liabilityReviews', coalesce\(/u);
  assert.match(
    exportHandler,
    /const liabilities = fullHousehold \? allLiabilities : \[\]/u,
  );
  assert.match(
    exportHandler,
    /const liabilityReviews = fullHousehold \? allLiabilityReviews : \[\]/u,
  );
  assert.match(
    exportHandler,
    /selectedLiabilityIds\.has\(liabilityId\)/u,
  );
});

test("redaction and generated API contracts cover Liability records", () => {
  assert.match(
    exportHandler,
    /name: "Liability"[\s\S]*redacted: true/u,
  );
  assert.match(
    exportHandler,
    /liability_id: value\.liability_id[\s\S]*currency: value\.currency/u,
  );
  assert.match(openApi, /- liability\.create/u);
  assert.match(openApi, /- liability\.delete/u);
  assert.match(openApi, /- liability-review\.set/u);
  assert.match(generatedApi, /"liability\.create"/u);
  assert.match(generatedApi, /"liability-review\.set"/u);
});

test("the Edge deployment command never applies approval-gated migrations", () => {
  assert.match(
    rootPackage,
    /deploy:supabase:api[\s\S]*functions deploy api/u,
  );
  const deploymentScript = JSON.parse(rootPackage).scripts["deploy:supabase:api"];
  assert.doesNotMatch(deploymentScript, /db push|migration (?:up|repair)|include-all/u);
});
