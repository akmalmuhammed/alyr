# Motion

One signature gesture: things arrive along the logo's 45° diagonal, settle, and one Volt
signal confirms them, once. Each move says something; none is there for its own sake.

## Tokens

Durations, eases, stagger and travel come from the motion tokens (`design/tokens.json`,
[tokens.md](tokens.md)). Two scales:
- **The interaction scale**, for what the visitor does (hovers, presses, menus, the theme
  switch, the accordion, the product screens): `--dur-1` to `--dur-4` and `--stagger`.
- **The pace**, for every timed piece (the flows, the demos, the signature figures, the products
  frame's tiles, the business day's fold, the X-ray, the reveals, the heading splits, the
  closing call's fold): `--play-1` to `--play-4` and `--play-stagger` (0.6 of the interaction
  scale), and a step's dwell from `--read-word`, `--dwell-beat` and `--dwell-min`. Each is
  multiplied by **`--pace`** (`motion.pace.pace`, 1 since 25 Oct 2026), the one value the
  founder tunes: 0.8 is 20% quicker, 1.25 is 25% slower.

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
- The hero's entrance and its figure (AgentFigure and the feed) were left on the interaction
  scale on 25 Oct 2026 while the figure is rebuilt; bring them onto the pace with it.
- Measure before and after with the capture script's `--eval` (no screenshots): every
  animation a piece starts, from `document.getAnimations()`, and each step's dwell from its
  progress bar: `node scripts/site/pace-probe.mjs <url> flow demo sig tiles …` against the built
  site (`docs/framer-review/07-pace-log.md` has the before and after of 25 Oct 2026).

## Rules

1. **Plays once.** An arrival plays the first time it is seen, never again on scroll back,
   never on a poll or a data refresh. No infinite animation: no pulsing dots, no breathing
   rings, no marquee. A status dot lights once, with one ring. Allowed to keep moving:
   explanatory figures that play only while on screen, can be paused and stay still with
   reduced motion (the `/chat` demo and how-it-works flow), and what follows the scroll
   (the two progress rules). A moment may wait for the visitor where there is a fine pointer
   (the homepage's product tiles play on hover or focus, and in view on a phone): it still
   plays once, and **while it waits it rests finished**, as every demo opens (founder,
   25 Oct 2026); its trigger replays it from its start (each animation fills backwards, so
   its first frame is the earlier state) and it ends finished again.
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
9. Total motion over 5 s that starts by itself needs a pause control; otherwise end sooner.

## The stack (site)

CSS for the first screen's entrance (it runs before hydration), hovers, presses, springs
and one-shot arrivals keyed on `.is-in` from one IntersectionObserver. GSAP (ScrollTrigger,
SplitText; exact versions in `apps/web/package.json`) loads after the window's load event,
only when motion is wanted, for line splits and the scrubbed rules. Cross-document View
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
