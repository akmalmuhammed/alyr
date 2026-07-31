# Heldat signed iPhone test readiness

**Last public-identity review:** 2026-07-31
**Expo project:** `@alyr-app/alyr-asset-continuity`
**Expo project ID:** `85cab1f2-111f-4e20-abd5-8dff0df2fabb`
**iOS bundle identifier:** `app.heldat.mobile`

This document separates the free Expo Go walkthrough from a signed Heldat
installation and from TestFlight. No physical-device pass, signed iOS build, or
store submission is claimed.

The public identifier migrated before store enrollment from the legacy
`com.alyr.continuity` / `alyr://` pair to `app.heldat.mobile` / `heldat://`.
Previously recorded simulator and Android artifacts retain the legacy identity
and are historical evidence only. A fresh build is required for the current
public identity.

## Current gate matrix

| Path | Status | Cost/account gate | Evidence produced |
|---|---|---|---|
| App Store Expo Go companion | **READY TO SCAN; DEVICE WALKTHROUGH OPEN** | No Apple Developer membership or Heldat App Store listing | Session-only product, design and permission-flow walkthrough |
| EAS `development-simulator` build | **LEGACY IDENTITY VERIFIED; REBUILD REQUIRED** | No Apple signing credentials; macOS is required to run iOS Simulator | Historical cloud-built artifact, exact metadata/privacy manifest, archive hashes and decoded build logs |
| Signed EAS development build | **CONFIG READY; EXTERNAL GATES OPEN** | Current Edge deployment, paid Apple membership and test-iPhone UDID | Native modules, SQLCipher, SecureStore, Face ID and Metro development |
| Signed EAS preview build | **CONFIG READY; EXTERNAL GATES OPEN** | Current Edge deployment, paid membership and test-iPhone UDID | Standalone ad hoc Heldat build without Metro |
| TestFlight production build | **CONFIG READY; EXTERNAL GATES OPEN** | Current Edge deployment, paid membership, App Store Connect record and distribution credentials | Store-signed installation; internal TestFlight does not require the device UDID |

The separate `asset-continuity-ios-preview` Expo Go companion remains on SDK 54
because Expo's current physical-iPhone guidance says the App Store Expo Go
client supports SDK 54. The signed native target in this directory uses SDK 57.
iOS does not offer side-loading of another Expo Go version. Recheck this dated
compatibility gate immediately before scanning if the App Store client updates.

## Live account and backend audit

The following checks were run on 2026-07-27 with the pinned EAS CLI:

- `eas whoami` authenticated as `akmalmuhammed93@gmail.com`.
- The account owns both `akmalmuhammed93` and `alyr-app`.
- `eas project:info` resolved the checked-in project ID to
  `@alyr-app/alyr-asset-continuity`.
- The initial `eas build:list --platform ios` check returned no prior iOS
  builds. Current-source `development-simulator` build
  `71351749-9f72-42ba-86d2-e2b4156827f0` has since finished and is recorded in
  the release-artifact evidence below.
- `eas device:list` reported no Apple teams for `alyr-app`; no registered
  physical iPhone or provisioning profile is therefore present yet.
- Project-scoped EAS environments now contain the public
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
  `development`, `preview`, and `production`. No service-role or secret key is
  present in a client environment.
- The complete current local Supabase migration chain applied successfully in
  Docker. Supabase static checks passed **44/44**, pgTAP passed **160/160**,
  and `db lint --local --level warning` reported no schema errors.
- Supabase project `ifiyragzeizaxdqzxvpk` reports `ACTIVE_HEALTHY`. The live
  database was previously confirmed in parity through these eleven repository
  migrations:
  `202607250001`, `202607270001`, `202607270002`, `202607270003`,
  `202607270004`, `202607270005`, `202607280001`, `202607280002`,
  `202607280003`, `202607280004`, and `202607280005`.
- The repository now also contains `202607280006` through `202607280009`,
  including liability/net-position, household idempotency/scope, and product
  event idempotency changes. A current authenticated deployment and live
  verification are required; live migration parity is not claimed for this
  source checkpoint.
