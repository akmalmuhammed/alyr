# ALYR iPhone preview — final visual replay

Validated on 27 July 2026 against the live Expo Go companion.

## Viewports and journeys

| Artifact | Viewport | Verified state |
|---|---:|---|
| `01-welcome-en-390x844.png` | 390 × 844 | English Welcome and primary choices |
| `02-sign-in-en-320x568.png` | 320 × 568 | Compact sign-in above the fold |
| `02b-sign-in-scrolled-en-320x568.png` | 320 × 568 | Password, recovery and both actions remain reachable |
| `03-password-recovery-en-320x568.png` | 320 × 568 | Recovery disclosure and actions |
| `04-today-sample-en-390x844.png` | 390 × 844 | Today, next action, Portfolio and Places |
| `05-welcome-ar-rtl-390x844.png` | 390 × 844 | Arabic Welcome and mirrored layout |
| `06-atlas-globe-ar-rtl-390x844.png` | 390 × 844 | Arabic Atlas globe and directional controls |
| `07-family-permissions-ar-rtl-390x844.png` | 390 × 844 | Arabic household roles |
| `08-family-invite-builder-en-390x844.png` | 390 × 844 | Owner role and expiry selection |
| `09-invite-code-result-en-390x844.png` | 390 × 844 | One-time-code disclosure and share action |

## Corrections made during replay

- Added the Expo SDK 54-matched `react-dom` dependency so browser-based visual
  validation renders with the same React version.
- Preserved native RTL direction while removing invalid web style warnings.
- Applied decorative accessibility props per platform instead of leaking
  native-only props into the web renderer.
- Added a stable root fallback when capture is opened without a back-stack
  entry.

## Final result

- Clean Welcome → sample Today → Atlas → Family replay: no console errors.
- Clean compact Sign in and Recovery replay: no console errors.
- Owner onboarding → first Passport → Vault → Family invite → one-time code
  completed in the session-only companion.
- No visible horizontal overflow at the tested viewports.
