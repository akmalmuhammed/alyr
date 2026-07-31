# Heldat iOS simulator build evidence — 2026-07-31

## Status

Both credential-free iOS Simulator builds finished successfully. They prove native compilation, but neither is installable on an iPhone or uploadable to TestFlight/App Store.

| Purpose | EAS build | Source provenance | Result |
|---|---|---|---|
| Release-posture compile | `6ec7707a-c146-4237-9631-fb506c72df47` | Working snapshot based on `afd72f2`; EAS fingerprint `d36be366857a0d2d690d9715fb37a1d4649587e1`; Git SHA is null because submission used no-VCS mode | `FINISHED` |
| Current app/dev-client compile | `eeb18e56-ffcd-45b4-b937-2c24a62730fd` | Clean detached source SHA `afd72f2eb76494cf68d694575bcef119006cbb54`, which includes `faa751a` | `FINISHED` |

## Production-simulator artifact

- Path: `D:\HeldatArtifacts\current\ios-production-simulator-6ec7707a\heldat-ios-production-simulator-v0.1.0-build1-6ec7707a.tar.gz`
- Bytes: `43,326,936`
- SHA-256: `706B76ABA589ABC728E8E95D3779077A92E8448C87CE04AA8E0820AD071E063F`
- Verification JSON: `D:\HeldatArtifacts\current\ios-production-simulator-6ec7707a\production-simulator-artifact-verification.json`
- Native log: Release configuration, Xcode 26.6 (`17F113`), iOS Simulator SDK 26.5, `BUILD SUCCEEDED`, zero error lines, and no warnings rooted in generated Heldat source.

All 13 release-artifact checks pass:

1. identity `Heldat` / `app.heldat.mobile` / `0.1.0 (1)`;
2. iPhone-only device family;
3. iOS 26 SDK;
4. Xcode 26;
5. ATS arbitrary and local-network loads disabled;
6. only `heldat` and `app.heldat.mobile` URL schemes;
7. EAS Update disabled, check `NEVER`, no update URL;
8. no Dev Launcher/Menu/debug/preview runtime;
9. no microphone or always-location disclosure;
10. reviewed privacy manifest;
11. non-exempt encryption `false`;
12. arm64 and x86_64 simulator slices;
13. no provisioning profile, as expected for a simulator artifact.

The archive also passed path-traversal/link safety checks.

## Clean-source development artifact

- Path: `D:\HeldatArtifacts\current\afd72f2\heldat-ios-development-simulator-v0.1.0-build1-afd72f2-eeb18e56.tar.gz`
- Bytes: `56,873,926`
- SHA-256: `AEC635AC9F81118B9B6D3378BBA91518F76DC133E5A6485002A191EA152B311B`
- Verification JSON: `D:\HeldatArtifacts\current\afd72f2\ios-development-simulator-verification.json`
- Result: 14/14 checks pass. Its local-network access, `exp+` scheme, remote updates, and Dev Launcher/Menu are expected for `development-simulator` and are absent from the production-simulator artifact.

## Config/test guardrails

- Production iOS is pinned to EAS image `macos-tahoe-26.5-xcode-26.6`.
- `production-simulator` inherits production environment/release mode and disables auto-increment.
- `tests/iosReleaseConfig.test.ts` asserts the pinned image, profile inheritance, and disabled production updates.
- Full native validation passes: 202 suites / 1,274 tests; Maestro 10 flows / 57 selector contracts; Expo Doctor 20/20.

Apple requires iOS 26 SDK or later for App Store Connect uploads after 2026-04-28; this toolchain meets that compiler/SDK gate. References: [Apple](https://developer.apple.com/news/?id=ueeok6yw), [Expo infrastructure](https://docs.expo.dev/build-reference/infrastructure/).

## Remaining signed-device gate

EAS reports `No Apple teams found for account alyr-app.` The next release gate is external:

1. attach an enrolled Apple Developer team;
2. register `app.heldat.mobile` and enable Associated Domains;
3. publish the `heldat.app` AASA file with the real Apple Team ID;
4. generate distribution credentials and run a clean `production` EAS build;
5. verify the signed archive's embedded provisioning profile and `applinks:heldat.app` entitlement;
6. run the real-iPhone permission, Face ID, camera/photo/document, location, offline/sync, background, RTL, accessibility, privacy-shield, and universal-link matrix;
7. pass TestFlight parity before App Store submission.

Expo requires Apple signing credentials for iOS device builds: [Expo signing requirements](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/).

The production-simulator build should be repeated from a clean commit if it will be retained as canonical provenance. To conserve EAS quota, the first clean Apple-signed `production` build may instead supersede it.
