# Prototype log: "How we work with you", cards with a moving scene (ALY-226)

## Round 2, 25 Oct 2026: four stages and the return line (founder's feedback)

The founder's feedback, through the coordinator, asked for two changes on both pages: a fourth
card, "You see your business on one screen", with a live update; and a visible loop from Improve
back to Check. Nothing was published or committed. Round 1, below, still describes the first
three scenes; this section replaces its layout and adds to its motion.

**Four cards, in order.**

| # | Card | Title (EN / AR) | Body |
|---|---|---|---|
| 1 | Check | We check how your business runs. / نفحص كيف يسير عملك. | as in round 1 |
| 2 | Set up | We set up what fixes it. / نجهّز ما يحلّها. | as in round 1 |
| 3 | **See** | You see your business on one screen. / ترى عملك في شاشة واحدة. | ALYR Agent shows what needs you now and what ALYR has done for you. The numbers update as orders come in. / يعرض ALYR Agent ما يحتاجك الآن وما أنجزته ALYR لك. وتتحدّث الأرقام مع وصول الطلبات. |
| 4 | Improve | We keep improving it with you. / نواصل تحسينه معك. | as in round 1 |

**The See scene** shows ALYR Agent's one screen for Qirfa Bakery, in the product's own labels
("Needs you now", "Done for you this week", "Updated", from `_agent/labels.ts` and the bakery
sample). The live part runs about 2.9 s, then settles:
- 0.3 s: order #1442 (Sara M., the same order as the homepage's flow) arrives.
  - "Orders this week" rolls from 49 to 50, and "Updated 16:19" becomes 16:20.
  - A row arrives in Needs you now: "1 order needs confirming · #1442, Sara M.".
- 0.9 s: "messages ALYR sent for you" rolls from 181 to 182 (the "Order received" message). Its
  box takes one Volt tick, as the product ticks a "Done for you" row whose count rose.
- 2.1 s: the order is confirmed. The row's box ticks Volt and "sent" becomes 183 (the
  "confirmed" message).
- 2.58 s: the row clears along 45°, as the product closes a done card.
- Settled: 50 orders; "2 customers waiting for an answer · longest 48 min"; 183 messages; 7
  booking reminders. These match the engine's sample at 16:20, except that the sample also
  lists "2 orders need confirming".
- The window sits in a fixed box, so it does not jump when the row comes and goes; only its foot
  moves.

**The return line** is a new code component, `AlyrLoop.tsx`, placed as an absolute overlay on
the cards' row:
- After Improve finishes (+0.6 s), a 1.5 px `--line-strong` line draws once in 0.96 s
  (4 × `--dur-2`, `--ease`).
- Its path runs down from under Improve's text, along a rail under all the cards, and up the
  inline-start gutter. Every corner is a 45° chamfer. It ends with a 45° stroke and an arrowhead
  into Check's card.
- On the rail sits the note "Then we check again, every month" / «ثم نفحص من جديد، كل شهر» (mono
  label in English; Plex Arabic, not tracked, in Arabic).
- When the line arrives, Check's card gives one Volt tick: a 2 px Volt line draws along its 45°
  cut (`--dur-3`). It stays; nothing repeats.
- The whole path is mirrored in Arabic (the gutter and Check are on the right).
- The components talk through two window events, `alyr:improve-done` and `alyr:loop-arrived`.
- With reduced motion or on the canvas, the line and Check's Volt cut are already drawn.

**Layout.**
- **1440:** four in a row. The content is 1,344 px inside 48 px gutters, so cards are 318 px
  wide and 340 px tall.
- **1024: 2×2.** In a row of four, each card would be 228 px and the scenes would shrink to
  about 60%, with 7 px text. In 2×2 they are 468 px wide and 360 px tall at full scale. The
  return line runs from under Improve (bottom inline-end), along the bottom and up the gutter to
  Check (top inline-start).
- **390:** stacked, 380 px tall. The return line runs up the 16 px gutter, from under Improve to
  Check's edge.
- **Arabic order:** Improve, See, Set up, Check from left to right at 1440. In 2×2, Check and
  Set up are on top, See and Improve below, mirrored. On the phone, Check comes first.
- Stagger across the four cards is 0, 240, 480 and 720 ms (0 on the phone).

