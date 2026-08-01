# Heldat live-release baseline — 2026-08-01

## Decision

Heldat remains a controlled-pilot release. The domain, cloud identities,
current-source Android technical artifact, and local backend gates are
established. The approved live-map check, Android marker correction, and
exact-binary API 35 rerun now pass. Production
migrations remain blocked by the failed exact restore-parity gate; signed store
distribution, first-launch performance investigation, and measured 10K
storage/load evidence also remain open.

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

The hardened reader body was validated on the disposable local Supabase stack:
database lint returned no schema errors and all 12 pgTAP files / 405 assertions
passed, including the 22-assertion owner/editor/viewer, denied/missing/deleted,
raw-counter privilege, and exact-projection test. The source was then moved to
append-only migration 010.

Final migration 010 was subsequently applied to an isolated, D:-rooted
PostgreSQL 17.10 fixture and the exact checked-in household-storage pgTAP passed
22/22 assertions with zero failures. Direct postconditions also proved the
legacy signature absent, the actor-bound signature present, service-role
execution allowed, and authenticated execution denied. The evidence transcript
SHA-256 is
`707D5416A7FE6BF01B3CAC513D5E1AD1EEE23ED0AC3E57BE1DE1202F5FE1F14D`;
see `STANDALONE_MIGRATION_010_VALIDATION_2026-08-01.md`.

The standalone distribution lacks `plpgsql_check`, so Supabase CLI lint could
not run against that fixture. A final Docker-backed full-Supabase ledger/lint
rerun remains pending. The linked production project was not changed.

The first local run immediately after recovering Docker from a full disk had
four unstructured gateway `502` responses. After the runtime warmed, five
sequential checks and the full 20-request probe passed. This is workstation
recovery evidence, not production capacity evidence.

## Mobile release state

| Platform | Proven | Still open |
|---|---|---|
| Android | Exact `caccf5b` MapLibre APK built, inspected and exercised on API 35; visible marker, live drag alignment, attribution/tiles, offline fallback and restart persistence passed | First-clean-launch profiling, release-signed arm64/AAB, physical device, Play App Signing lineage, Play internal/closed-track delivery |
| iOS | Clean historical production-simulator build plus current-source static, Hermes, config, packaging and auth-runtime gates | Apple membership/Team ID, public AASA Team ID, signed native rebuild, physical iPhone, App Store Connect and TestFlight |

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

### Current-source iOS static gate

The exact `f6dc78f` source passed 206/206 Jest suites and 1,334/1,334 tests,
TypeScript, all 10 Maestro flows / 5 subflows / 57 selectors, public and
production configuration, clean EAS packaging, iOS auth-runtime checks, and
Recovery Kit Argon2id verification. Its locally exported Hermes bundle is
13,503,682 bytes with SHA-256
`26FC8E4E187634077ADB1CAF00596FA6E983962AA506AFE291BA4E33A6A586A9`.
The report is
`D:\HeldatiOSStatic\evidence\f6dc78f\IOS_STATIC_VALIDATION_REPORT.md`
(SHA-256
`69D0AD81EBEBB49D189ECEDA63AF2DCC5A8C1AA6B8EA758CE45D788CCE569DE1`).
The later Android-marker commits retain the original iOS end-of-drag path and
their exact tree passed 206/206 suites and 1,336/1,336 tests.

iOS intentionally exposes email/password only; Google OAuth remains absent
unless an Apple-equivalent sign-in option is added. A signed-device claim still
requires the Apple Team and app record, public AASA Team ID, native
CocoaPods/privacy merge on a Mac or EAS, physical iPhone/TestFlight execution,
and production-environment journeys.

Commit `ff8b28f` also pins shared TypeScript, JSON and test-contract sources to
LF on Windows. A clean autocrlf clone matched 927/927 blobs and passed 66/66
focused tests plus TypeScript/config gates with zero renormalization diff. The
validation report SHA-256 is
`3e5ffc8d66165c6e6a86d50c1fc6ff5c7b57f194db8123a535322686f8eecf3b`.

### Current-source local Android technical artifact

Commit `f6dc78f` was compiled from a clean, D:-rooted clone with a portable
JDK/Android SDK and D:-rooted Gradle cache. The x86_64 local release build
completed in 12 minutes 56 seconds.

