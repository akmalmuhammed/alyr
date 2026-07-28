# ALYR App Privacy questionnaire mapping

Status: **source-aligned worksheet; final binary reconciliation required**

This mapping mirrors `ios.privacyManifests` in
`asset-continuity-native/app.config.ts`. All 11 declared collected-data types
are linked to the user, are not used for tracking, and use the purpose shown
below.

## App Store Connect data mapping

| App Store family | Exact Apple manifest data type | Collected | Linked to user | Used for tracking | Purpose | Current product use |
|---|---|---:|---:|---:|---|---|
| Contact Info | `NSPrivacyCollectedDataTypeEmailAddress` (Email Address) | Yes | Yes | No | App Functionality | Account access, confirmation, and household membership |
| Contact Info | `NSPrivacyCollectedDataTypePhysicalAddress` (Physical Address) | Yes | Yes | No | App Functionality | User-entered Place/property address details |
| Identifiers | `NSPrivacyCollectedDataTypeUserID` (User ID) | Yes | Yes | No | App Functionality | Authenticated account and household authorization |
| Identifiers | `NSPrivacyCollectedDataTypeDeviceID` (Device ID) | Yes | Yes | No | App Functionality | Stable installation identity and sync safety |
| Location | `NSPrivacyCollectedDataTypePreciseLocation` (Precise Location) | Yes | Yes | No | App Functionality | User-requested exact property/item placement |
| Location | `NSPrivacyCollectedDataTypeCoarseLocation` (Coarse Location) | Yes | Yes | No | App Functionality | User-requested approximate/locality placement |
| Financial Info | `NSPrivacyCollectedDataTypeOtherFinancialInfo` (Other Financial Info) | Yes | Yes | No | App Functionality | User-entered dated asset/property values and liability balances |
| User Content | `NSPrivacyCollectedDataTypePhotosorVideos` (Photos or Videos) | Yes | Yes | No | App Functionality | Photos the user selects or captures for a Passport or proof |
| User Content | `NSPrivacyCollectedDataTypeOtherUserContent` (Other User Content) | Yes | Yes | No | App Functionality | Item, Place, retrieval, note, and document content supplied by the user |
| Diagnostics | `NSPrivacyCollectedDataTypeOtherDiagnosticData` (Other Diagnostic Data) | Yes | Yes | No | App Functionality | Sync/upload state used to diagnose and reconcile records |
| Usage Data | `NSPrivacyCollectedDataTypeProductInteraction` (Product Interaction) | Yes | Yes | No | Analytics | Allow-listed first-party activation, retention, and reliability events |

## Questionnaire answer summary

Use this only after confirming the submitted binary still matches the source:

- **Data collected:** Yes
- **Data linked to the user:** Yes, for every category above
- **Data used to track the user:** No
- **Tracking domains:** None declared
- **Third-party advertising:** None represented in the current source
- **Cross-app tracking:** None represented in the current source
- **Analytics purpose:** Product Interaction only
- **App Functionality purpose:** All other declared categories

The current in-app privacy notice says that product-interaction event payloads
exclude asset names, recorded amounts, addresses, coordinates, retrieval clues,
filenames, and document contents. Events remain declared as linked because the
signed pilot associates them with the authenticated account and household for
first-party analysis.

## Data-purpose detail for the public privacy policy

The public policy at `[PRIVACY_POLICY_URL_HTTPS]` must reconcile, at minimum:

1. What is stored locally and what may be synchronized.
2. How email, account, household, and installation identifiers are used.
3. That location is requested when the user chooses to place something.
4. That household records may contain physical addresses, precise/coarse
   locations, user-entered values and liabilities, selected photos, documents,
   notes, and retrieval clues.
5. How owner/editor/viewer roles affect access.
6. Product-interaction analytics purpose and payload exclusions.
7. Retention, exports, Recovery Kits, account deletion, and household deletion.
8. Service providers and data-processing locations:
   `[FINAL_PROCESSOR_AND_TRANSFER_DISCLOSURE]`.
9. Operator identity and privacy contact:
   `[OPERATOR_LEGAL_NAME_AND_PRIVACY_CONTACT]`.

Do not state that the cloud service is end-to-end encrypted. Current source
describes encrypted local storage, TLS/provider protection for cloud traffic,
and no end-to-end-encryption claim.

## Required-reason APIs

These are privacy-manifest declarations, not additional collected-data
questionnaire categories.

| Exact API category | Declared reasons |
|---|---|
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `3B52.1` |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` |

## Final reconciliation procedure

- [ ] Generate or inspect `PrivacyInfo.xcprivacy` from the exact production
      archive.
- [ ] Compare all collected-data rows with App Store Connect.
- [ ] Review every production SDK for additional data collection or tracking.
- [ ] Confirm analytics still rejects prohibited private fields.
- [ ] Confirm the public policy uses the same purposes and categories.
- [ ] Confirm account deletion behavior and retention text against the live
      backend.
- [ ] Have `[PRIVACY_REVIEWER]` approve the mapping on `[PRIVACY_REVIEW_DATE]`.
