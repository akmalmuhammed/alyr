# Asset Continuity — Web QA Matrix and Release Gates

Status: required validation plan for the canonical web-first app  
Rule: a visually polished happy path is not sufficient; state, business-rule, accessibility, and recovery coverage are release requirements

This matrix is a target release plan, not a record that every row currently
passes. Current automated evidence is narrower:

- Domain and integration coverage spans taxonomy, reciprocal property links,
  exact Place/location history, separate original-material storage, the
  canonical collector bridge, Care & Goals, Capture Studio, atomic file
  capture/versioning, security/sync contracts, portable recovery, and file
  policy.
- jsdom coverage spans critical app flows, account-scope switching and
  sign-out, recovery, Care & Goals, Capture Studio, accessibility smoke, and
  globe fallback behavior.
- Local authenticated API/persistence and Sites/static-routing suites cover the
  local service and deployable routing boundaries.
- Production/Sites build passes.
- `npm audit` reports 0 vulnerabilities.
- Current-run browser DOM and layout inspection covers Welcome, Home, exact
  Place pinning, precise asset location, universal material/file capture,
  Search, Vault, Memories, Art collection, Private References, and the
  document, room-photo, and label Capture Studio tools at desktop widths.
  Interaction checks include local account creation, encrypted
  household-bound backup durable acknowledgement, checksum/decrypt review, QR
  generation/persistence/deactivation, and Add-to-Studio routing.
- Current-run responsive inspection covers Home, exact asset location, and
  material capture at a narrow mobile viewport with no horizontal overflow;
  the earlier Vault and approved Home/reference comparisons remain supporting
  evidence.

There is no production-like browser E2E suite, cross-browser pass, full
responsive screenshot matrix, or real-device validation yet. The focused
desktop/mobile inspection passed, but it is not production responsive sign-off.
Current visual evidence is tracked in `design-qa.md`.

## 1. Test layers

| Layer | Purpose | Minimum evidence |
|---|---|---|
| Domain/unit | Invariants, readiness, state transitions, task deduplication | Deterministic automated tests |
| Component | Fields, dialogs, status, list, search, globe fallback | Interaction and accessibility assertions |
| Integration | Router, repository, migration, import/export, derived read models | Automated tests with storage/error adapters |
| E2E | Complete user outcomes | Production-like browser tests |
| Visual | Layout, hierarchy, overflow, states | Current-run screenshots at required viewports |
| Accessibility | Keyboard, screen reader semantics, contrast, zoom, reduced motion | Automated scan plus manual critical-flow pass |
| Localization | English, Arabic/RTL, mixed text, currencies/dates | Screenshot and interaction pass |
| Resilience | Refresh, tab close, quota/write error, offline simulation, globe failure | Automated fault injection and manual confirmation |
| Security/privacy | Permission-safe UI, no sensitive telemetry/status claims | Review plus negative tests |

## 2. Required viewports

Capture and inspect the same canonical states at:

| Class | Viewport | Expected shell |
|---|---:|---|
| Wide desktop | 1440 × 900 | Full rail, central workspace, contextual right pane |
| Desktop | 1280 × 800 | Full/compact rail, useful globe and context without crowding |
| Small laptop | 1024 × 768 | Compact rail, contextual drawer/stack, no clipped primary action |
| Tablet portrait | 768 × 1024 | Compact rail or bottom nav per layout rule; stacked detail |
| Mobile reference | 393 × 852 | Bottom nav, stacked Option 3 composition |
| Small mobile | 360 × 800 | No horizontal scroll; primary actions and status remain visible |
| Narrow stress | 320 × 568 | Functional emergency minimum; no hidden consequence text |
| Zoom stress | Desktop at 200% | Reflow without loss of control or content |

Landscape mobile and 1366 × 1024 tablet receive a sanity pass for dialogs, camera/file flows, and virtual keyboard overlap.

## 3. Browser matrix

