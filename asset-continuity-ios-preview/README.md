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
  `C:\Users\akmal\OneDrive\Documents\alyr\docs\product-audit\2026-07-27-ios-preview\ALYR-EXPO-GO-QR.png`

The current companion passes TypeScript, **9/9** preview contracts, and
**41/41** route-parity checks. The post-restart LAN manifest returns HTTP 200,
reports `exposdk:54.0.0`, and launches from `192.168.1.32`. Its live iOS
development bundle returns HTTP 200, is `21,460,885` bytes, and has SHA-256
`5FCA65F9697C288D0CCDFA78AD7CCBB6443D1C3362BFFC635898005509FF67BB`.
The separate verified static SDK 54 Hermes export contains **4,802 modules**;
its `12,367,535`-byte bundle has SHA-256
`ECF92F6FC10B285AB22FD30868BCE395EB7A29A2C2DB72FFDF052C5E0A3E86E6`.
It remains a session-only preview for test information.

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
