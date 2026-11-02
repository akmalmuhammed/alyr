# 065 · Outreach engine: find, research, draft, approve, send, follow up

Linear ALY-310 (engine and API) and ALY-311 (the `/ops/outreach` screens) · Decision D-152 · Builds on the back office (D-033, `docs/internal-tool.md`), the job runner (`core/jobs.py`, D-077, D-078), the back-office audit log (migration 0016) and the SSRF guard of connected mode (spec 016)

## What it is for

The founder asked on 2 Nov 2026 for an engine that does ALYR's own outreach end to end:

```
find the business and the right person's work email
  -> research the business and write a message specific to it, with sources
  -> the founder approves (on a phone, in /ops)
  -> ALYR sends from a dedicated outreach mailbox
  -> follow-ups go out on their own until the person replies
  -> replies are read: opt-outs are honoured at once, a "yes" gets a booking reply for approval
```

Qatar and global markets are both in scope (founder, 2 Nov 2026). The design is the "Alyr Revenue Engine" model from the founder's research session that day: **agents propose, deterministic code disposes.** The model (Claude) researches, drafts, criticises and reads replies; only the send gateway, which is plain code, can send, and it runs eleven checks first.

This is ALYR's own selling, not a product feature: no shop, no shop's customer and no WhatsApp is involved. It lives in the back office with the other ALYR-only tools.

## Founder decisions (2 Nov 2026, D-152)

| Question | Answer |
|---|---|
| Markets | Qatar and global, both on from the start |
| Who approves | The founder approves every first message. On the review screen he can approve the first message and its follow-ups together; each approval is bound to the exact text (a hash), so an edit needs a new approval |
| Qatar and Saudi Arabia | Allowed, with a recorded basis per contact (published business contact, existing relationship, referral, opt-in, inbound). Autonomy capped at L1 (a person approves every message) until the lawyer answers ALY-51. Our reading: the PDPPL treats electronic direct marketing as needing consent, with no B2B carve-out stated; the founder accepts the risk for business contacts published by the business itself, pending ALY-51 |
| Sending address | A dedicated outreach domain and mailbox, never `alyr.qa` (a cold-email complaint must not touch the domain that sends sign-in codes and invoices). Not the founder's Zoho free mailbox or an alias on alyr.qa: Zoho's usage policy (updated 13 Oct 2026) forbids promotional, bulk, marketing or automated mail, and IMAP, POP and SMTP are on paid plans only (a Zoho community report). Recommended: a new company-owned domain with a Google Workspace mailbox over SMTP and IMAP with an app password (2-step verification required). Microsoft 365 would need an OAuth adapter (Exchange Online is retiring basic-auth SMTP), so it is not supported by this build (founder, 2 Nov 2026) |
| Channel | Email only. **Never WhatsApp** (hard rules 4 and 5). LinkedIn stays a human channel |
| Provider for sending | The outreach mailbox over SMTP, replies over IMAP. Not Resend: Resend's acceptable use policy (updated 13 Oct 2026) forbids cold outreach, purchased lists and scraped contacts |

## Scope

**In:** the tables, the providers (with a simulator each), research with the citation contract, scoring, drafting with a critic and a lint, the review and approval API, the send gateway, sequences and follow-ups, reply reading, one-click unsubscribe, the kill switch and honeytokens, the daily digest, settings, connections and their tests, staff-only routes, audit, the setup runbook, and the screens (ALY-311).