| Browser | Desktop | Mobile/tablet | Gate |
|---|---:|---:|---|
| Chrome current and previous | Required | Android current | Critical E2E + visual |
| Edge current | Required | N/A | Critical E2E smoke |
| Safari current and previous | Required on macOS | iOS/iPadOS current and previous | Critical E2E + visual |
| Firefox current | Required | Android sanity | Critical E2E smoke |

Unsupported WebGL/globe conditions must pass the same product outcomes through List view.

## 4. Target canonical visual-state matrix

Each row will require a current-run screenshot on desktop and mobile; tablet is
required where layout changes. A fixed 1280 × 720 inspection has covered Home,
Assets, Family, Vault, Place, Asset, Search, Help, and Capture, but the complete
responsive/reference capture matrix is not currently complete.

| Surface | States |
|---|---|
| Welcome | Sample/Personal choice, returning user, sample unavailable |
| Onboarding | Language/RTL, household, region, intent, resume, save failure |
| Home | Active priority, all caught up, empty personal vault, offline/local-only, globe fallback |
| Globe/list | No places, one place, clustered regions, selected place, unavailable visualization |
| Place | New/empty, partially documented, complete, address unavailable, archived |
| Room | Empty, capture draft, processing simulation, notable proposals, stale evidence |
| Assets | Empty, populated, filtered, zero-filter result, archived, long names |
| Asset Passport | Quick record, full passport, pending proof, conflict, memory item, deletion pending |
| Capture | Action chooser, room, item, document, memory, permission denied, interrupted |
| Search | Initial, results, OCR/story match reason, no result, archived search, permission-safe |
| Family | No members, invited, access preview, expired/revoked, access changed |
| Vault | No documents, processing, suggestions pending, versions, export preview/failure |
| Lifecycle | Move access preview, loan/service, lost/stolen, dispose, archive, recover |
| Global | Loading, toast/success, recoverable error, modal destructive confirmation, not found |

## 5. Interaction matrix

### Navigation and history

- All four top-level destinations work from rail and bottom bar.
- Active destination is conveyed by text/semantics, not color alone.
- Direct URL, refresh, Back, and Forward restore valid state.
- Back closes Search, Capture, drawer, or dialog before leaving the underlying route.
- Invalid ID, merged ID, expired invite, and unauthorized ID show correct safe recovery.
- Household switch preserves no stale record from the previous household.

### Search

- Open by visible control and keyboard shortcut.
- Escape/close restores focus to the trigger.
- Query, clear, filters, and result-open work by keyboard and pointer.
- Result match reason is visible.
- Zero-result actions start the correct flow.
- Hidden records do not affect counts, suggestions, or snippets.

### Globe and places

- Drag/rotate/selection does not trap scroll or keyboard focus.
- Selecting a marker synchronizes Place list and detail.
- List selection synchronizes globe when available.
- Reduced motion and non-WebGL fallback are complete.
- Approximate coordinates are labeled; location permission is optional.
- A device fix at 15 m horizontal accuracy is exact; 15.01 m or worse is
  approximate. The UI keeps the measured accuracy/source visible and offers
  address, pin, or coordinate fallback when device location fails.
- Correcting a Place pin/address or room/container path closes the active
  assignment and appends a revision; a closed history row keeps its old Place
  and nested-path snapshot.

### Forms and capture

- Labels remain associated with fields.
- Validation occurs near the field and in an error summary when needed.
- Partial entry survives route/modal interruption.
- Double submit cannot duplicate a record.
- File drop has a keyboard/file-picker equivalent.
- Unsupported, corrupt, duplicate, and processing-failed files have recovery.
- A paper/artifact's original storage is entered independently from the parent
  Asset's location. Known storage requires a Place plus room/container or
  locator clue; needs-detail, unknown, external-custodian, and not-applicable
  remain explicit, and corrections append actor-attributed history.
- PDF, HEIC/HEIF/AVIF photos, MP4/MOV video, supported audio, text, Word, and
  Excel originals persist with canonical name/type/size/SHA-256 identity.
