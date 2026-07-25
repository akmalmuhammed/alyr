# Asset Continuity — Canonical MVP Flows

Status: target product contract plus a settled current-web appendix  
Applies to: responsive web validation now; production web, iOS, and Android later  
Source: startup blueprint and the approved Option 3 visual direction

Sections 1–19 preserve the approved product vision and acceptance targets. They
are not a claim that every flow is implemented or browser-E2E validated in the
checked-in prototype. Section 20 is the source of truth for current web capture,
routing, activation, and known limitations.

## 1. Product outcome

Asset Continuity helps a household find, evidence, maintain, and eventually hand off the physical, digital, property, and memory records that matter. It is not a net-worth dashboard, a password manager, an official registry, or a claim that a document proves legal title.

The first launch wedge is one place plus 20 important assets. Activation is the **First Useful Vault**:

1. One secured account and household.
2. One place.
3. One room or zone evidence capture.
4. At least five useful records.
5. One complete-enough Asset Passport.
6. One proof artifact.
7. One successful retrieval through Search.

The prototype may demonstrate parts of this sequence with local data. Production
activation is counted only after durable server acknowledgement.

The current web guide is narrower: at least one Place, five active assets, one
100% Asset Passport, one reviewed material, and one record opened from Search.
Home renders these five outcomes after the first Place exists. It does not yet
count a secured account or room evidence, and local completion is not a
server-acknowledged production activation event.

## 2. Global interaction model

The four top-level destinations are:

- **Home** — one priority, no more than two urgent later items, the asset globe, recent places, and progress toward the First Useful Vault.
- **Assets** — browse, filter, compare, and open current, historical, or remembered assets.
- **Family** — members, invitations, roles, scoped access, and “what they can see” preview.
- **Vault** — proof, documents, versions, exports, security, and recovery.

Search is a global command available from every destination. Capture is a contextual action available from Home, Place, Room, Asset, and Vault. Neither Search nor Capture creates a fifth top-level destination.

Every meaningful record preserves these separate dimensions:

- What it is: category and tags.
- Where it is: place, room, zone, or container.
- Whose it is: ownership assertion and shares.
- Who holds it: custody.
- What happened to it: lifecycle and disposition.
- Who may see it: access policy and grants.
- What supports it: evidence and verification history.

## 3. Common flow-state contract

Every flow must deliberately support:

| State | Required behavior |
|---|---|
| Initial | Explain the job in plain language and show one primary next action. |
| In progress | Preserve entered data; show where the user is and what remains. |
| Saving | Prevent accidental duplicate submission without freezing navigation. |
| Success | State what was saved and offer one highest-value next action. |
| Empty | Explain why the area is empty and offer one relevant creation action. |
| Error | Describe what failed, preserve recoverable work, and offer Retry or Save draft. |
| Offline | Say “On this device — not backed up yet”; never say “Synced” or “Backed up.” |
| Permission denied | Reveal no hidden record names, counts, thumbnails, values, or snippets. |
| Conflict | Show both meaningful versions and require a person to decide sensitive fields. |
| Destructive | Name affected records, recovery window, and irreversible consequence. |

## 4. Flow 0 — Choose Sample Space or Personal Vault

Target flow; current first-open labels and behavior are recorded in section 20.

**Goal:** Let a curious user understand the product without mixing demonstration data with personal records.

### Main path

1. The welcome screen explains: “Find, prove, manage, and pass on what matters.”
2. The user chooses:
   - **Explore Sample Space**.
   - **Create my Personal Vault**.
3. Sample Space opens a clearly labeled synthetic West Bay household.
4. Personal Vault begins secure owner onboarding.
5. The shell labels which mode is active. The prototype keeps one active local mode at a time.

### Success

- Sample Space reaches a useful Home state immediately and can be reset.
- Starting a Personal Vault creates a fresh metadata-only workspace with no sample records.

### Empty, error, and recovery

- If sample data fails to load, show a compact retry and a Personal Vault alternative.
- In the one-key prototype, returning to/resetting Sample Space replaces the current local personal demo metadata only after a clear impact preview and confirmation.
- In production, Sample Space and authenticated Personal Vault storage remain physically separate.
- Switching from Sample Space to Personal Vault preserves no sample edits unless the user explicitly copies a template.

### Acceptance criteria

- The active space is unambiguous on Home, Assets, Family, Vault, Search, and Capture.
- Synthetic data is never represented as protected, encrypted, backed up, or user-owned.
- No sample record contributes to personal readiness or analytics.

