import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607310005_launch_enrollment_controls.sql",
    import.meta.url,
  ),
  "utf8",
);
const googlePilotMigration = await readFile(
  new URL(
    "../migrations/202607310006_closed_pilot_google_approval.sql",
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

test("launch admission is operator controlled and closed by default", () => {
  assert.match(
    migration,
    /create table public\.launch_enrollment_controls[\s\S]*signup_mode text not null default 'closed_pilot'/u,
  );
  assert.match(
    migration,
    /max_registered_users integer not null default 20[\s\S]*max_households integer not null default 20/u,
  );
  assert.match(
    migration,
    /max_attachment_bytes bigint not null default 10485760[\s\S]*household_storage_limit_bytes bigint not null default 41943040[\s\S]*global_storage_limit_bytes bigint not null default 838860800/u,
  );
  assert.match(
    migration,
    /insert into public\.launch_enrollment_controls \(id\)\s+values \(1\)/u,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.launch_enrollment_controls[\s\S]{0,160}'public_email(?:_google)?'/u,
  );
});

test("control, secret, reservation, and operation ledgers are private", () => {
  for (const table of [
    "launch_enrollment_controls",
    "launch_enrollment_keys",
    "launch_signup_reservations",
    "launch_enrollment_config_operations",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table}[\\s\\S]{0,100}force row level security`,
        "u",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]{0,100}anon, authenticated`,
        "u",
      ),
    );
  }
  assert.doesNotMatch(migration, /\b(?:email|ip_address) text\b/u);
  assert.match(
    migration,
    /email_hash text not null[\s\S]*network_scope_hash text not null/u,
  );
  assert.match(
    migration,
    /extensions\.hmac\(convert_to\(p_value, 'UTF8'\), v_key, 'sha256'\)/u,
  );
});

