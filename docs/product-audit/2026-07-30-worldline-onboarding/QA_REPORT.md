# Worldline onboarding — implementation and QA report

Date: 2026-07-30
Target: Expo / React Native, iOS and Android
Selected direction: Option 3 — Worldline

## Delivered experience

- Four-step first-run journey: Promise → Worldline globe → Proof chain → Start.
- Animated native globe with geographic asset signals, place focus, and reduced-motion behavior.
- Premium Carbon Volt visual language with one restrained cyan-to-violet action gradient.
- English and Arabic RTL copy, layout mirroring, accessible labels, focus treatment, and large-text-safe scrolling.
- Once-per-install intro state stored through Expo SQLite KV on native and local storage on web.
- Existing authentication, sample workspace, invitation, and workspace restoration logic preserved.
- First-run actions route into the existing sample, sign-in, and account-creation flows.
- The future product name is intentionally absent from the new onboarding so naming can change independently.

## Functional verification

| Check | Result |
|---|---|
| TypeScript | Passed |
| Jest | 191 suites / 1,194 tests passed |
| Maestro contract validation | 10 flows / 5 subflows / 57 selector contracts passed |
| Expo Doctor | 20/20 checks passed |
| Git whitespace validation | Passed |
| Unified local web preview | HTTP 200 at `http://localhost:8083/` |
| iOS Metro bundle | HTTP 200, 22,658,709 bytes, SHA-256 `97e3171f6bd5087f78402d74ea52d2e7883266a765580736f8f3fb1dfa8465d9` |
| Android Metro bundle | HTTP 200, 22,974,359 bytes, SHA-256 `1d538b2774b2b5d4f26a6a4a12c810a25ce9739a6bf0e9bc03243599053f24ee` |
| Expo Go manifest | SDK 57.0.0, runtime 0.1.0, LAN host `192.168.1.3:8083` |
| Standalone Android APK | Release build passed; signature, alignment, CRC, manifest, bundle, and arm64 ABI verified |

Machine-readable native verification is stored in
`native-bundle-verification.json`.

## Visual review

Reviewed at an iPhone-class 390 × 844 viewport:

- `01-promise-390x844.png`
- `02-globe-390x844.png`
- `03-proof-390x844.png`
- `04-start-390x844.png`
- `06-proof-ar-390x844.png`

The implementation and selected reference were inspected together in
`comparison-reference-vs-globe.png`.

Compact layout was also exercised at 320 × 568:

- Root viewport: 320 × 568.
- Scroll viewport: 482 px high with 677 px of content.
- Globe: 256 px wide inside a 280 px content column.
- Primary actions: 280 px wide.
- The CTA auto-scrolls into view and advances the scene.

Two malformed compact PNG exports from the browser screenshot backend are not
part of the signed-off review; the compact DOM geometry and interaction were
verified directly.

## Runtime review

- No blocking browser console errors.
- Onboarding-specific transform and pointer-event warnings were removed.
- Remaining web-only warnings are upstream/app-wide notices about legacy shadow
  props and Expo Notifications browser support.
- Expo Go QR decodes to `exp://192.168.1.3:8083`.

## Verdict

Worldline is ready for personal walkthrough in the local web preview and Expo
Go on the same Wi-Fi network. Store distribution binaries are a later release
step; this validation covers the shared native source and live iOS/Android Metro
bundles.

The standalone personal-test APK is available at
`C:\Users\akmal\OneDrive\Documents\alyr\output\android\Worldline-Android-Test-arm64-v0.1.0.apk`.
Its SHA-256 is
`1698c66c92f21b566625b4bff4bfea2c46f13021b0587ec1dd4c231dfd57c24c`.
