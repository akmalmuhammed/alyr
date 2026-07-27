# ALYR personal iPhone preview verification

Verified on **28 July 2026** for the zero-cost Expo Go walkthrough.

> Compatibility checkpoint: Expo's current physical-iPhone guidance says the
> App Store Expo Go client supports SDK 54. Recheck this if Expo Go updates; an
> iPhone does not install an older Expo Go release without Apple signing.

## Live target

- Expo URL: `exp://192.168.1.32:8081`
- LAN QR: valid 768 Ã— 768 PNG, `3,524` bytes
- LAN QR SHA-256:
  `7FAA1CAA06CEE2C46B3DB3F47DB0D7C1C690B8BDFB18C34080562CAEEA7F0A49`
- Metro status: HTTP 200 (`packager-status:running`)
- Local manifest: HTTP 200
- LAN manifest: HTTP 200
- Manifest runtime: `exposdk:54.0.0`
- LAN iOS development bundle: HTTP 200
- Root-owned LAN iOS development bundle: stable two-pass result of
  `21,511,388` bytes, SHA-256
  `312F37F50E69FFC158B9904DD4FD58FE2904631CFC17844D488E59567444479D`
- The development-bundle hash may change when Metro restarts; the clean
  static-export hash below is the reproducibility gate.
- Metro watches only the canonical native app and shared package roots. An
  exact temporary-tree create/delete volatility probe completed while Metro
  stayed alive.

The PC and iPhone must remain on the same Wi-Fi network. The local IP can
change after reconnecting the PC or router; run `START_IPHONE_PREVIEW.ps1` and
use the new QR code if that happens.

## Current Expo Go gates

- SDK 54 iPhone companion: TypeScript passed.
- SDK 54 iPhone companion: **10/10 preview-contract tests passed**.
- Companion route parity: **43/43 canonical route files**.
- Expo public configuration reports SDK 54 and
  `dataPolicy: session-only`.
- SDK 54 iOS Hermes export: **4,813 modules**.
- SDK 54 Hermes bytecode: `12,407,523` bytes.
- SDK 54 Hermes SHA-256:
  `A56E10579AD7E80765D67CA59F6709FC285B5B70EB733E2F589654621A203AD7`.
- Complete SDK 54 export: **49 files / 23,821,311 bytes**.
- Static export metadata SHA-256:
  `338BE8E1F6F7070DB11648F7881ACBBB59337B5F0B3E59284E915D15F4FE29A8`.

The signed application and backend have their own release evidence. This
document records only the free, session-only Expo Go companion.

## Product and visual replay

- Round-2 visual evidence covers Welcome, auth, onboarding, Today, Portfolio,
  Items, Search, Family, Vault, Arabic RTL, Capture, and saved Passport:
  `round2/ALYR-round2-contact-sheet.png`.

- Compact iPhone sign-in keeps email, password, recovery, and the primary
  action in one scroll flow at 320 Ã— 568.
- The invitation journey has one header and a receipt with household, role,
  absolute expiry, copy, and native share actions.
- Viewer access is enforced by a fail-closed capability policy in both the UI
  and workspace commands.
- Expo Go exposes a clearly labelled test-session reset, while the signed app
  has a separate reauthenticated account-and-data deletion journey.
- Welcome exposes Sign in, Create private workspace, Explore sample, and the
  English/Arabic switch without scrolling at 390 Ã— 844.
- Today reports confirmed property pins separately from pins needing review.
- Portfolio totals remain separated by currency and do not claim net worth.
- Portfolio gap commands open the exact filtered review state.
- Quick Passport validation is reachable and focuses the missing name at
  320 Ã— 844.
- Day / Month / Year value entry replaces raw ISO date entry.
- Arabic RTL Quick Passport was replayed at 320 Ã— 844.
- The complete secondary EN/AR RTL pass covers Atlas, Recovery
  create/restore, Asset-list status and location labels, Portfolio loading and
  setup states, Family/Vault, and their VoiceOver labels and directional
  controls.
- Family includes an owner-only invitation flow with role and expiry
  consequences, one-time-code disclosure, the iOS share sheet, and a
  recipient Join a household path.
- Recovery Kit routes stay reachable and explain the installed-build boundary
  without running weaker preview protection.
- Browser console: no warnings or errors during the clean final replay after
  the RTL web-style, decorative accessibility, and empty-stack capture-exit
  corrections.

Final replay images are in:

`C:\Users\akmal\OneDrive\Documents\alyr\docs\product-audit\2026-07-27-ios-preview-final`

## Personal-test boundary

This companion is a **session-only product test**. Use test information.

The checks in this document validate source contracts, Expo configuration,
static output, and the live LAN manifest/bundle. They do not claim a
physical-iPhone run.

It proves native navigation, onboarding, camera/photo/document/location
interactions, Places and precise pins, Quick Passport, search, Portfolio,
Atlas, evidence review, the English/Arabic core and secondary journeys, and
the invitation/join interaction.

The preview invitation is held only in the current JavaScript session. It
creates no production cloud membership, sends no invitation email or SMS, and
must not be treated as a cross-device access test.

This handoff does not claim a physical-iPhone walkthrough, durable backup, or
production cloud behavior.
SQLCipher, account-scoped SecureStore keys, real email confirmation, deployed
Supabase sync, signed evidence upload, biometric unlock, and encrypted
Recovery Kit creation/restore require the signed development build and its
remaining native security adapters.

## Artifacts

- `C:\Users\akmal\OneDrive\Documents\alyr\docs\product-audit\2026-07-27-ios-preview\ALYR-EXPO-GO-QR.png`
  â€” current LAN QR code
- `../../../asset-continuity-ios-preview/IPHONE_TEST_GUIDE.md` â€” personal
  acceptance walkthrough
- `../../../asset-continuity-ios-preview/START_IPHONE_PREVIEW.ps1` â€” verified
  restart helper
- `../2026-07-27-ios-preview-final/VISUAL_REPLAY.md` â€” current responsive and
  bilingual visual evidence
