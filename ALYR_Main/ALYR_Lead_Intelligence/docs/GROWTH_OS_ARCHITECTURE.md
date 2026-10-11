# ALYR Growth OS — architecture and agent contract

## Product role

Growth OS is ALYR's operating layer from market discovery to transformation delivery. It is not a second CRM and it is not a reporting mock-up. It resolves seven connected states:

1. market candidate;
2. verified evidence;
3. qualified relationship;
4. governed outreach and response;
5. won client account;
6. transformation project and workstreams;
7. measured completion, risk and next decision.

The owner-facing `Command` view reads those states as four lenses: **Focus**, **Market**, **Motion**, and **Delivery**. The detailed `Prospects`, `Pipeline`, `Delivery`, `Hermes`, and `Governance` views retain the operational evidence behind each summary.

## Canonical data boundaries

| Record | Canonical store | Identity | Main writer |
|---|---|---|---|
| Qatar market prospect | `market_prospects` | source + source ID | OSM scan, licensed import, human |
| Verified lead | `data/leads.json` | UUID | human-qualified website / Google discovery |
| Public business contact | `prospect_contacts` | UUID; deduplicated within prospect | Hermes or human |
| Outreach draft/action | `outreach_actions` | UUID | Hermes or human, approval-gated |
| Client account | `client_accounts` | UUID; source prospect link where present | Hermes or human after a real state change |
| Delivery project | `delivery_projects` | UUID + account link | Hermes or human |
| Operational event | `operational_events` | unique `dedupe_key` | all trusted sources |

SQLite at `data/alyr-market.sqlite` is the local canonical store for market, outreach and operations. The UI never fabricates client or delivery records. A true zero is presented as a true zero.

## Event spine

Every automation should write a small, source-attributed observation after the related operation succeeds. Events are immutable and idempotent.

```json
{
  "dedupeKey": "hermes:reply:provider-message-8392",
  "type": "outreach.replied",
  "source": "hermes",
  "entityType": "prospect",
  "entityId": "prospect-id",
  "category": "Travel & Tourism",
  "accountName": "Example account",
  "summary": "Owner replied and requested a website audit.",
  "valueQar": 0,
  "payload": {
    "channel": "email",
    "providerMessageId": "provider-message-8392",
    "sentiment": "interested"
  },
  "occurredAt": "2026-07-17T16:30:00.000Z"
}
```

Rules:

- The producer chooses a stable dedupe key from its own source ID. A retry reuses the same key.
- `occurredAt` is the time of the business event, not the retry time.
- `summary` is human-readable; `payload` contains structured evidence.
- Do not write `outreach.sent` until the provider confirms the send.
- Do not infer consent from a public email or phone number.
- Never place secrets, message bodies, passports, QIDs or sensitive document contents in an analytics payload.

## HTTP integration surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dashboard/command` | Read the complete owner operating picture |
| `GET/POST` | `/api/operations/events` | Read or append operational events |
| `GET/POST` | `/api/operations/accounts` | Read or upsert client accounts |
| `GET/POST` | `/api/operations/projects` | Read or upsert delivery projects |
| `GET/POST` | `/api/operations/contacts` | Read or upsert source-attributed public contacts |
| `GET` | `/api/market/prospects/:id` | Open a prospect dossier |

The current local server is bound to `127.0.0.1`. These endpoints are not ready for internet exposure until authentication, role-based access, transport security, request-level audit identity, managed secrets and backups are implemented.

## Hermes MCP tools

Hermes can use:

- `alyr_command_dashboard`
- `alyr_market_summary`
- `alyr_list_prospects`
- `alyr_get_prospect`
- `alyr_verify_website`
- `alyr_upsert_prospect_contact`
- `alyr_create_outreach_draft`
- `alyr_list_outreach_queue`
- `alyr_execute_approved_action`
- `alyr_upsert_client_account`
- `alyr_upsert_delivery_project`
- `alyr_record_operational_event`
- `alyr_suppress_prospect`

Hermes cannot edit permission evidence or approve an outreach action. Execution rechecks approval, permission and suppression at the moment of action.

`alyr_market_summary` also returns a non-secret `runtime` readiness block so agents can confirm whether outreach mode and email/WhatsApp/Google adapters are configured. It exposes booleans and mode only; credentials never enter tool output.

## Recommended agent sequence

```text
Read command picture
        ↓
Select category / priority prospect
        ↓
Read full prospect and public evidence
        ↓
Add source-attributed contact (if independently verified)
        ↓
Create internal task or outreach draft
        ↓
Human permission check and approval
        ↓
Execute approved action only
        ↓
Record provider result / response event
        ↓
Human advances relationship; won state creates account
        ↓
Create outcome project and stream milestone events
```

## Category scoring

The category field separates two concepts:

- **Potential**: market scale, website/evidence gap and average transformation fit.
- **Traction**: qualified pipeline position, actioned prospects, replies, meetings, proposals and clients.

Potential without traction is a research priority. Traction without sufficient potential may still be a valuable niche. The dashboard deliberately does not call total business count “traction.”

## Production evolution

### Now

- local SQLite and Express API;
- React command, prospect and delivery views;
- approval-gated Hermes MCP;
- OSM / ODbL national research layer;
- optional user-initiated Google Places discovery.

### Next

- authenticated ALYR users and role scopes;
- organization / tenant boundary;
- webhook intake with signature verification;
- durable job queue and retry ledger;
- canonical account identity resolution between market and verified-lead stores;
- saved filters, assignments, tasks and reminders;
- contact-source expiry and re-verification dates;
- explicit outcome definitions and KPI baselines per project.

### Later

- managed PostgreSQL event and entity store;
- encrypted object storage for approved client documents;
- warehouse / semantic metrics layer;
- channel adapters behind one consent service;
- audit exports, SSO, managed backups and disaster recovery;
- cross-business owner command center.

## Non-negotiable governance

- Google Maps UI scraping is not part of this system. Official Google Places is an optional live-display search boundary.
- OpenStreetMap records retain ODbL attribution and source URLs.
- Public contact availability is not outreach permission.
- An agent may draft but may not approve its own external communication.
- Suppression wins over every campaign, task and agent recommendation.
- AI recommendations must expose evidence and remain human-reviewed for sales claims, legal language, commitments and sensitive data.
