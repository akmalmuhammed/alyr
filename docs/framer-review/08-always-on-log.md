# 08 · Motion always on: build log

26 Oct 2026. Branch `aly-always-on` from `origin/aly-pace-slower` (PR #142, pace 1.3), worktree
`D:\alyr-loop`. No Linear issue was given. Not merged, not published. Lean path of
`alyr-design-review` (no new wording beyond the Pause and Play labels, the founder's decision
already taken); the two critics were not run. Preview ports 3181 (the build of PR #142, for
before), 3182 to 3188 (builds of this branch); never 3100. Edge profiles `C:\t\loop*`.

## The founder's instruction (26 Oct 2026, relayed in the brief, verbatim)

"animation is super fast now make it a bit slower, always it should be always on animations
and motions"

"A bit slower" is PR #142 (`motion.pace.pace` 1 to 1.3). This branch is "always on", and puts
the hero's beat on the pace too. Recorded as D-059 and in `alyr-design/motion.md` rule 1 and
"Figures that keep playing".

## Every timed piece, before and after

Cycle lengths measured on the built site at pace 1.3 in headless Edge, no screenshots
(`animationend` of each cycle's fade; the hero from its rows arriving). English at 1440 unless
said.

| Piece | Pages | Before | After | Cycle | Pause control |
|---|---|---|---|---|---|
| Live ALYR Agent figure (hero) | `/`, `/ar`, `/agent`, `/ar/agent` | Looping, one event every 4.0 s (5.0 s on a phone), literal | Looping, beat on the pace (`--live-beat`) | One event every 5.2 s (6.5 s on a phone); measured 5.22 s and 6.53 s | Its own, beside "ALYR · Running" (unchanged) |
| Flow (One order; each product's How it works) | `/`, `/ar`, every product page | Looping through its stories while on screen | Looping; now also stops in a hidden tab | Unchanged by this branch (each step dwells for its words at the pace; 07-pace-log.md has the pace-1 numbers, times 1.3) | Its own Pause in the tab row (unchanged) |
| Tabbed demo | `/chat`, `/bookings`, `/accounts`, `/shelf`, `/docs` and Arabic | Looping through its tabs while on screen | Looping; now also stops in a hidden tab | Unchanged by this branch | Its own Pause (unchanged) |
| How we work, Check | `/`, `/ar` | Once in view, again on hover, focus or press | Loops | 9.3 s (8.7 s Arabic 390) | One "Pause" under Improve for the four |
| How we work, Set up | `/`, `/ar` | Once, as above | Loops | 7.8 s (7.1 s Arabic 390) | The same one |
| How we work, See | `/`, `/ar` | Once, as above | Loops | 6.0 s | The same one |
| How we work, Improve, with the return line | `/`, `/ar` | Once; the line drew once per page | Loops; the line draws again with each Improve, its words stay | 9.1 s | The same one |
| Products frame, Chat tile | `/`, `/ar` | Once: on hover or focus with a mouse, in view on a phone | Loops, in view on every screen | 8.6 s | One "Pause" at the plate's bar end for the six |
| Products frame, Bookings | `/`, `/ar` | Once, as above | Loops | 5.7 s | The same one |
| Products frame, Agent | `/`, `/ar` | Once, as above | Loops | 9.0 s | The same one |
| Products frame, Accounts | `/`, `/ar` | Once, as above | Loops | 4.5 s | The same one |
| Products frame, Shelf | `/`, `/ar` | Once, as above | Loops | 3.8 s | The same one |
| Products frame, Docs | `/`, `/ar` | Once, as above | Loops | about 4.7 s (computed; below the fold in the probe, not measured) | The same one |
| Signature figure, "The last one" | `/shelf`, `/ar/shelf` | Once | Loops as one figure | 6.5 s (English 1440 and Arabic 390) | One "Pause" above the end of its label line |
| Signature figure, "A payment becomes paper" | `/docs`, `/ar/docs` | Once | Loops as one figure | 6.2 s | The same kind, its own |
| Business day's fold (`FoldSplit`) | `/`, `/ar` | Sweeps once when first read | Unchanged: once | Under 1.2 s | None needed (ends within 5 s) |
| `/chat`'s X-ray | `/chat`, `/ar/chat` | Follows the reading line | Unchanged | | None needed (moves with the reader) |
| A business tab's rows | `/`, `/ar` | On the visitor's choice | Unchanged | | |
| Reveals, heading splits, facts, closing call's fold and mark | every page | Once | Unchanged: once | | |
| ALYR Agent spotlight, `/agent`'s opened card and report | `/`, `/agent` | Still (the dashboard's own first rise) | Unchanged | | |

**Kept one-shot, and why** (motion.md rule 1): text arriving as it is read stays put, or the
page could not be read. The business day's fold is a control the visitor drags, with words on
both sides; a timer moving it would fight the hand and wipe the "With ALYR" rows from under a
reader. The X-ray already moves whenever the reader does; a timer replaying its chat while the
list beside it is read would be a looping text reveal. Hovers and presses stay as they were.

## How it works

- **`_site/loops.ts`** (called from SiteMotion; replaces SiteMotion's play-once code for the
  cards, the tiles and the signature figures). A group (`data-loop`) holds players
  (`data-loop-play`); `is-in` plays one. Each player carries `--words` (the words its scene
  comes to, from `words()` in `pace.ts`) and its scene's end (`--hw-end`, `--sf-end`,
  `--sig-end`, in beats); its finished state holds for
  `max(--dwell-min, words × --read-word + --dwell-beat)`, then one element fades out
  (`loop-out`); at the fade's end every CSS animation of the player is wound back to its start
  and it fades back in (`loop-in`). No timers: the cycle is CSS, so `--pace` tunes it. The
  products frame adds 8 beats a tile so the six never fade together.
- **It stops when nobody is watching:** a group off screen (IntersectionObserver) or in a hidden
  tab (`visibilitychange`) has its running animations paused where they are, and carried on.
  The flows and demos (`FlowDiagram.tsx`, `ProductDemo.tsx`) also stop in a hidden tab now.
- **Pause** (`LoopToggle.tsx`; words in `copy.ts` `loop`, both languages): "Pause" / «إيقاف»,
  "Play" / «تشغيل» shown, full names "Pause the four scenes" / «إيقاف حركة المشاهد الأربعة»,
  "Pause the six products" / «إيقاف حركة المنتجات الستة», "Pause the drawing" / «إيقاف حركة
  الرسم» (and Play). The name starts with the word shown (WCAG 2.5.3). `hidden` in the HTML,
  shown once its figure plays, out of the flow over room kept for it, so it moves nothing.
  Pause finishes every move at once and holds the finished state; Play plays all from the start.
  While paused, a hover, focus or press still plays one card or tile once, and it rests finished.
- **The styles** (`loopStyle.ts`) go into the page from loops.ts, not a stylesheet or the HTML
  (below, "LCP").
- **The hero's beat:** `--live-beat` and `--live-beat-phone` (4000 and 5000 ms, paced) in
  `design/tokens.json`; `PLAY.beat` and `PLAY.beatPhone` in `pace.ts`; `AgentFigure.tsx` uses
  them.

## Decisions taken while building, and why

1. **One Pause control per figure or section, not a site-wide one.** The hero, the flows and
   the demos already carry their own where a visitor looks; a site-wide "Pause motion" would
   need a new control in every page's header (a crowded row: Products, By business, How we
   work, Questions, the language link, the theme switch, the button) and would not reach
   those three without rewiring them.
