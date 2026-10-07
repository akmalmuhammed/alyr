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
| Web app hosting | Vercel Hobby | Free | Terms forbid commercial use | Vercel Pro (about USD 20 a month) | First paying customer | Planned |
| Database (hosted) | Neon Free | 0.5 GB, sleeps after 5 idle minutes | Outside Qatar; about 100 ms further away; no salary or QID data until ALY-51 | Azure PostgreSQL in Qatar Central | First paying customer, or 0.4 GB used, or Product 2 starts | Planned |
| API and worker hosting | Founder's laptop through Cloudflare Tunnel | Free | Only up while the laptop is on | Azure Qatar Central on startup credits | Alpha merchants need it always on | Planned |
| Tunnel, Vercel and Neon command-line tools | cloudflared, vercel, neonctl | Free | None | — | — | Installed 7 Oct |
| DNS and TLS | Cloudflare Free | Unlimited DNS, free certificates | None that matter | — | — | Planned |
| Domain name | Any registrar | **Not free**: about USD 10 to 15 a year for .com, more for .qa | — | — | — | Needed before Meta app review |
| Error tracking | Sentry Developer | 5,000 errors a month, 1 user | One seat; short history | Sentry Team | A second person needs access | Planned |
| Product analytics | PostHog Free | 1 million events a month | None at our size | — | — | Planned |
| Uptime checks | UptimeRobot or Better Stack Free | A handful of monitors | 5-minute checks, not 1-minute | Paid tier | A customer SLA exists | Planned |
| Email (sign-in backup, invoices) | Resend Free | 3,000 emails a month, 100 a day | Daily cap | Resend Pro | Daily cap is hit | Planned |
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
