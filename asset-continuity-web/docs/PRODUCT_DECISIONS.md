# Asset Continuity — Product Decision Record

Status: accepted decisions for the web-first MVP  
Format: lightweight architecture/product decision records

An Accepted decision may describe the production/native target without being
implemented in the current local prototype. Each materially divergent ADR below
states its implementation status. The settled current web contract remains the
baseline until a shared, versioned production contract replaces it.

## ADR-001 — Use Home, Assets, Family, and Vault as top-level navigation

**Status:** Accepted; shell implemented, destination depth remains partial

**Context:** The early blueprint used Today, Spaces, Search, and Family. The approved Option 3 direction uses Home, Assets, Family, and Vault and gives the product a clearer continuity/security destination.

**Decision:** The canonical shell has Home, Assets, Family, and Vault.

- Home absorbs the calm Today priority model and the globe/place overview.
- Assets contains asset browse and Place entry points without collapsing assets into locations.
- Family currently owns people and demo invitations; grants and access review
  remain production targets.
- Vault owns linked material metadata, local immutable-original history,
  encrypted recovery, authenticated local backup history, and demo JSON export.
  Production devices, key lifecycle, and permission-scoped recovery remain
  targets.

**Consequences:** Existing `Today` content becomes a Home section, not a removed capability. `Spaces` becomes Place/space views reached from Home and Assets. Navigation stays four items on desktop rail and mobile bottom bar.

## ADR-002 — Search is global, not a fifth destination

**Status:** Accepted; local overlay and retrieval outcome implemented

**Context:** Retrieval is central, but a permanent tab competes with the four product destinations and duplicates browser/OS command patterns.

**Decision:** Search is an always-reachable global command that opens over the
current context. The current URL stores only `search=1`; entered search text is
component-local, and the global overlay has no filters or recent-query store.
Opening a result appends an actor-attributed retrieval activity without storing
the query.
Assets-list query/category/location/sort filters are URL-addressable.

**Consequences:** Search works from all destinations, preserves the underlying
screen, and restores focus. Authorization-before-ranking, permission-safe
counts/snippets, OCR-specific ranking, and explicit match explanations are
production targets because the prototype has no enforcing authorization model.

## ADR-003 — Capture is contextual, not navigation

**Status:** Accepted; standard Add and Capture Studio implemented

**Context:** Capture is a verb with different defaults depending on whether the user starts at Home, Place, Room, Asset, or Vault.

**Decision:** Capture is a primary contextual action. The current web chooser
offers quick asset intents, the full taxonomy, Place, Room or zone, Paper or
artifact, Collection, and a contextual Capture Studio for reviewed document
pages, room photo batches, QR, and NFC labels. Memory and digital records are
asset taxonomy categories. Separate Quick Item/Asset Passport depths remain a
target capability.

**Consequences:** The current Place/room/asset is prefilled where supported,
completion offers the saved record, and no platform adds Capture as a fifth
top-level tab. Native clients must not invent unimplemented target depths before
the shared capture contract is versioned.

## ADR-004 — Separate Sample Space from Personal Vault

**Status:** Accepted

**Context:** A rich demo makes the product understandable, but synthetic West Bay assets must never be confused with personal records or security claims.

**Decision:** First entry offers Add my first item, Add a place, or Explore a
sample workspace. Either creation choice starts or resumes a Personal demo
workspace; Sample is clearly labeled and resettable. The prototype holds one
active local mode under one stable key: starting Personal creates a fresh
metadata snapshot, while resetting to Sample replaces local personal demo
metadata only after an impact preview and confirmation. Production stores
Sample and authenticated Personal data separately.

**Consequences:** Sample edits never enter personal data implicitly. Any future
sample-to-personal template copy must be an explicit reviewed action; no copy
workflow exists in the prototype. Demo statuses use honest local/simulated
language.

## ADR-005 — Region is household context; Place is a record

**Status:** Accepted target; partially implemented

