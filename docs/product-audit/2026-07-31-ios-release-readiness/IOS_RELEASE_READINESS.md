# Heldat iOS release-readiness evidence

Date: 2026-07-31
Application: Heldat native (`asset-continuity-native`)
Expo project: `@alyr-app/alyr-asset-continuity`
Expo project ID: `85cab1f2-111f-4e20-abd5-8dff0df2fabb`
Bundle identifier: `app.heldat.mobile`

## Decision

Heldat now passes every iOS configuration, JavaScript bundle, and native cloud-compilation gate that is available on this Windows workstation without Apple signing credentials. A production-style iOS Simulator `.app` was compiled in EAS with Xcode 26.6 and the iOS 26.5 Simulator SDK, then downloaded and statically verified.

This evidence is **not** an iPhone, TestFlight, or App Store release. The remaining release gates are Apple-team enrollment/credentials, a signed device archive, universal-link provisioning, and real-iPhone testing.

## Source and focused changes

- Source base: `afd72f2eb76494cf68d694575bcef119006cbb54`; this includes the `faa751a` signed-out sample cold-start repair.
- `asset-continuity-native/eas.json`
  - pins production iOS builds to `macos-tahoe-26.5-xcode-26.6`;
  - adds `production-simulator`, inheriting the production environment and release mode;
  - disables auto-increment for the simulator-only lane so it does not consume the future App Store build number.
- `asset-continuity-native/tests/iosReleaseConfig.test.ts`
  - verifies the pinned production toolchain;
  - verifies profile inheritance;
  - verifies that `production-simulator` keeps remote updates disabled.
- These two changes remain unstaged and uncommitted by design.
- Patch evidence: `C:\Users\akmal\OneDrive\Documents\alyr\tmp\ios-release-audit\production-simulator-source.patch`
- Patch SHA-256: `F037BBDD53416A4A6619362776C38A816D4E81D054912B1B99AE653923E5ACF9`

