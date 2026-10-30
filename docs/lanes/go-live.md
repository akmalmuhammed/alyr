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

Last updated 31 Oct 2026 (Meta App Review submitted, ALY-262), on top of 30 Oct 2026 (Cloudflare edge and DNS hardening, ALY-116 first layer, branch `claude/cf-edge-dns-hardening-ae84c8`; and the production database's backups, restore and secrets audited, ALY-34, branch `claude/aly-34-backups-restore-2b913c`), on top of 29 Oct 2026 (the visitor's address for the rate limits, ALY-265, branch `aly-ratelimit-trusted-client-ip`) and 24 Oct 2026 (site tooling, branch `aly-site-tooling`, `docs/site-audit/05-tooling-log.md`).

- **Cloudflare edge and DNS of alyr.qa hardened (ALY-116 first layer, CLD-7, CLD-18, D-113), live since 30 Oct,
  recorded in a pull request.** Always Use HTTPS, minimum TLS 1.2, SSL Full (strict), CAA for the three CAs
  Cloudflare issues from, SPF without the retired Email Routing include, and response-header rules that give the
  API and the media host their security headers. Nothing else moved: the Worker `alyr-edge` was not touched, MX
  and DMARC are as they were (`p=none`, review 13 Nov). Every step was checked from outside with
  `scripts/check-edge.sh`. `alyr.online`, which sends no mail, got SPF `-all` and DMARC `quarantine` after the
  founder's yes. **Waiting on the founder (Needs Akmal):** the three answers in
  `docs/runbooks/cloudflare-edge.md`, section 4 (the Block-only rate-limit rule, Zero Trust for the back
  office, the old tunnel). Not done: Access and `ops.alyr.qa` (ALY-219), the edge
  rate-limit rule, DNSSEC (`.qa` is not signed), MTA-STS.

- **Backups, restore and secrets audited (ALY-34, 30 Oct 2026), in a pull request.** Read-only audit of `alyr-prod`
  (`docs/audit/hardening-2026-10-30.md`; repeat with `infra/gcp/audit.sh`, which reports no FAIL today). A nightly
  backup was restored into a fresh `db-f1-micro` instance and the instance deleted: **12 min 8 s to a usable copy**
  (`restore.sh backup-drill`). Found and recorded: the point-in-time window is 14 hours until 5 Nov (the old `eu` backups
  were deleted), on-demand backups never expire, the development-era keys are all unrotated, nothing deletes a stopped
  business's data after 60 days (product), no status page. New alert on a delete, clone, restore-over or backup delete
  of `alyr-db` (applied, free). Status-page plan in `docs/runbooks/status-page.md`. **Waiting on the founder (Needs Akmal):**
  the nine rows in section 5 of the audit record (rotate keys, an export restore on production data then `lock-backups`,
  the phone channel, the on-call blanks, the status page's yes). Not done: the export restore on production data, the
  apps running on a restored copy, a restore with real data volume.


- **Per-address rate limits in production (ALY-265, D-083), in a pull request, nothing applied
  to production.** The edge Worker (`infra/cloudflare/edge`) writes the visitor's address from
  `CF-Connecting-IP` and signs it; the web app passes it on; the API counts only a signed
  address and counts every other request in one shared bucket. `infra/gcp/setup.sh` gains
  `client-ip-key`, `edge-key`, `client-ip-on` and `client-ip-off`, and `apps` keeps the settings;
  `scripts/check-client-address.sh` checks the whole path from outside. **Waiting on the
  founder (Needs Akmal):** approve the five steps in `docs/runbooks/client-address.md`, in order.
  Not done: a CI job for the edge Worker's tests (`pnpm test` in `infra/cloudflare/edge`; CI cannot
  be edited while PR #164 is open), IPv6 `/64` counting, Cloudflare rate-limit rules (prepared, Block only on Free: `docs/runbooks/cloudflare-edge.md`).

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
- **Meta business verification done 28 Oct 2026** (alyr software, CR 255539; domain alyr.qa verified). **App Review submitted 31 Oct 2026 (ALY-52, ALY-262):** app settings, the two recordings, and Advanced access to `whatsapp_business_messaging` and `whatsapp_business_management`, all in review; Meta says most are reviewed within 20 days. The steps and what we told Meta: `docs/runbooks/meta-tech-provider.md`. The first live round trip on Meta's test number worked on 12 Oct (docs/status.md); the test account's limit is 250 business-initiated conversations a day.
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
