# Hosting: how ALYR runs off the laptop

Decision D-060 (Google Cloud in Doha; it replaces D-036, Azure). Issues ALY-63 (always on)
and ALY-10 (the host in Qatar).

ALYR is two images and one database. The same images run in the rehearsal on the laptop,
on any single server with `docker-compose.prod.yml`, and on Google Cloud Run in Doha.

| Part | Image | Command (first argument) | Must never sleep because |
|---|---|---|---|
| API | `apps/api/Dockerfile` | `api` | Meta's webhooks arrive at any hour and are retried if not answered |
| Worker | same image | `worker` | Reminders, confirmations and the weekly report are sent by it |
| API and worker together | same image | none | Only for a host that runs one container (D-052) |
| Migrations | same image | `python -m alyr.migrate` | Runs once per deploy, before the new API starts |
| Web app | `apps/web/Dockerfile` | default (`node server.js`) | Customers open order, booking and payment pages from chat links |
| Backup (single server only) | `infra/backup/Dockerfile` | default (`backup.sh`) | Runs nightly and exits |
| Database | PostgreSQL 16 | managed in the cloud | |

The public site at alyr.qa is not part of this: it is static files on Cloudflare
(`scripts/build-site.sh`).

## Where it runs

| Stage | Where | State |
|---|---|---|
| Rehearsal | The laptop, `docker-compose.prod.yml` | Works (17 and 20 Oct 2026) |
| Production | Google Cloud, Doha (`me-central1`), project `alyr-prod`: Cloud Run, Cloud SQL, Secret Manager | Running since 28 Oct 2026, healthy; not yet receiving WhatsApp traffic (ALY-10): `infra/gcp/` |
| Database backups | Cloud SQL's own daily backups (14 kept) and point-in-time recovery (7 days), plus a nightly export to a bucket in Doha kept 35 days | Set up with production |
| Interim host on Cloudflare and Neon (D-052) | Not used for real clients | Superseded by D-060 |

Everything stays in Doha: the founder chose on 28 Oct 2026 to keep no copy outside Qatar. That includes
Cloud SQL's backups, which are pinned to `me-central1` (`--backup-location` in `setup.sh infra`): left
alone, Google stores them in the nearest multi-region, `eu`, and the backups taken before 29 Oct 2026
21:32 UTC are there until the founder decides to delete them (ALY-267).

## On Google Cloud

| Part | Google service | Size |
|---|---|---|
| API | Cloud Run service `alyr-api` | 1 vCPU, 1 GiB, one always running, up to 3; billed per request beyond the idle instance |
| Worker | Cloud Run worker pool `alyr-worker` | One instance, 1 vCPU (the least Google allows for an always-on worker), 512 MiB |
| Web app | Cloud Run service `alyr-web` | 1 vCPU, 512 MiB, one always running, up to 3 |
| Migrations | Cloud Run job `alyr-migrate` | Run by each deploy, before the rollout |
| Database | Cloud SQL for PostgreSQL 16 `alyr-db`, `db-g1-small` | Shared vCPU, 1.7 GB, 10 GB SSD growing on its own; private address only; encrypted connections only |
| Nightly export | Cloud Run job `alyr-db-export`, started at 02:00 Doha time by Cloud Scheduler | Writes `gs://alyr-prod-db-exports/alyr-<time>.sql.gz` |
| Erasing stopped clients' data (spec 042, D-116) | Cloud Run job `alyr-erase` (as `alyr-migrate`) started at 03:30 Doha time by Cloud Scheduler. **Written in `infra/gcp/erase.sh`, not applied;** when applied it is made with the switch off and the schedule paused | Reports only until `erase.sh enable`; `docs/runbooks/erasing-a-client.md` |
| Secrets | Secret Manager, stored in Doha only | |
| Images | Artifact Registry `me-central1-docker.pkg.dev/alyr-prod/alyr` | |
| Spending | Two budgets of USD 150: "ALYR monthly" (credits count, so it alerts only once credits are gone) and "ALYR gross cost" (credits excluded, so it alerts while credits pay), each at 50%, 90%, 100% and a forecast of 100%, sent to the same alert channels as everything else | |

