import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607280007_household_creation_idempotency.sql",
    import.meta.url,
  ),
  "utf8",
);
const hardeningMigration = await readFile(
  new URL(
    "../migrations/202607280008_household_creation_scope_and_bounds.sql",
    import.meta.url,
  ),
  "utf8",
);
const apiFunction = await readFile(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);
const openApi = await readFile(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);

test("household creation persists one caller-stable server receipt", () => {
  assert.match(
    migration,
    /create table public\.household_creation_operations\s*\([\s\S]*operation_id uuid primary key[\s\S]*user_id uuid not null[\s\S]*household_id uuid not null/u,
  );
  assert.match(
    migration,
    /alter table public\.household_creation_operations force row level security/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.household_creation_operations\s+from anon, authenticated/u,
  );
  assert.match(
    migration,
    /drop function public\.create_household\(text\)/u,
  );
  assert.match(
    hardeningMigration,
    /create function public\.create_household\(\s*p_name text,\s*p_operation_id uuid,\s*p_household_id uuid\s*\)/u,
  );
});

test("recovery is household-specific and runs before quota", () => {
  const receiptLookup = hardeningMigration.indexOf(
    "from public.household_creation_operations",
  );
  const scopedRecovery = hardeningMigration.indexOf(
    "where id = p_household_id",
  );
  const quotaCheck = hardeningMigration.indexOf(
    "if v_existing_households >= v_enrollment.max_households then",
  );
  assert.ok(receiptLookup >= 0);
  assert.ok(scopedRecovery > receiptLookup);
  assert.ok(quotaCheck > scopedRecovery);
  assert.match(
    hardeningMigration,
    /v_receipt\.request_name is distinct from v_name[\s\S]*v_receipt\.household_id is distinct from p_household_id[\s\S]*IDEMPOTENCY_CONFLICT/u,
  );
  assert.match(
    hardeningMigration,
    /v_receipt\.household_id[\s\S]*active_household_id[\s\S]*return v_household/u,
  );
  assert.match(
    hardeningMigration,
    /v_existing_households >= v_enrollment\.max_households/u,
  );
  assert.match(hardeningMigration, /v_pilot_households >= 20/u);
  assert.doesNotMatch(hardeningMigration, /v_incomplete_households/u);
  assert.match(
    hardeningMigration,
    /onboarding_completed_at is not null/u,
  );
});

test("receipt aliases are retained, throttled, and cleaned within a hard bound", () => {
  assert.match(
    hardeningMigration,
    /created_at < now\(\) - interval '30 days'/u,
  );
  assert.match(
    hardeningMigration,
    /where user_id = v_user_id\s+and household_id = p_household_id[\s\S]*v_receipt_count >= 8[\s\S]*HOUSEHOLD_OPERATION_LIMIT/u,
  );
  assert.match(
    hardeningMigration,
    /household_creation_operations_actor_household_created/u,
  );
});

test("HTTP and OpenAPI require and echo the operation receipt", () => {
  assert.match(
    apiFunction,
    /"apiVersion", "operationId", "householdId", "name"/u,
  );
  assert.match(
    apiFunction,
    /p_name: name,\s*p_operation_id: operationId,\s*p_household_id: householdId/u,
  );
  assert.match(
    apiFunction,
    /return json\(\{ operationId, household: data \}, 201\)/u,
  );
  assert.match(
    apiFunction,
    /idempotencyConflict[\s\S]*"IDEMPOTENCY_CONFLICT"/u,
  );
  assert.match(
    apiFunction,
    /operationLimited[\s\S]*\? 429[\s\S]*operationLimited,\s*\);/u,
  );
  assert.match(
    openApi,
    /CreateHouseholdRequest:[\s\S]*required: \[apiVersion, operationId, householdId, name\]/u,
  );
  assert.match(
    openApi,
    /description: >\s*Durable household-creation receipt[\s\S]*required: \[operationId, household\]/u,
  );
});
