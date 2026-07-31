# Heldat 10K go-live operations gate

## Status

The repository contains a fail-closed, encrypted operator backup and isolated
restore toolchain. That implementation is necessary but does not by itself
prove production operations readiness. A 10,000-user launch remains gated on
the external evidence below.

## Current provider boundary

Checked against the official Supabase documentation on 2026-07-31:

- the Free plan has no automatic backups, one-day API/database log retention,
  no Log Drains, no metrics endpoint and no uptime SLA;
- its included capacity is 500 MB of database storage and 1 GB of file
  storage;
- Supabase recommends that Free projects regularly produce logical dumps and
  retain them off site.

Sources:
[Supabase pricing](https://supabase.com/pricing),
[Database backups](https://supabase.com/docs/guides/platform/backups), and
[Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

The provider's 50,000-MAU allowance is therefore not evidence that the Free
plan can safely operate Heldat at 10,000 users. Capacity, recovery,
observability and support are separate launch gates.

## Known 10K blockers

- One GB of provider file storage is about 100 KB per user at 10,000 users,
  before replication or operating headroom. That does not fit a
  photo-and-document asset product.
- Backup format v1 accepts at most 250,000 Storage objects. At 10,000 users,
  that is exactly 25 objects each with no margin for documents, versions,
  exports or operational objects.
- Only the atomic `local-v1` destination is installed. The reviewed R2/S3
  contract exists, but requesting either remote adapter fails closed.
- Storage capture and restore are intentionally sequential and a failed job is
  restarted. There is no resumable remote multipart destination or measured
  retry envelope for projected 10K volume.
- No repository scheduler, backup-freshness alarm, tested alert route or
  dated real-provider restore drill currently proves recovery readiness.

These are capacity and operations blockers, not defects hidden by the passing
unit suite.

## Evidence already available

| Control | Repository evidence | Current result |
|---|---|---|
| Backup cryptography and tamper detection | `npm run check:backup-restore` | Automated |
| Atomic local destination and off-repository guard | `supabase/tests/backup_restore_tooling.test.mjs` | Automated |
| Full backup/restore orchestration with streamed database and Storage fixtures | `supabase/tests/backup_restore_tooling.test.mjs` | Automated |
| Database and private Storage capture boundaries | `supabase/scripts/backup-operations.mjs` | Implemented |
| Restore-to-production prevention | `assertNonProductionRestoreTarget` tests | Automated |
| Offline artifact verification | `heldat-backup.mjs verify` | Implemented |
| Retention survivor verification | `heldat-backup.mjs retention` | Implemented |
| CI regression gate | `.github/workflows/ci.yml` | Automated |
| Operator procedure | `BACKUP_RESTORE_RUNBOOK.md` | Documented |

## Required evidence before public launch

Each row is a blocking gate. Record an artifact or timestamped operator record;
an implementation, test double, or dry run is not completion evidence for a
real-provider control.

| Priority | Gate | Required evidence | Current state |
|---|---|---|---|
| P0 | Independent backup destination | Encrypted committed backup copied outside the active Supabase project/account and verified from that copy | Pending |
| P0 | Real database + Storage backup | Successful `backup --execute` and `verify` against the intended production project during a controlled low-write window | Pending |
| P0 | Full restore drill | Successful restore and independent `verify-restore` in a disposable Supabase project, including Auth, application data, bucket creation and every object checksum | Pending |
| P0 | Scheduled execution | Reviewed scheduler/runner, secret injection, immutable logs, failure notification and a witnessed successful scheduled run | Pending |
| P0 | Backup freshness alert | Alert fires when the latest verified independent backup exceeds the recovery-point objective | Pending |
| P0 | Failure alert delivery | A deliberately failed canary backup reaches the on-call destination and is acknowledged | Pending |
| P0 | Recovery objectives | Product owner approves RPO and RTO; a timed restore drill demonstrates both | Pending |
| P0 | Key custody | Encryption key exists in an approved secret manager with documented recovery and rotation owners; it is not stored with the backup | Pending |
| P1 | Three-copy policy | Inventory proves three encrypted copies, two media/providers and one outside the active account boundary | Pending |
| P1 | Restore-role compatibility | Drill proves required PostgreSQL roles/extensions exist on a fresh target and retained grants restore correctly | Pending |
| P1 | Capacity envelope | Measured backup duration, encrypted size, object count and restore duration at projected 10K data volume stay within the operating window | Pending |
| P1 | Runbook rehearsal | A second operator completes the drill using only the runbook and records ambiguities | Pending |

## Monitoring minimum for 10K

The launch dashboard and alerts must cover:

- Edge/API request volume, latency, timeout rate and error rate by route;
- authentication signup, login, callback and recovery failure rates;
- database CPU, connections, storage, slow queries and lock pressure;
- Storage bytes, egress, upload completion failures and cleanup backlog age;
- sync push/pull latency, conflict rate, retry rate, oldest outbox age and
  bootstrap volume;
- export and blob-maintenance queue age, claim failures and terminal errors;
- backup age, duration, byte/object totals, verification outcome and retention
  outcome;
- mobile crash-free sessions, startup failures and release adoption;
- quota saturation at 50%, 70% and 85% of the provider limits.

Alerts need an owner, severity, acknowledgement path and recovery runbook.
Provider dashboards without tested alert delivery do not satisfy this gate.

## Backup operating policy

- Set an explicit RPO and RTO before launch. Until approved, use a conservative
  daily backup plus pre-migration backup and a monthly restore drill.
- Quiesce writes where practical. The current v1 database capture uses a
  consistent `pg_dump` plus boundary schema and row-count checks; an
  equal-row-count update can occur between those checks and is not detected.
- Keep database and Storage capture in the same controlled window. They are
  separate services and do not share one atomic snapshot.
- Do not call a backup recoverable until its independent copy passes offline
  verification and at least one representative restore drill has passed.
- Recreate the isolated target after any partial restore failure.

## Release decision

Public launch is **GO** only when every P0 row has dated evidence and no
unresolved high-severity incident exists. If any P0 row is pending, the
appropriate release state is a controlled pilot with enrollment and storage
limits, not an unrestricted 10K-user launch.
