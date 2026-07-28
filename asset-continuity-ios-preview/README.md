# ALYR iPhone Preview

This is a zero-cost, session-only Expo Go companion for testing the canonical
ALYR native screens on a physical iPhone from Windows.

- It re-exports the routes from `asset-continuity-native`.
- It intentionally uses Expo SDK 54 while the signed application remains on
  SDK 57, because the current App Store Expo Go client supports SDK 54.
- It overrides persistence and attachments with memory-only adapters.
- It must not be used for sensitive or durable information.
- Durable SQLCipher storage, Face ID, opportunistic background sync, local
  review reminders, signed permission configuration, and production Recovery
  Kits require the signed development build.

`expo-doctor` reports the second SDK and the strict Metro resolver as
duplicates/customization. Those are intentional in this companion: Metro is
locked to its local SDK 54 modules, while the canonical app remains on SDK 57.
The automated preview gate is a successful SDK 54 iOS Hermes export. The
physical Expo Go walkthrough is a separate personal-device check and remains
open.

## Start on the same Wi-Fi

```powershell
npm run dev:ios-preview
```

Install Expo Go on the iPhone, allow Local Network access, and scan the QR code
shown by Expo CLI. Use the sample workspace first.

The source checkpoint and handoff QR are intentionally **pending** until the
root release task creates a clean commit and regenerates the QR from that exact
source. Do not treat a QR stored under an older commit-named audit directory as
the current handoff. The live Expo CLI QR is valid only while that preview
server is running.

## Current verified local gates

- Preview TypeScript passes.
- The SDK 54 companion passes **11/11 preview contracts** and mirrors every
  canonical route.
- The clean SDK 54 iOS Hermes export contains **5,015 modules**; its entry HBC
  bundle is **13.2 MB**.
- The canonical SDK 57 native app passes **178 suites / 1,071 tests**,
  TypeScript, **7 Maestro flows / 3 subflows / 33 selectors**, and Expo Doctor
  **20/20**.
- EAS packaging resolves all **5 shared packages** and the Argon2
  implementation.
- The canonical SDK 57 iOS export contains **5,206 modules**. Its
  `13,169,149`-byte JavaScript bundle has SHA-256
  `3B3E98A5EA7AFF08B96777E970A9D93A5D0913D3DFB3F2C444764F13CFF58B4F`.
- That canonical export contains **63 files / 26,532,025 bytes**. Its
  `4,045`-byte `metadata.json` has SHA-256
  `95B25B2CD6A2515869FF965FC18D96EB08E6DAF2EF71F421456F1B44825F5C3D`.

These results verify source, contracts, and local export packaging. They do not
claim that the current source has been opened or walked through on a physical
iPhone.

On this Windows PC, the easiest launcher is:

```powershell
& ".\asset-continuity-ios-preview\START_IPHONE_PREVIEW.cmd"
```

The `.cmd` wrapper starts the checked-in PowerShell helper without changing the
machine-wide PowerShell execution policy.

Follow the complete personal-device acceptance checklist in
[`IPHONE_TEST_GUIDE.md`](./IPHONE_TEST_GUIDE.md). It covers first-use
onboarding, capture, exact Place pins, Atlas, Place hierarchy/documents,
Evidence review, value history, archive/restore, privacy shielding, and
permission-denial recovery.

The equivalent package-level command is:

```powershell
npm run build:shared
npm run start:iphone --workspace=@alyr/ios-preview
```

If the local network blocks the connection:

```powershell
npm run build:shared
npm run start:tunnel --workspace=@alyr/ios-preview
```
