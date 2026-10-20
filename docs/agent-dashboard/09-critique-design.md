# ALYR suite site: design critique

17 Oct 2026. An independent review of PR #53 on the built site (`localhost:3105`): ten pages at 1440 × 900 and 390 × 844 (spot checks at 1366, 1024 and 320), both languages, both themes, reduced motion. Screenshots are in `review-site/design/`. Motion was timed with `--eval` probes, and headings, landmarks, targets and overflow were audited the same way. I edited no code.

**Verdict.** The site is close. The type, the Carbon plate, the FIG captions and the ruled rows are unmistakably ALYR, and the real dashboard beside a ticked feed is the right way to make "agent" felt. Five things hold it back:
- The first screen never shows a rule.
- The feed's best moment lands below the fold.
- The entrance plays out of order.
- The phone's first screen has no agent in it.
- All ten pages share one English social card.

**Counts: 1 P0, 8 P1, 16 P2.**

---

## P0: must fix before publishing

**P0-1 · The hero implies AI by leaving the rule out**
- *Where:* `/` and `/ar`, hero, all widths (`h-en-1440-L-hero.png`, `h-en-1366-L-hero.png`, `h-en-390-L-hero.png`).
- *Wrong:* 06 §1 says "agent" never carries a sentence alone: the same screen shows a "RULE ·" line or says "by rules you can check". The first screen shows an H1 ending "an agent", a "Running" chip and a stream of actions with no person in them, which reads as an AI agent in 2026. The only rule line is the fifth feed event:
  - at 1440 × 900 it sits at y ≈ 990, below the fold;
  - at 1366 × 768 only two events show;
  - on a phone it is two screens down.

  The body never says "rules".
- *Fix:*
  1. Body: "…and shows you what needs you, by rules you can check." Arabic, for native review: «…ويُظهر لك ما يحتاجك، بقواعد واضحة تستطيع مراجعتها.»
  2. Make the flag and its RULE line visible in the first screen: newest event on top (P1-1), or the flag as the second event.

---

## P1: should fix

**P1-1 · Half the feed plays below the fold, oldest first**
- *Where:* `/` hero at 1440 × 900 and 1366 × 768 (`h-en-1440-L-hero.png`, `h-en-1366-L-hero.png`).
- *Wrong:* the plate starts at y = 513. Visitors see events 1 to 3 and miss the order page and the flag. A feed that grows at the bottom pushes its news out of sight.
- *Fix:*
  - Prepend new events, entering from `translate: 0 -6px`. Keep four rows and fade the oldest under a mask.
  - At `(max-height: 56rem)`: `.hero` padding-top 3 → 1.5 rem, `.hero-grid` padding-top 1.5 → 0, `.hero-facts` and `.afig-hero` margin-top 3 → 1.5 rem. That saves about 96 px, so the plate starts near y = 417.

**P1-2 · The entrance plays out of order** (`h-en-1440-L-t0.png`, `h-en-1440-L-t500.png`)
- *Wrong:*
  - `hp-window` only translates, so the white window is painted on the bare canvas from frame one. The plate then fades in behind it through a muddy grey.
  - Timings measured: the feed starts on hydration ("playing" at 271 ms). The dot's one-time light therefore runs from 271 to 990 ms, but the chip only fades in from 900 ms, so the signature dot lights while invisible. Event 1 (864 ms) arrives before the "Running" chip.
  - The server renders "Done for you 183 / 7". Hydration resets it to 179 / 6 (295 ms) while the window is visible at the fold. On a slow phone the count visibly goes down, then up.
- *Fix:*
  - Sequence: plate at 0 ms (opacity and 45° travel), window at 240 ms with opacity, chip at 700 ms with `af-light` delayed to match. First event ≥ 1,100 ms after navigation: `play(length, Math.max(300, 1100 - performance.now()))`, with a 700 ms step.
  - Count: move `data-phase` to the `<figure>` and hide the values until play: `.motion .afig-hero[data-phase="composed"] .ag-ledger-value { visibility: hidden }`. The failsafe still shows them without scripts.

