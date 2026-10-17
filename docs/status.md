# Where Alyr stands

How the work is divided, and the one goal for this stage, are in [operating-model.md](operating-model.md). Each lane keeps its own detail in `docs/lanes/`.

Read this first in a new session, on any machine. It is the hand-over note between sessions: what works, what is next, and what is waiting on the founder. Update it in the same pull request as the work. Linear (team `Alyrtech`, project `Alyr Launch`) holds the detail; this page is the summary.

Last updated: 17 Oct 2026, after the product line-up (ALY-99 phase 1, D-035: ALYR Chat, Bookings, Agent, Accounts, Payroll coming; branch `aly-agent-dashboard`, not merged yet), the internal tool's first phase (ALY-80, D-033), the 2026 homepage (ALY-56, D-034: published 17 Oct without prices, which wait for the commercial registration), and prices set per client from the back office (ALY-78, D-032).

## What works today

**First live round trip on 12 Oct 2026.** A real phone sent "Hello" to Meta's test number (+1 555 638 3300); the welcome menu came back, a button tap was received, and the order link was delivered and read. The same evening a real order (#1001, QAR 179) was placed from the phone and paid on the stand-in payment page, and both confirmations were delivered. A booking was made and confirmed the same way. **Templates (ALY-20):** notices inside a customer's 24-hour window go as ordinary messages in the module's own wording; after it closes they go as one of 16 templates in `core/templates.py`, each in English and Arabic. All 32 were submitted to Meta on 12 Oct. On 13 Oct, 31 were still pending and Meta had refused one (the Arabic booking reminder: too few words for three blanks); it was reworded and resubmitted the same day. Until Meta approves a template, sending it fails. `scripts/api-in-docker.sh uv run python -m alyr.templates_sync` shows where each stands, and `--create` submits any that are missing. A template sent outside the window has not yet been seen arriving on a phone.