test("public email preflight is service-only, capacity checked, and replay safe", () => {
  assert.match(
    migration,
    /create or replace function public\.issue_public_email_signup_grant\([\s\S]*p_network_scope_hash text[\s\S]*p_idempotency_key uuid/u,
  );
  assert.match(
    migration,
    /where reservation\.idempotency_key = p_idempotency_key[\s\S]*PUBLIC_SIGNUP_IDEMPOTENCY_CONFLICT/u,
  );
  assert.match(
    migration,
    /email-grant-v1:[\s\S]*v_existing\.expires_at[\s\S]*heldat-public-email-v1/u,
  );
  assert.match(
    migration,
    /consume_api_rate_limit\([\s\S]*signup\.email\.network[\s\S]*signup\.email\.address/u,
  );
  assert.match(
    migration,
    /v_registered \+ v_pending >= v_controls\.max_registered_users[\s\S]*v_pending >= v_controls\.max_pending_signups/u,
  );
  assert.match(
    migration,
    /revoke execute on function public\.issue_public_email_signup_grant\([\s\S]*from public, anon, authenticated, supabase_auth_admin[\s\S]*grant execute[\s\S]*to service_role/u,
  );
});

test("Auth hook trusts provider app metadata and pseudonymizes event IP", () => {
  assert.match(
    migration,
    /event #>> '\{user,app_metadata,provider\}'/u,
  );
  assert.match(
    migration,
    /event #> '\{user,app_metadata,providers\}'[\s\S]*@> '\["google"\]'::jsonb/u,
  );
  assert.match(
    migration,
    /event #>> '\{metadata,ip_address\}'[\s\S]*heldat_launch_hmac\('auth-ip:' \|\| v_ip\)/u,
  );
  assert.match(
    migration,
    /v_controls\.signup_mode <> 'public_email_google'/u,
  );
  assert.match(
    migration,
    /signup\.google\.network[\s\S]*google_network_limit[\s\S]*google_network_window_seconds/u,
  );
  assert.doesNotMatch(
    migration,
    /event #>> '\{user,user_metadata,provider\}'/u,
  );
  assert.match(
    migration,
    /when others then[\s\S]*'http_code', 503[\s\S]*temporarily unavailable/u,
  );
});

test("after-insert consumption preserves pilot and requires launch reservations", () => {
  assert.match(
    migration,
    /create or replace function public\.consume_pilot_signup_grant\(\)[\s\S]*v_channel = 'mobile-pilot-v1'/u,
  );
  assert.match(
    migration,
    /v_channel = 'heldat-public-email-v1'[\s\S]*v_provider = 'google'/u,
  );
  assert.match(
    migration,
    /reservation\.auth_user_id = new\.id[\s\S]*reservation\.hook_accepted_at is not null[\s\S]*PUBLIC_SIGNUP_RESERVATION_REQUIRED/u,
  );
  assert.match(
    migration,
    /public_account_max_households[\s\S]*consumed_by = new\.id[\s\S]*consumed_at = now\(\)/u,
  );
  assert.match(
    migration,
    /array\['alyr_signup_channel', 'public_signup_grant'\]/u,
  );
});

test("household and blob capacity use the control-plane row", () => {
  assert.match(
    migration,
    /create or replace function public\.create_household\([\s\S]*v_controls public\.launch_enrollment_controls[\s\S]*v_pilot_households >= v_controls\.max_households/u,
  );
  assert.match(
    migration,
    /create or replace function public\.create_blob_upload_intent\([\s\S]*heldat\.storage\.global-capacity/u,
  );
  assert.match(
    migration,
    /p_byte_size > v_controls\.max_attachment_bytes/u,
  );
  assert.match(
    migration,
    /v_household_usage \+ p_byte_size[\s\S]*v_controls\.household_storage_limit_bytes/u,
  );
  assert.match(
    migration,
    /v_global_usage \+ p_byte_size[\s\S]*v_controls\.global_storage_limit_bytes/u,
  );
});

test("operator changes and reservation cleanup are bounded and idempotent", () => {
  assert.match(
    migration,
    /create or replace function public\.configure_launch_enrollment\([\s\S]*p_operation_id uuid[\s\S]*p_expected_version bigint/u,
  );
  assert.match(
    migration,
    /where operation_id = p_operation_id[\s\S]*LAUNCH_CONFIG_IDEMPOTENCY_CONFLICT[\s\S]*result_snapshot/u,
  );
  assert.match(
    migration,
    /config_version = config_version \+ 1/u,
  );
  assert.match(
    migration,
    /create or replace function public\.purge_launch_signup_reservations[\s\S]*for update skip locked/u,
  );
  assert.match(migration, /heldat-launch-signup-retention/u);
});

test("verified Google identities can claim only a hashed closed-pilot approval", () => {
  assert.match(
    googlePilotMigration,
    /event #>> '\{user,app_metadata,provider\}'[\s\S]*event #> '\{user,app_metadata,providers\}'[\s\S]*@> '\["google"\]'::jsonb/u,
  );
  assert.match(
    googlePilotMigration,
    /from public\.pilot_signup_approvals[\s\S]*approval\.email_hash =[\s\S]*extensions\.digest\(v_email, 'sha256'\)[\s\S]*approval\.claimed_at is null/u,
  );
  assert.match(
    googlePilotMigration,
    /before insert on auth\.users[\s\S]*after insert on auth\.users/u,
  );
  assert.match(
    googlePilotMigration,
    /insert into public\.pilot_enrollments[\s\S]*claimed_by = new\.id[\s\S]*heldat_google_pilot_approval_id/u,
  );
  assert.match(
    googlePilotMigration,
    /grant execute on function public\.heldat_before_user_created\(jsonb\)[\s\S]*to supabase_auth_admin/u,
  );
  assert.doesNotMatch(
    googlePilotMigration,
    /update public\.launch_enrollment_controls[\s\S]*signup_mode/u,
  );
});

test("public preflight API binds email, network scope, and idempotency", () => {
  assert.match(
    api,
    /async function handlePublicSignupPreflight\([\s\S]*"apiVersion",[\s\S]*"email",[\s\S]*"idempotencyKey",[\s\S]*"launchMode"/u,
  );
  assert.match(
    api,
    /createHash\("sha256"\)[\s\S]*networkScope\(request\)[\s\S]*issue_public_email_signup_grant/u,
  );
  assert.match(
    api,
    /p_network_scope_hash: networkScopeHash[\s\S]*p_idempotency_key: idempotencyKey/u,
  );
  assert.match(
    api,
    /signupChannel !== "heldat-public-email-v1"[\s\S]*enrollmentGrant[\s\S]*signupChannel/u,
  );
  assert.match(
    api,
    /path === "\/signup\/preflight"[\s\S]*handlePublicSignupPreflight\(request\)/u,
  );
  assert.match(
    requestControls,
    /"POST \/signup\/preflight"[\s\S]*routeGroup: "signup\.preflight"/u,
  );
});

test("signup mode is server-attested, short-lived, and checked again by each preflight", () => {
  assert.match(
    api,
    /const launchModeContract = "heldat-signup-mode-v1"[\s\S]*const launchModeLifetimeMilliseconds = 5 \* 60 \* 1000/u,
  );
  assert.match(
    api,
    /async function readLaunchModeFromStore\([\s\S]*client\.rpc\("read_launch_enrollment_mode"\)[\s\S]*signup_mode[\s\S]*config_version/u,
  );
  assert.match(
    api,
    /launchModeCacheFreshMilliseconds = 15_000[\s\S]*launchModeRefreshPromise[\s\S]*if \(launchModeCache && launchModeCache\.freshUntil > now\)[\s\S]*if \(launchModeRefreshPromise\)[\s\S]*previous\.staleUntil > refreshedAt/u,
  );
  assert.match(
    api,
    /createHmac\("sha256", supabaseServiceRoleKey\)[\s\S]*launchModeMessage/u,
  );
  assert.match(
    api,
    /async function handleSignupMode\([\s\S]*signature: signLaunchMode\(launchMode\)/u,
  );
  assert.match(
    api,
    /handlePilotPreflight\([\s\S]*launchModeAttestationIsCurrent\([\s\S]*"closed_pilot"/u,
  );
  assert.match(
    api,
    /handlePublicSignupPreflight\([\s\S]*launchModeAttestationIsCurrent\([\s\S]*"public_email"[\s\S]*"public_email_google"/u,
  );
  assert.match(
    api,
    /async function launchModeAttestationIsCurrent\([\s\S]*await readLaunchModeFromStore\(\)[\s\S]*if \(current\) launchModeCache = null/u,
  );
  assert.match(
    api,
    /request\.method === "GET"[\s\S]*path === "\/signup\/mode"[\s\S]*handleSignupMode/u,
  );
  assert.match(
    api,
    /requiresPersistentNetworkRateLimit\([\s\S]*"GET" && path === "\/signup\/mode"/u,
  );
});
