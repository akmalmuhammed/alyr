import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../migrations/202607310002_signup_and_api_controls.sql",
    import.meta.url,
  ),
  "utf8",
);
const config = await readFile(
  new URL("../config.toml", import.meta.url),
  "utf8",
);

test("before-user-created hook fails closed around a one-use enrollment grant", () => {
  assert.match(
    migration,
    /create or replace function public\.heldat_before_user_created\(event jsonb\)/u,
  );
  assert.match(
    migration,
    /v_channel = 'mobile-pilot-v1'[\s\S]*v_grant ~ '\^\[0-9a-f\]\{64\}\$'/u,
  );
  assert.match(
    migration,
    /pending_grant_hash[\s\S]*pending_grant_expires_at > now\(\)[\s\S]*claimed_at is null/u,
  );
  assert.match(
    migration,
    /'http_code', 403[\s\S]*valid Heldat enrollment approval is required/u,
  );
  assert.doesNotMatch(
    migration,
    /if v_channel is distinct from 'mobile-pilot-v1' then\s+return '\{\}'::jsonb/u,
  );
});

test("Auth hook is configured locally and inaccessible to public API roles", () => {
  assert.match(
    config,
    /\[auth\.hook\.before_user_created\][\s\S]*enabled = true[\s\S]*pg-functions:\/\/postgres\/public\/heldat_before_user_created/u,
  );
  assert.match(
    migration,
    /revoke execute on function public\.heldat_before_user_created\(jsonb\)[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.heldat_before_user_created\(jsonb\)[\s\S]*to supabase_auth_admin/u,
  );
});

test("rate limiter stores only hashed scopes and serializes bucket updates", () => {
  assert.match(
    migration,
    /create table public\.api_rate_limit_buckets[\s\S]*scope_hash text not null[\s\S]*\^\[0-9a-f\]\{64\}\$/u,
  );
  assert.match(migration, /force row level security/u);
  assert.match(
    migration,
    /pg_advisory_xact_lock[\s\S]*for update/u,
  );
  assert.match(
    migration,
    /request_count >= p_limit[\s\S]*select\s+false/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.consume_api_rate_limit\([\s\S]*to service_role/u,
  );
  assert.match(
    migration,
    /revoke execute on function public\.consume_api_rate_limit\([\s\S]{0,180}\) from public, anon, authenticated/u,
  );
});

test("rate-limit retention and household RPC grants are explicit", () => {
  assert.match(
    migration,
    /purge_expired_api_rate_limit_buckets[\s\S]*for update skip locked/u,
  );
  assert.match(migration, /heldat-rate-limit-retention/u);
  assert.match(
    migration,
    /revoke execute on function public\.create_household\(text, uuid, uuid\)[\s\S]*from public, anon/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_household\(text, uuid, uuid\)[\s\S]*to authenticated/u,
  );
});