- The live `api` Edge Function reports `ACTIVE`, version **3**. The reviewed
  source now adds recipient preflight plus Place-document/property export
  handling; that source revision still requires an authenticated function
  deployment before the live Edge gate is current.
- Export retention cron `alyr-export-retention-daily` is active on
  `17 2 * * *`, and both required Vault maintenance entries are configured.
  Their values are excluded from this document.
- Live probes returned missing-maintenance-token `403`, valid maintenance
  `200` with `status=complete` and `batchLimit=100`, invalid pilot invitation
  `403 AUTHORIZATION_DENIED`, and sync without a bearer `401`.
- The temporary deployment access token was revoked after deployment, and the
  local Supabase CLI has no stored access token.

These results replace assumptions with confirmed account state. They also show
that Expo Go remains the current zero-cost physical-iPhone path. The clean
source checkpoint and its decoded Expo Go QR are verified at
`691e4e6d97842927985e0cd4f01ee085cf3805a0`; the current-source iOS Simulator
artifact is also verified and inspected. The local database gate is current;
the latest migrations, Edge source deployment, paid Apple access, physical
signing/distribution, Chrome visual validation, and physical-iPhone walkthrough
remain open gates.

## Locally verified configuration

- The Expo owner, slug, and project ID are fixed in `app.config.ts` so a local
  environment variable cannot silently redirect a release archive.
- EAS CLI is pinned to `21.2.0`.
- Every EAS profile now selects its named server environment explicitly:
  `development`, `preview`, or `production`. The simulator profile inherits
  `development`. This prevents distribution heuristics from selecting a
  different public Supabase configuration.
- The iOS bundle ID is fixed at `app.heldat.mobile`.
- The `heldat` custom URL scheme matches the implemented callback routes:
  `heldat://callback` and `heldat://reset-password`.
- The iOS icon is a 1024 × 1024, opaque, full-bleed RGB PNG. iOS applies the
  platform mask; the source does not contain a baked rounded mask.
- Splash artwork remains a separate 512px asset on the ALYR light background.
- Camera, selected-photo, in-use location, and Face ID purpose strings are
  specific to the related user action. Background location, motion, camera
  audio, and barcode capabilities are disabled.
- Generated iOS transport configuration sets
  `NSAllowsArbitraryLoads = false`. The local-network transport allowance
  remains only to support Expo development-client discovery; public Supabase
  traffic and EAS updates use HTTPS.
- `.easignore` mirrors the repository security exclusions and removes local
  client work, output, credentials, databases, recovery files, build products,
  and developer state from the EAS archive while retaining every npm workspace
  and shared package required by the monorepo install.
- Generated `packages/*/dist` directories stay outside the upload. The native
  workspace `postinstall` hook rebuilds all five shared packages during a clean
  EAS install, and `npm run verify:eas-packaging` checks both JavaScript and
  declaration entry points before a signed build is requested.
- EAS builds now require a clean commit, keeping signed source reproducible
  and preventing ignored local collateral from entering a dirty Windows archive.
- `expo-updates` is installed. Generated iOS configuration resolves
  `EXUpdatesEnabled = true`, runtime `0.1.0`, and
  `https://u.expo.dev/85cab1f2-111f-4e20-abd5-8dff0df2fabb`.
- The focused release is iPhone-only; iPad support is not advertised.
- The current signed source includes `expo-background-task`,
  `expo-task-manager`, and local-only `expo-notifications` configuration.
  Background synchronization is opportunistic and foreground reconciliation
  remains mandatory because iOS controls whether and when a background task
  runs. Review reminders are device-local; no remote-push delivery is claimed.
- The installed runtime now composes the Recovery Kit journey with SQLCipher,
  the scoped encrypted attachment vault, iOS document/share sheets, native
  AES-256-GCM, and the audited RFC 9106 Argon2id implementation from
  `@noble/hashes`. Expo Go and web remain visibly session-only.

## Verified release artifacts

The complete-suite counts below are the integrated 2026-07-28 run. The final
clean commit must repeat the release checks before signing.

