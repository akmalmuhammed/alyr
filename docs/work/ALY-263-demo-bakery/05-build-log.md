# ALY-263 · Build log: the bakery sales demo

Worktree `D:\alyr-demo`, branch `aly-demo-bakery` (from main 53da141). Preview `ALYR_DIST_DIR=.next-demo next dev -p 3117`; Edge profiles `C:\t\demoprof-96NN`; captures by a walk script over `scripts/browser-kit.mjs` (kept outside the repo, `C:\t\demo\tools\walk.mjs`), which drives the demo with the keyboard only, beat by beat, and runs axe on every beat.

## Stage 1 · brief and tokens (dd68127)

`00-founder-decisions.md`, `01-research.md` (no research agent; patterns from practice, said so), `02-truth.md`, `04-brief.md`. Tokens: `component.shop` (six shop colours: cocoa, terracotta, rose, saffron, teal, plum; white text 4.5:1 or better on each; the shop's own marks only) and `font.size.stage` (hero, title, figure, lead). Generated files rebuilt.

## Stage 2 · the engine and the nine scenes

Files, all new under `apps/web/app/(product)/demo/bakery/`: `page.tsx` (noindex, light before paint), `DemoClient.tsx` (client only), `Demo.tsx` (the stage, keys, rail, progress, menu, notes), `logic.ts` (scenes, beats, stepping, the estimate, money), `copy.ts` (every word, English and Arabic), `ctx.ts`, `parts.tsx` (labels, monogram, phone, chat, window, QR), `SceneOpen.tsx` (setup, 1, 2, 8, 9), `SceneOrder.tsx` (3), `ScenePains.tsx` (4), `SceneSystem.tsx` (5, 6, 7), `demo.css`, `offline.ts`, `logic.test.mjs`; the service worker `demo/bakery-sw.js/route.ts`. Outside the folder: fifteen icons added to `_site/brand.tsx`'s one icon set (close, notes, sun, moon, pin, star, phone, directions, qr, notebook, sheet, calculator, delivery, receipt, bank).

41 beats with three pains tapped. Every scene reached with the right arrow alone; Page Up/Down, arrows and space step; M, N, L, D, R, Home and End work.

### Decisions taken while building, and why

- **The name "Noor 7" travels in the chat,** not as a field on the order page: the order page has no free-text line for an item (`02-truth.md`). The kitchen list shows it as "“Noor 7”, from the chat". Open for the founder.
- **"Thursday's list" is marked Sample, not Built:** there is no per-day list by item in the product. Open for the founder.
- **The café's debt is 64 days, not 38,** so the reminder's firmer wording is the product's own (`reminder_tier`: firm from 60 days). The headline says "One press sends it", not "The account does": reminders are sent on a press.
- **Product words on the phones:** "Here is our order page. Pick what you need:", "We received QAR 160 for order 1043. Thank you.", "Order #1043 is ready for collection.", "Order ahead: next available Sat", the back-in-stock and reminder templates, word for word.
- **No rule lines** (the owner is new to ALYR, as on the public site): the Agent home passes `ruleLines={false}` and the report's rule line is dropped.
- **The report card is redrawn in HTML** from the engine's captured card data, so it carries the owner's bakery name; the PNG cards say Qirfa Bakery.
- **Arrows do not flip in Arabic:** → is always next, as on a clicker; the on-screen arrows mirror.
- **Labels** (`dm-label`): Built a solid square, Set up by ALYR the fold's triangle, Sample and Sample week a hollow square, Your estimate a hollow circle, Not built yet dashed with the pending dot. No Volt in a label.
- **Light by default,** whatever the laptop says, under its own key `alyr-demo-theme`; D switches.
- **Offline:** network first for everything the page asks for, the cache only when the network fails, so it never shows a stale page online; the page asks the worker to keep every file it loaded and loads every font face first (the Arabic face too).

### Checks so far

- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (90 pass, 10 of them the demo's), `node scripts/design-check.mjs` clean.
- axe on every beat, English dark and Arabic light at 1440: no serious or critical after the fixes (nested controls in the phone, landmarks).
- 1440 × 900 English and Arabic, 1280 × 800, 1024 × 768 Arabic: no sideways scroll; the "overflow" the probe lists is content clipped inside the phones, the chat list and the Agent window, on purpose.

### Next

The two critics, rulings, the fix pass.

## Stage 3 · critics (73932b2) and the fix pass

Critiques `06-critique-design.md` (2 P0, 14 P1) and `07-critique-copy.md` (2 P0, 12 P1, 31 P2); rulings `08-rulings.md`. Applied as ruled:

- **Copy and claims:** the customers' messages carry an order word, so "Here is our order page" is what the product would send (copy P0-1); "in Thursday's orders", and the list by item labelled **Not built yet** with its note (copy P0-2); "Wednesday night, Eid week." and "Today · Thu" on the morning beat; Friday "Closed"; café reminders "Send reminders" with their condition; "Sunday's report tells you" with the report's condition; no "now" on the invoice; scene 5's closing line split into what is always true and what happens on credit; "who can change what"; Google lines without a ranking promise, with the Order button's and the review request's conditions; the founder's scene 9 note ("a bakery on ALYR"); Mahbash Café and Ghaf House Offices replace Tamr Café and Crescent Tower Offices (names register updated in `alyr-design/honesty.md`); the product's tracking words; «نفد», «عند توفره», the Arabic grammar and register fixes; clocks and "Noor 7" with no-break spaces; the invoice's money in the page's language; the sample numbers in "One set of numbers" from the Agent sample.
- **Design and motion:** the fold's legs now reach the stage's width plus height and run `2 × --play-4` on a new token `--ease-fold` (`motion.ease.fold`, an even sweep in and out): measured with motion on, the 45° edge crosses the stage from about 0.3 s to 0.8 s of a 1.1 s run, where it used to finish in 0.1 s; the old scene settles toward the bottom inline-start corner; going back folds from the bottom inline-start corner; parts arrive after the edge (`--lag`). Scene 4's before is the pain's own chats on a drawn phone beside the quote, kept under the after and closed along 45°. Scene 1 opens on a drawn phone (the lock screen at 11:47, then the chat list in WhatsApp's own colours, a hard crop, no mask). Scene 2 is top-aligned and keeps the estimate's place from beat 0, the formula replaces the title when open. Scene 3: fixed columns, the order page's next choice scrolls into view after each tap (checked by tapping at 1440, 1280 and 1024: every group visible when tapped, Pay ready), the daily limit is its own panel with the count large, one Sample mark for the scene, the condition line in the foot. Scene 5: a drawn fragment under each product, lit in turn; the after is a workspace window with the six products in a sidebar and the Sample mark in its bar; "It grows with you" keeps three built rows (the second branch moved to the notes; the monthly review stays in scene 8). Scene 6: two phones (the map and the customer's chat at 5:10 pm), then the counter card with the bio link. Scene 7: the phone fits, the mini card in the bubble drops its facts row, the Agent home scaled to fit (`zoom: .74`) and titled "Any day". Scene 8: the steps on one rule with a 45° tick each, the questions alone on beat 1. P2s: solid pain marks, opaque tapped cards, scene 4's own progress bar removed, the Arabic monogram skips the trade word (قرفة gives «ق»), days three by two, slimmer notes, the focus ring clear of the notch, no window shadows on the grid, larger stepper labels, chat times at 4.5:1.

### Not applied, and why

- Islands travelling into the sidebar (design P1-9) and real product tiles from the homepage (P1-8): one more motion system for little gain; the homepage's tiles belong to the site's CSS.
- A dark-mode step for `--phone-outline`: a shared token, so it would change the site's phones too; for the site and product lanes.
- A dated "next available" (copy P2-1): it would need a real Eid date; the founder's line says Saturday.
- "a month you never saw" (copy P2-10): the founder's line.
- Arabic term questions (copy P2-23 to 25: «مبنيّ», «الكاونتر», Google and Excel in Latin): for the native reviewer, ALY-66.

### Checks run on the fix pass

- `pnpm exec tsc --noEmit`, `pnpm lint` (0 errors), `pnpm test` (90 pass), `node scripts/design-check.mjs` (clean), `node scripts/tokens-build.mjs --check` (up to date).
- Keyboard walk of all 41 beats with axe on every beat: English light, Arabic light and English dark at 1440 × 900: no serious or critical issues (none at all after the landmark fix).
- Fit at 1280 × 800 (English) and 1024 × 768 (both): no sideways scroll; what the probe lists is content cropped inside the phones, the chat list, the Agent window and, at 1024, scene 3's work column, which scrolls.
- Offline, on a production build (`next build` into `.next-demoprod`, `next start -p 3118`): loaded once, the server stopped, the page reloaded and stepped twelve beats and switched to Arabic with all 27 font faces loaded. Under `next dev` the reload shows only the boot frame: offline needs a production build (or the hosted app).
- Timing: 41 beats with three pains tapped; the founder's notes at 140 words a minute plus six seconds a beat and the owner's taps come to about 8 minutes of scripted talk, so 15 minutes leaves about 7 for the owner's questions. Scene 5 (10 beats) needs about 80 s against its 60 s slot in the script.
