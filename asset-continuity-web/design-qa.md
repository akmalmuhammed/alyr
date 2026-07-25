# Design QA — continuity foundation, collectors, care, and recovery

Date: 2026-07-25  
Reference: `C:\Users\akmal\.codex\generated_images\019f917c-1cff-7b02-a9f7-1c4225dee436\call_sUjN6yMMISdgIXEHyzVAawON.png`

## Current result

The web prototype passes the current P0 product review for the capabilities
below. Scoped visual evidence and the remaining pixel-capture boundaries are
listed separately:

- A mobile Home that explains the product and exposes one useful next action
  above the bottom navigation.
- Honest Place positioning through address search, device location, adjustable
  pin, manual coordinates, or an explicit Add later state.
- Direct, focused asset-location editing with complete nested retrieval paths
  and visible history.
- Real on-device file selection, camera capture, validation, SHA-256 metadata,
  safe inline raster preview, recoverable drafts, and a dedicated
  evidence-detail view.
- Premium collection list/detail experiences for collectibles, art, family
  memories, and other user-curated groups.
- A reconciled collector bridge that keeps each Asset Passport canonical while
  deriving collector identity, memberships, materials, and dated histories
  inside the same saved workspace.
- A functional Care & Goals tab with derived collection health, completion,
  due-care explanations, append-only condition and service records, deliberate
  collection targets, research wishes, and explicit matching to an existing
  piece.
- A living-memory atlas that connects ordinary objects to people, period,
  origin, story, and future intention without turning continuity into a score.
- A private art exhibition with provenance, condition, edition, and personal
  meaning kept in the same collection experience.
- Private-reference language that explicitly rejects passwords, PINs, seed
  phrases, private keys, and full financial account numbers.
- A review-first portable recovery flow that encrypts the current workspace and
  available originals, keeps the passphrase memory-only, and distinguishes
  manual recovery from cloud backup or sync.
- A cohesive Capture Studio where document pages attach to an Asset Passport,
  room photos attach to an exact Place/room path through a recoverable batch,
  and opaque QR/NFC labels resolve privately before a revision-bound move.
- A local full-stack account/backup slice that completed sign-up, cookie
  session, browser encryption, durable filesystem acknowledgement, retrieval,
  checksum validation, in-memory decrypt, review-before-replace, and sign-out.
- Persisted-original delivery now follows the live safe-preview contract:
  JPEG/PNG/WebP/AVIF may render inline; PDF, audio, video, SVG/HTML/XML, office,
  and other originals remain download-only unless a separately generated safe
  rendition exists. Active content is never rendered inline.

The result remains a local development prototype. Browser OCR, full room-batch
UI, real QR generation, optional BarcodeDetector reading, Web NFC adapters, and
the local authenticated backup service are implemented, but their availability
depends on browser/platform capabilities. Production passkeys, cloud tenant
isolation, authoritative field permissions, automatic record sync, malware
isolation, native background upload, and cross-device deployment remain work.
The UI does not claim those unavailable production guarantees.

## Automated evidence

- Production/Sites-ready build: **pass**.
- Domain, taxonomy, canonical collector bridge, Care & Goals, capture,
  security/sync, portable-recovery, and file-policy tests:
  **228/228 pass**.
- UI, recovery, Capture Studio, accessibility-smoke, globe, and current
  contract tests: **126/126 pass**.
- Local account, authorization, backup persistence, and restart tests:
  **7/7 pass**.
- Sites/static-routing tests: **4/4 pass**.
- Total automated checks: **365/365 pass**.
- `npm audit`: **0 vulnerabilities**.

Changed-flow coverage includes v1→v5 migration, coordinate honesty, first-Place
creation without inventing a property pin, Place-pin correction, nested-space
cycle repair, location-history closure, focused Set/Change location, collection
membership/privacy, real file storage and preview, missing-original recovery,
recoverable capture drafts, collector histories and safe showcases, OCR-review
state, resumable room sessions, opaque QR/NFC labels, movement conflicts,
encrypted upload integrity, permission denial, offline queue conflict, recovery
kit encryption/decryption, future-version rejection, atomic local-original
replacement, workspace-to-collector reconciliation, persisted Care & Goals,
append-only/idempotent care history, and download-only enforcement for
PDF/audio/video/active originals.

