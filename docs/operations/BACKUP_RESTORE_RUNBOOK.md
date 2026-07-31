# Heldat operator backup and restore runbook

## Purpose and boundary

This runbook covers encrypted, operator-controlled backups of:

- the PostgreSQL database reachable through the configured direct connection;
- every **private** Supabase Storage bucket and its objects.

The backup destination must be outside the repository and outside the active
Supabase project. The initial destination is a local absolute path, normally a
separately protected disk or mounted backup volume. The format has a versioned
destination-adapter contract for a later R2/S3 implementation.

This is distinct from a user's Recovery Kit. It is also not a claim of managed
backups, continuous point-in-time recovery, or end-to-end encryption.

The v1 backup does **not** include:

- Supabase project settings, authentication-provider configuration, Edge
  Function secrets, DNS, logs, or billing configuration;
- PostgreSQL global roles and other cluster-wide objects that `pg_dump` does
  not export;
- public Storage bucket bytes. Because PostgreSQL contains their metadata,
  backup v1 aborts if any public bucket exists rather than creating an
  internally incomplete backup;
- every Storage metadata field (object bytes, name, content type, update time,
  and reviewed bucket constraints are included).

Keep an independently protected configuration inventory for these excluded
items.

## Operator safety rules

1. Run the backup from a trusted operator workstation or locked-down CI runner.
2. Quiesce writes, or run during a controlled low-write window. PostgreSQL and
   Storage are captured sequentially, not in one cross-service transaction.
3. Keep the encryption key in a password manager or CI secret store, separate
   from backup files. Losing it makes the backup irrecoverable.
4. Never place database URLs, service-role keys, or the encryption key in CLI
   arguments, checked-in `.env` files, scripts, logs, or CI artifacts.
5. Restore only into a disposable, isolated **non-production** project. The
   database restore uses `--clean --if-exists` and can replace target objects.
6. Keep the restore target closed to application traffic while restoring and
   verifying it.
7. A successful backup job is not sufficient. Run offline verification after
   creation and a full restore drill on a schedule.

The source database and Storage are read-only from this tool's perspective.
Restore and retention are the only destructive operations, and both require an
explicit `--execute` mode. Restore additionally requires target classification
and a target-specific confirmation fingerprint.

## Requirements

- Node.js `22.22.0` or newer.
- `pg_dump`, `pg_restore`, and `psql` installed and callable.
- PostgreSQL client tools compatible with the source and restore target. Use
  the same client major version for backup and restore drills, and install the
  current security-patched minor release with `--restrict-key` support.
- A direct PostgreSQL URL containing a username and password with sufficient
  read access to the source schemas.
- Standard Supabase project-ref-bearing endpoints: either
  `db.PROJECT_REF.supabase.co` or a `*.pooler.supabase.com` connection whose
  username is `postgres.PROJECT_REF`, paired with
  `https://PROJECT_REF.supabase.co`. An unrecognized proxy/custom-domain pair
  is rejected because the tool cannot prove database and Storage belong to the
  same project.
- A Supabase service-role key for the source project.
- For restore execution, direct database credentials and a service-role key for
  the isolated target project.
- A local backup destination using an absolute path outside this repository.

Override tool locations on Windows or CI when they are not on `PATH`:

```powershell
$env:HELDAT_PG_DUMP_BIN = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
$env:HELDAT_PG_RESTORE_BIN = 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe'
$env:HELDAT_PSQL_BIN = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
```

Remote database connections default to and require `sslmode=verify-full`.
Set `HELDAT_PG_SSLROOTCERT` to the reviewed CA bundle path before every remote
backup or restore; the command fails closed when the CA path is absent or a
weaker TLS mode is requested. `disable`, `allow`, and `prefer` remain available
only as an explicit local-development override for `localhost`, `127.0.0.1`, or
`::1` (for example, append `?sslmode=disable` to a local Supabase URL). The
connection timeout defaults to 30 seconds and can be set from 1–120 seconds with
`HELDAT_PG_CONNECT_TIMEOUT`. Ambient `PG*` variables are discarded so an
inherited `PGSERVICE`, `PGPASSFILE`, or `PGOPTIONS` cannot silently redirect the
operation. PostgreSQL subprocesses inherit only a minimal allow-list of
operating-system path, locale, temporary-directory, and user variables;
unrelated ambient credentials are not forwarded. Tool output is forced to the
stable `C` locale so version parsing and schema fingerprints do not depend on
the operator machine's language.

