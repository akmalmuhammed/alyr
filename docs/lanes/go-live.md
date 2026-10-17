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

Last updated 12 Oct 2026.

- Nothing has been tested against Meta. The Meta app exists; its five values are not in `apps/api/.env` yet.
- The webhook address `api.alyr.online` is a tunnel to the laptop and is down whenever the laptop is.
- The public site is served from Cloudflare. `alyr.qa` is attached; its redirect switch is off until the .qa registry is consistent.

## Next, in order

1. ALY-12 first live round trip on Meta's test number
2. ALY-63 always-on home for the API
3. ALY-64 confirm Meta's pricing rule
4. ALY-20 templates
5. ALY-103 photos: R2 is enabled and the bucket `alyr-media` with `media.alyr.qa` exists (17 Oct). Waiting on the founder's R2 API token (bucket-limited, Object Read and Write); then the photo pipeline (D-039).

## Never

- Deploy, change DNS or switch a redirect without the founder's yes for that one action, and without first checking the target answers.
- Read or print a secret. The founder types secrets into `.env` files.
- Pick a paid service. Research, then bring a choice with costs.
- Use anything but Meta's official Cloud API.

## Done means

It works with the laptop switched off, it was checked from outside our network, and `docs/status.md` says how to repeat it.
