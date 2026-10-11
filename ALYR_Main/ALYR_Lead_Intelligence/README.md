# ALYR Growth OS — Qatar Market, Pipeline and Transformation Command Center

An ALYR-branded operating system from Qatar market research to prospect qualification, governed agent action, client onboarding and transformation delivery. It combines a locally storable open-data scan, independently verified public website evidence, the official Google Places discovery workflow, an owner decision dashboard, a human-controlled Hermes queue, and an outcome-based project portfolio.

The system does **not** scrape the Google Maps interface. Google Places remains an optional live search layer and its content is not copied into the local directory. The broad local scan uses OpenStreetMap under ODbL; coverage is useful but is not exhaustive and is not an official Qatar commercial registry.

## Current local snapshot — 16 July 2026

| Measure | Result |
|---|---:|
| Named Qatar records stored | 7,758 |
| Commercial / review-eligible records | 7,316 |
| High-confidence commercial candidates | 6,594 |
| Source-listed websites | 496 |
| Eligible websites independently verified | 287 |
| Website checks with documented error / restriction | 170 |
| Eligible websites still queued | 0 |
| Records with public email evidence | 301 |
| Records with public phone evidence | 557 |
| Records with recorded outreach permission | 0 |
| External messages sent | 0 |

Verification errors include stale DNS, 404s, 403s, 429s, robots restrictions, timeouts and safe-size limits. These records remain available for manual research but are never mislabelled as verified.

## Open the app

The production build is currently served locally at:

```text
http://127.0.0.1:8787
```

To restart it manually:

```powershell
cd C:\Users\akmal\OneDrive\Documents\alyr\ALYR_Lead_Intelligence
npm install
npm run build
npm start
```

For live development:

```powershell
npm run dev
```

## What is included

- Owner-facing `Command` dashboard with Focus, Market, Motion and Delivery lenses
- Category opportunity field that separates market potential from real traction
- Priority prospect dossiers with verified evidence, recommended ALYR offer, opening angle, contact readiness and next move
- Unified funnel from Qatar candidate to verified evidence, relationship, meeting, proposal and client
- Client-account and transformation-project records with outcome phase, health, workstreams, blockers and milestones
- Idempotent event spine for Hermes, CRM, discovery, verifier and future integrations
- Source-health and provenance view; true zeros remain true rather than demo-filled metrics
- Qatar-wide licensed/open-data scan with resumable SQLite persistence
- Sector and location classification, target/review/exclusion states and ALYR-fit scoring
- ODbL attribution and source URL retained on every OSM record
- Guarded website verification with robots checks, SSRF/private-network blocking, redirect limits, response-size limits and timeouts
- Public email, phone, social, language, technology and transformation-signal extraction
- Domain-isolated verification workers; the same domain is never checked concurrently
- Shared-site evidence reuse for franchise/location records
- CSV exports for the complete scan and the commercial research subset
- ALYR Carbon + Volt national radar, filters, account inspector and responsive mobile UI
- Permission evidence, opt-out and suppression controls
- Hermes MCP server and ALYR prospecting skill
- Human review queue with draft, approve, reject, execute, failure and audit states
- SMTP and Meta WhatsApp Cloud API adapters, disabled by default
- Original official Google Places search flow for narrow, user-initiated discovery

The integration and data contract is documented in `docs/GROWTH_OS_ARCHITECTURE.md`.

## Commands

```powershell
npm run scan:qatar                 # Refresh the broad OSM Qatar dataset
npm run verify:market -- --limit=250  # Verify the next eligible website batch
npm run reclassify:market           # Reapply current sector rules to saved records
npm run export:market              # Refresh local CSV + JSON exports
npm run mcp                        # Run the ALYR MCP server from TypeScript
npm run mcp:built                  # Run the compiled MCP server
npm run smoke:hermes               # Assert all 13 tools + run a read-only MCP smoke test
npm test                           # Unit tests
npm run build                      # Type-check + frontend/server production build
npm run check                      # Tests followed by the complete build
```

## Local data inventory

- `data/alyr-market.sqlite` — canonical market, scan, verification, permission, suppression and outreach database
- `data/exports/qatar-market-all.csv` — all 7,758 named scan records, including excluded civic/noncommercial classifications
- `data/exports/qatar-commercial-prospects.csv` — 7,316 candidate and needs-review records
- `data/exports/qatar-market-summary.json` — generated coverage, verification and provenance report
- `data/leads.json` — original user-qualified Google/website lead pipeline

The SQLite database and exports are local operational data and are ignored by Git.

## Hermes integration

The MCP implementation is `server/mcp.ts`. It exposes:

1. `alyr_command_dashboard`
2. `alyr_market_summary`
3. `alyr_list_prospects`
4. `alyr_get_prospect`
5. `alyr_verify_website`
6. `alyr_upsert_prospect_contact`
7. `alyr_create_outreach_draft`
8. `alyr_list_outreach_queue`
9. `alyr_execute_approved_action`
10. `alyr_upsert_client_account`
11. `alyr_upsert_delivery_project`
12. `alyr_record_operational_event`
13. `alyr_suppress_prospect`

