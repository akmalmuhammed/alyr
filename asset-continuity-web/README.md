# Continuity — web-first product build

Continuity is a private asset-continuity product concept for organizing places,
rooms/zones, physical and digital assets, memories, and supporting evidence.

This repository is the canonical responsive web build used to validate product
flows before separate iOS and Android clients are created.

## Current working scope

- First-open Sample vs Personal decision
- Globe and accessible place-list Home
- Place → room/zone → asset hierarchy
- Honest Place pins, adjustable maps, nested indoor paths, and immutable asset
  location revisions. A device fix is exact only at 15 m accuracy or better;
  weaker fixes remain approximate. Closed revisions retain the Place pin and
  room/container path that were true at the time.
- Category-aware location truth: a physical item is Known only with a Place
  plus a room, container, or useful locator clue; real estate also requires a
  confirmed exact Place pin. Eligible digital records can explicitly use No
  physical location without weakening physical-item rules.
- Search, filters, asset passports, location states, and lifecycle archive
- Category-first asset capture that works with or without a known place
- Universal papers, artifacts, media, notes, links, and records on every asset
- Real on-device originals with validation, SHA-256 metadata, recoverable
  capture drafts, missing-original reattachment, and immutable replacement
  history. Metadata-only and file-backed captures wait for durable,
  idempotent commits before showing success; a failed save retains the draft
  and leaves neither orphan records nor orphan bytes. PDF, HEIC/HEIF/AVIF
  photos, MP4/MOV video, audio, text, Word, and Excel originals can be stored.
  Only JPEG, PNG, WebP, and AVIF render inline; every other original remains
  download-only until a separately generated safe rendition exists.
- One canonical collector bridge from Asset Passports, collections, and
  materials into collector profiles and histories without creating a second
  inventory
- Functional collection Care & Goals: append-only condition/service history,
  explainable health and completion, deliberate targets, research wishes, and
  matching an existing piece to a goal
- Curated collector and art experiences; distinct physical-object, story,
  person, and moment memory flows; canonical people links with living-person
  consent and deliberate public labels; and private financial references that
  never store credentials
- Pending materials and explicit, idempotent human review. A file-backed
  material can be reviewed only after the stored original's identity,
  metadata, and SHA-256 match the canonical record. Replacing any part of that
  file identity revokes review and reopens the related proof task.
- Independent original-material storage paths with honest unknown,
  needs-detail, external-custodian, and not-applicable states plus
  actor-attributed correction history
- A five-outcome First Useful Vault guide: Place, five useful records, one
  complete-enough passport, one reviewed source, and one successful Search
  retrieval
- Demo Family invitation state
- Honest local-device Vault, readable metadata export, and one manually
  transferred passphrase-protected recovery kit with available originals
- Desktop, tablet, and narrow-web navigation adaptations
- On-device document text extraction with mandatory review before extracted
  values can become record data
- Recoverable multi-photo room capture sessions and printable QR asset labels
- A same-origin local account service for testing household roles and durable,
  content-addressed encrypted recovery-kit storage across browser sessions
- Tested foundations for movement conflicts, encrypted upload envelopes,
  permissions, offline queues, and native camera/background-upload adapters

This remains a local product prototype. The optional local service provides
real cookie-authenticated test accounts and durable encrypted backup storage
on this computer; it is not an internet-facing production identity or cloud
service. The build does not yet provide passkeys, production tenant isolation,
invitation delivery, malware scanning, authoritative verification, automatic
record sync, or deployable cross-device continuity. Keep a separately stored
vault passphrase and a manual recovery kit. Clearing browser data can remove
local records and originals that were not backed up.

Authenticated browser sessions now use account-and-household-scoped workspace,
draft, original, history, and recovery-generation identities; the local demo
remains a separate compatibility scope. Production release is still blocked by
internet-grade passkeys and device keys, server-side record authorization,
tenant-isolated object storage, malware/rendition isolation, monitored backup
and restore drills, real invitation delivery/revocation, and production
cross-device sync.

## Local development

Run the responsive client and its same-origin account/backup service together:

```bash
npm run dev:full
```

The client opens on `http://localhost:4173` and proxies `/api` to the local
service. Service state and encrypted backup objects stay inside `server/data/`,
which is ignored by Git. See `server/README.md` for the local security boundary.

## Validation

```bash
npm test
npm run build
npm audit
```

Current verified result:

- Domain and contract checks: **228/228**
- Local service checks: **7/7**
- UI checks: **126/126**
- Sites/static-routing checks: **4/4**
- Total automated checks: **365/365**
- Production/Sites-ready build: **pass**
- `npm audit`: **0 vulnerabilities**

Product and engineering contracts:

- `docs/CANONICAL_FLOWS.md`
- `docs/WEB_FIRST_ARCHITECTURE.md`
- `docs/MOBILE_PARITY_CONTRACT.md`
- `docs/PRODUCT_DECISIONS.md`
- `docs/QA_MATRIX.md`

Current visual-QA status is recorded in `design-qa.md`.
