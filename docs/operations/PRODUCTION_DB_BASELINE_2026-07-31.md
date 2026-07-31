# Heldat production database baseline — 2026-07-31

## Scope

This is a read-only health snapshot of the linked closed-pilot Supabase
database. It establishes a pre-load baseline; its small dataset is not evidence
of 10,000-user throughput or storage capacity.

The operator ran Supabase CLI `2.109.1` with the linked project and these
non-mutating inspections:

```text
supabase inspect db db-stats --linked
supabase inspect db bloat --linked
supabase inspect db index-stats --linked
supabase inspect db vacuum-stats --linked
supabase inspect db role-stats --linked
```

No query-text report, credentials, application payload or tenant content was
captured in this evidence.

## Observed baseline

| Signal | Result |
|---|---:|
| Database size | 13 MB |
| Total index size | 768 kB |
| Total table size | 40 kB |
| Total TOAST size | 0 bytes |
| WAL size | 80 MB |
| Table cache-hit rate | 1.00 |
| Index cache-hit rate | 0.93 |
| Time since statistics reset | 4 days, 11:56:58 |
| Reported relation bloat | No rows |
| `authenticator` statement / lock timeout | 8 s / 8 s |
| `authenticated` statement timeout | 8 s |
| `anon` statement timeout | 3 s |
| Connection limit reported for provider roles | 60 each |

At capture time, application relations were nearly empty. The only reported
dead tuples were 30 in `api_rate_limit_buckets`, three in
`pilot_signup_approvals`, and one in `pilot_enrollments`; every one remained
below its autovacuum threshold. The current index-usage report therefore says
little about production query plans. Zero scans on empty tables must not be
used to remove release indexes.

## Interpretation

- There was no reported table bloat or immediate connection pressure during
  the snapshot.
- The 0.93 index cache-hit baseline needs remeasurement after representative
  fixture loading and authenticated sync/upload traffic.
- Provider statement timeouts bound runaway client work, but they do not
  replace route-level latency/error budgets.
- The database is far below its provider size boundary today; projected asset,
  event, sync and evidence metadata still need a measured 10K fixture.
- WAL is materially larger than the tiny logical table set, so the next load
  test must observe WAL growth and cleanup rather than extrapolating only from
  table bytes.

## Next evidence required

1. Load a privacy-safe synthetic model representing 10,000 users/households in
   a disposable staging project.
2. Run authenticated sync push/pull, upload lifecycle, evidence download,
   bootstrap, conflict, export and cleanup traffic with realistic concurrency.
3. Capture p50/p95/p99 latency, error and timeout rates, database CPU,
   connections, cache hits, WAL, locks, sequential scans and relation growth.
4. Run `EXPLAIN (ANALYZE, BUFFERS)` only against synthetic staging data for the
   slowest reviewed queries; never capture production tenant literals.
5. Repeat this baseline after the approved migrations and before each public
   enrollment expansion.
