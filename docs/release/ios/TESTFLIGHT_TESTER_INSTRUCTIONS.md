# Heldat TestFlight tester instructions

Status: **release-candidate template**

## Build under test

```text
App: Heldat
Version: [TESTFLIGHT_VERSION]
Build: [TESTFLIGHT_BUILD]
Testing window: [START_DATE] to [END_DATE]
Feedback contact: [TESTFLIGHT_FEEDBACK_EMAIL]
Known release gates: [KNOWN_ISSUES_OR_NONE]
```

Use test-only items, Places, addresses, photos, documents, amounts, and people.
Do not enter passwords, seed phrases, recovery phrases, authentication secrets,
or personal household records in a beta build.

## Installation and first launch

1. Install the named Heldat build from TestFlight.
2. Record the iPhone model, iOS version, Heldat version/build, language, and
   whether the install is clean or upgraded.
3. Launch Heldat and confirm the welcome screen renders without clipping.
4. Switch English/Arabic once and confirm the layout direction changes.
5. Choose the assigned path:
   - **Sample path:** tap **Explore sample**; or
   - **Signed path:** sign in with `[TESTER_EMAIL]` and
     `[TESTER_PASSWORD_DELIVERY_METHOD]`; or
   - **New-account path:** use the invitation and early access code delivered
     through `[INVITATION_DELIVERY_METHOD]`.
6. Never post credentials or invitation codes in a feedback screenshot.

## Critical new-user journey

For a new signed account:

1. Enter email, early access code, and a unique password.
2. Complete email confirmation using the newest confirmation message.
3. Return to Heldat and confirm automatic continuation or use **Check
   confirmation**.
4. Accept the prefilled private-record name or edit it.
5. Confirm the account-activation progress reads:
   **Verify account -> Private record -> First Passport**.
6. Choose an important Item or a Place/property as the first Passport.
7. Complete Details -> Location -> Proof -> Review.
8. Confirm the record appears immediately after save and survives app restart.
9. Choose **View Today** and confirm Today presents an understandable next
   action.

Report the elapsed time from first launch to first saved Passport:
`[ELAPSED_TIME]`.

## Core acceptance journeys

### A. Quick Passport and offline durability

1. Enable Airplane Mode.
2. Create an Item Passport with a test photo, name, category, Place/space, and
   one test document.
3. Background and reopen Heldat during capture; confirm the protected draft
   resumes.
4. Save and force-close the app.
5. Reopen and confirm the local record still exists.
6. Reconnect, keep Heldat foregrounded, and confirm the status progresses without
   creating a duplicate.

### B. Location truth

1. Add a Place/property.
2. Deny location once; confirm manual placement remains understandable.
3. Allow in-use location and observe the shown accuracy.
4. Adjust the pin manually.
5. Confirm Heldat identifies the adjusted pin as user-placed and does not present
   it as measured GPS precision.
6. Add a room/space and retrieval clue, then find the Item through search.

### C. Proof

1. Capture a test photo.
2. Import a permitted image and a permitted document.
3. Open the proof after restart.
4. Confirm the visible filename/content contains no personal information before
   attaching it.
5. Record any upload or checksum error exactly as shown.

### D. Portfolio

1. Record a dated asset or owned-property value.
2. Add a liability and a dated balance.
3. Open Portfolio and verify the displayed equation using the fixture amounts.
4. Confirm currencies remain separate.
5. Hide and reveal amounts.
6. Remove or leave one value missing and confirm it is not treated as zero.
7. Confirm the screen describes the result as a tracked/recorded position, not
   a live valuation or complete net worth.

### E. Family access

1. Owner creates a test invitation.
2. Recipient signs in with the intended email.
3. Recipient reviews the household name and proposed role before joining.
4. Test owner, editor, and viewer consequences with non-personal fixtures.
5. Revoke access and confirm names, counts, thumbnails, and search results from
   that household are no longer visible to the revoked account.

### F. Vault and Recovery Kit

1. Review local proof storage and cloud/sync state as separate facts.
2. Create a Recovery Kit with a unique test passphrase.
3. Save an independent copy through the iOS share sheet and confirm that action
   in Heldat.
4. Restore on the designated clean test workspace.
5. Open one recovered image and one recovered document.
6. Verify that a wrong passphrase and a modified kit fail without replacing the
   current vault.
7. Create a readable export and confirm it is clearly distinct from the
   encrypted Recovery Kit.

### G. iPhone behavior and accessibility

- Camera interruption and permission denial
- Foreground/background reconciliation
- Face ID/device-passcode unlock behavior
- App-switcher privacy shielding
- VoiceOver on welcome, capture, Today, Portfolio, Passport, Family, and Vault
- Dynamic Type at large accessibility sizes
- Arabic RTL navigation, forms, amounts, and consequences
- Sign out, account switch, and protected-vault isolation
- Account deletion with the dedicated disposable test account

## Feedback format

```text
Build:
iPhone / iOS:
Language:
Clean install or upgrade:
Online or offline:
Starting screen:
Exact actions:
Expected:
Observed:
Visible error:
Reproducible: always / sometimes / once
Privacy check: screenshot contains no personal data
Attachment: [SCREENSHOT_OR_SCREEN_RECORDING]
```

Severity:

- **P0:** data loss, cross-household disclosure, unauthorized access, unusable
  launch, or irreversible destructive behavior.
- **P1:** critical journey cannot complete, wrong financial/location truth, or
  inaccessible primary action.
- **P2:** material friction or visual defect with a workaround.
- **P3:** minor copy, spacing, or polish issue.

Stop testing and notify `[SECURITY_ESCALATION_CONTACT]` immediately for suspected
cross-household disclosure, credential exposure, destructive-action mismatch,
or Recovery Kit replacement without successful verification.
