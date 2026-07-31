#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, statfs, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

export const HARNESS_VERSION = 1;
export const FIXTURE_VERSION = 1;
export const FIXTURE_SEED = "heldat-capacity-v1";
export const LOCAL_PROJECT_ID = "alyr-local";
export const LOCAL_DB_CONTAINER = `supabase_db_${LOCAL_PROJECT_ID}`;
export const LOCAL_EXECUTION_CONFIRMATION = "HELDAT_LOCAL_SUPABASE_ONLY";
export const RETAIN_CONFIRMATION = "HELDAT_RETAIN_SYNTHETIC_FIXTURE";
export const HARNESS_SCHEMA = "heldat_capacity_harness";

export const HARNESS_LIMITS = Object.freeze({
  users: 10_000,
  assetsPerUser: 25,
  placesPerUser: 3,
  evidencePerAsset: 2,
  syncOperationsPerAsset: 2,
  totalRows: 1_500_000,
  concurrency: 4,
  batchUsers: 250,
  statementTimeoutMs: 600_000,
  p95BudgetMs: 120_000,
  reportBytes: 2_000_000,
  minimumFreeReserveBytes: 536_870_912,
});

const DEFAULTS = Object.freeze({
  target: "local-supabase-docker",
  users: 10_000,
  assetsPerUser: 25,
  placesPerUser: 1,
  evidencePerAsset: 1,
  syncOperationsPerAsset: 1,
  concurrency: 4,
  batchUsers: 100,
  statementTimeoutMs: 120_000,
  p95BudgetMs: 30_000,
  retain: false,
  reportPath: "",
});

const TABLES = Object.freeze([
  "households",
  "memberships",
  "places",
  "assets",
  "asset_location_revisions",
  "evidence_metadata",
  "sync_operations",
]);

export class HarnessInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HarnessInputError";
    this.code = code;
  }
}

function strictInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HarnessInputError(
      "INVALID_ARGUMENT",
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return parsed;
}

function optionValue(argument, name) {
  const prefix = `--${name}=`;
  return argument.startsWith(prefix) ? argument.slice(prefix.length) : null;
}

export function buildWorkload(input = {}) {
  const users = strictInteger(input.users ?? DEFAULTS.users, "users", 1, HARNESS_LIMITS.users);
  const assetsPerUser = strictInteger(
    input.assetsPerUser ?? DEFAULTS.assetsPerUser,
    "assets-per-user",
    1,
    HARNESS_LIMITS.assetsPerUser,
  );
  const placesPerUser = strictInteger(
    input.placesPerUser ?? DEFAULTS.placesPerUser,
    "places-per-user",
    1,
    HARNESS_LIMITS.placesPerUser,
  );
  const evidencePerAsset = strictInteger(
    input.evidencePerAsset ?? DEFAULTS.evidencePerAsset,
    "evidence-per-asset",
    0,
    HARNESS_LIMITS.evidencePerAsset,
  );
  const syncOperationsPerAsset = strictInteger(
    input.syncOperationsPerAsset ?? DEFAULTS.syncOperationsPerAsset,
    "sync-operations-per-asset",
    0,
    HARNESS_LIMITS.syncOperationsPerAsset,
  );

  const households = users;
  const memberships = users;
  const places = users * placesPerUser;
  const assets = users * assetsPerUser;
  const locationRevisions = assets;
  const evidenceMetadata = assets * evidencePerAsset;
  const syncOperations = assets * syncOperationsPerAsset;
  const totalRows =
    households +
    memberships +
    places +
    assets +
    locationRevisions +
    evidenceMetadata +
    syncOperations;
  if (totalRows > HARNESS_LIMITS.totalRows) {
    throw new HarnessInputError(
      "WORKLOAD_CAP_EXCEEDED",
      `The workload expands to ${totalRows} rows; the hard cap is ${HARNESS_LIMITS.totalRows}.`,
    );
  }

  return Object.freeze({
    users,
    households,
    memberships,
    placesPerUser,
    places,
    assetsPerUser,
    assets,
    locationRevisions,
    evidencePerAsset,
    evidenceMetadata,
    syncOperationsPerAsset,
    syncOperations,
    totalRows,
    logicalAttachmentBytes: evidenceMetadata * 2_097_152,
    estimatedMetadataBytes: totalRows * 512,
    estimatedPeakLocalBytes: totalRows * 1_536,
  });
}

