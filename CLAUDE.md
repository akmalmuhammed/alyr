# ALYR

ALYR is a technology company for businesses in Qatar and the GCC. This repository holds its public site and its first product: WhatsApp-native operating tools (bookings, orders, payments, tracking, team inbox). One multi-tenant core, with modules switched on per merchant.

Read these before working, in this order:

- [docs/operating-model.md](docs/operating-model.md): how the company is divided into six lanes of agents, what only the founder does, and the rules every agent follows. Then read your lane's brief in `docs/lanes/`.
- [docs/status.md](docs/status.md): where things stand right now, what is next and what is waiting on the founder. Update it in the same pull request as the work.
- [docs/brand.md](docs/brand.md): the brand rules the public site follows and where the design system lives. Read it before touching anything a customer sees.
- [docs/master-plan.md](docs/master-plan.md): what we are building, in what order, and what we decided not to build.
- [docs/decisions.md](docs/decisions.md): every decision with its reason. Add an entry in the same pull request as any new decision.
- [docs/stack.md](docs/stack.md): every tool, its free limit and when we swap it. Free tiers first; nothing paid without the founder agreeing.
- [docs/hygiene.md](docs/hygiene.md): where every kind of file lives, what each change must include, and how docs stay true. The PR template repeats its checklist. Read it before your first change.
- [docs/access.md](docs/access.md) and [docs/runbooks/](docs/runbooks/): who holds which account, and what to do when something breaks or a secret leaks.
- [docs/working-with-claude.md](docs/working-with-claude.md): the ways AI-built projects fail and the guard against each. Follow it, and say so when a guard is missing.

Plan and tasks live in Linear, team `Alyrtech`, project `Alyr Launch`. Work one issue per branch; name the branch after the issue (`aly-12-...`). Phases, not dates: a phase is finished when its demo works.

## How work is done

1. One Linear issue per branch, branch named after the issue. Never commit to `main` directly.
2. Before using any outside API or library feature, check its current documentation. Do not rely on memory.
3. Tests go through the real path: real PostgreSQL, the simulator channel, HTTP in and out.
4. Run `scripts/check.sh`, and run the feature itself, before opening a pull request.
5. The pull request says in plain words what changed, how it was checked and what was not checked.
6. Merge only on green CI. Then update the Linear issue honestly, including what is still missing.
7. Anything outside the issue becomes a new issue, not extra code.
8. Never edit a migration that has been applied anywhere shared. Add a new one.
9. A new dependency needs a one-line reason in the pull request.
10. Development data is the fictional demo shop only. Real customer data never enters the repo or a chat.

## Hard rules

These are not style preferences. Do not write code that breaks them, and stop and say so if a task seems to require it.

1. **Tenant isolation.** Every tenant-owned table has a `tenant_id` column and a PostgreSQL Row-Level Security policy. The application database role cannot bypass RLS. No query relies on application code alone to separate tenants.
2. **Data stays in Qatar.** Production runs in Azure Qatar Central. No service outside Qatar receives merchant or end-customer personal data unless it is listed in `docs/data-residency.md` with its legal basis. This includes error trackers, analytics, OCR and LLM APIs. When in doubt, strip the data or do not send it.
3. **Non-custodial payments.** Alyr never holds, pools or moves merchant funds. Each merchant uses their own gateway account (SADAD, SkipCash, Dibsy). Store payment references and statuses only; never card numbers.
4. **Official WhatsApp only.** All WhatsApp traffic goes through Meta's Cloud API. No WhatsApp Web automation, no unofficial libraries.
5. **Consent before sending.** Any message Alyr starts (a template) goes through the outbound layer, which checks consent, the 24-hour window and the tenant's messaging limit. Modules never call a channel directly.
6. **Secrets.** Never commit tokens or keys. Local values go in `.env` (ignored); production values in Azure Key Vault.

## Layout

