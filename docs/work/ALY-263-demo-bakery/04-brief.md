# ALY-263 · Brief: the bakery sales demo at /demo/bakery

**Order of authority:** `CLAUDE.md` hard rules; `00-founder-decisions.md`; this brief; `02-truth.md` (what may be claimed); `docs/sales/demo-bakery.md` (the script); `01-research.md`; the skills `alyr-design` and `alyr-product-screen`.

## Scope

- **New:** `apps/web/app/(product)/demo/bakery/` (the page, the scene engine, nine scenes, its copy file in English and Arabic, its stylesheet, its pure logic and tests), `apps/web/app/(product)/demo/bakery-sw.js/route.ts` (the service worker, scope `/demo/bakery` only).
- **Tokens:** `design/tokens.json` gains `component.shop` (six shop colours, the shop's own marks only) and `font.size.stage` (four stage sizes for a laptop at arm's length). Generated files rebuilt.
- **Reused, unchanged:** `_agent/AgentDashboard.tsx` in showcase mode with `samples/bakery.{en,ar}.json`, `ruleLines={false}`, `headings={false}`; the report samples `samples/report/bakery.{en,ar}.json` (the card redrawn in HTML so it carries the owner's bakery name); `qrcode-generator` (already a dependency).
- **Must look as before:** every other route. The service worker controls only `/demo/bakery`; nothing in the public site links to it; the product layout's `noindex` applies.

## The stage

- One full-viewport stage, no page scroll at 1440 × 900, 1280 × 800 and 1024 × 768. A thin rail on top: the slim progress line (nine segments; Volt is confirmed progress), the scene's number and name in mono, and quiet controls at the end (Scenes, Notes, language, theme, Back, Next as outlines).
- Light first (`data-theme="light"` set before paint, the demo's own choice stored as `alyr-demo-theme`), dark from the tokens. Carbon for the command moments: scene 1, the islands' end in scene 5, scene 9.
- One idea per screen: a stage line in `--stage-hero` or `--stage-title`, one drawing at true scale. Mono labels on hairlines; a visible 12-column grid, faint.
- Transitions: the next scene cuts in along the fold's 45° diagonal (a `clip-path` from the inline-end top corner), mirrored in Arabic; parts arrive along 45° (`--travel`, `--dir`) on `--play-*`, `--ease`. Plays once per beat; reduced motion shows end states and cuts without travel.
- Labels: one small mono chip per figure (Built, Set up by ALYR, Sample, Sample week, Your estimate), plus a condition line where `02-truth.md` gives one.

## Scenes (beats)

1. **Their bakery** (2): name, "Thursday before Eid.", 11:47 pm; then "14 unread chats." with fourteen previews arriving.
2. **Where the money goes** (3): three steppers; the monthly line with "your estimate" and the formula with its share stepper on tap; the ten pain cards, each press numbered in order.
3. **The order that would have been lost** (7): phone and workspace side by side; 11:52 pm message; the order page reply; the owner builds the cake on the phone (size, flavour, message, day; the name is in the chat); pay link and Paid; the order lands, Thursday's list, 11 of 12; the twelfth; "Full for Thursday. Next free: Saturday."
4. **Your pains, solved** (2 per tapped pain, then the invoice): before in their words, cut away by the fold to the after with one live moment. Pains that belong to scenes 3, 6 and 7 say so and offer the jump.
5. **One order, the whole business** (9): #1043 through the six products in the suite's order, each lighting with what it did; seven islands; one workspace; it grows with you.
6. **Be found** (4): the map search with the Order button; the review request; the review; the QR card and bio link. Set up by ALYR.
7. **Your Sunday** (2): the report card on WhatsApp at Sunday 9:00 am; the Agent home. Sample week.
8. **How we work** (2): four steps; four objections, one tap each.
9. **Next step** (2): "Let's do your Thursday properly.", the QR (when the founder entered a link) and "Book your check-up" (the page's one Volt button); a day picked, and the pains tapped in scene 2 kept on screen.

Setup panel before scene 1: the bakery's name (English, and Arabic optional), the shop colour (six), the test line link; Start. R returns to it with the fields kept and the visit's taps cleared.

## Controls

→, ↓, Space, Page Down: next beat; ←, ↑, Page Up: back. Space and Enter press a focused control instead. Home: first scene. M or the Scenes button: the jump menu (a dialog; Escape closes, focus returns). N: notes (the "Says" lines, the target time from the script and the time since scene 1). R: restart. L: language. D: theme. Every scene reachable by keyboard alone.

## Do not

Any price; AI words; WhatsApp, Meta or Google logos or WhatsApp green outside the drawn chat; "keep your number"; a drawn button that cannot be pressed in Volt; count-ups, pulses, loops; text split into letters; Arabic tracked or in capitals; words in components; a colour, size or duration literal.

## Engineering

- Words in `copy.ts` (`T = {en, ar}`), checked by a test for parity and banned words. Logic (estimate, scene order, beat stepping) in `logic.ts`, tested with `node --test`.
- No API calls; everything is client-side. The service worker caches the page and every asset it loaded (network first, cache on failure), registered only from this page with scope `/demo/bakery`.
- Port 3117 for the preview, own `.next-demo` folder, Edge profile `C:\t\demoprof`.

## Checks

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `node scripts/design-check.mjs`; screenshots of every scene's last beat at 1440 × 900 in English and Arabic, light, and a dark sample; 1280 × 800 and 1024 × 768 probes for overflow; axe with no serious or critical issues on every scene; a keyboard-only run through every beat; offline: reload with the network off.

## Stages and commits

1 the brief and tokens; 2 the engine and scenes 1, 2, 9 and setup; 3 scenes 3 and 4; 4 scenes 5 to 8; 5 offline; 6 the critics, rulings and fix pass; then docs.