- Inline original preview is restricted to JPEG, PNG, WebP, and AVIF.
  HEIC/HEIF, PDF, audio, video, active content, office, and unknown files remain
  download-only until a separately generated safe rendition exists.
- File-backed **Mark reviewed** stays disabled until the locally loaded original
  matches record ID, name/type/size, and SHA-256 metadata. Missing originals can
  be reattached; any replacement remains pending until it passes that check.
- File-backed standard capture, ordered document pages, and room-photo batches
  commit workspace metadata, current file pointers, content-derived immutable
  versions, the scoped generation head, and an idempotency receipt atomically.
  Aborted, stale, or failed commits leave neither orphan metadata nor orphan
  bytes, and a response-lost retry returns the same committed result.
- Camera/microphone denial offers an alternate path.

### Destructive and sharing actions

- Preview names every affected scope or safely summarizes large counts.
- Expansion of access and export requires explicit confirmation; production reauthentication is specified.
- Revoke, archive, delete, merge, move, and dispose are not icon-only.
- Delete communicates recovery window and irreversible expiry.
- Moving a record previews place-derived access changes.

## 6. Production/native target business-rule matrix

The rows below preserve the intended product rules. They are not all represented
by the current flat prototype schema. Currently implemented and tested subsets
include Sample/Personal and account/household storage isolation; exact Place
pins and nested indoor paths; time-ranged asset location assignments; one
reciprocal Place/property-passport projection; universal materials with
separate original-storage state/history; pending material review with an
integrity gate; content-derived immutable originals; atomic
workspace-plus-file capture and portable recovery; fixed asset readiness;
explicit unknown-location states; archive immutability; collector
history/health/showcase safety; OCR/room/label state-machine contracts;
encrypted-envelope integrity; offline conflict contracts; the five-outcome
First Useful Vault/Search retrieval guide; and prevention of duplicate
demo-member emails.