## 5. Flow 1 — New owner onboarding

**Goal:** Reach the first useful save without weakening account security.

### Main path

1. Select English or Arabic; direction changes immediately.
2. Review the short product promise and privacy boundary.
3. Create an account and register a passkey in production.
4. Register the current device and its convenience unlock.
5. Create and name a household.
6. Choose the household’s **region**: country/jurisdiction, timezone, default currency, and language.
7. Explain that household membership does not reveal every sensitive field.
8. Register a second authenticator or create a recovery kit in production.
9. Select one starting intent:
   - Add a home or property.
   - Scan a room.
   - Add an important asset.
   - Remember something from the past.
10. Open that flow directly.
11. Replace onboarding with normal product navigation after the first useful save.

### Success

- Home shows the saved record, First Useful Vault progress, and one next step.
- The user can explain whether the record is private, household-visible, or explicitly shared.

### Empty, error, and recovery

- Existing invitation: offer Join household before Create household.
- Passkey unsupported: use an approved fallback and create a visible security task.
- No network: do not create an unsecured anonymous cloud vault; allow a clearly local prototype draft only.
- Recovery skipped: allow capture but retain a non-dismissible security-health task.
- Existing household: offer switching; never merge automatically.
- Closed tab or app: resume the last safe checkpoint and preserve non-secret form data.

### Acceptance criteria

- No card, full profile, address, invite, or forced tour is required before first capture.
- Back navigation never loses a completed checkpoint.
- Region selection never creates a physical Place.

## 6. Flow 2 — Returning owner and Home

**Goal:** Answer “What matters now?” within one glance.

### Main path

1. Open the last active household and show its name and current workspace state.
2. Render Home from available local data before non-critical background work.
3. Show:
   - One Priority card.
   - At most two urgent Later items.
   - Globe/list overview.
   - Recent or incomplete places.
   - One contextual Capture action.
4. Opening Priority explains why it exists, the source record, and what completion changes.
5. Complete, add evidence, snooze, reassign, or dismiss within policy.
6. Reveal the next priority or “All caught up.”

### Empty, error, and recovery

- New empty vault: show “Add your first place” and “Add an important asset”; do not show zero-filled vanity charts.
- No urgent task: show a calm All caught up state and recent activity.
- Globe unavailable: switch to the equivalent accessible List view; no location is lost.
- Stale or offline data: show last-updated and device-only status.

### Acceptance criteria

- Home never becomes a noisy dashboard or an infinite task feed.
- AI confidence alone cannot create a critical task.
- One requirement maps to one active task by a stable deduplication key.

## 7. Flow 3 — Add a place or property

**Goal:** Create a navigable physical structure without confusing region, location, and ownership.

### Main path

1. Select Add place from Home, Assets, or an empty globe/list state.
2. Choose type: home, apartment, plot/land, office, storage, or other.
3. Choose relationship: own, co-own, rent, manage, family property, or third-party storage.
4. Enter a familiar nickname; official name remains optional.
5. Add a typed address, map pin, or manual location description. Browser location permission is optional and contextual.
6. Confirm country/jurisdiction, timezone, and base currency inherited from region.
7. Add an optional cover.
8. If owned or co-owned, create exactly one linked real-estate Asset Passport.
9. Choose or edit a suggested structure:
   - Home/apartment: floors and rooms.
   - Plot/land: parcels, zones, and structures.
   - Storage: unit, aisle, cabinet, shelf, and box.
10. Review, save, and open the Place with Start capture as primary action.

### Success

- One Place appears on globe/list.
- Owned property is one record presented through both Place and Asset views.
- Readiness explains its current components and missing work.

### Empty, error, and recovery

- Similar name/address: offer Open existing or Create separately.
- Rented/managed: do not create an owned real-estate passport.
- Ownership unclear: save Relationship unknown and create a review task.
- Address unavailable: accept a manual description and optional coordinates.
- Failed geocoding: preserve the typed address and permit retry.
- Incomplete form: save a draft with an explicit Incomplete label.

### Acceptance criteria

- Region and Place are separate concepts.
- Location permission denial does not block creation.
- A property cannot accidentally produce duplicate place and asset entities.

## 8. Flow 4 — Guided room or zone evidence capture

**Goal:** Record broad evidence quickly without forcing every ordinary object into a passport.

### Main path

