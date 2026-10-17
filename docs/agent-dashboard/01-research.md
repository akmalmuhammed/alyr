# ALYR Agent dashboard and product pages: research

17 Oct 2026. Input for the builders of the workspace home (`/app`), the homepage figure and the pages `/bookings`, `/agent` and `/accounts`. `00-founder-decisions.md` overrides it. The homepage research (`site-redesign/01-design-research.md`) still applies and is not repeated.

**Sources.** **Seen** (rendered today): Stripe Billing and Stripe's homepage, Ramp Bill Pay, Square Appointments, Zoho Bookings, Foodics' homepage and BI page, Atlassian's homepage. **Read** (help centres and docs): Shopify Home, Sidekick Pulse, "admin new look" and merchant forum threads; Square Dashboard; Toast; Stripe's home charts; Fresha; Linear Triage, Pulse and project updates; Ramp Policy Agent; Intercom Fin; Material's RTL guidance. **Reported** (earlier knowledge): Stripe's Today chart, Notion's agent cards, Booksy. Logged-in dashboards could not be rendered, so their layouts come from help text.

---

## A. Patterns worth taking

**A1. One sentence before any number.** *Where:* Linear Pulse puts a daily summary in the inbox (read); Shopify: "every page leads with what matters most" (read); ALYR's report opens each section with a headline (`report.py`). *Why:* an owner at the counter reads one sentence faster than four tiles. *ALYR:* under the greeting, one line from fixed templates, as `headline()` does: "Week so far: 41 orders, QAR 3,120. Up 8 on the same days last week. 2 orders are waiting." Use the two-tone statement: facts in Carbon, the comparison muted.