| Rule | Positive case | Negative/recovery case |
|---|---|---|
| One property projection | Owned Place opens linked real-estate passport | Duplicate creation is blocked/merged by explicit choice |
| Property tenure | New owned/co-owned Place may atomically create exactly one reciprocal passport | Rented, managed, family, third-party, or unknown Place never implies ownership or auto-creates a passport |
| Primary location | Move closes old and creates new assignment | Two simultaneous current primary locations rejected |
| Physical findability | Known physical item has a current Place plus room/container or useful locator clue | Place-only, virtual, and not-applicable shortcuts normalize to incomplete or unknown |
| Property pin truth | Known real estate has a user-confirmed exact point on its canonical Place | Suggested address, approximate GPS, or unconfirmed coordinates stay needs-detail |
| Device Place accuracy | GPS fix at 15 m or better records exact | Fix over 15 m records approximate; unavailable/denied device location offers another method |
| Location mutation boundary | `MOVE_ASSET` changes the current Place/room/locator and appends history | `UPDATE_ASSET` cannot change any location field or bypass assignment history |
| Location correction revision | Place pin/address or room/container path correction closes the active assignment and appends a corrected one | Closed Place and nested-path snapshots never follow later Place/space edits |
| Original-material storage | Known original storage preserves Place plus room/container or locator; external custody and honest incomplete/unknown states remain searchable | Parent Asset location never silently becomes the paper/artifact storage location, and a correction never rewrites prior snapshots |
| Ownership total | 100% or below can save | Above 100% blocked; below 100% warns |
| Immutable evidence | Replace creates a version | Original bytes never overwritten |
| Atomic file capture | Standard file capture, ordered document pages, and room photos publish one workspace/file generation | Abort, stale head, checksum failure, or retry cannot leave partial metadata, orphan bytes, or duplicate evidence |
| Integrity-gated review | Usable non-file source or identity/SHA-256-matched file enables explicit review | Empty source, missing original, metadata mismatch, or checksum mismatch cannot become reviewed |
| Replacement review revocation | Reattached/replaced original gets a new canonical identity and can be reviewed after verification | Any change to name, type, size, or checksum revokes review and reopens the proof task |
| Missing-original recovery | Correct replacement reattaches to the same material and returns to pending | Missing state cannot be bypassed by marking reviewed |
| Suggestion confirmation | User confirms extracted field | AI/OCR suggestion never becomes material truth alone |
| Readiness | Confirmed/evidence-backed components add credit | AI-only or inapplicable work cannot distort score |
| Memory Item | Physical object, story, person, and moment are searchable and rediscoverable; only physical asks for Place | Nonphysical subjects cannot gain a false physical location or count toward current totals/readiness |
| Memory people | Canonical person/link persists private relationship context; granted living-person consent plus explicit public label permits showcase | Unknown/declined consent, missing public label, or an ambiguous same-name match fails closed |
| Task deduplication | One active requirement task | Reprocessing cannot create duplicates |
| Search permission | Allowed records rank correctly | Forbidden record existence cannot be inferred |
| Last owner | Transfer then leave/delete | Removing the last owner is blocked |
| Lifecycle | Loan changes custody | Loan does not sell/archive/change ownership |
| Archive/delete | Archive reverses | Delete uses tombstone/recovery window |
| Sample/Personal boundary | Starting Personal contains no sample records | Resetting Sample from Personal requires impact preview and explicit confirmation |
| Portable recovery kit | Current-version workspace and available originals decrypt, review, and restore | Weak/wrong passphrase, future schema, tampering, orphan, duplicate, size, or checksum mismatch fails before workspace replacement |
| Account/household scope | Active session mounts only its scoped metadata, generations, drafts, recovery state, routes, Search results, exports, backups, tasks, and originals | Account switching, sign-out, or a foreign-household kit never exposes the prior scope; local records move only after the account generation is durably verified, then the local generation is cleared |
| First Useful Vault retrieval | One Place, five active records, a complete-enough passport, reviewed material, and successful Search retrieval complete the current guide | Opening the guide, typing a query, or a failed/no-result Search never counts as retrieval, and the private query is never written to activity |
| Collector pride | Story, care, provenance, and findability create gentle next actions | Price and completeness never become competitive scores |
| Canonical collector bridge | Asset/collection/material changes reconcile one rich collector state | No duplicate Asset Passport or stale simple/rich membership is created |
| Care history | New condition and service observations append by stable ID | Retrying the same record ID is idempotent and never overwrites prior history |
| Collection goals | Targets, research wishes, and explicit matches persist | Candidate matches never auto-fill a target or become marketplace pressure |
| Original delivery | JPEG/PNG/WebP/AVIF renders inline after integrity/access checks; PDF, HEIC/HEIF, MP4/MOV, audio, text, Word, and Excel can be stored | HEIC/HEIF, PDF/audio/video/active-content/office/unknown original remains download-only without a safe rendition |
| Private financial reference | Institution, alias, owner context, and masked final four are usable | Credentials, full account numbers, seed phrases, OTPs, and unsafe URLs fail closed |

## 7. Data-volume and content stress

Test with:

- Zero records.
- One place and one record.
- First Useful Vault seed.
- Hundreds of assets across dozens of rooms.
- 10,000 searchable records for performance validation.
- Duplicate titles, serials, and media checksums.
- 20-photo room evidence draft.
- Long Arabic/English names and addresses.
- Unknown, exact, approximate, range, and circa dates.
- Multiple currencies and values hidden by permission.
- Large document, corrupt file, unsupported format, OCR failure, and multi-linked proof.

No list may depend on a small seed count for layout or correctness.

## 8. Accessibility gate

### Automated

- No critical axe violations on all canonical routes/states.
- Valid landmark structure and one logical page heading.
- Every control has an accessible name and state.
- Dialogs have name, description where useful, focus trap, and focus return.
- Form errors are programmatically associated.
- Color contrast meets WCAG 2.2 AA.
- Touch targets are at least 44 × 44 CSS pixels unless an equivalent spaced target applies.

