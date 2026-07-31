# Heldat Android release — remaining values and gates

## Engineering evidence ready

- [x] Package name fixed as `app.heldat.mobile`.
- [x] Production AAB profile configured with remote version-code increment.
- [x] Target SDK 36 and minimum SDK 24 verified on the baseline AAB.
- [x] Production Maps key restricted to Android application identity.
- [x] Android App Links published at `https://heldat.app/.well-known/assetlinks.json`.
- [x] Public privacy, support, security, terms, and account-deletion routes are
      reachable; content approval remains a separate gate below.
- [x] Account deletion surfaces exist in app and externally; production
      end-to-end behavior remains a separate gate below.
- [x] No ads, remote-push service, or background location in the current release.
- [x] Closed-pilot enrollment and household permissions fail closed.
- [x] Release/security test suites and source contract checks pass.
- [x] Build-6 production AAB passed `69/69` static checks:
      `D:\HeldatArtifacts\current\faa751a\heldat-android-production-faa751a-v0.1.0-build6.aab`,
      SHA-256
      `FF6C1A9D4CDE60BFFB764646253A08877AA2872869DCDED512C950EAD4FAF12E`.

## Account owner inputs

- [ ] Choose permanent Play developer account type: personal or organization.
- [ ] Record the permanent account creation date: `[PLAY_ACCOUNT_CREATION_DATE]`.
- [ ] Pay Google's one-time developer registration fee.
- [ ] Enter and verify legal developer name, address, monitored public support
      email, public website, and any phone field required for the selected
      account type.
- [ ] Accept Play distribution and developer agreements.
- [ ] Select countries/regions and confirm a free initial price.
- [ ] Acknowledge that once this package is offered free on Play, the same app
      does not later switch to paid; any future in-app monetization receives a
      separate product, billing, tax, and legal review.
- [ ] Supply a pre-confirmed, reusable private app-review identity and fixture
      household that require no inbox, one-time code, OTP, operator action, or
      location-dependent step.
- [ ] Approve final English listing copy.
- [ ] Obtain native-speaker review before publishing Arabic store metadata.

## New-personal-account testing gate, when applicable

Apply this section when the permanent personal developer account was created
after 13 November 2023, subject to the current Play Console rule shown for that
account. Record the Console's exact requirement with the release evidence.

- [ ] Recruit at least 12 reliable Android testers.
- [ ] Keep all 12 opted into the closed test continuously for at least 14 days.
- [ ] Capture feedback and resolve release-blocking defects.
- [ ] Apply for production access in Play Console after the testing requirement
      is met.

## Final signed release gate

- [ ] Confirm the submitted AAB is byte-identical to build 6 above, or repeat
      the complete static review and record the replacement path/hash/version.
- [ ] Upload the final hardened AAB, not an earlier baseline artifact.
- [ ] Enroll in Play App Signing and archive both upload and app-signing
      certificate fingerprints.
- [ ] Add the Play app-signing SHA-256 certificate to `assetlinks.json`; the
      local upload certificate alone does not verify store-installed builds.
- [ ] Add the Play app-signing SHA-1 certificate to the Android restriction on
      the Google Maps API key; the upload certificate alone does not authorize
      maps inside a Play-installed build.
- [ ] Recheck package, version code/name, target/min SDK, permissions, native
      libraries, Data safety disclosures, SDK Index results, and embedded SDK
      versions from the Play-delivered artifact.
- [ ] Complete App access, Content rating, Target audience, Ads, Data safety,
      Account deletion, and Financial features declarations.
- [ ] Complete Data safety before any applicable closed, open, or production
      track promotion; internal-only testing is the documented exemption.
- [ ] Upload phone screenshots and the 1024 × 500 feature graphic.
- [ ] Run signed-build camera, document, location, offline/restart, sync,
      recovery, household-role, RTL, accessibility, and deletion tests.
- [ ] Confirm no P0/P1 defects and record the release decision.

## Public production, legal, and operations gate

- [ ] Controller/developer identity, jurisdiction, approved minimum-age policy,
      governing law/dispute handling, and launch regions are resolved.
- [ ] Named reviewer approves the exact privacy notice and terms for the chosen
      launch regions: `[PRIVACY_AND_TERMS_REVIEWER_NAME_AND_DATE]`.
- [ ] Approved active-account deletion SLA, backup deletion maximum, security
      audit retention, support retention, and lawful exceptions match deployed
      behavior.
- [ ] Public deletion instructions use the exact path
      `Vault > Settings > Account > Delete account and data`.
- [ ] In-app and external deletion complete against production and remove the
      account/associated data except approved lawful-retention records.
- [ ] Public developer contacts and `support@heldat.app`,
      `privacy@heldat.app`, and `security@heldat.app` are monitored with named
      escalation owners.
- [ ] Supabase custom SMTP and the complete transactional-email test matrix in
      `docs/operations/TRANSACTIONAL_EMAIL_LAUNCH_GATE.md` pass.
- [ ] Private-beta wording is retained only for a closed pilot. Before a public
      production track, website, app, privacy, terms, support, screenshots,
      release notes, and store copy all use production-accurate wording.
- [ ] Final Play Console declarations, delivered binary, deployed backend, and
      public legal pages are reconciled and archived with a named release owner.
