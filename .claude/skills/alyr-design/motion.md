# Motion

One signature gesture: things arrive along the logo's 45° diagonal, settle, and one Volt
signal confirms them, once. Each move says something; none is there for its own sake.

## Tokens

Durations, eases, stagger and travel come from the motion tokens (`design/tokens.json`,
[tokens.md](tokens.md)): `--dur-1` to `--dur-4`; `--ease` for things arriving (GSAP's
`expo.out` is the same curve); `--spring` (a `linear()` spring) for things the visitor presses;
`--stagger`; `--travel` along 45° with `--dir` (−1 in Arabic). Never a literal duration or
curve. Old names to retire as you touch them, never to use in new code: `--fast`, `--medium`,
`--slow` (the site's older scale) and `--ease-product`, `--spring-product` (the product's
curves, which the workspace's `.sh` still calls `--ease` and `--spring`).

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