Each PostgreSQL subprocess has a 30-minute wall-clock limit. Override it from
1,000–21,600,000 milliseconds with `HELDAT_PG_OPERATION_TIMEOUT_MS`. Database
dump lock acquisition has a separate 30-second limit, configurable from
1,000–600,000 milliseconds with `HELDAT_PG_LOCK_WAIT_TIMEOUT_MS`. A timeout
terminates the process, escalates termination if needed, and fails the job.

## One-time key setup

Generate a random 32-byte key into the current PowerShell process:

```powershell
$env:HELDAT_BACKUP_ENCRYPTION_KEY_BASE64 = (
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
)
```

Immediately store the value in the approved password manager or secret store.
Do not print it. On future runs, load it from that secret store directly into
the process environment.

Do not mix backups encrypted with different keys in the same destination
directory. `list` and retention authenticate every committed envelope and fail
closed on a key mismatch. For key rotation, create a new destination
generation, retain the old key for its retention period, and perform a restore
drill from the new generation before retiring the old one.

## Validate the tooling

This deterministic check uses no cloud credentials:

```powershell
npm run check:backup-restore
```

It covers encryption/decryption, tamper detection, manifest and envelope
authentication, off-project path enforcement, atomic local commits, retention,
restore guards, subprocess secret handling, and CLI fail-closed behavior.

## Create a backup

Load source credentials into the current process. Values below are typed slots,
not literal credentials:

```powershell
$env:HELDAT_BACKUP_DESTINATION = 'local:E:\HeldatBackups\generation-001'
$env:HELDAT_SOURCE_DATABASE_URL = 'postgresql://ROLE:PASSWORD@HOST:5432/postgres?sslmode=verify-full'
$env:HELDAT_PG_SSLROOTCERT = 'C:\HeldatOperator\certificates\supabase-ca.pem'
$env:HELDAT_SOURCE_SUPABASE_URL = 'https://PROJECT_REF.supabase.co'
$env:HELDAT_SOURCE_SUPABASE_SERVICE_ROLE_KEY = 'SERVICE_ROLE_KEY'
```

Run the no-write preflight:

```powershell
node .\supabase\scripts\heldat-backup.mjs backup --dry-run
```

The preflight validates the destination, identities, secret types, and database
tool availability. It does not connect to the database or Storage and reports
hashed source identities rather than URLs. The database endpoint, Storage
origin, and project reference must expose one consistent project identity.

After reviewing the plan:

```powershell
node .\supabase\scripts\heldat-backup.mjs backup --execute
```

The command returns a `backupId`. Record that identifier in the operator log.
Storage object names are intentionally omitted from progress output. A backup
becomes visible only after every encrypted artifact and the authenticated
manifest are verified, encrypted files are flushed, and the staging directory
is atomically renamed.

If a handled creation failure occurs, the `.partial-*` staging directory is
removed. An abrupt process or machine stop can leave an ignored `.partial-*`
directory; quarantine and remove it only after confirming no job is active. A
failed job must not be recorded as a completed backup.

The database capture hashes the schema and counts rows in the configured
schemas before and after `pg_dump`. A boundary mismatch aborts the backup.
These checks detect schema changes and row-count changes but do not detect an
equal-count update, so the controlled low-write/quiesced-window rule still
applies. Database ACL/grant statements are retained in the dump; object owners
are intentionally not replayed, and restore stops when required target roles
are absent.

Each backup generates a fresh random alphanumeric `pg_dump --restrict-key` for
its repeatable plain schema comparisons. That key is stored only inside the
encrypted manifest and reused for restore verification; it is not a global or
predictable key. Restore verification compares a canonical schema fingerprint
that removes volatile pg_dump tool/server-version and timing comment lines
while preserving DDL and grant statements.

