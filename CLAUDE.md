# Alyr

WhatsApp-native operating tools for small businesses in Qatar. One multi-tenant core, with modules switched on per merchant.

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
apps/api/            FastAPI service (Python 3.13, managed with uv)
  src/alyr/channels/ Message channels: Meta Cloud API and the local simulator, same interface
  src/alyr/core/     Inbound handling shared by all modules
  src/alyr/routes/   HTTP routes
  tests/
apps/web/            Next.js merchant workspace and chat simulator (not created yet)
packages/compliance/ WPS SIF and e-invoice libraries (not created yet)
specs/               One folder per spec; write or update the spec before building
infra/               Bicep for Azure Qatar Central (not created yet)
```

## Working on the API

```
cd apps/api
uv sync
uv run pytest
uv run ruff check .
uv run uvicorn alyr.main:app --reload
```

Local Postgres and Redis: `docker compose up -d` from the repo root.

## Conventions

- Modules receive `InboundMessage` and return `OutboundMessage` objects. They do not know which channel is in use, so everything works against the simulator first.
- Compliance outputs (SIF files, UBL invoices) are tested against golden files in `fixtures/`, byte for byte.
- User-facing text exists in Arabic and English. No hard-coded strings in UI code.
- Amounts are integers in dirhams (1 QAR = 100 dirhams). Never floats.
