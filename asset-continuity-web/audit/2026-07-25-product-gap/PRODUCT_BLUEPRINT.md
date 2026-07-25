# ALYR — Research-to-Product Blueprint

Date: 2026-07-25  
Scope: current web prototype compared with the product and market research  
Decision: validate the focused web product before production infrastructure or native apps

## Executive verdict

ALYR is no longer just a visual concept. It is a substantial local web prototype with a strong asset, location, evidence, retrieval, and recovery foundation. It is not yet a production product or a validated business.

The research does not support launching another broad “track everything you own” app. The strongest wedge is an evidence-grade continuity system for multi-home or collector households, often introduced by a trusted professional.

The focused promise is:

> **Know it. Find it. Prove it. Hand it over.**

The next milestone is not “more features.” It is a validation-ready web flow that lets a household create a useful Asset Passport in under five minutes, complete a 25-critical-asset register, retrieve an item, and produce a professional continuity package.

## 1. Research compared with current progress

Status key:

- **Strong** — working and reusable in the focused product
- **Partial** — useful prototype, but not yet the promised product
- **Missing** — required for validation or production
- **Defer** — deliberately outside the focused web MVP

| Product dimension | What the research says | What currently exists | Gap / risk | Status | Next decision |
|---|---|---|---|---:|---|
| Positioning | A broad consumer asset tracker is crowded; exact location, proof, continuity, and trusted distribution are more defensible | Home promises “Everything you own” across possessions, records, memories, finance, and digital references | Too broad to explain, onboard, price, or validate cleanly | **Partial** | Position ALYR around evidence-grade household continuity |
| Target user | Start with high-complexity households: multiple homes, collections, valuable physical assets, or handoff needs | Product supports almost any person and 64 category leaves | The ideal first customer is not visible in the product | **Missing** | Design the default experience for multi-home / collector households |
| First useful moment | The user must receive value before cataloguing feels like work | Welcome flow and First Useful Vault exist; current target is a place, five items, one proof, and one retrieval | Initial asset form exposes too many optional fields before the reward | **Partial** | Build a Quick Passport that takes less than five minutes |
| Exact location | Exact, approximate, and unknown locations must be honest and useful | Address lookup, GPS accuracy, adjustable map pin, manual coordinates, Place → room → container, locator text, and movement history work | Real-device camera/GPS behavior and production geocoding are unvalidated | **Strong prototype** | Make this a primary product pillar and test it in real homes |
| Asset Passport | Each capture should create an immediately useful identity, location, and proof record | Passport, readiness score, category-aware details, location, history, and proof are implemented | Passport needs a focused critical-asset checklist and faster first completion | **Strong prototype** | Keep the model; simplify the first presentation |
| Evidence integrity | Originals, changes, and review status must be trustworthy without claiming legal verification | Local original files, SHA-256 identity, pending/reviewed states, immutable versions, replacements, and safe previews work | No production object storage, upload recovery, malware quarantine, or remote authorization | **Strong local prototype** | Preserve the rules; replace the storage boundary after validation |
| Globe / portfolio view | Geography can aid orientation, but it is not the core job | Premium WebGL globe, region aggregates, reduced-motion behavior, and list fallback exist | Markers represent region totals, not every asset; it can distract from first value | **Strong secondary feature** | Keep as overview; make capture, search, and readiness primary |
| Search and retrieval | The product should prove “I can find it now” | Search spans assets, places, spaces, evidence, and members; retrieval can be recorded without storing the query | Search is local and has no production permission filtering or funnel measurement | **Strong local prototype** | Include a successful physical retrieval in activation |
| Trusted access | Family and professionals need deliberate, scoped, revocable access | Family UI, demo members, local roles, and a local service foundation exist | Invitations are not delivered; permission management is disabled; no scoped grants or revocation | **Missing core promise** | Prototype person → scope → fields → preview → revoke |
| Professional output | The buyer needs a useful dated package for continuity, insurance, or estate preparation | Full-workspace JSON and encrypted recovery kit exports exist | JSON is not a customer reward or professional workflow | **Missing** | Build a redaction-aware PDF plus CSV/JSON manifest |
| Privacy and recovery | Trust must be legible, not only technically claimed | Checksums, safe previews, scoped browser state, encrypted recovery kits, CSRF, scrypt, and local encrypted backup exist | Browser storage is not a durable system of record; the service is localhost-only | **Partial** | Keep honest protection copy; threat-model the focused v1 |
| Production backend | Durable sync, tenant isolation, identity, storage, permissions, and operations are required only after demand is credible | A real local integration service and deterministic sync/security contracts exist | No production database, object store, remote sync, passkeys, monitoring, or restore operations | **Missing** | Do not scale the backend before the validation gate passes |
| Analytics | Activation, retention, retrieval, export, and willingness to pay must be measurable without exposing private data | No production analytics pipeline | The team cannot presently evaluate product-market fit | **Missing / P0** | Add a minimal privacy-safe event contract |
| Partner distribution | Brokers, advisers, estate professionals, residence managers, and collection professionals may lower trust and acquisition friction | Family/role concepts exist | No partner organization, enrollment, review, or paid-pilot workflow | **Missing** | Validate manually with 30 partner conversations before building a portal |
| Automated quality | Core rules need reliable regression protection | **365/365 automated tests pass**: 228 domain, 7 server, 126 UI, 4 routing | Mostly jsdom; no complete production-like E2E, browser matrix, or real-device pass | **Strong foundation** | Add critical-journey E2E and real-device validation before household studies |
| Accessibility / international use | Premium must remain usable with keyboard, assistive technology, zoom, reduced motion, and RTL | Semantic structure, reduced-motion support, and accessible globe fallback are present | Safari, Firefox, screen reader, 200% zoom, forced colors, Arabic/RTL remain unverified | **Partial** | Include these in the production gate; do not claim WCAG compliance yet |
| Native apps | Native capture is valuable only after the web loop and contracts are proven | A separate mobile visual prototype and parity contract exist | Native work would duplicate an unsettled product | **Defer** | Resume only after paid web-pilot retention passes |

