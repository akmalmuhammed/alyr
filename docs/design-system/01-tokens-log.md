# ALYR design system, step 1: one source of tokens

ALY-126, branch `aly-design-system`. One entry per stage, newest last. The audit this builds on is `00-audit.md`; the decision is D-040 (Carbon and Volt, the founder, 17 Oct, ALY-61). The design skills are written in parallel (PR #66) and read `design/tokens.json`.

## Stage 1 · the token file (pushed first, commit 33598ae)

- **`design/tokens.json`**, DTCG-style (`$value`, `$type`, `$description`, `{group.token}` aliases, `$extensions`). Checked against the format's current published version, 2025.10, on 17 Oct. Where it departs on purpose (colours, dimensions and shadows as CSS strings; dark values and CSS names in `$extensions["qa.alyr"]`) is in `design/README.md`.
- **Three tiers.** Primitives (`color.brand`, `ink`, `grey`, `alpha`, `status`, `drawing`, `whatsapp`): every literal colour named once. Semantic (`semantic.*`), the API: canvas, surface, surface-subtle, text, text-muted, text-faint, text-inverse, line, line-strong, hair, hair-strong, focus, on-volt, volt-ink, volt-wash, pending, ok, warn, bad and their soft tints, each with its dark value. Component: band (Carbon blocks and the text ramp on them), window, theme-switch, chat (the drawn WhatsApp chat), drawing (product screens drawn on the site), agent, card, email, social.
- Then font (families, files, weights, the site's and the product's size scales, leading, tracking), space, layout, radius, border, cut, shadow, motion (durations, eases, travel), breakpoint, z and focus.
- **The grey ramp** absorbs the 13 near-blacks and the Carbon-block text ramp of the audit (1.2). Steps are named by CIELAB lightness × 10, so `grey-873` is L* 87.3 and a new step slots in without renaming. Steps only one drawing or the report card uses are marked "retire" in their descriptions.
- `design/README.md`: how to use it, the tiers, light and dark, the generated files, the check, the format.

## Stage 2 · the generator

- **`scripts/tokens-build.mjs`**, plain Node 22, no packages. Writes, each headed "generated, do not edit":
  - `apps/web/app/_tokens/tokens.css`: `:root` with the light values, `[dir="rtl"]` for `--dir`, then the dark values twice and identical (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`), as the site always had them. The "keep the two blocks identical" rule is now done by the script.
  - `apps/web/app/_tokens/tokens.ts`: every group as a typed constant, plus `dark` with every token that changes.
  - `apps/api/src/alyr/brand.py`: `COLOR`, `LIGHT`, `DARK`, `CARD`, `EMAIL`, `FONT`, `CSS_FONT`, `FONT_FILE`, `SIZE`. Committed, so the API's container needs nothing outside `apps/api`.
- `--check` regenerates in memory and fails if a committed file differs.
- It refuses a token file that breaks its own rules: a reference that does not resolve, a colour outside the primitives that is not a reference, a literal colour named twice, two tokens with one CSS name.
- CSS names are the ones the site already used (`--canvas`, `--text`, `--d-bg`, `--wa-head`, `--dur-1`, …), so the site's stylesheets needed no renaming. The brand primitives the site names directly (`--carbon`, `--volt`, `--concrete`, `--graphite`) are exposed; the grey ramp is not.
- Fonts: the first name of each stack is the face; on the web the generator writes the variable `next/font` sets for it (`--font-instrument`, `--font-plex-arabic`, `--font-plex-mono`).
- `scripts/build-site.sh` runs the generator before `next build`.

## Stage 3 · the consumers moved onto the tokens

**Public site and the Agent component** (no visible change intended; proof in stage 5).
- `_site/document.tsx` imports `_tokens/tokens.css` before `site.css`; `theme-color` comes from `tokens.ts`.
- `site.css`, `drawings.css`, `kit.css` and `home.css` lost their token blocks (light and both dark copies): about 300 lines of hand-kept values. The drawn screens' `--d-*`, the grid and the type and rhythm tokens now sit on `:root` instead of `main`, with the same values; nothing outside `main` read them.
- The untokenised greys on Carbon became named tokens: `--on-band` (#fff), `--on-band-soft` (#d5d9dd), `--on-band-quiet` (#c4c9cf), `--on-band-faint` (#8a9199), `--band-mark` (#6b7480), `--band-rule` (#555d65); also `--phone-frame`, `--phone-outline`, `--monogram-bg`, `--monogram-ink`, and `--font-chat` for the drawn WhatsApp chat's system face.
- `_agent/agent.css`: the `--ag-*` hooks default to the semantic tokens (`--ag-ink: var(--text)`, `--ag-ink-3: var(--text-faint)`, …); its two dark blocks are gone, and the bar and ghost mixes read `--agent-bar-mix` and `--agent-ghost-mix`, which change with the theme.
- `brand.tsx`, `socialCard.tsx`: Volt, Carbon, Concrete, the separator grey, the faces and the font files come from `tokens.ts`.

**Report card and emails.**
- `modules/agent/card.py`: `THEMES = brand.CARD`; the faces and font files from `brand.FONT` and `brand.FONT_FILE`.
- `core/mail.py`, `modules/report.py`: colours from `brand.EMAIL`, the stacks from `brand.CSS_FONT` (still Arial and Courier New: email clients do not load web fonts reliably, and the email skill decides any change).

**Workspace and product screens** (visible changes intended).
- `(product)/layout.tsx` imports the tokens first, names its `next/font` variables as the site does (`--font-instrument`, `--font-plex-arabic`, `--font-plex-mono`), and puts the stored choice (`alyr-theme`) on `<html>` as `data-theme` before the first paint, following a change made in another tab. `theme-color` follows the tokens.
- `globals.css`, `shell.css` (`.sh`), `customer.css` (`.cx`), `start.css` (`.ob`): their own light and dark blocks are gone. Each keeps its short names as aliases of tokens (`--ink: var(--text)`, `--sheet: var(--surface)`, `--raise: var(--surface-subtle)`, `--lift: var(--shadow-lift)`, …), so the rest of each file did not change.
- **The divergences fixed by token:** the workspace and onboarding canvas is Paper (was #eceee9); customer pages' background is Paper (was #f2f3ef). Dark surfaces are the site's: canvas #0e1012, sheet #15171a, raised #1b1e22 (were #0a0b0d, #131518, #1a1d21; the old screens' #191c1f and #202428 are no longer product surfaces). `--ink-3` is #8a918b (was #8a9096). Volt wash is .18 / .12 everywhere (was .18 to .20 / .10 to .12). The shadows are one pair (`--shadow-lift`, `--shadow-float`). Onboarding's `--danger` is `--bad`; its preview chat takes the site's WhatsApp colours (its light header was #f0f2f5); its Volt hover is `--volt-hover`, darker, not lighter. Text on Volt is `--on-volt` everywhere.
- `--ease` and `--spring` no longer mean two curves: the product's are `--ease-product` and `--spring-product` until it moves to the site's (a feel check, not a token change).
- **The type scale:** 255 fixed font sizes in the product stylesheets now read the token scale (`--ui-micro` 11 px to `--ui-display` 56 px); half pixels round up (12.5 to 13, 13.5 to 14), 17 to 18, 22 and 26 to 24, 30 to 28, 34 and 40 to 36. The five fluid `clamp()` headings are unchanged.
- TSX: the logo's Volt plane in the workspace, the console and the customer pages comes from `tokens.ts`; `/agent-sample`'s caption reads `--text-muted`, `--line` and the mono and Arabic tokens.

## Stage 4 · the drift check

- **`scripts/design-check.mjs`**, plain Node, run by CI (the `web` job, before lint) and `scripts/check.sh`. It fails when:
  1. a generated file is out of date (`tokens-build.mjs --check`);
  2. a hex colour appears in `apps/web/app/**/*.{css,ts,tsx}` or `apps/api/src/**/*.py` outside the generated files. In CSS every declaration's value is read; in code a colour is a hex right after a quote, colon, bracket, comma or equals sign, so "Order #1042" in a sentence passes;
  3. a font is named outside the tokens: a CSS `font-family` that is not `var(…)` or `inherit`, a custom property that lists a face or a generic family, a TypeScript or Python string that is one of the faces in the tokens, or an inline `font-family:` in code that is not a placeholder.
- **`design/allow.json`**, three entries, each with its reason: `mask-image` and `-webkit-mask-image` (a mask reads only alpha; `#000` there is not a colour anyone sees), and the booking references in `copy.ts` (`ref: "#398"`).
- Tested by planting a hex, a font name, a font-family list and a custom property with a font in a stylesheet, a TypeScript file and a Python file: all seven caught; the mask and "Order #1042" passed. The existing code passes: 173 files clean.
- Not in the check yet: `rgb()` colours (shadows, washes and the WhatsApp drawing keep some in site CSS), font sizes, radii, durations and z-index off the scale. The audit's ratchet (6.1, point 4) is the next step for those.

## Stage 5 · proof

**The public site is unchanged.**
- `scripts/build-site.sh` was run on `main` as this branch started (c319b16, before any change) and on this branch; both outputs were served by a small static server (`/ar` to `ar.html`, as Cloudflare does) and captured with `docs/site-redesign/baseline/shoot.mjs` (headless Edge, `--profile=C:\t\tokprof`, `--full`, `--wait=5000`): `/`, `/agent`, `/chat`, `/ar`, light and dark, 1440 and 390, 16 captures each. A small Node script decodes the PNGs and compares them pixel by pixel.
- **Noise first:** the baseline was captured twice. The two runs differ in one place on every page, the footer's live clock ("Doha 23:31" against "23:38"), and on the light homepage in 7 pixels of the main button's arrow (the pointer lean), by 1/255.
- **Result, final build against the baseline:** on all 16 captures every difference stronger than 1/255 is inside the footer clock (checked by crop; the clock had passed midnight between the runs). The rest are 1/255 on one channel in a few hundred pixels of text and disc edges on four captures (`/ar` at 390 and 1440, the light homepage at 1440): rasterisation, not style. 0 pixels differ outside those.
- **Computed styles, the stronger proof:** every element and its `::before` and `::after` on the same four pages, light and dark, at 1440 (and `/` and `/ar` at 390), with reduced motion so nothing is mid-animation: **0 of 6.4 million property values differ** between the two builds. The first comparison found 1,852 differences, all in the Agent's font fallback lists (the mono stack had gained "Cascadia Mono", the Arabic stack "system-ui"), never in the face that renders; `--font-ui-mono` was added and `--font-ui-arabic` trimmed so both match the old stacks exactly, and the comparison was run again.
- The five social cards (`opengraph-image` and the four product pages') are byte-identical.

**The report card and the emails.**
- All 12 committed sample cards (three businesses, two languages, Carbon and Paper) re-rendered from their JSON with the old and the new `card.py`: **byte-identical**, and identical to the committed PNGs.
- The sign-in email's HTML is byte-identical. The report email differs only in `#fff` becoming `#ffffff` for its panel (the same white).

**The workspace changed on purpose.** Captured before and after from a dev server on port 3106 with an API of its own (Docker, database `alyr_agent`, port 8006), signed in as the fictional Qirfa owner. A few in `shots/`. Sampled pixels:

| Capture | Sidebar (canvas) | Sheet |
|---|---|---|
| `/app` light | #eceee9 → #f6f7f3 (Paper) | #ffffff → #ffffff |
| `/app` dark | #0a0b0d → #0e1012 | #131518 → #15171a |
| `/app`, dark device, "light" stored by the site's switch | #0a0b0d → #f6f7f3 (now follows the choice) | #131518 → #ffffff |
| `/app`, light device, "dark" stored | #eceee9 → #0e1012 | #ffffff → #15171a |
| `/start` light | #eceee9 → #f6f7f3 | |

Text sizes moved by up to half a pixel (most) or two pixels (22, 26, 34 and 40 px headings). `/agent-sample` in light is pixel-identical; in dark only its captions changed, whose text and rule were hard-coded light colours. The numbers on the dashboard differ between the captures because the week rolled over at midnight between them.

## Stage 6 · checks

- `pnpm lint`, `pnpm exec tsc --noEmit`: clean. `bash scripts/build-site.sh` (which runs `pnpm build`): 130 files, one more than before (the tokens stylesheet).
- `node scripts/design-check.mjs`: 173 files clean, 3 allowed exceptions.
- API in Docker, `ruff check .` clean; **383 tests pass**, and **563 pass (2 skipped)** after merging `main` (the Catalog, ALY-102 and ALY-103), whose new code also passes the drift check (189 files) (`alyr_agent_test`, through `ALYR_TEST_OWNER_DSN` and `ALYR_TEST_APP_DSN`). Disclosed: a first run without those two variables began on the shared `alyr_test`, which the suite drops and recreates; it was stopped and rerun on `alyr_agent_test`.
- axe-core 4.14 on the built `/` and `/agent`, 1440 and 390, light and dark: 0 violations of any impact.

## Next step (a follow-up pull request)

1. **The workspace's four button systems** (`globals.css .btn`, `.sh .btn`, `.cx-btn`, `.ob-btn`): one button, and whether product buttons take the 45° notch (the founder's call). Radii (up to 999 px) come with it.
2. **Icons:** five icon components and four stroke weights, the tick in five files, the mark's polygons in seven; one icon set at 1.7 px and the mark from one file.
3. **The drawn product screens on the site** still copy the product's old surfaces (`component.drawing`, the "retire" greys). Moving them to the semantic surfaces changes the site in dark mode, so it needs the founder to see it first.
4. **The ratchet:** `rgb()` colours left in site CSS, font sizes, radii, durations and z-index off the scale, the site's `--fast`, `--medium` and `--slow`; the product's `--ease-product` and `--spring-product` onto the site's curves (a feel check); product breakpoints and the five fluid product headings onto the scale.
5. The stored theme choice is per origin: the site (alyr.qa) and the workspace share it only when served from one address. Locally they do; in production that depends on where the workspace is hosted (ALY-63).
