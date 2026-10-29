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
- [ ] Encrypted daily backups, and a restore rehearsed in the last 30 days, written up
- [ ] Secrets in the key vault, not in a file on a laptop
- [ ] `ALYR_LINK_SECRET` set (32 or more random characters; the API will not start without it outside `ALYR_ENV=local`). On the founder's laptop, set it in `apps/api/.env` before the tunnel serves customers: the built-in development value is public (ALY-112)
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

## Opening self-serve sign-up (the order to do it in)

Self-serve sign-up is built for appointment businesses and, since 29 Oct 2026, for order businesses (restaurant, bakery, grocery, shop, fashion). It is closed: `ALYR_SIGNUP_OPEN` is off outside a local machine, and every business type is set up with ALYR until you switch it. Do these in order; the last one is the door.

- [ ] **Mail works in production.** The mail provider is set up (`ALYR_EMAIL_API_KEY`, ALY-74). Read one sign-in code email and one reminder email in a real inbox, in English and in Arabic: the reminder (ALY-171) has only been checked against a recording transport.
- [ ] **What happens when a client stops paying** (ALY-218, D-080). The worker runs the hourly plan check (`keep_billing_checked` in its log); `ALYR_BILLING_GRACE_DAYS` and `ALYR_BILLING_PAUSE_SENDING` set as the founder decided; every live client has a contact email in `/ops` (the reminders go there); a test client's plan shown in `/ops` with the right paid-through day.
- [ ] **Card payments for ALYR's own billing, if offered** (ALY-180, D-074). Sandbox first: the three Paddle values stored in Secret Manager (`paddle-api-key`, `paddle-webhook-secret`, `paddle-client-token`) and the switch `ALYR_CARD_BILLING` set to `paddle`; then a test card payment from a test client recorded in `/ops`, then a renewal (Paddle's sandbox can bill the subscription early). Live only after Paddle approves `app.alyr.qa`, the terms, privacy and refund pages are public and the customer agreement is signed off (ALY-98): new live keys stored the same way, the setting `ALYR_PADDLE_ENVIRONMENT` changed to `live`, and the notification destination pointed at `https://api.alyr.qa/api/billing/paddle/webhook`.
- [ ] **The worker is running** (`python -m alyr.worker`, with `ALYR_JOBS_INLINE=false`). It sends the reminder emails (every hour), the weekly reports and gives back the stock of unpaid orders.
- [ ] **The visitor's address is read from the right place.** `ALYR_CLIENT_IP_HEADER` (and `ALYR_CLIENT_IP_PROXIES` if more than one proxy is in front) names the header the real address arrives in. Until it does, only the per-email limits on codes and sign-ups are on (ALY-116), and the address stored with each terms acceptance is the proxy's.
- [ ] **Terms.** The privacy notice (version `2026-10-28`) is the only version published, so owners accept that today. When the lawyer's customer agreement is final (ALY-98, ALY-51), put it on a page and publish it from `/ops` → Terms: it asks every owner once. Decide whether an owner who will not accept is blocked (today they are asked, not blocked).
- [ ] **Money.** Nothing is paid first (D-053). The setup fee for a self-serve client and when the first charge is taken wait for the bank and payment side: decide before opening to the public, because the plan and go-live lines say what will be charged.
- [ ] **WhatsApp.** A self-serve owner chooses how to connect (ALY-217) and ALYR attaches the number from `/ops` (ALY-166) until Embedded Signup (ALY-39) and Meta Tech Provider approval (ALY-52). Say in your first message to an owner what happens to their number and how long it takes.
- [ ] **Arabic read by a native speaker** (ALY-66): the owner screens, the terms banner and the reminder email.
- [ ] **Switch one type.** `/ops` → Sign-up: set one business type to self-serve (the bakery is the recommended first, ALY-164); the others stay with ALYR. Add the rest one at a time.
- [ ] **Do it once yourself.** Sign up with a real email, finish the test (an order, or a booking), read the Orders list (the test order is marked Test), open the workspace, and use the link at the foot of a reminder to switch reminders off. Check `/ops` → Onboarding shows you in the funnel.
- [ ] **Open the door.** Set `ALYR_SIGNUP_OPEN=true` last. Watch `/ops` → Onboarding for the first week: where people stop, and how many reminder emails brought someone back.