export function parseArguments(argumentsList) {
  const options = {
    mode: "plan",
    ...DEFAULTS,
    confirmation: "",
    retainConfirmation: "",
  };

  for (const argument of argumentsList) {
    if (argument === "--execute") {
      if (options.mode !== "plan") {
        throw new HarnessInputError("INVALID_MODE", "Choose only one harness mode.");
      }
      options.mode = "execute";
      continue;
    }
    if (argument === "--cleanup") {
      if (options.mode !== "plan") {
        throw new HarnessInputError("INVALID_MODE", "Choose only one harness mode.");
      }
      options.mode = "cleanup";
      continue;
    }
    if (argument === "--retain") {
      options.retain = true;
      continue;
    }

    const names = [
      "target",
      "users",
      "assets-per-user",
      "places-per-user",
      "evidence-per-asset",
      "sync-operations-per-asset",
      "concurrency",
      "batch-users",
      "statement-timeout-ms",
      "p95-budget-ms",
      "confirm-disposable",
      "confirm-retain",
      "report",
    ];
    const name = names.find((candidate) => argument.startsWith(`--${candidate}=`));
    if (!name) {
      throw new HarnessInputError(
        "UNKNOWN_ARGUMENT",
        `Unknown argument: ${argument}. Remote URLs, linked projects, and production targets are intentionally unsupported.`,
      );
    }
    const value = optionValue(argument, name) ?? "";
    if (name === "target") options.target = value;
    if (name === "users") options.users = strictInteger(value, name, 1, HARNESS_LIMITS.users);
    if (name === "assets-per-user") {
      options.assetsPerUser = strictInteger(value, name, 1, HARNESS_LIMITS.assetsPerUser);
    }
    if (name === "places-per-user") {
      options.placesPerUser = strictInteger(value, name, 1, HARNESS_LIMITS.placesPerUser);
    }
    if (name === "evidence-per-asset") {
      options.evidencePerAsset = strictInteger(value, name, 0, HARNESS_LIMITS.evidencePerAsset);
    }
    if (name === "sync-operations-per-asset") {
      options.syncOperationsPerAsset = strictInteger(
        value,
        name,
        0,
        HARNESS_LIMITS.syncOperationsPerAsset,
      );
    }
    if (name === "concurrency") {
      options.concurrency = strictInteger(value, name, 1, HARNESS_LIMITS.concurrency);
    }
    if (name === "batch-users") {
      options.batchUsers = strictInteger(value, name, 1, HARNESS_LIMITS.batchUsers);
    }
    if (name === "statement-timeout-ms") {
      options.statementTimeoutMs = strictInteger(
        value,
        name,
        1_000,
        HARNESS_LIMITS.statementTimeoutMs,
      );
    }
    if (name === "p95-budget-ms") {
      options.p95BudgetMs = strictInteger(value, name, 1, HARNESS_LIMITS.p95BudgetMs);
    }
    if (name === "confirm-disposable") options.confirmation = value;
    if (name === "confirm-retain") options.retainConfirmation = value;
    if (name === "report") options.reportPath = value.trim();
  }

  if (options.target !== DEFAULTS.target) {
    throw new HarnessInputError(
      "TARGET_REFUSED",
      "Only the fixed local Supabase Docker target is supported. Linked, hosted, and production targets are refused.",
    );
  }
  if (options.mode === "cleanup" && options.retain) {
    throw new HarnessInputError("INVALID_ARGUMENT", "--retain is only valid with --execute.");
  }
  if (options.mode !== "execute" && options.retainConfirmation) {
    throw new HarnessInputError("INVALID_ARGUMENT", "--confirm-retain is only valid with --execute.");
  }
  if (options.mode === "plan" && options.confirmation) {
    throw new HarnessInputError(
      "INVALID_ARGUMENT",
      "The disposable-target confirmation is accepted only for an explicit execution or cleanup.",
    );
  }

  const workload = buildWorkload(options);
  const batchCount = Math.ceil(workload.users / options.batchUsers);
  if (options.concurrency > batchCount) {
    throw new HarnessInputError(
      "INVALID_ARGUMENT",
      `concurrency must not exceed the ${batchCount} workload batches.`,
    );
  }
  return Object.freeze({ ...options, workload, batchCount });
}

export function assertExecutionAuthorization(options) {
  if (!options || !["execute", "cleanup"].includes(options.mode)) {
    throw new HarnessInputError(
      "EXECUTION_NOT_REQUESTED",
      "Database mutation requires an explicit execution or cleanup mode.",
    );
  }
  if (options.target !== "local-supabase-docker") {
    throw new HarnessInputError("TARGET_REFUSED", "The mutation target is not the fixed local target.");
  }
  if (options.confirmation !== LOCAL_EXECUTION_CONFIRMATION) {
    throw new HarnessInputError(
      "DISPOSABLE_CONFIRMATION_REQUIRED",
      `Mutation requires --confirm-disposable=${LOCAL_EXECUTION_CONFIRMATION}.`,
    );
  }
  if (options.retain && options.retainConfirmation !== RETAIN_CONFIRMATION) {
    throw new HarnessInputError(
      "RETAIN_CONFIRMATION_REQUIRED",
      `Retaining fixtures requires --confirm-retain=${RETAIN_CONFIRMATION}.`,
    );
  }
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const ordered = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (ordered.length === 0) return null;
  const index = Math.max(Math.ceil(fraction * ordered.length) - 1, 0);
  return ordered[index];
}

