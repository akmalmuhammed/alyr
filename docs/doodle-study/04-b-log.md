# Direction B, "Schematic: the wiring we do for you": build log

28 Oct 2026, Site and brand lane, one of four parallel builders working from
[03-pro-brief.md](03-pro-brief.md). This is a Framer prototype only: nothing on alyr.qa changed,
nothing was published, nothing was committed (the lead commits). No Linear issue was given, and the
overall state of ALYR did not change, so `docs/status.md` and the lane brief's "Now" are not
updated. Four builders work in parallel, so a shared edit to either file would collide; the lead
can add one line when choosing a direction.

## What is built

**Framer:** project "ALYR homepage prototypes"
(https://framer.com/projects/LyKozm5SR5CGo5YpDJXA), page **"Hero background B: schematic"** at
**`/hero-schematic`** (node `Gn1JSNoUY`), made by duplicating `/doodle`. Open it with Preview (▶)
while signed in; the canvas shows the finished still.

| Breakpoint | Instance | Controls |
|---|---|---|
| Desktop 1440 (`OwhU37868`) | `UEvTFIHxz`, absolute, fills the 820 px first screen | Layout wide, Scale 1, Gutter 48 |
| Breakpoint 3, 1024–1439 (`kQPFoCDUq`) | the replica, fills the 760 px first screen | Scale 0.7, Gutter 41 |
| Breakpoint 2, below 1024 (`Ib88IuKgp`) | the replica, anchored to the bottom, 360 px tall, under the hero | Layout phone, Gutter 20 |

- **Code file:** `BgSchematic.tsx` (`codeFile/QY_x3Vr:default`), one default export, inline SVG and
  CSS keyframes, no libraries, no images. Controls: Layout, Still at (s), Scale, Gutter, Mirror
  (RTL), Fold lights, and the four Pause words. The same source is
  `docs/doodle-study/harness-b/BgSchematic.tsx`.
- **The strip** reads "PROTOTYPE 05B · SCHEMATIC", with "One afternoon in 28 s, on a loop. It moves
  in Preview; the canvas shows its still frame." (1024 and 390: "One afternoon in 28 s. Moves in
  Preview."). The strip's link to `/ar/doodle` is hidden on this page: there is no Arabic version yet.
- **Not touched:** every other page, including `/doodle` (its own instance `YveD07pKI` was checked
  after the build), and every other code file. Another builder's `/hero-signal` and `BgSignal.tsx`
  appeared during the build and were only listed. Every write was preceded by a check that my page
  or file was still as I left it.

## The drawing

A technical wiring diagram whose whole run follows the fold's own diagonal: in at the top inline-end,
through the fold, out along the bottom towards the inline-start.

- **Four ports** on the far edge (MESSAGE, CALL, WALK-IN, LINK): off-sheet connector flags, 84 × 24,
  48 apart, pointing into the sheet, mono labels.
- **The input bus:** each trace leaves its port, jogs at 45° into a four-track bus at a 16-unit pitch
  (a connector fan-in), runs inward and bends down into the fold's top edge. The bend is concentric:
  each outer track's 45° cut is 16 × (2 − √2) longer than the one inside it, so the diagonal runs keep
  the same 16-unit spacing as the straight runs.
- **The block is the Command Fold:** the symbol's three planes from `_site/brand.tsx`, at its own
  size (190 × 160, scaled whole, never redrawn), on `ALYR/surface` with hairline edges. Inputs land
  on four pins on the top plane; outputs leave five pins on the Volt plane's bottom edge; the
  report leaves from the triangle's apex, along the fold's diagonal.
- **The output bus:** five tracks, 16 apart, bend concentrically and run along the bottom; the
  outermost peels off first, so the bus tapers in a staircase with no crossings. ORDERS drops
  straight down. Terminals are 176 apart on the 8 px grid; REPORT's text starts at x 48, on the
  hero's own text edge.
- **Six terminals:** a pad (8 × 8), a mono label, the reading in Instrument Sans (18 px, tabular
  figures), one or two lines of detail in the product's words.
- **Lines:** every trace and outline is `ALYR/d-hair-2` (Carbon 14% on Paper, white 13% on Carbon),
  1 px, on half-pixels at 1× so edges stay crisp. The one heavier weight, 1.5 px in
  `ALYR/line-strong`, is the **active path**: the newest reading's route, drawn on behind its
  signal and held until the next landing.
- **Signals** are ink: a 24-unit `ALYR/text` head at 1.5 px with a 64-unit `ALYR/line-strong`
  trail, travelling the traces with sine in-out, turning every 45° corner.
- **Volt** only on what just became true: the pad of the reading that just landed (a fan-out from
  one input lights two, ORDERS then STOCK), and, once the report lands, the fold's Volt plane, so the
  outlined fold becomes the ALYR mark at the end. Never more than two at once (measured below).
- **Readings change** along the 45° travel (the old one leaves up and towards the inline-end, the new
  one arrives from below and the inline-start, 5 units), `--ease` in, sine out, `--play-4` and
  `--play-3` at pace 1.3.
- **The headline zone is empty:** nothing is drawn in x 0–760, y 140–560 at 1440. The highest bus
  track (REPORT) runs at y 568 in the first screen, 41 px under the buttons.
- **Sample mark:** one mono caption, "SAMPLE · QIRFA BAKERY", above the ports (on the phone, two
  lines beside the fold).
- **Phone (390 × 360):** the ports in a row pointing down, the fold at half size, a spine of six
  tracks that peel off left and right to two columns of three terminals (text aligned to the spine),
  with shorter words (see below).
- **Mirrors** for Arabic: the shapes flip as one group (the fold's diagonal included), the words are
  drawn unmirrored at mirrored positions with flipped anchors, and the 45° travel follows the
  direction. Checked with the Mirror control in English (`mirror-1440-light-12.8s.png`); the
  harness's own headline shows English set right to left, which is the harness, not the art.

## The afternoon: 28 s

Qirfa Bakery (fictional), the homepage's sample. Four things arrive at once; the fold holds each at
its pin (a filled pin is a caught item waiting) and hands them on one at a time; then it moves things
on by itself; then the report resolves to the hero dashboard's own sentence.

| Time (s) | What happens |
|---|---|
| 0.8, 1.3, 1.8, 2.3 | MESSAGE, CALL, LINK and WALK-IN fire; four signals are in flight together |
| 3.4 | ORDERS 47 → 48, "#1440 · New" (from the message) |
| 4.5 | STOCK "Pistachio kunafa cheesecake" 6 left → 5 left (the same order) |
| 5.3 | BOOKINGS "6:00 pm · Cake tasting · Booked" (from the call) |
| 6.5 | ORDERS 48 → 49, "#1441 · New" (from the link) |
| 7.6 | STOCK 5 left → 3 left |
| 8.9 | OWED QAR 9,575 → QAR 12,975, "+ QAR 3,400 on account" (from the walk-in) |
| 9.2 | MESSAGE fires again |
| 11.8 | ORDERS 49 → 50, "#1442 · New", the week's 50th |
| 12.9 | STOCK 3 left → **Sold out** |
| 14.5 | BOOKINGS: "Reminder sent · 2 h before" (by itself, no input) |
| 17.2 | RECEIPTS: "Receipt sent · #1442" (by itself) |
| 20.1 | REPORT: **"Week so far: 50 orders, QAR 8,520."**, along the fold's diagonal; the fold's Volt plane lights |
| 20.1–25.3 | Calm: every reading final |
| 25.3–25.8 | The readings return to the start; the Volt goes out |
| 28 = 0 | Start state again (seamless) |

Times are the landings sampled in the harness with no screenshots (from page load, which is the
loop's clock start). **Still frame** (reduced motion and Framer's canvas) is 22 s: every reading
final, REPORT's pad and the fold lit, REPORT's route as the active path.

**Every number agrees** with the engine's sample (`apps/web/app/_agent/samples/bakery.en.json`,
Thursday 16:20) at the end of the loop: Orders this week 50, Sales QAR 8,520 (and its exact
summary sentence), Owed to you QAR 12,975. The start values are derived from it: 47 orders three
orders earlier; QAR 9,575 owed = 12,975 − 3,400. The stock line uses copyShelf's "6 a day" for the
same cake; three orders take 1, 2 and 3. Order numbers run #1439–#1442 so #1442 is the 50th, as
in copy.ts. The 2 h reminder is the code's `REMIND_BEFORE` (`modules/bookings/service.py`).

## Checked (harness, headless Edge, profile `C:\t\bgB`, port 3121)

- **Volt:** a sampler read every Volt element's opacity each frame for 29 s: **at most 2 visible at
  once** (at any opacity above 0.05). The first run found 3 for about 0.2 s while the previous pad
  faded out under a new landing; each pad's window now ends one fade before the next landing.
- **Nothing flashes** more than about once a second; landings are 0.8 to 3 s apart.
- **Pause:** pressed at 5 s, the signals hold for 3 s; the button's name changes from "Pause the
  diagram" to "Play the diagram"; Play moves them again.
- **Off screen:** scrolled 3,000 px away, nothing moves for 3 s; it moves again on return.
- **Reduced motion:** the 22 s still, no style sheet, no Pause button.
- **Size:** 180 SVG nodes, 40 KB of source, about 60 CSS animations.
- **Framer canvas:** the still at 1440, 1024 and 390, light and dark, no diagnostics.

## Files

- `docs/doodle-study/harness-b/` (a copy of the doodle harness, which was not edited):
  `BgSchematic.tsx` (the Framer source), `site/index.html` (the hero as in Framer, the ALYR/...
  colour styles as CSS variables, light and dark, `?at=`, `?mirror=1`, `?s=`, `?tall=1`),
  `build.mjs` (TypeScript from `D:\alyr whatsapp\apps\web`, since this worktree has no
  node_modules), `serve.mjs` (port 3121), `rec.mjs` (CDP screencast) and `eval.mjs` (one expression
  in the page, no screenshots: the Volt sampler and the Pause test).
- `docs/doodle-study/shots-b/`:
  - `loop-en-1440-light-a-arrivals-2.4s.png`, `-b-records-7.4s`, `-c-sold-out-12.8s`,
    `-d-report-in-flight-18.6s`, `-e-week-so-far-22s`;
  - `en-1440-dark-12.8s.png`, `en-1024-light-12.8s.png`, `en-390-light-7.4s.png`,
    `en-390-dark-12.8s.png`, `mirror-1440-light-12.8s.png`, `en-1440-reduced-motion-still.png`;
  - `loop-en-1440-light.mp4` (30 s, one full loop and a little; 0.4 MB) and `loop-en-390-dark.mp4`
    (29 s; 0.3 MB): CDP screencast, ffmpeg 9.0.2, 30 fps;
  - `framer-en-{1440,1024,390}-light.jpg`, `framer-en-{1440,390}-dark.jpg`: Framer's canvas.

## Fixed while looking

- The fold at 1.5× read as a giant logo and its Volt plane was too loud: it is now the symbol's own
  size, and the bus was re-laid on the 8 px grid at a 176 px terminal pitch (STOCK's item name
  needed the room).
- The phone's four-line readings overlapped in 360 px: the phone has one detail line each (two for
  the cake's name, in the bottom row), and the caption moved off the fold.
- Nothing tied a landed reading to its wire: the active path (the brief's 1.5 px line) was added.
- The opening signals were too short to read at a glance: head 18 → 24, trail 44 → 64.
- In the still, every signal's head sat at the start of its trace (an undefined style overrode the
  computed offset), and the Pause button showed on the canvas. Both fixed.
- ORDERS said "Confirmed": orders are created "New" and the team confirms them
  (`modules/orders/service.py`). It now says "New", which also agrees with the dashboard's "2 orders
  need confirming".

## What Framer could not do, or did only by workaround

- **Long source:** the program cannot read local files, so the source was uploaded with
  `create_upload_url` and fetched inside the program, with its length checked and no CRLF.
- **A new file's controls** apply only after it compiles (as in 02-prototype-log): set in a second
  program.
- **The phone replica** inherited `top: 0` and came out 200 px tall; `top: null` with `bottom: 0`
  fixed it.
- **Motion plays only in Preview,** and the agent cannot sign in to Preview; the timing above is
  from the harness running the same source.
- `api.store` does not survive between sessions; the ids are written above.

## Departures from the rules (each needs a yes before this goes near the site)

1. **A diagram on the homepage, not the product.** `alyr-design` §1.6 "the product is the
   illustration". The brief says A, B and C need a written exception. Its product fragments are the
   product's real words and numbers, but it is not a real screen.
2. **The logo's geometry as a component.** The fold is the symbol's own points, scaled whole, drawn
   as outlined planes on `surface`, its Volt plane filled only at the end. Is drawing the symbol in
   outline a "redraw or recolour"? The founder decides (the `Fold lights` control turns the Volt fill
   off).
3. **It loops** (D-059 allows it, with Pause, the off-screen stop and the still). `motion.md` rule 1
   still says "plays once".
4. **Values that are not tokens:** the 28 s loop, sine in-out for travel, the signal's 24 and 64
   units, 1.5 px, the pins (6), pads (8), the 5-unit travel, the 16-unit pitch and its nested cut.
   Colours, type, `--ease`, `--play-3/4` and the pace are tokens.
5. **Volt on Paper** as a filled pad with a Carbon edge (as the doodle's tip). Volt for "the event
   in flight" comes from the brief, against the skill's "never a pulse": the signals themselves
   stay ink.

## Open for the founder (Needs Akmal)

1. Is a wiring diagram right for the homepage at all (§1.6), and may the fold be drawn in outline?
2. **Claims to confirm:**
   - **CALL and WALK-IN:** ALYR answers no calls and sees no walk-ins. The team books the call in
     Bookings and puts the walk-in on account; the drawing shows where they end up, not who typed
     them.
   - **"Receipt sent":** that is ALYR Docs, built and off for every shop (D-042). The brief asks for
     it, but the honesty rules say Docs is never "available".
   - **The brief's "confirms the order":** this is changed to "New". If he wants "Confirmed", it
     needs a step showing the team's tap.
   - **The payment behind #1442's receipt** is not drawn: a payment link would imply card payments,
     which are not live.
3. **Numbers:** three orders in the loop (47 → 50), where the task said 49 → 50, so it shows "tracks
   multiple orders"; each order's cake count (1, 2, 3); #1439–#1441.
4. The pace: 28 s; the calm holds about 5 s.
5. The Arabic: not drawn yet; the art mirrors and the words are in one table, ready for it.

## Not checked

- Framer's own Preview: the loop, Pause, the off-screen stop there. Only the canvas and the
  harness were seen.
- A hidden tab in a real browser (same path as off screen, `visibilitychange`).
- Safari, Firefox, a real phone, touch, and 320 px.
- Mirrored layout in Framer, and on the phone in the harness (seen at 1440 in the harness only).
- 1024 in dark.
- axe, a screen reader and keyboard order. The art is `aria-hidden`; the Pause button is a real
  button with a name.
- Contrast: measured nowhere. The words use `text`, `text-muted` and `text-faint` (3:1, labels
  only); the headline sits on empty paper.
- CPU and battery on a slow phone, beyond the node count.
- The rest of the homepage below the hero; the founder's comparison with A, C and D.
- Real-business name checks: Qirfa's manual check is still open (honesty.md).
