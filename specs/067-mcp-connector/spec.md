# 067 · The MCP connector: an owner's own Claude or ChatGPT, through the same actions

Linear ALY-286 (epic), ALY-288 (sign-in), ALY-289 (server), ALY-293 (safety) · Decision D-170 (the owner's five answers) · Builds on D-160 (one agent, two doors), D-065 and `core/actions.py` (the action layer), `modules/connect/keys.py` (hashed secrets, per-key limits), `core/auth.py` (the email code), D-073 (alert rules), D-083 (per-address limits), D-001 (one deployable)

Reserved for this work: migrations **0130 to 0139**, decisions **D-170 to D-179**.

## What it is, and what it is not

An owner adds "ALYR" as a connector in their own Claude or ChatGPT, signs in with the email code they already use, picks the business, and their own assistant app can then call a short list of ALYR actions for **that business and nothing else**. The workspace, WhatsApp and this connector are three doors onto one set of actions (D-160); nothing about the logic is copied.

**ALYR calls no model.** The owner's app calls ALYR, never the other way round. There is no model key, no prompt and no model output anywhere in this code, and a test fails if a module under `modules/mcp/` imports an HTTP client or names a model provider. **The foundation sends no customer message**: it has no tool that reaches a channel. Sends come later (ALY-291 and after) and go through `core/outbound.py` like every other send.

This spec covers the foundation: sign-in (ALY-288), the server and its tool registry (ALY-289), and the safety layer (ALY-293). The real tools are built on it in a second pull request (ALY-290, ALY-291, ALY-327): see "The tools" below. The workspace screen is ALY-292; this spec builds the API under it (settings, grants, revoke, the call log) and no screen.

Words that reach an owner say "app" and "connection", never AI, assistant or smart (D-012, honesty). The sign-in page names the app by the name it gives itself ("Claude"), because that is its own name.

## What the standards say today (built against)

Read on 9 Nov 2026; CLAUDE.md rule 2.

* **MCP specification 2026-07-28** (the current revision) is **stateless**: no `initialize`, no session; every request carries `_meta["io.modelcontextprotocol/protocolVersion"]` and `.../clientCapabilities`; Streamable HTTP is a single endpoint that takes POST only (GET and protocol sessions were removed); headers `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` mirror the body and a mismatch is `400` with error `-32020`; an unsupported version is `400` with `-32022` and `data.supported`; servers must implement `server/discover`; every result carries `resultType`; a missing method is `404` with `-32601`; the `Origin` header must be validated (`403`).
* **The clients still speak the older revisions.** Claude's documentation (claude.com/docs/connectors/building) says it follows the authorization specs of 2025-03-26, 2025-06-18 and 2025-11-25, supports Streamable HTTP and the legacy HTTP+SSE transport, uses the callback `https://claude.ai/api/mcp/auth_callback` (and a loopback redirect on any port for Claude Code), registers by **Dynamic Client Registration** (or CIMD when the server advertises it and `none` as a token auth method), sends a PKCE S256 challenge always, refreshes reactively on 401 and five minutes before expiry, wants `invalid_grant` for a dead refresh token, form-encoded token requests, answers within 10 s (30 s for a refresh), and ignores a `WWW-Authenticate` header on a 200. ChatGPT's (developers.openai.com/apps-sdk/build/auth) is based on 2025-11-25, prefers **Client ID Metadata Documents** (`https://chatgpt.com/oauth/client.json`), falls back to DCR, uses the redirect `https://chatgpt.com/connector_platform_oauth_redirect` when the server returns `iss` in every authorization response (and says so in its metadata), and sends `resource` in both the authorization and token requests.
* So the server is **dual-era**: it serves a request that carries the modern `_meta` statelessly (2026-07-28), and an `initialize` request as the legacy revisions (2025-11-25, 2025-06-18, 2025-03-26), **without minting a session id** (a session id is optional in those revisions) and answering `GET` and `DELETE` with `405`. Both eras use one handler for `tools/list` and `tools/call`.
* **Authorization**: the MCP server is an OAuth 2.1 resource server; Protected Resource Metadata (RFC 9728) is required, with `authorization_servers`; the authorization server serves RFC 8414 metadata and **must advertise `code_challenge_methods_supported`**; PKCE S256; the `resource` parameter (RFC 8707) in both requests, and the server **must reject a token not issued for it** (audience); the `iss` parameter in authorization responses (RFC 9207, advertised by `authorization_response_iss_parameter_supported`); exact redirect-URI matching; short-lived access tokens; refresh tokens rotated for public clients; HTTPS everywhere except loopback; a token never in a query string; a `401` carries `WWW-Authenticate: Bearer resource_metadata="..."` and a `403` for too little scope carries `error="insufficient_scope"` and the scope needed. The consent page must show the redirect host and warn about loopback-only redirects. A client-ID metadata document is fetched with the same care as any address a stranger gives us (SSRF).

**Checked on 9 Nov 2026 against real client code** (not the apps themselves): the official Python SDK, version 2.3.0 (the modern era: `server/discover`, then `tools/list` and `tools/call` with the per-request metadata, protocol 2026-07-28; and its `initialize` path, protocol 2025-11-25) and an SDK of the 1.x line (`initialize`, protocol 2025-11-25), each through the whole sign-in: the 401 challenge, both metadata documents, Dynamic Client Registration, the page, the code, the token, and a call to `hello`. The 2.3.0 client found one thing the specification asks and the first build left out: `tools/list` and `server/discover` carry `ttlMs` and `cacheScope` (here `private` and `0` for the list, since it depends on the person; `public` and five minutes for discover). What was **not** checked against Claude or ChatGPT themselves is in the pull request.

## Where it lives (the choice)

**A module of the API** (`alyr/modules/mcp/`, routes in `alyr/routes/mcp.py` and `routes/mcp_oauth.py`), one deployable (D-001). The spec does not force a separate service: the protocol is plain HTTP and JSON, the load is a person asking questions, and it needs the same database login, the same rate limits and the same action layer. A second Cloud Run service would only copy those.

* The public address is `mcp.alyr.qa`, a hostname the edge Worker sends to the same Cloud Run API (the founder's and go-live's steps are listed in the pull request). `ALYR_MCP_PUBLIC_URL` is that address and is the OAuth **issuer**; the **resource** (the audience of every token) is `<public url>/mcp`. A token is refused anywhere its audience is not that exact value, so a token made for another address, or for the API's own host, opens nothing.
* **Off unless switched on**: `ALYR_MCP_ENABLED` (unset: on in a developer's machine, off everywhere else). Off answers `404` on every path here. Then a **business opts in** (below). Then the owner may pause it (the kill switch).
* **Not a new service means a shared fate**: a busy API slows the connector. Its calls count against the same admission limits (D-132). Revisit if the connector's load ever needs its own scaling.

## Endpoints

All on the API; the paths below are under `ALYR_MCP_PUBLIC_URL`.

| Path | What |
|---|---|
| `POST /mcp` | The MCP endpoint (Streamable HTTP, JSON responses only; `text/event-stream` is never used). `GET` and `DELETE` answer 405. |
| `GET /.well-known/oauth-protected-resource` and `.../oauth-protected-resource/mcp` | RFC 9728 document: `resource`, `authorization_servers`, `scopes_supported` (only `read`: the minimum, the rest by step-up), `bearer_methods_supported: ["header"]`, `resource_name`. |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 document: `issuer`, the three endpoints below, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]` (public clients only, no client secret is ever issued), `scopes_supported`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`, `revocation_endpoint`. |
| `POST /oauth/register` | RFC 7591 registration (Claude needs it). JSON in, JSON out. Public client only; redirect URIs `https` or loopback; a name of 1 to 80 characters; 60 an hour per address; the table is capped at 5,000 and unused clients are deleted after 7 days when it is full. |
| `GET /oauth/authorize` | Starts a request: checks `response_type=code`, `client_id`, `redirect_uri` (exact match against the client's registered list; for a loopback address any port), `code_challenge` with `S256`, `resource`, `scope`, `state`. **A bad client or redirect is shown as a page, never redirected to.** Then the sign-in page. |
| `POST /oauth/authorize/email`, `/code`, `/consent` | The page's three steps (below). Same-origin form posts. |
| `POST /oauth/token` | `application/x-www-form-urlencoded`. `authorization_code` and `refresh_token`. RFC 6749 error codes (`invalid_grant`, `invalid_client`, `invalid_request`, `invalid_target`, `unsupported_grant_type`). `Cache-Control: no-store`. |
| `POST /oauth/revoke` | RFC 7009. Always `200`; revoking a refresh or access token ends its whole grant. |
| `/api/mcp/*` | The workspace's side, for an owner or admin (a cookie session, not a token): status, opt in, pause and resume, the grants, revoke one or all, the call log. The screen is ALY-292. |

### Sign-in and consent (the page ALYR serves)

Server-rendered HTML from the API, in English and Arabic, light and dark, using the generated tokens (`brand.py`); no script. It is plain on purpose: the workspace's own connection screen (ALY-292) comes later with the founder's review of the words.

1. **The request is stored** (`mcp_auth_requests`, 15 minutes) and a cookie (`alyr_mcp_req`, path `/oauth`, `HttpOnly`, `SameSite=Lax`, `Secure` outside local) binds it to the browser that began it; every later step needs the cookie as well as the request id, so a link to someone else's request cannot be completed by a visitor.
2. **Email, then the code** by `core/auth.request_code` and `check_code`: the same five codes an hour per email, five guesses per code, per-address limits, same words for a wrong or expired code, same answer for an unknown email. No session cookie is made.
3. **Pick the business** when the person works for more than one (a person who works for one skips this). A person who works for none is told so. The grant is for that business.
4. **Consent** names the app, the business, the **hostname the app will return to**, and the choices in words: *see the day's numbers*, *change stock*, *change bookings*, *change orders*, *send messages to customers*. Only `read` is asked in this foundation's tools; the page shows the scopes that were asked for and an owner's "Allow" grants those. Loopback-only redirects get an extra line.
5. **The opt-in.** If the business has not switched the connector on, an **owner** (only an owner) sees one more thing on the same page, a tick box with the confirmation: what ALYR sends to this app leaves ALYR and is handled by the app's provider under the owner's own account there. The tick writes `mcp_settings` (who, when, which wording version) and is on the activity record. An admin or an agent is told an owner must switch it on. Nothing is sent to the app before the tick.
6. **The code is made** (random, hashed, 120 seconds, one use, bound to the client, the redirect, the PKCE challenge, the business and the person) and the browser is redirected with `code`, `state` and `iss`.

## Tokens

All random (256 bits from `secrets`), shown once, **stored as SHA-256 hashes** (a random 256-bit value needs no slow hash; the same as sign-in codes, sessions and API keys), compared in constant time, found by their hash (the row-level policy lets one row be read by the hash of the token presented, the way `api_keys` lets one be read by its prefix; writing stays inside the business).

| | Lifetime | Notes |
|---|---|---|
| Authorization code | 120 s, once | Reuse revokes the grant it made. |
| Access token | 30 minutes | Opaque, `alyr_mcp_at_...`. Audience = the resource. |
| Refresh token | 30 days, **rotated on every use** | The old one dies in the same transaction the new one is made. **Using a rotated one again revokes the whole grant** (theft). `invalid_grant` for anything dead. |
| Grant | 90 days from consent at most | Then the owner signs in again. At most 10 live grants per person per business. |

Nothing a token says is trusted: the token only **names a grant**. **On every call** the server reads the grant, the person's membership of that business **now**, the business's switches **now** and the role **now**, so removing a person, changing their role, switching the connector off, pausing it or revoking the grant takes effect on the next call. A refresh also re-checks all of it.

### Scopes

`read` (the day's numbers, lists), `stock` (change what is in stock), `bookings` (change bookings), `orders` (change orders), `discovery` (mark Discovery findings done or skipped), `send` (message customers, always after a confirm). A scope is the **ceiling the owner gave this app**; the action layer's role table (`core/actions.py`) is the ceiling for the person; the business's modules are the third. A tool is **offered** only when all three allow it, and **checked again on every call**. A call that needs a scope the token lacks answers `403` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="..."`.

## The server (`modules/mcp/server.py`)

One function takes a JSON-RPC request and the proven caller and returns a response, with no I/O of its own beyond the database. **Methods**: `initialize` (legacy), `notifications/*` (202), `ping`, `server/discover`, `tools/list`, `tools/call`. Anything else is `-32601`. `resources`, `prompts`, `sampling`, `subscriptions` and `tasks` are not offered: the capabilities say only `tools`. A request over 64 KB is `413`; arguments over 16 KB are refused; **an answer over 60,000 characters is replaced by a plain error that says to ask for less** (Claude's limit is about 150,000; a half answer is worse than none). `Origin`, when present, must be one of ours or the known clients' (`claude.ai`, `claude.com`, `chatgpt.com`) or `403`.

Every tool result has the shape the specification gives: `content` (a text block), `structuredContent` (the same data) and `isError`; `resultType: "complete"` on the modern era. A tool that cannot be done for a reason the model can act on is an `isError` result with a sentence; a malformed call is a protocol error.

### The tool registry (`modules/mcp/registry.py`): how ALY-290, 291 and 327 plug in

A tool is **an action plus words, a schema and flags**. The action (in `core/actions.py`, with its roles and module) stays the single source of who may do what; the tool adds how a model finds and calls it.

```python
@tool(
    name="today",                     # snake_case, ALYR terms only
    action="today",                   # the key registered in core/actions.py
    scope="read",                     # read | stock | bookings | orders | send
    title="Today in the business",
    description="How the day is going: orders, bookings ... Use it for 'how is today'.",
    input_schema={"type": "object", "properties": {...}, "additionalProperties": False},
    present=present_today,            # optional: reshapes the action's data (data minimum, text wrapper)
)
```

A **changing** tool adds `changing=True` and a `preview` function `async (conn, caller, args) -> Preview` (`what`, `who_is_told`, `cannot_undo`, `affects`: a number of records) that **reads and changes nothing**. The registry then gives it the two-step shape itself (below); the action runs only on the second step, with the same arguments. A tool author never writes the confirm logic and cannot skip it: a `changing` tool without a `preview` fails at import, and a test asserts that every registered tool whose action writes is `changing`.

* `tools/list` offers the tools the caller's scopes, role and the business's modules allow, in a fixed order; annotations are `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint: false` and a `title`; `_meta` carries `securitySchemes` (`oauth2` with the scope), the extension ChatGPT reads.
* `tools/call` runs, in this order: token, kill switch, scope, rate limits, size, arguments checked against the schema, then **one database transaction scoped to the business** (`db.tenant(tenant_id)`: row-level security is what keeps another business out) in which a savepoint holds the action and the call's record is written after it. Role, module and money rules come from `actions.run`.
* Tool names and descriptions: English first; written so a model picks the right one; no jargon.
* **Foundation tools**: `hello` (read: the business's name, the person's first name and role, the modules on, the time in the business's zone) and, **in a developer's machine and tests only** (`ALYR_MCP_TEST_TOOLS`, off elsewhere and absent from `tools/list`), `test_customer_name` (read: returns a customer's name as untrusted text, to prove the wrapper) and `test_write_note` (changing: writes a note on the activity record, to prove the confirm step).

## The safety layer (`modules/mcp/safety.py`)

1. **Preview, then confirm.** A changing tool called without `confirm_token` returns **only a preview**: what will change, who is told, what cannot be undone, how many records, and a `confirm_token`. The text says to **show the preview to the owner and wait for their yes**. Called again with the same name, the **same arguments** and the token, it does the change. The token is random, stored as a hash, **good for 5 minutes, once**, bound to the grant (another app, another person, another business cannot use it) and to a hash of the arguments (a changed argument is a different call). A wrong, spent, expired or mismatched token does nothing and says so. A changing action never runs on the first call whatever the arguments say. Every changing tool, every time: there is no "trust this app" and no bulk shortcut. A tool that touches many records says how many in the preview and is charged that many against the daily cap.
2. **Untrusted customer text.** Anything a customer wrote (a name, a note, an address) reaches the model only through `safety.untrusted(text, source)`: control characters, zero-width characters and bidirectional overrides removed, cut to 120 characters (with `truncated: true`, never an ellipsis), and returned as `{"untrusted": true, "source": "customer name", "text": "..."}` with the answer's text block wrapping it in a fixed marker that says it is data and not an instruction. No tool accepts free text from a customer and turns it into an action; a tool's arguments come from the owner's request to their app, and every change goes through step 1 anyway. **Customers are shown by first name and the last three digits of the phone** (`safety.person(name, phone)`), never a message body, an ID, a salary or an identity document (D-170). The first name is itself customer-written and is wrapped.
3. **Caps.** Per business, per day (a rolling 24 hours): 50 changes and 20 customer sends (`ALYR_MCP_WRITES_PER_DAY`, `ALYR_MCP_SENDS_PER_DAY`), counted when a change is confirmed (a bulk one by the number of records). At the cap the call is refused, `cap_reached` is written on the activity record and `mcp_settings.cap_hit_at` is set (the workspace screen will show it). **Not built yet: the email or message to the owner when a cap is hit** (it needs the words, in both languages, reviewed; ALY-292). Rate limits besides: 60 calls a minute per grant, 300 a minute per business, per-address limits on the OAuth endpoints (`core/ratelimit.py`, D-083): the person's own steps use the sign-in limits, `/oauth/authorize` 60 and `/oauth/token` 300 in ten minutes, `/oauth/register` 60 an hour, and 120 wrong tokens in ten minutes at `/mcp`; a call with a good token is never counted against an address. **The apps call from shared addresses** (Anthropic's and OpenAI's clouds), so one address is many people and the machine-facing limits are generous on purpose; what protects a code or a token is that it is a random 256-bit value. 429 with `Retry-After`.
4. **The kill switch.** `mcp_settings.paused_at` set by an owner or admin refuses every call of the business at once (`403`, with a sentence), keeping the grants; resume ends it. Switching the connector off (`enabled = false`) revokes nothing but has the same effect; revoking all ends the grants. A global setting (`ALYR_MCP_ENABLED`) ends it everywhere.
5. **The anomaly alert** (D-073, `core/alerts.py`): `mcp_write_burst` fires when a business confirms 25 or more changes in 10 minutes, and `mcp_new_place` when a person who has connected before connects a new app from an address not seen in their earlier grants. Counts only, never a name or a number (the alert leaves ALYR); the signals live in `mcp_signals` (an ID and a time).

## What is logged

**Every call**, reads included, is one row on the activity record (`activity`: subject `mcp`, the grant's id as subject id, **channel `mcp`**): the person (id and name), the app (`client`, its name and ID), the tool, the **arguments** (cut to 1,000 characters; `confirm_token` removed; never the answer), the phase (`read`, `preview`, `confirm`), the **result** (`ok`, `refused`, `error`, `capped`, `bad_confirm`, `over_size`) and the milliseconds. The **action's own** change record (a stock change, say) is written by the action with `channel = "mcp"` (`Caller.channel`), so the workspace's own history shows it. Grants made, revoked and the opt-in, pause and resume are on the record too. The record is append-only (the application role can only insert and read).

A refused call is recorded as well; a call refused before the business is known (a bad token) cannot be, and is counted by the per-address limit instead.

## Data model (migration 0130)

`activity` gains the channel `mcp` and the subject `mcp` (the lists are read from the constraints as they are, so later migrations are kept). New tables, each with a row for **every table** in `core/erase_rules.py`:

| Table | Scope | Holds |
|---|---|---|
| `mcp_clients` | global | A registered or fetched client: `client_id` (a random ID, or the HTTPS URL of its metadata document), `kind` (`dcr`, `cimd`), `name`, `redirect_uris`, `client_uri`, `fetched_at`, `expires_at`. Names and URLs the client gave about itself, never trusted for a decision. |
| `mcp_auth_requests` | global | The 15-minute request while a person signs in: the client, redirect, challenge, state, scopes, resource, the binder's hash, the person once the code was right. |
| `mcp_settings` | business | `enabled`, who and when, the wording version, `paused_at`, `paused_by`, `cap_hit_at`, the business's own caps (null: the defaults). |
| `mcp_grants` | business | One per person, app and business: scopes, resource, `expires_at`, `last_used_at`, `revoked_at`, `revoked_by`, a hash of the address it was made from. |
| `mcp_tokens` | business | Codes, access tokens and refresh tokens: `kind`, `token_hash` (unique), `expires_at`, `used_at`, and for a code its redirect and challenge. |
| `mcp_confirmations` | business | A preview: the grant, the tool, the arguments' hash, the preview, `affects`, `expires_at`, `used_at`. |
| `mcp_signals` | global | `kind`, the business's ID, a time. For the alert's counts only; deleted after two days. |

## The tools (ALY-290, ALY-291, ALY-327; D-171)

Nineteen tools in `modules/mcp/tools/` (`reads.py`, `stock.py`, `discovery.py`, with `shape.py` for what an app may see). Each names an action of `core/actions.py`; the role table and the module that must be on are the action's. `tools/list` offers a tool only when the person's role, the app's scope and the business's modules all allow it, and each is checked again on every call. Words are English; descriptions are written so a model picks the right tool, with the questions each answers, and say "Changes nothing" or that the owner says yes first.

| Tool | Scope | Who | Needs | Reads or changes | What it is |
|---|---|---|---|---|---|
| `hello` | read | all | | reads | Which business, who, role, modules, the time there (foundation) |
| `today` | read | all | | reads | `today` action: the day's orders, bookings, collected, chats; money only for owners and admins |
| `bookings` | read | all | bookings | reads | `bookings` action: a day or up to 14 days from a date, times in the shop's zone |
| `orders` | read | all | orders | reads | `orders` action: the open ones, or a day (today, yesterday, a date) with count, cancelled and value |
| `owed` | read | owner, admin | credit accounts | reads | `owed` action: total, late, the five biggest |
| `low_stock` | read | all | catalog | reads | the Catalog list's own filters: running low and sold out, with codes |
| `sales_summary` | read | owner, admin | orders | reads | today, yesterday, this week, last week, each against the dashboard's own comparison; a closed week as the weekly report reads it |
| `insights` | read | all | | reads | the dashboard's needs and tips (`view.build`), each with its written rule |
| `shop_info` | read | all | | reads | names, kind, zone, language, hours, modules |
| `mark_sold_out` | stock | all | catalog | changes | the item's switch off, or a counted size to 0 |
| `mark_back_in_stock` | stock | all | catalog | changes | the switch on (a counted size needs `set_stock`) |
| `set_stock` | stock | all | catalog | changes | a count of the shelf for a counted item or size |
| `undo_stock_change` | stock | the maker, owner, admin | catalog | changes | puts one of the three back |
| `discovery_overview` | read | all | discovery | reads | `discovery.overview` |
| `discovery_findings` | read | all | discovery | reads | `discovery.findings` with evidence, by status |
| `discovery_reviews` | read | all | discovery | reads | `discovery.reviews` (text and names as data) |
| `discovery_report` | read | all | discovery | reads | `discovery.report` for a month |
| `discovery_mark_done` | discovery | owner, admin | discovery | changes | "I did this" |
| `discovery_skip` | discovery | owner, admin | discovery | changes | "Skip" |

**Reads.** Every number is the number on the screen it came from; nothing is worked out twice. `sales_summary` and `insights` read the dashboard's own facts and view (`modules/agent/facts.py`, `view.py`), a closed week is `week.read` (the weekly report's), the stock lists are `listing.read`, `is_low`, `is_sold_out` (the Catalog list's filters, so a count equals the rows of the list it opens). A percentage is given only when both periods have 20 or more orders (the dashboard's rule). A day is a calendar day for `sales_summary` (as the dashboard's chart) and the shop's day (its `day_starts`) for `today`, `orders` and `bookings` (as the WhatsApp commands). Times are written in the shop's zone; money is dirhams, shown as `{qar, text, text_ar}`; names are English and Arabic where the data has both. On a developer's machine `ALYR_AGENT_CLOCK` fixes the moment the dashboard is read at (the sample shops are drawn at a set time); the connector reads the same moment, as the route does.

**The data minimum, tool by tool.** A customer is `{first_name: {untrusted: true, source, text, truncated}, phone_last3}`. No tool returns a message, an ID of a customer, a full name or a full number. `insights` leaves out the tip's own sentence (it names customers in full) and gives the title, the rule, the screen, and the first names it counts, marked. Item and service names are the business's own and are cleaned of hidden and reordering characters but not marked. What the Discovery check-up read outside ALYR (evidence values, review text, reviewer names, a place's name, the business's reply) is marked as data.

**The stock tools (ALY-291).** `find` (`modules/mcp/stock_actions.py`) takes a name or a code: digits are a code of the business (codes start at 101 in every business, so a code is only ever its own business's); otherwise the Catalog's `match.find`, the same as a staff member's WhatsApp message, including a size or colour in the words ("abaya black M"). Two that fit: an error that lists up to five with their codes, "Nothing was changed". The plan (`plan_sold_out`, `plan_back`, `plan_set_stock`) applies the Catalog's own rules (not on sale, always available, not counted, a size needed, a whole number for a counted unit, the same count) and is what both the preview and the change use; the change makes the plan again at that moment. The change itself is `service.set_available` (with the new `channel` argument, so the item's history says `mcp`) or `service.record_stock` with the reason "Set through a connected app" and the actor's `via` `mcp`, so the stock log reads "Owner, mcp". After a change the answer is read from the catalog again (can customers order it now, why not, how many left); the order page shows it at once because it reads the same state. `mcp_stock_changes` (migration 0131) keeps what each change was before and after; `undo_stock_change` refuses a change made again since (a switch whose state is no longer the one the change left, a count that would take more than is there), one already undone, another person's (unless owner or admin) and another business's (row-level security: "no such change").

**Customers and the Catalog's own reactions.** The tools send nothing themselves. Bringing an item back lets the Catalog's existing back-in-stock reaction queue its message to customers who asked and agreed (through `core/outbound.py`, consent and the window as always). The preview says how many customers that is and that the message cannot be taken back; a change that cannot bring anything back says nobody is told; a count that falls says the managers may get the usual alert.

**Discovery (ALY-327).** `modules/mcp/discovery_actions.py` opens each Discovery action as `mcp.<name>` with the same roles and module, turning `DiscoveryError` into the sentence an app is shown. The two changes fix the status (`owner_done`, `skipped`) in the door. **No tool approves anything and none can be added without failing the test that says so.** The previews read the finding (`discovery.finding`) and refuse a closed finding or one already in the status.

**Tests** (`tests/test_mcp_tools_read.py`, `_stock.py`, `_discovery.py`, `_matrix.py`; helpers `mcp_tools_support.py`): a business with the parts of ALYR on, each role connected as an app. The matrix test holds the permission table of the tools and fails when a tool is added without a row: offered to exactly the roles the table gives, refused with the part named when its module is off, hidden from a token without its scope, a preview and nothing else until the owner says yes (a bogus, spent or other-arguments token does nothing), every change on the record as `mcp`, the cap counted across tools. Reads are checked against the SQL they should come from, against the dashboard on the Qirfa sample shop at a fixed moment, and against the workspace's own routes for Discovery. Cross-business tests read and change two businesses with one app each. Injection tests give a customer a hostile name, booking text, a review, a listing and evidence, and check the marking, the cut, that no change or message follows, and that a model that obeys the text only gets previews.

**Mutation checks** (9 Nov 2026; one guard at a time broken in a scratch copy, the named test run on its own and seen to fail, the guard put back; the foundation's own guards have their own table in its tests):

| Guard broken on purpose (18, each put back afterwards) | The test that failed |
|---|---|
| A customer's full name given instead of a first name (`orders`) | `test_no_tool_gives_a_full_name_a_full_number_or_an_id_of_a_customer` |
| The next booking names the customer in full (`today`) | `test_today_names_the_next_booking_by_first_name_and_three_digits_only` |
| The tips give a customer's whole name (`insights`) | `test_insights_say_the_rule_and_never_a_customers_full_name` |
| An agent is given the value of a day's orders | `test_an_agent_is_given_no_money_by_any_tool` |
| `sales_summary` offered to every role | `test_an_agent_is_not_offered_the_tools_about_money_and_cannot_call_them` |
| The scope is no longer checked on a call (foundation's `server.py`) | `test_a_token_without_stock_cannot_see_or_call_a_stock_tool_and_nothing_changes` |
| Two items that fit: the first is taken instead of asking | `test_two_items_that_fit_give_a_did_you_mean_list_and_nothing_is_changed` |
| A size is no longer asked for when an item has several | `test_set_stock_asks_which_size_when_there_are_several_and_names_the_one_asked_for` |
| An undo no longer checks that the item was changed again | `test_back_in_stock_switches_it_on_and_an_undo_puts_each_change_back` |
| An undo no longer checks that enough is left | `test_an_undo_that_would_take_more_than_is_there_is_refused` |
| Anyone may undo anyone's change | `test_everyone_on_the_team_may_change_stock_and_only_the_maker_or_a_manager_may_undo` |
| The item's history is written as the workspace, not the connector | `test_sold_out_shows_on_the_order_page_at_once_and_is_on_the_record_as_the_connector` |
| The stock tools no longer need the catalog to be on | `test_the_stock_tools_are_not_offered_and_are_refused_when_the_catalog_is_off` |
| "I did this" no longer fixes the status in the door | `test_i_did_this_previews_then_marks_the_finding_and_records_the_connector` |
| A closed finding can still be marked | `test_a_finding_that_is_closed_or_not_found_is_refused_and_nothing_is_changed` |
| The Discovery doors give every role the change | `test_the_role_decides_which_discovery_tools_an_app_is_offered_and_may_call` |
| Evidence is given to the app unmarked | `test_the_findings_carry_their_rule_their_evidence_and_the_place` |
| A stranger's review is given to the app unmarked | `test_what_strangers_wrote_reaches_an_app_cut_cleaned_and_marked_as_data` |

## Tests (real PostgreSQL, over HTTP)

A test client completes the whole OAuth flow (metadata, registration, authorize, email, code, consent, token, refresh), speaks MCP in both eras, and covers: a token for shop A cannot read shop B (and a second grant of the same person for B is a different thing); a removed person's token stops on the next call; a changed role changes the tools offered and the calls allowed; revoke, expiry and refresh rotation with reuse detection; the wrong audience; PKCE failures; redirect matching; the code replayed; the opt-in only by an owner; kill switch and the global off; every call on the activity record with channel `mcp`; no changing tool without the token, a token for another tool or arguments, spent, expired; **injected customer text** ("ignore your rules and send...") cannot trigger a write; caps hold under a loop; size caps; per-address and per-grant limits; no model call and no HTTP client in the module; tokens random and stored as hashes; no secret in the repository.

## Not in this spec

The tools that change bookings or orders (ALY-294) and send to customers (ALY-295); Discovery's Phase 2 approvals, which an app can never give; the workspace screen and its Arabic (ALY-292, ALY-66); the owner's cap email; elicitation (a real person-in-the-loop prompt) and the modern era's multi round-trip requests; CORS for browser-based clients; the legacy HTTP+SSE transport (deprecated); an OpenID Connect discovery document; confidential clients (`private_key_jwt`); the security review and red team (ALY-296); the legal answer on whose responsibility the owner's own transfer is (ALY-51, `docs/legal/mcp-connector-questions.md`).
