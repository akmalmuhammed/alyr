# Go-live lane

**Mission.** Close the gap between the simulator and a real business's number: Meta, templates, hosting, monitoring, and the payment gateway integration.

Linear: label `Go-live` under "Lane", project `Alyr Launch`. Read `docs/operating-model.md` for the rules every lane follows.

## Files this lane owns

- `apps/api/src/alyr/channels/`
- `scripts/`
- `infra/`
- `apps/web/wrangler.jsonc`, `apps/web/site-worker.js`
- `.github/workflows/`

Anything else belongs to another lane. If a task needs it, keep the change small and say so in the pull request.

## Read before starting

1. `docs/status.md`
2. `CLAUDE.md`
3. `docs/stack.md` (every tool, its free limit, when we swap)
4. `docs/decisions.md` D-013 and D-019

## Now (update this section in the same pull request as the work)

Last updated 24 Oct 2026 (site tooling, branch `aly-site-tooling`, `docs/site-audit/05-tooling-log.md`).

- **Site tooling, in a pull request, not merged or run on GitHub** (Actions is blocked by
  billing).
  - **Deploy from GitHub Actions** (`.github/workflows/site-deploy.yml`): a preview version
    of `alyr-site` per pull request; production only after the founder approves the
    `production` environment.
  - **Every build stamped with its commit** (`/version.txt`, `<meta name="alyr-build">`).
  - **Rollback runbook:** `docs/runbooks/site-deploy.md`.
  - **A CI `site` job:** `pnpm site:check` runs `build-site.sh`, EN/AR parity, banned
    words and prices, and internal links.
  - **`pnpm site:*` commands**, with Wrangler, axe and Lighthouse pinned.
  - **For machines:** `llms.txt`, `llms-full.txt` and a markdown copy of each page.
- **Waiting on the founder (Needs Akmal):** the Cloudflare API token and account ID as
  GitHub secrets; the `production` environment with him as reviewer; version URLs on for
  `alyr-site`. The steps are in `docs/runbooks/site-deploy.md`, "One-time setup".
  Until then the manual `pnpm site:deploy` (or `wrangler deploy`) still works.
- **Hosting decided (D-060, 28 Oct):** Google Cloud in Doha (Cloud Run, Cloud SQL, Secret Manager),
  replacing Azure Qatar Central (D-036, Microsoft refused startup credits) and the interim
  Cloudflare and Neon host (D-052). The images, the worker heartbeat and the backup and restore
  were rehearsed under ALY-63; `infra/gcp/` builds the Doha setup (ALY-10).
- **Meta business verification done 28 Oct 2026** (alyr software, CR 255539; domain alyr.qa verified). Next is Tech Provider approval (ALY-52): app settings with the privacy policy URL, two screen recordings, Advanced access to `whatsapp_business_messaging` and `whatsapp_business_management`, then App Review. The steps: `docs/runbooks/meta-tech-provider.md`. The first live round trip on Meta's test number worked on 12 Oct (docs/status.md); the test account's limit is 250 business-initiated conversations a day.
- The webhook address `api.alyr.online` is a tunnel to the laptop and is down whenever the laptop is.
- The public site is served from Cloudflare. `alyr.qa` is the main address and the redirect switch is on (since 12 Oct; `docs/status.md`).

## Next, in order

1. ALY-10 Azure infrastructure code, the deploy workflow and the Google emergency scripts (PR 52)
2. Founder: open the Azure account (Microsoft for Startups) and a Google Cloud account, make the backup key
3. Deploy to Azure, move the webhook and the chat links to alyr.qa addresses, retire the tunnel
4. Uptime monitoring on `/health/worker` and the webhook; one restore drill on Google
5. ALY-64 confirm Meta's pricing rule; ALY-20 templates
6. ALY-103 photos: R2 is ready (17 Oct): bucket `alyr-media`, `media.alyr.qa`, and the bucket-limited app token in `apps/api/.env`, all checked. Azure reads the same three R2 values from Key Vault.

## Never

- Deploy, change DNS or switch a redirect without the founder's yes for that one action, and without first checking the target answers.
- Read or print a secret. The founder types secrets into `.env` files.
- Pick a paid service. Research, then bring a choice with costs.
- Use anything but Meta's official Cloud API.

## Done means

It works with the laptop switched off, it was checked from outside our network, and `docs/status.md` says how to repeat it.
