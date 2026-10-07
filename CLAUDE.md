# Alyr

WhatsApp-native operating tools for small businesses in Qatar. One multi-tenant core, with modules switched on per merchant.

What we are building and why, including what we decided not to build: [docs/master-plan.md](docs/master-plan.md). Read it before proposing new features.

Plan and tasks live in Linear, team `Alyrtech`, project `Alyr Launch`. Work one issue per branch; name the branch after the issue (`aly-12-...`). Phases, not dates: a phase is finished when its demo works.

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
apps/api/                   FastAPI service (Python 3.13, managed with uv)
  migrations/               Plain SQL, applied in order by `python -m alyr.migrate`
  src/alyr/channels/        Message channels: Meta Cloud API and the local simulator, same interface
  src/alyr/core/            Inbound path, outbound layer, Arabic normaliser
  src/alyr/modules/ledger/  Module B: credit ledger and reminders
  src/alyr/routes/          HTTP routes
  src/alyr/db.py            `Database.tenant(id)`: one transaction scoped to one tenant
  src/alyr/seed.py          The demo shop (fictional)
  tests/
apps/web/                   Next.js: Demo 1 page (chat simulator + ledger) and the stand-in payment page
packages/compliance/        WPS SIF and e-invoice libraries (not created yet)
specs/                      One folder per spec; write or update the spec before building
infra/                      Bicep for Azure Qatar Central (not created yet)
```

## Running things

```
docker compose up -d                      # PostgreSQL 16 and Redis 7
cd apps/api
uv sync
uv run python -m alyr.migrate             # create tables
uv run python -m alyr.seed                # load or reset the demo shop
uv run pytest                             # uses its own alyr_test database
uv run ruff check .
uv run uvicorn alyr.main:app --port 8000
cd ../web && pnpm dev                     # http://localhost:3100 (3000 is used by another project)
```

## Database rules in practice

- Query tenant data only inside `async with db.tenant(tenant_id) as conn`. Outside it, RLS returns no rows.
- New tenant-owned tables copy the pattern in `migrations/0001_core.sql`: `tenant_id` with the `current_setting` default, RLS enabled and forced, the `tenant_isolation` policy, grants to `alyr_app`. `tests/test_tenant_isolation.py` fails if any of that is missing.
- The app role cannot write `tenants` or `channel_numbers`. Creating a tenant is an owner-role action.

## Conventions

- Modules receive `InboundMessage` and return `OutboundMessage` objects. They do not know which channel is in use, so everything works against the simulator first.
- Every outgoing message goes through `core/outbound.py`, which also records it in `messages`.
- Compliance outputs (SIF files, UBL invoices) are tested against golden files in `fixtures/`, byte for byte.
- User-facing text exists in Arabic and English. No hard-coded strings in UI code.
- Amounts are integers in dirhams (1 QAR = 100 dirhams). Never floats.
