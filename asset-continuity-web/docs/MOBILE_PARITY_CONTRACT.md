# Asset Continuity — Web, iOS, and Android Parity Contract

Status: binding production/native parity target with a limited current-web baseline  
Purpose: validate one product on the web without allowing the later native apps to become different products

## 1. Parity principle

Web, iOS, and Android must produce the same user understanding, decisions, domain transitions, access consequences, and saved records. They do not need pixel-identical chrome. Native apps should use native controls where that improves capture, security, accessibility, or platform trust while preserving the approved Asset Continuity visual language.

“Same” means behavioral and semantic parity. “Adapted” means platform-appropriate presentation.

Parity requirements apply when the corresponding feature is implemented and
versioned. They are not evidence that every target capability has already been
validated on the web. The current baseline is limited to:

- Home, Assets, Family, and Vault navigation.
- The checked-in routes and URL-addressable Search/Capture/Settings/Help
  overlays.
- Intent-first Global Add with six common asset shortcuts, the complete
  version-1 taxonomy, and parent-first Room/material continuation.
- Exact or deliberately user-placed Place pins, nested room/zone/container
  paths, and time-ranged asset-location assignments with immutable historical
  snapshots.
- Universal paper, artifact, media, record, note, and link materials with
  `pending` and user-reviewed states. The original material's physical storage
  path is tracked separately from the parent Asset's location.
- Account- and generation-scoped on-device originals, recoverable drafts,
  content-derived immutable versions, and atomic workspace-plus-file capture.
- One reciprocal Place/property-passport projection for a newly created
  owned/co-owned property; rented and managed Places remain location-only.
- The current fixed asset-readiness selector.
- A five-outcome First Useful Vault guide: one Place, five active assets, one
  complete-enough passport, one reviewed source, and one successful Search
  retrieval.
- Sample/Personal isolation, account-and-household-scoped browser workspaces,
  demo invitations, archive, readable demo JSON export, and manual encrypted
  recovery/optional local-service backup.

Production authorization, multi-record materials and universal document
abstractions, managed object storage, automatic sync, conflict resolution,
audited retention, and protected export remain targets rather than current web
baselines.

## 2. What must be identical

