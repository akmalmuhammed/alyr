# The homepage's rhythm in code: proposals 2 to 5

24 Oct 2026. Branch `aly-homepage-rhythm`, cut from `main` at dbb3b94 (what is live), worktree
`D:\alyr-rhythm`. The founder approved proposals 2 to 5 of `01-proposals.md`; proposal 1
("One shop, six products") is being prototyped in Framer first, so the products section is
left exactly as it was. No Linear issue was given. Preview server: `pnpm site:serve` on port
3163; Edge profile `C:\t\rhythmprof`. Screenshots in `shots-code/` (not committed).

Lean path of `alyr-design-review` (four bounded changes to existing sections, no new
section): no research or critics; the checks of stage 9 are below.

## P2. Show the dashboard once

Done. The hero keeps the dashboard and the feed. The ALYR Agent section no longer repeats the
screen's opening sentence ("Week so far: 50 orders…"): it opens on **Needs you now** and the
**suggestions with their reasons**, across the window, numbered 1 and 2. "See the whole
screen" («اعرض الشاشة كاملة»), a native `<details>` that works without scripts, opens the
rest (the sentence, Done for you, the four numbers, the week, hours, items, money owed),
numbered 3 and 4 where the callouts point. The callouts went from five to four and follow
the new order; the two about the comparison became one ("Like with like… with percentages
only when both weeks have 20 or more"), and the last two wait with the parts they explain.

- `copy.ts`: `home.spotlight.more` (type and both languages), the callouts reordered.
- `HomePage.tsx`: the spotlight passes `more`.
- `agentfig.css`: the spotlight's marks renumbered, the closed state, the disclosure's
  style, the callouts kept beside the window; the old phone-only cut is replaced by the
  disclosure at every width.
- On phones the hero's crop also shows Needs you now (it stops after Done for you), so the
  phone still sees that part twice; the suggestions are new to the reader there.

## P3. Vary how sections open

Done. Three openings instead of one (`home.css`, "how sections open"; markup in
`HomePage.tsx`):

| Section | Opening |
|---|---|
| How we work | **Split**: the heading on the start side, the lead on the end column (columns 8 to 12), standing on the heading's last baseline |
| By business | **Full**: the heading alone, on one line across the grid at 62rem and up (it balances onto two where it does not fit) |
| One order, start to finish | **In the plate**: no cross rule; the heading, lead and link open inside the Carbon plate, above the tabs |
| ALYR Agent | **Split**: eyebrow and heading at the start, the lead and "See ALYR Agent" on the end column at the heading's baseline |
| The products | Unchanged (P1 is in Framer) |
| Trust, Questions | Unchanged: they already open differently (a figure beside; a sticky side heading) |

The gap under a section rule is `--space-5` on the homepage (was `--rule-gap`, 56 px at
1440), and the space between an opening and its content `--space-4` or `--space-5`. Section
top to its content at 1440 (EN): How 269 px, By business 231, One order 340 (the tabs inside
the plate), ALYR Agent 384 (its lead is four lines on the end column; the switch is the
first content). It was about 450 for each.

All values are tokens; one new pattern (`.open-split`, `.open-full`, `.open-plate`) and no
new breakpoint. Below 62rem every opening stacks.

## P4. The rule breaks

Done, on the homepage and wherever the same component is used:

| Break | Fix | Where it also applies |
|---|---|---|
| `.fx-pulse`: three radial-gradient glows with a literal `rgb(183 243 74 / .45)`, looping every 1.2 s | One solid Volt tick cut at 45° (`.fx-signal`) that travels the wire in use **once per step** (`--dur-4` + `--dur-3`, `--ease`), remounted per step; moved by `translate`, not `inset`; mirrored in Arabic; vertical on phones. The lit node's glow (`box-shadow` with a literal) is gone; the wire in use is solid `--volt` instead of a literal at 55% | `FlowDiagram` on every product page's "How it works" (`/chat`, `/bookings`, `/agent`, `/accounts`, `/shelf`, `/docs`, both languages) |
| The drawn "Pay QAR 38" in the Chat crop is Volt and cannot be pressed | `d-btn is-line`, the outline | The drawn order page's "Confirm" button (`PageDrawings.tsx`) on the product pages, same rule. The Agent dashboard in showcase mode (site only: the homepage, `/agent`, `/agent-sample`) drew its first suggestion's button in Volt; in showcase it is now the outline (`AgentDashboard.tsx`, one condition; the workspace is unchanged) |
| How we work's number discs are Volt | Carbon discs with white mono numbers (`--carbon`, `--on-band`, the `--mark-ring` ring, Volt only in dark, as `.co-n`); the rail's fill keeps the Volt progress | `/agent`'s step 3 disc (`.pk-step-n`) was Volt too: now Carbon |
| Two Volt buttons at the closing call (header and call) | `SiteMotion` sets `data-at-closing` on `<html>` while `#contact` is on screen; the header's button is then the outlined twin, drawn in the band's colours when the header is Carbon over the call | Every page (the closing call is in `Shell`) |
| "ALYR Agent reads the orders…" (banned verb) | "counts" / «يحسب» | |

The Arabic line is a draft for the native review (ALY-66). Not changed, and why: the feed's
status dot still lights once with one ring whose keyframe carries a literal colour
(`agentfig.css` `af-light`; it plays once, which the rules allow); `/bookings` says "ALYR
reads your hours", which is reading data, not understanding, and the proposal did not list
it; the plates' dotted grids carry literal greys (decoration the proposal did not list).

## P5. One order opens on a finished frame

Done (`FlowDiagram.tsx`). The figure is drawn, in the HTML and until it is read, on the
first story's **last** step: Sara's chat with the order page, the order and the
confirmation; ALYR's six lines of work; order #1442 on the team's screen; "06 / 06 She gets
the confirmation". It was step 1: one message, two lines and "Nothing new yet". Once 60% of
it is on screen (or its top is past the middle, for a phone where it is taller than the
screen) and motion is wanted, it goes back to step 1 and plays forward, as before, with the
pause control. With reduced motion it never plays: it stays finished, a story picked from
the tabs opens finished too, and the steps are read one tap at a time. Without scripts it is
the finished frame.

The same component is every product page's "How it works" (`FlowSection`), so all six pages
(both languages) open their flow finished too. The other demos already opened finished
(`ProductDemo`, site audit F2); `ChatXray` draws each scene finished; `LastOne` and
`PaymentPaper` have the end state in their HTML. None other opened empty.

## Verification (24 Oct 2026, on 6e7308a; the later commit only touches docs, skills and the allowlist)

- `pnpm site:check`: build, EN/AR parity (6,112 strings), internal links (1,134) pass;
  banned words passes after removing the allowlist entry for the old "reads" line.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `node scripts/design-check.mjs`: clean.
- `pnpm site:a11y --runs=3`: axe on all 14 pages, 1440 and 390, light and dark: 56 runs,
  no issues. Lighthouse mobile, lowest of 3: `/` Performance 95, Accessibility 100, LCP
  2.41 s, CLS 0; `/ar` 98, 100, 2.41 s, 0.
- Page height (same probe, before → after): `/` 1440 12,154 → 10,958 px; 390 16,614 →
  15,732; 320 18,111 → 17,116. `/ar` 1440 12,046 → 10,807; 390 15,893 → 15,006.
- No horizontal scroll at 320 in either language (`scrollWidth` = 320).
- Section top to content at 1440, before → after (EN): How 408 → 269, By business 309 →
  231, One order 424 → 324, ALYR Agent 487 → 368. Arabic: 410 → 296, 336 → 245, 461 → 311,
  502 → 335.
- Screenshots in `shots-code/` (not committed): How, By business, One order, ALYR Agent, the
  products' Chat crop and the closing call, EN and AR, light and dark, 1440 and 390, reduced
  motion (48); full pages of `/` and `/ar` at 1440 and 390; `/chat` and `/agent`'s "How it
  works" in both languages; `wip/` has the motion runs (the flow playing, the closing call's
  header outline with motion on).

