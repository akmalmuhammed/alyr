# The pace: every timed piece about 40% quicker, on one setting

25 Oct 2026. Branch `aly-faster-motion` from main f19ec59, worktree `D:\alyr-pace`. No Linear
issue was given. Not merged, not published.

**What the founder asked:** the visuals and motion across the site are too slow; make them
faster on every page. His example was the "One order, start to finish" flow (`FlowDiagram`).
The brief from the orchestrator: measure first; one pace setting the founder can tune; about
40% quicker but readable (a step stays up long enough to read its caption at about 230 words
a minute, plus a short beat, never under about 1.2 s); snappier transitions on the token
durations; tighter staggers; leave out the hero figure (AgentFigure and the feed) and the
homepage's How we work, which other agents are rebuilding; keep reduced motion, no scripts,
plays-once, the demo's pause, RTL, light and dark as they were.

## The setting

**`motion.pace.pace` in `design/tokens.json`, value `1`** (CSS `--pace`). Lower is quicker,
higher is slower: 0.8 is 20% quicker, 1.25 is 25% slower. It multiplies every token in its
group:

| Token | At pace 1 | Use |
|---|---|---|
| `--play-1` … `--play-4` | 72, 144, 288, 432 ms (0.6 of `--dur-1` … `--dur-4`) | Every move inside a timed piece |
| `--play-stagger` | 36 ms (0.6 of `--stagger`) | Every delay inside a timed piece is a number of these |
| `--read-word` | 261 ms (230 words a minute) | A step's or tab's dwell: its words times this |
| `--dwell-beat` | 400 ms | Added after the words |
| `--dwell-min` | 1200 ms, **not** multiplied | No step or tab is shorter, whatever the pace |

The generator (`scripts/tokens-build.mjs`) emits a token marked `paced` as
`calc(<value> * var(--pace))`, so changing the one custom property retunes the CSS at run time,
and gives TypeScript and Python the product (`motion.pace` in `_tokens/tokens.ts`; `PLAY` in
`_site/pace.ts` for the scripts that time things). The interaction scale (`--dur-*`,
`--stagger`: hovers, presses, menus, the theme switch, the accordion, product screens) is
unchanged.

**The dwell.** A flow's step stays up for its title and the work lines it ticks; a demo's tab
for its caption, or until its last message or row has arrived if that is later; both plus the
beat, at least 1.2 s. The component sets `--words` (and the demo `--last`) on its progress bar;
`site.css` does the sum:

```css
--dwell: max(var(--dwell-min), calc(var(--words, 0) * var(--read-word) + var(--dwell-beat)));
```

Words are counted in the language shown. Arabic has fewer words for the same sentence and is
read more slowly per word; the one rate is a fair approximation, not a measured one.

