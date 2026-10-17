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

### Stage 2 · the engine

- **`GET /api/agent?lang=en|ar`** returns one `AgentView`, with every word already rendered. The engine is `apps/api/src/alyr/modules/agent/`:
  - `facts.py` reads everything the rules need, in the business's own scope, at a given moment.
  - `insights.py` is the registry: 20 rules from the research catalogue B, each with its rule in words, both languages, and an action route or a status line.
  - `view.py` assembles the view: the header and summary (A1), Needs you now, the four numbers (C), up to 3 suggestions, Done for you, the week, busiest hours, top items or services, money owed by age, the team, and the report line.
  - `words.py` holds the shared wording. A figure stays whole as `{"b": …}`, which the screen wraps in `<bdi>`.
- **Choices made:**
  - **Money and "Not now":** the agent role gets the view without money (no sales, owed, collected, amounts or report line) and cannot set cards aside.
  - **Percentages:** only when both weeks count 20 or more.
  - **States:** empty, first week (no comparisons, cards with actions only), quiet (fewer than 5 this week and last), normal.
  - **The money rule for open payment links:** it counts only links on orders not yet collected. An order collected and paid in cash keeps an open link, because cash at the counter is not recorded.
  - **"Booked value ahead":** placed last; it never needs doing.
  - **Insight 24 (answered after hours):** not built. Its count would feed Done for you; it can follow.
- **Small builds:**
  - **"Not now":** migration 0019 `agent_snoozes`, with row-level security, and `POST /api/agent/not-now`, owners and admins only. A card stays hidden until its numbers change (a fingerprint of its rows and figures) or until Sunday.
- **Qirfa seed:**
  - orders are collected within hours;
  - two orders are left unconfirmed right now.
- **Tests:** `tests/test_agent.py` checks:
  - every rule just short of its threshold and at it, in English and Arabic, with no AI words;
  - the four numbers, the role rule, the states, ordering and "Not now";
  - the endpoint on the real path, including that another business sees none of these numbers.
  - 338 API tests pass.
