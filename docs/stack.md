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
| Webhook during development | Cloudflare Tunnel | Free | Needs a small program installed on the laptop; address changes unless a domain is attached | A hosted server | Phase 2 hosting exists | Planned |
| Public site hosting | Cloudflare Workers static assets (`alyr-site`) | Free: unlimited static requests | Static files only; no server rendering | Not needed for a static site | When the site needs server code | Live 11 Oct |
| Workspace web app hosting | Cloudflare Workers through OpenNext (`alyr-portal`) | Workers Free covers little; the Workers Paid plan is USD 5 a month (founder to agree) | Built and run locally, not deployed; bundle 2.4 MB gzipped against a 10 MiB limit (D-052) | Azure Container Apps in Qatar Central | Azure credits (ALY-55, ALY-63) | Built 24 Oct (ALY-224) |
| Database (hosted) | Neon Free | 0.5 GB, sleeps after 5 idle minutes | Outside Qatar; about 100 ms further away; no salary or QID data until ALY-51 | Azure PostgreSQL in Qatar Central | First paying customer, or 0.4 GB used, or Product 2 starts | Planned |
| Portal demo hosting | Cloudflare Workers static assets (`alyr-portal-demo`) | Free: unlimited static requests; about 5 MB of files | Static files and recorded sample data only; no sign-up, no messages, no payment (D-057) | Delete it when the real portal is hosted | The real portal is hosted (D-052, Azure) | Built 25 Oct (ALY-246), not published |
| API and worker hosting | One Cloudflare Container behind a Worker (`alyr-api`), API and job runner in one image | Workers Paid USD 5 a month plus the container's use, about USD 12 a month in all for one always-on `basic` instance (our estimate from Cloudflare's rates of 24 Oct) | Containers' status (generally available or not) is not stated in the docs; outbound access to Neon is untested; not in Qatar (D-052). The laptop and tunnel keep working meanwhile | Azure Container Apps in Qatar Central, same Dockerfile | Azure credits (ALY-55, ALY-63) | Built 24 Oct (ALY-224), not deployed; waiting for the founder's yes to the plan |
| Tunnel, Vercel and Neon command-line tools | cloudflared, vercel, neonctl | Free | None | — | — | Installed 7 Oct |
| DNS and TLS | Cloudflare Free | Unlimited DNS, free certificates | None that matter | — | — | Planned |
| Domain name | Any registrar | **Not free**: about USD 10 to 15 a year for .com, more for .qa | — | — | — | Needed before Meta app review |
| Error tracking | Sentry Developer | 5,000 errors a month, 1 user | One seat; short history | Sentry Team | A second person needs access | Planned |
| Product analytics | PostHog Free | 1 million events a month | None at our size | — | — | Planned |
| Uptime checks | UptimeRobot or Better Stack Free | A handful of monitors | 5-minute checks, not 1-minute | Paid tier | A customer SLA exists | Planned |
| Email in (akmal@, hello@ at alyr.qa) | Cloudflare Email Routing | Unlimited forwarding; 200 rules and destinations; 25 MiB per message (checked 16 Oct) | Forwarding only, no shared mailbox | Google Workspace (12 months free with Google for Startups) | A shared team inbox is needed | Chosen 16 Oct (D-029) |
| Product photo storage | Cloudflare R2, Standard storage, S3 interface only | 10 GB-month, 1 million writes and 10 million reads a month, no download fee (checked 17 Oct) | The data is outside Qatar; the pricing page does not say whether a card is needed | Any S3-compatible store, or Azure Blob in Qatar Central | The free tier is passed (USD 0.015 per GB-month after), or a customer needs photos kept in Qatar | Enabled 17 Oct (D-039); bucket `alyr-media`; app token in `apps/api/.env` (checked 17 Oct). Code in PR #65 (ALY-103): used when all three R2 keys are set, local disk otherwise; the opt-in live smoke test has not been run |
| Product photo delivery | Cloudflare network on `media.alyr.qa` | Included; R2 charges nothing for downloads | Needs the bucket's custom domain | — | — | Chosen 17 Oct (D-039) |
| Photo resizing | Our own code in the API (Pillow, a Python library: free) | Free | Uses server processing at upload: about 0.6 s for a 12-megapixel photo, measured 17 Oct on the laptop | Cloudflare Images transformations (5,000 unique a month free, then USD 0.50 per 1,000) | Processing becomes a problem | Built 17 Oct (ALY-103, D-039) |
| Documents: drawing a PDF (receipts, invoices, ...) | `fpdf2` 2.8.9 (LGPL-3.0, pure Python) with `uharfbuzz` 0.56 (Apache-2.0, a 2 MB wheel; the HarfBuzz shaper), in the API; the brand's own fonts embedded; no network and no system library | Free | fpdf2's own layout is low level (the pages are placed by hand, `modules/documents/render/`); its bidi code mishandles Unicode isolates, so none is used; the text layer of an Arabic PDF is glyph order | WeasyPrint (needs Pango installed), or a headless browser | Layouts become too many to place by hand, or fpdf2 stops being maintained and a vulnerability appears (`pip-audit` in CI) | Built 19 Oct (ALY-138, D-042, spec 011). Chosen after a spike of four options: see the spec. The PDF is kept in PostgreSQL, not R2 (customer data) |
| Documents: reading a PDF back in tests | `pypdfium2` (BSD/Apache-2.0, development dependency only) | Free | Not shipped | — | — | Built 19 Oct (ALY-138) |
| QR codes for counters and tables | `qrcode-generator` 2.0.4 (npm, MIT, no dependencies; Kazuhiko Arase), drawn in the browser when the Catalog's Share sheet opens | Free; about 8 KB gzipped (22 KB raw, measured in the production build), not in the customer pages | Last release Aug 2025; a small library with one maintainer | A hand-written encoder, or `qr` (Paul Miller, MIT or Apache-2.0) | It stops being maintained and a vulnerability appears (`pnpm audit` in CI) | Built 18 Oct (ALY-112). The decode test uses `jsqr` 1.4.0 (npm, Apache-2.0), a development dependency only |
| Email out (sign-in codes; replies as @alyr.qa) | Resend Free, EU region | 3,000 emails a month, 100 a day, one domain (checked 16 Oct) | Daily cap | Resend Pro (USD 20 a month) | Daily cap is hit | Chosen 16 Oct (D-029) |
| AI model | None in Product 1 (D-012) | — | Rule-based understanding only | A paid model tier, or cloud credits | Rule accuracy is not good enough, and ALY-51 is answered | Planned |
| Payments | SADAD, SkipCash, Dibsy | No monthly fee on entry plans; a percentage per payment | Fees are the merchant's, paid on their own account | — | — | Planned |
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
