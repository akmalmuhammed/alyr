# ALYR on Google Cloud, Doha

Decision D-060. What runs where and why is in `docs/hosting.md`; this page is the steps.
The founder approves anything that costs money. Secrets are generated straight into
Secret Manager or typed by the founder, hidden; no agent reads or prints them.

Project `alyr-prod`, region `me-central1` (Doha), billing account `0140A6-0D3762-57B25D`.

On Windows, run the scripts from Git Bash, or from PowerShell as
`& "C:\Program Files\Git\bin\bash.exe" infra/gcp/setup.sh <step>`. They call `gcloud.cmd`,
so PowerShell's script policy does not matter.

## Steps

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
set them in the repository, then use Actions > `deploy-gcp`.

```bash
infra/gcp/setup.sh github
```

**8. Monitoring** (after step 6): uptime checks every 5 minutes on `/health/ready`,
`/health/worker` and `/login`, each with an email alert. Google emails a confirmation first.

```bash
ALYR_ALERT_EMAIL=akmal@alyr.qa infra/gcp/setup.sh monitoring
```

**9. After a tested restore from an export** (`docs/hosting.md`, "Backups on Google"):
`infra/gcp/setup.sh lock-backups`. It cannot be undone.

## Meta's webhook

Point the Meta app's webhook at `https://alyr-api-841433519399.me-central1.run.app/webhooks/whatsapp`
with the same verify phrase as in Secret Manager. Retire the laptop tunnel only after Meta
verifies it and a test message arrives.

## Not proven until the first deploy

- That Cloud SQL lets the `postgres` user create the app role and run every migration
  (expected: it has CREATEROLE; the only extension used is `btree_gist`, which Cloud SQL has).
- That the nightly export holds every shop's rows despite forced row-level security: restore
  one export and compare counts before relying on it.
- That a 0.5 vCPU worker pool keeps up (raise `ALYR_WORKER_CPU` and `ALYR_WORKER_MEMORY` and
  run `apps` again if not).
- That `roles/run.developer` is enough for GitHub's deploy account to update the worker pool.