**Context:** A globe naturally encourages grouping by country or region, but “Qatar” is not the same object as “West Bay Home.”

**Decision:** In the production model, household region preferences hold
country/jurisdiction, timezone, language, and default currency. In the current
prototype, a `region` is only a geographic globe aggregate (`id`, `name`, `lat`,
`lng`); household locale and currency are stored on the household. Place stores
the user-recognizable location record.

**Consequences:** A globe marker may aggregate several Places into a region read
model. Selecting a marker reveals the underlying Places; it does not navigate to
a fake region folder. Native clients must not treat the current geographic
aggregate as the future preferences entity.

## ADR-006 — The globe is a Home overview with an equivalent List

**Status:** Accepted

**Context:** The globe is the memorable center of the approved premium design, but it cannot be the only control for location or the product’s data model.

**Decision:** Home uses an interactive globe synchronized with an accessible Place list. Markers summarize visible Places/asset counts. List view is always available.

**Consequences:** Globe failure, reduced motion, keyboard use, low-power devices, or screen readers never remove access to a Place. Coordinates are optional and approximate display must be labeled.

## ADR-007 — Preserve assertion, evidence, verification, and legal truth

**Status:** Accepted target; only material review is implemented

**Context:** Uploading a receipt or confirming OCR does not create official ownership or legal title.

**Decision:** The production product stores:

1. A person’s assertion.
2. Supporting evidence.
3. Human verification of entered/extracted facts.
4. A pointer to external legal truth where relevant.

**Consequences:** Use labels such as User confirmed, OCR suggested, AI suggested,
Evidence linked, and Authority copy. Avoid Verified owner, Official registry,
Guaranteed value, or equivalent claims unless an authoritative integration
supplies that status. The current prototype stores metadata-only materials and a
review status. Selected originals are stored separately on the current device
with type, size, and checksum metadata; it does not store the full
assertion/provenance model.

## ADR-008 — New proof remains pending until reviewed

**Status:** Accepted target; simplified prototype state implemented

**Context:** The prototype needs visible progress without overstating document processing or authenticity.

**Decision:** In the current prototype, a new material is stored as `pending`;
the idempotent `VERIFY_EVIDENCE` action stores `verified`, which the UI labels
Reviewed by you. `rejected` can be preserved during normalization but has no
current UI command. The production file pipeline may later follow Draft →
Saved/Uploading → Processing → Active with sourced suggestions.

**Consequences:** Review confirms the user's metadata record, not authenticity.
A production document may be active while suggested facts remain pending. OCR
failure does not invalidate the file; unsafe production files require
quarantine. The current browser prototype can store selected original bytes in
IndexedDB, but it does not claim encrypted cloud backup, malware scanning, or
cross-device availability.

## ADR-009 — Readiness is a derived, explainable checklist

**Status:** Accepted target; current fixed selector implemented

**Context:** A single opaque score can imply legal, insurance, or AI quality and punish users for inapplicable work.

**Decision:** Current asset readiness is a binary seven-component checklist:
name/category 20%, owner 10%, location state 20%, precise location 10%,
reference/serial 15%, value/context 5%, and reviewed required evidence 20%.
There is no partial credit or weight normalization. Virtual and not-applicable
assets receive both location components. What counts exposes each component.

**Consequences:** The percentage is derived and never manually stored. The
current selectors include Memory Items in portfolio and Place readiness because
only archived assets are excluded. Normalized exclusions, partial states, and
Memory-item exclusion remain a target change that requires a new shared contract
version and matching web/native tests.

## ADR-010 — Web first, shared product contract, native presentation later

**Status:** Accepted

**Context:** Building three clients before validating the flow would multiply uncertainty and inconsistent decisions.

**Decision:** Validate complete flows and responsive behavior in the web app first. Then freeze domain/state/API contracts and build iOS/Android clients with platform-native capture, passkey, secure-storage, and accessibility adapters.