**Measured** in the local harness, headless Edge, with the same code (local copy equals Framer's,
36,223 characters):

| Event | English | Arabic |
|---|---|---|
| Check ends | 1.69 s | |
| Set up ends | 2.17 s | |
| See settles | 3.33 s (2.85 s after its stagger) | |
| Improve ends | 2.29 s | |
| Return line starts | 2.42 s | 2.42 s |
| Line arrives | 3.39 s | 3.38 s |
| Check's Volt cut drawn | 3.87 s | 3.86 s |

- Nothing changes in the 3 s after.
- Hover replays a card in about 2 s; the return line does not redraw.
- With reduced motion nothing plays and every end state shows.
- The mid-play frame shows the live row with its empty box, and "sent" at 182 with its tick.

**Framer screenshots, looked at:**
- English: 1440, 1024 and 390.
- Arabic: 1440, 1024 and 390, plus 1440 dark.
- English 1440 dark is from round 1 only, before the fourth card.

Fixed while looking:
- the overlay did not stretch with pins, so it is now 100% × 100%, offset one gutter;
- the copied See column kept Set up's frozen text on the laptop and phone;
- the Arabic page was rebuilt from the English one and its frozen replica text patched (19
  nodes).

**Open for the founder (added):**
1. "Then we check again, every month" restates the monthly review, which is still an open
   promise. The live site's step 4 says "Every month we go over your numbers with you", but the
   lane brief lists that promise as his to confirm.
2. The live update shows order #1442 confirmed by the team. The product does not say who
   confirmed it, and neither does the scene.
3. The scene adds a cause-and-effect sequence (order, then message, then confirmation, then
   message) to the sample's static 16:20 numbers. The counts at rest match the sample; the steps
   in between are made up.
4. Replay on hover and the line's single draw: the line draws once per page load, by design.

**Not checked (added):**
- 2×2 in Framer Preview: the grid on the laptop is a breakpoint override of the stack, and only
  canvas screenshots were seen.
