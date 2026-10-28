# Motion

One signature gesture: things arrive along the logo's 45° diagonal, settle, and one Volt
signal confirms them. Each move says something; none is there for its own sake. Since 26 Oct
2026 the site's figures keep playing that gesture (rule 1, "Always on"); text still arrives
once.

## Tokens

Durations, eases, stagger and travel come from the motion tokens (`design/tokens.json`,
[tokens.md](tokens.md)). Two scales:
- **The interaction scale**, for what the visitor does (hovers, presses, menus, the theme
  switch, the accordion, the product screens): `--dur-1` to `--dur-4` and `--stagger`.
- **The pace**, for every timed piece (the flows, the demos, the signature figures, the products
  frame's tiles, the business day's fold, the X-ray, the reveals, the heading splits, the
  closing call's fold): `--play-1` to `--play-4` and `--play-stagger` (0.6 of the interaction
  scale), and a step's dwell from `--read-word`, `--dwell-beat` and `--dwell-min`. Each is
  multiplied by **`--pace`** (`motion.pace.pace`: 1 on 25 Oct 2026, 1.3 since 26 Oct, when
  the founder found it too fast), the one value the founder tunes: 0.8 is 20% quicker, 1.25 is
  25% slower. The live Agent figure's beat is paced too (`--live-beat`, `--live-beat-phone`;
  `PLAY.beat` in `pace.ts`).

Then `--ease` for things arriving (GSAP's `expo.out` is the same curve); `--spring` (a
`linear()` spring) for things the visitor presses; `--travel` along 45° with `--dir` (−1 in
Arabic). Never a literal duration or curve. Old names to retire as you touch them, never to use in new code: `--fast`, `--medium`,
`--slow` (the site's older scale) and `--ease-product`, `--spring-product` (the product's
curves, which the workspace's `.sh` still calls `--ease` and `--spring`).

## The pace (founder, 25 Oct 2026: the timed pieces were too slow)

- **A timed piece never writes a duration.** In CSS: `--play-*` for each move, every delay a
  number of `--play-stagger` beats (`calc(6 * var(--play-stagger))`), a long move a multiple of a
  token (`calc(2 * var(--play-4))`). In a script: `PLAY` from `_site/pace.ts` (already
  multiplied by the pace when the tokens are generated). `scripts/site/pace-check.mjs` (in
  `pnpm site:check`) fails on a literal; a reviewed exception goes in
  `scripts/site/allow/pace.json` with its reason.
- **A step dwells for its words.** A flow's step or a demo's tab stays up while its words are
  read at 230 words a minute (`--read-word`), then `--dwell-beat`, never less than
  `--dwell-min` (1.2 s, which the pace does not shorten). The component sets `--words` on its
  progress bar (`words()` in `pace.ts`); the CSS does the sum, so `--pace` reaches it. A flow
  counts its step's title and the work lines it ticks; the paragraph under the title is for a
  visitor who pauses or picks a step. A demo counts its caption, and waits for its last
  message or row (`--last`) if that comes later. Count the words of the language shown.
- **New timed pieces take the pace too:** the homepage's How we work, rebuilt after 25 Oct
  2026, uses `--play-*` and `--play-stagger`, not `--dur-*`. Hovers and presses stay on the
  interaction scale.
- The hero's entrance is on the pace since 28 Oct 2026 (the headline's lines `1.3 ×
  --play-4`, the lead, the check-up and the facts `--play-4`, delays in `--play-stagger`
  beats). The live figure's own moves on `/agent` (a row arriving, a figure rolling, the fade
  back to 16:20) are still on the interaction scale; its beat, one event every `--live-beat`,
  follows the pace (5.2 s, 6.5 s on a phone, at 1.3).
- Measure before and after with the capture script's `--eval` (no screenshots): every
  animation a piece starts, from `document.getAnimations()`, and each step's dwell from its
  progress bar: `node scripts/site/pace-probe.mjs <url> flow demo sig tiles …` against the built
  site (`docs/framer-review/07-pace-log.md` has the before and after of 25 Oct 2026).

## Rules