**Consequences:** Web is canonical for implemented flow and language, not for
native implementation details. Mobile may adapt sheets, navigation transitions,
camera, and authentication while preserving the parity contract. The native
entry gate is not yet met: the richer flows, production contract, browser E2E,
and responsive/mobile visual sign-off remain incomplete. The current fixed
1280 × 720 desktop inspection has passed, but it does not establish native
visual parity.

## ADR-011 — Use an IndexedDB-authoritative device generation

**Status:** Implemented for the web prototype; production hardening remains

**Context:** A local prototype needs refresh persistence, deterministic tests, atomic restore, and exact rollback without treating a browser cache as a secure cloud vault.

**Decision:** Persist the active workspace, its generation-keyed originals, one
rollback generation, and a compare-and-swap head in one IndexedDB database.
The head revision is authoritative across tabs. `localStorage` is a
best-effort compatibility cache and cross-tab signal only; changing its pointer
cannot activate a generation. `alyr.asset-continuity.demo.v1` remains a legacy
migration source and `alyr.asset-continuity.demo.recovery` quarantines an
unreadable cache snapshot.

**Consequences:** Restore validates first, commits the workspace/original set and
head in one transaction, and retains exactly one undo target. Stale tabs fail
closed instead of last-write-wins. Reset removes every generation in only the
selected scope. Storage failures remain visible. The device generation is not
cloud backup and production still requires managed encryption, monitored
retention, and independent restore drills.

Unreadable or unsupported snapshots fall back to a safe unstarted sample,
surface a persistent recovery alert, and offer the preserved raw snapshot as a
download. A failed write remains visibly session-only rather than reporting a
durable save.

## ADR-012 — Model property once with two projections

**Status:** Implemented for the canonical web workspace and Place capture

**Context:** A home or plot is both a location tree and an owned/managed asset. Two independent records create drift and duplicate proof.

**Decision:** An owned/co-owned property is one user concept composed of:

- A Place for rooms, zones, containers, and located assets.
- Exactly one linked real-estate Asset Passport for ownership, parcel/title fields, value, insurance, and proof.

**Consequences:** It may be opened from Home/Places or Assets. Place capture
records tenure and can atomically create exactly one reciprocal property
passport for owned/co-owned relationships. Rented, managed, family, third-party,
and unknown Places do not auto-create one. Normalization repairs one-sided,
dangling, archived, wrong-type, or conflicting links without inventing
ownership; explicit link/unlink commands remain actor-gated.

## ADR-013 — Keep organization facets independent

**Status:** Accepted production/native target; location history implemented, other facets partial

**Context:** A single folder tree cannot reliably answer what, where, whose, who holds, lifecycle, collection, and who may see.

**Decision:** Category, location, ownership, custody, lifecycle, collection, and access are separate records/facets.

**Consequences:** Moving an item does not change ownership. Loan/service changes custody, not disposition. Archive changes visibility, not lifecycle history. Search and filters can combine facets.

The current prototype still stores scalar owner, custodian, and lifecycle fields
directly on each asset. Location assignments are append-only and close the
prior assignment on a move. `ARCHIVE_ASSET` sets
`lifecycleStatus: "archived"` and there is no restore command, so the target
archive semantics are not yet implemented.

## ADR-014 — Originals are immutable; corrections are versioned

**Status:** Implemented for local original bytes and replacement history;
production retention remains

**Context:** Continuity evidence loses trust when source bytes or material facts can be silently overwritten.

**Decision:** Preserve original evidence/document versions and append material fact/provenance changes. Merge retains sources, conflicts, and redirects.

**Consequences:** Replace creates a new version. Delete uses tombstones and a retention window. Multi-linked deletion previews affected records.

The web prototype keeps generation- and account-scoped original bytes in
IndexedDB. Replacement creates or reuses a content-derived immutable version,
updates only the current pointer, and exposes verified prior-version downloads.
Recovery, rollback, copy, reset, and garbage collection preserve the same
version invariant. Multi-record links, tombstones, retention windows, and
production object-store policy remain unimplemented.

