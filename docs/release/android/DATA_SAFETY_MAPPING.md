# Heldat Google Play Data safety mapping

Status: **build-6 static artifact reconciled; Play-delivered SDK and Console reconciliation required**

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

## Exact build-6 static evidence

The production AAB at source commit
`faa751a86d73021c2883bf1deb31f5b9ae8e8bee` passed all 69 static release
checks. This is artifact evidence, not physical-device, Play-delivered, backend,
or policy approval.

| Field | Verified value |
|---|---|
| Version | `0.1.0` / version code `6` |
| AAB | `D:\HeldatArtifacts\current\faa751a\heldat-android-production-faa751a-v0.1.0-build6.aab` |
| AAB SHA-256 | `FF6C1A9D4CDE60BFFB764646253A08877AA2872869DCDED512C950EAD4FAF12E` |
| Static summary | `D:\HeldatArtifacts\current\faa751a\build6-static-verification-summary.json` |
| Static summary SHA-256 | `985E78DD35FFF532646FC59BDF4D0C449E40F19A19ED6D583165D8FF529CE182` |
| Checks | `69/69`; no failed check and no secret-leak evidence file |

The AAB manifest contains exactly these 13 permissions:

```text
android.permission.ACCESS_COARSE_LOCATION
android.permission.ACCESS_FINE_LOCATION
android.permission.CAMERA
android.permission.INTERNET
android.permission.USE_BIOMETRIC
android.permission.USE_FINGERPRINT
android.permission.VIBRATE
android.permission.ACCESS_NETWORK_STATE
android.permission.RECEIVE_BOOT_COMPLETED
android.permission.POST_NOTIFICATIONS
android.permission.WAKE_LOCK
android.permission.FOREGROUND_SERVICE
app.heldat.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
```

The local notification components
`expo.modules.notifications.service.NotificationsService` and
`expo.modules.notifications.service.NotificationForwarderActivity` are
present. These eight reviewed remote Firebase/DataTransport components are
absent:

```text
com.google.android.datatransport.runtime.backends.TransportBackendDiscovery
com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService
com.google.firebase.components.ComponentDiscoveryService
com.google.firebase.messaging.FirebaseMessagingService
expo.modules.notifications.service.ExpoFirebaseMessagingService
com.google.android.datatransport.runtime.scheduling.jobscheduling.AlarmManagerSchedulerBroadcastReceiver
com.google.firebase.iid.FirebaseInstanceIdReceiver
com.google.firebase.provider.FirebaseInitProvider
```

Both the AAB and preview APK executable-payload scans reported zero denied
markers, including the reviewed ML Kit, barcode-detector, ZXing, and
`expo-camera` markers. The compiled dependency metadata still includes
`play-services-cloud-messaging.properties`, so the embedded SDK graph must be
reviewed in the current Play SDK Index even though the remote runtime entry
points above are absent.

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
  `expo-image-picker`; build 6 contains no reviewed `expo-camera`, ML Kit,
  barcode-detector, or ZXing executable-payload marker.
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

- [x] Inspect permissions and embedded SDK markers from build-6 signed AAB.
- [x] Confirm the build-6 merged manifest contains the local notification
      components but none of the eight reviewed remote Firebase Messaging or
      DataTransport runtime components.
- [x] Confirm build-6 executable payload contains no reviewed ML Kit,
      barcode-detector, ZXing, or `expo-camera` marker.
- [ ] Re-run the exact static checks if the submitted AAB differs by one byte,
      source commit, dependency graph, version, signing lineage, or build profile.
- [ ] Review the current Google Play SDK Index entry for every embedded SDK.
- [ ] Compare Maps SDK collection against its current official disclosure.
- [ ] Confirm product analytics still rejects names, amounts, coordinates,
      retrieval clues, filenames, and document contents.
- [ ] Confirm privacy policy categories and processors match this form.
- [ ] Exercise in-app and external account-deletion paths against the live
      backend.
- [ ] Save the Play Console preview/export with the release evidence.
- [ ] Record `[DATA_SAFETY_REVIEWER]` and `[REVIEW_DATE]`.

Google requires the Data safety form for apps on closed, open, or production
testing tracks; an app exclusively active on the internal-testing track is the
documented exemption. Complete and review the form before the first applicable
track promotion.
