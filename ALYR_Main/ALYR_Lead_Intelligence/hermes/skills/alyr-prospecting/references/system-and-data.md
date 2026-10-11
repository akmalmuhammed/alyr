# Growth OS system and data reference

## Canonical operating states

1. Market candidate
2. Verified public evidence
3. Qualified relationship
4. Governed outreach and response
5. Won client account
6. Transformation project and workstreams
7. Measured outcome, risk, and next decision

The owner dashboard reads these states through Focus, Market, Motion, and Delivery. Detailed views retain the evidence behind every summary.

## Canonical stores

| Record | Store | Main identity |
|---|---|---|
| Qatar market prospect | SQLite `market_prospects` | source + source ID |
| Original qualified lead | `data/leads.json` | UUID |
| Public business contact | SQLite `prospect_contacts` | UUID + prospect link |
| Outreach action | SQLite `outreach_actions` | UUID |
| Client account | SQLite `client_accounts` | UUID + optional source prospect |
| Delivery project | SQLite `delivery_projects` | UUID + account link |
| Operational event | SQLite `operational_events` | unique `dedupe_key` |

The local database is `data/alyr-market.sqlite`. Never query or modify it directly when an MCP tool exists.

## MCP tool map

### Read

- `alyr_command_dashboard` - complete owner picture
- `alyr_market_summary` - coverage, verification, permission, and queue health
- `alyr_list_prospects` - filtered prospect universe
- `alyr_get_prospect` - full dossier and evidence
- `alyr_list_outreach_queue` - action and approval state

### Controlled writes

- `alyr_verify_website` - guarded public verification
- `alyr_upsert_prospect_contact` - public, source-attributed contact
- `alyr_create_outreach_draft` - task/email/WhatsApp draft under permission rules
- `alyr_execute_approved_action` - exact, separately approved action only
- `alyr_record_operational_event` - immutable idempotent business observation
- `alyr_upsert_client_account` - confirmed account state
- `alyr_upsert_delivery_project` - confirmed delivery state
- `alyr_suppress_prospect` - immediate opt-out/suppression

Hermes tool names are prefixed `mcp_alyr_market_`.

## Event contract

Every trusted automation should write a small event after its operation succeeds. Use:

- a stable source-specific `dedupeKey`;
- the real event time in `occurredAt`;
- a concise human-readable summary;
- structured non-sensitive evidence in `payload`;
- no secrets, full message bodies, identity documents, child/family data, or sensitive client content.

Retries must reuse the same dedupe key. Do not record a send, reply, meeting, proposal, win, or project milestone before it happens.

## Source interpretation

- OpenStreetMap is a broad ODbL research layer, not an official registry and not exhaustive.
- Permission-filtered prospect totals intentionally cover commercial and review-eligible records, not every named source record. Excluded noncommercial records remain in the all-record source total and should not be interpreted as a permission-coverage gap.
- An outreach action with status `sent` may be an internally released task. Use `externalMessagesSent` to count actual email/WhatsApp dispatches and `internalTasksReleased` for internal workflow actions.
- A missing source website does not prove no website exists.
- Website verification is a point-in-time technical observation, not proof of ownership, revenue, decision-maker identity, need, or consent.
- Google Places is an optional official live-search boundary. Do not scrape Google Maps UI or persist restricted content.
- Verification errors may represent DNS, robots, 403/429, timeout, dynamic rendering, or changed domains; they do not prove inactivity.

## Integration posture

The local API binds to `127.0.0.1`. Do not expose it publicly before authentication, role-based access, transport security, request-level actor audit, managed secrets, rate controls, and backups exist. Future agents and sources should integrate through MCP/API and the idempotent event spine rather than editing dashboard files.

`alyr_market_summary.runtime` exposes only safe readiness metadata: outreach mode, SMTP/WhatsApp configured booleans, Google Places configured boolean, approval requirement, permission-record scope, and local-only status. It never exposes provider credentials.
