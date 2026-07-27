import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/202607250001_initial_schema.sql",
  import.meta.url,
);
const routingMigrationUrl = new URL(
  "../migrations/202607270001_household_routing_metadata.sql",
  import.meta.url,
);
const pilotSignupMigrationUrl = new URL(
  "../migrations/202607270003_pilot_signup_gate.sql",
  import.meta.url,
);
const accountDeletionMigrationUrl = new URL(
  "../migrations/202607270002_account_deletion.sql",
  import.meta.url,
);
const familyAdminMigrationUrl = new URL(
  "../migrations/202607270004_family_admin.sql",
  import.meta.url,
);
const recipientInviteMigrationUrl = new URL(
  "../migrations/202607280001_recipient_invite_signup.sql",
  import.meta.url,
);
const placeClassificationMigrationUrl = new URL(
  "../migrations/202607280002_place_portfolio_classification.sql",
  import.meta.url,
);
const placeDocumentMigrationUrl = new URL(
  "../migrations/202607280003_place_document_sync.sql",
  import.meta.url,
);
const functionUrl = new URL("../functions/api/index.ts", import.meta.url);
const configUrl = new URL("../config.toml", import.meta.url);

const migration = await readFile(migrationUrl, "utf8");
const routingMigration = await readFile(routingMigrationUrl, "utf8");
const pilotSignupMigration = await readFile(
  pilotSignupMigrationUrl,
  "utf8",
);
const accountDeletionMigration = await readFile(
  accountDeletionMigrationUrl,
  "utf8",
);
const familyAdminMigration = await readFile(
  familyAdminMigrationUrl,
  "utf8",
);
const recipientInviteMigration = await readFile(
  recipientInviteMigrationUrl,
  "utf8",
);
const placeClassificationMigration = await readFile(
  placeClassificationMigrationUrl,
  "utf8",
);
const placeDocumentMigration = await readFile(
  placeDocumentMigrationUrl,
  "utf8",
);
const apiFunction = await readFile(functionUrl, "utf8");
const config = await readFile(configUrl, "utf8");

test("auth allow-list matches the native callback scheme", () => {
  assert.match(config, /"alyr:\/\/callback"/);
  assert.match(config, /"alyr:\/\/reset-password"/);
  assert.doesNotMatch(config, /"alyr:\/\/auth\/callback"/);
});

