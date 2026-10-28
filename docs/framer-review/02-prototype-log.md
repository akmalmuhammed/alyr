# Prototype log: "One shop, six products" in Framer

24 Oct 2026. Site and brand lane. This is a prototype for the founder to click through. Nothing on
alyr.qa changed and nothing was published. Nothing is committed. No Linear issue was given, so no
issue was updated.

- **Project:** "ALYR homepage prototypes", in Akmal's Workspace (free plan).
  https://framer.com/projects/LyKozm5SR5CGo5YpDJXA
- **Not touched:** the project "Blessed Tuna".
- **Not published:** no framer.app address and no custom domain. Open it with Framer's Preview
  (▶) while signed in.

## What is built

| Page | Path | Breakpoints |
|---|---|---|
| One shop, six products | `/` | Desktop 1440 (≥1440), Laptop 1024 (1024–1439, the same design with no overrides), Phone 390 (<1024) |
| Arabic: One shop, six products | `/ar` | The same three, mirrored |

- **Frame.** A split header ("Six products. One workspace. / Add them as you grow." with
  `home.suite.body` on the end columns). Under it is a Carbon plate with a 45° cut at the top
  inline-start corner, drawn as a canvas-coloured square turned 45°. The plate's workspace bar
  reads "QB Qirfa Bakery · SAMPLE / Thursday · 16:20". That is the frame's only Sample mark.
  The plate's `aria-label` holds the machine line saying the bakery is fictional. Seams are 1 px
  of `--dark-line`. The two notes from `home.suite.notes` sit under the plate.
- **Grid at 1440.** Row 1 holds Chat (8 columns) and Bookings (4). Row 2 holds Shelf over Docs
  (4 columns, 240 px each), Agent (4) and Accounts (4). Phones show one column in suite order.
- **Tiles.** Each tile is a code component, `AlyrTile.tsx`, with a control for the product, the
  language, the phone layout and the canvas state. Each one is a single link to its live page
  (`alyr.qa/<product>`; Arabic tiles go to `/ar/<product>`). Each draws its product's screen in
  that product's own words, from `copy.ts`, `copyShelf.ts`, `paperData.ts` and the engine's bakery
  sample (Thursday 15 Oct, 16:20). The window runs past the tile's inline-end edge as a hard
  crop, with a 12 px 45° cut. There is no fade.
- **Moments.** Each plays once on hover or keyboard focus on desktop. On phones it plays when
  60% of the tile scrolls into view, or on the first tap. Every delay is a multiple of
  `--stagger`, uses `--ease` and `--dur-*`, and travels along 45° (mirrored in Arabic). Measured
  in headless Edge, each moment ended between 0.7 and 1.3 s. None played again on a second hover.
  - Shelf: the count goes from 1 to 0, then "Only 1 left today" becomes "Sold out".
  - Docs: RC-0042 settles, then draws Arabic first, then English, then the number and date.
  - Chat: "Ordered 7 items, QAR 98" lands in Sara M.'s chat, then "Order #1442 received…",
    then her inbox row takes `--volt-wash` and the "#1442 · New" tag.
  - Bookings: 6:00 pm fills with Volt, the "Cake tasting · Noor A. · Booked" row arrives, then
    "Reminder sent · Two hours before · 4:00 pm".
  - Agent: "2 orders ready for over 2 hours" arrives, then its rule line draws, then "Show the
    orders" appears as an outlined button with its notch.
  - Accounts: the owed-by-age bar fills oldest-last, then "Promised by Thu 22 Oct" arrives.
- **Hover.** The fragment moves 2 px along 45°, the arrow moves 1 px, and the tile's edge
  becomes `--line-strong`. Keyboard focus shows a Volt ring inside the tile.
- **Reduced motion.** Every tile shows its end state. This was checked in headless Edge.
- **Light and dark.** There are 34 colour styles, `ALYR/<token>`, each with its light and dark
  value from `design/tokens.json`. The canvas and the tiles both read them, and the Framer dark
  screenshot is correct.
