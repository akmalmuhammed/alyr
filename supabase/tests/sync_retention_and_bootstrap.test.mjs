import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607310004_sync_retention_and_bootstrap.sql",
    import.meta.url,
  ),
  "utf8",
);

test("sync lifecycle state is tenant-bound, private, and capacity-bounded", () => {
  assert.match(
    migration,
    /create table public\.sync_household_state[\s\S]*household_id uuid primary key[\s\S]*retained_after_cursor bigint[\s\S]*head_cursor bigint[\s\S]*operation_count bigint[\s\S]*operation_bytes bigint/,
  );
  assert.match(
    migration,
    /soft_operation_limit integer not null default 50000[\s\S]*hard_operation_limit integer not null default 100000[\s\S]*soft_byte_limit bigint not null default 67108864[\s\S]*hard_byte_limit bigint not null default 134217728/,
  );
  assert.match(
    migration,
    /alter table public\.sync_household_state enable row level security;[\s\S]*force row level security;[\s\S]*revoke all on table public\.sync_household_state[\s\S]*authenticated/,
  );
});

test("every active device has a monotonic household checkpoint", () => {
  assert.match(
    migration,
    /create table public\.sync_device_checkpoints[\s\S]*acknowledged_cursor bigint[\s\S]*last_delivered_cursor bigint[\s\S]*last_delivered_cursor >= acknowledged_cursor[\s\S]*primary key \(household_id, device_id\)/,
  );
  assert.match(
    migration,
    /create or replace function public\.acknowledge_sync_checkpoint[\s\S]*p_cursor > v_checkpoint\.last_delivered_cursor[\s\S]*INVALID_CURSOR_ACKNOWLEDGEMENT[\s\S]*acknowledged_cursor = greatest/,
  );
  assert.match(
    migration,
    /create index sync_device_checkpoints_retention[\s\S]*acknowledged_cursor/,
  );
});

test("pushes from a device removed from retention require reseeding", () => {
  assert.match(
    migration,
    /alter function public\.apply_sync_operation\(jsonb\)[\s\S]*rename to apply_sync_operation_dispatch_v202607310003/,
  );
  assert.match(
    migration,
    /create or replace function public\.apply_sync_operation\(p_operation jsonb\)[\s\S]*ensure_sync_device[\s\S]*reseed_required_at is not null[\s\S]*SYNC_RESEED_REQUIRED[\s\S]*apply_sync_operation_dispatch_v202607310003/,
  );
});

test("incremental pulls scan and return deterministic bounded pages", () => {
  assert.match(
    migration,
    /create or replace function public\.pull_sync_page[\s\S]*least\(greatest\(p_limit, 1\), 250\)[\s\S]*order by operation\.cursor, operation\.id[\s\S]*limit v_limit/,
  );
  assert.match(
    migration,
    /'mode', 'reseed-required'[\s\S]*'reason', v_checkpoint\.reseed_reason[\s\S]*'retainedAfterCursor'[\s\S]*'headCursor'/,
  );
  assert.match(
    migration,
    /'mode', 'incremental'[\s\S]*'hasMore', v_next < v_state\.head_cursor/,
  );
});

test("stale cursor and generation mismatch never produce partial history", () => {
  assert.match(
    migration,
    /p_generation is not null and p_generation <> v_state\.generation[\s\S]*reseed_reason = 'generation-mismatch'/,
  );
  assert.match(
    migration,
    /v_after < v_state\.retained_after_cursor[\s\S]*reseed_reason = 'cursor-expired'/,
  );
  assert.match(
    migration,
    /create or replace function public\.pull_sync_batch[\s\S]*v_after < v_state\.retained_after_cursor[\s\S]*SYNC_RESEED_REQUIRED/,
  );
});

