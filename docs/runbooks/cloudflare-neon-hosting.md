# Hosting on Cloudflare and Neon (portal, API, database)

Written 24 Oct 2026 (ALY-224, D-052, spec 021). **Nothing here has been deployed yet.** The
steps are checked against Cloudflare's and Neon's documentation of 24 Oct and against local
runs; the five "not proven" items of the spec are marked **Check** below.

**Data rule.** Only the fictional demo shop goes on this until the founder answers whether the
first clients may be (D-052, `docs/data-residency.md`). Do not move a real client's data here
before then.

## One-time setup (founder)

1. **Workers Paid plan** in the Cloudflare dashboard (USD 5 a month; Containers need it).
2. **Neon account and project**, region Frankfurt (`aws-eu-central-1`). Keep the default
   database. Copy two connection strings from the dashboard (Connect):
   - *Direct* (no `-pooler` in the host) for migrations.
   - *Pooled* (`-pooler`) for the API.
3. **Roles.** Neon's default owner role is the migration role. The app role `alyr_app` is
   created by the migration command in step 5, **not in Neon's console** (a console-made role
   can bypass row-level security).
4. **Docker** running on the laptop (wrangler builds the image there).

Never paste a connection string into a chat, an issue or a file in the repo.

## Set the settings

From `infra/cloudflare/api` on the laptop (`pnpm install` once):

```
pnpm exec wrangler secret put ALYR_DATABASE_URL     # pooled string, but user alyr_app and the password you choose
pnpm exec wrangler secret put ALYR_LINK_SECRET      # 32+ random characters
pnpm exec wrangler secret put ALYR_EMAIL_API_KEY    # Resend key
# later: ALYR_META_*, ALYR_R2_*, ALYR_BANK_TRANSFER_DETAILS (company bank details)
```

If wrangler says the Worker `alyr-api` does not exist yet, answer yes to create it.

`ALYR_DATABASE_URL` is the pooled host with the user `alyr_app` and a new password. The
migration command creates that role with that password.

## Migrate (from the laptop, once and after every release that adds a migration)

```
cd apps/api
ALYR_MIGRATION_URL='<direct owner string>' ALYR_DATABASE_URL='<pooled alyr_app string>' \
  uv run python -m alyr.migrate
```

Then the first staff account for `/ops` (the app cannot add staff; the owner role does):

```
psql '<direct owner string>' -c "insert into platform_admins (email, name) values ('akmal@alyr.qa', 'Akmal') on conflict do nothing"
```

## Deploy (founder approves each one; the laptop asks)

```
cd infra/cloudflare/api && pnpm exec wrangler deploy      # API Worker + container; prints its workers.dev address
cd apps/web && ALYR_API_URL=https://alyr-api.<account>.workers.dev pnpm portal:build && pnpm portal:deploy
```

The static site (`alyr-site`) is deployed separately as before (`site-deploy.md`) and is not
touched.

## Check after the first deploy

- `curl https://alyr-api.<account>.workers.dev/health` answers `{"status":"ok","env":"production"}`.
  **Check 1:** if it answers 5xx, `pnpm exec wrangler tail` shows whether the container could
  not reach Neon (outbound TCP to port 5432).
- `/docs` and `/sim/...` answer 404 from outside.
- **Check 2, before any real client:** run the tenant isolation tests against a throwaway Neon
  branch, with the pooled address: `ALYR_TEST_OWNER_DSN` and `ALYR_TEST_APP_DSN` set to that
  branch, `uv run pytest tests/test_tenant_isolation.py`. Also load the demo shop
  (`uv run python -m alyr.seed`) and open `/app` through the portal.
- **Check 4:** the portal's `/api/auth/me` answers (the portal reaches the API Worker). If
  Cloudflare refuses a Worker-to-Worker call on workers.dev, give the API a custom domain
  (`api.alyr.qa`) and rebuild the portal with `ALYR_API_URL` set to it.
- **Check 5:** sign in twice with a wrong code from two networks; the rate limit should count
  them separately.
- A job runs: place a demo order and see its confirmation in the simulator inbox (the job
  runner is in the same container).

## Rollback

`pnpm exec wrangler rollback` in `infra/cloudflare/api` (API) or in `apps/web` with
`--config wrangler.portal.jsonc` (portal). The database is not rolled back by this: a
migration is never edited, a fix is a new migration (CLAUDE.md rule 8). Pointing alyr.qa back
is not needed: the public site is a different Worker.

## Custom domain (later, with the founder's yes)

Add `{ "pattern": "app.alyr.qa", "custom_domain": true }` to `routes` in
`apps/web/wrangler.portal.jsonc` and set `ALYR_PUBLIC_WEB_URL` in the API's `vars`. Put
Cloudflare Access in front of `/ops` before the first real client (founder's answer 6).

## Costs

Workers Paid USD 5 a month; one `basic` container always on, about USD 7 more by our
estimate from Cloudflare's published rates (memory, vCPU and disk beyond the plan's included
amounts); Neon Free (0.5 GB; it sleeps after 5 idle minutes, which slows the first request).
Watch the dashboard's usage after the first week and write the real figure in `docs/stack.md`.
