# Direction C, "Signal field: a week, counted": build log

28 Oct 2026, Site and brand lane, for the creative director's brief
[03-pro-brief.md](03-pro-brief.md). This is a Framer prototype only. Nothing on alyr.qa changed,
nothing was published or committed. No Linear issue was given, so the lane brief and
`docs/status.md` are not updated: the overall state did not change.

## In three lines

A precise dot matrix on a 16 px grid fills the far side of the hero and thins out toward the
headline. Each of Qirfa Bakery's events that week lights a dot. A short hairline carries it at 45°
and then 90° to the gathering line, where each order settles as one block in its day's bar,
beside last week's. Fifty orders make fifty blocks; on Thursday, "Week so far: 50 orders,
QAR 8,520" resolves under the bars, holds about 5 s, and the field resets.

## What is built

**Framer:** project "ALYR homepage prototypes"
(https://framer.com/projects/LyKozm5SR5CGo5YpDJXA). The work is in the page **"Hero background C:
signal field", `/hero-signal`** (node `O71lcLhcB`), and the code file **`BgSignal.tsx`**
(`codeFile/MZJpUjd:default`). Open it with Preview (▶) while signed in.

- **How the page was made:** `/hero-signal` was duplicated from `/doodle`, with its prototype
  strip, header and hero at 1440, 1024 and 390. The doodle instance was removed from the
  duplicate and the `BgSignal` instance "Signal field background" (`rvLEU4Xdu`) inserted in its
  place.
- **The instance per breakpoint:**
  - Desktop: Layout 1440, gutter 48. It fills the 820 px first screen absolutely, behind the
    header and hero.
  - Breakpoint 3: Layout 1024, gutter 41.
  - Breakpoint 2: Layout Phone, gutter 20, 360 px at the bottom of the first screen, as the
    doodle was.
- **The strip:**
  - Desktop and 1024: "PROTOTYPE 05C · SIGNAL FIELD · NOT THE LIVE SITE". The hint reads "One
    week in 30 s, on a loop. It moves in Preview; the canvas shows its still frame." (at 1024,
    "One week in 30 s. Moves in Preview.").
  - Phone: "PROTOTYPE 05C · SIGNAL FIELD" and "Not the live site. One week in 30 s, in
    Preview.". At 390 the long label wrapped and the long hint was cut off.
  - The strip's "Arabic version" link is hidden on this page, since there is no Arabic page
    yet.
- **Not touched:** every other page and code file, including `/doodle`, `AlyrDoodle.tsx`, and
  the other builders' pages and files. Before each write I re-read that the page and file were
  absent or still mine.

**The component** (inline SVG, no libraries, no images; 37.7 KB of source):
- **Drawing and updates:** React draws the SVG once. One `requestAnimationFrame` loop then
  writes only the attributes that changed, from a pure `frame(t)`.
- **The still:** the same `frame(t)` draws it, so Framer's canvas, reduced motion and the
  "Still at" control show exactly what the loop shows at that second.
- **Controls:** Layout (Auto, 1440, 1024, Phone), Direction (left to right, right to left),
  Still at (s), Gutter, and the four Pause words.

## The numbers, and where they come from

