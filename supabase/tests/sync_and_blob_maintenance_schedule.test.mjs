import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/202607310007_sync_and_blob_maintenance_schedule.sql",
  import.meta.url,
);

const migration = await readFile(migrationUrl, "utf8");
const api = await readFile(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);
const requestControls = await readFile(
  new URL("../functions/_shared/requestControls.ts", import.meta.url),
  "utf8",
);

test("sync maintenance is service-only, bounded, and fair", () => {
  assert.match(
    migration,
    /create or replace function public\.maintain_due_sync_households\(/u,
  );
  assert.match(migration, /if auth\.role\(\) <> 'service_role'/u);
  assert.match(migration, /p_limit > 50/u);
  assert.match(migration, /p_due_interval < interval '15 minutes'/u);
  assert.match(
    migration,
    /order by state\.last_compacted_at asc nulls first, state\.household_id[\s\S]*for update skip locked/u,
  );
  assert.match(
    migration,
    /public\.purge_expired_sync_bootstraps\(100\)/u,
  );
  assert.match(
    migration,
    /public\.maintain_household_sync_retention\(v_household_id\)/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.maintain_due_sync_households\(integer, interval\)[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.maintain_due_sync_households\(integer, interval\)[\s\S]*to service_role/u,
  );
});

test("launch mode reader exposes no quotas and remains service-only", () => {
  assert.match(
    migration,
    /create or replace function public\.read_launch_enrollment_mode\(\)[\s\S]*returns table\(signup_mode text, config_version bigint\)/u,
  );
  assert.match(
    migration,
    /read_launch_enrollment_mode\(\)[\s\S]*if auth\.role\(\) <> 'service_role'/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.read_launch_enrollment_mode\(\)[\s\S]*from public, anon, authenticated, supabase_auth_admin[\s\S]*grant execute[\s\S]*to service_role/u,
  );
  assert.doesNotMatch(
    migration.match(/create or replace function public\.read_launch_enrollment_mode\(\)[\s\S]*?comment on function public\.read_launch_enrollment_mode\(\)/u)?.[0] ?? "",
    /max_registered_users|max_households|max_attachment_bytes|storage_limit/u,
  );
  assert.match(
    api,
    /client\.rpc\("read_launch_enrollment_mode"\)[\s\S]*error\?\.code === "PGRST202"[\s\S]*signupMode: "closed_pilot"/u,
  );
});

test("scheduled jobs reuse Vault secrets without embedding credentials", () => {
  assert.match(migration, /heldat-sync-retention-quarter-hour/u);
  assert.match(migration, /heldat-blob-maintenance-quarter-hour/u);
  assert.match(migration, /3,18,33,48 \* \* \* \*/u);
  assert.match(migration, /11,26,41,56 \* \* \* \*/u);
  assert.match(migration, /vault\.decrypted_secrets/u);
  assert.match(migration, /heldat_maintenance_url/u);
  assert.match(migration, /alyr_export_maintenance_url/u);
  assert.match(migration, /heldat_maintenance_token/u);
  assert.match(migration, /alyr_export_maintenance_token/u);
  assert.match(migration, /'\/maintenance\/sync'/u);
  assert.match(migration, /'\/maintenance\/blobs'/u);
  assert.match(migration, /'X-Heldat-Maintenance-Token'/u);
  assert.doesNotMatch(migration, /eyJ[A-Za-z0-9_-]{20,}/u);
});

test("the scheduled sync route is token protected and rate limited", () => {
  assert.match(
    api,
    /async function handleSyncMaintenance\(request: Request\)[\s\S]*maintenanceTokenMatches\(suppliedToken\)/u,
  );
  assert.match(
    api,
    /client\.rpc\("maintain_due_sync_households", \{[\s\S]*p_limit: 20,[\s\S]*p_due_interval: "24 hours"/u,
  );
  assert.match(
    api,
    /request\.method === "POST" &&[\s\S]{0,100}path === "\/maintenance\/sync"[\s\S]{0,100}handleSyncMaintenance\(request\)/u,
  );
  assert.match(requestControls, /"POST \/maintenance\/sync"/u);
  assert.match(requestControls, /routeGroup: "maintenance\.sync"/u);
});
