# Direction A, planometric: build log

28 Oct 2026, Site and brand lane, builder A. The brief is [03-pro-brief.md](03-pro-brief.md).
This is a Framer prototype only. Nothing on alyr.qa changed, nothing was published, and
nothing was committed (the lead commits). No Linear issue was given, so the lane brief and
`docs/status.md` are not updated: the overall state did not change.

## What is built

**Framer project:** "ALYR homepage prototypes" (https://framer.com/projects/LyKozm5SR5CGo5YpDJXA).

| What | Where |
|---|---|
| Page | "Hero background A: planometric", `/hero-plan` (node `oCcrtwdTM`), duplicated from `/doodle` |
| Breakpoints | Desktop 1440 (`O4gjFgy7W`), Breakpoint 3 at 1024 (`CBTWfF6bF`), Breakpoint 2 at 390 (`HN1OGxgty`) |
| Component | `BgPlan.tsx` (`codeFile/FLlH6tj:default`), one instance `W4Ydf8cG8` behind the header and hero |
| Controls | 1440: Wide, scale 1, gutter 48. 1024: scale 0.8, gutter 41. 390: Phone, gutter 20, pinned to the bottom of the first screen in its 360 px |
| Strip | "PROTOTYPE 05A · PLANOMETRIC"; hint "One afternoon at Qirfa in 26 s, on a loop. It moves in Preview; the canvas shows its still frame." (1024 and 390: "One afternoon in 26 s. Moves in Preview."); the strip's language link is hidden, because there is no Arabic page for this direction |

On the duplicate, the doodle instance was replaced and nothing else changed: the header, the
hero (H1, lead, "Book a check-up", "See how we work") and the 1024 strip overlap the doodle
page already had are as they were. **Not touched:** every other page and code file, including
B's and C's pages (`/hero-schematic`, `/hero-signal`) and files, and `/doodle` itself, which was
only read and duplicated.

## The drawing

A 45° planometric drawing: the plan turned 45°, verticals true. One plan unit is 8√2 px along
a diagonal and one height unit 8 px, so every corner lands on the 8 px grid, every line is at
0°, 45° or 90°, and plan circles stay true circles (the cakes, the chair's base). Hairlines at
1 px (`vector-effect: non-scaling-stroke`, offset half a pixel so verticals are crisp); the one
active track is 1.5 px.

- **Qirfa Bakery:** a counter with a kick line, the order phone standing on it, and a glass
  case of six pistachio kunafa cheesecakes (its far edges show through the glass).
- **Dafira Salon:** a styling chair (round base, post, seat, back) facing a mirror on a
  vanity.
- **Zilal Cooling:** a box van with a lower cab, windscreen, side window and wheel blocks, its
  back doors to the slab.
- **The ALYR slab:** one plate in three parts, Qirfa's and the two others', so each business's
  records are visibly kept apart. It is labelled "ALYR".
- **Tracks:** four from Qirfa's counter and one from the salon run up and to the right into the
  slab's near face; the van's runs up and to the left into its other face. Beyond each shop the
  tracks run on, fainter, out of the frame: that is where customers' messages come from.
- **Records:** tiles 3.2 by 1.5 units, 3 px thick, with the brand's cut on the leading corner.
  On the plan it is a 45° cut, so on screen it stands upright.
- **The plan grid** (4% ink) lies only below the fold line `x + y > 720` (drawing units), so
  the headline, lead and buttons keep clean paper.
- **Qirfa's readout** (the one product fragment, with its one Sample mark) hangs above the slab
  on a hairline leader ending in a ring: "QIRFA BAKERY · SAMPLE", "Week so far: 49 orders, QAR
  8,422" ticking to "50 orders, QAR 8,520", and four rows (ORDERS, BOOKINGS, OWED, STOCK) whose
  labels are always there and whose values arrive.
- **Colour:** the ALYR colour styles only, as CSS variables. Ink is `color-mix()` of `ALYR/text`
  into `ALYR/canvas`, so it is opaque (crossing lines never darken) and follows the theme:
  - grid 4%, feeder tracks 8%, tracks 13%, volume edges 20%;
  - faces 3% and 6%;
  - the slab top and tiles are `ALYR/surface`.

  Volt (`ALYR/volt`, with an `ALYR/on-volt` ring) is used only for:
  - the order in flight;
  - the tick on the row that just became true;
  - the reminder going back;
  - the calm's tick on "Week so far".
- **Type:** IBM Plex Mono 10 px, capitals, tracked, for tags and labels; Instrument Sans with
  tabular figures for the readout's product words. On the phone and at 1024 the labels grow to
  stay at about 10 px.
- **Size:** 262 SVG nodes; 45 KB of source; no images, libraries or WebGL.

## The loop: 26 s, one afternoon

Times are from the component's schedule (`frame(t)`). The page is drawn at the calm (20 s), and
the clock starts there, so nothing jumps when motion starts: the first thing a visitor sees is
"Week so far: 50 orders, QAR 8,520".

| Time (s) | What happens |
|---|---|
| 0–1.8 | Messages arrive at once: three dots run in to the bakery, one each to the salon and the van; message sheets stack above the order phone (three), the van and the mirror. The stock record comes up at the case: "STOCK · 6 LEFT" |
| 1.7–2.6 | Records are made: the phone's three messages fold into **ORDER #1442** (Volt); the track ahead of it draws in line-strong. The booking link's message becomes "BOOKING · 6:00 PM". The salon's and van's records leave too |
| 4.4 | The stock record lands: STOCK "Pistachio kunafa cheesecake · 6 left" |
| 6.4 | **#1442 lands.** ORDERS "#1442 · 7 items · QAR 98" with a Volt tick; the week ticks 49 → 50 orders and counts QAR 8,422 → 8,520 |
| 7.4–10.0 | The receipt of the order goes back down its track to the phone (a solid message sheet appears there) |
| 7.8–9.5 | Each sale takes its stock: the six cakes leave the case one by one, the row counts 6 → 1, then "Sold out" (never "0 left"). One change every 0.34 s |
| 10.4 | The booking lands: BOOKINGS "Cake tasting · 6:00 pm · Booked" |
| 11.0–16.6 | The owed record travels: "OWED · QAR 3,400" |
| 12.2–14.8 | **The reminder goes back** in Volt along the booking's track; at the phone, a sent sheet; the row reads "Reminder sent" with a Volt tick |
| 16.6 | The owed record lands: OWED "QAR 3,400 · 30+ days · Needs a look", marked with an open square, not Volt: it waits for the owner |
| throughout to 17 | The salon and the van keep their own unlabelled records running in and replies running back, so several tracks move at once while one Qirfa event holds the eye |
| 17.4–22.8 | Calm. Nothing moves. Volt tick on "Week so far: 50 orders, QAR 8,520" |
| 20.0–24.0 | "Then we check again." under the readout |
| 22.8–24.2 | The rows clear, the docked records fade, the case refills; the week returns to 49 orders, QAR 8,422 |
| 26 = 0 | The next round |

**Still frame** (reduced motion, Framer's canvas, server render): 20 s, every row true.

**The numbers agree in every frame:**
- QAR 8,422 + 98 = 8,520 and 49 + 1 = 50;
- 50 orders and QAR 8,520 are the hero dashboard's (`_agent/samples/bakery.en.json`, Thursday
  16:20);
- #1442, 7 items, QAR 98 is the homepage flow's order (`copy.ts`);
- QAR 3,400 owed 30+ days by 3 customers is the bakery sample's suggestion;
- the cake tasting at 6:00 pm with a reminder 2 hours before is the sample's 16:00 reminder.

## Behaviour checked (local harness, headless Edge, no screenshots during timing)

- **Timing:** a sampler read the Volt marks and the counters on every frame for 27 s (3,240
  frames at 120 fps, none over 25 ms, worst 16.6 ms). Every event fell on its schedule after a
  constant offset from mount to the start of sampling:
  - the order's tick at 6.4;
  - the reminder from 12.2 to 14.8;
  - the calm from 17.4 to 22.8;
  - the reset at 24.2;
  - the next loop's Volt order at 28.1 = 26 + 2.1.
- **Volt:** at most 2 marks at once (the docking order and its row tick, for half a second).
- **Pause:** the button "Pause the drawing" becomes "Play the drawing" with the word "Play";
  paused 3 s, the record did not move; Play moves it again.
- **Off screen:** scrolled 3,000 px away, nothing moved for 2.5 s; it moved again on return.
- **Hidden tab (simulated):** `document.hidden` forced true with a `visibilitychange` event:
  it held for 2.5 s and moved again when set back. A real tab switch was not tried.
- **Reduced motion:** the 20 s still, no Pause button, nothing moves.
- **Clearance:** over 105 samples across the loop, no moving element and no word of the drawing
  came within 8 px of the headline, lead or buttons' text at 1440 or 1024. The headline and lead
  sit on clean paper in every frame (at 390 the art is below the hero).
- **Seamless:** the recording runs across the seam without a jump.

## Files

- `docs/doodle-study/harness-a/`, a copy of the doodle harness (the original was not edited):
  - `BgPlan.tsx`, the same source as in Framer (LF line endings);
  - `build.mjs` (TypeScript from `D:\alyr whatsapp\apps\web`; JSX on the automatic runtime,
    as Framer uses);
  - `serve.mjs` (port 3111);
  - `rec.mjs`, with an `eval` mode added that reports page errors;
  - `site/index.html`, the doodle's hero with the extra tokens and IBM Plex Mono.
- `docs/doodle-study/shots-a/` (1.9 MB):
  - `loop-en-1440-light-a-arrive-02s.png`, `-b-order-lands-07s.png`, `-c-reminder-13s.png`,
    `-d-calm-20s.png`;
  - `en-1440-dark-13s.png`, `en-390-light-07s.png`, `en-1024-light-13s.png`,
    `en-1440-reduced-motion-still.png`;
  - `loop-en-1440-light.mp4`: one loop, 26.0 s, 0.7 MB, a CDP screencast assembled with ffmpeg
    9.0.2 at 30 fps. It starts in the calm, so it opens on "Week so far";
  - `framer-en-{1440,1024,390}-{light,dark}.jpg`, Framer's canvas screenshots.

Fixed while looking (each seen in a frame first):
- the salon and van collided at the right edge; the salon moved beside the bakery, the van alone
  on the right;
- records cut on their top corner read as little houses; the cut moved to the leading side
  corner and the tiles became longer and thinner;
- dock squares with a track ending inside them read as spirals; removed;
- the first record was hidden behind the counter for its first second; tracks now start where
  the counter no longer hides them;
- tags were illegible where they crossed the slab; they got a canvas halo and fade as their
  record reaches the slab;
- reply tags at the phone ran left toward the lead; replaced by a sent message sheet, with the
  words in the readout;
- the readout had holes until each row landed; labels stay, values arrive;
- at 1024 the readout's type fell to 7–9 px; the breakpoint's scale went to 0.8 and labels grow;
- the Volt ring was the text colour, so it turned chalk on Carbon; it is now on-Volt Carbon in
  both themes;
- "0 left" showed for a third of a second before "Sold out"; it now goes from 1 left to Sold
  out;
- the canvas still and the first frame differed; the loop now starts from the still.

## Framer: what needed a workaround

- **The source reached Framer by URL, not by hand.** Programs cannot read local files, so
  `BgPlan.tsx` was uploaded with the MCP's upload URL (as a text asset at
  `framerusercontent.com/assets/GrVFMMumq9RvGtWVbVs96cIuh0.txt`) and the program fetched it and
  checked its length and checksum before `files.create`. That text file is not referenced by
  any page; it holds only this component's source.
- **Controls of a new code file apply only after it compiles**, as the doodle log found; they
  were set in a second program.
- **The canvas does not run the loop:** it shows `frame(20)`, the same function the loop uses.
  Motion plays only in Preview, which the agent cannot open.
- The linter warns that the "First screen" frame (`ABBqkqSXR`) is full-bleed without a
  maxWidth. It came with the duplicate of `/doodle`, and the hero is full-bleed on purpose.

## Departures from the rules (each needs a yes before this goes near the site)

1. **An illustration on the homepage** (`alyr-design` §1.6, "the product is the
   illustration"). This direction is a drawing of shops and a slab, with one real product
   fragment (the readout, in the product's words). As the brief says, it needs a written
   exception and a D-number if chosen.
2. **It loops**, under D-059's conditions: Pause, stops off screen and in a hidden tab, still
   with reduced motion. `motion.md` rule 1 still says "plays once".
3. **Values that are not tokens:**
   - the ink percentages (4, 8, 13, 20, 3, 6, 10) mixed from tokens;
   - the 1.5 px active track;
   - the tile, dot and sheet sizes;
   - the story's travel times (2.6 to 5.6 s per record, sine in-out).

   Durations of arrivals and fades use `--dur-2`/`--dur-3`/`--dur-4` × `--pace` 1.3 and
   `--ease`. If adopted, these become `drawing` and `motion` tokens.
4. **Three businesses into one ALYR slab.** It is drawn in three parts so that it does not read
   as one workspace for three businesses. Only Qirfa's numbers are shown; the salon's and van's
   records carry no words.

## Open for the founder (Needs Akmal)

1. **Is a drawn system right for the homepage at all,** given §1.6? Direction D is the
   product-only option.
2. **"#1442" is the 50th order here.** It is the homepage flow's #1442 (Sara M., 7 items,
   QAR 98). The hero's live script also has a #1442 (Reem K., QAR 145, at 16:27, after the 50
   orders of 16:20). The site already has two #1442s, so the samples should pick one. If this
   direction is chosen, the live script's should be renumbered.
3. **The stock line, "Pistachio kunafa cheesecake, 6 left",** comes from the brief, not from the
   engine's sample, and #1442's 7 items are drawn as taking the last six. If he wants every
   number to come from the engine, the bakery sample needs that item.
4. **No receipt is shown.** The brief lists "sends the receipt"; ALYR Docs is built and off for
   every shop, so the drawing's reply is "order received", not a receipt.
5. **"Needs a look"** for the owed money, not a reminder sent: payment reminders go when someone
   presses Send reminders (`honesty.md`).
6. **The empty cake case in the still** is true to "Sold out", but a still of an empty case may
   read as a sad end. The other choice is a still before the last sale.
7. **Names:** Qirfa Bakery, Dafira Salon and Zilal Cooling are the site's checked samples;
   their manual checks (Instagram, Maps, the trademark register) are still open in
   `honesty.md`.

## My critique: the weakest point

After #1442 lands, the focal events get weaker, not stronger. The order is a big Volt tile on
a lit track with the week ticking: one clear, satisfying beat at 6 s. The reminder, which is
the strongest "ALYR did this by itself" moment, is a 7 px Volt square going back down a track,
and the owed record lands quietly with an open square. So the eye gets one good beat, then
about ten seconds of small events before the calm. The shops are also small and faint next to
the slab and the readout. At 1× the salon's chair reads only just as a chair, and the drawing
reads more as a systems diagram than as three real businesses. If this direction is chosen,
the next pass should:
- give the reminder a record-sized carrier;
- draw the three shops about 1.3× larger, with the slab smaller;
- try the readout without its four rows (only the "Week so far" line), so it competes less
  with the headline.

## Not checked

- Framer's own Preview: the loop, Pause, the off-screen stop there. Only the canvas (the still)
  and the local harness, running the same source, were seen.
- A real hidden tab (only simulated with `document.hidden`), Safari, Firefox, a real phone and
  touch (Edge headless only).
- 320 px; Arabic and mirroring. Nothing in the art reads left to right except the words, so it
  can mirror with the words counter-mirrored, but that is not built.
- The 1024 and 390 layouts in motion, beyond single stills (only 1440 was recorded).
- axe, a screen reader and keyboard order on the Framer page. The drawing is `aria-hidden`; the
  Pause button is a real button with a name.
- Contrast was not measured. The hero text has no part of the drawing within 8 px of it, and the
  readout uses the text, muted and faint tokens.
- CPU and battery on a slow phone. It updates about 120 attributes per frame from one
  `requestAnimationFrame`; desktop Edge held 120 fps.
- How it sits with the rest of the homepage below the hero.
