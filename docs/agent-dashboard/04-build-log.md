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

### Stage 5 · the salon, the clinic and the sample screens

- **`alyr.seed_bookings`:** Sadaf Salon («صالون صدف») and Ruwaa Dental Clinic («عيادة رؤى للأسنان»). Both take bookings only, from the salon and clinic presets.
  - **The diary:** eight weeks, filled one customer at a time, as the shop's single-booking rule requires. The days ahead fill as lead times allow.
  - **What happens in it:**
    - no-shows, two of them from regulars who missed twice and are booked again;
    - late cancellations, reminders, regulars, a few who went quiet and customers due back;
    - questions in each trade's words, answered by a person;
    - two customers waiting now.
  - **Both reuse the bakery's helpers.** `seed_qirfa.Bakery` now reads its number, slug and fastest responder from the instance, and its contact states and stored report follow the copy's own moment.
  - **Other states:** `days=0` gives an empty business, and a few days a business in its first week.
- **`alyr.agent_samples`:** seeds all three at a fixed moment, Thursday 15 Oct 2026, 16:20 Doha. It reads each owner's real `AgentView` and writes `apps/web/app/_agent/samples/{bakery,salon,clinic}.{en,ar}.json`. Two runs give byte-identical files.
- **Tests:** `tests/test_agent_samples.py` checks that:
  - each sample comes out the same every time and has nothing that can reach a phone;
  - the empty state works;
  - the committed fixtures match the engine's version and shape and contain no AI words.

### Stage 6 · checks, screenshots and docs

- **Screenshots:** in `docs/agent-dashboard/shots/`, not committed. Taken with headless Edge (profile `C:\t\agentprof`), signed in as each sample's owner, on today's data.
  - Each sample in English and Arabic, at 1440 and 390: `{bakery,salon,clinic}-{en,ar}-{1440,390}.png`.
  - The empty and first-week states: `salon-empty-en-1440.png`, `salon-first-week-en-1440.png`.
  - The agent role: `bakery-agent-role-en-1440.png`.
  - Dark: `bakery-dark-en-1440.png`.
- **Checks:**
  - API: 347 tests pass in Docker, including tenant isolation for `agent_snoozes` and the endpoint; ruff is clean.
  - Web: `pnpm lint` and `pnpm build` pass (built into `.next-build`, then removed).
- **Docs:** D-035 records the dashboard; `status.md` and the lane brief are updated.
- **Not checked:**
  - The Arabic wording by a native speaker.
  - Screen readers beyond the semantic structure (headings, a real table, `aria-label` on each day of the week).
  - Lighthouse or axe on `/app`.
  - Safari: container queries and `clip-path` keyframes are standard but untested there.
  - Running the migrations on any database but this session's own.

## Fix pass (05-critique.md, 17 Oct)

### Fix 1 · the engine and the samples

**The summary and the numbers (P0-1).**
- The summary names its measure and uses the numbers' own figures: "Orders up 11%, sales up 20% on the same days last week".
- With fewer than 20, it gives counts instead: "By this time last week: 13 visits".
- It says "2 orders need confirming", not "waiting".
- A number's change is "▲ 20%", and one caption sits on the strip: "Against Sunday to 16:20 last week".
- Values come apart from their unit, so "QAR" can be drawn small (P1-5).

**The week (P0-2):**
- Today carries `last_by_now` (last week up to the same time) as well as the full day.
- Days ahead carry `booked`, a count on the same axis ("3 booked").
- A weekday with no opening hours is `closed`, and days before the business joined are `before`.
- The title is "By day", with no total (P1-3).

**Arabic (P0-5):**
- Verbs and pronouns agree with the count through `agree()`.
- Every name and figure is a `{b}` part.
- A sentence about an order reads "الطلب #1436 للعميل Aisha I.".
- The greeting uses the person's Arabic name (migration 0020, `users.name_ar`), so it reads "مساء الخير يا هدى".
- A singular noun bug ("زيارةة") is fixed.

**Setup (P1-2):** once a business has records, setup left to do is one row in Needs you now ("2 setup steps left for ALYR Chat · Connect your WhatsApp number"). Only owners and admins see it.

**Duplicates (P1-3):**
- "Waiting now" left the numbers; "Came back this week" and "New bookings this week" take its place.
- A person counted by a card above is not counted again, and a card left with nobody is dropped.

**Ordering:**
- The main product's rules come first within knowledge, so the bakery's third card is about its regulars, not tastings.
- "Booked value" always comes last.
- Volt goes only on a money card (P1-10).

**Words (P1-8):**
- "QAR 3,400 owed 30+ days, not reminded in 7 days".
- The consent status line uses the critique's wording.
- No-shows read "2 of 15" until there are 20.

**States (P1-10):** busiest hours wait for 50 events. Rank changes wait for a previous period. The quiet week reads "3 orders so far; 4 by this time last week".

**Polish (P2):**
- Age labels read "Over 90 days".
- Under the owed total: "QAR 1,946 more than a week ago".
- "today at 16:15" instead of a weekday name.
- The no-show rate is rounded once, so the card and the number agree.

