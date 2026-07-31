# Heldat public-launch owner handoff

Last updated: 2026-08-01

This is the single owner-input sheet for the Android, iOS, transactional-email,
and public-legal release tracks. It contains no passwords, API keys, recovery
keys, identity-document numbers, payment details, or live DNS values. Enter
those only in the relevant provider's protected console.

## Current release decision

**Public production launch is not yet approved.** The owned URLs below are live
and match the checked-in pages, but the pages still describe a private beta and
their legal text is provisional. URL reachability is engineering evidence; it
is not owner or legal approval.

| Surface | Verified on 2026-07-31 | Public-production gate still open |
|---|---|---|
| `https://heldat.app/privacy/` | HTTP 200; matches repository | Controller identity/jurisdiction, retention periods, processors/transfers, and legal approval |
| `https://heldat.app/terms/` | HTTP 200; matches repository | Responsible entity, eligibility/age, governing law/disputes, liability review, and legal approval |
| `https://heldat.app/delete-account/` | HTTP 200; route reachable | Deploy the checked-in current in-app path, then verify backed retention timing and production end-to-end deletion evidence |
| `https://heldat.app/support/` | HTTP 200; matches repository | Monitored delivery, escalation owner, and response target |

Private-beta wording is appropriate only for a closed pilot or TestFlight. A
production App Store or Play release requires production-accurate wording in
the binary, store metadata, website, support copy, privacy notice, and terms.

## Verified engineering identity

| Item | Verified value |
|---|---|
| Product name | Heldat |
| Public domain | `https://heldat.app` |
| Registrar / DNS | Spaceship / Cloudflare |
| Cloudflare zone owner | `akmalmuhammed93@gmail.com` (Wrangler OAuth and owner-confirmed zone, 2026-08-01) |
| Android package | `app.heldat.mobile` |
| iOS bundle identifier | `app.heldat.mobile` |
| Expo project | `@alyr-app/alyr-asset-continuity` (`85cab1f2-111f-4e20-abd5-8dff0df2fabb`) |
| Google Cloud operator | `akmalmuhammed93@gmail.com` |
| Google Cloud project | `heldat-mobile-prod-93` |
| Public support URL | `https://heldat.app/support/` |
| Privacy URL | `https://heldat.app/privacy/` |
| Terms URL | `https://heldat.app/terms/` |
| Account-deletion URL | `https://heldat.app/delete-account/` |
| Published mailbox names | `support@heldat.app`, `privacy@heldat.app`, `security@heldat.app`; delivery/monitoring remains gated |
| Current product model | Free app, no ads, no in-app purchases in v1 |
| Working store category | Productivity; Utilities is the secondary candidate |

Cloudflare verification does not require moving registration away from
Spaceship. Keep registrar auto-renew, transfer lock, WHOIS privacy, and MFA
enabled.

The domain-control gate is complete: public DNS delegates to Cloudflare,
`https://heldat.app/` returns `200`, `https://www.heldat.app/` permanently
redirects to the apex, and the Android association route returns `200` over
HTTPS. This establishes control and transport only; it does not approve the
pending legal copy or production release.

## Owner values needed once

Return the following non-secret values exactly as they should appear publicly.
Keep credentials, private identity documents, full DNS values, and payment
information in provider consoles.

```text
PUBLIC_LEGAL_OR_DEVELOPER_NAME=
PRIVACY_CONTROLLER_LEGAL_NAME=
CONTROLLER_COUNTRY_OR_JURISDICTION=
PUBLIC_LEGAL_ADDRESS_OR_REGISTERED_OFFICE_IF_REQUIRED=
PLAY_ACCOUNT_TYPE=personal|organization
PLAY_ACCOUNT_CREATION_DATE=
PLAY_PUBLIC_CONTACT_EMAIL=
PLAY_PUBLIC_CONTACT_PHONE_WITH_COUNTRY_CODE_OR_NOT_REQUIRED=
APPLE_DEVELOPER_ACCOUNT_TYPE=individual|organization
APPLE_TEAM_ID=
APP_REVIEW_CONTACT_FIRST_NAME=
APP_REVIEW_CONTACT_LAST_NAME=
APP_REVIEW_CONTACT_EMAIL=
APP_REVIEW_CONTACT_PHONE_WITH_COUNTRY_CODE=
BUSINESS_STREET_ADDRESS=
BUSINESS_CITY=
BUSINESS_STATE_OR_REGION=
BUSINESS_POSTAL_CODE=
BUSINESS_COUNTRY=
RIGHTS_HOLDER_LEGAL_NAME=
MINIMUM_USER_AGE_AND_PARENTAL_POLICY=
INITIAL_COUNTRIES_OR_REGIONS=
TERMS_GOVERNING_LAW=
TERMS_DISPUTE_FORUM_OR_PROCESS=
ACTIVE_ACCOUNT_DELETION_SLA=
BACKUP_DELETION_MAXIMUM=
SECURITY_AUDIT_RETENTION=
SUPPORT_REQUEST_RETENTION=
LAWFUL_RETENTION_EXCEPTIONS=
FINAL_PROCESSOR_AND_TRANSFER_DISCLOSURE=
AUTH_SENDING_DOMAIN=
AUTH_FROM_NAME=
AUTH_FROM_ADDRESS=
AUTH_REPLY_TO=
RELEASE_ON_CALL_OWNER=
SUPPORT_MAILBOX_OWNER_AND_RESPONSE_TARGET=
PRIVACY_MAILBOX_OWNER_AND_RESPONSE_TARGET=
SECURITY_MAILBOX_OWNER_AND_RESPONSE_TARGET=
ARABIC_METADATA_REVIEWER_NAME_AND_DATE=
PRIVACY_AND_TERMS_REVIEWER_NAME_AND_DATE=
EXPORT_COMPLIANCE_APPROVER_NAME_AND_DATE=
```

