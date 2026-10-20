# ALYR

WhatsApp-native operating software for small businesses in Qatar and the GCC: bookings, orders,
payment links, tracking and a team inbox on the shop's own WhatsApp number. One multi-tenant
core with modules switched on per shop. Company: Alyr Technology (ألير للتكنولوجيا). Proprietary;
see [LICENSE](LICENSE).

**Start here:** [CLAUDE.md](CLAUDE.md) (rules), [docs/README.md](docs/README.md) (every document),
[docs/status.md](docs/status.md) (where things stand), [docs/hygiene.md](docs/hygiene.md) (how we work).

## Run it on your machine

Needs Docker, [uv](https://docs.astral.sh/uv/) and pnpm.

```bash
docker compose up -d                     # PostgreSQL 16 and Redis 7, on this machine only
cp apps/api/.env.example apps/api/.env   # ALYR_ENV=local; fill in other values only if you need them
cd apps/api && uv sync && ALYR_ENV=local uv run python -m alyr.migrate && ALYR_ENV=local uv run python -m alyr.seed
ALYR_ENV=local uv run uvicorn alyr.main:app --port 8000
cd ../web && pnpm install && pnpm dev    # http://localhost:3100
```

| Address | What it is |
|---|---|
| localhost:3100 | Public site (company homepage) |
| localhost:3100/whatsapp | Sales demo: chat simulator beside the workspace screens |
| localhost:3100/app | Workspace (open as the demo shop's owner on a local machine) |
| localhost:3100/ops | ALYR back office |
| localhost:8000/docs | API docs (local only) |

On Windows machines where Smart App Control blocks the database driver, run the API and tests
through `scripts/api-in-docker.sh`. For a live WhatsApp demo on the founder's laptop:
`scripts/demo.sh up`.

## Before a pull request

```bash
scripts/check.sh
```

It runs everything CI runs (lint, tests, types, dependency audits, build) and turns on the
pre-commit hook that blocks secrets and personal documents. Fill in the PR template honestly.
Security problems: [SECURITY.md](SECURITY.md).
