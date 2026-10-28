# Direction D, explainer: build log

28 Oct 2026, Site and brand lane. Direction D of [03-pro-brief.md](03-pro-brief.md): "one afternoon at
Qirfa, in the product". A product film plays as the hero's background, on the far side of the
headline: one canvas of real ALYR screens, a camera that moves across it, three lanes working at
once, and an ending on the ALYR Agent home screen.

This is a Framer prototype only. Nothing on alyr.qa changed, nothing was published, nothing was
committed (the lead commits). No Linear issue was given, so the lane brief and `docs/status.md`
are not updated: the overall state did not change.

## What is built

**Framer project:** "ALYR homepage prototypes" (https://framer.com/projects/LyKozm5SR5CGo5YpDJXA).

| | |
|---|---|
| Page | "Hero background D: explainer", `/hero-explainer` (node `Q7qxVLN46`), a copy of `/doodle` |
| Breakpoints | Desktop 1440 (`IExoB20j9`), Breakpoint 3 1024–1439 (`oJeJQnQ0k`), Breakpoint 2 below 1024 (`uCQB1qYlA`) |
| Code file | `BgExplainer.tsx` (one default export, `codeFile/muM1gGG:default`), the same source as `harness-d/BgExplainer.tsx` |
| Instance | "Explainer background" (`WtHKO2xPy`) where the doodle was: absolute, behind the header and hero, z-index 0 |
| Strip | "PROTOTYPE 05D · EXPLAINER · NOT THE LIVE SITE"; hint "One afternoon in 36 s, on a loop. It moves in Preview; the canvas shows its still frame." (shortened to "One afternoon in 36 s. Moves in Preview." at 1024 and on the phone, where the long one was cut off) |

Changed in the copy only: the doodle instance was removed; the strip's "Arabic version →" is
hidden; the header's «العربية» no longer links to `/ar/doodle` (the word stays, so the header
looks the same). There is no Arabic page for D: English only until the founder picks a direction.
No other page, code file or colour style was touched. The other builders' pages (`/hero-plan`,
`/hero-schematic`, `/hero-signal`) and files were only listed, never read or written.

**Controls** (per instance): Layout (auto, wide, phone), Still at (s), Width and Height (used
where the canvas cannot measure), Fold at foot, Plate top, Gutter, Zoom.

| Breakpoint | Layout | Width × height | Fold at foot | Zoom | Gutter |
|---|---|---|---|---|---|
| 1440 | wide | 1440 × 820 | 440 | 1 | 48 |
| 1024 | wide | 1024 × 760 | 260 | 0.78 | 41 |
| 390 | phone | 390 × 360, pinned to the foot of the first screen | (none) | fit | 16 |

## The film

**The frame.** A Carbon plate (`ALYR/band`) on the far side of the headline, cut by the Command
Fold's 45° diagonal, from the top inline-end to the bottom inline-start. It starts under the header
(y 96) and bleeds off the right and bottom edges. The headline, lead and buttons stay on Paper: in
Framer the fold passes 117 px right of the end of "had." at 1440, and 51 px at 1024. In dark mode the plate is the band's dark value with its edge hairline (`ALYR/band-edge`).
On the phone the plate fills the 360 px under the hero, with the cut corner (48 px) at its top
inline-start. A bar along the plate's foot carries the shop (the QB monogram, "Qirfa Bakery"), the
one **Sample** mark, the afternoon's clock ("Thursday · 16:07", which runs with the film) and
Pause.

**The canvas** is one plane of real ALYR windows (white `ALYR/window`, 1 px `window-line`, the
12 px notch), at true scale when the camera is on them. Three lanes, one above the other, each
starting 440 units further along than the one below, so their starts sit on a 45° line that
follows the fold:

| Lane | Windows, in order |
|---|---|
| Orders | Inbox (every conversation, newest on top) · Sara M.'s chat · Orders ("Placed through the order link") · Menu › Stock |
| Bookings | Bookings, Thu 15 Oct (the day's times, the bookings, the reminder) · Noor A.'s chat |
| Money | Credit accounts (owed to you, by age, then "Needs a look") · receipt RC-0039 (Arabic first, as the engine lays it out) · Omar A.'s chat |
| End | ALYR Agent home, to the right of the Orders lane |

**The words are the product's own:** Screens.tsx (Orders' columns, "New", "Confirmed", "Ready",
"Done", "Confirm", "Mark ready", "Mark done", "Not paid", "Paid", "On account"), orders/service.py
("Order #1440 is ready for collection.", "Order #1440 is confirmed."), orders/chat.py ("Here is
our order page. Pick what you need."), bookings/service.py ("Booking 112 confirmed at Qirfa
Bakery: Cake tasting, Thu 15 Oct, 6:00 PM. To cancel, send "my booking".", "Reminder: booking 112
at Qirfa Bakery, Thu 15 Oct, 6:00 PM."), the Docs delivery words ("Receipt RC-0039 from Qirfa
Bakery: QAR 64.00. Thank you.", "RC-0039.pdf"), the suite frame and Shelf copy (the Bookings
fragment, the Stock card, the chat's "Ordered 7 items, QAR 98"), and the bakery's Agent sample
(`_agent/samples/bakery.en.json`) for the home screen.

**The camera** moves by translate and scale only: the world point under a fixed screen anchor is
carried across with sine in-out, the scale in log space, with a pull-back on the long moves. Holds
drift in by 3.5% so the shot is never still. Focus is the editor's light: the card the event is
on is at full strength, the others step back to 10–20% (all at 92% in the opening wide shot; 50 to
96% in the mid-wide, where the lanes with an event are the brightest).

**Captions:** mono 12 px capitals, tracked, on a hairline that draws from the card's start and ends
in a tick at its end, the FIG caption's own shape. Words arrive along 45° one by one and leave the
same way. In the two wide shots the captions are the lanes' names with their events after them
("ORDERS · #1440 · READY"), so three lanes visibly work at the same time. The arrow in
"STOCK 6 → 0" is the 1.7 px line icon (it can mirror), not a Unicode arrow.

### The loop: 36 s, Thursday 15:58 to 16:20

| Film s | Clock | Shot | What happens | Caption | Volt |
|---|---|---|---|---|---|
| 0–3.1 | 15:58 | Wide, all three lanes | Aisha I. writes "Is my order ready?": her row goes to the top of the Inbox (it waits for the team) | THREE LANES · AT ONCE | her row |
| 3.1–4.6 | | push in | | | |
| 4.7 | 15:59 | Bookings | Noor A. books: 6:00 pm fills, "6:00 pm · Cake tasting · Noor A. · Booked"; her confirmation arrives in her chat | BOOKED · 6:00 PM | the 6:00 pm slot |
| 6.9 | 16:00 | Bookings | "Reminder sent · Two hours before · 4:00 pm"; the reminder arrives in Noor's chat | REMINDER SENT · 2 H BEFORE | the reminder's tick |
| 8.9–10.5 | | pull back, travel, push in | | | |
| 10.9 | 16:06 | Stock | Lina F.'s #1441 takes the last cheesecake: 1 → 0, "Sold out", log row "Sold −1 · Order #1441 · 16:06 · balance 0" over 13:40 (balance 1) and 10:12 (balance 4); #1441 lands on Orders as New; Lina's row tops the Inbox | STOCK 6 → 0 · SOLD OUT | the log row; #1441's row |
| 12.9–15.5 | 16:09 | pan back across Orders | #1441 turns Confirmed as the camera passes | | #1441's row |
| 15.7, 16.35 | 16:13 | Sara M.'s chat | "Hi, I'd like to order for pickup", then the order page, at once | ORDER PAGE SENT · AT ONCE | the reply's top edge |
| 18.5–19.85 | | pull back | | | |
| 19.8 | 16:15 | Mid-wide, all three lanes | Orders: #1440 is ready, the message goes to Omar (his chat, his Inbox row) | ORDERS · #1440 · READY | #1440's row (off frame) |
| 20.6 | 16:16 | | Bookings: Maha J. books 6:30 pm | BOOKINGS · 6:30 PM · BOOKED | the 6:30 pm slot |
| 21.5 | 16:17 | | Money: Omar pays cash: #1440 Paid, Done; RC-0039 prints; the PDF arrives in his chat | MONEY · RECEIPT SENT | the PDF's tick |
| 22.6 | 16:18 | | Money: "Needs a look · QAR 3,400 owed 30+ days, not reminded in 7 days", with its "Why ·" line | · NEEDS A LOOK | the flag's ring |
| 23.9–25.05 | | push in to the chat beside Orders | | | |
| 25.2 | 16:19 | Sara's chat and Orders | "Ordered 7 items, QAR 98", then "Order #1442 received: 7 items, QAR 98." | | |
| 26.9 | 16:19 | Orders | #1442 · Sara M. · 7 items · QAR 98 · Not paid · New lands on top | ORDER #1442 · 7 ITEMS, QAR 98 | #1442's row |
| 28.55–29.95 | | pull back, travel, push in | | | |
| 30.0 | 16:20 | ALYR Agent home | 49 → 50 orders, QAR 8,422 → 8,520, 182 → 183 messages ALYR sent for you | WEEK SO FAR | 183's underline, held |
| 34.7–35.35 | | the fold closes | the canvas goes back to 15:58 under it | | |
| 35.35–36 = 0 | 15:58 | the fold opens on the wide | | | |

**Still frame** (reduced motion and Framer's canvas): 31.6 s, the home screen settled, 16:20.

### Every number agrees

- **16:20 is the homepage's sample moment**, and the home screen is the bakery's Agent sample as
  captured: "Week so far: 50 orders, QAR 8,520. Orders up 11%, sales up 20% on the same days last
  week.", 2 customers waiting (longest 48 min), 2 orders need confirming (the oldest for 33 min),
  183 messages, 7 booking reminders, owed QAR 12,975 (last week QAR 11,029).
- **The two waiting** are Tariq Z. (15:32, 48 min at 16:20) and Aisha I. (15:58). **The two to
  confirm** are #1438 (Mariam S., 15:47, 33 min) and #1442. Aisha's #1436 has been ready since 13:20
  and Meera V.'s #1437 is ready: the sample's "2 orders ready for over 2 hours". #1439 (Khalid A.)
  is still Confirmed, as the live feed's later "#1439 ready" needs.
- **Orders and money:** #1441 (QAR 197) at 16:06 and #1442 (QAR 98) at 16:19 take the week from 48
  orders and QAR 8,225 to 50 and QAR 8,520. #1442 is the suite frame's "7 items, QAR 98". RC-0039
  is QAR 64.00: 2 saffron milk cake slices (52.00) and a butter croissant (12.00), #1440's "3
  items, QAR 64". RC-0039 sits before RC-0040 to RC-0042 (19 Oct) in the series.
- **Stock:** 6 a day; −2 (#1437, 10:12), −3 (#1439, 13:40), −1 (#1441, 16:06): balances 4, 1, 0.
- **Bookings:** 112 (Noor, 6:00 pm) and 113 (Maha, 6:30 pm), as the live feed's 16:30 reminder for
  Maha's 18:30 needs. Thu 15 Oct 2026 is a Thursday.
- **The clock** only goes forward, and every time printed in a card is the clock's at that event.

## Measured

Local harness, headless Edge, no screenshots during the run (`harness-d/rec.mjs timing`). A
sampler read every Volt mark's opacity through all its ancestors, inside the viewport, every frame
for 38 s.

- **Volt:** never more than two marks at once, at 1440 and at 390. Each lit within 0.2 s of its
  schedule (film seconds): the 6:00 pm slot 4.73, the reminder 7.00, the stock log 11.06,
  #1441 11.17 and 13.94, the order page 16.45, 6:30 pm 20.63, the PDF 22.05, the flag 22.70, #1442
  27.06, 183 30.22.
- **Captions** show 0.15 to 0.4 s after their event and never two at once.
- **Frames:** median 8.3 ms, 95th percentile 8.6 ms, worst 10.4 ms at 1440 (120 Hz headless).
- **Pause:** pressed at 8 s, the film's clock held for 3 s; the name changed from "Pause the film"
  to "Play the film"; Play moved it again. The same at 390.
- **Off screen:** scrolled 3,000 px away, the clock held for 3 s, and moved again on return, at
  1440 and 390.
- **Hidden tab, simulated:** `document.hidden` set and `visibilitychange` fired; the clock held for
  2 s and moved again after.
- **Reduced motion:** the 31.6 s still, no Pause button, nothing moves.
- **Seamless loop:** the 36 s state equals the 0 s state (camera, clock, every card).
  `loop-en-1440-light.mp4` was captured frame by frame at 30 fps (`rec.mjs frames`), so it is
  exactly 36.000 s and ends on its first frame's state.
- **Render sweep:** the component rendered without error at every 0.1 s of the loop, wide and phone
  (720 renders); `tsc --strict` passes with React's types.
- **Size:** 561 DOM elements (6 SVG nodes), 190 animated parts, 13 Volt marks; 19 KB gzipped
  (the transpiled source, 78 KB raw). No library, no image, no WebGL.

## Files

- `docs/doodle-study/harness-d/` (my copy; `harness/` untouched):
  - `BgExplainer.tsx`, the same source as Framer;
  - `site/index.html` (the hero over the film, tokens as CSS variables in both themes, `?at=`,
    `?tall=1`, `?fold=`, `?zoom=`), `build.mjs` (TypeScript from `D:\alyr whatsapp\apps\web`),
    `serve.mjs` (port 3141), `rec.mjs` (`record`, `frames`, `timing`, `pause`, `hidden`).
- `docs/doodle-study/shots-d/` (6.7 MB):
  - `loop-en-1440-light-a-wide-1.8s.png`, `b-reminder-7.9s`, `c-sold-out-11.9s`,
    `d-three-lanes-22.9s`, `e-order-1442-27.9s`, `f-week-so-far-31.6s`;
  - `en-1440-dark-22.9s.png`, `en-1440-dark-31.6s.png`, `en-1024-light-11.9s.png`,
    `en-390-light-12.0s.png`, `en-390-dark-27.9s.png`, `en-1440-reduced-motion-still.png`;
  - `loop-en-1440-light.mp4` (36.0 s, 3.6 MB), `loop-en-390-light.mp4` (36.0 s, 1.7 MB, the art
    under the phone hero);
  - `framer-en-{1440,1024,390}-{light,dark}.jpg`: Framer's canvas.

Every image was looked at. Fixed while looking:
- dimmed neighbours at 40% read as muddy grey slabs cut by the fold: now 10–20%, and nothing but the
  home screen in the last shot;
- lane names collided with the captions at close range: the lanes now show only in the two wide
  shots;
- the Orders window's notch and its caption were cut by the fold: the window frames at 0.9, and
  every caption keeps clear of the fold (and of the phone's cut corner);
- the mid-wide caption ran off the screen: replaced by an event tag in each lane;
- the opening was static and its chats empty: the shared Inbox was added (rows rise as messages
  come), and each chat shows its real history and scrolls as a chat does;
- the 6:00 pm slot showed half ink, half Volt while filling: ink now comes in only as the Volt
  goes;
- at the loop's seam the camera held on the home screen while its numbers went back to 49: the
  camera now runs on the film's state time;
- Sara's Inbox row showed her 16:13 message at 15:58;
- the receipt's «صدر عبر ALYR» foot overlapped its total: removed;
- at 1024 the fold passed 10 px from the headline's full stop in Framer (its headline is wider
  than the harness's): fold 260, zoom 0.78.

## What Framer could not do, or did only by workaround

- **A new code file cannot be placed in the program that creates it** ("Expected a locally
  available component"): the file was written first and the instance inserted in a second
  program.
- **Pasting 81 KB of source into a program** was avoided: the source was uploaded as a text asset
  and fetched inside the program, checked by byte length and line endings (LF only, the doodle's
  CRLF trap).
- **The canvas runs no animation:** the component draws every part at 31.6 s from the same
  functions the film runs on, so the canvas and reduced motion show the settled home screen.
- **The canvas may not measure** the instance: the stage takes Width and Height from the controls
  then. The phone instance reports y −160 in its rect, but it renders in place under the hero.
- **Motion plays only in Preview, and the agent cannot sign in to Preview:** all timing is from
  the harness running the same source.
- The strip's label and hint touch at 1024 (the linter's "−100 px"), as on every earlier prototype
  page; and the linter's maxWidth warning on "First screen" is the doodle's own structure.

## Departures from the rules (each needs a yes before this goes near the site)

1. **It loops** (allowed by D-059, with Pause, the off-screen and hidden-tab stops and a still).
   `motion.md` rule 1 still says "plays once" and does not name this figure. I did not edit the
   skill: there is no pull request for a prototype.
2. **Values that are not tokens:** the camera's moves (0.9 to 2.6 s) and holds, the 3.5% drift,
   the dims (10–20%; 50–96% in the wide shots), the 1.9 s a Volt mark holds, the fold at 440 (1440)
   and 260 (1024), the plate top 96, the lane pitch 440. Durations of arrivals, eases (`--ease`,
   sine for travel), stagger and travel are the tokens.
3. **A Carbon plate cut by the fold on the hero, as a background.** The fold has split a section
   before (FoldSplit) but never sat behind the H1.
4. **Volt washes** (`ALYR/d-wash`) behind the rows that just changed count as Volt marks; they hold
   1 to 1.9 s and go.
5. **Fonts named in code and colour fallbacks as hex**, as in `AlyrTile.tsx` and `AlyrDoodle.tsx`;
   the colours themselves are the `ALYR/...` colour styles. `--text-inverse` is drawn with
   `ALYR/surface` (the same values in both themes), the monogram with `ALYR/band` and
   `ALYR/dark-text`.
6. **ALYR Docs is built and off for every shop**; the film shows a receipt sent, as the live suite
   frame shows RC-0042. **Payments:** #1440 is paid in cash and recorded by hand (Documents package
   2 sets the order to Paid); nothing is paid by link.

## Open for the founder (Needs Akmal)

1. **Is a heavy Carbon plate right behind the headline,** or should the film sit on Paper (white
   windows on the page, a hairline frame)? That is one change (the plate's fill), not built.
2. **Pace:** a camera move about every 4 s. Slower (fewer beats, 45 s) or a calmer still-led cut?
3. **The still:** the home screen at 16:20. The three-lanes shot (22.9 s) shows "tracks several
   orders at once" better; the home screen says "the owner sees one screen".
4. **Captions:** "STOCK 6 → 0 · SOLD OUT" (the log on screen shows 6 to 0), "ORDER PAGE SENT · AT
   ONCE", "THREE LANES · AT ONCE". The brief's "12 messages → 12 orders" was not used: not every
   message becomes an order (two customers are waiting for the team).
5. **Names:** sample customers from the site's copy and the Agent sample (Sara M., Lina F., Noor A.,
   Maha J., Omar A. / Omar Ali, Khalid A., Mariam S., Aisha I., Meera V., Tariq Z.); Qirfa still
   needs the manual name check. New sample numbers: orders #1409, #1436 to #1442, bookings 112 and
   113, receipt RC-0039, and two invented messages ("Is my order ready?", "Can I order a birthday
   cake for Saturday?").
6. **One arithmetic seam:** six cheesecakes at QAR 185 sold today come to QAR 1,110, more than
   Thursday's QAR 1,102 in the sample's week chart. The film never shows today's sales, and it holds
   if some were ordered earlier for today, but a careful reader of both figures could catch it.
7. **Arabic:** not built. The canvas, the fold and the camera mirror by design (the lanes' 45°
   staircase and the fold flip together); the windows need their Arabic words and right-to-left
   order, and the receipt is already Arabic first.

## Not checked

- **Framer's Preview:** the motion, Pause, the off-screen and hidden-tab stops there. Only the
  canvas (the still) and the local harness running the same source were seen.
- **A real hidden tab:** simulated by setting `document.hidden`; not switched in a real browser.
- Safari, Firefox, a real phone and touch (headless Edge only); a mid-range phone's frame rate
  (190 parts restyled each frame; 8 ms on this laptop).
- 320 px (Framer's phone breakpoint is 390; the harness was not run at 320).
- Arabic, any layout.
- axe, a screen reader, keyboard order on the Framer page. The art is `aria-hidden` with one
  visually hidden sentence saying it is a sample film of a fictional bakery; Pause is a real
  button with a name and `aria-pressed`. Tab was not walked.
- Contrast was not measured with a tool: the headline, lead and buttons sit on Paper and the plate
  never crosses them (117 px clear at 1440, 51 px at 1024 in Framer). Text inside the dimmed
  windows is deliberately below contrast; only the focal window is meant to be read.
- How it sits with the rest of the homepage below the hero; only the first screen was built.
- The other three directions' pages, for a side-by-side.