## Not checked

- A real iPhone or Safari (Chromium Edge only); a screen reader beyond axe.
- The flow's tick and the start at 60% timed in a run without screenshots (seen in captures
  only); the moment it goes from the finished frame back to step 1 has not been judged by the
  founder.
- The header's outline at the closing call on a phone (the header has no button below
  62rem; the bar hides there already) and with scripts off (both stay Volt then).
- The Arabic of the changed lines (callouts, «يحسب», «اعرض الشاشة كاملة») is a draft for ALY-66.
- 1280 width (1024 looked at: the openings hold); a keyboard pass through "See the whole screen".

# P1 in code: "One shop, six products"

25 Oct 2026. Same branch and worktree (`aly-homepage-rhythm`, PR #119), on top of the
commits above. The founder approved the frame after clicking through the Framer prototype
(`02-prototype-log.md`; project LyKozm5SR5CGo5YpDJXA was read only, its tile code
`AlyrTile.tsx` and layout for contents and timings; nothing there changed). Preview:
`pnpm site:serve --port=3167`; Edge profile `C:\t\frameprof`. Screenshots in `shots-frame/`
(not committed). Builder role of `alyr-design-review`; the two critics were not run.

## What changed

- **`SuiteFrame.tsx`, `suite.css` (new).** The products section is a split opening (the
  heading, the lead on the end column), one Carbon plate and the two notes. The plate: a 45°
  cut at the top inline-start corner (`--cut-plate`, `--cut-plate-sm` on phones, mirrored), a
  `--band-edge` hairline in dark, a bar with the shop's monogram, "Qirfa Bakery", the frame's
  one "Sample" mark and "Thursday · 16:20" (the sample's own `when`), then six tiles split by
  `--dark-line` seams. The figure's first line is the sample's `fictional` sentence for
  machines; each fragment is `inert`, `aria-hidden` and `data-nosnippet`.
- **Grid.** At 62rem and up: Chat (8 columns, 440 px) and Bookings (4); then Agent, Accounts,
  and Shelf over Docs (4 each; Shelf and Docs 260 px each). Two columns from 48 to 62rem; one
  below, in the suite's order, each tile its own height (304 to 416 px; Shelf and Docs 240).
  The DOM order is the suite's order at every width.
- **Tiles.** One link each to the product page, named from `home.suite.frame.tile` ("ALYR
  Agent, Your business in numbers, With every product"), with the name, the descriptor (and the
  state on Agent and Shelf, as in the menu) and the arrow (flipped in Arabic). The fragment runs
  past the tile's inline-end edge and is cut there, with no fade. Hover with a fine pointer:
  the fragment moves 2 px along 45°, the arrow 1 px, the edge turns `--line-strong`. Focus: a
  Volt ring (`--focus-on-band`) inside the tile.
- **Fragments, from the existing drawings and data.** Chat: the team inbox and Sara's chat (the
  flow's own lines). Bookings: the slot grid and the booking and reminder rows (the product's
  "Booked"). Agent: Needs you now and the "ready" suggestion with its rule and outlined button,
  straight from the engine's bakery sample and `AGENT_LABELS`, through the Agent's `Rich`.
  Accounts: the owed total, age bar and legend from the same sample, then Marina Desk
  Co-working, "Promised by 22 Oct" (the product's `Promised by {date}`). Shelf: the Stock card
  of `pages.shelf.moment` (code 109, Left today, of 6, Sold out). Docs: `PaperTop` of RC-0042
  (`Paper.tsx`, `paperData.ts`), Arabic first. The window uses the window, `--d-*` and `--ui-*`
  tokens; the age colours are the product's `a0` to `a3`.
- **Moments (CSS, keyed on `is-in`).** SiteMotion adds `is-in` to a tile on `pointerenter` or
  `focus` where there is a fine pointer, and at 60% in view elsewhere (one observer), once; with
  reduced motion it watches nothing. Start states exist only under `.motion`; the HTML is the end
  state. Every delay is a number of `--stagger`, every duration a `--dur-*`, with `--ease` and
  travel along 45° (`--travel`, `--dir`). End times read from `getAnimations()`, no
  screenshots: Chat 1.14 s, Bookings 1.32, Agent 0.96, Accounts 1.44, Shelf 0.96, Docs 1.62.
  - Chat: "Ordered 7 items, QAR 98" lands, then the confirmation (360 ms), then Sara's inbox row
    takes `--volt-wash`, "#1442 · New" and 16:19 (600 ms).
  - Bookings: 6:00 pm fills with Volt (the frame's only Volt fill: the current state), the
    booking arrives (300 ms), then "Reminder sent · Two hours before · 4:00 pm" (840 ms).
  - Agent: the suggestion arrives, its rule line draws (360 ms), then its outlined button (720 ms).
  - Accounts: the age bar fills, oldest last, then the promise (960 ms).
  - Shelf: the count steps from 1 to 0 along 45°, then "Only 1 left today" becomes "Sold out"
    (480 ms).
  - Docs: the paper settles along 45°, then draws its Arabic (480 ms), its English (780 ms),
    then its number and date (1,020 and 1,140 ms).
- **Words.** `home.suite.frame` in English and Arabic (`SuiteFrame` type in `copy.ts`); no ALYR
  price; sample amounts as on the product pages. The Arabic is a draft for ALY-66.
- **Removed, now dead:** `home.suite.rows` and `home.suite.crops` (both languages); the six
  crops in `Drawings.tsx` (`OrderBarCrop`, `TimesCrop`, `SummaryCrop`, `AgeBarCrop`, `ShelfCrop`,
  `ReceiptCrop`); `.d-crop*`, `.d-agebar`, `.d-agelegend` (`drawings.css`); the `.suite-row`
  rules (`room.css`); the products' band (`.band`, `.band-in`, `.band-body` in `home.css`) and
  its selectors in `site.css`; `.band-in` in SiteMotion's dark-header watch. The llms twin now
  lists each product with its menu line (its existing fallback).
- **Skills fixed in this PR:** `alyr-site-page` (the homepage's item 7, the opening exception,
  a new product's tile); `alyr-design/components.md` (one Sample mark for a frame of one sample
  business; the products frame; the plate); `alyr-design/motion.md` (a moment that waits for a
  hover shows a true earlier state and plays once).

## Decisions taken while building

- **Row 2 is Agent, Accounts, then Shelf over Docs.** The prototype had Shelf over Docs first;
  the brief's order and the reading order put them last, so DOM and eye agree at every width.
- **The products open split, after ALYR Agent's split,** as in the approved prototype, against
  the skill's "no two neighbouring openings alike". Recorded as an exception in the skill and
  put to the founder below.
- **A desktop tile rests on its earlier state until hovered or focused,** as in the prototype:
  Bookings with no time taken, Agent without its suggestion, Docs a blank sheet. Without
  scripts or with reduced motion every tile is finished. Put to the founder below.
- **A tap goes to the product page.** The prototype's first tap played the moment instead; on a
  phone the moment has already played in view.
- **"Promised by 22 Oct"**, the product's words, not the prototype's "Thu 22 Oct".
- Not built: the spec's frame-wide timeline (the plate arriving, the seams drawing), seams
  breaking at the diagonal with `--cut-fold-gap`, and P9's view transition into the product
  page.

## Verification (25 Oct 2026, the built site served compressed)

- `pnpm site:check`: build, EN/AR parity (6,132 strings), banned words and prices, 1,132
  internal links: pass. `pnpm exec tsc --noEmit`, `pnpm lint`, `node scripts/design-check.mjs`:
  clean.
- `pnpm site:a11y --runs=3`: axe on all 14 pages, 1440 and 390, light and dark, 56 runs, no
  issues. Lighthouse mobile, lowest of 3: `/` Performance 98, Accessibility 100, LCP 2.41 s,
  CLS 0; `/ar` 98, 100, 2.41 s, 0.
- `suite.css` is 5.2 KB gzipped; no new library and no image; the script is a few lines in
  SiteMotion.
- Page height, before (after P2 to P5) → after: `/` 1440 10,958 → 10,567 px; 390 15,732 →
  15,295; 320 17,116 → 16,544. `/ar` 1440 10,807 → 10,424; 390 15,006 → 14,536. The plate is
  1,018 px tall at 1440 and 2,040 at 390.
- No sideways scroll at 1440, 1024, 390 or 320 in either language (`scrollWidth` = width); no
  control in the section under 44 × 44 at those widths.
- Real input in headless Edge, both languages: a mouse over Chat plays Chat only; Tab reaches
  the tiles in order, each with its Volt ring, and each plays on focus; at 390 each tile plays
  as it scrolls into view. Nothing plays again.
- Screenshots (`shots-frame/`): `frame-{en,ar}-{1440,1024,390,320}-{light,dark}` (finished),
  `rest-*` (a desktop before hover), `mid300-*`, `mid700-*`, `mid500-*` (the moments running),
  `reduced-*`, `noscript-*` (scripts off: finished).

## Open for the founder

- The screenshots, and a publish when he wants one.
- Whether a desktop tile may rest on its earlier state until hovered
  (`rest-en-1440-light.png`), or should rest finished.
- The products' split opening beside ALYR Agent's split, or the heading inside the plate.
- The Arabic of the new lines (ALY-66): «المحادثات», «محجوز», «أُرسل التذكير»,
  «وعد بالسداد قبل 22 أكتوبر».

## Not checked

- A real iPhone, Safari or touch (headless Edge with emulated touch only); a screen reader
  beyond axe; 1280 width; the moments judged by the founder in motion.
- The hover lean with a real mouse on screen (the trigger was driven by CDP input only);
  Windows high contrast.
- The two critics of the full design cycle.