```
apps/api/                     FastAPI service (Python 3.13, managed with uv)
  migrations/                 Plain SQL, applied in order by `python -m alyr.migrate`. Never edit an applied one
  src/alyr/channels/          Message channels: Meta Cloud API and the local simulator, same interface
  src/alyr/core/              Inbound path, contact identity, outbound layer (consent, 24-hour window), jobs,
                              sign-in (auth), email (mail), sign-up (onboarding), pricing, back office,
                              team accountability (team, D-028), workspace shell (workspace), templates
  src/alyr/modules/           What answers customers: ledger, orders, bookings, inbox, agent (the owner's
                              weekly view), report.py (weekly report card); router.py picks the module.
                              items/ is the Catalog's engine (what a shop sells: variants, availability,
                              stock log, holds; specs/001-catalog-engine), used by orders at checkout;
                              groups.py holds customer price groups and group prices (specs/003); the
                              Excel and CSV import and export are in specs/006-catalog-import-export;
                              template.py and samples.py give each business type its catalog
                              (specs/008; the words are in src/alyr/presets_catalog.py, and
                              Settings.catalog_for_new_shops decides whether new shops get it)
  src/alyr/routes/            HTTP routes. deps.py: who is calling, which shop, which modules are on
  src/alyr/catalog.py         What ALYR sells: modules and products (D-027)
  src/alyr/db.py              `Database.tenant(id)`: one transaction scoped to one tenant
  src/alyr/seed*.py           The fictional demo shops
  src/alyr/doctor.py          Read-only health check behind `scripts/demo.sh check`
  src/alyr/worker.py          Background job runner
  tests/                      Real PostgreSQL, the simulator, HTTP in and out
apps/web/                     Next.js. Three root layouts, one per route group:
  app/(site)/, (site-ar)/     Public site, English and Arabic (/, /ar, /chat, /ar/chat); words in app/_site/copy.ts
  app/(product)/              Workspace (/app), back office (/ops), sign-in (/login), sign-up (/start),
                              sales demo (/whatsapp), owner view sample (/agent-sample), and the customer pages
                              opened from WhatsApp: order /s, booking /b, payment /pay, tracking /t
  app/(product)/_customer/    Shared frame and styles of the customer pages
  app/(product)/_workspace/   Workspace screens and styles
  app/_agent/                 The owner's weekly view (ALYR Agent)
docs/                         See docs/README.md for what lives where (docs/hygiene.md section 1)
scripts/                      check.sh (everything CI runs), demo.sh (start and check the live demo),
                              api-in-docker.sh, build-site.sh, catalog-browser-check.mjs (the Catalog's
                              screens in a real browser at phone width), catalog-reports-browser-check.mjs
                              (its home cards and the back office's Usage view), hooks/pre-commit
specs/                        One folder per spec; write or update the spec before building
infra/                        Cloud infrastructure as code (proposed in PR #52, not merged)
packages/compliance/          WPS SIF and e-invoice libraries (not created yet)
```

## Running things

```
docker compose up -d                      # PostgreSQL 16 and Redis 7
scripts/cloud-setup.sh                    # instead of the line above where there is no Docker (cloud sessions)
cd apps/api
uv sync
uv run python -m alyr.migrate             # create tables
uv run python -m alyr.seed                # load or reset the demo shop
ALYR_ENV=local uv run pytest              # uses its own alyr_test database; the app defaults to production
uv run ruff check .
uv run uvicorn alyr.main:app --port 8000
uv run python -m alyr.worker              # only when ALYR_JOBS_INLINE=false
cd ../web && pnpm dev                     # http://localhost:3100 (3000 is used by another project); demo at /whatsapp
scripts/api-in-docker.sh uv run pytest -q # where Windows blocks the compiled database driver
```

## Database rules in practice

- Query tenant data only inside `async with db.tenant(tenant_id) as conn`. Outside it, RLS returns no rows.
- New tenant-owned tables copy the pattern in `migrations/0001_core.sql`: `tenant_id` with the `current_setting` default, RLS enabled and forced, the `tenant_isolation` policy, grants to `alyr_app`. `tests/test_tenant_isolation.py` fails if any of that is missing.
- The app role cannot write `tenants` or `channel_numbers`. Creating a tenant is an owner-role action.
- Workspace routes take the tenant from `Depends(current_tenant)` or `Depends(current_staff)` in `routes/deps.py`, which read the session. Never take a tenant ID from the request.

## Conventions

- Modules receive `InboundMessage` and return `OutboundMessage` objects. They do not know which channel is in use, so everything works against the simulator first.
- Every outgoing message goes through `core/outbound.py`, which records it and queues a job; `core/jobs.py` delivers it with retries. Never call a channel or a slow outside service directly from a request: enqueue a job.
- Compliance outputs (SIF files, UBL invoices), when they exist, are tested against golden files in `fixtures/` (to be created with them), byte for byte.
- User-facing text exists in Arabic and English. No hard-coded strings in UI code.
- Amounts are integers in dirhams (1 QAR = 100 dirhams). Never floats.