## Verify a backup without cloud access

Only the encryption key, destination, and backup identifier are required:

```powershell
node .\supabase\scripts\heldat-backup.mjs verify `
  --destination 'local:E:\HeldatBackups\generation-001' `
  --backup-id 'heldat-backup-YYYYMMDDTHHMMSSZ-1234abcd'
```

Verification authenticates the plaintext envelope, decrypts the manifest in
memory, and reads every encrypted artifact through AES-256-GCM while comparing
the recorded plaintext and ciphertext size/checksum. It does not write
plaintext files.

Copying a backup to another medium must be followed by this command against the
copied destination.

## Retention

The default policy preserves at least seven newest backups and preserves every
backup newer than 30 days. A backup is a deletion candidate only when it is
both beyond `keep-count` and older than `keep-days`.

Preview:

```powershell
node .\supabase\scripts\heldat-backup.mjs retention `
  --destination 'local:E:\HeldatBackups\generation-001' `
  --keep-count 7 `
  --keep-days 30 `
  --dry-run
```

Before producing a retention result, the command decrypts and authenticates
every backup that would survive the policy. A corrupt survivor blocks all
deletion. Delete only the authenticated candidates shown by the preview:

```powershell
node .\supabase\scripts\heldat-backup.mjs retention `
  --destination 'local:E:\HeldatBackups\generation-001' `
  --keep-count 7 `
  --keep-days 30 `
  --execute
```

Retention authenticates an envelope before deleting its exact backup
directory. Unrecognized directories and `.partial-*` staging paths are ignored.

## Restore drill into a non-production target

### 1. Prepare an isolated target

- Create a separate, disposable Supabase project.
- Confirm its database host and Supabase origin differ from the source.
- Confirm the project reference embedded in its database endpoint matches its
  Supabase origin and differs from the source project reference.
- Prevent application clients and background workers from writing to it.
- Obtain direct database credentials with sufficient restore privileges.
- Use an empty target where possible. Existing private Storage objects with the
  same keys are overwritten during restore.

Set target values:

```powershell
$env:HELDAT_RESTORE_DATABASE_URL = 'postgresql://ROLE:PASSWORD@RESTORE_HOST:5432/postgres?sslmode=verify-full'
$env:HELDAT_PG_SSLROOTCERT = 'C:\HeldatOperator\certificates\supabase-ca.pem'
$env:HELDAT_RESTORE_SUPABASE_URL = 'https://RESTORE_PROJECT_REF.supabase.co'
```

### 2. Produce and review the target fingerprint

```powershell
node .\supabase\scripts\heldat-backup.mjs restore `
  --destination 'local:E:\HeldatBackups\generation-001' `
  --backup-id 'heldat-backup-YYYYMMDDTHHMMSSZ-1234abcd' `
  --dry-run
```

The output contains `expectedConfirmation`, for example
`non-production:0123456789abcdef`. The value is derived from hashed target
database and Supabase identities. The dry run authenticates the entire backup
but performs no target network calls or writes.

### 3. Execute

Load the target-only secret and classification:

```powershell
$env:HELDAT_RESTORE_SUPABASE_SERVICE_ROLE_KEY = 'TARGET_SERVICE_ROLE_KEY'
$env:HELDAT_RESTORE_TARGET_CLASS = 'non-production'
```

Then execute with the exact fingerprint from the dry run:

```powershell
node .\supabase\scripts\heldat-backup.mjs restore `
  --destination 'local:E:\HeldatBackups\generation-001' `
  --backup-id 'heldat-backup-YYYYMMDDTHHMMSSZ-1234abcd' `
  --confirm-target 'non-production:0123456789abcdef' `
  --execute
