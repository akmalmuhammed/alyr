# ALYR Supabase pilot boundary

This directory implements the free-tier pilot boundary described by the
mobile plan. Deployment remains an explicit operator action. The current pilot
deployment is verified below; it is not represented as production-grade
backup, end-to-end encryption, or verified legal evidence.

## Included

- Postgres entities for the focused household/place/asset/evidence product.
- Deny-by-default, household-scoped Row Level Security.
- Atomic, idempotent sync commands with visible version/location conflicts.
- Immutable evidence-version and blob metadata.
- Private Storage policies with a 10 MiB file limit.
- An authenticated, RLS-scoped Evidence download route that rechecks cloud
  byte size and SHA-256 before returning an immutable version.
- A 40 MiB per-household application quota in the upload-intent API, with
  household-serialized reservation/retry accounting and pending-cleanup bytes
  retained until Storage deletion is acknowledged.
- Household-bound Asset Evidence and Place Document upload parents, strict
  expired-intent rejection, and a service-only bounded orphan cleanup ledger.
- A serialized 20-household closed-pilot admission cap.
- One-time manual household invitation codes.
- Durable household, membership and role selection stored as one
  provider-controlled account-metadata tuple after authorization.
- Owner-only invitation creation with explicit editor/viewer roles and a
  caller-selected expiry capped at 30 days.
- Permission-scoped JSON/PDF exports with atomic renderer claims, immutable
  artifact checksums, a 40 MiB retained household allowance, and daily
  pointer-preserving retention cleanup.
- Owner-only Liability masters, dated balance history and expiring
  no-Liability reviews, with versioned soft tombstones and selective-export
  isolation.
- A privacy-minimal product-event allow-list.
- An OpenAPI 3.1 contract.
- Pre-account pilot and recipient-invitation routes plus manually
  authenticated Edge routes.

## Verified live pilot state

Verified on 2026-07-28:

- Supabase project `ifiyragzeizaxdqzxvpk` reports `ACTIVE_HEALTHY`.
- The live database currently has the first eleven reviewed migrations:
  `202607250001`, `202607270001`, `202607270002`, `202607270003`,
  `202607270004`, `202607270005`, `202607280001`, `202607280002`,
  `202607280003`, `202607280004`, and `202607280005`.
- Repository migration `202607280006` adds the owner-only Liability and
  recorded-net-position cloud boundary. It passed local reset, lint and
  pgTAP verification and remains pending the authenticated live deployment
  gate below.
- Repository migration `202607310001` closes expired-intent quota reactivation,
  rejects completion after expiry, binds reservations to active Evidence
  parents, and adds the bounded Evidence-object cleanup protocol. It passed
  local schema lint and pgTAP verification and is not included in the live
  state listed above.
- The `api` Edge Function reports `ACTIVE`, version **3**. The reviewed local
  source contains the recipient-preflight and subject-aware export changes and
  still needs the authenticated function deployment described below.
- The `alyr-export-retention-daily` cron is active on `17 2 * * *`.
- Both Vault entries required by export maintenance are configured. Their
  values are intentionally excluded from source, logs, and this document.
- Live boundary probes returned:
  - missing maintenance token: `403`;
  - valid maintenance request: `200`, `status=complete`,
    `batchLimit=100`;
  - invalid pilot invitation: `403 AUTHORIZATION_DENIED`;
  - sync request without a bearer: `401`.
- The temporary deployment access token was revoked after verification, and
  the local Supabase CLI has no stored access token.

## Honest pilot limitations

- Supabase Free can pause and does not include managed backups.
- TOTP enrollment and verification remain disabled until the native app ships
  an enrollment, challenge, recovery-code, and account-recovery flow with
  real-device tests. The UI must not promise MFA before that release gate.
- Upload completion downloads the stored object in the Edge Function and
  confirms byte size and SHA-256 before the server marks it stored.
- Migration `202607310001` provides the service-only enqueue, claim,
  acknowledgement, and delayed-retry primitives for expired/unattached
  Evidence objects. A trusted maintenance worker must call those primitives
  and delete the corresponding private Storage object; the database never
  treats queued bytes as reclaimed before that acknowledgement.
- Clean devices request Evidence bytes through the provider-neutral API; the
  native client verifies them again before encrypting them into its local vault.
- Export retention is bounded to 100 object pointers per daily maintenance
  invocation. Failed Storage deletions preserve their pointers for the next
  run rather than reporting the bytes as removed.
