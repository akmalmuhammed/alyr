# ALYR on Google Cloud, Doha

Decision D-060. What runs where and why is in `docs/hosting.md`; this page is the steps.
The founder approves anything that costs money. Secrets are generated straight into
Secret Manager or typed by the founder, hidden; no agent reads or prints them.

Project `alyr-prod`, region `me-central1` (Doha), billing account `0140A6-0D3762-57B25D`.

On Windows, run the scripts from Git Bash, or from PowerShell as
`& "C:\Program Files\Git\bin\bash.exe" infra/gcp/setup.sh <step>`. They call `gcloud.cmd`,
so PowerShell's script policy does not matter.

## Steps

**State: running since 28 Oct 2026** (image tag `204091be0d79`). Nothing points at it yet:
Meta's webhook and the customer links still use the laptop.

**1. Sign in** (once): `gcloud.cmd auth login akmal@alyr.qa`.

**2. Infrastructure** (about 15 minutes; the database takes most of it):

```bash
ALYR_BILLING_ACCOUNT=0140A6-0D3762-57B25D infra/gcp/setup.sh infra
```

Private network, Cloud SQL (PostgreSQL 16, private address only), the image registry, the
four service accounts, the export bucket and the budget. Safe to run again.

**3. Secrets.** Database passwords and the link secret are generated. You are then asked,
one at a time and hidden, for the three R2 values (required; the same as in
`apps/api/.env`), the Meta values and the Resend key; Enter skips an optional one.

```bash
infra/gcp/setup.sh secrets
```

Or, if those values are already in `apps/api/.env` on this machine, copy them without typing
(after `secrets` has generated the database values; press Ctrl+C at its first question):

```bash
infra/gcp/setup.sh env-secrets apps/api/.env
```

**4. Images**, built on the laptop and pushed to Doha (needs Docker running):

```bash
infra/gcp/push-images.sh
```

**5. Apps** at the tag step 4 printed. Runs migrations first, then deploys the API, the
worker, the web app and the nightly export:

```bash
infra/gcp/setup.sh apps <tag>
```

**6. Check from outside:** the three addresses step 5 prints should answer 200:
`/health/ready`, `/health/worker` and `/login`.

**7. GitHub deploys** (once GitHub Actions runs again, ALY-206): print the four variables,
set them in the repository, then use Actions > `deploy-gcp` with a release version. It
deploys only a commit whose `ci` run is green, after the founder approves in the `production`
environment, and tags the release (`docs/runbooks/release.md`). Going back:
`infra/gcp/rollback.sh` (`docs/runbooks/rollback.md`).

```bash
infra/gcp/setup.sh github
```

**8. Monitoring** (after step 6): uptime checks every 5 minutes on `/health/ready`,
`/health/worker` and `/login`, and on the public addresses through Cloudflare (`alyr.qa`,
`app.alyr.qa/login`, `api.alyr.qa/health/ready`), each with an email alert, and an alert on errors: any server
error from the API or web app, a crash (traceback) or a failed job (a WhatsApp send, a
reminder), counted by the log-based metric `alyr-app-errors`. Google's Error Reporting cannot
read logs kept in Doha, so this replaces it. Google emails a confirmation first.

```bash
ALYR_ALERT_EMAIL=akmal@alyr.qa infra/gcp/setup.sh monitoring
```

**9. After a tested restore from an export** (`docs/hosting.md`, "Backups on Google"):
`infra/gcp/setup.sh lock-backups`. It cannot be undone.

## Meta's webhook

Done on 28 Oct 2026: Meta sends WhatsApp events to `https://api.alyr.qa/webhooks/whatsapp`, and
a message to ALYR's test number was answered from production within two seconds.

- **Webhook:** `infra/gcp/setup.sh meta-webhook <Meta app ID>` (app `alyr`, 1071845795713841)
  sets it through the Graph API with the app secret and verify phrase from Secret Manager.
  Meta checks the address at once, so the API must be live.
- **Access token:** a permanent system-user token (Business Settings > System users >
  alyradmin > Generate token; app alyr, never expires, `whatsapp_business_messaging` and
  `whatsapp_business_management`). Store it with `infra/gcp/setup.sh set-secret
  meta-access-token`: paste once. Meta checks it before it is stored, and only "accepted" or
  an error code is shown, because Meta's error text repeats the token.

## What the first deploy showed (28 Oct 2026)

- All 48 migrations apply as Cloud SQL's `postgres` user.
- **Cloud SQL's `postgres` is not a superuser**, so the forced row-level security applied to
  it too, and the owner-run functions (sign-up, the back office, quotes; 23 of them) would
  have failed. Migrations now give the owner BYPASSRLS (`ensure_owner_bypasses_rls`), which
  Cloud SQL allows; the application role still cannot bypass it.
- **The nightly export holds every shop's rows:** the demo shop was seeded into a throwaway
  database, exported, imported into a second one, and all 20 tables with rows matched,
  including contacts, ledger entries, memberships and consents. Both databases were deleted.
- An always-on worker pool needs at least 1 vCPU (Google refuses less).
- `/health`, `/health/ready` and `/health/worker` answer 200 from outside; the web app answers
  `/login` and forwards `/api/*`; the simulator and API docs answer 404; an unsigned webhook is
  refused with 401.

Not yet proven: that `roles/run.developer` is enough for GitHub's deploy account to update
the worker pool, and to move its instance split back to "latest" (the first `deploy-gcp` run
will tell).
