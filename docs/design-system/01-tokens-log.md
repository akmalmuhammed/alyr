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
- **The divergences fixed by token:** the workspace and onboarding canvas is Paper (was #eceee9); customer pages' background is Paper (was #f2f3ef). Dark surfaces are the site's: canvas #0e1012, sheet #15171a, raised #1b1e22 (were #0a0b0d, #131518, #1a1d21; the old globals' #191c1f and #202428 also go). `--ink-3` is #8a918b (was #8a9096). Volt wash is .18 / .12 everywhere (was .18 to .20 / .10 to .12). The shadows are one pair (`--shadow-lift`, `--shadow-float`). Onboarding's `--danger` is `--bad`; its preview chat takes the site's WhatsApp colours (its light header was #f0f2f5); its Volt hover is `--volt-hover`, darker, not lighter. Text on Volt is `--on-volt` everywhere.
- `--ease` and `--spring` no longer mean two curves: the product's are `--ease-product` and `--spring-product` until it moves to the site's (a feel check, not a token change).
- **The type scale:** 255 fixed font sizes in the product stylesheets now read the token scale (`--ui-micro` 11 px to `--ui-display` 56 px); half pixels round up (12.5 to 13, 13.5 to 14), 17 to 18, 22 and 26 to 24, 30 to 28, 34 and 40 to 36. The five fluid `clamp()` headings are unchanged.
- TSX: the logo's Volt plane in the workspace, the console and the customer pages comes from `tokens.ts`; `/agent-sample`'s caption reads `--text-muted`, `--line` and the mono and Arabic tokens.
