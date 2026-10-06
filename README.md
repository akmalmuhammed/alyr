# Alyr

WhatsApp-native operating tools for small businesses in Qatar.

- Plan: Linear project "Alyr Launch" (team Alyrtech)
- Rules the code must follow: [CLAUDE.md](CLAUDE.md)
- Core platform spec: [specs/000-core-platform/spec.md](specs/000-core-platform/spec.md)

## Run Demo 1 (the credit ledger in a chat)

Needs Docker Desktop, Python 3.13 with [uv](https://docs.astral.sh/uv/), and Node 22 with pnpm.

1. Start PostgreSQL and Redis, from the repo root:

   ```
   docker compose up -d
   ```

2. Create the tables and load the demo shop, then start the API:

   ```
   cd apps/api
   uv sync
   uv run python -m alyr.migrate
   uv run python -m alyr.seed
   uv run uvicorn alyr.main:app --port 8000
   ```

3. In a second terminal, start the web app:

   ```
   cd apps/web
   pnpm install
   pnpm dev
   ```

4. Open http://localhost:3100. The chat simulator is on the left, the shop's workspace on the right.

### The script

1. As **Staff · Yusuf**, send `Ahmed 450 credit`. The sale appears in the ledger.
2. Switch the phone to **Customer · Ahmed Al-Kuwari** and send `كم حسابي؟`. The balance comes back in Arabic.
3. Look at the ageing bar and table: who owes what, and for how long.
4. Press **Send reminders**. Ahmed's chat receives a reminder with a payment link.
5. Open the link and press **Pay**. The chat confirms and the balance drops to zero.
6. Press **العربية** to switch the workspace to Arabic.

**Reset demo** (top right) puts everything back.

The shop, its customers and the payment page are stand-ins. No WhatsApp message is sent and no money moves.

## Tests

```
cd apps/api
uv run pytest
uv run ruff check .
```

Tests need the Docker PostgreSQL running. They create and use their own `alyr_test` database.
