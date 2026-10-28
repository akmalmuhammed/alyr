# Hero background: four professional directions (creative director's brief)

28 Oct 2026. The founder on the doodle study (`/doodle`): "this feels like drawn by a kid, make it
professional and enterprise grade. Create multiple designs and explore different approaches and
I'll choose the best. One design approach should be an explainer-video-like approach of ALYR:
showcase how ALYR automates, tracks multiple orders, bookings etc."

So the hand-drawn look is out: no wobble, no boil, no sketchbook. Four directions are built side by
side in Framer, each as a full first screen behind the real hero, so the founder compares like with
like. Each direction tells the same story, its own way.

## The story every direction tells (one loop, 24–32 s)

1. **Many things arrive at once.** Messages, a call, a walk-in, a link tapped, arriving from
   several customers, in parallel and overlapping. Not one at a time. This is the small business's
   day.
2. **ALYR catches each one and makes it a record.** An order (#1442), a booking (6:00 pm, cake
   tasting), credit owed (QAR 3,400), a stock line (Pistachio kunafa cheesecake, 6 left).
3. **ALYR moves each one forward by itself.** It confirms the order, sends the reminder 2 hours
   before, counts the stock down to "Sold out", and sends the receipt. These run in parallel
   lanes: this is the "tracks multiple orders, bookings" the founder asked for.
4. **The owner sees one screen.** "Week so far: 50 orders, QAR 8,520", and it is calm. Then the
   loop begins again: "Then we check again."

Use the homepage's sample, Qirfa Bakery, Thursday 16:20, with its own numbers, so nothing
contradicts the hero dashboard. The sources are `apps/web/app/_site/copy.ts`, `HowCards.tsx` and
`paperData.ts`, and the live https://alyr.qa. Every number on screen must agree with the others in
every frame.

## The shared system (what makes all four enterprise grade)

- **Geometry:** only straight lines at 0°, 45° and 90°, plus true circles. No hand jitter, no
  wobble, no overshoot. Corners are square, or the brand's 45° cut corner. Snap everything to an
  8 px grid. Precision is the look.
- **Line:** 1 px hairlines, crisp at 1× and 2×; `shape-rendering` and stroke alignment chosen so
  that edges don't blur. Use one or two weights only (1 px, plus 1.5 px for the one active path).
- **Colour:**
  - light: Carbon ink at 10–22% on Paper;
  - dark: white at 10–18% on Carbon;
  - **Volt only where something is true or live right now:** the event in flight, the record just
    made, the tick. At most two Volt marks on screen at once. Use the site tokens, through the
    Framer colour styles named `ALYR/...` that the project already has.
- **Type in the art:** IBM Plex Mono, 10–11 px, uppercase with tracking, for labels only, plus
  Instrument Sans for any product-UI fragment, in the product's real words (Orders, Bookings,
  Owed, Stock, Receipt, Needs you now, Done for you). Any product-UI fragment carries one "Sample"
  mark, as on the site.
- **Composition:** the art lives on the far side and the bottom. Keep the headline, lead and
  buttons zone at 1440 (about x 0–760, y 140–560) nearly empty, at most faint structure under 6%
  ink. The headline's contrast must pass WCAG AA in every frame. At 390, the art sits below the
  hero, in about 360 px.
- **Motion grammar:**
  - eased, never bouncy (expo-out arrivals, sine in-out for travel);
  - travel follows the 45°/90° paths;
  - durations come from the site's pace (see `alyr-design/motion.md` and `tokens.md`; `--pace`
    1.3);
  - nothing flashes more than 3 times a second;
  - a seamless loop, always on (founder, 26 Oct);
  - a Pause/Play button in the site's style ("Pause" / «إيقاف»);
  - it stops off screen and in a hidden tab;
  - `prefers-reduced-motion` shows one finished, composed still (the best frame, not a blank).
- **Quality of motion:** anticipation and stagger, so several lanes are visibly working at the
  same time, while the eye always has one clear focal event. Think of a calm control room, not a
  slot machine.
- **Tech:** one Framer code component per direction: inline SVG with CSS keyframes and/or
  framer-motion (already in Framer). No raster images, no WebGL, no new libraries. Keep it under
  about 800 SVG nodes and smooth on a mid-range phone.
- **Words:** no AI words and nothing that reads as AI (no sparkles, brains, robots, glowing
  orbs, "magic"). No WhatsApp or Meta logos, and no WhatsApp green: messages are generic bubbles.
  No people, faces, skylines or landmarks. Nothing "coming".