## 2. What should remain, move, or wait

| Keep in focused MVP | Keep, but secondary | Hide or defer |
|---|---|---|
| Household and trusted invitation | Globe overview | Bank aggregation and net-worth tracking |
| Properties, rooms, zones, and containers | QR labels | Passwords, seed phrases, and credentials |
| Exact / approximate / unknown location | OCR suggestions with human confirmation | Broad memory atlas as a primary flow |
| Asset Passports | Collection presentation | Public showcases |
| Photos, receipts, appraisals, and proof | Service and condition history | Collection goals and wishlists |
| Immutable evidence versions | Premium gradient motion and ambient effects | Marketplace and live valuation feeds |
| Basic ownership, custody, condition, and provenance | Advanced collection tools behind feature boundaries | Emergency or death-triggered release |
| Search and physical retrieval |  | Legal, insurance, or investment advice |
| Scoped, revocable access |  | Advanced AI fact acceptance |
| Evidence-gap review |  | Native iOS and Android builds |
| Versioned continuity package |  |  |
| Privacy-safe product analytics |  |  |
| Accessible list alternative to the globe |  |  |

Design principle: premium should come from restraint, hierarchy, clear feedback, excellent typography, purposeful motion, and consistent icons—not from adding more gradients or more choices.

## 3. Focused web user flow

| Step | User action | Immediate outcome | Business logic |
|---:|---|---|---|
| 1 | Accept a trusted invitation or start privately | Knows why ALYR is useful and who can see what | Invitation and consent are distinct records |
| 2 | Create the household | Private workspace and recovery expectations are clear | Household membership is authoritative and revocable |
| 3 | Add the first property | Establishes the physical root of the asset map | A Place is not automatically an owned asset |
| 4 | Capture one critical asset | Photo plus a minimal identity in under five minutes | Ask only what is needed for the first useful Passport |
| 5 | Place it | Property → room → zone/container → optional locator text | Exact, approximate, and unknown are explicit states |
| 6 | Attach one proof item | Receipt, appraisal, certificate, warranty, or ownership evidence is linked | Evidence can relate to multiple assets; originals are immutable |
| 7 | Receive the Asset Passport | User can immediately search, locate, and inspect proof gaps | “Reviewed by you” never means authenticated or insured |
| 8 | Repeat or batch to 25 | Builds the household’s critical register | Drafts survive interruption; duplicate suggestions never auto-merge |
| 9 | Retrieve an asset | User proves they can physically find it | Search authorizes before revealing names, counts, or snippets |
| 10 | Share deliberately | Relative or professional sees only the chosen scope | Ownership, custody, location, and visibility remain separate |
| 11 | Export a dated package | Creates a useful insurance/estate-supporting snapshot | Export is permission-scoped, versioned, and redaction-previewed |
| 12 | Review periodically | Confirms assets, locations, access, and evidence are still current | Changes append history; they do not rewrite the past |

