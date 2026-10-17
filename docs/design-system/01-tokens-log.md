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
