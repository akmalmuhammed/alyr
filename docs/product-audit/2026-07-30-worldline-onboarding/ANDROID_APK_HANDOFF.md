# Worldline Android test APK

Date: 2026-07-31
Purpose: personal Android device walkthrough
Product name: still a placeholder in the current native configuration

## Download artifact

`C:\Users\akmal\OneDrive\Documents\alyr\output\android\Worldline-Android-Test-arm64-v0.1.0.apk`

| Property | Verified value |
|---|---|
| Size | 86,617,287 bytes |
| SHA-256 | `1698c66c92f21b566625b4bff4bfea2c46f13021b0587ec1dd4c231dfd57c24c` |
| Package | `com.alyr.continuity` |
| Current launcher label | `ALYR` |
| Version | `0.1.0` (`versionCode` 1) |
| Minimum Android | API 24 / Android 7.0 |
| Target / compile SDK | API 36 |
| Native architecture | `arm64-v8a` |
| Launch activity | `com.alyr.continuity.MainActivity` |
| Bundle | Standalone `assets/index.android.bundle` |
| Signing | Local Android debug certificate, APK Signature Scheme v2 |

The launcher label remains the current placeholder because the product naming
decision is still open. The new onboarding itself does not depend on that name.

## Verification performed

- Gradle `app:assembleRelease`: **BUILD SUCCESSFUL**.
- APK signature: **verified** with Android Build Tools 36 `apksigner`.
- APK alignment, including 16 KiB page alignment check: **verified**.
- ZIP integrity: **1,395 entries, no CRC failure**.
- Manifest and package metadata: **decoded and verified**.
- Native code: **arm64-v8a only**.
- Worldline proof in the embedded production bundle:
  - `Know what you have. Know where it is.`
  - `Show me how`
  - `ONE CONNECTED RECORD`
- `RECORD_AUDIO` is absent from the packaged permission list.
- No Android device was attached to the Windows host, so the physical-device
  walkthrough is the next verification step.

## Install

1. Download or transfer the APK to an arm64 Android phone.
2. Open the APK from Files or Downloads.
3. If Android asks, allow that Files/browser app to install unknown apps.
4. Tap **Install**, then **Open**.

If another `com.alyr.continuity` test build is already installed with a
different certificate, Android may report an incompatible update. Uninstall
that older test build and install this APK again. Uninstalling clears that
build's device-local test data.

This is a standalone test build: Expo Go and a Metro server are not required
after installation. The local debug certificate is for personal testing; a
pilot/store build uses the managed release keystore.

## Evidence files

- `apk-signature-verification.log`
- `apk-zipalign-verification.log`
- `apk-badging.txt`
- `apk-permissions.txt`
- `apk-manifest-xmltree.txt`
- `apk-structure-verification.json`
- `apk-local-gradle-arm64-shortcxx.log`