**P1-3 · `/agent`'s switch stops replaying after 4 s**
- *Where:* `/agent`, `/ar/agent` (`a-en-1440-L-switch.png`).
- *Wrong:* `moving()` checks the `motion` class, and the 4 s failsafe removes it on pages without `HomeMotion`. Measured: "Salon" clicked at 6.2 s went straight to "composed". So "plays again on a switch" never happens for a real visitor.
- *Fix:* test only `prefers-reduced-motion`, or clear `window.__alyrMotion` in `AgentFigure`'s effect.

**P1-4 · No agent in the phone's first screen, and the feed card collides with the window**
- *Where:* `/`, `/ar` at 390 and 320 (`h-en-390-L-hero.png`, `h-en-390-L-feed.png`, `h-ar-390-D-feed.png`, `w320-en-L-feed.png`).
- *Wrong:*
  - At 390 × 844 the body runs five lines, the facts take three rows (130 px), and the window starts at y = 650, with the feed about 1,000 px lower.
  - The feed card's −3 rem overlap cuts through the KPI labels. At 320 it covers the "7 booking reminders" row it is meant to keep in view.
- *Fix:* below 48 rem:
  - Feed card first (chip and three compact events), then the window, as `/agent` does.
  - The facts as one wrapped line under the figure.
  - End the crop after "Done for you": `.afig-hero .ag-kpis-block { display: none }`.

**P1-5 · The same screen twice in a row**
- *Where:* `/` hero, then the spotlight (`h-en-1440-L-hero2.png` → `h-en-1440-L-agent2.png`).
- *Wrong:* the same bakery, minute, sentence and Needs rows. The second look adds nothing until the switch is found.
- *Fix:* open the spotlight on Salon (`order={["salon","bakery","homeservices"]}`), or follow 06 §2.4's fallback: one interactive figure only.

**P1-6 · Product pages on phones show half of "the screen"**
- *Where:* `/bookings`, `/accounts`, EN and AR at 390 (`b-en-390-L-screen.png`, `c-en-390-L-screen.png`).
- *Wrong:* the desktop table scrolls sideways with no affordance. Handled by, Came / No-show (callouts 2 and 3) and every balance are off screen.
- *Fix:* below 48 rem, draw the workspace's phone layout: one card per visit or customer, with its status buttons or its balance and age. If a table must scroll, add an edge fade.

**P1-7 · The Sunday report looks like a terminal log**
- *Where:* `/` How it works and `/agent` report, English (`h-en-1440-L-howreport.png`, `a-en-1440-L-report.png`).
- *Wrong:*
  - The report is plain text (`modules/report.py`), which WhatsApp shows in sans. The site sets 30 lines in Plex Mono.
  - Only Mono 500 is loaded, so the 600-weight section titles do not stand out.
  - "9:00 AM" sits beside "At 9:00 on Sunday".
- *Fix:* `.d-report-text { font-family: var(--sans); font-size: .875rem }` with titles at 600, as the Arabic already does, and the time "09:00" with read ticks.

**P1-8 · One English social card for all ten pages**
- *Where:* every `og:image` (`/opengraph-image`).
- *Wrong:* `/bookings`, `/ar` and `/ar/agent` all share "Your business just got an agent." in English. Links travel on WhatsApp in Doha, so this card is the ad.
- *Fix:* an `opengraph-image.tsx` per product and per route group, with the product name and its H1, and an Arabic version in `dir="rtl"`. Same template.

---

## P2: polish

1. **Two Volt buttons in the first screen**, `/` at every width: the header's "Email us" and the hero's, 300 px apart, against the one-Volt rule the log cites. Make the header button ghost until `[data-hero-cta]` leaves the screen, using the observer the phone bar already has.
2. **Line breaks.**
   - The summary breaks "…last week. 2 / orders need confirming", and Done breaks "sent for / you" (`h-en-1440-L-hero2.png`). Join each count to its noun with U+00A0 and add `text-wrap: pretty` (product lane, `_agent`).
   - The feed's "18:00 · / Noor A.", EN and AR, has the no-break space on the wrong side of the dot: write `18:00 · Noor A.`