The final local readiness pass produced:

| Verification | Result |
|---|---:|
| Native Jest | **178/178 suites, 1,071/1,071 tests** |
| Native TypeScript | **Pass** |
| Maestro static contract | **7 flows, 3 subflows, 33 selectors** |
| Expo Doctor | **20/20 checks** |
| EAS packaging | **5 shared packages + Argon2 pass** |
| Supabase static | **44/44 checks** |
| Supabase pgTAP | **160/160 checks** |
| Supabase lint | **Clean** |
| Web regression/build | **228 domain + 7 server + 126 UI + 4 Sites; build pass** |
| Mobile visual prototype | **Build + 4 Sites pass** |
| SDK 54 Expo Go companion | **11/11 contracts; 5,015-module iOS export; 13.2 MB entry HBC** |
| Canonical SDK 57 static iOS export | **5,206 modules** |
| Canonical iOS JavaScript bundle | **13,169,149 bytes** |
| Canonical `metadata.json` | **4,045 bytes** |
| Canonical exported artifact tree | **63 files, 26,532,025 bytes** |

Maestro CLI `2.7.0` is installed locally on Java `17.0.19`. The executable
suite reaches device selection, where the current Windows host reports zero
connected emulators/devices; runtime results therefore remain part of the
simulator or physical-device gate rather than this static pass.

The canonical iOS JavaScript bundle SHA-256 is:

```text
3B3E98A5EA7AFF08B96777E970A9D93A5D0913D3DFB3F2C444764F13CFF58B4F
```

The matching `metadata.json` SHA-256 is
`95B25B2CD6A2515869FF965FC18D96EB08E6DAF2EF71F421456F1B44825F5C3D`.

This artifact is an unsigned static iOS export used for deterministic
packaging verification. It is not evidence of a signed binary installation or
physical-device execution. The clean source checkpoint is
`691e4e6d97842927985e0cd4f01ee085cf3805a0`. The current-source EAS iOS
Simulator artifact below has now been independently inspected; a
physical-device signed build and physical-device run remain required before
signed-device promotion.

### Historical EAS iOS Simulator development artifact (legacy identity)

