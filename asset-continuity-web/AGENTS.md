# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Canonical product direction

- Web is the canonical product-validation client. iOS and Android will later
  implement the same product contract with native presentation; do not stretch
  web JSX into a native app or invent different mobile flows.
- The product name is **Heldat**. Until a dedicated Heldat identity system is
  approved, retain the existing Carbon / Paper / Volt visual tokens installed
  under `public/alyr/`: Paper is the light-first product canvas, Carbon is
  reserved for focused command moments such as first entry and Vault, and Volt
  marks the primary action or confirmed state.
- Do not present the retired ALYR wordmark as Heldat. During the transition,
  the existing standalone symbol may remain as a temporary app symbol beside a
  plainly typeset Heldat product label. Do not reconstruct the old mark or
  invent a final Heldat logo.
- Preserve a premium globe-led Home, one next-best action, and primary
  navigation order: Home, Assets, Family, Vault. The globe may be cinematic,
  but it must sit inside the restrained ALYR system rather than turning the
  whole product into a dark neon dashboard.
- Do not use purple/cyan gradients, glow, glassmorphism, decorative status
  pills, excessive cards, or excessive shadows. Prefer rules, spacing,
  typography, 4/8/12px radii, 44px targets, and restrained depth.
- Product identity in user-facing copy is **Heldat**, not ALYR or Continuity. Use
  truthful language such as “Your documented assets” rather than implying
  every possession has already been captured.
- Search is a global overlay. Capture is a contextual action. Neither is a
  fifth navigation destination.
- Desktop uses a quiet left rail and contextual workspace; tablet uses a
  compact rail; narrow web preserves the approved mobile bottom-navigation
  hierarchy without rendering a phone frame.
- Use Phosphor icons and the locally bundled DM Sans/Manrope variable fonts.
  Do not replace assets with emoji, text symbols, placeholder boxes, CSS
  drawings, or handcrafted SVGs.
- Collector, art, memory, and private-reference surfaces should feel like a
  private museum joined to a continuity command center. Celebrate story, care,
  provenance, and findability; never turn price, completeness, or ownership
  into competitive gamification.
- Keep the globe fully dimensional and directly manipulable. Markers must be
  derived from real region records; a compact atlas rail is the accessible
  selector. Never position fake city labels over the globe with CSS.
- The Home globe must read immediately as a luminous, complete orb with a
  visible atmospheric edge and recognizable continent detail. Do not let
  dashboard chrome, the atlas HUD, or viewport clipping reduce it to a dark
  cropped dot map.
- Global Add must expose the common ownership intents on entry: Car,
  Motorbike, Watch, Real estate, Digital asset, and Physical item. Keep the
  complete taxonomy reachable through Browse/Search, and keep Place,
  Room/zone, and Paper/artifact visibly separate as organization/support
  actions.
- Papers and physical artifacts remain universal supporting materials. Their
  entry action must not become a disabled dead end when the workspace is empty;
  use an explicit parent-first continuation that creates the asset and resumes
  material capture.
- Advanced capture lives in a URL-addressable Capture Studio overlay, not a
  fifth primary destination. Document pages attach to an Asset Passport, room
  batches require an exact Place plus room/zone, and opaque labels must resolve
  privately before a revision-bound move.
- Large-catalog target pickers need search or filtering; do not render the
  entire asset portfolio as an undifferentiated long select.

## Product and data invariants

- Canonical hierarchy: household → geographic region aggregate → Place →
  optional room/zone/container → asset → supporting material.
- A region is an aggregate, never a Place. Selecting a region must expose every
  active Place in it. Place ownership is not modeled in the current prototype.
- Assets use stable, versioned taxonomy IDs and a full category path. Category
  profiles add optional identity fields without changing universal asset fields.
- Every asset can link papers, physical artifacts, media, records, notes, and
  links. These materials are supporting context; they do not prove legal truth.
- Category, location, ownership, custody, lifecycle, and access are independent
  facets.