| Evidence | Verified value |
|---|---|
| Artifact | `D:\HeldatAndroidRuntime\evidence\maplibre-f6dc78f\heldat-f6dc78f-maplibre-x86_64-local-release-debugsigned.apk` |
| Size / SHA-256 | 90,237,443 bytes / `77CD52F98A02178ED461866433593139069E15A12CD66F8E0DF374B9CBA1110E` |
| Package / version | `app.heldat.mobile` / `0.1.0` (`1`) |
| Android range / ABI | min 24; target 36; x86_64 |
| Artifact checks | `apksigner`, `zipalign`, and `aapt` passed |
| Installed target | API 35 x86_64 emulator |
| Cold launch | Activity resumed; no fatal or ANR |

The package contains `libmaplibre.so`, Expo Network, the reviewed camera,
foreground-location, Internet and network-state permissions, and zero Google
Maps key/metadata hits. Focused checks passed 9/9 suites and 88/88 tests plus
TypeScript and the production configuration gate.

Fresh-data device validation passed animated onboarding, sample Home, truthful
Vault states, Camera2 permission and capture, normalized UUID JPEG persistence,
Passport completion, Assets and Places navigation, authoritative offline
coordinates, manual coordinate confirmation/provenance, and two force-stop
cold launches with the edited Place still intact. Visual review found no
clipped primary action or contradictory state. The emulator recorded zero
fatal exceptions. Evidence is in
`D:\HeldatAndroidRuntime\evidence\maplibre-f6dc78f\DEVICE-MATRIX-INTERIM.md` and
the accompanying `SHA256SUMS.txt`.

The separately approved live-network check then passed after panning the sample
viewport inland: vector roads, buildings, coastline and the Liberty style
rendered; visible attribution remained present; a full drag changed
`25.359181, 51.531421` to `25.358873, 51.532147`; provenance became `Pin
adjusted by you`; and confirmation reset. Network loss produced the truthful
coordinate fallback within seven seconds, and an offline save survived a cold
restart. The emulator recorded zero fatal exceptions. The final report is
`D:\HeldatAndroidRuntime\evidence\maplibre-f6dc78f\DEVICE-MATRIX-FINAL.md`
(SHA-256
`05B3E4DC1C54AFB5042B8662A1DE33FB9F1A977484C4707B137B399E029CC631`).

That run also found one release blocker: the 44 px draggable
`ViewAnnotation` hit target worked, but its graphic was invisible on Android.
Commits `73f5d74` and `caccf5b` retain the proven native drag path and render a
non-interactive Carbon/white/Volt GeoJSON circle marker inside MapLibre's GL
scene. Android alone tracks live drag visuals; iOS retains its end-of-drag path.
The exact imported blobs match the independently reviewed tree. Its full gate
passed 206/206 suites and 1,336/1,336 tests plus TypeScript, Maestro, production
configuration, packaging and Recovery Kit crypto; the focused test also passed
10/10 after import.

The exact `caccf5b` rebuild then closed the marker defect on API 35. Its APK is
90,238,891 bytes with SHA-256
`F2DF3EAC666C83B206E39E24D9F7D934D85ED327C239659B8066989772A9AB2A`.
The GL marker was visible initially and objectively followed a four-second
native drag: its image centroid moved from `(540.47, 1374.44)` to
`(643.67, 1423)` near the expected touch `(650, 1428)`, then recentered after
commit. Final coordinates were `25.358797, 51.532311`; provenance and explicit
reconfirmation reset passed. Live inland cartography and attribution passed,
the ready-to-offline transition completed in seven seconds, and offline
confirmation/save survived a cold restart. Focused tests passed 9/9 suites and
90/90 tests, with zero fatal exceptions or ANRs.

The exact report is
`D:\HeldatAndroidRuntime\evidence\maplibre-caccf5b\DEVICE-MATRIX-FINAL.md`
(SHA-256
`E421F4951FFB123CABFB755871939419D81FDC1733855EE5D4D410743C897A0E`).
The first clean launch remained on `Starting Heldat` for about 32 seconds on
the emulator without an ANR or fatal exception. That requires profiling before
store promotion even though subsequent map/runtime gates passed.

Both APKs remain local technical artifacts rather than release candidates:
they are debug-signed and x86_64-only. The emulator is left attached with the
package force-stopped and airplane mode enabled.

## Hosted Auth configuration

