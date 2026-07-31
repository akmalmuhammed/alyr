# Heldat App Review and compliance notes

Status: **paste-ready structure with unresolved release slots**

## App Review notes template

Replace every slot before submission.

```text
Heldat is a private household record and retrieval app for items, Places, proof, and user-entered dated values.

REVIEW ACCESS
- There is no purchase or paywall in this build.
- To inspect a local sample without an account, launch Heldat and tap "Explore sample". The sample persists in encrypted device-local storage across restart/force-stop; it has no cloud account, cloud sync, or cloud-backup claim.
- To review signed personal-household features, use:
  Email: [APP_REVIEW_EMAIL]
  Password: [APP_REVIEW_PASSWORD]
  Household: [APP_REVIEW_HOUSEHOLD_NAME]
- This account is already confirmed: [YES_OR_NO_MUST_BE_YES_FOR_SUBMISSION]
- The review account remains active through: [REVIEW_ACCOUNT_VALID_UNTIL]
- A fresh signup is limited by an early access code. The provided review account does not require a code to sign in.
- If Apple specifically needs to test new-account creation, use these self-contained instructions: [FRESH_SIGNUP_REVIEW_INSTRUCTIONS_OR_NOT_APPLICABLE].

KEY PATHS
1. Today: the next incomplete record and register readiness.
2. Assets: Items and Places, filters, search, and Passport detail.
3. Add first record: Details -> Location -> Proof -> Review.
4. Portfolio: user-entered dated asset/property values and liabilities; currencies remain separate.
5. Atlas: geographic Place overview plus an accessible Place list.
6. Family: household roles and invitations.
7. Vault: proof, Recovery Kit, readable export, privacy, support, and sync diagnostics.
8. Account deletion: Vault -> Settings -> Account -> Delete account and data.

PERMISSIONS
- Camera and selected-photo access are requested only after the reviewer chooses to add a photo or supporting material.
- in-use location is requested only after the reviewer chooses accurate placement.
- Face ID/device authentication protects access to the signed local household vault. The exact device prompt is controlled by iOS.
- Background location, microphone recording, barcode scanning, advertising, and remote-push delivery are not part of this build.

PRODUCT BOUNDARY
Heldat is not an appraisal, insurance policy, title register, password manager, bank balance, live valuation, or complete statement of net worth. Recorded values and liabilities are entered by the user.

REVIEW CONTACT
[APP_REVIEW_CONTACT_NAME]
[APP_REVIEW_CONTACT_EMAIL]
[APP_REVIEW_CONTACT_PHONE_WITH_COUNTRY_CODE]
```

## Review-account acceptance gate

The review credentials must be tested on a clean production build immediately
before submission.

- [ ] Account is confirmed and not rate-limited.
- [ ] Account is not dependent on access to the operator's email inbox.
- [ ] Password does not expire during review.
- [ ] Household contains only non-personal review fixtures.
- [ ] At least one Item, owned property, liability, proof file, Place, room, and
      incomplete record are available if those screens are described.
- [ ] Camera, document picker, location denial, and location approval paths are
      usable without a real address or personal file.
- [ ] Recovery Kit and readable export can be reviewed with test material.
- [ ] Account deletion completes against the deployed production backend.
- [ ] Support contact monitors review questions for the full review window.

## Third-party login policy gate

The reviewed source policy returns `false` for Google OAuth on iOS. The iOS
submission must therefore retain the complete email/password path and keep
Google sign-in absent from the binary and visible UI until Sign in with Apple or
another option that satisfies Apple's current login-services rule is
implemented, configured for the production Apple Team, and reviewed.

- [ ] Clean-installed submitted iOS build shows no Google sign-in action.
- [ ] App Review notes describe only the login methods present in that build.
- [ ] If Google sign-in is later enabled, Sign in with Apple/equivalent privacy
      option, token/revocation handling, App Privacy answers, deletion behavior,
      deep links, and reviewer access are retested together.

## Provisional age-rating assumptions

The source contains no platform-provided violence, sexual content, profanity,
gambling, drugs, horror, medical treatment, contests, or advertising. It has no
public feed, public profiles, anonymous discovery, chat, unrestricted web
browser, in-app purchase, or game mechanics in the reviewed source.

The app does allow a user to add photos and documents and share a household
record with deliberately invited members. This is private household content,
not a public social surface. The account owner must compare that behavior with
the exact wording of Apple's current user-generated-content question.

Working answers:

| Rating consideration | Source-backed assumption |
|---|---|
| Platform-provided mature themes | None |
| Violence | None |
| Sexual or nudity content | None |
| Profanity or crude humor | None |
| Alcohol, tobacco, or drugs | None |
| Gambling, simulated gambling, or contests | None |
| Horror or fear themes | None |
| Medical or treatment information | None |
| Unrestricted web access | No |
| Public social networking or chat | No |
| User uploads | Yes: private photos/documents and other household content |
| Location | User-requested property/item location; not a public live-location feed |
| Financial behavior | User-entered records only; no banking, trading, lending, or financial advice |
| Made for Kids | No working assumption; no child-directed claim is present |
| Minimum user age | `[MINIMUM_USER_AGE_AND_PARENTAL_POLICY]` |

**Provisional outcome:** the content profile appears consistent with the lowest
general-audience tier if Apple's final questionnaire accepts the private-content
behavior above. App Store Connect's calculated rating is authoritative. Record
the final result as `[FINAL_APPLE_AGE_RATING]` and have
`[AGE_RATING_REVIEWER]` approve it.

## Encryption and export-compliance note

Current iOS configuration:

```text
ios.config.usesNonExemptEncryption = false
Generated Info.plist expectation: ITSAppUsesNonExemptEncryption = NO
```

Source uses standard encryption and security mechanisms for local protected
storage and transport, including platform-backed cryptography, AES-GCM,
SQLCipher/CommonCrypto, SecureStore, hashing, TLS, and standard Argon2id
password derivation for Recovery Kits. No proprietary cipher is represented in
the reviewed source.

App Store Connect answers must remain consistent with the checked-in setting:
the release is represented as **not using non-exempt encryption**. The Account
Holder, Admin, or App Manager must still confirm the classification for the
exact submitted binary and intended territories. The configuration value is
not, by itself, an export-law determination.

Final record:

| Field | Value |
|---|---|
| Submitted binary build | `[APP_BUILD_NUMBER]` |
| Generated plist inspected | `[YES_NO]` |
| `ITSAppUsesNonExemptEncryption` | `[EXPECTED_NO]` |
| App Store Connect export answer | `[FINAL_EXPORT_COMPLIANCE_ANSWER]` |
| Supporting document requested by Apple | `[NONE_OR_DOCUMENT_REFERENCE]` |
| Account owner approval | `[NAME_AND_DATE]` |