## Visual evidence reviewed

The local preview was inspected in the in-app browser with real runtime state.
The approved reference and final mobile Home were placed in the same comparison
image before sign-off.

This follow-up also inspected current runtime DOM, interactions, screenshots,
and computed layout for desktop Home, Add, Vault, all three Capture Studio
tools, Memories, the private Art collection, and Private References. At the
default desktop viewport, document width equaled client width and every Studio
tab rectangle remained inside its drawer. The local encrypted backup completed
durable acknowledgement and decrypt/review retrieval; the synthetic QA session
was signed out afterward. Real QR generation persisted an opaque assignment,
then the new deactivation action proved the printed code no longer resolves.

The current explicit 390 × 844 responsive inspection verifies the core shell,
Home, the interactive globe, focused exact-location editing, the Place pin
editor, Capture Studio document flow, hidden desktop rail, bottom navigation,
and no horizontal overflow. This is browser-responsive sign-off, not a claim of
real-device geolocation, camera, or native-platform validation.

Care & Goals is verified through the live workspace reducer and jsdom journey,
including saved condition history and a saved high-priority collection target.
It has not received a new dedicated current-run narrow pixel capture, so this
update does not claim additional mobile visual sign-off.

- Current desktop Home: **1280 × 720 runtime**  
  `artifacts/qa-home-desktop-2026-07-25.png`
- Current desktop Capture Studio — labels: **1280 × 720 runtime**  
  `artifacts/qa-capture-studio-labels-desktop-2026-07-25.png`
- Current desktop Capture Studio — exact room batch: **1280 × 720 runtime**  
  `artifacts/qa-capture-studio-room-desktop-2026-07-25.png`

- Desktop welcome: **1440 × 1000**  
  `audit/p0-location-collections/qa-welcome-desktop.png`
- Mobile Home: **393 × 848**  
  `audit/p0-location-collections/qa-home-mobile-v4.png`
- Reference/mobile comparison:  
  `audit/p0-location-collections/qa-home-comparison-final.png`
- Desktop collections and collection detail: **1440 × 1000**  
  `audit/p0-location-collections/qa-collections-desktop.png`  
  `audit/p0-location-collections/qa-collection-detail-desktop.png`
- Mobile collections: **393 × 848**  
  `audit/p0-location-collections/qa-collections-mobile.png`
- Focused asset-location drawer and editable Place pin: **1440 × 1000**  
  `audit/p0-location-collections/qa-focused-location-desktop.png`  
  `audit/p0-location-collections/qa-place-pin-desktop.png`
- Local-file preview and persisted evidence detail: **1440 × 1000**  
  `audit/p0-location-collections/qa-local-file-preview.png`  
  `audit/p0-location-collections/qa-evidence-detail.png`

- Final desktop Home, missing-original recovery, focused exact location, and
  Document Studio: **live default desktop viewport**  
  `artifacts/audits/final-continuity-2026-07-25/01-home-desktop.png`  
  `artifacts/audits/final-continuity-2026-07-25/02-evidence-missing-original-desktop.png`  
  `artifacts/audits/final-continuity-2026-07-25/03-exact-location-desktop.png`  
  `artifacts/audits/final-continuity-2026-07-25/04-document-studio-desktop.png`
- Final mobile Home, exact-location editor, Document Studio, and Place pin
  editor: **390 × 844**  
  `artifacts/audits/final-continuity-2026-07-25/05-home-mobile-390x844.png`  
  `artifacts/audits/final-continuity-2026-07-25/06-exact-location-mobile-390x844.png`  
  `artifacts/audits/final-continuity-2026-07-25/07-document-studio-mobile-390x844.png`  
  `artifacts/audits/final-continuity-2026-07-25/08-place-pin-editor-mobile-390x844.png`

## Iterations and fixes