## ADR-015 — Premium visual system uses restrained emphasis

**Status:** Accepted

**Context:** The selected design uses a midnight shell, a dimensional globe, and violet/cyan energy. Applying gradients/glass to every surface would make the product noisy and generic.

**Decision:** Use the violet-to-cyan system for active state, priority, focus, and the globe. Keep navigation, forms, data lists, and utility surfaces quiet. Use one modern icon family and platform symbols where more familiar.

**Consequences:** The globe is the memorable visual. Cards do not all glow. Text contrast, focus, state labels, and 44 × 44 targets take priority over decorative effects.

## ADR-016 — First Useful Vault is the activation metric

**Status:** Accepted target; five-outcome web guide implemented

**Context:** Tutorial completion or account creation does not prove that the product solved the continuity job.

**Decision:** Target activation requires household, Place, room evidence, five
useful records, one passport, one proof artifact, and one Search retrieval. The
current web guide checks one Place, five active assets, one asset at 100%
current readiness, one `verified` material, and one Search retrieval activity.
It does not yet count the secured-account or room-evidence target.

**Consequences:** Home renders a transparent guided checklist after the first
Place exists and routes each incomplete outcome to one useful action.
Production analytics must not reuse the narrower local guide silently.

## ADR-017 — Emergency access is post-MVP beta

**Status:** Accepted

**Context:** Emergency release introduces identity, coercion, notification, countdown, revocation, and key-release risks that exceed the first flow-validation scope.

**Decision:** Vault may explain or waitlist the concept, but no prototype control may imply a real emergency bundle or access release.

**Consequences:** Production work requires separate threat modeling, strong verification, configured delay/quorum, neutral alerts, auditable time-limited access, and repeated abuse controls.

## ADR-018 — Use a versioned hierarchical asset taxonomy

**Status:** Accepted

**Context:** Flat labels such as Vehicle, Property, or Other cannot support
reliable filtering, category-specific passports, imports, or web/native parity.
Changing a visible label must not corrupt persisted records.

**Decision:** Persist a stable taxonomy version, leaf category ID, and full
category path. The first release contains nine top-level groups and searchable
leaf aliases, including car, motorbike, watch, land, home, collectible, digital
account, business holding, memory, and document categories. A category profile
adds identity metadata such as VIN, reference number, title number, or case
material. Custom items use `custom.other` with a user-provided label.

**Consequences:** UI labels and icons can evolve without data migration. Root
filters include descendants. Legacy flat labels resolve through explicit
aliases. The taxonomy currently marks seven profile fields `required`, but the
web UI labels all profile fields Optional and does not enforce those flags.
Native clients must follow the settled web behavior until required-field
semantics are explicitly versioned. Web, iOS, Android, imports, and future APIs
otherwise share the same IDs and profiles.

## ADR-019 — Make supporting materials universal

**Status:** Accepted

**Context:** Receipts are not the only useful continuity material. A watch may
have a service card and provenance photo; land may have title papers and a
survey marker; a digital asset may have a link or access note.

**Decision:** Every asset can link six material kinds: paper, physical artifact,
media, record, note, and link. A material also declares its relation, such as
ownership, identity, service, provenance, condition, insurance, valuation,
legal, access, or context. New materials remain `pending` until the user reviews
them.

**Consequences:** The UI says Papers & artifacts or Materials instead of using
Proof as a universal noun. Review stores `verified` internally and displays
Reviewed by you. It confirms the user's record; it does not verify authenticity,
ownership, value, insurance, or legal title.

## ADR-020 — An asset does not require a Place

**Status:** Accepted

**Context:** Users often remember the item before its location, and many digital
or financial assets have no meaningful physical location. Forcing a Place first
creates false data and blocks the most important first action.

