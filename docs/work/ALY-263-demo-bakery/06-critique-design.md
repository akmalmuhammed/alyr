# ALY-263 · Design and motion critique of /demo/bakery

Critic: independent design and motion review, 29 Oct 2026, branch `aly-demo-bakery` in `D:\alyr-demo`, dev server on port 3117. I read the skills (`alyr-design` and its files, `alyr-product-screen`), the founder's decisions, the brief, the research, the build log and `docs/sales/demo-bakery.md`, then the code. I judged it from the build's captures (`C:\t\demo\cur-en\`, `C:\t\demo\cur-ar\`) and from my own runs saved under `C:\t\demo\crit-design\`:
- keyboard walks in English dark at 1440 × 900, English at 1280 × 800 and 1024 × 768, Arabic dark at 1440 × 900, Arabic at 1024 × 768, and Arabic at 1280 × 800 for scenes 3, 5 and 7, with axe on scenes 1, 3, 7 and 9 in dark;
- a probe with motion on (`probe.mjs`, results in `probe-motion.json`) that read `document.getAnimations()` and sampled the wipe's `clip-path`, with no screenshots taken while it measured;
- screenshots of the menu, the notes and keyboard focus (`probe-*.png`).

I changed no code.

## Verdict

The demo is honest, well labelled, fully bilingual and mirrored, and its interaction model (beats on the keys, the scene menu, the notes, R, L and D) is solid. As it runs today, though, it reads as a well-made deck: about a third of the beats are a line of type on an empty grid, a list with bullets or a box of text, and the drawn product screens are small and parked in one corner of a mostly empty stage. The 45° transition, the one piece of motion that should carry the brand, finishes in about 0.1 s, so it shows as a flash cut. Three fit problems break the owner's own moments at 1280 and 1024 wide: the cake builder, the scene 2 formula and the scene 7 phone.

## P0: broken, untrue, or against a founder decision

### P0-1 · The owner cannot finish the cake: half the builder is hidden
- **Where:** scene 3, beat 2. Both languages. At 1440 × 900 "Message on the cake" is cut off and "Pickup day" is out of sight. At 1280 × 800 and 1024 × 768 neither group shows. Light and dark.
- **What is wrong:** the four `Choices` groups sit inside `.dm-op-body` (`overflow-y: auto; scrollbar-width: none`). Nothing shows that the page scrolls, and nothing scrolls by itself after a pick. "Pay QAR 160" stays disabled at 40% opacity until all four are chosen. The owner taps a size and a filling, then finds nothing more to tap. This is one of the two touch moments the founder decided on ("the owner taps at two moments (their pains, the custom cake)"). The founder's Next fills in the rest, which hides the failure from him but not from the owner.
- **Fix:**
  1. In `Choices`, after `onPick`, bring the next group into view: `e.currentTarget.closest('.dm-op-group')?.nextElementSibling?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })`. Pass `reduced` down, or read `matchMedia` there. When `ready` turns true, bring `.dm-op-foot` into view too.
  2. Make the groups fit at 1280 × 800. Lay out `.dm-op-chips` for the filling as a two-column grid (`grid-template-columns: repeat(2, minmax(0, 1fr))`). Drop `.dm-op-item small` (the description) in beat 2. Set `.dm-split-phone .dm-phone { max-height: none }` so the phone takes the row's full height.
  3. Give `.dm-op-body` a visible hard crop at its foot: a `--line` hairline on `.dm-op-foot`, which is already there, plus the next group's legend peeking above it. Never a fade.
- **Screenshots:** `C:\t\demo\cur-en\03-order-b2.png`, `C:\t\demo\crit-design\d-en-1280\03-order-b2.png`, `C:\t\demo\crit-design\d-ar-1024\03-order-b2.png`.

### P0-2 · Scene 2 breaks at 1024 × 768
- **Where:** scene 2, beat 1 (formula open). English, 1024 × 768, light. Arabic fits at this size.
- **What is wrong:** `.dm-cash` is `align-content: center`. With the formula open, the content is taller than the stage, so the stage line "Three numbers. Yours, not ours." is cut in half under the rail, and the formula's total and its footnote run off the bottom. The brief says no clipping at 1024 × 768, and the task says it must not break at 1024.
- **Fix:**
  1. `.dm-cash { align-content: start; }`.
  2. When `visit.formula` is true, swap the stage line for the leak line: one idea per screen, and the leak line already says it.
  3. Under `@media (max-height: 50rem)`, step `.dm-step-value` down from `--stage-figure` to `--stage-title`, and put the `.dm-formula` total (`.dm-term.is-total`) on the same row as its terms (`grid-auto-flow: column`).
- **Screenshot:** `C:\t\demo\crit-design\d-en-1024\02-money-b1.png`.

## P1: should fix

### Motion

#### P1-1 · The 45° scene cut is a flash, not a fold
- **Where:** every scene change. Both languages, all widths.
- **What is wrong:**
  - `@keyframes dm-wipe` grows the triangle to legs of `300vmax` (4,320 px at 1440 wide), but the stage is covered once the legs reach w + h (about 2,284 px, 53% of the travel). With `--ease` (expo out) that point comes about 11% into the `1.5 × --play-4` (842 ms) run. Measured: the leg was 1,786 px at about 60 ms and 2,880 px at about 120 ms. So the edge crosses the whole screen in about 100 ms, and the remaining 740 ms animate off screen.
  - Light-to-light scenes share the same canvas and grid, so the moving edge has nothing to show it, and the leaving scene does not move.
  - The result reads as a hard cut, not ALYR's fold.
- **Fix:**
  ```css
  @keyframes dm-wipe { from { clip-path: polygon(100% 0, 100% 0, 100% 0); }
    to { clip-path: polygon(100% 0, 100% calc(100vw + 100vh), calc(100% - 100vw - 100vh) 0); } }
  @keyframes dm-wipe-rtl { from { clip-path: polygon(0 0, 0 0, 0 0); }
    to { clip-path: polygon(0 0, 0 calc(100vw + 100vh), calc(100vw + 100vh) 0); } }
  ```
  - Run it for `calc(2 * var(--play-4))` on a new in-out token. Add `motion.ease.fold` to `design/tokens.json`, for example `cubic-bezier(.7, 0, .2, 1)`, in both generated blocks. `--ease` is for things arriving. A cover that should be seen crossing needs an even sweep.
  - Give the leaving scene a small move under the cover: `.dm-scene.is-leaving { animation: dm-leave calc(2 * var(--play-4)) var(--ease-fold) both }`, with `to { translate: calc(var(--travel) * var(--dir) * -2) calc(var(--travel) * 2); opacity: .7 }`. The old page then settles toward the bottom inline-start corner as the new one folds over it.
  - Start the incoming parts after the edge: delay `.dm-scene.is-entering .dm-in` and `.dm-rise` by an extra `var(--play-3)`.
  - Optional: one crisp hairline on the edge, from a wrapper around the entering scene with `filter: drop-shadow(calc(-1px * var(--dir)) 1px 0 var(--line-strong))` during the wipe only. Do not use Volt there; it would be decoration.
- **Screenshot:** none; see `C:\t\demo\crit-design\probe-motion.json` (the `clip` samples for "setup→1", "1→2", "2→3" and "3→4").

#### P1-2 · Scene 4's "fold cuts the pain away" cuts a blank page
- **Where:** scene 4, every before → after beat. Both languages.
- **What is wrong:** `Pains` unmounts `.dm-before` on the after beat and wipes `.dm-after.dm-cut` in over empty canvas, so the quote is never cut away; it just vanishes. The brief's "cut away by the fold" and the product's own gesture ("the fold closes it") are both missing. Because of P1-1 it also flashes.
- **Fix:**
  - On the after beat, keep the quote mounted under the after: `{after && <div className="dm-before is-closing" aria-hidden inert>…</div>}`, both children in one grid cell (`.dm-pains-stage > * { grid-area: 1 / 1 }`).
  - Close the quote along 45°, from the top inline-end corner to the bottom inline-start corner:
    ```css
    @keyframes dm-close { from { clip-path: polygon(0 100%, 0 calc(100% - 100vw - 100vh), calc(100vw + 100vh) 100%); }
      to { clip-path: polygon(0 100%, 0 100%, 0 100%); } }
    ```
    In RTL anchor it at `100% 100%`.
  - Then let the after's parts arrive (`.dm-in` delays plus `2 * --play-4`). Drop `dm-cut` from `.dm-after`, so the after arrives part by part on a clean canvas.
- **Screenshots:** `C:\t\demo\cur-en\04-pains-b0.png` → `04-pains-b1.png`.

### Layout that jumps between beats

#### P1-3 · Things the owner is looking at move when the founder presses Next
- **Where:** scene 2 b0 → b1 (the stage line jumps up by about 270 px), scene 3 b2 → b3 → b4 (the Orders window jumps about 315 px sideways and narrows), and scene 5 b0 → b3 → b6 (the order line moves up and down by about 90 px). Both languages, all widths.
- **What is wrong:**
  - **Scene 2:** `.dm-cash` centres its content, so each new block re-centres everything above it.
  - **Scene 3:** `.dm-split` is `grid-template-columns: auto minmax(0, 1fr)`. On beat 3, `Labels note={o.cardsLive}` (max 46ch) widens the auto phone column.
  - **Scene 5:** `.dm-wire { align-self: center }`, while the head changes from one to three lines (`s.end`).
- **Fix:**
  - **Scene 2:** `.dm-cash { align-content: start }`, and reserve the leak's slot from beat 0 (render `.dm-leak` with `visibility: hidden` on beat 0) so beat 1 only adds.
  - **Scene 3:** `.dm-split { grid-template-columns: minmax(0, 3fr) minmax(0, 9fr) }`, and give `.dm-labels-note` `max-width: 100%` inside the phone column. Better still, move the condition line into `.dm-built`, the foot rule.
  - **Scene 5:** `.dm-wire { align-self: start; margin-top: var(--sec) }`, and give `.dm-sys-head` a `min-height` of two `--stage-title` lines. Or keep `s.title` as the stage line throughout and show `s.end` as the `.dm-lead` under it.
- **Screenshots:** `C:\t\demo\cur-en\02-money-b0.png` and `02-money-b1.png`; `03-order-b2.png`, `03-order-b3.png` and `03-order-b4.png`; `05-system-b0.png`, `05-system-b3.png` and `05-system-b6.png`.

### Slides, generic and unfinished

#### P1-4 · Scene 1 is a title card beside a list; the first ten seconds do not arrest
- **Where:** scene 1, both beats. Both languages and themes.
- **What is wrong:**
  - Beat 0 is three lines of type on Carbon with the right 55% of the stage empty: a title slide.
  - Beat 1 adds a "Their chats tonight" panel: a generic dark list with white dots, not a drawn WhatsApp chat on a phone.
  - All the motion is three rises in the first 1.8 s (measured: name at 0.37 s, day at 0.66 s, clock at 0.94 s, done at 1.78 s), then stillness.
  - The list's foot fades out through `mask-image: linear-gradient(...)` (`.dm-chats-list`). That is a gradient, and the catalogue asks for a hard crop.
- **Fix:**
  - Draw beat 0 and beat 1 as one composition. Left: the type as it is. Right, from beat 0: a `Phone` (`.dm-phone`, 45° cut, mirrored) showing the WhatsApp chat list in WhatsApp's own colours (`--wa-*` is allowed inside a drawing of WhatsApp), with green unread counts and the shop's own chats. Header "WhatsApp" text, no logo.
  - On beat 0 the phone is dark (the lock screen at 11:47). On beat 1 the fourteen chats land one by one along 45° (`.dm-in` with `--i`), the newest on top, cropping hard at the phone's foot. The line "14 unread chats." arrives last and plain: no count-up, no pulse.
  - Delete the mask, and remove `.dm-chats` as a free-standing panel.
- **Screenshots:** `C:\t\demo\cur-en\01-bakery-b0.png`, `01-bakery-b1.png`; `C:\t\demo\cur-ar\01-bakery-b1.png`; `C:\t\demo\crit-design\d-en-dark-1440\01-bakery-b1.png`.

#### P1-5 · Scene 4's "before" beats are text slides
- **Where:** scene 4, beats 0, 2, 4 and 6 (each pain's before). Both languages.
- **What is wrong:** an eyebrow and one quote at `--stage-hero` on an empty grid, five times in the scene: the "title and nothing" slide the research warns against. The research's own pattern is "Before and after as the same picture", and here they are two different pictures.
- **Fix:**
  - Make each before the same figure as its after, in its bad state, with the quote as the stage line beside it:
    - "Is it ready?": the owner's phone with five "Is it ready?" messages from different customers, timestamps through the afternoon;
    - the café: Tamr Café's account at 64 days with nothing sent;
    - the invoice: a chat asking "Can you send an invoice?" with no answer;
    - midnight: the 11:52 pm message with "seen 9:04 am".
  - Then the fold (P1-2) closes the before figure and the after figure arrives in the same place.
  - Words for each before go in `copy.ts` (`pains.cards.*.beforeFig`), and are checked against `02-truth.md`.
- **Screenshots:** `C:\t\demo\cur-en\04-pains-b0.png`, `04-pains-b2.png`, `04-pains-b6.png`.

#### P1-6 · Scene 4's midnight recap is an unfinished card, and "11:52 pm" breaks across lines
- **Where:** scene 4, the after beat of a pain that points elsewhere ("midnight" here; "twenty", "eid", "best" and "google" use the same `.dm-recap`). English shown; the same in Arabic.
- **What is wrong:**
  - A white box with one sentence and "SHOWN IN SCENE 3", floating in a half-empty stage.
  - The stage line breaks "11:52 / pm".
- **Fix:**
  - Replace `.dm-recap` with a scaled still of the scene it points to. For midnight, the scene 3 Orders window at its end state (12 of 12) drawn with the same `Window` and `.dm-orders` at `zoom: .8`. Make the whole still the jump target: one outlined `dm-btn is-line`, the existing "Go to scene 3", under it.
  - Put a no-break space between time and "pm" in `copy.ts` (`11:52\u00a0pm`), everywhere a clock is written.
- **Screenshot:** `C:\t\demo\cur-en\04-pains-b5.png`.

#### P1-7 · Scene 4's café beat carries two ideas, and its message is not drawn as WhatsApp
- **Where:** scene 4, café after beat. Both languages, all widths.
- **What is wrong:**
  - The account and its reminder share the screen with a second card, "Your cafés see their price, your customers see theirs." That is a second idea, with a heading competing with the stage line.
  - The reminder message is a white bubble in a white card, not a phone or a chat.
  - "Reminder sent" is drawn as a pressable outlined button. It is a state, and reads as a control.
- **Fix:**
  - Move price groups to the notes, or make them a third beat for the café pain (`painOrder` beats are 2 per pain; allow 3 for `cafe`).
  - Draw the reminder in a `Phone` with `WaHead name="Tamr Café"`, the account panel beside it.
  - Render "Reminder sent" as a status line (`.dm-state` with the check icon and the time), not as a bordered button.
- **Screenshots:** `C:\t\demo\cur-en\04-pains-b3.png`, `C:\t\demo\cur-ar\04-pains-b3.png`, `C:\t\demo\crit-design\d-en-1024\04-pains-b3.png`.

#### P1-8 · Scene 5's journey is a diagram of words, not the product
- **Where:** scene 5, beats 0 to 6. Both languages, all widths.
- **What is wrong:**
  - Six empty squares on a line, product names, and a 15 px caption under each: no product screen in the founder's synergy scene.
  - The band between the stage line and the wire, about 400 px at 1440, is empty.
  - The lit captions are `--fs-small`, too small at arm's length.
- **Fix:**
  - Keep the wire and the `#1043` token; they are good. Above each station draw a fragment of that product's real screen, the way the homepage's products frame does (reuse `SuiteFrame`'s tile fragments or their `sf-*` markup):
    - Chat: the order page's Paid row;
    - Bookings: the tasting at Saturday 11:00;
    - Agent: today's count rising by one with one Volt rule;
    - Accounts: Tamr Café's line;
    - Shelf: chocolate cakes 11 of 12;
    - Docs: receipt RC-0043.
  - Only the lit station's fragment is at full opacity; the rest rest at `opacity: .5` with a hard crop.
  - Raise `.dm-station-did` to `--stage-lead`.
  - The product names already use `.dm-pname`, which is right.
