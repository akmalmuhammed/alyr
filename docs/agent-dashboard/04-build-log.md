# ALYR Agent: build log

ALY-99, branch `aly-agent-dashboard`. One entry per stage, newest last, so a stalled session loses little. The spec is `03-build-brief.md`; the data behind it is `02-data.md`.

## Phase 1 · 17 Oct · commit 0035414

- **Product line-up in the catalogue (D-035):** Chat and Bookings share the inbox and payment links, Agent is included, Accounts is the ledger, Payroll is coming. Migration 0017 brings the price list and setup requests to the new keys.
- **`02-data.md`:** what the Agent can compute today.
- **`alyr.seed_qirfa`:** the sample bakery.
- **Checks:** 263 API tests pass in Docker; ruff, eslint and tsc are clean.

## Phase 2

### Stage 0 · the spec

- Committed `01-research.md` and `03-build-brief.md` as the coordinator asked.
- `origin/main` has not moved since the branch was cut, and D-035 is still free there.
