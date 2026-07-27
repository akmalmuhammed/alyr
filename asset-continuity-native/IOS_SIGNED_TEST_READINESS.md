# ALYR signed iPhone test readiness

**Last local packaging review:** 2026-07-28
**Expo project:** `@alyr-app/alyr-asset-continuity`
**Expo project ID:** `85cab1f2-111f-4e20-abd5-8dff0df2fabb`
**iOS bundle identifier:** `com.alyr.continuity`

This document separates the free Expo Go walkthrough from a signed ALYR
installation and from TestFlight. No physical-device pass, signed iOS build, or
store submission is claimed.

## Current gate matrix

| Path | Status | Cost/account gate | Evidence produced |
|---|---|---|---|
| App Store Expo Go companion | **READY TO SCAN; DEVICE WALKTHROUGH OPEN** | No Apple Developer membership or ALYR App Store listing | Session-only product, design and permission-flow walkthrough |
| EAS `development-simulator` build | **FINISHED / VERIFIED** | No Apple signing credentials; macOS is required to run iOS Simulator | Cloud-built `ALYR.app` archive plus inspected iOS metadata and privacy manifest |
| Signed EAS development build | **CONFIG READY; EXTERNAL GATE OPEN** | Paid Apple membership plus test-iPhone UDID | Native modules, SQLCipher, SecureStore, Face ID and Metro development |
| Signed EAS preview build | **CONFIG READY; EXTERNAL GATE OPEN** | Paid membership plus test-iPhone UDID | Standalone ad hoc ALYR build without Metro |
| TestFlight production build | **CONFIG READY; EXTERNAL GATE OPEN** | Paid membership, App Store Connect record and distribution credentials | Store-signed installation; internal TestFlight does not require the device UDID |

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
  builds. The first `development-simulator` build has since finished and is
  recorded in the release-artifact evidence below.
- `eas device:list` reported no Apple teams for `alyr-app`; no registered
  physical iPhone or provisioning profile is therefore present yet.
- Project-scoped EAS environments now contain the public
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
  `development`, `preview`, and `production`. No service-role or secret key is
  present in a client environment.
- The complete local Supabase migration chain applied successfully in Docker.
  Supabase static checks passed **29/29**, pgTAP passed **105/105**, the export
  API journey passed **30** checks, and `db lint --local --level warning`
  reported no schema errors.
- Supabase project `ifiyragzeizaxdqzxvpk` reports `ACTIVE_HEALTHY`. The live
  database is in parity with all eleven repository migrations:
  `202607250001`, `202607270001`, `202607270002`, `202607270003`,
  `202607270004`, `202607270005`, `202607280001`, `202607280002`,
  `202607280003`, `202607280004`, and `202607280005`.
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

These results replace assumptions with confirmed account state. They also
show that Expo Go remains the current zero-cost physical-iPhone path. The live
database gate is current; the Edge source deployment and signed distribution
remain open gates.

## Locally verified configuration

- The Expo owner, slug, and project ID are fixed in `app.config.ts` so a local
  environment variable cannot silently redirect a release archive.
- EAS CLI is pinned to `21.2.0`.
- Every EAS profile now selects its named server environment explicitly:
  `development`, `preview`, or `production`. The simulator profile inherits
  `development`. This prevents distribution heuristics from selecting a
  different public Supabase configuration.
- The iOS bundle ID is fixed at `com.alyr.continuity`.
- The `alyr` custom URL scheme matches the implemented callback routes:
  `alyr://callback` and `alyr://reset-password`.
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
- Push notifications and background-task execution are not implemented in this
  build. Their packages/plugins were removed; generated entitlements are empty
  and no `UIBackgroundModes` value is emitted.
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
| Native Jest | **116/116 suites, 569/569 tests** |
| Expo Doctor | **20/20 checks** |
| Supabase static | **29/29 checks** |
| Supabase pgTAP | **105/105 checks** |
| Export API E2E | **30 checks** |
| Canonical static iOS export | **5,076 modules** |
| iOS JavaScript bundle | **12,447,447 bytes** |
| Exported artifact tree | **49 files, 23,861,043 bytes** |

The canonical iOS JavaScript bundle SHA-256 is:

```text
765D0894627B27A7A85425BDE633AF089851AFECB1666E7EFE5E48D8B2D67F6E
```

