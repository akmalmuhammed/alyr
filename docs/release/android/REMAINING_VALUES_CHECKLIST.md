# Heldat Android release — remaining values and gates

## Engineering evidence ready

- [x] Package name fixed as `app.heldat.mobile`.
- [x] Production AAB profile configured with remote version-code increment.
- [x] Target SDK 36 and minimum SDK 24 verified on the baseline AAB.
- [x] Production Maps key restricted to Android application identity.
- [x] Android App Links published at `https://heldat.app/.well-known/assetlinks.json`.
- [x] Public privacy, support, security, terms, and account-deletion pages live.
- [x] Account deletion exists in app and externally.
- [x] No ads, remote-push service, or background location in the current release.
- [x] Closed-pilot enrollment and household permissions fail closed.
- [x] Release/security test suites and source contract checks pass.

## Account owner inputs

- [ ] Choose permanent Play developer account type: personal or organization.
- [ ] Pay Google's one-time developer registration fee.
- [ ] Enter legal developer name, address, support phone, and public contact.
- [ ] Accept Play distribution and developer agreements.
- [ ] Select countries/regions and confirm a free initial price.
- [ ] Supply a private app-review identity and one-time pilot code.
- [ ] Approve final English listing copy.
- [ ] Obtain native-speaker review before publishing Arabic store metadata.

## Personal-account testing gate, if selected

- [ ] Recruit at least 12 reliable Android testers.
- [ ] Keep all 12 opted into the closed test continuously for at least 14 days.
- [ ] Capture feedback and resolve release-blocking defects.
- [ ] Apply for production access in Play Console after the testing requirement
      is met.

## Final signed release gate

- [ ] Upload the final hardened AAB, not a baseline artifact.
- [ ] Enroll in Play App Signing and archive both upload and app-signing
      certificate fingerprints.
- [ ] Add the Play app-signing SHA-256 certificate to `assetlinks.json`; the
      local upload certificate alone does not verify store-installed builds.
- [ ] Recheck package, version code/name, target/min SDK, permissions, native
      libraries, privacy manifests, and embedded SDK versions from the Play
      artifact.
- [ ] Complete App access, Content rating, Target audience, Ads, Data safety,
      Account deletion, and Financial features declarations.
- [ ] Upload phone screenshots and the 1024 × 500 feature graphic.
- [ ] Run signed-build camera, document, location, offline/restart, sync,
      recovery, household-role, RTL, accessibility, and deletion tests.
- [ ] Confirm no P0/P1 defects and record the release decision.