The apps reach the database over a private network (`alyr-net`, Cloud Run's direct VPC
egress); the database has no public address. Each app runs as its own service account:
`alyr-run` (API and worker; reads the secrets listed under "Production settings", one secret at
a time, and not the database owner's address), `alyr-migrate` (the migration job and, while it
runs, the first-admin job; the only account that reads the owner's address, `migration-url`, and
the application address), `alyr-web` (no secrets), `alyr-export` (may only start an export of
this one database), `alyr-deploy` (GitHub's deploys; may update the apps and push images).
Nobody holds a project-wide Secret Manager role, and the default compute account has no
project role: `infra/gcp/setup.sh access` sets and checks this (ALY-268).

**Roughly a month at Doha list prices (28 Oct 2026):** database about USD 34, API about
USD 14, web app about USD 14, worker about USD 37, the rest a few dollars: about USD 100 to 105,
paid from the startup credits.

**The database owner bypasses row-level security** (`ensure_owner_bypasses_rls` in
`alyr/migrate.py`), as a superuser does on a developer machine: the SECURITY DEFINER
functions behind sign-up and the back office are owned by it. Cloud SQL's `postgres` is not a
superuser, so without this those functions fail. The application role never bypasses it.

**Addresses.** The public names are **https://app.alyr.qa** (the workspace, sign-in and
customer pages) and **https://api.alyr.qa** (the API and Meta's webhook). They are a
Cloudflare Worker, `alyr-edge` (`infra/cloudflare/edge`), which forwards each request
unchanged to Cloud Run's fixed addresses, `https://alyr-web-841433519399.me-central1.run.app`
and `https://alyr-api-841433519399.me-central1.run.app`, and points redirects back at the
public name. Chosen by the founder on 28 Oct 2026 over Google's load balancer (about USD 18 a
month), because Cloud Run's own domain mappings are refused in Doha ("Creating domain
mappings is not allowed in me-central1"). The Worker keeps no logs and no cache. alyr.qa is
verified in Google Search Console for akmal@alyr.qa (TXT record on alyr.qa).

**Who is asking.** The `run.app` addresses are public too, so the API cannot believe a header
that anyone could write. The Worker is the one place that knows the visitor: it writes the address
from `CF-Connecting-IP` and signs it, and the API counts its per-address limits only by an address
with a good signature (ALY-265, D-083; `runbooks/client-address.md`).

## Production settings

The API image starts in production unless told otherwise (`ALYR_ENV=production`,
`ALYR_JOBS_INLINE=false`): no simulator, no open demo, no stand-in payments, and jobs run
only in the worker.

| Setting | What it is | Secret |
|---|---|---|
| `ALYR_DATABASE_URL` | The application role; cannot bypass row-level security | Yes |
| `ALYR_MIGRATION_URL` | The owner role (`postgres` on Cloud SQL, which bypasses row-level security); used only by migrations, the seeds, the doctor and the first-admin job. **Not given to the API or the worker** on Google: they never read it, and a leak of their environment must not hand over the owner (ALY-268) | Yes |
| `ALYR_BACKUP_URL` | Only for the single-server backup job: a read-only role with BYPASSRLS. Not set on Google, where Cloud SQL's backups and export do this | Yes |
| `ALYR_PUBLIC_WEB_URL` | Where links in chats point: the web app's address | No |
| `ALYR_META_*` | The five Meta values (see `apps/api/.env.example`) | Yes |
| `ALYR_EMAIL_API_KEY` | Resend, for sign-in codes | Yes |
| `ALYR_LINK_SECRET` | Signs every customer's order and document link (ALY-112). The API and worker refuse to start without it. Generated once and kept: changing it ends every link already sent | Yes |
| `ALYR_R2_ACCOUNT_ID`, `ALYR_R2_ACCESS_KEY_ID`, `ALYR_R2_SECRET_ACCESS_KEY` | Product photos on Cloudflare R2 (D-039), served from `ALYR_MEDIA_BASE_URL` (`https://media.alyr.qa`). Without all three the API and worker refuse to start outside a developer machine, because a container's disk is wiped on restart and not shared between copies | Yes |
| `ALYR_CLIENT_IP_HEADER` | `x-alyr-client-ip`: where the API reads the visitor's address from, for the per-address rate limits (ALY-116). Empty: the limits are off and the API says so at start-up. Set only together with the next row, by `setup.sh client-ip-on` | No |
| `ALYR_CLIENT_IP_KEYS` | The keys (comma separated) that sign that address: Secret Manager `client-ip-key`, the same value as the edge Worker's secret `CLIENT_IP_KEY`. The API believes the address only with a matching signature (ALY-265; `runbooks/client-address.md`) | Yes |
| `ALYR_MEDIA_ALLOW_LOCAL`, `ALYR_MEDIA_LOCAL_DIR` | Only for a single server whose photo folder is a kept volume (the rehearsal) | No |
| `ALYR_ENV` | `production`, or `staging` for a demo copy that keeps the simulator | No |