- Email delivery is intentionally outside this slice. Invitation codes are
  returned once and shared manually during the closed pilot. They must not be
  written to analytics or long-lived application logs.
- The clients must retain their durable local outbox and encrypted Recovery
  Kits.

## Local verification

The static contract checks require only Node:

```sh
npm run check:supabase:static
```

Latest verified result: **57/57** static checks.

The local database suite proves cross-household RLS, role-negative paths,
idempotent nested commands, analytics rejection, upload reservation binding,
and the closed-pilot boundary:

```sh
supabase db reset --local --no-seed
supabase db lint --local --level warning
supabase test db --local
```

Latest verified result: **242/242** pgTAP checks. The real local export API
journey also passed **47** checks, including parallel same-key creation,
authorization denial, full Liability history, selective-export isolation,
JSON/PDF rendering, download integrity, and redaction:

```sh
npm run test:supabase:export-local
```

## Evidence-object cleanup worker contract

Only a trusted service-role maintenance worker may operate this queue:

1. Call `enqueue_blob_object_cleanup(p_limit, p_orphan_grace)` with a limit
   from 1 through 100. Expired upload intents are eligible immediately;
   verified-but-unattached objects use a one-hour to thirty-day grace period
   and default to 24 hours. An expired reservation remains quota-counted until
   its Storage deletion is acknowledged; changing the blob ID does not release
   or bypass that capacity.
2. Call `claim_blob_object_cleanup(p_limit, p_lease)`. `SKIP LOCKED`, a claim
   token, and a one-minute to one-hour lease prevent duplicate concurrent work.
3. Delete `object_key` from the private `evidence` bucket. A provider-confirmed
   missing object is an idempotent successful deletion.
4. After deletion, call
   `complete_blob_object_cleanup(blob_object_id, claim_token)`. This removes
   the database BlobObject and its cleanup pointer atomically, releasing quota.
5. On a retryable provider failure, call
   `release_blob_object_cleanup(blob_object_id, claim_token, error_code,
   retry_delay)`. The pointer remains quota-counted and cannot be redelivered
   before the bounded retry delay.

Never call `complete_blob_object_cleanup` before Storage confirms deletion.
The completion RPC also refuses to remove a BlobObject referenced by an
immutable EvidenceVersion.

## Closed-pilot admission

The signed mobile client verifies an email-bound, one-use pilot access code
before it calls Supabase Auth. Create an approval from an operator-only SQL
session and copy the returned code once:

```sql
with invitation as (
  select
    lower(trim('owner@example.com')) as email,
    upper(encode(extensions.gen_random_bytes(12), 'hex')) as access_code
),
inserted as (
  insert into public.pilot_signup_approvals (
    email_hash,
    access_code_hash,
    max_households,
    expires_at,
    note
  )
  select
    encode(extensions.digest(email, 'sha256'), 'hex'),
    encode(extensions.digest(access_code, 'sha256'), 'hex'),
    1,
    now() + interval '14 days',
    'Closed pilot household 01'
  from invitation
  returning id
)
select invitation.email, invitation.access_code, inserted.id
from invitation cross join inserted;
```

Share the code directly with that email owner. The database stores only hashes.
`POST /pilot/preflight` returns a ten-minute, one-use enrollment grant; the
auth-user insert consumes it atomically, creates `pilot_enrollments`, and
removes the grant from account metadata. Invalid, expired, used and mismatched
approvals return the same public denial. Preview mode does not call this route.

Clients cannot read or write either admission table. The project-wide active
household cap is 20, and each approval defaults to one household. Existing
operator-created accounts may still be enrolled directly by user UUID when a
mobile signup is not involved:

```sql
insert into public.pilot_enrollments (user_id, max_households, note)
values ('USER_UUID', 1, 'Operator-created pilot account');
```

`POST /households` creates the owner membership and records the selected
household in provider-controlled app metadata in one database transaction.
`POST /onboarding/complete` is owner-only and marks that same selection ready
for restored sessions. The native client refreshes the provider session before
opening record routes, so a process restart does not substitute a temporary
client UUID for an authorized household.

`POST /invites/accept` updates the same tuple and onboarding state in the
membership transaction. If the successful response is lost, the same account
may retry the same code; another account still receives a used/invalid result.
The database rejects owner-role invitations even if a client bypasses the API
validation.