```

Execution order:

1. authenticate the envelope, manifest, and all encrypted artifacts offline;
2. reject a source-matching, unclassified, or incorrectly confirmed target;
3. decrypt the custom database dump as a stream into `pg_restore`;
4. ensure every destination bucket is private and upload decrypted object
   streams;
5. regenerate and compare the database schema fingerprint;
6. compare exact row counts for the configured schemas;
7. download and hash every restored Storage object.

No decrypted attachment or database dump is persisted to disk by the tool.
The database restore uses one `pg_restore --single-transaction`; Storage
restoration and the database are still separate services, so a later Storage
failure requires discarding/recreating the isolated target.

If restore fails, discard and recreate the isolated target before retrying. Do
not treat a partially restored target as a rollback point, and do not redirect
the command to production.

## Re-run restore verification

After a successful restore, verification can be repeated independently:

```powershell
node .\supabase\scripts\heldat-backup.mjs verify-restore `
  --destination 'local:E:\HeldatBackups\generation-001' `
  --backup-id 'heldat-backup-YYYYMMDDTHHMMSSZ-1234abcd' `
  --confirm-target 'non-production:0123456789abcdef' `
  --execute
```

Use `--dry-run` first when target values change. Exact schema comparison assumes
compatible PostgreSQL tool versions and compatible target extensions. Row-count
and Storage verification assumes the target remains isolated from writes.

To verify other schemas in addition to `auth`, `public`, and `storage`:

```powershell
$env:HELDAT_BACKUP_VERIFY_SCHEMAS = 'auth,public,storage,CUSTOM_SCHEMA'
```

Use the same value during backup and restore verification.

## CI operation

Use a locked-down runner with a mounted off-project backup volume. Inject every
secret through the CI secret store and mask it in logs. A minimal sequence is:

```text
npm ci
npm run check:backup-restore
node supabase/scripts/heldat-backup.mjs backup --dry-run
node supabase/scripts/heldat-backup.mjs backup --execute
node supabase/scripts/heldat-backup.mjs verify --backup-id BACKUP_ID
copy the encrypted committed directory to independent storage
verify the independent copy
node supabase/scripts/heldat-backup.mjs freshness --max-age-hours 30 --verify-artifacts
```

The runner must retain no workspace, process environment, or command log after
the job. Do not rely on an ephemeral CI filesystem as the only destination.

## Schedule and evidence

For the closed pilot:

- encrypted database and private Storage backup after each onboarding day and
  before each migration;
- offline verification after every backup and every copy;
- retention dry run before every retention execution;
- full isolated-target restore drill before external onboarding, monthly during
  the pilot, and after format/tool/key changes;
- three copies across two media or providers, with one copy outside the active
  project/account boundary.

Record only: backup identifier, UTC time, tool versions, destination generation,
verification result, restore-drill result, and operator role. Do not record URLs
containing credentials, service-role keys, encryption keys, object names, or
decrypted manifests.

## Freshness and failure-delivery monitoring

The monitor authenticates every committed completion envelope, decrypts and
validates the newest manifest, and compares the authenticated `completedAt`
timestamp with a bounded age policy. It fails closed when the destination is
empty, an envelope or manifest is invalid, the newest completion time is too
old, or the completion time is unreasonably ahead of the runner clock.

```powershell
$env:HELDAT_BACKUP_DESTINATION = 'local:D:\HeldatBackups'
$env:HELDAT_BACKUP_MAX_AGE_HOURS = '30'
$env:HELDAT_BACKUP_ENCRYPTION_KEY_BASE64 = '<read from the approved secret manager>'

# Lightweight scheduled check: authenticated envelope + manifest.
node supabase/scripts/heldat-backup.mjs freshness