| Area | State | Where |
|---|---|---|
| Tenancy with forced row-level security | Built | `migrations/0001_core.sql`, `db.py` |
| Simulator and Meta channels behind one interface | Built; Meta untested live | `channels/` |
| Contact identity by WhatsApp user ID, phone optional | Built | `core/identity.py` |
| Credit ledger in chat, ageing, reminders, pay link | Built | `modules/ledger/` |
| Order link: products, order page, pay or on account | Built | `modules/orders/`, `apps/web/app/s/` |
| Job queue with retries and dead letters | Built | `core/jobs.py` |
| Consent, stop and start words, 24-hour window | Built | `core/consent.py`, `core/outbound.py` |
| Shared inbox: human takeover, assignment, staff notes, saved replies | Built; no live updates or typing warning | `modules/inbox/`, D-021 |
| Sign-in by one-time code, sessions, team and roles | Built; codes are emailed through Resend once `ALYR_EMAIL_API_KEY` is set (D-029). Until then codes only work locally | `core/auth.py`, D-022 |
| Weekly result report to the owner: one section per product, Sunday 9:00 shop time, REPORT in the chat | Built; API only, no workspace screen yet; the `weekly_report` template must be approved on Meta | `modules/report.py`, `modules/*/report.py`, D-030 |
| Bookings: services, opening hours, free times, book, move, cancel, reminders | Built: customer booking page at `/b/{slug}` and a workspace Bookings tab. One customer at a time per shop; no deposits | `modules/bookings/`, `apps/web/app/(product)/b/` |
| ALYR public site, English and Arabic: company homepage and the ALYR Chat product page | **Live at https://alyr.qa: the 2026 homepage (ALY-56, D-034), published 17 Oct** with `/chat` (including ALY-71's figure and list). Product first, a working order page in the hero on a Carbon plate, contact by email (hello@alyr.qa), light and dark, motion. **Prices are off the site until the commercial registration:** the price section (from QAR 449), the money-back first month and the Price link are built and turn on with `NEXT_PUBLIC_ALYR_OFFER=on`. Both reviews applied on 17 Oct, including the claims on `/chat`; Lighthouse mobile LCP 2.3 s, Performance 92–96, Accessibility 100. The published pages now start their scripts after the first paint (`scripts/site-defer-scripts.mjs`). **Built, not published:** a light/dark switch in the header on every page, remembered, with a 45° sweep, and a dark mode for `/chat` (ALY-56, branch `aly-56-theme-switch`). Design notes in `docs/site-redesign/` | `apps/web/app/_site/`, `docs/brand.md` |
| Workspace shell at `/app`: navigation from the shop's products, home dashboard with setup checklist, products (switch on and off), connections, "ask ALYR"; product catalogue in `catalog.py` | Built (D-027) | `apps/api/src/alyr/catalog.py`, `core/workspace.py`, `apps/web/app/(product)/app/` |
| Product line-up (D-035): ALYR Chat (inbox, orders, payment links), ALYR Bookings (inbox, bookings, payment links), ALYR Agent (home dashboard and Sunday report, included for every business), ALYR Accounts (credit accounts), ALYR Payroll coming. The inbox and payment links are shared. Combination pricing, decided by the founder 17 Oct: the first product from QAR 449, each added product QAR 150 (Chat and Bookings QAR 599, with Accounts QAR 749), Agent included at QAR 0 (migrations 0017, 0018) | Built on branch `aly-agent-dashboard` (ALY-99), in review, not merged | `catalog.py`, `migrations/0017_product_line_up.sql`, `0018_combination_pricing.sql` |
| ALYR Agent dashboard on the workspace home (`/app`), D-035: one sentence on the week, Needs you now, four numbers by product and trade, up to 3 suggestions by rule (20 rules, each with its rule line and a screen to act on or a status line), Done for you, the week, busiest hours, top items, money owed by age, the team, the report line. English and Arabic, light and dark, phone and desktop. Agents see no money. "Not now" on knowledge cards; screens open filtered to the counted rows | Built on branch `aly-agent-dashboard` (ALY-99), in review, not merged | `apps/api/src/alyr/modules/agent/`, `routes/agent.py`, `apps/web/app/_agent/`, `docs/agent-dashboard/` |
| Sample businesses for screenshots and the site's figure: Qirfa Bakery («مخبز قرفة»), Sadaf Salon («صالون صدف») and Ruwaa Dental Clinic («عيادة رؤى للأسنان»), eight weeks of fictional activity each. `python -m alyr.agent_samples` captures their Agent screens to `apps/web/app/_agent/samples/` at a fixed moment | Built (ALY-99). `uv run python -m alyr.seed_qirfa`, `uv run python -m alyr.seed_bookings`; local sign-in `huda@qirfa.example`, `lamees@sadaf.example`, `faris@ruwaa.example` | `seed_qirfa.py`, `seed_bookings.py`, `agent_samples.py` |
| Team accountability: one person responsible for every conversation, order, booking and credit account; an uneditable activity record shown in the inbox; closing records sold, booked, answered or lost and why; team report per person (waiting, first-answer time, outcomes, sales); signed replies | Built (D-028) | `apps/api/src/alyr/core/team.py`, `routes/team.py`, `apps/web/app/(product)/_workspace/Team.tsx` |
| Customer pages from chat links (order `/s/`, booking `/b/`, payment `/pay/`, tracking `/t/`) in the workspace design, light and dark, English and Arabic, phone first | Built (ALY-73) | `apps/web/app/(product)/_customer/` |
| Order tracking: every order message inside the 24-hour window links to `/t/{shop}/{order}` with the steps and times, who is looking after it, the items and a pay button if unpaid | Built (ALY-73). Approved templates cannot carry the link, so a notice sent after the window arrives without it | `modules/orders/service.py`, `routes/track.py` |
| `scripts/demo.sh up / check / reset / down` and `python -m alyr.doctor`: start the demo pieces and check database, Meta token, templates, tunnel and public pages | Built (ALY-73) | `scripts/demo.sh`, `apps/api/src/alyr/doctor.py` |
| ALYR console at `/ops` (D-033, plan in `docs/internal-tool.md`): **Today** (one queue: clients to price, prices unanswered for 2+ days, help requests, go-live blockers, shops stuck in onboarding, failing messages as counts; set aside for later), staff list, an audit log of every staff change that cannot be edited, back-office sign-ins of 12 hours, a sidebar on a laptop and a tab bar on a phone. Also: clients and their businesses with each one's onboarding step, a quote per client (edit, publish, see it accepted), the price list, which business types may sign up on their own and whether their price shows at once, the promise, help requests, create a shop for a new or existing client | Built (D-027, D-032); ALYR staff only (`platform_admins`) | `routes/admin.py`, `core/pricing.py`, `apps/web/app/(product)/ops/` |
| Demo page: chat simulator plus workspace tabs, now at `/whatsapp` | Built | `apps/web/app/(product)/whatsapp/page.tsx` |
| Self-serve onboarding at `/start`: email code, type of business, a filled-in price list and opening hours to edit, a private test line to book as a customer, the plan, a go-live checklist, then the workspace. Phone and laptop layouts, English and Arabic | Built (D-031) for appointment businesses (salon, spa, clinic, home services). Restaurants, shops, wholesale and document offices get their business created and a setup request for ALYR. Sign-up is closed outside a local machine until the founder opens it | `apps/api/src/alyr/core/onboarding.py`, `presets.py`, `apps/web/app/(product)/start/` |