1. **Always on: figures keep playing; text arrives once** (the founder, 26 Oct 2026:
   "animation is super fast now make it a bit slower, always it should be always on
   animations and motions"; D-059; it replaces "plays once" for figures). A figure that shows the
   product at work keeps playing while it is on screen, as the hero's live Agent figure does
   (below): the flows and demos (they cycle through their steps and tabs), the homepage's How
   we work cards, the products frame's six tiles and the product pages' signature figures
   (`_site/loops.ts`, "Figures that keep playing" below), and the homepage hero's film (D-062,
   "The hero film" below).
   **What stays one-shot:** text and sections arriving as they are read (`data-reveal`,
   `data-m`, the heading splits), the closing call's fold and mark, the business day's fold
   (`FoldSplit`: a control the visitor drags, with words to read on both sides; a timer moving
   it would fight the hand and wipe text from under the reader), `/chat`'s X-ray (it follows
   the reading line, so it moves whenever the reader does), a business tab's rows (the
   visitor's choice), and hovers and presses. Looping text would make the page unreadable.
   Never: pulsing dots, breathing rings, a marquee, a loop of a single element, a re-animation
   on a poll or a data refresh. A status dot lights once, with one ring.
   A figure **rests finished** before it is first seen (the HTML is its end state), plays as it
   comes into view, holds its finished state long enough to read what it brought, and plays
   again. A hover, focus or press on a resting card or tile still replays it at once.
2. **Reduced motion shows end states.** Under `prefers-reduced-motion: reduce` nothing
   travels and nothing plays by itself; every figure is composed, every count at its final
   value. Check with the capture script's `--reduced-motion`.
3. **Nothing hidden in the HTML.** A script in `<head>` adds `motion` before the first paint
   only when motion is wanted. Start states exist only under `.motion`. A failsafe removes
   the class if the page never hydrates (4 s before hydration, 10 s after, cleared once the
   choreography starts). Without scripts every section is complete and readable.
4. **Static HTML carries the start value of a count,** so it only ever counts up.
5. **Animate only** `transform`, `opacity`, `clip-path`, `translate` and font variation.
   Never layout properties. The largest text on the first screen never fades from 0 (it
   delays LCP): it may rise, not fade.
6. **Hover movement is 1 to 2 px.** The main button leans 2 to 3 px toward a fine pointer.
   No custom cursors, no tilting figures, no parallax, no scroll-jacking, no smooth-scroll
   library, no WebGL, no loaders.
7. **Text splits by line or word, never by character, and never in Arabic.** Screen readers
   get whole sentences (`aria: "auto"`).
8. **Every diagonal mirrors in Arabic** (`--dir`, and the `[dir="rtl"]` clip-path).
9. Total motion over 5 s that starts by itself needs a pause control (WCAG 2.2.2): one per
   looping figure or section, never one per tile.

## Figures that keep playing (founder, 26 Oct 2026)

The How we work cards (`HowCards.tsx`), the products frame (`SuiteFrame.tsx`) and the
signature figures (`LastOne.tsx`, `PaymentPaper.tsx`) loop on one mechanism, `_site/loops.ts`,
with their cycle's CSS in `_site/loopStyle.ts`. A new looping figure joins it; it does not
write its own timers.

1. **The cycle is CSS, on the pace.** A group (`data-loop`) holds players (`data-loop-play`),
   played by adding `is-in`: each animation fills backwards, so its first frame is the earlier
   state, and ends on the finished one. Each player says where its scene ends (`--hw-end`,
   `--sf-end`, `--sig-end`, in beats and `--play-*`) and how many words its scene brings
   (`--words`, from `words()` in `pace.ts`); the finished state holds for
   `max(--dwell-min, words × --read-word + --dwell-beat)`, then one element fades out
   (`loop-out`). When that fade ends, loops.ts winds every CSS animation of the player back to
   its start (`currentTime = 0`) and it fades back in (`loop-in`). Count the words of the
   result a scene comes to, not every line in it: a hold of ten seconds reads as stopped.
   The products frame adds 8 beats a tile so the six never fade together; the cards differ by
   their own lengths. **Restart by winding back, not by taking `is-in` off and on:** inside a
   size container Chrome does not restyle the subtree on a forced layout, and an animation
   whose name stays in the list carries on where it was (it cost the first build its second
   cycle). Chrome can also send a second `animationend` once the fade is wound back: act only
   on a fade that has really finished.
