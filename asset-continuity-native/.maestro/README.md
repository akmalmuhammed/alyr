# ALYR local Maestro journeys

This workspace exercises the installed ALYR binary (`app.heldat.mobile`) through
the same accessibility tree used by VoiceOver and TalkBack. It does not add a
test SDK to the application.

The suite is pinned by release evidence to Maestro CLI `2.7.0` on Java
`17.0.19`. Anonymous Maestro CLI analytics are disabled in the local ALYR
tooling environment.

## Coverage

| Flow | Product contract |
| --- | --- |
| `00-auth-entry-smoke.yaml` | Welcome to Create account to Sign in to Forgot password |
| `01-sample-first-passport.yaml` | Fresh install to sample workspace to all four Quick Passport steps, the truthful **Passport started** receipt and Today |
| `02-returning-today-portfolio-atlas.yaml` | Process restart to Today to recorded net position and liabilities to Atlas Globe/List |
| `03-local-first-passport-restart.yaml` | Network-independent sample capture to save to process restart to durable Asset list |
| `04-arabic-rtl-smoke.yaml` | English to Arabic selection to Arabic Welcome, Today, net position and liability form |
| `05-liability-lifecycle.yaml` | Add a dated liability, update its balance history and delete with explicit confirmation |
| `06-net-position-offline-restart.yaml` | Add and update a liability offline, restart the process and verify the durable record |
| `07-native-signup-confirmation.yaml` | Installed native-secure signup with an unused early-access invitation to the live email-confirmation boundary |
| `08-native-preconfirmed-activation.yaml` | Installed native-secure sign-in with a preconfirmed empty account to private record, device verification, first Passport and Today |

The Quick Passport flow intentionally chooses **I don't know yet** and skips media.
That makes the local transaction deterministic while camera, document picker,
GPS, permission recovery, and VoiceOver remain real-device acceptance cases.
Liability journeys use stable accessibility identifiers for every financial
control and keep currencies separate. They do not assert a combined total or
rely on tap coordinates.

## Run locally

1. Install a native development or simulator build whose bundle/package ID is
   `app.heldat.mobile`.
2. Start an Android emulator/device, or an iOS Simulator on macOS.
3. From the repository root:

   ```bash
   npm run test:e2e:static -w @alyr/native
   maestro test --exclude-tags=native-secure asset-continuity-native/.maestro
   ```

Run one journey while iterating:

```bash
maestro test asset-continuity-native/.maestro/flows/01-sample-first-passport.yaml
```

The suite targets the standalone/EAS build. Expo Go uses the Expo container
identifier and must be opened with its `exp://` URL, so it is intentionally not
the release-gate target for these flows.

## Native-secure account journeys

The two `native-secure` journeys exercise the configured Supabase runtime. They
never use preview-only actions and contain no committed account credentials.
Pass each required value with Maestro `-e` parameters or a secret-backed runner.

`07-native-signup-confirmation.yaml` requires:

- `ALYR_E2E_SIGNUP_EMAIL`: a fresh inbox address not already registered.
- `ALYR_E2E_PASSWORD`: a test password satisfying the current account policy.
- `ALYR_E2E_EARLY_ACCESS_CODE`: an unused code issued for that exact email.

It consumes the invitation, creates the account and stops only after the
installed app reaches the live email-confirmation screen:

```bash
maestro test -e ALYR_E2E_SIGNUP_EMAIL="<fresh-email>" -e ALYR_E2E_PASSWORD="<test-password>" -e ALYR_E2E_EARLY_ACCESS_CODE="<single-use-code>" asset-continuity-native/.maestro/flows/07-native-signup-confirmation.yaml
```

`08-native-preconfirmed-activation.yaml` requires:

- `ALYR_E2E_PRECONFIRMED_EMAIL`: a confirmed account with no household,
  membership, onboarding completion or pending invitation.
- `ALYR_E2E_PASSWORD`: that account's test password.
- An emulator/simulator with a device passcode or enrolled biometric.

The account is no longer empty after the journey, so reset or replace the
fixture before another run. After Maestro taps **Verify and add my first item**,
approve the real operating-system verification prompt within 60 seconds. On a
simulator, trigger its matching biometric event; on a manually operated device,
use the configured biometric or passcode.

```bash
maestro test -e ALYR_E2E_PRECONFIRMED_EMAIL="<confirmed-empty-account>" -e ALYR_E2E_PASSWORD="<test-password>" asset-continuity-native/.maestro/flows/08-native-preconfirmed-activation.yaml
```

Run the complete installed-app suite only after supplying all four external
parameters and preparing both single-use fixtures:

```bash
maestro test -e ALYR_E2E_SIGNUP_EMAIL="<fresh-email>" -e ALYR_E2E_PRECONFIRMED_EMAIL="<confirmed-empty-account>" -e ALYR_E2E_PASSWORD="<test-password>" -e ALYR_E2E_EARLY_ACCESS_CODE="<single-use-code>" asset-continuity-native/.maestro
```

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
