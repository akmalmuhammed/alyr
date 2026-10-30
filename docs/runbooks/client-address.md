# The visitor's address: how the per-address limits know who is asking

Written 29 Oct 2026 (ALY-265, D-083, on top of ALY-116). The sign-in, sign-up, order and
booking doors count how often one address knocks (`apps/api/src/alyr/core/ratelimit.py`). This
page says how the API learns that address in production on Google Cloud, how to turn it on, how to
check it and how to turn it off again. Until it is turned on, the API logs "per-address rate
limits are off" at start-up and only the per-email limits work.

## What it does

```
visitor -> Cloudflare (alyr-edge Worker) -> alyr-web (Cloud Run) --/api/*--> alyr-api (Cloud Run)
                    \--------------------------- api.alyr.qa ---------------------------->/
```

- The Worker takes the address from `CF-Connecting-IP`, which Cloudflare sets and a visitor
  cannot, writes it in `x-alyr-client-ip`, and signs it in `x-alyr-client-ip-sig` (HMAC-SHA256
  of the address, with a key only the Worker and the API hold). Anything a visitor sent in those
  headers, or in `X-Forwarded-For` or `X-Real-IP`, is thrown away first.
- The web app passes both headers on. The browser's `/api/*` calls go through Next's rewrite,
  which carries every request header (tried by hand on 29 Oct, and checked on every release by
  `scripts/check-client-address.sh`). The calls the web app's server makes itself (the order
  page's link preview and first page of items) copy the two headers from the request they answer
  (`apps/web/app/(product)/_customer/order/serverApi.ts`, with a test that fails if a new
  server-side caller forgets to).
- The API (`ALYR_CLIENT_IP_HEADER=x-alyr-client-ip`, `ALYR_CLIENT_IP_KEYS`) believes the address
  only with a signature that matches. Every other request is counted in **one shared bucket
  called `unvouched`**.

**Why a signature and not just the header.** The `run.app` addresses of `alyr-api` and
`alyr-web` are public. Anyone who skips Cloudflare could write any address in a plain header:
a fresh allowance on every request for themselves, or somebody else's address to lock that
person out. With the signature they can do neither: they cannot make one, and the shared bucket
means a caller who skips the edge is only ever counted with other callers who skip the edge. No
visitor who comes through the edge is held up by them.

**Why not read Google's `X-Forwarded-For`.** Google does not document how Cloud Run builds that
header (Cloud Run's contract page and the Functions headers page say nothing of who may write
it), so which entry is the visitor's cannot be relied on, and it moves with every hop (Cloudflare,
web app, API). The API also runs `uvicorn --forwarded-allow-ips '*'`, which makes `request.client`
the first `X-Forwarded-For` entry, that is, whatever the caller wrote (shown by running uvicorn
0.54 on 29 Oct). So the connection's address is never used once a header is named.

**What stays as it is.** The per-email limits (five codes an hour for one email, known or not)
do not depend on any of this and are the last line of defence.

## Settings

| Where | Name | Value |
|---|---|---|
| Secret Manager (Doha) | `client-ip-key` | 64 hex characters, made by `setup.sh client-ip-key`, never shown. After a rotation `new,old` |
| `alyr-api` (Cloud Run service) | `ALYR_CLIENT_IP_KEYS` | that secret, `client-ip-key:latest` |
| `alyr-api` | `ALYR_CLIENT_IP_HEADER` | `x-alyr-client-ip` |
| Cloudflare Worker `alyr-edge` | secret `CLIENT_IP_KEY` | the first key in `client-ip-key` |

The worker pool (`alyr-worker`) and `alyr-web` take none of these. Without `ALYR_CLIENT_IP_KEYS`
the API believes the named header as it stands (the way the old interim Cloudflare host ran,
where nothing but its own Worker could reach the API) and says so in the log at start-up. Never
leave it that way on Google Cloud.

## Turn it on (the founder approves each step; the order matters)

Run from a clean worktree on the current `origin/main`, after the pull request is merged and CI
is green. Until step 5, nothing a visitor meets changes.

1. **Ship the code, settings untouched.** `gh workflow run deploy-gcp.yml --ref main -f deploy=true`
   (builds both images, migrates (nothing new), updates `alyr-api`, `alyr-worker`, `alyr-web`; every
   setting stays). Check: `https://api.alyr.qa/health/ready`, `/health/worker` and
   `https://app.alyr.qa/login` answer 200, and
   `curl https://api.alyr.qa/api/client-address` answers `"source":"connection","counting":false`
   (it was a 404 before). Sign in at `https://app.alyr.qa/login` once.
2. **Make the key.** `infra/gcp/setup.sh client-ip-key`. A new secret in Secret Manager; nothing
   reads it yet.