- **References:** the look should sit with Stripe, Linear, Vercel, Ramp, Mercury and Resend
  product marketing. Look at them for craft, then make ALYR's own; never copy.

## The four directions

| | Direction | The idea | Reference spirit |
|---|---|---|---|
| A | **Planometric: the shop as a system** | A precise 45° planometric drawing (plan rotated 45°, verticals true), in hairline architectural linework: Qirfa's counter and phone, Dafira's chair and mirror, Zilal's van, each as a clean volume. Records travel as small cut-corner tiles along 45° tracks into one ALYR workspace slab, whose numbers tick as they land. The 45° projection is the brand's fold made into space | Stripe's isometric product art, architectural axonometrics |
| B | **Schematic: the wiring we do for you** | A technical wiring diagram: inputs on the far edge (MESSAGE, CALL, WALK-IN, LINK), traces routed at 90° and 45° into one ALYR block, drawn as the logo's fold, then out to terminals (ORDERS, BOOKINGS, OWED, STOCK, RECEIPTS, REPORT). Signal pulses run along the traces, and each terminal's counter steps when one lands. "The tech team your business never had" made literal: the wiring done for you | Vercel and Railway diagrams, engineering schematics |
| C | **Signal field: a week, counted** | An ambient data field. A precise dot matrix, where each lit dot is one event (a message, an order, a booking); hairlines carry it to a gathering line, and over the loop the dots settle into this week's bars beside last week's. "Orders 50 · QAR 8,520" resolves at the end, then the field resets. The most minimal and atmospheric option | Linear's grid work, data art, Mercury |
| D | **Explainer: one afternoon at Qirfa, in the product** | A product film playing as the background, like a launch-video shot. A slow camera move across one large canvas of real ALYR UI cards: chat → order ticket → booking slot → reminder → stock to "Sold out" → receipt → the Agent's "Week so far". Three parallel lanes (Orders, Bookings, Money) visibly run at once, with crisp mono captions ("12 messages → 12 orders", "Reminder sent 2 h before", "Stock 6 → 0 · Sold out", "Receipt sent"). Show, don't tell: it ends on the one screen | Linear and Stripe feature films, Apple product UI motion |

Direction D is "the product is the illustration" (the design system's own rule) taken to motion.
A, B and C need a written exception to that rule if chosen; record it as Needs Akmal.

## Framer and pages

- **Project:** "ALYR homepage prototypes" (https://framer.com/projects/LyKozm5SR5CGo5YpDJXA).
- **Build:** create one new page per direction by duplicating `/doodle` (it already has the
  prototype strip, the header and the hero at 1440, 1024 and 390). Then replace the doodle
  component instance with the direction's own component.
- **Pages and components:**

  | Direction | Page | Component |
  |---|---|---|
  | A | `/hero-plan` | `BgPlan.tsx` |
  | B | `/hero-schematic` | `BgSchematic.tsx` |
  | C | `/hero-signal` | `BgSignal.tsx` |
  | D | `/hero-explainer` | `BgExplainer.tsx` |

- **Prototype strip label:** "PROTOTYPE 05A · PLANOMETRIC", "05B · SCHEMATIC", "05C · SIGNAL FIELD"
  and "05D · EXPLAINER".
- **English only for now:** the founder picks one, then it gets its Arabic, mirrored. Design so
  that mirroring works (no baked-in left-to-right reading in the art).
- **Light first; check dark too.**
- **Don't touch others' work:** never edit or delete any other page or code file. Four builders
  and another session work in this project at the same time, so re-read before every edit.

## Verification (each builder)

- Run a local harness like `docs/doodle-study/harness`, on its own port:

  | Direction | Port | Edge profile |
  |---|---|---|
  | A | 3111 | `C:\t\bgA` |
  | B | 3121 | `C:\t\bgB` |
  | C | 3131 | `C:\t\bgC` |
  | D | 3141 | `C:\t\bgD` |

  Never use port 3100.
- Capture with `scripts/site/shoot.mjs`:
  - 4 frames across the loop at 1440, light;
  - 1 frame at 1440, dark;
  - 1 frame at 390, light;
  - an mp4 of one full loop;
  - Framer canvas screenshots.
- Save into `docs/doodle-study/shots-<a|b|c|d>/`.
- **Look at every frame as a critic** before reporting. Would this ship on stripe.com or
  linear.app? Fix what wouldn't.
- Write `docs/doodle-study/04-<a|b|c|d>-log.md`.
- **Don't commit:** the lead commits.
