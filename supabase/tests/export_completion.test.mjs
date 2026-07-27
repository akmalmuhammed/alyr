import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607270005_export_completion.sql",
    import.meta.url
  ),
  "utf8"
);
const apiIndex = await readFile(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8"
);
const exportHandler = await readFile(
  new URL("../functions/api/export.ts", import.meta.url),
  "utf8"
);
const openapi = await readFile(
  new URL("../openapi.yaml", import.meta.url),
  "utf8"
);
const nativeAdapter = await readFile(
  new URL(
    "../../asset-continuity-native/src/adapters/httpCloudExport.ts",
    import.meta.url
  ),
  "utf8"
);
const nativeScreen = await readFile(
  new URL(
    "../../asset-continuity-native/app/export-create.tsx",
    import.meta.url
  ),
  "utf8"
);

test("export persistence is private, bounded and idempotent", () => {
  assert.match(
    migration,
    /create unique index if not exists export_snapshots_idempotency/u
  );
  assert.match(
    migration,
    /create or replace function public\.create_export_snapshot\(\s*p_household_id uuid,\s*p_scope jsonb,\s*p_idempotency_key text,\s*p_request_hash text/u
  );
  assert.match(
    migration,
    /drop function if exists public\.create_export_snapshot\(uuid, jsonb\)/u
  );
  assert.match(
    migration,
    /values \(\s*'exports',\s*'exports',\s*false,\s*5242880/u
  );
  assert.doesNotMatch(
    migration,
    /create policy[\s\S]{0,200}bucket_id\s*=\s*'exports'/u,
    "authenticated clients must not receive direct export Storage access"
  );
  assert.match(
    migration,
    /grant select, update on table public\.export_snapshots to service_role/u
  );
  assert.match(
    migration,
    /grant insert on table public\.audit_events to service_role/u
  );
  assert.doesNotMatch(
    migration,
    /grant[\s\S]{0,80}(?:insert|delete)[\s\S]{0,80}public\.export_snapshots to service_role/u
  );
});

test("export admission and rendering stay bounded under concurrency", () => {
  assert.match(
    migration,
    /pg_advisory_xact_lock\(\s*hashtextextended\('alyr-export:'/u
  );
  assert.match(migration, /v_retained_bytes >= 41943040/u);
  assert.match(migration, /v_active_count >= 24/u);
  assert.match(migration, /v_recent_count >= 6/u);
  assert.match(
    migration,
    /v_scope_key_count <> 3[\s\S]{0,120}\?& array\['format', 'assetIds', 'redacted'\]/u
  );
  assert.match(
    migration,
    /count\(\*\) <> count\(distinct lower\(value\)\)/u
  );
  assert.match(
    migration,
    /create or replace function public\.claim_export_snapshot\(/u
  );
  assert.match(
    migration,
    /processing_started_at < now\(\) - interval '5 minutes'/u
  );
  assert.match(
    migration,
    /create or replace function public\.complete_export_snapshot\(/u
  );
  assert.match(
    migration,
    /v_retained_bytes \+ p_byte_size > 41943040/u
  );
  assert.match(
    exportHandler,
    /claimedSnapshot\.processing_token === claimToken/u
  );
  assert.match(exportHandler, /upsert: false/u);
  assert.doesNotMatch(exportHandler, /upsert: true/u);
});

test("manifest acquisition is point-in-time and cleanup is pointer preserving", () => {
  assert.match(
    migration,
    /create or replace function public\.read_export_manifest_source\([\s\S]+?language sql\s+stable\s+security invoker/u
  );
  assert.match(
    migration,
    /'readAt', transaction_timestamp\(\)/u
  );
  assert.match(
    exportHandler,
    /context\.client\.rpc\(\s*"read_export_manifest_source"/u
  );
  assert.doesNotMatch(
    exportHandler,
    /context\.client\s*\.from\("(?:assets|places|spaces|evidence)"\)/u
  );
  assert.match(
    exportHandler,
    /if \(removal\.error\) \{\s*return current;\s*\}/u
  );
  assert.match(
    migration,
    /create table if not exists public\.export_object_cleanup_queue/u
  );
  assert.match(
    exportHandler,
    /export_object_cleanup_queue"\)\.insert/u
  );
  assert.match(
    apiIndex,
    /path === "\/maintenance\/exports"[\s\S]{0,100}handleExportMaintenance\(request\)/u
  );
  assert.match(
    exportHandler,
    /ALYR_EXPORT_MAINTENANCE_TOKEN/u
  );
  assert.match(
    exportHandler,
    /maximumMaintenanceBatch = 100/u
  );
  assert.match(
    migration,
    /cron\.schedule\(\s*'alyr-export-retention-daily',\s*'17 2 \* \* \*'/u
  );
  assert.match(
    migration,
    /alyr_export_maintenance_url[\s\S]+alyr_export_maintenance_token/u
  );
  assert.match(
    exportHandler,
    /\.eq\("object_key", objectKey\)\s*\.select\(snapshotColumns\)/u
  );
});

test("the Edge boundary creates, verifies and serves real export bytes", () => {
  assert.match(
    apiIndex,
    /handleExportCreate,\s*handleExportDownload,\s*handleExportGet/u
  );
  assert.match(
    apiIndex,
    /\^\\\/exports\\\/\[0-9a-f-\]\+\\\/download\$/u
  );
  assert.match(
    exportHandler,
    /context\.client\s*\.from\("export_snapshots"\)/u,
    "status authorization must use the caller-scoped RLS client"
  );
  assert.match(
    exportHandler,
    /serviceClient\.storage\s*\.from\("exports"\)\s*\.upload/u
  );
  assert.match(
    exportHandler,
    /verifiedChecksum !== artifact\.checksumSha256/u
  );
  assert.match(
    exportHandler,
    /X-ALYR-Checksum-SHA256/u
  );
  assert.match(
    exportHandler,
    /maximumExportBytes = 5 \* 1024 \* 1024/u
  );
  assert.doesNotMatch(exportHandler, /createSignedUrl/u);
});

test("the reviewed API contract exposes ready metadata and byte download", () => {
  assert.match(openapi, /\/exports\/\{exportId\}\/download:/u);
  assert.match(openapi, /assetIds:\s*\n\s*type: array\s*\n\s*maxItems: 500\s*\n\s*uniqueItems: true[\s\S]{0,80}format: uuid/u);
  assert.match(openapi, /Content-Length:[\s\S]{0,300}maximum: 5242880/u);
  assert.match(openapi, /"410":\s*\n\s*\$ref: "#\/components\/responses\/Gone"/u);
  assert.match(openapi, /"503":\s*\n\s*\$ref: "#\/components\/responses\/ServiceUnavailable"/u);
  for (const field of [
    "idempotencyKey",
    "fileName",
    "mimeType",
    "byteSize",
    "checksumSha256",
    "completedAt"
  ]) {
    assert.match(openapi, new RegExp(`${field}:`, "u"));
  }
});

test("the native client rechecks immutable bytes and presents the complete flow", () => {
  assert.match(nativeAdapter, /digestBytes\(bytes\)/u);
  assert.match(
    nativeAdapter,
    /checksum !== complete\.checksumSha256/u
  );
  assert.match(nativeAdapter, /bytes\.fill\(0\)/u);
  assert.match(nativeScreen, /accessibilityRole="radio"/u);
  assert.match(nativeScreen, /pendingOperationCount > 0/u);
  assert.match(nativeScreen, /Sharing\.shareAsync/u);
  assert.match(nativeScreen, /rendered\.bytes\.fill\(0\)/u);
});