The business-address fields may be required during provider or store identity
verification. Do not place a home address into public listing fields unless the
selected store/account type or applicable law requires publication and the
owner knowingly accepts that consequence.

## Recommended product decisions

These defaults remove avoidable launch ambiguity. The owner should reply only
with changes.

| Decision | Recommended default |
|---|---|
| Initial price | Free |
| Apple primary / secondary categories | Productivity / Utilities |
| Play category | Productivity |
| Ads | No |
| In-app purchases | No |
| Target audience | Adults; final minimum age after owner/legal review |
| Initial language listing | English; Arabic after native-speaker review |
| Initial rollout | Closed pilot, then staged production rollout |
| Apple SKU | `HELDAT-IOS-001` |
| Release copyright year | 2026 |
| Store review fixture | Dedicated reusable account containing synthetic assets only |

Google Play treats a free-app decision as durable for the same package: after
the app has been offered free, changing that app to paid requires a new package.
Future subscriptions or in-app products remain separate product, store-billing,
tax, and legal decisions.

If the owner has no registered organization with the documentation required by
Apple and Google, use a personal developer account for the pilot. Review the
seller/developer-name and public-contact consequences shown in each provider's
UI before payment or public release.

## Public legal-page gate

The owner and named reviewer must approve the exact deployed text, not merely
the route names.

Checked-in text that needs an explicit decision before public production:

- The privacy page names `Heldat` as controller but does not identify the
  accountable legal person/entity, country/jurisdiction, or any publishable
  legal address required for the chosen regions.
- Its provider text says providers "may include" Supabase, Expo, Cloudflare,
  Apple, and Google; replace that provisional language with the reviewed actual
  processor/transfer disclosure for the released system.
- Privacy and deletion pages refer to an "applicable" retention/backup cycle
  instead of periods supported by implemented deletion and restore operations.
- The terms do not settle the responsible party, eligibility/minimum age,
  governing law, or dispute forum/process. The free-beta liability wording also
  needs named legal review for every launch region.
- The checked-in deletion page now matches
  `Vault > Settings > Account > Delete account and data`; the public route
  remains on the prior wording until the reviewed site change is deployed and
  its response is re-verified.

- [ ] Privacy notice names the accountable controller and jurisdiction.
- [ ] Privacy notice lists actual data categories, purposes, processors,
      international-transfer handling where applicable, user rights, contact
      path, and approved retention/deletion periods.
- [ ] Terms name the responsible party and state approved eligibility/minimum
      age, governing law, dispute process/forum, service limits, and liability
      treatment for every initial launch region.
- [ ] The deletion page uses the exact current app path:
      `Vault > Settings > Account > Delete account and data`.
- [ ] Deletion timing and backup wording match deployed operational behavior.
- [ ] In-app and web account-deletion flows complete against production, remove
      associated user data except approved lawful-retention records, and produce
      dated evidence.
- [ ] `support@heldat.app`, `privacy@heldat.app`, and `security@heldat.app`
      receive messages, have named owners, and meet approved response targets.
- [ ] Production wording has replaced private-beta wording across every public
      and store-facing surface before an App Store/Play production submission.
- [ ] Final public files and their deployed responses are archived with hashes,
      reviewer name, approval date, and release version.

These decisions require legal review for the selected launch jurisdictions;
engineering evidence does not set the retention periods, age policy, governing
law, dispute forum, transfer mechanism, or liability terms.

## Google Play owner actions

1. Create or activate the permanent Play developer account and pay the
   registration fee.
2. Record the account type and creation date. The special closed-test gate in
   the release checklist applies to newly created personal accounts under
   Google's stated date rule.
3. Enter the verified legal developer identity and public developer contact
   fields, including the monitored support email, website, and any account-type
   phone requirement shown by Play Console.