Every figure is the homepage sample's, Qirfa Bakery on Thursday at 16:20
(`apps/web/app/_agent/samples/bakery.en.json`, the hero's feed in `_site/copy.ts`):

| | Sun | Mon | Tue | Wed | Thu (to 16:20) | Total |
|---|---|---|---|---|---|---|
| Sales this week (QAR) | 1,710 | 2,400 | 2,017 | 1,291 | 1,102 | **8,520** |
| Last week by this time (QAR) | 1,803 | 1,922 | 917 | 1,188 | 1,299 | 7,129 |
| Orders, one block each | 10 | 14 | 12 | 8 | 6 | **50** |

- **Bars:** each bar's height is the day's sales, to scale (Monday's QAR 2,400 is 224 px at
  1440). Each block's height is its order's share of that day's sales. A last-week bar is a
  ghost at the agent's `ghost-mix` (10%).
  - Thursday's ghost is last week *by 16:20* (1,299), not the whole day (2,933), so the
    comparison is like for like. The legend says so: "LAST WEEK BY THIS TIME", the dashboard's
    own words.
  - Friday and Saturday are labels only, with nothing above them: the week is not over.
- **The daily order counts are derived, not in the sample.** The sample gives 50 orders for the
  week and sales by day. I split the 50 in proportion to each day's sales: 10, 14, 12, 8, 6. The
  average order is QAR 161 to 184 a day. Nothing prints these counts, but you can count the
  blocks. **Founder: confirm or replace.**
- **Order numbers run from #1392 to #1441, so the week's 50 orders end on the feed's #1441**
  (confirmed at 16:09).
  - **I did not use #1442.** The brief and the ask name it, but in the hero feed #1442 arrives
    at 16:27, after the dashboard's 16:20. It would be the 51st order and contradict "50
    orders".
  - The labels shown are "ORDER #1392" (Sunday's first) and "ORDER #1441" (Thursday's last),
    and 1441 − 1392 + 1 = 50.
- **The other events, each true to the sample's world:**
  - "BOOKED · THU 6:00 PM": the cake tasting at 18:00 (Noor A.), booked on Tuesday;
  - "REMINDER SENT": on Thursday, two hours before (the feed's 16:00 "Booking reminder sent");
  - "PAID · #1427": Tuesday's last order, marked paid on Wednesday. "Paid" is the product's
    own payment state for an order; nothing says how it was paid.
- **The summary line** is the Agent header's own sentence and bold: "Week so far: 50 orders,
  **QAR 8,520**".
- **The sample mark:** "FICTIONAL BAKERY" (mono, beside the summary), once. It shows whenever
  data shows.

## Geometry, line, colour, type

- **The grid:**
  - A node every 16 px (2 × 8), x on multiples of 16, y on 8 + 16n, aligned so the 48 px
    gutter, every bar centre and every route sit on nodes.
  - Dots are true circles 2 px across, centred on whole pixels, so they are crisp at 1× and 2×.
  - The field is 4 nodes, one path per opacity step: 886 dots at 1440, 120 on the phone.
- **The density gradient:**
  - Density rises toward the inline end and the bottom, through a 4 × 4 ordered dither and four
    opacity steps (6, 10, 14 and 19% ink). The thinning reads as engineered, not as a blur.
  - It halves inside the chart, so the bars read.
  - Behind the headline, lead and buttons at 1440 there is no art pixel at all (measured,
    below). At 1024 one faint dot of about 4% ink falls inside the headline's box.
- **Routes:**
  - From a node up and toward the inline end, 45° down toward the inline start (the fold's
    diagonal), then 90° down the bar's own grid column.
  - Most events show only a 56 px hairline trailing the dot (the "short hairline"). The one
    focal event draws its whole path first at 1.5 px in `line-strong`, then the dot travels it.
    Verticals sit on half pixels to stay crisp.
- **Blocks:** 14 px wide, on whole pixels with 2 px gaps, so each order reads as a near-square
  unit. They are 22% ink, beside last week's 10% ghosts, with a canvas underlay so the field
  never shows through.
- **Colour:** only the project's `ALYR/…` colour styles (text, text-muted, text-faint,
  line-strong, volt, canvas, focus), with the ink at the opacities above. Dark is the same
  system turned down, white on Carbon.
- **Volt, never more than two marks at once (measured):**
  - the focal event's dot, with a 1 px Carbon ring, as the doodle's tip;
  - the record just made: the landing block flashes Volt for 0.5 s and fades over 0.8 s;
  - the booking's ring when its reminder goes out;
  - today's 3 px cap on Thursday's bar, as on the dashboard.
- **Type:**
  - IBM Plex Mono 11 px (`fs-micro`), capitals tracked .08em (`tracking-label`), in
    `text-faint` for the days and legend, `text-muted` for the focal label.
  - The focal label has a canvas halo (`paint-order: stroke`), so a falling event never
    crosses its letters.
  - The summary is Instrument Sans 15 px (`fs-small`, 14 on the phone), tabular figures, with
    the amount at 600.

## The loop: 30 s, one week

Times are from the component's schedule (`WINDOWS`, `T`, `LAST_LAND`).

| Time (s) | What happens |
|---|---|
| 0–1.1 | Rest: the field, last week's ghosts, the days, the legend. |
| 0.4–21.6 | Messages: about 30 dots light softly where they are and fade (1.5 s each), in irregular bursts. |
| 1.1 | Focal: "ORDER #1392" lights in Volt; its path draws at 1.5 px. |
| 3.0 | It lands: Sunday's first block, flashed Volt. |
| 3.0–6.0 | Sunday's other 9 orders fall and stack; SUN darkens while it is counted. |
| 6.8–10.6 | Monday, 14 orders. Up to 7 events are in flight at once. |
| 11.4–14.6 | Tuesday, 12 orders. At 12.3: "BOOKED · THU 6:00 PM" travels to a ring on the line beside Thursday's bar. |
| 15.4–17.6 | Wednesday, 8 orders. At 16.0: "PAID · #1427" lands on Tuesday's top block, which flashes. |
| 18.3–20.7 | Thursday's first 5 orders, slower. At 18.6: the ring lights and "REMINDER SENT" rises from it at 90°; the ring then goes. |
| 20.4–22.2 | Focal: "ORDER #1441", the week's 50th, lands on Thursday. |
| 22.5 | Today's Volt cap on Thursday; THU turns ink. |
| 22.7–27.3 | The summary arrives along 45° (12 px, `--ease`) and holds. Nothing else moves. |
| 27.3–29.1 | Reset: the summary and cap fade; the blocks leave last first, 24 ms apart. |
| 29.1–30 = 0 | Rest. Monday morning again. |

**Still frame** (reduced motion, Framer's canvas): 24.6 s. All 50 blocks, the summary, today's
cap; no event in flight.

Durations are the site's `play-*` tokens times `--pace` 1.3:
- 0.19 s: a dot's hand-over;
- 0.37 s: a block's arrival, a dot's lighting;
- 0.56 s: the summary, a path's fade.

Travel along a route is sine in and out at about 240 px/s (150 on the phone), 1.05 to 1.9 s per
event.

## Measured (harness, headless Edge, no screenshots during timing)

- **Timing** (32 s sampled every frame, starting 0.97 s into the loop; times below are loop
  times):
  - every focal label appeared on schedule: #1392 at 1.09, BOOKED at 12.32, PAID at 16.02,
    REMINDER SENT at 18.72, #1441 at 20.42;
  - #1441 landed at 22.20, today's cap at 22.52;
  - the summary was visible from 22.77 to 27.55;
  - the cycle repeated after exactly 30.00 s.
- **Volt:** at most 2 marks at once.
  - Two show together only in a hand-over: dot to block for about 0.1 s each time, block to
    ring for 0.1 s, and block to today's cap for 0.65 s.
  - Nothing flashes more than once a second.
- **Counts:**
  - 50 blocks at the resolution, never more;
  - at most 7 events in flight at once;
  - 123 SVG nodes at 1440 and 122 on the phone (the brief allows about 800).
- **Pause:** at 1440 (7 s) and 390 (9 s), Pause froze every element for 4 s. The button's name
  went from "Pause the background" to "Play the background" and back; Play moved it again.
- **Off screen:** scrolled 3,000 px away, nothing moved for 3 s, and it moved again on return,
  at both widths.
- **Reduced motion:** the 24.6 s still, no Pause button, nothing moves.
- **Seam:** the 30 s state equals the 0 s state (no blocks, no summary, nothing lit). The
  recording runs across it.
- **Headline contrast,** with the hero text hidden (`?bare=1`):
  - 1440: zero art pixels in x 0–830, y 140–560, light and dark. Headline on canvas 16.7:1
    light, 17.4:1 dark.
  - 1024: the darkest pixel behind the headline is #ecede9 (15.3:1); the lead and buttons are on
    clean canvas.
- **320 px:** no sideways scroll (`scrollWidth` 320).

## Files

- `docs/doodle-study/harness-c/`, a copy of the doodle harness:
  - `BgSignal.tsx`, the same source as in Framer;
  - `site/index.html`: the doodle's hero, `?at=`, `?lang=ar` (mirror test), `?mode=`,
    `?bare=1` (art only);
  - `build.mjs`: it uses `D:\alyr whatsapp\apps\web`'s TypeScript when the worktree has no
    `node_modules`;
  - `serve.mjs`, on port 3131;
  - `rec.mjs`, with Edge profile `C:\t\bgC`. Its modes:
    - `record`: CDP screencast;
    - `timing`: Volt marks, blocks, labels and the summary, sampled every frame;
    - `pause`;
    - `count`: nodes, dots and `scrollWidth`.
- **`docs/doodle-study/shots-c/` (1.6 MB):**
  - `loop-en-1440-light-a-1.4s.png`: "ORDER #1392" and its path;
  - `loop-en-1440-light-b-13.2s.png`: Tuesday stacking, "BOOKED" in flight;
  - `loop-en-1440-light-c-19.2s.png`: Thursday, "REMINDER SENT";
  - `loop-en-1440-light-d-24.6s.png`: resolved;
  - `en-1440-light-16.9s-paid.png`, `en-1440-dark-16.9s.png`;
  - `en-1024-light-10.6s.png`, `en-390-light-13.2s.png`;
  - `en-1440-reduced-motion-still.png`;
  - `rtl-1440-light-24.6s-mirror-test.png`: the art mirrored, labels still English;
  - `bare-1440-light.png`, `bare-1440-dark.png`, `bare-1024-light.png`: the measurement
    frames;
  - `loop-en-1440-light.mp4`: 32 s across the seam, 0.6 MB. It is a CDP screencast (2,365
    frames) encoded with ffmpeg 9.0.2 at 30 fps;
  - `framer-en-{1440,1024,390}-light.jpg`, `framer-en-1440-dark.jpg`: Framer's canvas.

## Fixed while looking

- **The bars read as grey ladders at 1×** with 1 px gaps. 2 px gaps make each order a
  near-square unit.
- **The field was all but invisible at 1×.** I raised it from 5–15% to 6–19% ink, still inside
  the brief's 10–22% for the marks that matter.
- **Two days lit at once** (MON and TUE at 10 s). A day now lights from its first landing, not
  from its first order's anticipation.
- **The focal paths ran nearly the full height,** with "ORDER #1392" up under the header.
  Focal events now start at most 260 px above their target (200 at 1024, 96 on the phone).
- **The booking ring read as Friday's.** It moved one grid step from Thursday's bar, and the
  reminder rises beside Thursday.
- **On the phone, "BOOKED" crossed a falling event.** Labels now have a canvas halo.
- **In right to left, the English labels inherited `direction: rtl`.** Anchors flipped twice and
  "1 BLOCK = 1 ORDER" reordered. The SVG now keeps `direction: ltr`, and the code mirrors x and
  anchors itself.
- **At 390 the strip's label wrapped and its hint was cut off.** Both are shortened on the phone
  breakpoint only.

## What Framer could not do, or did only by workaround

- **Controls:** a new code file's controls applied only in a second program, as the doodle log
  found.
- **The source:** 37 KB of TypeScript was uploaded with `create_upload_url` and fetched inside
  the program. Before the second write, the program checked that Framer's copy still matched
  mine.
- **The canvas** runs no motion; it shows the still from `frame(24.6)`.
- **Preview:** motion plays only in Preview, and the agent cannot sign in to it. Everything
  timed above is the local harness running the same source.
- **The linter** flags "First screen" for no `maxWidth`. The structure came with the duplicate
  of `/doodle`, and I left it as it is there.

## Departures from the rules (each needs a yes before this goes near the site)

1. **The illustration exception.** `alyr-design` §1.6 says "the product is the illustration".
   This is a data drawing of the product's own numbers, not a product screen. The brief says A,
   B and C each need a written exception if chosen. **Needs Akmal.**
2. **It loops.** D-059 (motion is always on, with Pause) allows it, with Pause, the off-screen
   and hidden-tab stop and a reduced-motion still. But `alyr-design/motion.md` rule 1 still
   reads "plays once" and does not name hero backgrounds. That is a skill gap for the lead to
   fix with the chosen direction; I did not edit the skills, since nothing here is committed.
3. **How it animates.** Updates come from `requestAnimationFrame`, writing SVG attributes:
   `transform`, `opacity`, `r`, path `d` for the short hairlines, and `stroke-dashoffset` for
   the one focal path. Rule 5 lists transform, opacity, clip-path and translate only. Nothing
   here touches layout, but the brief's "CSS keyframes and/or framer-motion" is not what I used.
   I chose one pure `frame(t)` so the canvas, the still and the loop cannot disagree.
4. **Values that are not tokens:**
   - the ink opacities (6/10/14/19% field, 22% blocks, 24% line, 30% trail, 36% message, 55%
     lit dot);
   - the 16 px grid pitch, the 2 px dot, the 3.5 px Volt dot;
   - the 56 px trail, the 240 px/s travel;
   - the 0.75 s focal anticipation, the 0.5 s Volt hold, the 24 ms reset stagger;
   - the 4 px label halo.
   Colours, durations (`play-*` × pace), `--ease`, `--travel`, type sizes and tracking are
   tokens. If C is chosen, these become `drawing` tokens.
5. **Derived daily order counts** and the order numbers #1392 to #1441 (above).
6. **The art is `aria-hidden`.** The summary inside it is not read out; the hero's own text is
   the content. If the summary should be heard, it needs a sentence in the copy file.

## Open for the founder (Needs Akmal)

1. Which direction. If C: the §1.6 exception and a D-number.
2. **The comparison with last week.** Thursday is shown against last week *by this time*
   (1,299, ahead of today's 1,102); Sunday and Thursday are behind last week, Monday to
   Wednesday ahead. It does not claim ALYR raised sales, but it is a comparison on the
   homepage. Keep it, or show this week alone?
3. **The derived split of 50 orders** (10, 14, 12, 8, 6), and **#1441, not #1442,** as the week's
   last order.
4. **"PAID · #1427".** "Paid" is the product's order state and says nothing about card payments,
   but a stricter reading might drop it for "CONFIRMED".
5. **Pace:** 19 s of counting, then about 5 s resolved. A visitor who stays 5 s sees a half-built
   week (below).
6. **Arabic:** the art mirrors (tested), but every label and the summary need written Arabic
   (`«8,520 ر.ق»`, days right to left), and the Arabic runs need their own `direction` inside
   the SVG.

## The weakest point, honestly

The payoff is late and small.
- The one sentence that makes the field mean something resolves at 22.7 s, in 15 px type in
  the bottom corner.
- Before that, a visitor sees a quiet dot texture and a half-built bar chart. In light mode the
  falling events are 2–3 px dots with short hairlines, easy to miss at normal distance. A
  reader who leaves after the headline gets "a chart in the corner", not "ALYR counted your
  week".
- Because the days run in order, only one bar is building at a time. "Several lanes working at
  once" is weaker here than in B or D; the parallelism is in the messages and the side events.
- If C is chosen, I would try two things:
  - start the loop on Wednesday, so the first screen already shows most of the week;
  - give the summary a permanent place, with its numbers counting up as the blocks land.

## Not checked

- **Framer's own Preview:** the loop, Pause, the off-screen stop there. Only the canvas (the
  still) and the harness were seen.
- **A hidden tab.** It uses the same pause path as off screen (`visibilitychange`), but was not
  switched in a real browser.
- **Other browsers and devices:** Safari, Firefox, a real phone, touch. Edge headless only.
- **CPU and battery on a slow phone.** The loop writes about 40–60 attributes a frame at 60 fps,
  with no profiler run.
- **Accessibility:** axe, a screen reader and keyboard order on the Framer page. The Pause
  button is a real button with a name; Tab was not walked.
- **Dark at 1024 and 390,** in the harness or on the canvas (dark seen at 1440 on both).
- **Whether the fonts match exactly.** Framer's IBM Plex Mono looked right on the canvas, but
  its loaded weights were not inspected.
- **How it sits with the rest of the homepage below the hero,** and how it compares side by side
  with A, B and D.
