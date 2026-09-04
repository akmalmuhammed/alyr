# ALYR iPhone Accessibility and Platform-Native Audit

**Audit date:** 2026-07-27
**Scope:** Current working-tree source under `asset-continuity-native`, shared design tokens/contracts, and native tests.
**Primary platform:** iPhone / iOS. Android-relevant behavior is noted only where it explains a cross-platform implementation gap.
**Method:** Static source inspection, deterministic color-contrast calculation, interaction-dimension inventory, and test-coverage inspection. Three relevant contract suites passed in this run (17/17 tests); this does not replace device accessibility testing.
**Visual evidence status:** No in-app browser connection existed in this child run. No screenshot-dependent layout or traversal result is represented as verified. See `browser-capture-blocker.txt` and **Device verification queue**.

## Decision

**Hold an accessibility-ready iPhone pilot label until P1-01 through P1-04 are closed and rerun on a physical iPhone.**

The English preview has a solid native foundation: standard Expo Router navigation, native alerts and share/picker flows, semantic button/radio/progress states, keyboard-aware scrolling, an accessible Place list paired with the visual globe, purpose-specific permission prompts, and consistent confirmation before destructive or draft-discarding actions.

It is not yet ready to claim VoiceOver, Dynamic Type, WCAG-AA contrast, or Arabic/RTL parity. Four release gates remain:

1. Form and global errors rely on an Android-only live-region property and do not focus the first invalid field on iOS.
2. Shared subtle/warning colors and control-border tokens miss WCAG contrast thresholds in active use.
3. Dynamic Type is enabled by default, but several fixed horizontal compositions and one-line truncations have no accessibility-size layout path and have not been tested at 320 pt / largest Accessibility Sizes.
4. Arabic is intentionally disabled and the implementation is only partially localized or mirrored.

## Severity model

| Priority | Meaning |
|---|---|
| **P0** | Prevents core use or exposes private content with a confirmed exploit; none confirmed in this source-only pass. |
| **P1** | Release blocker for the stated iPhone accessibility/Arabic acceptance gate. |
| **P2** | Material accessibility or platform-quality gap to fix before a broad pilot. |
| **P3** | Lower-risk semantic polish or coverage improvement. |

## Audit matrix

| Area | Verdict | Key result |
|---|---|---|
| VoiceOver names, roles, states | **Partial** | Most controls have roles/states; iOS announcements, focus recovery, privacy isolation, and heading coverage are incomplete. |
| VoiceOver order | **Needs device verification** | Source order is generally logical; RTL row reversal and inline expansion focus have not been traversed with VoiceOver. |
| Dynamic Type / 320 pt | **P1 gate** | Scaling is not disabled, but high-risk horizontal layouts and truncation remain; no visual/device result exists. |
| 44 pt targets | **Partial** | Primary controls meet 44 pt; five recurring compact-action patterns are 36–42 pt without hit slop. |
| Contrast and token use | **Fail** | Three token families fail normal-text or non-text contrast at live call sites. |
| Reduce Motion | **Incomplete** | A reduced-motion token exists, but no runtime preference consumption or test exists. |
| Modal, back, draft discard | **Strong with one focus gap** | Native modal/back protection is good; inline Add Place expansion does not transfer/restore accessibility focus. |
| Software keyboard and forms | **Partial** | Scroll/keyboard avoidance is strong; invalid submit focus and editor return-key chaining are incomplete. |
| Arabic / RTL | **Intentionally disabled; incomplete** | Good fonts and component-level direction exist, but most copy, navigation, accessibility language, and end-to-end order are unfinished. |
| Privacy shield | **Visual source pass; accessibility gap** | Opaque app-state overlay exists; it does not make VoiceOver ignore the underlying Stack. |
| Permissions | **Source pass** | Permission requests are contextual, purpose text is specific, and denial offers a non-blocking path. Device prompts still need verification. |
| Destructive actions | **Source pass** | Native alerts include cancel and destructive actions; archive is reversible and clearly explained. |
| Automated accessibility coverage | **Insufficient** | Content/token contracts exist, but no VoiceOver, accessibility-size, contrast, target, reduced-motion, or shield-isolation test was found. |