3. **Give the Worker the key** (a secret only; the Worker's code does not change yet). In
   `infra/cloudflare/edge`: `pnpm install --frozen-lockfile`. Then, logged in to the **business**
   Cloudflare account (`XDG_CONFIG_HOME=C:/Users/akmal/.alyr-cf-business` and
   `CLOUDFLARE_ACCOUNT_ID=8852de0ff6f1f438c19b25a9920a40a1`; `pnpm exec wrangler whoami` must name
   `Akmal@alyr.qa's Account`): `infra/gcp/setup.sh edge-key`. Never use the personal login here.
4. **Deploy the Worker.** In `infra/cloudflare/edge`, with the same two environment variables:
   `pnpm exec wrangler deploy`.
   From now on every request reaching Cloud Run carries the two headers; the API still ignores
   them. Check: `https://api.alyr.qa/health/ready` and `https://app.alyr.qa/login` answer 200, and
   a "hello" to the WhatsApp number is answered (the Worker carries Meta's webhook).
5. **Turn the API on.** `infra/gcp/setup.sh client-ip-on`: one new revision with
   `ALYR_CLIENT_IP_HEADER` and `ALYR_CLIENT_IP_KEYS` together. Check, at once:
   `scripts/check-client-address.sh` (all PASS), then again on a phone using mobile data (the
   first line, your address, must differ), then sign in at `https://app.alyr.qa/login` with a real
   code. In Logs Explorer (project `alyr-prod`, service `alyr-api`) the new revision must not say
   "per-address rate limits are off" and must not say "client address refused" while you use the
   site.

A full deploy by hand (`infra/gcp/setup.sh apps <tag>`) replaces every setting; it asks the
live API first and keeps these two. The GitHub deploy only changes images.

## If a check fails

- **`"source":"connection"` or `"counting":false`.** The two settings are not on the API: run
  step 5 again, or `gcloud.cmd run services describe alyr-api --region me-central1 --project
  alyr-prod` and look for the two names.
- **`could not read your address from .../cdn-cgi/trace`.** `api.alyr.qa` is not answering at
  all. That is not this change: look at the Worker (`pnpm exec wrangler deployments list`) and
  `incident-response.md`.
- **`"source":"unvouched"` through `api.alyr.qa` or `app.alyr.qa`.** The signature did not match:
  the Worker's key is not in the API's list, or the Worker is not the new one. The API logs
  "client address refused" (at most once a minute). Re-run steps 3 and 4; if it still fails,
  **turn it off (below)** first, then look. While it fails every visitor is counted together, and
  the 21st sign-in code of the hour is refused for all of them.
- **`"source":"signed"` from a `run.app` address with the made-up headers.** The API believes a
  header without a signature. Turn it off at once and tell the developer.

## Turn it off

`infra/gcp/setup.sh client-ip-off` (removes both settings; the API goes back to counting no
addresses, as before this change). Or put the previous revision back:
`gcloud.cmd run services update-traffic alyr-api --region me-central1 --project alyr-prod --to-revisions <previous revision>=100`
(`gcloud.cmd run revisions list --service alyr-api --region me-central1 --project alyr-prod`).
The Worker can stay as it is. To put the previous Worker back: `pnpm exec wrangler rollback` in
`infra/cloudflare/edge`, with the business login.

## Rotate the key

When it may have leaked, or once a year (`secret-rotation.md`). The API accepts a list, so
nothing breaks in between: `infra/gcp/setup.sh client-ip-key rotate` (new key first, old kept,
API restarted), then `infra/gcp/setup.sh edge-key` (the Worker signs with the new key), run
`scripts/check-client-address.sh`, then `infra/gcp/setup.sh client-ip-key finish` (old key
dropped). After a leak, drop the old key at once instead of keeping it: `finish` right after
`edge-key`.

## Assumed, and how it is proved

- **Cloudflare replaces a `CF-Connecting-IP` a visitor writes.** Its documentation says the header
  carries the client's address and says nothing of a value the client sends. The Worker relies on
  it, as the interim Worker did, so the check sends a made-up one through `api.alyr.qa` and fails
  if the API counts it.
- **Next's `/api/*` forwarding carries the two headers.** True of Next 16.4 (tried on 29 Oct with
  a stand-in API); the check goes through `app.alyr.qa` to prove it for every release.

## Not covered

- **IPv6.** An address is counted whole. A visitor with a whole `/64` can rotate within it, which
  the usual practice of counting the `/64` would stop. Follow-up.
- **Cloudflare rate-limit rules in front** (the first layer in `ALY-116`) are prepared, not set: the Free plan offers
  only the Block action. Numbers and the decision are in `cloudflare-edge.md`, section 3.
- **Where the web app's own server calls the API** (the order page): not limited today, so the
  headers are not observable in production; the unit test and the structure test cover them.
- **Another host.** The interim Cloudflare and Neon host (`cloudflare-neon-hosting.md`, never
  deployed) sets the header without a key because nothing but its Worker reaches its API. It
  keeps working, with the start-up warning.