Apple requires App Store Connect uploads from 2026-04-28 onward to use the iOS 26 SDK or later. The pinned Expo image is the documented SDK 57 image with Xcode 26.6. Sources: [Apple SDK requirement](https://developer.apple.com/news/?id=ueeok6yw), [Expo build infrastructure](https://docs.expo.dev/build-reference/infrastructure/).

## Automated gates

| Gate | Result | Evidence |
|---|---|---|
| Native TypeScript | Pass | Included in `npm run check:native` |
| Native unit/component/contract tests | Pass | 202 suites, 1,274 tests |
| Maestro static journey contracts | Pass | 10 flows, 5 subflows, 57 selector contracts |
| Public Expo config | Pass | `expo config --type public` |
| Production native policy | Pass | iOS privacy/security plus Android release policy check |
| EAS monorepo packaging | Pass | Five shared packages and signed Recovery Kit entry point |
| Recovery cryptography vector | Pass | Argon2id: 64 MiB, t=3, p=1, 32 bytes |
| Expo Doctor | Pass | 20/20 checks |
| Focused iOS release tests | Pass | 15/15 |
| Production iOS Hermes export | Pass | 62 files, 29,129,968 bytes |

Production iOS bytecode:

- Path: `C:\Users\akmal\OneDrive\Documents\alyr\tmp\ios-release-audit\ios-production-export\_expo\static\js\ios\entry-771058db09474dc1284f8d8d06a3bf34.hbc`
- Bytes: `13,475,866`
- SHA-256: `FA07CFD664CE77411DCD8260A7F57899018D77C623092A08DE8684B2CD3F4042`
- Full export manifest: `C:\Users\akmal\OneDrive\Documents\alyr\tmp\ios-release-audit\ios-production-export-manifest.json`

## EAS and Apple-account audit

| Check | Result |
|---|---|
| Authenticated Expo actor | `akmalmuhammed93` / `akmalmuhammed93@gmail.com` |
| Expo ownership | Owner of `alyr-app` and the linked project |
| EAS profile resolution | production environment, store release mode, simulator target, Xcode 26.6 image, auto-increment off |
| EAS iOS device registration | `No Apple teams found for account alyr-app.` |
| Existing iOS credentials | No Apple-team/device evidence is available to the CLI |

Expo documents that simulator builds are standalone and do not need TestFlight or an Apple Developer account. Device builds do require Apple signing credentials. Sources: [Expo simulator builds](https://docs.expo.dev/build-reference/simulators/), [Expo Apple signing roles and permissions](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/).

## Production-simulator cloud build

| Field | Value |
|---|---|
| EAS build ID | `6ec7707a-c146-4237-9631-fb506c72df47` |
| Status | `FINISHED` |
| Profile | `production-simulator` |
| EAS fingerprint | `d36be366857a0d2d690d9715fb37a1d4649587e1` |
| App version/build | `0.1.0` / `1` |
| Runtime | `0.1.0` |
| SDK | Expo 57 |
| Created/completed UTC | `2026-07-31T18:17:54.737Z` / `2026-07-31T18:28:06.100Z` |
| Native build | Release, generic iOS Simulator destination |
| Xcode result | `** BUILD SUCCEEDED **`; zero `error:` lines; no warnings rooted in generated Heldat source |
| EAS record | https://expo.dev/accounts/alyr-app/projects/alyr-asset-continuity/builds/6ec7707a-c146-4237-9631-fb506c72df47 |

Downloaded artifact:

- Path: `D:\HeldatArtifacts\current\ios-production-simulator-6ec7707a\heldat-ios-production-simulator-v0.1.0-build1-6ec7707a.tar.gz`
- Bytes: `43,326,936`
- SHA-256: `706B76ABA589ABC728E8E95D3779077A92E8448C87CE04AA8E0820AD071E063F`
- Verification report: `D:\HeldatArtifacts\current\ios-production-simulator-6ec7707a\production-simulator-artifact-verification.json`
- Archive-safety result: no absolute paths, traversal paths, symbolic links, or hard links.

## Compiled `.app` verification

| Property | Compiled value | Result |
|---|---|---|
| Display name | `Heldat` | Pass |
| Bundle ID | `app.heldat.mobile` | Pass |
| Version/build | `0.1.0` / `1` | Pass |
| Platform | `iphonesimulator` | Pass |
| Minimum iOS | `16.4` | Pass |
| Toolchain | Xcode 26.6 (`17F113`) | Pass |
| SDK | `iphonesimulator26.5` | Pass |
| Architectures | arm64 and x86_64 | Pass |
| Device family | iPhone only | Pass |
| Transport security | Arbitrary loads off; local networking off | Pass |
| URL schemes | `heldat`, `app.heldat.mobile`; no Expo development scheme | Pass |
| EAS Update runtime | Disabled; check-on-launch `NEVER`; no update URL | Pass |
| Development runtime | No Dev Launcher, Dev Menu, debug dylib, or preview dylib | Pass |
| Permission strings | Camera, photos, when-in-use location, Face ID | Pass |
| Denied permission surface | No microphone or always-location purpose string | Pass |
| Background modes | `fetch`, `processing`; reviewed task identifier | Pass |
| Export encryption | Non-exempt encryption `false` | Pass |
| Privacy manifest | Tracking off; no tracking domains; 11 collected-data types; 4 required-reason API categories | Pass |
| Provisioning | None, as expected for a simulator artifact | Pass |

The simulator signature has empty entitlements, which is expected for this unsigned simulator lane. The production config introspection resolves `com.apple.developer.associated-domains = ["applinks:heldat.app"]`; only a future Apple-signed device archive can prove that entitlement in the final code signature and provisioning profile.

## Current-source development simulator

A second build was submitted from a clean detached worktree so EAS records exact Git provenance:

| Field | Value |
|---|---|
| EAS build ID | `eeb18e56-ffcd-45b4-b937-2c24a62730fd` |
| Profile | `development-simulator` |
| Exact source SHA | `afd72f2eb76494cf68d694575bcef119006cbb54` |
| SDK / app / build | Expo 57 / `0.1.0` / `1` |
| Submitted UTC | `2026-07-31T18:26:00.321Z` |
| Final status | `FINISHED` |
| Completed UTC | `2026-07-31T18:37:44.568Z` |
| EAS record | https://expo.dev/accounts/alyr-app/projects/alyr-asset-continuity/builds/eeb18e56-ffcd-45b4-b937-2c24a62730fd |

Downloaded clean-source development artifact:

- Path: `D:\HeldatArtifacts\current\afd72f2\heldat-ios-development-simulator-v0.1.0-build1-afd72f2-eeb18e56.tar.gz`
- Bytes: `56,873,926`
- SHA-256: `AEC635AC9F81118B9B6D3378BBA91518F76DC133E5A6485002A191EA152B311B`
- Verification: `D:\HeldatArtifacts\current\afd72f2\ios-development-simulator-verification.json`
- Result: 14/14 expected development-artifact checks pass, including safe archive, exact identity, iOS 26.5 SDK/Xcode 26.6, both simulator architectures, privacy declarations, and the intentional development-only networking/update/Dev Launcher surface.

## Exact remaining gates

### External Apple/signing gates

1. Enroll the publishing Apple account in the Apple Developer Program, or attach Heldat's EAS project to an existing Apple team with credential-management permission.
2. Register/confirm `app.heldat.mobile` in Certificates, Identifiers & Profiles and create the matching App Store Connect app record.
3. Generate or upload an Apple distribution certificate and distribution provisioning profile.
4. Enable Associated Domains for the App ID; deploy `https://heldat.app/.well-known/apple-app-site-association` with the real Apple Team ID and `app.heldat.mobile`.
5. Run `eas build --platform ios --profile production` from a clean reviewed commit and verify the signed `.ipa`/archive, embedded profile, final entitlements, and build number.
6. Upload that exact archive to TestFlight and complete the required App Store Connect app/privacy/review metadata.

Apple lists App Store distribution and App Store Connect as paid-program capabilities; current enrollment is USD 99 per membership year. Personal-Team testing is possible only through Xcode on a Mac and uses seven-day provisioning. Source: [Apple membership comparison](https://developer.apple.com/support/compare-memberships/).

### Runtime gates

1. Launch the production-simulator artifact on a Mac with an iOS 26 Simulator. This has no Apple-membership dependency, but no macOS/iOS Simulator runtime is present on the current Windows workstation.
2. On a signed physical-iPhone build, run camera interruption/denial, selected-photo import, document import, precise-location accuracy/manual adjustment, Face ID, encrypted vault restart/process death, offline-to-online sync, background/foreground reconciliation, local reminders, Arabic RTL, VoiceOver, Dynamic Type, app-switcher shielding, and universal-link tests.
3. Use TestFlight for the release-candidate parity pass before App Review.

The current iOS UI exposes email/password authentication and intentionally hides Google OAuth until Apple-login parity exists; the corresponding platform-policy regression test passes.

## Release command after the external gates open

From a clean reviewed commit:

```powershell
npx --yes eas-cli@21.2.0 build --platform ios --profile production
```

After the signed build passes the device matrix:

```powershell
npx --yes eas-cli@21.2.0 submit --platform ios --profile production
```