2. **A Pause control per figure or section** (`LoopToggle.tsx`): the word "Pause" / «إيقاف»
   (and "Play" / «تشغيل») with the demo's icon, its full name from `copy.ts` (`loop.names`),
   starting with that word. It is `hidden` in the HTML and placed out of the flow over room
   the figure keeps for it (the frame's bar keeps 5 rem at its end), so it never moves
   anything; loops.ts shows it once the figure plays. Pause finishes every move at once and
   holds the finished state (`data-paused`); Play plays every player from its start. Per
   section, not one site-wide control, because the hero, the flows and the demos already
   carry their own where a visitor looks, and a site-wide one would need a new control in
   every page's header.
3. **It stops when nobody is watching:** a group off screen (an IntersectionObserver) or in a
   hidden tab (`visibilitychange`) has its running animations paused where they are and
   carried on when it is back. The flows and demos stop in a hidden tab too.
4. **The numbers stay true each cycle:** a scene only ever plays from its earlier state to
   the HTML's finished state, both drawn from the engine's sample, so every cycle shows the
   same true numbers.
5. **Reduced motion and no scripts:** nothing is watched or played; every figure is the
   finished HTML, and there is no Pause control.
6. **Nothing for the first paint.** The cycle's CSS goes into the page from loops.ts, not into
   a stylesheet or the HTML: on 26 Oct 2026 about 2.6 KB more HTML (the same CSS inline, with
   React's copy of it) moved `/`'s simulated LCP from 2.42 s to 2.52 s; injected, it moved
   nothing.

## The hero film (D-062, the founder, 28 Oct 2026)

The homepage hero is a film of one afternoon at Qirfa Bakery in the product's own screens
(`HeroFilm.tsx`, `FilmCanvas.tsx`, `FilmDash.tsx`, `filmScript.ts`, `film.ts`, `film.css`,
`filmStyle.ts`; words in `copyFilm.ts`). It is the one timed piece that is a film, not a
cycle of play, hold and fade, so it has its own small controller, `film.ts`; the rules are the
same as the figures above.

1. **One clock, CSS only.** Every moving part has one keyframe track (`filmScript.ts`
   `tracks()`), all of them `calc(64 * var(--play-4))` long and infinite, so `--pace` scales
   the whole film. Times are written as seconds at the pace it was timed at (1.3) and become
   fractions of the loop; arrivals take `--play-*` and the `--ease` curve from the tokens. The
   camera (translate and scale of one canvas) and the closing fold (a `clip-path` on a
   stage-sized cover, never a box that reaches past the plate: axe read one as the header's
   background) are sampled into keyframes. Transform, opacity and clip-path only.
2. **The HTML is the still and the first frame.** The server draws only the plate, its bar
   and the last shot (the real ALYR Agent home at 16:20, `ruleLines={false}`) under its
   caption: that is the first paint, the page without scripts, and the page with reduced
   motion. Every track starts at that moment (`--hf-at`), so starting is seamless.
3. **The rest of the canvas is drawn after load, unseen.** `FilmScenes` loads `FilmCanvas`
   (and the words in `copyFilm.ts`) in its own chunk when `film.ts` asks, half a live beat
   after the page settles; its windows wait under `content-visibility: hidden` until they
   start. Its parts start in two frames (what the still shows first) and are then set to the
   camera's time. Reasons, measured: the canvas in the HTML grew the payload past a round
   trip in Lighthouse's model (+0.15 s LCP on `/ar`); and the canvas goes in as one commit, so
   the page re-styles once. (Every DOM insertion used to re-style the whole page: the cause was
   a `:not()` inside the Agent figure's `:has()` rules, not the `:root:has(...)` ones; rewritten
   on 28 Oct 2026, and `scripts/site/has-check.mjs` in `pnpm site:check` keeps it out.)
4. **Pause holds the frame,** as a film does (the figures above finish their moves instead);
   off screen and in a hidden tab every track is paused where it is. The last shot's numbers
   are the dashboard's own: `film.ts` tells `FilmDash` when the film reaches 16:20 (it rolls,
   one Volt rule under the count that went up) and when it goes back to 16:19 under the fold.
5. **Volt** only on the event happening now, at most two at once; captions are mono words on a
   hairline ending in a tick, one at a time; Arabic captions arrive as one block.

## The live Agent figure (`/agent`; the homepage hero until 28 Oct 2026)

The ALYR Agent figure with its "ALYR · Running" feed (`/agent`'s opening; the homepage hero
until D-062 replaced it with the film; `_site/AgentFigure.tsx`, `_site/live.ts`) **moves
continuously**, as the workspace does (the founder, 25 Oct 2026, D-058). It was the first thing on the site allowed to; since 26 Oct 2026 the figures above
keep playing too (rule 1), on their own conditions.

1. **A pause control** (WCAG 2.2.2): a small, quiet button beside the status chip, its
   accessible name in `copy.ts` in both languages (`agent.pause`, `agent.play`). Drawn from
   the first paint so it never moves the row; shown only while the sample moves.
2. **It stops when it should not run:** when the figure leaves the screen (an
   IntersectionObserver), when the tab is hidden (`visibilitychange`), and with reduced
   motion, chosen or changed while on the page. Reduced motion shows the settled picture.
   Without scripts the HTML is the full settled state; motion starts only after the load
   event, so the first paint is that state too.
3. **Calm pacing:** one event every `--live-beat` (4 s at pace 1, 5.2 s at the pace of 26 Oct
   2026), `--live-beat-phone` on a phone (5 s at pace 1, 6.5 s), where the motion stays
   lighter. Volt only on what just became true (one rule under a count that went up), fading
   back after. No flashing, no pulse, no loop of a single element.
4. **Transforms and opacity only, CLS 0:** the feed's settled list keeps its place (unseen,
   still read by screen readers) and the live rows are placed over it with `translate`; a
   changed figure rolls inside its own inline box (tabular digits keep the width; a word
   holding a figure stays unbroken); a bar grows by `scale`; the summary keeps the height of
   its longest sentence (`summaryRoom`). Measure layout shifts over a whole cycle, both
   languages, 1440 and 390. Its styles are inline in the head (`_site/liveStyle.ts`), not in
   `agent.css` or `agentfig.css`: those block rendering, and a couple of hundred bytes more in
   them cost the homepage about 150 ms of simulated LCP.