- **Screenshots:** `C:\t\demo\cur-en\05-system-b0.png`, `05-system-b3.png`, `05-system-b6.png`; `C:\t\demo\cur-ar\05-system-b6.png`.

#### P1-9 · Scene 5's before → after is two unrelated pictures, and the after window is unfinished
- **Where:** scene 5, beats 7 and 8. Both languages.
- **What is wrong:**
  - **The islands:** seven boxed labels with icons scattered on the grid, which reads close to a bento icon grid.
  - **The after:** a white window holding a four-row text table and six product tags, using 60% of the width and 45% of the height. The stray "SAMPLE" label is parked at the bottom inline-start, 400 px from the window it belongs to.
  - **Not one picture:** the islands do not become the workspace; the beat just cuts.
  - Neither stage line ends with a full stop.
- **Fix:**
  - Draw the after as the workspace shell itself, the product's real layout: `.sh-side` style sidebar with the shop monogram and the six products in the suite's order; main pane Mariam Saleh's customer record (6 orders, last chocolate cake Thu, paid, receipt RC-0043); a team row with Owner, Kitchen and Counter sign-ins. Size it to the stage (`max-width: none; height: 100%`).
  - Put "Sample" beside the shop name in the window's own bar (the brand's Sample mark), with Built as the one chip, and delete the orphan `Labels` under it.
  - For the move between the two beats: render beat 8 with the islands still mounted, and translate each island along 45° into the sidebar row it becomes (bank screenshots → Chat's Paid, notebook → Orders, Excel → Agent, calculator → Docs, delivery app → Chat's order page, Instagram → the inbox). Use `.dm-token`'s `translate` transition, then fade the islands as the rows arrive.
  - Words: "Before: seven places, nothing joined." and "After: one workspace." need their full stops in `copy.ts`.
