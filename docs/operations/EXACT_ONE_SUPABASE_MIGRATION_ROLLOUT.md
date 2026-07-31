# Exact-one Supabase migration rollout

This runbook applies one reviewed SQL migration at a time. It deliberately does
not use `db push`, `--include-all`, a database URL, or a service-role key. The
operator wrapper checks the linked ledger, source checksum, pinned CLI version,
and exact post-operation ledger delta while suppressing raw CLI output.

## Fixed controls

- Project: the linked Heldat pilot recorded in
  `supabase/migration-rollout-catalog.json`.
- CLI: Supabase CLI `2.109.1`, supplied as an explicit executable path through
  `HELDAT_SUPABASE_CLI`.
- Source catalog: `supabase/migration-rollout-catalog.json`.
- Operator wrapper: `supabase/scripts/apply-approved-migration.mjs`.
- Linked migration 009 is **superseded**. The wrapper never executes its legacy
  one-argument authenticated reader against the linked project.
- Migration 010 is append-only convergence. Its transaction drops the legacy
  signature, creates the actor-bound two-argument reader, grants execution only
  to `service_role`, and aborts unless those privilege postconditions hold.

The catalog hashes are operational control values, not credentials. Access
tokens, database URLs, JWTs, keys, household IDs, SQL results, and raw CLI
stdout/stderr must stay out of release evidence.

## Required gate

Before any execute mode:

1. Create the approved encrypted database and private-Storage backup.
2. Verify the backup outside the active project boundary.
3. Complete and witness the isolated restore drill.
4. Record the database change approval separately from the Edge approval.
5. Confirm the linked ledger from the prior migration's witnessed result.

`check` performs no network request or database mutation. `plan` reads the
linked ledger but does not change it. Only `execute` mutates the ledger/database.

## Operator setup

From the repository root in a fresh PowerShell process:

```powershell
$env:HELDAT_SUPABASE_CLI = 'D:\HeldatTools\supabase-cli-2.109.1\supabase.exe'
```

The repository must already be linked to the cataloged project. The wrapper
copies only validated non-secret link metadata and migrations through the
selected target into a temporary worktree. It deletes that worktree after the
operation, including fail-closed copy errors.

## Apply 007 exactly

```powershell
$version = '202607310007'
$sha = 'b4b85a14896b5b2f6db82ac094ee5cfa8a478166fe10828604c678e75cc6aae3'
node supabase/scripts/apply-approved-migration.mjs --mode=check --target=$version --expected-sha256=$sha
node supabase/scripts/apply-approved-migration.mjs --mode=plan --target=$version --expected-sha256=$sha

try {
  $env:HELDAT_MIGRATION_BACKUP_GATE = 'VERIFIED_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE'
  $env:HELDAT_MIGRATION_APPROVAL = "APPLY_EXACTLY_${version}_${sha}"
  node supabase/scripts/apply-approved-migration.mjs --mode=execute --target=$version --expected-sha256=$sha
  if ($LASTEXITCODE -ne 0) { throw 'Exact migration 007 did not complete.' }
}
finally {
  Remove-Item Env:HELDAT_MIGRATION_APPROVAL -ErrorAction SilentlyContinue
  Remove-Item Env:HELDAT_MIGRATION_BACKUP_GATE -ErrorAction SilentlyContinue
}
```

Witness the 007 maintenance-schedule verification before 008.

## Apply 008 exactly

```powershell
$version = '202607310008'
$sha = 'fcdc103c6daf4b8cca4a845d6b6ef87e4e249e57c7e037f5398e563a6f5ec8ca'
node supabase/scripts/apply-approved-migration.mjs --mode=check --target=$version --expected-sha256=$sha
node supabase/scripts/apply-approved-migration.mjs --mode=plan --target=$version --expected-sha256=$sha

try {
  $env:HELDAT_MIGRATION_BACKUP_GATE = 'VERIFIED_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE'
  $env:HELDAT_MIGRATION_APPROVAL = "APPLY_EXACTLY_${version}_${sha}"
  node supabase/scripts/apply-approved-migration.mjs --mode=execute --target=$version --expected-sha256=$sha
  if ($LASTEXITCODE -ne 0) { throw 'Exact migration 008 did not complete.' }
}
finally {
  Remove-Item Env:HELDAT_MIGRATION_APPROVAL -ErrorAction SilentlyContinue
  Remove-Item Env:HELDAT_MIGRATION_BACKUP_GATE -ErrorAction SilentlyContinue
}
```

Witness storage accounting, readiness, deletion-hold, and concurrency results
before continuing.

## Supersede 009 and apply 010 exactly

Do not run migration 009 SQL on the linked project. Use target 010:

```powershell
$version = '202607310010'
$sha = '3f7d3720477c62cc4806975b25e21d8f2a85e4363133d9129a03943c000f6218'
node supabase/scripts/apply-approved-migration.mjs --mode=check --target=$version --expected-sha256=$sha
node supabase/scripts/apply-approved-migration.mjs --mode=plan --target=$version --expected-sha256=$sha

try {
  $env:HELDAT_MIGRATION_BACKUP_GATE = 'VERIFIED_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE'
  $env:HELDAT_MIGRATION_APPROVAL = "APPLY_EXACTLY_${version}_${sha}"
  node supabase/scripts/apply-approved-migration.mjs --mode=execute --target=$version --expected-sha256=$sha
  if ($LASTEXITCODE -ne 0) { throw 'Exact migration 010 did not complete.' }
}
finally {
  Remove-Item Env:HELDAT_MIGRATION_APPROVAL -ErrorAction SilentlyContinue
  Remove-Item Env:HELDAT_MIGRATION_BACKUP_GATE -ErrorAction SilentlyContinue
}
```

The wrapper supports exactly two pre-states:

1. **Ledger through 008:** record 009 as applied/superseded without executing
   its SQL, verify that exact ledger delta, then apply only 010.
2. **Ledger already records 009:** skip repair and apply only 010 immediately.

If the process stops after the first state's ledger repair, the legacy reader
is capability-absent because 009 SQL never ran. Rerun the same reviewed 010
command. If an older environment already executed 009, keep the new Edge API
undeployed until 010 succeeds.

The execute report must state `exactSqlMigrationsApplied: 1` and
`postLedgerVerified: true`. A successful 010 transaction itself proves the old
signature is absent and the two-argument function is service-only.

## Edge and probe gate

Only after the 010 ledger and privilege postconditions are witnessed:

1. Deploy the reviewed Edge API separately.
2. Run the unauthenticated public-boundary probe.
3. Run the opt-in authenticated household-storage probe with an ephemeral
   synthetic token and household value.
4. Clear all ephemeral process environment values.

The Edge deployment command must contain no migration command.

## Failure and rollback

- Any checksum, CLI version, catalog, link, ledger, timeout, output-bound, or
  post-ledger mismatch stops the wrapper with a bounded error code.
- Raw CLI output is never forwarded by the wrapper.
- Do not edit migration history or mark 010 reverted to simulate rollback.
- Restore the previously verified Edge version first and rerun public probes.
- Keep migration 008 accounting. Any database reversal of 010 requires a new,
  reviewed forward migration and separate approval.
- A disposable local reset may execute 009 immediately followed by 010 for
  convergence testing; that sequence is not the linked-production procedure.

Finally clear the CLI path from the operator process if it is no longer needed:

```powershell
Remove-Item Env:HELDAT_SUPABASE_CLI
```
