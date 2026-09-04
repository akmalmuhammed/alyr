# Heldat liabilities and net-position test blueprint

**Audit date:** 2026-07-28

**Surface:** `asset-continuity-native`, shared contracts, Supabase sync/export, and Maestro

**Purpose:** Define the evidence required before Heldat may present a household's recorded liabilities and a true, current net-position dashboard.

## 1. Current evidence

The targeted regression set passed during this audit:

- **16 Jest suites / 101 tests**
- **5 Maestro flows / 2 subflows / 15 selector contracts** passed static validation

The existing suite is strong for:

- exact integer-backed asset and owned-property values;
- separate currency totals;
- hidden-by-default amount privacy;
- local atomic commits and foreground sync;
- Recovery Kit round trips;
- sample/personal workspace isolation;
- Arabic RTL foundations.

The current Portfolio explicitly says liabilities are outside the calculation and deliberately avoids a net-worth label. At the audit snapshot, no committed liability-specific test suite existed. Liability source work visible in the shared worktree was still in flight and therefore was treated as unverified.

## 2. Truth contract to freeze before UI work

Heldat should use **recorded net position**, not an unqualified “net worth,” unless every completeness requirement below is satisfied.

For each currency:

```text
latest valid recorded asset/property values
- latest active recorded liability balances
= recorded net position
```

Required invariants:

1. Currencies stay separate; Heldat applies no implicit exchange rate.
2. Missing values and missing liabilities mean **unknown**, never zero.
3. A household needs an explicit dated “liabilities complete” or “no liabilities” acknowledgement before an empty liability register may represent zero.
4. An unvalued active item or owned property makes the relevant portfolio status partial.
5. A stale amount may remain visible with its real as-of date, but it does not receive a “current” label.
6. A negative result is valid and must retain its sign in visual and assistive output.
7. Safe-integer overflow produces “exact total unavailable,” not a rounded number.
8. Create, update, and delete are versioned, idempotent, household-scoped operations.
9. Delete uses a tombstone. It leaves the active calculation while remaining available to audit, export, conflict handling, and Recovery Kit history.
10. Privacy visibility applies equally to assets, liabilities, and the resulting net position.

### Freshness decision gate

Before implementation, Product must freeze one exported, deterministic freshness policy for:

- item values;
- owned-property values;
- mortgage balances;
- vehicle/personal-loan balances;
- credit-card balances;
- other liabilities.

Selectors must accept an injected reference date. Tests must cover the exact threshold and threshold-plus-one-day boundary. A hidden `new Date()` inside a selector would make the result timezone-dependent and hard to reproduce.

## 3. Requirement-to-test matrix