## 4. Delivery blueprint

Indicative ranges assume a focused startup team of roughly 5–7 people. Phases 1 and 2 can overlap.

| Phase | Timing | Product / engineering output | Exit gate |
|---|---:|---|---|
| **0. Safe baseline** | 2–4 days | Put the current workspace under version control; exclude local credentials/state/vaults; capture reproducible install, test, and build; add CI and secret scanning | Clean install plus test/build succeeds from a reviewed baseline commit |
| **1. Validate the wedge** | 4–6 weeks | Recruit 20 qualified households; concierge-onboard 25 critical assets each; conduct 30 professional-partner conversations; present a real $99 offer | At least 12/20 complete 25 assets in seven days and 8/20 return unprompted on days 30–45 |
| **2. Reset the product contract** | 1–2 weeks, parallel | Focused PRD, target user, terminology, permissions matrix, event contract, deferred-feature register, and v1 journey | Founder, product, design, engineering, and security agree on one measurable core loop |
| **3. Make the prototype validation-ready** | 2–4 weeks | Repositioning, sub-five-minute Quick Passport, 25-item progress, partner-assisted onboarding, access preview, professional export prototype, and critical E2E | Target users complete the moderated flow without facilitator rescue |
| **4. Freeze data and security architecture** | 2–3 weeks | Threat model, retention/deletion policy, schema and API v0.1, access grants, evidence versions, export snapshots, audit contract, and negative permission fixtures | Architecture and incident ownership reviewed; no unresolved authorization ambiguity |
| **5. Build production web alpha** | 8–12 weeks | Modular API, PostgreSQL, encrypted object storage, identity, permissions, uploads, search, invitations, audit, analytics, backup, and the focused responsive web UX | One invited household completes the full flow on deployed infrastructure with no local-demo dependency |
| **6. Production gate** | Continuous plus 2–3 weeks hardening | Browser E2E, cross-tenant negatives, Safari/Firefox, mobile web, accessibility, Arabic/RTL, restore drill, upload abuse testing, and security assessment | No P0/P1 defects, no critical/high security finding, and an independently verified restore |
| **7. Paid partner pilot** | 8–12 weeks | Three partners, at least ten households per partner, concierge operations, support tracking, and weekly funnel reviews | Three paid pilots at least $5K annualized each plus household activation and retention gates |
| **8. Scale / pivot / stop** | Decision gate | Evaluate willingness to pay, acquisition cost, support load, trust, completion, retention, and channel repeatability | Scale only if the hard gates pass; otherwise narrow, pivot to concierge/B2B tooling, or stop |
| **9. Native entry** | After Phase 8 only | Freeze shared contracts; validate camera, offline, passkey, notification, and RTL requirements; then build platform-native capture clients | Native creates a measured advantage over the responsive web product |

## 5. Immediate validation-ready backlog

| Priority | Work item | Acceptance |
|---:|---|---|
| P0 | Create a safe Git baseline and CI | Reproducible clean install, 365+ tests, and build pass from a clean checkout |
| P0 | Freeze broad feature expansion | Memories, finance, digital references, and advanced collector tools no longer compete with the default journey |
| P0 | Decide the product name and focused promise | Welcome, Home, onboarding, and metadata describe the same target and outcome |
| P0 | Add a sub-five-minute Quick Passport | A new user can add photo, minimum identity, exact location, and one proof item without optional-field overload |
| P0 | Define privacy-safe events | No names, addresses, coordinates, values, identifiers, queries, or document contents enter analytics |
| P0 | Add 5-item and 25-item progress | User sees a credible path from first useful Passport to completed critical register |
| P0 | Build professional export prototype | Selected records produce a dated PDF plus structured manifest, proof status, missing-proof list, and redaction preview |
| P0 | Build trusted-access preview | Person → Places/assets → field groups → preview → expiry/revoke works locally and is clearly labeled as prototype-only |
| P0 | Add critical journey E2E | Welcome → property → Quick Passport → proof → retrieval → access preview → export passes at desktop and mobile-web sizes |
| P0 | Run real-device checks | Camera, GPS, pin adjustment, file upload, interruption recovery, and touch targets pass on representative iOS and Android browsers |
| P1 | Run household and partner validation | Structured observation, friction log, activation, retention, willingness-to-pay, and support time are recorded |
| P1 | Freeze production contracts | Schema, API, permissions, audit, evidence, retention, and recovery behavior are reviewed before backend construction |

## 6. Privacy-safe metric contract