---

## Findings

### P1-01 — iOS VoiceOver may not announce form/global errors, and invalid submit does not recover focus

**Evidence**

- Shared inline field errors use only `accessibilityLiveRegion="polite"`: `asset-continuity-native/src/components/ui.tsx:491-499`.
- Shared global errors use only `accessibilityLiveRegion="assertive"`, with no `accessibilityRole="alert"` and no `AccessibilityInfo` announcement: `asset-continuity-native/src/components/ui.tsx:504-526`.
- Auth field errors repeat the same implementation: `asset-continuity-native/src/auth/components.tsx:171-179`.
- React Native documents `accessibilityLiveRegion` as **Android-only**. The current source contains no `AccessibilityInfo`, `announceForAccessibility`, or equivalent iOS path; see `accessibility-api-scan.txt`.
- Create-account validation sets error state and immediately returns, without focusing the first invalid field: `asset-continuity-native/app/(auth)/create-account.tsx:40-48`. Only password and confirmation refs exist at `:26-27`; the email field has no ref.
- Sign-in behaves the same way: `asset-continuity-native/app/(auth)/sign-in.tsx:38-41`, with only a password ref at `:26`.
- Household setup sets and returns on error without an announcement/focus path: `asset-continuity-native/app/(auth)/household.tsx:32-35`.
- Positive counterexample: attachment and Place-document errors add `accessibilityRole="alert"` in addition to a live region: `asset-continuity-native/src/components/AttachmentViewer/index.tsx:375-383` and `asset-continuity-native/src/components/PlaceDocumentRow.tsx:204-211`.

**Impact**

After activating a submit button, a VoiceOver user can remain on that button while inline errors appear elsewhere without a reliable iOS announcement. The user may not know submission failed or which field needs correction.

**Required fix**

- Centralize iOS-aware error announcement using an alert role and/or `AccessibilityInfo.announceForAccessibility`.
- Maintain refs for all required fields; after validation, focus the first invalid field and keep its descriptive text in the field hint/value relationship.
- Announce an error summary when multiple fields fail, without moving focus twice.
- Add component tests for labels/roles/states and a physical-iPhone VoiceOver submit/error journey.

