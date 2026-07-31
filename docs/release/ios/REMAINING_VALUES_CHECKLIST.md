# Heldat iOS remaining-values checklist

Status: **all unchecked items are release gates or unresolved metadata**

Do not create a production submission while any required typed slot remains.

## Apple account and app record

- [ ] Paid Apple Developer Program membership is active.
- [ ] App Store Connect agreements, tax, and banking requirements applicable
      to `[PRICE_TIER]` are complete.
- [ ] App record exists for `app.heldat.mobile`.
- [ ] App name availability is confirmed for `Heldat`.
- [ ] SKU is set: `[APP_STORE_SKU]`.
- [ ] Primary category is approved: `[PRIMARY_CATEGORY]`.
- [ ] Secondary category is approved: `[SECONDARY_CATEGORY_OR_BLANK]`.
- [ ] Copyright is set: `[YEAR] [RIGHTS_HOLDER_LEGAL_NAME]`.
- [ ] Countries/regions are selected: `[COUNTRIES_AND_REGIONS]`.
- [ ] Version and submitted build are recorded:
      `[APP_VERSION]` / `[APP_BUILD_NUMBER]`.

## Public operator and legal values

- [ ] Operator legal name: `[OPERATOR_LEGAL_NAME]`.
- [x] Public support URL: `https://heldat.app/support/`.
- [x] Public privacy-policy URL: `https://heldat.app/privacy/`.
- [x] Marketing URL: `https://heldat.app/`.
- [x] Public support email: `support@heldat.app`.
- [x] Privacy contact: `privacy@heldat.app`.
- [ ] App Review contact name/email/phone are verified.
- [ ] Retention and deletion periods are stated:
      `[RETENTION_AND_DELETION_POLICY]`.
- [ ] Minimum-user-age and parental policy are stated:
      `[MINIMUM_USER_AGE_AND_PARENTAL_POLICY]`.
- [ ] Terms and privacy policy have named owner approval:
      `[LEGAL_REVIEWER_AND_DATE]`.
- [ ] No closed-pilot-only contact wording remains in the public submission.

## Metadata and localization

- [ ] English metadata from `APP_STORE_METADATA.md` is pasted and re-counted.
- [ ] Keywords pass the final App Store validator.
- [ ] Final category does not imply banking, appraisal, insurance, investment,
      title registration, or live valuation.
- [ ] Arabic metadata has native-speaker approval:
      `[ARABIC_NATIVE_REVIEWER_NAME_AND_DATE]`.
- [ ] Product name, subtitle, promotional text, and description match the exact
      submitted feature set.
- [ ] Version-specific "What's New" copy is supplied:
      `[WHATS_NEW_TEXT]`.

## Privacy, age rating, and encryption

- [ ] App Privacy answers exactly match `APP_PRIVACY_MAPPING.md` and the final
      binary.
- [ ] Every production SDK has been reviewed for additional collection or
      tracking.
- [ ] Public privacy policy matches collected data, purposes, retention,
      processors, roles, export, and deletion.
- [ ] Final age rating recorded: `[FINAL_APPLE_AGE_RATING]`.
- [ ] Private household uploads are answered consistently with Apple's current
      user-generated-content wording.
- [ ] Generated production `PrivacyInfo.xcprivacy` is inspected.
- [ ] Generated production `Info.plist` contains
      `ITSAppUsesNonExemptEncryption = NO`.
- [ ] Account owner confirms final export-compliance answers and territories:
      `[EXPORT_COMPLIANCE_APPROVER_AND_DATE]`.

## Review access

- [ ] Dedicated reviewer account email: `[APP_REVIEW_EMAIL]`.
- [ ] Reviewer password is set and delivered only in the protected review
      field: `[APP_REVIEW_PASSWORD_SET_YES_NO]`.
- [ ] Account is already confirmed and remains active for the review window.
- [ ] Review household is named: `[APP_REVIEW_HOUSEHOLD_NAME]`.
- [ ] Review household uses non-personal, rights-cleared fixtures.
- [ ] No email-inbox access, SMS, operator action, or expiring invitation is
      required for the normal reviewer sign-in.
- [ ] Fresh-signup instructions are supplied only if Apple needs them:
      `[FRESH_SIGNUP_REVIEW_INSTRUCTIONS_OR_NOT_APPLICABLE]`.
- [ ] App Review notes were clean-installed and followed verbatim.
- [ ] Support contact will monitor the review window.

## Backend and runtime readiness

- [ ] Current Supabase migrations and Edge Function are deployed together.
- [ ] Production environment supplies only the public Supabase URL and public
      publishable key; no service-role secret is in the client build.
- [ ] Live RLS negative tests pass across two households.
- [ ] Account creation, confirmation, sign-in, reset, invitation review, sync,
      upload, export, and deletion pass against production.
- [ ] Storage and egress pilot guardrails are active.
- [ ] Restore has been tested from a separately stored Recovery Kit.
- [ ] Universal-link decision is recorded:
      `[INTERNAL_ONLY_CUSTOM_SCHEME_OR_VERIFIED_HTTPS_LINKS]`.
- [ ] External beta/public distribution does not rely on hijackable custom
      schemes where owned HTTPS universal links are required.

## Signed iPhone evidence

- [ ] Production candidate is built from a clean commit:
      `[RELEASE_COMMIT_SHA]`.
- [ ] EAS project, bundle ID, version, runtime, channel, and environment are
      inspected in the artifact.
- [ ] Signed build is installed on a physical iPhone.
- [ ] Full new-user journey passes from Welcome through first Passport and
      Today.
- [ ] Camera, image import, document import, location, Face ID/device passcode,
      offline restart, sync, and privacy shielding pass.
- [ ] English, Arabic RTL, VoiceOver, and Dynamic Type pass.
- [ ] Two-device convergence creates no duplicate record or proof version.
- [ ] Account and household revocation expose no name, count, thumbnail, or
      search residue.
- [ ] Recovery Kit valid/wrong-password/tampered-version cases pass.
- [ ] Account deletion completes and the device vault is cleared as described.
- [ ] No P0/P1 defect or high-severity privacy/security issue remains.

## Screenshots and listing assets

- [ ] Screenshot fixture household contains no personal data.
- [ ] Rights for every image/document/icon are recorded:
      `[CONTENT_RIGHTS_RECORD]`.
- [ ] English screenshot set exists:
      `[EN_SCREENSHOT_ABSOLUTE_PATH]`.
- [ ] Arabic screenshot set exists:
      `[AR_SCREENSHOT_ABSOLUTE_PATH]`.
- [ ] All images come from the final source-identical build.
- [ ] App icon and screenshots pass App Store Connect validation.
- [ ] No debug, preview, session-only, stale sync, or accidental test labels are
      visible.
- [ ] Final visual reviewer approval:
      `[VISUAL_REVIEWER_AND_DATE]`.

## TestFlight release

- [ ] Internal tester group: `[INTERNAL_TESTER_GROUP]`.
- [ ] External tester group, if used: `[EXTERNAL_TESTER_GROUP_OR_BLANK]`.
- [ ] Test information uses `TESTFLIGHT_TESTER_INSTRUCTIONS.md`.
- [ ] Beta description: `[BETA_DESCRIPTION]`.
- [ ] Feedback email: `[TESTFLIGHT_FEEDBACK_EMAIL]`.
- [ ] Known issues: `[KNOWN_ISSUES_OR_NONE]`.
- [ ] Beta App Review credentials and notes are validated.
- [ ] Crash, support, and privacy escalation owners are on call:
      `[RELEASE_ON_CALL_ROSTER]`.
