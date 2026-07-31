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
| Pricing | Free for the closed pilot |

The app name is 6 characters, below Google Play's 30-character limit.

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

## App access for review

Heldat remains in `closed_pilot` mode. Before uploading a release, create a
dedicated reviewer identity and one-time early-access code, then enter only in
Play Console's private App access instructions:

```text
1. Open Heldat and choose Create account.
2. Enter the review email and password supplied below.
3. Enter the one-time early-access code when prompted.
4. Confirm the email if Play review uses a newly created identity.
5. A sample household may be selected during onboarding; no real asset data is required.

Review email: [PLAY_REVIEW_EMAIL]
Review password: [PLAY_REVIEW_PASSWORD]
Early-access code: [PLAY_REVIEW_ONE_TIME_CODE]
```

Do not place credentials in repository files or public listing copy.

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
