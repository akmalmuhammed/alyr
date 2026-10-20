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

Last updated 17 Oct 2026.

- Live on Meta's test number since 12 Oct, through the laptop tunnel (`api.alyr.online`). Down whenever the laptop is.
- Hosting decided (D-036): Azure Qatar Central, backups and the emergency host on Google Cloud in Doha. The images, the production compose file, the worker heartbeat and the encrypted backup and restore are built and rehearsed (ALY-63, `docs/hosting.md`).
- The public site is served from Cloudflare at alyr.qa.

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