1. Choose Capture, then Scan a room.
2. Prefill household, place, and room from context where possible.
3. Request camera/microphone permission only when the user starts those functions.
4. Guide broad coverage, important containers, and optional close-ups.
5. Allow pause, resume, remove, exclude, annotate, and audio description.
6. Review place, room, date, media count, exclusions, and backup status.
7. Save an immutable evidence session draft.
8. Production queues checksum-verified originals for durable upload; prototype labels the local simulation.
9. Show recognition proposals only as suggestions.
10. For each proposal: Promote, Link existing, Leave in Room Evidence, or Dismiss.
11. Update capture freshness and room readiness from confirmed components.

### Success

- The room appears captured even if no individual asset is promoted.
- The highest-value next action is Finish coverage or Review notable items, not a generic celebration.

### Empty, error, and recovery

- Camera unavailable: allow file import or manual evidence note.
- Permission denied: explain how to continue with import; do not repeatedly prompt.
- Offline: retain local draft and say not backed up.
- Closed tab/interrupted upload: resume the exact draft without duplicates.
- Poor coverage: save anyway and offer Finish this room.
- Low-confidence detection: do not create a record.
- Private image: allow exclude or restrict.
- Insufficient role: block before media capture.

### Acceptance criteria

- Ordinary items may remain covered by dated Room Evidence.
- Retry is idempotent.
- A guessed object never reduces readiness or becomes a confirmed fact.

### Current web path

1. Open **Add → Capture room** or the Capture Studio Room tab.
2. Choose a real Place, then an exact room or zone inside it.
3. Take or choose one or more photos. Each original is checksummed and copied
   into an IndexedDB checkpoint before the UI calls it recoverable.
4. Reorder, remove, pause, close, and resume without inventing recognized
   objects.
5. Finish only after at least one intact original is reopened from the saved
   checkpoint.
6. Commit one private room-inventory record at the chosen indoor path, with the
   ordered photos as pending materials. A stable commit identity makes retry
   idempotent.
7. Clear the temporary session only after the workspace destination accepts it.

The web build does not yet recognize or promote individual objects from room
photos. It stores a reviewable visual session; camera-grade recognition remains
a native/production target.

## 9. Flow 5 — Capture an individual object

**Goal:** Save a retrievable record with the minimum useful facts.

### Main path

1. Choose Capture object from Home, Place, Room, or Assets.
2. Confirm a truthful retrieval state. A physical object is **Known and
   findable** only with a current Place plus a room, container, or useful
   locator clue. Otherwise choose **Needs detail** or **Unknown**. No physical
   location is available only to eligible nonphysical categories.
3. Add an overview photo or name; identifying detail and serial are optional.
4. Review suggested category, brand, model, and identifier fields.
5. Confirm or edit each material fact.
6. Select importance: Ordinary, Important, Critical, or Legacy.
7. Add ownership assertion and current custodian.
8. Confirm visibility.
9. Save the minimum Asset Passport.
10. Offer one next best step: proof, value, insurance, service, story, or handoff.

### Duplicate path

1. Show plausible matches based on image, identifier, or title.
2. Let the user choose Link evidence, Merge, or Keep separate.
3. Merge preserves originals, identifiers, conflicting assertions, and a redirect.

### Empty, error, and recovery

- No photo: name is sufficient.
- No location: preserve explicit unknown; do not invent a place.
- Upload failure: save metadata and retain the media draft.
- Category change: move unmatched fields to Additional details.

### Acceptance criteria

- The minimum record is searchable after save.
- Ownership, value, legal, access, and lifecycle suggestions require explicit confirmation.
- Ownership shares above 100% are blocked; below 100% warns but may save.

## 10. Flow 6 — Add a Memory Item

**Goal:** Preserve childhood, inherited, lost, sold, gifted, or remembered objects without false present-day requirements.

### Main path

1. Choose Remember something.
2. Add a name or natural-language description.
3. Add an approximate date, former place, people, and story.
4. Optionally add photo, scan, or voice memory.
5. Choose state: lost, stolen, sold, gifted, donated, destroyed, or remembered.
6. Save without present location, serial, receipt, value, or proof.
7. Exclude the record from current-value totals and active-place readiness.
8. If rediscovered, Mark as found creates an active lifecycle event while preserving history.

### Empty, error, and recovery

- Description alone is enough to save.
- Dates accept exact, month, year, range, circa, or unknown.
- Failed media import does not discard the story.

### Acceptance criteria

- The Memory Item is retrievable through story phrases.
- Rediscovery does not erase its remembered history.