3. **Mixed time formats** on one page: 16:00 (feed), "4:30 pm" (suite crop), "3:00 PM" (bookings), "9:00 AM" (report). Use one per locale; tell the product lane about the product screens.
4. **One bakery, two order sequences.** The feed has #1441 on Thursday; trust FIG 05 has #1043 on Wednesday, about 400 orders earlier for a shop doing 50 a week. Use about #1431.
5. **The crop's ending** (`h-en-1440-L-hero2.png`) fades through the KPIs ("▲ 20 %" at 15 % ink) into a closed, rounded, shadowed edge. End above the KPIs, or run the window off the plate's edge with no radius.
6. **Products menu** (`m-en-1440-L-menu-open.png`, `m-ar-1440-D-menu-open.png`):
   - It is text-only, with 70 px of dead space under the columns.
   - In Arabic the text runs 6 px past each rule (1366 against 1360).
   - Add a footer line, "ALYR Agent comes with every product · One workspace", and a small mark per product from the symbol's planes, reused in the suite rows and the product bars.
7. **Tags.**
   - By business lists "Bookings · Chat · Accounts · Agent", out of suite order, and repeats Agent in every row. Use Chat, Bookings, Agent, Accounts, with "+ Agent" lighter.
   - Product pages use a second tag style (`b-en-1440-L-who.png`): keep one system.
8. **Dark mode flattens the plate.** The window `#202428` on the plate `#1d2024` is ≈ 1.05:1 (`h-ar-1440-D-hero.png`, `a-en-1440-D-hero.png`). Lift the window to `#262a2f` with a shadow, and give `.af-plate` and `.product-in` a `--dark-line` hairline.
9. **Two plate languages.** The homepage cuts the corner at 45°; the product heroes round theirs (`a-en-1440-L-hero.png`). Use the cut everywhere.
10. **Empty half-columns at 1440:** beside the product H1s (450 px), beside the homepage report, and beside `/agent`'s opened card. Move the demo tabs and state top-right, and let the early-access note follow the report.
11. **Breakpoints.**
    - At 1024 the eyebrow floats 57 px below the body's top (`h-en-1024-L-hero.png`), because of `.hero-eyebrow { align-self: end }`; use `start`.
    - At 320 the status chip wraps inside its pill (`w320-en-L-feed.png`); add `white-space: nowrap`.
    - At 390 trust FIG 05 cuts the Arabic phone in half (`h-en-390-L-trust.png`); stack the phones.
12. **Volt used as numbering.** The spotlight has ten Volt discs, and the product screens repeat them. Numbers are not action, state or progress: use Carbon discs with white mono.
13. **A fake button.** `/agent`'s opened card has a Volt "Send reminders" that cannot be pressed (`a-en-1440-L-how.png`). Draw it as an outline with `cursor: default`.
14. **Accessibility.**
    - Each showcase dashboard adds seven `region` landmarks; drop `aria-labelledby` in showcase mode.
    - `/agent`'s sample summary is an h2; use `headingLevel={3}`.
    - `lines()` joins spans without a space ("One workspace.A product…"); add `{" "}`.
    - Header links are 39 px tall, under the brief's 44.
15. **Small inconsistencies.**
    - hello@alyr.qa is mono in the closing call and sans in the hero.
    - Bookings' facts end "one / room".
    - The phone demo tabs cut "Ca…" with no fade.
    - The phone hero drops "See the products", the only early path to the suite.
16. **The fold before the suite** (`h-en-1440-L-fold.png`). In light mode its 35 px first plane and slash read as a glitch. Make the plane ≥ 4 rem.

**Checked and fine:**
- No horizontal scroll at 320 on all ten pages.
- CLS 0.
- AA contrast on the sampled text, in both themes.
- Escape closes the menu with focus returned; a click outside or focus leaving closes it.
- The composed feed with reduced motion.
- The RTL mirroring of the plate, the feed and the menu.

---

## The five changes that would lift the site most

1. **Prove "rules, not AI" in the first screen** (P0-1, P1-1): "by rules you can check" in the body, the newest event on top, and the plate lifted so four events fit at 1366 × 768.
2. **Choreograph the hero as one gesture** (P1-2): plate, then window, then chip and dot, then the events, with a count that never runs backwards.
3. **Give the phone its own first screen** (P1-4, P1-6): the feed first, a clean crop, and product screens drawn for a phone.
4. **Make the second look new** (P1-5, P1-3): the spotlight opens on another business, and `/agent` replays on every switch.
5. **Make every shared link a good card** (P1-8): one card per product and per language, because WhatsApp is how the site will travel.