1. The first mobile Home pass pushed the next action below the first viewport.
   The final pass compresses the intro and globe while keeping geographic
   readability, so the priority card and CTA are visible immediately.
2. Evidence capture initially exposed only filename metadata. The final flow
   stores real bytes locally, previews only allowlisted raster originals, keeps
   other originals download-only, shows file size and checksum, and preserves
   metadata when a blob is missing.
3. Blank coordinate fields initially coerced to `0,0`; they now fail validation.
4. A Personal workspace with no regions initially could not save its first
   Place with Add later. Region-centroid data now creates only the globe
   aggregate and never becomes the Place pin.
5. Raw schema labels such as `manual_coordinates` were replaced with
   user-facing source labels.
6. The missing favicon request was removed. The checked flows had no console
   errors; the in-app renderer emitted one non-fatal COBE/WebGL warning during
   an early globe load without affecting the fallback or interaction.
7. The first sample-upgrade merge added new records but did not enrich existing
   sample memories with newly introduced people/period/origin context. The v5
   sample migration now fills missing canonical fields while preserving edited
   sample values.
8. Recovery initially existed only as a disabled future action. The current
   flow encrypts one portable kit, validates it before review, and replaces
   local originals in one IndexedDB transaction before replacing metadata.
9. Capture-pipeline state machines initially had no product entry. The current
   Studio links document pages to a chosen Asset Passport, room photos to an
   exact room inventory record, and label assignments to the canonical
   workspace reducer.
10. The first label chooser exposed the entire 146-record sample in one long
    select. Search now narrows by name, category, reference, or location and
    caps the visible option set while preserving the selected record.
11. Local account backup initially encrypted against the browser workspace
    household ID, which the authenticated service correctly rejected. The
    backup now scopes its cloned encrypted workspace to the authenticated
    household, and server errors retain their structured message.
12. The collector schema initially lived beside the canonical workspace as an
    isolated foundation. `collectorWorkspace.js` now reconciles Asset
    Passports, collections, memberships, and supporting-material histories on
    normalization and every canonical workspace change; Care & Goals commands
    return through `APPLY_COLLECTOR_COMMAND`.
13. Persisted PDF and audio originals initially qualified for generic local
    preview. Evidence detail now uses the stricter delivery policy: only safe
    raster originals render inline, while PDF/audio/video/active content is
    download-only until a sanitized rendition exists.
14. A transient Search overlay could race its history close against exact
    keyboard navigation in a real browser. Result activation now replaces the
    overlay entry directly, so the selected asset, Place, person, or material
    opens deterministically.
15. Metadata-only evidence with no canonical original identity could start a
    version-history read that never had useful bytes to return. Missing
    originals now settle immediately into the attach-original recovery state.
16. An interrupted sample migration could carry retired scale fixtures under a
    current version marker. Sample normalization now prunes only those known
    fixture IDs on every pass while preserving user-created records and every
    personal workspace.

## Visual contract

- Premium midnight surfaces, restrained violet/cyan emphasis, DM Sans/Manrope,
  and Phosphor icons remain consistent with the approved direction.
- Home / Assets / Family / Vault remains the only primary navigation.
- Collections live within Assets instead of becoming a fifth destination.
- Exact locations, values, private references, and original documents never
  appear in collection showcase surfaces.
- Care and Goals update the canonical saved workspace; dated condition and
  service history append rather than overwrite.
- Persisted PDF, audio, video, active-content, office, and unknown originals
  are download-only in the live evidence detail. Inline rendering is limited
  to allowed raster originals.
- The globe remains directly manipulable; List remains its accessible fallback.
- Desktop, tablet, and narrow web use one product contract, ready for later
  native-client parity rather than separate UX logic.

## Remaining production validation

Before a production alpha, run real-device camera/geolocation permission tests,
Safari and Firefox IndexedDB/quota tests, keyboard and screen-reader journeys
beyond the current smoke coverage, 200% zoom, forced colors, Arabic/RTL,
slow/offline recovery, malware-safe derivative generation, authenticated
authorization tests, and multi-device conflict/sync tests.
