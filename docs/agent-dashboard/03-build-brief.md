# ALYR Agent: build brief for phase 2 (the metrics engine and the dashboard)

17 Oct 2026. The creative director's decisions for the product builder. Order of authority: `00-founder-decisions.md`, then this brief, then `01-research.md` (patterns A, insight catalogue B, layout C, things to avoid E), then `02-data.md` (what the data holds).

## 1. The idea

The workspace home becomes the owner's agent: it tells you, in one sentence, how the week is going, lists what needs you now, suggests at most three things with the rule that produced each, and shows what it already did for you. Calm, ruled, honest, in ALYR's brand. It is the screen the founder demos at the counter and the screen the public homepage shows, so it has to be the best screen ALYR has.

## 2. Architecture: one component, two homes

- **Engine (API).** `GET /api/agent?lang=en|ar`, tenant-scoped and role-aware, returns one `AgentView` JSON with every word already rendered in the requested language from fixed templates (as `report.py` does with `headline()` and `core/words.py`). Never assemble Arabic from translated fragments.
- **Component (web).** A presentational `AgentDashboard` that takes `AgentView` (plus a small label dictionary for chrome like "Needs you now") and renders it. It fetches nothing itself. Put it where both route groups can import it without pulling in product-only code, for example `apps/web/app/_agent/`, with its own scoped stylesheet whose colours and type come from CSS custom properties with ALYR defaults (Carbon, Paper, Volt, Instrument Sans, IBM Plex Sans Arabic, IBM Plex Mono). The public site has light and dark themes (`data-theme` on `<html>`, plus `prefers-color-scheme`; see PR #49) and the component must follow whichever theme its host sets. Do the same in the workspace if it has a theme; if it does not, light only, and say so.
- **The workspace home** (`/app`) fetches `/api/agent` on load and on the existing 15 s poll, and renders the component. A poll never re-animates anything.
- **Samples for the public site.** Seed three fictional businesses in `alyr_agent` and capture the real engine's output as JSON fixtures, `apps/web/app/_agent/samples/{bakery,salon,clinic}.{en,ar}.json`:
  - Qirfa Bakery / «مخبز قرفة»: orders, cake tastings by booking, credit accounts, staff Yusuf;
  - a salon: bookings only;
  - a clinic: bookings only.

  Use fictional names only, never real Qatari family names, and give each sample a fixed "now" so the fixtures are stable. The site builder will feed these to the same component. This is what makes the homepage figure a real screen.

## 3. What the engine computes

Follow `01-research.md` B and C exactly, including the minimums.
- **Header:** the date and Doha time eyebrow, the greeting by time of day with the person's first name, a one-sentence summary (A1), and "Updated hh:mm".
- **Needs you now:** tasks 1, 2 and 11, at most 3 rows, each with its count, words and a link to the **filtered** screen.
- **KPI strip:** four numbers chosen by the modules switched on and `business_type` (the table in C). Show the change against the same span last week, as a percentage only when both periods are 20 or more (A2, A3).
- **Suggestions:** at most 3, ordered as in B: tasks, then money, then knowledge, and of two equal insights the one whose action exists. Each carries its title, one supporting line, the rule line ("RULE · …" / its Arabic), the counted rows (ids for a "show me" list), and either an action route or an information-only status line.
- **Done for you this week:** A8, counts only, each linked.
- **The week:** seven days from Sunday. Past days actual, a last-week tick on each, today marked, coming days as slots (booked minutes outlined for bookings).
- **Busiest hours:** a weekday-by-hour grid over 28 days, plus the top cell in words.
- **Top items or services:** five rows with the change in rank.
- **Money owed:** the total and four age segments, the oldest named.
- **Team:** each person's replies, median first answer, open and waiting chats. Not ranked (D-028).
- **Report line:** when the Sunday report goes, and to whom.

Declare the insights in one registry beside the modules (key, rule, minimum, words in both languages, action), so a new rule is one entry. Unit-test every rule at its threshold, in both languages.

**Roles.** Follow what `02-data.md` finds. If agent-role staff must not see money, the engine leaves money out for them and the component lays out without it.

## 4. Small builds the actions need

- **Filtered screens.** Make `/app/orders`, `/app/bookings`, `/app/ledger` and `/app/inbox` accept the URL filters the actions use (for example `?show=unconfirmed`, `?show=unmarked`, `?show=overdue`), so "Show me" lands on exactly the counted rows.
- **"Not now"** on knowledge cards. Hide the card until its numbers change or until Sunday, stored in a small shop-scoped table with RLS. If this grows beyond a small change, leave it out and say so.
- **Remove** the home's endlessly pulsing Volt dot (E7).

## 5. Design

Layout C for desktop and phone, the states (empty, first week, quiet, stale), RTL notes and the signature motion ("the fold closes it": 240 ms 45° clip-path wipe, mirrored; one 6 px rise on first load, once a session; reduced motion shows end states). Rules and whitespace, no tiles, no glow, no count-ups, no red and green alarms, no league tables. Volt only for the first card's button, today's mark and the done tick. Tabular figures, amounts in unbreakable `<bdi>`. Everything in E is forbidden, above all anything that reads as AI: say "By rule", never "I noticed".

## 6. Checks and delivery

- **Tests:** the API tests pass in Docker, including tenant isolation for the new endpoint and any new table.
- **Web:** `pnpm lint` and `pnpm build` pass in `apps/web`.
- **Screenshots** of `/app` home with each seed (bakery, salon, clinic), English and Arabic, at 1440 and 390, plus the empty and first-week states. Save them to `docs/agent-dashboard/shots/` (not committed), using headless Edge (`docs/site-redesign/baseline/shoot.mjs`, profile `C:\t\agentprof`).
- **Docs:**
  - a decision entry for the suite and the Agent (the next free D-number; check `origin/main` right before committing, because other sessions add decisions);
  - `docs/status.md`;
  - a short `docs/agent-dashboard/04-build-log.md` kept as you go.
- **Commits:** commit and log after each stage, so a stall loses little.
- **PR:** push and open a PR. Do not merge or deploy.
