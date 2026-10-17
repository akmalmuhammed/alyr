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

### Stage 1 · combination pricing (the founder's decision, 17 Oct)

- **The rule:** the first product is from QAR 449, and each product a business adds is QAR 150. So Chat + Bookings is 599, adding Accounts is 749, and Agent is included at QAR 0.
- **Migration 0018:**
  - the price list accepts a new rule, `extra_product`;
  - a new item "Each extra product" at QAR 150;
  - Accounts goes from QAR 0 to QAR 449, only if nobody had changed it.
- **`pricing.draft_lines`:** charges the dearest product at its own price and every other at the extra price, named "…, added product".
- **Back office:** the price-list screen names the new rule.
- **Recorded:** D-035 and `status.md`.
- **Also in this stage:**
  - `team.performance()` and `ledger.summary()` take an optional `now`, so the Agent's samples can be read at a fixed moment;
  - the Qirfa seed uses the lost-chat reasons the inbox records (`no_reply`, not an invented one).
- **Checks:** 264 API tests pass; eslint and tsc are clean.