### Manual

1. Complete the First Useful Vault journey keyboard-only.
2. Complete Search and open a result with a screen reader.
3. Understand readiness without seeing color or the globe.
4. Complete Family access preview and revoke.
5. Read every destructive consequence at 200% zoom.
6. Verify reduced motion removes non-essential orbit/transition animation.
7. Confirm visible focus is never obscured by sticky nav or dialogs.
8. Confirm status announcements are useful and not excessively noisy.

Critical actions cannot be clipped at large text or hidden behind hover.

## 9. Arabic and RTL gate

- Direction changes immediately and persists.
- Rail/bottom nav, breadcrumbs, drawers, dialogs, chevrons, progress, and form order mirror appropriately.
- Globe geography does not mirror; surrounding controls do.
- Mixed identifiers, serials, dates, email, currency, and Arabic names remain readable.
- Text does not overflow action buttons or status chips.
- Search matches localized names and mixed text.
- No icon implies the wrong direction after mirroring.
- Arabic critical journeys pass keyboard/screen reader review where applicable.

## 10. Performance and visual-quality gate

Prototype targets:

- Semantic Home content is usable before the globe finishes.
- Route transitions do not flash an empty shell.
- No unexpected layout shift when the globe or icons load.
- Lists remain responsive with hundreds of rows using pagination/virtualization as needed.
- Search feedback begins immediately and does not block input.
- No horizontal body scroll at any required viewport.
- No text overlap, clipped focus, hidden consequence, or inaccessible hover-only content.
- Gradients remain restrained to globe, priority, and active/focus accents.
- Navigation and utility surfaces stay visually quiet.
- Icon stroke, size, optical alignment, and labels are consistent.

Production budgets remain under 1 second p75 for acknowledged-cache Home, under 300 ms p95 for 10,000-record local search, sustained 60 fps for common navigation, and at least 99.8% crash-free sessions.

## 11. Privacy and honesty gate

The web prototype must not claim:

- Encryption or secure vault storage.
- Durable backup or cross-device sync.
- Production tenant isolation, managed key custody, or remote revocation. The
  current account/household-scoped browser repository and authenticated local
  backup service prove a same-device prototype boundary only.
- Real invitation delivery or immediate revocation.
- Malware scanning.
- Official/verified ownership.
- Guaranteed value or insurance coverage.
- Restorable protected export.
- Active emergency release.

Telemetry and logs must not include asset names, queries, OCR text, values, addresses, identifiers, evidence, or document contents. Permission-safe UI is tested at navigation, list, detail, Search, task, notification preview, and export.

The shared-browser topology has been replaced by account-and-household-scoped
providers, cache/generation keys, drafts, recovery state, and IndexedDB
originals. Account switching and sign-out remount the matching scope; explicit
claim is required before local records become account records; foreign-household
backup/restore material is rejected. Production alpha still requires
server-authoritative authorization, managed encryption and device lifecycle,
production-like cross-account E2E coverage across routes/Search/export/backup,
and independently validated retention/revocation.

## 12. Target critical browser E2E journeys

Future release-candidate browser tests:

1. Sample Space → Home → select globe/list Place → open an Asset Passport → global Search → retrieve by identifier.
2. Personal Vault → create household/region → add owned Place → verify linked property projection.
3. Place → add room → save room evidence → review proposal → promote item.
4. Assets → Quick Item → add ownership/location/visibility → save → complete proof.
5. Capture → Memory Item → search by story phrase → mark found.
6. Vault → add document → pending suggestion → confirm field → link to two assets → version replacement.
7. Family → create invitation → configure scope/field groups → preview → revoke.
8. Asset → move → preview access changes → confirm → verify history/current location.
9. Home task → explain source → complete/snooze/dismiss → no duplicate regeneration.
10. Export preview → select scope → verify redactions → simulated failure → retry same snapshot.
11. Save-failure injection → preserve draft → retry exactly once.
12. Globe/WebGL failure → use List to complete the same Place flow.
13. Collection Care → append condition/service history → refresh → verify the
    dated records and derived health remain.
