# ALYR iOS Simulator Build Verification

**Result: PASS**
Generated: `2026-07-28T07:41:20.048881Z`

## Build identity

| Field | Verified value |
|---|---|
| EAS build | `4d4d77bf-9e68-4aff-997c-51c9a5c5c388` |
| Status | `FINISHED` |
| Git commit | `a2133a37e387ff4aafc07c43b183ca733f201cce` |
| Target | iOS Simulator (`iPhoneSimulator`) |
| Profile | `development-simulator` |
| SDK / app / build | `57.0.0` / `0.1.0` / `1` |
| Completed | `2026-07-28T07:38:24.253Z` |
| EAS artifact expiry | `2026-08-11T07:30:42.397Z` |

## Downloaded artifact

- Archive: `C:\Users\akmal\OneDrive\Documents\alyr\docs\product-audit\2026-07-28-ios-simulator-a2133a3\ALYR-ios-simulator-a2133a3.tar.gz`
- Size: **58,277,511 bytes** (55.58 MiB)
- SHA-256: `748ae713dab62b65ed37dfed0b84cf1ad383dbc9f80b307cea95197d1477cb36`
- Archive entries: **146**
- Root bundle: `ALYR.app/` present
- Permanent listing: `C:\Users\akmal\OneDrive\Documents\alyr\docs\product-audit\2026-07-28-ios-simulator-a2133a3\archive-contents.txt`

## Native bundle evidence

- `CFBundleDisplayName`: **ALYR**
- Bundle identifier: `com.alyr.continuity`
- Minimum iOS: `16.4`
- Deep-link schemes: `alyr`, `com.alyr.continuity`, `exp+alyr-asset-continuity`
- Camera, selected-photo, location and Face ID purpose strings are embedded.
- `PrivacyInfo.xcprivacy`, `Expo.plist`, `EXConstants.bundle/app.config`, and app `_CodeSignature/CodeResources` are present.
- EAS Update is embedded for channel `development`, runtime `0.1.0`.

### Configured native plugins

`expo-router`, `expo-background-task`, local-notifications-only config, `expo-sqlite` with **SQLCipher enabled**, `expo-secure-store`, `expo-camera`, `expo-image-picker`, `expo-location`, and `expo-local-authentication`.

### Compiled static-module evidence

The main native dylib contains module/symbol evidence for: expoSQLite, sqlcipher, sqliteKeyApi, expoSecureStore, expoLocalAuthentication, expoImagePicker, expoDocumentPicker, expoBackgroundTask, expoNotifications, expoTaskManager, expoCamera, expoLocation. This includes `SQLCipher` and `sqlite3_key`.

### Embedded frameworks

ExpoCamera.framework, ExpoFileSystem.framework, ExpoFont.framework, ExpoLocation.framework, ExpoModulesCore.framework, ExpoModulesJSI.framework, ExpoModulesWorklets.framework, hermesvm.framework, React.framework, ReactNativeDependencies.framework, RNReanimated.framework, RNWorklets.framework

All **12/12** embedded frameworks contain `_CodeSignature/CodeResources`. The app bundle also contains `_CodeSignature/CodeResources`.

## Interpretation

This artifact proves that commit `a2133a3` produced a coherent ALYR iOS Simulator development app with its expected native configuration and compiled capture, location, secure storage, biometric, database, background-task, notification and document/photo modules. It is intended for an iOS Simulator. Physical-iPhone installation uses a device-signed build or the separate Expo Go preview.

> Signature verification here confirms packaged signature-resource records. Full cryptographic `codesign --verify` is a macOS-only validation step.
