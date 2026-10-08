# Where Alyr stands

Read this first in a new session, on any machine. It is the hand-over note between sessions: what works, what is next, and what is waiting on the founder. Update it in the same pull request as the work. Linear (team `Alyrtech`, project `Alyr Launch`) holds the detail; this page is the summary.

Last updated: 8 Oct 2026, after pull request 10.

## What works today

All of it runs against the chat simulator. Nothing has been tested against Meta's live API yet.

| Area | State | Where |
|---|---|---|
| Tenancy with forced row-level security | Built | `migrations/0001_core.sql`, `db.py` |
| Simulator and Meta channels behind one interface | Built; Meta untested live | `channels/` |
| Contact identity by WhatsApp user ID, phone optional | Built | `core/identity.py` |
| Credit ledger in chat, ageing, reminders, pay link | Built | `modules/ledger/` |
| Order link: products, order page, pay or on account | Built | `modules/orders/`, `apps/web/app/s/` |
| Job queue with retries and dead letters | Built | `core/jobs.py` |
| Consent, stop and start words, 24-hour window | Built | `core/consent.py`, `core/outbound.py` |
| Shared inbox with human takeover | First version | `modules/inbox/`, D-021 |
| Sign-in by one-time code, sessions, team and roles | Built; no email provider, so codes only work locally | `core/auth.py`, D-022 |
| Demo page: chat simulator plus workspace tabs | Built | `apps/web/app/page.tsx` |

Tests: 120, all passing. CI runs api, web and a secrets scan on every pull request.

## Next on the build side, in order

1. **Rest of the inbox (ALY-28):** assignment to a person (now possible), internal notes, saved replies, typing warning, live updates.
2. **Email provider for sign-in codes (part of ALY-18).** Needs research and the founder's choice; blocks any hosted environment.
3. **Contacts and labels (ALY-53).**
4. **Templates (ALY-20)** and sending one from the inbox when the window is closed.
5. **Messaging limits (ALY-41), Redis sessions (ALY-14).**
6. **Products screen and remaining order-link items (ALY-24); remaining ledger items (ALY-22).**
7. **Broadcasts with marketing opt-in (ALY-44), Embedded Signup (ALY-39).**
8. **Always-on hosting (ALY-10), a real payment gateway (ALY-17).**

## Waiting on the founder

| Item | Detail |
|---|---|
| Meta values | Five values into `apps/api/.env`; names and where to find each are in `apps/api/.env.example`. The Meta app exists; the values are not in yet. |
| Domain | `alyr.online` is bought but did not resolve on 8 Oct. Needs its nameservers pointed at the Cloudflare account so the tunnel can serve `api.alyr.online`. Registrar not yet known. |
| WhatsApp Business Tools MCP | Optional. Connector URL `https://mcp.facebook.com/whatsapp_business_tools`; lets a session register the number, create templates and set the webhook. Beta, gradual rollout. |
| Sign-in choice | Built as our own (D-022, proposed). Say so if you want a hosted service instead. |
| Prices | Confirm D-017 (QAR 490 / 890, seat 40, setup 2,500). |
| Company registration | D-018 is proposed, not accepted. |
| Others | Payment provider applications (ALY-5), startup credits (ALY-55), lawyer on data location (ALY-51), an Arabic reviewer, two alpha businesses. |

## Known gaps and risks

- Sign-in codes are not emailed yet: sign-in works on a local machine only.
- No sign-up: a shop and its first owner are created by hand in the database.
- Marketing consent cannot be captured yet, so every marketing template is blocked.
- Arabic wording has not been reviewed by a native speaker.
- The order link identifies the customer by an unguessable ID only.
- Failed jobs have an API route but no screen.
- The demo page polls every 1.5 seconds.

## Things that only exist on the founder's laptop

A cloud session does not have these, by design:

- `apps/api/.env` and `apps/api/.env.neon` (secrets; never committed).
- The Cloudflare and Neon command-line sign-ins. Neon project `fragrant-firefly-99152608` (Frankfurt) holds demo data only.
- The Cloudflare Tunnel, once set up: the live WhatsApp webhook is served from the laptop until always-on hosting is chosen (D-013). Live Meta testing therefore happens on the laptop, not in a cloud session.

## Working in a cloud session

- No Docker there. `scripts/cloud-setup.sh` starts the installed PostgreSQL, creates the same role and database as `docker-compose.yml`, installs dependencies, migrates and seeds. A session-start hook in `.claude/settings.json` runs it automatically in Claude Code cloud sessions.
- Then `scripts/check.sh` runs everything CI runs.
- This script was written on Windows and has not yet been run in a cloud session. If it fails, fix it in its own pull request.
