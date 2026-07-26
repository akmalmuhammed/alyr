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
The acceptance gate is a successful SDK 54 iOS Hermes export plus a physical
Expo Go walkthrough.

## Start on the same Wi-Fi

```powershell
npm run dev:ios-preview
```

Install Expo Go on the iPhone, allow Local Network access, and scan the QR code
shown by Expo CLI. Use the sample workspace first.

If the local network blocks the connection:

```powershell
npm run build:shared
npm run start:tunnel --workspace=@alyr/ios-preview
```