# Periodic deep check: also decrypt and authenticate every database and
# private-Storage artifact in the newest backup.
node supabase/scripts/heldat-backup.mjs freshness --verify-artifacts
```

A successful check emits one JSON document containing `backupId`,
`completedAt`, `checkedAt`, `ageSeconds`, `maxAgeSeconds`,
`committedBackupsSeen`, `artifactsVerified`, and `status: fresh`. It never emits
the encryption key, database URL, service-role key, object names or decrypted
manifest.

Wire every nonzero exit to the on-call alert route. Test that route deliberately
with the secret-free failure canary:

```powershell
node supabase/scripts/heldat-backup.mjs freshness --failure-canary
```

The canary exits nonzero with code `BACKUP_MONITOR_CANARY_FAILURE`. Record the
runner timestamp, alert receipt timestamp and acknowledgement timestamp. The
canary proves alert delivery only; the next real freshness check must also pass
before the backup gate is healthy.

## Clear process secrets

After the operation:

```powershell
Remove-Item Env:HELDAT_SOURCE_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:HELDAT_SOURCE_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:HELDAT_RESTORE_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:HELDAT_RESTORE_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:HELDAT_BACKUP_ENCRYPTION_KEY_BASE64 -ErrorAction SilentlyContinue
Remove-Item Env:HELDAT_PG_SSLROOTCERT -ErrorAction SilentlyContinue
```

Also close the operator shell and follow the workstation's secret-handling and
memory-clearing procedure.

## Failure guide

| Error code | Meaning / action |
|---|---|
| `DESTINATION_INSIDE_PROJECT` | Choose an absolute destination outside the repository. |
| `DESTINATION_CONTAINS_PROJECT` | Choose a dedicated destination that does not contain the repository. |
| `BACKUP_DESTINATION_NOT_FOUND` | Read/retention/restore commands require an existing destination; verify the mounted path. |
| `DESTINATION_ADAPTER_NOT_INSTALLED` | R2/S3 was requested before a reviewed adapter was installed. |
| `INVALID_ENCRYPTION_KEY` | Reload the exact canonical base64 32-byte key for this destination generation. |
| `BACKUP_ENVELOPE_AUTHENTICATION_FAILED` | Stop; key mismatch or envelope tampering. Do not run retention. |
| `DECRYPTION_AUTHENTICATION_FAILED` | Stop; artifact corruption, tampering, or wrong key. Recover another verified copy. |
| `DATABASE_TOOL_START_FAILED` | Install PostgreSQL client tools or set the three binary override variables. |
| `DATABASE_TOOL_FAILED` | Review database role/version compatibility; routine output includes only the suppressed stderr byte count. |
| `DATABASE_TOOL_TIMEOUT` | The configured wall clock expired; inspect locks/connectivity, adjust only after review, and retry. |
| `DATABASE_TOOL_VERSION_MISMATCH` | Install one matching PostgreSQL client major for pg_dump, pg_restore, and psql. |
| `DATABASE_RESTORE_VERSION_MISMATCH` | Use the same PostgreSQL client major that created the backup. |
| `DATABASE_IDENTITY_VERIFICATION_REQUIRED` | Use `sslmode=verify-full`; weaker modes are limited to an explicit loopback development connection. |
| `DATABASE_CA_REQUIRED` | Set `HELDAT_PG_SSLROOTCERT` to the reviewed CA bundle path for the remote database. |
| `SUPABASE_PROJECT_IDENTITY_MISMATCH` | Pair a standard direct/pooler database URL with the same project-ref Supabase origin. |
| `PUBLIC_STORAGE_BUCKET_UNSUPPORTED` | Make the bucket private and review exposure, or wait for an explicitly scoped public-bucket format. |
| `BACKUP_SOURCE_CHANGED_DURING_CAPTURE` | Quiesce writes and retry; boundary schema or row-count checks changed. |
| `BACKUP_COMMIT_DURABILITY_FAILED` | Commit was rolled back after a destination flush failure; inspect the backup volume. |
| `BACKUP_COMMIT_INDETERMINATE` | Quarantine the destination; commit durability and rollback both failed. |
| `RESTORE_TARGET_MATCHES_SOURCE` | Target identity overlaps the source; prepare a separate project. |
| `RESTORE_TARGET_NOT_CLASSIFIED` | Set the target class exactly to `non-production`. |
| `RESTORE_CONFIRMATION_MISMATCH` | Repeat dry run and use its exact target fingerprint. |
| `RESTORE_*_VERIFICATION_FAILED` | Quarantine/discard the target, investigate versions/write activity, and repeat from a verified backup. |

Set `HELDAT_BACKUP_DEBUG=1` only in a controlled operator session. Debug stacks
may reveal local paths or metadata and must not be retained in routine CI logs.