- **Arabic.** The canvas order is mirrored by hand: Bookings | Chat, Accounts | Agent | Shelf
  over Docs, the cut on the right, and the bar and notes reversed. Text uses IBM Plex Sans Arabic
  at 1.3 and 1.7 line heights with no tracking. The override `withArabic` (`AlyrArabic.tsx`)
  sets `dir="rtl"`, because Framer text has no direction setting. Tiles set `dir`, mirror their
  clip-paths, travel and arrow, and keep ranges, order numbers and Latin names in `<bdi>`.
  Times read «م 4:00», as the site writes them.

## Fonts

All three come from Framer's Google catalogue: Instrument Sans (with its `wdth` axis),
IBM Plex Sans Arabic and IBM Plex Mono. The tiles also load the same three from Google Fonts
with a `<link>`, so code text matches canvas text.

## Decisions taken while building

- **"No prices"** was read as no ALYR prices (the offer switch). Sample amounts on the bakery's
  screens stay, as on the live site: QAR 98, QAR 185 and the owed totals.
- **"Promise: Thursday"** is drawn in the product's own words, "Promised by Thu 22 Oct"
  («وعد بالسداد قبل الخميس 22 أكتوبر»). 22 Oct 2026 is a Thursday. The live page writes
  "Promised by 22 Oct"; "Thu" is added in the dashboard's own date style.
- **Agent's suggestion** is "2 orders ready for over 2 hours", not the overdue-money one. The
  overdue rule counts Marina Desk Co-working as "no promise", which would contradict the
  Accounts tile beside it.
- **Bookings** shows 6:00 pm, not 4:30 pm. It matches the feed's "Cake tasting, today at
  18:00 · Noor A.", whose reminder went at 16:00.
- **Volt** appears once as a fill: the chosen 6:00 pm slot, for current state. The other
  greens are `--volt-ink` and `--volt-wash` (the new row and the promise). There are no Volt
  buttons.
- **Shelf over Docs** is one grid item. Framer's grid would not place Docs back in row 3.
- **Laptop breakpoint.** Framer derives breakpoint ranges from frame widths. Without it, every
  screen narrower than 1440, such as a 1366 laptop, would get the phone layout.
- **The prototype strip** at the top ("Prototype 01 · not the live site", the hover hint, the
  language link) is chrome for the founder, not part of the design.

## What Framer could not do, or did only by workaround

- **No `dir` on text.** RTL needs the code override, and it applies in Preview only. The canvas
  shows the text right-aligned, and Arabic sentences there still read correctly.
- **No clip-path on frames.** The plate's cut is an overlay square. On a non-canvas background
  it would show.
- **Breakpoint ranges cannot be set**, hence the Laptop breakpoint.
- **Framer's Localization (automatic RTL)** was not used. Locales are a paid add-on.
- **Motion was not watched in Framer's own Preview.** The agent cannot sign in to Framer. The
  tile code was run in a local React page with the same framer-motion in headless Edge at 1440
  and 390, English and Arabic, with and without reduced motion. There were no console errors
  and no sideways scroll at 390.

## Not checked

- Framer's Preview itself, and how hover, scroll-into-view and tap behave inside it. Also the
  Laptop range on a real 1366 screen.
- A real phone, Safari, and touch. Touch was only emulated in headless Edge.
- The dark theme in Preview. The token switch was checked on the canvas only.
- 320 px width.
- axe and screen readers on the Framer page.
- Contrast was not measured; the values come from tokens whose contrast is stated.
- The Arabic wording of the new labels (ALY-66, the founder's reviewer). These are «المحادثات»
  (from the product), «وعد بالسداد قبل الخميس 22 أكتوبر» and «مثال».
- In passing: the product's Inbox tab subtitle in `(product)/_workspace/Screens.tsx` says
  "assistant", a banned word. That belongs to the Product lane and was not changed.