2. **Words held, not every line.** A hold counts the words of the result a scene comes to (the
   signature figures: Aisha's order, Sold out, Mariam's notice; the receipt, the PDF, Sent),
   not every line in it: counting all of "The last one" held it for 9 s, and the figure read
   as stopped. The cards count what each scene adds (Check's four findings: 20 words, so its
   cycle is the longest, 9.3 s).
3. **The fade between cycles is the whole drawing** (the scene in a card, the fragment in a
   tile, the stage of a signature figure, 1.3 × `play-3` each way), so a cycle never jumps from
   finished to started. A visitor's replay jumps, as before.
4. **The return line redraws with Improve,** its Volt corner on Check too; its words "Then we
   check again." stay, since they are text.
5. **Restart by winding back** (`currentTime = 0` on each CSS animation), not by taking `is-in`
   off and on with a forced layout: the first build looped once and stopped, because inside the
   canvas's size container Chrome did not restyle the subtree on the forced layout, and the
   fade animation kept its name and so its finished state. Chrome also sends a second
   `animationend` once the fade is wound back; loops.ts acts only on a fade that has finished.
6. **The products frame's bar keeps 5 rem at its end** for the Pause control. At 320 px the bar
   now takes three lines instead of two (the time drops to its own line); at 390 and wider it
   is as before.
7. **Desktop tiles no longer wait for a hover:** they play in view, as on a phone. The rule of
   25 Oct ("a moment may wait for the visitor; while it waits it rests finished") is replaced by
   the founder's 26 Oct word; a tile still rests finished until it is first seen.

## LCP

The first version kept the cycle's CSS in the render-blocking stylesheets: `/`'s simulated LCP
went from 2.42 to 2.52 s. Inlined in the head (as `liveStyle.ts` does) it stayed at 2.52 s: the
HTML grew 2.6 KB gzipped, because React writes inline styles twice (the head and its payload).
A bisect on built copies served side by side showed the head style itself was not the cause,
the HTML's growth was. Now the CSS ships in the scripts and loops.ts puts it in the head when
it starts (`/`'s HTML is 677 bytes larger gzipped than PR #142's), and five alternating
Lighthouse runs on fresh servers read the same: before 2.53, 2.42, 2.27, 2.42, 2.27 s; after
2.52, 2.42, 2.27, 2.42, 2.27 s (the first run cold on both).

