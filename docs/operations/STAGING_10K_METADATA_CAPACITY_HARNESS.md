# Heldat disposable-local 10K metadata capacity harness

## Purpose

`supabase/scripts/staging-10k-metadata-harness.mjs` measures a deterministic,
synthetic metadata workload on the **fixed disposable local Supabase Docker
database**. Its default invocation is a plan: it does not inspect Docker,
connect to a database, create a schema, or write a report file unless an
operator explicitly asks for those actions.

This harness is one input to capacity planning. A pass means that the measured
machine completed the declared direct-Postgres fixture within the stated batch
latency budget. It is not evidence for 10,000 concurrent sessions, public-launch
readiness, hosted Supabase behavior, Auth/RLS performance, Edge throughput,
object storage, egress, Realtime, or mobile synchronization.

## Verified local baseline — 2026-08-01

The committed smoke report is
`docs/operations/evidence/heldat-local-capacity-smoke-2026-08-01.json`
(5,315 bytes; SHA-256
`D578CD3BD8E670D5C7F108392F2786E05D35FCA992F7292234CC3F6F9A41D7CC`).
It ran against the exact healthy `supabase_db_alyr-local` container after a
Docker restart and passed every gate:

- 2 modeled users and 22/22 reconciled metadata rows;
- 2/2 batch transactions, zero errors, and p95 499.25 ms;
- 221,184 database-growth bytes and 15,344 WAL bytes;
- one peak load connection, zero waiting load locks;
- 475,136 retained schema bytes before cleanup and zero after cleanup.

The real default 10K command then stopped before schema creation with
`INSUFFICIENT_LOCAL_DISK`: it required 2,118,950,912 free bytes and observed
606,834,688. This is proof that the mutation guard works, not the missing full
10K measurement. The default non-mutating plan remains 10,000 users, 250,000
assets, and 1,030,000 metadata rows.

## Safety contract

The harness has deliberately narrow target support:

- accepted target: Docker container `supabase_db_alyr-local`;
- required Docker labels: both Compose and Supabase project labels must equal
  `alyr-local`;
- required state: running and healthy;
- hosted URLs, database URLs, credentials, project refs, `--linked`, and
  production target names are unsupported and rejected;
- execution and cleanup require the exact disposable-target confirmation;
- retention requires a second, different confirmation;
- the workload is capped at 10,000 modeled users, 25 assets per user, four
  workers, 250 users per batch, and 1.5 million generated rows;
- a local-disk preflight reserves 512 MiB beyond a conservative peak estimate;
- the default execution drops its isolated schema after measurements, including
  when a batch fails;
- every fixture is generated from the fixed `heldat-capacity-v1` seed and uses
  names such as `Synthetic household`; customer and production records never
  enter the workload.

The harness creates only the schema `heldat_capacity_harness`. It does not write
to the application `public`, `auth`, or `storage` schemas.

## Default 10K workload

| Modeled metadata | Per user | Total |
|---|---:|---:|
| Household | 1 | 10,000 |
| Membership | 1 | 10,000 |
| Place | 1 | 10,000 |
| Asset Passport | 25 | 250,000 |
| Current location revision | 25 | 250,000 |
| Evidence metadata | 25 | 250,000 |
| Sync operation | 25 | 250,000 |
| **Modeled rows** | **103** | **1,030,000** |

Evidence declares a logical 2 MiB file size, which makes the default logical
attachment envelope 524,288,000,000 bytes. The binary objects are intentionally
not stored. Consequently this run measures database metadata—not Supabase
Storage capacity. The existing free-tier quota guard and a separate object-store
exercise must cover retained media.

## Commands

Run these commands from the repository root.

### 1. Review the non-mutating plan

```powershell
node supabase/scripts/staging-10k-metadata-harness.mjs
```

The JSON must contain:

```json
{
  "mode": "plan",
  "mutatesDatabase": false,
  "target": {
    "hostedTargetsAccepted": false,
    "linkedTargetsAccepted": false,
    "credentialsAccepted": false
  }
}
```

### 2. Run focused contract tests

