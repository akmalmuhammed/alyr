# Heldat live-release baseline — 2026-08-01

## Decision

Heldat remains a controlled-pilot release. The domain, cloud identities,
Android store artifact, and local backend gates are established; production
migrations, signed iPhone distribution, store delivery, map-key provenance,
and measured 10K storage/load evidence remain open.

This record contains no credential values, tenant payloads, or identity
documents.

## Authenticated cloud context

| Surface | Read-only evidence | Result |
|---|---|---|
| Google Cloud | Active named configuration `heldat-operator` | `akmalmuhammed93@gmail.com`; project `heldat-mobile-prod-93` is active |
| Expo/EAS | `eas whoami`, project and build history | `akmalmuhammed93`; `@alyr-app/alyr-asset-continuity`; project `85cab1f2-111f-4e20-abd5-8dff0df2fabb` |
| Supabase | Linked CLI project and project list | `ifiyragzeizaxdqzxvpk`; `ALYR Pilot`; `ap-south-1`; healthy |
| Cloudflare | Wrangler OAuth, owner confirmation, Worker routes and DNS | `akmalmuhammed93@gmail.com`; `heldat-site`; Cloudflare nameservers active |

Inactive cached Google identities were not selected. Future Google mutations
must keep using the named configuration and an explicit
`--project=heldat-mobile-prod-93` argument.

## Public domain

Direct HTTPS checks returned `200` with certificate verification success for:

- `https://heldat.app/`
- `https://heldat.app/privacy/`
- `https://heldat.app/terms/`
- `https://heldat.app/delete-account/`
- `https://heldat.app/support/`

A fresh 2026-08-01 transport check also proved the apex `200`, the `www`
hostname `308` redirect to `https://heldat.app/`, the Android association route
`/.well-known/assetlinks.json` `200`, and the account-deletion route `200`.
Responses were served through Cloudflare with HSTS and the checked security
header policy. This verifies domain routing and TLS, not approval of the
currently deployed legal/deletion wording.

The A records resolved through Cloudflare and the authoritative nameservers
were `bristol.ns.cloudflare.com` and `rex.ns.cloudflare.com`.

## Production backend state

| Gate | Evidence | Result |
|---|---|---|
| Migration ledger | `supabase migration list --linked` | Production matches through `202607310006`; exact `202607310007`/`008`, superseded-ledger-only `009`, and exact `010` remain pending |
| Edge deployment | `supabase functions list` | `api` active at deployed version 9; the current worktree changes are newer |
| Low-rate public read | 5 requests, concurrency 1, 1 req/s | 5/5 HTTP 200; p95 556 ms |
| Release-envelope public read | Two runs of 20 requests, concurrency 3, 5 req/s | Each produced 19 HTTP 200 and one structured `503 STORAGE_UNAVAILABLE`; p95 1.8 s then 1.124 s |
| Local corrected route | Warm local Edge run at the same 20/3/5 envelope | 20/20 HTTP 200; p95 74 ms; no server, payload, request-ID or cache-policy failures; zero `signup.mode` rate-limit rows created |

The corrected route removes the persistent database rate-limit write from the
small signed `/signup/mode` read, coalesces concurrent control-plane reads, and
caches them for 15 seconds inside an Edge isolate. Signup preflight always
re-reads the control plane and invalidates a stale read cache on a version or
mode change, so closing enrollment is not delayed by the read cache.

Current Edge and client source also maps both household and global retained-
storage saturation to `QUOTA_EXCEEDED`, HTTP `409`, `retryable: false`. Export
cleanup preserves the same classification, and native upload/export parsers
reject a malformed retryable quota envelope. This source passed 134/134 static
backend checks and 17/17 focused native adapter checks; it is not live until
the approved migration and Edge deployment sequence completes.

Append-only migration `010` and the current Edge source add the narrow authenticated
`GET /household-storage` projection. It returns only the selected household ID,
server-confirmed used bytes and allowance, and measurement time; active owners,
editors, and viewers are admitted, while missing, deleted, revoked, and
cross-household requests share one `403`. The routed native Vault now fetches
that value only for a verified personal cloud household, keeps it in memory,
makes zero requests in sample/local-only mode, and shows no configured-byte
placeholder when the server value is absent. Full Supabase static checks pass
171/171 and the complete native gate passes 205 suites / 1,302 tests plus
TypeScript, Maestro, production config, clean EAS packaging, and Recovery Kit
crypto. Legacy migration `009` is never executed on the linked project: after
exact 007/008 verification the reviewed wrapper records 009 as superseded and
applies only 010. These changes are not live until that fail-closed sequence and
the new Edge source complete their separate approvals.

The hardened reader body was validated only on the disposable local stack:
database lint returned no schema errors and all 12 pgTAP files / 405 assertions
passed, including the 22-assertion owner/editor/viewer, denied/missing/deleted,
raw-counter privilege, and exact-projection test. The source was then moved to
append-only migration 010. Applying final 010 to the local ledger and repeating
lint/pgTAP remains pending because Docker Desktop stopped under host disk
pressure. The linked production project was not changed.