| Funnel stage | Event | Decision supported |
|---|---|---|
| Qualified invitation | `pilot_invitation_accepted` | Partner conversion |
| Setup | `household_created` | Trust/setup abandonment |
| First value | `first_asset_passport_created` | Time to first useful moment |
| Location | `asset_location_confirmed` | Location usability |
| Proof | `first_evidence_reviewed` | Evidence-loop completion |
| Activation | `critical_register_25_completed` | Core household completion |
| Retrieval | `asset_retrieval_completed` | “Find it” utility |
| Sharing | `access_grant_created` | Continuity collaboration value |
| Export | `continuity_snapshot_exported` | Professional workflow value |
| Retention | `household_returned_day_30_45` | Episodic retention |
| Revenue | `reservation_paid`, `pilot_contract_signed` | Willingness to pay and channel validity |

Only opaque IDs, timestamps, flow states, and non-sensitive error classes should be sent.

## 7. Hard business gates

| Gate | Pass | Warning / stop condition |
|---|---|---|
| Household activation | At least 12 of 20 households finish 25 critical assets within seven days | Stop self-service expansion if fewer than 8 finish |
| Episodic retention | At least 8 of 20 return unprompted during days 30–45 | Rework the recurring value if fewer than 5 return |
| Consumer willingness to pay | At least 10 paid $99 subscriptions or refundable reservations from 100 qualified leads; projected CAC ≤ $30 | Stop broad paid acquisition if fewer than 5 pay or projected CAC exceeds $60 |
| Partner distribution | At least three paid pilots at ≥ $5K annualized, with at least ten households each | Stop the partner-portal roadmap if zero or one partner buys after 30 qualified conversations |

## 8. Team ownership

| Owner | Immediate accountability |
|---|---|
| Founder / CEO | Recruit households, conduct partner conversations, make the offer, close pilots |
| Product lead | Focused PRD, experiment log, activation definition, and gate reviews |
| Product designer / researcher | Moderated studies, Quick Passport, capture/reward loop, and access/export comprehension |
| Frontend engineer | Preserve the current design while extracting feature boundaries, instrumenting the loop, and building E2E |
| Backend / security engineers | Threat model, authoritative grants, production persistence, evidence pipeline, audit, and recovery |
| QA / product engineer | Browser/device matrix, failure recovery, accessibility, RTL, and cross-tenant negative tests |
| Concierge / pilot operations | Household setup, friction notes, support-time measurement, and follow-up |
| Privacy / security counsel | Data map, retention/deletion policy, architecture review, and partner terms |

## 9. Visual walkthrough evidence

These screenshots were captured from the running local web app during this audit.

| Step | Screen | Health | What it demonstrates |
|---:|---|---:|---|
| 1 | [Home](./01-home.png) | Healthy | Premium responsive shell and globe-led portfolio overview; positioning remains too broad |
| 2 | [Add anything](./02-add-anything.png) | Needs focus | Functional launchpad, but too many intents and categories for first use |
| 3 | [Identify asset](./03-identify-asset.png) | Needs focus | Rich Watch schema, but optional detail appears before the first reward |
| 4 | [Exact location](./04-exact-location.png) | Healthy | Explicit location certainty and nested physical placement |
| 5 | [Proof materials](./05-proof-materials.png) | Healthy | Evidence types are separated and understandable |
| 6 | [Review asset](./06-review-asset.png) | Healthy | Clear confirmation before saving |
| 7 | [Record added](./07-record-added.png) | Healthy | Useful success state and next action |
| 8 | [Asset Passport](./08-asset-passport.png) | Healthy | Strong identity, readiness, location, and evidence outcome |
| 9 | [Family access](./09-family-access.png) | Prototype-only | Honest UI disclosure; real invitations and permissions are not connected |
| 10 | [Vault materials](./10-vault-materials.png) | Healthy locally | Evidence organization and protection messaging |
| 11 | [Protection state](./11-protection-state.png) | Prototype-only | Clearly exposes missing production cloud/passkey guarantees |
| 12 | [Local account and recovery](./12-local-account-recovery.png) | Prototype-only | Same-computer account/recovery integration, not production sync |

## Final sequence

```text
Safe repository baseline
        ↓
Focused wedge and product promise
        ↓
Quick Passport + private event contract
        ↓
Professional export + access preview
        ↓
20-household / 30-partner validation
        ↓ only if the hard gates pass
Production identity, security, storage, sync, and partner pilot
        ↓ only after retained paid web usage
Native iOS and Android
```