| Contract | Required parity |
|---|---|
| Product promise | Find, evidence, manage, and pass on what matters. |
| Top-level IA | Home, Assets, Family, Vault. |
| Global actions | Search is global; Capture is contextual. |
| Activation | Target: secured household, Place, room evidence, five records, passport, proof, and Search retrieval. The current five-outcome guide checks one Place, five active assets, one 100% current passport, one reviewed material, and one successful Search retrieval; it does not yet count secured-account or room-evidence outcomes. |
| Domain | Current native baseline matches the versioned workspace plus its integrated canonical collector bridge, capture, security, and recovery contracts. The production service model still requires a later versioned API contract. |
| Truth model | Assertion, evidence, human review, and legal truth stay distinct. Current web stores originals and permits inline viewing only for allowlisted raster types; other originals are download-only. Review means the user checked their record, not authenticity. |
| Capture entry | Show Car, Motorbike, Watch, Real estate, Digital asset, and Physical item first; preserve canonical leaf IDs and require a concrete real-estate leaf. Place, Room or zone, and Paper or artifact remain separate support actions. |
| Parent continuity | Room cannot exist without a Place; material cannot exist without an Asset. If the parent is absent, create it first and resume the original action on every platform. |
| Location truth | Address search, measured device location, an adjustable map pin, manual coordinates, and Add later remain distinct choices. A device GPS Place fix is exact only at 15 m horizontal accuracy or better; weaker fixes remain approximate, while a user-confirmed pin is labeled user placed without invented measured accuracy. Assets use the same nested room/zone/container hierarchy. Location changes use `MOVE_ASSET`, never a generic asset edit; Place pin/address and room/container corrections close the active assignment and append a revision with immutable historical snapshots. |
| Property projection | An owned/co-owned property is one concept with a Place for pins/rooms and exactly one reciprocally linked real-estate Asset Passport for title, value, insurance, and proof. Rented, managed, family, third-party, and unknown Places never imply ownership or auto-create a passport. |
| Memory continuity | Capture asks whether the subject is a physical object, story, person, or moment. Only a physical subject asks for Place/room. People are canonical records; living identity needs granted consent and an explicit public label, while unknown status fails closed and ambiguous same-name records never silently merge. |
| Material storage and review | The parent Asset's location and the original paper/artifact's storage are independent. Material storage supports known, needs-detail, unknown, external-custodian, and not-applicable states with actor-attributed correction history. A usable source is required. File-backed review is enabled only after the stored original's record ID, name/type/size, and SHA-256 match canonical evidence metadata. Replacing any file-identity field revokes review and reopens its proof task; a missing original may be reattached and reviewed only after the replacement passes the same check. |
| Atomic local capture | File-backed standard capture, document pages, and room-photo sessions commit the next workspace, current-file pointers, immutable versions, generation head, and idempotency receipt in one IndexedDB transaction. A failed or stale transaction publishes neither metadata nor orphan bytes. |
| Importance | Ordinary, Important, Critical, and Legacy are target vocabulary; no current asset importance field exists. |
| Readiness | Current parity means the exact fixed seven-component selector and labels. Any normalized/partial replacement requires a contract version. |
| State machines | Match implemented reducer transitions first; introduce richer production transitions only through the shared contract. |
| Permissions | Same deny-by-default capability and field-scope outcomes after the production permission model exists. |
| Search | Current parity covers local assets, Places, spaces, materials, and members plus an actor-attributed successful-retrieval activity that never stores the private query. Authorization-before-ranking, global filters, and explicit match explanations are production targets. |
| Destructive actions | Current parity covers confirmed local reset and terminal asset archive. Reauthentication, recovery windows, deletion, and reversible archive are targets. |
| Status language | Current web uses local-demo and pending/reviewed language. Queued/uploading/processing/synced begins only with acknowledged production operations. |
| Portable recovery | Web, iOS, and Android may use native file/document pickers, but format/version, encrypted context, review-before-replace, missing-original state, and manual-not-cloud language remain identical. |
| Collector Care & Goals | One Asset Passport remains canonical; collector profiles are reconciled facets. Condition/service history appends, targets and research wishes remain explicit, and health/completion use the same derived selectors. |
| Original storage and delivery | Originals are account/household and recovery-generation scoped. Replacement creates or reuses a content-derived immutable version and moves only the current pointer. PDF, HEIC/HEIF/AVIF photos, MP4/MOV video, supported audio, text, Word, and Excel originals may be stored. Only JPEG/PNG/WebP/AVIF may render inline after access policy; HEIC/HEIF, PDF, audio, video, active content, office, and unknown originals remain download-only until a separately generated safe rendition exists. |
| Account isolation | The current browser remounts an account-and-household-scoped workspace for an authenticated session and scopes metadata, generations, drafts, recovery markers, and IndexedDB originals accordingly. Sign-out returns to the separate local-demo scope; moving local records into an account requires an explicit verified claim. The optional local service binds encrypted backup context to the authenticated household. This is prototype device isolation, not production tenant authorization, managed key custody, or cross-device sync. |
| Content | Same labels, warnings, consequences, empty states, and recovery guidance. |
| Accessibility outcome | Every critical flow operable without vision, precision pointing, color, or motion. |
| Analytics semantics | Same versioned production event names and activation definitions once analytics exists; the prototype has no analytics pipeline. |

## 3. What may adapt by platform

| Concern | Responsive web | iOS | Android |
|---|---|---|---|
| Primary navigation | Left rail on wide screens; bottom bar on narrow web | Native bottom tab bar | Material/native bottom navigation |
| Secondary context | Right pane, drawer, or dialog | Sheet, navigation stack, popover on iPad | Bottom sheet, navigation stack, side pane on large screen |
| Search | Command overlay/full-screen mobile web | Native search presentation and keyboard behavior | Native search presentation and keyboard behavior |
| Capture | File picker, browser camera where supported | AVFoundation/native camera and document scanner | CameraX/native camera and document scanner |
| Authentication | WebAuthn/passkey | AuthenticationServices + Keychain/Secure Enclave | Credential Manager/passkey + Keystore |
| Local persistence | Account/generation-scoped IndexedDB device store in the prototype; managed encrypted-at-rest strategy required for production | SQLite/SQLCipher plus protected files | SQLite/SQLCipher plus protected files |
| Share/import | Drag/drop, file input, Web Share where supported | Share extension and document picker | Share target and Storage Access Framework |
| Notifications | Web push only where supported, generic copy | APNs, generic sensitive-content-safe copy | FCM, generic sensitive-content-safe copy |
| Back behavior | Browser Back closes overlay then route | Navigation stack and native swipe | System Back predictive behavior |
| Haptics | Optional and non-essential | Native confirmation/error haptics | Native confirmation/error haptics |
| Typography | Responsive web scale | Dynamic Type | Scaled pixels/font scale |