**Decision:** Category-first asset capture is available from the first empty
screen. The domain preserves physical known, physical needs-detail, physical
unknown, virtual, and not-applicable states. The UI exposes only states allowed
by the selected category. A physical item is Known only with a current Place
plus a room, container, or useful locator clue. Real estate additionally
requires a user-confirmed exact Place pin. Digital, financial, intangible, and
document categories may use No physical location as `virtual`; only a
nonphysical memory uses `not-applicable`. A contextual Place may prefill an
eligible physical item, but never overrides nonphysical category semantics, and
global asset capture never guesses a Place.

**Consequences:** A new personal workspace can begin with either an item or a
Place. Unknown and incomplete retrieval paths become visible follow-up work
instead of invented precision. Digital categories may default to no physical
location; physical categories cannot escape findability requirements through a
virtual or not-applicable state.

## ADR-021 — Global Add starts with human intent and preserves valid parents

**Status:** Accepted

**Context:** A generic Asset choice forced people to understand the internal
entity model before they could add a car, motorbike, watch, property, digital
asset, or ordinary physical item. Room and supporting-material actions also
became dead ends when their required parent did not yet exist.

**Decision:** Global Add shows six common asset intents first, followed by the
complete category browser and a separate **Organize & support** section for
Place, Room or zone, and Paper or artifact. Quick actions persist canonical leaf
IDs; broad Real estate opens its group and requires a concrete leaf. If Room has
no Place, or supporting material has no Asset, the app creates the parent first
and automatically resumes the original action.

**Consequences:** Every visible Add option has a successful path without orphan
records. Place means where things live; real estate means owned property.
Digital category semantics override physical entry context. The ordering,
labels, stable IDs, validation, and continuation state become part of the
web/iOS/Android parity contract.

## ADR-022 — Portable recovery is encrypted, manual, and review-first

**Status:** Accepted for the local prototype

**Context:** Browser metadata and IndexedDB originals can disappear when site
data is cleared. Calling a plain JSON export a backup would be unsafe, while
waiting for production identity and object storage leaves no honest recovery
path during web validation.

**Decision:** Vault can create one versioned, passphrase-protected AES-GCM
recovery kit containing the normalized workspace and every original currently
available on the device. Filenames, asset names, locations, checksums, and
original bytes remain inside the encrypted envelope. Import validates format,
workspace version, context, ciphertext, file sizes, and checksums, then shows a
decrypted in-memory summary before any mutation. Confirmation replaces all
local originals in one IndexedDB transaction and only then replaces workspace
metadata.

**Consequences:** The passphrase is never stored. Missing originals remain
explicitly metadata-only. The readable JSON export remains separate and
unencrypted. A kit must be moved manually and cannot be described as automatic
cloud backup, account recovery, acknowledged sync, remote revocation, or a
reviewed production key hierarchy.

## ADR-023 — Collector pride comes from care and story, not price

**Status:** Accepted; domain foundation and selected web surfaces implemented

**Context:** Collectors need edition identity, provenance, condition, service,
targets, duplicates, and a reason to feel proud. A generic inventory table or
portfolio-value leaderboard makes art, inherited objects, ordinary memories,
and family continuity feel cold and can encourage unsafe exposure.

**Decision:** Collection completion and care health are separate derived
concepts. Private exhibition surfaces celebrate findability, provenance,
condition, story, and thoughtful curation. Art keeps creator, edition,
exhibition, and conservation context. Memories keep people, period, origin,
story, and future intention. Financial holdings remain masked continuity
references and never accept credentials. Safe showcase output is produced only
through an explicit allowlist that excludes exact locations, values, private
parties, private references, and originals.

**Consequences:** No price gamification, competitive completeness score, or
automatic public gallery. Missing facts become gentle gaps and next actions.
The web UI can feel like a private museum joined to a continuity command center
while web, iOS, and Android share the same safety rules.

