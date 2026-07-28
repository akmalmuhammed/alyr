# ALYR App Store metadata

Status: **English source copy ready for final account-owner review**

Character counts below are plain UTF-8 counts for the written value. Recheck
them in App Store Connect because Apple, not this file, is the final validator.

## Core metadata

### Product name

```text
ALYR
```

- Characters: 4
- Source basis: `app.config.ts`

### Subtitle

```text
Assets, places and proof
```

- Characters: 24
- Source basis: the native product nouns `Assets`, `Places`, and `Proof`

### Short description

This is reusable short copy for TestFlight, press notes, or a landing surface.
It is not represented as a separate App Store field.

```text
Create a private household record for important items, Places, proof and dated values, so you can find what matters and review what is missing.
```

### Promotional text

```text
Know what you own, where it is and what proves it. Build private Passports for important items and Places, then review your recorded portfolio.
```

- Characters: 143

### Keywords

```text
inventory,assets,property,collectibles,receipts,household,portfolio,location,documents,vault
```

- UTF-8 bytes: 92
- Does not repeat `ALYR`
- Revalidate keyword policy and byte count in the final App Store Connect form

## Full description

```text
Know what you own. Know exactly where it is.

ALYR is a private household record that connects important items and Places with the photos, documents and retrieval details that help you find and understand them.

CREATE A PASSPORT
Start with an item or a Place. Give it a recognizable name, add the details you know, and leave unknown information visible for later.

PLACE IT PRECISELY
Organize property, rooms, spaces and containers. Use an accurate map pin when you choose, adjust it yourself, and record an indoor retrieval clue.

KEEP PROOF BESIDE THE RECORD
Attach a selected photo, receipt, appraisal, certificate or another useful document. ALYR keeps proof connected to the relevant Passport and shows whether work is on this device, queued or synced.

SEE WHAT NEEDS ATTENTION
Today highlights missing locations, photos, proof, identity details and dated-value reviews so you always have a clear next step.

REVIEW YOUR RECORDED PORTFOLIO
Record dated values for assets, properties and liabilities. Currencies remain separate, missing values stay missing, and ALYR never fills in a price or exchange rate for you.

FIND IT AGAIN
Browse Assets and Places or search by name, room, Place or retrieval clue. Atlas provides a geographic overview backed by a complete Place list.

CONTROL HOUSEHOLD ACCESS
Invite household members deliberately and assign owner, editor or viewer roles.

RECOVER AND EXPORT
Vault brings together proof, sync diagnostics, readable exports and password-protected Recovery Kits.

Core capture is designed to continue without a network connection. English and Arabic are supported, including right-to-left layouts.

ALYR is a household record and retrieval tool. It is not an appraisal, insurance policy, title register, password manager, bank balance, live valuation or complete statement of net worth. Do not store passwords, seed phrases or authentication secrets.
```

## URLs and contact fields

No verified public operator URL is present in the current repository. Supply
only owned, public, HTTPS destinations that work without authentication.

| App Store field | Required value |
|---|---|
| Privacy Policy URL | `[PRIVACY_POLICY_URL_HTTPS]` |
| Support URL | `[SUPPORT_URL_HTTPS]` |
| Marketing URL, if used | `[MARKETING_URL_HTTPS_OR_BLANK]` |
| App Review contact first name | `[APP_REVIEW_CONTACT_FIRST_NAME]` |
| App Review contact last name | `[APP_REVIEW_CONTACT_LAST_NAME]` |
| App Review contact email | `[APP_REVIEW_CONTACT_EMAIL]` |
| App Review contact phone | `[APP_REVIEW_CONTACT_PHONE_WITH_COUNTRY_CODE]` |

The public privacy policy must cover the actual submitted build, including
account data, household content, precise and coarse location, dated financial
records, photos, documents, diagnostics, product interaction analytics,
retention, access, and deletion. An in-app notice does not fill the public URL
field.

## Store classification worksheet

| Field | Working value |
|---|---|
| Primary language | English |
| Additional localization | Arabic after native-speaker metadata review |
| Primary category | `[PRIMARY_CATEGORY]` (working candidate: Productivity) |
| Secondary category | `[SECONDARY_CATEGORY_OR_BLANK]` |
| Price | `[PRICE_TIER]` |
| Availability | `[COUNTRIES_AND_REGIONS]` |
| Copyright | `[YEAR] [RIGHTS_HOLDER_LEGAL_NAME]` |
| SKU | `[APP_STORE_SKU]` |

The product records user-entered financial amounts, but the checked-in terms
state that it is not a bank balance, appraisal, live valuation, insurance
policy, or complete net-worth statement. Do not classify or market it as a
financial service without a separate product and legal review.

## Arabic localization worksheet

The app contains Arabic UI and RTL support. App Store Arabic metadata still
needs human linguistic review; do not publish a machine-generated translation.

| Field | Value |
|---|---|
| Name | `[AR_PRODUCT_NAME]` |
| Subtitle | `[AR_SUBTITLE]` |
| Promotional text | `[AR_PROMOTIONAL_TEXT]` |
| Keywords | `[AR_KEYWORDS]` |
| Full description | `[AR_FULL_DESCRIPTION]` |
| Privacy Policy URL | `[AR_PRIVACY_POLICY_URL_HTTPS_OR_SHARED_URL]` |
| Support URL | `[AR_SUPPORT_URL_HTTPS_OR_SHARED_URL]` |
| Reviewer | `[ARABIC_NATIVE_REVIEWER_NAME_AND_DATE]` |
