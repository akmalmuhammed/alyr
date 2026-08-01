# Standalone migration 010 validation — 2026-08-01

## Result

The append-only household-storage reader hardening migration was validated on
an isolated PostgreSQL 17.10 instance rooted entirely on `D:`. This is
supplemental PostgreSQL evidence; it is not a replacement for a full local
Supabase reset because the standalone distribution does not contain the full
Supabase extension set.

| Item | Evidence |
|---|---|
| Migration | `202607310010_household_storage_usage_reader_hardening.sql` |
| Reviewed migration SHA-256 | `3f7d3720b0b9f70ddd15f715bd071190c239d46ebcaf945a6202faeb22fc0b29` |
| PostgreSQL | 17.10, bound only to `127.0.0.1:55432` |
| Disposable root | `D:\HeldatValidation\migration010_20260801T120000Z` |
| Migration application | Completed transactionally: `BEGIN` through `COMMIT` |
| Direct signature/grant checks | `t | t | t | t` |
| Exact repository pgTAP | `1..22`; 22 passed; 0 failed |
| Transcript | `D:\HeldatValidation\migration010_20260801T120000Z\household-storage-pgtap.txt` |
| Transcript SHA-256 | `707D5416A7FE6BF01B3CAC513D5E1AD1EEE23ED0AC3E57BE1DE1202F5FE1F14D` |
| Hosted systems changed | None |

The four direct checks prove that:

1. the legacy one-argument reader is absent;
2. the actor-bound two-argument reader exists;
3. `service_role` can execute it; and
4. `authenticated` cannot execute it directly.

The exact checked-in test
`supabase/tests/database/household_storage_usage.test.sql` then passed all 22
assertions, including owner/editor/viewer access, zero-usage behavior, uniform
denial for cross-household/revoked/deleted/missing cases, the narrow result
shape, and raw-counter privilege boundaries.

## Lint limitation

The pinned Supabase CLI was also pointed at the isolated database with
`supabase db lint --db-url`. It returned
`LegacyDbLintEnableCheckError` because this standalone Windows PostgreSQL
distribution does not include the lint extension (`plpgsql_check`). This is a
tooling-capability limitation, not a schema finding.

Full Supabase reset/lint parity still requires the Docker-backed Supabase
extension image. That rerun remains separate from this successful PostgreSQL
and pgTAP proof.

## Isolation and cleanup

- Database files, logs, temporary files, pgTAP build files, and evidence stayed
  under `D:`.
- The server listened only on loopback.
- The temporary server was stopped cleanly after validation.
- No repository cache, Docker volume, linked Supabase project, migration ledger,
  production database, or Edge Function was changed.