```powershell
node --test supabase/tests/staging_10k_metadata_harness.test.mjs
```

These tests prove plan-by-default behavior, confirmation ordering, target
refusal, workload caps, deterministic SQL generation, measurement aggregation,
and CLI behavior with `PATH` empty so Docker could not be invoked accidentally.

### 3. Run a tiny local smoke fixture

Start the repository's local Supabase stack first, then run:

```powershell
node supabase/scripts/staging-10k-metadata-harness.mjs `
  --execute `
  --confirm-disposable=HELDAT_LOCAL_SUPABASE_ONLY `
  --users=10 `
  --batch-users=5 `
  --concurrency=1 `
  --report=output/capacity/heldat-local-smoke.json
```

The default cleanup occurs before the command reports success. The retained
schema byte count after cleanup must equal zero.

### 4. Run the full 10K metadata fixture

Do this only on a machine whose local disk preflight passes and whose Docker
resources are intentionally available for the measurement:

```powershell
node supabase/scripts/staging-10k-metadata-harness.mjs `
  --execute `
  --confirm-disposable=HELDAT_LOCAL_SUPABASE_ONLY `
  --report=output/capacity/heldat-local-10k.json
```

The input cap is 10,000 users. Raising an option cannot turn this script into an
unbounded soak test.

### 5. Cleanup a deliberately retained fixture

Retention is useful only for `EXPLAIN`, index inspection, or a separate read
profile. It needs both confirmations:

```powershell
node supabase/scripts/staging-10k-metadata-harness.mjs `
  --execute `
  --confirm-disposable=HELDAT_LOCAL_SUPABASE_ONLY `
  --retain `
  --confirm-retain=HELDAT_RETAIN_SYNTHETIC_FIXTURE `
  --users=100 `
  --batch-users=25 `
  --concurrency=2
```

Remove that schema with:

```powershell
node supabase/scripts/staging-10k-metadata-harness.mjs `
  --cleanup `
  --confirm-disposable=HELDAT_LOCAL_SUPABASE_ONLY `
  --users=1 `
  --batch-users=1 `
  --concurrency=1
```

## Recorded measurements

Each execution report records:

- successful batch latency minimum, p50, p95, p99, and maximum;
- modeled users and metadata rows per second;
- bounded batch and observer error counts/samples;
- database bytes before setup, before load, and after load;
- database byte growth during load;
- WAL bytes generated after empty-schema setup;
- peak observed database, load, and active-load connections;
- peak observed database and load locks, including waiting locks;
- heap, index, and total retained bytes for every fixture table;
- retained schema bytes before cleanup and after cleanup;
- expected versus actual row counts for every modeled table;
- all assumptions and pass/fail gate outcomes.

The connection/lock observer samples every 250 ms. Very short events between
samples may not be observed. The p50/p95/p99 unit is a complete transaction for
one `batch-users` range, including local `docker exec` and `psql` startup.

## Pass gates

The run passes only when all of the following are true:

1. every batch transaction succeeds;
2. every table has its exact deterministic row count;
3. p95 batch latency is within `--p95-budget-ms` (30 seconds by default);
4. no waiting lock is observed for a load connection;
5. automatic cleanup leaves zero retained bytes, unless retention was
   independently confirmed.

Keep the JSON report with the machine CPU/RAM, Docker Desktop resource limits,
PostgreSQL version, Git commit, and date in the release evidence. Comparisons
between runs are meaningful only when those conditions and workload options are
the same.

## Required complementary evidence

Before a 10K launch decision, this database-only result must be combined with:

- authenticated Edge sync push/pull latency and idempotency under staged load;
- tenant/RLS negative tests under concurrency;
- real object upload/download and retained-byte measurements through the active
  `BlobStore` provider;
- egress and Edge-invocation projections against current provider limits;
- production backup plus isolated restore proof;
- mobile offline/reconnect, conflict, and process-death journeys;
- hosted connection-pool saturation, lock, WAL, and database-growth telemetry;
- gradual enrollment gates with 50/70/85/100 percent capacity actions.