function rounded(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function summarizeLatencies(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return {
    samples: finite.length,
    minimumMs: finite.length ? rounded(Math.min(...finite)) : null,
    p50Ms: rounded(percentile(finite, 0.5)),
    p95Ms: rounded(percentile(finite, 0.95)),
    p99Ms: rounded(percentile(finite, 0.99)),
    maximumMs: finite.length ? rounded(Math.max(...finite)) : null,
  };
}

export function buildPlan(options = parseArguments([])) {
  const workload = options.workload ?? buildWorkload(options);
  const batchCount = options.batchCount ?? Math.ceil(workload.users / options.batchUsers);
  return {
    harnessVersion: HARNESS_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    mode: "plan",
    mutatesDatabase: false,
    target: {
      kind: "local-supabase-docker",
      dockerContainer: LOCAL_DB_CONTAINER,
      expectedProjectLabel: LOCAL_PROJECT_ID,
      hostedTargetsAccepted: false,
      linkedTargetsAccepted: false,
      credentialsAccepted: false,
    },
    workload,
    execution: {
      batchUsers: options.batchUsers,
      batches: batchCount,
      concurrency: options.concurrency,
      statementTimeoutMs: options.statementTimeoutMs,
      p95BatchBudgetMs: options.p95BudgetMs,
      retainAfterRun: options.retain,
      fixtureSeed: FIXTURE_SEED,
    },
    measurements: [
      "batch latency p50/p95/p99 and throughput",
      "bounded error counts and samples",
      "database byte growth",
      "WAL bytes generated",
      "connection and lock peaks",
      "per-table heap/index/retained bytes",
      "schema retained bytes before and after cleanup",
      "exact row-count reconciliation",
    ],
    assumptions: [
      "One synthetic household and one synthetic membership represent each modeled user.",
      "The default register contains one place and 25 assets per modeled user.",
      "Every asset has one current location revision, one evidence metadata row, and one sync operation by default.",
      "Evidence rows declare a 2 MiB logical attachment but the harness stores metadata only; object bytes and egress are not exercised.",
      "Fixtures use deterministic UUIDs and clearly synthetic names; no personal, customer, production, or copied data is used.",
      "The isolated schema mirrors important production metadata widths and indexes but does not measure Auth, RLS, Edge Functions, Storage, Realtime, mobile sync, or network latency.",
      "Batch latency includes local docker-exec and psql startup overhead; performance timing itself is environment-dependent.",
      "The local disk preflight reserves 512 MiB beyond a conservative 1,536-byte estimate per modeled metadata row; Docker/WSL allocation behavior can still vary.",
      "Passing this harness is capacity evidence for its stated metadata workload, not a public-launch or 10K-concurrent-user claim.",
    ],
    hardCaps: HARNESS_LIMITS,
    nextCommand: `node supabase/scripts/staging-10k-metadata-harness.mjs --execute --confirm-disposable=${LOCAL_EXECUTION_CONFIRMATION}`,
  };
}

function sqlUuid(label, ordinalExpression) {
  return `${HARNESS_SCHEMA}.synthetic_uuid('${label}', ${ordinalExpression})`;
}

export function buildSchemaSql(options) {
  const workload = options.workload ?? buildWorkload(options);
  return `
begin;
set statement_timeout = '${options.statementTimeoutMs}ms';
set lock_timeout = '5s';
set timezone = 'UTC';
drop schema if exists ${HARNESS_SCHEMA} cascade;
create schema ${HARNESS_SCHEMA};

create function ${HARNESS_SCHEMA}.synthetic_uuid(label text, ordinal bigint)
returns uuid
language plpgsql
immutable
strict
as $$
declare
  digest text := md5('${FIXTURE_SEED}:' || label || ':' || ordinal::text);
begin
  return (
    substr(digest, 1, 8) || '-' || substr(digest, 9, 4) || '-' ||
    substr(digest, 13, 4) || '-' || substr(digest, 17, 4) || '-' ||
    substr(digest, 21, 12)
  )::uuid;
end;
$$;

create table ${HARNESS_SCHEMA}.run_manifest (
  fixture_version integer primary key,
  fixture_seed text not null,
  modeled_users integer not null,
  assets_per_user integer not null,
  places_per_user integer not null,
  evidence_per_asset integer not null,
  sync_operations_per_asset integer not null,
  expected_rows bigint not null,
  created_at timestamptz not null default clock_timestamp()
);

insert into ${HARNESS_SCHEMA}.run_manifest values (
  ${FIXTURE_VERSION}, '${FIXTURE_SEED}', ${workload.users}, ${workload.assetsPerUser},
  ${workload.placesPerUser}, ${workload.evidencePerAsset},
  ${workload.syncOperationsPerAsset}, ${workload.totalRows}, clock_timestamp()
);

create table ${HARNESS_SCHEMA}.households (
  id uuid primary key,
  name text not null,
  version integer not null,
  created_by uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table ${HARNESS_SCHEMA}.memberships (
  id uuid primary key,
  household_id uuid not null references ${HARNESS_SCHEMA}.households(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  status text not null,
  version integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  unique (household_id, user_id)
);

create table ${HARNESS_SCHEMA}.places (
  id uuid primary key,
  household_id uuid not null references ${HARNESS_SCHEMA}.households(id) on delete cascade,
  name text not null,
  kind text not null,
  tenure text not null,
  address_text text,
  region_label text,
  latitude double precision,
  longitude double precision,
  location_source text not null,
  location_precision text not null,
  horizontal_accuracy_m double precision,
  location_observed_at timestamptz,
  location_confirmed_at timestamptz,
  version integer not null,
  created_by uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  unique (household_id, id)
);
create index places_household_active on ${HARNESS_SCHEMA}.places(household_id, updated_at desc) where deleted_at is null;

create table ${HARNESS_SCHEMA}.assets (
  id uuid primary key,
  household_id uuid not null references ${HARNESS_SCHEMA}.households(id) on delete cascade,
  name text not null,
  category_id text not null,
  category_path text[] not null,
  description text,
  importance text not null,
  lifecycle text not null,
  profile jsonb not null,
  version integer not null,
  created_by uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  unique (household_id, id)
);
create index assets_household_active on ${HARNESS_SCHEMA}.assets(household_id, updated_at desc) where deleted_at is null;
create index assets_category on ${HARNESS_SCHEMA}.assets(household_id, category_id) where deleted_at is null;

create table ${HARNESS_SCHEMA}.asset_location_revisions (
  id uuid primary key,
  household_id uuid not null references ${HARNESS_SCHEMA}.households(id) on delete cascade,
  asset_id uuid not null,
  place_id uuid,
  status text not null,
  location_detail text,
  source text not null,
  revision integer not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  proposed_by uuid not null,
  created_at timestamptz not null,
  unique (asset_id, revision),
  foreign key (household_id, asset_id) references ${HARNESS_SCHEMA}.assets(household_id, id) on delete cascade,
  foreign key (household_id, place_id) references ${HARNESS_SCHEMA}.places(household_id, id)
);
create unique index one_active_location_per_asset on ${HARNESS_SCHEMA}.asset_location_revisions(asset_id) where valid_to is null;

create table ${HARNESS_SCHEMA}.evidence_metadata (
  id uuid primary key,
  household_id uuid not null references ${HARNESS_SCHEMA}.households(id) on delete cascade,
  asset_id uuid not null,
  kind text not null,
  relation text not null,
  title text not null,
  review_status text not null,
  storage_state text not null,
  version integer not null,
  file_name text not null,
  mime_type text not null,
  logical_byte_size bigint not null,
  checksum_sha256 text not null,
  created_by uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, asset_id) references ${HARNESS_SCHEMA}.assets(household_id, id) on delete cascade
);
create index evidence_household_asset on ${HARNESS_SCHEMA}.evidence_metadata(household_id, asset_id, created_at desc);

create table ${HARNESS_SCHEMA}.sync_operations (
  cursor bigint generated always as identity unique,
  id uuid primary key,
  household_id uuid not null references ${HARNESS_SCHEMA}.households(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  actor_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  base_version integer not null,
  command text not null,
  payload jsonb not null,
  client_created_at timestamptz not null,
  received_at timestamptz not null,
  status text not null,
  result jsonb not null,
  unique (household_id, idempotency_key)
);
create index sync_operations_household_cursor on ${HARNESS_SCHEMA}.sync_operations(household_id, cursor);
commit;
`;
}

export function buildBatchSql(options, startUser, endUser) {
  const workload = options.workload ?? buildWorkload(options);
  const start = strictInteger(startUser, "start-user", 1, workload.users);
  const end = strictInteger(endUser, "end-user", start, workload.users);
  const assetOrdinal = `((u - 1)::bigint * ${workload.assetsPerUser} + a)::bigint`;
  const placeOrdinal = `((u - 1)::bigint * ${workload.placesPerUser} + p)::bigint`;
  const evidenceOrdinal = `(((${assetOrdinal}) - 1) * ${Math.max(workload.evidencePerAsset, 1)} + e)::bigint`;
  const syncOrdinal = `(((${assetOrdinal}) - 1) * ${Math.max(workload.syncOperationsPerAsset, 1)} + s)::bigint`;

  return `
begin;
set local statement_timeout = '${options.statementTimeoutMs}ms';
set local lock_timeout = '5s';
set local timezone = 'UTC';

insert into ${HARNESS_SCHEMA}.households
select ${sqlUuid("household", "u")},
       'Synthetic household ' || lpad(u::text, 5, '0'), 1,
       ${sqlUuid("user", "u")},
       timestamptz '2026-01-01 00:00:00+00' + make_interval(secs => u),
       timestamptz '2026-01-01 00:00:00+00' + make_interval(secs => u), null
from generate_series(${start}, ${end}) as u;

insert into ${HARNESS_SCHEMA}.memberships
select ${sqlUuid("membership", "u")}, ${sqlUuid("household", "u")},
       ${sqlUuid("user", "u")}, 'owner', 'active', 1,
       timestamptz '2026-01-01 00:00:00+00' + make_interval(secs => u),
       timestamptz '2026-01-01 00:00:00+00' + make_interval(secs => u), null
from generate_series(${start}, ${end}) as u;

insert into ${HARNESS_SCHEMA}.places
select ${sqlUuid("place", placeOrdinal)}, ${sqlUuid("household", "u")},
       'Synthetic place ' || p, 'home', 'owned',
       'Synthetic address; not a deliverable location', 'Synthetic region',
       -85 + ((u * 17 + p) % 17000) / 100.0,
       -175 + ((u * 31 + p) % 35000) / 100.0,
       'user_pin', 'user_placed', null, null,
       timestamptz '2026-01-02 00:00:00+00' + make_interval(secs => u),
       1, ${sqlUuid("user", "u")},
       timestamptz '2026-01-02 00:00:00+00' + make_interval(secs => u),
       timestamptz '2026-01-02 00:00:00+00' + make_interval(secs => u), null
from generate_series(${start}, ${end}) as u
cross join generate_series(1, ${workload.placesPerUser}) as p;

insert into ${HARNESS_SCHEMA}.assets
select ${sqlUuid("asset", assetOrdinal)}, ${sqlUuid("household", "u")},
       'Synthetic asset ' || lpad(a::text, 2, '0'),
       case (a % 5) when 0 then 'watch' when 1 then 'real-estate' when 2 then 'collectible' when 3 then 'document' else 'personal' end,
       array['synthetic', 'capacity-fixture'],
       'Generated metadata for a disposable capacity measurement.',
       case when a <= 5 then 'critical' else 'ordinary' end,
       'active',
       jsonb_build_object(
         'fixture', true,
         'serial', 'SYN-' || lpad((${assetOrdinal})::text, 10, '0'),
         'captureSource', 'capacity-harness',
         'tags', jsonb_build_array('synthetic', 'non-sensitive')
       ),
       1, ${sqlUuid("user", "u")},
       timestamptz '2026-01-03 00:00:00+00' + make_interval(secs => (${assetOrdinal} % 86400)::integer),
       timestamptz '2026-01-03 00:00:00+00' + make_interval(secs => (${assetOrdinal} % 86400)::integer), null
from generate_series(${start}, ${end}) as u
cross join generate_series(1, ${workload.assetsPerUser}) as a;

insert into ${HARNESS_SCHEMA}.asset_location_revisions
select ${sqlUuid("location", assetOrdinal)}, ${sqlUuid("household", "u")},
       ${sqlUuid("asset", assetOrdinal)},
       ${sqlUuid("place", `((u - 1)::bigint * ${workload.placesPerUser} + 1)::bigint`)},
       'known', 'Synthetic room / shelf', 'user', 1,
       timestamptz '2026-01-04 00:00:00+00' + make_interval(secs => (${assetOrdinal} % 86400)::integer),
       null, ${sqlUuid("user", "u")},
       timestamptz '2026-01-04 00:00:00+00' + make_interval(secs => (${assetOrdinal} % 86400)::integer)
from generate_series(${start}, ${end}) as u
cross join generate_series(1, ${workload.assetsPerUser}) as a;

${workload.evidencePerAsset === 0 ? "" : `insert into ${HARNESS_SCHEMA}.evidence_metadata
select ${sqlUuid("evidence", evidenceOrdinal)}, ${sqlUuid("household", "u")},
       ${sqlUuid("asset", assetOrdinal)}, 'media', 'identity',
       'Synthetic primary photo ' || e, 'reviewed', 'cloud-acknowledged', 1,
       'synthetic-' || lpad((${evidenceOrdinal})::text, 10, '0') || '.jpg',
       'image/jpeg', 2097152,
       md5('${FIXTURE_SEED}:evidence:' || (${evidenceOrdinal})::text) || md5('${FIXTURE_SEED}:checksum:' || (${evidenceOrdinal})::text),
       ${sqlUuid("user", "u")},
       timestamptz '2026-01-05 00:00:00+00' + make_interval(secs => (${evidenceOrdinal} % 86400)::integer),
       timestamptz '2026-01-05 00:00:00+00' + make_interval(secs => (${evidenceOrdinal} % 86400)::integer), null
from generate_series(${start}, ${end}) as u
cross join generate_series(1, ${workload.assetsPerUser}) as a
cross join generate_series(1, ${workload.evidencePerAsset}) as e;`}

${workload.syncOperationsPerAsset === 0 ? "" : `insert into ${HARNESS_SCHEMA}.sync_operations
  (id, household_id, idempotency_key, request_hash, actor_id, entity_type,
   entity_id, base_version, command, payload, client_created_at, received_at, status, result)
select ${sqlUuid("sync", syncOrdinal)}, ${sqlUuid("household", "u")},
       'synthetic-' || lpad((${syncOrdinal})::text, 12, '0'),
       md5('${FIXTURE_SEED}:request:' || (${syncOrdinal})::text) || md5('${FIXTURE_SEED}:request2:' || (${syncOrdinal})::text),
       ${sqlUuid("user", "u")}, 'asset', ${sqlUuid("asset", assetOrdinal)}, 0,
       'asset.upsert',
       jsonb_build_object(
         'fixture', true,
         'assetId', ${sqlUuid("asset", assetOrdinal)}::text,
         'name', 'Synthetic asset ' || lpad(a::text, 2, '0'),
         'observedVersion', 0
       ),
       timestamptz '2026-01-06 00:00:00+00' + make_interval(secs => (${syncOrdinal} % 86400)::integer),
       timestamptz '2026-01-06 00:00:00+00' + make_interval(secs => (${syncOrdinal} % 86400)::integer),
       'applied', jsonb_build_object('version', 1, 'fixture', true)
from generate_series(${start}, ${end}) as u
cross join generate_series(1, ${workload.assetsPerUser}) as a
cross join generate_series(1, ${workload.syncOperationsPerAsset}) as s;`}

commit;
`;
}

export function buildExpectedRowCounts(workload) {
  return {
    households: workload.households,
    memberships: workload.memberships,
    places: workload.places,
    assets: workload.assets,
    asset_location_revisions: workload.locationRevisions,
    evidence_metadata: workload.evidenceMetadata,
    sync_operations: workload.syncOperations,
  };
}

function boundedText(value, maximum = 500) {
  const normalized = String(value ?? "").replace(/[\r\n\t]+/gu, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum)}…`;
}

function runProcess(command, args, { input = "", timeoutMs = 30_000 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      child.kill();
      const error = new Error(`Process timed out after ${timeoutMs}ms.`);
      error.code = "PROCESS_TIMEOUT";
      rejectPromise(error);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < HARNESS_LIMITS.reportBytes) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < HARNESS_LIMITS.reportBytes) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on("close", (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolvePromise({ stdout, stderr, code, signal });
        return;
      }
      const error = new Error(
        `Process exited with code ${code ?? "null"}: ${boundedText(stderr || stdout)}`,
      );
      error.code = signal ? "PROCESS_SIGNAL" : `PROCESS_EXIT_${code ?? "UNKNOWN"}`;
      rejectPromise(error);
    });
    child.stdin.end(input);
  });
}

async function inspectLocalContainer(runProcessImpl = runProcess) {
  const result = await runProcessImpl("docker", ["inspect", LOCAL_DB_CONTAINER], {
    timeoutMs: 20_000,
  });
  let containers;
  try {
    containers = JSON.parse(result.stdout);
  } catch {
    throw new HarnessInputError("LOCAL_TARGET_UNVERIFIED", "Docker returned invalid inspection data.");
  }
  const container = Array.isArray(containers) ? containers[0] : null;
  const labels = container?.Config?.Labels ?? {};
  if (
    !container ||
    container.Name !== `/${LOCAL_DB_CONTAINER}` ||
    labels["com.supabase.cli.project"] !== LOCAL_PROJECT_ID ||
    labels["com.docker.compose.project"] !== LOCAL_PROJECT_ID ||
    container.State?.Running !== true ||
    container.State?.Health?.Status !== "healthy"
  ) {
    throw new HarnessInputError(
      "LOCAL_TARGET_UNVERIFIED",
      "The fixed local Supabase container is missing, unhealthy, or does not have the expected local-project labels.",
    );
  }
  return {
    container: LOCAL_DB_CONTAINER,
    projectLabel: LOCAL_PROJECT_ID,
    state: "healthy",
  };
}

async function readLocalDiskSpace() {
  const stats = await statfs(process.cwd());
  return Number(stats.bavail) * Number(stats.bsize);
}

async function runPsql(sql, {
  applicationName = "heldat-capacity-observer",
  timeoutMs = 30_000,
  runProcessImpl = runProcess,
} = {}) {
  const result = await runProcessImpl(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      `PGAPPNAME=${applicationName}`,
      LOCAL_DB_CONTAINER,
      "psql",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--tuples-only",
      "--no-align",
    ],
    { input: sql, timeoutMs },
  );
  return result.stdout.trim();
}

function snapshotSql() {
  return `
select json_build_object(
  'observedAt', clock_timestamp(),
  'databaseBytes', pg_database_size(current_database()),
  'walLsn', pg_current_wal_lsn()::text,
  'connections', json_build_object(
    'all', (select count(*) from pg_stat_activity),
    'load', (select count(*) from pg_stat_activity where application_name = 'heldat-capacity-load'),
    'activeLoad', (select count(*) from pg_stat_activity where application_name = 'heldat-capacity-load' and state = 'active'),
    'maxConfigured', current_setting('max_connections')::integer
  ),
  'locks', json_build_object(
    'databaseTotal', (select count(*) from pg_locks where database = (select oid from pg_database where datname = current_database())),
    'databaseWaiting', (select count(*) from pg_locks where database = (select oid from pg_database where datname = current_database()) and not granted),
    'loadTotal', (select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = 'heldat-capacity-load'),
    'loadWaiting', (select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = 'heldat-capacity-load' and not l.granted)
  ),
  'schemaBytes', coalesce((
    select sum(pg_total_relation_size(c.oid))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${HARNESS_SCHEMA}' and c.relkind in ('r', 'm')
  ), 0)
)::text;
`;
}

async function readSnapshot(options = {}) {
  const output = await runPsql(snapshotSql(), options);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Snapshot query returned invalid JSON: ${boundedText(output)}`);
  }
}

