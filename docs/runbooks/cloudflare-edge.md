# Cloudflare edge and DNS for alyr.qa

Written 30 Oct 2026 (ALY-116 first layer, ALY-219, ALY-224, and the Cloudflare items CLD-7 and CLD-18 of the
go-live audit ALY-266; D-113). What the zone was set to before today, what was changed and how to put each
change back, what is prepared but not applied, and what only the founder can do. Everything here was read or
changed on 30 Oct 2026 unless it says otherwise; check again before relying on a number.

Every name below (`app`, `api`, `media`, `www`) is in the zone `alyr.qa` of the business Cloudflare account
(`Akmal@alyr.qa's Account`), on the **Free** plan.

## How it was done, and where the snapshot is

- The changes were made in the business account's dashboard session in the founder's Chrome (account name read on
  the dashboard first). **No API token was created or used.** The business `wrangler` login can read the zone list,
  Email Routing and the Workers domains, but its scopes do not reach DNS, zone settings or rules, so it was used for
  reads only.
- The rule definitions that were applied or are waiting are in `infra/cloudflare/zone/`.
- **Before anything changed**, everything below was saved on the laptop, outside the repository:
  `C:\Users\akmal\alyr-cf-snapshots\2026-10-30\` (`dns-records-before_alyr.qa.json`,
  `zone-settings-before_alyr.qa.txt`, `dns-records-before_alyr.online.json`, `public/` with the DNS answers and the response headers). It holds no secret.
- `infra/cloudflare/edge` (the Worker `alyr-edge`) was not touched. The Worker was redeployed by the ALY-265 rollout during this work (version `c8630fa9`, previous `5421040a`); `scripts/check-edge.sh` passed before and after.
- To check the live state from any network at any time: `scripts/check-edge.sh` (curl only; changes nothing).

## 1. The audit: before, and now

### Transport and certificates

| Item | Before | Now | Note |
|---|---|---|---|
| SSL/TLS mode | Full | **Full (strict)** | Every proxied name is a Worker custom domain or the R2 domain: no proxied record points at an outside server, so strict changes nothing for visitors |
| Minimum TLS version | 1.0 (TLS 1.0 and 1.1 accepted on `alyr.qa`, `app`, `api`) | **1.2** | CLD-7. `media` already refused 1.0 and 1.1 |
| TLS 1.3, HTTP/3, ECH, post-quantum key exchange | on | on | Unchanged |
| Always Use HTTPS | off: `http://app.alyr.qa/login` and `http://api.alyr.qa/health/ready` answered 200 | **on**: 301 to HTTPS on every name | CLD-7. `alyr.qa` and `www` were already redirected by the site Worker |
| HSTS (the zone setting) | off | off, on purpose | The web app, the site and now the API and the media host send their own (see headers). A zone-wide HSTS would overwrite the site's one-year header with whatever is chosen here |
| Certificates | Universal (Let's Encrypt) for `alyr.qa` and `*.alyr.qa`; Google Trust Services certificates for `alyr.qa`, `www`, `app`, `api` (Cloudflare made them for the Worker custom domains); `media` has its own | Unchanged | They run to 26 and 27 Jan 2027 |
| CAA | none | **issue and issuewild for `letsencrypt.org`, `pki.goog` and `ssl.com`, and an `iodef` to `akmal@alyr.qa`** | CLD-18. Cloudflare adds `digicert.com` and `comodoca.com` itself as hidden records (its documentation says it does this once a zone has any CAA record); `dig alyr.qa CAA` shows all of them |
| DNSSEC | off | off | `.qa` is not signed: the root zone has no DS record for it (an authenticated "no such record", checked 30 Oct), so a DS at the registry for `alyr.qa` would have nothing to chain to. Nothing to do at the registrar |

### Filtering

| Item | Before | Now | Note |
|---|---|---|---|
| Cloudflare Free Managed Ruleset | "Always active" in the dashboard (Security, Settings), cannot be switched | Same | The full Cloudflare Managed Ruleset and the OWASP ruleset need the Pro plan |
| Custom WAF rules | none | none | None needed yet: unknown paths already answer 404 |
| Rate limiting rules | none | **one rule, live since 30 Oct** (step 9) | Free allows one rule, counted over 10 seconds, and **only the Block action** (Cloudflare refused `log` and `managed_challenge` with "not entitled"), so there was no gentler start; it went live with the founder's yes |
| Bot Fight Mode, Super Bot Fight Mode | off | off, on purpose | Bot Fight Mode cannot be skipped for a path with a WAF rule and may challenge API calls (Cloudflare's documentation); a webhook from Meta or Paddle is such a call |
| Security level, Browser Integrity Check, challenge lifetime | medium, on, 30 min | Same | |
| Page rules, IP access rules, cache rules, configuration rules | none | none | |
| Response header Transform Rules | none | **3 rules** (below) | |

### Web Analytics (seen 30 Oct 2026, read only, not changed)

| Item | State |
|---|---|
| Setting | **On, with automatic setup.** One Web Analytics site, `alyr.qa`, made on 28 Oct 2026, covers the whole zone (the zone setting `rum` reads `on` and is editable). The dashboard showed 19 page views and 17 visits in the last 24 hours |
| What it does | Cloudflare adds a `<script src="https://static.cloudflareinsights.com/beacon.min.js/...">` tag to HTML pages, only for a browser's request (`curl` sees no tag) |
| On `alyr.qa` | The script loads (200) and reports to `/cdn-cgi/rum` (204): the site's policy has no `script-src`, so nothing stops it |
| On `app.alyr.qa` | The tag is injected but the app's policy (`script-src 'self' 'unsafe-inline'`) blocks the request (status 0, no bytes), so the browser logs a policy error on every page |
| Documented | Not in `docs/stack.md` or `docs/data-residency.md` |
| To turn it off (not done: the founder decides) | Dashboard, Observability, Analytics, Web analytics, the site `alyr.qa`, Manage site: switch off Automatic setup, or delete the site (the page shows "Manage site" and a ticked "Automatic setup"; the switch itself was not opened). By API: set the zone setting `rum` to `off`. Either removes the script and the console error; the same switch puts it back |
| To keep it | Add a row to `docs/stack.md` and `docs/data-residency.md`, and leave the app's policy as it is: customer links carry a token in the address (`?t=`) and the policy keeps the beacon away from those pages (whether the beacon sends the query string was not checked). The product has its own analytics already (D-070), so the page-speed counter is not needed for it |

### Security headers a visitor gets

| Host | Before | Now |
|---|---|---|
| `alyr.qa` (site Worker) | HSTS one year, CSP `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy | Same |
| `app.alyr.qa` (Next.js) | The same set, with a full CSP; also `x-powered-by: Next.js` | Same, **without `x-powered-by`** |
| `api.alyr.qa` | **none** (SEC-11, CLD-7) | **HSTS one year, nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer** |
| `media.alyr.qa` | **none** | **HSTS one year, nosniff** |

`app.alyr.qa/api/*` (Next's forwarding to the API) still carries none of these. It is JSON for the app's own pages,
so it was left; adding them there is a product change in `apps/web/next.config.ts`.

### Access and the back office

| Item | State |
|---|---|
| Cloudflare Access | **Not enabled.** The account has never been onboarded to Zero Trust (the API answers "Access is not enabled") |
| `ops.alyr.qa` | **Does not exist** in DNS or in any Worker. ALY-219's plan is not built yet |
| The back office today | `/ops` on `app.alyr.qa` answers **200** (the ALY-219 text says 404). It is the back office's sign-in page; the staff sign-in and the database roles are what protect it (ALY-125) |

### Email authentication

| Item | Before | Now | Note |
|---|---|---|---|
| MX | Zoho (`mx`, `mx2`, `mx3`, 10, 20, 50) | Same | Not to be changed |
| SPF on `alyr.qa` | `v=spf1 include:_spf.mx.cloudflare.net include:zohomail.com ~all` | **`v=spf1 include:zohomail.com ~all`** | CLD-18. The Cloudflare include was Email Routing's, which is not set up (no rules, no addresses) and whose MX are gone. Two lookups, well under ten |
| Resend (every product email, `no-reply@alyr.qa`) | Domain verified in Resend: DKIM `resend._domainkey`, SPF and MX on `send`, CNAME `rsend` | Same | From the records Resend lists: a message is signed `d=alyr.qa` with its return path on `send.alyr.qa`, so both align with `alyr.qa` (no message was opened to see it) |
| Zoho Mail (the people's mailboxes) | DKIM `zmail._domainkey`; SPF through the include | Same | |
| Email Routing's leftover key `cf2024-1._domainkey` | present | present | Harmless; it can be deleted whenever |
| DMARC | `v=DMARC1; p=none; rua=mailto:akmal@alyr.qa` | Same | Already what was wanted. Not `reject`. Review date below |
| MTA-STS, TLS-RPT | none | none | Skipped: MTA-STS needs a policy file served from `mta-sts.alyr.qa` (a new Worker) and gives little with one mail provider. Revisit with the first clients |
| `alyr.online` (no mail is sent from it) | no SPF, no DMARC, no CAA, so it could be spoofed | **SPF `v=spf1 -all` and DMARC `v=DMARC1; p=quarantine;`** | CLD-18. Done after the founder's yes on 30 Oct (the audit suggests `p=reject`; `quarantine` was chosen, section 2). It has no MX, Email Routing is not set up on it, and Resend has only `alyr.qa` verified |

## 2. What was changed, in order, and how to put each back

Each step was one change, then a check from outside before the next. Steps 1 to 6 are on `alyr.qa`; steps 7 and 8 are on
the second zone, `alyr.online`, and were made after the founder said yes to that domain by name (30 Oct, relayed by the
session that runs the rollout). Step 9 is on `alyr.qa` again and was made after the founder's yes to the rate-limit rule
(same day, same way). The last full run of `scripts/check-edge.sh` is after step 9.

| # | Change | Before | After | Verified | Undo |
|---|---|---|---|---|---|
| 1 | SSL/TLS mode | Full | Full (strict) | Site, sign-in, API, webhooks unchanged | Dashboard, SSL/TLS, Overview, choose Full |
| 2 | Minimum TLS | 1.0 | 1.2 | `openssl s_client -tls1` and `-tls1_1` refused on all four names (it took about a minute to reach every edge machine); TLS 1.2 and 1.3 work; pages unchanged | SSL/TLS, Edge Certificates, Minimum TLS Version, 1.0 |
| 3 | Always Use HTTPS | off | on | Every `http://` address answers 301 to its `https://` twin; the webhook, sign-in and API checks still pass | SSL/TLS, Edge Certificates, Always Use HTTPS, off |
| 4 | CAA (7 records on `alyr.qa`, comment starts `ALY-116 CAA`) | none | `letsencrypt.org`, `pki.goog; cansignhttpexchanges=yes`, `ssl.com` (issue and issuewild), `iodef` | Seen in public DNS (Cloudflare's and Google's); the served certificates and their expiry unchanged | DNS, Records, delete the seven CAA records; Cloudflare's hidden ones should go with them (check with `dig alyr.qa CAA`) |
| 5 | SPF on `alyr.qa` | `v=spf1 include:_spf.mx.cloudflare.net include:zohomail.com ~all` | `v=spf1 include:zohomail.com ~all` | The zone's own nameserver and public DNS answer the new value; MX, DKIM and DMARC unchanged | Edit the apex TXT back to the "before" text |
| 6 | Response header Transform Rules (`infra/cloudflare/zone/response-header-rules.json`) | none | API and media get the headers above; `x-powered-by` removed on `app` | Headers read on every host; webhook, sign-in code, sign-up code and Paddle paths still answered by the API | Rules, Transform Rules, Modify Response Header: disable or delete the three rules |
| 7 | SPF on `alyr.online` (a new TXT record, comment `CLD-18 30 Oct 2026: ...`) | none | `v=spf1 -all` (no sender is allowed) | The zone's own nameserver and Google's resolver answer it; `https://alyr.online/` and `www` still 301 to `alyr.qa` | DNS, Records, delete that TXT record |
| 8 | DMARC on `alyr.online` (`_dmarc` TXT) | none | `v=DMARC1; p=quarantine;` (no `rua`: a report address on another domain needs an authorisation record, and there is nothing to report) | The same | DNS, Records, delete that TXT record |
| 9 | Edge rate-limit rule "ALY-116 first layer" (`infra/cloudflare/zone/rate-limit-rule.json`, details below) | none: the `http_ratelimit` phase had no entrypoint | **Block**: 30 requests per 10 seconds per address and data centre on the paths below; the answer is 429 with a JSON message for 10 seconds | A burst of 40 empty POSTs to the sign-in code path: 30 answered 422 and 10 answered 429; one request right after: 429; a single request passed again about 11 seconds later. Outside the rule: 40 GETs to `/health/ready` all 200, 40 POSTs to the WhatsApp webhook all reached the API (401) | Delete the rule (Security, Security rules), or PUT `{"rules":[]}` to the `http_ratelimit` entrypoint |

**Checked after the nine changes** (`scripts/check-edge.sh`, 30 Oct 2026, 43 checks, all passing, run again after step 9): HTTPS redirects, site, sign-in page and
`/health/ready` answer; an empty POST to the WhatsApp webhook, a wrong verify token and an unsigned Paddle post are
each refused **by the API** (`bad signature`, `verification failed`, `not signed by Paddle`), so Cloudflare lets
them through; the sign-in code route answers 422 to an empty body (no email sent); the headers above; TLS 1.0 and
1.1 refused and 1.2 accepted; CAA, SPF, DKIM, MX and DMARC as in the table.

**The rate-limit rule in detail (step 9).** Applied on 30 Oct 2026 in the business dashboard (the Chrome profile
named "work"), after the founder's yes, relayed by the session that runs the rollout.

- **Expression** (paths only: Cloudflare's documentation lists only the URI path and "verified bot" as fields on Free):
  `(http.request.uri.path in {"/api/auth/code" "/api/auth/verify" "/api/onboarding/code" "/api/onboarding/verify" "/api/onboarding/business" "/api/onboarding/resume/stop" "/api/account/email/code"}) or (starts_with(http.request.uri.path, "/api/store/") and (ends_with(http.request.uri.path, "/orders") or ends_with(http.request.uri.path, "/orders/repeat")))`
- **Counting and action:** per address and data centre (Cloudflare requires `cf.colo.id` in the count), 30 requests in 10
  seconds, then Block for 10 seconds, answered `429` as `application/json` with
  `{"detail":"Too many requests. Please wait a few seconds and try again."}` (Cloudflare accepted the custom answer on Free).
- **Why 30:** it is a coarse flood guard above the API's own per-address limits, which are on since the Worker rollout
  (ALY-265: 20 sign-in or sign-up codes, 30 code guesses and 10 sign-ups an hour, 30 orders or bookings in 10 minutes,
  per address). In the 24 hours before, each of these paths saw one or two POSTs (founder tests); the largest POST burst
  in the whole zone was 45 in a minute (about 7 in 10 seconds), all scanners posting to `/signup`, `/login`, `/signin`,
  `/register` and `/api/auth/signin` on the static site, which already answers 403.
- **Why Block and not log or challenge first:** the Free plan offers only Block for rate limiting, so there was no gentler
  start. The number is high and the block is 10 seconds, so a wrong block costs a customer ten seconds.
- **Booking is not covered:** `/api/book/<slug>`'s POST and GET share one path and the method cannot be told apart on Free;
  a booking page opened by many people behind one shared address (a mall's wifi, a mobile carrier) could trip a limit set
  for POSTs. The app's own booking limit covers it.
- **Who it could catch:** a person (or a shop's whole office on one address) would need to post to these paths more than
  three times a second. Nobody real has been seen to; the rule has not yet met a busy day.
- **To watch it:** Security, Events, filter by the rule's action; see "Dates".

**Not proven:** a real WhatsApp message and a real sign-in code email (no message was sent for this work); that
no webhook is registered with a plain `http://` address at Meta or Paddle (neither dashboard was opened; such a
caller would now be redirected instead of answered); a
certificate renewal under the new CAA records (the first renewals start about a month before 26 Jan 2027, see
"Dates"); a visitor on a device that speaks only TLS 1.1 or older (it now cannot connect, as intended); the rate-limit rule on a busy day with real customers behind shared addresses.

## 3. Prepared, not applied

| What | Why not applied | What is needed |
|---|---|---|
| **Access for the back office** (ALY-219) | Needs four things this work cannot do: the Zero Trust account (below), a new name `ops.alyr.qa` on the Worker `alyr-edge` (the Worker was off limits for this work), the web app serving the console on that name and answering 404 for `/ops` on `app` (product), and the API checking the `Cf-Access-Jwt-Assertion` header. Without that last part Access is only a front door: the API's public `run.app` address skips Cloudflare entirely (CLD-3) | See "Needs the founder", item 3 |
| **HSTS with `includeSubDomains`** on `alyr.qa` (CLD-7's last point) | Every web name is HTTPS today, but it commits every future subdomain for a year | A yes, then one Transform Rule on the apex; preload is a separate, near-permanent step |

## 4. Needs the founder

1. ~~Say whether to apply the rate-limit rule~~ **Done 30 Oct** (the founder said yes; step 9). The item stays so the numbers below do not move. Whether to pay for log and challenge modes is still open, and not urgent.
2. ~~A yes that names `alyr.online`~~ **Done 30 Oct** (the founder said yes by name; steps 7 and 8). The item stays so the numbers below do not move.
3. **Zero Trust (Cloudflare Access).** The founder onboards the account: Cloudflare One, Get started, a team name, the Free plan. **Cloudflare asks for payment details even for the Free plan (nothing is charged)**, which an agent must not enter. After that, an Access application for the back office with the sign-in method "one-time PIN to `akmal@alyr.qa`", and the three code changes of section 3. Decide whether the console moves to `ops.alyr.qa` (ALY-219) or stays on a path of `app.alyr.qa` behind Access.
4. **The tunnel `alyr-dev`** (CLD-18) is not in the business account (it has none), so it is in the personal one: the founder deletes it there (`cloudflared tunnel delete alyr-dev`, signed in to that account) and removes its credentials file under `~/.cloudflared`. An agent must not act in the personal account.
5. **Look for the first DMARC report** (an XML attachment from Google, Microsoft or Zoho) in `akmal@alyr.qa` within two days; if none comes, the mailbox or the record is wrong.
6. **If these changes are to be scripted later**, a token for the zone `alyr.qa` only, made by the founder, with: Zone / Zone Settings / Edit, Zone / DNS / Edit, Zone / Transform Rules / Edit, Zone / Zone WAF / Edit (rate limiting), Zone / SSL and Certificates / Read. Access needs Account / Access: Apps and Policies / Edit as well, added when Zero Trust exists. Record it in `docs/access.md` and `secret-rotation.md` when it is made.

## 5. Dates

| Date | What |
|---|---|
| **6 Nov 2026** | A week of the rate-limit rule: open Security, Events and look at what the rule blocked (an answer `429` with the JSON message). If a real customer was blocked, raise the number or take the rule off (step 9's undo); if nothing real was, leave it |
| **13 Nov 2026** | Read two weeks of DMARC reports. If Resend and Zoho Mail both pass and nothing unknown sends as `alyr.qa`, change `_dmarc.alyr.qa` to `p=quarantine` (keep the `rua`). `reject` is not planned |
| **27 Dec 2026** | Cloudflare starts renewing the certificates (they end 26 and 27 Jan 2027). Afterwards open SSL/TLS, Edge Certificates (all "Active") and run `scripts/check-edge.sh`. If a renewal failed, delete the CAA records first (change 4), then ask Cloudflare to retry |
| Each quarter | `dig DS qa. +dnssec`: if the registry signs `.qa`, turn DNSSEC on (the DS record at the registry is the founder's) |

## 6. Seen in passing, not part of this work

- `https://app.alyr.qa/ops` answers 200 and `ALY-219` says 404: product should confirm which is meant.
- Cloudflare's own traffic shows scanners posting to `/signup`, `/login`, `/signin`, `/register` and `/api/auth/signin` on `alyr.qa` all day. They get 403 from the site; nothing to do.
- Cloudflare itself refuses a request that carries a written `CF-Connecting-IP` header: 403, error code 1000, before the Worker runs (told by the ALY-265 rollout and tried again on 30 Oct with `curl -H 'CF-Connecting-IP: 198.51.100.7' https://api.alyr.qa/health/ready`). So the address the Worker signs cannot be written by a visitor.
- The Worker `alyr-edge` still sets `X-Forwarded-Proto: https` on plain requests (CLD-7). Always Use HTTPS now redirects before the Worker runs, so it no longer matters.