No adaptation may hide a consequence, weaken permission preview, change readiness meaning, or turn a contextual action into a separate product area.

## 4. Shared visual language

All platforms use:

- Premium midnight surfaces with high legibility.
- Restrained violet-to-cyan accents for focus, active state, and priority.
- The globe as a memorable Home visualization, never the sole way to access a Place.
- Quiet navigation and utility surfaces.
- Consistent modern line icons with text or accessibility labels.
- Generous hierarchy and disciplined density rather than decorative card stacks.
- 44 × 44 CSS pixel/point minimum targets, or the stricter native platform minimum.
- Identical status colors plus icons/text; color alone never conveys state.
- Designed light/dark equivalence when light mode is introduced.

Platform controls can look native, but screens must feel recognizably part of the same product.

## 5. Shared domain package

This package is a prerequisite for native implementation; it does not exist yet.
The current web reference consists of `src/domain.js`, `src/taxonomy.js`, and
their tests. There are no OpenAPI-generated transport types, shared error-code
catalog, permission vocabulary, or cross-platform package today.

The team should maintain a platform-neutral contract package containing:

- Stable record identifiers and OpenAPI-generated transport types.
- Category and attribute schema versions.
- Domain command names and error codes.
- Readiness calculators and What counts descriptors.
- Task deduplication and priority rules.
- State-machine transition tables.
- Money/date/uncertainty representations.
- Search filter vocabulary.
- Permission capability and field-group vocabulary.
- Localization message keys, not platform-rendered components.
- Analytics event names and prohibited payload rules.

The server remains authoritative for permissions, membership, exports, and acknowledged sync. Shared client code improves consistency but never replaces server enforcement.

## 6. Navigation parity

Every platform exposes:

```text
Home
Assets
Family
Vault
```

Search:

- Reachable from every destination.
- Preserves underlying context.
- Restores focus/position when dismissed.
- Supports the same filters and match explanations.

Capture:

- Reachable from Home, Place, Room, Asset, and Vault/document context.
- Prefills the same context.
- For current parity, the first view shows Car, Motorbike, Watch, Real estate,
  Digital asset, and Physical item, followed by Browse all 64 categories.
- Place, Room or zone, and Paper or artifact appear under Organize & support.
- Real estate opens its group; quick leaves persist the same canonical IDs.
- Missing Place/Asset parents start a parent-first continuation and resume the
  original Room/material action after the parent save.
- Memory capture first chooses physical object, story, person, or moment. Only a
  physical memory enters the location stage; all four retain the same canonical
  asset/taxonomy identity and consent-safe people-link contract.
- Returns to the initiating record or its new result.

Capture Studio's Document and Room tools are part of the current web baseline:
document pages commit as ordered asset-linked materials after explicit review,
and room-photo batches commit at an exact Place plus room/zone. A universal
multi-record Document abstraction, Quick Item versus Asset Passport depth, and
production extraction/version workflows remain targets.

Deep links:

- Map to the same semantic destination even when the platform URL mechanism differs.
- Current invalid record IDs show a safe Record unavailable state.
- Unauthorized/expired-link secrecy and retired/merged-ID redirects begin with
  the production authorization and redirect contracts.

## 7. Data and sync parity

All production clients use the same visible progression:

```text
On this device → Queued → Uploading → Processing → Synced
                         ↘ Needs attention ↗
```

Required behavior:

1. Stable client-generated ID before upload.
2. Idempotent retry.
3. Non-overlapping changes merge.
4. Ownership, permissions, value, identifier, lifecycle, and location conflicts require visible resolution.
5. Originals are checksummed and immutable. Review requires a byte-level
   SHA-256 match to canonical identity; replacing name, type, size, checksum, or
   bytes revokes review and reopens the proof task.