The web image takes its settings while it is built, because Next.js bakes them in:
`ALYR_API_URL` (the API's address) and the `NEXT_PUBLIC_ALYR_*` values. Build one web image
per environment. `ALYR_API_URL` is also needed while the server runs: the order page
(`/s/<shop>`) asks the API for its link preview and first page of items before any script
runs on the customer's phone. The image keeps the build value; Cloud Run sets it again.

**What a database backup does not hold.** Product photos live on R2, not in the database.
They are public by design and R2 keeps them independently of Google. Documents (receipts,
invoices) are PDFs kept in the database (D-042), so they are in every backup.

Secrets live in Secret Manager (or `.env.prod` on a single server). `infra/gcp/setup.sh
secrets` generates the database passwords and the link secret there without showing them,
and asks the founder for the rest, hidden as typed. No agent reads or prints them. Which
account may read which secret is set by `infra/gcp/setup.sh access` (`--dry-run` shows the
changes first); `setup.sh apps` runs it too.

## Health checks

| Address | Meaning | Used by |
|---|---|---|
| `GET /health` | The API process answers. Never touches the database | The host's liveness check |
| `GET /health/ready` | The API can reach the database (503 if not) | Deploys; uptime monitoring |
| `GET /health/worker` | The worker checked in within the last 2 minutes (503 if not) | Uptime monitoring; a red result means reminders are not going out |

The worker checks in from inside its job loop every 30 seconds (`worker_heartbeats`), so a
worker that hangs turns red as well as one that dies.

## Deploying

Manual only, from `main`, with a release version: GitHub Actions > `deploy-gcp` > Run workflow
(`docs/runbooks/release.md`). Three jobs. The gate checks that the commit's `ci` run is green
and that the version `v0.x.y` is cut in `CHANGELOG.md`. The deploy job then waits for the
founder's approval (environment `production`), signs in to Google with a short-lived GitHub
token (no stored key), builds and pushes both images tagged with the commit, runs migrations as
a job, rolls out the API, worker and web app only if migrations succeeded, sends their traffic
to the new revisions, and checks `/health/ready`, `/health/worker` and `/login`. Last, the
commit is tagged with the version.

Without GitHub Actions (while Actions is blocked, or the first deploy): `infra/gcp/push-images.sh`
on the laptop, then `infra/gcp/setup.sh apps <tag>`. Tag the commit by hand afterwards
(`scripts/release.sh tag v0.x.y <sha>`).

To roll back: split traffic back to an earlier revision, which brings back its settings as well
as its image, in seconds and with no rebuild: `infra/gcp/rollback.sh`, steps and rehearsal in
`docs/runbooks/rollback.md`. A migration is never rolled back by this: read that page before
going back past one, and write a new migration to undo one.

## Rehearsal on the laptop

Needs Docker. Uses its own ports (API 18000, web 13000) and its own data, so it runs beside
the development setup and other sessions.

```bash
scripts/rehearsal-env.sh                       # once: .env.prod with random passwords (git ignores it)
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate python -m alyr.seed   # demo shop, rehearsal only
curl http://localhost:18000/health/worker
docker compose --env-file .env.prod -f docker-compose.prod.yml down -v
```

**20 Oct 2026, after the Catalog, stock, Documents, delivery and pricing work (124 commits):**
the images build; all four services healthy with no errors in their logs; nine demo shops
with 178 items, 720 orders, 1,745 stock movements and 165 bookings; the order page renders
its link preview, photo and first items on the server; product photos are stored and served
through the web app; receipts, invoices and credit notes draw in English and Arabic inside the
image, with their fonts, and read back as pictures; a backup of 91 tables restores with the
same counts and all 90 security policies. Two bugs were found and fixed: the web server lost
the API's address once running (the order page would have fallen back to 127.0.0.1 in the
cloud), and a cloud deploy without R2 would have kept photos on a disk that is wiped on
restart (now the API and worker refuse to start).