5. **Every event is one the product performs**, in its own words, and **the numbers stay
   true to each other**: `live.ts` works the dashboard out from the engine's sample (counts,
   sales and today's bar, the percentages as `view.py` rounds them, waits, the clock, booked
   days), and the summary sentence always matches the numbers. Payment reminders are not
   automatic, so the script never sends one: an overdue balance is "Needs a look".
6. **The cycle ends without a jump:** what changed fades out, the opening (16:20) takes its
   place unseen, fades in, and the script starts again. The "Sample" mark stays throughout.

## The stack (site)

CSS for the first screen's entrance (it runs before hydration), hovers, presses, springs
and one-shot arrivals keyed on `.is-in` from one IntersectionObserver. GSAP (SplitText;
exact versions in `apps/web/package.json`) loads after the window's load event, only when
motion is wanted, for line splits; the homepage's How we work rail and its ScrollTrigger are
gone (ALY-226). Cross-document View
Transitions keep the header still between pages; the theme switch sweeps along 45° from its
own corner. Clean up every ScrollTrigger on unmount (`useGSAP`).

## In product screens

The Agent's gesture, "the fold closes it": a card whose rule stops being true closes along
45° from the inline-end top corner (short duration, the arrival ease), "Done for you" gains a
count with one Volt tick. On first load the numbers and bars rise along 45° with the
stagger, once a session. Nothing else moves. A poll never re-animates.

## Budgets (site, Lighthouse mobile on the built site behind compression)

Performance at least 90, Accessibility 100, CLS under 0.05, LCP under 2.5 s, and under
70 KB gzipped of JavaScript added by motion. Put the numbers in the PR.
