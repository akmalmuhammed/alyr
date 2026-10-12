# Where Alyr stands

How the work is divided, and the one goal for this stage, are in [operating-model.md](operating-model.md). Each lane keeps its own detail in `docs/lanes/`.

Read this first in a new session, on any machine. It is the hand-over note between sessions: what works, what is next, and what is waiting on the founder. Update it in the same pull request as the work. Linear (team `Alyrtech`, project `Alyr Launch`) holds the detail; this page is the summary.

Last updated: 13 Oct 2026, after message templates and the ALYR Chat page update.

## What works today

**First live round trip on 12 Oct 2026.** A real phone sent "Hello" to Meta's test number (+1 555 638 3300); the welcome menu came back, a button tap was received, and the order link was delivered and read. The same evening a real order (#1001, QAR 179) was placed from the phone and paid on the stand-in payment page, and both confirmations were delivered. A booking was made and confirmed the same way. **Templates (ALY-20):** notices inside a customer's 24-hour window go as ordinary messages in the module's own wording; after it closes they go as one of 16 templates in `core/templates.py`, each in English and Arabic. All 32 were submitted to Meta on 12 Oct and were pending review when this was written; until Meta approves one, sending it fails. `scripts/api-in-docker.sh uv run python -m alyr.templates_sync` shows where each stands, and `--create` submits any that are missing. A template sent outside the window has not yet been seen arriving on a phone.

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
| Sign-in by one-time code, sessions, team and roles | Built; no email provider, so codes only work locally | `core/auth.py`, D-022 |
| Bookings: services, opening hours, free times, book, move, cancel, reminders | Built: customer booking page at `/b/{slug}` and a workspace Bookings tab. One customer at a time per shop; no deposits | `modules/bookings/`, `apps/web/app/(product)/b/` |
| ALYR public site, English and Arabic: company homepage and the ALYR Chat product page | **Live at https://alyr.qa** (company-first version, D-026, published 12 Oct). Merged since and not yet published: the how-it-works figure and the list of what is built on `/chat` (ALY-71) | `apps/web/app/_site/`, `docs/brand.md` |
| Demo page: chat simulator plus workspace tabs, now at `/whatsapp` | Built | `apps/web/app/(product)/whatsapp/page.tsx` |

Tests: 157, all passing. CI runs api, web and a secrets scan on every pull request.

## Next on the build side, in order

1. **Bookable staff or resources (ALY-27),** so a salon or clinic can serve more than one customer at a time; then services and opening-hours screens.
1. **Product screens on ALYR tokens**, so the workspace matches the public site.
1. **Contacts and labels (ALY-53).**
2. **Email provider for sign-in codes (part of ALY-18).** Needs research and the founder's choice; blocks any hosted environment.
3. **Inbox leftovers (ALY-28):** live updates instead of polling, a warning when a colleague is typing.
4. **Templates, the rest of ALY-20:** sending one from the inbox when the window is closed, buttons on the reminder template, and templates per customer account once shops connect their own number (ALY-39).
5. **Messaging limits (ALY-41), Redis sessions (ALY-14).**
6. **Products screen and remaining order-link items (ALY-24); remaining ledger items (ALY-22).**
7. **Broadcasts with marketing opt-in (ALY-44), Embedded Signup (ALY-39).**
8. **Always-on hosting (ALY-10), a real payment gateway (ALY-17).**

## Waiting on the founder

| Item | Detail |
|---|---|
| Meta values | Done 12 Oct. `apps/api/.env` holds the five values (app `alyr`, id 1071845795713841, test number id 1431880183331516). The webhook is verified, the app is subscribed to the `messages` field and to the WhatsApp account. The access token is a system-user token (`alyradmin`, never expires, `whatsapp_business_messaging` and `whatsapp_business_management`), set 12 Oct. |
| Domain and tunnel | Done 8 Oct. `alyr.online` is on Cloudflare. Tunnel `alyr-dev` publishes only `/webhooks/whatsapp` and `/health` of the laptop's API at `https://api.alyr.online`; everything else answers 404 from outside. Config is in `~/.cloudflared/config.yml` on the laptop. Start it with `cloudflared tunnel run alyr-dev`. |
| WhatsApp Business Tools MCP | Optional. Connector URL `https://mcp.facebook.com/whatsapp_business_tools`; lets a session register the number, create templates and set the webhook. Beta, gradual rollout. |
| Sign-in choice | Built as our own (D-022, proposed). Say so if you want a hosted service instead. |
| Prices | Confirm D-017 (QAR 490 / 890, seat 40, setup 2,500). |
| Company registration | D-018 is proposed, not accepted. |
| Others | Payment provider applications (ALY-5), startup credits (ALY-55), lawyer on data location (ALY-51), an Arabic reviewer, two alpha businesses. |

## Known gaps and risks

- The public site is live with no contact address and unreviewed Arabic. Several product claims on it describe what is built on the simulator, not what runs live. See `docs/brand.md`.
- Bookings: one customer at a time per shop; services and opening hours can only be changed through the API; staff cannot move a booking or add a walk-in from the screen.
- On the founder's laptop Windows blocks Python's compiled database driver, so the API and its tests run through `scripts/api-in-docker.sh`.

- Templates carry no buttons, so a payment reminder sent outside the 24-hour window has the pay link but not the "pay now" and "I'll pay within a week" buttons. Templates exist on ALYR's test account only.
- Sign-in codes are not emailed yet: sign-in works on a local machine only.
- No sign-up: a shop and its first owner are created by hand in the database.
- Marketing consent cannot be captured yet, so every marketing template is blocked.
- Arabic wording has not been reviewed by a native speaker.
- The order link identifies the customer by an unguessable ID only.
- Failed jobs have an API route but no screen.
- The demo page polls every 1.5 seconds.

## Live testing from the laptop

- If a dev server is already running in `apps/web` (another session's, for example), start a second one beside it with its own output folder: `ALYR_DIST_DIR=.next-preview pnpm exec next dev -p 3101`. Next rewrites `tsconfig.json` when it does this; discard that change.
- The API runs in Docker (`ALYR_DOCKER_FLAGS="-p 8000:8000 --name alyr-api-dev" scripts/api-in-docker.sh uv run uvicorn alyr.main:app --host 0.0.0.0 --port 8000`), the web app with `pnpm dev`, the tunnel with `cloudflared tunnel run alyr-dev`. All three must be running, on the founder's laptop.
- The tunnel publishes two addresses and nothing else: `api.alyr.online` (only `/webhooks/whatsapp` and `/health`) and `app.alyr.online` (only the customer pages `/s/`, `/b/`, `/pay/` and the API routes they call). The workspace, sign-in and the simulator answer 404 from outside.
- `ALYR_PUBLIC_WEB_URL=https://app.alyr.online` in `apps/api/.env` makes links in chats point there. It is the Next.js dev server behind the tunnel, which is acceptable for testing only (ALY-63 replaces it).

## Publishing the public site

- Only `/` and `/ar` are published, as plain files on Cloudflare (Worker `alyr-site`, static assets, free plan). The workspace, sign-in and the API are not there: `/whatsapp`, `/login` and `/api/...` answer 404 on `alyr.online`.
- To publish a change: `scripts/build-site.sh`, then `npx wrangler deploy` from `apps/web`. It needs the Cloudflare sign-in on the founder's laptop and the founder's go-ahead each time. Nothing deploys automatically.
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