4. Accept the current developer and distribution agreements.
5. Create the Heldat record for `app.heldat.mobile` and select the approved
   public price and regions.
6. Enroll in Play App Signing and preserve both upload and app-signing
   certificate fingerprints.
7. Complete Data safety for every applicable closed, open, or production track;
   internal-only testing is the documented exemption.
8. Save the submitted Data safety, App access, Account deletion, Target
   audience, Content rating, Ads, and Financial features answers with the
   release evidence.

## Apple owner actions

1. Activate Apple Developer Program membership.
2. Confirm the Apple Team ID and register `app.heldat.mobile`.
3. Complete App Store Connect agreements and create the Heldat app record.
4. Enter the review contact, territories, category, age rating, App Privacy,
   User Privacy Choices URL, and export-compliance answers from the reviewed
   release pack.
5. Confirm that Google sign-in stays absent from the submitted iOS binary until
   Sign in with Apple or another qualifying privacy-preserving login option is
   implemented, configured, and reviewed under Apple's current login-services
   rule.
6. Keep certificates, profiles, and App Store credentials in Apple/EAS rather
   than the repository.

## Transactional-email gate

Follow `docs/operations/TRANSACTIONAL_EMAIL_LAUNCH_GATE.md` and archive its
evidence before opening public enrollment.

1. Complete the provider profile and select the approved authentication sending
   identity (`AUTH_SENDING_DOMAIN`, `AUTH_FROM_NAME`, `AUTH_FROM_ADDRESS`, and
   `AUTH_REPLY_TO`). Keep authentication mail separate from marketing mail.
2. Use manual DNS authentication so the existing DMARC record is reviewed and
   preserved. Add the Brevo verification code and DKIM record or records exactly
   as displayed in Brevo.
3. Maintain exactly one DMARC record. Add SPF or a custom return-path record only
   when the selected Brevo setup explicitly supplies it; merge rather than
   duplicate an existing SPF record.
4. Configure Supabase custom SMTP. Its default SMTP service is a development
   service with restricted recipients, a low changeable limit, best-effort
   delivery, and no SLA, so it is not the public enrollment path.
5. Disable click tracking for authentication mail or prove that rewriting
   preserves the intended target and authentication parameters through
   confirmation, reset, and invitation flows.
6. Verify delivered headers show aligned `DKIM=pass`, `SPF=pass`, and
   `DMARC=pass`; then run the complete confirmation, reset, invite, expiry,
   replay, suppression, bounce, complaint, outage, and rate-limit matrix.
7. Keep SMTP credentials only in Brevo and Supabase protected consoles. Do not
   publish or paste them into release evidence.

## Explicit production-change approvals

The following operations change live data or start destructive maintenance and
therefore retain separate, recorded approvals:

1. `Approve backup execution` - creates and independently verifies the first
   real encrypted production database-plus-Storage backup.
2. `Approve migration 007 after verified backup` — activates bounded sync
   retention and orphan-blob maintenance schedules.
3. `Approve migration 008 after migration 007 verification` — activates
   cross-export/Evidence retained-byte accounting and aggregate readiness
   signals after its final review and database tests pass.
4. `Approve Edge API deployment after migration 008 verification` — deploys
   the current API source and runs the live signed-read plus authenticated
   sync/upload/export probes.
5. `Approve Supabase SSL enforcement after migration verification` — changes
   the production database connection requirement.

These approvals are sequential. A dry run or unit test does not replace the
real backup and isolated restore evidence required for public launch.

## Review-account rule

Create one dedicated, pre-confirmed reviewer account only after transactional
email and production signup are ready. Its fixture household should contain a
synthetic Item, owned property, Place/room, liability, photo, and document.
Store the password only in the protected App Review / Play App access field;
never commit it or send it in this document.

## Public-launch promotion order

1. Resolve every typed owner/legal/email slot and record named approvals.
2. Correct and deploy the public legal/support pages; verify content and hashes.
3. Complete custom SMTP, deliverability, support-monitoring, deletion, retention,
   backup/restore, monitoring, capacity, and abuse-control evidence.
4. Install and physically verify the exact Android preview APK.
5. Upload the exact reviewed AAB to Play's internal track and verify the
   Play-delivered binary, then complete any applicable closed-test requirement.
6. Create and physically verify the signed iPhone build from the release commit,
   then promote the source-identical build through TestFlight.
7. Reconcile each store's privacy/data forms with the exact delivered binary and
   deployed backend.
8. Remove private-beta language and submit only after the release-mode decision
   is explicitly `public_production`.
9. Open public signup only after all gates have dated evidence and a named
   release owner signs the decision.

## Official policy references

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play app pricing](https://support.google.com/googleplay/android-developer/answer/6334373)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