What the rehearsal on 17 Oct 2026 showed: all four services healthy; the simulator answers
404; the web app forwards `/api/*` to the API inside the network; a signed WhatsApp webhook
is accepted, a duplicate is ignored, an unsigned one is refused, and the worker processes
the message; a backup restores into an empty database with identical row counts, all 37
security policies and the app role's grants; the API runs on the restored copy.

## Backups on Google

- **Cloud SQL's own:** a full backup every night at 02:00 Doha, 14 kept, stored in Doha
  (`me-central1`; the setting is explicit, ALY-267), and point-in-time recovery for the last
  7 days, whose logs are in Doha too. Backups taken before 29 Oct 2026 21:32 UTC were stored in
  `eu` and age out of the 14 unless the founder deletes them sooner. Restoring makes a new instance
  with a **new private address** (`infra/gcp/restore.sh clone alyr-db-restored <time>`), so the broken
  one stays for comparison and both database secrets are rewritten (`infra/gcp/restore.sh repoint`).
  Steps, targets and the rehearsal of 30 Oct 2026: `docs/runbooks/restore-rehearsal.md`,
  `docs/audit/restore-2026-10-30.md`.
- **The nightly export:** an SQL file per night in `gs://alyr-prod-db-exports`, in Doha, kept
  35 days. A copy outside the instance, readable without Cloud SQL. `infra/gcp/setup.sh
  lock-backups` makes the 35 days unbreakable, even by the project's owner; run it only
  after a restore from an export has been tested.
- **Restoring an export:** into an empty database on a new or existing instance:
  `gcloud sql databases create alyr_restored --instance alyr-db`, then
  `gcloud sql import sql alyr-db gs://alyr-prod-db-exports/<file> --database alyr_restored`.
  Compare row counts with the live database, then delete `alyr_restored`.

Restore once before the first paying customer, and after any change to the backups
(`infra/gcp/restore.sh rehearse`; done 30 Oct 2026). What watches the database, the backups and the
nightly export: `infra/gcp/monitoring.sh` (ALY-277).

## Backups on a single server

On a server run with `docker-compose.prod.yml` there is no Cloud SQL, so the backup image
does the work.

**Keys.** Dumps are encrypted to a public key with `age`. The founder makes the key pair
once, on his own machine, and keeps the private key offline (password manager and one
printed copy). Only the public key (`age1...`) goes into the backup job's settings. Without
the private key no backup can be read, by anyone, including ALYR.

```bash
docker run --rm -it --entrypoint age-keygen alyr-backup
```

**Every night** the backup job dumps the database as the backup role, checks the dump lists
tables, encrypts it, copies it to each destination in `BACKUP_DESTINATIONS` (rclone remotes
set by environment variables, `RCLONE_CONFIG_<NAME>_*`), and deletes copies older than
`BACKUP_KEEP_DAYS` (35). It exits non-zero if anything failed, so the scheduler can alert.

**The PostgreSQL tools in the backup image must match the server's major version**
(`PG_MAJOR` in `infra/backup/Dockerfile`, 16 now). The rehearsal found that a newer
`pg_restore` writes a setting an older server rejects.

**Restoring** goes only into an empty database; the script refuses otherwise:

```bash
docker run --rm -v /path/to/key:/k:ro \
  -e BACKUP_AGE_IDENTITY=/k/alyr-backup.key -e ALYR_APP_PASSWORD=... \
  --entrypoint restore.sh alyr-backup "<remote>:<bucket>/alyr-<time>.dump.age" "postgresql://<owner>@<new server>/alyr"
```

Then point `ALYR_DATABASE_URL` and `ALYR_MIGRATION_URL` at the new server and run
`python -m alyr.migrate` once: it should apply nothing.

## Not done yet

- The first deploy to Google and its checks (ALY-10); the "Not proven" list in
  `infra/gcp/README.md`.
- Custom addresses `api.alyr.qa` and `app.alyr.qa`.
- Uptime monitoring on `/health/worker` and the webhook address.
- A test that a hung worker turns `/health/worker` red in a real deployment (covered by a
  unit test only).