| Requirement | Acceptance invariant | Reuse from current suite | Exact automated test target | Device/E2E evidence |
|---|---|---|---|---|
| New personal workspace | Empty workspace says “not started”; it does not show `0` net position. First action remains obvious. | `createWorkspace("personal")`; new-workspace case in `portfolioDashboard.test.tsx`; auth sequence contracts | Extend `asset-continuity-native/tests/portfolioDashboard.test.tsx`, `homePortfolio.contract.test.ts`, and `onboardingDecision.contract.test.ts` | Add first-run assertions to `.maestro/flows/00-auth-entry-smoke.yaml` after deterministic preview onboarding |
| Sample workspace | Sample contains clearly labelled illustrative asset values and liabilities in at least two currencies; no live-price implication | `SAMPLE_PORTFOLIO_VALUES`; `samplePayoff.test.ts`; `createWorkspace("sample")` | Extend `asset-continuity-native/tests/samplePayoff.test.ts` with deterministic liabilities, explicit disclosure state, and expected net-position rows | Extend `.maestro/flows/02-returning-today-portfolio-atlas.yaml` to open the sample net-position detail |
| Sample-to-personal boundary | Converting sample to personal produces an empty liability register and no copied sample amounts | `createPersonalWorkspaceReplacement`; sample/session vault tests | Extend `asset-continuity-native/tests/sampleConversionState.test.ts`, `sampleConversionFlow.test.tsx`, and `session-vault-boundary.test.tsx` | Keep `.maestro/subflows/start-sample-workspace.yaml`; assert personal conversion starts clean in a focused new flow |
| Add liability | Name, category, exact minor-unit amount, currency, as-of date, household, stable UUID, version 1, and on-device status are persisted atomically | `parsePortfolioMoney`; `context()` pattern; `seededRepository()` | New `asset-continuity-native/tests/liabilities.test.ts`; new `liabilityState.test.tsx`; extend `repository.test.ts` | New `.maestro/subflows/add-liability.yaml` using test IDs, not coordinates |
| Edit liability | Stable liability ID; observed version matches; version increments; previous balance remains in history/audit; visible result uses latest valid as-of date | Value-history tests in `assetValue.test.ts` and `placePortfolioValue.test.ts`; provider state pattern | `liabilities.test.ts`, `liabilityState.test.tsx`, and `foregroundSync.test.ts` | New `.maestro/flows/05-liability-lifecycle.yaml`: add, edit, verify updated amount and dated history |
| Delete liability | Typed destructive confirmation; local tombstone + `liability.delete` commit are atomic; active total updates; repeated delete is idempotent; no silent resurrection | Asset lifecycle and `value.delete` test-server support | `liabilities.test.ts`, `liabilityState.test.tsx`, `repository.test.ts`, `foregroundSync.test.ts`, `syncConflictFlow.contract.test.ts` | Continue `05-liability-lifecycle.yaml`: delete, confirm absence from active list, reopen history/audit surface |
| Asset/property regression | Latest active item and explicitly owned-Property values remain the only gross-value subjects; archived/non-owned/orphan values stay out | Existing `portfolio.test.ts`, `placePortfolioValue.test.ts`, `lifecycle.test.ts` | Keep these files as mandatory regression dependencies; add a cross-model case to new `netPosition.test.ts` | Existing Portfolio Maestro route plus one property-linked net-position assertion |
| True per-currency subtraction | Each currency row subtracts only same-currency liabilities; liability-only currency supports a negative recorded subtotal | Existing exact currency helpers and overflow cases | New `asset-continuity-native/tests/netPosition.test.ts` | Sample flow asserts separate QAR and USD rows and no combined grand total |
| Liability completeness | One recorded liability in QAR does not imply zero USD liabilities. Completeness is explicit per household and, if the UI claims per-currency completion, per currency | No current equivalent; this is a new truth boundary | `netPosition.test.ts` plus dashboard copy assertions in `netPositionDashboard.test.tsx` or `portfolioDashboard.test.tsx` | Maestro verifies “partial” before acknowledgement and “recorded” after acknowledgement |
| Unknown values | Unvalued active subjects stay in coverage gaps; unknown liabilities suppress an unqualified net-position headline | `unvaluedAssetIds`, `unvaluedPlaceIds`, current Portfolio attention list | `netPosition.test.ts`; extend `portfolioReviewRouting.test.ts` and dashboard component tests | Navigate from partial-status CTA to the exact missing-value/liability list |
| Stale values | Threshold boundary is deterministic; stale rows retain amount/date but lose “current” status; future dates are rejected | Future-date cases in `assetValue.test.ts` | `netPosition.test.ts`, `liabilities.test.ts`, and dashboard component tests; use exported policy constants | Simulator clock-independent fixture flow; physical device checks visible stale badge and Dynamic Type |
| Exact arithmetic | Zero/positive/negative net positions, 0/2/3-decimal currencies, and overflow all remain exact | `assetValue.test.ts`; `portfolio.test.ts` | `netPosition.test.ts` with QAR, KWD, JPY, negative net, and `Number.MAX_SAFE_INTEGER` overflow cases | Component labels checked in English/Arabic; no visual-only arithmetic |
| Privacy hidden by default | Gross, liability, and net amounts are hidden visually and from accessibility labels until explicitly revealed | `portfolioPrivacy.test.ts`, `portfolioPrivacyBoundary.test.tsx`, current Dashboard hidden-label tests | Extend those two files and dashboard tests to inspect every new label; add a focused liability-row privacy test | Background/app-switcher real-device check; Maestro may validate reveal/hide while foregrounded |
| App privacy shield | Inactive screen removes the whole financial tree from accessibility and shows one modal shield | `privacyShield.contract.test.ts`; `DeviceAuthProvider` background tests | Extend `privacyShield.contract.test.ts` with a rendered net-position tree probe; retain source contract | Physical iPhone app-switcher screenshot and VoiceOver tree check |
| Offline create/update/delete | Snapshot and outbox commit together; process death restores exact liability state and pending operation; sample mode creates no cloud outbox | `MemoryWorkspaceRepository`; `SQLiteWorkspaceRepository`; `seededRepository`; current offline Maestro flow | `liabilityState.test.tsx`, `repository.test.ts`, `sqliteVaultIsolation.test.ts`; extend SQLCipher mock state assertions | New `.maestro/flows/06-net-position-offline-restart.yaml`; Android airplane mode provides hard network-disconnection proof |
| Idempotent sync | Retry sends the same operation/idempotency key; two devices converge with no duplicate liability | `TestSyncServer`, `repositoryWith`, `assertSuccess`, retry/cursor tests | Extend `foregroundSync.test.ts`; move reusable server fixture to `tests/helpers/testSyncServer.ts` before the file grows further | Two signed test devices or simulator + device against pilot API |
| Edit conflict | Concurrent updates show durable `needs-attention`; local draft remains visible until user chooses cloud/local | Existing asset conflict test and `captureConflictContexts` | Extend `foregroundSync.test.ts`, `conflictInbox.test.ts`, and `syncConflictFlow.contract.test.ts` for `conflictKind: "value"` or a reviewed `"liability"` kind | Manual two-device acceptance: choose each resolution once |
| Delete-vs-edit conflict | A tombstone and a stale edit never silently resurrect or silently erase the record | Existing test server supports versioned delete; no focused assertion yet | Add both operation orders to `foregroundSync.test.ts` and pgTAP sync tests | Manual two-device acceptance with explicit conflict consequence copy |
| Roles and RLS | Owner/editor may mutate according to policy; viewer reads only; cross-household reads/writes and counts are denied | `session-vault-boundary.test.tsx`, `capabilityPolicy.test.ts`, family/admin pgTAP | Extend `capabilityPolicy.test.ts`, `viewerPermissionUi.contract.test.ts`, `supabase/tests/database/rls_and_sync.test.sql`, `schema.test.mjs` | Signed owner/editor/viewer accounts on pilot project |
| Cloud schema/sync | Liability table, constraints, RLS, immutable audit/change ledger, idempotent create/update/delete, and pull tombstones are covered | Property-value migration and `property_value_sync.test.mjs` are the closest template | New migration; extend `supabase/tests/schema.test.mjs`; add `liability_sync.test.mjs`; extend `database/rls_and_sync.test.sql`; update `supabase/openapi.yaml` and generated contract test | Local Supabase pgTAP, then authenticated live pilot probe |
| Readable/cloud export | Raw liabilities, history/tombstones, disclosure status, currencies, dates, and versions export under household scope; computed net may be derived but raw facts remain authoritative | `httpCloudExport.test.ts`, local export tests, export completion pgTAP | Extend `supabase/tests/database/export_completion.test.sql`, `export_completion.test.mjs`, `export_api.local.mjs`, and `httpCloudExport.test.ts` | Download pilot export, checksum it, inspect one household fixture |
| Recovery Kit | Active liabilities, history, disclosure, tombstones, and exact integer values round-trip; encrypted bytes reveal no financial strings | `RecoveryTestCrypto`, `request()`, `memoryStorage()`, atomic restore tests | Extend `recoveryKit.test.ts` and `recoveryJourney.test.ts`; add liabilities to canonical workspace fixture and equality assertions | Signed build: create kit, reinstall/clear app, restore, compare dashboard |
| Arabic RTL | All liability categories, states, confirmations, stale/partial explanations, and negative values have Arabic copy and RTL layout; currency codes remain intelligible | `LocaleProvider`; `rtlCoreJourney.test.tsx`; Arabic Dashboard tests; `StyleSheet.flatten` | Extend `i18n-copy.test.ts`, `rtlCoreJourney.test.tsx`, dashboard/form tests, and `errorSurfaceLocalization.contract.test.ts` | Extend `.maestro/flows/04-arabic-rtl-smoke.yaml` through Portfolio → liabilities; physical VoiceOver check |
| Accessibility | Inputs have labels/hints/errors; first invalid input receives focus; delete confirmation names consequence; rows expose status without leaking hidden amount; controls meet 44pt target | Auth error-focus tests, capture accessibility tests, `touchTarget.contract.test.ts` | New `liabilityFormAccessibility.test.tsx`; extend `touchTarget.contract.test.ts`, dashboard tests, and form-error focus contract | VoiceOver, Dynamic Type, Reduce Motion, and landscape/small-screen acceptance |