Tests: 253 on `main`, all passing; 347 on `aly-agent-dashboard`. CI runs api, web and a secrets scan on every pull request.

## Next on the build side, in order

0. **The internal tool (ALY-79, D-033):** phase 1 of 17 built. Next: Client 360 (ALY-81), business controls (ALY-82), onboarding board and tickets (ALY-83), leads (ALY-84), billing (ALY-85), switches (ALY-86), then levels 2 and 3.
1. **Onboarding (ALY-76, D-031) and per-client pricing (ALY-78, D-032):** built. Left for later phases: sign-in by WhatsApp code, the advisor's tablet mode, the restaurant and shop paths, owners adding a second business themselves, invoices and taking payment, telling the owner their price is ready.

1. **Bookable staff or resources (ALY-27),** so a salon or clinic can serve more than one customer at a time; then services and opening-hours screens.
1. **Product screens on ALYR tokens**, so the workspace matches the public site.
1. **Contacts and labels (ALY-53).**
2. **Email provider for sign-in codes:** built (D-029). Waiting on the founder's Resend account and key.
3. **Inbox leftovers (ALY-28):** live updates instead of polling, a warning when a colleague is typing.
4. **Templates, the rest of ALY-20:** sending one from the inbox when the window is closed, buttons on the reminder template, and templates per customer account once shops connect their own number (ALY-39).
5. **Messaging limits (ALY-41), Redis sessions (ALY-14).**
6. **Products screen and remaining order-link items (ALY-24); remaining ledger items (ALY-22).**
7. **Broadcasts with marketing opt-in (ALY-44), Embedded Signup (ALY-39).**
8. **Always-on hosting (ALY-10), a real payment gateway (ALY-17).**

## Waiting on the founder

| Item | Detail |
|---|---|
| Pricing (ALY-78, D-032) | Set your price list and each client's price in the back office at `/ops`. The starting values are QAR 449 a month and QAR 2,500 setup per business, all editable. Every business type starts on "ALYR prepares the price". Sign-up stays closed outside a local machine (`ALYR_SIGNUP_OPEN`) until shops can connect their own WhatsApp number (decided 17 Oct). Sign-in by WhatsApp code comes after a live number. |
| WhatsApp backup route (ALY-77) | If the CR or Meta's review is slow: researched options in `docs/company/whatsapp-backup-plan/`. Recommended backup for a first pilot: the shop opens its own provider account (for example 360dialog, about €49 a month) and connects it to ALYR. Choose, and say whether ALYR pays that fee for pilots. Not built. |
| Meta values | Done 12 Oct. `apps/api/.env` holds the five values (app `alyr`, id 1071845795713841, test number id 1431880183331516). The webhook is verified, the app is subscribed to the `messages` field and to the WhatsApp account. The access token is a system-user token (`alyradmin`, never expires, `whatsapp_business_messaging` and `whatsapp_business_management`), set 12 Oct. |
| Domain and tunnel | Done 8 Oct. `alyr.online` is on Cloudflare. Tunnel `alyr-dev` publishes only `/webhooks/whatsapp` and `/health` of the laptop's API at `https://api.alyr.online`; everything else answers 404 from outside. Config is in `~/.cloudflared/config.yml` on the laptop. Start it with `cloudflared tunnel run alyr-dev`. |
| WhatsApp Business Tools MCP | Optional. Connector URL `https://mcp.facebook.com/whatsapp_business_tools`; lets a session register the number, create templates and set the webhook. Beta, gradual rollout. |
| Email at alyr.qa (ALY-74) | Set up Cloudflare Email Routing and a Resend account, put the key in `apps/api/.env`. Steps in D-029 (about 20 minutes, free). |
| Sign-in choice | Built as our own (D-022, proposed). Say so if you want a hosted service instead. |
| Prices and the first month | Decided 16 Oct (D-034): from QAR 449 a month, setup from QAR 1,500 quoted at the visit, month to month, first month's subscription back if the agreed result is missed. The customer agreement is drafted (PR #47, ALY-98), with 7 days' notice to stop; prices stay off the site until the CR (D-034). Say whether the back office's draft setup of QAR 2,500 (D-032) should start lower. |
| Company registration | D-018 is proposed, not accepted. |
| Others | Payment provider applications (ALY-5), startup credits (ALY-55), lawyer on data location (ALY-51), an Arabic reviewer, two alpha businesses. |

## Known gaps and risks