## 11. Flow 7 — Complete an Asset Passport

**Goal:** Progressively improve evidence and continuity for an important record.

### Main path

1. Open a passport from Assets, Search, Place, task, or linked document.
2. Header shows lifecycle state, importance, location/custody, and readiness.
3. Open What counts to see exact complete, partial, missing, and not-applicable components.
4. Next best step opens the highest-value missing section.
5. Complete progressively:
   - Identity.
   - Whereabouts and custody.
   - Ownership assertion.
   - Photos and proof.
   - Value and insurance.
   - Care and service.
   - Story and provenance.
   - Continuity instructions.
   - Access.
6. Review source labels and confirm suggested material facts.
7. Save material changes as versioned timeline and audit events.
8. Recalculate derived readiness and tasks by stable key.

### Empty, error, and recovery

- No proof: preserve an assertion and label proof Pending.
- Conflicting sensitive facts: present alternatives; never silently last-write-wins.
- Unsupported category field: preserve it under Additional details.
- Digital/financial reference: store provider, alias, owner, renewal, and recovery-instruction location, never credentials or seed phrases.

### Acceptance criteria

- Readiness is a transparent checklist, never a legal or authenticity score.
- Tapping the percentage always explains what counts.
- AI-only suggestions receive no readiness credit.

## 12. Flow 8 — Add proof or a document

**Goal:** Preserve an immutable source, review extracted facts, and link it safely.

### Main path

1. Capture, import, or drop a supported file.
2. Link to asset, property, policy, person, lifecycle event, or Decide later.
3. Validate format and begin safe processing.
4. Preserve original bytes as an immutable version.
5. Present document type, names, identifiers, dates, and expiry as sourced suggestions.
6. Require confirmation for every critical field.
7. Set sensitivity and viewers.
8. Optionally create expiry or review task.
9. Make confirmed metadata and OCR text searchable within the same permission scope.
10. Replacing a file creates a new version; prior versions remain.

### Empty, error, and recovery

- Duplicate checksum: link the canonical document rather than duplicate bytes.
- Unsupported/corrupt: retain only a safe recoverable draft and offer replacement.
- Unsafe file: quarantine without in-process rendering.
- OCR failure: keep the document usable with manual metadata.
- One proof for several records: add links to one canonical document.
- Delete multi-linked proof: preview every affected record first.

### Acceptance criteria

- UI distinguishes Processing, Suggested, User confirmed, and Evidence linked.
- Uploading a file does not mark its claims verified.
- Search and exports obey the same field permissions as the document detail.

### Current web path

1. Open **Add → Scan document** and choose the destination Asset Passport.
2. Add ordered JPG, PNG, WebP, or PDF pages. Supported pages preview locally
   and persist as a recoverable local draft.
3. Optionally run browser OCR on image pages. PDF text extraction is not
   claimed.
4. Review and edit extracted text, then explicitly acknowledge the comparison.
5. Name and attach the document. Each page is stored as a checksummed local
   original and a pending material linked to the chosen asset.
6. The original remains the source; OCR is labeled a reading aid and never
   legal verification.

## 13. Flow 9 — Global Search and retrieval

**Goal:** Find a known or remembered record quickly from anywhere.

### Main path

1. Open Search using the global button or keyboard shortcut.
2. Query name, alias, identifier, tag, place, room, confirmed OCR text, or remembered phrase.
3. Apply authorization before ranking, counting, autocomplete, or snippets.
4. Rank exact name/identifier, alias/tag, confirmed metadata, OCR text, then story text.
5. Show record type, location/state, match reason, and safe snippet.
6. Filter by record type, place, category, owner, state, importance, date, or readiness.
7. Open directly to the matching passport section.
8. Keep recent queries device-private unless sync is explicitly enabled.

### Empty, error, and recovery

- Zero results: Capture it now, Add a memory, Search archived, Remove filters, or correct spelling.
- Offline: search the acknowledged local index and label its freshness.
- Index unavailable: offer browse by Place and retry.
- Forbidden results: behave as though they do not exist.

### Acceptance criteria

- Search is available from all four destinations without losing current context.
- Restricted users cannot infer hidden names, counts, values, thumbnails, or match text.
- An activated user can retrieve the seeded/personal important item by at least three different attributes.

## 14. Flow 10 — Invite and manage family access

**Goal:** Share the minimum necessary records while making consequences understandable.

### Main path