14. Collection Goals → define target → add research wish → explicitly match an
    existing piece → verify completion changes without creating a new asset.
15. Persist PDF/audio/video/active-content original → open evidence detail →
    verify no inline original is rendered and Download original remains
    available.
16. Capture Place from device GPS at 15 m then 15.01 m accuracy; verify exact
    then approximate labeling; adjust/confirm a pin; place an asset in a nested
    room/container.
17. Edit a generic asset with forged Place/space/location fields; verify the
    fields and history do not change; use Move; verify one closed and one active
    assignment.
18. Correct a Place pin and rename/reparent a room/container; verify the active
    revision is closed/replaced and every older snapshot retains its historical
    pin, address, and path.
19. Open a reviewed file material; replace one file-identity field; verify
    review is revoked and proof reopens; remove the original; reattach a
    matching original; pass SHA-256 verification; explicitly review again.
20. Capture physical object, story, person, and moment memories; verify only the
    physical subject asks for location; link two canonical people; verify
    living/unknown consent and public-label showcase fail-closed states.
21. Sign in as account A, create metadata and an original, sign out, then sign
    in as account B; verify no A route, search result, export, backup, task,
    metadata, or IndexedDB original is observable.

## 13. Release gates

### Prototype user-test gate

- Build and automated suites pass from a clean install.
- All critical E2E journeys pass.
- Current-run screenshots are inspected at required viewports.
- No P0/P1 visual, interaction, accessibility, or business-rule issue remains.
- P2 issues have an owner and do not obscure state, action, or consequence.
- Demo/security limitations are visible at their point of relevance.
- Product/design/engineering agree the canonical flows are ready for moderated testing.

**Current status:** not passed as a production user-test gate. The automated
domain, UI, file/recovery, account-scope, local-service, and routing suites pass;
the build passes; and `npm audit` reports zero vulnerabilities. The integration
baseline includes the canonical collector bridge, functional Care & Goals,
exact Place/indoor location, reciprocal property projections, separate
original-material storage, atomic file-backed capture/versioning, scoped
browser recovery, First Useful Vault/Search retrieval, and the live
download-only original policy. Focused desktop and narrow-mobile visual
inspection passed, but the target browser E2E journeys, cross-browser matrix,
and remaining responsive/device review are incomplete.

### Production web alpha gate

In addition to the prototype gate:

- Identity, authorization, tenant isolation, and field-scope negative tests pass.
- Durable upload, acknowledged sync, backup restore, and complete export pass.
- Search/list/detail/task/export have identical permission outcomes.
- File quarantine/safe rendering is verified.
- Recovery and last-owner constraints are verified.
- Critical/high security findings are resolved.
- Arabic/RTL and assistive-technology critical journeys are usable.
- Migration has rehearsed rollback or roll-forward.
- Production artifact matches the reviewed exact commit.

**Current blocker:** the browser now provides tested local account/household
scope separation and the local service verifies household-bound encrypted
backup context, but neither is production identity or authorization. The first
production-alpha criterion remains open until deployed server enforcement,
managed keys/devices, revocation, and production-like cross-account negative
journeys pass.

### Native development entry gate

iOS/Android implementation begins only when:

- Canonical flows, terminology, state machines, readiness, and permissions are signed off.
- OpenAPI/shared domain contracts are versioned.
- Responsive web user tests reveal no unresolved navigation-model problem.
- Mobile parity contract has named owners and test fixtures.
- A technical spike validates native capture, passkey, encrypted local save, Arabic/RTL, large text, and 60 fps navigation.

## 14. Automatic release blockers

Do not release when any is true:

- Known cross-household, field-scope, Search, notification, or export leak.
- Browser metadata, originals, routes, search, export, backup, or sign-out state
  is not isolated by the authenticated account/household.
- Original evidence can be silently overwritten.
- A file material can become or remain reviewed without a matching SHA-256
  integrity check, or changing file identity fails to reopen its proof task.
- A generic asset edit can change location without `MOVE_ASSET`, or a Place/
  room correction rewrites a closed location snapshot.
- Retry can duplicate an asset, document, task completion, or evidence session.
- Readiness implies AI, legal, ownership, authenticity, or insurance certainty.
- A critical journey loses work on refresh, interruption, or save failure.
- Globe failure prevents access to a Place.
- Destructive/sharing consequence is hidden or icon-only.
- Arabic/RTL, keyboard, screen reader, large text, or reduced-motion critical journey is unusable.
- Production security, backup, sync, or export claims are unverified.
- Required production responsive, cross-browser, and real-device visual evidence
  has not been completed in the current run.

## 15. Category-first and materials regression matrix

| Area | Required checks |
| --- | --- |
| First open | Item first, Place first, sample, return after refresh |
| Category search | Car, automobile, motorbike, watch, land, property, custom |
| Global Add | Car, Motorbike, Watch, Real estate, Digital asset, Physical item, Browse all 64, Place, Room or zone, Paper or artifact |
| Hierarchy | Stable leaf ID, full path, root filter includes descendants |
| Category profile | Current web renders all profile fields as optional; taxonomy `required` flags are not enforced and must not become a native-only rule |
| Location | Domain preserves known, needs-detail, unknown, virtual, and not-applicable; device GPS is exact only at 15 m or better; nonphysical memory remains not-applicable even in Place context; `UPDATE_ASSET` cannot bypass `MOVE_ASSET`; closed Place and room/container snapshots are immutable |
| Property projection | Owned/co-owned Place can atomically create one reciprocal real-estate passport; rented/managed/family/third-party/unknown Places remain location-only; normalization fails closed on invalid or conflicting links |
| Global asset capture | Never preselects the first Place |
| Contextual capture | Explicit Place is preserved and shown at Review |
| Materials | Paper, artifact, media, record, note, link |
| Original-material storage | Parent Asset location remains independent; known, needs-detail, unknown, external-custodian, and not-applicable states retain immutable Place/path snapshots and actor-attributed correction history |
| Parent-first recovery | Room creates/selects a Place first; material creates/selects an Asset first; no orphan is persisted |
| Material validation | Kind-specific source requirements and recoverable errors |
| Original formats | Store PDF, HEIC/HEIF/AVIF, MP4/MOV, supported audio, text, Word, and Excel; render inline only JPEG/PNG/WebP/AVIF; every other original is download-only without a safe rendition |
| Atomic file capture | Standard file capture, Document Scan, and Room Capture commit workspace plus originals once; stale/aborted/retried operations cannot publish a partial generation |
| Review state | New is `pending`; non-file sources must be usable; file review requires matching canonical identity and SHA-256; identity replacement revokes review/reopens proof; missing original can be reattached; `rejected` is preserved by normalization but has no current UI command |
| Memory subjects | Physical object uses location; story/person/moment skip location; canonical people require consent-safe, explicit public labels and never silently merge ambiguous same-name people |
| First Useful Vault/Search | Current guide requires Place, five active assets, one 100% passport, one reviewed source, and one successful actor-attributed retrieval; activity never stores the private query |
| Account scope | Local-demo and every account/household isolate metadata, generations, drafts, recovery, originals, routes, Search, export, and backup context |
| Search | Assets, Places, spaces, materials, and members are searchable; each result type must open its exact semantic record and record only a successful retrieval |
| Globe | Full orb, real markers, asset-count sizing, explained lines, atlas parity |
| Fallback | List completes the same selection and Place-open journey |
| Narrow web | No horizontal loss at 390 px; all six quick asset intents and the support actions remain reachable |