Hermes does **not** receive a permission-editing or approval tool. It can research, verify, draft and execute an action that a human already approved, but it cannot approve its own message or grant itself consent.

Use the files under `hermes/`:

- `hermes/config.windows.example.yaml`
- `hermes/config.wsl.example.yaml`
- `hermes/skills/alyr-prospecting/SKILL.md`
- `hermes/ALYR_HERMES_OPERATING_MODEL.md`
- `hermes/memory/ALYR_MEMORY_SEED.md`
- `hermes/prompts/ALYR_HERMES_BOOTSTRAP.md`
- `hermes/README.md`

Hermes also loads `.hermes.md` automatically when it starts from this project directory. That file provides stable ALYR identity, architecture, authority and roadmap context. Current metrics are deliberately excluded; Hermes must read them from MCP at the start of every run.

Run `hermes config path` to find the active profile, merge the relevant example, then restart Hermes or run `/reload-mcp`. On this Windows installation the active file is `%LOCALAPPDATA%\hermes\config.yaml`. The standard external outreach setting remains:

```yaml
OUTREACH_MODE: "disabled"
```

Official Hermes references:

- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- https://hermes-agent.nousresearch.com/docs/user-guide/features/skills

## Outreach control flow

```text
Open-data candidate
      |
Website/source verification
      |
Hermes account brief + draft
      |
Human records permission evidence
      |
Human reviews destination + content + opt-out
      |
Human approval
      |
Hermes/provider execution rechecks permission + suppression
      |
Provider ID / failure stored in audit trail
```

Channel gates:

| Channel | Draft | Human approval | Execution |
|---|---:|---:|---:|
| Internal task | Allowed unless opted out | Required | Local only |
| Email | Allowed for review | Opt-in or counsel-approved B2B basis required | Live mode + SMTP required |
| WhatsApp | Allowed for review | Explicit WhatsApp opt-in + approved template required | Live mode + Cloud API required |

Public contact availability is not consent. Unknown permission blocks external approval. Opt-out suppresses the prospect and all known channel destinations.

## Provider setup

Copy `.env.example` to `.env`. Do not commit secrets.

Live email requires:

```env
OUTREACH_MODE=live
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_REPLY_TO=
```

Live WhatsApp requires:

```env
OUTREACH_MODE=live
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_VERSION=v23.0
```

Enabling live mode does not bypass approval, permission, template or suppression checks.

## Data and compliance boundaries

- OpenStreetMap-derived data is retained under ODbL with attribution and source links: https://www.openstreetmap.org/copyright
- Google Places content remains a live-display boundary; only Place IDs and independently verified/user-owned data enter persistent leads: https://developers.google.com/maps/documentation/places/web-service/policies
- Qatar's NCSA direct-marketing guidance requires organizations to assess consent, sender identity, marketing purpose, evidence and opt-out handling: https://assurance.ncsa.gov.qa/sites/default/files/library/2022-12/Electronic%20Communications%20for%20Direct%20Marketing%20-%20Guideline%20for%20Regulated%20Entities.pdf
- WhatsApp requires the recipient's number and opt-in, approved initiated-message templates and honored opt-outs: https://www.whatsapp.com/legal/business-policy/

Before production outreach, ALYR should obtain Qatar legal counsel on whether each target and channel is permitted, who is an individual versus corporate contact, consent evidence, retention, cross-border processing, suppression, call/SMS rules, worker/family data and provider contracts.

## Architecture

```text
OpenStreetMap / ODbL              Optional Google Places (live only)
            |                                  |
            v                                  v
     Qatar scan + classifier             Search boundary
            |                                  |
            +------------+---------------------+
                         v
              Guarded website verifier
                         |
                         v
                 Local SQLite evidence
                  /                 \
                 v                   v
        ALYR React control center   Hermes MCP + skill
                 |                   |
                 +------ human review
                            |
                    permission + approval
                            |
                    SMTP / WhatsApp adapters
                      (disabled by default)
```

## Important limitations

- The scan reflects OSM contributor coverage and can contain duplicates, stale entries, sparse municipalities and incomplete locations.
- “No website in source” means only that the source record lacked a URL; it is not proof the business has no website.
- Website verification confirms public technical evidence at a point in time, not company ownership, financial capacity, decision-maker identity or marketing permission.
- Fit scores prioritize research; they are not objective business-quality judgments.
- 403/429/robots outcomes are respected and are not bypassed.
- The current local deployment has no SSO. Keep it on `127.0.0.1`; production requires authentication, role controls, encrypted secrets, managed backups and security monitoring.

## Key folders

- `src/` — React Growth OS command center and ALYR interface system
- `server/` — API, scan, verifier, SQLite store, outreach adapters and MCP server
- `.hermes.md` — automatically loaded ALYR project context and authority contract
- `hermes/` — Hermes configs, operating model, prompts, memory seed and ALYR skill
- `public/alyr/` — approved ALYR marks, tokens, icons and digital assets
- `docs/GROWTH_OS_ARCHITECTURE.md` — event, API and Hermes integration contract
- `data/` — ignored local operational data and generated exports