1. Choose Family, then Add person.
2. Add relationship and choose a role preset.
3. Select scope: household, place subtree, collection, or explicit records.
4. Configure field groups: location, value, ownership, legal documents, private stories, export.
5. Set advisor/guest expiry when applicable.
6. Preview What this person will see and will not see.
7. Send invitation in production; simulate locally with an explicit label in prototype.
8. Display Pending, expiry, and Revoke.
9. Acceptance activates auditable permissions.
10. Owner/admin may edit, suspend, or revoke.

### Invitee path

1. Open a signed, single-use invitation.
2. Show inviter, household, role, exact scope, field groups, and expiry.
3. Sign in/register a secure device.
4. Accept or decline.
5. Open the first permitted location or collection.

### Empty, error, and recovery

- No members: explain private-by-default and offer Add person.
- Existing member: update grants; never duplicate identity.
- Changed scope before acceptance: show new terms and require acceptance again.
- Expired/revoked: reveal only safe inviter metadata and request a new invite.
- Access revoked while viewing: clear protected content and show Access changed.
- Moving an asset: preview who gains or loses place-derived access before save.

### Acceptance criteria

- A member can explain exactly what they can and cannot access.
- Revocation prevents new fetches immediately in production.
- The UI clearly says that revocation cannot erase data already copied or photographed.

## 15. Flow 11 — Lifecycle action

**Goal:** Record movement, custody, service, loss, and disposition without collapsing independent facts.

### Main path

1. Open an Asset Passport and choose Manage.
2. Choose Move, Loan, Service, Return, Lost, Stolen, Recover, Sell, Gift/Donate, Inherit, Destroy, Rediscover, or Archive.
3. Explain which dimensions will change: location, custody, ownership, lifecycle, access, or visibility.
4. Collect date, destination/person/provider, note, and optional evidence.
5. Preview downstream effects, including tasks and access changes.
6. Confirm.
7. Close prior time-ranged assignments and append the new event.
8. Keep transferred, destroyed, and historical records searchable under archived filters.

### Empty, error, and recovery

- Missing destination: allow Location unknown only with explicit confirmation.
- Linked loan/service task: complete or update it idempotently.
- Sensitive same-field conflict: require resolution.
- Archive never changes lifecycle facts.
- Delete is separate from Archive and uses a retention window.

### Acceptance criteria

- One asset has at most one active primary location.
- Loaned and at service are custody states, not dispositions.
- Insured is a coverage relation, not a lifecycle state.

## 16. Flow 12 — Export and continuity package

**Goal:** Create a portable, understandable snapshot without exceeding current permissions.

### Main path

1. Open Vault, then Export.
2. Choose Full backup, Insurance evidence, Moving pack, Advisor packet, or Estate/emergency continuity.
3. Select scope, fields, originals, OCR text, thumbnails, and timeline.
4. Preview excluded and redacted content.
5. Reauthenticate in production.
6. Generate asynchronously from a versioned snapshot.
7. Package human-readable PDF, structured CSV/JSON, selected originals, schema version, manifest, and checksums.
8. Protect with separately communicated passphrase or recipient key.
9. Expire the link and audit creation/download/share.

### Empty, error, and recovery

- Empty vault: explain there is nothing to export and link to Capture.
- Unauthorized items never enter the job.
- Mid-generation edits do not change the snapshot.
- Failure publishes no partial package and may retry the same configuration.
- Readable prototype JSON must be labeled metadata-only, unencrypted, and
  without originals.

### Current web portable-recovery path

1. Open Vault → Portable recovery.
2. Choose a recovery passphrase of at least 12 characters and confirm it.
3. Recompute available original checksums and stop on a mismatch.
4. Encrypt the current-version workspace plus every available on-device
   original into one portable kit; missing originals remain explicit
   metadata-only records.
5. Move the downloaded file manually and keep the passphrase separately.
6. On Restore, reject unsupported versions, wrong passphrases, tampering,
   duplicate/orphan originals, and size/checksum mismatches.
7. Show household, asset count, original count, date, and the replacement
   consequence before mutation.
8. On explicit confirmation, replace local originals atomically, then replace
   the local workspace snapshot.

This is a local recovery convenience. It is not a production permission-scoped
export job, cloud backup, account recovery, or automatic cross-device sync.

### Current local account-backup path

1. Start the same-origin local development service and create or sign into a
   test account.
2. Keep the account password and separate vault passphrase as distinct inputs;
   the vault passphrase never leaves the browser.
