# Continuity v3 foundation audit

Date: 2026-07-25  
Scope: canonical responsive web flow, collector/memory/private-reference
surfaces, client foundations, and portable recovery

## Outcome

The local web prototype is internally coherent and ready for moderated
prototype testing. The primary flow no longer ends in a generic inventory
table: Home explains the product, Add starts with human intent, exact location
and indoor retrieval remain explicit, supporting originals are real local
files, collections preserve pride and proof, Memories preserve human context,
Private References fail closed around credentials, and Vault offers a working
manual encrypted recovery path.

It is not ready to be described as a production vault. Authentication,
authoritative permissions, connected object storage, acknowledged cloud sync,
server OCR, live QR/NFC scanning, and native background upload remain service
or platform-adapter work.

## Canonical step health

| Step | Health | Evidence and boundary |
| --- | --- | --- |
| First open | Healthy | Explains the product, offers item-first, Place-first, and isolated Sample entry; limitations are visible. |
| Home and globe | Healthy | Premium globe-led overview, one next action, synchronized accessible place list, no fifth primary destination. |
| Global Add | Healthy | Car, motorbike, watch, real estate, digital asset, physical item, taxonomy browser, Place, room/zone, material, and collection all have parent-safe paths. |
| Place and exact location | Healthy | Address, high-accuracy device location, adjustable pin, manual coordinates, source, precision, and Add later are explicit. |
| Asset passport and movement | Healthy | Known, needs-detail, unknown, virtual, and not-applicable stay distinct; nested indoor path and append-only location history remain visible. |
| Papers, artifacts, and media | Healthy for local prototype | Camera/file selection, preview, 25 MB validation, SHA-256 metadata, pending human review, evidence detail, and recoverable draft are implemented. |
| Collections and art | Healthy | Private exhibition, curator story, provenance/condition/edition context, and safe showcase boundaries avoid price gamification. |
| Memories and loved people | Healthy | People, period, origin, story, photograph, and future intention are captured independently from category; v4 migration enriches old sample records without overwriting edits. |
| Private financial and digital references | Healthy | Institution/alias/masked reference only; estimates hidden until reveal; passwords, PINs, full numbers, keys, seed phrases, OTPs, and unsafe URLs are rejected by the collector contract. |
| Family | Prototype-only | Role/invite consequences are visible, but no message is sent and there is no authoritative account or permission service. |
| Portable recovery | Healthy for manual local recovery | One AES-GCM kit, memory-only passphrase, encrypted filenames/content, strict version/integrity checks, review before replacement, and one IndexedDB replacement transaction. |
| Cloud P1 | Foundation only | Session, permission, envelope, safe preview, upload manifest, audit, offline queue, conflict, and retrieval contracts are tested; the deterministic transport is not bound to UI. |
| Capture P2 | Foundation only | OCR proposals, room checkpoints, opaque labels, movement conflicts, camera and background-upload adapter contracts are tested; unavailable adapters are not presented as active. |

## Current-run browser validation

The local preview was exercised in the in-app browser.

- Desktop Vault recovery DOM and interaction: passed.
- Recovery create action: matching passphrases enabled the action; encryption
  reached the success state; both passphrase fields cleared; the UI explicitly
  said no cloud backup was created.
- Desktop Memories: people, period, story, photograph, continuity rail, and
  named-person section rendered after the v4 migration.
- Desktop private Art collection: provenance, condition, edition, story, and
  one useful next action rendered.
- Desktop Private References: values were absent before Reveal and visible only
  after the explicit action.
- Desktop Vault document width: client width equaled scroll width.
- Responsive Vault at 390 × 844: document width equaled client width; the
  desktop rail was hidden; the four-item bottom navigation stayed visible; the
  recovery section collapsed to one column.
- Browser console: no application error was observed in the checked flows.

The browser runtime did not expose its screenshot capability during this
follow-up. Therefore the new Vault, Memory, Art, and Private Reference surfaces
have DOM, interaction, and computed-layout evidence, but no fresh pixel
captures. Existing P0 image evidence remains in
`audit/p0-location-collections/`. This follow-up is not a pixel-level sign-off
for those four new surfaces.

## Findings fixed during the audit

1. Empty upgraded sample collections hid the new art experience. Sample v3
   added missing canonical records.
2. Existing sample memories did not receive new people/period/origin context.
   Sample v4 now merges missing canonical fields while preserving sample edits.
3. Memories and Private References still felt like generic inventory tables.
   They now use dedicated private-archive and continuity-led experiences.
4. Recovery was a disabled promise. It now creates and restores a real local
   encrypted kit.
5. Repeated file writes could leave a partial restore. Local originals now
   replace in one IndexedDB transaction after all inputs validate.
6. Future workspace versions could normalize into fallback sample data. A
   recovery kit now rejects any non-current workspace version before
   normalization.
7. The hidden recovery file input remained as a duplicate accessibility
   control. It is now removed from layout/accessibility exposure while the
   labeled custom picker remains operable.
8. Settings and Help contradicted the new recovery behavior. Their copy and
   actions now route to Vault and distinguish readable JSON, manual recovery,
   and unavailable cloud services.

## Automated verification

- Domain, taxonomy, collector, capture, security/sync, recovery: 96 passed.
- UI, recovery, accessibility smoke, globe: 46 passed.
- Sites/static routing: 4 passed.
- Total: 146 passed.
- Production/Sites-ready build: passed.

## Next production gates

1. Select an identity provider and reviewed household/device key hierarchy.
2. Implement tenant-safe API authorization and encrypted durable object
   storage; bind UI only after durable acknowledgement exists.
3. Connect real OCR/document scanning, room-session repositories, live
   QR/NFC adapters, and native background upload behind the tested contracts.
4. Run current pixel comparison for Vault, Memories, Art, and Private
   References when browser screenshots are available.
5. Complete cross-browser, 200% zoom, keyboard/screen-reader, Arabic/RTL,
   offline/quota, and real-device permission tests.