- The return line where the text under the cards wraps to more lines than seen here (it is drawn
  from the row's real height, so it should follow).
- English dark at 1024 and 390, and English dark at 1440 after the fourth card.

---

## Round 1

25 Oct 2026. Site and brand lane. This is a Framer prototype for the founder to click through.
Nothing on alyr.qa changed, nothing was published and nothing is committed. Inspiration:
cradle.bio, "From first design to final protein" (captured at 1440 × 900, light). We took its
layout (heading, lead, three still cards, title and two lines under each) and its calm "one
moving thing per card". We left out its blobs, gradients, rounded cards and looping video.

- **Project:** "ALYR homepage prototypes" (https://framer.com/projects/LyKozm5SR5CGo5YpDJXA).
  Open it with Framer's Preview (▶) while signed in. There is no framer.app address.
- **Not touched:** the pages `/` and `/ar`, `AlyrTile.tsx`, `AlyrArabic.tsx`, and the project
  "Blessed Tuna". `/` and `/ar` were checked at the end and are unchanged.

## What is built

| Page | Path | Breakpoints |
|---|---|---|
| How we work with you | `/how-we-work` | Desktop 1440 (≥1440), Laptop 1024 (1024–1439), Phone 390 (<1024) |
| Arabic: How we work with you | `/ar/how-we-work` | The same three, mirrored |

Both pages were made by duplicating `/`, so they keep its three breakpoints and prototype strip
("PROTOTYPE 02 · HOW WE WORK WITH YOU · NOT THE LIVE SITE"). Each has a link to the other
language.

**The section.** "How we work with you" (H2) and the lead from content audit row 24, stacked on
the start columns as Cradle does. Under them are three cards in a row, 24 px apart (16 px on a
laptop, stacked 48 px apart on a phone). Each card is a Carbon canvas, 410 px square at 1440
(360 px tall on a laptop, 380 px on a phone). It has a 48 px 45° cut at its top inline-start
corner (`--cut-plate-sm`, mirrored) and a hairline along the cut. Under each canvas are an
`h3` title and two lines of body text. The row's `aria-label` carries the machine line saying
Qirfa Bakery is fictional. The words are the steps' own titles from `copy.ts` and shortened
bodies:

| Card | Title (EN / AR) | Body |
|---|---|---|
| Check | We check how your business runs. / نفحص كيف يسير عملك. | We come to your shop and look at how orders, bookings and credit are kept. You get the list in plain words. |
| Set up | We set up what fixes it. / نجهّز ما يحلّها. | We set up only what the check-up calls for. We load your items, set your hours and train your team at the counter. |
| Improve | We keep improving it with you. / نواصل تحسينه معك. | ALYR Agent compares your week with the same days last week. We go over it with you and add what your business needs next. |

**The scenes.** There is one code component, `AlyrScene.tsx`, with controls for the scene, the
language, the stagger (0–2) and the canvas state. Each scene is a drawn window (white on light,
`--window` on dark), 300 px wide. It has a 12 px notch at the top inline-end corner and is
scaled down to fit narrower cards:

1. **Check.** A check-up sheet: "QIRFA BAKERY · SAMPLE" (the section's one Sample mark),
   "Check-up at the counter", then four rows. Each row's box fills with Volt and draws its tick.
   Then what was found arrives along 45°:
   - How customers reach you: 43 unread chats on WhatsApp
   - How orders are kept: in long chats, with voice notes and photos
   - Who owes you: office regulars, never reminded
   - What customers ask most: "Is my order ready?"

   These are the bakery panel's own problems; 43 is the sum of its unread chats.
2. **Set up.** The workspace's setup checklist, in the product's step labels from `catalog.py`:
   - Add your menu or price list
   - Add the services customers can book
   - Set your opening hours

   It starts at "2 of 3 steps done.". The last box ticks, the Volt progress rule fills, and
   "Finish setting up" gives way to "Everything is set up" (the workspace's own `allSet`).
   Then the team's phone rises along 45° from the card's bottom edge (cropped hard). On it, in
   Orders, the first order arrives: "#1001 · Mariam S. · 6 butter croissants · New", on
   `--volt-wash`.
3. **Improve.** An ALYR Agent window: "ALYR AGENT · THURSDAY · 16:20" and the dashboard's own
   sentence, "Orders up 11%, sales up 20% on the same days last week." Below it is "Sales this
   week". Last week's bar (QAR 7,129) stands still; this week's Volt bar rises while its
   figure counts to QAR 8,520. Then "▲ 20%" arrives, and "Against Sunday to 16:20 last week"
   sits under it (the KPI caption). All numbers are from the engine's bakery sample.

**Volt** only where something becomes true: the ticks, the setup progress, the new order's
wash, and this week's bar. There are no Volt buttons.

**Motion.**
- Each scene plays once when 50% of its card is in view. The cards start 240 ms apart
  (4 × `--stagger`), set to 0 on phones where they stack.
- Everything travels along 45°, mirrored in Arabic, with `--ease` and `--dur-2`, `--dur-3` and
  `--dur-4`.
- It replays on hover with a mouse, or on a tap, but only after it has finished.
- On hover the fragment moves 2 px along 45° (not under reduced motion).
- Nothing loops. Reduced motion and the Framer canvas show the finished state.

**Arabic.** The layout is mirrored by hand:
- Card order is Improve | Set up | Check, so Check reads first from the right. Phones keep
  Check first.
- Stacks align to the end, text is right-aligned, and padding is mirrored.
- Text uses IBM Plex Sans Arabic at 1.3 and 1.7 line heights with no tracking. It has the
  existing `withArabic` override for `dir="rtl"`.
- Inside the scenes, `dir`, cuts, notches and travel mirror. Last week's bar sits on the right
  (time runs right to left). Money reads «8,520 ر.ق» in `<bdi>`, and "ALYR Agent" stays Latin
  with its case.

**Light and dark** come from the existing `ALYR/<token>` colour styles. No new colours or styles
were added.

## Checked

- **Framer canvas screenshots,** looked at: English at 1440, 1024 and 390 in light, and 1440 in
  dark; Arabic at 1440, 1024 and 390. Fixed after looking:
  - the laptop strip's text overlapped;
  - last week's bar was too heavy;
  - the cut had no hairline in dark mode;
  - replica text on the Arabic laptop and phone, and on both phone strips, stayed English or
    showed Prototype 01's words. A breakpoint override on a text node freezes its text. Each
    one was patched.
- **Motion,** measured outside Framer. The component, transpiled with the repo's TypeScript,
  ran in a local page (React 18.3.1 and framer-motion 11.11.17 from esm.sh, a stub for
  `framer`) in headless Edge with `shoot.mjs`. A MutationObserver read when each card stopped
  changing. There were no screenshots during the timed runs.
  - At 1440 in English, Check ends at 1.69 s, Set up at 2.18 s (1.94 s after its 0.24 s start)
    and Improve at 2.05 s.
  - Arabic is the same to within 15 ms.
  - Nothing changes in the 3 s after.
  - Hover replays Set up in 2.02 s.
  - With reduced motion nothing plays, everything is finished, and hover does not move the
    fragment.
  - At 390 there is no sideways scroll.
- **The component** has no diagnostics in Framer. The local copy matches Framer's (28,046
  characters).

## Decisions taken while building

- **The setup checklist joins steps from two of the product's modules** (Orders' "Add your menu
  or price list", Bookings' services and hours) in one list headed "Finish setting up". The
  workspace draws one tile per product ("Finish setting up {product}"). It is a fair fragment,
  not a literal one.
- **QAR 7,129 is derived.** It is the sample's last-week values for Sunday to Wednesday plus
  Thursday to 16:20 (1,803 + 1,922 + 917 + 1,188 + 1,299). The engine prints only "▲ 20%" and
  the caption.
- **The first order (#1001, Mariam S., 6 butter croissants) is new sample data.** It follows the
  rules: numbers start at 1001, the name is a first name and a father's initial, and butter
  croissant is the report card's top item. It shows no amount.
- **No hidden-HTML failsafe.** Framer renders the component's start state on the server, so
  before hydration a scene's arrivals are hidden. On the site this would be CSS keyed on
  `.motion` with the end state in the HTML (`motion.md` rule 3).
- **No keyboard replay.** The card is a figure, not a control, so it is not focusable.

## What Framer could not do, or did only by workaround

- Frames have no clip-path, so the 45° cuts are drawn inside the code component.
- Text has no `dir` setting, so Arabic needs the `withArabic` override, which applies in Preview
  only.
- A breakpoint override on a text node (a font size, say) freezes that node's text, so later
  edits to the primary do not reach it. Each replica had to be patched.
- The motion plays only in Preview. The canvas and Framer's screenshots show the finished state.
- I could not watch Framer's own Preview (no sign-in for the agent), so the timing above is
  from the local run of the same code.
- Breakpoint ranges cannot be set; the laptop breakpoint stays as in Prototype 01.
- The linter keeps reporting the prototype strip's two halves as "spacing −100 px" on Desktop
  and Laptop. The screenshots show no overlap; the same strip came from `/`.

## Open for the founder (Needs Akmal)

1. **Replay on hover conflicts with `motion.md` rule 1** ("plays once… never again"). He asked for
   it; if he keeps it, `alyr-design/motion.md` needs that exception added when this is built.
2. **"We go over it with you and add what your business needs next"** implies a review after go
   live. This is the same open question as the monthly review promise in the lane brief.
3. **The lead says "after you go live".** The content audit approved it (row 24), but the
   21 Oct Shelf and Docs rulings removed "go-live" from those pages. He should confirm.
4. **The card titles repeat the hero lead's three verbs** (audit pattern 12, "say it once").
   This is acceptable on a section about exactly that, but it is his call.
5. **The Arabic** («كيف نعمل معك», the three bodies and every scene label) is a draft for ALY-66.
6. **Card 3's middle step is folded in.** "You see your business on one screen" is no longer
   its own step; Improve carries ALYR Agent.

## Not checked

- Framer's own Preview: hover, scroll-into-view, tap, and the `withArabic` override there.
- A real phone, Safari, and touch.
- 320 px. Framer has no 320 breakpoint here; the phone layout was seen at 390 only.
- Dark theme on the Arabic page and at 1024 and 390 in Framer. Dark was seen at 1440 English on
  the canvas only.
- axe and screen readers. Each card is `role="img"` with an `aria-label` in its language, and
  the drawing inside is `aria-hidden`; nothing ran against it.
- Contrast was not measured. The values come from tokens whose contrast is stated. A Volt bar
  on white is below 3:1 as a graphic, but its value is printed as text.
- The fictional names (Qirfa Bakery, Mariam S.) beyond the register's existing entries.
- How the section sits on the homepage among the other sections. It was built alone on its own
  page.