## Checks (built site, served compressed)

- `pnpm site:check`: build, EN/AR parity, banned words and prices, 1,128 internal links, the
  pace check: pass. `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`,
  `node scripts/design-check.mjs` (433 files clean), `node scripts/tokens-build.mjs --check`
  (362 tokens): clean.
- **axe** (`pnpm site:a11y --no-lighthouse`, 1440 and 390, light and dark): `/`, `/ar`, `/shelf`,
  `/docs`, `/ar/docs`, `/chat`: no issues. Also axe on each looping group while playing and while
  paused, with its Pause control shown (How at 1440 light and Arabic 390 dark; the frame at 1440
  dark and Arabic 390 light; `/shelf` 1440 dark; `/ar/docs` 390 light): no violations.
- **Lighthouse** mobile, lowest of 3 (`pnpm site:a11y --no-axe`): `/` 95, LCP 2.52 s, CLS 0 (its
  first, cold run; PR #142's build measured the same way read 94, 2.42 s, and 2.53 s cold in the
  alternating runs above); `/ar` 95, 2.42 s; `/shelf` 98, 2.26 s; `/docs` 98, 2.41 s;
  Accessibility 100 on all.
- **Pause:** pressed on every group: the name swaps, nothing runs for 6 s, every scene at full
  opacity, no cycle ends; Play runs them again. Both languages.
- **Off screen and hidden:** scrolled away, every running animation of the group paused (38 on
  How we work) and no cycle ends for 5 s; back, it carries on. A hidden tab (simulated
  `visibilitychange`): nothing runs; visible again, it carries on. Flows and demos on `/chat`:
  their progress bar goes when the tab is hidden and comes back.
- **Reduced motion** (`--reduced-motion`, `/`, `/ar/shelf`, `/docs`, scrolled to the end): no
  animation running, no `is-in` on a looping figure, every Pause control hidden.
- **No scripts:** every Pause control is `hidden` in the built HTML; the figures are the finished
  HTML as before.
- **Layout shift:** none at the groups over 25 s of cycles (`/` and `/ar`, 1440 and 390); the
  only shift seen, 0.0001 while scrolling past How we work's return line, is the same on PR
  #142's build. **320 px:** `scrollWidth` 320 on `/`, `/ar`, `/shelf`, `/ar/docs` with the Pause
  controls shown.
- **Numbers each cycle:** a scene only plays from its earlier state to the HTML's finished
  state (both from the engine's sample), so every cycle ends on the same true numbers (See: 49
  to 50 orders, 181 to 183 sent; Improve: QAR 7,129 against 8,520, up 20%).

## Screenshots and recordings (not committed)

`docs/framer-review/shots-loop/`:
- `home-en-1440-light-how-a.png`, `-b.png` (two moments: See and Set up mid-cycle; Improve
  restarted, the line about to draw again), `home-ar-1440-light-how-a.png`,
  `home-en-390-light-how-a.png`, `home-ar-390-dark-how-a.png`;
- `home-en-1440-dark-frame-a.png`, `-b.png` (Accounts fading between cycles),
  `home-ar-1440-light-frame-a.png`, `home-en-390-light-frame-a.png`,
  `home-ar-390-dark-frame-a.png`, `home-en-320-light-frame.png` (the bar on three lines);
- `shelf-en-1440-light-sig-a.png`, `-b.png`, `shelf-ar-390-dark-sig-a.png`,
  `docs-ar-1440-dark-sig-a.png`, `docs-en-390-light-sig-a.png`;
- recordings (CDP screencast at 20 fps, ffmpeg): `how-we-work-en-1440-loop.mp4` (24 s),
  `products-frame-en-1440-loop.mp4` (24 s), `how-we-work-ar-390-dark-loop.mp4` (16 s).

## For the founder

1. Watch the two recordings: is each cycle's rhythm right? The holds follow the reading rule;
   if it feels busy or slow, `--pace` (all of it) or the words counted per scene tune it.
2. The products frame's bar at 320 px is three lines now (Pause needs its room).
3. The Arabic Pause names are a draft for ALY-66.

## Not checked

- Safari, Firefox, a real phone (headless Edge only; touch not exercised).
- A screen reader by ear; the Pause controls by keyboard by hand (they are native buttons; axe
  and a scripted click only). The focus ring was not looked at in a screenshot.
- The flows' and demos' full cycle at pace 1.3 (unchanged by this branch, not re-measured).
- The products frame's Docs tile cycle at 1440 (computed, below the probe's screen).
- 768 and 1024 widths, and `/agent`, `/bookings`, `/accounts` (no looping piece of this branch
  there; the hero beat measured on `/` only).
- Long sessions: memory over many minutes of cycles; a laptop on battery.
- The critics (design, copy and Arabic) and a native Arabic review.