async function readWalBytes(startLsn, options = {}) {
  if (!/^[0-9A-F]+\/[0-9A-F]+$/iu.test(startLsn ?? "")) {
    throw new Error("The baseline WAL LSN was invalid.");
  }
  const output = await runPsql(
    `select pg_wal_lsn_diff(pg_current_wal_lsn(), '${startLsn}'::pg_lsn)::bigint;`,
    options,
  );
  return Number(output);
}

async function readRowCounts(options = {}) {
  const selects = TABLES.map(
    (table) => `select '${table}' as table_name, count(*)::bigint as rows from ${HARNESS_SCHEMA}.${table}`,
  ).join(" union all ");
  const output = await runPsql(
    `select json_object_agg(table_name, rows)::text from (${selects}) counted;`,
    options,
  );
  return JSON.parse(output);
}

async function readTableSizes(options = {}) {
  const output = await runPsql(
    `select coalesce(json_agg(row_to_json(sized) order by sized.table_name), '[]'::json)::text
     from (
       select c.relname as table_name,
              pg_relation_size(c.oid)::bigint as heap_bytes,
              pg_indexes_size(c.oid)::bigint as index_bytes,
              pg_total_relation_size(c.oid)::bigint as retained_bytes
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = '${HARNESS_SCHEMA}' and c.relkind = 'r'
     ) sized;`,
    options,
  );
  return JSON.parse(output);
}

