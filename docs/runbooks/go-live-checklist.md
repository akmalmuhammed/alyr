# Go-live checklist

Every box is ticked, with the PR or issue that ticks it, before the first real merchant's
customers use ALYR. From the 17 Oct 2026 audit (`docs/audit/2026-10-17.md`).

## Company and accounts
- [x] Commercial registration issued (CR 255539, 26 Oct 2026; application SR3044041) and Meta business verification done (28 Oct 2026; `docs/runbooks/meta-tech-provider.md`)
- [ ] Merchant's own WhatsApp number connected (Embedded Signup, ALY-39)
- [ ] Every account in `docs/access.md` has 2FA and an owner; renewal dates recorded
- [ ] Customer agreement and privacy notice published (PR #47; the privacy policy page is built, ALY-72, and waits for the founder's yes)

## Hosting and data
- [ ] Production hosting decided and running in Qatar (D-036 / PR #51, #52, ALY-63, ALY-10)
- [ ] `ALYR_ENV=production` set explicitly; the stand-in payment route, simulator and API docs answer 404
- [ ] Encrypted daily backups, and a restore rehearsed in the last 30 days, written up
- [ ] Secrets in the key vault, not in a file on a laptop
- [ ] `ALYR_LINK_SECRET` set (32 or more random characters; the API will not start without it outside `ALYR_ENV=local`). On the founder's laptop, set it in `apps/api/.env` before the tunnel serves customers: the built-in development value is public (ALY-112)
- [ ] `ALYR_PAYMENT_KEYS_KEY` set (32 random bytes, base64) before the first shop connects a real payment provider: without it connecting is refused outside `ALYR_ENV=local` (ALY-17, spec 033)
- [ ] Postgres not reachable from the internet; only the web app and webhook are public
- [ ] `docs/data-residency.md` reviewed against what really leaves Qatar

## Application
- [ ] Rate limits on sign-in codes, sign-up and public pages (ALY-116, built; the per-address part is on only once `ALYR_CLIENT_IP_HEADER` names where the visitor's address is read from, then run Check 5 of `cloudflare-neon-hosting.md`; add Cloudflare rules in front as the first layer)
- [ ] Staff roles: agents cannot change prices, services, hours or send bulk reminders (audit issue)
- [ ] Contact merge keeps consent records (audit issue)
- [x] Security headers on the web app (CSP, HSTS, frame-ancestors, nosniff) and an Origin check on signed-in changes (ALY-118); on the public site: `_headers` has HSTS, nosniff, frame-ancestors, base-uri, object-src; add Cloudflare's own rules in front
- [ ] Real payment provider connected, or stand-in payments switched off (ALY-17)
- [ ] Data retention and "forget this customer" procedure (audit issue)

## Running it
- [ ] Error tracking and uptime alerts reach the founder's phone (rows in stack.md and data-residency.md)
- [ ] `/health` checks the database and the job queue's age
- [ ] `docs/runbooks/incident-response.md` read; someone named is on call
- [ ] Production served by `next build && next start`, not the dev server
- [ ] Release tagged and CHANGELOG written
