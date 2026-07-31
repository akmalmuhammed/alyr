# Heldat Google Play metadata

Status: **English source copy ready for final account-owner review**

## App identity

| Play field | Value |
|---|---|
| App name | `Heldat` |
| Package name | `app.heldat.mobile` |
| Default language | English |
| App or game | App |
| Category | Productivity |
| Contains ads | No |
| Pricing | `[FINAL_PLAY_PRICE]` (working decision: Free) |
| Public developer name | `[PUBLIC_LEGAL_OR_DEVELOPER_NAME]` |
| Public contact email | `[PLAY_PUBLIC_CONTACT_EMAIL]` (working candidate: `support@heldat.app`) |
| Public contact phone | `[PLAY_PUBLIC_CONTACT_PHONE_WITH_COUNTRY_CODE_OR_NOT_REQUIRED]` |
| Developer website | `https://heldat.app/` |

The app name is 6 characters, below Google Play's 30-character limit.

Confirm the public developer identity and contact visibility inside the selected
Play account type before release. Every published contact route must be working
and monitored. Once this package has been offered free on Google Play, the same
app/package does not later switch to paid; charging for the download would use a
new package. Future in-app products or subscriptions are separate product,
billing, tax, and legal decisions.

## Short description

```text
Know what you own, where it is, and what proves it—privately, in one place.
```

This is 75 characters, below the 80-character limit.

## Full description

```text
Know what you own. Know exactly where it is.

Heldat is a private household record that connects important items and Places with the photos, documents, and retrieval details that help you find and understand them.

CREATE A PASSPORT
Start with an item or a Place. Give it a recognizable name, add the details you know, and leave unknown information visible for later.

PLACE IT PRECISELY
Organize property, rooms, spaces, and containers. Use an accurate map pin when you choose, adjust it yourself, and record an indoor retrieval clue.

KEEP PROOF BESIDE THE RECORD
Attach a selected photo, receipt, appraisal, certificate, or another useful document. Heldat keeps proof connected to the relevant Passport and shows whether work is on this device, queued, or synced.

SEE WHAT NEEDS ATTENTION
Today highlights missing locations, photos, proof, identity details, and dated-value reviews so you always have a clear next step.

REVIEW YOUR RECORDED PORTFOLIO
Record dated values for assets, properties, and liabilities. Currencies remain separate, missing values stay missing, and Heldat never fills in a price or exchange rate for you.

FIND IT AGAIN
Browse Assets and Places or search by name, room, Place, or retrieval clue. Atlas provides a geographic overview backed by a complete Place list.

CONTROL HOUSEHOLD ACCESS
Invite household members deliberately and assign owner, editor, or viewer roles.

RECOVER AND EXPORT
Vault brings together proof, sync diagnostics, readable exports, and password-protected Recovery Kits.

Core capture is designed to continue without a network connection. English and Arabic are supported, including right-to-left layouts.

Heldat is a household record and retrieval tool. It is not an appraisal, insurance policy, title register, password manager, bank balance, live valuation, or complete statement of net worth. Do not store passwords, seed phrases, or authentication secrets.
```

The copy is below Google Play's 4,000-character limit. Recheck the exact text
inside Play Console before submission.

## Public URLs

| Play field | Value |
|---|---|
| Website | `https://heldat.app/` |
| Privacy policy | `https://heldat.app/privacy/` |
| Support | `https://heldat.app/support/` |
| External account deletion | `https://heldat.app/delete-account/` |
| Security contact | `https://heldat.app/security/` |

The native app also exposes account deletion from account settings. The
external page remains necessary for people who no longer have the app.

These URLs were reachable on 31 July 2026, but their current copy is
private-beta/provisional. Reachability is not legal approval. Before a public
production listing, deploy the owner/legal-approved privacy, terms, deletion,
and support text; replace private-beta wording across the website, app, and
store metadata; then archive the exact deployed responses with release
evidence.

## App access for review

Heldat remains in `closed_pilot` mode. Before uploading a release, create a
dedicated, pre-confirmed reviewer identity and fixture household. Enter its
reusable credentials only in Play Console's private App access instructions.
The reviewer path must not depend on an email inbox, one-time code, OTP,
operator action, or geographic location:

```text
1. Open Heldat and choose Sign in.
2. Enter the reusable review email and password supplied below.
3. Open the preconfigured review household. No real asset data is required.

Review email: [PLAY_REVIEW_EMAIL]
Review password: [PLAY_REVIEW_PASSWORD]
Review household: [PLAY_REVIEW_HOUSEHOLD_NAME]
Credentials verified on: [PLAY_REVIEW_CREDENTIALS_VERIFIED_AT]
```

Do not place credentials in repository files or public listing copy.

The Play Data safety form is required for closed, open, and production tracks;
an app exclusively active on the internal-testing track is the documented
exemption. Complete the form from the exact submitted AAB, Play SDK Index, live
backend behavior, and approved privacy notice before closed-track promotion.

## Graphic assets and declarations

| Requirement | Working value |
|---|---|
| App icon | Final 512 × 512 Play icon derived from the signed Heldat icon |
| Feature graphic | `[1024_X_500_FEATURE_GRAPHIC]` |
| Phone screenshots | `[MINIMUM_2; TARGET_6_TO_8]` |
| Tablet screenshots | Not required while tablets are unsupported |
| Content rating | Complete the IARC questionnaire from actual app behavior |
| Target audience | Adults/general household organization; not designed for children |
| News app | No |
| Government app | No |
| Financial features declaration | Records user-entered values; provides no banking, trading, lending, or live valuation |
| Ads declaration | No ads and no advertising identifier represented in source |

## Closed-test release notes

```text
Initial Heldat closed pilot.

• Capture an Asset or Place Passport with precise location and proof
• Browse Assets, Places, Family, Vault, and Atlas
• Continue core capture offline and sync when connectivity returns
• Export readable records and password-protected Recovery Kits
• English and Arabic right-to-left support

Please test camera/document interruption, offline restart, location accuracy, account recovery, household permissions, and account deletion.
```