6. “Backed up” appears only after durable server acknowledgement.
7. Revoked access overrides queued edits.
8. Unsynced contributions remain recoverable without revealing newly forbidden content.
9. Missing originals can be reattached without recreating the material record,
   but the replacement remains pending until its new identity and SHA-256 pass
   the same integrity gate.
10. Location history syncs as revisions: a move or Place/room correction closes
    the active assignment and appends another, preserving old Place and
    room/container path snapshots.

Native background execution may improve delivery but cannot change the meaning of states.

## 8. Accessibility and localization parity

Every critical flow must pass:

- English LTR.
- Arabic RTL.
- Mixed Arabic/English names, identifiers, and addresses.
- Screen reader order and descriptive control labels.
- Large text without clipped consequences or actions.
- Keyboard-only web operation.
- Switch/voice-access compatible native operation.
- Reduced motion.
- Increased contrast.
- Portrait, landscape sanity, and device rotation where supported.

The semantic reading order follows the product hierarchy, not visual CSS/animation order.

## 9. Platform-specific acceptance

### Web

The following is the target web acceptance matrix, not a completed current pass:

- Chrome, Edge, Safari, and Firefox in the supported matrix.
- Direct routes, refresh, Back, Forward, deep-link recovery.
- Keyboard focus and browser zoom through 200%.
- File import, drag/drop where available, and mobile camera fallback.
- Globe failure falls back to List.

Current automated evidence covers domain/taxonomy/property-linkage,
collector/capture/security/recovery/file-policy behavior; jsdom
UI/recovery/Care & Goals/Capture Studio/accessibility/globe behavior; the local
authenticated API and persistence boundary; account-scope isolation; and
Sites/static routing. The production/Sites build passes and `npm audit` reports
zero vulnerabilities. Current-run browser inspection covers Home,
exact place pinning, precise asset location, original photo/file attachment,
the document, room-photo, and label Capture Studio tools, Vault, Memories, Art
collection, and Private References. The Vault has also been inspected at a
same-origin 390 × 844 viewport; earlier evidence covers the approved mobile
reference comparison. There is no production-like browser E2E suite, completed
cross-browser/responsive matrix, or real-device validation.

Browser prototype scopes are now separated by authenticated account and
household, including metadata, generations, drafts, recovery state, routes,
Search visibility, and IndexedDB originals. Account switching and sign-out
remount the matching scope, and the local encrypted-backup flow verifies
household context. This does not complete the production tenant-isolation gate:
server-authoritative authorization, managed encryption/key lifecycle,
production backup retention, multi-device revocation, and full browser E2E
negative coverage remain required.

### iOS

- VoiceOver and Dynamic Type through accessibility sizes.
- Passkey, secure storage, permission-denial recovery, camera interruption.
- Share extension import.
- Background/termination restoration for a 20-photo capture.
- App-switcher snapshot hides vault content.

### Android

- TalkBack and large font/display size.
- Credential Manager, Keystore, permission-denial recovery, camera interruption.
- Share target import.
- Process-death restoration for a 20-photo capture.
- Recent-apps snapshot hides vault content.

## 10. Parity review process

For every feature:

1. Approve one canonical flow and business-rule spec.
2. List platform adaptations before implementation.
3. Add shared contract/domain tests.
4. Add platform E2E tests using the same Given/When/Then outcomes.
5. Capture the same states at reference viewports/devices.
6. Review copy, action order, consequences, and status — not only pixels.
7. Record any deliberate deviation as an ADR with owner and expiry/revisit date.

## 11. Parity release gate

A platform cannot call a feature complete when:

- It creates a different record shape or state transition.
- It omits an access/destructive consequence.
- It calculates readiness differently.
- It describes local-only data as synced or protected.
- Search leaks a count/snippet hidden elsewhere.
- Capture cannot recover from interruption.
- Arabic/RTL or assistive technology makes the critical flow unusable.
- The same deep link opens a semantically different destination.
- A platform-specific shortcut bypasses confirmation or reauthentication.

Native implementation entry is not yet approved by this document alone. The
shared production contract, target browser journeys, accessibility/localization
matrix, and visual review must first satisfy `QA_MATRIX.md`.
