# Access register

Every account ALYR depends on: who owns it, how it is signed in to, and what breaks if it is
lost. **No passwords, keys, tokens, IDs or recovery codes here, ever.** Update in the same PR
that adds a service (docs/hygiene.md). Reviewed weekly; last updated 17 Oct 2026 (ALY-114).

The founder confirms the "2FA" column; until confirmed it says "check".

| Service | What it is for | Account owner | Sign-in | 2FA | If lost |
|---|---|---|---|---|---|
| GitHub (`akmalmuhammed/alyr`) | Code, CI | Founder | Founder's GitHub | check | No code changes or CI |
| Linear (team Alyrtech) | Plan and tasks | Founder | Founder's email | check | Plan history |
| Cloudflare | DNS for alyr.qa and alyr.online, public site Worker, tunnel, email routing, R2 | Founder (akmalmuhammed93@gmail.com) | Google account | check | Site, email and webhook go down |
| Cloudflare API token "DNS edit" | Edit alyr.qa DNS from scripts | Founder | In `apps/api/.env` | n/a | Recreate; rotate per runbook |
| QHost | Registrar for alyr.qa | Founder | QHost account | check | Domain cannot be renewed: **renewal date to record** |
| Domain registrar for alyr.online | Second domain | Founder | check | check | Renewal date to record |
| Meta Business / WhatsApp app "alyr" | WhatsApp Cloud API, templates | Founder | Facebook account | check | All WhatsApp traffic stops |
| Meta system user | Long-lived API token | Founder | Token in `apps/api/.env` | n/a | Rotate per runbook |
| Resend | Sends sign-in codes and reports from no-reply@alyr.qa | Founder (akmal@alyr.qa) | Email | check | Sign-in stops |
| Resend API keys | CLI (full access), app (send-only, alyr.qa) | Founder | CLI config; `apps/api/.env` | n/a | Rotate per runbook |
| Gmail (akmalmuhammed43@gmail.com) | Receives akmal@, hello@, security@alyr.qa | Founder | Google account | check | Company mail unread |
| Gmail (akmalmuhammed93@gmail.com) | Ministry of Commerce correspondence, Cloudflare | Founder | Google account | check | Government messages missed |
| Neon | Hosted demo database (Frankfurt) | Founder | check | check | Demo data only |
| Microsoft for Startups / Azure | Planned production hosting (ALY-55, ALY-10) | Founder | Not yet created | | |
| Google Cloud | Planned staging and backups | Founder | Not yet created | | |
| Anthropic (Claude) | AI-built development sessions | Founder | Founder's account | check | Development pauses |
| Ministry of Commerce Single Window | Company registration SR3035824 | Owner (Beevi Jinan) | National authentication | | Registration cannot progress |

## Rules
- One owner per account, a named person. Shared logins are not allowed for staff accounts
  once there are staff (D-017 reasoning applies to us too).
- 2FA on every account that supports it, with recovery codes stored offline by the founder.
- A departing person's access is removed the same day; the row says when.
- Renewal and expiry dates (domains, certificates, credits, tokens) go in the table and in the
  weekly review.
