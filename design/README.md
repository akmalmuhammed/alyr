# ALYR design tokens

`design/tokens.json` is the one source for every colour, face, type size, space, radius, rule, motion value, breakpoint and focus style ALYR shows: the public site, the product screens, ALYR Agent, the Sunday report card, the social card and the emails. The brand is **Carbon and Volt** (D-040). Nothing else defines a colour or a font.

## How to use it

- **In CSS**, use the semantic names: `var(--canvas)`, `var(--text)`, `var(--text-muted)`, `var(--line)`, `var(--volt)`, `var(--on-volt)`, `var(--band)` and the rest. They switch between light and dark on their own. Never write a hex value, an `rgb()` colour or a font name in a stylesheet: `scripts/design-check.mjs` fails the build.
- **In TypeScript** (an image drawn with `next/og`, an inline SVG, `theme-color`): `import { color, semantic, font } from "../_tokens/tokens"`.
- **In Python** (the report card, emails): `from alyr import brand` and `brand.CARD`, `brand.EMAIL`, `brand.FONT`.
- **To change a value**, edit `tokens.json` and run `node scripts/tokens-build.mjs`. Commit the JSON and the generated files together. Never edit a generated file; each says so at the top.

## The three tiers

| Tier | Group | Who reads it |
|---|---|---|
| Primitives | `color.brand`, `color.ink`, `color.grey`, `color.alpha`, `color.status`, `color.drawing`, `color.whatsapp` | Only other tokens. Each literal colour is named here once. |
| Semantic | `semantic.*` | Every page and screen. **These names are the API**: canvas, surface, surface-subtle, text, text-muted, text-faint, text-inverse, line, line-strong, hair, hair-strong, focus, on-volt, volt-ink, volt-wash, pending, ok, warn, bad (and their `-soft`). |
| Component | `component.*` | One component each: `band` (Carbon blocks and what sits on them), `window`, `theme-switch`, `chat` (the drawn WhatsApp chat), `drawing` (product screens drawn on the site), `agent`, `card` (the report card), `email`, `social`. |

Then the non-colour groups: `font` (family, file, weight, size, leading, tracking), `space`, `layout`, `radius`, `border`, `cut` (the 45° cut), `shadow`, `motion` (duration, pace, ease, travel), `breakpoint`, `z`, `focus`. In `motion.pace`, every token marked `paced` is multiplied by `pace` (CSS `calc(… * var(--pace))`; TypeScript and Python get the product), so one number sets the speed of every timed piece on the site.

The brand primitives `--carbon`, `--volt`, `--volt-hover`, `--volt-pressed`, `--concrete` and `--graphite` are also exposed in CSS, because the site names them directly (Volt as the action, Carbon as the band). The grey ramp is not: use a semantic name, or add one.

## Light and dark

A token that changes in dark mode carries its dark value in `$extensions["qa.alyr"].dark`. The generator writes the CSS the site has always used, so "keep the two dark blocks identical" is now done by a script:

1. `:root` with the light values;
2. `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`: a dark device with no choice made;
3. `:root[data-theme="dark"] { … }`: a dark choice.

The site's head script and the product layout put the stored choice (`localStorage` key `alyr-theme`) on `<html>` as `data-theme` before the first paint, so the public pages and the product screens follow the same switch. A component never has a dark rule of its own: if it needs a colour that changes, add a token.

## Generated files

`node scripts/tokens-build.mjs` writes these; `--check` fails if any is out of date (CI runs it).

| File | For |
|---|---|
| `apps/web/app/_tokens/tokens.css` | The site, the product screens, the Agent. Imported first by `_site/document.tsx` and `(product)/layout.tsx`. |
| `apps/web/app/_tokens/tokens.ts` | TypeScript: `color`, `semantic` (light and dark), `card`, `social`, `font`, and the rest. |
| `apps/api/src/alyr/brand.py` | Python: `COLOR`, `LIGHT`, `DARK`, `CARD`, `EMAIL`, `FONT`, `CSS_FONT`, `FONT_FILE`. Committed, so the API's container needs nothing outside `apps/api`. |

## The drift check

`node scripts/design-check.mjs` (run by CI and `scripts/check.sh`) fails when:

- a generated file is out of date;
- a hex colour appears in site, product or renderer code outside the generated files (`apps/web/app/**/*.{css,ts,tsx}`, `apps/api/src/**/*.py`);
- a stylesheet sets `font-family` to anything but `var(…)` or `inherit`, or a custom property lists a font name; or TypeScript or Python names a font in a string.

Exceptions live in `design/allow.json`, each with its reason. Keep that list short.

## Format

DTCG-style: groups, `$value`, `$type`, `$description`, `{group.token}` aliases and `$extensions`, as in the [Design Tokens Community Group format](https://www.designtokens.org/tr/2025.10/format/) (2025.10, checked 17 Oct 2026). Where it departs, on purpose, so the file stays readable and editable by hand:

- **Colours are CSS strings** (`"#15171a"`, `"rgb(183 243 74 / .18)"`, `"transparent"`), not 2025.10's `{ colorSpace, components }` objects.
- **Dimensions and durations are CSS strings** (`"1.375rem"`, `"120ms"`), because several are `clamp()`, which the format cannot express.
- **Shadows are CSS strings**; `easing` (a `linear()` spring) and `keyword` are our own types.
- **Modes**: the format has none. Dark values sit in `$extensions["qa.alyr"].dark`; the Arabic value of `--dir` in `.rtl`.
- **CSS names**: a group's `$extensions["qa.alyr"].cssPrefix` says it is emitted to CSS and under which prefix (`""` for none). A token's `css` sets its exact name, or `false` to keep it out of CSS. Groups without a prefix (the grey ramp, the card, the email) are not emitted.
- **Fonts**: `nextFont` names the variable `next/font` sets for a face; on the web that face's name is replaced by it.

## Not decided yet

- The workspace's four button systems and the notch on product buttons (a visible change; the founder decides).
- The drawn product screens on the site still use the product's old surfaces (`component.drawing`, the steps marked "retire" in the grey ramp); moving them changes the site.
- Product breakpoints and z-index values are not on the scale yet.