## 4. Minimum domain scenario table

`netPosition.test.ts` should include every row below. The expected label is part of the product truth contract, not merely presentation copy.

| Scenario | Expected result |
|---|---|
| Empty personal workspace | No amount; status `not-started` |
| QAR asset, no liability register/disclosure | Gross value visible when revealed; net position not calculated |
| QAR asset, explicit dated “no liabilities” acknowledgement | QAR net equals QAR gross; status depends on asset-value completeness/freshness |
| QAR asset 100, QAR liability 25 | QAR recorded net 75 |
| QAR asset 100, QAR liability 125 | QAR recorded net -25 |
| QAR asset and USD liability | Two rows; no currency conversion and no combined total |
| One QAR liability plus an asset-valued USD row with no USD liability disclosure | USD liability status remains unknown; it is not treated as verified zero |
| Liability-only currency | Negative recorded subtotal; overall status remains partial unless portfolio/disclosure completeness is proven |
| One unvalued active item | Recorded subtotal may display, but status is partial and CTA targets that item |
| Stale liability, fresh asset | Real amount/date visible; no “current” claim |
| Fresh liability, stale property value | Real amount/date visible; no “current” claim |
| Invalid/future/wrong-household record | Excluded, counted as ignored, never coerced |
| Exact-total overflow | `null` exact result and “exact total unavailable” |
| Deleted liability | Excluded from active subtotal; tombstone remains in history/export |

