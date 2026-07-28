# ALYR iPhone screenshot shot list

Status: **capture blueprint; no rendered screenshot is claimed here**

Use only the signed release candidate or a source-identical simulator build.
Do not use the older Vite phone-frame prototype. Capture an iPhone size accepted
by the current App Store Connect record and derive only the sizes Apple permits.

## Story sequence

| Order | Screen/state | Proposed headline | What the image must prove |
|---:|---|---|---|
| 1 | Welcome | **Know what you own. Know exactly where it is.** | ALYR's private household-record value proposition and clear Create/Explore actions |
| 2 | Today with a realistic non-personal household | **One clear next step** | Readiness, one priority action, Place overview, and a restrained Portfolio entry |
| 3 | Assets / Items photo library | **Every important item has a Passport** | Recognizable item cards, useful filters, and a visible add action |
| 4 | Quick Passport review | **Photo, location and proof together** | A coherent record with a selected photo, precise Place/space, and one document |
| 5 | Item Passport | **Find it without relying on memory** | Dossier-style identity, retrieval path, readiness, proof, and history |
| 6 | Atlas with confirmed Places | **Your Places, mapped with intent** | Geographic overview, confirmed-pin truth, and accessible list fallback |
| 7 | Portfolio with amounts visible | **A dated view of what you recorded** | Assets minus liabilities, as-of dates, coverage, and separate currency truth |
| 8 | Vault / Recovery Kit | **Proof you can recover and carry** | Proof files, Recovery Kit, readable export, and sync state |
| 9 | Family access, optional | **Share access one role at a time** | Owner/editor/viewer roles without exposing real emails |

If the listing uses fewer images, keep shots 1-8 and omit Family first. Do not
use Atlas as a lead image until its globe and list both pass the release visual
gate on the target iPhone size.

## Fixture specification

Create one dedicated screenshot household:

```text
Household: [SCREENSHOT_HOUSEHOLD_NAME]
Region: [NON_PERSONAL_DEMO_REGION]
Currency: [SCREENSHOT_CURRENCY]
Items: [5_TO_8_NON_PERSONAL_DEMO_ITEMS]
Places: [2_TO_3_NON_PERSONAL_DEMO_PLACES]
Liabilities: [1_TO_2_NON_PERSONAL_DEMO_LIABILITIES]
Proof files: [SANITIZED_FIXTURE_FILES]
```

Required fixture qualities:

- Names are natural, short, and intentionally written; no `Item 1`, lorem
  ipsum, random IDs, QA labels, or operator personal information.
- Addresses and coordinates are fictional or purpose-created review fixtures.
- Photos and documents have confirmed usage rights.
- Values and liabilities are visibly dated and use internally coherent totals.
- Each shown sync badge reflects actual release state.
- One record is intentionally incomplete for Today; every other visible record
  should have a reason for its state.
- The Portfolio screenshot includes its boundary language and never calls the
  result live net worth.

## Per-shot capture checks

- [ ] Status bar time, battery, locale, and network state are intentional.
- [ ] No debug overlay, dev menu, preview banner, test ID, Metro error, or
      simulator cursor is visible.
- [ ] No real email, address, coordinate, filename, invitation code, account
      identifier, or document content is visible.
- [ ] Large titles, bottom navigation, home indicator, sheets, and keyboard do
      not collide.
- [ ] Selected tabs and press states are unambiguous.
- [ ] Amount visibility is intentional and consistent.
- [ ] Permissions have already been resolved unless the screenshot is
      specifically documenting a permission request.
- [ ] Image remains legible at App Store thumbnail size.
- [ ] Headline and device frame do not cover product UI.
- [ ] Screenshot reflects the exact submitted feature and copy.

## Accessibility and localization set

Capture English first, then capture a complete Arabic/RTL set after:

- [ ] native-speaker copy review,
- [ ] RTL navigation and icon-direction check,
- [ ] Arabic number/currency review,
- [ ] Dynamic Type sanity pass at the default marketing capture size, and
- [ ] VoiceOver label spot-check on the represented actions.

Arabic marketing headlines remain typed slots:

| Shot | Arabic headline |
|---:|---|
| 1 | `[AR_SCREENSHOT_HEADLINE_1]` |
| 2 | `[AR_SCREENSHOT_HEADLINE_2]` |
| 3 | `[AR_SCREENSHOT_HEADLINE_3]` |
| 4 | `[AR_SCREENSHOT_HEADLINE_4]` |
| 5 | `[AR_SCREENSHOT_HEADLINE_5]` |
| 6 | `[AR_SCREENSHOT_HEADLINE_6]` |
| 7 | `[AR_SCREENSHOT_HEADLINE_7]` |
| 8 | `[AR_SCREENSHOT_HEADLINE_8]` |

## Artifact handoff

| Field | Value |
|---|---|
| Source commit | `[SCREENSHOT_SOURCE_COMMIT]` |
| Build number | `[SCREENSHOT_BUILD_NUMBER]` |
| Device/simulator model | `[SCREENSHOT_DEVICE_MODEL]` |
| iOS version | `[SCREENSHOT_IOS_VERSION]` |
| Capture date | `[SCREENSHOT_CAPTURE_DATE]` |
| English output directory | `[EN_SCREENSHOT_ABSOLUTE_PATH]` |
| Arabic output directory | `[AR_SCREENSHOT_ABSOLUTE_PATH]` |
| Visual reviewer | `[VISUAL_REVIEWER_AND_DATE]` |