3. Recompute originals, scope the encrypted kit to the authenticated household,
   and upload only ciphertext plus checksum/size metadata.
4. The local service enforces the session, CSRF token, household role, request
   size, kit context, checksum, and atomic filesystem write.
5. Retrieval rechecks byte length and SHA-256, decrypts in memory, and shows the
   replacement summary.
6. On explicit confirmation, originals replace atomically before workspace
   metadata.

This proves the client/server boundary on one development computer. It is not
an internet-facing production identity, tenant-isolated cloud, automatic record
sync, invitation delivery, or deployable cross-device service.

### Acceptance criteria

- The user can preview exactly what will leave the vault.
- Export content never exceeds the requester’s current grants.
- Production full backup is restorable or openly documented and machine-readable.

## 17. Flow 13 — Recovery, transfer, archive, and deletion

**Goal:** Preserve continuity while preventing ownerless or silently exposed households.

### Recovery

1. Try existing passkey/trusted device.
2. Use registered recovery kit.
3. Use the configured encrypted recovery process.
4. Human support may guide but has no universal decryption bypass.

### Ownership transfer

1. Choose an active co-owner.
2. Both parties reauthenticate.
3. Recipient accepts.
4. Start cooling-off and notify all owners.
5. Complete transfer and confirm the prior owner’s resulting role.
6. Enforce the last-owner rule.

### Deletion

1. Offer full export.
2. Explain effects on members, records, devices, and recovery.
3. Require transfer or deliberate household deletion for the last owner.
4. Enter a published recovery window.
5. Restore only with strong reauthentication.
6. After expiry, production purges content cryptographic material under policy.

### Acceptance criteria

- Archive is reversible and distinct from deletion.
- Prototype deletion states are simulated and explicitly labeled.
- A purged production household cannot be restored.

## 18. Target cross-flow acceptance suite

A future release candidate passes only when:

1. A new user can choose Personal Vault, create a household and region, add one place, capture room evidence, add five useful records, complete one passport, add one proof artifact, and retrieve it.
2. Sample Space can demonstrate the same concepts without contaminating personal data.
3. Home, Assets, Family, and Vault preserve selected household and responsive layout.
4. Global Search and contextual Capture are available from every appropriate context.
5. Refresh, Back, Forward, and direct URL entry restore a valid screen or a safe not-found recovery.
6. Empty, loading, error, offline, permission-denied, conflict, success, and destructive states each have a tested recovery.
7. Evidence is never automatically described as verified or legally sufficient.
8. Readiness always opens an explainable component checklist.
9. No responsive breakpoint loses a record, action, status, or consequence.
10. English LTR, Arabic RTL, keyboard-only navigation, screen reader labels, large text, reduced motion, and visible focus pass the QA matrix.

## 19. Deferred beyond the first web MVP

The following may be previewed but must not be presented as production-complete:

- Real passkeys, encrypted device vault, and key recovery.
- Camera-grade room recognition and native-background capture. Browser OCR and
  recoverable room photo batches are implemented for web validation.
- Durable upload, offline sync, conflict engine, and cross-device backup.
- Real email/SMS invitations and revocation propagation.
- Malware scanning and safe document rendering.
- Permission-scoped, remotely generated continuity packages with share links,
  revocation, expiry, recipient keys, and server audit.
- Emergency access countdown and release.
- Billing, entitlements, cloud extraction, registry integrations, and professional verification.

## 20. Current web capture contract

This section supersedes earlier current-implementation wording in this document.
The richer flows above remain production/native targets.

### First open

1. Explain the product in one screen without requesting sensitive data.
2. Offer **Add my first item**, **Add a place**, and **Explore a sample
   workspace**.
3. Starting Personal creates an empty metadata-only workspace.
4. Starting with an item opens category-first capture; starting with a Place
   opens the Place flow. Neither choice is a permanent setup mode.

### Global Add entry

1. Open **What are you adding?** from the persistent Add action.
2. Show the six highest-frequency asset intents immediately:
   - Car — `vehicle.car`.
   - Motorbike — `vehicle.motorcycle`.
   - Watch — `lifestyle.watch`.
   - Real estate — opens the `real-estate-land` group and requires a concrete
     leaf such as House, Apartment, or Plot.
   - Digital asset — `digital.asset`.
   - Physical item — `home.other`.
3. Offer **Browse all 64 categories** for the complete nine-group taxonomy.
4. Separate three structural/support actions under **Organize & support**:
   - Place — a location where items live.
   - Room or zone — a structure inside a Place.
   - Paper or artifact — supporting material attached to an asset.