**Not in:** the Leads pipeline of the internal tool (ALY-84; a prospect who says yes is converted to a lead there later), LinkedIn or WhatsApp outreach, buying lists, website-visitor identification, **any scraper of Google Maps, LinkedIn, Instagram or another site whose terms forbid automated collection** (browser-style reading, Firecrawl included, is only ever of a business's own public website; founder, 2 Nov 2026), Gmail or Microsoft Graph APIs (SMTP and IMAP work with Zoho, Google Workspace and Microsoft 365 app passwords; an API adapter can be added behind the same interface later), auto-approval (L2 and L3) for any country capped at L1.

## How it flows

### Prospect stages

```
new -> researching -> researched -> drafting -> in_review -> approved -> sending -> done
          |               |                         |                      |
          v               v                         v                      v
     needs_human     disqualified               rejected           replied | bounced | opted_out
```

`needs_human`: too little evidence, no verified email, or no basis recorded. `done`: the sequence ended with no reply. Every change of stage writes a row to `outreach_events`.

### The agents (functions, not free-running loops)

| Role | What it does | Model | Sees | Never sees |
|---|---|---|---|---|
| Scout | Turns a search ("bakeries in Doha selling on Instagram") into candidate businesses with a source URL | Fast | The query and search results | Emails, phones |
| Researcher | Reads the business's own pages and writes a brief: every claim has the text, the URL and the exact quoted words from that page | Draft | The pages' text, inside clear markers | Emails, phones, any other prospect |
| Qualifier | Rules first (country lane, a website, the business type, an email found), then a one-line reason from the model | Fast | The brief | Emails, phones |
| Composer | Writes the first message and two follow-ups from the checked brief, the offer and the rules | Draft | The checked brief, first name, role, language | Emails, phones, raw page text |
| Critic | A second, separate call: does every sentence rest on a claim in the brief? Is it short, plain, true to what ALYR sells today? | Fast | The draft and the brief | Emails, phones |
| Reader | Classifies a reply into one label | Fast | The reply's text with quoted history removed | Emails, phones, any tool |
| Concierge | For a clear "yes", drafts a short reply with the booking link, for the founder's approval | Draft | The label, the brief, the earlier messages | Emails, phones |

"Fast" and "Draft" are settings (`ALYR_OUTREACH_MODEL_FAST`, default `claude-haiku-5-5`; `ALYR_OUTREACH_MODEL_DRAFT`, default `claude-sonnet-5-5`). Every model call uses structured output (a JSON schema) and the result is validated before it is used; an invalid answer is a failure, not a guess. Calls go through one module (`outreach/llm.py`) with a simulator for tests and local use.

**Data minimisation (tested):** the model never receives an email address or a phone number. A test captures every payload the simulator receives and fails if one matches an email or phone pattern.

### The citation contract

The Researcher's brief is a list of claims `{text, url, quote}`. Code keeps a claim only if `quote` appears in the stored text of that URL's page (after folding whitespace and case). A brief with fewer than two kept claims sends the prospect to `needs_human` instead of drafting. The Composer cites claim ids per sentence; the lint rejects a draft with a sentence that names a fact and cites nothing. Pages are stored (`outreach_pages`: URL, fetched at, a SHA-256 of the text, the text cut to 50,000 characters) so a quote can be checked again later.

Fetched pages are hostile input. They are fetched only over https from public addresses (the connected-mode SSRF guard, `modules/connect/`), at most 5 pages per business (home, about, contact, products or menu, one more found on the home page), 2 MB each, 10 seconds each, never following a redirect to a private address. Their text goes to the model inside markers with an instruction that it is data, and the Researcher has no tools: it can only return the schema.

### Finding the email

1. A contact the founder typed or imported, with its source.
2. Otherwise an address the business **publishes on its own site** (founder, 2 Nov 2026): research reads the home, contact and about pages (and their footers) for `mailto:` links, visible addresses and schema.org `email`, and stores each with the exact page it was read from (`outreach_found_emails`). A named or role address (info@, sales@) on the business's own domain comes first; a free-mail address only if published on its own site, and flagged on the review card. The basis defaults to `published_business_contact`, which the founder confirms by approving. Nothing is guessed from a pattern. Telephones are not kept: email is the only channel.
3. Otherwise the email-finder provider (Hunter: domain search, then the email verifier) for the business's domain, preferring owner, founder, director, general manager or marketing roles. Personal addresses are kept only with `type = personal` from the provider and a verifier result of `valid`; `accept_all` is allowed with a warning on the review card; `invalid`, `disposable` and `unknown` are refused.
4. Otherwise `needs_human`.

Free-mail addresses (gmail, hotmail, outlook.com, yahoo, icloud, live) are refused for cold outreach unless the basis is `opt_in`, `inbound` or `existing_relationship`, or the business published the address on its own website (step 2, flagged).

### Where prospects come from

| Source | How | What is kept |
|---|---|---|
| `manual` | Typed in `/ops` (a basis is required when an email is given) | What was typed |
| `import` | A CSV through `POST /prospects/import` (`{csv}`) | The CSV's columns |
| `overture` | An Overture Maps places GeoJSON file (CDLA Permissive 2.0 / Apache 2.0; monthly releases) through the same endpoint (`{geojson, release}`, or detected in `{csv}`): from the Overture Explorer ("Download Visible") or the DuckDB query in the runbook | Name, website, email, `taxonomy.primary` (or `categories.primary` before Dec 2025), the Overture ID and the release. Entries under 0.7 confidence or with neither website nor email are skipped. No phone, address or position |
| `discovery` | A web search (Exa) filtered by the Scout | The business's site once our own fetcher read it |
| `places` | Google Places API (New) Text Search (`ALYR_GOOGLE_PLACES_API_KEY`, optional), field mask `places.id,places.displayName,places.websiteUri` | **Only the place ID and the name** (Google's terms as the founder read them, 2 Nov 2026: the place ID may be cached; nothing else). The website Google gives is only fetched, and kept once our own fetcher has read it. Google is credited wherever a name from Google is shown |

### Sequences and follow-ups

A sequence is three steps: the first message, a follow-up after 3 working days, a last short note after 7 more working days. Working days and hours are the recipient country's (the policy table). Any reply, bounce or opt-out stops the sequence at once. One active sequence per contact and per company; a finished sequence blocks the same contact for 90 days and the same company for 30.

### Autonomy levels (per sequence)

| Level | First message | Follow-ups | Replies handled alone |
|---|---|---|---|
| L0 Draft only | Not sent; the founder copies it | Not sent | Opt-outs (suppression only) |
| **L1 Approve every message (default)** | Approved | Approved (can be approved with the first, each bound to its own hash) | Opt-outs, bounces, auto-replies |
| L2 Approve first message | Approved | Sent as drafted, if the follow-up drafts pass lint again at send time | Plus out-of-office (reschedule) |
| L3 Narrow autopilot | Approved | As L2 | Plus a clear "yes" gets the approved booking template |

The level is the lower of the sequence's setting and the country's cap. Qatar, Saudi Arabia, the UAE, Kuwait, Bahrain, Oman, Egypt, Jordan, Canada and the EU are capped at L1.

## The send gateway

The only code that holds the mailbox password. A send intent (prospect, step, draft id) is checked in this order; the first failure decides.

| # | Check | On failure |
|---|---|---|
| 1 | Outreach switched on (`ALYR_OUTREACH=on`) and the kill switch off | Stop; intents stay queued |
| 2 | The recipient is not a honeytoken address | **Trip the kill switch**, alert, stop everything |
| 3 | The idempotency key (prospect, step) has not been used | Drop as a duplicate, log |
| 4 | An approval exists for this draft id and its body hash matches, or the sequence's level allows this step | Hold; back to review |
| 5 | Neither the email's hash nor its domain's hash is on the suppression list | Block for good |
| 6 | The country lane allows email and a basis is recorded (and allowed for that country) | Block; the prospect goes to `needs_human` |
| 7 | Frequency: no other active sequence for the contact or company; the gap since the last step is respected | Reschedule |
| 8 | Health of the mailbox over the last 7 days: bounces under 2% and opt-outs under 3% (once 20 or more sends) | Pause the mailbox, alert |
| 9 | Caps: the mailbox's daily cap for its ramp week (10, 20, 30, then 40 a day) and the global daily cap (default 50) | Reschedule to the next working day |
| 10 | Send window: recipient's local working day and hours (policy table) | Reschedule to the next opening |
| 11 | Final lint: legal name and postal address line, opt-out sentence, no uncited fact, under 150 words, subject under 70 characters, no link at all in the first message, no tracking pixel or tracked link | Hold; back to review |

Then it sends over SMTP with `Message-ID` recorded, `List-Unsubscribe: <mailto:...>, <https://.../o/unsubscribe/{token}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), no open or click tracking, and writes `outreach_sends` and an audit row in the same transaction as marking the intent used. A failure to send is retried by the job runner with backoff; the idempotency key is claimed before the SMTP call and released only on a definite refusal from the server.

## Replies

A background job reads the reply inbox over IMAP every 5 minutes (unseen messages, then marks them seen). A message is matched to a send by `In-Reply-To` or `References`, else by sender address. Then, in order:

1. **Bounce** (a delivery status notification, or a `5.x.x` status): the send is marked bounced, the address suppressed, the sequence stopped.
2. **Auto-reply** (`Auto-Submitted: auto-replied`, `X-Autoreply`, or out-of-office words): logged; at L2 and above the next step is moved past the return date if one is stated.
3. **Opt-out words**, checked in code before any model, in English and Arabic ("unsubscribe", "remove me", "stop", "not interested", "don't contact", "إلغاء", "لا ترسل", "أزل", "توقف", "غير مهتم"): suppressed at once, sequence stopped, never answered.
4. **The Reader** labels the rest: `interested`, `question`, `not_now`, `not_interested`, `wrong_person`, `referral`, `opt_out`, `other`, with a confidence. `opt_out` and `not_interested` suppress. Below 0.8 confidence, or more than one label, the reply goes to the founder's queue. `interested` gets a Concierge draft for approval (at L3, the approved booking template is sent through the gateway).

Any reply stops the sequence. Reply bodies are stored (cut to 20,000 characters) only for the founder to read in `/ops`; they are erased with the prospect.

## One-click unsubscribe

`GET /o/unsubscribe/{token}` shows a one-button page; `POST` to the same address (and the RFC 8058 one-click POST) suppresses the address and its sequence. The token is signed (HMAC with `ALYR_OUTREACH_UNSUBSCRIBE_SECRET`), carries the send id, and does not reveal the address. A `mailto:` unsubscribe to the reply inbox works through the reply reader's opt-out words.

## Suppression and retention

`outreach_suppression` holds only SHA-256 hashes of the lower-cased email and of its domain (for a domain-wide objection), the reason and the date. It is kept for good, so an opt-out is honoured forever without keeping the address. A prospect who opted out, bounced or was disqualified has their personal fields (name, email, role, reply bodies) erased after 30 days by a background job; a prospect with no activity for 12 months is erased the same way (the lawyer may change both, ALY-51).

## Kill switch and honeytokens

`outreach_settings.kill_switch` stops all sending. Staff set and clear it from `/ops` (audited). The gateway trips it on a honeytoken hit; nothing else in the engine can clear it. Honeytoken addresses are listed in settings (staff only); the discovery, import and enrichment steps also refuse them, so a hit at the gateway means something upstream went wrong.

## The country policy

In code (`outreach/policy.py`), changed by pull request, so every change is reviewed and dated. Each row: lane (`allowed`, `consent_only`, `blocked`), allowed bases, autonomy cap, time zone, working days, hours, and whether free-mail is refused.

| Country | Lane | Allowed bases | Cap | Working days, hours |
|---|---|---|---|---|
| QA, SA, KW, BH, OM | allowed | published_business_contact, existing_relationship, referral, opt_in, inbound | L1 | Sun to Thu, 08:30 to 16:30 local |
| AE | allowed | as above | L1 | Mon to Fri, 08:30 to 16:30 (UAE week since 2022; to confirm) |
| EG, JO | allowed | as above | L1 | Sun to Thu, 09:00 to 17:00 |
| GB | allowed (corporate addresses only; sole traders need consent) | legitimate_interest, published_business_contact, existing_relationship, referral, opt_in, inbound | L2 | Mon to Fri, 09:00 to 17:00 |
| US | allowed | as GB | L3 | Mon to Fri, 09:00 to 17:00 recipient's zone (default America/New_York) |
| CA | consent_only unless conspicuous publication is recorded | conspicuous_publication, existing_relationship, opt_in, inbound | L1 | Mon to Fri, 09:00 to 17:00 |
| DE, IT | consent_only | opt_in, inbound, existing_relationship | L1 | Mon to Fri, 09:00 to 17:00 |
| Other EU and EEA | allowed | legitimate_interest (with the assessment reference), opt_in, inbound, existing_relationship | L1 | Mon to Fri, 09:00 to 17:00 |
| Anything else or unknown | blocked | | | |

Every message, in every country: the sender's real name, ALYR's legal name and postal address (`ALYR_OUTREACH_LEGAL_LINE`), a plain opt-out sentence, a truthful subject. No invented personas, no claims about clients ALYR does not have (operating rule 7).

## Data

Migration `0111_outreach.sql` (or the next free number on `main`). All tables are ALYR's own, not tenant-owned: forced row-level security that only allows the back office, like the other global back-office tables, written through the API's staff declaration.

| Table | Holds |
|---|---|
| `outreach_settings` | One row: kill switch and reason, global daily cap, default level, honeytokens, booking URL override, updated by and at |
| `outreach_mailboxes` | The sending mailbox: from address, from name, first send date (for the ramp), paused and why |
| `outreach_prospects` | Company, website, domain, country, business type, source (`manual`, `import`, `discovery`, `places`, `overture`), source URL and source reference (a Google place ID, or an Overture ID), contact first and last name, role, email, email source and verifier result, basis and its note, language (`en` or `ar`), stage, fit score and reason, level, notes, created and updated |
| `outreach_found_emails` | Addresses the business published on its own site: prospect, email, the page it was on, kind (`named`, `role`, `free_mail`, `other_domain`); erased with the prospect |
| `outreach_pages` | Fetched pages: prospect, URL, fetched at, text hash, text |
| `outreach_claims` | Prospect, claim id, text, URL, quote, kept or dropped and why |
| `outreach_drafts` | Prospect, step (1 to 3), version, subject, body, language, cited claim ids per sentence, critic result, lint result, body hash, status (`in_review`, `approved`, `rejected`, `superseded`, `sent`), created by (`model` or a staff id) |
| `outreach_approvals` | Draft id, body hash, staff id, at |
| `outreach_intents` | Prospect, step, draft id, idempotency key (unique), run at, status (`queued`, `sent`, `held`, `blocked`, `rescheduled`, `dropped`), last check and its result |
| `outreach_sends` | Intent, mailbox, message id, sent at, to-address hash, status (`sent`, `bounced`) |
| `outreach_replies` | Send, received at, from-address hash, subject, body (cut), label, confidence, handled by and at |
| `outreach_suppression` | Email hash or domain hash, reason, source, at |
| `outreach_events` | Append-only timeline: prospect, kind, detail (JSON, no email or phone), at |
| `outreach_connection_tests` | Service key, ok, message, at, by |

Rules: every new table has a row in `core/erase_rules.py` (global ALYR records; the prospect erasure is this spec's own job), is left out of a shop's data export, and has an index fit for its queries. Staff changes write the back-office audit log in the same transaction.

## Providers

One interface each under `outreach/providers/`, chosen by settings, with a simulator. On a developer machine (`ALYR_ENV=local`) every provider is its simulator, whatever keys are set. Anywhere else a provider whose key is missing is **closed**: it refuses every call and never falls back to a simulator (a simulated mailbox in production would pretend to send).

| Service | Used for | Settings (secrets in Secret Manager in production) |
|---|---|---|
| Anthropic API (Messages API, structured outputs) | All model calls | `ALYR_ANTHROPIC_API_KEY`, `ALYR_OUTREACH_MODEL_FAST`, `ALYR_OUTREACH_MODEL_DRAFT` |
| Exa (search API) | Discovery: businesses matching a query, with URLs | `ALYR_EXA_API_KEY` |
| Hunter (domain search, email verifier) | Finding and verifying work emails | `ALYR_HUNTER_API_KEY` |
| Google Places API (New), optional | Discovery of local businesses: place ID and name only | `ALYR_GOOGLE_PLACES_API_KEY` |
| Firecrawl, optional | Reading a business's own page the built-in fetcher cannot (a site drawn by JavaScript); used only when set and only when the built-in fetcher read too little. Receives the page's public address only | `ALYR_FIRECRAWL_API_KEY` |
| Outreach mailbox, SMTP | Sending | `ALYR_OUTREACH_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `ALYR_OUTREACH_FROM`, `ALYR_OUTREACH_FROM_NAME` |
| Outreach mailbox, IMAP | Replies | `ALYR_OUTREACH_IMAP_HOST`, `_PORT`, `_USER`, `_PASSWORD` |
| Engine settings | | `ALYR_OUTREACH` (`off` by default), `ALYR_OUTREACH_LEGAL_LINE`, `ALYR_OUTREACH_BOOKING_URL`, `ALYR_OUTREACH_UNSUBSCRIBE_SECRET`, `ALYR_OUTREACH_UNSUBSCRIBE_BASE` (the API's public address that serves `/o/unsubscribe`), `ALYR_OUTREACH_OFFER` (what ALYR offers, in the founder's words; the Composer may say nothing beyond it), `ALYR_OUTREACH_DAILY_MODEL_USD` (default 5) |

Each provider's request and response shapes are checked against its current documentation when it is written (CLAUDE.md, "How work is done" 2), and the PR says which pages were read and when.

**Connections** (`GET /api/admin/outreach/connections`; keys `model`, `discovery`, `places`, `email_finder`, `page_reader`, `smtp`, `imap`, `engine`): each service with `configured` (all its settings present), the last test, and a test (`POST .../connections/{key}/test`): the model answers a one-word schema call; Exa runs a one-result search; Google Places one text search; Hunter and Firecrawl read the account; SMTP logs in without sending; IMAP logs in and counts unseen. A test never sends an email and never sends personal data.

## Jobs

Registered in `core/jobs.py`, all `background=True` (no customer waits for them): `outreach.discover`, `outreach.research`, `outreach.compose`, `outreach.send` (run at the intent's time), `outreach.poll_replies` (every 5 minutes while switched on), `outreach.digest` (daily at 07:00 Doha: yesterday's sends, replies, opt-outs, bounces, refusals and the review queue, to the founder's alert channel as counts only), `outreach.erase` (daily). Every model run has a time limit and a per-day spend cap (`ALYR_OUTREACH_DAILY_MODEL_USD`, default 5): over the cap, research and drafting stop until the next day and the digest says so.

## API (staff only, every change audited)

Under `/api/admin/outreach`, behind the same staff check as the rest of `/api/admin`. Shapes are in `routes/admin_outreach.py`'s Pydantic models; the screens read only these.

| Method and path | Does |
|---|---|
| `GET /overview` | Counts by stage, today's sends against caps, queue sizes, kill switch, connections summary |
| `GET /connections`, `POST /connections/{key}/test` | As above |
| `GET /settings`, `PUT /settings` | Caps, default level, honeytokens, booking URL |
| `POST /kill-switch` | `{on, reason}` |
| `GET /prospects?stage=&country=&q=` | List |
| `POST /prospects` | Add one by hand (basis required) |
| `POST /prospects/import` | CSV: company, website, country, first name, last name, role, email, basis, language, notes |
| `POST /discover` | `{query, country, limit}`: queues discovery |
| `GET /prospects/{id}` | Detail: brief and claims (kept and dropped), drafts, approvals, sends, replies, timeline |
| `PATCH /prospects/{id}` | Contact, basis, language, level, notes, disqualify |
| `POST /prospects/{id}/research` | Queues research (and drafting after it) |
| `GET /review` | Drafts waiting: each with its brief, cited claims, critic and lint results, country lane, basis, email verifier result, the follow-ups |
| `POST /drafts/{id}/approve` | `{body_hash, with_follow_ups}`: refuses a stale hash |
| `POST /drafts/{id}/edit` | `{subject, body}`: a new version, linted again, waiting for approval |
| `POST /drafts/{id}/reject` | `{reason}` |
| `GET /replies?handled=false` | Replies waiting for the founder |
| `POST /replies/{id}/handled` | With an optional note |
| `POST /prospects/{id}/pause`, `/resume` | A person may resume; the engine may only pause |
| `GET /activity?kind=` | Sends, replies, gateway refusals, opt-outs, bounces |

Public, outside `/api/admin`: `GET` and `POST /o/unsubscribe/{token}`.

## Security

- **Nothing that reads hostile text holds power.** The Researcher and the Reader have no tools; their output is a schema. The gateway alone holds the mailbox password.
- **The engine can pull the brake, never the accelerator:** it can pause a prospect, a mailbox or trip the kill switch; only staff can resume or clear it.
- **No personal data to the model** (tested), none in logs, none in the digest.
- **Every route** checks ALYR staff, and has a test for the refusal.
- **Settings fail safe:** `ALYR_OUTREACH` must be exactly `on`; anything else is off.

## Tests (real PostgreSQL, simulators, HTTP in and out)

The gateway: each of the eleven checks refuses on its own, in order; a retried intent sends once; an edited draft is held; a honeytoken trips the kill switch. The citation contract keeps and drops claims correctly. The model never receives an email or phone. Opt-out words in English and Arabic suppress without a model call. A reply of any kind stops the sequence. One-click unsubscribe by `GET` page and `POST`, with a forged token refused. Send windows in Doha, Riyadh, Dubai and London around weekends and hours. Country lane refusals (unknown country, free-mail, DE without consent). Erasure after 30 days keeps the suppression hashes. Every route refuses a non-staff caller. Connections tests never send.

## Waiting on the founder

1. An outreach domain (for example `alyr-team.com` or `getalyr.com`, owned by the company, its website pointing to `alyr.qa`) and a mailbox on it with SMTP and IMAP (Zoho, Google Workspace or Microsoft 365); SPF, DKIM, DMARC and warm-up for 2 to 4 weeks before real volume. Steps: `docs/runbooks/outreach-setup.md`.
2. The keys in Secret Manager: Anthropic, Exa, Hunter, the mailbox, the unsubscribe secret; the legal line and the offer text.
3. The lawyer's reading for Qatar and the GCC (ALY-51).
4. Switching it on in production: `ALYR_OUTREACH=on`, after the first ten drafts are reviewed with it on in a test with the founder's own addresses.

## Changes while building (2 Nov 2026, ALY-310)

Recorded here so the spec stays the contract; each was in the founder's later messages or found while building.

- **Migration number**: 0111 was free on `main` and on every branch (checked 2 Nov 2026).
- **More sources** (founder): published contacts on the business's own site, Google Places Text Search, Overture Maps places files, and Firecrawl as an optional page reader (above). No scraping of sites that forbid it ("Not in").
- **Mailbox guidance** (founder): Google Workspace with an app password; not Zoho free, not an alias on alyr.qa, not Microsoft 365 in this build (above).
- **A manual prospect needs a basis only when an email is given.** Without one, research finds the published address and proposes `published_business_contact`; the founder confirms it by approving.
- **Free-mail published on the business's own site is allowed**, flagged on the review card (founder's rule on published contacts; `policy.basis_refusal`).
- **An auto-reply does not stop the sequence**: nobody answered. Bounces, opt-outs and every human reply do.
- **Gateway check 1** also stops while the prospect is paused or no mailbox is configured; **check 8** stops while the mailbox is paused; **check 11** also holds a message when no unsubscribe link can be made (`ALYR_OUTREACH_UNSUBSCRIBE_SECRET` and `_BASE`).
- **Uncertain sends**: a connection that breaks while the message is handed over keeps the intent claimed (`sending`), so it is never sent twice; the founder sees it on the prospect.
- **The word limit counts the message**, not the footer the code adds (sender, legal line, opt-out sentence). The legal line must hold no link, since the first message carries none.
- **The Concierge's reply is step 4** (`kind: booking_reply` on the screens) and needs the founder's approval at every level. L3's automatic "yes" template is **not built**.
- **`POST /mailbox/resume`** added: only a person resumes a mailbox the gateway paused.
- **Shapes**: the API answers in the shapes of `apps/web/app/(product)/ops/outreach/types.ts` (ALY-311): `contact_*` names, a stale hash is `409 {detail: {code: "stale_hash", message}}`, the critic and the lint are `{ok, findings: [{key, ok, note}]}`, `GET /settings` carries the country policy, `GET /activity` carries the gateway's check, CSV import is JSON `{csv}`.
- **Not decided here, still open:** the lawyer's reading (ALY-51), whether Overture's listed emails count as a business's published contact (they are flagged in the basis note for the founder to confirm).
