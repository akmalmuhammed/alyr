# Heldat Google Play Data safety mapping

Status: **conservative source-aligned worksheet; final AAB/SDK reconciliation required**

Google defines collection as transmitting data off the device, including
transmission performed by an SDK. The current mobile client syncs to a private
Supabase project and includes Google Maps SDK behavior. The form must therefore
describe both Heldat's own processing and the latest submitted SDK behavior.

## Top-level answers

| Question | Working answer |
|---|---|
| Does the app collect or share required user data types? | Yes |
| Is user data encrypted in transit? | Yes; HTTPS/TLS is required |
| Can users request data deletion? | Yes, in app and at `https://heldat.app/delete-account/` |
| Does the app independently verify security practices? | No; do not claim an external audit |
| Is data used for advertising or cross-app tracking? | No |
| Does the app sell user data? | No |

Supabase is used as a contracted processor for app functionality. Confirm the
final service agreements before selecting whether a transfer counts as
"sharing" under Google's service-provider exception. Google Maps SDK data is
listed separately and should be declared conservatively where Google processes
it to maintain and improve Google services.

## Heldat-controlled data

| Play category / type | Collected | Shared | Required or optional | Purpose |
|---|---:|---:|---|---|
| Personal info — Email address | Yes | No, processor transfer only | Required for email accounts; Google identity optional on Android | Account management, authentication, household access |
| Personal info — User IDs | Yes | No, processor transfer only | Required when signed in | Account management, authorization, sync |
| Personal info — Address | Yes | No, processor transfer only | Optional | User-entered Place/property record |
| Financial info — Other financial info | Yes | No, processor transfer only | Optional | User-entered dated values and liabilities |
| Location — Approximate location | Yes | No, processor transfer only | Optional, user initiated | Place/item placement |
| Location — Precise location | Yes | No, processor transfer only | Optional, user initiated | Exact Place/item placement |
| Photos and videos — Photos | Yes | No, processor transfer only | Optional, user initiated | Asset image and evidence |
| Files and docs — Files and docs | Yes | No, processor transfer only | Optional, user initiated | Receipts, deeds, certificates, and other proof |
| App activity — App interactions | Yes | No, processor transfer only | Optional/automatic after signed-in use | Allow-listed first-party activation and reliability analytics |
| App info and performance — Diagnostics | Yes | No, processor transfer only | Automatic when sync operates | Sync/upload diagnosis and reconciliation |
| Device or other IDs — Device or other IDs | Yes | No, processor transfer only | Required for signed sync | Stable installation identity and idempotent sync |
| Other user-generated content | Yes | No, processor transfer only | Optional | Names, categories, notes, retrieval clues, Places, and household records |

For optional data, the user chooses the feature that sends it. Do not mark a
field as ephemeral: cloud-synced records persist until the user deletes them or
the documented retention process applies.

## Google Maps SDK for Android

Google's current Maps SDK disclosure says the SDK automatically collects
request/device metadata, crash metrics, IP address, and a Maps-specific
pseudonymous identifier, and may collect map panning/zooming events. Reconcile
the final SDK version and conservatively consider these Play categories:

| Maps SDK signal | Candidate Play type | Handling to declare |
|---|---|---|
| IP address | Approximate location | Collected by the SDK for service operation/improvement |
| Device and request metadata | Device or other IDs; App info and performance | Collected by the SDK |
| Maps SDK pseudonymous identifier | Device or other IDs | Collected by the SDK |
| Stack traces and crash metrics | Crash logs; Diagnostics | Collected by the SDK |
| Pan and zoom interactions | App interactions | Collected depending on map use |

Whether these transfers are marked as "shared" is a final policy/legal answer,
not an engineering assumption. Use the latest official Maps disclosure when
completing Play Console.

## Permissions and SDK boundary

- Camera: requested only when the user captures an asset or proof image.
- Fine/coarse location: requested only when the user asks to place a record.
- Photo/document picker: exposes only user-selected content.
- Broad external-storage and media-library permissions: excluded from the
  production manifest; imports stay on the system-picker boundary.
- Biometrics: used locally to unlock the device vault; biometric templates are
  not transmitted by Heldat.
- Microphone/audio recording: excluded from the production manifest.
- Exact-alarm access: excluded from the production manifest. A quiet review
  reminder is not alarm-clock/calendar core functionality and must tolerate
  operating-system delivery windows.
- Barcode scanning: excluded. Heldat captures photos through
  `expo-image-picker`; the unused `expo-camera` package and its ML Kit barcode
  dependency must be absent from the next clean release artifact.
- Local notifications: `expo-notifications` remains the scheduling port. Its
  Android library compiles Firebase Messaging, but production removes the
  Firebase auto-init, component-discovery, transport, receiver, and remote
  messaging service entries. Heldat does not request a push token or register
  a remote-notification task. Reconcile the compiled SDK against the current
  Play SDK Index even when those runtime entry points are absent.
- Contacts, SMS, call logs, calendar, health data, and advertising ID: not
  represented in the current release source.
- Local encrypted SQLite and attachment files remain on the device until the
  user enables/succeeds at cloud sync; on-device-only handling is not Play
  "collection."

## Final reconciliation

- [ ] Inspect permissions and embedded SDKs from the exact signed AAB.
- [ ] Confirm the final merged manifest contains local notification components
      but no Firebase Messaging receiver/service/provider or data-transport
      scheduler entry point.
- [ ] Confirm no ML Kit barcode/code-scanner package or manifest component is
      present in the final clean-install AAB.
- [ ] Review the current Google Play SDK Index entry for every embedded SDK.
- [ ] Compare Maps SDK collection against its current official disclosure.
- [ ] Confirm product analytics still rejects names, amounts, coordinates,
      retrieval clues, filenames, and document contents.
- [ ] Confirm privacy policy categories and processors match this form.
- [ ] Exercise in-app and external account-deletion paths against the live
      backend.
- [ ] Save the Play Console preview/export with the release evidence.
- [ ] Record `[DATA_SAFETY_REVIEWER]` and `[REVIEW_DATE]`.
