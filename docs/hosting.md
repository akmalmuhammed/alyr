# Hosting: how ALYR runs off the laptop

Decision D-036. Issues ALY-63 (always on) and ALY-10 (Azure in Qatar).

ALYR is three images and one database. The same images run in the rehearsal on the
laptop, on any single server with `docker-compose.prod.yml`, and on Azure Container Apps.

| Part | Image | Command | Must never sleep because |
|---|---|---|---|
| API | `apps/api/Dockerfile` | default (`uvicorn alyr.main:app`) | Meta's webhooks arrive at any hour and are retried if not answered |
| Worker | same image | `python -m alyr.worker` | Reminders, confirmations and the weekly report are sent by it |
| Migrations | same image | `python -m alyr.migrate` | Runs once per deploy, before the new API starts |
| Web app | `apps/web/Dockerfile` | default (`node server.js`) | Customers open order, booking and payment pages from chat links |
| Backup | `infra/backup/Dockerfile` | default (`backup.sh`) | Runs nightly and exits |
| Database | PostgreSQL 16 | managed in the cloud | |

The public site at alyr.qa is not part of this: it is static files on Cloudflare
(`scripts/build-site.sh`).

## Where it runs

| Stage | Where | State |
|---|---|---|
| Rehearsal | The laptop, `docker-compose.prod.yml` | Works (17 Oct 2026) |
| Main home | Azure Qatar Central: Container Apps, PostgreSQL Flexible Server, Key Vault | Planned; infrastructure code is ALY-10 |
| Off-site backups | Google Cloud Storage, Doha (in Qatar, another company); a second copy in Cloudflare R2 | Planned; the backup job is built and rehearsed |
| Emergency host | Google Cloud Run and Cloud SQL, Doha, from the latest backup | Planned; scripts only, nothing running |
| Web app standby | Vercel Pro, only if needed | Not set up |

## Production settings

The API image starts in production unless told otherwise (`ALYR_ENV=production`,
`ALYR_JOBS_INLINE=false`): no simulator, no open demo, no stand-in payments, and jobs run
only in the worker.

| Setting | What it is | Secret |
|---|---|---|
| `ALYR_DATABASE_URL` | The application role; cannot bypass row-level security | Yes |
| `ALYR_MIGRATION_URL` | The owner role; used only by migrations | Yes |
| `ALYR_BACKUP_URL` | The backup role; migrations create it with read-only access and BYPASSRLS so a dump can read every shop. Only the backup job uses it | Yes |
| `ALYR_PUBLIC_WEB_URL` | Where links in chats point, for example `https://app.alyr.qa` | No |
| `ALYR_META_*` | The five Meta values (see `apps/api/.env.example`) | Yes |
| `ALYR_EMAIL_API_KEY` | Resend, for sign-in codes | Yes |
| `ALYR_ENV` | `production`, or `staging` for a demo copy that keeps the simulator | No |

The web image takes its settings while it is built, because Next.js bakes them in:
`ALYR_API_URL` (the API's address inside the hosting network) and the `NEXT_PUBLIC_ALYR_*`
values. Build one web image per environment.

Secrets are typed by the founder into Key Vault (or `.env.prod` on a single server). No
agent reads or prints them.

## Health checks

| Address | Meaning | Used by |
|---|---|---|
| `GET /health` | The API process answers. Never touches the database | The host's liveness check |
| `GET /health/ready` | The API can reach the database (503 if not) | The host's readiness check |
| `GET /health/worker` | The worker checked in within the last 2 minutes (503 if not) | Uptime monitoring; a red result means reminders are not going out |

The worker checks in from inside its job loop every 30 seconds (`worker_heartbeats`), so a
worker that hangs turns red as well as one that dies.

## Rehearsal on the laptop

Needs Docker. Uses its own ports (API 18000, web 13000) and its own data, so it runs beside
the development setup and other sessions.

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm migrate python -m alyr.seed   # demo shop, rehearsal only
curl http://localhost:18000/health/worker
docker compose -f docker-compose.prod.yml down -v
```

What the rehearsal on 17 Oct 2026 showed: all four services healthy; the simulator answers
404; the web app forwards `/api/*` to the API inside the network; a signed WhatsApp webhook
is accepted, a duplicate is ignored, an unsigned one is refused, and the worker processes
the message; a backup restores into an empty database with identical row counts, all 37
security policies and the app role's grants; the API runs on the restored copy.

## Backups

**Keys.** Dumps are encrypted to a public key with `age`. The founder makes the key pair
once, on his own machine, and keeps the private key offline (password manager and one
printed copy). Only the public key (`age1...`) goes into the backup job's settings. Without
the private key no backup can be read, by anyone, including ALYR.

```bash
docker run --rm -it --entrypoint age-keygen alyr-backup
```

**Every night** the backup job dumps the database as the backup role, checks the dump lists
tables, encrypts it, copies it to each destination in `BACKUP_DESTINATIONS`, and deletes
copies older than `BACKUP_KEEP_DAYS` (35). It exits non-zero if anything failed, so the
scheduler can alert.

Destinations are rclone remotes configured by environment variables, for example:

```text
BACKUP_DESTINATIONS="gcs:alyr-db-doha r2:alyr-db-eu"
RCLONE_CONFIG_GCS_TYPE=s3                RCLONE_CONFIG_R2_TYPE=s3
RCLONE_CONFIG_GCS_PROVIDER=GCS           RCLONE_CONFIG_R2_PROVIDER=Cloudflare
RCLONE_CONFIG_GCS_ENDPOINT=https://storage.googleapis.com
RCLONE_CONFIG_GCS_ACCESS_KEY_ID / _SECRET_ACCESS_KEY   (an HMAC key for one service account)
RCLONE_CONFIG_R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
RCLONE_CONFIG_R2_ACCESS_KEY_ID / _SECRET_ACCESS_KEY    (an R2 token for one bucket)
```

**The PostgreSQL tools in the backup image must match the server's major version**
(`PG_MAJOR` in `infra/backup/Dockerfile`, 16 now). The rehearsal found that a newer
`pg_restore` writes a setting an older server rejects.

## Restoring

Only into an empty database; the script refuses otherwise.

```bash
docker run --rm -v /path/to/key:/k:ro \
  -e BACKUP_AGE_IDENTITY=/k/alyr-backup.key -e ALYR_APP_PASSWORD=... \
  -e RCLONE_CONFIG_GCS_TYPE=... (as above) \
  --entrypoint restore.sh alyr-backup "gcs:alyr-db-doha/alyr-<time>.dump.age" "postgresql://<owner>@<new server>/alyr"
```

Then point `ALYR_DATABASE_URL` and `ALYR_MIGRATION_URL` at the new server and run
`python -m alyr.migrate` once: it should apply nothing.

Restore once before the first paying customer, and after any change to the backup job.

## Not done yet

- Azure infrastructure code, the deploy workflow and the Google emergency scripts (ALY-10).
- Uptime monitoring on `/health/worker` and the webhook address.
- A test that a hung worker turns `/health/worker` red in a real deployment (covered by a
  unit test only).