## Edge secrets

Production migrations and Edge deployment are deliberately separate. Complete
the encrypted backup/restore gate, then apply and verify only the migration that
has its recorded approval: exact `202607310007`, verify, then exact
`202607310008`, verify. The published `202607310009` one-argument reader is
superseded and must not execute on the linked project. The reviewed wrapper
records 009 as superseded without running its SQL and applies only append-only
`202607310010`; an interrupted repair is capability-absent rather than publicly
callable. Deploy the API only after the 010 ledger, privilege, and tenant tests
have been witnessed. The Edge deploy command never pushes pending migrations.

Use the checksum-pinned package commands and the complete fail-closed procedure
in [`docs/operations/EXACT_ONE_SUPABASE_MIGRATION_ROLLOUT.md`](../docs/operations/EXACT_ONE_SUPABASE_MIGRATION_ROLLOUT.md).
There is deliberately no `apply:supabase:migration-009` command.

For the current linked pilot, authenticate the pinned Supabase CLI once, then
run the deterministic deployment gate from the repository root:

```powershell
npx --yes supabase@2.109.1 login
npm run deploy:supabase:api
```

The npm command runs all static Supabase checks, deploys only `api` to
`ifiyragzeizaxdqzxvpk` with `--no-verify-jwt --use-api`, then waits for
propagation and verifies these public boundaries without printing any key,
token, response message, invitation or household data. It does not run `db
push`, `migration up`, `migration repair`, or any equivalent schema mutation:

- invalid recipient invitation: `403 AUTHORIZATION_DENIED`;
- invalid pilot invitation: `403 AUTHORIZATION_DENIED`;
- sync without a bearer: `401 AUTHENTICATION_REQUIRED`;
- export create, status and download without a bearer:
  `401 AUTHENTICATION_REQUIRED`.

The probe accepts the existing ignored
`asset-continuity-native/.env.local`, or the corresponding
`EXPO_PUBLIC_SUPABASE_URL` and public publishable-key environment variables.
It rejects secret and service-role keys. Run the probe by itself with:

```powershell
npm run probe:supabase:live
```

After migration 010 and the Edge source are both verified, run the opt-in
authenticated household-storage probe with a dedicated synthetic household.
Its user access token and household UUID are accepted only through the current
process environment. The token must be project-bound, authenticated, currently
valid, and issued with a total lifetime no longer than two hours. Never place
either value in `.env.local`, a command argument, shell history, a tracked file,
CI output, or release evidence. The interactive wrapper below collects the
token with PowerShell's secure prompt, runs configuration validation followed
by the one-request probe, and clears all three temporary process variables in a
`finally` block. Public URL/key configuration may still come from the ignored
native `.env.local` file.

```powershell
& .\supabase\scripts\invoke-household-storage-live-probe.ps1
```

Use `-CheckConfigOnly` when the reviewed gate requires validation with zero
network requests. The direct npm commands are reserved for a protected runner
or vault integration that injects and clears those environment values without
placing their contents in a command line or log.

The probe performs one GET, validates exact bounded content length, `no-store`,
request correlation, strict response fields, safe byte integers, and a fresh
server timestamp. Its report contains status, latency, boolean checks, and a
bounded error code only—never the token, public key, household UUID, byte
values, response body, or account identity.

Rollback starts with the Edge boundary: restore the previously verified Edge
version and rerun the public probe before changing database objects. Migration
008 accounting and the hardened 010 reader remain in place. Any database
reversal uses a newly reviewed forward migration with separate approval; never
edit history or mark 010 reverted as a rollback shortcut.

The gateway setting is required only because pilot preflight runs before an
account exists. Every other route still verifies the bearer with
`auth.getUser()` before doing any work. The API uses the caller token and anon
key for ordinary RLS-scoped work. The preflight grant issuer, account deletion,
and final byte-verified `mark_blob_stored` transition use the Edge runtime's
server-side service-role key. That key must never be placed in Expo, Vite, EAS
public variables, logs, responses, or client bundles.

Export retention additionally requires:

- Edge secret `ALYR_EXPORT_MAINTENANCE_TOKEN`;
- Vault entry `alyr_export_maintenance_url`;
- Vault entry `alyr_export_maintenance_token`.

The two token locations contain the same operator-generated value. The cron
reads only the Vault entries, while the Edge boundary compares the request
token in constant time. Secret values stay outside source control and client
environments.