- **Screenshots:** `C:\t\demo\cur-en\05-system-b7.png`, `05-system-b8.png`.

#### P1-10 · "It grows with you" is a title and four bullets, with a promise and a mislabel
- **Where:** scene 5, beat 9. Both languages.
- **What is wrong:**
  - It is the slide the research names: a title, bullets, labels.
  - "A second branch under the same account" is shown on a dashed rule as "Not built yet" to a prospect. `02-truth.md` is right that it is not built, but D-039 says the dashed language "is for a slot, not for a promise", and in a sales pitch this is a promise.
  - "Every month we sit with your numbers" carries "Set up by ALYR". The founder's decision gives that label to two things only: the Google profile setup and the review requests.
  - The monthly line repeats scene 8's step 4.
- **Fix:**
  - Draw the beat as two real screens: the team screen with three roles (Owner, Kitchen, Counter), and the product switches (the suite's six with Shelf and Agent included).
  - Remove the monthly row; it belongs to scene 8.
  - Move the second branch to the notes for the founder to say if asked, or ask him (label "Needs Akmal": show a not-built item to an owner, yes or no).
- **Screenshot:** `C:\t\demo\cur-en\05-system-b9.png`.

#### P1-11 · Scene 3 leaves the stage's lower right empty and buries its punchline
- **Where:** scene 3, all beats. Both languages, 1440 × 900 and 1280 × 800.
- **What is wrong:**
  - Under the Orders window and Thursday's list, the lower right of the stage is empty (about 540 × 500 px at 1440).
  - The scene's punchline, 11 → 12 of 12 → "Full for Thursday. Next free: Saturday.", is a 28 px count in the window's foot.
  - The table runs at `--ui-small` with `--ui-micro` mono headers, too small for an owner across a counter.
  - The time sits twice: in `.dm-clock` and in the stage line ("11:52 pm. Everyone's asleep.").
  - Four chips are on screen: Built and Sample under the phone, Built on the window, Sample on the list.
- **Fix:**
  - **Grid:** set `.dm-split-work` to `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`, with `grid-template-rows: auto minmax(0, 1fr)`.
  - **Orders window:** span both columns on the top row.
  - **Daily limit:** take `.dm-limit` out of the window into its own drawn panel, bottom inline-start of the work area. Put the count at `--stage-figure` and the twelve cells at `height: 2.5rem`. This is where the eye should go on beats 4 to 6.
  - **Thursday's list:** bottom inline-end.
  - **Clock:** show `.dm-clock` only when the stage line has no time in it.
  - **Labels:** one chip per figure, per the brief. The phone takes Built; "Sample business" goes under the name in its `WaHead`, as the brand's phone mark does, instead of a second chip.
- **Screenshots:** `C:\t\demo\cur-en\03-order-b0.png`, `03-order-b4.png`, `03-order-b6.png`; `C:\t\demo\crit-design\d-en-dark-1440\03-order-b4.png`.

#### P1-12 · Scene 6 is a phone in a corner and a chat drawn as a window
- **Where:** scene 6, beats 0 to 3. Both languages.
- **What is wrong:**
  - **Beat 0:** the map phone sits at the inline start with about 75% of the stage empty.
  - **Beats 1 to 3:** the review request is a 900 px-wide chat window holding one bubble, not a phone, so it does not match the other chats in the demo.
  - **Beat 3:** three chips (Set up by ALYR, Built, Sample) in one row for three different figures.
  - **The bio link card:** half empty.
- **Fix:**
  - **Layout:** two phones side by side at the same size, centred on the grid (`.dm-found-row { grid-template-columns: auto auto; justify-content: center }`). The map phone takes Set up by ALYR. The customer's chat phone shows the request at 3:40 pm and, on beat 2, the review she wrote. Each phone carries its own chip.
  - **Beat 3:** replace the side cards with the counter card drawn as a print piece (the QR card, `alyr-print` proportions, 45° cut). Show the bio link inside a drawn Instagram-style profile header with no logo, or drop it to a line under the card.
- **Screenshots:** `C:\t\demo\cur-en\06-found-b0.png`, `06-found-b3.png`.

#### P1-13 · Scene 7: the phone runs off the screen, and the Agent home says Thursday on Sunday
- **Where:** scene 7.
  - Beat 0, English, at 1440 × 900, 1280 × 800 and 1024 × 768, light and dark: in English the stage line takes two lines, which pushes the phone past the bottom of the stage. Arabic fits.
  - Beat 1, both languages, all widths: the Agent dashboard.
- **What is wrong:**
  - **Beat 0, the phone:** its frame and caption are cut by the viewport edge.
  - **Beat 0, the mini card:** inside the phone the scaled report card collides, "Butter croissantQAR 13,894".
  - **Beat 1, the crop:** the dashboard is cut through the middle of its KPI figures ("QAR 8,520" is half shown), inside a scroller (`.dm-agent-scroll { overflow-y: auto }`) that nobody can see.
  - **Beat 1, the day:** it reads "THURSDAY · 16:20 · Week so far" in a scene titled "Your Sunday", under "what needs you today". An owner will notice.
- **Fix:**
  - **The phone:** `.dm-sunday-row .dm-phone { height: 100%; max-height: 100% }`, with `.dm-sunday-row` already `minmax(0, 1fr)`. Shorten the English stage line so it fits on one line ("Sunday, 9:00 am. How the week went.").
  - **The mini card:** let the phone's mini card shrink its type (`font-size` from the card's em scale) or show the PNG card as the product sends it.
  - **The dashboard crop:** scale the whole dashboard to fit instead of scrolling (`.dm-agent .ag { zoom: .82 }`, or lay out `headings={false}` with the KPI strip first), and drop `overflow-y: auto`.
  - **The day:** use a Sunday morning sample from the engine (`python -m alyr.agent_samples`, never edited by hand). If none exists, retitle the beat "Any day, the home screen…" and state the time honestly. Do not show Thursday under a Sunday heading.