5. A quick leaf proceeds directly to Identity with its canonical ID. A group
   entry opens the category browser with that group expanded.
6. Group cards show recognizable examples rather than internal counts. Category
   Continue remains disabled until a leaf is selected.

The chooser is intentionally organized by the user's intent rather than the
domain entity names. The ordering, labels, canonical IDs, and continuation rules
are the parity contract for future iOS and Android clients.

### Add an asset

1. **Category** — select a quick leaf, search aliases, or browse the hierarchy.
   Real estate is always resolved to a concrete leaf before continuing.
2. **Identity** — enter the universal name plus useful category-profile fields.
3. **Location** — choices are category-aware:
   - a physical item may be **Known and findable**, **Needs detail**, or
     **Unknown**; Known requires a current Place plus a room, container, or
     useful locator clue;
   - real estate may be Known only when its canonical Place has a
     user-confirmed exact pin; an address suggestion or approximate point stays
     Needs detail;
   - digital, financial, intangible, and document categories may use **No
     physical location**, stored as `virtual`;
   - a nonphysical memory uses **Not applicable**; a physical memory follows the
     physical-item rule.
4. **Materials** — optionally add a paper, physical artifact, media, record,
   note, or link and state how it relates to the asset.
5. **Review** — show the exact category path, identity, location truth, and
   pending material before save.
6. Show success and offer **View record** or the next useful material action.

The flow may save without a Place, value, serial/reference, category-profile
field, or material. Category profiles contain some `required` metadata flags,
but the current web UI labels all profile fields Optional and does not enforce
those flags. A contextual Place entry may prefill the location, but global
capture never uses the first Place implicitly. Category semantics take
precedence over context: a digital category remains `virtual`, and a
nonphysical memory remains `not-applicable`, even when capture begins from a
Place. A physical memory follows the same findability rule as any other
physical item.

Every capture waits for a durable IndexedDB commit before showing success.
Metadata-only captures use the same stable operation identity and retry receipt
as file-backed captures. When an original is present, the workspace transition,
current-original pointer, immutable original version, recovery-head revision,
and retry receipt commit in one IndexedDB transaction. A response-lost retry is
idempotent. If any part fails, neither metadata nor bytes are adopted and the
recoverable capture draft remains available.

### Add a room or zone

1. Enter from a Place or the global Add menu.
2. If a Place exists, select it and add the room or zone.
3. If no Place exists, keep Room selectable and explain the relationship.
4. Create the Place first, then automatically resume the Room form with the new
   Place selected.
5. Never persist a room without a valid Place.

### Add a Place or owned property

1. Name the Place and choose Home, Apartment, Property, Plot, Office, Storage,
   or Archive.
2. Record the relationship separately: owned, co-owned, rented, managed,
   family property, third-party storage, or unknown.
3. Choose address search, measured device location, an adjustable pin, manual
   coordinates, or an honest Add later state.
4. For a new owned/co-owned Place, offer one selected-by-default linked
   real-estate Asset Passport. Create the Place and reciprocal passport in one
   reducer command.
5. For every other relationship, create only the Place. Never infer ownership.
6. Open the same property concept from either the Place or Asset detail through
   reciprocal navigation; the Place owns rooms/pins and the passport owns
   documents, value, insurance, and history.

### Add a supporting material

1. Enter from an Asset Passport, Vault, or the global Add menu.
2. If an active asset exists, link it before continuing.
3. If no asset exists, keep the action selectable and explain that material
   supports an asset. Create the asset first, then automatically resume material
   capture with the new asset selected.
4. Choose kind and relation.
5. Collect only the source fields appropriate to that kind:
   - paper or media: a validated local original plus filename, size, media
     type, and SHA-256 metadata when a file is selected;
   - artifact: photo reference, physical location, or note;
   - note: text;
   - link: URL;
   - record: identifying details.
6. Review and save as Pending.
7. A later idempotent `VERIFY_EVIDENCE` action stores `verified`; the UI presents
   that state as **Reviewed by you**. This confirms the user's metadata record,
   not authenticity or legal truth.

The continuation never creates an orphan material. If the new asset already
received a material during its own Materials stage, the continuation finishes
instead of asking the user to add the same material twice.

