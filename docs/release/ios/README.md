# ALYR iOS release materials

Status: **submission template, not a submission claim**

This directory contains a source-backed App Store and TestFlight handoff for
the current ALYR native application. It deliberately leaves operator,
credential, legal, URL, binary, and territory values as typed slots.

## Source of truth reviewed

- `asset-continuity-native/app.config.ts`
- `asset-continuity-native/eas.json`
- `asset-continuity-native/src/components/LegalDocumentScreen.tsx`
- `asset-continuity-native/src/i18n/coreJourneyCopy.ts`
- `asset-continuity-native/src/i18n/captureCopy.ts`
- `asset-continuity-native/src/i18n/portfolioCopy.ts`
- `asset-continuity-native/src/analytics/`
- `asset-continuity-native/IOS_SIGNED_TEST_READINESS.md`

Configuration represented here:

| Field | Current source value |
|---|---|
| Product name | ALYR |
| Version | `0.1.0` |
| iOS bundle identifier | `com.alyr.continuity` |
| iPhone-only | Yes (`supportsTablet: false`) |
| Primary in-app languages | English and Arabic |
| Tracking declared | No |
| Non-exempt encryption declared | No (`usesNonExemptEncryption: false`) |

The submitted binary and App Store Connect record remain authoritative. Repeat
the privacy, encryption, metadata, and feature review against that exact build.

## Files

1. [`APP_STORE_METADATA.md`](./APP_STORE_METADATA.md) - product copy, keywords,
   promotional text, and URL slots.
2. [`APP_PRIVACY_MAPPING.md`](./APP_PRIVACY_MAPPING.md) - App Privacy
   questionnaire worksheet aligned to the checked-in iOS privacy manifest.
3. [`APP_REVIEW_AND_COMPLIANCE.md`](./APP_REVIEW_AND_COMPLIANCE.md) - paste-ready
   App Review notes, provisional age-rating assumptions, and export-compliance
   note.
4. [`SCREENSHOT_SHOT_LIST.md`](./SCREENSHOT_SHOT_LIST.md) - truthful screenshot
   story, capture states, and privacy controls.
5. [`TESTFLIGHT_TESTER_INSTRUCTIONS.md`](./TESTFLIGHT_TESTER_INSTRUCTIONS.md) -
   internal and external beta instructions with result reporting.
6. [`REMAINING_VALUES_CHECKLIST.md`](./REMAINING_VALUES_CHECKLIST.md) - values and
   release evidence that still need to be supplied.

## Typed-slot convention

Text in square brackets, such as `[PRIVACY_POLICY_URL_HTTPS]`, is intentionally
unresolved. Replace it only with a verified release value. Do not submit any
square-bracketed slot to Apple.