A read-only Management API snapshot verified `https://heldat.app` as the site
URL and recorded ten allowed redirect entries. Email/password and Google auth
are enabled, email autoconfirm and anonymous auth are disabled, and refresh
token rotation is enabled. Custom SMTP is not configured, CAPTCHA is disabled,
and the production allow-list still contains two localhost development routes.
See `HOSTED_AUTH_CONFIG_SNAPSHOT_2026-08-01.md`; no hosted setting was changed.

## Android map provider

The release source no longer depends on the unattributable Google Maps key.
It pins `@maplibre/maplibre-react-native` `11.3.6`, uses the OpenFreeMap Liberty
style, preserves `expo-location` as the separate foreground GPS source, and
provides a native authoritative-coordinate fallback when tiles are unavailable.
The production configuration rejects legacy Google Maps metadata.

OpenFreeMap requires no account or key and permits commercial use, but provides
no SLA. It is therefore the zero-payment controlled-pilot provider rather than
proof of 10K reliability: <https://openfreemap.org/>. MapLibre's Expo setup also
requires the custom native build that is now present:
<https://maplibre.org/maplibre-react-native/docs/setup/expo/>.

## Backup evidence

The explicitly approved production backup completed without applying a
migration or changing hosted data. Its encrypted artifact authenticates and
decrypts offline to an 829,345-byte database archive with SHA-256
`f97d908b54bb507a6fe3df01de4794edf782f06a475ac6f7dcb31b841fe857f0`.
An isolated restore matched all 67 tracked table counts, both private bucket
descriptors, and the exactly empty Storage-object set.

The strict rollback gate nevertheless **failed closed**. The unchanged schema
comparator found the same 941 blocks with zero missing or extra blocks, but 51
extension-ACL blocks differed: source 607,641 canonical bytes / `006ced2d...`
versus target 602,004 bytes / `6bf58556...`. Production extension
owners/grantors are `postgres`; the matching disposable image recreated those
members under `supabase_admin`. Source catalog evidence proves OID 10 is
`supabase_admin` and `postgres` is a non-superuser OID 16388, so changing the
disposable bootstrap identity would not be source-equivalent.

This proves encrypted artifact, row and empty-Storage recoverability, not
production-fidelity permissions or a verified rollback point. Migration `007`
therefore remains blocked. All six disposable restore containers are stopped,
ports 55435 through 55440 are closed, and `production_changed=false`.
The final report is
`D:\HeldatBackupRuns\backup-restore-20260801T142731Z\FINAL_BACKUP_RESTORE_REPORT.md`
(SHA-256
`f2ffac4bfa3b727ce239ea0c78676093bbf0b845a144784fbb6ff2d8ad03a658`);
its 92-file checksum manifest has SHA-256
`c72cb60fbf560a4548bb0a0a84223fb1e8f53a051141abd1e8a6f55f1992bd80`.

## Local workspace integrity

The system drive reached zero free bytes during evidence generation. A
dependency-tree relocation followed npm workspace junctions and temporarily
removed linked workspace contents from the source tree. Staging stopped
immediately; the preserved bytes were restored without checkout, reset or
clean. All 981 tracked and 123 non-ignored untracked files matched the preserved
copy by SHA-256 (1,104/1,104; zero missing or mismatched), ten workspace links
were recreated, and shared build, TypeScript and 66/66 focused tests passed.
The recovery record is `LOCAL_WORKSPACE_RECOVERY_2026-08-01.md`. No hosted
system changed, and unrelated dirty/untracked user work remains preserved.

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

1. Revise the authenticated backup format to capture and reproduce global role
   attributes/memberships, database owner/normalized ACL, and extension/member
   ownership, ACL and initial-privilege semantics. Correct JIT-login parsing
   and downstream restore-error classification.
2. Produce a new encrypted production backup and pass the unchanged exact
   schema, row, bucket and object restore comparators. Do not apply a migration
   until this gate passes.
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
9. Profile and bound the 32-second first-clean-launch observation, then build
   the release-signed arm64/AAB from the reviewed source and verify it on a
   physical Android device.
10. Attach an Apple Team to the verified iOS source and produce the
   physical/TestFlight build; repeat the Hermes and signed-artifact gates.
11. Load a disposable staging project with a representative 10K synthetic
   metadata fixture and measure authenticated p50/p95/p99, errors, database
   growth, WAL, connections, locks, egress and retained object bytes.