Persisted evidence opens at `/evidence/:evidenceId`. The live delivery policy
renders only allowlisted raster originals (JPEG, PNG, WebP, and AVIF) inline.
PDF, audio, video, SVG/HTML/XML, office, and unknown originals are
download-only unless a separately generated safe rendition exists. The current
web build generates no such rendition. Download availability does not imply
production authorization, malware scanning, or durable cloud storage.

Each material also records the separate physical storage truth of its original:
known Place/room/container, needs detail, unknown, external custodian, or not
applicable. Corrections append actor, time, reason, and the prior storage
snapshot. Replacing a local original changes the current pointer while prior
checksummed versions remain retrievable from the evidence detail.

### Collection Care & Goals

1. Open Assets → Collections → a collection → Care.
2. Review separate derived states:
   - Health explains condition/service attention.
   - Completion explains documentation and deliberate target progress.
3. Add a condition check or service record for one canonical piece.
4. Save through `APPLY_COLLECTOR_COMMAND`; the dated care event appends by
   stable ID and survives refresh.
5. Define a collection gap only when it clarifies the collection's intent.
6. Optionally add a research wish linked to that target.
7. Review matching pieces already in the collection; never auto-fill a target.
8. Explicitly match an existing piece to mark the target filled.

The canonical Asset Passport remains the item source of truth.
`collectorWorkspace.js` reconciles item profiles, simple collection
memberships, and material-derived history into the same versioned workspace.
Condition/service history is append-only and idempotent; targets and wishes are
explicit normalized records, not shopping recommendations or stored score
counters.

### Globe and atlas

1. Home selects a real region aggregate.
2. The globe focuses the selected region and draws only portfolio-derived
   markers and region connections.
3. Marker size reflects asset count.
4. The atlas rail and List tab expose the same regions and Places without WebGL
   or pointer interaction.
5. Selecting a region never implies it is itself an owned Place.

### Current routes and overlays

```text
/welcome
/home
/assets
/assets/:assetId
/evidence/:evidenceId
/collections
/collections/:collectionId
/family
/vault
/places/:placeId
/places/:placeId/spaces/:spaceId

?search=1
?capture=choose|place|space|asset|evidence|collection|studio
?capture=studio&tool=document|room|labels
?settings=1
?help=1
?placeId=<placeId>&spaceId=<spaceId>&assetId=<assetId>
```

The Search query itself is held in component state, not in the URL. Assets list
query/category/location/sort filters are URL-addressable.

### Current prototype limitations

- Global Add exposes six common asset intents, all 64 category leaves, Place,
  Room or zone, Paper or artifact, Collection, document scan, room photo batch,
  and asset labels. Memory remains an asset taxonomy category; Digital asset
  has a first-level shortcut.
- Document scanning uses real local pages, optional browser OCR, explicit text
  review, and pending asset-linked materials. Its workspace records and ordered
  originals commit together. It does not claim PDF text extraction, legal
  accuracy, malware scanning, or immutable cloud versions.
- Room capture stores ordered, checksummed, recoverable local originals at an
  exact Place/room path. Its inventory session and photos commit together. It
  does not recognize or auto-create individual objects.
- Asset labels create real opaque QR SVGs, support manual/BarcodeDetector/Web
  NFC paths when available, persist append-only assignments, allow
  deactivation, and refuse stale location moves.
- Collection Care & Goals is functional and persisted through the canonical
  workspace bridge. Production event storage, audit, household authorization,
  multi-device conflict resolution, and native adapters are not implemented.
- Duplicate merge, ownership shares, visibility grants, multi-record materials,
  evidence tombstones/retention, and production field-level permission
  enforcement are not implemented.
- Family supports a persisted local demo invitation and local service role
  grants to existing test accounts; delivery/revocation ceremonies are not
  production-ready.
- Vault exports readable metadata JSON, creates/restores a manual encrypted kit,
  and can store/retrieve the latest encrypted kit through the optional local
  authenticated service. It has no production scope/redaction export service.
- Search covers local assets, Places, spaces, materials, and members and records
  an actor-attributed successful retrieval without retaining the private query.
  It has no production permission enforcement, OCR-specific ranking, global
  filters, or explicit match-reason field.
- The current automated UI suite runs in jsdom. Full browser E2E, cross-browser
  validation, and real-device sign-off remain outstanding. Current-run
  in-app-browser visual inspection covers desktop Home/Add/category, Vault
  account backup/retrieval, and all three Capture Studio tools at 1280 × 720.
  The prior same-origin 390 × 844 Home/Add inspection remains the latest narrow
  viewport evidence; real-device capture tools still need sign-off.
