# Stack and free-tier register

What Alyr runs on, what each free tier really gives us, what we lose by staying on it, and the trigger for moving off. Rule from decision D-011: free until the first 10 paying customers, and nothing may lock us in.

Checked 7 October 2026. Free tiers change often; re-check a row before relying on it.

## How we stay movable

1. Everything runs from `docker-compose.yml`. If it runs there, it runs on any machine or cloud.
2. Only standard building blocks: PostgreSQL, Redis, S3-compatible storage, plain containers. No vendor-only database features, queues or auth.
3. Every outside service sits behind one small interface in our code (channel, payment adapter, AI gateway, file store).
4. Configuration is environment variables only.

## Register

**Status:** In use · Planned · Avoid

| What for | Tool | Free allowance | What staying free costs us | Swap to | Swap when | Status |
|---|---|---|---|---|---|---|
| Source and CI | GitHub Free | Private repos, 2,000 CI minutes a month | Cannot enforce branch protection on a private repo | GitHub Team | A second developer joins | In use |
| Tasks | Linear Free | 250 issues, 2 teams | Hard cap; we are at 54 | Linear Basic, or archive done issues | About 200 active issues | In use |
| Development | Docker Desktop, local PostgreSQL 16 and Redis 7 | Unlimited | None | — | — | In use |
| WhatsApp test traffic | Meta test number | Free; up to 5 recipient phones | Cannot message real customers | Merchant's own number via Embedded Signup | Phase 2 exit test | Planned |
| Webhook during development | Cloudflare Tunnel | Free | Needs a small program installed on the laptop; address changes unless a domain is attached | Azure Container Apps (D-036) | Azure is live | In use until Azure |
| Public site hosting | Cloudflare Workers static assets (`alyr-site`) | Free: unlimited static requests | Static files only; no server rendering | Not needed for a static site | When the site needs server code | Live 11 Oct |
| Workspace web app hosting | Google Cloud Run, Doha (`alyr-web`), one instance always running (D-060) | None used; the startup credits pay (USD 300 trial, USD 2,000 applied for on 28 Oct) | About USD 14 a month at Doha list price | More instances, set by Cloud Run | Requests queue or slow down | Building (ALY-10) |
| Database (hosted) | Cloud SQL for PostgreSQL 16, Doha, `db-g1-small` (shared vCPU, 1.7 GB), private network only, 14 daily backups and 7 days of point-in-time recovery (D-060) | As above | About USD 34 a month at Doha list price; a shared vCPU has no SLA | A dedicated 1 or 2 vCPU machine, then high availability (measured limits, costs and the order to do it in: `docs/runbooks/capacity.md`, D-133) | CPU above 70% for 15 minutes (alert `sql-cpu-warning`), about 25 live shops, connections near the limit, or a paying client who needs the SLA | Building (ALY-10) |
| API and worker hosting | Cloud Run, Doha: `alyr-api` service (1 vCPU, 512 MiB, one always running, up to 3) and the `alyr-worker` worker pool (one instance, 1 vCPU), from the same image | As above | About USD 14 and USD 37 a month at Doha list price (an always-on worker needs 1 vCPU) | More API instances; a larger worker | CPU or the job queue's age in `docs/hosting.md` | Building (ALY-10) |
| Second copy of the database | Cloud SQL's nightly export to a Cloud Storage bucket in Doha, kept 35 days (D-060) | As above | Cents a month | — | — | Building (ALY-10) |
| Interim hosting on Cloudflare Containers and Neon (D-052) | Not used: Google Cloud in Doha replaces it (D-060) | — | — | — | — | Superseded 28 Oct |
| Tunnel, Vercel and Neon command-line tools | cloudflared, vercel, neonctl | Free | None | — | — | Installed 7 Oct |
| DNS and TLS | Cloudflare Free | Unlimited DNS, free certificates; one rate-limit rule, Block only, counted over 10 s; the Free managed WAF ruleset is always on (checked 30 Oct) | Bot Fight Mode cannot be skipped for webhooks; no log or challenge action in rate limits; Zero Trust (Access) asks for payment details even on its Free plan | Cloudflare Pro (paid) | We want log or challenge modes, more rate-limit rules or the managed WAF rulesets | Live; hardened 30 Oct (`docs/runbooks/cloudflare-edge.md`) |
| Domain name | Any registrar | **Not free**: about USD 10 to 15 a year for .com, more for .qa | — | — | — | Needed before Meta app review |
| Error tracking | Our own scrubbed `error_events` table, shown in `/ops` (slice 2 of ALY-121) | Free | We build it | Sentry Team (USD 26 to 29 a month) | A second developer, or over 5,000 errors a month | Planned |
| Product analytics | PostHog Free | 1 million events a month | None at our size | — | — | Planned |
| Uptime checks, alerts and budgets | Google Cloud Monitoring and Billing budgets (D-060, D-091); the phone is the Google Cloud app (the worker's own rules below use ntfy) | Uptime checks, alert policies, log-based metrics and budgets are free at ALYR's size | 5-minute checks, not 1-minute; email alone does not wake anyone until the phone is added | Paid tier | A customer SLA exists | Live (ALY-277); phone channel waits for the founder |
| Alert rules | Our own: four rules in the worker, `alert_state` (ALY-121, D-073) | Free | We maintain them | — | — | Built 28 Oct, in a pull request |
| Phone alerts | ntfy.sh, the topic name is the secret | Free, no account | No delivery guarantee; anyone who learns the topic can read and send alerts | Self-hosted ntfy, or a paid pager | A client SLA exists | Built, parked until the founder sets a topic (ALY-121) |
| Email in and out for people (hello@, akmal@, security@, beevi.jinan@ at alyr.qa) | Zoho Mail, free plan | 5 licences; 5 GB a user (seen in Zoho's admin console, 26 Oct) | No shared inbox; `.com` data centre, outside Qatar | Zoho Mail paid, or the startup programme's mail (ALY-55) | Shared inboxes or a sixth mailbox are needed | Chosen 25 Oct (D-061; replaces Cloudflare Email Routing, D-029) |
| Product photo storage | Cloudflare R2, Standard storage, S3 interface only | 10 GB-month, 1 million writes and 10 million reads a month, no download fee (checked 17 Oct) | The data is outside Qatar; the pricing page does not say whether a card is needed | Any S3-compatible store, or Azure Blob in Qatar Central | The free tier is passed (USD 0.015 per GB-month after), or a customer needs photos kept in Qatar | Enabled 17 Oct (D-039); bucket `alyr-media`; app token in `apps/api/.env` (checked 17 Oct). Code in PR #65 (ALY-103): used when all three R2 keys are set, local disk otherwise; the opt-in live smoke test has not been run |
| Product photo delivery | Cloudflare network on `media.alyr.qa` | Included; R2 charges nothing for downloads | Needs the bucket's custom domain | — | — | Chosen 17 Oct (D-039) |
| Photo resizing | Our own code in the API (Pillow, a Python library: free) | Free | Uses server processing at upload: about 0.6 s for a 12-megapixel photo, measured 17 Oct on the laptop | Cloudflare Images transformations (5,000 unique a month free, then USD 0.50 per 1,000) | Processing becomes a problem | Built 17 Oct (ALY-103, D-039) |
| Documents: drawing a PDF (receipts, invoices, ...) | `fpdf2` 2.8.9 (LGPL-3.0, pure Python) with `uharfbuzz` 0.56 (Apache-2.0, a 2 MB wheel; the HarfBuzz shaper), in the API; the brand's own fonts embedded; no network and no system library | Free | fpdf2's own layout is low level (the pages are placed by hand, `modules/documents/render/`); its bidi code mishandles Unicode isolates, so none is used; the text layer of an Arabic PDF is glyph order | WeasyPrint (needs Pango installed), or a headless browser | Layouts become too many to place by hand, or fpdf2 stops being maintained and a vulnerability appears (`pip-audit` in CI) | Built 19 Oct (ALY-138, D-042, spec 011). Chosen after a spike of four options: see the spec. The PDF is kept in PostgreSQL, not R2 (customer data) |
| Documents: reading a PDF back in tests | `pypdfium2` (BSD/Apache-2.0, development dependency only) | Free | Not shipped | — | — | Built 19 Oct (ALY-138) |
| QR codes for counters and tables | `qrcode-generator` 2.0.4 (npm, MIT, no dependencies; Kazuhiko Arase), drawn in the browser when the Catalog's Share sheet opens | Free; about 8 KB gzipped (22 KB raw, measured in the production build), not in the customer pages | Last release Aug 2025; a small library with one maintainer | A hand-written encoder, or `qr` (Paul Miller, MIT or Apache-2.0) | It stops being maintained and a vulnerability appears (`pnpm audit` in CI) | Built 18 Oct (ALY-112). The decode test uses `jsqr` 1.4.0 (npm, Apache-2.0), a development dependency only |
| Email out (sign-in codes; replies as @alyr.qa) | Resend Free, EU region | 3,000 emails a month, 100 a day, one domain (checked 16 Oct) | Daily cap | Resend Pro (USD 20 a month) | Daily cap is hit | Chosen 16 Oct (D-029) |
| Clients paying ALYR by card (ALYR's own billing) | Paddle Billing, sandbox | No monthly fee; 5% + USD 0.50 per checkout payment (paddle.com/pricing, checked 29 Oct); charges in US dollars, no Qatari riyal | The fee on each payment; dollars only | A Qatari card provider for clients in Qatar (Noqoody or SADAD, D-072) | The live test picks one | Built in sandbox 29 Oct (D-074, ALY-180); live waits for Paddle's approval and ALY-98 |
| AI model | None in Product 1 (D-012) | — | Rule-based understanding only | A paid model tier, or cloud credits | Rule accuracy is not good enough, and ALY-51 is answered | Planned |
| Payments | Partner for shops' own accounts (model B): Tap first, SADAD second, MyFatoorah reserve, to sign in ALY-5. Shops' existing accounts (model A): SADAD, SkipCash, Dibsy, MyFatoorah (D-044) | Online cards about 2.5% per payment (SADAD 2.5%, minimum QAR 2.50; Dibsy 2.5% + QAR 1); Tap not published | Fees are the merchant's, paid on their own account | — | — | Planned |
| Design | None; built in code | — | — | Figma Free | We need to hand designs to someone | — |

## Free things we decided against

| Tool | Why not |
|---|---|
| Render Free, Koyeb Free | The service sleeps when idle. Meta retries a webhook that is not answered promptly, so customers would wait or messages would arrive late |
| Fly.io | No free tier for new accounts |
| Supabase Free | Pauses after a week idle; pulls us toward its own auth and client libraries |
| Gemini or Groq free API tiers | Free-tier prompts may be used for training and read by reviewers. Not for real customer messages |
| Google Cloud Run free tier | Free usage only in three US regions |
| Unofficial WhatsApp libraries | Numbers get banned |

## Startup credit programmes (free money, apply once)

| Programme | Amount | Needs | Note |
|---|---|---|---|
| Microsoft for Startups Founders Hub | USD 1,000 on signup; USD 5,000 after business verification; more with an investor referral | A privately held company building its own software product. No funding required | Covers Azure Qatar Central. Review takes about 17 business days. Agencies and consultancies are excluded, so apply as a product company |
| Google for Startups Cloud Program | About USD 2,000 for unfunded startups | A company and a website | Covers Google Cloud Doha |
| AWS Activate Founders | USD 1,000 | A website and an AWS account | No AWS region in Qatar; nearest are Bahrain and UAE |

All three can be held at once. Tracked in Linear as ALY-55.

## Costs that will arrive, and when

| When | Cost | Roughly |
|---|---|---|
| Before Meta app review | Domain name | USD 10 to 15 a year |
| Phase 0 | Lawyer's opinion and contract review | Quote needed |
| Phase 3 | Our own sign-in codes on WhatsApp | USD 0.009 each |
| After credits run out | Hosting in Qatar: small managed PostgreSQL, one small server, storage | Estimate USD 60 to 120 a month; confirm with the cloud's calculator |
| Second developer | GitHub Team, Sentry Team, Linear | About USD 15 to 40 a month per person in total |

## Sources

- Microsoft for Startups: https://guptadeepak.com/startup-offers/guides/microsoft-for-startups
- Google for Startups: https://guptadeepak.com/startup-offers/programs/google-for-startups-cloud
- AWS Activate: https://guptadeepak.com/startup-offers/guides/aws-activate
- Oracle Always Free limits and reclaim policy: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm and https://fullmetalbrackets.com/blog/oci-free-tier-breakdown
- Hosting free tiers compared: https://flaviocopes.com/hosting-free-tiers.md
- Vercel Hobby terms: https://vercel.com/docs/v2/platform/fair-use-policy
- Neon: https://neon.com/pricing · Supabase: https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ · Upstash: https://upstash.com/pricing/redis
- Gemini free-tier data use: https://simonwillison.net/2024/Oct/17/gemini-terms-of-service