## 5. Strongest reusable helpers

| Helper | Location | Best reuse |
|---|---|---|
| `createWorkspace("sample" | "personal")` | `asset-continuity-native/src/domain/sample.ts` | Deterministic empty and populated households |
| `context()` | `tests/assetValue.test.ts` and `tests/placePortfolioValue.test.ts` | Stable IDs, times, and local calendar dates |
| `parsePortfolioMoney`, `formatPortfolioMoney` | `src/domain/portfolio.ts` | Exact minor-unit input and bilingual display |
| `seededRepository()` | `tests/assetValueState.test.tsx` | Provider + atomic snapshot/outbox assertions |
| `MemoryWorkspaceRepository` and `createLocalOperation` | `src/data/*`, used by `repository.test.ts` | Local-first command durability |
| `TestSyncServer` | `tests/foregroundSync.test.ts` | Idempotent push/pull, version conflicts, tombstones, two-device convergence |
| `repositoryWith`, `emptyWorkspace`, `assertSuccess` | `tests/foregroundSync.test.ts` | Compact two-device sync scenarios |
| SQLCipher mock + `inMemoryKeyStore()` | `tests/sqliteVaultIsolation.test.ts` | Process restart, household isolation, durable conflict/outbox state |
| `RecoveryTestCrypto` | `tests/helpers/recoveryTestCrypto.ts` | Deterministic encrypted Recovery Kit journeys |
| `memoryStorage()` and recovery `request()` | `tests/recoveryJourney.test.ts` | Create/preview/restore and household binding |
| `LocaleProvider` + `StyleSheet.flatten` | `tests/rtlCoreJourney.test.tsx`, `sampleConversionFlow.test.tsx` | Arabic copy, font, direction, and layout |
| `PortfolioPrivacyProvider`, `Boundary`, `VisibilityProbe` | `tests/portfolioPrivacyBoundary.test.tsx` | Account/household-scoped amount visibility |
| `start-sample-workspace.yaml` | `.maestro/subflows/` | Stable signed-out sample entry |
| `validate.mjs` selector contract | `.maestro/validate.mjs` | Enforce test IDs and coordinate-free Maestro flows |

`TestSyncServer`, `repositoryWith`, and the deterministic mutation context are the highest-value candidates to extract into `tests/helpers/` before liability coverage multiplies scenarios.

## 6. Required Maestro additions

### New selectors

Add these to the static selector contract after the real screens exist:

```text
portfolio-net-position
portfolio-net-position-visibility
liabilities-list
liability-add
liability-name
liability-category
liability-amount
liability-currency
liability-as-of
liability-save
liability-edit
liability-delete
liability-delete-confirm
liability-status
```

### New journeys

1. **`05-liability-lifecycle.yaml`**

   Sample or deterministic personal fixture → Portfolio → add mortgage → verify partial/recorded status → edit balance → delete with confirmation.
2. **`06-net-position-offline-restart.yaml`**

   Airplane mode → add/edit liability → process restart → exact record and pending sync state remain → connectivity restored.
3. Extend **`04-arabic-rtl-smoke.yaml`** through Portfolio and the liability form.
4. Extend **`02-returning-today-portfolio-atlas.yaml`** to verify the Today net-position entry and sample dashboard.

The validator should require the new selectors and reject coordinate taps, as it does today.

## 7. Release gates

The feature is ready for a pilot only when all gates pass:

1. Domain truth scenarios pass for every currency/completeness/staleness state.
2. Create/edit/delete persist atomically and survive restart.
3. Two-device create/edit/delete conflict tests converge with no duplicate or silent resurrection.
4. RLS denies cross-household reads, writes, counts, exports, and search fragments.
5. Recovery Kit and cloud export retain liabilities, history, disclosure, and tombstones.
6. Hidden amounts stay absent from visual text, accessibility labels, and inactive-app snapshots.
7. English and Arabic component suites pass with Dynamic Type/VoiceOver acceptance on a physical iPhone.
8. Maestro static validation and executable journeys pass against the final signed binary.
