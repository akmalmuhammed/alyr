# Alyr

WhatsApp-native operating tools for small businesses in Qatar.

- Plan: Linear project "Alyr Launch" (team Alyrtech)
- Rules the code must follow: [CLAUDE.md](CLAUDE.md)
- Core platform spec: [specs/000-core-platform/spec.md](specs/000-core-platform/spec.md)

## Run the API locally

Needs Python 3.13 and [uv](https://docs.astral.sh/uv/).

```
cd apps/api
uv sync
uv run pytest
uv run uvicorn alyr.main:app --reload
```

Then open http://127.0.0.1:8000/docs.

Try the simulator channel without WhatsApp:

```
curl -X POST http://127.0.0.1:8000/sim/messages -H "content-type: application/json" -d "{\"from_number\": \"97455500001\", \"text\": \"hello\"}"
```

## Local services

```
docker compose up -d
```

Starts PostgreSQL 16 and Redis 7. Copy `.env.example` to `.env` first.
