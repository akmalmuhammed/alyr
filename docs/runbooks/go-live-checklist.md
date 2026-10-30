# Go-live checklist

Every box is ticked, with the PR or issue that ticks it, before the first real merchant's
customers use ALYR. From the 17 Oct 2026 audit (`docs/audit/2026-10-17.md`).

## Company and accounts
- [x] Commercial registration issued (CR 255539, 26 Oct 2026; application SR3044041) and Meta business verification done (28 Oct 2026; `docs/runbooks/meta-tech-provider.md`)
- [ ] Merchant's own WhatsApp number connected (Embedded Signup, ALY-39)
- [ ] Every account in `docs/access.md` has 2FA and an owner; renewal dates recorded
- [ ] Customer agreement and privacy notice published (PR #47; the privacy policy is published at https://alyr.qa/privacy, ALY-68; terms are not)

## Hosting and data
- [ ] Production hosting decided and running in Qatar (D-036 / PR #51, #52, ALY-63, ALY-10)
- [ ] `ALYR_ENV=production` set explicitly; the stand-in payment route, simulator and API docs answer 404
- [x] Encrypted daily backups, and a restore rehearsed in the last 30 days, written up: a point-in-time clone (`docs/audit/restore-2026-10-30.md`) and a nightly backup restored into a fresh instance (`docs/audit/hardening-2026-10-30.md`, ALY-34), both 30 Oct 2026; repeat both if go-live is after 29 Nov
- [ ] A restore from the nightly **export** has been tested on production data, and then `infra/gcp/setup.sh lock-backups` run (the 27 Oct test used the demo shop; steps in `hardening-2026-10-30.md`)
- [ ] Secrets in the key vault, not in a file on a laptop (production is all Secret Manager, in Doha, with no secret kept as a plain setting; the laptop's `.env` still holds the development-era copies of the Meta, Resend and R2 values, none rotated since go-live: `secret-rotation.md`, "Where production stands")
- [ ] `ALYR_LINK_SECRET` set (32 or more random characters; the API will not start without it outside `ALYR_ENV=local`). On the founder's laptop, set it in `apps/api/.env` before the tunnel serves customers: the built-in development value is public (ALY-112)
- [ ] `ALYR_PAYMENT_KEYS_KEY` set (32 random bytes, base64) before the first shop connects a real payment provider: without it connecting is refused outside `ALYR_ENV=local` (ALY-17, spec 033)
- [ ] Postgres not reachable from the internet; only the web app and webhook are public
- [ ] `docs/data-residency.md` reviewed against what really leaves Qatar

## Releases (ALY-269; `docs/runbooks/release.md`, `docs/runbooks/rollback.md`)
- [ ] The founder is the required reviewer on the `production` environment, which only `main` can use, and administrators cannot bypass it
- [ ] `main` is protected and requires the `ci` jobs; merged branches delete themselves; secret scanning and push protection are on
- [ ] The Cloudflare token and account ID are environment secrets (`production`, and a narrower token in `preview`), the repository copies are deleted and the old token is rolled
- [ ] One release has run end to end through `deploy-gcp` (gate, approval, deploy, health checks, tag `v0.x.y`) and the CHANGELOG has a cut section
- [ ] A rollback by traffic split has been rehearsed on the API, the web app and the worker, and a deploy afterwards served the new revision (`rollback.md`, "Rehearsal")

## Application
- [ ] Rate limits on sign-in codes, sign-up and public pages (ALY-116, built; the per-address part is on only once the edge signs the visitor's address and the API is told to read it: ALY-265, steps and check in `client-address.md`; Cloudflare in front: HTTPS only, TLS 1.2 and header rules are live since 30 Oct, the rate-limit rule is prepared and waits for a yes: `cloudflare-edge.md`)
- [ ] Staff roles: agents cannot change prices, services, hours or send bulk reminders (audit issue)
- [ ] Contact merge keeps consent records (audit issue)
- [x] Security headers on the web app (CSP, HSTS, frame-ancestors, nosniff) and an Origin check on signed-in changes (ALY-118); on the public site: `_headers` has HSTS, nosniff, frame-ancestors, base-uri, object-src; Cloudflare's header rules for `api` and `media` are live (`cloudflare-edge.md`)
- [ ] Real payment provider connected, or stand-in payments switched off (ALY-17)
- [ ] Data retention and "forget this customer" procedure: a customer's download and forgetting, and the purge of working copies, are shipped (D-075, ALY-119); **still open: deleting a business's data 60 days after it stops, which the privacy notice promises** (SEC-6, LEG-1; it needs a way for a business to stop, go-live item 39). Backups age out as promised: 14 nightly, 7 days of logs, exports 35 days; on-demand backups only when someone deletes them (`hosting.md`)

## Running it
- [ ] Error tracking and uptime alerts reach the founder's phone (rows in stack.md and data-residency.md). Built 30 Oct (ALY-277): every alert goes to every channel; the founder adds the phone (`infra/gcp/README.md`, 8b) and confirms `infra/gcp/monitoring.sh test-fire` reached it
- [ ] `/health` checks the database and the job queue's age
- [ ] A status page that merchants can open (a plan, not built: `docs/runbooks/status-page.md`; needs the founder's yes)
- [ ] `docs/runbooks/incident-response.md` read; someone named is on call (the runbook is rewritten for Google Cloud; the on-call name, phone and hours are a blank for the founder to fill in at its top)
- [ ] Production served by `next build && next start`, not the dev server
- [ ] Release tagged and CHANGELOG written

## Opening self-serve sign-up (the order to do it in)

Self-serve sign-up is built for appointment businesses and, since 29 Oct 2026, for order businesses (restaurant, bakery, grocery, shop, fashion). It is closed: `ALYR_SIGNUP_OPEN` is off outside a local machine, and every business type is set up with ALYR until you switch it. Do these in order; the last one is the door.

- [ ] **Mail works in production.** The mail provider is set up (`ALYR_EMAIL_API_KEY`, ALY-74). Read one sign-in code email and one reminder email in a real inbox, in English and in Arabic: the reminder (ALY-171) has only been checked against a recording transport.
- [ ] **What happens when a client stops paying** (ALY-218, D-082). The worker runs the hourly plan check (`keep_billing_checked` in its log); `ALYR_BILLING_GRACE_DAYS` and `ALYR_BILLING_PAUSE_SENDING` set as the founder decided; every live client has a contact email in `/ops` (the reminders go there); a test client's plan shown in `/ops` with the right paid-through day.
- [ ] **Card payments for ALYR's own billing, if offered** (ALY-180, D-074). Sandbox first: the three Paddle values stored in Secret Manager (`paddle-api-key`, `paddle-webhook-secret`, `paddle-client-token`) and the switch `ALYR_CARD_BILLING` set to `paddle`; then a test card payment from a test client recorded in `/ops`, then a renewal (Paddle's sandbox can bill the subscription early). Live only after Paddle approves `app.alyr.qa`, the terms, privacy and refund pages are public and the customer agreement is signed off (ALY-98): new live keys stored the same way, the setting `ALYR_PADDLE_ENVIRONMENT` changed to `live`, and the notification destination pointed at `https://api.alyr.qa/api/billing/paddle/webhook`.
- [ ] **The worker is running** (`python -m alyr.worker`, with `ALYR_JOBS_INLINE=false`). It sends the reminder emails (every hour), the weekly reports and gives back the stock of unpaid orders.
- [ ] **The visitor's address is read from the right place.** `ALYR_CLIENT_IP_HEADER` (and `ALYR_CLIENT_IP_PROXIES` if more than one proxy is in front) names the header the real address arrives in. Until it does, only the per-email limits on codes and sign-ups are on (ALY-116), and the address stored with each terms acceptance is the proxy's.
- [ ] **Terms.** The privacy notice (version `2026-10-28`) is the only version published, so owners accept that today. When the lawyer's customer agreement is final (ALY-98, ALY-51), put it on a page and publish it from `/ops` → Terms: it asks every owner once. Decide whether an owner who will not accept is blocked (today they are asked, not blocked).
- [ ] **Money.** Nothing is paid first (D-053). There is no setup fee for now (D-092): a client pays the first month at go-live. When that first charge is taken waits for the bank and payment side: decide before opening to the public, because the plan and go-live lines say what will be charged.
- [ ] **WhatsApp.** A self-serve owner chooses how to connect (ALY-217) and ALYR attaches the number from `/ops` (ALY-166) until Embedded Signup (ALY-39) and Meta Tech Provider approval (ALY-52). Say in your first message to an owner what happens to their number and how long it takes.
- [ ] **Arabic read by a native speaker** (ALY-66): the owner screens, the terms banner and the reminder email.
- [ ] **Switch one type.** `/ops` → Sign-up: set one business type to self-serve (the bakery is the recommended first, ALY-164); the others stay with ALYR. Add the rest one at a time.
- [ ] **Do it once yourself.** Sign up with a real email, finish the test (an order, or a booking), read the Orders list (the test order is marked Test), open the workspace, and use the link at the foot of a reminder to switch reminders off. Check `/ops` → Onboarding shows you in the funnel.
- [ ] **Open the door.** Set `ALYR_SIGNUP_OPEN=true` last. Watch `/ops` → Onboarding for the first week: where people stop, and how many reminder emails brought someone back.