function buildBatches(options) {
  const batches = [];
  for (let startUser = 1, number = 1; startUser <= options.workload.users; number += 1) {
    const endUser = Math.min(startUser + options.batchUsers - 1, options.workload.users);
    batches.push({ number, startUser, endUser });
    startUser = endUser + 1;
  }
  return batches;
}

async function runBatches(options, dependencies = {}) {
  const runPsqlImpl = dependencies.runPsqlImpl ?? runPsql;
  const batches = buildBatches(options);
  const results = new Array(batches.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= batches.length) return;
      const batch = batches[index];
      const started = performance.now();
      try {
        await runPsqlImpl(buildBatchSql(options, batch.startUser, batch.endUser), {
          applicationName: "heldat-capacity-load",
          timeoutMs: options.statementTimeoutMs + 15_000,
        });
        results[index] = {
          ...batch,
          durationMs: performance.now() - started,
          passed: true,
        };
      } catch (error) {
        results[index] = {
          ...batch,
          durationMs: performance.now() - started,
          passed: false,
          errorCode: boundedText(error?.code ?? "BATCH_FAILED", 80),
          errorMessage: boundedText(error?.message ?? error, 300),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  return results;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function sampleRuntimeMetrics(stopSignal, dependencies = {}) {
  const readSnapshotImpl = dependencies.readSnapshotImpl ?? readSnapshot;
  const samples = [];
  const errors = [];
  while (!stopSignal.stopped) {
    try {
      samples.push(await readSnapshotImpl());
    } catch (error) {
      if (errors.length < 5) {
        errors.push({
          code: boundedText(error?.code ?? "OBSERVER_FAILED", 80),
          message: boundedText(error?.message ?? error, 240),
        });
      }
    }
    await delay(250);
  }
  return { samples, errors };
}

function peakMetric(snapshots, selector) {
  const values = snapshots.map(selector).map(Number).filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function errorCounts(batchResults) {
  const counts = {};
  for (const result of batchResults) {
    if (result.passed) continue;
    counts[result.errorCode] = (counts[result.errorCode] ?? 0) + 1;
  }
  return counts;
}

function rowsMatch(actual, expected) {
  return Object.entries(expected).every(([table, rows]) => Number(actual?.[table]) === rows);
}

export function summarizeExecution({
  options,
  startedAt,
  finishedAt,
  durationMs,
  target,
  beforeSetup,
  beforeLoad,
  afterLoad,
  afterCleanup,
  walBytes,
  rowCounts,
  tableSizes,
  batchResults,
  observer,
}) {
  const successful = batchResults.filter((result) => result.passed);
  const failed = batchResults.filter((result) => !result.passed);
  const latency = summarizeLatencies(successful.map((result) => result.durationMs));
  const expectedRowCounts = buildExpectedRowCounts(options.workload);
  const reconciled = rowsMatch(rowCounts, expectedRowCounts);
  const allSnapshots = [beforeLoad, ...(observer?.samples ?? []), afterLoad].filter(Boolean);
  const elapsedSeconds = Math.max(durationMs / 1_000, 0.001);
  const retainedBytes = Number(afterLoad.schemaBytes ?? 0);
  const cleanupRetainedBytes = Number(afterCleanup?.schemaBytes ?? retainedBytes);
  const p95WithinBudget = latency.p95Ms !== null && latency.p95Ms <= options.p95BudgetMs;
  const noWaitingLoadLocks =
    peakMetric(allSnapshots, (sample) => sample?.locks?.loadWaiting) === 0;

  return {
    harnessVersion: HARNESS_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    mode: "execute",
    target,
    startedAt,
    finishedAt,
    durationMs: rounded(durationMs),
    workload: options.workload,
    execution: {
      batchUsers: options.batchUsers,
      batches: options.batchCount,
      concurrency: options.concurrency,
      statementTimeoutMs: options.statementTimeoutMs,
      p95BatchBudgetMs: options.p95BudgetMs,
      retainedAfterRun: options.retain,
    },
    latency,
    throughput: {
      usersPerSecond: rounded(options.workload.users / elapsedSeconds),
      rowsPerSecond: rounded(options.workload.totalRows / elapsedSeconds),
    },
    errors: {
      totalFailedBatches: failed.length,
      counts: errorCounts(batchResults),
      samples: failed.slice(0, 10).map(({ number, startUser, endUser, errorCode, errorMessage }) => ({
        batch: number,
        startUser,
        endUser,
        code: errorCode,
        message: errorMessage,
      })),
      observerSamplesFailed: observer?.errors?.length ?? 0,
      observerErrorSamples: observer?.errors ?? [],
    },
    database: {
      bytesBeforeSetup: Number(beforeSetup.databaseBytes),
      bytesBeforeLoad: Number(beforeLoad.databaseBytes),
      bytesAfterLoad: Number(afterLoad.databaseBytes),
      growthBytes: Number(afterLoad.databaseBytes) - Number(beforeLoad.databaseBytes),
      walBytes,
      retainedBytesBeforeCleanup: retainedBytes,
      retainedBytesAfterCleanup: cleanupRetainedBytes,
      retainedBytesPerUser: rounded(retainedBytes / options.workload.users),
      retainedBytesPerRow: rounded(retainedBytes / options.workload.totalRows),
      tableSizes,
    },
    connections: {
      configuredMaximum: Number(afterLoad.connections?.maxConfigured ?? 0),
      peakObservedAll: peakMetric(allSnapshots, (sample) => sample?.connections?.all),
      peakObservedLoad: peakMetric(allSnapshots, (sample) => sample?.connections?.load),
      peakObservedActiveLoad: peakMetric(allSnapshots, (sample) => sample?.connections?.activeLoad),
      observationSamples: observer?.samples?.length ?? 0,
    },
    locks: {
      peakObservedDatabaseLocks: peakMetric(allSnapshots, (sample) => sample?.locks?.databaseTotal),
      peakObservedDatabaseWaiting: peakMetric(allSnapshots, (sample) => sample?.locks?.databaseWaiting),
      peakObservedLoadLocks: peakMetric(allSnapshots, (sample) => sample?.locks?.loadTotal),
      peakObservedLoadWaiting: peakMetric(allSnapshots, (sample) => sample?.locks?.loadWaiting),
    },
    reconciliation: {
      expected: expectedRowCounts,
      actual: Object.fromEntries(
        Object.entries(rowCounts).map(([table, rows]) => [table, Number(rows)]),
      ),
      matched: reconciled,
    },
    gates: {
      allBatchesSucceeded: failed.length === 0,
      rowCountsMatched: reconciled,
      p95WithinBudget,
      noWaitingLoadLocks,
      cleanupCompleted: options.retain || cleanupRetainedBytes === 0,
      passed:
        failed.length === 0 &&
        reconciled &&
        p95WithinBudget &&
        noWaitingLoadLocks &&
        (options.retain || cleanupRetainedBytes === 0),
    },
    assumptions: buildPlan(options).assumptions,
    note:
      "This report measures deterministic synthetic metadata on the fixed disposable local Supabase database. It is not hosted-project, API, object-storage, network, or concurrency-at-10K evidence.",
  };
}

async function cleanupSchema(dependencies = {}) {
  const runPsqlImpl = dependencies.runPsqlImpl ?? runPsql;
  await runPsqlImpl(
    `set lock_timeout = '5s'; drop schema if exists ${HARNESS_SCHEMA} cascade;`,
    { applicationName: "heldat-capacity-cleanup", timeoutMs: 30_000 },
  );
}

export async function runLocalHarness(options, dependencies = {}) {
  assertExecutionAuthorization(options);
  const inspectLocalContainerImpl = dependencies.inspectLocalContainerImpl ?? inspectLocalContainer;
  const runPsqlImpl = dependencies.runPsqlImpl ?? runPsql;
  const readSnapshotImpl = dependencies.readSnapshotImpl ?? readSnapshot;
  const readWalBytesImpl = dependencies.readWalBytesImpl ?? readWalBytes;
  const readRowCountsImpl = dependencies.readRowCountsImpl ?? readRowCounts;
  const readTableSizesImpl = dependencies.readTableSizesImpl ?? readTableSizes;
  const runBatchesImpl = dependencies.runBatchesImpl ?? runBatches;
  const sampleRuntimeMetricsImpl = dependencies.sampleRuntimeMetricsImpl ?? sampleRuntimeMetrics;
  const cleanupSchemaImpl = dependencies.cleanupSchemaImpl ?? cleanupSchema;
  const readLocalDiskSpaceImpl = dependencies.readLocalDiskSpaceImpl ?? readLocalDiskSpace;

  let target = await inspectLocalContainerImpl();
  if (options.mode === "cleanup") {
    const before = await readSnapshotImpl({ runProcessImpl: dependencies.runProcessImpl });
    await cleanupSchemaImpl({ runPsqlImpl });
    const after = await readSnapshotImpl({ runProcessImpl: dependencies.runProcessImpl });
    return {
      harnessVersion: HARNESS_VERSION,
      mode: "cleanup",
      target,
      schema: HARNESS_SCHEMA,
      retainedBytesBeforeCleanup: Number(before.schemaBytes),
      retainedBytesAfterCleanup: Number(after.schemaBytes),
      passed: Number(after.schemaBytes) === 0,
    };
  }

  const availableLocalBytes = await readLocalDiskSpaceImpl();
  const requiredLocalBytes =
    options.workload.estimatedPeakLocalBytes + HARNESS_LIMITS.minimumFreeReserveBytes;
  if (!Number.isSafeInteger(availableLocalBytes) || availableLocalBytes < requiredLocalBytes) {
    throw new HarnessInputError(
      "INSUFFICIENT_LOCAL_DISK",
      `The disposable workload requires at least ${requiredLocalBytes} free local bytes; ${availableLocalBytes} are available.`,
    );
  }
  target = {
    ...target,
    diskPreflight: {
      availableBytes: availableLocalBytes,
      requiredBytes: requiredLocalBytes,
      minimumReserveBytes: HARNESS_LIMITS.minimumFreeReserveBytes,
      passed: true,
    },
  };

  const startedAt = new Date().toISOString();
  const overallStarted = performance.now();
  let schemaCreated = false;
  let report;
  try {
    const beforeSetup = await readSnapshotImpl({ runProcessImpl: dependencies.runProcessImpl });
    schemaCreated = true;
    await runPsqlImpl(buildSchemaSql(options), {
      applicationName: "heldat-capacity-setup",
      timeoutMs: options.statementTimeoutMs,
    });
    const beforeLoad = await readSnapshotImpl({ runProcessImpl: dependencies.runProcessImpl });
    const stopSignal = { stopped: false };
    const observerPromise = sampleRuntimeMetricsImpl(stopSignal, { readSnapshotImpl });
    const batchResults = await runBatchesImpl(options, { runPsqlImpl });
    stopSignal.stopped = true;
    const observer = await observerPromise;
    const afterLoad = await readSnapshotImpl({ runProcessImpl: dependencies.runProcessImpl });
    const walBytes = await readWalBytesImpl(beforeLoad.walLsn, {
      runProcessImpl: dependencies.runProcessImpl,
    });
    const rowCounts = await readRowCountsImpl({ runProcessImpl: dependencies.runProcessImpl });
    const tableSizes = await readTableSizesImpl({ runProcessImpl: dependencies.runProcessImpl });
    let afterCleanup = null;
    if (!options.retain) {
      await cleanupSchemaImpl({ runPsqlImpl });
      schemaCreated = false;
      afterCleanup = await readSnapshotImpl({ runProcessImpl: dependencies.runProcessImpl });
    }
    const durationMs = performance.now() - overallStarted;
    report = summarizeExecution({
      options,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      target,
      beforeSetup,
      beforeLoad,
      afterLoad,
      afterCleanup,
      walBytes,
      rowCounts,
      tableSizes,
      batchResults,
      observer,
    });
  } finally {
    if (schemaCreated && !options.retain) {
      await cleanupSchemaImpl({ runPsqlImpl }).catch(() => {});
    }
  }
  return report;
}

async function writeReport(reportPath, report) {
  if (!reportPath) return null;
  const absolutePath = resolve(reportPath);
  if (!absolutePath.toLowerCase().endsWith(".json")) {
    throw new HarnessInputError("INVALID_REPORT_PATH", "--report must end in .json.");
  }
  const contents = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(contents) > HARNESS_LIMITS.reportBytes) {
    throw new Error("The report exceeded the bounded report size.");
  }
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, { encoding: "utf8", flag: "w" });
  return absolutePath;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = options.mode === "plan" ? buildPlan(options) : await runLocalHarness(options);
    const reportPath = await writeReport(options.reportPath, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (reportPath) process.stderr.write(`Report written: ${reportPath}\n`);
    if ((options.mode === "execute" && report.gates?.passed !== true) || report.passed === false) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify(
        {
          harnessVersion: HARNESS_VERSION,
          mode: "failed",
          code: boundedText(error?.code ?? "HARNESS_FAILED", 80),
          message: boundedText(error?.message ?? error, 500),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
