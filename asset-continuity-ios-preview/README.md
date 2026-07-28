# ALYR iPhone Preview

This is a zero-cost, session-only Expo Go companion for testing the canonical
ALYR native screens on a physical iPhone from Windows.

- It re-exports the routes from `asset-continuity-native`.
- It intentionally uses Expo SDK 54 while the signed application remains on
  SDK 57, because the current App Store Expo Go client supports SDK 54.
- It overrides persistence and attachments with memory-only adapters.
- It must not be used for sensitive or durable information.
- SQLCipher, Face ID, background work, signed permission configuration, and
  production recovery are tested only in the signed development build.

`expo-doctor` reports the second SDK and the strict Metro resolver as
duplicates/customization. Those are intentional in this companion: Metro is
locked to its local SDK 54 modules, while the canonical app remains on SDK 57.
The automated acceptance gate is a successful SDK 54 iOS Hermes export. The
physical Expo Go walkthrough is a separate personal-device check and is not
claimed by the repository evidence.

## Start on the same Wi-Fi

```powershell
npm run dev:ios-preview
```

Install Expo Go on the iPhone, allow Local Network access, and scan the QR code
shown by Expo CLI. Use the sample workspace first.

- Current LAN URL: `exp://192.168.1.32:8081`
- Current QR:
  `C:\Users\akmal\OneDrive\Documents\alyr\docs\product-audit\2026-07-28-iphone-preview-fd95bf9\ALYR-EXPO-GO-QR-fd95bf9.png`

The current companion reflects canonical app commit
`fd95bf9707c1d7b92b611891a28ec080578b573b`. It passes TypeScript and
**10/10** preview contracts while mirroring every canonical route. The LAN
manifest returns HTTP 200, reports `exposdk:54.0.0`, and launches from
`192.168.1.32`. Its live iOS development bundle returns HTTP 200, is
`21,822,006` bytes, and has SHA-256
`FBC50341510402049E8AD0414F8ED636D05C3AE1ABAA3C0D180078BC9BBC5661`.
The separate verified static SDK 54 Hermes export contains **4,825 modules**;
its `12,581,869`-byte bundle has SHA-256
`E4D099EF9117133DDCCD5B5ECD139D6E1ED1E70CECD0AFD3FB6016D516A2F78A`.
The QR was independently decoded back to the exact Expo URL. It remains a
session-only preview for test information.

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