- Location supports physical `known`, `needs-detail`, or `unknown`, plus
  `virtual` and `not-applicable`. Global asset capture must never guess the
  first Place, and an asset can be saved before any Place exists.
- A Place coordinate must record an honest source and precision. A city/region
  centroid is never an exact property pin. Indoor retrieval paths are derived
  from nested spaces, and every asset move appends history instead of erasing
  the prior assignment.
- One Asset Passport can belong to multiple collections. Collectible,
  investment, heirloom, and memory are independent meaning facets, not
  mutually exclusive categories. Collection showcase surfaces never expose
  exact locations, values, private references, or original documents.
- New evidence is `pending`; verification is a separate idempotent command.
- Readiness is a pure, visible checklist derived from canonical records. Never
  store or increment it as an aggregate counter.
- Keep Sample and Personal modes visibly separate. Never mix sample records into
  a personal workspace.
- The local prototype persists one schema-versioned metadata snapshot under the
  stable `alyr.asset-continuity.demo` key and stores selected original files in
  IndexedDB with type, size, and SHA-256 metadata. Capture drafts are
  recoverable. Vault can create and restore one manually transferred,
  passphrase-protected recovery kit containing the workspace and available
  originals; it is not automatic sync, cloud backup, or account recovery.
  `App.jsx` owns the browser-storage adapter; `domain.js` does not access
  browser storage. The prototype does not provide authentication, encrypted
  cloud storage, automatic cross-device backup, invitation delivery, or
  authoritative ownership/value verification. Keep those limitations visible
  at the relevant action.
- The optional same-origin local service may provide real test accounts,
  household roles, and durable encrypted whole-vault backup on the development
  computer. Never describe that localhost integration slice as production
  cloud, automatic record sync, or deployable cross-device continuity.

## Source boundaries

- `src/domain.js` owns serializable entities, validation, reducer commands, and
  pure selectors. Domain records must not contain React components or formatted
  display-only values.
- `src/sampleData.js` owns deterministic synthetic fixtures.
- `src/Globe.jsx` owns the optional COBE renderer. List view remains the
  accessible source of truth and fallback.
- `src/App.jsx` owns route composition, responsive presentation, and the
  current prototype's `localStorage` load/save/recovery adapter.
- `src/fileStore.js` owns local IndexedDB file and draft-blob persistence.
- `src/securityVault.js` owns client cryptographic, permission, session, safe
  preview, and audit primitives; it does not imply a production identity or
  object-storage service.
- `src/recoveryKit.js` owns the versioned portable-kit envelope and strict
  decrypt/validation boundary. Restoration replaces local originals through
  one IndexedDB transaction before workspace metadata changes.
- `src/syncEngine.js` owns offline/sync/conflict contracts and a deterministic
  test transport only. UI must not bind the mock transport or claim sync.
- `src/capturePipeline.js` owns OCR-review, room-session, QR/NFC, movement
  conflict, and camera/background-adapter contracts; unavailable adapters stay
  honest in the current web UI.
- `src/collectorDomain.js` owns collector-specific identity, history, health,
  gaps, pride, financial-safety, memory-person, art, and safe-showcase
  projection logic.
- `src/LocationPicker.jsx` owns honest geolocation, address search, manual
  coordinates, and adjustable map-pin behavior.
- `src/styles.css` owns shared semantic visual tokens and responsive behavior.
- All mutations must flow through `workspaceReducer`; aggregate UI is derived
  from selectors.

## Validation

- Run `npm test` and `npm run build` after product changes.
- UI journey tests must cover the changed success, empty, error, and recovery
  branches.
- Current visual evidence and its exact viewport scope belong in
  `design-qa.md`. A desktop-only inspection must not be reported as full
  responsive/reference sign-off; that requires current-run captures in the
  in-app browser and comparison with the reference at matching dimensions.
- Canonical flows, architecture, product decisions, mobile parity, and the full
  QA matrix live in `docs/`.