**A2. Compare like with like.** *Where:* Square compares today with "the same day last week"; Toast offers the previous day, the same day last week or the same day last year (both read). *Why:* in Doha, Friday is not Thursday. *ALYR:* "Week so far" runs from Sunday 00:00 in shop time to now, against the same span last week (the report's week). "Today" is compared with the same weekday last week, never with yesterday.

**A3. Small numbers stay as counts.** *Where:* Shopify shows insights only to stores that average 10 or more orders a week (read). *Why:* "+100%" on 1 → 2 is noise, and noise costs trust. *ALYR:* show a percentage only when both periods are 20 or more; otherwise "7 · last week 4". Every insight in B has a minimum.

**A4. Few suggestions, and each one ends.** *Where:* Shopify shows at most 3 insights a day, which expire after 24 h, and Pulse at most 5 (read); Intercom Fin makes up to 20 on Mondays, which expire after four weeks (read). *Why:* a list that never ends becomes wallpaper. *ALYR:* at most 3 cards. A card leaves when its rule stops being true (visits marked, reminder sent).

**A5. Work apart from knowledge.** *Where:* Shopify's order tasks are counts that cannot be dismissed; its insight cards can be (read). *ALYR:* a "Needs you now" ruled list sits above the suggestions. Its rows cannot be dismissed; they clear when the work is done.

**A6. Show the rule.** *Where:* Ramp's Policy Agent shows its reasons and cites the policy text, and falls back to "Review recommended" when unsure (read). *Why:* it is honest without claiming intelligence, and the owner can check it. *ALYR:* each card ends in a mono line, "RULE · owed 30+ days, no reminder in 7 days · 4 customers"; a tap lists the counted rows. This replaces any "AI" framing.

**A7. One action, to a screen that exists.** *Where:* Linear triage has one key per decision, and its snooze lasts "until a chosen time or new activity" (read); Shopify's tasks open filtered lists (read). *ALYR:* the first card carries the page's only Volt button. Information cards have no button, only a status line with the hollow pending dot ("Messages to many customers need marketing consent. Coming."). Destinations open filtered (`/app/bookings?show=unmarked`); the screens keep their filters in state today, so URL parameters are a small build. "Not now" hides a knowledge card until its numbers change or until Sunday. That needs a small shop-scoped table: `today_snoozes` is back-office only.

**A8. What it did for you, as a ledger.** *Where:* Ramp's agent activity feed shows the decision, the reason and any override (read); Notion shows agent edits as cards (reported). *Why:* it is the weekly proof that the subscription works. *ALYR:* "Done for you this week" lists replies ALYR sent (`messages.sent_by = ''`), booking reminders (`bookings.reminded_at`), payment reminders (templates `payment_reminder*`) and money paid by link. Counts only, mono, each row linked.

**A9. Last week behind this week; the coming days dashed.** *Where:* Stripe draws yesterday faintly behind today (reported); Toast's weekly view gives change against a chosen week (read). *ALYR:* seven bars, Sunday to Saturday. Past days are solid Carbon, last week is a hairline tick on each bar, today carries the one Volt mark, and the coming days are **dashed slots**, the brand's "not yet true". For bookings, a coming slot fills with an outline as far as it is already booked.

**A10. Calm by subtraction.** *Where:* Shopify "removed containers wherever possible" (read); its merchants complain when figures shrink to "a tiny speck" beside promotions (read, forum). *ALYR:* rules and whitespace, no tiles, never a promotion. Nothing moves after the first load.

**A11. On the phone, swipe and tap.** *Where:* in the Shopify app you swipe metrics and tap to open a chart (read); the Square app has a "vs" toggle (read). *ALYR:* the KPI strip scrolls sideways with scroll-snap, two and a half numbers visible; a tap opens that number's week inline.

**A12. Words by type of business.** *Where:* Square's "Explore tools for your unique craft" (seen); D-030 lists "wording by business type" as not built. *ALYR:* `tenants.business_type` picks "orders", "visits", "appointments" or "jobs". The homepage figure switches Bakery / Salon / Clinic on the same component.

**A13. Empty states in the real shape.** *Where:* Shopify swaps metrics for setup tasks while a store is private (read). *ALYR:* C, "States".

---

## B. The insight catalogue

Rules over data ALYR stores today (migrations 0001–0014, `modules/*/report.py`, `core/team.py`). Amounts are in dirhams (`bigint`, `fmt_qar`), and day boundaries use `tenants.timezone`. **O** orders, **B** bookings, **C** credit, **All** inbox. Tasks go in "Needs you now". Proposal: declare insights in `catalog.py` beside each module's `Card`s (key, SQL, minimum, screen, words in both languages), as D-027 intends.

| # | Insight | Fits | Data | Rule | Action |
|---|---|---|---|---|---|
| 1 | Customers waiting (task) | All | `contacts.inbox_status`, `assigned_to`; `messages` | Newest unblocked message from the customer, over 10 min old (D-028). "Nobody on it" when unassigned | **Exists:** `/app/inbox` |
| 2 | Orders not confirmed (task) | O | `orders.status`, `created_at` | `new` for over 15 min | **Exists:** `/app/orders` |
| 3 | Ready, not collected | O | `orders.status`; `activity` (order, `ready`) | `ready` 2 h after its activity row | **Exists:** `/app/orders` |
| 4 | Payment link unpaid | O | `payment_requests` (`status`, `order_id`, `created_at`) | `pending` over 24 h; order not cancelled | **Exists:** `/app/orders`. Resend: information only |
| 5 | Week so far | O | `orders.total`, `status`, `created_at` | Without cancelled orders, Sunday to now, against the same span last week; percent only at 20 or more | **Exists:** `/app/orders` |
| 6 | Regulars gone quiet | O, B | `orders`; completed `bookings`, by `contact_id` | 3 or more orders or visits 31–120 days ago, none in the last 30 | **Information only** (needs marketing opt-in, ALY-44) |
| 7 | Came back | O, B | `orders` by contact | Ordered this week and before it (`repeat`) | Information only |
| 8 | Top item, and the riser | O | `order_items.name`, `quantity` | Top this week; the riser is the biggest increase, 5 or more | Information only |
| 9 | Nobody orders it | O | `products.available`; `order_items.product_id` | No order lines in 30 days while the shop had 30 or more orders | Information only (no menu screen) |
| 10 | Busiest hours | All | `orders.created_at`, `bookings.starts_at`, inbound `messages.created_at` | Weekday by hour over 28 days; name the top 3 | Information only |
| 11 | Visits not marked (task) | B | `bookings.status`, `ends_at` | `booked` and already ended; no-show figures are wrong until they are marked | **Exists:** `/app/bookings` |
| 12 | No-show rate | B | `bookings.status`; `tenants.booking_reminders` | `no_show ÷ (completed + no_show)` over 30 days, 10% or more with 3 or more; say so if reminders are off | Information only (the switch is only in `/start`) |
| 13 | Repeat no-show, booked again | B | `bookings` by contact | 2 or more no-shows in 90 days and booked in the next 7 days | **Exists:** `/app/bookings` |
| 14 | Empty time next week | B | `business_hours`; `bookings` | Booked minutes ÷ open minutes per day over the next 7; flag under 30% | Information only |
| 15 | Booked value ahead | B | `bookings` joined to `services.price` | Next 7 days; hidden while prices are 0 | **Exists:** `/app/bookings` |
| 16 | Late cancellations | B | `activity` (booking, `cancelled`) against `starts_at` | Under 24 h before the start, 3 or more in 30 days | Information only |
| 17 | Client due back | B | completed `bookings` by contact | 3 or more visits; days since the last over 1.5 × their median gap; nothing booked | Information only |
| 18 | Overdue, not reminded | C | `service.summary()`; `ledger_accounts.last_reminded_at`, `promised_until` | Oldest debt 30 days or more, no live promise, no reminder in 7 days | **Exists:** `/app/ledger`, "Send reminders" |
| 19 | Promise passed | C | `promised_until`; `ledger_entries` | Date passed, no payment since the promise | **Exists:** `/app/ledger`, "Send reminders" |
| 20 | Over credit limit | C | `contacts.credit_limit`; balance | `over_limit` | **Exists:** `/app/ledger` |
| 21 | Owed is growing | C | `ledger_entries.kind` | `sale` above `payment` 3 weeks running | **Exists:** `/app/ledger` |
| 22 | Slow first answers | All | `team.performance()` `median_reply_seconds` | 7-day median over 30 min and slower than the 7 days before | **Exists:** `/app/team` |
| 23 | Chats lost, by reason | All | `activity` (`closed`, `outcome = lost`, `reason`) | One reason 3 or more times in 30 days (for example `not_available`) | Information only |
| 24 | Answered after hours | All | `messages` (`direction`, `sent_by`); `business_hours` | Messages outside opening hours, and how many got an automatic reply | Information only; feeds A8 |

**Order:** tasks (1, 2, 11), then money (18, 19, 4, 20), then knowledge. Of two equal insights, keep the one whose action exists. Near a threshold, say less, as Ramp's agent falls back to "Review".

---

## C. The dashboard layout

### Desktop (from 64 rem; 12 columns, content up to 76 rem)
1. **Header** (1–12). Mono eyebrow "TODAY · THU 16 OCT · 16:20 DOHA" (the clock exists), the greeting "Good afternoon, Noor.", the summary line (A1), and "Updated 16:20" at the end, because the page polls every 15 s.
2. **Needs you now** (1–12). At most 3 ruled rows: the count, the words, an arrow to the filtered screen. When empty, "Nothing is waiting" with one Volt tick.
3. **KPI strip** (1–12). Four numbers in one ruled row, divided by vertical rules, no boxes. Each has a mono label, the figure at about 40 px in tabular digits, and a change line ("▲ 8 on last week", or "Last week 33" when small). Each links to its screen.
4. **Suggestions** (1–8): up to 3 cards (A4–A7). **Done for you this week** (9–12): A8.
5. **The week** (1–8): A9's bars. **Busiest hours** (9–12): weekday rows by opening hours in five Carbon tints (never Volt), the top cell in words underneath: "Thursdays 19:00–20:00".
6. **Top items or services** (1–6): five ruled rows with inline bars and the change in rank. **Money owed** (7–12): the total, then one bar in four age segments (0–30, 31–60, 61–90, 90+ days), the oldest named.
7. **Team** (1–12): each person's replies, median first answer, open and waiting chats, and what they look after. By name, not ranked (D-028); unassigned waiting chats get their own row.
8. **Report line:** "Your report goes to 2 numbers on Sunday at 9:00". Information only until a report screen exists (D-030).

### Phone (390 px, one column, 16 px gutters)
The header, with the summary in 3 lines at most → Needs you now → the swiped KPI strip (A11) → suggestions, the first open and the others folded to one line → Done for you → the week → busiest hours as three cells in words, with the grid behind "See all hours" → top items → money owed → team as one row a person. Targets are 44 px or more; nothing sticky except the shell's own bar.

### Adapting to the products switched on
Blocks follow modules (`tenant_modules`), not product keys. In the line-up being built in the working tree (`catalog.py`, migration 0017), Chat and Bookings share the inbox and payment links, and Agent has no module. `business_type` decides which number comes first.

| Product (module) | KPI strip | Week chart | Busiest hours | List |
|---|---|---|---|---|
| Chat (`orders`) | Sales · Orders · Came back · Paid by link | Sales by day | `orders.created_at` | Top items |
| Bookings (`bookings`) | Visits · Booked next 7 days · No-show rate · New bookings | Visits, booked days outlined | `starts_at` | Top services |
| Accounts (`ledger`) | Owed · Collected · Over 60 days · Promised | Collected by day | None | Owed, by age |
| Inbox only | Wrote to you · Waiting · First answer · New customers | Chats by day | Inbound messages | None |

With several products, keep four numbers: two from the main product (a restaurant leads with sales, a salon or clinic with visits, wholesale with money owed), then "Owed to you" if Accounts is on, then "Waiting". Products that are off do not render at all, never as greyed-out upsells.

### States
- **Empty** (no records yet). The setup checklist leads. Below it, the real structure in dashed slots that say what will appear ("Your first order shows here"). No zeros and no empty charts.
- **First week** (`onboarded_at` under 7 days ago). Counts without comparisons: "Comparisons start Sunday 26 Oct". Suggestions are tasks only.
- **Quiet week** (totals under the minimums). One line per product, as the report does ("A quiet week: 3 orders"). No percentages, nothing red. "Done for you" and money owed still show.
- **Stale.** The existing offline line plus "Last updated 16:05". The numbers stay on screen.

### Arabic and RTL
- The summary comes from Arabic templates with `counted()` (`core/words.py`), as `report.py` does, never from translated fragments stuck together.
- Digits are Western and tabular, each amount in an unbreakable `<bdi>`: "QAR 3,120" in English, "3,120 ر.ق" in Arabic.
- Time runs from right to left in Arabic (Material), so the week bars, the hours grid and the age bar mirror. Tick labels stay LTR. Day names come from `DAYS` in `report.py`; the week starts on Sunday in both languages.
- ▲▼ do not mirror; navigation arrows do (`.ico-flip`). Rule lines are in Plex Sans Arabic, with no capitals and no tracking.

### The signature motion: "the fold closes it"
When the owner returns from a suggestion's screen and its rule is no longer true, the card closes along the 45° diagonal: a `clip-path` wipe from the inline-end top corner, 240 ms on `--ease`, mirrored in RTL. "Done for you" then gains a count with one Volt tick, and "Needs you now" steps down once. It is the brand's gesture, used where the Agent proves its worth. On first load the KPI row and the bars rise 6 px along 45° with a 60 ms stagger, once a session and never on a poll. With reduced motion only the end states show.

---

## D. Product page template (`/bookings`, `/agent`, `/accounts`)

**What `/chat` does well, to keep.** A demo with one tab per job in the product's real words, each captioned with one hard fact ("Two customers can never take the same slot"). A flow diagram that follows one message across four lanes, with mechanical "work" lines. "Everything it does today", grouped by audience, with a note on what is built. "Who it's for" rows with tags and an exit, "Run something else?". Captioned samples, no invented metrics.

**The template**, every word in `copy.ts`:
0. **A product bar** under the header (Stripe Billing's sticky bar, seen): "ALYR Bookings · How it works · What's in it · Works with", plus the call to action.
1. **Hero on the Carbon plate.** The name in Latin with an Arabic descriptor, and the state; an H1 that names the result, as Ramp's "A month of AP done in minutes" does (seen); the lead; a tabbed demo; three facts.
2. **How it works, from both sides.** Zoho shows the customer's three steps, then the business's three (seen). Reuse `FlowDiagram` with 2 or 3 stories.
3. **The screen you use every day.** One real workspace screen at true scale, with numbered callouts on hairlines (FIG).
4. **Everything it does today**, then **Not yet** below a dashed rule, each with the pending dot.
5. **Who it's for.** Rows by business type, as Square's "for your unique craft" (seen).
6. **Works with the rest of ALYR.** Ramp's "One platform for every part of finance" and Stripe's "Explore Radar / Tax" links (seen), drawn as ruled rows, not a grid. Each sibling gets its name, one line on what joining adds, and a link. Payroll is a dashed row with no link. The order is always Chat, Bookings, Agent, Accounts, Payroll.
7. **Questions** in `<details>`: "Can I use it on its own?" (Ramp, seen), "How long does setup take?" and "How do I move from what I use now?" (Square, seen).
8. **The closing call**, as on `/chat`.

**`/bookings`.** *Draw:* the booking page (`/b/[slug]`) with its free times; the chat confirmation, reminder and move (`booking_confirmed`, `booking_reminder`, `booking_moved`); the workspace list with came / no-show and who looks after each visit. *Stories:* a customer books; the reminder goes out; the team marks the visit. **Honesty flag:** `bookings_no_overlap` applies to the whole business, so a shop holds **one booking at a time**. The page must not show parallel chairs or per-stylist calendars; they go under "Not yet". Moving a booking has an API but no workspace screen.

**`/agent`.** *Hero:* the dashboard component itself, the same one as on the homepage, with Qirfa Bakery's sample data and a Bakery / Salon / Clinic switch, captioned "FIG · SAMPLE, FICTIONAL BAKERY". *How it works:* "your records → a rule → a card → the screen to act on", with one card opened to show its rule (A6). *Section 3:* the Sunday report as a WhatsApp message (`weekly_report`, REPORT or «تقرير»). *A section of its own, "The rules, in plain words":* six insights from B with their rules, the answer to "how does it know?". *Facts:* included with every product (no price, D-034); rules anyone can check; the data stays in your workspace. *Not yet:* a report screen, choosing the day and hour.

**`/accounts`.** *Draw:* a credit sale recorded from a chat (`entry_recorded`); a reminder with "Pay now" and "I'll pay within a week"; the promise confirmation; the workspace list with ages, "Promised" and "Over limit". *Stories:* record a sale; a reminder whose tone follows the age (gentle, overdue, final); a promise pauses it. *Facts:* payments settle the oldest debt first, as a paper book is read; nobody is reminded twice within 3 days; stop means stop. *Not yet:* live payments through the shop's own provider.

**Linking the suite.** The header's Products menu lists all five, Payroll dashed and without a link. The homepage portfolio links to each page, and each page ends with row 6. Atlassian sells "Collections" over one shared "Teamwork Graph" (seen). That is ALYR's story in Doha words: one workspace and one customer list underneath, with products as bundles of modules (D-027).

---

## E. Things to avoid

1. **Anything that reads as AI.** No "AI", "smart", "learns", "understands", "thinks" or "predicts"; no sparkles, shimmer, "thinking…" loaders, typing dots, avatars or a first-person "I noticed". Write "By rule: …". Zoho's H1 "AI-powered appointment scheduling" and Stripe's AI recommender box (both seen) are what not to copy.
2. **Forecasts.** Show what is booked, never projected revenue (Booksy, reported; Fresha, read).
3. **Scores and alarms.** No health scores, no red and green (Toast), no percentages on small bases, no streak badges.
4. **Staff league tables** (D-028).
5. **Buttons for things not built,** such as "Message all lapsed customers".
6. **Promotions on the home,** like Shopify's undismissable "Discover more" (read).
7. **From today's home:** the Volt dot that pulses forever (`sh-pulse … infinite`; the brand says everything plays once), tile glow, the bento grid, count-ups. Never re-animate on a poll.
8. **Invented results,** like Zoho's "33% increase in lead conversions" (seen).
9. **Yesterday as the baseline,** and weeks starting on Monday.
10. **Parallel bookings, staff calendars or live payments drawn as if they exist.**
