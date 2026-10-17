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

### Stage 3 · the dashboard component and the workspace home

- **`apps/web/app/_agent/`:**
  - `AgentDashboard.tsx` is presentational and fetches nothing. Both route groups can import it.
  - `types.ts` holds `AgentView` and `labels.ts` the chrome words, in English and Arabic.
  - `agent.css` is scoped to `.ag`. Every colour and face is an `--ag-*` custom property with ALYR's defaults (Carbon, Paper, Volt, Instrument Sans, Plex Sans Arabic, Plex Mono).
- **Theme:** dark follows `prefers-color-scheme` unless the host sets `data-theme="light"`, and `data-theme="dark"` forces it. That is the public site's convention (PR #49). The workspace follows the system in light and dark, as its shell does, and maps the `--ag-*` properties to its own tokens.
- **Layout C:**
  - header and summary (two tones);
  - Needs you now;
  - the four numbers in one ruled row;
  - suggestions with their rule line, "Show me" and "Not now";
  - Done for you as a ledger;
  - the week (last week as a hairline tick, today's Volt corner, coming days dashed, booked days outlined);
  - busiest hours in five Carbon tints;
  - top items with the change in rank;
  - money owed by age;
  - the team by name;
  - the report line.
- **Phone layout:** at 48 rem the component switches by container query, not viewport, because the workspace sidebar takes 16 rem.
  - The numbers scroll sideways with snap.
  - Suggestions after the first fold to their title.
  - Busiest hours become three lines, with the grid behind "See all hours".
  - The team shows one block per person.
- **RTL:** the week, the hours and the age bar mirror; arrows flip; ▲▼ do not.
- **Motion:**
  - On the first load of a session, the numbers and bars rise 6 px along 45° with a 60 ms stagger. A poll or a language switch never re-animates.
  - A suggestion whose rule stops being true closes with a 240 ms 45° `clip-path` wipe from the inline-end top corner, mirrored in RTL.
  - With reduced motion, only end states show.
- **Home (`/app`):**
  - The price waiting for an answer and the setup checklist lead, then the dashboard, then the help box. The setup checklist keeps its existing look.
  - Removed: the count-up tiles, the pointer glow and the bento grid.
  - The live dot pulses once, not forever (E7).
- **Left for later:**
  - A11's tap to open a number's week inline: the numbers link to their screens instead.
  - A sticky stale banner: the offline line and "Updated" sit above the numbers.

### Stage 4 · filtered screens

- `/app/inbox`, `/app/orders`, `/app/bookings` and `/app/ledger` take `?show=` and list exactly the rows the rule counted, under a line naming the filter with "Show all".
  - **Inbox:** `waiting`.
  - **Orders:** `unconfirmed`, `ready`, `unpaid`, `paid`.
  - **Bookings:** `unmarked`, `no_show`, `repeat_no_show`. These look back 90 days, since the screen normally loads only the coming week.
  - **Credit accounts:** `overdue`, `promised`, `promise_passed`, `over_limit`.
- The filters apply the same rules as the engine. The ledger summary now marks a customer whose promised date passed (`promise_passed`).
- "Not now" was small enough to build (stage 2).
