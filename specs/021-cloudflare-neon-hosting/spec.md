# 021 · Interim hosting on Cloudflare and Neon

Linear ALY-224 (under ALY-10, always-on hosting) · Decision D-052 · Replaces the laptop and
tunnel as the home of the client portal and the API until Azure Qatar Central (D-013, ALY-63)

## What it is for

The client portal (sign-up, workspace, back office, customer pages) and the API are only
reachable while the founder's laptop is on. The founder chose, on 24 Oct 2026, to host them
on Cloudflare with the database on Neon, and to move to Azure when the credits arrive. This
spec says what runs where and what is proven before any real client uses it.

## Parts

| Part | Runs on | Source | Public address |
|---|---|---|---|
| Public site (static) | Worker `alyr-site`, unchanged | `apps/web/wrangler.jsonc` | alyr.qa |
| Client portal (Next.js) | Worker `alyr-portal`, built with OpenNext | `apps/web/wrangler.portal.jsonc`, `open-next.config.ts` | workers.dev first, then app.alyr.qa |
| API and job runner | Worker `alyr-api` in front of one Cloudflare Container | `infra/cloudflare/api/`, `apps/api/Dockerfile` | workers.dev first; the portal reaches it through its rewrites |
| Database | Neon Postgres, Frankfurt | `docs/runbooks/cloudflare-neon-hosting.md` | not public |
| Photos | R2 (unchanged, D-039) | | media.alyr.qa |

## How a request goes

Browser → portal Worker → (for `/api/*` and `/sim/*`) the rewrite in `next.config.ts` →
API Worker → container (FastAPI) → Neon. The rewrite's target is `ALYR_API_URL`, fixed when
the portal is built. The API Worker lets through only `/health`, `/health/ready`, `/health/worker` (spec 022) and `/api/*`; the simulator,
the API docs and everything else answer 404 from outside.

## The container

- One image, `apps/api/Dockerfile`: the API and the job runner started by
  `docker-entrypoint.sh`. If either stops, the container stops and Cloudflare starts it again.
- `ALYR_JOBS_INLINE=false` and `ALYR_ENV=production` are forced by the Worker. Every other
  `ALYR_*` setting of the Worker (secrets set with `wrangler secret put`, plain values in
  `wrangler.jsonc`) is passed to the container as an environment variable.
- The job runner delivers messages, reminders and reports on a timer, so the container must
  not sleep: `sleepAfter` is 24 hours and a cron on the Worker asks `/health` every 3 minutes.
- One instance only (`max_instances: 1`, type `basic`). The runner and the API share it. A
  second instance would run the runner twice. Queued jobs are claimed with row locks
  (`for update skip locked`), but the runner's timed loops (alerts, reports) have not been
  checked to be safe twice, so it stays at one.

## The database roles

`python -m alyr.migrate` creates `alyr_app` (no bypass of row-level security) from the
password in `ALYR_DATABASE_URL` and runs the migrations as the owner in
`ALYR_MIGRATION_URL`. The migration URL is a direct (not pooled) Neon address; the API uses
the pooled one. `alyr_app` must be created by that command, never in Neon's console, because
roles made in the console are members of `neon_superuser`, which bypasses row-level security
(hard rule 1).

## What is proven, and what is not

Proven in the pull request: the image's install steps and entrypoint start and answer
`/health` against local PostgreSQL (the `api` CI job builds the real image and does this);
the portal builds for Workers (CI `web`), answers `/login`, `/start` and `/app` locally and
reaches an API through its rewrites; the Worker typechecks and its configuration is read by
wrangler.

**Not proven until the first deploy** (each is listed in the runbook as a check to run):
1. The container reaches Neon on port 5432 (outbound TCP from a Cloudflare Container).
2. The API works through Neon's pooled address: `set_config('app.tenant_id', ..., true)` inside
   a transaction, prepared statements, and `tests/test_tenant_isolation.py` against a
   throwaway Neon branch.
3. Cloudflare Containers' status (the documentation does not say whether it is generally
   available) and its price: the Workers Paid plan, USD 5 a month, plus the container's use
   (about USD 12 a month in total for one always-on `basic` instance, our estimate).
4. A rewrite from the portal Worker to the API Worker on `workers.dev` can be refused
   (Cloudflare blocks a Worker from calling another `workers.dev` address of the same account
   in some cases). If it is, the API gets a custom domain (`api.alyr.qa`) before the portal is
   built, or the portal binds to the API Worker as a service.
5. The visitor's address (rate limits): the API sees the portal Worker's hop, so it may rate
   limit every visitor as one. To be checked at the first deploy; the fix is for the portal
   to pass Cloudflare's `CF-Connecting-IP` on, and for the API to trust it only from there.

## Data

Only the fictional demo shop goes on Neon and Cloudflare until the founder decides about
real clients (D-052, and the unanswered question on `docs/data-residency.md`). The register
lists Neon in Frankfurt for the demo shop and consenting alpha merchants (D-013); Cloudflare
Containers run where Cloudflare places them, which is not Qatar and not chosen by us.

## Rollback

Each part deploys alone and rolls back alone (`wrangler rollback` for a Worker; the previous
container image is kept by Cloudflare). The static site is not touched by any of this. The
laptop and tunnel keep working as before.