The first local run immediately after recovering Docker from a full disk had
four unstructured gateway `502` responses. After the runtime warmed, five
sequential checks and the full 20-request probe passed. This is workstation
recovery evidence, not production capacity evidence.

## Mobile release state

| Platform | Proven | Still open |
|---|---|---|
| Android | EAS production AAB build 6 finished; artifact hash and upload certificate recorded; API 35 emulator journey passed | Fresh build after native camera normalization, correct-project Maps key, physical device, Play App Signing lineage, Play internal/closed-track delivery |
| iOS | Clean production-simulator build from commit `d1a2566`; native camera module, privacy/config, extracted Hermes auth scan, and archive integrity pass | Apple membership/Team ID, distribution signing, physical iPhone, App Store Connect and TestFlight |

The prior iOS simulator bundle included Android Google-OAuth runtime markers
even though the iOS UI hid the provider. The source now resolves provider
options by platform: Android includes the browser provider, while iOS and the
fallback omit it. A Hermes bundle scanner is part of the production config
gate. The old simulator artifact is superseded and must not be submitted.

### Superseded pre-camera iOS simulator artifact

The replacement artifact was built by EAS from a clean detached worktree and
then downloaded, extracted, and inspected locally:

| Evidence | Verified value |
|---|---|
| EAS build ID | `e02635c0-5d28-400b-b163-b2ec66e31c85` |
| Exact Git commit | `468ce414cfbc14a52507c34bdf53f441de082767` |
| EAS profile / channel | `production-simulator` / `production` |
| Build status | `FINISHED` |
| App version / build | `0.1.0` / `1` |
| EAS fingerprint | `98d516162ec3a0cb74cdbfabf41e9bc29c29bf6e` |
| Downloaded archive | 43,303,913 bytes; SHA-256 `CD0C751CCA7B082FB7947CCB9808E7DF796CBCD0040EAE042DD4616357531AC4` |
| Extracted app | `Heldat`; bundle ID `app.heldat.mobile`; minimum iOS `16.4`; 142 files |
| Hermes bundle | 13,411,994 bytes; SHA-256 `806A6719482D89B643101F695EA9E4ED16B46DA0142810FF5F4BD35FC5814534` |
| Auth-runtime gate | Passed; all three Android-only Google OAuth runtime markers absent |

This is simulator evidence, not an App Store-signed or physical-device build.
The archive remains unsuitable for TestFlight submission because the Apple
distribution identity and Team have not yet been attached.

Commit `d1b60f8` subsequently added Expo ImageManipulator as a native dependency
and constrained newly captured camera originals to an adaptive, metadata-free
JPEG of at most 2 MiB. Focused capture tests passed 9/9, related capture-screen
tests passed 25/25, TypeScript passed, and the Expo production configuration
and EAS packaging gates passed. Library images and imported documents preserve
their selected bytes and retain the separate 10 MiB import ceiling.

Because this changed the native dependency graph, previously recorded iOS and
Android binaries became historical evidence rather than current release
candidates. The iOS simulator has now been rebuilt and verified; Android still
requires a clean rebuild after the Maps provenance gate is resolved.

### Current iOS simulator artifact

The current source was built from a clean same-drive detached worktree after
its local iOS fingerprint completed successfully. The archive was downloaded
to the release-artifact drive, path-checked, extracted, and inspected:

| Evidence | Verified value |
|---|---|
| EAS build ID | `c5aa1a96-7234-43f4-8713-c2186089b41d` |
| Exact Git commit | `d1a25662998d0dc675d369fa7c30c9c278f9e28b` |
| EAS profile / channel | `production-simulator` / `production` |
| Build status / target | `FINISHED` / iOS Simulator |
| App version / build / SDK | `0.1.0` / `1` / `57.0.0` |
| EAS fingerprint | `a54261d75da8910fc2ce32ddf59406678192f683` |
| Downloaded archive | 44,400,666 bytes; SHA-256 `8D542EAE1BD38810D7BB61FAFFD1849E7A7F9AB87CFDA244B9E917E4362F6518` |
| Archive structure | 243 entries; one `Heldat.app` root; zero unsafe, symlink, or hard-link entries |
| Extracted app | `Heldat`; bundle ID `app.heldat.mobile`; minimum iOS `16.4`; 151 files |
| Hermes bundle | 13,424,081 bytes; SHA-256 `3B2FB4898656001D2DCA2AFC48E54D6D299872F2C3373AD33517D61029166829` |
| Auth-runtime gate | Passed; all three Android-only Google OAuth runtime markers absent |
| Native camera module | `ExpoImageManipulator` appears 14 times in the compiled executable |
| Release updates | Disabled; check-on-launch `NEVER`; no update URL |
| Privacy manifest | Tracking false; zero tracking domains; 11 collected-data types; four required-reason API groups |

The compiled executable is 48,773,824 bytes with SHA-256
`068DB498D5A929FE4C5F06A51D31D75D304B2338CC2EABF840B69956A7024900`.
The privacy manifest is 5,518 bytes with SHA-256
`38EB64B2FA739A83F72CDAC50374F1448112B43A2FDFB065183DE07F56A4165B`.
Camera, selected-photo, foreground-location and Face ID purpose strings are
present; microphone and always-location purpose keys are absent. Arbitrary and
local-network loads are disabled in this production artifact.