This artifact is an unsigned static iOS export used for deterministic
packaging verification. It is not evidence of a signed binary installation or
physical-device execution.

### EAS iOS Simulator development artifact

EAS build
[`b2f2abcf-0bb4-421d-b668-ba1e9f0642ad`](https://expo.dev/accounts/alyr-app/projects/alyr-asset-continuity/builds/b2f2abcf-0bb4-421d-b668-ba1e9f0642ad)
finished at `2026-07-27T22:57:57.360Z` from clean commit
`2bc447b7ab453a975161fbc83373abc668c0c18b`.

- Profile: `development-simulator`
- Result: **FINISHED / VERIFIED**
- Target: iOS Simulator only; physical-iPhone signing remains a separate Apple
  account gate.
- Artifact:
  [`VbFTYqXVAWOpkKKSJ_8G4WJ0c8XDNv6gApxW0o1N5YM.tar.gz`](https://expo.dev/artifacts/eas/VbFTYqXVAWOpkKKSJ_8G4WJ0c8XDNv6gApxW0o1N5YM.tar.gz)
- Archive size: **57,514,636 bytes**
- Archive SHA-256:
  `6019840933DB40ACD8EAFE1AAFB7EBE47ACEB0E83085CB8FC8D4D8C740804303`
- Archive inspection found **137 entries** and the expected `ALYR.app`.
- `Info.plist` confirms bundle `com.alyr.continuity`, version `0.1.0`, build
  `1`, the reviewed camera/photo/location/Face ID purpose strings, no
  `UIBackgroundModes`, and `ITSAppUsesNonExemptEncryption = false`.
- `Expo.plist` confirms runtime `0.1.0` and the `development` channel.
- Both compressed EAS logs were decoded and scanned. Neither contains a fatal
  or build-error line, and the Xcode transcript ends with `** BUILD SUCCEEDED **`.
  The remaining compiler notices originate in Expo/React Native dependencies.
- `PrivacyInfo.xcprivacy` is present and matches the reviewed app privacy
  declaration.

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

This manifest does **not** complete App Store Connect's App Privacy
questionnaire. Before TestFlight or App Store distribution, the account owner
must review the actual pilot configuration and declare the data it collects,
including account identity, precise location when requested, user-provided
photos/documents and asset records, diagnostics, and product events. ALYR does
not currently include an advertising or cross-app tracking SDK, so
`NSPrivacyTracking` is set to `false`.

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
keep the Windows preview server running, scan the QR referenced by
`asset-continuity-ios-preview/IPHONE_TEST_GUIDE.md`, and complete its checklist.
The remaining evidence is the user's real iPhone walkthrough; it has not yet
been observed or claimed by this repository.

### Signed development or ad hoc preview

1. Activate the paid Apple Developer Program membership.
2. Register `com.alyr.continuity` in that Apple team.
3. Create development/distribution credentials and an ad hoc profile.
4. Register the test iPhone UDID in that profile.
5. Commit the final source, run the full gate, create and install the EAS build,
   then complete the signed-device acceptance sequence.

### TestFlight

1. Complete the paid membership and App Store Connect agreements.
2. Create the ALYR app record for `com.alyr.continuity`.
3. Complete App Privacy, export-compliance, age-rating and beta metadata,
   including verified operator contact, support URL and privacy-policy URL.
4. Run `eas build --platform ios --profile production`, submit the build, add
   the account as an internal tester and install from TestFlight.
5. Run signed-build parity checks. External testers additionally require
   Apple's Beta App Review.

### External-beta and public-link hardening

The personal/internal pilot currently uses the installed-app-only custom scheme
for confirmation, password reset and household invitations:
`alyr://callback`, `alyr://reset-password`, and `alyr://join?...`.
Before invitations or account links are sent to external testers or public
users, provision an owned HTTPS domain and complete all three linked changes:

1. Host a valid Apple App Site Association file for the ALYR application
   identifier and link paths.
2. Add the matching `applinks:` domain to `ios.associatedDomains`, then create a
   fresh signed binary and verify both installed and not-installed behavior.
3. Add the HTTPS callback/reset URLs to Supabase's redirect allow-list and make
   invitation sharing prefer the HTTPS join URL, with the custom scheme kept as
   an installed-app fallback.

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