## ADR-024 — Capture Studio is contextual, review-first, and not a fifth destination

**Status:** Accepted and implemented for the web prototype

**Context:** Documents, room photos, QR labels, and NFC labels need richer
workflows than the minimum Add form, but promoting them to primary navigation
would fragment the ownership model and make first open harder.

**Decision:** Global Add exposes a distinct Capture Studio section. The Studio
is a URL-addressable overlay with Document, Room, and Labels tabs. Documents
must select an Asset Passport; room batches must select an exact Place plus
room/zone; labels resolve privately and bind every move to the active location
revision. Originals use recoverable local storage and pending evidence states.
OCR, recognition, and label resolution never become truth without review.

**Consequences:** All three tools remain reachable from the same Home, Assets,
Family, and Vault shell and can later map to native camera/NFC presentations
without changing business rules. The current web build does not claim
camera-grade object recognition, PDF text extraction, legal accuracy, malware
scanning, or background upload.

## ADR-025 — Local authenticated backup is an integration proof, not cloud

**Status:** Accepted for local development only

**Context:** Manual recovery proves encryption but does not prove authenticated
durable retrieval, household-role enforcement, CSRF handling, or restart-safe
storage. Calling a localhost slice “cloud sync” would be misleading.

**Decision:** The optional same-origin local service provides opaque HttpOnly
sessions, SameSite cookies, CSRF checks, salted scrypt passwords, throttling,
owner/admin whole-vault access, household grants to existing accounts, atomic
filesystem state, and content-addressed encrypted backup objects. The browser
scopes the kit to the authenticated household and never sends its separate
vault passphrase.

**Consequences:** Product QA can execute sign-up, sign-in, encrypt, durable
acknowledgement, sign-out, retrieval, checksum validation, decrypt, review, and
restore boundaries. Production still requires HTTPS deployment, passkeys,
tenant-isolated infrastructure, managed device/key lifecycle, malware
isolation, monitored backups, restore drills, invitation proof, and automatic
record sync.

## ADR-026 — Reconcile collector facets into the canonical workspace

**Status:** Accepted and implemented for the web prototype

**Context:** `collectorDomain.js` provides richer collection, care, story, art,
and goal records than the simple Asset/Collection schema. Leaving it as an
isolated store would create two inventories, stale memberships, duplicate
identity, and ambiguous persistence.

**Decision:** `collectorWorkspace.js` is the only bridge between canonical
Asset Passports/materials/simple collections and collector facets.
`normalizeWorkspace` and every canonical workspace mutation reconcile that
state. Collector UI mutations return through `APPLY_COLLECTOR_COMMAND`.
Deterministic profile IDs preserve one Asset Passport to one collector profile;
simple collection membership remains authoritative for its rich membership.

**Consequences:** Care & Goals now persists inside the same versioned snapshot.
Condition and service history appends idempotently by record ID. Targets,
research wishes, and explicit target matching use normalized upserts. This
local bridge does not replace a production API, server authorization, audit,
event store, sync, conflict resolution, or migrations.

## ADR-027 — Persisted non-raster and active originals are download-only

**Status:** Accepted and enforced in the current web evidence detail

**Context:** A browser being able to render PDF, audio, video, SVG, HTML, XML,
or another original is not proof that inline rendering is safe. A trustworthy
preview requires an independently generated, access-checked, sanitized or
transcoded rendition.

**Decision:** Persisted JPEG, PNG, WebP, and AVIF originals may render inline
under the current delivery policy. PDF, audio, video, SVG/HTML/XML, office, and
unknown originals remain download-only. A future generated rendition is a
separate object; the original never becomes the rendition. Active content is
never rendered inline.

**Consequences:** Evidence detail always retains **Download original** when the
local bytes are available and explains why inline viewing is unavailable. The
policy is tested in domain and UI suites. Production still must enforce
original-download permission, quarantine/scanning, rendition isolation,
short-lived URLs, audit, and revocation on the server.