**Relevance:** WCAG 2.2 **3.3.1 Error Identification**, **4.1.3 Status Messages**, **2.4.3 Focus Order**; iOS VoiceOver announcements.
**Standards:** [React Native accessibility](https://reactnative.dev/docs/accessibility), [WCAG error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification), [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages).

### P1-02 — Shared contrast tokens fail at live text and control-boundary call sites

**Evidence**

Deterministic sRGB calculations are in `contrast-calculations.txt`.

| Token/use | Foreground / background | Ratio | Required | Result |
|---|---|---:|---:|---|
| `textFaint` / `textSubtle` | `#737A81` / paper `#F6F7F3` | **4.041:1** | 4.5:1 | Fail |
| `textFaint` / `textSubtle` | `#737A81` / white `#FFFFFF` | **4.348:1** | 4.5:1 | Fail |
| `warning` | `#A96400` / paper `#F6F7F3` | **4.328:1** | 4.5:1 | Fail |
| `borderStrong` | `#A7ADB5` / paper `#F6F7F3` | **2.101:1** | 3:1 | Fail |
| `borderStrong` | `#A7ADB5` / white `#FFFFFF` | **2.261:1** | 3:1 | Fail |

Token sources: `packages/design-tokens/src/index.ts:31-44,69-74`; native mapping: `asset-continuity-native/src/theme/tokens.ts:3-20,43-56`.

Live failing text uses include:

- 11 pt capture choice metadata: `asset-continuity-native/app/capture/index.tsx:1366-1373`.
- 11 pt review labels: `asset-continuity-native/app/capture/index.tsx:1595-1600`.
- 12 pt readiness state on the paper canvas: `asset-continuity-native/src/components/AssetListItem.tsx:177-182`.
- 12 pt Vault status: `asset-continuity-native/app/(tabs)/vault.tsx:479-485`.
- Placeholders in shared/auth fields and Search: `asset-continuity-native/src/components/ui.tsx:475-489`, `asset-continuity-native/src/auth/components.tsx:154-169`, `asset-continuity-native/app/(tabs)/search.tsx:69-81`.

Live failing control-boundary uses include:

- Shared text fields: `asset-continuity-native/src/components/ui.tsx:791-804`.
- Auth fields: `asset-continuity-native/src/auth/components.tsx:428-441`.
- Search field boundary: `asset-continuity-native/app/(tabs)/search.tsx:189-207`.
- Shared secondary button boundary: `asset-continuity-native/src/components/ui.tsx:668-679`.

Positive token results: carbon text on paper is 16.690:1, muted text on paper is 5.409:1, danger on paper is 6.110:1, concrete on carbon is 7.943:1, and carbon on Volt is 13.625:1.

**Impact**

Small capture/status text is below AA contrast, and the shared field/search boundaries do not reach the 3:1 non-text threshold needed to distinguish controls from adjacent light surfaces.

**Required fix**

- Darken `textSubtle` and light-theme warning text to pass 4.5:1 on their actual background.
- Split semantic warning **text** from decorative warning **fill/icon** tokens if necessary.
- Raise active input/search/secondary-control boundaries to at least 3:1 or provide another persistent 3:1 identifying cue.
- Add automated contrast assertions for token/background pairs used by text and interactive boundaries.

**Relevance:** WCAG 2.2 **1.4.3 Contrast (Minimum)** and **1.4.11 Non-text Contrast**; Apple legibility/high-contrast guidance.
**Standards:** [WCAG contrast minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum), [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/).

### P1-03 — Dynamic Type and 320 pt reflow are not release-verified; source has high-risk fixed rows

**Evidence**

- Positive: no `allowFontScaling={false}` or restrictive `maxFontSizeMultiplier` exists, so React Native text scaling is not intentionally disabled; see `accessibility-api-scan.txt`.
- Positive: `AppScreen` uses vertical scrolling, automatic keyboard insets, and `KeyboardAvoidingView`: `asset-continuity-native/src/components/ui.tsx:37-114`.
- The only explicit compact typography path is the auth heading at width `<= 340`: `asset-continuity-native/src/auth/components.tsx:96-118,394-405`.
- Capture photo actions remain a fixed two-column row: `asset-continuity-native/app/capture/index.tsx:1399-1405`.
- Capture footer remains a fixed Back + primary-action row with no wrap/stack breakpoint: `asset-continuity-native/app/capture/index.tsx:630-660,1632-1647`.
- Capture label/action and inline-form headers use fixed horizontal distribution: `asset-continuity-native/app/capture/index.tsx:1450-1470`.
- Atlas selected-place command keeps precision copy and action on one row: `asset-continuity-native/app/atlas.tsx:334-365,574-594`.
- Vault status keeps icon + copy + a trailing value capped to 86 pt on one row: `asset-continuity-native/app/(tabs)/vault.tsx:338-357,454-485`.
- Asset rows keep name + readiness status on one row, with the status capped to 96 pt: `asset-continuity-native/src/components/AssetListItem.tsx:97-117,165-182`.
- Meaningful text is forced to one line in Atlas position and captured evidence filename: `asset-continuity-native/app/atlas.tsx:315-324`; `asset-continuity-native/app/capture/index.tsx:1058-1060`.
- No automated accessibility-size or 320 pt test was found; see `test-coverage-scan.txt`.

**Assessment limit**

This is a **release gate based on source risk**, not a claimed screenshot failure. Actual clipping, overlap, hidden actions, and focus visibility require a physical iPhone or approved browser capture.

**Required fix / verification**

- At Accessibility Sizes, stack action rows vertically, allow status/value blocks to wrap beneath the title, and avoid truncating retrieval-critical text.
- Use width/font-scale-aware variants rather than shrinking typography.
- Scale meaningful icons with text where they carry information.
- Test the complete journey at the smallest supported width and every iOS Accessibility Size, including keyboard open and Arabic once enabled.

**Relevance:** Apple Dynamic Type; WCAG **1.4.4 Resize Text** and, as a useful mobile layout benchmark, **1.4.10 Reflow**.
**Standards:** [Apple typography and Dynamic Type](https://developer.apple.com/design/human-interface-guidelines/typography), [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow).

### P1-04 — Arabic/RTL is an honest disabled preview, not a parity-complete release

**Evidence**

- Arabic is explicitly disabled in Vault and the UI truthfully says the preview is English-only: `asset-continuity-native/app/(tabs)/vault.tsx:263-281`.
- The shared bilingual dictionary contains only the limited navigation/basic noun set: `asset-continuity-native/src/i18n/copy.ts:5-85`.
- `useCopy` derives `rtl` from workspace language: `asset-continuity-native/src/i18n/copy.ts:87-97`.
- `AppScreen` sets `direction: "rtl"`: `asset-continuity-native/src/components/ui.tsx:53-64,573-575`; selected rows also reverse and directional arrows mirror, e.g. `asset-continuity-native/src/components/AssetListItem.tsx:65-86,97-123`.
- IBM Plex Sans Arabic fonts are loaded in `asset-continuity-native/app/_layout.tsx:5-16,42-46`.
- Most auth and data screens still contain hard-coded English, e.g. create-account `asset-continuity-native/app/(auth)/create-account.tsx:69-159`, sign-in `asset-continuity-native/app/(auth)/sign-in.tsx:58-139`, and Stack titles `asset-continuity-native/app/_layout.tsx:117-190`.
- Source contains no `I18nManager`, `accessibilityLanguage`, or global navigation-direction integration; see `accessibility-api-scan.txt`.
- Existing tests prove UTF-8/key parity and one Arabic Portfolio render, not end-to-end translation, visual reflow, navigation gestures, or VoiceOver order: `asset-continuity-native/tests/i18n-copy.test.ts:3-34`, `asset-continuity-native/tests/portfolioDashboard.test.tsx:127-142`, and `asset-continuity-native/tests/placePinEditor.contract.test.ts:155-160`.

**Impact**

Enabling Arabic now would produce mixed-language screens and uncertain VoiceOver pronunciation/order, back-navigation direction, and large-text layout.

**Required fix**

- Keep Arabic disabled until every user-visible and accessibility string is in the versioned copy contract.
- Apply locale/accessibility language at the app/screen boundary and integrate layout direction with native navigation.
- Verify visual order versus VoiceOver order, mirrored directional icons/gestures, numerals/dates, and field alignment on device.
- Run the same functional acceptance suite in English LTR and Arabic RTL.

**Relevance:** WCAG **1.3.2 Meaningful Sequence**, **2.4.3 Focus Order**, **3.1.2 Language of Parts**; iOS RTL and VoiceOver language behavior.
**Status nuance:** P1 before Arabic release; not a deception in the current English-only preview.

### P2-05 — PrivacyShield is visually opaque but does not isolate the underlying VoiceOver tree

**Evidence**

- `PrivacyShield` renders an opaque absolute overlay for non-active app states: `asset-continuity-native/src/components/PrivacyShield.tsx:13-55`.
- It sets `importantForAccessibility="yes"`: `:27-32`. React Native documents this prop as Android-only.
- It does not set `accessibilityViewIsModal`/`aria-modal`, and the protected Stack sibling is not marked `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`.
- The Stack and shield are siblings at `asset-continuity-native/app/_layout.tsx:87-98,193-195`.
- No PrivacyShield semantics/isolation test was found.

**Impact**

The visual app-switcher snapshot is covered, but the source does not tell iOS VoiceOver to ignore the sibling Stack while the shield exists. Actual inactive-state traversal is device-dependent and remains unverified.

**Required fix**

Toggle both sides of the accessibility boundary: make the shield modal to VoiceOver and hide the protected subtree while shielded; restore focus predictably when active. Test backgrounding, app switcher, Control Center, notification interruption, and resume with VoiceOver enabled.

**Relevance:** iOS privacy and VoiceOver modal isolation; WCAG **1.3.2** / **4.1.2 Name, Role, Value**.
**Standard:** [React Native `accessibilityViewIsModal` and hidden elements](https://reactnative.dev/docs/accessibility).

### P2-06 — Several recurring controls miss ALYR’s 44 pt target and Apple’s 44 pt default size

**Evidence**

The shared contract requires `minimumTouchTarget: 44`: `packages/design-tokens/src/index.ts:168-180`. The following Pressables are below 44 pt in one dimension and have no `hitSlop`:

| Control | Height | Source |
|---|---:|---|
| Spaces/Items filter chips | 40 | `asset-continuity-native/app/(tabs)/assets.tsx:302-325,437-450` |
| Asset editor “Add Place” | 36 | `asset-continuity-native/app/asset-edit.tsx:653-667,852-868` |
| Place “Edit Place” | 40 | `asset-continuity-native/app/place/[id].tsx:133-153,406-417` |
| Place “Add space” / “Attach” | 40 | `asset-continuity-native/app/place/[id].tsx:203-224,286-306,459-471` |
| Capture inline “Add Place” | 40 | `asset-continuity-native/app/capture/index.tsx:883-890,1450-1461` |
| Atlas “Open Place” | 42 | `asset-continuity-native/app/atlas.tsx:350-365,586-599` |

Positive controls:

- Shared primary is 54 pt, secondary 48 pt, IconButton 44×44: `asset-continuity-native/src/components/ui.tsx:648-704`.
- Auth back is 44×44 plus 8 pt hit slop: `asset-continuity-native/src/auth/components.tsx:47-60,351-357`.
- Atlas pins are 40×40 plus 6 pt hit slop (effective 52×52): `asset-continuity-native/app/atlas.tsx:279-305,511-515`.
- Error dismiss is 32 pt plus 8 pt hit slop (effective 48 pt): `asset-continuity-native/src/components/ui.tsx:514-525,829-838`.
- Native tab items are at least 52 pt: `asset-continuity-native/app/(tabs)/_layout.tsx:117-132`.

**Required fix**

Use the shared 44 pt minimum at call sites or add non-overlapping hit slop that produces at least 44×44. Add a lint/test helper that validates component usage, not only the token constant.

**Relevance:** ALYR design contract; Apple recommends a 44×44 pt default iOS control size (current HIG lists 28×28 pt as its absolute minimum); WCAG 2.2 **2.5.8** requires 24×24 CSS px, so the listed controls generally pass WCAG while missing the stronger ALYR/Apple target.
**Standards:** [Apple accessibility — mobility](https://developer.apple.com/design/human-interface-guidelines/accessibility/), [WCAG target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

### P2-07 — Reduced Motion contract exists but is not consumed by native runtime

**Evidence**

- Tokens define a reduced-motion variant: `packages/design-tokens/src/index.ts:182-196`.
- Source contains no `AccessibilityInfo.isReduceMotionEnabled`, `reduceMotionChanged`, or equivalent hook; see `accessibility-api-scan.txt`.
- Root and auth stacks force `animation: "default"`: `asset-continuity-native/app/_layout.tsx:87-98`; `asset-continuity-native/app/(auth)/_layout.tsx:5-13`.
- Opening inline Add Place always performs an animated spatial scroll: `asset-continuity-native/app/capture/index.tsx:417-421`.

**Assessment limit**

Native navigation may reduce some system transitions automatically. The current source has no explicit handling or test for custom motion, so actual iOS behavior remains unverified.

**Required fix**

Read and subscribe to the system preference; disable custom spatial travel/animated scroll when enabled; configure navigation transitions intentionally; add a deterministic reduced-motion state test and a physical-device check.

**Relevance:** Apple Reduce Motion; WCAG **2.3.3 Animation from Interactions** (AAA but an important native-platform expectation).
**Standards:** [Apple accessibility motion guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility/), [Apple `isReduceMotionEnabled`](https://developer.apple.com/documentation/uikit/uiaccessibility/isreducemotionenabled).

### P2-08 — Dynamic Search and generic loading states are not reliably announced

**Evidence**

- Search results recalculate and replace content on each query: `asset-continuity-native/app/(tabs)/search.tsx:21-58,91-180`.
- The input has a useful label and clear button: `:69-89`.
- The no-match message at `:164-177` has no alert/status semantics, and no result-count status exists for non-empty results.
- Root/index/tab bootstrap indicators have no accessible label or live announcement: `asset-continuity-native/app/_layout.tsx:54-59`, `asset-continuity-native/app/index.tsx:12-17`, `asset-continuity-native/app/(tabs)/_layout.tsx:19-24`.
- Positive counterexample: Portfolio loading supplies both a label and live region: `asset-continuity-native/app/dashboard.tsx:29-36`.

**Required fix**

Announce concise changes such as “3 items and 1 Place” or “No results” after a deliberate debounce, without moving focus. Give nontrivial loading states a meaningful label/busy state; avoid noisy announcements for brief redirects.

**Relevance:** WCAG **4.1.3 Status Messages**; iOS VoiceOver dynamic-content feedback.

### P2-09 — Inline Add Place and several forms lack explicit focus/return-key completion

**Evidence**

- Activating Add Place expands a substantial inline form and scrolls to the end: `asset-continuity-native/app/capture/index.tsx:417-421,569-605`.
- The new “Add a new place” title is plain text, with no header role or focus ref: `:571-580`.
- Closing removes the subtree but does not explicitly restore focus to the Add Place trigger: `:576-580`.
- Place editor sets `returnKeyType="next"` on Place and Region but supplies no `onSubmitEditing` focus chain: `asset-continuity-native/app/place-edit.tsx:145-177`.
- Space editor sets `returnKeyType="done"` but has no submit handler: `asset-continuity-native/app/space-edit.tsx:232-240`.
- Positive: auth forms chain Next/Go through refs and submit handlers: `asset-continuity-native/app/(auth)/create-account.tsx:105-158` and `asset-continuity-native/app/(auth)/sign-in.tsx:94-139`.
- Positive: AppScreen and capture use keyboard-aware scrolling and handled taps: `asset-continuity-native/src/components/ui.tsx:68-109`; `asset-continuity-native/app/capture/index.tsx:437-483,500-661`.

**Required fix**

Focus/announce the expanded form heading or first field, restore focus to the trigger on close, and wire editor return keys to the next field or save action with consistent `returnKeyType` wording.

**Relevance:** WCAG **2.4.3 Focus Order**, **3.2.1 On Focus**; VoiceOver and software-keyboard efficiency.

### P2-10 — Accessibility acceptance is not protected by automated or documented device tests

**Evidence**

- The design-token test checks only that the constant is `>= 44`, not that Pressable call sites use it: `packages/design-tokens/test/tokens.test.mjs:21-24`.
- RTL tests verify direction data, UTF-8 strings, key parity, and one dashboard render: `packages/contracts/test/contracts.test.mjs:24-27`; `asset-continuity-native/tests/i18n-copy.test.ts:3-34`; `asset-continuity-native/tests/portfolioDashboard.test.tsx:127-142`.
- No automated VoiceOver semantics/order, Dynamic Type/320, contrast, target-size usage, reduced-motion, or PrivacyShield isolation coverage was found; see `test-coverage-scan.txt`.

**Required fix**

Add semantic component tests plus a checked-in manual matrix for VoiceOver, Accessibility Sizes, Bold Text, Increase Contrast, Reduce Motion, RTL, keyboard, permissions, app switcher, and destructive confirmations. A physical iPhone remains mandatory because VoiceOver is not faithfully represented by web preview or simulator-only inspection.

### P3-11 — Section headings are visually styled but sparse in the VoiceOver rotor

**Evidence**

- `ScreenTitle` correctly uses `accessibilityRole="header"`: `asset-continuity-native/src/components/ui.tsx:163-184`.
- Shared `SectionHeader` renders its title as plain Text: `asset-continuity-native/src/components/ui.tsx:374-389`.
- Search and several record screens also use local visual section-title Text without heading semantics, e.g. `asset-continuity-native/app/(tabs)/search.tsx:91-125,149-161` and `asset-continuity-native/app/asset/[id].tsx:285-288,356-359`.

**Impact**

Long Passport, Place, Vault, and Search screens expose fewer rotor landmarks than their visual hierarchy suggests.

**Required fix**

Give meaningful section titles a heading role, keeping decorative kickers/eyebrows out of the rotor.

**Relevance:** WCAG **1.3.1 Info and Relationships**; iOS VoiceOver heading rotor.

---

## Platform-native strengths verified in source

### VoiceOver semantics

- Shared primary/secondary/icon buttons expose button role and disabled/busy state: `asset-continuity-native/src/components/ui.tsx:252-370`.
- Screen titles and progress bars expose header/range semantics: `asset-continuity-native/src/components/ui.tsx:163-184,392-409`.
- Filters, categories, location choices, currencies, language, and Place-pin controls use radio/radiogroup state rather than color alone.
- Atlas hides the decorative SVG from assistive technology and supplies labeled pin controls plus a complete native Place list: `asset-continuity-native/app/atlas.tsx:175-181,279-305,420-469`.
- Place-pin UI offers manual coordinates and current-location actions alongside the map: `asset-continuity-native/src/components/PlacePinEditor/index.native.tsx:30-97`; `asset-continuity-native/src/components/PlacePinEditor/EditorControls.tsx:159-224,285-368`.

### Modal/back and destructive behavior

- Quick Passport is a native modal and catches back/swipe removal when a draft exists: `asset-continuity-native/app/_layout.tsx:108-115`; `asset-continuity-native/app/capture/index.tsx:160-181`.
- Editors disable gestures and use `beforeRemove` destructive confirmation, e.g. `asset-continuity-native/app/_layout.tsx:128-172`, `asset-continuity-native/app/asset-edit.tsx:194-216`, `asset-continuity-native/app/place-pin.tsx:107-129`.
- Archive explains that it preserves data, has Cancel, is marked destructive, and can be restored: `asset-continuity-native/app/asset/[id].tsx:159-202,467-491`.
- Demo reset and signed-account exit use native alerts with cancel/destructive actions: `asset-continuity-native/app/(tabs)/vault.tsx:85-129`.

### Permissions and recovery

- iOS purpose strings are specific to camera/location actions: `asset-continuity-native/app.config.ts:19-27,67-87`.
- Camera, library, and location permission requests occur only after explicit feature actions: `asset-continuity-native/src/adapters/capture.ts:21-70`; `asset-continuity-native/src/adapters/location.ts:9-36`.
- Permission denial offers “Not now” and system Settings while preserving the draft/allowing continuation: `asset-continuity-native/app/capture/index.tsx:201-208,243-301`; `asset-continuity-native/app/place-pin.tsx:145-163`.
- File-size and picker failures explicitly say the original/draft is unchanged: `asset-continuity-native/app/capture/index.tsx:229-286`.

These are source-level passes. The exact native permission copy, Settings return path, camera interruption, and VoiceOver behavior must still be checked on an installed iPhone build.

---

## Remediation sequence

| Order | Work package | Exit condition |
|---:|---|---|
| 1 | iOS announcement + invalid-field focus primitive | Every auth/capture/editor error is announced once; first invalid field receives focus; no duplicate speech. |
| 2 | Contrast token correction | Automated pairs pass 4.5:1 text and 3:1 essential control boundaries on every actual background. |
| 3 | Accessibility-size responsive variants | Core journey has no clipped/overlapping/hidden text or actions at smallest supported width and largest Accessibility Size. |
| 4 | Focus/isolation hardening | Privacy shield isolates the Stack; inline expansions transfer and restore focus; search/loading updates announce appropriately. |
| 5 | 44 pt call-site enforcement | All recurring controls meet 44×44 by frame or non-overlapping hit slop. |
| 6 | Reduce Motion runtime | Custom spatial motion is removed/replaced when the setting is enabled. |
| 7 | Arabic completion | Full string parity, native direction/language, mirrored navigation, VoiceOver order, dates/numerals, and large-text tests pass before toggle enablement. |
| 8 | Physical-iPhone release run | VoiceOver, Dynamic Type, Bold Text, Increase Contrast, Reduce Motion, permissions, keyboard, privacy shield, and destructive journeys all pass signed-build parity. |

## Device verification queue

The following checks require fresh screenshots and/or a physical iPhone. They remain **unverified**, not failed:

1. **320 pt / smallest-width reflow:** auth create/sign-in, Today, Spaces + filters, Quick Passport every step, inline Add Place, Asset Passport, Place, Atlas, Vault.
2. **Largest Accessibility Size:** repeat the same journey with keyboard open; confirm every action remains visible and scroll-reachable.
3. **VoiceOver:** swipe order, rotor headings, radio state, globe alternative, map alternatives, validation error announcement/focus, search/no-result status, modal entry/exit, and privacy shield.
4. **RTL:** once enabled, screenshot and traverse every route in Arabic; verify back gestures/arrows, visual/source order, numerals, dates, fields, truncation, and pronunciation.
5. **System settings:** Bold Text, Increase Contrast, Button Shapes, Reduce Motion, Differentiate Without Color, Smart Invert.
6. **Lifecycle/privacy:** background to app switcher, Control Center, notification interruption, resume, and account switch.
7. **Permissions:** first request, deny, selected-photo access, Open Settings, return, camera interruption, and location accuracy copy.

Recommended evidence filenames:

- `01-auth-default.png`, `02-auth-ax5-error.png`
- `03-today-default.png`, `04-today-ax5.png`
- `05-spaces-320.png`, `06-capture-footer-ax5.png`
- `07-inline-place-focus.png`, `08-atlas-ax5.png`
- `09-vault-increase-contrast.png`, `10-privacy-app-switcher.png`
- `voiceover-traversal-notes.md`, `rtl-traversal-notes.md`

## Evidence files

- `accessibility-api-scan.txt` — platform API presence/absence.
- `border-contrast-usages.txt` — shared border token call sites.
- `browser-capture-blocker.txt` — visual-capture limitation.
- `contrast-calculations.txt` — deterministic contrast ratios.
- `contrast-token-usages.txt` — failing text-token call sites.
- `dynamic-type-source-inventory.txt` — scaling/reflow-related source inventory.
- `keyboard-navigation-inventory.txt` — return-key/focus-chain inventory.
- `scope.txt` — audited runtime versions and working-tree scope.
- `source-interaction-inventory.txt` — semantic interaction inventory.
- `sub-44-dimensions.txt` — raw dimension candidates; the report filters out decorative/non-target false positives.
- `test-coverage-scan.txt` — accessibility/RTL test coverage.
- `manifest.sha256` — SHA-256 verification for the evidence bundle.
- `relevant-test-run.txt` — current-run output for 3 relevant suites / 17 passing tests.

## Reference standards

- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)
- [Apple Human Interface Guidelines — Typography / Dynamic Type](https://developer.apple.com/design/human-interface-guidelines/typography)
- [React Native Accessibility](https://reactnative.dev/docs/accessibility)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow)
- [WCAG 2.5.8 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)
- [WCAG 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)