EAS build
[`71351749-9f72-42ba-86d2-e2b4156827f0`](https://expo.dev/accounts/alyr-app/projects/alyr-asset-continuity/builds/71351749-9f72-42ba-86d2-e2b4156827f0)
finished at `2026-07-28T12:32:42.005Z` from clean commit
`e79fdec052d85354c83910d61b64d30e14802230`. That commit is the direct child
of canonical executable-source commit
`691e4e6d97842927985e0cd4f01ee085cf3805a0`; their diff contains only release
documentation and audit artifacts.

- Result/profile/channel: **FINISHED / VERIFIED / INSPECTED** /
  `development-simulator` / `development`.
- SDK/app/build/runtime: `57.0.0` / `0.1.0` / `1` / `0.1.0`.
- EAS fingerprint:
  `f45936120c262589173d1b39551c2e8ed61f866f`.
- Target: iOS Simulator only. The archive contains no embedded provisioning
  profile and is not physical-iPhone signing or execution evidence.
- Artifact:
  [`4Bf9U4x95x1eRksKC9LOfFf11yJ959abF-6dimJATYQ.tar.gz`](https://expo.dev/artifacts/eas/4Bf9U4x95x1eRksKC9LOfFf11yJ959abF-6dimJATYQ.tar.gz)
- Archive size: **58,277,627 bytes**
- Archive SHA-256:
  `93C85B130CFE6195502ABDAE546BF895F18502E07622D89AA26C34C5C768480F`
- Archive inspection found **146 members** — 98 files and 48 directories,
  rooted only at `ALYR.app`, with no unsafe path, symlink, or hard link.
- `Info.plist` is **2,518 bytes**, SHA-256
  `516F6071AA7A2D31DEFFF386A5EBDE24D471B99AC725129BD8F605354687B346`.
  It confirms the former bundle `com.alyr.continuity`, version/build `0.1.0` / `1`,
  `iPhoneSimulator`, `UIDeviceFamily = [1]`, minimum iOS `16.4`, the reviewed
  purpose strings, `NSAllowsArbitraryLoads = false`, development-only local
  networking/Bonjour discovery, `ITSAppUsesNonExemptEncryption = false`,
  `UIBackgroundModes = [fetch, processing]`, and background-task identifier
  `com.expo.modules.backgroundtask.processing`.
- `Expo.plist` is **368 bytes**, SHA-256
  `92A26BC756146F4A5578582F8EEE76CA5264351AEDAEDECF2459FBA283153A9F`.
  It confirms EAS Update is enabled, runtime `0.1.0`, the `development` channel,
  and the reviewed project update URL.
- `PrivacyInfo.xcprivacy` is **5,518 bytes**, SHA-256
  `38EB64B2FA739A83F72CDAC50374F1448112B43A2FDFB065183DE07F56A4165B`.
  Its normalized contents exactly match the resolved source configuration:
  tracking is false, tracking domains are empty, all 11 collected-data
  categories are linked/non-tracking, Product Interaction is used for
  Analytics, and all four reviewed required-reason API categories are present.
- The stored EAS worker log is **65,132 bytes**, SHA-256
  `944099FC5D87ABCE16F97B7FAD2B71504FA4454C5E1467E8B3022C59AC46E09E`;
  its decoded **528,972-byte** form has SHA-256
  `9B2372D195C57830AE55195B3E5C010FBF10821F3B8CE08AB4971C0640C0AC75`.
  All 1,730 records are below level 40 and confirm the exact profile, commit,
  SDK, runtime, and channel.
- The stored Xcode log is **215,080 bytes**, SHA-256
  `5B7158958BEE74E02274F760551D64D8AA67D3925B9B2FCABC7F9CE057341B27`;
  its decoded **17,285,029-byte** form has SHA-256
  `05A070F4FF04796D916E3019B13EE9FA3EDCCC253319DCA41A764094F97478E9`.
  Its 89,626 lines contain zero error/fatal lines, one
  `** BUILD SUCCEEDED **`, and no `BUILD FAILED`.
- Xcode emitted **3,929 warning lines**: 2,542 from prebuilt dependency
  headers, 1,080 from `node_modules`, 258 from Pods/build phases, 48 from
  toolchain/other output, and one ALYR-target build-phase output-dependency
  warning. The EAS summary also reports two missing Metal-toolchain search-path
  warnings and a future Ruby 3.2 support warning. These are non-failing
  build-maintenance debt.

The complete machine-readable and human-readable inspection is stored in
[`docs/product-audit/2026-07-28-ios-simulator-e79fdec`](../docs/product-audit/2026-07-28-ios-simulator-e79fdec/IOS_SIMULATOR_BUILD_VERIFICATION.md).

## EAS profiles

| Profile | Target | Install behavior | Apple-account requirement |
|---|---|---|---|
| `development` | Physical iPhone | Internal development client; Metro is required while testing | Paid Apple Developer membership, registered device, development/ad hoc credentials |
| `development-simulator` | iOS Simulator | Internal simulator development client | No Apple signing credentials, but the simulator itself requires macOS |
| `preview` | Physical iPhone | Standalone internal build; Metro is not required | Paid Apple Developer membership, registered device, ad hoc distribution credentials |
| `production` | TestFlight/App Store | Store-signed build | Paid Apple Developer membership and App Store Connect access |

On Windows, native acceptance uses a cloud-built `development` or `preview`
binary. TestFlight uses the `production` profile rather than ad hoc device
registration.

## Apple privacy manifest review

`app.config.ts` declares no tracking domains and includes the required-reason
API categories used by the installed native SDKs and ALYR's local file flow:

| Required-reason category | Reasons | Evidence in this app |
|---|---|---|
| File timestamps | `C617.1`, `3B52.1` | ALYR-managed files inside the app container and documents the user explicitly selects |
| Disk space | `E174.1`, `85F4.1` | Reasons declared by the installed Expo FileSystem native package |
| System boot time | `35F9.1` | Reason declared by the installed React Native runtime |
| User defaults | `CA92.1` | App-scoped preferences used by React Native/Expo packages |

The app-level manifest copies relevant reasons from static native packages
because Expo notes that package manifests are not always included in Apple's
analysis of a submitted binary.

Current source also declares the first-party categories stored by the signed
cloud record: email address, account and installation identifiers, physical
address, coarse and precise location, recorded asset/property values, selected
photos, user-provided item/document content, and sync diagnostics. Each is
linked to the signed account, used only for app functionality, and not used for
tracking. Product Interaction is also declared as linked to the signed account,
used for analytics, and not used for tracking. The in-app legal copy explains
the closed-pilot measurement boundary and excludes names, values, addresses,
coordinates, and other asset content from analytics payloads. ALYR includes no
advertising or cross-app tracking behavior, and `NSPrivacyTracking` is set to
`false`.

This manifest does **not** complete App Store Connect's App Privacy
questionnaire. Before TestFlight or App Store distribution, the account owner
must reconcile the generated privacy report and final pilot behavior against
the questionnaire.

## Focused post-build P0/P1 audit

The 2026-07-28 source audit found no local P0 in the final simulator evidence,
icon/splash inputs, custom-scheme routes, onboarding resume path, cloud export,
or Today-to-Portfolio entry. Focused contract suites cover those paths.

Two local P1s were corrected after build `b9bb7206`:

1. The app privacy manifest now declares the first-party data collected by the
   signed cloud record rather than emitting an empty collected-data array.
2. Account deletion marks the cloud identity deleted only after a validated
   server receipt. An unexpected pre-receipt exception now remains retryable
   and cannot switch the UI to device-cleanup-only mode.

The public support and privacy-policy URLs are now verified at
`https://heldat.app/support/` and `https://heldat.app/privacy/`; the native
support surface publishes `support@heldat.app`, `privacy@heldat.app`, and
`security@heldat.app`. The operator legal identity and App Review contact
name/email/phone remain submission inputs.

## Encryption and export-compliance setting

`ios.config.usesNonExemptEncryption` is `false`, which generates
`ITSAppUsesNonExemptEncryption = NO`. The reviewed iOS implementation uses
Apple platform cryptography for CryptoKit/CommonCrypto-backed AES-GCM,
SQLCipher's CommonCrypto provider, hashing, secure storage, and TLS. Recovery
Kit password derivation additionally uses the standard RFC 9106 Argon2id
algorithm through the independently audited, zero-dependency
`@noble/hashes` implementation; ALYR does not introduce a proprietary cipher.

The App Store Connect Account Holder, Admin, or App Manager must still confirm
the export-compliance answers for the intended territories and the final
binary. The configuration prevents an unnecessary questionnaire on every
upload; it does not replace the account owner's export classification.

## Public runtime configuration

Signed builds fail closed unless their EAS build environment supplies:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Only the project URL and a public publishable/legacy anon key belong in a
client build. A service-role or `sb_secret_` key must never be added to EAS
client variables, `.env` files, the archive, or the application.

## First physical-iPhone test sequence

Run these only after the Apple membership is active and the bundle identifier
is available to the selected Apple team:

1. Register the test iPhone's UDID:

   ```powershell
   & "$env:ProgramFiles\nodejs\npx.cmd" eas-cli@21.2.0 device:create
   ```

2. Confirm the required public Supabase values exist in the EAS
   `development` environment.

3. Create the signed development build:

   ```powershell
   & "$env:ProgramFiles\nodejs\npx.cmd" eas-cli@21.2.0 build --platform ios --profile development
   ```

4. Install it from the EAS build page, then start Metro from the repository:

   ```powershell
   & "$env:ProgramFiles\nodejs\npm.cmd" run dev:native
   ```

5. Run the physical-device acceptance checks: camera interruption and
   permission denial, selected document/photo import, exact-location accuracy
   and adjusted-pin truth, offline capture plus restart/process death,
   Face ID lock/unlock, encrypted attachment retrieval, foreground sync and
   upload verification, deep-link callback/reset, VoiceOver, Dynamic Type,
   Arabic RTL, app-switcher privacy shielding, and sign-out/vault isolation.
   For Recovery Kit specifically: create a kit containing one image and one
   document, save it through the iOS share sheet, reinstall the signed build,
   restore it, and open both recovered files. Repeat import with a wrong
   passphrase, a one-byte-modified ciphertext, and an unsupported container
   version; each must preserve the current vault.

For a no-Metro stakeholder build, use `--profile preview` after the development
build passes. Every new physical iPhone must be registered and included in a
refreshed ad hoc provisioning profile.

## Remaining external gates

### Free personal walkthrough

No paid Apple membership is involved. Install the current App Store Expo Go,
keep the Windows preview server running, and complete the checklist in
`asset-continuity-ios-preview/IPHONE_TEST_GUIDE.md`. The verified source
checkpoint is `691e4e6d97842927985e0cd4f01ee085cf3805a0`; its decoded handoff QR
is stored under `docs/product-audit/2026-07-28-iphone-preview-691e4e6/`. The
remaining product evidence is the user's real iPhone walkthrough; it has not
yet been observed or claimed by this repository.

### Signed development or ad hoc preview

1. Activate the paid Apple Developer Program membership.
2. Register `app.heldat.mobile` in that Apple team.
3. Create development/distribution credentials and an ad hoc profile.
4. Register the test iPhone UDID in that profile.
5. Deploy and verify the current Supabase migrations and Edge Function.
6. Commit the final source, run the full gate, create the EAS build, inspect its
   metadata/privacy configuration, install it, then complete the signed-device
   acceptance sequence.

### TestFlight

1. Complete the paid membership and App Store Connect agreements.
2. Create the Heldat app record for `app.heldat.mobile`.
3. Complete App Privacy, export-compliance, age-rating and beta metadata,
   including the operator/App Review contact; use the verified Heldat support
   and privacy-policy URLs.
4. Run `eas build --platform ios --profile production`, submit the build, add
   the account as an internal tester and install from TestFlight.
5. Run signed-build parity checks. External testers additionally require
   Apple's Beta App Review.

### External-beta and public-link hardening

The PKCE account flow retains the installed-app custom scheme for confirmation,
Google OAuth and password reset: `heldat://callback` and
`heldat://reset-password`. The native config also declares verified HTTPS links
for `https://heldat.app/join`, `/callback`, and `/reset-password`, plus the iOS
`applinks:heldat.app` entitlement.

Before those HTTPS links are relied on for external distribution:

1. Publish a valid Apple App Site Association file using the final Apple Team
   ID. The endpoint is currently intentionally absent until that identity
   exists.
2. Publish Android `assetlinks.json` with the Play App Signing SHA-256
   certificate. The EAS internal-build certificate alone is not sufficient for
   Play installs.
3. Create fresh signed binaries and verify installed and not-installed link
   behavior, then add the HTTPS callback/reset URLs to Supabase's redirect
   allow-list before switching outbound account links from the PKCE custom
   scheme.

This gate does not block the owner's first ad hoc iPhone test. It is a release
reliability and scheme-hijack boundary for external distribution.

Recheck Expo identity immediately before signing:

```powershell
& "$env:ProgramFiles\nodejs\npx.cmd" eas-cli@21.2.0 whoami
& "$env:ProgramFiles\nodejs\npx.cmd" eas-cli@21.2.0 project:info
```

## Primary references

- [Expo: Apple privacy manifests](https://docs.expo.dev/guides/apple-privacy/)
- [Expo: internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo: EAS build profiles](https://docs.expo.dev/build/eas-json/)
- [Expo: `.easignore`](https://docs.expo.dev/build-reference/easignore/)
- [Apple: app privacy configuration](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)
- [Apple: required-reason APIs](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes)
- [Apple: `ITSAppUsesNonExemptEncryption`](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
- [Apple: encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)
- [Apple: supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