**The guard.** `scripts/site/pace-check.mjs` (in `pnpm site:check`) fails on a literal
duration in any `animation` or `transition` in `_site/*.css`, and on a literal GSAP duration,
stagger, `setTimeout` delay or time divided by a number in `_site/*.ts(x)`. Its 18 reviewed
exceptions are in `scripts/site/allow/pace.json` (the hero and its figure, How we work, the
button's lean, the failsafes, two lines of dead `.company` CSS), each with its reason; it fails
on an exception that no longer matches.

## How it was measured

`node scripts/site/pace-probe.mjs <url> <pieces…>` (new; its probe is
`scripts/site/lib/pace-probe.js`), which runs `scripts/site/shoot.mjs --eval` with no screenshot
used for the timing. For a one-shot piece it triggers it (scroll, or `pointerenter` on a tile)
and reads every animation and transition it started from `document.getAnimations()`: delay,
duration, end. For a flow or a demo it plays the first one to three steps in real time ("wall",
to prove the configured dwell is what happens), then reads each remaining step's dwell from its
progress bar's animation and finishes it to move on, through the whole cycle. Built site
(`pnpm site:build`), served by `scripts/site/serve.mjs` on ports 3171 (before, a copy of the
build of f19ec59) and 3172 (after); never 3100. Headless Edge, 1440 × 900, light. FoldSplit's
sweep is `requestAnimationFrame`, so it was sampled every 16 ms; the GSAP heading splits do not
show in `getAnimations()`, so they are read from the code.

Wall-clock checks after: the homepage flow's first three steps took 3567, 2233 and 2742 ms
against 3271, 2227 and 2749 configured (the first includes its start); a demo tab on `/chat`
5067 against 5098; Docs' first tab 7225 against 7186.

## Before and after

### Flows ("One order, start to finish" and each product page's "How it works")

Each step dwelt 4.4 s, whatever it said.

| Piece | Steps | Dwell before | Dwell after | Cycle before | Cycle after | Quicker |
|---|---|---|---|---|---|---|
| Flow, / | 16 | 4.4 s each | 2.0 to 3.5 s (mean 2.7) | 70.4 s | 43.2 s | 39% |
| Flow, /ar | 16 | 4.4 s each | 2.2 to 2.7 s (mean 2.4) | 70.4 s | 38.5 s | 45% |
| Flow, /chat | 17 | 4.4 s each | 2.2 to 3.5 s (mean 2.8) | 74.8 s | 47.0 s | 37% |
| Flow, /bookings | 15 | 4.4 s each | 1.7 to 4.8 s (mean 2.9) | 66.0 s | 43.3 s | 34% |
| Flow, /accounts | 14 | 4.4 s each | 1.7 to 4.8 s (mean 3.3) | 61.6 s | 45.8 s | 26% |
| Flow, /shelf | 17 | 4.4 s each | 1.2 to 3.5 s (mean 2.5) | 74.8 s | 41.8 s | 44% |
| Flow, /docs | 15 | 4.4 s each | 1.2 to 4.8 s (mean 3.2) | 66.0 s | 47.8 s | 28% |
| **All English flows** | 94 | | | **413.6 s** | **268.9 s** | **35%** |

Inside each step:

| Move | Before | After |
|---|---|---|
| The signal along the wire | 1200 ms (`dur-4` + `dur-3`) | 720 ms (`play-4` + `play-3`) |
| The step's bubble, work lines, row and words rising | 420 ms | 288 ms (`play-3`) |
| A node, the station and WhatsApp's label lighting | 280 ms (`--medium`) | 144 ms (`play-2`) |
| A work line's tick turning | 480 ms (`--slow`) | 288 ms (`play-3`) |
| The rail's step turning done | 280 ms | 144 ms |

The homepage example, step by step (title + work-line words → dwell): Sara writes 11 → 3.3 s;
"order" 7 → 2.2 s; the order page 9 → 2.7 s; she orders 8 → 2.5 s; the team sees it 8 → 2.5 s;
the confirmation, "Confirmation sent ✓ Tracking page made" 9 → 2.7 s. Story 26.4 s → 16.0 s.

### Demos (the tabbed demo in every product page's opening)

Each tab dwelt 6.5 s; its messages arrived 160 ms + 620 ms apart, rising over 520 ms.

| Piece | Tabs | Dwell before | Dwell after | Cycle before | Cycle after | Quicker |
|---|---|---|---|---|---|---|
| Demo, /chat | 4 | 6.5 s each | 5.1, 5.1, 3.5, 4.8 s | 26.0 s | 18.6 s | 29% |
| Demo, /bookings | 5 | 6.5 s each | 4.3, 3.8, 4.6, 5.1, 3.8 s | 32.5 s | 21.6 s | 34% |
| Demo, /accounts | 5 | 6.5 s each | 3.5, 4.3, 5.1, 3.3, 2.0 s | 32.5 s | 18.2 s | 44% |
| Demo, /shelf | 4 | 6.5 s each | 4.3, 5.9, 4.3, 7.2 s | 26.0 s | 21.7 s | 17% |
| Demo, /docs | 3 | 6.5 s each | 7.2, 4.6, 6.1 s | 19.5 s | 17.9 s | 8% |
| Demo, /ar/shelf | 4 | 6.5 s each | 3.5, 4.8, 2.7, 5.9 s | 26.0 s | 17.0 s | 35% |
| **All English demos** | 21 | | | **136.5 s** | **97.9 s** | **28%** |

Inside a tab: first message 160 → 72 ms (`play-1`), then one every 620 → 360 ms (10 ×
`play-stagger`), each rising over 520 → 288 ms (`play-3`). `/chat`'s Order tab's last arrival
ends at 2974 → 1692 ms. The demo still pauses on hover and focus, and its Pause button works:
checked on `/chat`, nothing moved for 5.5 s while paused, and Play resumed it.

### One-shot pieces (end of the last move, from the trigger)

The probe's numbers include about 30 to 80 ms between the trigger and its clock; the
configured ends are in brackets, and "quicker" is from them where they are given.

| Piece | Before | After | Quicker |
|---|---|---|---|
| Signature figure, /shelf "The last one" | 2313 ms (2280) | 1410 ms (1368) | 40% |
| Signature figure, /ar/shelf | 2330 ms | 1418 ms | 39% |
| Signature figure, /docs "A payment becomes paper" | 2922 ms (2880) | 1770 ms (1728) | 40% |
| Products frame tile, Chat | 1232 ms (1140) | 776 ms (684) | 40% |
| Tile, Bookings | 1403 ms (1320) | 867 ms (792) | 40% |
| Tile, Agent | 803 ms (720) | 515 ms (432) | 40% |
| Tile, Accounts | 1523 ms (1440) | 931 ms (864) | 40% |
| Tile, Shelf | 1027 ms (960) | 651 ms (576) | 40% |
| Tile, Docs | 1695 ms (1620) | 1039 ms (972) | 40% |
| Business day's fold, the sweep (`FoldSplit`) | 1600 ms (visible change 1150) | 864 ms (550), 2 × `play-4` | 46% |
| The unread count's beats while it sweeps | 0, 380, 760 ms | 0, 288, 576 ms | 24% |
| The fold sent by "Today" / "With ALYR" | 600 ms | 360 ms | 40% |
| A business tab chosen, its rows arriving | 1037 ms | 629 ms | 39% |
| A product page's facts arriving (`data-reveal`) | 700 ms + 70 ms each | 432 ms + 36 ms each | 40% |
| /chat X-ray, "For your team" layer | 877 ms | 521 ms | 41% |
| /chat X-ray, "Behind the scenes" layer | 1617 ms | 1016 ms | 37% |
| Section heading rising by line (GSAP, from the code) | 720 ms + 60 ms a line | 432 ms + 36 ms a line | 40% |
| Closing call's fold (every page) | 600 ms, + 60, 120 ms | 360 ms, + 36, 72 ms | 40% |
| Closing call's mark | 720 ms, + 60, 180 ms | 432 ms, + 36, 108 ms | 40% |
| Price digits, agreement line and tick, trust pair (from the code; prices are off) | 720 + 60 a digit; line 200 + 480, tick at 760; 720 | 432 + 36; line 144 + 288, tick at 468; 432 | 40% |

**Overall:** the English flows and demos together, 550.1 s → 366.8 s a full cycle (33%
quicker); every one-shot piece 37 to 41%.

## Decisions taken while building, and why

1. **The pace is its own scale, not a multiplier on `--dur-*`.** Hovers, presses, menus and the
   product screens share `--dur-*`; the founder's complaint was the timed pieces. Making
   `--dur-*` quicker would have changed every button and the workspace too.
2. **`pace` is 1, and the play tokens hold the new values.** The setting then multiplies
   everything, including the reading time, and reads as "the pace chosen on 25 Oct"; the table
   above is the before and after.
3. **A flow's step counts its title and the work lines it ticks, not the paragraph under the
   title.** Counting the paragraph too (8 to 33 words) makes the homepage's steps about 5 s
   each: slower than the 4.4 s the founder found too slow. The title is also the step's name on
   the rail, and the chat and work lines stay on screen through the next steps; the paragraph is
   there for a visitor who pauses or picks a step. **For the founder:** if he wants the
   paragraph read while it plays, the flow becomes slower than before.
4. **A demo's tab counts its caption, overlapping its arrivals.** The messages arrive in the
   first 1 to 2 s, during which the caption is already on screen.
5. **Long text now gets a long step.** Four flow steps (16 and 17 words: one on /bookings, one
   on /accounts, two on /docs) dwell 4.6 and 4.8 s, longer than the 4.4 s before; two demo tabs with 26-word captions (/docs'
   receipt, /shelf's "unpaid") dwell 7.2 s, longer than the 6.5 s before. That is the reading
   rule working; it is why /docs' demo is only 8% quicker. **For the founder:** shortening
   those captions (copy, both languages, then the Arabic review) would bring them in line, or
   `pace` at 0.9 would bring the loops to about 40% at a reading speed of about 255 words a
   minute.
6. **The hero's entrance stays as it was** (the H1's lines, the lead, the buttons, the facts),
   with the figure: it runs before hydration in step with AgentFigure, which another agent is
   rebuilding in another worktree, and it ends within about 1 s already. Pacing half of one
   entrance would put the text out of step with the figure, and the two branches would collide
   on the same lines of `home.css`.
7. **How we work is untouched;** `motion.md` now says its rebuild takes `--play-*` and
   `--play-stagger`.
8. **The X-ray's `inset-inline-end` and the fold's `inset-inline-start` transitions** animate a
   layout property (against `motion.md` rule 5). They were there before; only their durations
   changed here.
9. **The ALYR Agent dashboard's own first-load rise** (`_agent`, shared with the workspace) is
   the product's motion and was not changed.

## Kept as it was (checked)

- **No scripts:** the built HTML of `/`, `/ar`, `/chat`, `/ar/chat`, `/bookings`, `/ar/bookings`,
  `/accounts`, `/ar/accounts`, `/agent`, `/shelf`, `/ar/shelf`, `/docs` and `/ar/docs` is
  identical before and after, apart from asset names and the framework's script payload. The
  progress bars that carry `--words` exist only while a piece plays.
- **Reduced motion** (`--reduced-motion`, on `/`, `/chat`, `/shelf`, `/ar/docs`, scrolled to the
  end, every tile hovered): no animation running, every flow on its last step, no progress bar,
  no Pause button, no tile played, `motion` off.
- **Plays once:** unchanged; the one-shot pieces still play once, the flows and demos still loop
  only while on screen and pause.
- **RTL:** `/ar` flow and `/ar/shelf` figure and demo measured above; the tiles on `/ar` use the
  mirrored wipe with the same timings.
- **Light and dark:** the motion tokens have no dark values; axe ran in both themes (below).

## Checks

- `pnpm exec tsc --noEmit`: pass. `pnpm lint`: pass.
- `node scripts/design-check.mjs` (the token drift check): 426 files clean, 5 allowed exceptions;
  `node scripts/tokens-build.mjs --check`: 360 tokens, up to date.
- `pnpm site:check`: build, EN/AR parity, banned words and prices, internal links (1130), and the
  new pace check, all pass.
- `pnpm site:a11y --pages=/,/chat --runs=3`: axe no issues on `/` and `/chat` at 1440 and 390,
  light and dark. Lighthouse mobile, lowest of 3: `/` Performance 96, Accessibility 100, LCP
  2.41 s, CLS 0.000; `/chat` 95, 100, 2.42 s, 0.000.
- Weight: the built site's JavaScript +335 bytes gzipped, CSS +223 bytes.

## Not checked

- On a real phone or in Safari or Firefox (headless Edge only); `max()` with times inside
  `animation-duration` is supported in all three, not tried there.
- Whether the new dwells read well to a person: reading speed was computed, not tested with an
  owner. Arabic dwells use the English rate per word.
- Dark mode's timing was not measured separately (no motion token changes with the theme).
- The tiles at 390: Shelf's and Docs' tile played before the probe reached them, so only four of
  six were measured there; the same CSS runs at every width.
- Lighthouse before the change, for comparison (only after).
- Screenshots: the still frames are unchanged (same HTML, motion-only CSS), so none were taken
  for the founder; he should look at the flow and a demo playing in a browser.
- The other agents' branches (AgentFigure, How we work): not merged with this one.
