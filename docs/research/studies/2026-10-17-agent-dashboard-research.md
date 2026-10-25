# ALYR Agent dashboard and product pages: pattern research

| | |
|---|---|
| **Category** | marketing |
| **Date** | 2026-10-17 |
| **Status** | Partly superseded |
| **Where it lives** | `docs/agent-dashboard/01-research.md` on main |
| **Lane** | Product |

## Question it answered
How should the workspace home (the ALYR Agent dashboard) and the new product pages (`/bookings`, `/agent`, `/accounts`) be laid out, and which insights can the dashboard honestly show from data ALYR already stores?

## Key findings
- Sources: pages rendered on the day (Stripe Billing and Stripe's homepage, Ramp Bill Pay, Square Appointments, Zoho Bookings, Foodics, Atlassian), help centres read (Shopify Home and Sidekick Pulse, Square Dashboard, Toast, Fresha, Linear, Ramp Policy Agent, Intercom Fin, Material's RTL guidance), and a few from earlier knowledge (Booksy, Notion). Logged-in dashboards could not be rendered, so their layouts come from help text.
- 13 patterns to take. The main ones: one sentence before any number (Linear Pulse, Shopify); compare like with like, today against the same weekday last week and the week so far against the same span (Square, Toast); show a percentage only when both periods are 20 or more (Shopify shows insights only to stores averaging 10+ orders a week).
- Few suggestions, each of which ends. Shopify caps insights at 3 a day and expires them after 24 h, Pulse at 5; Intercom Fin makes up to 20 that expire after four weeks. ALYR: at most 3 cards, each gone when its rule stops being true. Tasks ("Needs you now") sit apart and cannot be dismissed.
- "Show the rule" replaces any AI framing. Each card ends with a mono line such as "RULE · owed 30+ days, no reminder in 7 days · 4 customers", modelled on Ramp's Policy Agent citing its policy text. One action per card, to a screen that exists. Anything not built is information without a button.
- "Done for you this week" is a ledger of what ALYR sent (replies, booking and payment reminders, money paid by link). It is the weekly proof that the subscription works (after Ramp's agent activity feed).
- An insight catalogue of 24 rules over data stored today, each with a minimum and an action. Examples: customers waiting over 10 min, orders not confirmed after 15 min, visits not marked, no-show rate 10%+ with 3+, regulars gone quiet (3+ orders 31 to 120 days ago, none in 30), overdue and not reminded, promise passed, over credit limit. Order: tasks, then money, then knowledge.
- A full desktop and 390 px phone layout; KPI sets per product (Chat, Bookings, Accounts, inbox only); empty, first-week, quiet-week and stale states; Arabic and RTL rules; one signature motion (a card closes along the 45° fold when its work is done).
- A product page template: product bar, hero on Carbon with a tabbed demo, how it works from both sides, the real screen with callouts, everything it does then "Not yet", who it is for, works with the rest of ALYR, questions, closing call.
- Honesty flag: Bookings takes one booking at a time per business, so no parallel chairs or per-stylist calendars may be drawn.
- Avoid list: AI words and sparkles, forecasts, health scores and red/green, staff league tables, buttons for unbuilt things, promotions on the home, a dot that pulses forever, invented results (Zoho's "33% increase in lead conversions"), yesterday as the baseline, weeks starting on Monday.

## What we decided because of it
- D-035 (17 Oct): the founder decisions in the same folder. ALYR is a suite led by ALYR Agent, the workspace home becomes the Agent dashboard, no AI words, every suggestion links to something that exists.
- D-037 (17 Oct): real screens only; section D's template adopted for every product page; no "paid through ALYR links" on samples.
- D-038 (17 Oct): the Sunday report card reuses the dashboard's comparison rules (same days, percentage only at 20 or more).

## What changed since, and conflicts
- The Bakery / Salon / Clinic switch: D-037 replaced the clinic with an AC company and keeps clinics off the site until the lawyer has looked at health data (ALY-51).
- Payroll as a dashed "coming" row in menus and "works with" rows: removed by D-039 and D-046. The order is now Chat, Bookings, Agent, Accounts, Shelf, Docs (D-046).
- "FIG · SAMPLE, FICTIONAL BAKERY" captions: replaced by a single "Sample" mark (founder, 24 Oct, recorded in brand.md).
- "Rule" wording: the product keeps "RULE ·", but D-048 makes the homepage say "reason" or "why" ("Why ·", "Needs a look").
- The homepage direction (the dashboard as the headline) was reframed by D-056 (lead with the owner's problem) and D-048 ("The tech team your business never had."). The dashboard stays on the homepage as proof, not as the headline.
- `02-data.md` (same folder) checks the catalogue's data in detail and adds gaps this file does not name: cash at the counter is not recorded, and payments run on a test page only.

## Use it for
- Before changing the ALYR Agent dashboard, its insights or thresholds, or adding a new insight: the catalogue in section B and the layout and states in section C.
- Before building or reworking any product page: section D's template and per-page notes.
- When someone proposes AI framing, forecasts or scores: section E.