test("closed-pilot signup is preflighted before account creation", () => {
  assert.match(
    pilotSignupMigration,
    /create table public\.pilot_signup_approvals/,
  );
  assert.match(pilotSignupMigration, /email_hash text not null unique/);
  assert.match(
    pilotSignupMigration,
    /access_code_hash text not null unique/,
  );
  assert.match(
    pilotSignupMigration,
    /enable row level security/,
  );
  assert.match(
    pilotSignupMigration,
    /force row level security/,
  );
  assert.match(
    pilotSignupMigration,
    /revoke all on table public\.pilot_signup_approvals from public, anon, authenticated/,
  );
  assert.match(
    pilotSignupMigration,
    /issue_pilot_signup_grant/,
  );
  assert.match(
    pilotSignupMigration,
    /grant execute on function public\.issue_pilot_signup_grant\(text, text\)\s+to service_role/,
  );
  assert.doesNotMatch(
    pilotSignupMigration,
    /grant execute on function public\.issue_pilot_signup_grant\(text, text\)[\s\S]{0,80}authenticated/,
  );
  assert.match(
    pilotSignupMigration,
    /after insert on auth\.users/,
  );
  assert.match(
    pilotSignupMigration,
    /insert into public\.pilot_enrollments/,
  );
  assert.match(
    pilotSignupMigration,
    /- array\['alyr_signup_channel', 'pilot_signup_grant'\]/,
  );
  assert.match(
    apiFunction,
    /path === "\/pilot\/preflight"[\s\S]*handlePilotPreflight\(request\)[\s\S]*const context = await authenticate\(request\)/,
  );
  assert.match(
    apiFunction,
    /serviceClient\.rpc\(\s*"issue_pilot_signup_grant"/,
  );
  assert.match(config, /\[functions\.api\][\s\S]*verify_jwt = false/);
});

test("household recipients cross signup without receiving household-creation authority", () => {
  assert.match(
    recipientInviteMigration,
    /create table public\.household_invite_signup_reservations/,
  );
  assert.match(
    recipientInviteMigration,
    /force row level security/,
  );
  assert.match(
    recipientInviteMigration,
    /revoke all on table public\.household_invite_signup_reservations[\s\S]{0,100}public, anon, authenticated/,
  );
  assert.match(
    recipientInviteMigration,
    /issue_household_invite_signup_grant/,
  );
  assert.match(
    recipientInviteMigration,
    /max_households,[\s\S]{0,320}\n\s*0,/,
  );
  assert.match(
    recipientInviteMigration,
    /v_reservation\.email_hash <>[\s\S]{0,120}digest\(v_user_email, 'sha256'\)/,
  );
  assert.match(
    recipientInviteMigration,
    /grant execute on function public\.issue_household_invite_signup_grant\(text, text\)[\s\S]{0,80}to service_role/,
  );
  assert.doesNotMatch(
    recipientInviteMigration,
    /grant execute on function public\.issue_household_invite_signup_grant\(text, text\)[\s\S]{0,80}to authenticated/,
  );
  assert.match(
    apiFunction,
    /path === "\/invites\/preflight"[\s\S]*handleHouseholdInvitePreflight\(request\)[\s\S]*const context = await authenticate\(request\)/,
  );
  assert.match(
    apiFunction,
    /serviceClient\.rpc\(\s*"issue_household_invite_signup_grant"/,
  );
});

test("all tenant tables are covered by the RLS enablement list", () => {
  const tenantTables = [
    "households",
    "memberships",
    "devices",
    "places",
    "spaces",
    "assets",
    "asset_value_assertions",
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

test("value assertions are household-scoped, versioned, and sync-only", () => {
  assert.match(migration, /create table public\.asset_value_assertions/);
  assert.match(
    migration,
    /foreign key \(household_id, asset_id\)[\s\S]*references public\.assets\(household_id, id\)/,
  );
  assert.match(migration, /amount_minor between 0 and 9007199254740991/);
  assert.match(migration, /currency ~ '\^\[A-Z\]\{3\}\$'/);
  assert.match(migration, /v_command = 'value\.create'/);
  assert.match(migration, /v_command = 'value\.update'/);
  assert.match(migration, /v_command = 'value\.delete'/);
  assert.match(
    migration,
    /v_command in \('value\.create', 'value\.update'\)[\s\S]*VALIDATION_FAILED/,
  );
  assert.match(
    migration,
    /asset_id = \(v_payload->>'assetId'\)::uuid[\s\S]*version = v_base_version/,
  );
  assert.match(apiFunction, /commandType\.startsWith\("value\."\)/);
  assert.match(apiFunction, /operation\.command === "value\.delete"/);
  assert.match(apiFunction, /place: "places"/);
  assert.match(apiFunction, /asset: "assets"/);
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
  assert.match(migration, /v_command = 'space\.update'/);
  assert.match(
    migration,
    /when v_payload \? 'name' then trim\(v_payload->>'name'\)[\s\S]*else name/,
  );
  assert.match(
    migration,
    /when v_payload \? 'latitude'[\s\S]*else latitude/,
  );
  assert.match(
    migration,
    /region_label = case[\s\S]*v_payload \? 'regionLabel'/,
  );
  assert.match(
    migration,
    /space\.update'[\s\S]*version = version \+ 1[\s\S]*version = v_base_version/,
  );
  assert.match(migration, /INVALID_SPACE_HIERARCHY/);
});

test("Place Portfolio classification is explicit and sync-authoritative", () => {
  assert.match(
    placeClassificationMigration,
    /create trigger sync_place_classification/,
  );
  assert.match(
    placeClassificationMigration,
    /new\.command in \('place\.create', 'place\.update'\)/,
  );
  assert.match(
    placeClassificationMigration,
    /'home', 'property', 'storage', 'temporary', 'other', 'unknown'/,
  );
  assert.match(
    placeClassificationMigration,
    /'owned', 'rented', 'managed', 'borrowed', 'unknown'/,
  );
  assert.match(
    placeClassificationMigration,
    /kind = coalesce\(v_kind, kind\)/,
  );
  assert.match(
    placeClassificationMigration,
    /tenure = coalesce\(v_tenure, tenure\)/,
  );
  assert.match(
    placeClassificationMigration,
    /revoke all on function public\.apply_place_classification_from_sync\(\)/,
  );
});

test("Place documents reuse immutable Evidence bytes with an explicit Place parent", () => {
  assert.match(
    placeDocumentMigration,
    /alter column asset_id drop not null/,
  );
  assert.match(placeDocumentMigration, /add column place_id uuid/);
  assert.match(
    placeDocumentMigration,
    /check \(num_nonnulls\(asset_id, place_id\) = 1\)/,
  );
  assert.match(
    placeDocumentMigration,
    /foreign key \(household_id, place_id\)[\s\S]*references public\.places\(household_id, id\)/,
  );
  assert.match(
    placeDocumentMigration,
    /'place-document\.create',[\s\S]*'place-document\.version\.add'/,
  );
  assert.match(
    placeDocumentMigration,
    /status = 'stored'[\s\S]*expected_evidence_id =[\s\S]*placeDocumentId[\s\S]*expected_evidence_version_id = v_entity_id/,
  );
  assert.match(
    placeDocumentMigration,
    /insert into public\.evidence_versions[\s\S]*v_document_version_number/,
  );
  assert.match(
    placeDocumentMigration,
    /pg_advisory_xact_lock[\s\S]*IDEMPOTENCY_CONFLICT/,
  );
  assert.match(
    placeDocumentMigration,
    /alter function public\.apply_sync_operation\(jsonb\)[\s\S]*rename to apply_sync_operation_core/,
  );
  assert.match(
    placeDocumentMigration,
    /revoke all on function public\.apply_sync_operation_core\(jsonb\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    placeDocumentMigration,
    /PLACE_DOCUMENT_COMMAND_REQUIRED/,
  );
  assert.match(
    apiFunction,
    /commandType === "place-document\.version\.add"[\s\S]*payload\.placeDocumentId/,
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

test("evidence downloads stay user-authenticated, RLS-scoped, and checksum-bound", () => {
  assert.match(
    apiFunction,
    /path === "\/evidence\/download"[\s\S]*handleEvidenceDownload\(request, context\)/,
  );
  assert.match(
    apiFunction,
    /handleEvidenceDownload[\s\S]*context\.client[\s\S]*from\("evidence"\)[\s\S]*from\("evidence_versions"\)[\s\S]*from\("blob_objects"\)/,
  );
  assert.match(
    apiFunction,
    /handleEvidenceDownload[\s\S]*context\.client\.storage[\s\S]*\.download\(blob\.object_key\)/,
  );
  assert.match(
    apiFunction,
    /handleEvidenceDownload[\s\S]*crypto\.subtle\.digest\("SHA-256", storedBytes\)/,
  );
  assert.match(apiFunction, /"Cache-Control": "no-store"/);
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

test("manual household invitations are owner-scoped and contract-bound", () => {
  assert.match(migration, /create_household_invite/);
  assert.match(migration, /can_admin_household\(p_household_id\)/);
  assert.match(migration, /p_ttl > interval '30 days'/);
  assert.match(migration, /digest\(v_code, 'sha256'\)/);
  assert.match(apiFunction, /path === "\/invites"/);
  assert.match(apiFunction, /role !== "editor" && role !== "viewer"/);
  assert.match(apiFunction, /expiresInHours > 30 \* 24/);
  assert.match(apiFunction, /Only a household owner can create an invitation/);
});

test("household onboarding is durable and provider-controlled", () => {
  assert.match(migration, /complete_household_onboarding/);
  assert.match(migration, /update auth\.users/);
  assert.match(migration, /raw_app_meta_data/);
  assert.match(migration, /'active_household_id'/);
  assert.match(migration, /'onboarding_complete'/);
  assert.match(migration, /HOUSEHOLD_ADMIN_REQUIRED/);
  assert.match(apiFunction, /path === "\/onboarding\/complete"/);
  assert.match(apiFunction, /complete_household_onboarding/);
});

test("household routing metadata is atomic, role-guarded, and retryable", () => {
  for (const field of [
    "active_household_id",
    "active_membership_id",
    "active_household_role",
    "onboarding_complete",
  ]) {
    assert.match(routingMigration, new RegExp(`'${field}'`));
  }
  assert.match(routingMigration, /INVALID_INVITE_ROLE/);
  assert.match(
    routingMigration,
    /v_invite\.accepted_by is distinct from v_user_id/,
  );
  assert.match(
    routingMigration,
    /if not found or v_membership\.role <> v_invite\.role/,
  );
  assert.match(
    routingMigration,
    /v_membership\.role <> 'owner'::public\.household_role/,
  );
  assert.doesNotMatch(
    routingMigration,
    /jsonb_build_object\([\s\S]{0,500}'invite_code'/,
  );
});

test("sync pull verifies active membership and returns clean-device identity", () => {
  assert.match(apiFunction, /\.from\("memberships"\)/);
  assert.match(apiFunction, /\.eq\("user_id", context\.userId\)/);
  assert.match(apiFunction, /\.eq\("status", "active"\)/);
  assert.match(
    apiFunction,
    /"AUTHORIZATION_DENIED"[\s\S]*You no longer have access to this household/,
  );
  for (const field of [
    "householdId",
    "householdName",
    "householdVersion",
    "householdCreatedAt",
    "membershipId",
    "accountId",
    "membershipVersion",
  ]) {
    assert.match(
      apiFunction,
      new RegExp(`${field}:`),
      `${field} should be returned for clean-device materialization`,
    );
  }
});

test("account deletion re-authenticates, preserves shared records, and fails closed on ownership", () => {
  assert.match(apiFunction, /path === "\/account\/deletion"/);
  assert.match(apiFunction, /\.signInWithPassword\(/);
  assert.match(apiFunction, /expectedActiveHouseholdRole/);
  assert.match(apiFunction, /acknowledgeIrreversibleDeletion !== true/);
  assert.match(apiFunction, /CONFLICT_REQUIRES_REVIEW/);
  assert.match(apiFunction, /serviceClient\.storage[\s\S]*\.remove\(/);
  assert.match(apiFunction, /delete_account_domain_data/);
  assert.match(apiFunction, /auth\.admin\.deleteUser/);
  assert.match(accountDeletionMigration, /OWNERSHIP_TRANSFER_REQUIRED/);
  assert.match(accountDeletionMigration, /ACCOUNT_STATE_CHANGED/);
  assert.match(accountDeletionMigration, /account_deletion_jobs/);
  assert.match(
    accountDeletionMigration,
    /grant execute on function public\.delete_account_domain_data\(uuid, jsonb\)[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(
    accountDeletionMigration,
    /grant execute on function public\.delete_account_domain_data\(uuid, jsonb\)[\s\S]*to authenticated/i,
  );
  for (const actorColumn of [
    "created_by",
    "proposed_by",
    "actor_id",
    "requested_by",
  ]) {
    assert.match(
      accountDeletionMigration,
      new RegExp(`${actorColumn}[\\s\\S]{0,220}on delete set null`, "i"),
    );
  }
});

test("household administration is owner-only, versioned, idempotent, and privacy preserving", () => {
  assert.match(
    familyAdminMigration,
    /one_active_owner_per_household/,
  );
  assert.match(
    familyAdminMigration,
    /create table if not exists public\.household_access_operations/,
  );
  assert.match(familyAdminMigration, /IDEMPOTENCY_CONFLICT/);
  assert.match(familyAdminMigration, /VERSION_CONFLICT/);
  assert.match(familyAdminMigration, /SELF_REVOCATION_FORBIDDEN/);
  assert.match(familyAdminMigration, /OWNER_ROLE_PROTECTED/);
  assert.match(
    familyAdminMigration,
    /status = 'active'[\s\S]{0,180}deleted_at is null/,
  );
  assert.match(
    familyAdminMigration,
    /raw_app_meta_data[\s\S]{0,260}- 'active_household_id'[\s\S]{0,160}- 'active_household_role'/,
  );
  for (const route of [
    "/household-access",
    "/household-access/member-role",
    "/household-access/member-revoke",
    "/household-access/invite-cancel",
    "/household-access/ownership-transfer",
  ]) {
    assert.match(apiFunction, new RegExp(`path === "${route}"`));
  }
  assert.match(
    apiFunction,
    /body\.acknowledgeOwnerTransfer !== true/,
  );
});