test("bootstrap snapshots are materialized, ordered, bounded, and provider-neutral", () => {
  assert.match(
    migration,
    /create table public\.sync_bootstrap_sessions[\s\S]*item_count integer[\s\S]*between 0 and 100000/,
  );
  assert.match(
    migration,
    /create table public\.sync_bootstrap_items[\s\S]*primary key \(session_id, sequence\)/,
  );
  assert.match(
    migration,
    /create or replace function public\.begin_sync_reseed[\s\S]*pg_advisory_xact_lock[\s\S]*with canonical_records as[\s\S]*row_number\(\) over \([\s\S]*order by record\.entity_rank, record\.entity_id/,
  );
  assert.match(
    migration,
    /'blob-object'[\s\S]*'checksum_sha256', blob\.checksum_sha256[\s\S]*'status', blob\.status/,
  );
  const bootstrapBody = migration.slice(
    migration.indexOf("create or replace function public.begin_sync_reseed"),
    migration.indexOf(
      "create or replace function public.pull_sync_bootstrap_page",
    ),
  );
  assert.doesNotMatch(bootstrapBody, /'object_key'|blob\.object_key/);
});

test("bootstrap pages support exact retry but not skipped sequences", () => {
  assert.match(
    migration,
    /v_exact_retry :=[\s\S]*last_page_after_sequence = p_after_sequence[\s\S]*last_page_limit = v_limit/,
  );
  assert.match(
    migration,
    /not v_exact_retry[\s\S]*p_after_sequence <> v_session\.last_delivered_sequence[\s\S]*INVALID_BOOTSTRAP_CURSOR/,
  );
  assert.match(
    migration,
    /least\(greatest\(p_limit, 1\), 250\)/,
  );
});

test("reseed completion requires every delivered page and atomically reactivates the checkpoint", () => {
  assert.match(
    migration,
    /create or replace function public\.complete_sync_reseed[\s\S]*p_final_sequence <> v_session\.item_count[\s\S]*last_delivered_sequence <> v_session\.item_count[\s\S]*SYNC_BOOTSTRAP_INCOMPLETE/,
  );
  assert.match(
    migration,
    /v_session\.anchor_cursor < v_state\.retained_after_cursor[\s\S]*SYNC_RESEED_RESTART_REQUIRED/,
  );
  assert.match(
    migration,
    /status = 'active'[\s\S]*acknowledged_cursor = v_session\.anchor_cursor[\s\S]*reseed_required_at = null[\s\S]*status = 'completed'/,
  );
});

test("retention excludes inactive devices only after marking them for reseed", () => {
  assert.match(
    migration,
    /create or replace function public\.maintain_household_sync_retention[\s\S]*status = 'stale'[\s\S]*reseed_reason = 'inactive-device'[\s\S]*checkpoint\.last_seen_at < now\(\) - p_offline_grace/,
  );
  assert.match(
    migration,
    /select min\(checkpoint\.acknowledged_cursor\)[\s\S]*checkpoint\.status = 'active'[\s\S]*checkpoint\.reseed_required_at is null/,
  );
});

test("open bootstrap anchors pin compaction until their replacement is complete", () => {
  assert.match(
    migration,
    /select min\(session\.anchor_cursor\)[\s\S]*session\.status = 'open'[\s\S]*session\.expires_at > now\(\)[\s\S]*v_safe_cursor := least/,
  );
});

test("event and idempotency deletion is bounded behind the safe cursor", () => {
  assert.match(
    migration,
    /operation\.cursor <= v_safe_cursor[\s\S]*operation\.received_at[\s\S]*greatest\(p_min_event_age, p_idempotency_retention\)[\s\S]*limit p_operation_limit/,
  );
  assert.match(
    migration,
    /total_operations_pruned[\s\S]*retained_after_cursor = greatest/,
  );
  assert.match(
    migration,
    /event\.event_name like 'sync\.%'[\s\S]*event\.created_at < now\(\) - p_audit_retention[\s\S]*not exists[\s\S]*operation\.id::text = event\.metadata->>'operationId'/,
  );
});

test("maintenance and capacity telemetry are service-only and paginated", () => {
  assert.match(
    migration,
    /create table public\.sync_retention_runs/,
  );
  assert.match(
    migration,
    /create or replace function public\.read_sync_capacity_page[\s\S]*p_limit > 200[\s\S]*order by state\.household_id[\s\S]*limit p_limit/,
  );
  for (const signature of [
    String.raw`public\.maintain_household_sync_retention`,
    String.raw`public\.purge_expired_sync_bootstraps`,
    String.raw`public\.read_sync_capacity_page`,
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function ${signature}[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute on function ${signature}[\\s\\S]*?to service_role;`,
      ),
    );
  }
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.(?:maintain_household_sync_retention|purge_expired_sync_bootstraps|read_sync_capacity_page)[\s\S]{0,220}to authenticated/,
  );
});
