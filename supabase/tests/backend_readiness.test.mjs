import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607310008_storage_accounting_and_readiness.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = await readFile(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);
const requestControls = await readFile(
  new URL("../functions/_shared/requestControls.ts", import.meta.url),
  "utf8",
);

test("one private counter accounts for Evidence, exports, and cleanup pointers", () => {
  assert.match(
    migration,
    /create table public\.household_storage_usage[\s\S]*retained_bytes bigint not null default 0/u,
  );
  assert.match(
    migration,
    /alter table public\.household_storage_usage force row level security/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.household_storage_usage[\s\S]*public, anon, authenticated, supabase_auth_admin/u,
  );
  for (const source of [
    "blob_objects",
    "blob_object_cleanup_queue",
    "export_snapshots",
    "export_object_cleanup_queue",
  ]) {
    assert.match(migration, new RegExp(`on public\\.${source}`, "u"));
  }
  assert.match(
    migration,
    /create table public\.account_deletion_storage_holds[\s\S]*retained_bytes bigint not null/u,
  );
  assert.match(
    migration,
    /create table public\.account_deletion_storage_objects[\s\S]*primary key \(provider, object_key\)/u,
  );
  assert.match(
    migration,
    /add column provider_delete_not_before timestamptz/u,
  );
  assert.match(
    migration,
    /create or replace function public\.record_blob_upload_authorization\([\s\S]*UPLOAD_AUTHORIZATION_INTENT_UNAVAILABLE/u,
  );
  assert.match(
    migration,
    /p_expires_at \+ interval '15 minutes'/u,
  );
  assert.match(
    migration,
    /where updated_at > now\(\) - interval '2 hours 15 minutes'/u,
  );
  assert.doesNotMatch(migration, /launch_global_storage_covers_retained_bytes/u);
});

test("retained-byte mutations serialize, reject drift, and share both quotas", () => {
  const triggerFunction = migration.match(
    /create or replace function public\.track_retained_storage_bytes\(\)[\s\S]*?revoke execute on function public\.track_retained_storage_bytes\(\)/u,
  )?.[0] ?? "";
  assert.match(triggerFunction, /heldat\.storage\.global-capacity/u);
  assert.match(triggerFunction, /for update/u);
  assert.match(triggerFunction, /STORAGE_COUNTER_DRIFT/u);
  assert.match(triggerFunction, /STORAGE_ACCOUNTING_KEY_IMMUTABLE/u);
  assert.match(triggerFunction, /STORAGE_POINTER_DOUBLE_COUNT/u);
  assert.match(
    triggerFunction,
    /if v_usage_present and v_household_present then/u,
  );
  assert.match(triggerFunction, /INVALID_FILE_SIZE/u);
  assert.match(triggerFunction, /HOUSEHOLD_STORAGE_LIMIT/u);
  assert.match(triggerFunction, /GLOBAL_STORAGE_LIMIT/u);
  assert.match(
    triggerFunction,
    /retained_storage_bytes = retained_storage_bytes \+ v_global_delta/u,
  );
  assert.match(triggerFunction, /v_capacity_admission/u);
  const serialization = triggerFunction.indexOf(
    "heldat.storage.global-capacity",
  );
  const householdSerialization = triggerFunction.indexOf(
    "heldat.storage.household:",
  );
  const crossPointerCheck = triggerFunction.indexOf(
    "from public.export_object_cleanup_queue",
  );
  assert.ok(
    householdSerialization >= 0 &&
      householdSerialization < serialization &&
      serialization < crossPointerCheck,
  );
  assert.match(triggerFunction, /STORAGE_UPLOAD_AUTHORIZATION_ACTIVE/u);
  assert.match(triggerFunction, /v_global_delta := 0/u);
  assert.match(triggerFunction, /account_deletion_storage_objects/u);
  assert.match(
    migration,
    /delete_account_domain_data_without_storage_hold[\s\S]*account_deletion_storage_holds/u,
  );
  const deletionWrapper = migration.match(
    /create or replace function public\.delete_account_domain_data\([\s\S]*?revoke all on function public\.delete_account_domain_data\(uuid, jsonb\)/u,
  )?.[0] ?? "";
  const firstPointerDrain = deletionWrapper.indexOf(
    "from public.blob_objects",
  );
  const householdGate = deletionWrapper.indexOf(
    "heldat.storage.household:",
  );
  const householdLock = deletionWrapper.indexOf("from public.households");
  const secondPointerDrain = deletionWrapper.indexOf(
    "from public.blob_objects",
    firstPointerDrain + 1,
  );
  const holdCreation = deletionWrapper.indexOf(
    "insert into public.account_deletion_storage_holds",
  );
  const cascade = deletionWrapper.indexOf(
    "delete_account_domain_data_without_storage_hold",
    holdCreation,
  );
  assert.ok(
    firstPointerDrain >= 0 &&
      firstPointerDrain < householdGate &&
      householdGate < householdLock &&
      householdLock < secondPointerDrain &&
      secondPointerDrain < holdCreation &&
      holdCreation < cascade,
  );
  assert.match(deletionWrapper, /STORAGE_UPLOAD_AUTHORIZATION_ACTIVE/u);
  const cleanupCompletion = migration.match(
    /create or replace function public\.complete_blob_object_cleanup\([\s\S]*?\n\$\$;/u,
  )?.[0] ?? "";
  const cleanupBlobLock = cleanupCompletion.indexOf(
    "from public.blob_objects",
  );
  const cleanupPointerLock = cleanupCompletion.indexOf(
    "from public.blob_object_cleanup_queue",
    cleanupBlobLock + 1,
  );
  assert.ok(
    cleanupBlobLock >= 0 &&
      cleanupBlobLock < cleanupPointerLock,
  );
  const deletionHoldTrigger = migration.match(
    /create or replace function public\.track_account_deletion_storage_hold_bytes\(\)[\s\S]*?revoke execute on function public\.track_account_deletion_storage_hold_bytes\(\)/u,
  )?.[0] ?? "";
  assert.doesNotMatch(deletionHoldTrigger, /GLOBAL_STORAGE_LIMIT/u);
  assert.match(
    migration,
    /create or replace function public\.release_account_deletion_storage_hold\([\s\S]*ACCOUNT_DELETION_JOB_MISSING[\s\S]*delete from public\.account_deletion_storage_holds/u,
  );
  const providerRelease = api.indexOf(
    '"release_account_deletion_storage_hold"',
  );
  const identityDeletion = api.indexOf("auth.admin.deleteUser");
  assert.ok(providerRelease >= 0 && providerRelease < identityDeletion);
});

test("upload admission no longer performs a global object SUM", () => {
  const uploadFunction = migration.match(
    /create or replace function public\.create_blob_upload_intent\([\s\S]*?\n\$\$;/u,
  )?.[0] ?? "";
  assert.match(uploadFunction, /v_controls\.max_attachment_bytes/u);
  assert.match(uploadFunction, /EVIDENCE_PARENT_NOT_FOUND/u);
  assert.match(uploadFunction, /UPLOAD_INTENT_CONFLICT/u);
  const blobScopedLock = uploadFunction.indexOf("heldat.blob-intent:");
  const householdGate = uploadFunction.indexOf("heldat.storage.household:");
  const householdLock = uploadFunction.indexOf("from public.households");
  const blobRowLock = uploadFunction.indexOf("from public.blob_objects");
  assert.ok(
    blobScopedLock >= 0 &&
      blobScopedLock < blobRowLock &&
      blobRowLock < householdGate &&
      householdGate < householdLock &&
      householdLock >= 0,
  );
  assert.doesNotMatch(uploadFunction, /heldat\.storage\.global-capacity/u);
  assert.doesNotMatch(uploadFunction, /sum\s*\(/iu);
  const completionFunction = migration.match(
    /create or replace function public\.mark_blob_stored\([\s\S]*?\n\$\$;/u,
  )?.[0] ?? "";
  const completionBlobLock = completionFunction.indexOf(
    "from public.blob_objects",
  );
  const completionHouseholdGate = completionFunction.indexOf(
    "heldat.storage.household:",
  );
  const completionHouseholdLock = completionFunction.indexOf(
    "from public.households",
  );
  assert.ok(
    completionBlobLock >= 0 &&
      completionBlobLock < completionHouseholdGate &&
      completionHouseholdGate < completionHouseholdLock,
  );
  const completionUpdate = completionFunction.match(
    /update public\.blob_objects[\s\S]*?returning \* into v_blob;/u,
  )?.[0] ?? "";
  assert.doesNotMatch(completionUpdate, /provider_delete_not_before/u);
  const signedUpload = api.indexOf("store.createSignedUpload");
  const recordedAuthorization = api.indexOf(
    '"record_blob_upload_authorization"',
  );
  const disclosedUpload = api.indexOf("uploadTarget: signedUpload");
  assert.ok(
    signedUpload >= 0 &&
      signedUpload < recordedAuthorization &&
      recordedAuthorization < disclosedUpload,
  );
  assert.match(api, /storageAccountingBusyResponse[\s\S]*Retry-After/u);
});

test("hot global maintenance and authorization paths have explicit indexes", () => {
  for (const index of [
    "api_rate_limit_buckets_expiry",
    "launch_signup_reservations_pending_expiry",
    "memberships_user_active_household",
    "evidence_versions_household_evidence_created",
    "invites_household_created",
    "audit_events_household_cursor",
    "export_snapshots_global_expiry",
    "export_cleanup_queue_global_created",
    "sync_household_state_compaction_due",
  ]) {
    assert.match(migration, new RegExp(`create index if not exists ${index}`, "u"));
  }
});

test("readiness telemetry is aggregate, service-only, and maintenance-token gated", () => {
  const summary = migration.match(
    /create or replace function public\.read_backend_readiness_summary\(\)[\s\S]*?comment on function public\.read_backend_readiness_summary\(\)/u,
  )?.[0] ?? "";
  assert.match(summary, /if auth\.role\(\) <> 'service_role'/u);
  assert.match(summary, /counterMatchesSource/u);
  assert.match(summary, /householdsAt50Percent/u);
  assert.match(summary, /householdsAt70Percent/u);
  assert.match(summary, /householdsAt85Percent/u);
  assert.match(summary, /globalOverLimit/u);
  assert.match(summary, /accountDeletionHoldBytes/u);
  assert.match(summary, /blockedHouseholds/u);
  assert.doesNotMatch(summary, /objectKey|fileName|emailHash/u);
  assert.match(
    api,
    /handleReadinessMaintenance\(request: Request\)[\s\S]*maintenanceTokenMatches\(suppliedToken\)[\s\S]*read_backend_readiness_summary/u,
  );
  assert.match(api, /path === "\/maintenance\/readiness"/u);
  assert.match(requestControls, /routeGroup: "maintenance\.readiness"/u);
});
