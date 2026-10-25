# Build log: "How we work with you" as four cards, and the trust section removed (ALY-226)

25 Oct 2026. Site and brand lane. Branch `aly-226-how-we-work` from main f19ec59, worktree
`D:\alyr-howwe`. Nothing published. Preview ports 3147 (dev) and 3161, 3163 (built site);
Edge profile `C:\t\howprof`. Screenshots in `docs/framer-review/shots-howwe/` (not committed).

The founder approved the Framer prototype (`04-triptych-prototype-log.md`, round 2) and, on
25 Oct, asked for the homepage's trust section to go. Full design cycle not run: no research,
no critics, no rulings. The prototype was the founder's review; this is a build of it with
the lean verification. Two critics are still worth running before publishing (below).

## Stages (commits)

1. **The four cards** (`HowCards.tsx`, `how.css`, `copy.ts`, `SiteMotion.tsx`): the rail of
   four numbered steps is replaced on `/` and `/ar`; the heading, lead, line button and "What
   we need from you" stay. The rail's CSS (`.how-rail`, `.how-step`, `.how-loop`,
   `.how-again`) and its scroll code in `Choreography.tsx` (the only use of ScrollTrigger,
   which is no longer loaded) are gone.
2. **The trust section removed**: `Trust` in `HomePage.tsx`, its copy in both languages
   (`home.trust`, the tracking-page sample `home.sample`), `TRUST_RECORDS` in `site.ts`,
   `TrackScreen` in `Drawings.tsx` and its `.d-*` rules in `drawings.css`, the `.trust`,
   `.facts6`, `.records` and `.pair` rules in `home.css`, `#trust` in the content-visibility
   list, its part of `llms.txt`, and its allow-list entry. ALYR Bookings' "What's in it"
   linked to `/#trust` ("How ALYR handles consent, WhatsApp and your records"); the link, the
   `rules` slot of `InsideBlock` and its unused `locale` prop are gone.
3. **`site:check` fixes**: the scenes' screen-reader sentences had colon reveals (pattern 6).
4. **One stylesheet**: `how.css` is `@import`ed by `home.css`. As its own file it was a ninth
   render-blocking stylesheet and Lighthouse read LCP 2.41 or 2.56 s from run to run.
5. **See's row fold and the docs** (this commit): the fold is the row's own size, so it shows
   from its first frame, and the Done rows give the room back once the row is mostly shut
   (before, the Done label showed under the row for a moment). Skills (the coordinator's
   edits, reviewed and kept), status, the lane brief, this log.

## What was built

- **Four cards**, four in a row from 75rem, two by two from 48rem, stacked below; each a
  Carbon canvas (`--band`) cut at its top inline-start corner (`--cut-plate-sm`, mirrored),
  a hairline along the cut in dark, one drawn window in it (white, `--window` in dark, notched
  at its top inline-end corner), then the title (`h3`) and two lines.
- **Check:** the check-up sheet in the workspace window's bar (monogram, Qirfa Bakery, the
  section's one "Sample" mark), four rows ticked in turn, each with what was found.
- **Set up:** the workspace's setup words (`catalog.py`, the workspace's "Everything is set
  up", "{n} of 3 steps done."): the last box ticks, the Volt progress fills, the title swaps;
  then the team's phone (`Phone` from `Frames.tsx`) rises along 45° and order #1001 arrives on
  `--volt-wash`.
- **See:** ALYR Agent's labels (`AGENT_LABELS`) and the engine's bakery sample (`SAMPLES`):
  orders this week 49 → 50, sent 181 → 182 with one Volt tick, a "1 order needs confirming ·
  the oldest for 16 min" row arrives, ticks and folds shut along 45°, sent → 183. Settled, it
  is the sample's screen at 16:20 less its "2 orders need confirming" row. The earlier values
  are derived from the sample (50 − 1, 183 − 2, 183 − 1), never typed.
