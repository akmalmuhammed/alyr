# Heldat 10K capacity evidence — 2026-07-31

## Release posture

Heldat remains in a **controlled-pilot** posture. The current Supabase Free
project and the bounded public-route probe provide useful pilot evidence; they
do not establish capacity, recovery, or observability readiness for 10,000
active users.

## Verified free-tier envelope

Current official Supabase limits are 500 MB database storage, 1 GB file
storage, 5 GB monthly egress, 500,000 monthly Edge Function invocations, and
one-day API/database log retention on Free. Free also has no automatic
backups, metrics endpoint, log drain, or uptime SLA.

Repository controls currently declare a 40 MiB household storage allowance,
an 800 MiB global application allowance, and a 10 MiB attachment maximum.

| 10K calculation | Verified result |
|---|---:|
| Free database capacity per user | 50,000 bytes |
| Free file-storage capacity per user | 100,000 bytes |
| Free monthly egress per user | 500,000 bytes |
| Free monthly Edge invocations per user | 50 |
| 800 MiB application allowance per user | 83,886.08 bytes |
| 40 MiB declared allowance across 10K households | 419,430,400,000 bytes |
| Households fitting the 800 MiB cap at the full 40 MiB allowance | 20 |
| Households fitting the 800 MiB cap with one 2 MiB image | 400 |

Sources: [Supabase pricing](https://supabase.com/pricing),
[Edge Function invocation usage](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations),
[Edge Function limits](https://supabase.com/docs/guides/functions/limits), and
[Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## Bounded live probe

The execution-gated probe is implemented in
`supabase/scripts/api-capacity-probe.mjs` with its regression suite in
`supabase/tests/api_capacity_probe.test.mjs`. It defaults to calculation-only
mode. Live execution is restricted to HTTPS Supabase hosts and the read-only
`/functions/v1/api/signup/mode` route, with hard caps of 20 requests, three
concurrent requests, and five requests per second.

Latest production sample:

| Measurement | Result |
|---|---:|
| Requests | 3/3 HTTP 200 |
| Minimum latency | 421 ms |
| p50 latency | 702 ms |
| p95 / p99 / maximum latency | 892 ms |
| Transport failures | 0 |
| Request-ID failures | 0 |
| Cache-policy failures | 0 |
| Signed-payload contract failures | 0 |
| Retry-header failures | 0 |
| Rate-limited responses | 0 |
| Probe result | Passed |

Boundary: this three-request public read sample is **not authenticated
sync/upload load** and is not proof of 10K throughput.

## Verified implementation strengths

- Household tenant tables are covered by deny-by-default RLS checks.
- Sync commands are actor-bound, versioned, idempotent, and conflict-aware.
- Evidence uses private storage, immutable object keys, bounded uploads, and
  server-verified byte size and SHA-256.
- Public and authenticated routes have bounded rate policies and hashed scope
  storage.
- Request telemetry contains request ID, route, status, and duration without
  query strings or application payloads.
- The Supabase static suite, including the capacity probe, passed 110/110
  checks on 2026-07-31.

## Remaining hard gates

1. Execute and verify a real encrypted database-plus-private-Storage backup,
   copy it outside the active project/account boundary, and complete an
   isolated full restore drill.
2. After the verified backup, separately approve migration `202607310007`,
   activate sync-retention and blob-maintenance schedules, and record a
   witnessed successful run.
3. After migration 007 verification, separately approve migration
   `202607310008` and verify retained-byte accounting and readiness signals.
4. After migration 008 verification, approve target `202607310010`. The
   checksum-pinned wrapper records legacy `009` as superseded without executing
   its SQL and applies only 010; if 009 is already recorded, apply 010
   immediately. Verify the old signature is absent, the replacement is
   service-role-only, and the admitted/denied tenant matrix passes.
5. After migration 010 verification, separately deploy the Edge API without a
   database push; run the public and opt-in authenticated household-storage
   probes. Rollback restores the prior Edge version first and retains migrations
   008 and 010; database reversal requires a new forward migration.
6. Approve recovery objectives, escrow and rotate the backup key, schedule the
   backup, and prove freshness and deliberately failed-canary alert delivery.
7. Activate a storage provider and paid capacity envelope sized for expected
   files and egress; the 800 MiB application cap fits neither 10K household
   allowances nor the expected evidence workload.
8. Configure custom transactional SMTP, aligned SPF/DKIM, and tested signup,
   confirmation, recovery, and invitation delivery before public enrollment.
9. Enable and verify database SSL enforcement and reviewed network
   restrictions after the pre-change backup.
10. Run representative authenticated sync, upload, checksum, download,
   bootstrap, conflict, cleanup, and export load against staging; also measure
   database size using a projected 10K fixture.
11. Establish durable metrics and alerting for API latency/errors, auth,
   database pressure, Storage/egress, sync backlog, cleanup, backup freshness,
   mobile crashes, and 50%/70%/85% quota thresholds.
12. Add and validate signup/sign-in/recovery bot controls, export current
   Security and Performance Advisor findings, and test the on-call
   acknowledgement path.

Public expansion remains gated until these controls have dated operational
evidence. The detailed recovery gates remain authoritative in
`docs/operations/10K_GO_LIVE_OPERATIONS_GATE.md`.
