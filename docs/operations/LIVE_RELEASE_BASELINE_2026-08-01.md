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
| Cloudflare | Wrangler OAuth, Worker history and DNS | Matching Google identity; `heldat-site`; Cloudflare nameservers active |

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

The A records resolved through Cloudflare and the authoritative nameservers
were `bristol.ns.cloudflare.com` and `rex.ns.cloudflare.com`.

## Production backend state

| Gate | Evidence | Result |
|---|---|---|
| Migration ledger | `supabase migration list --linked` | Production matches through `202607310006`; `202607310007` and `202607310008` remain local-only |
| Edge deployment | `supabase functions list` | `api` active at deployed version 9; the current worktree changes are newer |
| Low-rate public read | 5 requests, concurrency 1, 1 req/s | 5/5 HTTP 200; p95 556 ms |
| Release-envelope public read | Two runs of 20 requests, concurrency 3, 5 req/s | Each produced 19 HTTP 200 and one structured `503 STORAGE_UNAVAILABLE`; p95 1.8 s then 1.124 s |
| Local corrected route | Warm local Edge run at the same 20/3/5 envelope | 20/20 HTTP 200; p95 74 ms; no server, payload, request-ID or cache-policy failures; zero `signup.mode` rate-limit rows created |

The corrected route removes the persistent database rate-limit write from the
small signed `/signup/mode` read, coalesces concurrent control-plane reads, and
caches them for 15 seconds inside an Edge isolate. Signup preflight always
re-reads the control plane and invalidates a stale read cache on a version or
mode change, so closing enrollment is not delayed by the read cache.

The first local run immediately after recovering Docker from a full disk had
four unstructured gateway `502` responses. After the runtime warmed, five
sequential checks and the full 20-request probe passed. This is workstation
recovery evidence, not production capacity evidence.

## Mobile release state

| Platform | Proven | Still open |
|---|---|---|
| Android | EAS production AAB build 6 finished; artifact hash and upload certificate recorded; API 35 emulator journey passed | Correct-project Maps key, physical device, Play App Signing lineage, Play internal/closed-track delivery |
| iOS | Clean production-simulator build from commit `468ce41`; privacy/config checks and extracted Hermes auth scan pass | Apple membership/Team ID, distribution signing, physical iPhone, App Store Connect and TestFlight |

The prior iOS simulator bundle included Android Google-OAuth runtime markers
even though the iOS UI hid the provider. The source now resolves provider
options by platform: Android includes the browser provider, while iOS and the
fallback omit it. A Hermes bundle scanner is part of the production config
gate. The old simulator artifact is superseded and must not be submitted.

### Verified iOS simulator artifact

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

The existing `BlobStore` adapter supports an R2/S3 transition. Cloudflare R2's
current free tier includes 10 GB-month, one million Class A operations, and ten
million Class B operations, but that is still only about 1 MB per user at
10,000 users and requires enforced capture budgets plus capacity alerts:
<https://developers.cloudflare.com/r2/pricing/>.

## Next production sequence

1. Obtain and record approval for the real encrypted production backup.
2. Execute backup plus isolated restore verification.
3. Apply migration `007`, verify its bounded maintenance behavior, then obtain
   the separate approval for migration `008`.
4. Apply migration `008`, deploy the current Edge API, and repeat the 20/3/5
   probe plus authenticated sync/upload/export probes.
5. Resolve the Maps billing/key provenance gate and rebuild Android from the
   clean release commit.
6. Attach an Apple Team to the verified iOS source and produce the
   physical/TestFlight build; repeat the bundle and signed-artifact gates.
7. Load a disposable staging project with a representative 10K synthetic
   metadata fixture and measure authenticated p50/p95/p99, errors, database
   growth, WAL, connections, locks, egress and retained object bytes.