This remains simulator evidence. It is not signed for a physical iPhone and
cannot enter TestFlight until the Apple Team, distribution identity, App Store
Connect record, and signed-device checks are complete. EAS warned that 80% of
the included build credits were already used before this build, so the
remaining free-build capacity must be reserved for signed release gates.

The native source has advanced beyond commit `d1a2566` with the routed
authoritative Vault usage flow. Because production EAS Update is disabled, the
recorded simulator artifact remains valid historical evidence but is no longer
a source-identical release candidate. Reserve the next iOS build for the final
Apple-signed source after the remaining native gates settle.

## Android Maps mismatch

The intended Google project currently has billing disabled, the Maps SDK for
Android disabled, and zero API keys. EAS preview and production contain the
same syntactically valid key (recorded only by a SHA-256 fingerprint), so its
origin, application restriction, certificate restriction, and API restriction
are not attributable to the intended project.

Creating the canonical key requires a separately approved billing-enabled
Google project. The resulting key must be restricted to:

1. Android application `app.heldat.mobile`.
2. Every exact EAS/Play signing SHA-1 that must load maps.
3. Maps SDK for Android only.

Google documents billing, SDK enablement, and an API key as setup requirements:
<https://developers.google.com/maps/documentation/android-sdk/start>.

## Backup evidence

`D:\HeldatBackups` contains a DPAPI-protected pre-migration ciphertext created
for the linked project. Its stored SHA-256 matches the ciphertext and its
metadata names the correct project. The plaintext staging files are empty.
There is no authenticated backup-tool completion record or isolated restore
evidence, so this artifact does not satisfy the public-launch backup gate.

## 10K free-tier boundary

At 10,000 users, the current Supabase free allowances provide approximately:

- 50 KB database capacity per user.
- 100 KB object storage per user.
- 500 KB monthly egress per user.
- 50 Edge invocations per user per month.

The application-level 800 MiB storage ceiling is about 83.9 KB per user. With
the current 2 MiB primary-image planning assumption it supports only 400
primary images, not 10,000 media-active users.

Migration `008` contains the authoritative constant-time retained-byte counter;
migration `010`, the Edge contract, and the native Vault now complete the
tenant-safe read path in source. Until that sequence is deployed, production
continues to show the truthful `Usage unknown` state rather than local bytes or
a configured allowance. The public usage-inspection gate therefore remains
open operationally even though its application code is complete.

The existing `BlobStore` adapter supports an R2/S3 transition. Cloudflare R2's
current free tier includes 10 GB-month, one million Class A operations, and ten
million Class B operations, but that is still only about 1 MB per user at
10,000 users and requires enforced capture budgets plus capacity alerts:
<https://developers.cloudflare.com/r2/pricing/>.

A deterministic disposable-local capacity harness now models 10,000 users,
25 Assets each, and 1,030,000 metadata rows without accepting hosted URLs,
credentials, linked projects, or production targets. Its verified two-user
smoke reconciled 22/22 rows with zero errors, p95 499.25 ms, zero waiting load
locks, and zero retained bytes after cleanup. The full local run correctly
stopped before mutation because 2,118,950,912 bytes were required while only
606,834,688 were available. The committed JSON report and harness limitations
are documented in `STAGING_10K_METADATA_CAPACITY_HARNESS.md`; hosted API,
Auth/RLS, object-storage, egress, and full 10K measurements remain open.

## Next production sequence

1. Obtain and record approval for the real encrypted production backup.
2. Execute backup plus isolated restore verification.
3. Apply migration `007`, verify its bounded maintenance behavior, then obtain
   the separate approval for migration `008`.
4. Apply exact migration `008` and verify retained-byte accounting.
5. Approve target `010`. The reviewed wrapper must record legacy `009` as
   superseded without executing its SQL, apply only `010`, and prove the exact
   ledger delta. If 009 is already recorded, apply 010 immediately.
6. Verify the old one-argument RPC is absent, the two-argument reader is
   service-role-only, and owner/editor/viewer plus uniform-denial tenant cases
   pass. Never pause after executing legacy 009 on the linked project.
7. Deploy the current Edge API without applying migrations, repeat the 20/3/5
   public probe, then run the opt-in authenticated storage probe with ephemeral
   token/household environment values plus authenticated sync/upload/export
   probes.
8. If rollback is needed, restore the prior Edge version first and rerun the
   public probe. Keep migration `008` and `010`; database reversal requires a
   newly reviewed forward migration.
9. Resolve the Maps billing/key provenance gate and rebuild Android from the
   clean release commit that includes camera normalization.
10. Attach an Apple Team to the verified iOS source and produce the
   physical/TestFlight build; repeat the Hermes and signed-artifact gates.
11. Load a disposable staging project with a representative 10K synthetic
   metadata fixture and measure authenticated p50/p95/p99, errors, database
   growth, WAL, connections, locks, egress and retained object bytes.