- **Improve:** the sample's sentence, "Sales this week", last week's bar (QAR 7,129, the
  sample's last-week days to 16:20, summed in code) and this week's Volt bar (QAR 8,520)
  rising, then ▲ 20%. Arabic puts last week on the right.
- **The return line:** solid, `--line-strong`, 1.5 px, drawn from CSS pieces: down from under
  Improve, a 45° corner, along the foot of the row, a 45° corner, up the page's gutter, and
  along 45° onto Check's cut, which then takes a 2 px Volt line. All logical properties; the
  diagonals' rotations mirror under `[dir="rtl"]`. On phones it runs up the gutter from a short
  hook under the last card. "Then we check again." / «ثم نفحص من جديد.» sits under it (the
  founder's words; no "every month").
- **Motion, CSS only:** every animation fills backwards and is keyed on `is-in` on a card
  (or `is-looped` on the row), under `.motion` and `prefers-reduced-motion: no-preference`.
  SiteMotion adds `is-in` once 50% of a canvas is in view, and again on hover (mouse),
  keyboard focus or a press of the canvas's `button`, unless that card is still playing; a
  replay has no stagger. Improve's first play adds `is-looped`; the line never draws again.
  Every delay is a count of `--stagger` beats; durations `--dur-2` to `--dur-4`; `--ease`.
- **No new library.** JavaScript added: about 40 lines in SiteMotion. The Agent dashboard
  component itself is not used in See (below).

## Decisions taken while building

- **See is drawn from the Agent's parts, not `AgentDashboard` in showcase mode.** The brief
  named the component. Its DOM holds one value per number, so a CSS-only change from 49 to 50
  would have meant styling inside `.ag` from outside and putting numbers in CSS; it is a client
  component with its own rise-in-view, which would play a second motion over the scene; and a
  318 px card shows a sliver of it. See uses its labels (`AGENT_LABELS`), its `Rich` and the
  engine's sample, as the products frame's Agent tile does. The hero and the ALYR Agent
  section still show the real component.
- **The row that comes and goes is an older order**, "the oldest for 16 min", not #1442 as in
  the prototype: the product lists an order under Needs you now only once it has been new
  for 15 minutes, so a just-arrived order there would be untrue. Each step shown is one the
  product does: a new order adds to the week, ALYR sends its reply, the team confirms, ALYR
  sends "Order #… is confirmed.", the row leaves.
- **Replay is a button over the canvas** ("Play the check-up again", …), so focus and a tap
  have a real control (44 px and more: the whole canvas). Its sentence for screen readers is
  in `aria-describedby`; the drawing is `inert`, `aria-hidden`, `data-nosnippet`.
- **The title comes before the canvas in the HTML** (shown below it with `order`), so a
  screen reader meets the step before its replay button.
- **The trust section's facts were not moved anywhere** (the coordinator's instruction). See
  "For the founder".

## Verification (built site, served compressed)

- `pnpm site:check`: build, EN/AR parity, banned words and prices, 1,130 internal links:
  pass. `pnpm exec tsc --noEmit`, `pnpm lint`, `node scripts/design-check.mjs`: clean.
- **axe** (`pnpm site:a11y`, 1440 and 390, light and dark): `/`, `/ar`, `/bookings`,
  `/ar/bookings`, no issues.
- **Lighthouse** mobile, lowest of 3: `/` Performance 97, Accessibility 100, LCP 2.50 s,
  CLS 0; `/ar` 95, 100, 2.41 s, 0. LCP is the hero lead; across seven single runs it read
  2.41 s, once 2.52 s. For comparison, main (f19ec59) built and measured the same way on the
  same laptop the same day: Performance 90, LCP 2.50 s.
- **Timing** (DevTools, no screenshots, 1440, from the row entering view; the same in
  Arabic): Check ends 1.68 s, Set up 2.16 s, See settles 3.54 s (3.06 s after its start),
  Improve 2.28 s; the line draws 2.88 → 3.84 s, its words 3.12 → 3.60 s, Check's Volt cut
  3.84 → 4.32 s. No animation runs after 6 s. (Measured before the See fold change, which
  ends See 60 ms later, 3.12 s after its start.)
- **320 px:** `scrollWidth` 320 in both languages; every canvas button 280 × 380.
- **Screenshots** (`shots-howwe/`): EN and AR, light and dark, at 1440, 1024, 390 and 320
  (`*-finished.png`); reduced motion at 1440 and 390 in both themes (`*-reduced.png`); mid-run
  at 0.7 s and 2.3 s, the line drawing at 3.3 s (`*-mid-*.png`, `*-loop-3.3s.png`); See mid-run
  and the stack's end on a phone; the join where the trust section was
  (`*-no-trust-join.png`).
- "What we need from you" showing only its label at the foot of `*-1440-*-finished.png` is
  its rows' arrival, not a layout fault: they sit below the line where rows count as read
  (88% of the screen) and arrive when scrolled to (checked by probe).

## For the founder (Needs Akmal)

1. **The trust section's facts are now nowhere on the homepage:** the same person from the
   visit on; records kept apart in the database; consent checked and recorded; built on
   WhatsApp's official platform ("we are not WhatsApp or Meta" stays in the footer's
   disclaimer); built never to hold your money; your team can take over any chat. With the
   offer on, its closing money-back line went too (the price section and a question still say
   it). ALYR Bookings' link "How ALYR handles consent, WhatsApp and your records" pointed to
   it and is gone. Whether any of these belongs elsewhere is his call; nothing was moved.
2. **The on-record slots are gone** (`TRUST_RECORDS`: CR, payment provider, Meta status).
   Showing a CR once it is issued now needs a place on the page.
3. **"We go over it with you and add what your business needs next"** (Improve) still
   implies a review after go-live: the same open question as the monthly review promise.
4. **The See row is an older order** than in the prototype (above).
5. **Replay** on hover, focus and press stands as an exception in `motion.md` rule 1.
6. **The Arabic** of the cards, the scenes and the line is a draft for ALY-66.

## Not checked

- No critics ran (design, copy and claims, Arabic); no native Arabic review.
- A real phone, Safari, touch: Edge and headless only; taps were not exercised.
- Without JavaScript (the HTML is the finished state by construction; not rendered with
  scripts off).
- Keyboard replay by hand, and a screen reader; axe only.
- The offer switch on: the join between the products, the price section and the questions.
- 1280 and 1200 (the 4-up layout's narrowest widths), where the windows are narrowest.
- The timing after the See fold change, and Lighthouse after it (the change is CSS only).