- **Screenshots:** `C:\t\demo\cur-en\07-sunday-b0.png`, `07-sunday-b1.png`; `C:\t\demo\crit-design\d-en-dark-1440\07-sunday-b0.png`; `C:\t\demo\cur-ar\07-sunday-b0.png`.

#### P1-14 · Scene 8 is a numbered list; beat 1 has two ideas
- **Where:** scene 8. Both languages.
- **What is wrong:**
  - Beat 0 is four numbered lines in big type: a slide.
  - Beat 1 squeezes the four steps into a small row above four question cards, so two ideas share the screen.
- **Fix:**
  - **Beat 0:** draw the four steps on one solid horizontal rule, with a 45° tick per step and under each step a fragment of the real thing: the check-up (the booked day from scene 9's chips), setup (`/start`'s checklist), go live (the test line chat), every month (the Agent home's week).
  - **Beat 1:** the four questions alone, full width, and the steps gone.
- **Screenshots:** `C:\t\demo\cur-en\08-how-b0.png`, `08-how-b1.png`.

## P2: polish

- **Pain cards** (scene 2 b2, both languages):
  - The untapped mark is a dashed hollow circle (`.dm-pain-n { border: 1px dashed }`). Dashed means "coming" in this brand. Use a solid hairline square: `border: 1px solid var(--line-strong); border-radius: 0`.
  - The tapped card is see-through. `--volt-wash` is 18% alpha, so the grid's column lines show through the card (`C:\t\demo\cur-en\02-money-b2.png`). Add an opaque token (`--volt-tint`, both themes) or set `background-color: var(--surface)` under `box-shadow: inset 0 0 0 100vmax var(--volt-wash), inset 0 0 0 1px var(--text)`.
- **Line breaks written in copy:**
  - "Noor 7": its "7" lands alone on a line in the phone (scene 3, b0 to b1).
  - "11 من 12" breaks (`C:\t\demo\cur-ar\05-system-b6.png`).
  - "4–10 Oct" breaks in the report caption (scene 7 b0).
  - Use `\u00a0` in `copy.ts`.
- **Paid arrives after its headline:** the stage line says "A pay link. Paid." at once, while the `.dm-paid` stamp comes 1.69 s later (`animation-delay: calc(3 * var(--play-4))`). Show "A pay link." first and add "Paid." with the stamp, or cut the delay to `--play-4`.
- **The phone's screen swaps instantly** (chat → order page → payment → chat) in scene 3. Key the phone's content by screen and cut each new screen in with the 45° `dm-cut` inside `.dm-phone-screen`, as a page opening on a phone.
- **Going back:** the wipe always comes from the top inline-end corner. Going back should come from the bottom inline-start corner (`dm-wipe-back`), so ← reads as reverse.
- **Scene 4's own progress bar** (`.dm-pains-rail`) is a third progress indicator under the progress line and the rail's beat squares. Remove it; the rail's squares already count the beats.
- **Scene 1's clock:** Volt as the colour of "11:47 pm" on Carbon is decoration, because nothing is true or done yet. Use `--on-band` and keep Volt for the moments that earn it. If the founder likes it, it is at most "one strategic signal", and then nothing else in scene 1 may be Volt.
- **Dark mode:**
  - The phone frame (`--phone-frame` #050505 on `--canvas` #0e1012, 1.08:1; outline `--phone-outline` about 1.8:1) almost disappears (`C:\t\demo\crit-design\d-en-dark-1440\03-order-b4.png`). Step `--phone-outline` up the ramp in dark to 3:1 against the canvas.
  - axe found nothing serious, critical or moderate in dark on scenes 1, 3, 7 and 9, in either language.
- **Arabic monogram:** «م» comes from «مخبز» (the word "bakery"), so every Arabic bakery would get the same mark. Take the initial from the name after the trade word (قرفة → «ق»), or keep the Latin initials.
- **Scene 9 day picker:** six chips wrap five plus one, and Friday is offered first. Lay them out three by two (`grid-template-columns: repeat(3, minmax(0, 1fr))`). Ask the founder whether Friday belongs in the list.
- **Notes:** "WHAT YOU SAY" in capitals on a Carbon block over the stage's lower inline-start corner is readable by the owner sitting beside the founder. Make it a slim strip under the rail in `--fs-note`, with no heading, the time first.
- **Focus:** the focus ring is visible everywhere I tabbed (`C:\t\demo\crit-design\probe-focus-rail-light.png`, `probe-focus-scene-light.png`, `probe-focus-s9-dark.png`, `probe-menu-light.png`). On the notched Volt button the ring's rectangle crosses the notch. Give `.dm-btn:focus-visible` an `outline-offset` of `--focus-offset-control` plus 2 px, or a notched `::before` ring.
- **Shadows:** `--window-shadow` and `--shadow-float` under the Orders window, the invoice and the Agent home make them read as floating cards over the grid. The brand asks for rules and whitespace before cards. Drop the shadow on drawings that sit on the grid and keep it for the menu and notes.
- **Scene 2 stepper labels:** "Messages a day" and the others are `--fs-small` in muted grey, too small at arm's length. Use `--stage-lead`.

## What holds up

- **Honesty by label:**
  - Built, Set up by ALYR, Sample, Sample week, Your estimate and Not built yet each have their own shape, and none is Volt.
  - "Card payments go live with your own payment provider." and "The first reports go out once WhatsApp approves the report's wording." sit beside their figures.
  - No AI words, no prices, no logos, no invented statistics.
- **Volt discipline:**
  - One Volt button per view (Start the demo, Book your check-up). The rail's Next is an outline.
  - Volt is otherwise used only for confirmed progress (the progress line, the twelfth cell), the current state (the new order row, the lit station, Ready for collection, the menu's current scene, the picked day) and one signal (the busiest day on the report).
- **Arabic parity is real:**
  - The whole stage mirrors.
  - The 45° cuts and notches are mirrored (`.dm[dir="rtl"]` `clip-path` overrides), as are the wire, the order token's notch, and the inset bar on new rows.
  - The report's days run right to left.
  - Western digits, «ر.ق» after the amount, Plex Arabic with no tracking or capitals, and the draft mark in the rail.
  - The on-screen arrows flip while → stays "next", which is right for a clicker.
- **The engine:**
  - The keys, the scene menu (a real `dialog` with keys listed and times), the notes with target and elapsed time, R, L and D.
  - Reduced motion shows end states.
  - Arrivals along 45° (`dm-arrive`: `--travel × --dir`) on `--play-*` with stagger.
  - Beats settle in 0.75 to 1.2 s, which is the right pace for a presenter.
- **Content craft:**
  - The scene 3 story (11:52 pm, 11 of 12, Khalid gets Saturday) is exactly the founder's real scenario.
  - The invoice in Arabic and English, the café's account bar and the report card redrawn with the owner's own name are strong pieces.
  - The tapped pains numbered in order and returned in scene 9 is a good closing touch.

## The five changes that would lift it most

1. **Make the fold visible** (P1-1, P1-2). Exact legs, a 1.1 s in-out sweep, the old scene settling under it, parts arriving behind the edge, and the before → after closing the pain's own figure. This one change turns "slides" into "a product moving".
2. **Open on a drawn phone** (P1-4). Scene 1 as one composition: their name and 11:47 pm beside a WhatsApp chat list where fourteen chats land one by one. That is the ten-second hook.
3. **Replace every text-only or bullet beat with a drawing** (P1-5, P1-10, P1-14, P1-6): the before figures in scene 4, the team and product switches for "it grows", the steps on a rule with real fragments, scaled stills for the recaps. After this pass, no beat is "a line of type and nothing".
4. **Rebuild scene 5 around real screens** (P1-8, P1-9). Product fragments lighting along the wire, and the seven islands travelling along 45° into the workspace shell's sidebar, with Mariam's record in the main pane.
5. **Lock the stage and make it fit** (P0-1, P0-2, P1-3, P1-11, P1-13):
   - fixed grid tracks and top-aligned scenes, so nothing jumps on Next;
   - the cake builder that scrolls itself;
   - the capacity meter as scene 3's big figure;
   - scene 7 fitted without a scroller.
   Then check at 1440 × 900, 1280 × 800 and 1024 × 768 in both languages.

## Not checked

- Motion as seen at 60 fps on the real laptop. Edge ran headless with `--disable-gpu`; I measured timing from `getAnimations()` and sampled `clip-path`, I did not watch frames.
- A real presenter clicker and a touchscreen tap on the pain cards and the cake.
- Offline, the service worker and the noindex. They are not design, and the other critic or the build checks own them.
- Arabic wording quality. That is ALY-66's native reviewer; I only checked layout, mirroring, digits and breaks.
- Dark mode for scenes 2, 4, 5, 6 and 8 (captured in `C:\t\demo\crit-design\d-en-dark-1440\` and `d-ar-dark-1440\`, but not all reviewed beat by beat).
- Light-theme axe: I ran axe only in dark on scenes 1, 3, 7 and 9.
- Phone widths. They are not in this demo's scope.
- Hover states, and the setup panel's colour choices other than cocoa.