- The public site is live with no contact address and unreviewed Arabic (the new homepage, once published, gives hello@alyr.qa). Several product claims on it describe what is built on the simulator, not what runs live. See `docs/brand.md`.
- Bookings: one customer at a time per shop; services and opening hours can only be changed through the API; staff cannot move a booking or add a walk-in from the screen.
- On the founder's laptop Windows blocks Python's compiled database driver, so the API and its tests run through `scripts/api-in-docker.sh`.

- Templates carry no buttons, so a payment reminder sent outside the 24-hour window has the pay link but not the "pay now" and "I'll pay within a week" buttons. Templates exist on ALYR's test account only.
- Sign-in codes are not emailed yet: sign-in works on a local machine only.
- No self-serve sign-up: ALYR staff create a shop and its owner in the back office at `/ops`.
- Marketing consent cannot be captured yet, so every marketing template is blocked.
- Arabic wording has not been reviewed by a native speaker.
- The order link identifies the customer by an unguessable ID only.
- Failed jobs have an API route but no screen.
- The demo page polls every 1.5 seconds.

## Live testing from the laptop

- If a dev server is already running in `apps/web` (another session's, for example), start a second one beside it with its own output folder: `ALYR_DIST_DIR=.next-preview pnpm exec next dev -p 3101`. Next rewrites `tsconfig.json` when it does this; discard that change.
- **For a demo, run `scripts/demo.sh up`.** It starts whatever is not running and ends with `check`, which says what to fix. `scripts/demo.sh reset` puts the demo shop back to its starting data (it asks first; it wipes chats).
- The API runs in Docker (`ALYR_DOCKER_FLAGS="-p 8000:8000 --name alyr-api-dev" scripts/api-in-docker.sh uv run uvicorn alyr.main:app --host 0.0.0.0 --port 8000`), the web app with `pnpm dev`, the tunnel with `cloudflared tunnel run alyr-dev`. All three must be running, on the founder's laptop.
- The tunnel publishes two addresses and nothing else: `api.alyr.online` (only `/webhooks/whatsapp` and `/health`) and `app.alyr.online` (only the customer pages `/s/`, `/b/`, `/pay/`, `/t/` and the API routes they call). The workspace, sign-in and the simulator answer 404 from outside.
- `ALYR_PUBLIC_WEB_URL=https://app.alyr.online` in `apps/api/.env` makes links in chats point there. It is the Next.js dev server behind the tunnel, which is acceptable for testing only (ALY-63 replaces it).

## Publishing the public site

- Only `/` and `/ar` are published, as plain files on Cloudflare (Worker `alyr-site`, static assets, free plan). The workspace, sign-in and the API are not there: `/whatsapp`, `/login` and `/api/...` answer 404 on `alyr.online`.
- To publish a change: `scripts/build-site.sh`, then `npx wrangler deploy` from `apps/web`. It needs the Cloudflare sign-in on the founder's laptop and the founder's go-ahead each time. Nothing deploys automatically.
- Waiting for the next publish: the `/chat` accessibility fixes (ALY-97). With them, axe-core finds no issues on `/chat` and `/ar/chat` at 1440 and 390 px.
- The bare domain is attached as a route because it already had a proxied DNS record; `www.alyr.online` is a custom domain. See `apps/web/wrangler.jsonc`.
- **`alyr.qa` is the main address** since 12 Oct. `alyr.online` and both `www` forms redirect to it (`REDIRECT` is `"on"` in `apps/web/wrangler.jsonc`), and every plain `http` request is moved to `https`. If `alyr.qa` ever stops resolving, set `REDIRECT` to `"off"` and deploy: every address then serves the site itself. `api.alyr.online` is not affected.

## Things that only exist on the founder's laptop

A cloud session does not have these, by design:

- `apps/api/.env` and `apps/api/.env.neon` (secrets; never committed).
- The Cloudflare and Neon command-line sign-ins. Neon project `fragrant-firefly-99152608` (Frankfurt) holds demo data only.
- The Cloudflare Tunnel `alyr-dev` and its credentials: the live WhatsApp webhook is served from the laptop until always-on hosting is chosen (D-013). It only answers while the laptop, the API and the tunnel are all running. Live Meta testing therefore happens on the laptop, not in a cloud session.

## Working in a cloud session

- No Docker there. `scripts/cloud-setup.sh` starts the installed PostgreSQL, creates the same role and database as `docker-compose.yml`, installs dependencies, migrates and seeds. A session-start hook in `.claude/settings.json` runs it automatically in Claude Code cloud sessions.
- Then `scripts/check.sh` runs everything CI runs.
- This script was written on Windows and has not yet been run in a cloud session. If it fails, fix it in its own pull request.
