# ALYR local Maestro journeys

This workspace exercises the installed ALYR binary (`com.alyr.continuity`) through
the same accessibility tree used by VoiceOver and TalkBack. It does not add a
test SDK to the application.

The suite is pinned by release evidence to Maestro CLI `2.7.0` on Java
`17.0.19`. Anonymous Maestro CLI analytics are disabled in the local ALYR
tooling environment.

## Coverage

| Flow | Product contract |
| --- | --- |
| `00-auth-entry-smoke.yaml` | Welcome to Create account to Sign in to Forgot password |
| `01-sample-first-passport.yaml` | Fresh install to sample workspace to all four Quick Passport steps to saved Passport to Today |
| `02-returning-today-portfolio-atlas.yaml` | Process restart to Today to Portfolio to Today to Atlas Globe/List |
| `03-local-first-passport-restart.yaml` | Network-independent sample capture to save to process restart to durable Asset list |
| `04-arabic-rtl-smoke.yaml` | English to Arabic selection to Arabic Welcome to Arabic Today |

The Quick Passport flow intentionally chooses **I don't know yet** and skips media.
That makes the local transaction deterministic while camera, document picker,
GPS, permission recovery, and VoiceOver remain real-device acceptance cases.

## Run locally

1. Install a native development or simulator build whose bundle/package ID is
   `com.alyr.continuity`.
2. Start an Android emulator/device, or an iOS Simulator on macOS.
3. From the repository root:

   ```bash
   npm run test:e2e:static -w @alyr/native
   maestro test asset-continuity-native/.maestro
   ```

Run one journey while iterating:

```bash
maestro test asset-continuity-native/.maestro/flows/01-sample-first-passport.yaml
```

The suite targets the standalone/EAS build. Expo Go uses the Expo container
identifier and must be opened with its `exp://` URL, so it is intentionally not
the release-gate target for these flows.

The sample flows are also a regression gate for the configured Supabase build:
a signed-out cloud runtime receives only the isolated local sample vault, while
sign-in remounts the boundary onto a different household scope. The focused
provider regression is:

```bash
npm test -w @alyr/native -- --runInBand tests/session-vault-boundary.test.tsx
```

## Offline and iOS notes

- `setAirplaneMode` physically changes connectivity on Android and is restored by
  an `onFlowComplete` hook even when the flow fails.
- iOS Simulator does not expose airplane-mode control. On iOS, the same flow
  still proves that ALYR's local-only sample transaction survives a process
  restart, while an Android run provides the hard network-disconnection proof.
- Maestro local iOS execution targets Simulator builds; physical-iPhone camera,
  location, privacy shielding, Dynamic Type, and VoiceOver stay in the signed
  device checklist.

Reference: [Maestro React Native support](https://docs.maestro.dev/platform-support/react-native)
and [airplane-mode behavior](https://docs.maestro.dev/reference/commands-available/setairplanemode).