**Samples (P1-9 and the founder's decision):**
- Sadaf is a women's salon with its own menu and women customers.
- The third sample is now **Nasma Cooling** («نسمة للتكييف»), an AC repair and maintenance company. It replaces the dental clinic, because of PDPPL health data.
  - Services: split-unit service, repair, gas top-up, villa duct cleaning, a yearly visit.
  - Jobs are assigned to two technicians, with notes such as "Majlis AC not cooling".
  - A household comes back at most twice, 21 days apart.
  - Friday is closed.
  - Three customers are on maintenance contracts (credit accounts).
- The clinic preset stays in the product.
- Fixtures are now `{bakery,salon,homeservices}.{en,ar}.json`, recaptured.
- The samples leave out "paid through ALYR links", since there is no payment provider yet (ALY-17); the product keeps it.

**Local-only `ALYR_AGENT_CLOCK`:** reads the Agent at a fixed moment, so screenshots can be taken on a weekday.

**Tests:** rewritten for all of the above. 353 API tests pass.

### Fix stage 2 · the dashboard redrawn, and showcase mode

**Hierarchy and layout (P1-1, P1-7):**
- The summary is the headline (28 px, 24 on a phone). The greeting, date and "Updated" move into one eyebrow line.
- One hero number (56 px, 40 on a phone); the others are 28 px with the unit at half size. The numbers share the sections' twelve columns, and their labels, values and changes line up across (subgrid).
- Order: Needs (8) beside Done (4); the numbers; Suggestions (8) beside a compact week (4); hours, top and owed in thirds; the team at most 48 rem, one line per person.
- Done's counts share one right-aligned column, wider when a sum needs it.

**Type and spacing (P0-3, P1-6):**
- The reset selectors carry one class of weight (`.ag :where(ul, ol)`), so every rule after them wins and a host's bare element styles do not. What the host puts in the setup slot keeps its own styles.
- Sizes 11/13/15/18/28/56, spacing on 4 and 8, 56 px between sections. Figures are Instrument Sans with tabular digits; mono is for labels and rules only.
- One strong rule, above Needs; 10% hairlines everywhere else. Small text is ink-2.

**Charts (P1-4):**
- The week: bars 56% wide (40 px at most) on one baseline, 88% ink (78% in dark). Last week is a 10% ghost behind each day.
- Today has a 3 px Volt cap, a tick at last week's figure to this time, and last week's whole day as a 12% ghost. Only today's value shows; the rest are in screen-reader sentences.
- Days ahead: last week as a dashed outline, and what is booked as a lighter bar with its count. Today's bookings still to come sit on top of what is done. A closed day says "Closed"; a day before the business joined is left empty. The legend lists only what is drawn.
- Busiest hours: 4% empty cells with no outline, 2 px gaps, closed hours blank. The top three are words on a phone and screen-reader text on desktop.
- Top items: 4 px bars, a "Rank vs previous 28 days" heading, 9 px triangles read as "up" or "down".

**Cards and states (P1-8, P1-10, P1-11):**
- "Who (n)" opens the list. A folded card on a phone has a chevron button; the title is a plain heading. On desktop every card is open and the toggles are not drawn.
- The empty state draws dashed outlines of the week, the hours and a list, captioned; "Nothing is waiting" has no Volt tick before anything has happened.
- Ids come from `useId()`; the rise is no longer frozen by `useState(animate)` (P2-6). Number ranges stay left to right in Arabic (P2-4).

**Showcase mode (P0-6):** `mode="showcase"`, `headingLevel` and `link` props.
- Links are plain text unless the host passes a link component. No "Not now", "Updated", stale line, team, report or setup.
- The eyebrow is the moment ("Thursday · 16:20"); "Who (n)" still opens; the figure rises once when it comes into view.
- `/agent-sample` (noindex, under the product layout) shows the three samples, `?sample=` and `?lang=ar` pick one.

**Workspace (P0-4, P1-2):**
- The full setup checklist shows only while the business is empty and only to managers, inside the Agent under the header. Otherwise setup is a row in Needs.
- The ALYR team box reads "A person from ALYR reads every message." After sending, one status line: "Sent to the ALYR team. We answer on WhatsApp or by email." No bubbles, no ticks.

**Engine:** placeholders carry their shape; the samples leave out the setup row; the week's maximum includes today's bookings on top of what is done; no last-week tick before a business joined; a "Booked" legend; "Until it is marked, the no-show figures are short."

**Checks:** 353 API tests and ruff; eslint and tsc are clean. Screenshots are in `docs/agent-dashboard/shots/` (not committed), taken with the API's Agent clock at Thursday 15 Oct, 16:20 Doha:
- workspace: the bakery in English and Arabic at 1440 and 390; the salon and the AC company in English at 1440 and Arabic at 390; the bakery in dark and as the agent role; the salon empty and in its first week (1440 and 390);
- showcase: `showcase-{bakery,salon,homeservices}-{en,ar}-{960,390}.png`, and the bakery in dark.
