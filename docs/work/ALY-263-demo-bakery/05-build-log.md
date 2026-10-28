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
